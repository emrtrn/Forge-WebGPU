# Model

3B model dosyası (glTF / GLB) asset türü (mimari §4.6).

- `schema.ts`: `forge.model@2` ikili asset türü; `glb`, `gltf` uzantılarını
  iddia eder. İçe aktarma ayarları (Faz 3 adım 4), Forge'un yan dosyalarından:
  `materials` (slot başına varsayılan `forge.material`, benzersiz GLB materyal
  sırası; boş = GLB'ninki), `uvw` (izdüşüm: none / planar / box / sphere /
  cylinder, gizmo konum / dönüş / ölçek), `vertexColors` (primitive başına
  RGBA köşe renkleri). Sürüm 1 (ayarsız) dosyaları varsayılanlara geçer.
- `feature.ts`: yalnız asset türünü kurar.
- Yükleme render katmanında (`model:<guid>`): slot materyalleri, UVW ve köşe
  renkleri yüklenen sahneye uygulanır; yerleşim `forge.staticMesh.materials`
  ile slotları değiştirebilir.
