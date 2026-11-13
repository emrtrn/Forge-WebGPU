// The frame pipeline (plan phase 3 step 6, architecture §4.9): one three
// `RenderPipeline` over an MRT scene pass, built from a plan
// (pipelinePlan.ts) and rebuilt only when the plan's key, the scene or the
// camera changes; authored numbers (bloom strength, grading, ...) are
// uniforms written every frame. Forge WebGL's composer passes are rewritten
// as three's TSL nodes (GTAO, SSGI, SSR, TRAA, SMAA, depth of field, bloom,
// RGB shift, film) and two TSL functions (Forge's grading and vignette
// shaders); the three addons are used only here.
//
// The output transform is the renderer's: tone mapping and exposure from the
// frame's output (output.ts), applied by the render pipeline's last step, or
// by the renderer itself when a plan has no pass and the scene is drawn
// straight to the canvas (with the renderer's MSAA, as Forge drew a level
// without effect passes). The scene pass has no MSAA: its depth, normal and
// velocity feed the screen-space passes, and anti-aliasing is TRAA / SMAA.
//
// Forge's mapping of its 1-based authored values onto its passes is kept
// where three's node is the same algorithm (bloom: UnrealBloom, x 0.001;
// RGB shift x 0.01; GTAO radius x 0.1, `intensity` blends the occlusion in).
// Depth of field is a different model in three (circle of confusion, not
// Bokeh): focus is the same distance, the distance to full blur is Forge's
// `maxBlur / aperture` ratio and the bokeh scale is `maxBlur`.

import {
  ACESFilmicToneMapping,
  HalfFloatType,
  NeutralToneMapping,
  NoToneMapping,
  PerspectiveCamera,
  RenderPipeline,
  RGFormat,
  UnsignedByteType,
  type Camera,
  type Node,
  type Scene,
  type ToneMapping,
  type UniformNode,
  type WebGPURenderer,
} from "three/webgpu";
import {
  diffuseColor,
  dot,
  float,
  metalness,
  mix,
  mrt,
  normalView,
  output,
  packNormalToRGB,
  pass,
  roughness,
  sample,
  screenUV,
  uniform,
  unpackRGBToNormal,
  vec2,
  vec3,
  vec4,
  velocity,
} from "three/tsl";
import { bloom, type default as BloomNode } from "three/examples/jsm/tsl/display/BloomNode.js";
import { dof } from "three/examples/jsm/tsl/display/DepthOfFieldNode.js";
import { film } from "three/examples/jsm/tsl/display/FilmNode.js";
import { ao, type default as GTAONode } from "three/examples/jsm/tsl/display/GTAONode.js";
import { rgbShift } from "three/examples/jsm/tsl/display/RGBShiftNode.js";
import { smaa } from "three/examples/jsm/tsl/display/SMAANode.js";
import { ssgi, type default as SSGINode } from "three/examples/jsm/tsl/display/SSGINode.js";
import { ssr } from "three/examples/jsm/tsl/display/SSRNode.js";
import { traa } from "three/examples/jsm/tsl/display/TRAANode.js";
import type { FrameOutput, OutputToneMapping, PostProcessSettings } from "./output.ts";
import { planPipeline, type PipelinePlan } from "./pipelinePlan.ts";
import type { QualitySettings } from "../../engine/perf/qualityProfiles.ts";

