# Post Process

Level'ın görüntü işleme ayarları. Tek tekil.

- `schema.ts`: `forge.postProcess@1`: pozlama, ton eşleyici (`aces | neutral |
  none`), kenar yumuşatma (`none | traa | smaa`), yansıma (`off | ssr`), bloom,
  renk düzeltme (doygunluk, karşıtlık, sıcaklık, ton), vignette, alan derinliği,
  ortam kapatması, renk sapması, film greni. Forge'un varsayılan ve aralıkları;
  TRAA ve SSR WebGPU'nun. Tekil, uzamsal değil.
- `feature.ts`: bileşeni kurar. Render bağlaması yok: pipeline bileşeni adıyla
  okur (`src/render/pipeline`), kalite profiliyle kapatır
  (`applyQualityToPostProcess`, `engine/perf/qualityProfiles.ts`; profil izin
  verir, açmaz) ve profil ya da Post Process değişince pipeline'ı yeniden kurar.
- Ortam kapatması GTAO'dur; profil SSGI'ye izin veriyorsa (Cinematic) yerine
  SSGI çalışır (kullanıcı kararı 2026-11-13).
- Pozlama: Post Process varken çıktı onun ton eşleyicisi ve pozlamasıyla
  (× 0,2, Forge'un ölçeği) sunulur; Sky Atmosphere'in pozlaması gökyüzü
  kubbesini sahneye göre ölçekler (kullanıcı kararı 2026-11-13). Post
  Process'siz level Forge'daki gibi: gökyüzü varken ACES, yokken ton eşlemesiz.
