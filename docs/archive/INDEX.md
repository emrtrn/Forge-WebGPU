# Arşiv dizini

Biten fazların ayrıntısı. Faz kapanınca (kapısı geçti, bütün kutuları
işaretli) [yeniden inşa planındaki](../planned/FORGE_WEBGPU_REBUILD_PLAN.md)
bölümü kapanış docs commit'inde olduğu gibi buraya taşınır; planda kısa özet,
bağlantı ve §11 ilerleme kaydı kalır. Kararlar
[mimari raporda](../planned/FORGE_WEBGPU_ARCHITECTURE.md) kalır, arşive gitmez.

| Faz | Belge | Kapandı | Özet |
|---|---|---|---|
| 0 | [PHASE_0.md](PHASE_0.md) | 2026-11-11 | Kararlar (K1–K11, A1–A11), Forge özellik envanteri, referans sahneler ve pozlar, R1'de WebGL baseline tablosu ve yükleme süreleri, GO sayılarının konması |
| 1 | [PHASE_1.md](PHASE_1.md) | 2026-11-11 | WebGPU doğrulama spike'ı (Forge `spikes/webgpu/`): S1 boot, S2 TSL CDLOD terrain, S3 pipeline ve profiller, S4 gerçek içerikle açık dünya stresi ve compute culling; G1–G9 sonuç tablosu; GO (koşullu: GPU güdümlü foliage 5c'de) |
| 2a | [PHASE_2A.md](PHASE_2A.md) | 2026-11-11 | Mimari iskelet: veri / asset / hücre modeli, şema kaydı, kayıt servisi, uygulama kabuğu, oyun projesi sözleşmesi ve SDK, depo düzeni, kapı. Height Fog uçtan uca; 50.000 aktör ölçümü eşik içinde |
| 2b | [PHASE_2B.md](PHASE_2B.md) | 2026-11-12 | Cut-over (Forge `forge-webgl-final`), test sınıflaması, three'siz alt sistemlerin taşınması (A 885 / 1.022, geri kalanı faz kapılarında), `tools/world`, Forge WebGL içe aktarıcısı ve kabulü, starter paketi ve depo dışı referans projesi, kayıt oyunu (`forge.saveGame/1`) ve World Partition'ın saf kısmı |
| 3 | [PHASE_3.md](PHASE_3.md) | 2026-11-13 | Render çekirdeği ve level görüntüleyici: WebGPU renderer host, GUID anahtarlı kaynak önbelleği, kalite merdiveni + WebGPU izin alanları, ışık ve kaskatlı gölge, `forge.material` (şemalı JSON asset türü), gökyüzü / Sky Light / bulut / World Environment, olay bazlı gün saati, TSL `RenderPipeline` + Post Process + MRT, görüntüleyici (instancing, terrain salt çizimi, kamera, `?debug`), içe aktarıcının Faz 3 çeviricileri; render smoke'u Faz 0 pozlarında ve yan yana ızgara; ilk görsel kabul (A 934 / 1.021) |