/** Forge's `BLOOM_INTENSITY_SCALE`: the authored 1 is UnrealBloom strength 0.001 (the sun disc's HDR radiance). */
export const BLOOM_INTENSITY_SCALE = 0.001;
/** Forge's `CHROMATIC_ABERRATION_AMOUNT_SCALE`: the authored 0.5 is the RGB shift's default 0.005. */
export const CHROMATIC_ABERRATION_AMOUNT_SCALE = 0.01;
/** Forge's `AO_RADIUS_SCALE`: the authored 1 is a 0.1 m sample radius (contact shadow scale). */
export const AO_RADIUS_SCALE = 0.1;
/** Forge's Bokeh scales; their ratio is the distance to full blur per unit of `maxBlur / aperture`. */
const DOF_APERTURE_SCALE = 0.0002;
const DOF_MAXBLUR_SCALE = 0.01;
/** SSR settings of the phase 1 measurement (spike S3). */
const SSR_SETTINGS = { quality: 0.5, maxDistance: 50, thickness: 0.5, blurQuality: 2 } as const;
/** SSGI's medium preset of the phase 1 measurement (spike S3). */
const SSGI_SETTINGS = { sliceCount: 2, stepCount: 8 } as const;

const TONE_MAPPINGS: Record<OutputToneMapping, ToneMapping> = {
  none: NoToneMapping,
  aces: ACESFilmicToneMapping,
  neutral: NeutralToneMapping,
};

/** Distance from the focus at which three's depth of field reaches full blur, from Forge's Bokeh terms. */
export function dofFocalLength(aperture: number, maxBlur: number): number {
  const apertureScaled = aperture * DOF_APERTURE_SCALE;
  if (!(apertureScaled > 0)) return 1e6;
  return Math.max(1e-3, (Math.max(0, maxBlur) * DOF_MAXBLUR_SCALE) / apertureScaled);
}

type F = Node<"float">;
type V3 = Node<"vec3">;
type V4 = Node<"vec4">;

interface Uniforms {
  readonly aoIntensity: UniformNode<"float">;
  readonly focus: UniformNode<"float">;
  readonly focalLength: UniformNode<"float">;
  readonly bokehScale: UniformNode<"float">;
  readonly saturation: UniformNode<"float">;
  readonly contrast: UniformNode<"float">;
  readonly temperature: UniformNode<"float">;
  readonly tint: UniformNode<"float">;
  readonly caAmount: UniformNode<"float">;
  readonly vignetteIntensity: UniformNode<"float">;
  readonly vignetteOffset: UniformNode<"float">;
  readonly grain: UniformNode<"float">;
}

interface Built {
  readonly key: string;
  readonly scene: Scene;
  readonly camera: Camera;
  readonly pipeline: RenderPipeline;
  readonly plan: PipelinePlan;
  update(post: PostProcessSettings): void;
  dispose(): void;
}

/** Forge's colour grading shader: white balance, contrast around mid grey, saturation by Rec. 601 luma. */
function grade(rgb: V3, u: Uniforms): V3 {
  const balanced = rgb.add(vec3(u.temperature.mul(0.1), u.tint.mul(-0.1), u.temperature.mul(-0.1))) as V3;
  const contrasted = balanced.sub(0.5).mul(u.contrast).add(0.5) as V3;
  const luma = dot(contrasted, vec3(0.299, 0.587, 0.114));
  return mix(vec3(luma), contrasted, u.saturation) as V3;
}

/** three's VignetteShader: towards 1 - darkness by the squared distance from the centre, scaled by the offset. */
function vignette(rgb: V3, u: Uniforms): V3 {
  const centred = screenUV.sub(0.5).mul(u.vignetteOffset);
  return mix(rgb, vec3(float(1).sub(u.vignetteIntensity)), dot(centred, centred)) as V3;
}

