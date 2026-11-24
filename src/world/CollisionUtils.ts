import { AABB, RampCollider } from '../types';

export interface MapBounds2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Multi-pass minimum-penetration horizontal depenetration against solid AABB colliders
 * and outer arena bounds. Ignores floor slabs beneath the character's feet and ceilings above head.
 */
export function depenetrateFromColliders(
  pos: { x: number; y: number; z: number },
  radius: number,
  height: number,
  colliders: AABB[],
  mapBounds?: MapBounds2D,
  passes = 3,
  stepUpTolerance = 0.04
): boolean {
  let anyPushed = false;
  const footY = pos.y + stepUpTolerance;
  const headY = pos.y + height - 0.02;

  for (let pass = 0; pass < passes; pass++) {
    let pushed = false;
    for (let i = 0; i < colliders.length; i++) {
      const b = colliders[i];
      if (b.maxY <= footY || b.minY >= headY) continue;
      if (
        pos.x + radius > b.minX &&
        pos.x - radius < b.maxX &&
        pos.z + radius > b.minZ &&
        pos.z - radius < b.maxZ
      ) {
        const penL = pos.x + radius - b.minX;
        const penR = b.maxX - (pos.x - radius);
        const penB = pos.z + radius - b.minZ;
        const penF = b.maxZ - (pos.z - radius);
        const minPen = Math.min(penL, penR, penB, penF);
        if (minPen <= 0) continue;

        if (minPen === penL) pos.x = b.minX - radius - 0.002;
        else if (minPen === penR) pos.x = b.maxX + radius + 0.002;
        else if (minPen === penB) pos.z = b.minZ - radius - 0.002;
        else pos.z = b.maxZ + radius + 0.002;
        pushed = true;
        anyPushed = true;
      }
    }
    if (!pushed) break;
  }

  if (mapBounds) {
    const pad = radius + 0.45;
    const cx = Math.max(mapBounds.minX + pad, Math.min(mapBounds.maxX - pad, pos.x));
    const cz = Math.max(mapBounds.minZ + pad, Math.min(mapBounds.maxZ - pad, pos.z));
    if (cx !== pos.x || cz !== pos.z) {
      pos.x = cx;
      pos.z = cz;
      anyPushed = true;
    }
  }

  return anyPushed;
}

/**
 * Zero-allocation analytical raycast against solid AABB colliders.
 * Returns closest hit distance in [0.005, maxDist], or maxDist if completely clear.
 */
export function raycastCollidersDist(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  colliders: AABB[]
): number {
  let bestT = maxDist;

  for (let i = 0; i < colliders.length; i++) {
    const b = colliders[i];
    let tmin = 0;
    let tmax = bestT;

    if (Math.abs(dx) < 1e-7) {
      if (ox < b.minX || ox > b.maxX) continue;
    } else {
      const inv = 1 / dx;
      let t1 = (b.minX - ox) * inv;
      let t2 = (b.maxX - ox) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (Math.abs(dy) < 1e-7) {
      if (oy < b.minY || oy > b.maxY) continue;
    } else {
      const inv = 1 / dy;
      let t1 = (b.minY - oy) * inv;
      let t2 = (b.maxY - oy) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (Math.abs(dz) < 1e-7) {
      if (oz < b.minZ || oz > b.maxZ) continue;
    } else {
      const inv = 1 / dz;
      let t1 = (b.minZ - oz) * inv;
      let t2 = (b.maxZ - oz) * inv;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) continue;
    }

    if (tmin >= 0.005 && tmin < bestT) {
      bestT = tmin;
    }
  }

  return bestT;
}

const SIDE_ANGLE_COS = Math.cos(0.36); // ~20.6 degrees
const SIDE_ANGLE_SIN = Math.sin(0.36);

/**
 * Measures forward horizontal clearance in front of a character's shoulder/rifle line
 * using 3 zero-allocation rays (center, +20 deg, -20 deg) against solid colliders and staircase ramps.
 */
export function measureForwardWallClearance(
  x: number,
  y: number,
  z: number,
  fwdX: number,
  fwdZ: number,
  maxDist: number,
  colliders: AABB[],
  ramps?: RampCollider[]
): number {
  const len = Math.hypot(fwdX, fwdZ);
  if (len < 1e-5) return maxDist;
  const nx = fwdX / len;
  const nz = fwdZ / len;

  // Center ray + left/right 20-deg fan rays (catches angled wall approaches & corner peeks!)
  const lx = nx * SIDE_ANGLE_COS - nz * SIDE_ANGLE_SIN;
  const lz = nx * SIDE_ANGLE_SIN + nz * SIDE_ANGLE_COS;
  const rx = nx * SIDE_ANGLE_COS + nz * SIDE_ANGLE_SIN;
  const rz = -nx * SIDE_ANGLE_SIN + nz * SIDE_ANGLE_COS;

  let best = raycastCollidersDist(x, y, z, nx, 0, nz, maxDist, colliders);
  const dL = raycastCollidersDist(x, y, z, lx, 0, lz, best, colliders);
  if (dL < best) best = dL;
  const dR = raycastCollidersDist(x, y, z, rx, 0, rz, best, colliders);
  if (dR < best) best = dR;

  // Also test staircase ramps (rising stairs in front of chest or solid ramp underside/sides)
  if (ramps && ramps.length > 0) {
    for (let i = 0; i < ramps.length; i++) {
      const rp = ramps[i];
      const maxRampY = Math.max(rp.yAtMinZ, rp.yAtMaxZ);
      if (y > maxRampY + 0.15) continue;
      // Sample 4 quick points along forward ray up to best
      const steps = 4;
      for (let s = 1; s <= steps; s++) {
        const d = (best * s) / steps;
        const px = x + nx * d;
        const pz = z + nz * d;
        if (px >= rp.minX - 0.08 && px <= rp.maxX + 0.08 && pz >= rp.minZ - 0.08 && pz <= rp.maxZ + 0.08) {
          const t = Math.max(0, Math.min(1, (pz - rp.minZ) / Math.max(0.001, rp.maxZ - rp.minZ)));
          const ry = rp.yAtMinZ + (rp.yAtMaxZ - rp.yAtMinZ) * t;
          // If the staircase structure rises through the rifle height ahead, shorten clearance
          if (y <= ry + 0.06 && y >= Math.min(rp.yAtMinZ, rp.yAtMaxZ) - 0.1) {
            best = Math.min(best, d);
            break;
          }
        }
      }
    }
  }

  return best;
}
