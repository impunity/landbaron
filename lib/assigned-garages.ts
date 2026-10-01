import { supabaseAdmin } from '@/lib/supabase-admin';

export type AssignedGarage = { id: string; garage_id: string; garage_rent: number | null };

export async function getAssignedGarages(propertyIds: string[]) {
  if (!supabaseAdmin) throw new Error('Supabase is not configured.');
  const byUnit = new Map<string, AssignedGarage[]>();
  if (!propertyIds.length) return byUnit;

  const { data, error } = await supabaseAdmin.from('property_garages')
    .select('id, property_id, unit_id, garage_id, garage_rent')
    .in('property_id', propertyIds)
    .not('unit_id', 'is', null);
  if (error) throw error;
  for (const garage of data ?? []) {
    if (!garage.unit_id) continue;
    byUnit.set(garage.unit_id, [...(byUnit.get(garage.unit_id) ?? []), {
      id: garage.id,
      garage_id: garage.garage_id,
      garage_rent: garage.garage_rent,
    }]);
  }
  return byUnit;
}