function build(renderer: WebGPURenderer, scene: Scene, camera: Camera, plan: PipelinePlan): Built {
  const disposables: { dispose(): void }[] = [];
  const has = (name: string): boolean => plan.passes.includes(name as PipelinePlan["passes"][number]);
  const u: Uniforms = {
    aoIntensity: uniform(1),
    focus: uniform(10),
    focalLength: uniform(1),
    bokehScale: uniform(1),
    saturation: uniform(1),
    contrast: uniform(1),
    temperature: uniform(0),
    tint: uniform(0),
    caAmount: uniform(0.005),
    vignetteIntensity: uniform(0.35),
    vignetteOffset: uniform(1),
    grain: uniform(0.5),
  };

  const scenePass = pass(scene, camera, { samples: 0 });
  disposables.push(scenePass);
  const targets = new Set(plan.mrt.map((target) => target.name));
  const outputs: Record<string, Node> = { output };
  if (targets.has("normal")) outputs.normal = packNormalToRGB(normalView);
  if (targets.has("velocity")) outputs.velocity = velocity;
  if (targets.has("metalrough")) outputs.metalrough = vec2(metalness, roughness);
  if (targets.has("diffuse")) outputs.diffuse = diffuseColor;
  scenePass.setMRT(mrt(outputs));
  if (targets.has("normal")) scenePass.getTexture("normal").type = UnsignedByteType;
  if (targets.has("velocity")) {
    const texture = scenePass.getTexture("velocity");
    texture.type = HalfFloatType;
    texture.format = RGFormat;
  }
  if (targets.has("metalrough")) {
    const texture = scenePass.getTexture("metalrough");
    texture.type = UnsignedByteType;
    texture.format = RGFormat;
  }
  if (targets.has("diffuse")) scenePass.getTexture("diffuse").type = UnsignedByteType;

  const color = scenePass.getTextureNode("output");
  const depth = scenePass.getTextureNode("depth");
  const normal = targets.has("normal")
    ? (sample((uv: Node<"vec2">) => unpackRGBToNormal(scenePass.getTextureNode("normal").sample(uv).xyz)) as unknown as V3)
    : null;

  let rgb = color.rgb as V3;
  let gtao: GTAONode | null = null;
  let gi: SSGINode | null = null;
  const traaOn = has("traa");
  const ssgiOn = has("ssgi") && camera instanceof PerspectiveCamera;

  if ((has("gtao") || (has("ssgi") && !ssgiOn)) && normal) {
    gtao = ao(depth, normal, camera);
    gtao.resolutionScale = plan.aoResolutionScale;
    gtao.useTemporalFiltering = traaOn;
    disposables.push(gtao);
    rgb = rgb.mul(mix(float(1), gtao.getTextureNode().r, u.aoIntensity)) as V3;
  } else if (ssgiOn && normal) {
    gi = ssgi(color, depth, normal, camera as PerspectiveCamera);
    gi.sliceCount.value = SSGI_SETTINGS.sliceCount;
    gi.stepCount.value = SSGI_SETTINGS.stepCount;
    gi.useTemporalFiltering = traaOn;
    gi.resolutionScale = plan.aoResolutionScale;
    disposables.push(gi);
    const albedo = scenePass.getTextureNode("diffuse");
    rgb = rgb.mul(mix(float(1), gi.a, u.aoIntensity)).add(albedo.rgb.mul(gi.rgb)) as V3;
  }

  if (has("ssr") && normal) {
    const metalRough = scenePass.getTextureNode("metalrough");
    const reflection = ssr(color, depth, normal, {
      metalnessNode: metalRough.r as F,
      roughnessNode: metalRough.g as F,
      reflectNonMetals: true,
      stochastic: false,
      camera,
    });
    reflection.quality.value = SSR_SETTINGS.quality;
    reflection.maxDistance.value = SSR_SETTINGS.maxDistance;
    reflection.thickness.value = SSR_SETTINGS.thickness;
    reflection.blurQuality = SSR_SETTINGS.blurQuality;
    reflection.resolutionScale = plan.ssrResolutionScale;
    disposables.push(reflection);
    rgb = rgb.add(reflection.rgb) as V3;
  }

  let node: V4 = (gtao || gi || has("ssr") ? vec4(rgb, color.a) : color) as V4;

  if (traaOn) {
    const resolved = traa(node, depth, scenePass.getTextureNode("velocity"), camera);
    disposables.push(resolved);
    node = resolved as unknown as V4;
  } else if (has("smaa")) {
    const resolved = smaa(node);
    disposables.push(resolved);
    node = resolved as unknown as V4;
  }

  if (has("dof")) {
    const blurred = dof(node, scenePass.getViewZNode(), u.focus, u.focalLength, u.bokehScale);
    disposables.push(blurred);
    node = blurred as unknown as V4;
  }

  let bloomNode: BloomNode | null = null;
  if (has("bloom")) {
    bloomNode = bloom(node);
    bloomNode.setResolutionScale(plan.bloomResolutionScale);
    disposables.push(bloomNode);
    node = node.add(bloomNode) as V4;
  }

  if (has("grading")) node = vec4(grade(node.rgb as V3, u), node.a) as V4;
  if (has("chromaticAberration")) {
    const shifted = rgbShift(node, u.caAmount);
    disposables.push(shifted);
    node = shifted as unknown as V4;
  }
  if (has("vignette")) node = vec4(vignette(node.rgb as V3, u), node.a) as V4;
  if (has("grain")) node = film(node, u.grain) as unknown as V4;

  const pipeline = new RenderPipeline(renderer, node);
  return {
    key: plan.key,
    scene,
    camera,
    pipeline,
    plan,
    update(post) {
      u.aoIntensity.value = post.ao.intensity;
      if (gtao) gtao.radius.value = post.ao.radius * AO_RADIUS_SCALE;
      if (gi) gi.radius.value = post.ao.radius;
      u.focus.value = post.dof.focusDistance;
      u.focalLength.value = dofFocalLength(post.dof.aperture, post.dof.maxBlur);
      u.bokehScale.value = Math.max(0, post.dof.maxBlur);
      if (bloomNode) {
        bloomNode.strength.value = post.bloom.intensity * BLOOM_INTENSITY_SCALE;
        bloomNode.radius.value = post.bloom.radius;
        bloomNode.threshold.value = post.bloom.threshold;
      }
      u.saturation.value = post.saturation;
      u.contrast.value = post.contrast;
      u.temperature.value = post.temperature;
      u.tint.value = post.tint;
      u.caAmount.value = post.chromaticAberration.amount * CHROMATIC_ABERRATION_AMOUNT_SCALE;
      u.vignetteIntensity.value = post.vignette.intensity;
      u.vignetteOffset.value = post.vignette.offset;
      u.grain.value = post.grain.intensity;
    },
    dispose() {
      pipeline.dispose();
      for (const disposable of disposables.reverse()) disposable.dispose();
    },
  };
}

