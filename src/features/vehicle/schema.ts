import { array, assetRef, bool, defineComponent, defineJsonAssetType, enumOf, num, object, text, vec3 } from "../../core/index.ts";

export const VehicleAsset = defineJsonAssetType("forge.vehicle", 1, {
  suffix: ".vehicle.json",
  fields: {
    massKg: num({ default: 1150, min: 1 }),
    centerOfMassOffset: vec3({ default: [0, -0.25, 0] }),
    maxEngineForce: num({ default: 5400, min: 0 }),
    maxReverseForce: num({ default: 3800, min: 0 }),
    maxBrakeForce: num({ default: 8500, min: 0 }),
    handbrakeForce: num({ default: 3700, min: 0 }),
    maxSteerAngleDeg: num({ default: 32, min: 0, max: 85 }),
    steerSpeed: num({ default: 2.4, min: 0 }),
    sound: assetRef({ assetType: "forge.audio", hint: "Motorun döngü ses kaydı." }),
    wheels: array(object({
      visualNode: text(),
      position: vec3({ default: [0, 0, 0] }),
      axle: enumOf(["front", "rear"], { default: "front" }),
      radius: num({ default: 0.34, min: 0.01 }),
      width: num({ default: 0.24, min: 0.01 }),
      suspensionRestLength: num({ default: 0.32, min: 0 }),
      suspensionMaxTravel: num({ default: 0.22, min: 0 }),
      suspensionStiffness: num({ default: 34, min: 0 }),
      suspensionCompression: num({ default: 4.4, min: 0 }),
      suspensionRelaxation: num({ default: 5.6, min: 0 }),
      maxSuspensionForce: num({ default: 8500, min: 0 }),
      frictionSlip: num({ default: 1.35, min: 0 }),
      sideFrictionStiffness: num({ default: 1, min: 0 }),
      steer: bool({ default: true }),
      drive: bool({ default: true }),
      brake: bool({ default: true }),
      handbrake: bool({ default: false }),
    })),
  },
}, { label: "Vehicle", hint: "Ray-cast araç şasisi, süspansiyonu ve tekerlekleri." });

export const Vehicle = defineComponent("forge.vehicle", 1, {
  definition: assetRef({ assetType: "forge.vehicle", hint: "Araç verisi. Boşsa referans şasi ve tekerlek değerleri kullanılır." }),
  model: assetRef({ assetType: "forge.model", hint: "Şasi ve isteğe bağlı tekerlek node'larını taşıyan model." }),
  playerInput: bool({ default: false, hint: "Oyuncu bu aracı ele aldığında varsayılan araç girdisini kullanır." }),
}, { label: "Vehicle", spatial: true, persistTransform: true });
