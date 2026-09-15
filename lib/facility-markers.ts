import { normalizeCoordinates } from '@/lib/coordinates';
import { parseFacilityDistance } from '@/lib/facility-distance';
import type { FacilityCategory, FacilityMarker } from '@/types/score';
import type { PlaceDoc } from '@/types/score';

export const MAX_FACILITY_MARKERS = 30;

export function getDisplayedFacilityMarkers(
  markers: readonly FacilityMarker[],
  showAll: boolean,
): FacilityMarker[] {
  const visible = showAll ? markers : markers.filter((marker) => marker.usedForScore);
  return visible.slice(0, MAX_FACILITY_MARKERS);
}

export function getFacilityMarkerZIndex(marker: FacilityMarker, selectedId: string | null): number {
  if (marker.id === selectedId) return 8;
  return marker.usedForScore ? 3 : 2;
}

interface FacilityGroup {
  category: FacilityCategory;
  documents: readonly PlaceDoc[] | null;
  used: (doc: PlaceDoc) => boolean;
}

/** Whitelist fields after the existing scoring filters. Never serialize raw documents. */
export function buildFacilityMarkers(groups: readonly FacilityGroup[]): FacilityMarker[] {
  const markers: FacilityMarker[] = [];
  for (const group of groups) {
    for (const doc of group.documents ?? []) {
      if (!doc) continue;
      if (typeof doc.x !== 'string' || !doc.x.trim() || typeof doc.y !== 'string' || !doc.y.trim()) continue;
      const coords = normalizeCoordinates(Number(doc.y), Number(doc.x));
      const distance = parseFacilityDistance(doc.distance);
      if (!coords || distance === null) continue;
      if (typeof doc.place_name !== 'string' || !doc.place_name.trim()) continue;
      const name = doc.place_name.trim().slice(0, 100);
      const id = typeof doc.id === 'string' && doc.id.trim()
        ? doc.id.trim().slice(0, 100) : `${group.category}:${name}:${coords.lat}:${coords.lng}`;
      markers.push({ id, name, category: group.category, ...coords, distance, usedForScore: group.used(doc) });
    }
  }
  const byDistance = (a: FacilityMarker, b: FacilityMarker) => a.distance - b.distance || a.id.localeCompare(b.id);
  // Resolve duplicates consistently, preserving scoring evidence over a secondary result.
  markers.sort((a, b) => Number(b.usedForScore) - Number(a.usedForScore) || byDistance(a, b));
  const ids = new Set<string>();
  const locations = new Set<string>();
  const unique = markers.filter(marker => {
    const location = `${marker.name.replace(/\s+/g, '')}:${marker.lat}:${marker.lng}`;
    if (ids.has(marker.id) || locations.has(location)) return false;
    ids.add(marker.id); locations.add(location); return true;
  });
  // Reserve the closest scoring evidence per category so distant subway/cinema
  // evidence is not crowded out by dozens of nearby shops. Fill the rest by priority.
  const categories = new Set<FacilityCategory>();
  const selected = unique.filter(marker => {
    if (!marker.usedForScore || categories.has(marker.category)) return false;
    categories.add(marker.category); return true;
  });
  const selectedIds = new Set(selected.map(marker => marker.id));
  for (const marker of unique) {
    if (selected.length >= MAX_FACILITY_MARKERS) break;
    if (!selectedIds.has(marker.id)) { selected.push(marker); selectedIds.add(marker.id); }
  }
  return selected.sort(byDistance);
}
