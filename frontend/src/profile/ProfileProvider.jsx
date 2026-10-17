import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { resetChat } from '../hooks/chatStore';
import { setCurrentLang } from '../i18n/current';

// What we know about a family before they tell us anything: nothing. There is no sample family, address or children; every screen shows
// an honest "tell us where you live" prompt until a real address is entered.
export const EMPTY_PROFILE = {
  address: '',
  matchedAddress: '',
  lat: null,
  lon: null,
  precision: null,
  children: [],
  freeOnly: false,
  priorities: [],
  values: [],
  radius: 3,
  lang: 'en',
};

/** True once a real location has been entered. Search, zoning, pathway and the planner all need one. */
export const hasLocation = (p) => p.lat != null && p.lon != null;

// Addresses are personal data: by default the profile is kept in sessionStorage only (cleared when the tab closes). Only when the
// family ticks "Remember me on this device" (REMEMBER_KEY) is it also kept in localStorage, until they choose "Forget my info".
const KEY = 'sn-profile';
const REMEMBER_KEY = 'sn-remember';

function isRemembered() {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === '1';
  } catch {
    return false;
  }
}

function load() {
  try {
    const raw =
      window.sessionStorage.getItem(KEY) ?? (isRemembered() ? window.localStorage.getItem(KEY) : null);
    if (raw) {
      const saved = JSON.parse(raw);
      // Earlier versions kept a sample family (Leo and Maya, a Wynwood address) in this tab's storage. Never load it: start empty.
      if (saved.isDemo) return { ...EMPTY_PROFILE, lang: saved.lang ?? EMPTY_PROFILE.lang };
      return { ...EMPTY_PROFILE, ...saved };
    }
  } catch {
    /* storage unavailable or corrupt: start empty */
  }
  return EMPTY_PROFILE;
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
  const [remember, setRememberState] = useState(isRemembered);
  setCurrentLang(profile.lang); // synchronous on purpose: children's effects (API calls) run before this component's effects

  useEffect(() => {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(profile));
      // Only a family's own details (an address was entered) are remembered on the device.
      if (remember && hasLocation(profile)) window.localStorage.setItem(KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }, [profile, remember]);

  // Tell the browser and screen readers which language the page is in.
  useEffect(() => {
    document.documentElement.lang = profile.lang ?? 'en';
  }, [profile.lang]);

  const updateProfile = useCallback((patch) => setProfile((p) => ({ ...p, ...patch })), []);
  const patchProfile = useCallback((patch) => setProfile((p) => ({ ...p, ...patch })), []);

  /** Tick or untick "Remember me on this device". Unticking also erases what was stored. */
  const setRemember = useCallback((on) => {
    setRememberState(on);
    try {
      if (on) window.localStorage.setItem(REMEMBER_KEY, '1');
      else {
        window.localStorage.removeItem(REMEMBER_KEY);
        window.localStorage.removeItem(KEY);
      }
    } catch {
      /* ignore */
    }
  }, []);

  /** "Forget my info": erase the stored profile and start empty again (the saved-schools list is separate). */
  const forget = useCallback(() => {
    setRemember(false);
    try {
      window.sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    resetChat(); // the conversation may hold the address and children's details that were just forgotten
    setProfile((p) => ({ ...EMPTY_PROFILE, lang: p.lang }));
  }, [setRemember]);
  const setLang = useCallback((lang) => setProfile((p) => ({ ...p, lang })), []);

  /** Geocode an address or ZIP and make it the family's location. Throws ApiError (with a next step) if it cannot be found. */
  const setLocation = useCallback(async (query) => {
    const g = await api.geocode(query);
    setProfile((p) => ({
      ...p,
      address: query,
      matchedAddress: tidyAddress(g.matched_address),
      lat: g.lat,
      lon: g.lon,
      precision: g.precision,
    }));
    return g;
  }, []);

  const shown = useMemo(() => ({ ...profile, hasLocation: hasLocation(profile) }), [profile]);
  const value = useMemo(
    () => ({ profile: shown, updateProfile, patchProfile, setLang, setLocation, remember, setRemember, forget }),
    [shown, updateProfile, patchProfile, setLang, setLocation, remember, setRemember, forget],
  );
  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used inside <ProfileProvider>');
  return ctx;
}
