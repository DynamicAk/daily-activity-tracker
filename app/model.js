import { dates, earlier, later, offset, validDate, weekday } from './dates.js';

export const defaults = { name: 'Abhishek Kumar', zone: 'Asia/Kolkata' };
export const maps = ['goals', 'plans', 'tasks', 'exceptions', 'checks'];
export const empty = () => ({ profile: { ...defaults }, goals: {}, plans: {}, tasks: {}, exceptions: {}, checks: {} });
export const planKey = (goal, date) => goal + '_' + date;
const occurrenceKey = (task, date) => task + '_' + date;
const id = () => crypto.randomUUID();
const active = records => Object.values(records).filter(Boolean);
const displayFields = ({ title, type, goal }) => ({ title, type, goal });
const error = message => { throw new Error(message); };

function matches(task, date) {
  if (task.archived || date < task.date || (task.end && date > task.end)) return false;
  if (task.repeat === 'once') return date === task.date;
  return task.repeat === 'daily' || task.weekdays.includes(weekday(date));
}

function allowed(state, goal, date) {
  if (!goal) return true;
  const record = state.goals[goal];
  return record && date >= record.start && date <= record.end &&
    !state.plans[planKey(goal, date)]?.rest;
}

export function scheduled(state, start, end = start, target = '') {
  const rows = [];
  const row = (task, origin, key, from, isRecurring) => {
    if (task.date < start || task.date > end || (target && task.goal !== target)) return;
    if (!allowed(state, task.goal, task.date)) return;
    rows.push({ ...displayFields(task), date: task.date, origin, key, from, isRecurring,
      done: state.checks[key] === true, created: state.tasks[from].created });
  };
  for (const task of active(state.tasks)) {
    if (task.archived || (target && task.goal !== target)) continue;
    const until = task.repeat === 'once' ? task.date : task.end || end;
    const goal = state.goals[task.goal];
    const first = later(later(task.date, start), goal?.start || start);
    const last = earlier(earlier(until, end), goal?.end || end);
    for (const date of dates(first, last)) {
      if (!matches(task, date)) continue;
      const key = occurrenceKey(task.id, date);
      if (!state.exceptions[key]) row({ ...task, date }, date, key, task.id, task.repeat !== 'once');
    }
  }
  for (const [key, item] of Object.entries(state.exceptions)) {
    if (item && !item.skip && state.tasks[item.from]) row(item, item.origin, key, item.from, true);
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created) || a.key.localeCompare(b.key));
}

export function overdue(state, today) {
  const rows = [];
  for (const task of active(state.tasks)) {
    if (task.archived || task.repeat !== 'once' || task.date >= today) continue;
    const key = occurrenceKey(task.id, task.date);
    if (!state.checks[key] && allowed(state, task.goal, task.date)) {
      rows.push({ ...task, from: task.id, origin: task.date, key, isRecurring: false, done: false });
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date) || a.created.localeCompare(b.created));
}

export const count = rows => ({ planned: rows.length, done: rows.filter(row => row.done).length });
export function goalCount(state, goal) {
  const totals = count(scheduled(state, goal.start, goal.end, goal.id));
  return { ...totals, complete: totals.planned > 0 && totals.done === totals.planned };
}

function verifyTask(state, fields, skipRest = false) {
  if (!fields.title || !validDate(fields.date)) error('Enter a title and a valid date.');
  if (fields.repeat === 'weekdays' && !fields.weekdays.length) error('Choose at least one weekday.');
  if (fields.goal) {
    const goal = state.goals[fields.goal];
    if (!goal || fields.date < goal.start || fields.date > goal.end) error('Choose a date inside the goal.');
    if (!skipRest && !allowed(state, fields.goal, fields.date)) error('Choose a work day for this goal.');
  }
}

export function addTask(state, fields) {
  verifyTask(state, fields, fields.repeat !== 'once');
  const task = { ...fields, id: id(), created: new Date().toISOString() };
  state.tasks[task.id] = task;
  return task.id;
}

export function setDone(state, row, checked) {
  if (!scheduled(state, row.date).some(item => item.key === row.key)) error('This task has changed. Try again.');
  state.checks[row.key] = checked ? true : null;
}

function retireFuture(state, task, date, changedKey) {
  const previous = [];
  for (const [key, item] of Object.entries(state.exceptions)) {
    if (!item || item.from !== task.id || item.origin < date) continue;
    if (!item.skip && item.date < date && key !== changedKey) continue;
    previous.push({ key, item, done: state.checks[key] === true });
    state.exceptions[key] = null;
    state.checks[key] = null;
  }
  for (const [key, done] of Object.entries(state.checks)) {
    if (!done || !key.startsWith(task.id + '_') || key.slice(-10) < date) continue;
    if (state.exceptions[key]) continue;
    previous.push({ key, done });
    state.checks[key] = null;
  }
  if (date <= task.date) {
    if (active(state.exceptions).some(item => item.from === task.id && !item.skip)) task.archived = true;
    else state.tasks[task.id] = null;
  } else if (!task.end || task.end >= date) {
    task.end = offset(date, -1);
  }
  return previous;
}

