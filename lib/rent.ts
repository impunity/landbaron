export type UnitRentFields = {
  rent_amount?: number | null;
  has_garage?: boolean | null;
  garage_rent?: number | null;
  garages?: Array<{ garage_rent?: number | null }> | null;
};

export const getUnitBaseRent = (unit: UnitRentFields) => unit.rent_amount ?? 0;

export const getUnitGarageRent = (unit: UnitRentFields) =>
  (unit.has_garage ? Number(unit.garage_rent ?? 0) : 0) +
  (unit.garages ?? []).reduce((total, garage) => total + Number(garage.garage_rent ?? 0), 0);

export const getUnitTotalRent = (unit: UnitRentFields) => getUnitBaseRent(unit) + getUnitGarageRent(unit);
