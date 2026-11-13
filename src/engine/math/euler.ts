// Euler XYZ (degrees) <-> quaternion, three.js's formulas without three
// (Euler.setFromQuaternion / Quaternion.setFromEuler, order "XYZ"). Stored
// transforms keep a quaternion (`r`); the editor's Rotation row and the agent
// commands read and write degrees, so both directions live here, three-free,
// for the browser editor and the Node tools alike.

export type Quaternion = readonly [number, number, number, number];
export type EulerDegrees = readonly [number, number, number];

const DEG = Math.PI / 180;

/** Quaternion [x, y, z, w] of an XYZ-order rotation in degrees (Quaternion.setFromEuler). */
export function eulerDegreesToQuaternion([xDeg, yDeg, zDeg]: EulerDegrees): [number, number, number, number] {
  const c1 = Math.cos((xDeg * DEG) / 2);
  const c2 = Math.cos((yDeg * DEG) / 2);
  const c3 = Math.cos((zDeg * DEG) / 2);
  const s1 = Math.sin((xDeg * DEG) / 2);
  const s2 = Math.sin((yDeg * DEG) / 2);
  const s3 = Math.sin((zDeg * DEG) / 2);
  return [
    s1 * c2 * c3 + c1 * s2 * s3,
    c1 * s2 * c3 - s1 * c2 * s3,
    c1 * c2 * s3 + s1 * s2 * c3,
    c1 * c2 * c3 - s1 * s2 * s3,
  ];
}

/**
 * XYZ-order Euler angles in degrees of a quaternion (Euler.setFromQuaternion
 * via the rotation matrix). The quaternion is normalised first; a zero one
 * reads as no rotation. Near gimbal lock (|Y| = 90 degrees) Z is 0.
 */
export function quaternionToEulerDegrees(q: Quaternion): [number, number, number] {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (!(length > 0)) return [0, 0, 0];
  const [x, y, z, w] = [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
  const x2 = x + x;
  const y2 = y + y;
  const z2 = z + z;
  const xx = x * x2;
  const xy = x * y2;
  const xz = x * z2;
  const yy = y * y2;
  const yz = y * z2;
  const zz = z * z2;
  const wx = w * x2;
  const wy = w * y2;
  const wz = w * z2;
  const m11 = 1 - (yy + zz);
  const m12 = xy - wz;
  const m13 = xz + wy;
  const m22 = 1 - (xx + zz);
  const m23 = yz - wx;
  const m32 = yz + wx;
  const m33 = 1 - (xx + yy);
  const ry = Math.asin(Math.min(1, Math.max(-1, m13)));
  let rx: number;
  let rz: number;
  if (Math.abs(m13) < 0.9999999) {
    rx = Math.atan2(-m23, m33);
    rz = Math.atan2(-m12, m11);
  } else {
    rx = Math.atan2(m32, m22);
    rz = 0;
  }
  return [rx / DEG, ry / DEG, rz / DEG];
}
