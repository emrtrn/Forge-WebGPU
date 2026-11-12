# Model

3B model dosyası (glTF / GLB) asset türü (mimari §4.6).

- `schema.ts`: `forge.model@1` ikili asset türü; `glb`, `gltf` uzantılarını
  iddia eder. Sürüm 1'de içe aktarma ayarı yok (meta dosyasında `import: {}`).
- `feature.ts`: yalnız asset türünü kurar.
- Şimdilik yalnız şema (plan 2b içe aktarıcı, kullanıcı kararı 2026-11-12):
  Forge WebGL içe aktarıcısı ve kullanıcı modelleri bu türle kaydeder,
  `forge.staticMesh.mesh` bu türü gösterir. İçe aktarma ayarları Faz 3'te
  sürüm 2 ve geçiş zinciriyle, yükleme ve çizim Faz 3'te.
