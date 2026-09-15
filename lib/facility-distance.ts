/** Parse only finite, non-negative facility distances. */
export function parseFacilityDistance(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  const distance = Number(trimmed);
  return Number.isFinite(distance) && distance >= 0 ? distance : null;
}
