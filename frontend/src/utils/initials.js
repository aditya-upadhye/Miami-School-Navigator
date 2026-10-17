/** "Ana Rivera" -> "AR", "madonna" -> "M". Empty input gives an empty string. */
export function initials(name = '') {
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const first = Array.from(words[0])[0];
  const last = words.length > 1 ? Array.from(words[words.length - 1])[0] : '';
  return (first + last).toLocaleUpperCase();
}
