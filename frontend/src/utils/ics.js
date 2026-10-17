// Minimal iCalendar (.ics) builder for all-day reminders. RFC 5545: CRLF line endings, escaped text, lines folded at 75 octets.
const CRLF = '\r\n';
const enc = new TextEncoder();

export const escapeText = (s) =>
  String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/** Fold one content line so no line exceeds 75 octets (never splitting a multi-byte character). */
export function fold(line) {
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = ch;
      bytes = n;
      limit = 74; // continuation lines start with one space
    } else {
      cur += ch;
      bytes += n;
    }
  }
  out.push(cur);
  return out.join(CRLF + ' ');
}

const compact = (iso) => iso.replace(/-/g, '');
const nextDay = (iso) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};
const stamp = (d) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

/**
 * events: [{ uid, date: 'YYYY-MM-DD', summary, description?, url?, alarmDays? }]. Each becomes an all-day event with a reminder.
 * Only valid dates are included; returns the calendar text.
 */
export function buildIcs(events, { now = new Date(), name = 'School choice plan' } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Miami-Dade School Navigator//Plan//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(name)}`,
  ];
  for (const e of events) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date ?? '')) continue;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}@school-navigator`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compact(e.date)}`,
      `DTEND;VALUE=DATE:${nextDay(e.date)}`,
      `SUMMARY:${escapeText(e.summary)}`,
    );
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.alarmDays)
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `DESCRIPTION:${escapeText(e.summary)}`,
        `TRIGGER:-P${e.alarmDays}D`,
        'END:VALARM',
      );
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join(CRLF) + CRLF;
}

/** Save text as a file in the browser. */
export function downloadFile(filename, text, type = 'text/calendar;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
