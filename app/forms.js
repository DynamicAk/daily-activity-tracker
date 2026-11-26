import { esc, icon, action } from './views.js';
import { offset, validDate } from './dates.js';

const input = (name, value, type = 'text', attrs = '') =>
  `<input name="${name}" type="${type}" value="${esc(value)}" ${attrs}>`;
const select = (name, choices, value) => `<select name="${name}">${choices.map(([key, label]) =>
  `<option value="${esc(key)}" ${key === value ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
const label = (text, control) => `<label class="field"><span>${text}</span>${control}</label>`;
const dateField = (text, date, name = 'date', min = '1000-01-01', max = '9999-12-31') =>
  label(text, input(name, date, 'date', `min="${min}" max="${max}" required`));
const textField = (text, name, value, limit, required = false) =>
  label(text, input(name, value, 'text', `maxlength="${limit}" ${required ? 'required' : ''}`));
const check = (text, name, value, checked = false) => `<label class="check-line">
  <input type="checkbox" name="${name}" value="${value}" ${checked ? 'checked' : ''}>${text}</label>`;

export function taskForm(state, date, goal, row) {
  const task = row && state.tasks[row.from];
  const options = [['', 'No goal'], ...Object.values(state.goals).filter(Boolean).map(item => [item.id, item.title])];
  const schedule = task?.repeat || 'once';
  const scope = row?.isRecurring;
  const fields = textField('Task title', 'title', row?.title || '', 150, true) +
    `<div class="form-grid two">${label('Task type', select('type', [['must', 'Must-do'], ['other', 'Other to-do']], row?.type || 'must'))}
    ${dateField('Scheduled date', date)}</div>` +
    label('Linked goal', select('goal', options, row?.goal ?? goal)) +
    (scope ? label('Apply changes to', select('scope', [['day', 'This day'], ['future', 'This and future days']], 'day')) : '') +
    `<div id="repeat-box" class="form-grid" ${scope ? 'hidden' : ''}>
      ${label('Repeat schedule', select('repeat', [['once', 'Once'], ['daily', 'Every day'], ['weekdays', 'Selected weekdays']], schedule))}
      <fieldset id="weekdays" ${schedule === 'weekdays' ? '' : 'hidden'}><legend>Repeat on</legend>
      <div class="form-grid two">${[[1,'Monday'], [2,'Tuesday'], [3,'Wednesday'], [4,'Thursday'], [5,'Friday'], [6,'Saturday'], [0,'Sunday']]
        .map(([number, name]) => check(name, 'weekday', number, task?.weekdays?.includes(number))).join('')}</div></fieldset>
    </div>`;
  return fields;
}

export function taskFields(form) {
  return { title: String(form.get('title')).trim(), type: form.get('type'), date: form.get('date'),
    goal: form.get('goal') || '', repeat: form.get('repeat'), weekdays: form.getAll('weekday').map(Number) };
}

export function goalForm(today) {
  return textField('Goal title', 'title', '', 140, true) + `<div class="form-grid two">
    ${dateField('Start date', today, 'start')}${dateField('End date', validDate(offset(today, 6)) ? offset(today, 6) : today, 'end')}</div>`;
}
export const templateForm = today => '<p class="muted">Seven days of SQL practice with a target for each work day and one rest day.</p>' +
  dateField('Start date', today, 'start', '1000-01-01', '9999-12-25');

export function dayForm(plan) {
  return textField('Daily target', 'target', plan?.target, 200) + check('Rest day', 'rest', 'yes', plan?.rest);
}
export const copyForm = (date, goal) => '<p class="muted">Copy the target and tasks to another date. The copies start unchecked. Existing tasks on that date stay on the plan.</p>' +
  dateField('Copy to date', date < goal.end ? offset(date, 1) : goal.start, 'date', goal.start, goal.end);
export const profileForm = profile => textField('Display name', 'name', profile.name, 80, true) +
  textField('Time zone (IANA name)', 'zone', profile.zone, 80, true) +
  '<p class="muted">Examples include Asia/Kolkata, Europe/London, and America/New_York.</p>';

export function dialogMarkup(title, fields, submit, extra = '') {
  return `<form><div class="dialog-head"><h2 id="dialog-title">${esc(title)}</h2>
    ${action(icon('close'), 'cancel', 'aria-label="Close dialog"', 'quiet')}</div>
    ${fields}<p class="form-error" role="alert" hidden></p>
    <div class="dialog-actions">${extra}${action('Cancel', 'cancel', '', 'quiet')}
      <button class="${submit === 'Remove task' ? 'danger' : 'primary'}" type="submit">${submit}</button>
    </div></form>`;
}
