import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { getToken, setToken } from './token';

const AuthContext = createContext(null);

/** `user` is null for a guest. After sign-in it is `{ id, name, email, zip }`. */
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(() => !getToken());

  // Restore the session on load. Only a 401 means the token is dead; a network error keeps it for the next try.
  useEffect(() => {
    if (!getToken()) return undefined;
    let live = true;
    api
      .me()
      .then((u) => live && setUser(u))
      .catch((e) => {
        if (e.status === 401) setToken(null);
      })
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);

  const finish = useCallback((res) => {
    setToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);
  const signUp = useCallback((body) => api.signup(body).then(finish), [finish]);
  const signIn = useCallback((body) => api.login(body).then(finish), [finish]);
  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      /* the local session is dropped either way */
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, ready, signUp, signIn, signOut }), [user, ready, signUp, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
