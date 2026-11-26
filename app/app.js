import { earlier, later, localDate, offset, validDate } from './dates.js';
import { addGoal, addTask, copyPlan, editTask, planKey, removeTask, savePlan, scheduled, setDone, sqlTemplate } from './model.js';
import { createStore } from './storage.js';
import { action, analyticsView, esc, goalView, goalsView, nav, todayView } from './views.js';
import { copyForm, dayForm, dialogMarkup, goalForm, profileForm, taskFields, taskForm, templateForm } from './forms.js';

const main = document.getElementById('main');
const menu = document.getElementById('nav');
const dialog = document.getElementById('dialog');
const notice = document.getElementById('notice');
const status = document.getElementById('status');
let day;
let page;
let month;
let data;
let returnFocus;
let noticeTimer;

const currentDate = () => localDate(data.profile.zone);
const route = () => location.hash.slice(1).split('/');
const nextHash = (...parts) => '#' + parts.filter(Boolean).join('/');
function go(...parts) {
  const target = nextHash(...parts);
  if (location.hash === target) render();
  else location.hash = target;
}

function flash(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  noticeTimer = setTimeout(() => { notice.textContent = ''; }, 4000);
}

function focusedKey(active) {
  if (!active || !main.contains(active)) return null;
  return ['id', 'data-action', 'data-key', 'data-date', 'data-month']
    .filter(name => active.hasAttribute(name))
    .map(name => '[' + name + '="' + CSS.escape(active.getAttribute(name)) + '"]').join('');
}

function render({ moveFocus = false } = {}) {
  const focus = focusedKey(document.activeElement);
  const today = currentDate();
  const [section, detail, dayPart] = route();
  page = ['goals', 'analytics'].includes(section) ? section : 'today';
  if (menu.dataset.page !== page) {
    menu.innerHTML = nav(page);
    menu.dataset.page = page;
  }
  document.getElementById('sidebar-name').textContent = data.profile.name;
  if (page === 'goals') {
    const goal = /^[\da-f-]{36}$/.test(detail) && data.goals[detail];
    main.innerHTML = goal ? goalView(data, goal, dayPart, today) : goalsView(data);
  } else if (page === 'analytics') {
    const year = /^\d{4}$/.test(detail) && detail >= '1000' && detail <= today.slice(0, 4) ? detail : today.slice(0, 4);
    main.innerHTML = analyticsView(data, year, month, today);
  } else {
    day = validDate(detail) ? detail : today;
    main.innerHTML = todayView(data, day, today);
  }
  if (moveFocus) main.focus();
  else if (focus) main.querySelector(focus)?.focus({ preventScroll: true });
}

const store = await createStore(updated => {
  data = updated;
  render();
}, message => { status.textContent = message; }).catch(error => {
  status.textContent = 'Storage unavailable';
  main.innerHTML = '<h1>Storage unavailable</h1><p class="subline">Allow browser storage for this site and reload to open your tracker.</p>';
  console.error(error);
  return null;
});
if (store) {
  data = store.data;
  render();
  bindEvents();
}

async function mutate(change, message) {
  status.textContent = 'Saving…';
  try {
    data = await store.change(change);
    render();
    if (message) flash(message);
  } catch (error) {
    status.textContent = 'Change not saved';
    throw error;
  }
}

function openForm(title, fields, submit, save, extra = '') {
  if (!dialog.open) returnFocus = focusedKey(document.activeElement);
  dialog.innerHTML = dialogMarkup(title, fields, submit, extra);
  const form = dialog.querySelector('form');
  form.addEventListener('change', event => {
    if (event.target.name === 'scope') form.querySelector('#repeat-box').hidden = event.target.value === 'day';
    if (event.target.name === 'repeat') form.querySelector('#weekdays').hidden = event.target.value !== 'weekdays';
  });
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const error = form.querySelector('.form-error');
    error.hidden = true;
    const button = form.querySelector('[type=submit]');
    button.disabled = true;
    try {
      await save(new FormData(form));
      dialog.close();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
    } finally {
      button.disabled = false;
    }
  });
  if (!dialog.open) dialog.showModal();
  form.querySelector('input, select')?.focus();
}

function findRow(key, date) {
  if (!validDate(date)) return;
  return scheduled(data, date).find(row => row.key === key);
}

function taskEditor(date, goal, row) {
  const remove = row ? action('Remove…', 'remove-task',
    `data-key="${row.key}" data-date="${date}"`, 'quiet danger') : '';
  openForm(row ? 'Edit task' : 'Add task', taskForm(data, date, goal, row), row ? 'Save task' : 'Add task', form => {
    const fields = taskFields(form);
    return mutate(draft => row ? editTask(draft, row, fields, form.get('scope')) : addTask(draft, fields),
      row ? 'Task updated.' : 'Task added.');
  }, remove);
}

function removeEditor(row) {
  const scope = row.isRecurring ? `<label class="field"><span>Remove from</span><select name="scope">
    <option value="day">This day</option><option value="future">This and future days</option></select></label>` : '';
  openForm('Remove task', `<p>Remove “${esc(row.title)}”?</p>${scope}`, 'Remove task',
    form => mutate(draft => removeTask(draft, row, form.get('scope')), 'Task removed.'));
}

