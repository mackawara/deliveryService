import { area as measureArea } from '@turf/area';
import { difference } from '@turf/difference';
import { feature, featureCollection } from '@turf/helpers';
import { intersect } from '@turf/intersect';
import { kinks } from '@turf/kinks';

import type { GeoArea, Position } from '@/api/dto/common';
import type { Zone } from '@/api/types';

export function polygons(area: GeoArea): Position[][][] {
  return area.type === 'Polygon' ? [area.coordinates] : area.coordinates;
}

/** Map paths omit the duplicated closing vertex; GeoJSON always includes it. */
export function closeRing(positions: Position[]): Position[] {
  if (positions.length === 0) return [];
  const first = positions[0]!;
  const last = positions.at(-1)!;
  return first[0] === last[0] && first[1] === last[1]
    ? positions.map((point) => [...point])
    : [...positions.map((point): Position => [...point]), [...first]];
}

export function openRing(ring: Position[]): Position[] {
  if (ring.length < 2) return ring;
  const first = ring[0]!;
  const last = ring.at(-1)!;
  return first[0] === last[0] && first[1] === last[1] ? ring.slice(0, -1) : ring;
}

export function suggestZoneCode(label: string, existingCodes: string[]): string {
  const base = label
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!base) return '';
  const used = new Set(existingCodes.map((code) => code.toUpperCase()));
  let code = base;
  for (let suffix = 2; used.has(code); suffix += 1) code = `${base}_${suffix}`;
  return code;
}

export interface BoundaryCheck {
  error?: string;
  outsideTown: boolean;
  overlaps: Zone[];
  warning?: string;
}

export function checkZoneBoundary(
  boundary: GeoArea,
  townArea: GeoArea,
  zones: Zone[],
  editingId?: string,
): BoundaryCheck {
  const result: BoundaryCheck = { outsideTown: false, overlaps: [] };
  try {
    const candidate = feature(boundary);
    if (kinks(candidate).features.length > 0)
      return {
        ...result,
        error: 'Boundary lines cross. Move the corners so the shape does not cross itself.',
      };
    if (measureArea(candidate) < 1)
      return {
        ...result,
        error: 'Draw a boundary with at least three distinct corners enclosing an area.',
      };
    const outside = difference(featureCollection([candidate, feature(townArea)]));
    result.outsideTown = outside !== null && measureArea(outside) > 1;
    for (const zone of zones) {
      if (zone.id === editingId || zone.status !== 'ACTIVE') continue;
      try {
        if (intersect(featureCollection([candidate, feature(zone.polygon)])))
          result.overlaps.push(zone);
      } catch {
        result.warning =
          'One existing zone could not be checked. Review the neighbouring boundaries before saving.';
      }
    }
    return result;
  } catch {
    return {
      ...result,
      error: 'This boundary could not be checked. Review its shape and try again.',
    };
  }
}
