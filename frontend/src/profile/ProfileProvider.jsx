import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { setCurrentLang } from '../i18n/current';

// The fictional demo family from the project brief: used until a real family enters their own details, so every screen works
// on first load. It is always labelled as a demo in the UI.
export const DEMO_PROFILE = {
  isDemo: true,
  address: '2250 NW 2nd Ave, Miami, FL 33127',
  matchedAddress: '2250 NW 2nd Ave, Miami, FL 33127',
  lat: 25.79866,
  lon: -80.19998,
  precision: 'address',
  children: [
    { name: 'Leo', age: 3 },
    { name: 'Maya', age: 7 },
  ],
  freeOnly: true,
  priorities: ['STEM'],
  radius: 3,
  lang: 'en',
};

// Addresses are personal data: keep the profile in sessionStorage only (cleared when the tab closes), never localStorage.
const KEY = 'sn-profile';

function load() {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) return { ...DEMO_PROFILE, ...JSON.parse(raw) };
  } catch {
    /* storage unavailable or corrupt: fall back to the demo family */
  }
  return DEMO_PROFILE;
}

// The county returns addresses in capitals ("1 LINCOLN RD"); show them in a readable case, keeping directions and ZIPs intact.
export function tidyAddress(a = '') {
  if (a !== a.toUpperCase()) return a;
  return a
    .toLowerCase()
    .replace(/\b([a-z])/g, (c) => c.toUpperCase())
    .replace(/\b(Nw|Ne|Sw|Se)\b/g, (d) => d.toUpperCase())
    .replace(/\bFl\b/g, 'FL')
    .replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_, n, suf) => n + suf.toLowerCase());
}

const ProfileContext = createContext(null);

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(load);
  setCurrentLang(profile.lang); // synchronous on purpose: children's effects (API calls) run before this component's effects

  useEffect(() => {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }, [profile]);

  // Tell the browser and screen readers which language the page is in.
  useEffect(() => {
    document.documentElement.lang = profile.lang ?? 'en';
  }, [profile.lang]);

  const updateProfile = useCallback((patch) => setProfile((p) => ({ ...p, isDemo: false, ...patch })), []);
  const patchProfile = useCallback((patch) => setProfile((p) => ({ ...p, ...patch })), []);
  const resetToDemo = useCallback(() => setProfile(DEMO_PROFILE), []);
  const setLang = useCallback((lang) => setProfile((p) => ({ ...p, lang })), []);
  /** Make `next` the active profile as is (used when a signed-in family's profile arrives from the server). */
  const replaceProfile = useCallback((next) => setProfile(next), []);
  /** Sign-out: back to the demo family so the previous family's address does not stay on screen. Keeps the display language. */
  const clearProfile = useCallback(() => {
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    setProfile((p) => ({ ...DEMO_PROFILE, lang: p.lang }));
  }, []);

  /** Geocode an address or ZIP and make it the family's location. Throws ApiError (with a next step) if it cannot be found. */
  const setLocation = useCallback(async (query) => {
    const g = await api.geocode(query);
    setProfile((p) => ({
      ...p,
      isDemo: false,
      address: query,
      matchedAddress: tidyAddress(g.matched_address),
      lat: g.lat,
      lon: g.lon,
      precision: g.precision,
    }));
    return g;
  }, []);

  const value = useMemo(
    () => ({
      profile,
      updateProfile,
      patchProfile,
      resetToDemo,
      setLang,
      setLocation,
      replaceProfile,
      clearProfile,
    }),
    [profile, updateProfile, patchProfile, resetToDemo, setLang, setLocation, replaceProfile, clearProfile],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
