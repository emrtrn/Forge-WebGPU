import { array, bool, defineComponent, num, text, vec3 } from "../../core/index.ts";

export const PlayerStart = defineComponent("forge.playerStart", 1, {
  tag: text({ hint: "Oyunun doğuş noktası seçerken kullanabildiği etiket." }),
}, { spatial: true, label: "Player Start", hint: "Oyuncunun kalıcı katmandaki doğuş noktası." });

export const CharacterMovement = defineComponent("forge.characterMovement", 1, {
  radius: num({ default: 0.32, min: 0.05, hint: "Hareket kapsülünün yarıçapı, metre." }),
  standingHeight: num({ default: 1.8, min: 0.1, hint: "Ayaktayken kapsülün tam yüksekliği, metre." }),
  crouchedHeight: num({ default: 1.2, min: 0.1, hint: "Çömelirken kapsülün tam yüksekliği, metre." }),
  walkSpeed: num({ default: 3, min: 0, hint: "Yürüme hızı, metre/saniye." }),
  sprintSpeed: num({ default: 6.9, min: 0, hint: "Koşu hızı, metre/saniye." }),
  crouchSpeed: num({ default: 2.6, min: 0, hint: "Çömelerek yürüme hızı, metre/saniye." }),
  jumpSpeed: num({ default: 6.9, min: 0, hint: "Başlangıç zıplama hızı, metre/saniye." }),
  gravity: num({ default: 22, min: 0, hint: "Aşağı yönlü ivme, metre/saniye²." }),
  player: bool({ default: false, hint: "Oyun, bu karakteri oyuncu piyonu olarak seçebilir." }),
}, { label: "Character Movement", hint: "Karakter kapsülü ve hareket değerleri.", persistTransform: true });

export const TargetPoint = defineComponent("forge.targetPoint", 1, {
  tag: text({ hint: "Oyunun hedef seçmek için kullandığı etiket." }),
}, { spatial: true, label: "Target Point" });

export const Interaction = defineComponent("forge.interaction", 1, {
  enabled: bool({ default: true, hint: "Bu aktör etkileşim kabul eder." }),
  distance: num({ default: 2, min: 0, hint: "En uzak etkileşim mesafesi, metre." }),
  label: text({ hint: "Oyun etkileşimi gösterirken bu etiketi kullanabilir." }),
}, { label: "Interaction" });

export const Camera = defineComponent("forge.camera", 1, {
  fov: num({ default: 60, min: 10, max: 170, hint: "Dikey görüş açısı, derece." }),
}, { label: "Camera", spatial: true });

export const SpringArm = defineComponent("forge.springArm", 1, {
  length: num({ default: 4, min: 0, hint: "Kameranın geriye ayrıldığı mesafe, metre." }),
  probeRadius: num({ default: 0.15, min: 0.01, hint: "Duvarlardan kaçınmak için küre sorgusu yarıçapı." }),
}, { label: "Spring Arm", spatial: true });

export const GameplaySpline = defineComponent("forge.spline", 1, {
  points: array(vec3({ default: [0, 0, 0] }), { hint: "Oynanış yolunun bileşen uzayındaki noktaları." }),
  closed: bool({ default: false }),
}, { label: "Spline", spatial: true });
