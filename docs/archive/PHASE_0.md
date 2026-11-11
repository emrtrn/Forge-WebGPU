# Faz 0 — Kararlar ve referans görüntüler (arşiv)

**Kapandı:** 2026-11-11. [Yeniden inşa planından](../planned/FORGE_WEBGPU_REBUILD_PLAN.md)
kapanışta olduğu gibi taşındı; planda kısa özet ve §11 ilerleme kaydı kalır.
Kararlar plan §8 (K1–K11) ve [mimari rapor](../planned/FORGE_WEBGPU_ARCHITECTURE.md)
§8'de (A1–A11); GO ölçütleri [Faz 1 arşivinde](PHASE_1.md). Bölüm numaraları
(§2.10, §3…) plana, "mimari §…" rapora göndermedir.

- [x] §8'deki K1–K9 ve mimari raporundaki A1–A9 kararları (hepsi 2026-11-10).
- [x] v0.6 incelemesinin açtığı kararlar: K10, K11 (§8) ve A10, A11 (mimari
      §8) — hepsi 2026-11-10'da, öneri olduğu gibi.
- [x] **Forge özellik envanteri:** Forge WebGL'in kullanıcıya görünen
      özellikleri (editör panelleri ve modları, aktör / bileşen türleri, asset
      türleri, runtime alt sistemleri, araçlar) tek tabloda; her satıra hedef
      faz ya da "taşınmayacak" + gerekçe yazılır. Tablo `docs/PORT_LOG.md`
      kapsama matrisinin paydasıdır (§7); fazı olmayan satır kalmaz.
      *Çıktı (2026-11-11, Forge `b3fa0c1a`):* [`docs/PORT_LOG.md`](../PORT_LOG.md)
      §1, 234 satır, sekiz bölüm (A editör kabuğu ve paneller 32, B editör
      modları 14, C asset editörleri 16, D aktör ve bileşen türleri 54,
      E asset türleri 29, F runtime ve oyun çatısı 31, G render 29, H araçlar
      ve kapılar 29). Sütunlar: kalıcı ID, Forge yeri, faz, işlem (taşı /
      uyarla / yeniden yaz / yeniden tasarla), Forge testleri, not, WebGPU
      kapsama durumu. 21 satır 2a'da kuruldu, 7'si taşınmaz; planda adı
      geçmeyen 27 satırın fazı kullanıcı onayıyla verildi (asset editörleri,
      Mesh Paint 5d, `loadGroups` taşınmaz, rts-starter Faz 6'da ikinci
      örnek…). Cut-over'da Forge farkı yeniden taranır.
- [x] Referans sahneler seçilir: çok tile'lı bir terrain level'ı, Island, bir
      World Builder rastgele dünyası, Ridgebound'un **kopya** bir sahnesi.
      *Seçim (2026-11-11, kullanıcı onayı):* sahneler depo dışındaki yerel
      referans projesinde, `C:\Users\emret\Desktop\Games\ForgeReference` (A9;
      README kaynakları ve kopyalardaki değişiklikleri yazar). Forge WebGL'de
      Model 2 projesi olarak `FORGE_PROJECT_ROOT` ile açılır; Forge ve
      Ridgebound'a yazılmaz.
      **OpenWorldTest:** 4 × 4 km, 256 tile, Forge `world:test`; dokusuz renk
      katmanları, foliage yok; değeri terrain akışı yükü.
      **Island:** 2 × 2 km, 64 tile, okyanus + kıyı, 28 greybox bina; Forge
      rastgele dünya (tohum 39863, medium, island).
      **WbPilotValley:** World Builder brief çıktısı; 1 × 1 km, 64 tile, 45
      hücre, nehir, kulübeler, foliage kuralları.
      **Derekavak:** Ridgebound `f68d369` kopyası; 2 × 2 km, 64 tile, depo,
      köy, yollar.
      Sahne başına üç sabit poz: **P1** yer (göz 1,7 m), **P2** 60 m yükseklik
      ve 20° aşağı, **P3** yakın plan (OpenWorldTest dik yamaç, Island kumsal,
      WbPilotValley kulübe, Derekavak köy evi). Pozlar `baseline/poses.json`'da
      (konum + bakış noktası + quaternion) ve runtime'a
      `localStorage["forge.play.cameraPose"]` ile verilir. Bu yüzden kopyalarda
      game mode `forge.defaultCamera`; araç / karakter spawn olmaz. Aday
      görüntüler ve kontak sayfası `baseline/poses/`'ta.