function goalEditor(template) {
  openForm(template ? '7 Days of SQL Practice' : 'New goal',
    template ? templateForm(currentDate()) : goalForm(currentDate()), 'Create goal', async form => {
      let goal;
      await mutate(draft => {
        goal = template ? sqlTemplate(draft, form.get('start')) :
          addGoal(draft, { title: String(form.get('title')).trim(), start: form.get('start'), end: form.get('end') });
      }, 'Goal created.');
      go('goals', goal.id);
    });
}

async function moveToday(row) {
  const date = currentDate();
  const goal = data.goals[row.goal];
  const rest = goal && data.plans[planKey(goal.id, date)]?.rest;
  const detach = goal && (date < goal.start || date > goal.end || rest);
  const move = () => mutate(draft => editTask(draft, row,
    { title: row.title, type: row.type, date, goal: detach ? '' : row.goal, repeat: 'once', weekdays: [] }), 'Moved to today.');
  if (detach) {
    openForm('Move task to today', '<p>Today falls outside this goal’s work days. Moving the task will remove its goal link.</p>',
      'Move to today', move);
  } else {
    await move();
  }
}

function dateMove(direction, goal, date) {
  const distance = direction === 'prev' ? Math.min(7, Math.round((Date.parse(date) - Date.parse(goal.start)) / 86_400_000)) : 1;
  go('goals', goal.id, direction === 'prev' ? later(goal.start, offset(date, -distance)) : earlier(goal.end, offset(date, distance)));
}

async function click(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action: name, date, goal: goalId, key } = button.dataset;
  const goal = data.goals[goalId];
  const row = key && findRow(key, date);
  switch (name) {
    case 'prev-day': go('today', offset(day, -1)); break;
    case 'next-day': go('today', offset(day, 1)); break;
    case 'today': go('today'); break;
    case 'heat-date': go('today', date); break;
    case 'new-task': taskEditor(date, goalId || ''); break;
    case 'edit-task': if (row) taskEditor(date, '', row); break;
    case 'remove-task': if (row) removeEditor(row); break;
    case 'move-today': if (row) await moveToday(row); break;
    case 'new-goal': goalEditor(false); break;
    case 'template': goalEditor(true); break;
    case 'goal-prev': dateMove('prev', goal, date); break;
    case 'goal-next': dateMove('next', goal, date); break;
    case 'edit-day':
      openForm('Edit day plan', dayForm(data.plans[planKey(goal.id, date)]), 'Save day plan',
        form => mutate(draft => savePlan(draft, goal, date,
          { target: String(form.get('target')).trim(), rest: form.has('rest') }), 'Day plan saved.'));
      break;
    case 'copy-day':
      openForm('Copy day plan', copyForm(date, goal), 'Copy day plan',
        form => mutate(draft => copyPlan(draft, goal, date, form.get('date')), 'Day plan copied.'));
      break;
    case 'month': month = Number(button.dataset.month); render(); break;
    case 'profile':
      openForm('Edit profile', profileForm(data.profile), 'Save profile', form => {
        const name = String(form.get('name')).trim();
        const zone = String(form.get('zone')).trim();
        if (!name) throw new Error('Enter a display name.');
        try { localDate(zone); } catch { throw new Error('Enter a valid IANA time zone.'); }
        return mutate(draft => {
          draft.profile = { name, zone };
          draft.profileEdited = true;
        }, 'Profile saved.');
      });
      break;
    case 'cancel': dialog.close(); break;
  }
}

function heatKeys(event) {
  const button = event.target.closest('.heat-day');
  if (!button) return;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
  if (step === undefined) return;
  event.preventDefault();
  const date = offset(button.dataset.date, step);
  const target = validDate(date) && main.querySelector('.heat-day[data-date="' + date + '"]');
  if (!target) return;
  const monthGrid = target.parentElement;
  monthGrid.querySelector('[tabindex="0"]').tabIndex = -1;
  target.tabIndex = 0;
  target.focus();
}

function bindEvents() {
  window.addEventListener('hashchange', () => {
    month = undefined;
    if (location.hash === '#main') return;
    render({ moveFocus: true });
    window.scrollTo(0, 0);
  });
  document.querySelector('.skip').addEventListener('click', event => {
    event.preventDefault();
    main.focus();
  });
  dialog.addEventListener('close', () => {
    const opener = returnFocus && main.querySelector(returnFocus);
    (opener || main).focus({ preventScroll: true });
    returnFocus = null;
  });
  document.addEventListener('click', event => {
    click(event).catch(error => flash(error.message));
  });
  main.addEventListener('keydown', heatKeys);
  main.addEventListener('change', async event => {
    const input = event.target;
    if (input.dataset.check) {
      const row = findRow(input.dataset.check, input.dataset.date);
      if (!row) { render(); return; }
      try {
        const checked = input.checked;
        await mutate(draft => setDone(draft, row, checked));
        if (checked) document.getElementById(input.id)?.closest('.task').setAttribute('data-just-checked', '');
      } catch (error) {
        render();
        flash(error.message);
      }
    } else if (input.id === 'checklist-date' && validDate(input.value)) {
      go('today', input.value);
    } else if (input.id === 'goal-date' && validDate(input.value) && input.validity.valid) {
      go('goals', input.dataset.goal, input.value);
    } else if (input.id === 'year') {
      if (input.validity.valid && /^\d{4}$/.test(input.value)) go('analytics', input.value);
      else render();
    }
  });
  let localDay = currentDate();
  const refreshDay = () => {
    const date = currentDate();
    if (date !== localDay) { localDay = date; if (!dialog.open) render(); }
  };
  window.setInterval(refreshDay, 30_000);
  document.addEventListener('visibilitychange', refreshDay);
}
