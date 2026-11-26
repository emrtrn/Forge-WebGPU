# Forge WebGPU — Yeniden İnşa Planı

**Güncelleme:** v2.19 · 2026-11-26 — Faz W W2b (kullanıcı, 2026-11-26): hava bulutları ve gökyüzünü sürer (`5c38a84`): WES `weatherSky` (ön ayar başına örtü, opaklık, renk, gölge, gök kapalılığı), ışıklı bulut gövdesi, kapalı gök ve Sky Light. W2 ve W2b kullanıcı görsel kabulü bekliyor.

**Önceki güncelleme:** v2.18 · 2026-11-26 — Faz W W2 zamanlı hava geçişi (`f642867`): ön ayarlar pay olarak karışır, havayı okuyan her yer karışımı görür, Sky Light hız sınırında, yarım geçiş kayıttan sürer; SDK 0.1.17 `transitionWeather`. Kullanıcı görsel kabulü bekleniyor.

**Önceki güncelleme:** v2.17 · 2026-11-26 — Bitki planı PG5b adım 6 (`8710f0c`, v0.23): karışık orman (`stand`), genç ağaçlar, altı World Builder örtüsü; kullanıcı görsel kabulü. PG5b ve PG5 kapandı.

**Önceki güncelleme:** v2.16 · 2026-11-25 — Faz W W1 kapandı (kullanıcı görsel kabulü). Sırada W2: zamanlı hava geçişi (yeni oturumda).