- [x] Her sahnede sabit kamera pozlarından Forge WebGL ekran görüntüleri ve
      `?debug` ölçümleri (kare süresi, GPU süresi, draw call); referans R1'de
      (K9), §2.10 formatında.
      *Baseline (2026-11-11):* Forge `b3fa0c1a`, three 0.187.0, WebGL2 (ANGLE /
      D3D11, `WEBGL_debug_renderer_info` ile doğrulandı), Chrome
      157.0.8103.39 başlıklı, RTX 3060 sürücü 32.0.16.1060 (= 610.60). Runtime
      rotası + `?debug`, Forge kalite profili `high` (3 tekrar) ve `ultra`
      (1 tekrar). Adaptif kalite kapalı, profil elle sabit; her koşuda
      `data-forge-perf` kaydıyla doğrulandı. 1080p = 1920 × 1080, DPR 1;
      1440p = aynı pencere, DPR 4/3, render hedefi 2560 × 1440. Poz başına
      10 s ısınma + 15 s ölçüm. Kare hızı sınırsız
      (`--disable-gpu-vsync --disable-frame-rate-limit`): 60 Hz sınırında
      bütün pozlar ~17,9 ms çıkıyor ve fark görünmüyordu.
      Ölçüler: **kare** = ortalama kare süresi (15 s / kare sayısı, yani
      1/fps), **p95** = rAF aralığının p95'i, **GPU** = Forge'un timer query
      ortalamasının medyanı. Hepsi ms; tekrarların medyanı. rAF medyanı
      kullanılmadı: GPU boşken sınırsız kipte kareler kümelendiği için
      yanıltıyor (OpenWorldTest'te 0,4 ms).

      | Sahne | Poz | high 1080p kare / p95 / GPU | high 1440p | ultra 1080p | ultra 1440p | Draw call (high 1080p) | Üçgen (k) |
      |---|---|---|---|---|---|---|---|
      | OpenWorldTest | P1 | 1,5 / 14,2 / 1,4 | 2,0 / 19,1 / 1,9 | 1,6 / 15,3 / 1,5 | 2,0 / 19,4 / 2,0 | 7 | 538 |
      | OpenWorldTest | P2 | 2,1 / 19,9 / 2,0 | 2,7 / 22,4 / 2,5 | 2,1 / 20,0 / 2,1 | 2,8 / 22,4 / 2,6 | 9 | 655 |
      | OpenWorldTest | P3 | 1,0 / 8,2 / 1,0 | 1,4 / 13,6 / 1,4 | 1,0 / 8,7 / 1,0 | 1,5 / 14,2 / 1,4 | 10 | 532 |
      | Island | P1 | 6,4 / 7,1 / 2,0 | 6,3 / 6,9 / 3,0 | 8,2 / 9,2 / 2,6 | 8,2 / 9,0 / 3,3 | 252 | 741 |
      | Island | P2 | 6,3 / 7,3 / 3,1 | 6,2 / 6,9 / 4,8 | 8,4 / 12,1 / 3,2 | 8,2 / 9,2 / 4,6 | 248 | 783 |
      | Island | P3 | 2,5 / 2,9 / 1,2 | 2,5 / 2,8 / 1,7 | 2,7 / 3,1 / 1,2 | 2,7 / 3,1 / 1,9 | 42 | 271 |
      | WbPilotValley | P1 | 10,6 / 14,8 / 9,6 | 9,8 / 12,1 / 9,5 | 11,5 / 13,9 / 10,6 | 11,6 / 14,0 / 11,2 | 505 (368–505) | 2.036 |
      | WbPilotValley | P2 | 8,5 / 10,8 / 8,2 | 8,5 / 10,7 / 8,2 | 10,1 / 12,8 / 9,4 | 10,0 / 12,7 / 9,7 | 464 (270–464) | 2.023 |
      | WbPilotValley | P3 | 11,3 / 13,0 / 9,0 | 11,4 / 13,0 / 10,7 | 13,0 / 15,7 / 10,8 | 12,9 / 15,4 / 11,5 | 782 | 2.518 |
      | Derekavak | P1 | 15,3 / 17,2 / 15,2 | 15,0 / 17,1 / 15,1 | 17,4 / 34,6 / 16,9 | 16,8 / 34,0 / 16,4 | 1.800 | 3.229 |
      | Derekavak | P2 | 17,4 / 34,9 / 16,9 | 17,3 / 34,8 / 17,1 | 17,9 / 35,4 / 17,8 | 18,1 / 35,4 / 17,6 | 1.884 | 4.792 |
      | Derekavak | P3 | 13,7 / 15,5 / 13,9 | 14,4 / 29,8 / 14,3 | 14,6 / 33,2 / 14,1 | 15,2 / 31,8 / 14,9 | 1.534 (1.520–1.590) | 2.971 |

      *Okuma:*
      - Derekavak GPU'ya bağlı (kare ≈ GPU). 1440p'de GPU süresi artmıyor;
        yük doldurma değil, ~1.500–1.900 draw call ve 3–4,8 M üçgen. S4'ün
        asıl sahnesi.
      - Island CPU'ya bağlı (kare 6,3, GPU 2–3).
      - WbPilotValley karışık (kare 8,5–11, GPU 8–10). Draw call sayısı
        tekrarlar arasında değişiyor (P1 368–505, P2 270–464): 10 s ısınmada
        akış oturmuyor.
      - OpenWorldTest'in p95'i (8–22) ortalamanın çok üstünde. GPU p95'i 1–3
        ms; sıçramalar GPU'dan değil, sınırsız kipte kare kümelenmesinden.
      - Ultra, high'a göre +1–2 ms.

      *Yükleme (high 1080p, P1; ayrı ölçüm, yükleme ekranının açılıp
      kapanmasıyla):*

      | Sahne | Soğuk toplam | Ekrana kadar (Vite + uygulama) | Level | Sıcak (aynı sekme, medyan) |
      |---|---|---|---|---|
      | OpenWorldTest | 9.848 | 8.287 | 1.561 | 733 |
      | Island | 10.873 | 6.377 | 4.496 | 1.390 |
      | WbPilotValley | 16.940 | 6.276 | 10.664 | 2.491 |
      | Derekavak | 16.500 | 6.907 | 9.593 | 2.006 |

      Soğuk ölçümde dev server her sahne için yeniden başladı ve tarayıcı
      önbelleği boştu; "ekrana kadar" kısmı Vite'ın modül dönüşümüdür,
      üretim build'inde yoktur. *Ölçülmedi:* GPU belleği; shader / pipeline
      derleme süresi ayrı ölçülmedi (level yüklemesinin içinde, "Warming
      shaders" aşaması); CPU kare süresi ayrı ölçülmedi (sınırsız kipte
      kare ≈ max(CPU, GPU)).
      *Kayıtlar:* ham koşular, özet ve 48 ekran görüntüsü (sahne × poz ×
      profil × çözünürlük) `ForgeReference/baseline/measure/baseline-2026-11-11/`,
      yükleme `measure/loads-2026-11-11/`, betikler `baseline/tools/`.
      Faz 3 kabulündeki yan yana karşılaştırmanın referansı `high` görüntüleri.
- [x] **GO ölçüt sayıları:** baseline'dan sonra kullanıcıyla konur ve Faz 1'in
      "GO ölçütleri" paragrafına yazılır (profil × çözünürlük başına kare
      süresi / GPU süresi sınırı, S4 için draw call ve CPU kare süresi sınırı).
      Sayılar spike ölçümünden önce yazılmış olur. *Kondu (2026-11-11,
      kullanıcı onayı, öneri olduğu gibi):* G1–G9, Faz 1 "GO ölçütleri".
- [x] K6 kuralı yürürlükte (2026-11-10): GO'ya kadar seçici, GO'dan sonra tam
      durdurma (§3).
