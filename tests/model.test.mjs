import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analytics, streaks } from '../app/analytics.js';
import { localDate, validDate } from '../app/dates.js';
import { addGoal, addTask, copyPlan, editTask, empty, goalCount, overdue, planKey, removeTask, savePlan, scheduled, setDone, sqlTemplate } from '../app/model.js';
import { mergeData, wrapSnapshot } from '../app/storage.js';

const item = (title, date, options = {}) => ({ title, date, type: 'must', goal: '', repeat: 'once', weekdays: [], ...options });

test('a three-day goal shares completion, undo, day records, and analytics', () => {
  const state = empty();
  const goal = addGoal(state, { title: 'SQL', start: '2026-11-24', end: '2026-11-26' });
  const { id } = goal;
  savePlan(state, goal, '2026-11-24', { target: 'SELECT', rest: false });
  savePlan(state, goal, '2026-11-25', { target: 'JOIN', rest: false });
  savePlan(state, goal, '2026-11-26', { target: '', rest: true });
  addTask(state, item('SELECT', '2026-11-24', { goal: id }));
  addTask(state, item('INNER JOIN', '2026-11-25', { goal: id }));
  addTask(state, item('LEFT JOIN', '2026-11-25', { goal: id, type: 'other' }));
  assert.throws(() => addTask(state, item('Rest test', '2026-11-26', { goal: id })), /work day/);
  const [row] = scheduled(state, '2026-11-24');
  const [same] = scheduled(state, '2026-11-24', '2026-11-24', id);
  assert.equal(row.key, same.key);
  setDone(state, row, true);
  const progress = analytics(state, '2026', '2026-11-26');
  assert.deepEqual(goalCount(state, goal), { planned: 3, done: 1, complete: false });
  assert.deepEqual(progress.totals, { planned: 3, done: 1 });
  assert.deepEqual(progress.must, { planned: 2, done: 1 });
  assert.equal(progress.months[10].done, 1);
  assert.equal(progress.goals[0].year.done, 1);
  for (const next of scheduled(state, '2026-11-25')) setDone(state, next, true);
  assert.equal(analytics(state, '2026', '2026-11-26').completedGoals, 1);
  setDone(state, same, false);
  const restored = JSON.parse(JSON.stringify(state));
  assert.equal(scheduled(restored, '2026-11-24')[0].done, false);
  assert.equal(analytics(restored, '2026', '2026-11-26').completedGoals, 0);
});

test('a copied plan creates independent unchecked tasks', () => {
  const state = empty();
  const goal = sqlTemplate(state, '2026-11-23');
  assert.equal(scheduled(state, '2026-11-23').length, 2);
  assert.equal(scheduled(state, '2026-11-24').length, 3);
  assert.equal(state.plans[planKey(goal.id, '2026-11-25')].rest, true);
  const original = scheduled(state, '2026-11-23')[0];
  setDone(state, original, true);
  copyPlan(state, goal, '2026-11-23', '2026-11-29');
  const copy = scheduled(state, '2026-11-29').find(row => row.title === original.title);
  assert.notEqual(copy.key, original.key);
  assert.equal(copy.done, false);
  editTask(state, copy, item('Renamed copy', copy.date, { goal: goal.id }));
  assert.equal(scheduled(state, '2026-11-23')[0].title, original.title);
  assert.equal(scheduled(state, '2026-11-23')[0].done, true);
});

test('recurring edits, moves, removals, and weekday scheduling preserve earlier records', () => {
  const state = empty();
  addTask(state, item('Daily', '2026-11-23', { repeat: 'daily' }));
  const prior = scheduled(state, '2026-11-23')[0];
  setDone(state, prior, true);
  const single = scheduled(state, '2026-11-24')[0];
  editTask(state, single, item('One-day edit', '2026-11-25'), 'day');
  assert.equal(scheduled(state, '2026-11-24').length, 0);
  assert.equal(scheduled(state, '2026-11-25').length, 2);
  const moving = scheduled(state, '2026-11-25').find(row => row.key === single.key);
  setDone(state, moving, true);
  const normal = scheduled(state, '2026-11-25').find(row => row.key !== single.key);
  editTask(state, normal, item('Weekdays', '2026-11-25', { repeat: 'weekdays', weekdays: [3, 5] }), 'future');
  assert.equal(scheduled(state, '2026-11-23')[0].done, true);
  assert.equal(scheduled(state, '2026-11-25').find(row => row.key === single.key).done, true);
  assert.equal(scheduled(state, '2026-11-26').length, 0);
  const friday = scheduled(state, '2026-11-27')[0];
  removeTask(state, friday, 'day');
  assert.equal(scheduled(state, '2026-11-27').length, 0);
  const following = scheduled(state, '2026-12-02')[0];
  removeTask(state, following, 'future');
  assert.equal(scheduled(state, '2026-12-02', '2026-12-31').length, 0);
  assert.equal(scheduled(state, '2026-11-25').length, 2);
});

