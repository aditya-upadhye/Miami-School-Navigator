import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';

/** What graduates of one school go on to do (GET /api/schools/{id}/outcomes). A failure just hides the section: the page works without it. */
export function useOutcomes(id) {
  return useApi((signal) => api.outcomes(id, { signal }), [id]);
}
