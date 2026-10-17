export interface Booking {
  id: string;
  status: string;
  total: number;
}

export type Guest = { id: string; name: string };

export const NOT_AN_ENTITY = 1;
