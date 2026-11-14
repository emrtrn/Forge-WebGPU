// Three-free vector, quaternion and 4x4 matrix helpers for the editor's
// transform math (the gizmo's drag, snap and pivot; plan phase 4 step 4). The
// formulas are three.js's (Quaternion.multiply / setFromAxisAngle /
// setFromRotationMatrix, Matrix4.compose / invert, Vector3.applyQuaternion);
// a matrix is column-major like three's `elements`, a quaternion [x, y, z, w].

import type { Vec3, Vec4 } from "../../core/index.ts";

export type Quat = Vec4;
/** Column-major 4x4 matrix (16 numbers). */
export type Mat4 = readonly number[];

export const IDENTITY_QUAT: Quat = [0, 0, 0, 1];

export const add = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: Readonly<Vec3>, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a: Readonly<Vec3>, b: Readonly<Vec3>): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: Readonly<Vec3>, b: Readonly<Vec3>): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const length = (a: Readonly<Vec3>): number => Math.hypot(a[0], a[1], a[2]);

export function normalize(a: Readonly<Vec3>): Vec3 {
  const l = length(a);
  return l === 0 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l];
}

/** a * b: b's rotation, then a's. */
export function multiplyQuat(a: Readonly<Quat>, b: Readonly<Quat>): Quat {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [ax * bw + aw * bx + ay * bz - az * by, ay * bw + aw * by + az * bx - ax * bz, az * bw + aw * bz + ax * by - ay * bx, aw * bw - ax * bx - ay * by - az * bz];
}

export function normalizeQuat(q: Readonly<Quat>): Quat {
  const l = Math.hypot(q[0], q[1], q[2], q[3]);
  return l === 0 ? [0, 0, 0, 1] : [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** The inverse of a unit quaternion (its conjugate). */
export const invertQuat = (q: Readonly<Quat>): Quat => [-q[0], -q[1], -q[2], q[3]];

/** Rotation about a unit axis by `radians`. */
export function quatFromAxisAngle(axis: Readonly<Vec3>, radians: number): Quat {
  const s = Math.sin(radians / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(radians / 2)];
}

/** `v` rotated by `q` (Vector3.applyQuaternion). */
export function rotate(q: Readonly<Quat>, v: Readonly<Vec3>): Vec3 {
  const [qx, qy, qz, qw] = q;
  const tx = 2 * (qy * v[2] - qz * v[1]);
  const ty = 2 * (qz * v[0] - qx * v[2]);
  const tz = 2 * (qx * v[1] - qy * v[0]);
  return [v[0] + qw * tx + qy * tz - qz * ty, v[1] + qw * ty + qz * tx - qx * tz, v[2] + qw * tz + qx * ty - qy * tx];
}

/** Matrix4.compose(position, rotation, scale). */
export function composeMat4(p: Readonly<Vec3>, q: Readonly<Quat>, s: Readonly<Vec3>): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const [sx, sy, sz] = s;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    p[0], p[1], p[2], 1,
  ];
}

export const IDENTITY_MAT4: Mat4 = composeMat4([0, 0, 0], IDENTITY_QUAT, [1, 1, 1]);

/** a * b (b applied first). */
export function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[col * 4 + k]!;
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

type Elements = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

/** Matrix4.invert; null for a singular matrix. */
export function invertMat4(m: Mat4): Mat4 | null {
  const [n11, n21, n31, n41, n12, n22, n32, n42, n13, n23, n33, n43, n14, n24, n34, n44] = m as unknown as Elements;
  const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
  const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
  const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
  const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
  const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (det === 0) return null;
  const d = 1 / det;
  return [
    t11 * d,
    (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * d,
    (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * d,
    (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * d,
    t12 * d,
    (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * d,
    (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * d,
    (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * d,
    t13 * d,
    (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * d,
    (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * d,
    (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * d,
    t14 * d,
    (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * d,
    (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * d,
    (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * d,
  ];
}

/** The point `v` through `m` (Vector3.applyMatrix4 for an affine matrix). */
export function transformPoint(m: Mat4, v: Readonly<Vec3>): Vec3 {
  return [m[0]! * v[0] + m[4]! * v[1] + m[8]! * v[2] + m[12]!, m[1]! * v[0] + m[5]! * v[1] + m[9]! * v[2] + m[13]!, m[2]! * v[0] + m[6]! * v[1] + m[10]! * v[2] + m[14]!];
}

/** The rotation of an affine matrix, its scale (and any shear) left out (Matrix4.decompose's quaternion). */
export function rotationOf(m: Mat4): Quat {
  const cx = normalize([m[0]!, m[1]!, m[2]!]);
  const cy = normalize([m[4]!, m[5]!, m[6]!]);
  let cz = normalize([m[8]!, m[9]!, m[10]!]);
  // A mirrored matrix: three flips the x scale.
  if (dot(cross(cx, cy), cz) < 0) cz = scale(cz, -1);
  const [m11, m21, m31] = cx;
  const [m12, m22, m32] = cy;
  const [m13, m23, m33] = cz;
  const trace = m11 + m22 + m33;
  let q: Quat;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    q = [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  } else if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    q = [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  } else if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    q = [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  } else {
    const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
    q = [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
  }
  return normalizeQuat(q);
}

/** Position, rotation and scale of an affine matrix (Matrix4.decompose): a mirrored matrix flips the x scale. */
export function decomposeMat4(m: Mat4): { p: Vec3; r: Quat; s: Vec3 } {
  const sx = length([m[0]!, m[1]!, m[2]!]);
  const sy = length([m[4]!, m[5]!, m[6]!]);
  const sz = length([m[8]!, m[9]!, m[10]!]);
  const mirrored = dot(cross([m[0]!, m[1]!, m[2]!], [m[4]!, m[5]!, m[6]!]), [m[8]!, m[9]!, m[10]!]) < 0;
  // The rotation of the matrix with the x scale's sign taken out (a proper rotation).
  const unmirrored = mirrored ? [-m[0]!, -m[1]!, -m[2]!, ...m.slice(3)] : m;
  return { p: [m[12]!, m[13]!, m[14]!], r: rotationOf(unmirrored), s: [mirrored ? -sx : sx, sy, sz] };
}
