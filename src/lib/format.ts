import type { BookingStatus } from './types';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function fmtTime(d: Date) {
  const h = d.getHours();
  const m = d.getMinutes();
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** Always the real date, never "Today": "Sat 24 Oct". */
export const fmtDate = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;

export function fmtDay(d: Date) {
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export const fmtDateTime = (iso: string | Date) => {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${fmtDay(d)}, ${fmtTime(d)}`;
};

export function fmtRange(start: string, end: string) {
  const s = new Date(start);
  const e = new Date(end);
  return s.toDateString() === e.toDateString()
    ? `${fmtDay(s)}, ${fmtTime(s)} – ${fmtTime(e)}`
    : `${fmtDateTime(s)} → ${fmtDateTime(e)}`;
}

/** Compact range for cards and the search pill: "Tue 14 Oct, 10am – 6pm" or "14 Oct 10am – 16 Oct 6pm". */
export function fmtRangeShort(s: Date, e: Date) {
  const day = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return s.toDateString() === e.toDateString()
    ? `${DAYS[s.getDay()]} ${day(s)}, ${fmtTime(s)} – ${fmtTime(e)}`
    : `${day(s)} ${fmtTime(s)} – ${day(e)} ${fmtTime(e)}`;
}

/** Trip length in words: "2 hours", "1 day", "2 days 3 hours". */
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
export const fmtLength = (h: number) =>
  h < 24 ? plural(h, 'hour') : [plural(Math.floor(h / 24), 'day'), ...(h % 24 ? [plural(h % 24, 'hour')] : [])].join(' ');

export const fmtDuration = (hours: number) =>
  hours < 24 ? `${hours}h` : `${Math.floor(hours / 24)}d${hours % 24 ? ` ${hours % 24}h` : ''}`;

export const STATUS: Record<BookingStatus, { label: string; tone: 'brand' | 'success' | 'warning' | 'danger' | 'muted' }> = {
  pending_payment: { label: 'Awaiting payment', tone: 'warning' },
  requested: { label: 'Waiting for owner', tone: 'warning' },
  confirmed: { label: 'Confirmed', tone: 'brand' },
  active: { label: 'On trip', tone: 'success' },
  returned: { label: 'Returned', tone: 'muted' },
  closed: { label: 'Completed', tone: 'muted' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
  declined: { label: 'Declined', tone: 'danger' },
  no_show: { label: 'No-show', tone: 'danger' },
};

export const SLOT_LABEL = {
  front: 'Front',
  back: 'Back',
  left: 'Left side',
  right: 'Right side',
  interior: 'Interior',
  fuel: 'Fuel gauge',
  odometer: 'Odometer',
} as const;

export const carName = (c: { make: string; model: string }) => `${c.make} ${c.model}`;

/**
 * A person's name as other people see it. Never blank: an owner who hasn't set a name yet shows as "Kar host",
 * anyone else as "Kar renter". Demo labels in brackets, e.g. "Aiman (Owner)", are dropped.
 */
export function personName(p: { full_name: string; is_owner?: boolean } | null | undefined) {
  const name = (p?.full_name ?? '').replace(/\(.*?\)/, '').replace(/\s+/g, ' ').trim();
  return name || (p?.is_owner ? 'Kar host' : 'Kar renter');
}
