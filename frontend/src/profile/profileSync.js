// Decisions for keeping the signed-in family's profile on the server. Pure functions; ProfileProvider/AuthProvider do the I/O.
// Guests are never synced. The demo family is never sent.

/** Fields that stay on this device: the display language is a device preference, isDemo is a local flag. */
const LOCAL_ONLY = ['isDemo', 'lang'];

export const isEmptyProfile = (p) => !p || typeof p !== 'object' || Object.keys(p).length === 0;

/** The profile as stored on the server, or null when there is nothing worth saving (the demo family). */
export function profileForServer(profile) {
  if (!profile || profile.isDemo) return null;
  const out = {};
  for (const [k, v] of Object.entries(profile)) if (!LOCAL_ONLY.includes(k) && v !== undefined) out[k] = v;
  return out;
}

/** A comparable string for echo detection (what we last loaded from or sent to the server). */
export const serverKey = (profile) => {
  const p = profileForServer(profile);
  return p ? JSON.stringify(p) : null;
};

/**
 * What to do with the server's profile when a session starts (login, sign-up, page load):
 *  - 'adopt': the server has one, it becomes the active profile (this device's language is kept)
 *  - 'push':  the server has none but this device has a real (non-demo) one: send it up
 *  - 'none':  nothing to do
 */
export function decideProfileSync(serverProfile, localProfile) {
  if (!isEmptyProfile(serverProfile)) return 'adopt';
  if (localProfile && !localProfile.isDemo) return 'push';
  return 'none';
}

/** Build the active profile from the server's copy. `base` supplies defaults for fields the server copy lacks. */
export function adoptServerProfile(serverProfile, base, lang) {
  const { isDemo, lang: _ignored, ...rest } = serverProfile; // eslint-disable-line no-unused-vars
  return { ...base, ...rest, isDemo: false, lang };
}

/** Should a change to `profile` be sent now? Not for the demo, and not when it equals what the server already has. */
export const needsSave = (profile, lastSyncedKey) => {
  const key = serverKey(profile);
  return key !== null && key !== lastSyncedKey;
};
