// Palm Key island generation: a road grid, building blocks, parks, beaches,
// and the named places the missions and shops use. Deterministic from a seed
// so the island is identical on every load.

import { WORLD, COLORS } from './config.js';
import { mulberry32, pick, range, rangeInt, clamp } from './random.js';

export const ROAD_XS = [];
export const ROAD_YS = [];
for (let i = 0; i < 8; i++) {
  ROAD_XS.push(210 + i * WORLD.roadGap);
  ROAD_YS.push(210 + i * WORLD.roadGap);
}

export const PLACES = {
  garage:   { name: "Rico's Garage",  x: 640,  y: 560,  kind: 'garage' },
  marina:   { name: 'Marina',         x: 3080, y: 1400, kind: 'marina' },
  beachBar: { name: 'The Sandbar',    x: 1470, y: 3300, kind: 'bar' },
  hospital: { name: 'Palm Key General', x: 1120, y: 2240, kind: 'hospital' },
  spray:    { name: 'Pay N Spray',    x: 2380, y: 980,  kind: 'spray' },
  gunshop:  { name: 'Ironworks',      x: 1960, y: 2800, kind: 'gunshop' },
  docks:    { name: 'Dockside',       x: 330,  y: 2800, kind: 'docks' },
  bank:     { name: 'Palm Key Trust', x: 1540, y: 1400, kind: 'bank' },
  hideout:  { name: 'Hideout',        x: 2800, y: 2800, kind: 'hideout' },
  ferry:    { name: 'Ferry Terminal', x: 640,  y: 3300, kind: 'ferry' },
};

export function generateWorld(seed = 1337) {
  const rng = mulberry32(seed);
  const buildings = [];
  const palms = [];
  const parks = [];
  const roofColors = [COLORS.roofA, COLORS.roofB, COLORS.roofC, COLORS.roofD, COLORS.roofE];

  // Blocks sit between neighbouring roads.
  for (let bx = 0; bx < 7; bx++) {
    for (let by = 0; by < 7; by++) {
      const x0 = ROAD_XS[bx] + WORLD.roadWidth / 2 + WORLD.sidewalk + 8;
      const y0 = ROAD_YS[by] + WORLD.roadWidth / 2 + WORLD.sidewalk + 8;
      const x1 = ROAD_XS[bx + 1] - WORLD.roadWidth / 2 - WORLD.sidewalk - 8;
      const y1 = ROAD_YS[by + 1] - WORLD.roadWidth / 2 - WORLD.sidewalk - 8;
      const roll = rng();
      if (roll < 0.16) {
        // park or plaza block
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0, plaza: rng() < 0.4 });
        for (let p = 0; p < 5; p++) {
          palms.push({ x: range(rng, x0 + 20, x1 - 20), y: range(rng, y0 + 20, y1 - 20), s: range(rng, 0.8, 1.3) });
        }
        continue;
      }
      // 1-3 buildings per block, kept clear of the named places
      const count = rangeInt(rng, 1, 3);
      for (let b = 0; b < count; b++) {
        const w = range(rng, 90, 170);
        const h = range(rng, 80, 150);
        const x = range(rng, x0, Math.max(x0 + 1, x1 - w));
        const y = range(rng, y0, Math.max(y0 + 1, y1 - h));
        const rect = { x, y, w, h, color: pick(rng, roofColors), height: rangeInt(rng, 14, 42) };
        let clash = false;
        for (const key of Object.keys(PLACES)) {
          const p = PLACES[key];
          if (p.x > x - 90 && p.x < x + w + 90 && p.y > y - 90 && p.y < y + h + 90) { clash = true; break; }
        }
        if (!clash) buildings.push(rect);
      }
      // a couple of palms on the block corners
      for (let p = 0; p < 2; p++) {
        palms.push({ x: range(rng, x0, x1), y: range(rng, y0, y1), s: range(rng, 0.7, 1.2) });
      }
    }
  }

  // beach palms along the south and east sand
  for (let i = 0; i < 26; i++) {
    palms.push({ x: range(rng, 120, WORLD.size - 120), y: range(rng, 3230, 3360), s: range(rng, 0.9, 1.5) });
    palms.push({ x: range(rng, 3230, 3360), y: range(rng, 120, WORLD.size - 120), s: range(rng, 0.9, 1.5) });
  }

  return { buildings, palms, parks, seed };
}

// ---- spatial queries -------------------------------------------------

export function isWater(x, y) {
  return x < 0 || y < 0 || x > WORLD.size || y > WORLD.size;
}

export function isSand(x, y) {
  return (y > 3180 && y <= WORLD.size) || (x > 3180 && x <= WORLD.size);
}

export function onRoad(x, y) {
  const half = WORLD.roadWidth / 2;
  for (const rx of ROAD_XS) if (Math.abs(x - rx) <= half) return true;
  for (const ry of ROAD_YS) if (Math.abs(y - ry) <= half) return true;
  return false;
}

export function nearestRoad(x, y) {
  let best = null, bestD = Infinity;
  for (const rx of ROAD_XS) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y: clamp(y, 0, WORLD.size), vertical: true }; }
  }
  for (const ry of ROAD_YS) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x: clamp(x, 0, WORLD.size), y: ry, vertical: false }; }
  }
  return best;
}

export function nearestRoadPoint(x, y) {
  const r = nearestRoad(x, y);
  return r;
}

export function buildingAt(world, x, y, pad = 0) {
  for (const b of world.buildings) {
    if (x > b.x - pad && x < b.x + b.w + pad && y > b.y - pad && y < b.y + b.h + pad) return b;
  }
  return null;
}

// push a circle out of buildings and the world edge; returns true if moved
export function collideCircle(world, p, radius) {
  let hit = false;
  for (const b of world.buildings) {
    const cx = clamp(p.x, b.x, b.x + b.w);
    const cy = clamp(p.y, b.y, b.y + b.h);
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < radius * radius) {
      hit = true;
      if (d2 > 0.01) {
        const d = Math.sqrt(d2);
        p.x = cx + (dx / d) * radius;
        p.y = cy + (dy / d) * radius;
      } else {
        p.y = b.y - radius;
      }
    }
  }
  p.x = clamp(p.x, radius, WORLD.size - radius);
  p.y = clamp(p.y, radius, WORLD.size - radius);
  return hit;
}

// circle vs building test without moving (for cars: cheap, uses centre + corners)
export function circleHitsBuilding(world, x, y, r) {
  return buildingAt(world, x, y, r) !== null;
}