export interface FramePipeline {
  /** Draws a frame: the plan from the gated Post Process and the quality; rebuilt only when it changes. */
  render(scene: Scene, camera: Camera, output: FrameOutput, quality: QualitySettings): void;
  /** The plan of the last frame. */
  readonly plan: PipelinePlan;
  /** Pipelines built so far (a rebuild counts). */
  readonly builds: number;
  dispose(): void;
}

export function createFramePipeline(renderer: WebGPURenderer): FramePipeline {
  let built: Built | null = null;
  let plan = planPipeline(null, {} as QualitySettings);
  let builds = 0;
  const release = (): void => {
    built?.dispose();
    built = null;
  };
  return {
    render(scene, camera, frame, quality) {
      plan = planPipeline(frame.postProcess, quality);
      const toneMapping = TONE_MAPPINGS[frame.toneMapping];
      if (renderer.toneMapping !== toneMapping) renderer.toneMapping = toneMapping;
      renderer.toneMappingExposure = frame.exposure;
      if (plan.direct || !frame.postProcess) {
        release();
        renderer.render(scene, camera);
        return;
      }
      if (!built || built.key !== plan.key || built.scene !== scene || built.camera !== camera) {
        release();
        built = build(renderer, scene, camera, plan);
        builds += 1;
      }
      built.update(frame.postProcess);
      built.pipeline.render();
    },
    get plan() {
      return plan;
    },
    get builds() {
      return builds;
    },
    dispose: release,
  };
}
