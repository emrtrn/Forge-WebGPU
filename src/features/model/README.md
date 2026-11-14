# Model

3B model dosyası (glTF / GLB) asset türü (mimari §4.6).

- `schema.ts`: `forge.model@2` ikili asset türü; `glb`, `gltf` uzantılarını
  iddia eder. İçe aktarma ayarları (Faz 3 adım 4), Forge'un yan dosyalarından:
  `materials` (slot başına varsayılan `forge.material`, benzersiz GLB materyal
  sırası; boş = GLB'ninki), `uvw` (izdüşüm: none / planar / box / sphere /
  cylinder, gizmo konum / dönüş / ölçek), `vertexColors` (primitive başına
  RGBA köşe renkleri). Sürüm 1 (ayarsız) dosyaları varsayılanlara geçer.
- `feature.ts`: yalnız asset türünü kurar.
- `editor.ts`: ortak asset editörüne model önizlemesini ve slot / UVW /
  vertex renk araçlarını kaydeder (Faz 4 / 7). `editorRender.ts` yalnız
  editörün topladığı önizleme fabrikasıdır; ikinci renderer açmaz.
- Content Browser çift tık / Open veya yerleştirilmiş modelde Ctrl+E ile
  açılır. Slotlar, UVW formu / gizmosu ve vertex doldur / sil aynı meta
  taslağını ve undo geçmişini kullanır. Save GLB'yi değiştirmez; Optimize
  ayarları sonraki Reimport'ta uygulanır. Topoloji uyuşmazsa kayıtlı vertex
  verisi korunur; otomatik onarım ve çarpışma bu adımda yoktur.
- Yükleme render katmanında (`model:<guid>`): slot materyalleri, UVW ve köşe
  renkleri yüklenen sahneye uygulanır; yerleşim `forge.staticMesh.materials`
  ile slotları değiştirebilir.