test('moving an overdue task keeps its identity and counts only its new date', () => {
  const state = empty();
  const id = addTask(state, item('Late', '2025-12-31'));
  const [row] = overdue(state, '2026-01-01');
  assert.equal(row.from, id);
  editTask(state, row, item(row.title, '2026-01-01'));
  assert.equal(overdue(state, '2026-01-01').length, 0);
  assert.equal(analytics(state, '2025', '2026-01-01').must.planned, 0);
  assert.equal(analytics(state, '2026', '2026-01-01').must.planned, 1);
});

test('editing an earlier series occurrence also updates later edited segments', () => {
  const state = empty();
  addTask(state, item('Original', '2026-11-23', { repeat: 'daily' }));
  setDone(state, scheduled(state, '2026-11-23')[0], true);
  const later = scheduled(state, '2026-11-26')[0];
  editTask(state, later, item('Later segment', later.date, { repeat: 'daily' }), 'future');
  setDone(state, scheduled(state, '2026-11-27')[0], true);
  const early = scheduled(state, '2026-11-24')[0];
  editTask(state, early, item('Whole remaining series', '2026-11-24', { repeat: 'daily' }), 'future');
  assert.equal(scheduled(state, '2026-11-23')[0].title, 'Original');
  assert.equal(scheduled(state, '2026-11-23')[0].done, true);
  assert.equal(scheduled(state, '2026-11-26').length, 1);
  assert.equal(scheduled(state, '2026-11-26')[0].title, 'Whole remaining series');
  assert.equal(scheduled(state, '2026-11-27')[0].done, true);
});

test('empty analytics, leap dates, and Kolkata year boundary streaks', () => {
  const before = localDate('Asia/Kolkata', new Date('2025-12-31T18:29:59.999Z'));
  const after = localDate('Asia/Kolkata', new Date('2025-12-31T18:30:00.000Z'));
  assert.equal(before, '2025-12-31');
  assert.equal(after, '2026-01-01');
  assert.equal(validDate('2026-02-29'), false);
  assert.equal(analytics(empty(), '2024', after).days.length, 366);
  const state = empty();
  assert.deepEqual(analytics(state, '2026', after).must, { done: 0, planned: 0 });
  addTask(state, item('Dec', before));
  addTask(state, item('Jan', after));
  addTask(state, item('Jan 3', '2026-01-03'));
  setDone(state, scheduled(state, before)[0], true);
  assert.deepEqual(streaks(state, after, '2026'), { current: 1, best: 0 });
  assert.deepEqual(analytics(state, '2026', after).must, { planned: 1, done: 0 });
  setDone(state, scheduled(state, after)[0], true);
  assert.deepEqual(streaks(state, '2026-01-02', '2026'), { current: 2, best: 2 });
  assert.equal(streaks(state, '2026-01-03', '2026').current, 2);
  assert.equal(streaks(state, '2026-01-04', '2026').current, 0);
  assert.deepEqual(streaks(state, '2026-01-04', '2025'), { current: 1, best: 1 });
});

test('migration preserves local and remote IDs, completion tombstones, and retry order', () => {
  const local = empty();
  const remote = empty();
  addTask(local, item('Local task', '2026-11-26'));
  addTask(remote, item('Remote task', '2026-11-26'));
  const [row] = scheduled(local, '2026-11-26');
  setDone(local, row, true);
  const original = wrapSnapshot(remote, 'old-device', 1, null);
  const first = wrapSnapshot(local, 'device', 3, original);
  assert.equal(scheduled(JSON.parse(first.snapshot), row.date).length, 2);
  assert.equal(wrapSnapshot(local, 'device', 3, first), undefined);
  setDone(local, row, false);
  const next = wrapSnapshot(local, 'device', 4, first);
  const combined = mergeData(JSON.parse(first.snapshot), JSON.parse(next.snapshot));
  assert.equal(scheduled(combined, row.date).find(item => item.key === row.key).done, false);
  assert.equal(wrapSnapshot(local, 'device', 3, next), undefined);
});
