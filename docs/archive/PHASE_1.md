# Faz 1 — Doğrulama spike'ı, GO / NO-GO (arşiv)

**Kapandı:** 2026-11-11, **GO (koşullu, kullanıcı kararı).**
[Yeniden inşa planından](../planned/FORGE_WEBGPU_REBUILD_PLAN.md) kapanışta
olduğu gibi taşındı; planda kısa özet ve §11 ilerleme kaydı kalır. Spike kodu
Forge `spikes/webgpu/` (`517961b1` … `46986836`); ölçüm kayıtları depo dışı
`Games/ForgeReference/baseline/spike/`. Bölüm numaraları (§2.3, §2.5…) plana,
"mimari §…" rapora göndermedir.

**Karar (kullanıcı, 2026-11-11): GO, koşullu.** WebGPU yolu (`three/webgpu` +
TSL) sürer; K10'un NO-GO yolu kapanır. Koşul: GPU güdümlü foliage (compute
culling + indirect draw) bütün foliage türlerinde ve gölge kaskatlarında
zorunludur (Faz 5c); G6'nın render gönderimi sınırı (Derekavak P2, 60 Hz,
≤ 3 ms) 5c kapısında yeniden ölçülür. Gerekçe: G6'yı yalnız render gönderimi
0,9 ms aşıyor, foliage draw call'ları toplanınca 2,2 ms'ye iniyor; kare
bütçesinde geniş pay var (G2 ≤ 6,83 / 14 ms).

Yer: Forge `spikes/webgpu/`. Mevcut spike düzeni geçerli: uygulama build'ine,
kök `tsc`'ye ve `verify:imports`'a girmez; tip kontrolü `npx tsc -p spikes`.
Forge'un three'siz terrain / level yükleyicilerini olduğu gibi kullanır. Kod
atılabilir; sonuçlar bu plana yazılır. Yer kullanıcı kararıyla kesinleşti
(2026-11-11): Forge'a yalnız `spikes/webgpu/` yazılır (`CLAUDE.md` istisnası).
Sayfalar three'yi yalnız `three/webgpu` / `three/tsl` üzerinden, Forge'u
yalnız three'siz katmanlardan import eder. İçerik ve ölçüm düzeneği depo
dışındaki `Games/ForgeReference`'tadır.

- [x] **S1 Boot:** `WebGPURenderer` + `await renderer.init()`, gerçek backend
      kanıtı, GPU timestamp (`trackTimestamp`), adaptör / cihaz bilgisi.
      *Sonuç (2026-11-11, R1, Chrome 157.0.8103.39, three r187, Forge
      `517961b1` `spikes/webgpu/s1-boot`):* `isWebGPUBackend` true, çekirdek
      kip (`core-features-and-limits` var, compatibility değil); adaptör
      NVIDIA Ampere. `timestamp-query`, `shader-f16`, `subgroups`,
      `indirect-first-instance`, `float32-filterable` dahil 17 özellik.
      GPU süresi `resolveTimestampsAsync` ile her kare okunuyor (test
      sahnesinde 0,36 ms). Sınırsız kare hızı WebGPU'da da açılıyor: test
      sahnesinde 0,47 ms; 60 Hz sınırında ~19 ms. three cihazı varsayılan
      WebGPU sınırlarıyla istiyor (storage binding 128 MB, buffer 256 MB, dizi
      katmanı 256); büyük compute buffer'ları gerekirse S4'te
      `requiredLimits` ile yükseltilir. Ortak düzenek: sayfalar Forge'un
      `data-forge-perf` kaydını aynı alanlarla yazar; koşucu
      `spikes/webgpu/run.mjs` (port 4174, başlıklı Chrome); WebGPU olmayan
      koşu başarısız sayılır.
