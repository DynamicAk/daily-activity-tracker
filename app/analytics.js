import { dates, earlier } from './dates.js';
import { count, goalCount, scheduled } from './model.js';

function group(rows) {
  const days = new Map();
  for (const row of rows) {
    if (!days.has(row.date)) days.set(row.date, []);
    days.get(row.date).push(row);
  }
  return days;
}

export function analytics(state, year, today) {
  const start = year + '-01-01';
  const end = year + '-12-31';
  const rows = scheduled(state, start, end);
  const visibleRows = rows.filter(row => row.date <= today);
  const history = group(rows);
  const days = Array.from(dates(start, end), date => {
    const day = history.get(date) || [];
    return { date, all: count(day), must: count(day.filter(row => row.type === 'must')), future: date > today };
  });

  const months = Array.from({ length: 12 }, (_, i) => {
    const monthDays = days.filter(day => Number(day.date.slice(5, 7)) === i + 1);
    return {
      days: monthDays,
      planned: monthDays.reduce((sum, day) => sum + day.must.planned, 0),
      done: monthDays.reduce((sum, day) => sum + day.must.done, 0)
    };
  });
  const goals = Object.values(state.goals).filter(goal => goal && goal.start <= end && goal.end >= start)
    .map(goal => {
      const plan = rows.filter(row => row.goal === goal.id);
      return { goal, year: count(plan), all: goalCount(state, goal) };
    });
  // A completed goal belongs to the year of its last scheduled task.
  const completedGoals = goals.filter(({ goal, all }) => {
    if (!all.complete) return false;
    const final = scheduled(state, goal.start, goal.end, goal.id).at(-1);
    return final.date >= start && final.date <= end;
  }).length;
  return { days, months, goals, completedGoals, totals: count(rows),
    must: count(visibleRows.filter(row => row.type === 'must')),
    ...streaks(state, today, year) };
}

export function streaks(state, today, year) {
  const through = earlier(today, year + '-12-31');
  const start = [...Object.values(state.tasks), ...Object.values(state.exceptions)]
    .filter(Boolean).map(task => task.date).filter(Boolean).sort()[0];
  const mustDays = start && start <= through ?
    group(scheduled(state, start, through).filter(row => row.type === 'must')) : new Map();
  let current = 0;
  let best = 0;
  for (const [date, day] of mustDays) {
    if (day.every(row => row.done)) {
      current += 1;
      if (date.startsWith(year + '-')) best = Math.max(best, current);
    } else if (date < today) {
      current = 0;
    }
  }
  return { current, best };
}
