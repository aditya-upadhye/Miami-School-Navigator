import { useCallback, useRef, useState } from 'react';
import { api } from '../api/client';
import { useProfile } from '../profile/ProfileProvider';

/** What the assistant may know about the family: held by the server for one request only, never stored. */
export function chatProfile(p) {
  return {
    address: p.matchedAddress || p.address || undefined,
    lat: p.lat,
    lon: p.lon,
    children: (p.children ?? []).map((c) => ({ age: c.age, name: c.name || undefined })),
    free_only: !!p.freeOnly,
    priorities: p.priorities ?? [],
  };
}

/**
 * Conversation with Navi (POST /api/chat). messages: {role, content, citations?, results?, warnings?, degraded?}.
 * Only role + content are sent back as history.
 */
export function useChat({ blankProfile = false } = {}) {
  const { profile: stored } = useProfile();
  // The onboarding chat starts blank for a new family instead of assuming the demo family's address.
  const profile = blankProfile && stored.isDemo ? { lang: stored.lang, children: [] } : stored;
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const busy = useRef(false);

  const send = useCallback(
    async (raw) => {
      const content = raw.trim();
      if (!content || busy.current) return;
      busy.current = true;
      const history = [...messages, { role: 'user', content }];
      setMessages(history);
      setLoading(true);
      setError(null);
      try {
        const res = await api.chat({
          messages: history.map(({ role, content: c }) => ({ role, content: c })),
          profile: chatProfile(profile),
          lang: profile.lang ?? 'en',
        });
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: res.answer,
            citations: res.citations,
            results: res.results,
            warnings: res.warnings,
            degraded: res.degraded,
          },
        ]);
      } catch (e) {
        setError(e);
      } finally {
        busy.current = false;
        setLoading(false);
      }
    },
    [messages, profile],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, send, loading, error, reset };
}
