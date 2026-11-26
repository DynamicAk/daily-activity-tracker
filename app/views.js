import { analytics } from './analytics.js';
import { dateLabel, dates, earlier, offset, validDate, weekday } from './dates.js';
import { count, goalCount, overdue, planKey, scheduled } from './model.js';

export const esc = text => String(text ?? '').replace(/[&<>"']/g,
  value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[value]);
const paths = {
  today: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18m-13 5 2 2 4-4"/>',
  goals: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  analytics: '<path d="M4 3v17h17M9 15v-3m5 3V6m5 9V9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="m15 5 4 4M4 20l4-.7L20 7a1.4 1.4 0 0 0 0-2l-1-1a1.4 1.4 0 0 0-2 0L5 16z"/>',
  prev: '<path d="m14 7-5 5 5 5"/>',
  next: '<path d="m10 7 5 5-5 5"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>'
};
export const icon = key => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
  stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[key]}</svg>`;
export const action = (label, name, extra = '', classes = '') =>
  `<button type="button" class="${classes}" data-action="${name}" ${extra}>${label}</button>`;
export const progress = ({ done, planned }, label) =>
  `<progress value="${done}" max="${planned || 1}" aria-label="${esc(label)}"></progress>`;
const fraction = ({ done, planned }) => `${done} of ${planned} done`;
const pill = totals => `<span class="pill">${fraction(totals)}</span>`;
const dateAttrs = 'min="1000-01-01" max="9999-12-31"';
const sections = [['today', 'Today'], ['goals', 'Goals'], ['analytics', 'Profile &amp; Analytics']];

export function nav(page) {
  return sections.map(([name, label]) =>
    `<a href="#${name}" ${name === page ? 'aria-current="page"' : ''}>${icon(name)}${label}</a>`).join('');
}

const heading = (name, sub, controls = '') => `<div class="heading"><div><h1>${name}</h1>
  ${sub ? `<p class="subline">${sub}</p>` : ''}</div>${controls}</div>`;

function taskRow(state, row, showGoal = true) {
  const goal = state.goals[row.goal];
  const inputId = 'check-' + row.key;
  return `<li class="task">
    <div class="row-body">
      <label for="${inputId}"><input type="checkbox" id="${inputId}" data-check="${row.key}"
        data-date="${row.date}" aria-labelledby="title-${row.key}" ${row.done ? 'checked' : ''}></label>
      <div><label class="task-title" id="title-${row.key}" for="${inputId}">${esc(row.title)}</label>
        <div class="task-meta">${showGoal && goal ? `<a href="#goals/${goal.id}/${row.date}">${esc(goal.title)}</a>` : ''}
          ${row.isRecurring ? '<span>Repeats</span>' : ''}</div>
      </div>
    </div>
    ${action(icon('edit'), 'edit-task', `data-key="${row.key}" data-date="${row.date}" aria-label="Edit ${esc(row.title)}"`, 'edit-task')}
  </li>`;
}

function checklist(state, title, rows, blank) {
  const totals = count(rows);
  if (!rows.length) return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${pill(totals)}</div>
    ${progress(totals, title)}<p class="empty">${blank}</p></section>`;
  return `<section class="panel"><div class="panel-head"><h2>${title}</h2>${pill(totals)}</div>
    ${progress(totals, title)}<ul class="tasks">${rows.map(row => taskRow(state, row)).join('')}</ul></section>`;
}

