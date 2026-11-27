import {
  ActorMotionKey, CameraServiceKey, InputServiceKey, NavigationServiceKey, UiServiceKey,
  defineFeature, defineGameModule, defineSubsystem, type Vec3, type WidgetHandle,
} from "@forge/sdk";

const unit = "act_2699d8d7b1f2411583afea1d9138a71c";
const start: Vec3 = [-6, 0.4, 4];
const destination: Vec3 = [6, 0, -5];
const agent = { radius: 0.35, height: 1.2 };

const control = defineFeature({
  id: "rts.control",
  subsystems: [defineSubsystem({
    id: "rts.control",
    tickGroups: ["postPhysics"],
    create(world) {
      const camera = world.services.require(CameraServiceKey);
      const input = world.services.require(InputServiceKey);
      const navigation = world.services.require(NavigationServiceKey);
      const motion = world.services.require(ActorMotionKey);
      const ui = world.services.get(UiServiceKey);
      let label: WidgetHandle | null = null;
      let stopped = false;
      const cameraPosition: Vec3 = [0, 17, 21];
      let points: Vec3[] = [];
      let plan = false;
      let reset = false;
      let goTo = destination;
      const show = () => camera.set({
        position: cameraPosition, quaternion: [-Math.sin(0.34), 0, 0, Math.cos(0.34)], fov: 44,
      });
      return {
        beginPlay() {
          show();
          if (!ui) return;
          ui.registerLocale({ schema: 1, type: "uiLoc", locale: "en", strings: { "rts.scout": "Scout" } });
          void ui.show("ast_0133bd930b714eb185c41ef3325d75c1", {
            anchor: { actor: unit, position: [0, 0.7, 0], maxDistance: 42 },
            theme: { schema: 1, type: "uiTheme", name: "RTS", tokens: { "color.label": "#effbff", "color.surface": "#182935" } },
          }).then((widget) => {
            if (stopped) widget?.dispose();
            else label = widget;
          }).catch((error: unknown) => console.warn("Scout label could not open.", error));
        },
        tick(_group, dt) {
          const held = (action: string) => Number(input.get(action).held);
          cameraPosition[0] += (held("move-right") - held("move-left")) * 8 * dt;
          cameraPosition[2] += (held("move-back") - held("move-forward")) * 8 * dt;
          show();
          const actor = world.actor(unit);
          if (!actor) return;
          if (input.get("interact").pressed) {
            const target = reset ? [start[0], 0, start[2]] as Vec3 : destination;
            goTo = target;
            plan = true;
            points = [];
          }
          if (plan) {
            const p = actor.transform.p;
            const next = navigation.path([p[0], 0, p[2]], goTo, agent);
            if (next.status === "success") {
              points = [...next.points].map(([x, _y, z]): Vec3 => [x, 0.4, z]);
              plan = false;
              reset = !reset;
            } else if (next.status === "failure") plan = false;
          }
          const way = points[0];
          if (!way || dt <= 0) return;
          const from = actor.transform.p;
          const dx = way[0] - from[0], dz = way[2] - from[2];
          const distance = Math.hypot(dx, dz);
          const step = Math.min(1, 3 * dt / Math.max(distance, 1e-6));
          if (step === 1) points.shift();
          motion.setTransforms([{ actor: unit, transform: { ...actor.transform, p: [from[0] + dx * step, way[1], from[2] + dz * step] } }]);
        },
        dispose() { stopped = true; label?.dispose(); },
      };
    },
  })],
});

export default defineGameModule({ id: "rts.main", features: [control] });
