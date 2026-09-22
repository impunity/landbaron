export type UnitRentFields = {
  rent_amount?: number | null;
  has_garage?: boolean | null;
  garage_rent?: number | null;
};

export const getUnitBaseRent = (unit: UnitRentFields) => unit.rent_amount ?? 0;

export const getUnitGarageRent = (unit: UnitRentFields) => (unit.has_garage ? unit.garage_rent ?? 0 : 0);

export const getUnitTotalRent = (unit: UnitRentFields) => getUnitBaseRent(unit) + getUnitGarageRent(unit);
