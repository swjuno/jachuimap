/**
 * Shared coordinate helpers for the controlled map and its selected pin.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface MapCenter {
  getLat: () => number;
  getLng: () => number;
}

export interface ControlledMap {
  getCenter: () => MapCenter;
  setCenter: (latlng: unknown) => void;
}

export interface LatLngFactory {
  new (lat: number, lng: number): unknown;
}

const COORDINATE_EPSILON = 1e-7;

export function normalizeCoordinates(
  lat: number | undefined,
  lng: number | undefined,
): Coordinates | null {
  if (
    lat === undefined ||
    lng === undefined ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null;
  }

  return { lat, lng };
}

export function coordinatesEqual(a: Coordinates, b: Coordinates): boolean {
  return (
    Math.abs(a.lat - b.lat) <= COORDINATE_EPSILON &&
    Math.abs(a.lng - b.lng) <= COORDINATE_EPSILON
  );
}

export function syncMapCenter(
  map: ControlledMap,
  coordinates: Coordinates,
  LatLng: LatLngFactory,
): boolean {
  const center = map.getCenter();
  const currentCoordinates = { lat: center.getLat(), lng: center.getLng() };
  if (coordinatesEqual(currentCoordinates, coordinates)) return false;

  map.setCenter(new LatLng(coordinates.lat, coordinates.lng));
  return true;
}
