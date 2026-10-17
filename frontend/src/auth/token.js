// The session token returned by sign-in. It is a random opaque string (the server keeps only its hash), kept in localStorage so a
// family stays signed in; signing out deletes it here and on the server.
const KEY = 'sn-token';

export function getToken() {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) window.localStorage.setItem(KEY, token);
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: the session just lasts until the page closes */
  }
}