- [x] **S2 Terrain:** referans terrain'in tile'ları TSL CDLOD malzemesiyle:
      `positionNode` ile displacement, `sampler2DArray` boya katmanları, normal;
      `CSMShadowNode` gölgesi; `SkyMesh` + sis. Görsel yükseklik Rapier
      heightfield ile aynı mı?
      *Kapandı (2026-11-11, Forge `6818d201` … `4cc0d5b9`
      `spikes/webgpu/s2-terrain`); G8 kullanıcı kararıyla tam çözünürlüklü
      bölgeye uygulanır ve geçer (aşağıda).*
      **Yapılan:** Forge'un CDLOD terrain materyalinin TSL karşılığı. Yükseklik
      tile yuvası (R32F dizi, `textureLoad`, collider köşegeni) ya da global
      haritadan (bilinear); morph, etek, 64 yuvalık havuz; normal + 8 katmanlı
      splat + uzak tekrar kırma. Gölge Forge `high`'la aynı:
      `cascadedShadows` güneşte 3 × 1024 `CSMShadowNode` (Forge'un bölmeleri),
      ötekilerde kamerayı izleyen tek harita. `SkyMesh` ve sis level'dan.
      Veri Forge'un three'siz modüllerinden değişmeden geliyor (tile çözücü,
      render source, normaller, global harita, CDLOD seçici).
      **Yapılmayan (Faz 3 / 7):** gökyüzü ışığı yakalaması (IBL), su,
      terrain spline yol mesh'leri.
      **G8 (görsel = collider):** terrain yukarıdan ortografik kamerayla, ana
      kameranın LOD seçimi ve morph'uyla float hedefe çizildi. Her piksel kendi
      dünya X / Y / Z'sini taşıyor (512 × 512 m, 1 m). Fark, aynı noktaya
      Forge'un Rapier heightfield'ına (`terrainTileHeightfieldShape`) atılan
      ışınla ölçüldü. 3 sahne × P1 / P3, bölge başına 262 bin örnek.

      | Bant (kameraya 3B uzaklık) | En büyük fark | p99 |
      |---|---|---|
      | 0. seviye, morph öncesi (1 m'de 0–89 m, Island 2 m'de 0–177 m) | 0–4,9 mm | ≤ 1 mm |
      | 0. seviye morph bandı | 6 mm – 0,89 m | 4 mm – 13 cm |
      | 1. seviye ve ötesi | 0,15 – 2,2 m | 1 – 69 cm |

      Tam çözünürlüklü bölgede port Forge'un yüzeyini birebir çiziyor. Morph
      bandı ve ötesi CDLOD'un kendi sapması (kabalaşan mesh); Forge WebGL aynı
      formülle aynı sapmayı veriyor. G8'in "(CDLOD morph sınırında da)"
      ifadesi bu bandı kapsıyorsa ölçüt kalıyordu. **Kullanıcı kararı
      (2026-11-11):** G8 tam çözünürlüklü bölgeye (0. seviye, morph öncesi)
      uygulanır: **geçer** (≤ 4,9 mm). Morph bandı ve ötesi bilgi olarak
      raporlanır; LOD aralıkları değişmez.
      **G1 (terrain, eşdeğer içerik):** WebGL tarafı yalnız terrainli level
      kopyalarıyla ölçüldü (`*-terrain.level.json`: yerleşim, foliage, su,
      bulut, post-process, gökyüzü ışığı yakalaması çıkarıldı; `high`,
      `?debug`). WebGPU aynı pozlar ve pencereyle (sınırsız, 1080p × 3,
      1440p × 1). Her pozda `isWebGPUBackend` true.

      | Sahne | WebGL kare / GPU (1080p, P1–P3) | WebGPU kare / GPU | Oran (kare) |
      |---|---|---|---|
      | OpenWorldTest | 1,0–2,1 / 1,0–2,0 | 0,55–0,79 / 0,44–0,69 | 0,26–0,76 |
      | Island | 1,0–3,0 / 1,0–2,8 | 0,82–1,11 / 0,72–1,00 | 0,38–0,79 |
      | Derekavak | 4,8–5,0 / 4,8–5,5 | 1,33–1,52 / 1,08–1,28 | 0,28–0,32 |

      1440p'de oranlar 0,29–0,86. **G1: 18 / 18 poz × çözünürlük geçer**
      (sınır ≤ 1,10). Çekince: içerik yaklaşık eşdeğer. WebGL bu pozlarda
      0,13–1,8 M, WebGPU 0,1–0,76 M üçgen çiziyor, yani WebGL tarafında
      spike'ın çizmediği küçük kalemler kalmış olabilir; oranlar WebGPU lehine
      biraz iyimser olabilir.
      **Yöntem notları:**
      - `CSMShadowNode`'a kamera elle verilirse kaskat ışıkları hiç kurulmuyor
        ve gölge alan mesh düşüyor; kamerayı düğüm kendi `setup()`'ında alır.
      - Renk çıkışı negatif değerleri 0'a kırpıyor; G8 geri okuması ofsetle.
      - Faz 0 baseline'ının `?debug`'da çizilen navmesh görünümünden
        etkilenmediği A/B ile doğrulandı (Derekavak P1 `?debug`'sız GPU 15,33,
        `?debug`'lı 15,2 ms; draw call 1.785 / 1.800).
      Kayıtlar `ForgeReference/baseline/spike/` (G8) ve `spike/s2-measure/`
      (G1, `summary.json`), WebGL tarafı `measure/webgl-terrain-*`.
- [x] **S3 Pipeline:** MRT + TRAA + GTAO + SSR + SSGI + bloom; her efektin GPU
      maliyeti ayrı ölçülür (1080p ve 1440p).
      *Kapandı (2026-11-11, Forge `33c0c00d` … `a4286990`
      `spikes/webgpu/s3-pipeline`): Balanced profil kullanıcı kararıyla
      tanımlandı, G2 / G3 terrain-only sahnede geçer (geçici; kesin okuma
      S4'te, aşağıda).*
      **Yapılan:** S2 sahnesi tek `RenderPipeline`'dan geçer: MRT'li sahne
      pass'i → GTAO / SSGI / SSR birleştirmesi → TRAA (HDR) → bloom → çıkış
      dönüşümü (S2'nin ACES'i ve pozlaması). MRT hedefleri yalnız onları okuyan
      efekt açıkken eklenir: `output` RGBA16F, `normal` RGBA8 (paketli görüş
      normali), `velocity` RGBA16F, `metalrough` ve `diffuseColor` RGBA8.
      Terrain materyali slotlarda (`colorNode` / `normalNode` / `roughnessNode`
      / `positionNode`), MRT'ye sorunsuz düşüyor (§2.3). Ayarlar: GTAO
      birleştirmede çarpılır ("ön pass" satırı three'nin belgelediği yol:
      normal / derinlik ön pass'i + `builtinAOContext`, AO yalnız dolaylı
      ışığa); SSGI orta ayar (`sliceCount` 2, `stepCount` 8, zamansal filtre),
      AO'su GTAO'nun yerini alır; SSR klasik kip, `quality` 0,5,
      `reflectNonMetals` açık (terrain'in metalness'i 0, kapalıyken her piksel
      erken çıkar; yani satır **üst sınır**; SSR genel yansımadır, Post
      Process'te `reflection: off | ssr`, Faz 3);
      bloom level'ın değerleri, yoksa 1 / 1 / 1.
      **Yöntem:** efekt maliyeti tek sayfa açılışında taranır (yapılandırma
      başına 4 s ısınma + 10 s pencere; G yöntemi değil). 3 sahne × P1–P3 ×
      1080p / 1440p, sınırsız, R1, her koşuda `isWebGPUBackend` true, hata yok.
      Maliyet = yapılandırmanın GPU süresi − efektsiz pipeline (`pass`). GPU
      süresi karenin bütün render pass'lerinin timestamp toplamı (efektlerin
      hiçbiri compute kullanmıyor). Kayma denetimi: taramanın başındaki ve
      sonundaki doğrudan çizim arası fark ≤ 0,2 ms. Maliyetler toplanabilir
      (Balanced + SSR ve Cinematic satırları tek tek maliyetlerin toplamını
      1080p'de 0,6 ms, 1440p'de 1,1 ms içinde tutuyor).

      | Efekt (GPU maliyeti, ms) | 1080p medyan (9 poz aralığı) | 1440p medyan (aralık) |
      |---|---|---|
      | Pipeline'ın kendisi (`pass` − doğrudan) | 0,0 (0–0,07) | 0,06 (0–0,07) |
      | Tam MRT, 5 hedef, efektsiz | 0,06 (0–0,13) | 0,13 (0,06–0,20) |
      | GTAO | 1,61 (0,92–1,83) | 2,82 (1,64–3,27) |
      | GTAO yarım çözünürlük | 0,46 (0,32–0,52) | 0,85 (0,52–0,98) |
      | GTAO, ön pass + `builtinAOContext` | 1,71 (0,98–2,03) | 3,01 (1,83–3,54) |
      | SSR (her piksel, üst sınır) | 6,20 (2,62–7,93) | 14,29 (6,06–17,89) |
      | SSR yarım | 1,05 (0,53–1,24) | 2,36 (1,11–2,91) |
      | SSGI orta | 7,27 (4,20–10,49) | 16,38 (9,50–22,87) |
      | SSGI yarım | 2,03 (1,24–2,95) | 4,59 (2,65–6,36) |
      | TRAA | 0,40 (0,32–0,49) | 0,72 (0,59–0,85) |
      | Bloom | 0,13 (0–0,13) | 0,26 (0,13–0,33) |

      | Profil adayı (terrain-only, 9 poz) | 1080p ortalama kare / p95 en kötü | 1440p ortalama kare / p95 en kötü |
      |---|---|---|
      | Doğrudan çizim (S2) | 0,56–1,46 / 1,8 | 0,84–2,31 / 2,7 |
      | Balanced adayı: TRAA + GTAO + bloom | 2,78–4,39 / 5,3 | 4,64–7,15 / 8,0 |
      | + SSR | 5,49–12,39 / 13,2 | 10,71–25,0 / 47,6 |
      | TRAA + SSGI + bloom | 6,05–12,58 / 13,2 | 12,29–26,39 / 47,8 |
      | Cinematic: TRAA + SSGI + SSR + bloom | 8,84–19,12 / 37,3 | 18,62–41,15 / 48,8 |

      **Okuma:** Balanced adayının yükü 1080p'de 1,4–2,3 ms, 1440p'de
      2,7–4,1 ms. Tam çözünürlüklü SSR ve SSGI tek başına 1080p'de 6–7 ms;
      1440p'de piksel oranından (1,78×) hızlı büyüyor (~2,3×); bunları içeren
      adaylarda p95 çoğu pozda 35–48 ms'ye sıçrıyor. Yarım çözünürlük ikisini 1–2 ms'ye (1080p) indiriyor. GTAO'nun
      iki yolu terrain-only sahnede neredeyse aynı (+0,1 ms); ön pass sahneyi
      bir kez daha çizdiği için gerçek içerikte farkı draw call ile büyür.
      **Bulgular:**
      - Beş MRT hedefi örnek başına 40 bayt; WebGPU'nun varsayılan
        `maxColorAttachmentBytesPerSample` sınırı 32, pipeline kurulmuyor. Spike
        64 istiyor (R1 128 veriyor). Faz 3 `render` katmanı ya MRT'yi
        sıkıştırır ya bu sınırı `requiredLimits` ile adaptörden ister.
      - Post-process yazılmamış level'lara (OpenWorldTest, Island) spike
        varsayılan bloom'u uyguladı. Eşiği aşan gökyüzü yaygın pus veriyor;
        Forge WebGL bu level'larda bloom çizmiyor. G1 eşdeğerliğinde (S4)
        bloom yalnız level yazmışsa açılır.
      - Cinematic görüntüsü belirgin daha parlak: SSGI'nin `giIntensity`
        varsayılanı 10, SSR metal olmayanları da yansıtıyor. Görsel ayar
        kullanıcıda; spike değiştirmedi.
      Kayıtlar `ForgeReference/baseline/spike/s3-sweep/` (`summary.json`),
      P2 görüntüleri `spike/s3-shots/` (`s3-p2-grid.jpg`).
      **Profiller (kullanıcı kararı 2026-11-11):**
      - **Balanced:** TRAA + GTAO (tam çözünürlük, birleştirmede çarpılır) +
        bloom (level yazmışsa) + SSR yarım çözünürlükte (level
        `reflection: ssr` seçmişse). Profil efekti zorla açmaz, izin verir
        (Forge ilkesi; spike'ta bloom buna göre düzeltildi, `e0e64051`).
        GTAO yarım çözünürlük S4'te Derekavak G2'yi aşarsa ilk kol; o zaman
        kullanıcıya sorulur.
      - **Cinematic:** SSGI + SSR tam çözünürlükte (+ TRAA, bloom).
      - Su ve düz yüzey yansıması planar (Faz 7); sphere reflection capture
        taşınmaz.
      **G2 / G3 (geçici, terrain-only):** Balanced, baseline penceresiyle
      (her tekrarda yeni context, 10 s ısınma + 15 s; 1080p × 3, 1440p × 1),
      9 poz, her koşuda `isWebGPUBackend` true, hata yok. En kötü durum SSR
      açık (`reflectNonMetals` açık, her piksel iz sürer).

      | Balanced | 1080p ortalama kare / p95 en kötü / GPU | 1440p ortalama kare / p95 en kötü / GPU |
      |---|---|---|
      | SSR kapalı | 2,36–4,25 / 5,1 / 1,96–3,48 | 3,97–6,88 / 7,7 / 3,35–5,79 |
      | SSR yarım çözünürlük | 2,94–5,54 / 6,4 / 2,40–4,36 | 5,12–9,71 / 10,6 / 4,28–7,83 |

      En kötü poz iki tanımda da Derekavak P2. G2 (≤ 14 / p95 ≤ 16,6) ve G3
      (≤ 16,6 / p95 ≤ 20) **terrain-only sahnede geçer**; bütçenin geri kalanı
      S4'ün gerçek içeriğine kalır (Faz 0'da Derekavak `high` WebGL GPU'su
      ~15–17 ms). Kesin okuma S4'te aynı profille. Kayıtlar
      `spike/s3-g2/` ve `spike/s3-g2-ssr/`.
- [x] **S4 Açık dünya stresi:** referans level'ın gerçek yerleşim ve foliage
      sayılarıyla draw call ve CPU kare süresi; WebGL baseline'ıyla
      karşılaştırma. WebGPURenderer'ın nesne başına CPU maliyeti burada ölçülür.
      Aynı sahnede küçük bir **compute culling + indirect draw** prototipi
      (tek foliage türü yeter) kurulur ve aynı formatta ölçülür: §2.5'in ve
      K4'teki "fallback yok" kararının dayandığı yol r187'de çalışıyor mu,
      kazancı ne kadar?
      **Planar yansıma ölçümü (kullanıcı kararı 2026-11-11, rapor, G ölçütü
      değil):** gerçek içerikli S4 sahnesinde su seviyesine tek `reflector()`
      düzlemi, çözünürlük Forge `high`'daki göl yansımasıyla aynı; yansımalı /
      yansımasız fark olarak draw call, CPU ve GPU. Planar sahneyi ikinci
      kameradan yeniden çizdiği için nesne başına CPU maliyetini doğrudan
      katlar.
      *Ölçüldü (2026-11-11, Forge `2a135526` … `46986836`
      `spikes/webgpu/s4-world`); GO / NO-GO kararı kullanıcıda (aşağıdaki
      sonuç tablosu).*
      **Yapılan:** S2 sahnesi + S3 pipeline + Derekavak ve WbPilotValley'nin
      gerçek içeriği, Forge'un çalışma anındaki gibi yüklenir: level
      yerleşimleri (yerleşimsiz listelenen asset'in boş batch'i dahil),
      yükleme yarıçapındaki World Partition cell'leri, GLB + `*.materials.json`
      slotları + `*.material.json` materyalleri, Landscape foliage kuralları
      Forge'un three'siz modülleriyle (halka; yalnız Forge'un bellekte tuttuğu
      tile'lar, 2 × tile boyu; uzak billboard blokları), küçük nesnelerin
      mesafe solması ve batch atlaması, foliage rüzgâr sallanması ve dither
      solması (TSL). Kipler: **(a)** Forge WebGL'in çizim yapısı (asset × mesh
      `InstancedMesh`, cell batch'i görüş alanına göre ayıklanır; foliage ring
      hücresi × mesh), **(a')** yerleşim başına Mesh, **(b)** asset'in mesh'leri
      materyale göre birleşik, asset × materyal başına tek `InstancedMesh`,
      foliage 256 m blok × kural; `BatchedMesh` satırı (aynı materyal imzalı
      statikler); **(c)** çim kuralı compute culling + `drawIndexedIndirect`.
      **Eşdeğerlik:** WebGL tarafı suyu, bulutu, araç actor'lerini (cell'lerdeki
      dahil) ve gökyüzü ışığı yakalamasını çıkarılmış `*-s4` level kopyalarıyla
      ölçüldü (`high`, `?debug`, 60 s ısınma; 10 s ile aynı draw call, sınırsız
      kipte foliage halkası 10 s içinde doluyor). İçerik WebGL sahnesinde three
      devtools kancasıyla sayılarak doğrulandı: Derekavak P2 foliage 370 hücre /
      1.640 örnek ve statikler 118 `InstancedMesh` / 1.764 örnek, ikisi de
      birebir; WbPilotValley P3 foliage 300'e 305 hücre, statik örnek 155'e 162
      (Forge'un cell akış payı); uzak billboard 4 blok / 314 örnek, birebir.
      Draw call farkının kalanı: gölge kaskatlarında foliage (WbPilotValley
      +40, Derekavak +66; CSM sığdırma) ve WebGL `GTAOPass`'inin normal için
      sahneyi ve gölge haritalarını ikinci kez çizmesi (Derekavak'ta WebGL
      draw call'larının yarısı). WebGPU MRT'den okuduğu için tek geçiş.

      | G1: kip (a), WebGL'in efekt seti (Derekavak GTAO + bloom + SMAA, WbPilotValley yok), 1080p × 3 | WebGPU kare / GPU (draw call) | WebGL kare / GPU (draw call) | Oran kare / GPU |
      |---|---|---|---|
      | Derekavak P1 | 6,70 / 3,09 (795) | 12,35 / 12,14 (1.441) | 0,54 / 0,25 |
      | Derekavak P2 | 7,31 / 3,92 (871) | 13,53 / 13,31 (1.531) | 0,54 / 0,29 |
      | Derekavak P3 | 6,50 / 3,20 (726) | 11,79 / 11,60 (1.367) | 0,55 / 0,28 |
      | WbPilotValley P1 | 4,74 / 1,31 (310) | 6,94 / 6,74 (304) | 0,68 / 0,19 |
      | WbPilotValley P2 | 4,31 / 1,39 (303) | 6,47 / 6,25 (269) | 0,67 / 0,22 |
      | WbPilotValley P3 | 5,27 / 1,71 (475) | 8,00 / 5,96 (454) | 0,66 / 0,29 |

      WebGL bu sahnelerde GPU'ya bağlı; WebGPU kip (a)'da CPU'ya bağlı (kare ≈
      render gönderimi).

      | Kipler, 1080p (Derekavak P2 / WbPilotValley P3) | Kare | GPU | Draw call |
      |---|---|---|---|
      | (a) Forge yapısı | 7,31 / 5,27 | 3,92 / 1,71 | 871 / 475 |
      | (a') yerleşim başına Mesh | 12,47 / 5,04 | 3,82 / 1,73 | 2.166 / 651 |
      | (b) instancing | 4,96 / 2,58 | 4,25 / 2,14 | 327 / 212 |
      | `BatchedMesh` | 4,90 / 2,97 | 4,04 / 2,20 | 329 / 212 |
      | (c) çimde GPU culling | 5,02 / 2,78 | 4,24 / 2,05 | 319 / 208 |

      `BatchedMesh` kazandırmıyor: bu sahnelerde asset'ler materyal
      paylaşmıyor, birleştirilecek imza yok.
      **G6 (CPU):** sınırsız kipte GPU darboğazken `render()` swapchain'i
      beklediği için CPU süresi GPU beklemesini de içeriyor; G6 bu yüzden 60 Hz
      sınırında ölçüldü (Derekavak P2 × 3; GPU kareye sığıyor, bekleme yok).
      Spike'ta oyun mantığı yok, ana iş parçacığı ≈ render gönderimi.

      | Derekavak P2, 60 Hz | Draw call | Render gönderimi (CPU) | GPU |
      |---|---|---|---|
      | (a) Forge yapısı | 871 | 6,9 | 3,8 |
      | (b) instancing | 327 | **3,9** | 4,1 |
      | (c) çimde GPU culling | 319 | 3,9 | 4,1 |
      | (b) + Balanced + SSR yarım | 331 | 4,7 | 5,5 |
      | Teşhis: her foliage kuralı tek batch, culling yok (`noCull=*`) | 111 | **2,2** | 4,7 |

      CPU maliyeti draw call sayısıyla büyüyor: ~1,3 ms sabit + draw call başına
      ~8 µs. Kip (b)'nin 327 draw call'unun 260'ı foliage (gölge kaskatları
      dahil). Foliage draw call'ları toplanınca gönderim 2,2 ms'ye iniyor;
      karşılığı culling'siz çizimin +0,6 ms GPU'su. Compute culling (G7) bu
      GPU'yu geri almanın yolu; bütün türlerde ve gölge kaskatlarında
      ölçülmedi.
      **G7:** çim kuralı (Derekavak 291, WbPilotValley 346 örnek) compute
      pass'te görüş alanı + mesafe culling, atomik sayaçla indirect
      argümanları, tek `drawIndexedIndirect`; sallanma ve solma korunuyor.
      Görünen örnek sayısı aynı testin CPU karşılığıyla 6 pozda birebir (71,
      45, 74, 338, 150, 190); görüntü kip (b) ile aynı (≤ %0,003 piksel).
      Culling'siz tek `InstancedMesh`'e göre GPU −0,02 … −0,11 ms. CPU
      kazancı ölçülemiyor (60 Hz'de 3,9 / 3,9 ms): çim bu sahnelerde az (39
      hücre → 1 draw).
      **G2 / G3 (kesin, kip (b), Balanced + SSR yarım = en kötü):** 1080p
      ortalama kare 5,41–6,83, p95 ≤ 10,4 ms; 1440p 9,57–11,51, p95 ≤ 12,4 ms.
      SSR kapalı: 1080p 3,93–5,41, 1440p 6,38–8,27. En kötü poz 1080p'de
      Derekavak P2, 1440p'de WbPilotValley P3.
      **Planar yansıma (kip (b), WebGL'in efekt seti, 1080p):** Forge
      `medium` gibi (256 px, en sık 32 ms'de bir) ortalama kare +0,2–0,5 ms,
      p95 en çok +3,4 ms (yansıma karelerinde); her karede +1,5–2,7 ms kare,
      +0,5–1,0 ms GPU, draw call × 2 (Derekavak). WbPilotValley P1'de düzlem
      görüş alanında değil, çizilmedi.
      **G9 için görüntüler:** `spike/s4-measure/s4-g9-grid.jpg` (6 poz; WebGL
      `high` kopyası `?debug`'sız, WebGPU kip (a), WebGPU Balanced + SSR
      yarım). Gözlenen: WebGPU sahneleri belirgin daha koyu ve sıcak tonlu
      (yollar, duvarlar), WebGPU gökyüzünde `SkyMesh` bulutları var. Nedeni
      doğrulanmadı (S2'den beri spike'ta gökyüzü ışığı / IBL yok); ayar
      yapılmadı. Faz 1'de spike'ın taşımadığı: impostor atlası (dal dokusuyla
      dörtgen), terrain uzak karartması, IBL.
      Kayıtlar `ForgeReference/baseline/spike/s4-measure/` (`summary.json`),
      `spike/s4-g6-capped/`, WebGL `measure/webgl-s4-long-*`, prob
      `tools/s4-webgl-probe.mjs`.
- [x] **S5 (isteğe bağlı):** `LightProbeGrid` bake süresi ve görsel etkisi;
      `ClusteredLighting` ile N nokta ışık. *Yapılmadı (kullanıcı kararı
      2026-11-11):* ikisi de Faz 9'da ayrı ölçümle karara bağlanır.
      `LightProbeGrid` hücre başına bake edilip akışla yüklenecekse verisinin
      hücre formatındaki yeri Faz 5b tasarımında ele alınır.
- [x] Sonuç tablosu + yan yana ekran görüntüleri bu plana yazılır (aşağıda;
      görüntüler `ForgeReference/baseline/spike/s4-measure/s4-g9-grid.jpg`).

**GO ölçütleri** (görsel fark kullanıcıya göre anlamlı; referans sahnede kare
süresi konan sınırın içinde; S4'teki CPU maliyeti instancing ve compute
culling + indirect draw prototipiyle **ölçülerek** sınırın içine iniyor;
terrain görseli collider ile eşleşiyor). Sayılar Faz 0 WebGL baseline'ından
sonra, spike ölçümünden önce kondu (kullanıcı onayı 2026-11-11). Bütçe 60 Hz =
16,6 ms (K9); "WebGL" Faz 0 baseline'ındaki `high` değeridir.

| # | Ölçüt | Sınır |
|---|---|---|
| G1 | Eşdeğer içerik, regresyon yok: S2 / S4 sahnelerinde WebGL `high`'a eşdeğer efekt seti, aynı pozlar, 1080p | Poz başına ortalama kare ≤ WebGL × 1,10 ve GPU ≤ WebGL × 1,10 |
| G2 | Balanced profil, 1080p (S3'te tanımlandı: TRAA + GTAO + bloom; SSR yarım çözünürlükte, ölçümde açık) | Bütün pozlarda ortalama kare ≤ 14 ms, p95 ≤ 16,6 ms (2,6 ms oynanış payı; Derekavak'ta S4 iyileştirmesini şart koşar) |
| G3 | Balanced profil, 1440p | Ortalama kare ≤ 16,6 ms, p95 ≤ 20 ms |
| G4 | Cinematic profil | Sınır yok, yalnız rapor (teknik kararları Faz 9'da ölçümle) |
| G5 | S4 draw call: Derekavak ve WbPilotValley, gerçek yerleşim ve foliage sayılarıyla, instancing / `BatchedMesh` | WebGL eşdeğer kopyasının %50'si (kullanıcı kararı 2026-11-11; spike'ın çizmediği su, araç ve bulut tabana girmez): Derekavak P2 ≤ 766, WbPilotValley P3 ≤ 227 |
| G6 | S4 CPU kare süresi (`performance.now` işaretleri) | Derekavak P2'de ana iş parçacığı ≤ 6 ms, render gönderimi ≤ 3 ms |
| G7 | Compute culling + indirect draw prototipi (tek foliage türü) | r187'de doğru çiziyor (görsel kontrol + örnek sayısı); culling'siz instancing'e göre GPU ≤ +0,5 ms; CPU kazancı ölçülüp raporlanır |
| G8 | Terrain = collider | Görsel yükseklik ile Rapier heightfield arasında 1 m'lik örnek ızgarasında azami fark ≤ 5 cm, tam çözünürlüklü bölgede (0. seviye, morph öncesi; kullanıcı kararı 2026-11-11). Morph bandı ve ötesi CDLOD'un kendi sapması, bilgi olarak raporlanır |
| G9 | Görsel fark | Yan yana görüntülerle kullanıcı kararı |

**Sonuç (2026-11-11, S1–S4):**

| # | Sonuç | Durum |
|---|---|---|
| G1 | Terrain (S2) 18 / 18; S4 kip (a) 6 / 6: kare oranı 0,54–0,68, GPU oranı 0,19–0,29 | Geçer |
| G2 | Kip (b), Balanced + SSR yarım: ortalama kare ≤ 6,83 ms, p95 ≤ 10,4 ms | Geçer |
| G3 | 1440p: ortalama kare ≤ 11,51 ms, p95 ≤ 12,4 ms | Geçer |
| G4 | Cinematic yalnız S3'te (terrain): 1080p 8,8–19,1, 1440p 18,6–41,2 ms; S4'te ölçülmedi | Rapor |
| G5 | Kip (b): Derekavak P2 327 (≤ 766), WbPilotValley P3 212 (≤ 227) | Geçer |
| G6 | Derekavak P2, 60 Hz, kip (b): ana iş parçacığı 3,9 ms (≤ 6) geçer; render gönderimi 3,9 ms (≤ 3) **0,9 ms aşar**. Foliage draw call'ları toplanınca 2,2 ms (GPU +0,6 ms, culling'siz) | Ana iş parçacığı geçer; render gönderimi GO koşuluna bağlandı (5c kapısında yeniden ölçülür) |
| G7 | Örnek sayısı GPU = CPU, görüntü aynı; GPU −0,02 … −0,11 ms (≤ +0,5); CPU kazancı ölçülemiyor (çim az) | Geçer |
| G8 | Tam çözünürlüklü bölgede ≤ 4,9 mm | Geçer |
| G9 | Yan yana görüntüler (`s4-g9-grid.jpg`) | Kullanıcı GO kararını görüntülerle birlikte verdi; G9'a ayrı not düşülmedi |

Ölçüm kuralı: baseline düzeneğiyle aynı — `ForgeReference` sahneleri ve
pozları, 10 s ısınma + 15 s ölçüm, sınırsız kare hızı, başlıklı Chrome, R1;
ortalama kare (1/fps), p95, GPU (`trackTimestamp`), draw call; gerçek WebGPU
backend'i (`isWebGPUBackend`) kayda yazılır, WebGL2'ye düşen koşu sayılmaz.

**NO-GO (K10):** 2a kapısına kadar tamamlanır; iskelet korunur ve `render`
katmanı Forge `render-three`'den (klasik `WebGLRenderer`) uyarlanır; 2b'ye
~23.300 satırlık render uyarlaması eklenir. WebGL tarafındaki kalite seçenekleri
(`SSRPass`, `TAARenderPass`, `LightProbeGridWebGL`) o katmanda değerlendirilir.
`WebGPURenderer`'ın WebGL2 backend'i çare sayılmaz: NO-GO'nun nedeni renderer'ın
nesne başına CPU maliyetiyse aynı maliyeti taşır.
