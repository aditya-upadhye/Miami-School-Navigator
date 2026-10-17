import { useCallback, useSyncExternalStore } from 'react';
import { stageForAge } from '../utils/stages';
import { useProfile } from '../profile/ProfileProvider';
import { getState, resetChat, sendMessage, subscribe } from './chatStore';

/** What the assistant may know about the family: held by the server for one request only, never stored. */
export function chatProfile(p) {
  return {
    address: p.matchedAddress || p.address || undefined,
    lat: p.lat,
    lon: p.lon,
    children: (p.children ?? []).map((c) => ({ age: c.age, name: c.name || undefined })),
    free_only: !!p.freeOnly,
    priorities: p.priorities ?? [],
    values: p.values ?? [],
    memory: p.memory ?? [],
  };
}

/** The search the map would run for this family before they change any filter, so Jarvis's lists match it (Explore sends its live filters instead). */
function profileFilters(p) {
  return {
    radius_mi: p.radius ?? 3,
    stage: [...new Set((p.children ?? []).map((c) => stageForAge(c.age)).filter(Boolean))],
    free_only: !!p.freeOnly,
    priorities: p.priorities ?? [],
    values: p.values ?? [],
    sort: 'match',
    limit: 5,
  };
}

/**
 * Conversation with Jarvis (POST /api/chat). messages: {role, content, citations?, results?, warnings?, degraded?}.
 * Only role + content are sent back as history. The conversation is shared by every screen and kept for the tab (see chatStore.js),
 * so it is still there after moving to another page.
 */
export function useChat({ mapEnabled = false, mapNext = false } = {}) {
  const { profile } = useProfile(); // nothing is assumed about a new family: with no address the assistant asks for one
  const { messages, loading, error } = useSyncExternalStore(subscribe, getState);
  const send = useCallback(
    (raw) => sendMessage(raw, (history) => ({ messages: history, profile: chatProfile(profile), lang: profile.lang ?? 'en', map_available: mapEnabled, map_next: mapNext, map_filters: profileFilters(profile) })),
    [profile, mapEnabled, mapNext],
  );
  return { messages, send, loading, error, reset: resetChat };
}
