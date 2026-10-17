// Small pure helpers for the sign-in forms and the account menu.

// Deliberately loose (the server has the final say): something@something.tld with no spaces.
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;
export const MAX_PASSWORD = 128;

export const isEmail = (s) => EMAIL_RE.test(String(s ?? '').trim());

/** Returns a message key (or null) for each field so the UI can translate it. */
export function validateCredentials({ email, password }, { checkPasswordLength }) {
  const errors = {};
  if (!String(email ?? '').trim()) errors.email = 'auth.err.emailRequired';
  else if (!isEmail(email)) errors.email = 'auth.err.emailShape';
  if (!password) errors.password = 'auth.err.passwordRequired';
  else if (checkPasswordLength && password.length < MIN_PASSWORD) errors.password = 'auth.err.passwordShort';
  else if (password.length > MAX_PASSWORD) errors.password = 'auth.err.passwordLong';
  return errors;
}

/** Initials for the avatar: first letters of the first two words of the name, else the first letter of the email. */
export function initials(user) {
  const name = String(user?.name ?? '').trim();
  if (name) {
    const words = name.split(/\s+/);
    const letters = words.length > 1 ? words[0][0] + words[words.length - 1][0] : words[0].slice(0, 2);
    return letters.toUpperCase();
  }
  return (String(user?.email ?? '?')[0] || '?').toUpperCase();
}