export function todayView(state, date, today) {
  const tasks = scheduled(state, date);
  const late = date === today ? overdue(state, today) : [];
  const totals = count(tasks);
  const description = esc(dateLabel(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
  return heading(date === today ? 'Today' : esc(dateLabel(date, { weekday: 'long' })), description,
    action(icon('plus') + ' Add task', 'new-task', `data-date="${date}"`, 'primary')) +
    `<div class="stack">
      <section class="panel hero" aria-label="Daily progress">
        <div><span class="eyebrow">Daily progress</span><strong>${fraction(totals)}</strong></div>
        <div class="date-controls" aria-label="Checklist date">
          ${action(icon('prev'), 'prev-day', `aria-label="Previous day" ${date <= '1000-01-01' ? 'disabled' : ''}`, 'quiet')}
          <input type="date" id="checklist-date" aria-label="Checklist date" value="${date}" ${dateAttrs}>
          ${action(icon('next'), 'next-day', `aria-label="Next day" ${date >= '9999-12-31' ? 'disabled' : ''}`, 'quiet')}
          ${action('Back to today', 'today', '', 'quiet')}
        </div>
        ${progress(totals, 'Daily progress')}
      </section>
      ${checklist(state, 'Must-do', tasks.filter(row => row.type === 'must'), 'No must-dos scheduled for this day.')}
      ${checklist(state, 'Other to-dos', tasks.filter(row => row.type === 'other'), 'No other to-dos scheduled for this day.')}
      ${late.length ? `<section class="panel"><div class="panel-head"><h2>Overdue</h2><span class="pill">${late.length}</span></div>
        <ul class="tasks">${late.map(row => {
          const goal = state.goals[row.goal];
          const goalNote = goal ? `<a href="#goals/${goal.id}/${row.date}">${esc(goal.title)}</a>` : '';
          return `<li class="task"><div class="row-body"><div><h3>${esc(row.title)}</h3>
            <div class="task-meta"><span>${esc(dateLabel(row.date, { day: 'numeric', month: 'short', year: 'numeric' }))}</span>${goalNote}</div></div></div>
            ${action('Move to today', 'move-today', `data-key="${row.key}" data-date="${row.date}"`)}</li>`;
        }).join('')}</ul></section>` : ''}
    </div>`;
}

export function goalsView(state) {
  const goals = Object.values(state.goals).filter(Boolean).sort((a, b) => a.start.localeCompare(b.start));
  const controls = `<div class="actions">${action('Use SQL template', 'template', '', 'quiet')}
    ${action(icon('plus') + ' New goal', 'new-goal', '', 'primary')}</div>`;
  return heading('Goals', 'Plan your work one day at a time.', controls) + (goals.length ?
    `<div class="goal-grid">${goals.map(goal => {
      const totals = goalCount(state, goal);
      return `<article class="panel goal-card"><div class="panel-head"><h2>${esc(goal.title)}</h2>
        <span class="pill">${totals.complete ? 'Complete' : fraction(totals)}</span></div>
        <p class="muted">${esc(dateLabel(goal.start, shortDate))} – ${esc(dateLabel(goal.end, fullDate))}</p>
        ${progress(totals, goal.title)}<a class="btn quiet" href="#goals/${goal.id}" aria-label="Open plan for ${esc(goal.title)}">Open plan</a></article>`;
    }).join('')}</div>` :
    '<section class="panel"><h2>No goals yet</h2><p class="empty">Create a goal to set daily targets and add tasks.</p></section>');
}

const shortDate = { day: 'numeric', month: 'short' };
const fullDate = { ...shortDate, year: 'numeric' };

export function goalView(state, goal, selected, today) {
  const first = validDate(selected) && selected >= goal.start && selected <= goal.end ? selected :
    today >= goal.start && today <= goal.end ? today : goal.start;
  const last = earlier(offset(first, Math.min(6, Math.round((Date.parse(goal.end) - Date.parse(first)) / 86_400_000))), goal.end);
  const rows = scheduled(state, first, last, goal.id);
  const totals = goalCount(state, goal);
  return `<div class="stack"><div><a href="#goals">All goals</a></div>
    ${heading(esc(goal.title), esc(dateLabel(goal.start, fullDate)) + ' – ' + esc(dateLabel(goal.end, fullDate)))}
    <section class="panel"><div class="panel-head"><h2>Goal progress</h2>${pill(totals)}</div>
      ${progress(totals, 'Goal progress')}${totals.complete ? '<p class="subline">Goal complete</p>' : ''}
    </section>
    <div class="date-controls">
      ${action('Previous days', 'goal-prev', `data-goal="${goal.id}" data-date="${first}" ${first === goal.start ? 'disabled' : ''}`)}
      <input type="date" id="goal-date" data-goal="${goal.id}" aria-label="Jump to goal date" value="${first}" min="${goal.start}" max="${goal.end}">
      ${action('Next days', 'goal-next', `data-goal="${goal.id}" data-date="${last}" ${last === goal.end ? 'disabled' : ''}`)}
    </div>
    ${Array.from(dates(first, last), date => {
      const plan = state.plans[planKey(goal.id, date)];
      const tasks = rows.filter(row => row.date === date);
      const attrs = `data-goal="${goal.id}" data-date="${date}"`;
      return `<section class="panel goal-day"><div class="panel-head"><h2>${esc(dateLabel(date))}</h2>${plan?.rest ? '<span class="pill">Rest day</span>' : pill(count(tasks))}</div>
        ${plan?.target ? `<p>${esc(plan.target)}</p>` : ''}
        ${tasks.length ? `<ul class="tasks">${tasks.map(row => taskRow(state, row, false)).join('')}</ul>` : plan?.rest ? '' : '<p class="muted">No tasks planned.</p>'}
        <div class="actions day-tools">
          ${plan?.rest ? '' : action(icon('plus') + ' Add task', 'new-task', attrs)}
          ${action('Edit day plan', 'edit-day', attrs, 'quiet')}
          ${action('Copy day', 'copy-day', attrs, 'quiet')}
        </div>
      </section>`;
    }).join('')}</div>`;
}

function heatmap(months) {
  return `<div class="heatmap">${months.map(({days: month}) => {
    const spaces = '<span></span>'.repeat((weekday(month[0].date) + 6) % 7);
    return `<div><span class="month-label">${esc(dateLabel(month[0].date, { month: 'long' }))}</span>
      <div aria-hidden="true" class="weeknames"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
      <div class="days">${spaces}${month.map(({ date, all, future }, index) => {
        const label = esc(dateLabel(date, fullDate)) + ', ' + fraction(all) + (future ? ', future date' : '');
        return action(date.slice(-2).replace(/^0/, ''), 'heat-date',
          `data-date="${date}" data-level="${Math.min(all.done, 4)}" ${future ? 'data-future' : ''} title="${label}" aria-label="${label}"
          tabindex="${index === 0 ? 0 : -1}"`, 'heat-day');
      }).join('')}</div></div>`;
  }).join('')}</div>`;
}

function chart(months, selected) {
  const max = Math.max(1, ...months.map(month => month.planned));
  return `<div class="chart-key"><span>Planned</span><span>Completed</span></div>
    <div class="chart">${months.map(({ days: month, planned, done }, index) => {
      const label = esc(dateLabel(month[0].date, { month: 'long' }));
      const bars = `<span class="bars" aria-hidden="true"><span style="height:${100 * planned / max}%"></span>
        <span style="height:${100 * done / max}%"></span></span>`;
      return action(bars + esc(dateLabel(month[0].date, { month: 'short' })), 'month',
        `data-month="${index}" aria-pressed="${index === selected}" aria-label="${label}, ${planned} planned, ${done} completed"`);
    }).join('')}</div>`;
}

function monthDetails(month) {
  const dates = month.days.filter(day => !day.future || day.all.planned);
  if (!dates.length) return '<p class="empty">No dates with results or plans this month.</p>';
  return `<div class="table-wrap"><table class="results"><thead><tr><th scope="col">Date</th>
    <th scope="col">Must-dos planned</th><th scope="col">Must-dos done</th><th scope="col">All tasks done</th></tr></thead>
    <tbody>${dates.map(({ date, must, all }) => `<tr><th scope="row"><a href="#today/${date}">${esc(dateLabel(date, shortDate))}</a></th>
      <td>${must.planned}</td><td>${must.done}</td><td>${all.done}</td></tr>`).join('')}</tbody></table></div>`;
}

export function analyticsView(state, year, month, today) {
  const data = analytics(state, year, today);
  const monthIndex = month ?? (year === today.slice(0, 4) ? Number(today.slice(5, 7)) - 1 : 0);
  const period = data.months[monthIndex];
  const rate = data.must.planned ? `${Math.round(data.must.done * 100 / data.must.planned)}%` : 'No must-dos scheduled';
  const metrics = [
    ['Tasks completed', data.totals.done], ['Must-do completion rate', rate],
    [year === today.slice(0, 4) ? 'Current streak' : 'Year-end streak', data.current + ' days'],
    ['Best streak', data.best + ' days'], ['Goals completed', data.completedGoals]
  ];
  return heading('Profile &amp; Analytics', '',
    `<label class="field"><span>Analytics year</span><input type="number" id="year" min="1000" max="${today.slice(0, 4)}" value="${year}" inputmode="numeric"></label>`) +
    `<div class="stack">
      <section class="metrics" aria-label="Yearly statistics">${metrics.map(([label, value]) =>
        `<article class="panel metric"><span>${label}</span><strong>${value}</strong></article>`).join('')}</section>
      <section class="panel"><div class="panel-head"><h2>Activity heatmap</h2><span class="muted">Select a date to open its checklist</span></div>${heatmap(data.months)}</section>
      <section class="panel"><div class="panel-head"><h2>Monthly must-dos</h2></div>${chart(data.months, monthIndex)}</section>
      <section class="panel" aria-label="Daily results"><div class="panel-head"><h2>${esc(dateLabel(period.days[0].date, { month: 'long' }))} daily results</h2></div>${monthDetails(period)}</section>
      <section class="panel"><div class="panel-head"><h2>Progress by goal</h2></div>
        ${data.goals.length ? `<div class="goal-breakdown">${data.goals.map(({ goal, year: total, all }) =>
          `<div><div class="panel-head"><a href="#goals/${goal.id}">${esc(goal.title)}</a>
            <span class="pill">${fraction(total)} this year</span></div>
            ${progress(total, goal.title + ' this year')}<p class="subline">${fraction(all)} overall${all.complete ? ' · Complete' : ''}</p></div>`).join('')}</div>`
          : '<p class="empty">No goals for this year.</p>'}
      </section>
      <section class="panel"><div class="panel-head"><h2>Profile</h2>${action('Edit profile', 'profile')}</div>
        <p>${esc(state.profile.name)}</p><p class="muted">${esc(state.profile.zone)}</p>
        <p class="subline">Tasks are saved in this browser. If cloud sync is enabled, anonymous access is also tied to this browser. Clearing browser data can remove your tasks or your access to a synced copy.</p>
      </section>
    </div>`;
}