function retireSeries(state, task, row) {
  const series = task.series || task.id;
  return active(state.tasks).filter(item => (item.series || item.id) === series)
    .flatMap(item => retireFuture(state, item, row.origin, row.key));
}

export function editTask(state, row, fields, scope) {
  const task = state.tasks[row.from];
  if (!task || !scheduled(state, row.date).some(item => item.key === row.key)) error('This task has changed. Try again.');
  if (!row.isRecurring) {
    verifyTask(state, fields, fields.repeat !== 'once');
    const newKey = occurrenceKey(task.id, fields.date);
    if (newKey !== row.key || (fields.repeat !== 'once' && !matches(fields, fields.date))) {
      state.checks[newKey] = matches(fields, fields.date) && state.checks[row.key] === true ? true : null;
      if (newKey !== row.key) state.checks[row.key] = null;
    }
    Object.assign(task, fields);
    return;
  }
  if (scope === 'day') {
    verifyTask(state, { ...fields, repeat: 'once' });
    state.exceptions[row.key] = { ...displayFields(fields), date: fields.date, origin: row.origin, from: task.id };
    return;
  }
  if (fields.date < row.origin) error('For future edits, choose the original date or a later one.');
  verifyTask(state, fields, fields.repeat !== 'once');
  const wasDone = state.checks[row.key] === true;
  const previous = retireSeries(state, task, row);
  const replacement = { ...fields, id: id(), series: task.series || task.id, created: task.created };
  state.tasks[replacement.id] = replacement;
  for (const entry of previous) {
    const date = entry.key.slice(-10);
    if (date === row.origin || !matches(replacement, date)) continue;
    const key = occurrenceKey(replacement.id, date);
    if (entry.item?.skip) state.exceptions[key] = { ...entry.item, from: replacement.id };
    if (entry.item && !entry.item.skip && allowed(state, entry.item.goal, entry.item.date)) {
      state.exceptions[key] = { ...entry.item, from: replacement.id };
    }
    if (entry.done) state.checks[key] = true;
  }
  if (wasDone && matches(replacement, fields.date)) state.checks[occurrenceKey(replacement.id, fields.date)] = true;
}

export function removeTask(state, row, scope) {
  const task = state.tasks[row.from];
  if (!task || !scheduled(state, row.date).some(item => item.key === row.key)) error('This task has changed. Try again.');
  if (row.isRecurring && scope === 'day') {
    state.exceptions[row.key] = { from: task.id, origin: row.origin, skip: true };
    state.checks[row.key] = null;
  } else if (row.isRecurring) {
    retireSeries(state, task, row);
  } else {
    retireFuture(state, task, row.origin, row.key);
  }
}

export function addGoal(state, { title, start, end }) {
  if (!title || !validDate(start) || !validDate(end) || end < start) error('Enter a title and a valid date range.');
  const goal = { id: id(), title, start, end };
  state.goals[goal.id] = goal;
  return goal;
}

export function savePlan(state, goal, date, { target, rest }) {
  if (rest && scheduled(state, date, date, goal.id).length) {
    error('Move or remove the tasks on this date before marking it as a rest day.');
  }
  state.plans[planKey(goal.id, date)] = { target, rest };
}

export function copyPlan(state, goal, from, to) {
  if (!validDate(to) || to < goal.start || to > goal.end || from === to) error('Choose a different date inside the goal.');
  const source = state.plans[planKey(goal.id, from)] || { target: '', rest: false };
  if (source.rest && scheduled(state, to, to, goal.id).length) error('The destination already has tasks.');
  if (!source.rest && state.plans[planKey(goal.id, to)]?.rest) error('Change the destination to a work day first.');
  const rows = scheduled(state, from, from, goal.id);
  savePlan(state, goal, to, source);
  for (const row of rows) addTask(state, { ...displayFields(row), date: to, repeat: 'once', weekdays: [] });
}

export function sqlTemplate(state, start) {
  if (!validDate(start) || start > '9999-12-25') error('Choose a valid start date.');
  const goal = addGoal(state, { title: '7 Days of SQL Practice', start, end: offset(start, 6) });
  const plan = [
    ['SELECT basics', 'Write five SELECT queries', 'Practice WHERE filters'],
    ['Grouping and aggregates', 'Use GROUP BY', 'Compare COUNT and SUM', 'Filter groups with HAVING'],
    [],
    ['Joins', 'Use INNER JOIN', 'Find unmatched rows with LEFT JOIN'],
    ['Subqueries', 'Write a scalar subquery', 'Use EXISTS'],
    ['Window functions', 'Rank results with ROW_NUMBER', 'Calculate a running total'],
    ['Review', 'Solve three mixed questions']
  ];
  plan.forEach(([target = '', ...titles], day) => {
    const date = offset(start, day);
    savePlan(state, goal, date, { target, rest: !target });
    for (const title of titles) addTask(state, { title, type: 'must', goal: goal.id, date, repeat: 'once', weekdays: [] });
  });
  return goal;
}
