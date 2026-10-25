export interface PickupDraft {
  lat: string;
  lng: string;
  address: string;
}
export function hasCoordinates(value: Pick<PickupDraft, 'lat' | 'lng'>): boolean {
  return (
    Boolean(value.lat.trim() && value.lng.trim()) &&
    Number.isFinite(Number(value.lat)) &&
    Number.isFinite(Number(value.lng)) &&
    Math.abs(Number(value.lat)) <= 90 &&
    Math.abs(Number(value.lng)) <= 180
  );
}
export function validPickup(value: PickupDraft): boolean {
  return Boolean(value.address.trim()) && hasCoordinates(value);
}