**Önceki güncelleme:** v2.15 · 2026-11-25 — Faz W W0 kapandı (kullanıcı tasarım 9'un mekanizmasını onayladı); W1 yağış görseli (`49c76ce`): geç katman, yağmur / kar hacimleri, WES `precipitation` ayarları.

**Önceki güncelleme:** v2.14 · 2026-11-25 — Bitki planı PG5b adım 5 (`e1891dd`, v0.22): türler (Maple, Birch, Oak, Poplar, Pine, Hazel) tek üreticide, meshopt'lu çıktı, eski sürümler kalktı; kullanıcı görsel kabulü. Sırada adım 6 (World Builder örtüleri). Faz W ayrı oturumda sürer.

**Önceki güncelleme:** v2.13 · 2026-11-25 — Faz W W0: `forge.worldEnvironment@3`, SDK `WorldEnvironmentServiceKey` (0.1.16), yağış okuması, saf yüzey durumu modeli (Codex), `measure:weather` tabanı (`cb0a856`). Kalan: tasarım 9'un mekanizma onayı (kullanıcı). Sırada W1.

**Önceki güncelleme:** v2.12 · 2026-11-25 — Faz 5 kapandı (kullanıcı görsel kabulü); bölüm `docs/archive/PHASE_5.md`'de. Faz W başladı: W0.

**Önceki güncelleme:** v2.11 · 2026-11-25 — Faz W: HK8–HK10 kapandı (kullanıcı, öneriler gibi); açık HK yok. Yüzey fiziği mekanizması (tasarım 9) W0'da onaylanır.

**Önceki güncelleme:** v2.10 · 2026-11-25 — Faz W: HK1–HK7 kapandı (kullanıcı, öneriler gibi); terrain yüzey fiziği yağışla değişir (kullanıcı): yüzey fiziği sözleşmesi ve W8 eklendi, kapı W9. Açık: HK8–HK10.

**Önceki güncelleme:** v2.09 · 2026-11-25 — Faz W (hava) açıldı (kullanıcı; yalnız plan): yağış görseli, zamanlı hava geçişi, yağış siperi, statik mesh'te kar / ıslaklık, yağışla ıslanma / kuruma, su birikintisi + halkalar, terrain kar yüksekliği; adımlar W0–W8, HV-01–12.

**Önceki güncelleme:** v2.08 · 2026-11-25 — PG5b adım 1–4'ün kullanıcı görsel kabulü (bitki planı v0.21). Sırada adım 5 (türler) ve 6 (World Builder örtüleri).

**Önceki güncelleme:** v2.07 · 2026-11-25 — Bitki planı PG5b adım 1–4 (`4279194`, v0.20): taç üreticisi (sürüm 6), starter Broadleaf / Conifer yeni ağaçlarla, aynı GUID'ler; `measure:forest` G6'yı tutuyor.

**Önceki güncelleme:** v2.06 · 2026-11-25 — Bitki planı PG5b açıldı (v0.19, §9.8; kullanıcı kararı): ağaçların yaprak örtüsü referansın çok altında (LAI 0,08–0,57); üretici sürümü 6 starter Broadleaf / Conifer'in yerine geçer, LOD0 tavanı 40 k. PG5 görsel kabulü ve Faz 5 toplu kabulü PG5b'yi bekler.

**Önceki güncelleme:** v2.05 · 2026-11-25 — World Builder açık level'a kurar ve sahne ayarlarını korur; Outliner klasörleri (`5b8f6fa`). Kullanıcı kararı, adım 8'in "yeni level" kararının yerini alır. Adım 8 / 9 ve Faz 5 toplu kabulü kullanıcıda.

**Önceki güncelleme:** v2.04 · 2026-11-25 — 5d adım 10, kapının teknik kısmı geçti: tam kapı, editör seti WebGL ve gerçek WebGPU 99 / 99, render smoke'u, terrain / akış / foliage / orman ölçümleri. Bulunan ve düzeltilenler: HLOD'un KTX2 dokuyu okumaması (`eab26b4`), Vite'ın `.forge-cache`'i taraması (`ded16da`), akış ölçüm level'ının paketle büyümesi. Faz 5 toplu görsel + performans kabulü kullanıcıda; kutular ve arşiv kabulü bekliyor.

**Önceki güncelleme:** v2.03 · 2026-11-25 — 5d adım 9, bitki tarafı (bitki planı PG5 = E + F; `88913ec` `3ce003b` `e4982df` `62d153f` `6ef8a9b` `f838402`): tarif / aile / onay sayfası önizlemeleri, kaya tarifinin editörden üretimi, World Builder'da `generated` model kaynağı, örtüde tarif başvurusu, tekil bitki ve yerleşim ağacı. Kararlar kullanıcıda (öneriler gibi). Kullanıcı görsel kabulü bekleniyor (adım 8 ile birlikte).

**Önceki güncelleme:** v2.02 · 2026-11-25 — 5d adım 8 (`54161a3`): World Builder penceresi (Add Actor > Terrain > World Builder…): seçimler, worker önizlemesi, yeni level'a kurulum, eksik paketi tek düğmeyle ekleme; örtü ağaçları ve kayalar GUID'le starter paketinden, bitkiler `forge.landscapeFoliage` kuralı. Kararlar kullanıcıda (öneriler gibi). Kullanıcı görsel kabulü bekleniyor.

**Önceki güncelleme:** v2.01 · 2026-11-25 — 5d adım 6'nın ve yol modeli tekrarının görsel kabulü (kullanıcı, 2026-11-25). Sırada adım 8: World Builder penceresi (B13).

**Önceki güncelleme:** v2.00 · 2026-11-25 — 5d adım 6 (`c3f7f0e`): Foliage fırçası (Select, Lasso, Paint, Erase, Single, Fill, Remove; Select Invalid, Reattach, Reapply, Remove Selected), darbe başına tek undo, level parçası olarak kayıt; hücresiz level'da boyanmış foliage'ın oyunda çizilmemesi düzeltildi. Bükülen yol modeli segment boyunca kendi uzunluğunda tekrarlanır (`ec45418`). Kararlar kullanıcıda (öneriler gibi). Kullanıcı görsel kabulü 2026-11-25'te verildi.

**Önceki güncelleme:** v1.99 · 2026-11-25 — 5d adım 4'ün, terrain Details düzeninin, Paint düzeninin ve panel adlarının görsel kabulü (kullanıcı, 2026-11-25). Adım 2–5'in görsel kabulü tamam; sırada adım 6 (B09).

**Önceki güncelleme:** v1.98 · 2026-11-25 — 5d adım 5'in görsel kabulü (kullanıcı, 2026-11-25). Sırada adım 6: Foliage fırçası (B09).

**Önceki güncelleme:** v1.97 · 2026-11-25 — 5d adım 5 (`49d6c09`): Landscape Splines kipi (Draw / Edit Points, birleştir / kapat / dal, yumuşak eğri, segment etkileri, Apply Deform / Apply Paint), tanımdan CPU'da bükülen yol mesh'leri (editör ve oyun; saklanmaz, statik batch). Kararlar kullanıcıda (öneriler gibi); yol süslemeleri Faz 6'ya (D27). Kullanıcı görsel kabulü 2026-11-25'te verildi (v1.98).

**Önceki güncelleme:** v1.96 · 2026-11-20 — Paint kipi Forge'un Brush / Auto Paint sekmeleriyle, Auto Paint kuralları Landscape Mode içinde; terrain Details'i Name'siz başlar; panel adları Forge'unki (Scene Outliner / World Partition, Details / Foliage) (`2a6ef5e`, kullanıcı isteği).

**Önceki güncelleme:** v1.95 · 2026-11-20 — Terrain Details'i Forge'un Landscape düzeninde (`775da8b`, kullanıcı kararı): Name → Landscape Mode; Class, Transform, pivot / yerleşim yok; bileşen alanları en altta kapalı; araçlar düğme ızgarası, View fırçanın altında. SDK 0.1.14 (`details: "tool"`). Seçili terrain üstünde gizmo sürüklemesi düzeltildi.

**Önceki güncelleme:** v1.94 · 2026-11-20 — 5d adım 4 (`4651b3b`): Add Actor > Terrain > World Terrain… (asset hemen yazılır, aktör tek undo), Expand (tek tile → ızgara, tek undo; Save yeni tile'ları yazar, geri alınanları siler), aktörle taşıma (`worldTerrainMove`: origin + dünya çerçeveli spline'lar; su Faz 7), heightmap içe / dışa aktarma (16-bit PNG / RAW). Kararlar kullanıcıda (öneriler gibi). `worldTerrainMove`'un 1 A'sı taşındı, su kullanan 3 A Faz 7'ye. Kullanıcı görsel kabulü 2026-11-25'te verildi (v1.99).

**Önceki güncelleme:** v1.93 · 2026-11-19 — 5d adım 3'ün görsel kabulü (kullanıcı, 2026-11-19). Sırada adım 4: World Terrain oluşturma / genişletme, taşıma, heightmap içe / dışa aktarma.

**Önceki güncelleme:** v1.92 · 2026-11-19 — 5d adım 3 (`30fe244`): Landscape Paint kipi (Paint / Erase / Weights, vuruş boyunca biriken ağırlık), katman listesi (Add / Remove / materyal, Fill Layer; her biri tek undo), terrain aktöründe `forge.landscapeAutoPaint` + Apply Auto Paint, yalnız editörde derlenen lit / height / slope / layer görünümü. Kararlar kullanıcıda (2026-11-19, öneriler gibi). Kullanıcı görsel kabulü bekleniyor.

**Önceki güncelleme:** v1.91 · 2026-11-19 — 5d adım 2'nin görsel kabulü (kullanıcı, 2026-11-19). Sırada adım 3: katman boyama, Auto Paint, katman görünümü.

**Önceki güncelleme:** v1.90 · 2026-11-19 — 5d adım 2 (`3074f3a`): Landscape sculpt editörde (Details'te Landscape bölümü, Forge'un 8 aracı ve değiştirici tuşları, terrain'e oturan halka), darbe dikdörtgeni GPU'ya, düzenlenen tile akışta sabit, darbe başına undo, tile + global harita + tanım tek kayıt işleminde okunan revizyonlarla. Kullanıcı görsel kabulü bekleniyor.

**Önceki güncelleme:** v1.89 · 2026-11-19 — 5d dökümü ve kararları (kullanıcı, hepsi öneri olduğu gibi): araçlar yalnız editörde (fırça CLI'sı yok), sculpt CPU'da + bölge yüklemesi, darbe başına undo, Mesh Paint 5d'den çıktı, yol mesh'leri CPU'da bake, bitki tarafı (PG5) adım 9'da bitki akışıyla. Adım sırası 1–10; adım 2 başlamadı.

**Önceki güncelleme:** v1.88 · 2026-11-19 — Faz 6 dökümü ve kararları (kullanıcı, hepsi öneri olduğu gibi): alt fazlar 6a–6e, FPS Sandbox karakter pilotu, birinci şahıs genel parçalarla, Player Start kalıcı katmanda, UI widget editörü (K12) şemalı JSON + HUD yerleşimi, K4 / K11 6e'de. 6a başlamadı.

**Önceki güncelleme:** v1.87 · 2026-11-19 — R9c kapandı. Bina akışı kabulü ve atlas A/B deneyi sonuçları [katmanlı çizim planında](LAYERED_DRAW_BUDGET_PLAN.md). Atlas performans ölçütlerini karşılamadı.

**Önceki güncelleme:** v1.86 · 2026-11-19 — 5c kapandı: kullanıcı görsel kabulü (PG3 / PV-WES adayları); kabuk ve kaya dokuları da KTX2 (kullanıcı kararı, `a1a30c6`). Faz 5 bölümü 5d açık olduğu için arşive taşınmaz.

**Önceki güncelleme:** v1.85 · 2026-11-19 — 5c adım 10–11: PG3 kapandı (KTX2 atlaslar, kullanıcı kararı; §8 ölçüldü; PK7 ölçümle odun / yaprak ayrımı), `npm run measure:forest` ile üretilmiş ormanda G6, PV-WES-01–08, mevsim geçişinde pipeline +0, hücre döngüsünde sızıntı yok (bulunan statik batch sızıntısı düzeltildi). 5c teknik kapısı geçti; görsel kabul kullanıcıda, kutu açık.

**Önceki güncelleme:** v1.84 · 2026-11-19 — 5c F3 (`0ffdcf5`): uzak billboard'lar ve uzak ton. Kullanıcı kararı: bütün uzak billboard'lar PG3 impostor biçiminde (karar 6 güncellendi); içe aktarılan GLB türü çalışma anında CPU rasterleyiciyle worker'da bake edilir. Smoke'ta billboard bloklarının %99'u modellerin üstünde.

**Önceki güncelleme:** v1.83 · 2026-11-18 — 5c adım 9: PG2 (`fa11eb2` … `3a8dd57`): foliage rüzgârı, ortak bitki tepkisi + WES mevsim geçişi, dallanan üretici + `forge.treeRecipe`, tekil bitki ve aileli foliage aynı yoldan. Kullanıcı: PG2–PG3 5c içinde (sıra korunur).

**Önceki güncelleme:** v1.82 · 2026-11-18 — 5c adım 8: PG1 kaya çıktısı (`eea639f`): GLB yazımı, `forge generate`, taş doku tarifi, triplanar + `variation`, starter ön ayarları; A / C ölçüldü.

**Önceki güncelleme:** v1.79 · 2026-11-18 — Adım 8 başladı: PG0 şemaları (`c0937cd`; bitki planı v0.7). Kullanıcı kararları: PK6 ön ayarlar starter paketinde, üretici başına tarif türü, ağaç LOD'u başına tek GLB (odun / yaprak iki slot). 5c foliage'ında rüzgâr yok: PG2'de.

**Önceki güncelleme:** v1.78 · 2026-11-18 — F7 = R10 (`184f00f`, `48536fe`): `npm run measure:foliage`, level'ların kendi foliage'ıyla G6. Profil, Forge'un her karede yaptığı halka planını ana iş parçacığının üçte biri gösterdi; halka artık kamera 1 m oynayınca / bekleyen hücrede / 30 karede bir planlanır. Derekavak P2: gönderim 1,03 ms (p95 3,0), ana iş parçacığı 1,60 ms (p95 3,8): **G6 sağlandı**. Sırada PG2.

**Önceki güncelleme:** v1.77 · 2026-11-18 — F5 (`22c50c2`: Details'in yanında Foliage sekmesi, Foliage Type listesi / oluşturma / şemadan düzenleme) ve F6 (`50fc01a`, `44f4602`: terrain'in Landscape kuralları level düzenlemesi olarak, tek Undo; kural düzenlemesi artık terrain'i yeniden kurmuyor). Sırada F7 (R10).

**Önceki güncelleme:** v1.76 · 2026-11-18 — F2 (`51d4788`: halka hücreleri worker'da) ve F4 (`1b63507`: boyanmış hücreler kameranın çevresinde akar, `?debug` foliage satırları). Kullanıcı kararı: F3 (uzak billboard + ton) PG3'le birlikte, çünkü referans içerikte hiçbir tür kullanmıyor; sıra F4 → F5–F6 → F7 → PG2 → PG3 + F3.

**Önceki güncelleme:** v1.75 · 2026-11-18 — F0 (referans projesine Derekavak / Island / WbPilotValley foliage'la yeniden alındı, `--compare` eşit) ve F1 (`b53e4db`: Landscape foliage halkası, Derekavak P2'de Node referansıyla birebir 1.640 örnek / 177 görünür, iki arka uçta). Island P1 ve WbPilotValley P3 render referansları foliage'la değişti, görsel kabul kullanıcıda.

**Önceki güncelleme:** v1.74 · 2026-11-18 — R9c katmanlı çizim bütçesi planlandı, ayrı belgede ([LAYERED_DRAW_BUDGET_PLAN.md](LAYERED_DRAW_BUDGET_PLAN.md); kullanıcı kararı, "tek ana plan" kuralının istisnası): şehir sahnesi + ölçüm, boyuta göre gölge cull distance, bölge düzeltmeleri (R9b Z6 kabulü geçmedi), bina akışı, küçük nesnede örnek başına cull, ölçüme göre WP menzilleri / atlas. Açık sorular S1–S18 kullanıcıda. Kod yok.

**Önceki güncelleme:** v1.73 · 2026-11-18 — Kullanıcı kararları (foliage sırası): 5c adım 6 → 7 → Foliage paneli (tür listesi / düzenleme + kural düzenleme, 5d'den öne; boya / silme fırçası 5d'de kalır) → R10 → PG2–PG3 → adım 11. Referans projesine Derekavak, Island ve WbPilotValley foliage'la yeniden alınır (F0). Alt adımlar F0–F7 adım 11'in altında. Kod yok.

**Önceki güncelleme:** v1.72 · 2026-11-18 — Kullanıcı kararı: GPU yolunda bölge, batch bölmesi yerine örnek başına bölge maskesiyle (Z3b `acb8e7f`); ağır iç mekânda GPU %50–60 düşer, gönderim artmaz. Z7 belgeleri yazıldı; Z6 kullanıcı görsel kabulü bekliyor.

**Önceki güncelleme:** v1.71 · 2026-11-18 — R9b S1 ve Z0–Z5 uygulandı (`ed3ad1b` … `07d863b`), Z6 ölçümü (`4d1df67`): bölgeler iç mekânda GPU'yu ~%25 düşürüyor ama batch'in bölgeye göre bölünmesi GPU güdümlü ağır eşyada gönderimi büyütüyor (bölge dışından 0,56 → 13,6 ms). GPU yolunda bölge görünürlüğünün nasıl uygulanacağı kullanıcıya soruldu; Z6 kabulü ve Z7 bekliyor.

**Önceki güncelleme:** v1.70 · 2026-11-18 — R9b açık soruları kapandı (kullanıcı, önerilerle): gizli bölge gölge düşürmez (bölge başına seçenek), ilk aşama yalnız görünürlük, statiklerin varsayılan yolu `auto` (eşik ölçümle; adım S1). Uygulama yeni oturumda.

**Önceki güncelleme:** v1.69 · 2026-11-18 — Kullanıcı kararı: occlusion culling iptal (kod Z0'da kaldırılır), PVS yok. Yerine R9b bölge sistemi: otomatik kurulur, editörde Blocking Volume gibi sürükle-bırak ve gizmo ile elle düzeltilir; çalışma anında portal üzerinden görünür bölgeler. Plan Z0–Z7; kod yok.

**Önceki güncelleme:** v1.68 · 2026-11-18 — R9a O5 ağır mesh testi: 768 × 36,5 bin üçgenlik eşyada instanced GPU 19–20,5 ms, GPU yolu + otomatik LOD 1,75–2,1 ms, + occlusion 1,73–1,85 ms (LOD'a göre fark gürültü içinde). R9.0'ın "statikler instanced" kararı ağır içerik için yeniden açılmalı; bölge / PVS değerlendirmesi kullanıcıda.

**Önceki güncelleme:** v1.67 · 2026-11-18 — R9a O1–O4 uygulandı (level ayarı, otomatik engelleyiciler, GPU Hi-Z, ana görünüm örnek ayıklaması): doğru (GPU piramidi = CPU, yanlış gizleme yok), iç mekânda örneklerin %50–90'ı gizleniyor; sentetik sahnede GPU süresi değişmedi. Varsayılan kapalı; sonraki adım kullanıcı kararında.

**Önceki güncelleme:** v1.66 · 2026-11-18 — R9a üretim kararı (kullanıcı): örnek başına GPU occlusion (engelleyici ön geçişi + GPU Hi-Z + GPU yolunda örnek ayıklama), level ayarıyla; hücre + query yolu bırakıldı (instancing'de draw artırıyor). Adımlar O1–O5.

**Önceki güncelleme:** v1.65 · 2026-11-17 — R9a iç mekân çalışması: FPS benzeri sentetik iç mekânda görüş alanındaki nesnelerin %63–69'u, üçgenlerin %88–94'ü örtülü; bugünkü model başına batch'lerle draw kazancı 0, 16 m hücreli batch'lerle %45–64. Açık dünya önerisi geri çekildi; üretim tasarımı kullanıcı kararı bekliyor.

**Önceki güncelleme:** v1.64 · 2026-11-17 — R9a occlusion çalışması (üst sınır): Derekavak'ta GPU foliage üçgeninin en çok %0–21'i örtülü.

**Önceki güncelleme:** v1.63 · 2026-11-17 — R9a adım 1 uygulandı: ikincil kamera görünümleri (yansıma kendi aynalanmış culling listesi, kendi katmanı, sayaca girer); iki arka uçta CPU referansıyla eşit. Sırada R9a occlusion tasarımı.

**Önceki güncelleme:** v1.62 · 2026-11-17 — R9 kapandı (kullanıcı kararı): statikler instanced, GPU yolu foliage'da; ikincil kamera görünümleri R9a'nın ilk adımı.

**Önceki güncelleme:** v1.61 · 2026-11-17 — R9.0–R9.4 uygulandı. Ölçümde GPU yolu hiçbir level'da kazandırmadı; statikler varsayılan olarak instanced kalır.

**Önceki güncelleme:** v1.60 · 2026-11-17 — R8 kapandı (kullanıcı görsel kabulü). R9 bulguları, kararları ve uygulama sırası R9.0–R9.5; R9.2'nin saf çekirdeği Codex'te. Kod yok.

**Önceki güncelleme:** v1.59 · 2026-11-17 — R8 uygulandı (R8.0–R8.6 ölçümü): Derekavak P2 sahne draw 398 → 68, gönderim 0,711 → 0,455 ms; StreamingBench HLOD 3,37 M → 1,64 M üçgen; landmark katmanı far değiştirmeden.

**Önceki güncelleme:** v1.58 · 2026-11-17 — R8.0–R8.3 uygulandı.

**Önceki güncelleme:** v1.57 · 2026-11-17 — R8 kararları ve uygulama planı (R8.0–R8.6): bundle kapalı, proxy'ler GPU yoluna girmez, slot düzeyinde kayıpsız materyal birleştirme, 4 × 4 ikinci HLOD katmanı, landmark katmanı ve far genişlemesi. Kod yok.

**Önceki güncelleme:** v1.56 · 2026-11-17 — R7 seçilebilir otomatik LOD altyapısı uygulandı ve iki arka uçta doğrulandı. Meshlet'e özel üretim kodu kaldırıldı; R6 araştırması korundu. v1.55'in R9a occlusion kararı değişmedi; R8 / R9 / R9a / R10 açık.

**Önceki güncelleme:** v1.45 · 2026-11-17 — Faz 5c adım 5: WebGL2 test arka ucunda GPU güdümlü batch'in CPU ikizi (kullanıcı kararı, `2544bdb`); çizim sayacı iki geçişli saydam materyalleri sayar. Mimari v1.45.

**Sürüm:** v1.34 · 2026-11-16 (v1.33’ten fark: World Settings genel gölge anahtarı ve tek Undo ile toplu nesne gölgeleri; Island sahne verisi korunur; mimari v1.37). v1.33 · 2026-11-16: Derekavak canlı kabulü; Island'da kamerayı izleyen koyu dörtgenin düzeltilmesi — ters derinlikte takip gölgesinin alt Z sınırı, kaynak geçişi ve GPU regresyonu; mimari v1.36. v1.32 · 2026-11-16: Faz 5a adım 8 teknik kapısı, A 957 / 1.021 ve görsel kabul adayları (mimari v1.35).

**Önceki sürümler:** v1.31 · 2026-11-15 (v1.30’dan fark: Faz 5a adım 7 tamam — WES v2 örtü / rüzgâr, simülasyonla birikim, A7 state, terrain katkısı, dokulu birikinti rüzgârı, içe aktarıcı değer karşılaştırması; kullanıcı kararları; SDK 0.1.12; mimari v1.34). v1.30 · 2026-11-15 (v1.29’dan fark: Faz 5a adım 6 tamam — su birikintisi: `forge.puddle` bileşeni, havza doldurma, TSL su, `reflector()` yansıması, editör ve içe aktarıcı; kullanıcı kararları: konum = tohum + seviye, terrain otomatik, rüzgâr adım 7’de, smoke dev kancasıyla; A 956 / 1.021; SDK 0.1.11; mimari v1.33). v1.29 · 2026-11-15 (v1.28’den fark: Faz 5a adım 5 tamam — G8 collider eşleşmesi: görsel yüksekliğin CPU ikizi Node’da Rapier’la, GPU geri okuması render smoke’unda; tam çözünürlükte ≤ 2,9 mm, GPU = CPU ikizi ≤ 0,8 mm; render 20 / 20; mimari v1.32). v1.28 · 2026-11-15 (v1.27’den fark: Faz 5a adım 4 tamam — `?debug` terrain haritası ve akış satırları (Forge’un `debugTerrainMap`’i, akışlar sahnedeki debug etiketinden), global harita / kaplama / ışın eşdeğerliği testleri (8 R), pick yüzeyinin far map’te datum hatası düzeltildi; render 17 / 17; mimari v1.31). v1.27 · 2026-11-15 (v1.26’dan fark: Faz 5a adım 3 tamam — terrain katmanları üretim kalitesinde: albedo ve normal dizileri (Forge’un `terrainLayerArray`’i), alfa’da pürüzlülük, katman normalleri, statik detay damgaları (TSL), deliklerin maskesi, half-float normaller, kalite kancaları (kendi üstüne gölge, uzak döşeme); 10 R yeniden yazıldı; render 17 / 17 referanslarla; mimari v1.30). v1.26 · 2026-11-15 (v1.25’ten fark: Faz 5a adım 2 tamam — terrain tile akışı (Forge’un `TerrainRuntimeStreaming`’i, akış çekirdeği 5b’den öne alındı, 19 A), çözme worker’da, global harita parçasından uzak alan, slot havuzu ve görüş + gölge frustum’u kesimi, hazır olma akışı bekler; A 953 / 1.021, 5b’de ertelenmiş 25; gerçek WebGPU render 17 / 17; mimari v1.29). v1.25 · 2026-11-15 (v1.24’ten fark: Faz 5 başladı — Faz 5 dökümü (29 INV satırı, ertelenen 60 A), 5a kararları 1–7 ve adım sırası 1–8 kullanıcı onayıyla; kıyı ıslaklığı ve kostik Faz 7’ye; 5b’nin ertelenen A sayısı 44 (view distance Faz 3’te taşınmıştı); Faz 6 bekliyor; mimari v1.28). v1.24 · 2026-11-15 (v1.23’ten fark: Faz 4 adım 10 ve kapanış — editör smoke tam seti (Forge’un `editor-authoring` karşılığı ve kapsamdaki editör smoke’ları, ortak `tests/editor/support.ts`), oyunun editör tarafı (INV-A32), kayıt sürerken meşgul Save, adım 9’un Windows testleri; kapı: 2.026 test, 66 editör + 1 dist smoke, gerçek WebGPU 66 / 66, Outliner 50.000 eşik içinde; bölüm `docs/archive/PHASE_4.md`’ye taşındı; mimari v1.27). v1.23 · 2026-11-15 (v1.22’den fark: Faz 4 adım 9 tamam — süreçler arası kayıt kilidi, ortak authoring modülü, `npm run forge -- edit` ajan komutları (A12), düzenleme işlemleri `src/engine/edit`'te, dosya olayları ve editörün canlı tazelenmesi; kullanıcı kararları 2026-11-15; "Ajan düzenleme komutları" kutusu kapandı; kapı 2.021 test, 57 editör + 1 dist smoke; mimari v1.26). v1.22 · 2026-11-15 (v1.21’den fark: Faz 4 adım 8 tamam — Play oturum katmanı (`.forge-session/<id>/`, `?play=<id>`, kaydetmez), level ve asset 409 akışı: şerit, alan düzeyinde üç yönlü Compare, Reload; kullanıcı kararları 2026-11-15; "Kaydet / aç, Open Level, Play" kutusu kapandı; kapı 1.985 test, 53 editör + 1 dist smoke; gerçek WebGPU 14/14, render 17/17; mimari v1.25). v1.21 · 2026-11-14 (kullanıcı kararı: WES + prosedürel bitki planı v0.6; 5a örtü, 5c ortak tepki ve küçük üretim, 5d tam araçlar; PV-WES kabul koşulları; yalnız plan, kutu kapanmadı; mimari v1.24). v1.20 · 2026-11-14 (v1.19’dan fark: Faz 4 adım 7 tamam — ortak asset oturumu / pencere, şemadan form + sanal tablo, materyal / model / aktör sınıfı araçları, tek GPU önizlemesi, sınıf override koruması; SDK 0.1.10; kapı 1.957 test, 47 editör + 1 dist smoke; gerçek WebGPU asset 8/8, render 17/17; mimari v1.23). v1.19 · 2026-11-14 (v1.18’den fark: Faz 4 adım 6 tamam — Content Browser 6a–g, motor içeriği kipi, motor level kayıt / 409, sınıf listesinin tazelenmesi; DOM panelleri kutusu kapandı; kapı yeşil: 1.946 test, 39 editör ve 1 dist smoke; mimari v1.22). v1.18 · 2026-11-14 (v1.17'den fark: Faz 4 adım 5 tamam — paneller: sanallaştırılmış Outliner (50.000 ölçümü), şemadan Details ve çoklu seçim, düzenleme işlemleri ve gruplama, Add Actor + sürükle-bırak, World Settings ve ortam ayrıntıları, kısayollar ve sağ tık menüsü; kullanıcı kararları 2026-11-14; SDK 0.1.7; mimari v1.21. v1.17 · 2026-11-14 (v1.16'dan fark: Faz 4 adım 4 tamam — gizmo (Forge'unki, sürükleme matematiği three'siz), araçlar ve snap widget'ları, zemin / duvar snap'i picker ışınlarıyla, pivot (kullanıcı kararı: aktör belgesinde `pivot`), instancing transform hızlı yolu; 11 R yeniden yazıldı; mimari v1.20. v1.16 · 2026-11-14 (v1.15'ten fark: Faz 4 adım 3 tamam — editör viewport'u: editör kamerası ve kipleri, çizim katmanı (sahne derinliğine karşı; pipeline'sız karede derinlik ön geçişi), ızgara, CPU picking ve seçim çerçevesi, View Mode / Show / Quality menüleri, `editorRender` bağlamaları ve ışığın yardımcıları; mimari v1.19. v1.15 · 2026-11-13 (v1.14'ten fark: Faz 4 adım 2 tamam — 2b üretim build'i (kullanıcı kararı: Faz 4), statik içerik, `verify:dist --strict`, alt dizin smoke'u; dist kutusu işaretli. v1.14 · 2026-11-13 (v1.13'ten fark: Faz 4 adım 2'nin dilimi — editörün World'ü (`inEditor`, kullanıcı kararı), `actorsChanged`, `editorRender` kuralı, editör oturumu, `?editor` kabuğu, editör smoke'u, `verify:dist`; kalan 2b üretim build'i. v1.13 · 2026-11-13 (v1.12'den fark: Faz 4 adım 1 tamam — UI kiti (`src/editor/ui`), `?editor-kit`, editörün tarayıcı denetimleri gate ve CI'da. v1.12 · 2026-11-13 (v1.11'den fark: Faz 4 başladı — döküm (36 INV satırı, ertelenmiş A yok, 11 R), kararlar 1–12 (kullanıcı onayı), adım sırası 1–10; mimari v1.16. v1.11 · 2026-11-13 (v1.10'dan fark: Faz 3 kapandı — adım 9: smoke tam seti Faz 0 pozu ve boyutuyla, Faz 0 ile yan yana ızgara (`npm run smoke:grid`), yönlü ışıkların dünya çerçevesi düzeltmesi; kullanıcının görsel kabulü ve referanslar; view distance 5b'ye (kullanıcı kararı); bölüm `docs/archive/PHASE_3.md`'ye taşındı; mimari v1.15. v1.10 · 2026-11-13 (v1.9'dan fark: Faz 3 adım 8 tamam — otomatik instancing, terrain salt çizimi, görüntüleyicinin varsayılan kamerası, `?debug` paneli, bütün çizen referans level'lar smoke'ta; kullanıcı kararları: terrain / örtü katman materyali GUID, paket manifesti `requires`, `?debug` kapsamı; referans projesi yeniden alındı; mimari v1.14. v1.9 · 2026-11-13 (v1.8'den fark: Faz 3 adım 7 tamam — olay bazlı gün saati: `timeTransition`, `WorldEnvironmentService.transitionTo` (`Promise<boolean>`, hep ileri), Sky Light yakalaması aynı PMREM'e, ölçülerek seçilen yakalama hızı (açı + 0,1 sn + durunca son yakalama), `npm run measure:sky-capture`; kullanıcı kararları; mimari v1.13. v1.8 · 2026-11-13 (v1.7'den fark: Faz 3 adım 6 tamam — `forge.postProcess`, `applyQualityToPostProcess`, TSL `RenderPipeline` (MRT 30 bayt, cihaz sondası), çıktı dönüşümü; kullanıcı kararları: gökyüzü kubbesi Post Process altında kendi pozlamasıyla, SSGI AO'nun yerine, pipeline'sız çizimde MSAA; referans projesi yeniden alındı; mimari v1.12. v1.7 · 2026-11-13 (v1.6'dan fark: Faz 3 adım 5 tamam — çevre:
`forge.skyAtmosphere` / `forge.skyLight` (arka plan ve ortam ışığı dahil,
kullanıcı kararı) / `forge.cloudLayer` / `forge.worldEnvironment` (sabit
saat), TSL gökyüzü + ay + yıldız, PMREM Sky Light, bulut, WES yorumu,
gökyüzü varken ACES; çeviriciler ve World Builder greybox görünümü;
`viewDistance` 5b'den öne alındı (10 A); mimari v1.11. v1.6: Faz 3 adım 4 tamam — şemalı
JSON asset türü, `forge.material`, model / texture / staticMesh / shape /
terrain sürüm 2, TSL materyal ve katkı sırası, materyal çeviricileri, starter
materyalleri, 4 A; Faz 3'te ertelenmiş A kalmadı; mimari v1.10. v1.5: Faz 3
adım 3 tamam — ışık
bileşenleri, CSMShadowNode + takipli gölge, ışık çevirisi, 18 A; statik gölge
varsayılanları bileşen başına (kullanıcı kararı); mimari v1.9. v1.4: Faz 3 adım 2 tamam — kalite
profilleri, uyarlamalı kalite, donanım ipuçları ve kullanıcı ayarları taşındı
(17 A), runtime kalite sürücüsü, GPU timer D, WebGPU izin alanları ve
merdiven dışı Cinematic; mimari v1.8. v1.3: Faz 3 adım 1, dikey dilim
tamam — renderer host, boot'un `render` aşaması, render bağlamaları, GUID
anahtarlı kaynak önbelleği, şekil / static mesh / Height Fog çizimi, render
smoke iskeleti; mimari v1.7. v1.2: Faz 3 başladı — döküm, içe
aktarıcı çeviricileri, tasarım kararları 1–11 ve adım sırası Faz 3 bölümünde,
kararlar mimari v1.6'da; HLOD 5b'de, terrain salt çizimi Faz 3'te, GPU timer
kontrolü D. v1.1: Faz 2b kapandı ve arşivlendi —
cut-over, alt sistemlerin taşınması, `tools/world`, içe aktarıcı, kayıt oyunu
ve World Partition'ın saf kısmı; ertelenen Forge kontrolleri faz kapılarında.
v1.0: ürün tezi ve kapsam ölçütü
(mimari §0.0) — K12 kapsam kararları: diyalog, AI yazım yığını (BT / State
Tree / EQS / Blackboard / Smart Object), Actor Script'in betik yüzeyi, ragdoll,
Sound Cue / ses bileşeni, hareketli platform, spline takipçisi, portallar
taşınmaz; karakter hareketi, takip kamerası, Recast navigasyonu, Player Start
taşınır; Faz 4'e genel veri editörü (A13) ve ajan düzenleme komutları (A12);
Faz 2b'de cut-over, test sınıflaması, Kenney kararı. v0.9: Faz 0 kapandı ve arşivlendi —
özellik envanteri, referans sahneler, WebGL baseline; Faz 1 GO ölçüt sayıları
G1–G9 kondu. v0.8: Faz 2a kapandı, ayrıntısı
`docs/archive/PHASE_2A.md`'ye taşındı; dist doğrulaması ve alt dizin yayını
testi Faz 4'e; plan belgesi düzeni: tek ana plan + faz kapanınca arşiv. v0.7:
K10, K11, A10, A11 karara
bağlandı, dördü de öneri olduğu gibi. v0.6: belge incelemesi işlendi — açık
kararlar K10–K11 ve A10–A11 eklendi; Faz 0'a özellik envanteri ve GO sayıları,
Faz 1 S4'e compute culling prototipi, 2a'ya 50.000 aktör ölçümü ve DOM'suz
Details tanımı, 2b'ye test sınıflaması ve içe aktarıcı kabulü girdi; Faz 5
5a–5d'ye bölündü; adı geçmeyen alt sistemler fazlara atandı; §11 ilerleme kaydı
açıldı. v0.5: K2, K4–K9 karara bağlandı. v0.4: depoya taşındı, A1–A9 işlendi,
Faz 1 ∥ 2a, cut-over 2b'ye kaydı)
**Durum:** Bütün kararlar kapalı (K1–K11, A1–A11; 2026-11-10). Faz 2a kapandı
(2026-11-11; [arşiv](../archive/PHASE_2A.md)). Faz 0 kapandı (2026-11-11;
[arşiv](../archive/PHASE_0.md)): envanter, referans sahneler, WebGL baseline,
GO sayıları. Faz 1 spike'ı S1–S4 ile tamamlandı; **GO (koşullu, kullanıcı kararı
2026-11-11):** GPU güdümlü foliage 5c'de zorunlu, G6 orada yeniden ölçülür. S5
yapılmadı (Faz 9'a, kullanıcı kararı). Faz 1 [arşivde](../archive/PHASE_1.md). Faz 2b
kapandı (2026-11-12; [arşiv](../archive/PHASE_2B.md)). Faz 3 başladı (2026-11-12):
döküm ve tasarım kararları onaylandı, sırada adım 1 (dikey dilim).
**Ürün tezi ve kapsam ölçütü:** [mimari §0.0](FORGE_WEBGPU_ARCHITECTURE.md);
kapsam kararları §8 K12.
**Belge düzeni:** tek ana plan; biten fazın ayrıntısı faz kapanınca
[`docs/archive/`](../archive/INDEX.md)'e taşınır. Kısa mimari harita:
[`docs/architecture/ARCHITECTURE.md`](../architecture/ARCHITECTURE.md);
taşıma günlüğü: [`docs/PORT_LOG.md`](../PORT_LOG.md).
**Mimari:** [FORGE_WEBGPU_ARCHITECTURE.md](FORGE_WEBGPU_ARCHITECTURE.md) —
veri modeli, katmanlar, özellik modülleri, oyun projesi sözleşmesi. Bu plan
fazların sırasını, o rapor yapının kendisini tanımlar; çelişkide rapor geçerlidir.
**Yerini aldığı belge:** `FORGE_WEBGPU_EDITION_MASTER_PLAN.md` (v0.1; Forge
deposunda `C:\Users\emret\Desktop\Forge\docs\planned\`). v0.1 aynı
depoda ikinci bir editör öneriyordu; 2026-11-10 kararıyla hedef değişti. v0.1'in
geçerli ilkeleri §2 ve §9'a taşındı.
**Ölçüm tabanı:** Forge `main` @ `0396ad79`, `three@0.187.0` (npm'deki en son
sürüm, 2026-10-30). Mimari raporun ölçümleri 7 commit sonrasında, `b2efc208`'de
alındı; iki belge arasındaki birkaç satırlık farklar (ör. `SceneApp` 16.375 /
16.379) bundandır.

> **Hedef:** Açık dünya oyunlarında daha iyi görsel kalite. Forge (WebGL) bakım
> moduna geçer ve basit projeler için kullanılmaya devam eder. Forge WebGPU,
> Forge'un mimarisini referans alan ayrı bir depoda kurulur. World Builder, araç
> hasarı ve terrain deformasyonu oraya taşınır. three.js'in WebGPU örnekleri ve
> addon'ları (SSR, SSGI, TRAA, LightProbeGrid, LightMapper, ClusteredLighting,
> MeshletDrawingPipeline…) uyarlama gerekmeden kullanılabilir hâle gelir.

---

## 1. "Yeniden inşa" neyi kapsıyor — ölçülmüş tablo

Forge'un mimari sınırları (`verify:imports`) işe yaramış: `engine/` altında
`render-three` dışındaki 23 dizinin hiçbiri three.js import etmiyor (tek istisna
bir fizik dosyası). Bu yüzden yeniden inşa her şeyi sıfırdan yazmak değil; üç
ayrı işlem:

- **Taşı:** olduğu gibi kopyala, testleriyle doğrula.
- **Uyarla:** three çekirdek sınıfları (`Mesh`, `Object3D`, `BufferGeometry`…)
  WebGPU tarafında aynı; yalnız renderer'a dokunan yerler değişir.
- **Yeniden yaz / kur:** GLSL, `onBeforeCompile`, `EffectComposer`, WebGL render
  target'ları ve büyük orkestratör sınıfları.

| Katman | Boyut | three bağımlılığı | İşlem |
|---|---|---|---|
| `engine/*` alt sistemleri (ai, physics, terrain, navigation, movement, audio, dialogue, behavior, worldbuilder algoritmaları, environment, perf, animation, assets, input, loading, perception, ui, vfx, gameplay, core) | ~53.000 satır | yok | **Taşı** (`engine/assets` manifesti A10'a göre yeniden kurulur) |
| `engine/scene`, `engine/persistence`, `engine/world` (level veri modeli, kayıt oyunu, hücreler) | ~17.000 satır | yok | **Yeniden tasarla** (mimari §4.4–4.6); algoritmalar korunur |
| `tools/` (World Builder betikleri, doğrulayıcılar) + `builder/` | ~44.700 satır | 3 dosya | **Taşı**; `saveValidator.ts` (4.640 satır) şema kaydıyla yer değiştirir |
| `tests/engine` | 176 dosya, ~42.000 satır | — | Modülüyle birlikte **taşı**; `check()` → Vitest `test()`, modülün yanına (mimari A5). Yeniden tasarlanan `scene` / `persistence` / `world` modeline dayanan testler mekanik çevrilmez, yeniden yazılır (2b başında sınıflanır) |
| `vite.config.ts` dev endpoint'leri | 2.632 satır | — | **Kısmen taşı**, modüllere bölerek; 20'den fazla `/__save-*` ucu taşınmaz, şemaya göre çalışan genel uç ailesiyle yer değiştirir (mimari §4.6) |
| `engine/render-three` | 113 dosya, ~23.300 satır | 101 dosya; 42'si WebGL'e özgü | 42 dosya **yeniden yaz** (TSL); kalanı **uyarla** |
| `src/scene` (`SceneApp` 16.375, `RuntimeSceneApp` 7.182 satır) | 83 dosya, ~40.800 satır | 34 dosya | **Yeniden kur** — referans alınır, büyük sınıflar bölünür |
| ↳ `src/scene/capabilities` (runtime modülleri) | 30 dosya, ~7.500 satır | 11 dosya | **Uyarla** |
| `src/editor` (DOM panelleri) | 88 dosya, ~38.800 satır | 14 dosya; 6'sı WebGL'e özgü | **Uyarla** — `SceneApp` bağımlılığı (26 dosya) yeni servislere |

Kodun yaklaşık yarısı olduğu gibi taşınır. Asıl yeni iş: mimari iskelet (veri
modeli, şema kaydı, kayıt servisi, özellik modülleri), render katmanı, uygulama
kabuğu (editör + runtime orkestrasyonu) ve editör viewport'u.

### 1.1 Değerli sistemler bu ayrımda nereye düşüyor

| Sistem | Three'siz çekirdek (taşınır) | Yeniden yazılacak / uyarlanacak render parçası |
|---|---|---|
| World Builder | `engine/worldbuilder` (47 dosya, ~12.600 satır), `tools/world` (~2.900 satır, CLI dahil) | Render parçası yok; level yazan çıktı katmanı yeni formata, editör penceresi (`panels/world`, ~1.600 satır DOM) yeni editöre uyarlanır |
| Terrain deformasyonu | `deformationField`, `deformationStateCodec`, `terrainHeightQuery`, `terrainDeformationModule` | `terrain/terrainDeformation.ts` (556 satır, GLSL) → TSL/compute |
| Araç hasarı | `physics/deformable`, `physics/fracture` (~2.000 satır, Voronoi bake dahil) | `dentWear.ts` (101 satır, GLSL) → TSL; `deformableMeshSync`, `fractureGeometry`, `deformablePartNodes` uyarlanır |
| Araç fiziği | `engine/physics` (Rapier, ~8.500 satır) | Tekerlek görseli uyarlanır |

Bu üç sistemin değeri neredeyse tamamen three'siz çekirdekte. Faz 2b'de
taşınırlar; görsel parçaları ilgili fazda bağlanır.

---

## 2. Mimari ilkeler (Forge'dan alınan dersler)

1. **Aynı katman sınırları, ilk günden zorunlu.** `core` ve `engine` three'siz
   kalır; `render` katmanı (ve özelliklerin `render.ts` dosyaları) `three/webgpu`
   ve `three/tsl` import eden tek yerdir; editör dinamik import arkasındadır ve
   oyun bundle'ına girmez; yeniden kullanılabilir oyun çatısı `gameplay`
   katmanındadır, oyuna özel kod oyunun deposunda (mimari §4.2, §4.8). Katman
   denetimi (dependency-cruiser + öz-test, mimari A3) ilk commit'te kurulur;
   `verify:dist --strict` editör build'iyle (Faz 4).
2. **Tanrı nesnesi yok.** `SceneApp` ve `RuntimeSceneApp` yeniden üretilmez.
   Editör küçük servislere bölünür: viewport host, seçim, transform aracı,
   kayıt, içerik. Runtime, `FORGE_LAYERED_RUNTIME_PLAN`'daki LevelRuntime +
   capability modülü düzenine kurulur. Editör ve oyun sahneyi aynı kurucuyla
   inşa eder; "editörde başka, oyunda başka" görüntü olmaz.
3. **Materyal sözleşmesi.** Işık alan her yüzey `MeshStandardNodeMaterial` /
   `MeshPhysicalNodeMaterial` slotları (`colorNode`, `normalNode`,
   `positionNode`, `roughnessNode`…) üzerine kurulur. `fragmentNode` yalnız
   ışıksız yardımcı pass'lerde kullanılır: r187'de `fragmentNode` MRT
   çıktılarını atlıyor (`NodeMaterial.js` setup), TRAA/SSR/SSGI ise bunlara
   dayanıyor.
4. **Tek render pipeline, kalite profilleri.** Tek `RenderPipeline`: MRT'li
   sahne pass'i → GTAO / SSR / SSGI → TRAA → bloom / DoF → tonemap. Her efekt bir
   profil anahtarıdır (Compatibility / Balanced / Cinematic). three addon'ları
   kendi ince sarmalayıcı modüllerimizin arkasında kullanılır; deneysel API
   değiştiğinde tek yer düzelir.
5. **Ölçek için GPU tarafı.** Açık dünyada WebGPU'nun asıl kazancı: instancing /
   `BatchedMesh`, foliage ve prop'lar için compute culling + indirect draw;
   okyanus FFT'si, partiküller ve terrain deformasyonu için compute.
6. **Gerçek WebGPU doğrulaması** (v0.1 ADR-005). `renderer.backend.isWebGPUBackend`
   kontrol edilir; WebGL2 backend'ine sessiz düşüş "WebGPU çalışıyor" sayılmaz
   ve ekranda gösterilir.
7. **Yeni tek tip veri formatı + tek yönlü içe aktarıcı.** Level, tek tip aktör
   ve şemalı bileşen modeliyle yazılır (mimari §4.4–4.5); her şey kalıcı GUID
   taşır. Forge WebGL level'ları ve sidecar'ları (`*.vehicle.json`,
   `*.fracture.json`, `*.deformable.json`, `*.effect.json`, `*.skeleton.json`,
   terrain, world / foliage hücreleri) `tools/import-forge-webgl` ile bir kez
   çevrilir; çevrilemeyen alan sessiz düşmez, raporlanır. Terrain tile'ları
   gibi ikili veri olduğu gibi kalır. İki formatı birlikte yaşatmak hedeflenmez.
8. **Eşzamanlı kayıt koruması ilk günden.** Forge WebGL'de layout kaydında sürüm
   kontrolü yok (mevcut 409'lar yalnız içerik oluştururken var olan dosyayı
   korur). Yeni dev server her yazmada temel sürümü kontrol eder.
9. **Görünüm ayarı kullanıcıda.** Claude sistemleri kurar ve parametreleri
   editöre açar; ışık / renk / efekt ayarını ve görsel kabulü kullanıcı yapar.
10. **Ölçüm disiplini** (v0.1 §7.2). Her performans ölçümü şunlarla kaydedilir:
    commit, three sürümü, backend kanıtı, tarayıcı, GPU + sürücü, sahne + kamera
    pozu, çözünürlük + DPR, profil, medyan / p95 kare süresi, GPU süresi, draw
    call. Yükleme ölçümlerinde ayrıca: level yükleme süresi (soğuk / sıcak),
    pipeline / shader derleme süresi ve ölçülebiliyorsa GPU bellek kullanımı;
    yeni sekme Play'in soğuk başlangıcı (mimari A6) bu formatta ölçülür.
    Ölçülmeyen şey "ölçülmedi" yazılır; CPU süresi GPU süresi diye sunulmaz.
11. **Algoritmalar olduğu gibi, iskelet yeniden.** Fizik, terrain verisi, AI,
    nav, hareket, ses, diyalog ve World Builder algoritmaları taşınırken
    tasarımları değiştirilmez; eşdeğerliği testler kanıtlar. Veri modeli,
    serileştirme, kayıt, uygulama kabuğu ve editör ise mimari rapora göre
    yeniden tasarlanır. Taşınan modülde iyileştirme ayrı bir adımdır.

---

## 3. Forge WebGL'in geleceği

- **"Arşiv" = bakım modu**, GitHub'ın salt okunur arşivi değil. Model 1 oyunları
  (minigolf, miniracer, platformer, freshcounter) upstream'den hata düzeltmesi
  çekmeye devam eder; WebGPU'ya geçişleri oyun başına ayrı karardır. Ridgebound
  (Model 2) göç edene kadar Forge WebGL'de kalır.
- Cut-over'da (Faz 2b başı; 2026-11-10 kararıyla 2a'dan kaydı)
  `forge-webgl-final` etiketi atılır; `CLAUDE.md` ve README'ye bakım modu notu
  eklenir. Sonrasında yalnız hata düzeltmesi. Etiket, algoritmaların kopyalandığı
  Forge commit'ini işaretler; kopyalama 2b'de başladığı için etiket de orada atılır,
  böylece 2b'ye kadar Forge WebGL'de biten three'siz işler etikete girer.
- **K6 kuralı (karar 2026-11-10):** Faz 1 GO'ya kadar `engine/render-three`'ye
  yeni iş yalnız şu üç koşulla girer: oyunun şu anki bir kilometre taşı istiyor;
  algoritma / parametre kısmı three'siz `engine/` modülünde ve shader ince; yeni
  `onBeforeCompile` yaması ve WebGL görsel kabul cilası yok. GO'dan sonra yalnız
  hata düzeltmesi yapılır; bu katman yeniden yazılacak. NO-GO çıkarsa kural
  kalkar. Three'siz sistemler (World Builder, fizik, terrain verisi,
  save-game) cut-over'a kadar Forge WebGL'de gelişmeye devam edebilir;
  cut-over'da olduğu gibi taşınırlar.

### 3.1 Devam eden işler için öneri

| İş | Öneri |
|---|---|
| World Builder ada + okyanus (çalışma ağacında, commit'lenmemiş) | Generator tarafı (`engine/worldbuilder`, `tools/world`) bitirilip commit'lenir; okyanus shader'ına yeni yatırım yapılmaz (WebGPU'da compute ile yeniden yazılacak) |
| Terrain deformasyonu Faz 5 (kalıcılık) | Three'siz; Forge WebGL'de bitebilir, taşınır |
| Terrain deformasyonu Faz 6 (editör yüzeyi) | Forge WebGPU Faz 8'e devredilir |
| Araç hasarı / Doruk K-180 form ve içerik işi | Motordan bağımsız; sürer |
| WebGL görsel kabulleri (RDR2 su, deformable Faz 7, WES) | Kapatılır; kabul WebGPU'da verilir |
| Adaptif kalite planı | WebGPU kalite profillerine (§2.4) devredilir |
| Editör UI redesign planı | Plan dosyası Forge'da 2026-07-15'te kaldırıldı (`11bb20e9`); bir kısmı panellere işlendi. Forge WebGPU'da paneller bugünkü hâliyle taşınır (K7) |

---

## 4. Faz planı

Büyüklükler görelidir (S < M < L < XL); süre tahmini değildir.

| Faz | Amaç | Büyüklük | Bağımlılık | Kapı |
|---|---|---|---|---|
| 0 | Kararlar + özellik envanteri + referans görüntüler | S | — | §8 kararları kayıtlı; envanter çıktı; WebGL baseline alındı; GO sayıları kondu |
| 1 | Doğrulama spike'ı (Forge `spikes/webgpu/`) | M | 0 (2a ile paralel) | **GO / NO-GO** kullanıcı kararı |
| 2a | Mimari iskelet: veri modeli, şema kaydı, kayıt servisi, özellik modülleri, SDK, sınır zorlaması | L | 0, A10, A11 (1 ile paralel) | İlk özellik (Height Fog) iskeletten uçtan uca geçiyor; 50.000 aktör ölçümü eşik içinde; CI yeşil |
| 2b | Cut-over (`forge-webgl-final`) + three'siz alt sistemlerin taşınması + Forge WebGL içe aktarıcısı | M | 2a, 1 (GO) | Taşınan testler yeşil; referans level'lar çevrildi, içe aktarma raporu ve sayım karşılaştırması temiz |
| 3 | Render çekirdeği + level görüntüleyici | L | 2b | Referans sahnelerde ilk görsel kabul |
| 4 | Editör çekirdeği | L | 3 | Editör smoke'u (yerleştir / taşı / undo / kaydet / yeniden aç) |
| 5 | Açık dünya: 5a terrain, 5b akış + HLOD, 5c foliage, 5d editör araçları + World Builder penceresi | XL | 3, 4 | Alt faz başına kapı; sonda açık dünya sahnelerinde görsel + performans kabulü |
| 6 | Oyun runtime'ı + araçlar + Ridgebound pilotu (K8) | L | 3; araç kapısı için 5a (5b–5d ile paralel yürüyebilir) | Runtime smoke'u; araç terrain üstünde sürülüyor; pilot kopya `check:projects`'te yeşil |
| W | Hava: yağış, ıslanma / kuruma, su birikintisi, kar yüksekliği | L | 5 (6 ile paralel yürüyebilir) | HV-01–13 ve görsel kabul |
| 7 | Su ve yansımalar | L | 5 | Su görsel kabulü |
| 8 | Terrain deformasyonu + araç hasarı | L | 5, 6 | Ridgebound kopya sahnesinde senaryolar |
| 9 | İleri aydınlatma (her teknik ölçümle) | M–L | 5 | Teknik başına ölçüm + kullanıcı kararı |
| 10 | Ridgebound göçü + sürüm | M | 8 | Ridgebound Forge WebGPU'da tam akışla çalışıyor |

Sıranın mantığı: en büyük bilinmeyen (WebGPU açık dünyada istenen kaliteyi kabul
edilebilir maliyetle veriyor mu?) en başta, ucuz bir spike'la cevaplanır. Mimari
iskelet (2a) taşımadan ve render'dan önce gelir, çünkü Forge WebGL'de sonradan
düzeltilen kararların çoğu (veri modeli, kimlik, kayıt, kayıt noktaları) en başta
verilmesi gereken kararlardı. **Faz 1 ile 2a paralel yürür** (karar 2026-11-10):
2a'nın işi (aktör modeli, şema, kayıt servisi, SDK, katman denetimi) three'siz ve
renderer'dan bağımsızdır; spike NO-GO çıksa da iskelet korunur ve `render` katmanı
klasik `WebGLRenderer` ile kurulur (K10). GO / NO-GO kapısı 2b'nin, yani
cut-over'ın önündedir.
Görsel
kalite (Faz 3) editörden önce gelir, çünkü projenin amacı o. Editör (Faz 4) açık
dünya araçlarından önce gelir, çünkü sculpt / paint / foliage / World Builder ve
görünüm ayarı onun üstünde çalışır.

### Faz 0 — Kararlar ve referans görüntüler (kapandı 2026-11-11)

Ayrıntı: [docs/archive/PHASE_0.md](../archive/PHASE_0.md). K1–K11 (§8) ve
A1–A11 (mimari §8) kapalı; K6 kuralı yürürlükte (§3). Forge özellik
envanteri [`docs/PORT_LOG.md`](../PORT_LOG.md) §1'de (234 satır, her satırda
faz). Referans sahneler (OpenWorldTest, Island, WbPilotValley, Derekavak
kopyası; sahne başına 3 poz) depo dışı `Games/ForgeReference` projesinde.
WebGL baseline R1'de ölçüldü: Derekavak GPU'ya bağlı (~15–17 ms, ~1.800 draw
call), Island CPU'ya bağlı (~6 ms); tablo arşivde. GO sayıları (G1–G9)
[Faz 1 arşivinde](../archive/PHASE_1.md).

### Faz 1 — Doğrulama spike'ı (kapandı 2026-11-11, GO)

Ayrıntı: [docs/archive/PHASE_1.md](../archive/PHASE_1.md) (S1–S4 sonuçları,
GO ölçütleri G1–G9 ve sonuç tablosu, yöntem notları). Spike Forge
`spikes/webgpu/`'de, kayıtlar `Games/ForgeReference/baseline/spike/`.

- **Karar: GO, koşullu (kullanıcı, 2026-11-11).** WebGPU yolu sürer, K10'un
  NO-GO yolu kapanır. Koşul: GPU güdümlü foliage bütün türlerde ve gölge
  kaskatlarında zorunlu (5c); G6 (Derekavak P2, 60 Hz: render gönderimi
  ≤ 3 ms, ana iş parçacığı ≤ 6 ms) 5c kapısında yeniden ölçülür.
- **Sonuç:** G1 (terrain 18 / 18, gerçek içerik 6 / 6; kare oranı ≤ 0,86), G2
  (≤ 6,83 / 14 ms), G3 (≤ 11,51 / 16,6 ms), G5 (327 / 212 draw call), G7, G8
  (≤ 4,9 mm) geçer. G6: ana iş parçacığı geçer, render gönderimi 3,9 ms
  (sınır 3) GO koşuluna bağlandı. G4 yalnız rapor. G9: GO yan yana
  görüntülerle verildi, ayrı not yok. S5 yapılmadı (Faz 9).
- **Profiller (S3):** Balanced = TRAA + GTAO (tam çözünürlük, birleştirmede)
  + bloom (level yazmışsa) + SSR yarım çözünürlükte (level seçmişse);
  Cinematic = SSGI + SSR tam. Profil efekti zorla açmaz, izin verir.
- **Yansıma (kullanıcı kararı):** genel yansıma SSR (Post Process
  `reflection: off | ssr`, Faz 3); düz yüzeyler planar (Faz 7); sphere
  reflection capture taşınmaz.
- **Sonraki fazlara taşınan bulgular:** beş MRT hedefi WebGPU'nun varsayılan
  renk eki sınırını (32 bayt / örnek) aşar (Faz 3); WebGPURenderer'ın CPU
  maliyeti ~1,3 ms sabit + draw call başına ~8 µs (5c); r187'de compute
  culling + `drawIndexedIndirect` doğru çiziyor (5c); `CSMShadowNode`'a kamera
  elle verilmez; renk çıkışı negatifleri 0'a kırpar.

### Faz 2a — Mimari iskelet (kapandı 2026-11-11)

Ayrıntı: [docs/archive/PHASE_2A.md](../archive/PHASE_2A.md); kararlar mimari
raporda (§4.3–4.8). Kuruldu: depo + katman denetimi ve öz-testi, şema DSL'i ve
kaydı, `forge.level/1` aktör + bileşen modeli, asset modeli (A10), hücre
modeli (A11), kayıt servisi, uygulama kabuğu, oyun projesi sözleşmesi ve SDK,
depo düzeni (motor içeriği, content pack'ler), `npm run gate` + CI. Kapı:
Height Fog iskeletten uçtan uca geçiyor; 50.000 aktör ölçümü eşik içinde
(R1); CI yeşil (`a77587a`'ya kadar, kullanıcı teyidi). Dist doğrulaması ve
alt dizin (`base`) yayını testi Faz 4'e taşındı.

### Faz 2b — Cut-over, alt sistemlerin taşınması ve içe aktarıcı (kapandı 2026-11-12)

Ayrıntı: [docs/archive/PHASE_2B.md](../archive/PHASE_2B.md); kararlar mimari
raporda (§0.0 K12, §4.4, §4.6, §4.8; v1.2–v1.5), modül başına kayıt
[`docs/PORT_LOG.md`](../PORT_LOG.md) §2. Yapıldı: cut-over (Forge
`forge-webgl-final` = `04b5fb23`, bakım modu); test sınıflaması
(`npm run port:forge-tests`); three'siz alt sistemlerin taşınması (ses, UI,
input, zaman, iş bölme, perf, physics + kırılma / göçük algoritmaları, terrain,
navigation, movement, behavior, environment, loading, perception, vfx,
worldbuilder); `tools/world` (`world:random` / `world:brief` yeni level
formatıyla); Forge WebGL içe aktarıcısı ve kabulü (`import:forge`, starter
paketi, depo dışı referans projesi `Games/ForgeReference/webgpu-scenes`);
kayıt oyunu (`src/core/save`, `forge.saveGame/1`, `persist` / `state` /
`defineSaveState`, durum defteri) ve World Partition'ın saf kısmı (tek dünya
ızgarası `src/core/grid`, hücre yerleşim planlayıcısı). Sonuç: **A 885 / 1.022**
taşınan Forge kontrolü yeşil; geri kalanı fazına yazılı ve o fazın kapısında
(Faz 3 40, 5a 4, 5b 54, 5c 8, 5d 4, Faz 6 5, Faz 7 20, Faz 8 2; TSV `deferred`
sütunu). Geçiş iskeleleri `src/engine/testing/` ve `src/engine/legacy/` Faz 6'da
silinir. Faz 6'ya açık soru: Player Start kalıcı katmanda mı. CI `4d844ce`'ye
kadar yeşil (kullanıcı teyidi).

### Faz 3 — Render çekirdeği ve level görüntüleyici (kapandı 2026-11-13)

Ayrıntı: [docs/archive/PHASE_3.md](../archive/PHASE_3.md) (döküm, içe aktarıcı
çeviricileri, kararlar 1–11, adım 1–9, kutular); kararlar mimari raporda (§4.3,
§4.6–§4.10; v1.6–v1.15), modül başına kayıt [`docs/PORT_LOG.md`](../PORT_LOG.md) §2.
Kuruldu: `src/render` (WebGPU renderer host: backend kanıtı, DPR, cihaz kaybı v1,
timestamp; GUID anahtarlı kaynak önbelleği; `render.ts` bağlamaları host toplar),
kalite merdiveni + uyarlamalı kalite + WebGPU izin alanları (Cinematic merdiven
dışı), `forge.light` + kaskatlı güneş (`CSMShadowNode`) / takipli gölge, şemalı
JSON asset türü ve `forge.material` (TSL slot düğümleri), gökyüzü / Sky Light (PMREM)
/ bulut / World Environment, olay bazlı gün saati (`transitionTo`, ölçülen yakalama
hızı), TSL `RenderPipeline` + Post Process + MRT 30 bayt, görüntüleyici (otomatik
instancing, TSL CDLOD terrain salt çizimi, varsayılan kamera, `?debug`); içe
aktarıcının Faz 3 çeviricileri ve yeniden alınan referans projesi; render smoke'u
(15 çekim, Faz 0 pozu ve boyutu) ve Faz 0 ile yan yana ızgara (`npm run
smoke:grid`). Kapı (2026-11-13): **A 934 / 1.021**, Faz 3'e ertelenmiş A yok;
kullanıcının ilk görsel kabulü verildi, referans görüntüler yazıldı. View distance
5b'ye taşındı (kullanıcı kararı). Bilinen farklar sonraki fazlarda: foliage 5c,
su 7, araçlar 6 / 8.

### Faz 4 — Editör çekirdeği (kapandı 2026-11-15)

Ayrıntı: [docs/archive/PHASE_4.md](../archive/PHASE_4.md) (döküm, kararlar 1–12,
adım 1–10, kutular); kararlar mimari raporda (§4.2, §4.3, §4.6–§4.11; v1.16–v1.27),
modül başına kayıt [`docs/PORT_LOG.md`](../PORT_LOG.md) §2. Kuruldu: UI kiti
(`src/editor/ui`, `?editor-kit`), `?editor` kabuğu ve editör oturumu (`actorsChanged`,
undo / redo, kayıt), viewport (`src/render/editor`: editör kamerası, çizim katmanı,
picking, seçim çerçevesi, menüler), Forge'un gizmo'su (three'siz sürükleme matematiği),
snap ve pivot, paneller (sanallaştırılmış Outliner, şemadan Details, World Settings, Add
Actor, kısayollar), Content Browser (küçük resim, referans güvenli işlemler, import,
motor içeriği kipi), asset editörleri (genel veri editörü A13 + önizlemeler), Play
oturum katmanı ve 409 Compare / Reload, ajan komutları `npm run forge -- edit` (A12)
ve editörün canlı tazelenmesi, oyunun editör tarafı (`virtual:forge/game-editors`),
üretim build'i ve alt dizin yayını. Kapı (2026-11-15): Forge'un `editor-authoring`
karşılığı ve editör smoke tam seti (66; gate ve CI'da `forceWebGL`, yerelde
`npm run smoke:editor:webgpu` gerçek WebGPU'da 66 / 66), `verify:dist --strict` ve
`smoke:dist`, Outliner 50.000 aktörde eşik içinde, A12 kabulü; **A 934 / 1.021**.
Sonraki fazlara kalanlar: Details'in fizik / nav bölümleri ve çarpışma görünümü (6),
su (7), kırılma (8), view distance (5b), UI widget editörü kararı (Faz 6 başı).

### Faz 5 — Açık dünya (kapandı 2026-11-25)

Ayrıntı: [docs/archive/PHASE_5.md](../archive/PHASE_5.md) (5a–5d dökümleri, kararlar,
adımlar, ölçümler, kutular); kararlar mimari raporda (§4.4, §4.6, §4.9; v1.28–v1.82),
modül başına kayıt [`docs/PORT_LOG.md`](../PORT_LOG.md) §2. Kuruldu: **5a** terrain
(CDLOD, morph, akış, 8 katman, su birikintisi, WES örtüsü ve rüzgâr, G8), **5b** hücre
akışı ve HLOD, **5c** GPU güdümlü foliage, impostor, bölgeler, statik batch yolları,
üretilmiş bitkiler (PG0–PG3) ve mevsim tepkisi, **5d** Landscape kipleri (sculpt, paint,
spline, heightmap, World Terrain), Foliage fırçası, World Builder penceresi, PG5 editörü.
Kapı (2026-11-25): 2.733 test, editör seti WebGL ve gerçek WebGPU'da 99 / 99, terrain /
akış / foliage / orman ölçümleri sınırın içinde, G8 2,93 mm; kullanıcı kabulü aynı gün.
World Builder örtüleri bitki planında kapandı (PG5b adım 6, 2026-11-26).

### Faz W — Hava: yağış, ıslanma, kar

**Açıldı 2026-11-25 (kullanıcı; yalnız plan, kod yok).** Yağmur ve kar yağar;
yüzeyler yağdıkça ıslanır ya da karlanır, çukurlarda su birikir, terrain'de kar
yükselir; yağış kesilince hepsi zamanla geri döner. Faz 6'yı beklemez: yağış,
6c'nin genel partikül sisteminden ayrı, kamerayı izleyen tek bir çizimdir.

**Mevcut durum (kod, 2026-11-25).** Hazır: hava türü ve şiddeti
(`forge.worldEnvironment@2` `weather`), ortak rüzgâr (`resolveWorldWind`), örtü
durumu ve birim zamanlı oranlar (`surfaceAccumulation`), A7 canlı durum, terrain
ve bitkide kar / ıslaklık, `forge.puddle`, kalite profilinde `particleDensity`.
Eksik:

| Eksik | Bugün |
|---|---|
| Yağış | `rain` / `snow` yalnız gökyüzü, sis, bulut, güneş ve rüzgârı değiştirir |
| Hava geçişi | `setWeather` anında; saat ve mevsimin zamanlı geçişi var |
| Hava → yüzey | Örtü hedefleri havadan bağımsız (5a kararı) |
| Statik mesh örtüsü | `createSurfaceCover`'ı yalnız terrain kurar; katkı sırasında `wetness` yuvası hazır |
| Dikey / korunaklı yüzey | Islaklık tek sayıdır; eğim ve çatı bilmez |
| Su birikimi | `forge.puddle` yalnız elle yerleşir, seviyesi sabittir |
| Kar yüksekliği | Kar yalnız renk ve pürüzlülüktür |

**Kapsam (kullanıcı, 2026-11-25).**

1. Yağış görseli (yağmur, kar; aynı çizimle karışım).
2. Zamanlı hava geçişi.
3. Çatı altında kesilme.
4. Statik mesh'te kar / ıslaklık (kaya, çatı, yol).
5. Yağışla zamanla ıslanma ve karlanma; dikey yüzey zemin kadar ıslanmaz.
6. Belli alanlarda zamanla su birikimi; yağmurda üzerinde halkalar.
7. Yağış kesilince kuruma: önce düz zemin, sonra su birikintileri; karın kalkması.
8. Terrain'de kar yüksekliği zamanla gerçekten artar. Statik mesh'te kar şimdilik
   yalnız beyaz görünür.
9. Terrain'in yüzey fiziği boyandığı gibi sabit kalmaz, yağışla zamanla değişir
   (grass karlanınca kar fiziği; çamur, göl ve göl tabanı karlanmaz, değişmez).
   Araç karda batar; kar kalkınca zemin eski hâline döner (iz ve batma Faz 8).

**Kapsam dışı.** Statik mesh'te kar kalınlığı; karda iz ve batma (Faz 8), küreme;
statik mesh'in (yol) yüzey fiziği; bölgesel hava; otomatik takvim ve kural tabanlı hava; dolu,
şimşek, fırtına; donma / buz; sıçrama parçacıkları, oluk ve damlama; ekranda
damla; göl, nehir ve okyanusta halka (halka düğümü hazır olur, Faz 7 bağlar);
yağmur sesi (6c); hareketli cisim üstünde birikim.

#### Tasarım

**1 · Yağış.** Yeni özellik `features/precipitation` (bileşensiz; WES'i okur) ve
`render/materials/precipitation.ts`. İki iç içe hacim (yakın / uzak), hacim başına
tek instanced çizim; tane konumu vertex shader'da tohum + simülasyon zamanı +
rüzgârdan, hacim içinde sarılır. Yağmur hız yönünde uzatılmış çizgi, kar dönen
küçük sprite; güneş / ortam ışığı ve sis uygulanır. Adet = şiddet ×
`particleDensity`. Pause'da durur. Planar yansımaya, Sky Light yakalamasına,
gölgeye ve asset önizlemesine girmez. *Açık risk:* TRAA hızlı saydam çizgide iz
bırakabilir; W1 önce iki yolu dener (TRAA'dan sonra derinlik testli ayrı pass /
sahne pass'inde), ölçüm ve çekimle seçer.

**2 · Hava geçişi.** `transitionWeather({ preset, intensity, seconds })` →
`Promise<boolean>`; kuralları `transitionTo` / `transitionSeason` ile aynı (yeni
geçiş öncekini `false` ile bitirir, süresiz istek anında). Önceki ve hedef havanın
etkenleri karışır; yağmur ve kar şiddeti ayrı iki sayıdır (`rain`, `snow`, 0–1),
kar → yağmur geçişinde ikisi birlikte görülür. Sky Light bugün `captureKey`
değişince hemen yakalar; sürekli geçişte bu her kare olur (~3,3–3,5 ms GPU), bu
yüzden hava geçişi de saat geçişinin en az 0,1 sn + durunca son yakalama kuralına
girer.

**3 · Yağış siperi.** Yukarıdan ortografik derinlik haritası: statik mesh, şekil
ve yol; terrain, bitki ve hareketli nesne yok. İki kademe (başlangıç önerisi 64 m
ve 256 m kenar, 1024²), texel'e oturur; yalnız kamera kayınca, hücre / HLOD
değişince ya da düzenlemede yeniden çizilir, duran karede maliyeti yok. Menzil
dışı açık sayılır, kenarda yumuşak geçer. **Tek kaynak, dört tüketici:** yağış
tanesi örtünün altında çizilmez; mesh ve terrain örtünün altında ıslanmaz /
karlanmaz; üstü mesh'le kapalı terrain'de kar yükselmez (zemin döşemesi, yol ve
oda karla gömülmez); birikinti oluşmaz. `forge.zone` gerekmez.

**4 · Yüzey durumu (saf, `engine/environment`).** Tek ıslaklık sayısının yerine
dört büyüklük; hepsi simülasyon saniyesiyle, saat atlaması süre sayılmaz:

| Büyüklük | Artar | Azalır |
|---|---|---|
| `wetness` 0–1 (ince ıslaklık) | Yağmur, kar erimesi | Yağış bitince **ilk** kurur |
| `puddleFill` 0–1 (birikmiş su) | Yüzey doyunca, yağmur / erime sürdükçe | Islaklık kuruduktan sonra, **daha yavaş** |
| `snowCoverage` 0–1 (beyazlık) | Kar; **önce** bu dolar | Kar yüksekliği bittikten sonra |
| `snowDepth` m (terrain) | Kar, örtü arttıkça hızlanarak | Kar kesilince **önce** bu iner; yağmur eritmeyi hızlandırır |

Oran 0 o yönü durdurur (kışın karın kalması böyle yazılır). Adım sınırlarda
bölünür; 30 / 60 / 144 Hz aynı sonucu verir. Kayıt oyununda ortak durumdur,
yüzey başına kayıt yok.

**5 · Yüzey tepkisi (TSL, `surfaceCover` v2).** Bütün statik yüzeyler aynı
katkıyı alır: `forge.material`, GLB'nin kendi materyali, şekil, yol mesh'i, HLOD
proxy'si, ailesiz foliage (kaya), terrain. Bitki aileleri kendi PG2 kuralında
kalır. Yalnız uniform güncellenir; hava değişince shader derlenmez.

- *Islaklık:* yukarı bakan yüz tam, dikey yüz azalan (rüzgârı alan yan biraz
  daha), alta bakan yüz kuru; siper altı kuru. Gözenekli yüzey koyulaşır, sert
  yüzey parlar.
- *Kuruma:* geometri ve dokunun oyukları geç kurur; kurumanın sınırı gürültüyle
  yamalıdır, su birikintisinin çevresi en son kurur.
- *Kar:* bugünkü eğim + yükseklik maskesi, siper ve materyal kabulüyle; kar
  altında ince normal yumuşar.
- *Yazım:* mesh'te `forge.material`'ın `weather` grubu (ıslanma, gözeneklilik, kar
  kabulü, birikinti kabulü); terrain'de boya katmanı (aşağıda 9).

**6 · Su birikintisi.** Üç kaynak, aynı `puddleFill`:

- *Çukur haritası:* terrain yüksekliğinden sığ çukur derinliği, worker'da tile
  başına komşu payıyla türetilir, saklanmaz, sculpt'ta yenilenir. Su önce en derin
  noktada görünür, dolarken kıyısı büyür, boşalırken kıyıdan ortaya çekilir.
- *Mikro birikinti:* düz yüzeyde (terrain ve statik mesh: yol, beton) gürültü +
  yükseklik / oyuk eşiğiyle, yalnız materyalde.
- *`forge.puddle`:* isteğe bağlı `followWeather`; elle konan seviye en yüksek
  seviyedir, doldurma bir kez o seviyede yapılır, su yüzeyi onun altında hareket
  eder ve yatak derinliğiyle kırpılır (her karede yeniden doldurma yok).

*Halkalar:* ortak TSL düğümü (hücre karmalı, birkaç katman); yoğunluğu anlık
yağmur şiddeti, uzakta söner; materyal birikintisi ve `forge.puddle` kullanır.
Yağmur bitince halkalar biter, su kalır. Açık su üstünde kar tutmaz.

**7 · Terrain kar yüksekliği.** Terrain vertex aşamasında yalnız yukarı yer
değiştirme: `snowDepth` × (eğim, yükseklik, katmanın kar kabulü, siper, açık su,
düşük frekanslı savrulma). Morph'tan **sonraki** konumda hesaplanır (LOD ve tile
sınırında çatlak yok); siper maskesi vertex aralığı kadar genişletilir (duvar
dibinden içeri sızmaz); normal yükselen yüzeyden; gölge geçidi aynı konumu
kullanır; düğüm sınırları ve culling en yüksek karı içerir. Kısa ot kara gömülür,
bu istenen sonuçtur. Authored yükseklik, paint, fizik materyali ve collider
yazılmaz; G8 kar 0 iken ölçülür. Maskelerin hepsi saf fonksiyondur ve **CPU
ikizi** vardır (fizik aynı noktada aynı karı görür); siperin CPU karşılığı temas
noktasından yukarı ışındır, GPU okuması yok.

**8 · Şema ve yüzeyler.** `forge.worldEnvironment@3`: `weather` geçişi,
`weatherDrivesSurface`, yeni oranlar, `snowMaxDepth`, dikey ıslanma; canlı
durumda `puddleFill`, `snowDepth`, hava geçişi. `@2` kısmi güvenli kimlik geçişi,
nötr varsayılanlar. SDK servisi (`transitionWeather`, yağış ve yüzey okuma) ve
changelog. Editör önizlemesi yeni büyüklükleri gösterir ve **hızlı oynatır**
("20 dk yağmur" gibi); level'a yazılmaz. Ajan aynı alanları `forge edit set` ile
yazar.

**9 · Yüzey fiziği sözleşmesi (yön ve mekanizma kullanıcı onaylı,
2026-11-25).** Bugün bir boya katmanının
fizik materyali (`mud`, `sand`, `snow` …) sabittir ve `TerrainSurfaceSampler`
tekere katman ağırlıklarıyla karışmış profili verir. Boya ve fizik materyali yine
yazılmaz; **okunan** profil canlı olur:

- *Katman tepkisi:* katmanda `weather` (`snowAccept` 0–1, `wetPhysicalMaterial`);
  boşsa fizik materyalinin varsayılanı: `mud` 0, ötekiler 1. Görünen kar ile fizik
  **aynı** değeri okur; beyaz görünen yer kar gibi tutar. Su altındaki zemin
  (göl, `forge.puddle`) katmandan bağımsız 0'dır (göl / nehir Faz 7'de bağlanır).
- *Canlı profil:* katman başına `karışım(kendi profili, snow profili, s)`, sonra bugünkü
  ağırlıklı karışım. `s` = noktadaki kar yüksekliğinin yumuşak eşiği × kabul; ince
  karda az, kalın karda tam. Kar azaldıkça profil kendiliğinden tabana döner.
  Teker efekti ve sesi de (`dominantMaterialAt`) canlı materyali görür. Hiç fizik
  materyali olmayan terrain bugün örnekleyici kurmaz; hava bağı açıkken kurar.
- *Kar collider'ın üstündedir.* Boyanmış karda collider karın üst yüzüdür ve iz onun
  altına iner; yağan karda collider sert tabandır, kar onun üstünde `snowDepth`
  kadardır. Sonuç: yağan karda iz en çok tabana kadar iner (`maxDepth` yerel kar
  yüksekliğiyle sınırlı), sıkışmış bir pay kalır, teker onun üstünde durur (bugünkü
  sanal zemin ofseti işaretli olur). Collider hiç yeniden kurulmaz.
- *İz ortama bağlıdır.* Deformasyon hücresi kar mı taban mı olduğunu taşır. Kar izi
  kar eridikçe onunla biter, yeni kar yağdıkça dolar; çamur / kum izi kardan
  etkilenmez ve kalır. Kar inceyken baskı tabana (kumsa kum izine) geçer.
- *Nerede:* canlı profil W8 (saf + test), tekere bağ 6d, iz, batma, işaretli ofset
  ve kayıt Faz 8. Sayıların ayarı (eşik, sıkışma, tutuş) Faz 8'de araçla yapılır.

#### Adımlar

(C: Claude, X: Codex; X'in diff'ini Claude inceler.) Her adım kendi editör
yüzeyiyle biter.

- [x] **W0 Sözleşme.** Tasarım 9'un mekanizma onayı (kullanıcı); şema `@3` + geçiş zinciri; SDK;
      ölçüm tabanı (WES açık; WES'siz karşılaştırma HV-10 ile W2'de). — C
      **Kod 2026-11-25 (`cb0a856`):** `@3` yalnız canlı durumu büyütür (`puddleFill`, `snowDepth`;
      0'da kalır), `@1` / `@2` kısmi güvenli kimlikle göçer. Sürüm 3 Faz W boyunca açık: yazılan
      alanlar, onları çizen adımda nötr varsayılanla eklenir (çalışmayan ayar görünmez). Oyun
      WES'e SDK'dan ilk kez ulaşır: `WorldEnvironmentServiceKey` (0.1.16). `precipitationOf`
      yağışın tek okuması. W5'in saf modeli öne alındı (`surfaceCondition.ts`, Codex; kuralları
      alanları belirler, henüz bağlı değil). Taban
      (`2026-11-25T16-21-57-686Z-weather.json`, R1, gerçek WebGPU, beş turun medyanı): GPU açık /
      yağmur / kar / ıslak / karlı Derekavak P2 2,78 / 3,12 / 3,04 / 2,97 / 2,96 ms, L03 0,37 / 0,36 /
      0,34 / 0,37 / 0,37 ms; P2 gönderim 1,2–1,4, ana iş parçacığı 1,7–1,9 ms; hava değişiminde
      pipeline ve shader modülü +0. Turlar P2'de 2,4–3,9 ms arası oynar: 0,5 ms'nin altındaki fark
      tek koşudan okunmaz.
      **Mekanizma onayı:** kullanıcı, 2026-11-25.
- [x] **W1 Yağış görseli.** TRAA denemesi → seçim; yağmur ve kar hacimleri, rüzgâr,
      ışık / sis, kalite. *Kapı:* HV-01, 02'nin açık alan kısmı; GPU bütçesi. — C
      **Kod 2026-11-25 (`49c76ce`):** `features/precipitation` (bileşensiz), hareket saf
      (`precipitationMotion.ts`), çizim `materials/precipitation.ts`: yakın + uzak hacim × yağmur /
      kar, hacim başına tek instanced çizim, tane başına CPU işi ve buffer yok. Görünüm ayarları
      WES'in `precipitation` grubunda (adet, görünürlük, hız, boy, salınım, rüzgâr, parlaklık).
      Renk havanın (sisin) rengidir. *Geç katman* (`pipeline/lateLayer.ts`): pipeline'lı karede AA'dan
      sonra kendi pass'i, sahne derinliğiyle yumuşak; doğrudan çizimde sahnenin altında, donanım
      derinliğiyle. Boşken pass atlanır. *TRAA denemesi:* aynı yağmur sahne pass'inde damla tepe
      parlaklığı 82–86 yerine 68–72, ayrıca MRT'nin normal / hızını ezer; geç katman seçildi.
      *İlk damla:* çizimler WES varken önceden derlenir, hava değişiminde pipeline +0 (beş yol: SMAA,
      TRAA, doğrudan; WebGPU ve WebGL2). *Maliyet* (`2026-11-25T16-42-44-611Z-weather.json`; aynı
      koşuda çizilen / çizilmeyen, turların en düşüğü): Derekavak yağmur +0,23 ms, kar −0,08 ms
      (gürültü), L03 −0,03 / −0,01 ms; bütçe 0,8. **Sınırlar:** çatı altına ve odaya da yağar (W3);
      doğrudan çizimde planar yansımaya girmemesi ve asset önizlemesi ayrıca denenmedi; yağış sesi 6c.
      **Görsel kabul:** kullanıcı, 2026-11-25 (çekimler `render-refs/candidates/precipitation-*`).
- [ ] **W2 Zamanlı hava geçişi.** Saf geçiş (X) + etken karışımı, Sky Light hızı,
      yağış şiddetinin bağı (C). *Kapı:* HV-03, 10.
      **Kod 2026-11-26 (`f642867`):** canlı hava bir *karışımdır*: açık olmayan ön ayarların payları
      (`cloudy` / `rain` / `snow` / `fog`, toplam ≤ 1, kalan açık; `WeatherMix`). Tek hava tek paydır;
      geçiş kalkış karışımından hedefin karışımına smoothstep'le gider, yarıda gelen yeni geçiş canlı
      karışımdan başlar (iç içe durum yok, sıçrama yok). Saf yarı `weatherTransition.ts` (Codex; ilerleme
      simülasyon saniyesiyle, 30 / 60 / 144 Hz ve tek adım 1e-9 içinde aynı). Etkenler pay başına toplanır
      (`mixedWeatherFactors`); sis rengi, bulut örtüsü ve yıldız pay başına karışır; tek pay ön ayarın
      kendisiyle birebir aynıdır, geçiş bitince görüntü sıçramaz. Geçiş yokken eski yol olduğu gibi
      çalışır. Okuyanlar: `environmentResolve` (ışık, sis, bulut, bulanıklık, yıldız, `captureKey`),
      rüzgâr (`liveWeatherFactors`), yağış (`livePrecipitation`: kar → yağmurda ikisi birlikte), perf
      göstergesi (hedef + %), editör önizlemesi. *Sky Light:* geçişte `captureKey` her kare değişir;
      `weatherTransitioning` bayrağıyla anahtar değişimi de 0,1 sn sınırına girer, bitişte bayrak düşer
      ve son hava hemen yakalanır; anlık `setWeather` ve mevsim eskisi gibi hemen. Sky bağlamasının
      saçılma anahtarı (bulanıklık) da geçişte bu kurala bırakılır. *Denetleyici + SDK 0.1.17:*
      `transitionWeather({ preset, intensity?, seconds })` → `Promise<boolean>`, `transitionTo` /
      `transitionSeason` kurallarıyla; `setWeather` çalışan geçişi `false` ile bitirir; saat, mevsim ve
      hava geçişleri birbirinden bağımsız. *Kayıt (A7):* canlı durumda `weatherFrom` / `weatherProgress` /
      `weatherSeconds` (`@3`'e nötr varsayılanla, sürüm artmadı); yarım geçiş kaldığı yerden sürer.
      Make Default hedefi yazar ve geçişi bitirir; level baytlarına ve Play'e canlı durum girmez
      (editör smoke'u). *Editör:* önizlemede hava düğmelerinin altında `Transition` (saniye, 0 anında)
      ve ilerleme yüzdesi; kaydedilmez, Undo'ya girmez.
      **Ölçüm** (`2026-11-26T07-50-02-771Z-weather-transition.json`, `…07-49-29-854Z-weather.json`; R1,
      gerçek WebGPU, 60 Hz adımlı): dört geçiş × iki sahne, hepsi hedefe vardı, pipeline ve shader
      modülü +0. Sky Light 10 sn'lik geçişte 101 yakalama (0,1 sn'de bir + varışta bir; 5 sn'de 51),
      bittikten sonra 0. Geçiş boyunca GPU ortalaması Derekavak 3,7–3,8 ms (duran hava ~2,5), L03
      1,4–1,5 ms (~0,35); yakalamalı karede GPU Derekavak ~8,4–8,8 ms, L03 ~4,7–5,0 ms; en uzun ana
      iş parçacığı karesi Derekavak 5,9–9,9 ms, L03 3,8–6,4 ms. *HV-10:* level'ın WES'i kaldırılıp
      dönüşümlü turlar: WES yok / yalnız açık hava WES'i GPU Derekavak 2,51 / 2,59 ms, L03 0,34 / 0,38 ms
      (fark gürültü sınırında); render smoke'u (20 poz) referanslarla aynı.
      **Sınırlar:** geçiş süresince Sky Light yakalaması saniyede 10 kez ~4–6 ms GPU ekler (karar
      gereği 0,1 sn; daha seyrek istenirse tek sabit). Yüzey (ıslanma / kar) havaya bağlı değil (W5).
- [ ] **W2b Hava → bulut ve gökyüzü** (kullanıcı, 2026-11-26; W2'nin kabulünde bulutların havayla
      değişmediği görüldü). Cloud Layer'ı havaya tam bağlar; hacimsel bulut (seçenek B) Faz W'den sonra
      ayrı karar. *Kapı:* HV-03, 10; açık havada görüntü aynı. — C
      **Kod 2026-11-26 (`5c38a84`):** WES `weatherSky` (`@3`'e, sürüm artmadı): Cloudy / Rain / Snow / Fog
      başına `cloudCoverage`, `cloudDensity` (en az bu değere çıkar), `cloudColor` + `cloudColorMix`,
      `cloudShade`, `skyOvercast`; değerlere tam şiddette ulaşılır, pay başına karışır (W2 geçişi de),
      Clear level'ın görünümüdür. Başlangıç değerleri `WEATHER_SKY_DEFAULTS` (şema aynısını tekrarlar,
      test eşitliği tutar); ayar kullanıcıda. *Bulut:* gölge açıkken kalın gövde koyulaşır, güneşe bakan
      ince kenar aydınlanır; 0'da düz renk. *Gökyüzü:* kapalılık gök rengini kendi parlaklığında bulut
      rengine çevirir, ayı ve yıldızları örter, güneş diskini söndürür; Sky Light yakalaması aynı kapalı
      gökyüzünü alır (bulut kubbesi yakalamaya çizilmez). Kapalılık `captureKey`'e girer: ayarı değişince
      yeniden yakalanır. Yalnız uniform; hava değişince shader derlenmez.
      **Ölçüm** (`2026-11-26T09-25-18-847Z-weather.json`, `…09-25-49-950Z-weather-transition.json`; R1,
      gerçek WebGPU): Derekavak açık / yağmur / kar GPU 2,06 / 2,21 / 2,10 ms, L03 0,30 / 0,31 / 0,31 ms
      (fark gürültüde; bulut gürültüsü renk ve opaklık için iki kez hesaplanır, ölçülebilir maliyet yok);
      pipeline ve shader modülü +0; geçişler W2'deki gibi (101 yakalama / 10 sn). HV-10: WES yok / yalnız
      açık hava Derekavak 2,26 / 2,30 ms, L03 0,28 / 0,28 ms. Render smoke'u (20 poz) eski referanslarla
      aynı, yağış smoke'u ve editör `world.spec` gerçek WebGPU'da geçti.
- [ ] **W3 Yağış siperi.** Harita, yenileme koşulları, yağış ve terrain bağı.
      *Kapı:* HV-02. — C
- [ ] **W4 Statik mesh örtüsü.** `surfaceCover` v2, `forge.material` `weather`,
      bütün statik yollar + HLOD, dikey ıslanma. *Kapı:* HV-04, 12; statik ölçüm. — C
- [ ] **W5 Yağışla ıslanma, karlanma, kuruma.** Yüzey durumu modeli (W0'da) + hava
      bağı, katmanın `weather` alanı ve Details'i, yamalı kuruma, kayıt oyunu (C).
      *Kapı:* HV-05, 08, 09.
- [ ] **W6 Su birikintisi ve halkalar.** Çukur haritası (X) + terrain bağı, mikro
      birikinti, `followWeather`, halka düğümü (C). *Kapı:* HV-06.
- [ ] **W7 Terrain kar yüksekliği.** CPU ikiziyle. *Kapı:* HV-07, 08. — C
- [ ] **W8 Canlı yüzey fiziği.** Hava duyarlı örnekleyici (saf; mevcut araç
      testleriyle), efekt materyali. Teker bağı 6d,
      iz Faz 8. *Kapı:* HV-13. — X (saf) + C
- [ ] **W9 Kapı.** `npm run measure:weather`, smoke'lar (`precipitation`, `weather`,
      `snowDepth`), editör smoke'u, belgeler, kullanıcı görsel kabulü. — C

Sıra: W0 → W1 → … → W9. W7, W5'ten sonra W6'dan önce alınabilir; W8, W7'den
sonra gelir.

#### Kabul matrisi

| ID | Koşul | Kanıt |
|---|---|---|
| HV-01 | Yağış şiddet, rüzgâr ve kaliteyi izler; pause'da durur; kamera hızlı dönerken iz, sıçrama ve hacim sınırı görünmez | Gerçek WebGPU smoke'u + görsel kabul |
| HV-02 | Çatı altında ve odada yağış yok, zemin kuru ve karsız; kapı eşiğinde ve akışla gelen binada da | Sabit pozlar (içeri, eşik, dışarı) + hücre döngüsü |
| HV-03 | Hava geçişi kesintisiz; geçişte pipeline ve shader modülü +0; Sky Light yakalaması hız sınırında | Saf test + `measure:weather` |
| HV-04 | Aynı ıslaklıkta yatay > dikey > alta bakan; kaya, çatı, yol, şekil, HLOD ve terrain aynı kuralda | Saf test + pozlar |
| HV-05 | Yağınca ıslanır; kesilince önce düz zemin, sonra birikintiler kurur; kar kalkınca zemin ıslak kalıp kurur | Deterministik sıra testi + zaman serisi çekimleri |
| HV-06 | Birikinti çukurda ve düzlükte oluşur, yamaçta ve siper altında oluşmaz; halka yalnız yağmurda; `forge.puddle` seviyeyle iner | Çukur haritası testi + pozlar |
| HV-07 | Kar yüksekliği artar ve iner; hiçbir noktada zeminin altına inmez, en çok sınırı kadar; LOD / tile sınırında çatlak yok; siper ve mesh altında yükselmez | GPU okuması ↔ CPU formülü + pozlar |
| HV-08 | Authored yükseklik, paint, fizik materyali, collider ve G8 değişmez (okunan profil yalnız W8 ile canlıdır); önizleme kayda ve Play'e sızmaz | Bayt karşılaştırması, G8, editör smoke'u |
| HV-09 | 30 / 60 / 144 Hz aynı sonuç; saat atlaması birikim değil; kayıt / yükleme kaldığı yerden; yeni hücre güncel durumla gelir | Saf testler + hücre döngüsü |
| HV-10 | WES yoksa, hava açık ve durum 0 iken görüntü bugünkü gibi; eski level baytları değişmez | Render smoke'u + bayt karşılaştırması |
| HV-11 | Bütçe tutuyor (aşağıda), hücre döngüsünde GPU / JS sızıntısı yok | `measure:weather`, R1, gerçek WebGPU |
| HV-12 | Uzak temsil tutarlı: HLOD proxy'si, uzak bitki ve terrain yakınla aynı ton | Yakın–uzak pozlar |
| HV-13 | Grass / toprak / kum karlandıkça kar profiline geçer, eriyince aynı sayılara döner; çamur ve su altı değişmez; karışık boyada ağırlıklı; siper altında taban; görünen kar ile fizik aynı noktada aynı kararı verir; hava bağı kapalıyken profil bugünküyle birebir | Saf testler (CPU ikizi) + mevcut araç testleri |

**Bütçe (öneri; R1, 1080p `high`, Derekavak P2, sağanak / yoğun kar).** Yağış
≤ 0,8 ms GPU; siper haritası yenilendiği karede ≤ 1,0 ms GPU, duran karede 0;
örtü + birikinti + kar yüksekliği toplam ≤ 0,8 ms GPU; G6 değişmez (gönderim
≤ 3 ms, ana iş parçacığı ≤ 6 ms). Şehir ve iç mekân sahneleri de ölçülür
(`measure:city`, `measure:heavy-props -g zones`).

#### Kararlar

**Kapalı (kullanıcı, 2026-11-25):** yukarıdaki kapsam 1–9; yağış yüzeyi sürer
(5a'nın "hava hedefleri değiştirmez" kararı, bağ açıkken geçersiz); statik
mesh'te kar kalınlığı yok; önce plan. HK1–HK10 öneri olduğu gibi (aynı gün); yüzey
fiziği yağışla değişir (kapsam 9, tasarım 9).

| ID | Konu | Karar |
|---|---|---|
| HK1 | Zaman | Faz 5 kabulünden sonra (2026-11-25 başladı); PG5b adım 5–6 ayrı oturumda paralel (kullanıcı), Faz 6 ile de paralel yürüyebilir |
| HK2 | Hava → yüzey bağının varsayılanı | Şemada kapalı (eski level'lar aynı kalır); Add Actor ve World Builder açık yazar |
| HK3 | Kar yüksekliğinin fiziği | W'de yalnız görünen geometri, collider değişmez; canlı yüzey fiziği W8 (tasarım 9), araç bağı 6d, iz ve batma Faz 8 |
| HK4 | En yüksek kar | `snowMaxDepth` varsayılan 0,4 m, aralık 0–2 m |
| HK5 | Birikintinin yeri | Çukur haritası + mikro birikinti kendiliğinden; yazar katman / materyalin birikinti kabulüyle ayarlar; yeni fırça yok |
| HK6 | Ağaç altı | Bitki siper sayılmaz (orman altına da yağar) |
| HK7 | Elle konan `forge.puddle` | `forge.puddle` `followWeather` varsayılan kapalı; birikinti bugünkü gibi kalır |
| HK8 | Yağmurun fiziği | Katman isterse değişir: `wetPhysicalMaterial` (ör. toprak → `mud`) ıslaklık doydukça karışır, kuruyunca döner; varsayılan boş |
| HK9 | Boyanmış `snow` katmanına yağan kar | Üstüne eklenir; eriyince boyanmış kar kalır (kalıcı kar) |
| HK10 | Karda karakter | W'de ve Faz 8'in ilk diliminde yalnız araç batar ve iz bırakır; karakterin ayak izi ve yavaşlaması Faz 8'de ayrı karar |

#### Riskler

| Risk | Karşılık |
|---|---|
| TRAA saydam damlayı bulandırır | W1'in ilk işi; iki yol ölçülür |
| Örtü her statik pikselde maliyet | W4'te şehir / statik ölçümü; materyal kabulü 0 ise katkı derlenmez; uzak kademede siper okunmaz |
| Doku sınırı (aşama başına 16) | Terrain fragment'i bugün 6 doku + gölge kaskatları + PMREM; siper ve çukur haritası birer dizi dokusu, W3'te sayılır, Faz 8'e yer kalır |
| Kar odaya ya da duvar dibine sızar | Siper maskesi vertex aralığı kadar genişler; HV-02 / 07 pozları |
| Yol mesh'i karın altında kalır | Yol siper haritasındadır; altındaki terrain yükselmez |
| Siper menzilinin kenarında kar yüksekliği belirir | Kademe kenarında yumuşak geçiş; HV-07'de yürüyüş |
| Görünen kar ile fizik ayrışır | Tek saf maske, CPU ikizi; HV-07 ve HV-13 aynı noktaları karşılaştırır |
| Boyanmış kar (collider üst yüz) ile yağan kar (collider taban) karışır | İki ortam ayrı hücre bilgisi; sözleşme tasarım 9, uygulama Faz 8 |
| Çukur haritası tile sınırında kopar | Komşu payı ve sığ derinlik sınırı; saf test iki tile'ı tek parçayla karşılaştırır |

### Faz 6 — Oyun runtime'ı ve araçlar

**Faz 6 dökümü (2026-11-19).** Fazı 6 olan 59 envanter satırı (`PORT_LOG` §1),
ertelenen 5 A (`npm run port:forge-tests`, TSV `deferred` `6`). Mevcut durum: alt
sistemlerin three'siz kodu 2b'de taşındı (`src/engine` altında, test dışı satır:
physics 8.755, behavior 2.077, movement 2.106, navigation 1.635, ui 1.516, audio
1.515, vfx 1.190, persistence 573, input 299, perception 217, loading 212, camera
152, animation 128, time 106), ama hiçbiri World'e bağlı değil; testleri
iskeleyle (`src/engine/testing/`, 1.098 satır, 20 test dosyası import eder)
tick'lenir, okudukları bileşenler eski biçimde (`src/engine/legacy/`, 984 satır,
`src/engine` altında 89 dosya import eder: physics 23, terrain 15, worldbuilder
20, environment 8, behavior 6, navigation 5, movement 3, ötekiler 9). `src/gameplay`
yok (katman kuralı var). Hazır olan: `defineGameModule`, `defineSubsystem({
inEditor })`, `spawnActors` / `destroyActors` (2a), `defineSaveState` (2b), terrain
heightfield collider ve G8 eşleşmesi (5a). Kod satırları alt fazın dökümünde
kesinleşir.

| Alt faz | INV | Ertelenen A | Kapı |
|---|---|---|---|
| **6a Runtime temeli** | F12, D43, D06, E13, A17, F11, F31, F16, D48, F23 | — | Alt sistemler World'de `defineSubsystem` ile; Rapier World'de (statik çarpışma, terrain heightfield, `collision.convex`, ışın / şekil sorgusu); iskeleyle tick'lenen testler World'de yeşil; bağlanan alt sistemin legacy okuyucusu şemaya geçmiş |
| **6b Oyuncu** | D25, D02, F13, D49, D52, D53, F05, F06, F09, D47, D26, D27, A19 | 4 (Player Start / varsayılan piyon) | `src/gameplay` açık; boot ve playflow smoke'ları; FPS Sandbox M1'in karakter kısmı (bakış, yürüme, zıplama, çömelme, hitscan) SDK'dan çalışıyor |
| **6c Sunum** | E07, D41, E18, G23, C04–C06, F30, G22, D45, E19, C09, F17, E14, H21, F19, E22, D24, F22, F20 | 1 (starter kayıt arayüzü) | Skeletal mesh MRT / hız vektörü sözleşmesiyle; TSL partikül; 3B ses; oyun UI'ı ve HUD yerleşim editörü; checkpoint smoke'u |
| **6d Araçlar** | D56, D57, D28, C16, E20, F27, F07 | — | Araç terrain üstünde sürülüyor (5a terrain'i); tekerlek görseli, motor sesi, yüzey tepkisi |
| **6e AI ortamı ve dağıtım** | F14, D07, A18, B14, G28, F15, F10, H15, H16 | — | Recast / Detour + nav volume + önizleme; algı; `game-starter` (+ `samples/` altında rts örneği); oyun projesi build'i, `build-record`, `verify:build`, `verify:dist --strict`; K4 / K11 ölçümü ve kararı |

Sıra: 6a → 6b; sonra 6c ∥ 6d (ayrı oturumlar); 6e'nin nav kısmı 6a'dan, AI
karakter animasyonu (F15) 6c'den, build hattı 6a'dan sonra herhangi bir zamanda.
5d bu fazla paralel yürür (plan §5). Faz kapısında `src/engine/testing/` ve
`src/engine/legacy/` iki katman kuralıyla silinir; Ridgebound pilotu kapıdan
sonra.

**Faz 6 kararları (kullanıcı, 2026-11-19; hepsi öneri olduğu gibi; mimari v1.71
§4.7):**

1. *Bölme ve sıra:* yukarıdaki 6a–6e; her alt fazın ayrıntılı dökümü ve
   kararları kendi başında alınır.
2. *Pilotlar:* karakter / kamera / girdi / fizik kutularının pilotu FPS Sandbox
   (`Games/FpsSandbox`, yerel listede kayıtlı; oyunun planında D1); araç
   tarafının pilotu Ridgebound kalır (K8). Faz kapısı ikisini de görür.
3. *Birinci şahıs:* motor genel parçaları verir (kapsül hareket sorgusu, birinci
   şahıs kamera kipi, view model); FPS'e özgü hareket ve silah kuralları oyunda.
   Motora hazır "FPS kipi" konmaz (oyunun planında D2).
4. *Player Start:* kalıcı katmanda, hücre akışına girmez; doğuş hücreler
   yüklenmeden çözülür. İçe aktarıcı ve World Builder Player Start'ı kalıcı
   katmana yazar (özelliği 6b'de).
5. *UI widget editörü (K12'nin açık maddesi):* widget'lar şemalı JSON kalır ve
   genel veri editöründe önizlemeyle düzenlenir; önizlemede HUD yerleşimi
   (anchor ve konum sürükleme) eklenir. Tam görsel tasarımcı yok. Oyun HUD'u ve
   menüleri `engine/ui` widget'larıyla (oyunun planında D3). 6c'de.
6. *K4 / K11:* WebGL2 fallback ve oyunun tarayıcı kapsamı 6e'de ölçülür;
   kullanıcı kararı faz sonunda.

- [ ] Runtime alt sistemleri (bugünkü capability modülleri), oyun çatısı
      (`gameplay` katmanı: bugünkü `src/game`'in yeniden kullanılabilir kısmı —
      TPS / araç / RTS modları, kamera yöneticisi, takip kamerası, spring arm),
      koddan kayıtlı davranışlar (betik yüzeyi yok, K12), input
      (`engine/input`), karakter hareketi + kamera, Player Start, Rapier fizik,
      ses (kod kütüphanesi; ayarları şemalı veri, A13), oyun UI'ı (`engine/ui`:
      widget, bağlama, tema, yerelleştirme, dünya widget'ı), yükleme ilerlemesi
      (`engine/loading`), save-game, algı (`engine/perception`) + Recast/Detour
      nav. AI mantığı oyun kodunda; BT / State Tree / EQS / Blackboard / Smart
      Object, diyalog, ragdoll, hareketli platform, spline takipçisi, portallar
      yok (K12).
- [ ] Taşınan alt sistemler (`src/engine/subsystem.ts` biçimi) özellikleriyle
      World'e `defineSubsystem` üzerinden bağlanır; iskeleyle tick'lenen
      testleri World'e çevrilir; `src/engine/testing/` ve
      `engine-testing-is-test-only` kuralı silinir (2b iskele kararı).
      Alt sistemler şemalı bileşenlerden okur; `src/engine/legacy/` ve
      `engine-legacy-stays-in-engine` kuralı silinir (2b geçiş kararı).
- [ ] **UI widget editörü (K12, karar 2026-11-19):** widget'lar şemalı JSON,
      genel veri editöründe önizlemeyle; önizlemede HUD yerleşimi (anchor ve
      konum sürükleme). Tam görsel tasarımcı yok (Faz 6 kararı 5, 6c).
- [ ] Skeletal mesh ve animasyon: skinning'li mesh'in WebGPU'da çizimi (MRT /
      hız vektörü sözleşmesine uygun), klip oynatma, blend space
      (`engine/animation`). Faz 3 yalnız statik mesh'i kapsar; karakter görseli
      burada gelir. Animasyon–ragdoll geçişi yok (K12).
- [ ] VFX: partikül efektleri TSL'de. WebGPU'da nokta boyutu yok; büyük
      noktalar `Sprite` + instancing ile `PointsNodeMaterial`'a çevrilir.
      Mümkünse compute partikül. Yağış ayrı bir çizimdir (Faz W); yağmur sesi ses
      dünyaya bağlanınca (6c) WES'in yağış şiddetini okur.
- [ ] Araçlar: Vehicle component, tekerlek görsel node'ları, motor sesi, yüzey
      tepkisi (Faz W W8'in canlı profiliyle; W8 gelmediyse bugünkü örnekleyici).
- [ ] `templates/game-starter` karşılığı.
- [ ] Oyun projesi build'i: Forge'daki `game-project-build` / `build-record` /
      `verify:build` karşılığı; editörsüz üretim çıktısı, `verify:dist
      --strict`, alt dizin yayını. Pilot bunu kullanır; Faz 10'a bırakılmaz.
- [ ] K4: oyunda WebGL2 fallback kararı — hedef kitlenin WebGPU kapsamı ve
      compute'suz yolların maliyeti ölçülür; kullanıcı kararı. Oyunun tarayıcı
      kapsamı (K11) aynı ölçümle kesinleşir.
- [ ] Kapı: runtime smoke'ları (boot, playflow, checkpoint); araç terrain
      üstünde sürülüyor (5a terrain'i gerekir). Ertelenen Forge A kontrolleri yeşil (`npm run port:forge-tests`, TSV `deferred`
      `6`: Player Start / varsayılan piyon 4, starter kayıt arayüzü 1).
- [ ] **Ridgebound pilotu (K8, kapıdan sonra):** Ridgebound'un bir **kopyası**
      `forge.projects.local.json` ile kaydedilir ve `check:projects`'e girer. M0
      oyun kodu `@forge/sdk`'ya, `TransportState` `defineSaveState`'e taşınır;
      içerik içe aktarıcıdan geçer. Deformasyon / hasar kapsam dışı. Çıkan SDK
      eksikleri Faz 7–8'den önce düzeltilir. Forge WebGL bağı kesilmez.

### Faz 7 — Su ve yansımalar

- [ ] Okyanus: FFT compute shader'a (bugün `RawShaderMaterial` ping-pong'u);
      yüzey, köpük, ada girintileri (inlet), kostik, kıyı.
- [ ] Yağmur halkaları (Faz W'nin ortak düğümü) göl, nehir ve okyanus yüzeyinde.
- [ ] Göl ve nehir (TSL), sualtı, su–terrain bağlantıları; terrain kıyı
      ıslaklığı ve kostiği (INV-G14'ün su kısmı, 5a'dan; kullanıcı kararı
      2026-11-15).
- [ ] Yansımalar (kullanıcı kararı 2026-11-11): düz yüzeyler (su, mirror
      plane, reflective surface, su birikintisi) `reflector()` ile planar;
      genel yansıma Post Process'teki SSR (Faz 3). Suda SSR kullanılmaz;
      sphere reflection capture yok. Planar'ın maliyet ilk okuması S4'te.
- [ ] Kapı: su görsel kabulü ve ölçüm. Ertelenen Forge A kontrolleri yeşil (`npm run port:forge-tests`, TSV `deferred`
      `7`: göl / okyanus / nehir 20).

### Faz 8 — Terrain deformasyonu ve araç hasarı

- [ ] Karda iz ve batma (Faz W tasarım 9): deformasyon yağan karı en çok tabana kadar
      oyar, işaretli sanal zemin ofseti, hücrede ortam (kar / taban), yağışla dolma
      ve erimeyle bitme, kayıt; sayıların araçla ayarı. Collider yeniden kurulmaz.
- [ ] Terrain deformasyonu: GPU yükseklik güncellemesi (texture veya compute),
      collider senkronu, ıslak iz, save-game kalıcılığı, editör yüzeyi.
- [ ] Araç hasarı: impact deform + mesh senkronu, `dentWear` TSL'de, parça
      kopma, kırılma (Voronoi bake) + debris / VFX / ses.
- [ ] Araç sözleşmesi (`FORGE_VEHICLE_COMPONENT_AND_DAMAGE_CONTRACT.md`) ve
      Doruk K-180 kaynağı (`art/vehicles/doruk-k180/`): "motor deposunda oyun
      yok" kuralının bilinçli istisnası. Yeni depo düzenindeki yerleri (mimari
      A9) taşımadan önce kullanıcıyla belirlenir.
- [ ] Kapı: Ridgebound kopya sahnesinde hasar ve iz senaryoları. Ertelenen Forge A kontrolleri yeşil (`npm run port:forge-tests`, TSV `deferred`
      `8`: off-road test level'ı 2).

### Faz 9 — İleri aydınlatma (her teknik ayrı karar)

Her teknik için: hipotez, küçük deneme, §2.10 ölçümü, geri alma yolu, kullanıcı
kararı.

- [ ] `LightProbeGrid` — açık dünya GI. Gün saati olay bazlı değiştiği için
      (sürekli hareketli güneş yok), geçişten sonra yeniden bake ya da iki durum
      arasında karışım mümkün; bu, bake'li GI için önemli bir avantaj.
- [ ] `ClusteredLighting` — gece sahneleri, farlar, sokak lambaları.
- [ ] SSGI profil ayarı; VXGI denemesi.
- [ ] `LightMapper` — yalnız statik yapılar için.
- [ ] `MeshletDrawingPipeline` — yalnız ölçümde yoğun mesh darboğaz çıkarsa.

### Faz 10 — Ridgebound göçü ve sürüm

- [ ] Ridgebound içeriği içe aktarıcıyla çevrilir (önce kopya, sonra gerçek
      veri); oyun kodu (bugün 926 satır, Forge'un 19 iç modülünü import ediyor)
      `@forge/sdk`'ya taşınır; kontrat / depo / kargo tanımları oyunun asset ve
      bileşen türlerine, `TransportState` bir `defineSaveState` bölümüne geçer
      (mimari A7).
- [ ] Oyun kuralları ve UI; tam Edit → Play → Save akışı.
- [ ] Üretim build'i (editörsüz, `verify:dist --strict`); build hattı Faz 6'da
      kuruldu, burada gerçek oyunla sürüm çıktısı alınır.
- [ ] Kapı: kullanıcı kabulü; Ridgebound'un Forge WebGL bağı kesilir.

---

## 5. Paralel yürütme

- Faz W, Faz 5'ten sonra Faz 6 ile paralel yürüyebilir (6c'nin sesini beklemez).
- Faz 5 ve Faz 6 ayrı oturumlarda paralel yürüyebilir (ortak dosyaları az);
  Faz 6'nın araç kapısı 5a'yı bekler. 5b ve 5c de birbirine paralel yürüyebilir.
- İş bölümü mevcut düzende kalır: toplu taşımadaki derleme / test düzeltmeleri
  ve iyi tanımlı saf fonksiyonlar + testleri Codex'e uygun; TSL / render
  tasarımı, Rapier ve inceleme Claude'da.
- Paralel oturumlar aynı index'i paylaşır: commit'ler yol sınırlı
  (`git commit -- <yollar>`).

## 6. Riskler

| Risk | Önlem |
|---|---|
| WebGPURenderer'ın nesne başına CPU maliyeti açık dünyada yüksek çıkar | Faz 1 S4'te ölçüldü: ~1,3 ms sabit + draw call başına ~8 µs; instancing ile Derekavak P2 render gönderimi 3,9 ms (sınır 3). Çare GPU güdümlü foliage (5c, GO koşulu) |
| Deneysel addon API'leri sürümle değişir | three sabit sürüm; addon'lar kendi sarmalayıcılarımızın arkasında; yükseltme ayrı, planlı adım |
| Akışla gelen yeni materyallerde shader derleme takılması | `compileAsync` ile ön ısıtma; materyal varyant sayısını sınırlama |
| Geçiş döneminde iki motorun bakımı | Cut-over sonrası Forge WebGL'de yeni özellik yok; taşınmış modüllere sonradan gelen hata düzeltmeleri port günlüğünde izlenir |
| Kapsam şişmesi ("her şeyi yeniden tasarlayalım") | §2.11: yalnız iskelet yeniden tasarlanır; algoritmalar olduğu gibi taşınır |
| CI'da GPU yok | CI: tsc, build, engine testleri, dist doğrulaması. Render testleri yerelde, başlıklı (headed) tarayıcıda; headless'ta canvas görüntüsü siyah gelebiliyor |
| Görsel kabul darboğazı | Kabuller faz sonlarında toplu istenir |
| WebGPU'suz cihazlar | K4 |
| Kabul edilmiş görüntü sonraki fazlarda fark edilmeden bozulur | Faz 3'teki render regresyon smoke'u (yerel, başlıklı, boş görüntü kontrollü) |
| Test taşıması "mekanik" sanılır; eski veri modeline dayanan testler çevrilemez | 2b'nin ilk işi test sınıflaması; kapının paydası sınıflanmış sayılar |
| Forge'daki bir özellik sessizce taşınmadan kalır | Faz 0 özellik envanteri; her satırda hedef faz ya da "taşınmayacak" |
| Compute yolu (culling + indirect draw) r187'de beklenen kazancı vermez | Faz 1 S4: tek türde doğru çiziyor, GPU maliyeti yok (G7); bütün türler + gölge kaskatları 5c'de ölçülür |
| NO-GO'da 2a iskeleti ve bu depo sahipsiz kalır | K10 |
| İçe aktarıcı hatası ancak görsel kabulde fark edilir | 2b'de fixture testleri + tür başına sayım karşılaştırması |

## 7. Taşıma günlüğü

Yeni depoda `docs/PORT_LOG.md`. Her satır: modül, kaynak yol, Forge SHA, işlem
(taşındı / uyarlandı / yeniden yazıldı), testler, durum. Aynı belge, Faz 3–8
boyunca hangi Forge özelliğinin WebGPU'da hazır olduğunu gösteren kapsama
matrisini de taşır; matrisin paydası Faz 0'da çıkarılan özellik envanteridir
(her özellik: hedef faz ya da "taşınmayacak"). Cut-over'dan sonra Forge WebGL'de taşınmış bir
modüle hata düzeltmesi yapılırsa buraya "port bekliyor" diye işlenir.

## 8. Kararlar

| ID | Konu | Öneri | Durum |
|---|---|---|---|
| K1 | Yeni deponun adı ve yeri | `Forge-WebGPU` — yerel `C:\Users\emret\Desktop\Forge-WebGPU`, GitHub `emrtrn/Forge-WebGPU` | **Kapandı** 2026-11-10: ad "Forge WebGPU", depo `Forge-WebGPU` (private) |
| K2 | Forge WebGL'in durumu | Bakım modu; GitHub arşivi değil; `Forge` deposu ve adı kalır | **Kapandı** 2026-11-10: bakım modu, depo ve ad kalır. Cut-over'a (2b başı) kadar three'siz sistemlerde geliştirme sürebilir; sonrasında yalnız hata düzeltmesi, taşınmış modüle gelen düzeltme `PORT_LOG.md`'ye "port bekliyor". Ad karışıklığı yeniden adlandırmayla değil README / `CLAUDE.md` notuyla çözülür. GitHub arşivi Model 1 fork'larını ve Ridgebound'u düzeltmesiz bıraktığı, yeniden adlandırma `upstream` / `FORGE_ROOT` / `../../Forge` yollarını kırdığı için reddedildi |
| K3 | Veri formatları | Yeni tek tip format + tek yönlü içe aktarıcı (mimari A1; v0.2'deki "aynı şema" önerisi geri çekildi) | **Kapandı** 2026-11-10 mimari A1 kararıyla: tek tip aktör + bileşen (bileşen hiyerarşili) + tek yönlü içe aktarıcı |
| K4 | WebGPU olmayan cihaz | Editör: WebGPU zorunlu. Oyun: başlangıçta zorunlu + açık mesaj; WebGL2 backend fallback'i Faz 6'da ölçümle karara bağlanır | **Kapandı** 2026-11-10: öneri olduğu gibi. "WebGPU yok" mesajı renderer'dan bağımsız boot hata ekranında (mimari §4.7). Faz 6 fallback kararının ölçütleri: hedef kitlenin WebGPU kapsamı ve compute'suz yolların maliyeti; o güne kadar özelliklere WebGL2 yolu yazılmaz. `forceWebGL` yalnız CI smoke'ları için, WebGPU kabulü sayılmaz. Baştan Compatibility fallback'i compute özelliklerine (foliage culling, FFT okyanus, partikül, deformasyon) ikinci yol yükü getirdiği için reddedildi |
| K5 | three sürümü | 0.187.0 sabit (npm'deki en son); yükseltme ayrı adım | **Kapandı** 2026-11-10: tam sabit `0.187.0` (`^` yok, lock commit'li). Yükseltme faz sınırlarında değerlendirilir, faz ortasında yapılmaz; kontrol listesi: three geçiş notları, addon sarmalayıcıları, referans sahnelerde görsel karşılaştırma + ölçüm, sonuç plana / `PORT_LOG`'a. Kritik düzeltme gerekirse ara yükseltme ayrı commit'te aynı listeyle. Forge WebGL de 0.187.0'da; 2b taşımasında eşdeğerlik testlerini sürüm farkı bulandırmaz. `^` (r sürümü kırıcı) ve aylık takip (sürekli addon kayması) reddedildi |
| K6 | Render-three yatırım durdurma | Hemen yürürlüğe girsin (§3) | **Kapandı** 2026-11-10: GO'ya kadar seçici, GO'dan sonra tam durdurma (§3). Faz 1 GO'ya kadar `render-three`'ye yeni iş yalnız şu üç koşulla girer: (a) oyunun şu anki bir kilometre taşı istiyor; (b) algoritma / parametre kısmı three'siz `engine/` modülünde, shader ince; (c) yeni `onBeforeCompile` yaması yok, WebGL görsel kabul cilası yok. GO'dan sonra yalnız hata düzeltmesi. Kural Forge oturumları için Forge'un Claude hafızasına (`forge-webgpu-rebuild-plan`) yazıldı. Hemen tam durdurma, `render-three` hâlâ aktifken (1 Ekim'den beri 146 commit) NO-GO ihtimalinde kayıp zaman yarattığı için reddedildi |
| K7 | Editör UI | Mevcut paneller önce uyarlanarak taşınsın; redesign Faz 4 sonrası ayrı karar | **Kapandı** 2026-11-10: paneller vanilla DOM olarak uyarlanıp taşınır; framework yok, redesign yok (Temmuz 2026 redesign'ının bir kısmı panellerde zaten var; yenisi gerekirse Faz 4 sonrası ayrı karar). Faz 4'ün ilk işi UI kiti (token'lar + `paramFields` kuralları; şemadan üretilen Details de bunu kullanır); Outliner sanallaştırılmış (50.000 aktör); `data-testid` sözleşmesi korunur. UI framework'ü ~38.800 satırı yeniden yazıma çevirdiği, reaktiflik kazancı işlem / undo servisiyle zaten sağlandığı için reddedildi |
| K8 | Ridgebound göç zamanı | Faz 8 kabulünden sonra (Faz 10) | **Kapandı** 2026-11-10: Faz 6 kapısından sonra pilot, Faz 10'da gerçek göç. Pilot: Ridgebound **kopyası** `check:projects`'e girer; M0 kodu `@forge/sdk`'ya, `TransportState` `defineSaveState`'e, içerik içe aktarıcıdan; deformasyon / hasar yok. SDK (A8) ve oyun verisi (A7) kararları Faz 7–8'den önce gerçek bir oyunla sınanır. Gerçek göç ve Forge WebGL bağının kesilmesi Faz 8 kabulünden sonra. Yalnız Faz 10 (SDK ilk kez geç sınanır) ve Faz 6'da tam göç (oyun Faz 7–8 boyunca hasarsız kalır) reddedildi |
| K9 | Referans donanım | Kullanıcının GPU'su; performans hedefleri Faz 0 baseline'ından sonra konur | **Kapandı** 2026-11-10: referans **R1** = NVIDIA GeForce RTX 3060 12 GB (sürücü 610.60, 2026-11-10) / Intel i5-11400F / 16 GB RAM / 1920×1080 60 Hz ekran. 1440p ölçümleri render çözünürlüğüyle (ekran dışı hedef / DPR) alınır ve kayıtta öyle yazılır. Hedef sayılar Faz 0 baseline'ından sonra; biçim: profil × çözünürlük başına medyan / p95 kare süresi + GPU süresi, 60 Hz bütçe 16,6 ms. Sürücü değişikliği ölçüm kaydına yazılır. İkinci (düşük) referans gerekip gerekmediği K4'ün Faz 6 kararıyla birlikte. Dış hedef sınıf, ölçülemediği için reddedildi |
| K10 | Faz 1 NO-GO çıkarsa bu depo ve 2a iskeleti | 2a kapısına kadar tamamlanır (three'siz, renderer'dan bağımsız). Sonra iskelet korunur ve `render` katmanı Forge `render-three`'den (klasik `WebGLRenderer`) uyarlanır; mimari kazançlar (veri modeli, şema, kayıt, SDK) renderer'a bağlı değil. Bedeli: 2b'ye ~23.300 satırlık render uyarlaması eklenir ve iki depo dönemi uzar | **Kapandı** 2026-11-10: öneri olduğu gibi — NO-GO'da yeni iskelet + klasik `WebGLRenderer` katmanı. Depoyu dondurup Forge WebGL'de devam etmek 2a'nın mimari kazançlarını (veri modeli, şema, kayıt, SDK) Forge'a parça parça geri taşımayı gerektirdiği, kararı NO-GO anına bırakmak 2a'yı belirsiz hedefle yürüttüğü için reddedildi. `WebGPURenderer`'ın WebGL2 backend'i seçenek değil: NO-GO nedeni renderer'ın CPU maliyetiyse aynı maliyeti taşır |
| K11 | Tarayıcı kapsamı | Editör: yalnız masaüstü Chromium (Chrome / Edge), R1'de. Oyun: başlangıçta aynı; Firefox / Safari kapsamı Faz 6'da K4 fallback ölçümüyle birlikte karara bağlanır. Kapsam dışı tarayıcıda boot hata ekranı açık mesaj verir | **Kapandı** 2026-11-10: öneri olduğu gibi — editör yalnız masaüstü Chromium; oyunun Firefox / Safari kapsamı Faz 6'da K4 ölçümüyle. Oyun için Firefox + Safari'yi ilk günden hedeflemek her fazın kabulüne iki tarayıcı daha eklediği için reddedildi |
| K12 | Kapsam: hangi Forge özellikleri taşınmaz | Ürün tezinin ölçütüne göre (mimari §0.0); eski oyunların kullanımı ölçüt değil | **Kapandı** 2026-11-11 (kullanıcı, öneri olduğu gibi). **Taşınmaz:** diyalog (`engine/dialogue`, editör, asset'ler, rapor hattı); AI yazım yığını (`engine/ai`: controller, BT, State Tree, EQS, Blackboard, Smart Object ve editörleri; AI mantığı oyun kodunda); Actor Script'in betik yüzeyi (değişkenler, olay / mesaj bağlamaları, dispatcher, arayüz, referans, construction; sınıf parametreleri şemalı bileşen alanlarıyla); ragdoll ve kalkma karışımı, montage girişleri; Sound Cue editörü, ses bileşeni ve Ambient Sound; hareketli platform, spline takipçisi, level geçişi / portallar. **Taşınır:** ses ve UI kod kütüphaneleri, karakter hareketi, takip kamerası ve spring arm, Recast / Detour navigasyonu, algı, Player Start. **Yeni:** genel veri editörü (A13) ve ajan düzenleme komutları (A12), Faz 4. **UI widget editörü (kullanıcı kararı 2026-11-19, Faz 6 kararı 5):** şemalı JSON + genel veri editöründe önizleme ve HUD yerleşimi (anchor / konum sürükleme); tam görsel tasarımcı yok. Taşınmayan kod `forge-webgl-final` etiketinde durur; bir oyun isterse dikey özellik modülü olarak gelir. **Behavior (kullanıcı kararı 2026-11-12):** olay ve mesaj işleyicileri davranışın kod kaydında (`BehaviorDefinition`: `tick`, `events`, `messages`); aktör `Behavior` bileşeniyle (script + parametreler) davranışı seçer |

## 9. v0.1'den korunanlar

- Gerçek WebGPU doğrulaması; sessiz fallback yok (§2.6).
- Ölçüm kayıt formatı ve "ölçülmedi" dürüstlüğü (§2.10).
- Görünür özellik kapsama matrisi (§7).
- Kayıt güvenliği: allowlist ve `droppedFields` fikri artık şema kaydının
  doğal parçası (mimari §4.5); proje kökü sınırı aynen (§2.7, §2.8).
- Ridgebound verisine Faz 10'a kadar yalnız kopya üzerinden dokunulması.

v0.1 dosyası (`FORGE_WEBGPU_EDITION_MASTER_PLAN.md`) bu belgeyle geçersizdir;
silinebilir.

## 10. İlk adımlar

1. ~~§8 kararları (K1–K9) ve mimari raporundaki A1–A9~~ — tamam (2026-11-10).
2. ~~Açık kararlar: A10, A11, K10, K11~~ — tamam (2026-11-10).
3. ~~Faz 0: Forge özellik envanteri, referans sahneler, WebGL ekran görüntüleri
   ve ölçümleri, GO ölçüt sayıları~~ — tamam (2026-11-11).
4. Faz 1: spike S1 → S4 (compute culling prototipiyle), ardından GO / NO-GO.
   Faz 2a bununla paralel başlar.

## 11. İlerleme kaydı

| Tarih | Sürüm | Ne oldu |
|---|---|---|
| 2026-11-10 | v0.4 | Plan ve mimari rapor Forge'dan bu depoya taşındı; A1–A9 karara bağlandı; Faz 1 ∥ 2a, cut-over 2b'ye kaydı (`137dbc3`) |
| 2026-11-10 | v0.5 | K2, K4–K9 karara bağlandı (`f87bef1`) |
| 2026-11-10 | v0.6 | Belge incelemesi: tutarsızlıklar düzeltildi; açık kararlar K10–K11, A10–A11 eklendi; Faz 0 / 1 / 2a / 2b / 3 / 4 / 6 / 8 kutuları genişledi; Faz 5 5a–5d'ye bölündü. Kod yok, hiçbir faz başlamadı (`3d25f5e`) |
| 2026-11-10 | v0.7 | K10, K11, A10, A11 karara bağlandı (dördü de öneri); bütün kararlar kapalı (`b0b8f6f`) |
| 2026-11-10 | v0.7 | Faz 2a başladı: depo iskeleti (Vite 7, TypeScript 5.9 strict, three 0.187.0, Rapier 0.19.3, Vitest 5), katman denetimi + öz-testi, dosya boyutu bütçesi, `npm run gate`, CI, `CLAUDE.md`, `AGENTS.md`; ilk çekirdek modül `src/core/id.ts`. Kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a çekirdek kutusu kapandı (`0b1bce0` … `67add88` ve JSON Schema commit'i): göreli import'lar depo genelinde `.ts` uzantılı + `verify:node-load`; `feature.ts` editörü anmaz (yeni katman kuralı `feature-does-not-name-editor`); şema DSL'i, tek normalize, geçiş zinciri, şema kaydı + `defineFeature`, `forge.level/1` + `forge.actorClass/1`, Details form tanımı, JSON Schema. Mimari rapora 2a kararları işlendi: tam yazım, yanlış tip kuralı, override kuralı v1. 215 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a asset modeli kutusu kapandı (`d2c96c6` … `5098d05`): DSL'e metin alan türü; asset türleri ve `registerAssetType`; `forge.assetMeta/1` (tür + lisans + kaynak zorunlu, D16); saf asset dizini (kimlik, şemadan yürüyen referanslar, ters dizin, bütünlük, `planDelete`, dizinden `ClassResolver`); `tools/assets` taraması, `.forge-cache` önbelleği, `verify:assets` gate'te; `src-no-node-builtins` kuralı. Mimari §4.4'teki açık soru kapandı: override sürüm etiketi + kısmi veri geçiş sözleşmesi. Mimari rapor v0.5. 286 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a hücre veri modeli kutusu kapandı (`87821dd` … `bb91a59`): `settings.cellSize` + `spatiallyLoaded`; ızgara ve hücre ataması; `forge.levelCell/1` + `forge.levelCells/1`; split / merge, kayıt planı ve kanonik metin; asset dizininde level klasörleri ve dosyalar arası bütünlük; `tools/assets` revizyon denetimi. Mimari rapor v0.6. 383 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a ölçek ölçümü kapandı (`239abc9` … `f60f79a`): `npm run bench:level` (sabit tohumlu 50.000 aktörlük level, S1–S7), eşikler ölçümden önce yazıldı (`1bd2e6b`). İlk koşuda S1 / S3 / S4 aştı; sebep uygulama (O(hücre × aktör) bölme, aktör kopyaları), biçim değil; düzeltmeden sonra hepsi eşik içinde. Mimari §4.4 ölçek çarelerine gerek yok. Ölçümde bulunan kayıp hatası (yanlış hücredeki aktör) düzeltildi. 390 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a kayıt servisi kutusu kapandı (`c89cbfc` … `51bc7e7`): proje yolu + yazma politikası, günlüklü atomik çok dosyalı kayıt (çökme testli), sunucunun kurduğu level dizini, dosya başına temel revizyon (409), sunucuda şema doğrulaması ve kanonik yazım (422), ikili sahneleme, `/__forge/` uçları + localhost / CSRF koruması, `src/core/edit` düzenleme modeli ve kayıt istemcisi, uçtan uca test. Mimari rapor v0.7. 457 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a uygulama kabuğu kutusu kapandı (`2dc5dba` … `5f2e762`): alt sistem / servis sözleşmesi çekirdekte, World (yaşam döngüsü, tick grupları, bileşen dizini, iki World yalıtım testi), sahne kurucu, Height Fog alt sistemi ve uçtan uca test, oyun modülü host'u, renderer'sız boot ekranı, `main.ts` boot eder. Mimari rapor v0.8. 486 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a oyun projesi sözleşmesi kutusu kapandı (`2d6700c` … `6ccac78` ve kabul testi): `forge.project/1`, `@forge/sdk` 0.1.0 + changelog + API anlık görüntüsü kapısı, `forge check|dev`, dev server'da proje seçimi / salt okunur örnekler / kimlik, `samples/starter`, `create-project`, `check:projects` (gate'te, başsız açılış). İskeletin kabul testi kutusu da kapandı. Mimari rapor v0.9. 526 test, kapı yeşil |
| 2026-11-10 | v0.7 | Faz 2a depo düzeni kutusu kapandı (`790e769` … `7b85e38`): manifestte `contentPacks`, etiketli içerik kökleri (`engine:`), motor içeriği ve paketler proje dizininde salt okunur, bilinmeyen paket `forge check`'te hata, `verify:assets`'te paket bağımlılık yönü, `content/engine/` + starter paketi (Height Fog sınıfı) ve `samples/starter` onu kullanır. Mimari rapor v1.0. 534 test, kapı yeşil |
| 2026-11-11 | v0.8 | Faz 2a kapandı: belge kutuları (`docs/architecture/ARCHITECTURE.md` rapordan kısa harita, `docs/PORT_LOG.md` iskeleti, plan belgesi düzeni `CLAUDE.md`'de: tek ana plan, faz kapanınca `docs/archive/` + `INDEX.md`). Dist doğrulaması ve alt dizin yayını testi Faz 4'e taşındı (kullanıcı kararı). 2a ayrıntısı `docs/archive/PHASE_2A.md`'de. Mimari rapor v1.1 |
| 2026-11-11 | v0.8 | Faz 0 özellik envanteri kutusu kapandı (`e2c20e6` … `a77587a` ve bu commit): `docs/PORT_LOG.md` §1, Forge `b3fa0c1a`'dan 234 satır (A–H), her satırda faz ya da "taşınmaz"; planda adı geçmeyen 27 satırın fazı kullanıcı onayıyla. CI `a77587a`'ya kadar yeşil (kullanıcı teyidi). 534 test, kapı yeşil |
| 2026-11-11 | v0.8 | Faz 0 referans sahneler kutusu kapandı: depo dışı referans projesi (`Games/ForgeReference`), dört sahne (OpenWorldTest, Island, WbPilotValley, Derekavak kopyası), sahne başına üç sabit poz; aday görüntüler R1'de gerçek WebGL'de alındı, kullanıcı onayladı |
| 2026-11-11 | v0.8 | Faz 0 WebGL baseline kutusu kapandı: 4 sahne × 3 poz × high / ultra × 1080p / 1440p, 96 koşu, sınırsız kare hızı, adaptif kapalı; kare (1/fps), p95, GPU, draw call, üçgen; soğuk / sıcak yükleme ayrı ölçüldü. Derekavak GPU'ya bağlı (~15–17 ms, ~1.800 draw call), Island CPU'ya bağlı (~6 ms) |
| 2026-11-11 | v0.9 | Faz 0 kapandı: GO ölçüt sayıları G1–G9 Faz 1'e yazıldı (kullanıcı onayı, öneri olduğu gibi: G2 Balanced 1080p ortalama ≤ 14 / p95 ≤ 16,6 ms, G5 draw call ≤ WebGL'in %50'si, G6 Derekavak CPU ≤ 6 ms…); Faz 0 ayrıntısı `docs/archive/PHASE_0.md`'ye taşındı |
| 2026-11-11 | v0.9 | Faz 1 başladı: spike yeri Forge `spikes/webgpu/` (kullanıcı kararı; `CLAUDE.md` istisnası `6ba3b26`). S1 Boot kapandı (Forge `517961b1`): gerçek WebGPU, çekirdek kip, NVIDIA Ampere, timestamp query çalışıyor, sınırsız kare hızı açılıyor |
| 2026-11-11 | v0.9 | Faz 1 S2 Terrain ölçüldü (Forge `6818d201` … `4cc0d5b9`): CDLOD terrain'in TSL karşılığı, `high` gölgesi, sky + sis. G8: tam çözünürlüklü bölgede fark ≤ 4,9 mm; morph bandı ve ötesinde CDLOD'un kendi sapması (≤ 2,2 m), ölçütün yorumu kullanıcı kararında. G1 (yalnız terrainli WebGL kopyalarına karşı): 18 / 18 geçer, kare oranı 0,26–0,86. Faz 0 baseline'ının navmesh hata ayıklama çiziminden etkilenmediği A/B ile doğrulandı |
| 2026-11-11 | v0.9 | S2 kapandı: G8 kullanıcı kararıyla tam çözünürlüklü bölgeye uygulanır (≤ 4,9 mm, geçer); GO tablosundaki G8 satırı buna göre netleşti |
| 2026-11-11 | v0.9 | Faz 1 S3 Pipeline ölçüldü (Forge `33c0c00d` … `407720e1`): tek `RenderPipeline`, MRT → GTAO / SSGI / SSR → TRAA → bloom; efekt maliyeti 3 sahne × 3 poz × 1080p / 1440p. 1080p medyan: GTAO 1,6, TRAA 0,4, bloom 0,1, SSR 6,2 (üst sınır), SSGI 7,3 ms; yarım çözünürlükte SSR 1,1, SSGI 2,0, GTAO 0,5 ms. Balanced adayı (TRAA + GTAO + bloom) terrain-only kare ≤ 4,4 ms (1080p) / ≤ 7,2 ms (1440p). Beş MRT hedefi WebGPU'nun varsayılan renk eki sınırını (32 bayt) aşıyor. Balanced profil kararı kullanıcıda. CI `f2b29cf`, `0519c3b`, `4ed6381` (Forge `517961b1` … `4cc0d5b9`) yeşil (kullanıcı teyidi) |
| 2026-11-11 | v0.9 | S3 kapandı (Forge `e0e64051`, `a4286990`): Balanced = TRAA + GTAO + bloom (level yazmışsa) + SSR yarım çözünürlük (level seçmişse); Cinematic SSGI + SSR tam (kullanıcı kararı). G2 / G3 terrain-only geçer: en kötü Derekavak P2, SSR açık 1080p 5,5 / p95 6,4 ms, 1440p 9,7 / p95 10,6 ms; kesin okuma S4'te. Yansıma kararı: genel yansıma SSR (Post Process `reflection: off \| ssr`, Faz 3), düz yüzeyler planar (Faz 7), sphere reflection capture taşınmaz (PORT_LOG INV-D12, G09). S4'e planar yansıma ölçümü eklendi (rapor) |
| 2026-11-11 | v0.9 | Faz 1 S4 ölçüldü (Forge `2a135526` … `46986836`): Derekavak ve WbPilotValley'nin gerçek içeriği Forge'un yükleme kurallarıyla (cell'ler, materyal slotları, bellekteki tile'larla foliage halkası, uzak billboard'lar); içerik WebGL'le sayılarak doğrulandı. G1 6 / 6 (kare oranı 0,54–0,68), G2 / G3 kesin (≤ 6,83 / ≤ 11,51 ms), G5 (327 / 212), G7 geçer; G6 render gönderimi 3,9 ms (sınır 3) aşar, foliage draw call'ları toplanınca 2,2 ms. G5 tabanı eşdeğer kopyaya göre (kullanıcı kararı). G9 ve GO / NO-GO kullanıcıda |
| 2026-11-11 | v0.9 | Faz 1 GO (kullanıcı kararı, koşullu): WebGPU yolu sürer, K10'un NO-GO yolu kapanır. Koşul: GPU güdümlü foliage bütün türlerde ve gölge kaskatlarında zorunlu (5c), G6 render gönderimi 5c kapısında yeniden ölçülür. Risk tablosu S4 sonuçlarıyla güncellendi |
| 2026-11-11 | v0.9 | S5 yapılmadı (kullanıcı kararı): `LightProbeGrid` ve `ClusteredLighting` Faz 9'da ölçülür; probe verisinin hücre formatındaki yeri 5b tasarımında |
| 2026-11-11 | v0.9 | Faz 1 kapandı (GO, koşullu): ayrıntı `docs/archive/PHASE_1.md`'ye taşındı; planda özet, koşul 5c'de |
| 2026-11-11 | v0.9 | Faz 2b başladı, cut-over: Forge `forge-webgl-final` = `04b5fb23` (bakım modu notu `CLAUDE.md` / `README.md` / `AGENTS.md`); Forge WebGL'de bundan sonra yalnız hata düzeltmesi, taşınmış modüle gelen düzeltme `PORT_LOG` §3'e. Envanter farkı yok |
| 2026-11-11 | v0.9 | 2b test sınıflaması kapandı: `npm run port:forge-tests` (TypeScript AST, değer düzeyinde ve sözcüksel kapsamlı ulaşım), 2.588 kontrol yeri → A algoritma 1.010 (kapı paydası), M eski model 959, R render 619; satırlar `docs/port/forge-engine-tests.tsv`, özet `PORT_LOG` §2.1 |
| 2026-11-11 | v0.9 | 2b Kenney kararı (kullanıcı): bu projede Kenney / Quaternius yok; dizin üreticileri ve Kenney dizini GameDesign klasörüne taşındı, Forge'dan kaldırıldı (Forge `92a709aa`); INV-H25 taşınmaz |
| 2026-11-11 | v1.0 | Ürün tezi ve kapsam ölçütü (mimari §0.0, v1.2): K12 kapsam kararları, A12 ajan düzenleme komutları ve A13 genel veri editörü Faz 4'e; 2b taşıma listesinden dialogue ve ai çıktı, ragdoll bağı kesilir; test paydası yeniden hesaplandı (`PORT_LOG` §2.1) |
| 2026-11-11 | v1.0 | 2b ilk taşıma: ses (`src/engine/audio`, `src/runtime/audio`), 37 Forge kontrolü birebir Vitest'te yeşil; `engine` DOM'suz (kullanıcı kararı; `tsconfig.tools.json` + `verify:node-load` zorlar), `src` testlerine yalnız `node:assert` (`src-tests-node-assert-only`), testler ayrı `tsconfig.tests.json`; Sound Cue D, payda 927; `port:forge-tests` taşınanı etiketle sayar (37 / 927) |
| 2026-11-11 | v1.0 | 2b: UI kütüphanesi taşındı (`src/engine/ui`, DOM kısmı `src/runtime/ui/uiDom.ts`), 50 Forge kontrolü yeşil; 5 M kontrol bırakıldı. A 87 / 927 |
| 2026-11-11 | v1.0 | 2b: input (eylem haritası, varsayılan bağlamalar; ragdoll tuşu yok), zaman kontrolü, işbirlikçi iş bölme, kare ölçümü taşındı (`src/engine/{input,time,work,perf}`), 13 kontrol yeşil. A 100 / 927 |
| 2026-11-11 | v1.0 | 2b test iskelesi (kullanıcı kararı): eski döngü `src/engine/testing/`'te, yalnız testlere açık (yeni katman kuralı + kasıtlı ihlal); Faz 6'da silinir. Perf hesabı, `inputSubsystem`, Forge alt sistem biçimi taşındı. A 118 / 927 |
| 2026-11-11 | v1.0 | 2b physics: `PhysicsSubsystem` beşe bölündü (bütçe), ragdoll çıktı, araçlar / zemin / çarpışma geldi; eski bileşen okuyucuları geçiş olarak `src/engine/legacy/` (kullanıcı kararı, yeni katman kuralı + kasıtlı ihlal). 96 kontrol yeşil; testler için `tsconfig.tests.json` üç bayrağı gevşetir. A 214 / 923 |
| 2026-11-12 | v1.0 | 2b terrain (sınıflandırma kullanıcı onayıyla): `src/engine/terrain` (34 dosya) + saf landscape algoritmaları, `src/engine/spline`, `src/engine/world` (ızgara / akış matematiği), `terrainCollider`; su Faz 7'ye, su birikintisi 5a'ya, runtime akışı 5b'ye, `worldTerrainMove` 5d / 7'ye ertelendi. 153 kontrol yeşil (terrain 150); taşıma araçlarında üç düzeltme (varsayılan değerli parametre özelliği, `checkAsync` kaydı, dinamik etiket sayımı), Vitest süre sınırı 30 sn. `heightmapPng` 3 kontrol `node:zlib` kararını bekliyor. A 367 / 923 |
| 2026-11-12 | v1.0 | 2b: `node:zlib` `src` testlerine açıldı (bağımsız referans kodlayıcı; kullanıcı kararı, `src-tests-node-assert-only` + kontrol fixture'ı); `heightmapPng` 3 kontrol yeşil. CI `d8b7891`, `8d7ab7c` yeşil (kullanıcı teyidi). A 370 / 923 |
| 2026-11-12 | v1.0 | 2b navigation: `src/engine/navigation` (Recast / Detour, döşemeli planlayıcı, ajan profili, yerel kaçınma), worker mesajlaşması `src/runtime/navigation`; `@recast-navigation/core` `0.43.1` tam sabit; `navFloorSampler` movement ile. 23 kontrol yeşil; taşıma aracı async kayıt fonksiyonlarını `await` ile çağırır. A 393 / 923 |
| 2026-11-12 | v1.0 | 2b movement: `src/engine/movement` + `animation/blendSpace` + `navFloorSampler`; hareketli platform bağı kesildi (K12), `LaunchOptions` / `TransformSink` movement'a; karakter hareketi okuyucusu legacy'ye. 76 kontrol yeşil; taşıma aracı isteğe bağlı parametre özelliğini `T | undefined` diye yazar. A 469 / 923 |
| 2026-11-12 | v1.0 | 2b behavior: koddan kayıtlı davranış + script mesajları; olay / mesaj bağlamaları kod kaydında (`BehaviorDefinition`, kullanıcı kararı, K12 satırında); referans / arayüz / dispatcher / değişken / ses bileşeni yok. `behaviorSubsystem` bütçe için bölündü (tipler `behaviorTypes`). Forge fixture'ları test köprüsünden geçer; kontrol düzeyinde D listesi (payda 922). 33 kontrol yeşil. A 502 / 922 |
| 2026-11-12 | v1.0 | 2b küçük alanlar: environment, loading, perception, vfx, perf'in kalanı; kalite profilleri / uyarlamalı kalite / donanım ipuçları / WebGL GPU timer Faz 3'e, Player Start Faz 6'ya, `lakeQuality` Faz 7'ye, `puddleWind` 5a'ya. 57 kontrol yeşil. A 559 / 922 |
| 2026-11-12 | v1.0 | 2b worldbuilder (seçenek B, kullanıcı kararı): algoritmalar + aşama üreticileri; Stage Runner / sahiplik / Dry Run / üretici sürümleri taşınmadı, köken `recipe.generatedBy`, korumalı bölgeler üst düzeyde (World Builder kapsam kutusunda). 53 kontrol yeşil, 15 D (payda 907); 58 kontrol `node:fs` kararını bekliyor. A 612 / 907 |
| 2026-11-12 | v1.0 | 2b: `node:fs` `src` testlerine açıldı (ortak test fixture'ı okumak için; kullanıcı kararı, `src-tests-node-assert-only` + kontrol fixture'ı, kasıtlı ihlal `node:child_process`'e geçti); nötr bölge profili fixture'ı `tests/engine/fixtures/`'ta, worldbuilder 58 kontrol yeşil. A 670 / 907 |
| 2026-11-12 | v1.0 | 2b `tools/world` tasarımı (kullanıcı onayı; mimari v1.3): dönüştürücü + deterministik GUID, köken `forge.worldRole.stage`'e, girdiler ve terrain GUID'li veri belgesi (tile'lar metasız parça), örtü ön ayarları `worldbuilder` paketinde. Adım 1: veri belgeleri + `forge.staticMesh` / `forge.shape` / `forge.worldRole` / `forge.terrain` şemaları (`d1a50f5`). A 670 / 907 |
| 2026-11-12 | v1.0 | 2b `tools/world` kutusu kapandı: `npm run world:random` / `world:brief` yeni level formatını kayıt servisinden yazar (`65285df`; kurulum `src/engine/worldbuilder/build`, deterministik GUID, `--force` kuralı, `worldbuilder` paketi); bekleyen World Builder kontrolleri + test dünyaları + terrain onarımı 27 kontrol (`8f29972`), D'ye düşen yol spline kontrolü yeniden yazıldı; World Builder kapsam kutusu da kapandı (köken nesnelerde). Açık 4 A: eski level belgesi 2, off-road fixture 2. A 697 / 907 |
| 2026-11-12 | v1.0 | 2b (kullanıcı kararı, CI `90b88fd` … `a16cd94` yeşil): Forge'un eski level belgesini sınayan 2 kontrol D (payda 905; `testWorld`'ün deterministiklik yarısı yeni testte), off-road test level'ı ve 2 kontrolü Faz 8'e. A 697 / 905 |
| 2026-11-12 | v1.0 | 2b physics kırılma + göçük (kullanıcı onayı): `src/engine/physics/{fracture,deformable}` three'siz algoritmalar; asset türü / bileşen / mesh senkronu / TSL / editör Faz 8. 88 kontrol yeşil (`fractureRuntime`'ın 4 R kontrolü dışarıda). Physics'te bekleyen araç içeriği 34 (içe aktarıcıyla) + runtime kabuğu 7. A 785 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı tasarımı (kullanıcı kararları; mimari v1.4): şimdi çevrilen alanlar (yerleşim, arazi, hücreler, Height Fog, World Builder yan dosyaları), geri kalanı level raporunda faza bağlı; ortak çevirici `src/engine/forgeImport/`; üç yalnız-şema ikili tür `forge.model` / `forge.texture` / `forge.sound`; lisans sorumluluğu kullanıcıda, köken tablosu ve `LicenseRef-forge-unverified`; starter tohum listesinden, referans level'lar depo dışı projede. A 785 / 905 |
| 2026-11-12 | v1.0 | 2b araç kontrolleri: `surfaceResponse` 20, `vehicleDrivetrain` 13, `vehicleAssets` 1 elle taşındı (A kontroller eski room layout / actor script'e ulaşmıyor; stok GAZ-52 tanımı `tests/engine/fixtures/`'ta). A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı adım 2: ortak yerleşim → aktör çevirisi ve Forge level çevirisi `src/engine/forgeImport/` (World Builder `worldLevel` onu kullanır; çevrilmeyen alanlar faz tablosuyla raporlanır), yalnız-şema ikili türler `forge.model` / `forge.texture` / `forge.sound`. A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı adım 3: `npm run import:forge` (köken tablosu, asset planı, level raporu, yan dosyalar yeni etiketlerle, `--force` / `--dry-run`); WbPilotValley geçici projede kapıdan geçer ve World Builder'la yeniden kurulur. A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı adım 4a (kullanıcı kararları): starter paketi yalnız motor varsayılanlarıyla (28 asset, 21,8 MB; lisansı bilinmeyenler dahil), `import:forge --pack`. A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı adım 4b: depo dışı referans projesi `Games/ForgeReference/webgpu-scenes` (yerel kayıtlı): 7 referans level kullandıkları asset'lerle, asset dizini 0 sorun; paylaşılan yan dosya bir kez yazılır. A 819 / 905 |
| 2026-11-12 | v1.0 | 2b içe aktarıcı ve kabulü kutuları kapandı: `import:forge --compare` (`f1851bc`), yedi referans level'da sayımlar eşit, hücre farkları açıklamalı (bölümlenmemiş kaynak; pilotun Player Start'ı kendi hücresinde, kalıcı katman sorusu Faz 6). Çeviriciler kendi fazlarında eklenip içe aktarıcı yeniden çalıştırılır. A 819 / 905 |
| 2026-11-12 | v1.0 | CI `c5d2605`'e kadar yeşil (kullanıcı teyidi) |
| 2026-11-12 | v1.0 | 2b "Taşıma" kutusu kapandı (kullanıcı kararları): kalan 86 A gövde düzeyinde sınıflandı; 17 dosya düzeyinde ertelenmiş saf kontrol taşındı (`546f696`), eski manifest / şablon / klasör düzeni 12 kontrol D, 1 M, sarmalayıcı çağrısı 2 sayılmaz (`ab662b5`); ertelenen A'lar paydada kalır, fazı TSV `deferred` sütununda, her faz kapısı kendininkini ister (3: 18, 5a: 4, 5b: 2, 5d: 4, 6: 4, 7: 20, 8: 2). A 836 / 890 |
| 2026-11-12 | v1.0 | 2b kayıt oyunu + World Partition tasarımı (kullanıcı kararları; mimari v1.5): sınıflama `engine/world` / `engine/persistence`'ı modül düzeyinde eski model sayar (129 M → A, 40 D; `4bdc041`), tek dünya ızgarası `src/core/grid` (`e005bc2`), slot deposu (`8b8449f`), hücre yerleşim planlayıcısı + durum belleği (`38aca39`), `forge.saveGame/1` + `persist` / `state` / `defineSaveState` + durum defteri, SDK 0.1.1 (`3f9b423`). Kutu kapandı; runtime akışı 5b, runtime kayıt özelliği Faz 6. Ertelenen A: Faz 3 40, 5a 4, 5b 54, 5c 8, 5d 4, Faz 6 5, Faz 7 20, Faz 8 2. A 885 / 1.022 |
| 2026-11-12 | v1.1 | Faz 2b kapandı (CI `4d844ce`'ye kadar yeşil, kullanıcı teyidi): ayrıntı `docs/archive/PHASE_2B.md`'ye taşındı, planda özet; A 885 / 1.022, ertelenen Forge kontrolleri faz kapılarında. Sıradaki: Faz 3 |
| 2026-11-12 | v1.2 | Faz 3 başladı: döküm (36 INV satırı, ertelenen 40 A, Faz 3'e düşen 92 R: 58 yeniden yaz / 34 düşer), içe aktarıcının Faz 3 çeviricileri ve tasarım kullanıcı onayıyla ("hepsi öneri gibi"; mimari v1.6): terrain salt çizimi Faz 3'te, `render.ts`'i render host toplar, Forge kalite merdiveni + WebGPU izin alanları (Cinematic merdiven dışı), MRT biçim sıkıştırmasıyla 30 bayt, `forge.material` şemalı JSON asset türü, GPU timer kontrolü D (payda 1.021, kalite adımında), worldSettings alanları sahibi özelliğin tekiline, sürekli gün döngüsü yok, HLOD 5b, cihaz kaybında v1 yeniden yükle. Kod yok; sırada adım 1 (dikey dilim) |
| 2026-11-13 | v1.3 | Faz 3 adım 1, dikey dilim (`093a77c`): `src/render/{host,resources,materials,pipeline,sync,viewer}`; `WebGPURenderer` (timestamp, reversed-Z), backend kanıtı + `data-forge-perf` + rozet, DPR / resize, cihaz kaybı v1; boot'un `render` aşaması; `defineRenderBinding` + `main.ts` toplaması + `feature-does-not-name-render`; GUID anahtarlı kaynak önbelleği (iki World testi), `GET /__forge/asset-files`, glTF KTX2 + meshopt three'nin libs'iyle; `forge.shape` / `forge.staticMesh` / Height Fog (TSL) çizimi, varsayılan güneş; `npm run smoke:render` (`@playwright/test` 1.61.1) L03'te gerçek WebGPU'da yeşil, aday görüntü depo dışında. 1.537 test, kapı yeşil. A 885 / 1.022; R akıbetleri `PORT_LOG` §2. Mimari v1.7 |
| 2026-11-13 | v1.4 | Faz 3 adım 2 (`620cb3e`, `dff1176`): `engine/perf/{qualityProfiles,adaptiveQuality,hardwareHints}` ve `engine/persistence/userSettingsStore` taşındı, 17 ertelenmiş A yeşil (`port:forge tests --deferred`), GPU timer kontrolü D (payda 1.021); `src/runtime/quality` kalite sürücüsü (Forge `RuntimeSceneApp`'in kuralları), renderer piksel oranı ve perf witness profili; WebGPU izin alanları (`traaAllowed`, `ssrAllowed`, `ssgiAllowed`, `aoResolutionScale`), eşleme Balanced / GTAO'suz Balanced / Compatibility, merdiven dışı `cinematic`. Smoke `high` profiliyle yeşil. 1.564 test, kapı yeşil. **A 902 / 1.021**. Mimari v1.8 |
| 2026-11-13 | v1.5 | Faz 3 adım 3 (`c14e11f`, `4b9a640`): `engine/world/{sunCascades,followShadow}` taşındı (18 A); `forge.light` (`forge.directionalLight` / `pointLight` / `spotLight`, güneş `atmosphereSun`), kaskatlı güneş `CSMShadowNode` (Forge bölmeleri), öteki gölgeli yönlü ışıklar takipli harita, ana gölge anahtarı host'ta; içe aktarıcı `lights[]` çevirir (güneş Forge kuralıyla), rapor / `--compare` sayar. Kullanıcı kararı: statik gölge varsayılanları bileşen başına (`castShadow`, adım 4). Smoke gerçek ve scratch referansta yeşil; referans projesinin `--force` ile yeniden alınması kullanıcı onayında. 1.595 test, kapı yeşil. **A 920 / 1.021**. Mimari v1.9 |
| 2026-11-13 | v1.5 | Referans projesi (`webgpu-scenes`) kullanıcı onayıyla ışık çevirisiyle yeniden alındı: 7 level'da `--compare` ışık 1 / 1 ve aktör sayımları eşit, `check:projects` ve smoke (L03, kaskatlı güneş) yeşil |
| 2026-11-13 | v1.6 | Faz 3 adım 4 (`f6aa509`, `203714e`, `04409af`, `6f02c42`): asset perf raporu taşındı (3 A; taşıma araçları `tools/`'u da tarar); çekirdek şemalı JSON asset türü + isteğe bağlı renk, SDK 0.1.2; `forge.material` ve sürüm 2 `forge.texture` / `model` / `staticMesh` / `shape` / `terrain`; Forge materyal normalize'ı içe aktarıcı okuyucusu, materyal / model yan dosyası / yerleşim renk-gölge-materyal / landscape materyali çeviricileri; starter paketine 10 materyal ve uyarlanan A kontrolü; TSL materyal (slot düğümleri, katman karışımı, normal hareketi), katkı sırası + world mask, doku / materyal önbellek anahtarları, model hazırlığı (normal, anizotropi, UVW, slotlar), static mesh slot / tint / `castShadow`. Kullanıcı kararları: boş tint, `enabled` grupları, `name` / preset, `materialSlot` her slota. Referans projesi kullanıcı onayıyla yeniden alındı; smoke gerçek WebGPU'da, L03 zemini slot materyaliyle. 1.643 test, kapı yeşil. **A 924 / 1.021**, Faz 3'te ertelenmiş A kalmadı. Mimari v1.10 |
| 2026-11-13 | v1.7 | Faz 3 adım 5, çevre (`69a9be7`, `c3c4d07`, `f092bc5`): `engine/world/viewDistance` 5b'den öne alındı (10 A, sisin CPU ikizi R'si yeniden yazıldı); `forge.skyAtmosphere` / `forge.skyLight` / `forge.cloudLayer` / `forge.worldEnvironment` (sabit saat, WES servisi); içe aktarıcı çeviricileri (rapor ve `--compare` sayar), World Builder greybox görünümü; TSL gökyüzü + ay + yıldız, PMREM Sky Light, bulut kubbesi, WES yorumu kare başına, gökyüzü varken ACES × 0,2. Kullanıcı kararları: arka plan / ortam ışığı Sky Light'ta, ton eşleme Forge kuralıyla şimdi, `viewDistance` öne. Smoke yeniden alınmış kopyada gerçek WebGPU'da yeşil; referans projesinin yeniden alınması kullanıcı onayında. 1.683 test, kapı yeşil. **A 934 / 1.021**. Mimari v1.11 |
| 2026-11-13 | v1.7 | Referans projesi (`webgpu-scenes`) kullanıcı onayıyla çevre çeviricileriyle yeniden alındı: 7 level'da gökyüzü / Sky Light / bulut / WES sayımları `--compare`'de eşit, `check:projects` ve smoke (L03) gerçek WebGPU'da yeşil; ForgeReference README'si ve içe aktarma raporları güncellendi |
| 2026-11-13 | v1.8 | Faz 3 adım 6 (`5d8c8cc`, `7e202d4`): `forge.postProcess` (+ TRAA, SSR seçimi) ve içe aktarıcı çeviricisi, `applyQualityToPostProcess` bileşen verisine; TSL `RenderPipeline` (MRT'li sahne pass'i, GTAO / SSGI / SSR / TRAA / SMAA / DoF / bloom / renk düzeltme / renk sapması / vignette / gren, ton eşleme), MRT 30 bayt + profil başına test + cihaz sondası, çıktı dönüşümü bağlamalardan önce. Kullanıcı kararları: gökyüzü kubbesi Post Process altında kendi pozlamasıyla, SSGI AO'nun yerine, pipeline'sız çizimde MSAA. 9 R yeniden yazıldı, 1 düştü; A 934 / 1.021 |
| 2026-11-13 | v1.8 | Referans projesi (`webgpu-scenes`) kullanıcı onayıyla Post Process çeviricisiyle yeniden alındı: 7 level `--compare`'de eşit (L03 ve Derekavak'ta `forge.postProcess`), `check:projects` ve smoke (L03 pipeline'la, gerçek WebGPU) yeşil; ForgeReference README'si ve içe aktarma raporları güncellendi |
| 2026-11-13 | v1.9 | Faz 3 adım 7, olay bazlı gün saati (`1930135`, `3e87850`, `66d34a6`, `dac9605`): `timeTransition` (saf, testli), `WorldEnvironmentService.transitionTo` (`Promise<boolean>`, hep ileri; kullanıcı kararları) alt sistemin tick'inde; Sky Light yakalaması aynı PMREM'e (materyal yeniden kurulumu kalktı), yakalama hızı ölçümle (kullanıcı kararı: Forge açı politikası + 0,1 sn sınır + güneş durunca son yakalama); `npm run measure:sky-capture` (NVIDIA Ampere: yakalama ~3,3–3,5 ms GPU, 5 sn geçişte 69 → 38 yakalama, ardışık en çok 1). A 934 / 1.021 değişmedi; render smoke yeşil |
| 2026-11-13 | v1.10 | Faz 3 adım 8, görüntüleyici (`992560a` instancing, `5897915` katman materyali GUID + veri belgesi başvuruları + paket `requires` (SDK 0.1.3, starter'a 2 materyal), `615cfdd` terrain salt çizimi, `1f28c22` varsayılan kamera, `e887fca` `?debug` paneli, `432c7c3` smoke level'ları); kullanıcı kararları (katman materyali GUID, paket `requires`, `?debug` kapsamı); 6 + 8 Forge kontrolü M'den etiketle taşındı, A 934 / 1.021 değişmedi; smoke 7 level + kamera + `?debug` gerçek WebGPU'da yeşil |
| 2026-11-13 | v1.10 | Referans projesi (`webgpu-scenes`) kullanıcı onayıyla yeniden alındı: terrain belgelerinde katman materyalleri GUID (Derekavak, Island, OpenWorldTest, WbPilotValley); 7 level `--compare`'de eşit, `check:projects` yeşil; ForgeReference README'si güncellendi |
| 2026-11-13 | v1.11 | Faz 3 adım 9 (`38dcc56`, `5a71a75`): render smoke tam seti (4 terrain level × Faz 0 P1–P3, L03, 2 çerçeveli level; 15 çekim, 1920 × 1080 DPR 1, pozlar `baseline/poses.json`'dan), `npm run smoke:grid` (Faz 0 WebGL | WebGPU yerel sayfası); ızgarada bulunan hata düzeltildi: güneş dönük aktörün altındayken `CSMShadowNode` kaskatları görüşü ıskalıyordu, terrain level'larında statik gölge yoktu (yönlü ışıklar dünya çerçevesinde, yeni test). Farklar kullanıcıya listelendi (foliage 5c, su 7, araçlar 6 / 8, gölge kenarı, orta mesafe tonu) |
| 2026-11-13 | v1.11 | Faz 3 kapandı: kullanıcının görsel kabulü; referanslar `--update-snapshots` ile yazıldı, ikinci koşu 15 / 15 karşılaştırmada; kapı A 934 / 1.021, Faz 3'e ertelenmiş A yok; "Işık ve gölge" kutusu işaretlendi, view distance 5b'ye (kullanıcı kararı, seçenek a). Ayrıntı `docs/archive/PHASE_3.md`'ye taşındı, planda özet; mimari v1.15. Sıradaki: Faz 4 (editör çekirdeği) |
| 2026-11-13 | v1.12 | Faz 4 başladı: döküm (36 INV satırı; Faz 4'e ertelenmiş A yok; editör alanında 11 R, 27 M niyeti kabul ölçütü) ve tasarım kullanıcı onayıyla ("önerileri kabul ediyorum"; mimari v1.16): editörün 3B kodu `src/render/editor/` + rol `features/*/editorRender.ts`, Forge'un gizmo'su, World `actorsChanged`, ajan komutları kayıt servisi modülüyle + editörün canlı tazelenmesi + `find` / `show`, motor içeriği kipi `--engine-content`, asset editörleri genel veri editörü + önizleme, Play oturum katmanı, küçük resim önbelleği, grup = boş aktör, editörde bütün hücreler, editör smoke'ları CI'da `forceWebGL`. Adım sırası 1–10 |
| 2026-11-13 | v1.13 | Faz 4 adım 1, UI kiti (`210ed40`): `src/editor/ui` — core form tanımından Details satırları (her alan türü, Forge'un parametre kuralları saf fonksiyonla, Türkçe sınır uyarısı, dönüş derece ↔ kuaterniyon `engine/math/euler.ts`), Forge'un ikonları ve CSS token'ları; `?editor-kit` geliştirme sayfası; `npm run smoke:editor` (başsız Chrome) gate'te ve CI'da. A 934 / 1.021 |
| 2026-11-13 | v1.14 | Faz 4 adım 2 dilimi (`ba97b6f`, `9119c42`, `a67220d`, `f3ee39b`, `d67845d`): **kullanıcı kararı** editör World'ü yalnız `inEditor` alt sistemleri kurar (render, World Environment, Height Fog); `World.updateActors` + `actorsChanged` (SDK 0.1.4); `editor-render-is-editor-only`; editör oturumu (oturum → World yansıması, çocuğu kalan aktör silinmez); `?editor` kabuğu (Outliner, Details transform'u, undo / redo / kaydet); editör smoke'u geçici proje kopyasında, `forceWebGL`, gate'te ve CI'da; `verify:dist`. Kalan 2b: üretim build'i (içerik dist'te, salt okunur istemci), `base`, `--strict`. A 934 / 1.021 |
| 2026-11-13 | v1.15 | Faz 4 adım 2 tamam, 2b (`eea148b`; **kullanıcı kararı:** üretim build'i Faz 4'te): `npm run build` projeyi derler, `tools/build-content.ts` içeriği ve dizinleri `dist/forge/`'a yazar, oyun salt okunur statik istemciyle `BASE_URL` altından okur; kapıda `verify:dist --strict` ve `npm run smoke:dist` (alt dizinde açılış, bütün istekler alt dizinde). Dist kutusu işaretli. A 934 / 1.021 |
| 2026-11-14 | v1.17 | Faz 4 adım 4 tamam, gizmo / snap / pivot (`d26ab2f`, `3721d11`, `1d79c16`, `63cc3b6`): **kullanıcı kararı** pivot aktör belgesinde (`pivot`, yalnız editör); sürükleme matematiği three'siz `engine/gizmo` (ışın-eksen en yakın noktası, kuaterniyon dönüş, çoklu seçim, ebeveyn uzayı), 11 R yeniden yazıldı; zemin / duvar snap'i picker ışınlarıyla; instancing transform hızlı yolu; gizmo çizim katmanında, araçlar ve snap widget'ları, Details'te pivot ve yerleştirme; editör smoke'u gizmo'yla. A 934 / 1.021 |
| 2026-11-14 | v1.16 | Faz 4 adım 3 tamam, editör viewport'u (`af6b334`, `1bfeffe`, `2cbed7f`, `1cf02e4`): editör kamerası (Forge'un denetleyicisi ve kipleri, ortografik kamera 1.000 m geride), çizim katmanı (sahne derinliğine karşı; pipeline'sız karede derinlik ön geçişi), ızgara, picking etiketleri ve CPU picker (instance → aktör, terrain yükseklik alanı), seçim çerçevesi, F / Esc / Ctrl+tıkla, View Mode / Quality / Show menüleri, `editorRender` bağlamaları + ışığın yardımcıları. Çizim katmanı kutusu işaretli. A 934 / 1.021 |
| 2026-11-14 | v1.18 | Faz 4 adım 5 tamam, paneller (`aa3726d`, `1a36338`, `e3f44f6`, `c887976`, `15a704b`, `1963a77`, `cd55e12`): **kullanıcı kararları** (hepsi öneri) Outliner ölçümü ayrı bench, override satırda, Add Actor girişleri + sınıflar, World Settings = level ayarı + tekil ortam aktörleri, `locked` belgede / gizleme görünüm, Add / Remove Component, Ground Mist + World Environment önizlemesi, pano JSON; sanallaştırılmış Outliner (50.000: ilk kurma 47,8 ms, seçim p95 3,5 ms, kaydırma 0,9 ms, arama 23,1 ms), şemadan Details ve çoklu seçim, düzenleme işlemleri ve gruplama, Add Actor + sürükle-bırak, World Settings, kısayol tablosu, Outliner sağ tık menüsü; `defineFeatureEditor` (SDK 0.1.5–0.1.7); editör smoke'u 28 test. A 934 / 1.021 |
| 2026-11-14 | v1.19 | Faz 4 adım 6 tamam (6a–g): Content Browser, küçük resim, referans güvenli dosya işlemleri, yeni asset / klasör, import / reimport, viewport’a sürükle-bırak, Open Level ve Browse To; `397e8d2` motor içeriği kipi, kökler arası kopyalama reddi, sınıf tazeleme, motor level kayıt / 409. DOM panelleri kutusu kapandı; SDK 0.1.9 değişmedi. Kapı yeşil: 1.946 test, 39 editör ve 1 dist smoke. Mimari v1.22; asset editörleri adım 7’de |
| 2026-11-14 | v1.20 | Faz 4 adım 7 tamam (`3545277`): ortak asset oturumu / pencere; şemadan form ve sanal tablo (A13); materyal küresi, static mesh slot / UVW gizmosu / vertex doldur-sil, aktör sınıfı bileşen ağacı ve varsayılanları; tek canvas / GPU üzerinde taslak önizlemesi; sınıf kaydında görünür level / hücre override koruması, kirli level verisi korunarak sahne tazeleme. SDK 0.1.10 (API `bb3bd9b259905ae0`), HTTP / asset şemaları aynı. Tam gate: 1.957 test, 47 editör + 1 dist smoke; başlıklı gerçek WebGPU asset 8/8 ve son sınıf döngü kontrolü, render smoke 17/17; referanslar değişmedi. Mimari v1.23. Sıradaki adım 8: Play + gelişmiş 409 akışı |
| 2026-11-14 | v1.21 | Kullanıcı kararı: WES ile prosedürel bitki tasarımı birleştirildi (bitki planı v0.6, mimari v1.24). Kalıcı bitki ailesi, tekil aktör / foliage ortak tepki sistemi, mevsimsel yapraklılık / renk, rüzgâr ve görsel kar / ıslaklık; olay bazlı saatten ayrı birikim süresi; PG0–PG3 küçük üretim 5c ile, tam araçlar PG5 / 5d ile. 5a / 5c / 5d kapsamı ve PV-WES kabul koşulları güncellendi. Yalnız belge değişikliği; kod / bağımlılık değişmedi, uygulama başlamadı ve kutu kapanmadı. Forge WES belgesi salt okunur tarihsel referans |
| 2026-11-15 | v1.22 | Faz 4 adım 8 tamam (`0494b0c`, `b424fcf`, `35cc624`, `327013c`, `3375fe8`): **kullanıcı kararları** (hepsi öneri) birleştirme alan düzeyinde, Reload / birleştirme undo geçmişini temizler, Play yalnız açık level'ın kirli dosyaları, salt okunur projede Play çalışır. Play oturum katmanı (`POST/GET /__forge/play`, `read?play=`, `.forge-session/<id>/`, en fazla 8, sunucu açılışında silinir), editörde Play düğmesi ve P, oyun `?play=<id>` (editör kamerasından, yeniden yüklemede de); `core/edit/merge.ts`, `LevelSession` tabanı / `compare` / `rebase`; level 409 şeridi ve Compare penceresi, asset penceresinde Compare. "Kaydet / aç, Open Level, Play" kutusu kapandı. Tam gate: 1.985 test, 53 editör + 1 dist smoke; adımın 14 tarayıcı testi gerçek WebGPU'da, render smoke 17/17, referanslar değişmedi. SDK yüzeyi değişmedi. A 934 / 1.021. Mimari v1.25. Sıradaki adım 9: ajan komutları + canlı tazeleme |
| 2026-11-15 | v1.23 | Faz 4 adım 9 tamam (`293f9a1`, `549a916`, `23fe6bb`, `2cd6854`, `b6fc44a`, `d53e1c9`, `592839b`): **kullanıcı kararları** (hepsi öneri) süreçler arası kayıt kilidi, olay kanalı Vite HMR'ı (`forge:files`), ortak işlemler `src/engine/edit`, `add` sınıf / bileşen türüyle, toplu kip, asset penceresi de tazelenir, motor içeriği ve paketler yalnız okunur. `.forge-journal/save.lock`; `tools/server/authoring.ts` (dev server ve komutların ortak modülü), dev server'sız `SaveClient`; `npm run forge -- edit` (`add` / `move` / `delete` / `set` / `reset`, `find` / `show`, `--json`, stdin); içerik kökleri klasör klasör izlenir (Vite'ın izleyicisi ve özyinelemeli `fs.watch` smoke'ta olay kaçırdı); temiz level kendiliğinden tazelenir, kirliyse 409 şeridi. Bulunan iki hata: şema yükleyicinin kısa ömürlü Vite'ı açık dev server'ın `node_modules/.vite`'ını siliyordu (kendi geçici önbelleği), oluşturulmuş `.forge/tsconfig.json`'suz projede oyun modülü yüklenmiyordu. "Ajan düzenleme komutları" kutusu kapandı. Tam gate: 2.021 test, 57 editör + 1 dist smoke (`forceWebGL`; gerçek WebGPU koşusu yapılmadı). SDK yüzeyi değişmedi. A 934 / 1.021. Mimari v1.26. Sıradaki adım 10: editör smoke tam seti → kapı → kapanış |
| 2026-11-15 | v1.24 | Faz 4 kapandı, adım 10 (`90ee6be`, `1c0fbbc`, `69516ed`, `e673c7d`): **kullanıcı kararları** (hepsi öneri) oyunun editör tarafı bu adımda en küçük haliyle, `npm run smoke:editor:webgpu`, testler `console.error` ve 4xx / 5xx yanıtları da hata sayar. Forge'un `editor-authoring` karşılığı ve kapsamdaki editör smoke adımları (Rotate / Scale gizmo, Top picking, boyut değişimi, Play'de Quality ve Make Default, Outliner aralıkları, dar menü); ortak `tests/editor/support.ts`; oyunun `editor.ts`'leri `virtual:forge/game-editors` ile editörde (INV-A32). Bulunan hatalar: kayıt sürerken Save yeniden açılıyordu; dispose'dan sonra dosya olayı paketi gidebiliyordu; adım 9'un iki testi Windows'ta koşmuyordu. Kapı: tam gate (2.026 test, 66 editör + 1 dist smoke, `verify:dist --strict`), gerçek WebGPU 66 / 66, `bench:outliner` (50,1 / 4,8 / 1,2 / 25 ms, 23 satır), A12. Bütün kutular işaretli; bölüm `docs/archive/PHASE_4.md`'ye taşındı. SDK yüzeyi değişmedi. A 934 / 1.021. Mimari v1.27. Sıradaki: Faz 5 (5a önce) |
| 2026-11-15 | v1.25 | Faz 5 başladı: Faz 5 dökümü (29 INV satırı, ertelenen 60 A; 5b'nin sayısı 44'e düzeltildi, view distance Faz 3'te taşınmıştı) ve 5a tasarımı kullanıcı onayıyla (kararlar 1–7, adım sırası 1–8; mimari v1.28): kıyı ıslaklığı ve kostik Faz 7'ye, `forge.puddle` bileşeni + planar yansıma, tile akışı worker'da ve editörde, G8 collider eşleşmesi testle (World bağı Faz 6), WES `surface` örtüsü simülasyon süresiyle, `?debug` terrain haritası, öksüz tile `verify:assets`'te. Faz 6 bekler (kullanıcı kararı). Sıradaki: 5a adım 2 |
| 2026-11-15 | v1.26 | Faz 5a adım 2 tamam: terrain tile akışı — `engine/world/worldStreamingSubsystem` (5b'den öne), `engine/terrain/terrainRuntimeStreaming`, terrain worker'ı ve `render/resources/terrainWorkerPool`; global harita parçasıyla akış kararı (`render/resources/terrains`), `render/sync/terrainView` (Forge'un slot / yerleşim / kesim / etek kuralları, gölge ışıkları dahil), önbelleğin `track` / `busy`'si ile hazır olma. 19 A taşındı → **A 953 / 1.021** (5b'de ertelenmiş 25). Gerçek WebGPU render smoke'u 17 / 17; OpenWorldTest 26 / 256, Derekavak 29 / 64 tile okuyor. Mimari v1.29. Sıradaki: 5a adım 3 |
| 2026-11-15 | v1.27 | Faz 5a adım 3 tamam: terrain katmanları üretim kalitesinde — `render/materials/terrainLayerArray` (Forge'dan; katman başına açık çevirme, pürüzlülük paketleme), `render/materials/terrainDetail` (statik detay TSL), materyal: albedo + normal dizileri, alfa pürüzlülük, teğet uzayında katman normali, delik `maskNode`, half-float normaller, kalite kancaları. 10 R yeniden yazıldı; A 953 / 1.021 değişmedi. Render smoke'u gerçek WebGPU'da 17 / 17. Mimari v1.30. Sıradaki: 5a adım 4 (global harita ve `?debug` terrain haritası) |
| 2026-11-15 | v1.28 | Faz 5a adım 4 tamam (`af96fc2`): `?debug` terrain haritası (Forge'un `debugTerrainMap`'i, `render/viewer/debug`) ve okumada akış satırları; akışlar sahnedeki debug etiketinden (`render/sync/debugTags.ts`), anlık görüntü saf (`engine/terrain/terrainStreamingDebug.ts`). Global harita, kaplama ve ışın eşdeğerliği testleri: 8 R yeniden yazıldı. Hata: pick yüzeyi yüklenmemiş tile'da far map'i datum kadar aşağıda okuyordu, Forge gibi yerel çerçeveye alındı. A 953 / 1.021 değişmedi. Render smoke'u gerçek WebGPU'da 17 / 17. Mimari v1.31. Sıradaki: 5a adım 5 (collider eşleşmesi, G8) |
| 2026-11-15 | v1.29 | Faz 5a adım 5 tamam (`523f0fb`): G8 collider eşleşmesi. CPU ikizi `engine/terrain/terrainVisualHeight` (vertex gölgelendiricisinin karşılığı); Node testi ikizi Rapier heightfield'ıyla (tam çözünürlükte ≤ 0,05 mm). GPU: terrain materyalinin yükseklik sondası, `render/sync/terrainHeightProbe`, ölçüm `render/viewer/debug/terrainColliderMatch` (yalnız dev, `__forgeDev.terrainColliderMatch`), render smoke'u `terrainCollider.smoke.ts`: Derekavak / OpenWorldTest / Island tam çözünürlükte ≤ 2,9 mm, GPU = CPU ikizi ≤ 0,8 mm. Rapier Vite `optimizeDeps`'inde. World bağı Faz 6. A 953 / 1.021 değişmedi. Render smoke'u 20 / 20. Mimari v1.32. Sıradaki: 5a adım 6 (su birikintisi + içe aktarıcı) |
| 2026-11-15 | v1.30 | Faz 5a adım 6 tamam (`1e8fe09`): su birikintisi. **Kullanıcı kararları:** bileşenin dünya konumu = tohum + su seviyesi, bileşende `size`; yatak tohumun altındaki terrain (otomatik); rüzgâr WES `wind`'den adım 7'de; smoke dev kancasıyla, referans projesine dokunulmaz. `forge.puddle@1` (Forge'un alanları), saf modüller taşındı (havza doldurma, rüzgâr hareketi, dalgacık sektörleri: 3 A), render bağlaması (otomatik terrain, dilimli doldurma, önceki yüzeyi koruma, `PuddleStatusKey`), TSL su + `reflector()` seçimi (en çok 2, kalite tavanı), Details'te durum (SDK 0.1.11 `target()`), Add Actor, içe aktarıcı `puddleWaters` çeviricisi. **A 956 / 1.021.** Render smoke'u 21 / 21 (birikinti smoke'u: 117 m², çizim çağrısı 349 → 681), editör gerçek GPU'da 67 / 67. Mimari v1.33. Sıradaki: 5a adım 7 (WES kar / ıslaklık örtüsü + `wind`) |
| 2026-11-15 | v1.31 | Faz 5a adım 7 tamam (`ad024bd`): WES v2 migration, bağımsız örtü hedefleri ve simülasyon oranları, A7 ortak state, terrain kar / ıslaklık katkısı, geçici editör önizlemesi, level / WES rüzgârı ve Forge'un birikinti rüzgâr bloğu TSL'de, içe aktarıcı + değerleri denetleyen --compare. Kullanıcı kararları uygulandı; SDK 0.1.12. Kapı 2.101 test, 68 editör + 1 dist; gerçek WebGPU render 22 / 22, editör 68 / 68. A 956 / 1.021 değişmedi. Mimari v1.34. Sıradaki: adım 8 (öksüz tile ve 5a kapısı); 5a kutusu açık |
| 2026-11-16 | v1.32 | Faz 5a adım 8 teknik tamam: öksüz terrain parça denetimi `verify:assets` / `check:projects`, kalan 1 A taşındı (A 957 / 1.021); §2.10 ölçümü 25 / 25, en yüksek 1440p ortalama / p95 9,83 / 11,20 ms, yeni sekme Play 3,48 sn; kapı 2.106 test + 68 editör + 1 dist, gerçek WebGPU render 22 / 22 ve editör 68 / 68, G8 ≤ 2,93 mm. Görsel adaylar `smoke:grid#terrain-effects` içinde. Kullanıcı görsel kabulü bekleniyor; 5a kutusu açık ve arşivlenmedi. Mimari v1.35, SDK değişmedi (0.1.12). Sıradaki: görsel kabul, sonra 5b / 5c dökümü |
| 2026-11-16 | v1.33 | Kullanıcı Derekavak canlı görünümünü kabul etti; Island'da kamerayı izleyen koyu dörtgen: r187 takip gölgesinin ters derinlikte alt Z sınırı eksikti. `BoundedShadowNode` + CSM / takip kaynak geçişi; GPU'da boş harita farkı 36 → 0, gerçek kutu gölgesi korundu. Kapı 2.107 test + 68 editör + 1 dist (4 Vitest worker); render mevcut 22 + yeni 2 GPU regresyonu ve gerçek WebGPU editör viewport / ortam / Play 10 / 10. Island gerçek sahnede aynı pozun önce / sonra çekimi doğrulandı. SDK / A değişmedi; mimari v1.36. Island son canlı kabulü bekleniyor, 5a açık |
| 2026-11-16 | v1.34 | Kullanıcı kararıyla yalnız sistem: World Settings → Shadows genel anahtarı (`forge.light` içinde tekil `forge.shadowSettings@1`, yoksa açık), nesne tercihlerini koruyan render kapısı + kalite sınırı; ayrı Enable / Disable on Objects tek Undo, sınıf örneklerine override, yüklenmemiş hücrede atomik ret. Yeni şekil / model gölge varsayılanı açık kaldı. Sistem kurulumu Island verisine yazmadı; son karşılaştırmada düzenlenebilir kopyada 15:58'de kaydedilmiş 8 dosya güncellemesi görüldü (581 şeklin gölgesi açık), eşzamanlı kayıtlar korundu; asıl referans değişmedi. Kapı ikinci tam koşuda 2.113 test + 72 editör + 1 dist geçti; ilk koşudaki Content Browser silme / thumbnail 404'ü bağımsız ve tam tekrarda görülmedi, bu kapsamda kaynak / test beklentisi değiştirilmedi. Gerçek WebGPU yeni gölge testleri 4 / 4 (görüntü aç / kapa / geri dönüş, kalite, Undo, kayıt ve Play), tam render 24 / 24. SDK / A değişmedi; mimari v1.37. 5a son canlı kabulü açık |
| 2026-11-16 | v1.35 | Kullanıcı Faz 5a görsel kabulünü onayladı; Island son canlı kabulü dahil bekleyiş kapandı ve 5a Terrain kutusu işaretlendi. Mevcut teknik kapı / ölçüm kayıtları korundu; yeni test koşusu veya referans görüntü yenilemesi yapılmadı. A 957 / 1.021, SDK 0.1.12 değişmedi; mimari v1.38. 5b–5d ve Faz 5 toplu kapısı açık; Faz 5 bölümü arşivlenmedi. Sıradaki: 5b / 5c dökümü ve kararları |
| 2026-11-16 | v1.36 | Faz 5b dökümü ve kararları (kullanıcı): menziller level ayarında (`viewDistance`, `loadRange` 384 m), HLOD level klasöründe + `forge hlod` komutu, mesafe LOD 5b'den çıktı (meshlet hattı konuşulacak), kapı sentetik büyük level'da `measure:streaming`; runtime / editör hücre akışı, residency, detay culling (hücreye bölünmüş batch), World Partition paneli A11'in uygulaması. 11 adım, Codex adımları işaretli (2, 7, 9, 10 ve test dilimleri). Ertelenen 25 A; kod yok; mimari v1.39 |
| 2026-11-16 | v1.37 | Faz 5b ilerlemesi HEAD `63815f9`'a kadar doğrulandı: adım 1 `65b5efd`; 2 saf modüller + HLOD `4cef956` (25 A, A 982 / 1.021); 3 ayarlar / UI / kamera / içe aktarıcı `89b6a87`, `de8654d`; 4 runtime hücre akışı `c7a5174`, 32 aktör / 3 ms / 16 MiB `63815f9`; 5 kaynakların 30 sn sonra atılması `045964c`; 9 HLOD build `d8676b4`, runtime çizimi `dddd81b`, Mesh dispose olayı `63815f9` (editör adım 6'yı bekler); 10 üretici `f202569`, ölçüm düzeneği `63815f9`. Mevcut son JSON: ilk uçuş p99 / max 9,4 / 57,7 ms (20 / 50 ms; max aşıyor), sıcak dönüş 10 / 31,1 ms; kararlı döngü sayaçları eşit, harness heap artışı %0,91. Ölçüm kabulü AÇIK; pipeline derlemesi hipotez, compileAsync ön ısıtma yalnız öneri. Adım 6, 7, 8, 11 ve 5b kutusu açık; arşiv yok. Yeni test / gate / ölçüm yok; mimari v1.40 |
| 2026-11-17 | v1.38 | Faz 5b adım 6–7 ve editör HLOD uygulandı: kısmi oturum / atomik ret / kirli hücre tutma / canlı tazeleme, Outliner WP sekmesi ve harita; Codex çekirdek ve panel diff'leri incelendi. TSL detay fade geometri ve gölgede; hücre bölmesi 398 → 713 draw call nedeniyle kullanıcı onayıyla geri alındı ve 5c öncesi G6 / meshlet spike'ına bırakıldı. Kullanıcı onaylı compileAsync batch hazırlığı ve HLOD hazır olma bağı; async GPU nesne ömrü, render target / MRT geri yükleme, statik isteğe bağlı HLOD ve kısmi Compare regresyonları düzeltildi. Tam gate'in Vitest 2.215 / başsız editör 76 adımları geçti; dist düzeltme sonrası 1 / 1; son değişiklikler odaklı test / tip kontrolüyle. Gerçek WebGPU editör 76 / 76, render 23 + odaklı 2 / 2 (25 kontrol); referans görüntüler yenilenmedi. A 982 / 1.021, SDK 0.1.12 değişmedi. Nihai streaming ölçümü ve kullanıcı HLOD / fade görsel kabulü açık; 5b kapatılmadı, arşiv yok. Mimari v1.41 |
| 2026-11-17 | v1.39 | Faz 5b adım 10 ölçümü geçti: temiz a6f3521 (kod 1e1c987), 50.000 aktör / 1.024 hücre, gerçek WebGPU 1080p high DPR 1 uncapped. 2026-11-17T07-06-57-259Z-streaming.json: ilk uçuş p99 / max 13,3 / 35,1 ms, dönüş 13,8 / 36 ms; 10 döngü ve 32 sn bekleyiş sonrası aktör / önbellek 2.583 / 63, kararlı GPU 216 / 30, heap artışı %0,34 (sınır %5). API derleme sayaçları kaydedildi; saf derleyici / nedensel kanıt değil. Kaynak atma sayacı 0 sınırı korunur. Teknik kontroller ve ölçüm geçti; kullanıcı HLOD / detay fade görsel kabulü bekliyor, 5b kutusu açık ve arşiv yok. Hücre bölmesi 5c öncesi G6 / meshlet spike'ında; push yapılmadı. Mimari v1.42 |
| 2026-11-17 | v1.40 | Faz 5c dökümü ve kararları (kullanıcı, "hepsi öneri gibi"): önce G6 / meshlet spike'ı (kod commit'lenmez), `forge.foliageType` asset'i, terrain aktöründe `forge.landscapeFoliage`, boyanmış foliage level parçası `foliage/<x>_<z>.bin`, bütün türlerde ve kaskatlarda compute culling + indirect, önce çalışma anı billboard'u, `forge.plantFamily` + `forge.plant`, içe aktarıcı çeviricileri, `measure:foliage`. 11 adım, Codex adımları işaretli. Adım 3 (Codex, Claude inceledi): `foliageRing` 8 A → **A 990 / 1.021**, prosedürel üretim saf modülleri, 25 odaklı test geçti; tam gate yok. Adım 2 spike'ı (kod commit'lenmedi): G6 gönderim sınırı foliage'sız statiklerle aşılıyor (2,9–3,1 ms); meshlet r187'de ters derinlikle devreye girmiyor; statikler + foliage `BundleGroup`'ta 1,81 ms gönderim / 2,31 ms ana iş parçacığı. Karar (kullanıcı): GPU culling + indirect + render bundle, statiklere de; meshlet ve hücre bölmesi reddedildi. Adım 3 ve 8'in kodu `c03f40d`. Adım 8'in saf çekirdeği ve kaya üreticisi (Codex) 24 testle. Mimari v1.43 |
| 2026-11-17 | v1.41 | Faz 5c adım 4: `forge.foliageType@1`, `forge.landscapeFoliage@1`, eşleyici (şema varsayılanı = Forge varsayılan türü), boyanmış foliage level parçası `foliage.json` + `FFOL` v1 hücre dosyaları ve asset dizini denetimleri (`3706bc4`); 518 core + 5 feature testi, tip / katman / `verify:assets` geçti, SDK değişmedi. Kalan: içe aktarıcı çeviricileri (Codex kotası bitti, Claude yapacak). Adım 5 tasarımı: görünüm başına compute culling, kaskatlar `layers` ile ayrı dolaylı mesh, tek `BundleGroup`, kendi draw call sayacı; alt adımlar 5.1–5.6. Mimari v1.43 |
| 2026-11-17 | v1.42 | Faz 5b: editörde otomatik HLOD üretimi (`0c16852`): WP panelinde Auto Generate HLOD + Generate / Rebuild / Save and Generate, beş durum ve son rapor; dev server'da proje başına kuyruk (`/__forge/hlod`), ayrı Node worker, `.forge-cache/hlod` tazelik önbelleği, kilitli atomik yayımlama / geri alma, canlı proxy yenileme. Claude incelemesinde foliage parçaları izlemeden çıkarıldı, durum mesajları İngilizce, okunmuş yayımlama proxy'leri yeniden düşürmez. Odaklı Vitest 96 / 96, başsız editör 78 / 78, gerçek WebGPU alt küme 11 / 11; tam gate yok. Kullanıcı Derekavak kabulü ve 5b görsel kabulü açık. Mimari v1.44 |
| 2026-11-17 | v1.43 | Faz 5c adım 4 kalanı: içe aktarıcı foliage çeviricileri (`cbad9d5`): `forge.foliageType` asset'leri (modelini getirir), terrain'de `forge.landscapeFoliage`, boyanmış gruplar (bölünmüş hücreler dahil) `foliage.json` + `.bin`; kayıt servisi `forge.levelFoliage/1`. Odaklı Vitest 78 + içe aktarıcı 11, tip / katman / dosya bütçesi / `verify:assets` geçti; geçici kopyada `--dry-run` Derekavak 7 kural / 6 tür. Referans projesi yeniden alınmadı. Sıradaki: adım 5.1 |
| 2026-11-17 | v1.44 | Faz 5c adım 5.1 (`9deff0c`): GPU güdümlü çizimin temeli `render/gpu/` (örnek storage buffer'ı ve kararlı tutamaçlar, reset / cull / args compute, LOD × parça × materyal grubu başına `drawIndexedIndirect`, `overrideNodes` ile örnek matrisi, dither fade), host ana görünümü kareden önce ayıklar, `?debug` dolaylı çizimleri sayar; CPU referansı `engine/world/instanceCulling.ts` + Node testi. Gerçek WebGPU smoke'u: Derekavak P2 foliage 370 hücre / 1.640 örnek, P2 / P1 / gökyüzü 177 / 32 / 0 görünür, GPU = CPU birebir, +9 draw. Açık soru: WebGL2 test arka ucu geri dönüşü (5.5 öncesi). Sıradaki: 5.2 kaskat görünümleri |
| 2026-11-17 | v1.45 | Faz 5c adım 5: WebGL2 test arka ucu için GPU güdümlü batch'in CPU ikizi (kullanıcı kararı, `2544bdb`): CPU referansı ayıklar, örnekli mesh çizer, aynı arayüz; sayaç saydam çift yüzlü materyalin iki geçişini sayar (P2 15 çizim). Smoke iki arka uçta geçti; mimari v1.45. 5.2 başka oturumda planlanıyor, bu oturumda başlanmadı |
| 2026-11-17 | v1.46 | Faz 5c yeni sıra (kullanıcı): 5.2 durduruldu; draw call ve üçgen ayrı. R1 HLOD'a `forge.shape` (kullanıcı kararı), R2–R4 = 5.2 kaskatlar / 5.3 bundle / 5.4 foliage, R5 sahne maliyet raporu (ajan komutu + editör Stats), R6 üçgen spike'ı (three-virtual-geometry, r187 meshlet hattının ters derinlik kopyası, 5.1 + ayrık LOD; kod commit'lenmez), R7 seçilen yolun üretimi, R8 hiyerarşik HLOD + siluet katmanı, R9 = 5.5, R10 = 5.6. three-nanite elendi. Kod yok; mimari v1.46 |
| 2026-11-17 | v1.47 | Faz 5c R1: HLOD'a `forge.shape`: three'siz primitive üreticisi `engine/procgen/shapePrimitives.ts` + three geometrisiyle eşitlik testi, yerleşim / `sourceHash` / tazelik damgası primitive + renk içerir, düzlem iki yüzlü; Derekavak 22 hücre, OUT-001 proxy'de. Odaklı Vitest 64, hlod + streaming smoke başsız ve gerçek WebGPU 5 / 5. Kullanıcı Derekavak kabulü açık; sıradaki R2 |
| 2026-11-17 | v1.48 | Faz 5c R2 (5.2): GPU güdümlü batch'ler gölge kaskatlarına çizer: görünüm başına kaynak, gölge görünümü kendi katmanında, örnek dönüşümü `castShadowPositionNode`, solma `maskShadowNode`, mesafe ana kameradan; WebGL2 ikizi aynı. Smoke iki arka uçta: her kaskatta GPU = CPU, `?debug` +60 (15 × 4 görünüm), gölge görüntüyü değiştirir. Sıradaki R3 bundle |
| 2026-11-17 | v1.49 | Faz 5c R3 (5.3): isteğe bağlı bundle (`bundle: true`, kamera başına kayıt, yeniden kayıt yalnız mesh / görünüm değişince, saydamlar dışarıda) + `npm run measure:gpu-driven`. Kazanç yok (foliage 1,54 → 1,49 ms, 1.200 draw'lık stres 20,2 → 21,7 ms): three r187 düğüm materyalli render nesnelerini her karede tam yeniler; varsayılan kapalı, kullanıcı kararı bekliyor. Sıradaki R4 |
| 2026-11-17 | v1.50 | Faz 5c R4 (5.4): `render/foliage/foliageBatches.ts`: foliage türü başına GPU güdümlü batch (LOD zinciri, kalite ölçekli solma, ekran boyundan LOD, gölge), sahip anahtarlı örnek API'si (halka adım 6, boyanmış hücreler adım 7 buna bağlanır); smoke iki arka uçta bu katmandan. Sıradaki R5 |
| 2026-11-17 | v1.51 | Faz 5c R5: `npm run forge -- stats` sahne maliyet raporu (aktör, model / materyal birleşimi, kaynak üçgen, saydam / çift yüzlü, batch ve görünüm / kaskat başına draw, foliage, HLOD); editör Stats üçgenine GPU güdümlü batch'ler (eşzamansız geri okuma). Derekavak 118 draw / görünüm, 21.360 üçgen; sentetik 182 draw, 40,4 M üçgen. Sıradaki R6 |
| 2026-11-17 | v1.52 | Kullanıcı görsel kabulleri onayladı: 5b HLOD / detay fade + otomatik HLOD, 5c R1 Derekavak şekil proxy. 5b kutusu kapandı; Faz 5 bütünü açık, arşiv yok. Referanslar yenilenmedi, yeni test / gate yok. R6 başladı; R7 karar bekler. |
| 2026-11-17 | v1.53 | R6: gerçek WebGPU P2 ve 25,8 M üçgen stres; VG / ters derinlikli r187 meshlet / 5.1 + meshoptimizer LOD, bundle ve WebGL2 ikizi. Ayrı RAF ile PassNode ölçüm sorunu giderildi; geçersiz ilk koşular dışarıda. Yoğun FrontSide statik meshlet + diğerlerinde ayrık LOD fallback önerisi karar bekliyor. Spike kodu commit edilmedi; kayıt render-refs/runs/2026-11-17-r6-triangles.json. R7 başlamadı. |
| 2026-11-17 | v1.54 | Kullanıcı R6 önerisini onayladı: yoğun uygun tek yüzlü statiklerde ters derinliğe uyarlanmış r187 meshlet; diğer materyallerde / WebGL2’de otomatik ayrık LOD; foliage mevcut 5.1 yolunda. Terrain meshlet dışında, occlusion ilk sürümde kapalı. Önceki genel meshlet reddi bu kapsamda geçersiz; R7 yeni oturumda başlayacak, üretim kodu yok. |
| 2026-11-17 | v1.55 | Kullanıcı meshlet'i şimdilik üretimden çıkardı; v1.54 hibrit seçimi tarihsel kaldı. Devam eden R7 otomatik LOD / cache / build / runtime kapsamına daraltıldı; meshlet'e özel kod ayrımı geliştiren oturumun işi, bu belge değişikliği kod temizliği yapmadı. R6 kanıtları korundu. Bağımsız konservatif GPU occlusion culling R9a olarak R9 sonrası / R10 öncesi tasarım + ölçüm / yararlıysa üretim işi şeklinde eklendi. Occlusion uygulanmadı; yanlış gizleme, gölge, ters derinlik ve net maliyet kapıları yazıldı. |
| 2026-11-17 | v1.56 | R7 otomatik LOD üretim altyapısı tamamlandı: deterministik Node cache / build, tarayıcı worker, ekran hatasıyla seçim, seçilebilir 5.1 GPU / WebGL2 CPU bağı; genel statikler R9'a kadar değişmedi. Meshlet'e özel üretim dosyaları ve pipeline bağı kaldırıldı; R6 dört kaynak hash'i kayıtla eşit. Küçük / kazançsız LOD, materyal grupları, CPU picking, fade / yerel transform, kaynak ömrü, iptal / compileAsync / HLOD hazır olma korundu. 21 odaklı test, typecheck, katman; ilgili render alt kümesi 7 / 7. Odaklı production build ve ayrı worker paketi geçti; dist tarayıcı smoke'u çalıştırılmadı. Dar P2 ek nesne ölçümünde native = Stats 438 draw, 40 dolaylı; bundle 16 replay / 0 yeniden kayıt; render / compute ayrı. G6 açık, son R6 3,03 ms. v1.55'in R9a kararı korundu; R8 / R9 / R9a / R10 başlamadı. Kod 134b2aa; docs ayrı commit, push ve tam gate yok. |
| 2026-11-17 | v1.57 | R8 kararları (kullanıcı): bundle kapalı kalır, R10 öncesi yeniden ölçülür; HLOD proxy'leri GPU güdümlü yola girmez (tek örnekli, indirect kazanç yok); slot düzeyinde kayıpsız primitive birleştirme (atlas sonra); 4 × 4 ikinci katman, geçiş `max(2 × loadRange, 6 × hücre)`; bileşen landmark işareti ve far genişlemesi. Uygulama sırası R8.0–R8.6. Kod yok |
| 2026-11-17 | v1.58 | R8.0 (`af30c37`): proxy normalleri `weld`'i engelliyordu; konum + renk, düz gölgeleme, çift yüzlüler ayrı; Derekavak HLOD 21.360 → 5.366 üçgen. R8.1 (`018c559`): şablon başına slot birleştirme (çalışma anında; cache / build türevi gerekmedi), Derekavak 118 → 15 draw / görünüm, P2 gönderim 0,711 → 0,53 ms, render smoke 29 / 29. R8.2 / R8.3 (`82c0150`): `forge.levelHlod/2` küme katmanı (`hlod/l1_<x>_<z>.glb`), çalışma anı geçişi + histerezis; Derekavak 4 küme / 1.372 üçgen; editör HLOD / akış 5 / 5 gerçek WebGPU. R8.4–R8.6 açık |
| 2026-11-17 | v1.59 | R8.4 landmark (`landmark` bileşen alanı, `landmarkDistance` level ayarı; far genişlemesi yerine köşeler far'ın içine çekilir, kaskat / culling değişmez), R8.5 rapor (`forge stats`, editör HLOD satırı), R8.6 ölçüm: Derekavak P2 sahne draw 398 → 68, gönderim 0,711 → 0,455 ms; StreamingBench HLOD 3,37 M → 1,64 M üçgen, uçuş p99 / max 8,5 / 43,6 ms. Kullanıcı görsel kabulü açık; R9 sırada |
| 2026-11-17 | v1.60 | R8 kapandı (kullanıcı görsel kabulü). R9 bulguları (R7 bağı açılmamış; yapısal değişim batch'i yeniden kurar; birleşmiş slot LOD önbelleğini ıskalar; uygun olmayan parça hata verir), kararlar (batch başına yol seçimi, ölçümle eşik; birleşmiş slot LOD'u parça zincirlerinden) ve sıra R9.0–R9.5. Kod yok |
| 2026-11-17 | v1.61 | R9.1 / R9.2 (`7724d18`; `mergeTriangleLods` Codex), R9.3 / R9.4 (batch başına yol, uygun olmayan parça instanced, LOD kökü çerçevelemenin dışında), R9.0 ölçümü (`measure:static-path`): GPU yolu dört level'da da kazandırmadı (Derekavak gönderim 0,41 → 1,21 ms), LOD önbelleği 117 / 1. Host varsayılanı `instanced`; yol kararı ve ikincil kamera culling'i açık |
| 2026-11-17 | v1.62 | R9 kapandı (kullanıcı): statikler `instanced`, GPU güdümlü yol foliage'da; yeniden ölçüm ağır / çok örnekli içerikte, dispatch birleştirme ayrı karar; R9.5 düştü. İkincil kamera görünümleri (yansıma kendi culling listesi + sayaç) R9a'nın ilk adımı. Mimari v1.59 |
| 2026-11-17 | v1.63 | R9a adım 1 (`ef12079`): kamera görünümleri (`gpuDriven.add`), görünüm rolü / katmanı (ana görünüm katman 9), yansıma = ana görünümün aynası (`mirrorCullView`); render smoke 29 / 29, yansıma görünümü iki arka uçta CPU referansıyla. Mimari v1.60 |
| 2026-11-17 | v1.64 | R9a occlusion çalışması (`5058c7b`): CPU Hi-Z referansı (`engine/world/hiZ.ts`, Codex), dev çalışma ölçümü `measure:occlusion`; Derekavak foliage üçgeninin en çok %0–21'i örtülü (iyimser sınır). Öneri: üretime alınmaz, R10'a geçilir; kullanıcı kararı bekliyor. Mimari v1.61 |
| 2026-11-17 | v1.65 | R9a iç mekân çalışması (`a017c66`; `tools/scenes/indoorScene.ts` Codex): örtülü nesne %63–69, üçgen %88–94; model başına batch'te draw kazancı 0, 16 m hücre batch'inde %45–64. Açık dünya "üretime alınmaz" önerisi geri çekildi; üretim tasarımı karar bekliyor |
| 2026-11-19 | v1.88 | Faz 6 dökümü (59 INV, ertelenen 5 A, iskele / legacy bağımlılığı) ve kararlar 1–6 (kullanıcı, öneriler): 6a–6e, FPS Sandbox karakter pilotu, birinci şahıs genel parçalar, Player Start kalıcı katman, UI widget editörü K12 kapandı, K4 / K11 6e. Kod yok |
| 2026-11-19 | v1.83 | R9c Adım 5 kapandı. S12 ile üretimde mevcut `auto` ve S1 onaylandı. Şehir karşılaştırması ve iki arka uç doğrulaması ayrı plan §5.5’te. |
| 2026-11-19 | v1.87 | R9c kapandı. Adım 4 bina akışı yürüyüş bütçesini karşıladı. Adım 6 atlas A/B deneyi draw azalttı, CPU ve GPU kabul ölçütlerini karşılamadı. Ayrı plan §5.4 ve §5.6. |
| 2026-11-19 | v1.86 | 5c kapandı (kullanıcı görsel kabulü); `forge.surfaceTextureRecipe` çıktısı KTX2, impostor bake'i kabuğu tarifinden yeniden bake eder (`a1a30c6`); `measure:rock-material` kayaların çizilmesini bekler (önceki A / C sayıları yüklenmemiş kayalarla olabilir) |
| 2026-11-19 | v1.85 | 5c adım 10–11: PG3 (KTX2 `e603b87`, kullanıcı kararı; PK7 spike: odun / yaprak ayrımı kalır), `measure:forest` (`bd09bdf` `078dcfd`): üretilmiş ormanda G6, PV-WES-01–08, geçişte pipeline +0, hücre döngüsünde sızıntı yok; statik batch attribute sızıntısı düzeltildi (`6a8a612`). 5c teknik kapısı geçti, görsel kabul bekleniyor |
| 2026-11-19 | v1.84 | 5c F3 (`0ffdcf5`): uzak billboard blokları ve uzak ton; kullanıcı: bütün uzak billboard'lar PG3 impostor biçiminde, GLB türü çalışma anında CPU bake (worker). Hand-off testi; Derekavak P2 smoke'unda billboard bloklarının %99'u modellerin üstünde, iki arka uç |
| 2026-11-18 | v1.83 | 5c adım 9 = PG2 (`fa11eb2` `b9608c8` `bc05121` `3a8dd57`): foliage rüzgârı (iki yol, gölge dahil), ortak bitki tepkisi + WES mevsim geçişi, dallanan üretici + `forge.treeRecipe`, tekil `forge.plant` ve aileli foliage aynı batch yolu ve kancası. Kullanıcı: PG2–PG3 5c içinde |
| 2026-11-18 | v1.82 | 5c adım 8, PG1 kalanı (`eea639f`): GLB yazıcısı, `forge.surfaceTextureRecipe@1`, materyal `projection` / `variation`, model `collision`, meta `generated`, `npm run forge -- generate`, starter kaya ön ayarları, `measure:rock-material` (A ekranı dolduran kayada C'den ~1,3 ms GPU fazla; `variation` ~0,1–0,2 ms) |
| 2026-11-18 | v1.81 | R9c Adım 3 ve R9b Z8–Z10 kapandı. İki katlı şehir üretimi, donanım WebGPU ölçümleri ve yeni Z6 kullanıcı görsel kabulü ayrı plan §5.3’te. |
| 2026-11-18 | v1.80 | R9c Adım 2 kapandı. Şehir ve referans sahne ölçümleriyle görsel kabul ayrı plan §5.2’de. Adım 3 (a) için dünya kutusunun bölgeye 2 cm toleransla tamamen sığması kullanıcı kararı. |
| 2026-11-18 | v1.79 | PG0 şemaları (`c0937cd`): `forge.rockRecipe@1`, `forge.plantFamily@1`, `forge.plant@1`, foliage türüne `family`; kararlar PK6 / tarif türü / LOD çıktısı (bitki planı v0.7) |
| 2026-11-18 | v1.78 | F7 = R10: `measure:foliage` (`184f00f`), halka planı kamera hareketine bağlandı; Derekavak P2 gönderim 1,01 ms / ana iş parçacığı 1,56 ms, G6 sağlandı |
| 2026-11-18 | v1.77 | F5 Foliage sekmesi + türler (`22c50c2`), F6 Landscape kuralları (`50fc01a`) ve terrain'in kural düzenlemesinde korunması (`44f4602`) |
| 2026-11-18 | v1.76 | F2 worker (`51d4788`), F4 boyanmış hücre akışı + `?debug` satırları (`1b63507`); kullanıcı: F3 PG3'le birlikte (referans içerik kullanmıyor) |
| 2026-11-18 | v1.75 | F0 referans projesine foliage (üç level, `--compare` eşit), F1 halka (`b53e4db`): Derekavak P2 1.640 örnek Node referansıyla birebir, iki arka uçta; Island P1 / WbPilotValley P3 render referansları kullanıcı kabulü bekliyor |
| 2026-11-18 | v1.74 | R9c katmanlı çizim bütçesi planı ayrı belgede (`docs/planned/LAYERED_DRAW_BUDGET_PLAN.md` v0.1; kullanıcı kararı, tek ana plan istisnası): katmanlar tablosu, sıra 1–6, şehir sahnesi tanımı, adım tasarımları, R9b Z6 durumu, açık sorular S1–S18. Kod yok |
| 2026-11-18 | v1.73 | Foliage sırası (kullanıcı): adım 6 → 7 → Foliage paneli (türler + kurallar, 5d'den öne; fırça 5d'de) → R10 → PG2–PG3 → 11; referans projesine Derekavak / Island / WbPilotValley foliage'la yeniden alınır; alt adımlar F0–F7. Kod yok |
| 2026-11-18 | v1.72 | Kullanıcı: GPU yolunda örnek başına bölge maskesi (Z3b `acb8e7f`), instanced bölme kalır; Z6 yeniden ölçüldü, Z7 belgeleri; Z6 görsel kabulü kullanıcıda |
| 2026-11-18 | v1.71 | R9b S1 (`ed3ad1b`: `auto` varsayılan, parça > 5.000 üçgen GPU yolu), Z0 (`30483f8`), Z1 (`0cb8139`), Z2 (`d6bb043`), Z3 (`319404f`), Z4 (`24fce8e`), Z5 (`07d863b`), Z6 ölçümü (`4d1df67`); GPU yolunda bölge bölmesi gönderimi büyütüyor, karar kullanıcıda |
| 2026-11-18 | v1.70 | R9b kararları (önerilerle): gizli bölge gölgesiz + bölge başına seçenek, önce yalnız görünürlük, S1 statiklerin varsayılan yolu `auto` (eşik ölçümle). Kod yok |
| 2026-11-18 | v1.69 | Kullanıcı: occlusion iptal, PVS yok; R9b bölge sistemi (otomatik + elle düzenlenen hacimler, portal görünürlüğü, bölgeye göre batch ve gölge); Z0 occlusion kodunun kaldırılması, Z1–Z7. Kod yok |
| 2026-11-18 | v1.68 | R9a O5 ağır mesh (`994c3b1`): instanced 19–20,5 ms → GPU yolu + otomatik LOD 1,75–2,1 ms → + occlusion 1,73–1,85 ms; kazanç LOD'dan, occlusion farkı gürültüde. Statik yol varsayılanı ve bölge / PVS kararı açık |
| 2026-11-18 | v1.67 | R9a O1 (`5f1ab63`) ve O2–O4 (`6510965`): occlusion level ayarı, otomatik engelleyici ön geçişi, GPU Hi-Z (Codex `gpt-6.2-sol` paket düzeni), ana görünüm örnek ayıklaması; doğru (piramit 0 fark, yanlış gizleme yok), iç mekânda %50–90 örnek gizli; sentetik sahnede GPU süresi değişmedi, gönderim arttı. Varsayılan kapalı |
| 2026-11-18 | v1.66 | R9a hücre batch'i ölçümü (`fab7066`, kapalı): iç mekân draw 4 → 63; query yolu bırakıldı. Üretim kararı (kullanıcı): örnek başına GPU occlusion O1–O5 (level ayarı, otomatik engelleyici ön geçişi, GPU Hi-Z, ana görünüm örnek ayıklaması, A/B) |
| 2026-11-19 | v1.89 | 5d dökümü (B01–B06, B08–B10, B13, E26, G21; ertelenen 4 A `worldTerrainMove`; algoritmalar 2b'de taşınmış, editör araçlarının hiçbiri yok) ve kararlar 1–6 (kullanıcı, öneriler): fırça araçları yalnız editörde, sculpt CPU'da + bölge yüklemesi, darbe başına undo ve `worldTerrainSave` kaydı, Mesh Paint çıktı, yol mesh'leri CPU'da bake, PG5 adım 9'da. Adım sırası 1–10. Mimari v1.72. Kod yok |
| 2026-11-19 | v1.90 | 5d adım 2 (`3074f3a`): Landscape sculpt — Details'te Landscape bölümü, Forge'un 8 aracı + değiştiricileri, araziye oturan halka; `TerrainEditingKey` + asset başına `TerrainEditSession` (akış sürer, düzenlenen tile `kept`), `TerrainView.updateTile`; level adımlarıyla birleşik undo (`pushStep`, `History.clearRedo`); kayıt katılımcısı tile + global harita + tanımı okunan revizyonlarla tek işlemde yazar. Editör smoke'u `landscape.spec.ts` forceWebGL + gerçek WebGPU'da geçti. Görsel kabul kullanıcıda |
| 2026-11-19 | v1.91 | 5d adım 2'nin görsel kabulü (kullanıcı). Sıradaki: 5d adım 3 (B04, B05) |
| 2026-11-19 | v1.92 | 5d adım 3 (`30fe244`): kararlar (kullanıcı, öneriler gibi: katman ekle / sil / materyal B04'te, Auto Paint kuralları `forge.landscapeAutoPaint` bileşeninde, uygulama editörde, görünüm kipi Landscape ayarlarında); Paint kipi, katman işlemleri tek undo, Auto Paint, editöre özel görünüm kipleri. `landscapePaint.spec.ts` forceWebGL + gerçek WebGPU'da geçti. Görsel kabul kullanıcıda |
| 2026-11-19 | v1.93 | 5d adım 3'ün görsel kabulü (kullanıcı). Sıradaki: 5d adım 4 (B01, B02, B08, `worldTerrainMove`) |
| 2026-11-26 | v2.19 | Faz W W2b (kullanıcı, 2026-11-26): hava bulutları ve gökyüzünü sürer (`5c38a84`): WES `weatherSky` (ön ayar başına örtü, opaklık, renk, gölge, gök kapalılığı), ışıklı bulut gövdesi, kapalı gök ve Sky Light. W2 ve W2b kullanıcı görsel kabulü bekliyor. |
| 2026-11-26 | v2.18 | Faz W W2 zamanlı hava geçişi (`f642867`): ön ayarlar pay olarak karışır, havayı okuyan her yer karışımı görür, Sky Light hız sınırında, yarım geçiş kayıttan sürer; SDK 0.1.17 `transitionWeather`. Kullanıcı görsel kabulü bekleniyor. |
| 2026-11-26 | v2.17 | Bitki planı PG5b adım 6 (`8710f0c`, v0.23): karışık orman (`stand`), genç ağaçlar, altı World Builder örtüsü; kullanıcı görsel kabulü. PG5b ve PG5 kapandı. |
| 2026-11-25 | v2.16 | Faz W W1 kapandı (kullanıcı görsel kabulü). Sırada W2: zamanlı hava geçişi (yeni oturumda). |
| 2026-11-25 | v2.15 | Faz W W0 kapandı (kullanıcı tasarım 9'un mekanizmasını onayladı); W1 yağış görseli (`49c76ce`): geç katman, yağmur / kar hacimleri, WES `precipitation` ayarları. Kullanıcı görsel kabulü bekleniyor; sırada W2. |
| 2026-11-25 | v2.14 | Bitki planı PG5b adım 5 (`e1891dd`, v0.22): türler (Maple, Birch, Oak, Poplar, Pine, Hazel) tek üreticide, meshopt'lu çıktı, eski sürümler kalktı; kullanıcı görsel kabulü. Sırada adım 6 (World Builder örtüleri). Faz W ayrı oturumda sürer. |
| 2026-11-25 | v2.13 | Faz W W0: `forge.worldEnvironment@3`, SDK `WorldEnvironmentServiceKey` (0.1.16), yağış okuması, saf yüzey durumu modeli (Codex), `measure:weather` tabanı (`cb0a856`). Kalan: tasarım 9'un mekanizma onayı (kullanıcı). Sırada W1. |
| 2026-11-25 | v2.12 | Faz 5 kapandı (kullanıcı görsel kabulü); bölüm `docs/archive/PHASE_5.md`'de. Faz W başladı: W0. |
| 2026-11-25 | v2.11 | Faz W: HK8–HK10 kapandı (kullanıcı, öneriler gibi); açık HK yok. Yüzey fiziği mekanizması (tasarım 9) W0'da onaylanır. |
| 2026-11-25 | v2.10 | Faz W: HK1–HK7 kapandı (kullanıcı, öneriler gibi); terrain yüzey fiziği yağışla değişir (kullanıcı): yüzey fiziği sözleşmesi ve W8 eklendi, kapı W9. Açık: HK8–HK10. |
| 2026-11-25 | v2.09 | Faz W (hava) açıldı (kullanıcı; yalnız plan): yağış görseli, zamanlı hava geçişi, yağış siperi, statik mesh'te kar / ıslaklık, yağışla ıslanma / kuruma, su birikintisi + halkalar, terrain kar yüksekliği; adımlar W0–W8, HV-01–12. Açık kararlar HK1–HK7 kullanıcıda. |
| 2026-11-25 | v2.05 | World Builder açık level'a kurar, sahne ayarları kalır; Outliner klasörleri (`5b8f6fa`, kullanıcı kararı; adım 8'in "yeni level" kararı kalktı). İlgili vitest 389, editör spec'leri 21 |
| 2026-11-25 | v2.04 | 5d adım 10 teknik kapı: tam kapı (2.733 test, editör 99 + 99 WebGPU), G8, ölçümler bütçede; HLOD KTX2 (`eab26b4`), `.forge-cache` izleyicisi (`ded16da`), akış ölçüm level'ı üretilmiş modelsiz. Faz 5 toplu kabulü kullanıcıda |
| 2026-11-25 | v2.03 | 5d adım 9 (PG5 E + F, `88913ec` … `f838402`): kararlar (kullanıcı, öneriler gibi); önizlemeler, onay sayfası (SDK 0.1.15), `generated` kaynağı, tekil bitki ve yerleşim ağacı, starter'a Hazel + MeadowGrass çıktısı. `worldBuilder.spec.ts` forceWebGL + gerçek WebGPU'da geçti. Görsel kabul kullanıcıda. Sıradaki: adım 10 (5d kapısı, Faz 5 toplu kabulü) |
| 2026-11-25 | v2.02 | 5d adım 8 (`54161a3`): kararlar (kullanıcı, öneriler gibi: yeni level, su notla, starter bitki / kaya, asset'ler GUID, Add Pack); World Builder penceresi, `/__forge/world-random`, önizleme worker'ı. `worldBuilder.spec.ts` forceWebGL + gerçek WebGPU'da geçti. Görsel kabul kullanıcıda. Sıradaki: 5d adım 9 (bitki tarafı, karar 6) |
| 2026-11-25 | v2.01 | 5d adım 6'nın ve yol modeli tekrarının görsel kabulü (kullanıcı). Sıradaki: 5d adım 8 (B13) |
| 2026-11-25 | v2.00 | 5d adım 6 (`c3f7f0e`): kararlar (kullanıcı, öneriler gibi: araç seçilince, hedef saklanmaz, 7 araç + eylemler, Fill 20.000); Foliage fırçası, darbe başına undo, level parçası kaydı; hücresiz level'da boyanmış foliage oyunda çizilir. Yol modeli segment boyunca tekrarlanır (`ec45418`, kullanıcı kararı). `foliagePaint.spec.ts` forceWebGL + gerçek WebGPU'da geçti. Görsel kabul kullanıcıda. Sıradaki: 5d adım 8 (B13) |
| 2026-11-25 | v1.99 | 5d adım 4'ün, terrain Details / Paint düzeninin ve panel adlarının görsel kabulü (kullanıcı) |
| 2026-11-25 | v1.98 | 5d adım 5'in görsel kabulü (kullanıcı). Sıradaki: 5d adım 6 (B09) |
| 2026-11-25 | v1.97 | 5d adım 5 (`49d6c09`): kararlar (kullanıcı, öneriler gibi: mesh tanımdan üretilir, süsleme Faz 6, iki ayrı Apply, seçim sayfanın ayarlarında, ek ajan komutu yok); Landscape Splines kipi ve yol mesh'leri (saf üretici Codex); içe aktarıcı ve asset dizini spline mesh'lerini tanır. `landscapeSpline.spec.ts` forceWebGL + gerçek WebGPU'da geçti. Görsel kabul kullanıcıda. Sıradaki: 5d adım 6 (B09) |
| 2026-11-20 | v1.96 | Paint kipi Forge'un Brush / Auto Paint sekmeleriyle, Auto Paint kuralları Landscape Mode içinde (`details: "embedded"`), terrain Details'i Name'siz, panel adları Forge'unki (`2a6ef5e`) |
| 2026-11-20 | v1.95 | Terrain Details Forge'un Landscape düzeninde (`775da8b`, kullanıcı kararı): `details: "tool"` sunumu (SDK 0.1.14), araç düğme ızgarası; seçili terrain üstünde gizmo sürüklemesi düzeltildi |
| 2026-11-20 | v1.94 | 5d adım 4 (`4651b3b`): kararlar (kullanıcı, öneriler gibi: asset hemen yazılır, taşıma yalnız terrain, `worldTerrainMove` su kısmı Faz 7, heightmap yalnız editörde); World Terrain oluşturma, Expand, taşıma, heightmap içe / dışa; kayıtta global harita revizyonu ve geç olay düzeltmeleri. `worldTerrainMove` 1 A → **A 991 / 1.021**, 3 A Faz 7'ye. `landscapeWorld.spec.ts` forceWebGL + gerçek WebGPU'da geçti. Görsel kabul kullanıcıda |
