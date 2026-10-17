/** Border / background / text colors for a pill that is either selected or not. */
export const chip = (on) =>
  on
    ? { border: 'var(--accent)', bg: 'var(--accent-grad)', fg: '#FFFFFF' }
    : { border: 'var(--line2)', bg: 'var(--glass2)', fg: 'var(--ink)' };

/** Add `value` to `list` if absent, otherwise remove it. */
export const toggleInList = (list, value) =>
  list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
