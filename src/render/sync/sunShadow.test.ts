// Forge WebGL's sun follow shadow checks (tests/engine/sunFollowShadow.test.ts,
// followShadow.test.ts's three lookAt check), rewritten against
// updateFollowShadow on three/webgpu (plan phase 3 step 3; PORT_LOG §2).
// Forge's assertion on the 2 cm world bias is replaced: the follow map keeps
// the shared depth bias (see sunShadow.ts).

import assert from "node:assert/strict";
import { describe, test } from "vitest";
import { DirectionalLight, Group, Matrix4, Scene, Vector3 } from "three/webgpu";
import { computeFollowShadowFrame, type FollowShadowVec3 } from "../../engine/world/followShadow.ts";
import { FOLLOW_SHADOW_DEPTH, SHADOW_DEPTH_BIAS, configureShadow, updateFollowShadow } from "./sunShadow.ts";

function sunUnderRotatedRoot(): { scene: Scene; sun: DirectionalLight } {
  const scene = new Scene();
  // Light actors parent the light under a transformed root, the target in the scene.
  const root = new Group();
  root.position.set(4, 8, 4);
  root.rotation.set(-0.7, 0.5, 0);
  scene.add(root);
  const sun = new DirectionalLight("#ffffff", 3);
  sun.castShadow = true;
  configureShadow(sun, 1024);
  root.add(sun);
  scene.add(sun.target);
  sun.target.position.set(-6, 0, -9);
  scene.updateMatrixWorld(true);
  return { scene, sun };
}

function lightDirection(sun: DirectionalLight): Vector3 {
  const from = sun.getWorldPosition(new Vector3());
  return sun.target.getWorldPosition(new Vector3()).sub(from).normalize();
}

describe("sun follow shadow (Forge checks, rewritten)", () => {
  test("sun follow shadow: re-centres ahead of the camera without turning the light", () => {
    const { sun } = sunUnderRotatedRoot();
    const before = lightDirection(sun);
    const camera = new Vector3(1200, 40, -800);
    const ok = updateFollowShadow(sun, camera, new Vector3(0, -0.3, -1), 45);
    assert.equal(ok, true);
    const after = lightDirection(sun);
    assert.ok(before.distanceTo(after) < 1e-9, `direction ${before.toArray()} → ${after.toArray()}`);
    const target = sun.target.getWorldPosition(new Vector3());
    // Half an extent ahead along the horizontal forward, within a texel of the focus laterally.
    const texel = 90 / 1024;
    const focus = new Vector3(1200, 40, -800 - 22.5);
    const offset = target.clone().sub(focus);
    const alongLight = offset.dot(after);
    assert.ok(offset.clone().addScaledVector(after, -alongLight).length() <= texel * Math.SQRT1_2 + 1e-6);
    assert.ok(Math.abs(alongLight) < 1e-6);
    assert.ok(Math.abs(sun.getWorldPosition(new Vector3()).distanceTo(target) - FOLLOW_SHADOW_DEPTH) < 1e-6);
    const shadow = sun.shadow.camera;
    assert.deepEqual([shadow.left, shadow.right, shadow.top, shadow.bottom, shadow.near, shadow.far], [-45, 45, 45, -45, 0, 300]);
    assert.equal(sun.shadow.bias, SHADOW_DEPTH_BIAS);
  });

  test("sun follow shadow: sub-texel camera motion keeps the frustum still", () => {
    const { sun } = sunUnderRotatedRoot();
    updateFollowShadow(sun, new Vector3(50, 2, 50), new Vector3(1, 0, 0), 60);
    const first = sun.target.getWorldPosition(new Vector3());
    const direction = lightDirection(sun);
    // Move along the light direction: no lateral component, so no texel change.
    updateFollowShadow(sun, new Vector3(50, 2, 50).addScaledVector(direction, 3), new Vector3(1, 0, 0), 60);
    const second = sun.target.getWorldPosition(new Vector3());
    const lateral = second.clone().sub(first);
    lateral.addScaledVector(direction, -lateral.dot(direction));
    assert.ok(lateral.length() < 1e-6, `lateral drift ${lateral.length()}`);
  });

  test("follow shadow: basis matches three lookAt (three/webgpu)", () => {
    const close = (a: FollowShadowVec3, b: Vector3): void => {
      assert.ok(Math.abs(a[0] - b.x) < 1e-9 && Math.abs(a[1] - b.y) < 1e-9 && Math.abs(a[2] - b.z) < 1e-9, `${a} vs ${b.toArray()}`);
    };
    for (const lightDirection of [[0.3, -1, 0.2], [0, -1, 0], [1, -0.2, 0], [-0.5, -0.5, 0.7]] as FollowShadowVec3[]) {
      const result = computeFollowShadowFrame({ lightDirection, focus: [10, 0, -5], halfExtent: 30, mapSize: 1024, depthAbove: 150, depthBelow: 150 })!;
      const matrix = new Matrix4().lookAt(new Vector3(...result.position), new Vector3(...result.target), new Vector3(0, 1, 0));
      [result.axisX, result.axisY, result.axisZ].forEach((axis, column) => close(axis, new Vector3().setFromMatrixColumn(matrix, column)));
    }
  });
});
