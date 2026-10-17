// Illustrative pins for the landing map, shown ONLY while the school catalog is empty.
// Names are generic and coordinates are approximate neighborhood centers: this is not real school data.

import type { School, SchoolSector, SchoolStage } from '../../domain/entities/school';

function sample(
  n: number,
  area: string,
  sector: SchoolSector,
  stage: SchoolStage,
  lat: number,
  lng: number,
): School {
  return {
    id: `sample-${n}`,
    name: `Sample ${area} school`,
    sector,
    stage,
    address: `${area}, Miami-Dade County, FL (sample location)`,
    location: { lat, lng },
    createdAt: '2025-01-01T00:00:00.000Z',
  };
}

export const SAMPLE_SCHOOLS: readonly School[] = [
  sample(1, 'Downtown Miami', 'PUBLIC', 'HIGH', 25.7743, -80.1937),
  sample(2, 'Coral Gables', 'PRIVATE', 'ELEMENTARY', 25.7215, -80.2684),
  sample(3, 'Hialeah', 'PUBLIC', 'ELEMENTARY', 25.8576, -80.2781),
  sample(4, 'Miami Beach', 'CHARTER', 'MIDDLE', 25.7907, -80.13),
  sample(5, 'Kendall', 'MAGNET', 'HIGH', 25.6793, -80.3173),
  sample(6, 'Homestead', 'PUBLIC', 'MIDDLE', 25.4687, -80.4776),
  sample(7, 'Doral', 'CHARTER', 'ELEMENTARY', 25.8195, -80.3553),
  sample(8, 'North Miami', 'EARLY_LEARNING', 'EARLY_LEARNING', 25.8901, -80.1867),
  sample(9, 'Little Havana', 'EARLY_LEARNING', 'EARLY_LEARNING', 25.7656, -80.2196),
  sample(10, 'Aventura', 'PRIVATE', 'HIGH', 25.9565, -80.1392),
  sample(11, 'Cutler Bay', 'PUBLIC', 'ELEMENTARY', 25.5808, -80.3468),
  sample(12, 'Miami Gardens', 'MAGNET', 'MIDDLE', 25.942, -80.2456),
];
