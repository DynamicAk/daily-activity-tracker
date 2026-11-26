const DAY = 86_400_000;

export const dateValue = date => new Date(date + 'T12:00:00Z');
export const iso = date => date.toISOString().slice(0, 10);
export const offset = (date, count) => iso(new Date(+dateValue(date) + count * DAY));
export const weekday = date => dateValue(date).getUTCDay();
export const validDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) &&
  date >= '1000-01-01' && date <= '9999-12-31' &&
  Number.isFinite(+dateValue(date)) && iso(dateValue(date)) === date;
export const earlier = (a, b) => a < b ? a : b;
export const later = (a, b) => a > b ? a : b;

export function localDate(zone, now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now).map(({type, value}) => [type, value]));
  return [parts.year, parts.month, parts.day].join('-');
}

export function dateLabel(date, options = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat('en-IN', { ...options, timeZone: 'UTC' }).format(dateValue(date));
}

export function* dates(start, end) {
  for (let day = start; day <= end; day = offset(day, 1)) {
    yield day;
    if (day === end) break;
  }
}
