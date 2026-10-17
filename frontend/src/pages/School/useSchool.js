import { useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { useApi } from '../../hooks/useApi';
import { useProfile } from '../../profile/ProfileProvider';

const LEVELS = ['elementary', 'middle', 'high'];

/** Translated name of a zoned level ('elementary' -> 'primaria'); an unknown level is shown as it came from the API. */
export const levelLabel = (t, level) => (LEVELS.includes(level) ? t(`school.level.${level}`) : level);

/** Detail for one school (GET /api/schools/{id}) from the family's location, so distance and zoning are included. */
export function useSchool() {
  const { id } = useParams();
  const { profile } = useProfile();
  const { data, error, loading } = useApi(
    (signal) => api.school(id, profile.lat, profile.lon, { signal }),
    [id, profile.lat, profile.lon],
  );
  return { id, data, error, loading, profile };
}
