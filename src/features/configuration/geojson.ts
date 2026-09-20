import type { GeoArea } from '@/api/dto/common';

export type GeoParseResult =
  | { ok: true; area: GeoArea; ringCount: number; pointCount: number }
  | { ok: false; message: string };

function isPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number' &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function checkRing(ring: unknown): string | null {
  if (!Array.isArray(ring) || ring.length < 4) {
    return 'Each ring needs at least four positions, with the first and last identical.';
  }
  if (!ring.every(isPosition)) {
    return 'Positions must be [longitude, latitude] pairs within valid ranges.';
  }
  const first = ring[0] as [number, number];
  const last = ring[ring.length - 1] as [number, number];
  if (first[0] !== last[0] || first[1] !== last[1])
    return 'Each ring must be closed: the last position repeats the first.';
  return null;
}

/**
 * Validates pasted GeoJSON before it is sent (specification section 4.8).
 *
 * Coordinates are [longitude, latitude] as MongoDB requires. Client validation improves
 * usability; the backend's own validation remains the contract.
 */
export function parseGeoArea(input: string): GeoParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    return { ok: false, message: 'That is not valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null)
    return { ok: false, message: 'Expected a GeoJSON object.' };
  const candidate = parsed as { type?: unknown; coordinates?: unknown };

  if (candidate.type === 'Polygon') {
    if (!Array.isArray(candidate.coordinates))
      return { ok: false, message: 'Polygon coordinates must be an array of rings.' };
    for (const ring of candidate.coordinates) {
      const problem = checkRing(ring);
      if (problem) return { ok: false, message: problem };
    }
    const pointCount = candidate.coordinates.reduce<number>(
      (total, ring) => total + (ring as unknown[]).length,
      0,
    );
    return {
      ok: true,
      area: parsed as GeoArea,
      ringCount: candidate.coordinates.length,
      pointCount,
    };
  }

  if (candidate.type === 'MultiPolygon') {
    if (!Array.isArray(candidate.coordinates)) {
      return { ok: false, message: 'MultiPolygon coordinates must be an array of polygons.' };
    }
    let ringCount = 0;
    let pointCount = 0;
    for (const polygon of candidate.coordinates) {
      if (!Array.isArray(polygon))
        return { ok: false, message: 'Each polygon must be an array of rings.' };
      for (const ring of polygon) {
        const problem = checkRing(ring);
        if (problem) return { ok: false, message: problem };
        ringCount += 1;
        pointCount += (ring as unknown[]).length;
      }
    }
    return { ok: true, area: parsed as GeoArea, ringCount, pointCount };
  }

  return { ok: false, message: 'Only Polygon and MultiPolygon boundaries are supported.' };
}
