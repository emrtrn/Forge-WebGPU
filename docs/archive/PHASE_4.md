# Faz 4 — Editör çekirdeği (arşiv)

**Kapandı:** 2026-11-15. [Yeniden inşa planından](../planned/FORGE_WEBGPU_REBUILD_PLAN.md)
kapanışta olduğu gibi taşındı; planda kısa özet ve §11 ilerleme kaydı kalır.
Kararların kendisi [mimari raporda](../planned/FORGE_WEBGPU_ARCHITECTURE.md)
(§4.2, §4.3, §4.6–§4.11; v1.16–v1.27). Taşınan ve yeniden yazılan her modül
[taşıma günlüğünde](../PORT_LOG.md) (§2). Bölüm numaraları (§2.2…) plana,
"mimari §…" rapora göndermedir.

**Başladı 2026-11-13.** Döküm ve tasarım kullanıcı onayıyla (2026-11-13, "önerileri
kabul ediyorum"); kararlar mimari raporda (v1.16: §4.2, §4.7, §4.8, §4.9, §4.10,
§4.11), bu bölüm kutuları, dökümü ve sırayı tutar. Forge kaynakları yalnız okunur
(`forge-webgl-final`; `src/editor` ve `editor/` etiketten bu yana değişmedi).

**Döküm (2026-11-13).** Fazı 4 olan 36 envanter satırı (`PORT_LOG` §1). Faz 4'e
ertelenmiş A yok. Editör alanında 11 R (yeniden yazılır) ve 27 M var; M'ler eski
modele bağlı, paydada değil, niyetleri (undo'da kimlik korunur, çoğaltma yeni GUID
alır, çoklu seçimde Details düzenler, grup / ebeveyn işlemleri geri alınır) yeni
testlerin kabul ölçütü.

| Kutu | INV | Forge kaynağı | R |
|---|---|---|---|
| UI kiti (K7) | A02 | `src/editor/{paramFields,editorIcons}.ts`, `editorUi.css` | — |
| Kabuk ve servisler | A01, A07, A10 (menü), A28, A31, A32 | `EditorUi.ts` (5.402), `editor/core`, `editor/scene/EditorSceneController.ts` (1.813), `editorSaveCoordinator`, `editor/input/bindings` | — |
| Viewport | A03, A04, A09, G27 | `editor/input/editorCamera*`, `editor/render-three/scenePicker.ts` (615), `src/scene/editorSelectionOutline.ts`, `render-three` yardımcı çizimleri | — |
| Gizmo, snap, pivot | A05, A06 | `editor/gizmos` (741), `editor/render-three/{floorSnap,wallSnap}` | 11 (sürükleme 7, zemin 2, duvar 1, pivot 1) |
| Paneller | A08, A11–A16, A30 | `panels/outliner`, `panels/details` (genel, ortam, materyal), `specialActorDetails` (2.397; şemadan), `panels/world/worldSettingsPanel` | — |
| Content Browser | A23–A27, H22 | `panels/content/contentPanel.ts` (616), `ThumbnailRenderer`, `tools/{optimize-mesh-glb,strip-embedded-textures}` | — |
| Asset editörleri | C01, C07, C08, C12 | `StaticMeshEditor` (2.226), `ActorScriptEditor` + `Viewport` (yalnız prefab kısmı), `MaterialEditor` (1.182), `DataTableEditor` (772) | — |
| Play ve kayıt çakışması | A29, A28 | `EditorUi` `playTest`, `editorSaveCoordinator` | — |
| Ajan komutları | — (A12) | — | — |
| Build ve smoke | H05, H07, H08, H17 | `builder/web/verify-dist.mjs`, `src/project/publicUrl.ts`, `tests/smoke` (`editor-authoring` + 13 editör spec'i) | — |

Kapsam dışı: Details'in fizik / nav / değişken (6), su (7), su birikintisi (5a),
kırılma (8) bölümleri; B modları (5a–7); C02–C06, C09, C13, C16 (6 / 8); Sound Cue,
Dialogue, BT, State Tree (K12). Forge editör kodunun ~29.000 satırı kapsamda
(`src/editor` ~22.600 + `editor/` 6.943), ~16.200 satırı dışarıda.

**Kararlar (kullanıcı, 2026-11-13; ayrıntı mimari v1.16):**

1. *Editörün 3B kodu:* `src/render/editor/` (çizim katmanı, gizmo, picking, ızgara,
   küçük resim, önizleme); `src/editor` DOM + servis, three'siz. Özelliğe özgü
   yardımcı çizim yeni rol `features/*/editorRender.ts` (three + editör; editör
   host'u toplar, oyun build'ine girmez, dist kapısı denetler).
2. *Gizmo:* Forge'un kendi gizmo'su; sürükleme matematiği three'siz saf modül (11 R),
   çizimi çizim katmanında. Planın eski metnindeki `TransformControls` yerine.
3. *Düzenleme → World:* World'e `actorsChanged(actors, { transformOnly })`;
   uygulamayan bağlamada varsayılan çıkar + ekle; instancing batch'inde transform
   hızlı yolu.
4. *Ajan komutu editör açıkken:* CLI kayıt servisi modülünü doğrudan çağırır (dev
   server gerekmez); dev server dosya değişikliğini editöre bildirir, kirli olmayan
   dosyalar kendiliğinden tazelenir, kirliyse "yeniden yükle / karşılaştır" şeridi.
5. *Ajan komut kümesi:* ekle / taşı / sil / alan yaz / sınıf override'ı + okuyan
   `find` (ad, bileşen, yakınlık) ve `show <id>`; `npm run forge -- edit --project …
   --level … <komut>`, kısa metin çıktı, `--json`.
6. *Motor içeriği ve paketler:* proje dev server'ında salt okunur; motor deposunda
   `npm run dev -- --engine-content` kipinde aynı editörden yazılır, `verify:assets`
   korur.
7. *Asset editörleri:* genel veri editörü (A13: şemadan form + dizi alanlarında tablo)
   + özelliğin kaydettiği önizleme: materyal (küre), static mesh (`forge.model`
   içe aktarma ayarları + model; çarpışma Faz 6), aktör sınıfı (bileşen ağacı, Add
   Component, sınıf varsayılanları). Elle yazılmış ayrı editör yok.
8. *Play:* dev server'da geçici oturum katmanı `.forge-session/<id>/` (yalnız kirli
   dosyalar), oyun sekmesi `?play=<id>`; diske yazmaz, sekme yeniden yüklenince de
   çalışır.
9. *Küçük resimler:* editörde WebGPU ile, `.forge-cache/thumbnails/<guid>-<revizyon>.png`
   (commit'lenmez).
10. *Gruplama:* grup bileşensiz boş aktör, çocuklar `parent` ile; çözme çocukları üst
    ebeveyne bağlayıp grubu siler.
11. *Hücreler:* 5b'ye kadar editörde bütün hücreler yüklü.
12. *Editör smoke'ları:* CI'da `forceWebGL` kipinde (mimari §4.10), her koşuda geçici
    proje kopyası (D14), Playwright Chromium CI'a girer; yerelde gerçek WebGPU'da da.

**Sıra** (her adım yeşilse ayrı commit + push; adımdan sonra `PORT_LOG` §2, bu
bölüm + §11, gerekirse mimari rapor ve harita, hafıza):

1. ~~UI kiti (K7): token'lar, ikonlar, `paramFields`, şemadan form oluşturucu.~~ — **tamam**
   (2026-11-13, `210ed40`). `src/editor/ui`: `createFormView` core form tanımını Details
   satırlarına çevirir (her alan türü; sınırlı sayı kaydırıcı + kutu, aralık adın altında,
   sınıra çekme Türkçe uyarıyla; vektör / transform X / Y / Z, dönüş derecede, kuaterniyon
   saklanır; başvurular Browse / Clear; dizi Add / Remove; nesne bölüm). Forge'un ikonları
   olduğu gibi, CSS'in kit kısmı token ve sınıf adlarıyla; `paramFields` saf fonksiyon.
   `?editor-kit` (yalnız dev, build'e girmez) motorun her bileşeninin üretilen formunu
   gösterir; `npm run smoke:editor` (`tests/editor`, başsız Chrome) kiti orada sınar ve
   gate'e, dolayısıyla CI'a girdi (karar 12). Tarayıcı testi üç kit hatası yakaladı
   (renk temizle düğmesi, başvuru metni, eski diziyle silme). A 934 / 1.021 değişmedi.
2. ~~Dikey dilim: `?editor` (yalnız dev, dinamik import), editör host'u
   (`features/*/editor.ts` + `editorRender.ts`, `defineFeatureEditor` editor-sdk'da),
   kabuk düzeni, level aç → oturum → World + render + editör kamerası, undo / redo +
   kaydet, `actorsChanged`, ilk editör smoke'u, `verify:dist --strict` + `base` testi.~~ —
   **tamam** (2026-11-13). *Yapılanlar:* `ba97b6f` editörün World'ü (**kullanıcı kararı:** alt sistem
   `inEditor: true` bildirir, editör World'ü `mode: "editor"` yalnız onları kurar: render,
   World Environment, Height Fog; fizik / oyun hiç) + `World.updateActors` ve
   `actorsChanged({ actor, previous, transformOnly })` (kancasız alt sistem / bağlama çıkar +
   ekle; torunlar transform değişikliği), SDK 0.1.4; `9119c42` katman kuralı
   `editor-render-is-editor-only` + rol `editorRender`; `a67220d` editör oturumu (oturumun
   `onApplied`'ı World'e ekle → güncelle → sil sırasıyla yansır; çekirdek kuralı: çocuğu
   kalan aktör silinmez); `f3ee39b` `?editor` (kabuk Forge düzeniyle, Outliner düz liste,
   Details transform'u kitle, undo / redo / kaydet, Ctrl+S / Z / Y; viewport şimdilik Faz 3
   görüntüleyicisi) + editör smoke'u (geçici proje kopyası, `forceWebGL`; gate ve CI);
   `d67845d` `verify:dist` (editör işareti hata; yazma uçları uyarı). `defineFeatureEditor`
   ilk kullanan adıma (5) kaldı. *2b (`eea148b`; **kullanıcı kararı:** üretim build'i Faz
   4'te):* `npm run build` projeyi derler (`FORGE_PROJECT_ROOT`, yoksa `samples/starter`),
   `tools/build-content.ts` proje içeriğini, motor içeriğini ve seçili paketleri, kimlik
   (salt okunur, makine yolu yok), sınıf ve asset dizinlerini `dist/forge/`'a yazar; oyun
   çekirdeğin salt okunur `ContentClient`'ı ile `BASE_URL` altından okur, kayıt istemcisi
   yalnız dev'de (oyun paketinde yazma ucu yok). Kapıya `verify:dist --strict` ve `npm run
   smoke:dist` (`tests/production`: `--base /forge-base/`, `vite preview`, start level açılır,
   bütün istekler alt dizinde, `/__forge/` yok, editör yok). A 934 / 1.021.
3. ~~Viewport: çizim katmanı (TRAA sonrası, jitter'sız, sahne derinliğine karşı), ızgara,
   seçim çerçevesi, picking (mesh, instance → aktör, terrain yükseklik alanı), kamera
   kipleri, view mode / show flags, kalite menüsü, yardımcı çizimler (G27).~~ — **tamam**
   (2026-11-14). `src/render/editor` Faz 3 görüntüleyicisinin editördeki yerini aldı.
   `af6b334`: editör kamerası (Forge'un `EditorCameraController`'ı ve sabitleri: sağ
   sürükle uçuş + WASD/QE, Alt+sol yörünge, orta kaydırma, Alt+sağ dolly, tekerlek;
   Perspective / Top / Left / Front, teknik görünümler ortografik ve 1.000 m geride — Forge
   3–10 m'de tutuyordu, uzun şeyler kesiliyordu; poz level başına hatırlanır), çizim
   katmanı (kendi MSAA hedefi, parçalar sahne derinliğiyle shader'da karşılaştırılır, ton
   eşlemesiz bileşim; sahne derinliği pipeline'ın sahne pass'inden, pipeline'sız karede —
   three MSAA çerçeve tamponuna çizer, WebGPU derinliği çözemez — yalnız editörde derinlik
   ön geçişi), 1 m / 10 m ızgara, Camera menüsü + 1–4. `1bfeffe`: picking etiketleri
   (`render/sync/pickTags.ts`: nesnenin aktörü, instance → aktör tablosu, kendi ışınını
   yanıtlayan yüzey — terrain'in yükseklik alanı), CPU picker, seçim çerçevesi (Forge'un
   vurgu rengi, gizli kenar da çizilir; terrain'de yok, Forge gibi), tıkla / Ctrl+tıkla /
   boşluk / Esc, F odaklar. `2cbed7f`: View Mode (Lit / Wireframe; teknik görünüm
   Wireframe'e geçer, Forge), Quality (Auto / profiller; oyunla aynı kullanıcı ayarı, Auto'da
   viewport Ultra), Show (Grid, Stats = `?debug` paneli viewport'ta). `1cf02e4`:
   `defineEditorRenderBinding` (`features/*/editorRender.ts`, editör toplar, editör
   World'ünde `forge.editorHelpers` alt sistemiyle çalışır), Forge'un billboard ikonları,
   ışığın yardımcıları (güneş / ampul ikonu seçer; erim teli yalnız seçiliyken); yardımcılar
   picking'de önce gelir. Ses ve Player Start ikonları özellikleri gelince, kamera / hedef
   noktası / hacimler / çarpışma görünümü Faz 6'da; Show'un Collision ve AI Navigation'ı da.
   Editör smoke'u: viewport menüleri, tıklayarak seçim (koşunun proje kopyasında tek küplü
   level). A 934 / 1.021.
4. ~~Gizmo, snap, pivot (11 R).~~ — **tamam** (2026-11-14). `d26ab2f` **kullanıcı kararı:** pivot aktör
   belgesinde isteğe bağlı `pivot` (yerel uzay, sıfırken yazılmaz; yalnız editör okur). `3721d11` sürükleme
   matematiği three'siz `src/engine/gizmo` (karar 2): eksen tutamağı işaretçi ışınının eksen doğrusuna en yakın
   noktası (Forge'un zemin düzlemi Front / Left'te yan duruyordu, y 0,01 m/px idi), serbest tutamak kameraya bakan
   düzlemde, dönüş kuaterniyonla (dönülen açı snap'lenir), düzlem tutamağı dışarıda bıraktığı ekseni snap'lemez;
   ölçek, 0,05 tabanı, iki ondalık ve pivot düzeltmesi Forge'unki. Çoklu seçimin kökleri birlikte (taşı aynı delta,
   döndür birincilin pivot'u etrafında, ölçek her biri kendi pivot'unda), sonuç ebeveyn uzayında. Zemin snap'i
   aşağı ışın (altında bir şey yoksa y = 0), duvar snap'i oda kutusu yerine dört yatay ışın; 11 R aynı niyetlerle
   yeniden yazıldı. `1d79c16` instancing hızlı yolu (karar 3): `transformOnly` değişiklikte static mesh ve shape
   batch'te yalnız matrisi yeniden yazar (`InstanceBatch.move`); önce tek yerleşimli batch boşalıp modeli
   bırakıyor, sürüklenen model bir kare kayboluyordu. `63cc3b6` gizmo çizim katmanının son pass'i (Forge'un
   biçimi, renkleri ve boyutu; ince gövde ve halkalara görünmez kalın seçim şekli), tutamak seçimi kameradan ve
   tıklamadan önce; `editor/transformTools.ts` (araç, uzay, snap, pivot düzenleme; sürükleme World'de canlı,
   bırakınca tek transaction, Esc geri koyar), araç çubuğu (Q / W / E / R, Space, X, End; Forge'un snap
   adımları, ayar sayfanın), Details'te Pivot (viewport'ta sürükle, Reset / Center / Base) ve Placement (Snap to
   Floor / Wall). Editör smoke'u: tek küplü level'da gizmo'yla taşıma, snap, undo / redo, araç tuşları, End.
   A 934 / 1.021.
5. ~~Paneller: Outliner (50.000 aktör ölçümü), şemadan Details (çoklu seçim),
   düzenleme işlemleri ve gruplama, Add Actor + sürükle-bırak, World Settings + ortam /
   post-process ayrıntıları, kısayollar.~~ — **tamam** (2026-11-14). **Kullanıcı kararları
   (hepsi öneri):** 50.000 ölçümü ayrı `npm run bench:outliner` (kapıda değil); override'lar
   Unreal gibi satırda; Add Actor = özelliklerin girişleri + Empty Actor + projenin aktör
   sınıfları; World Settings = level ayarı + tekil ortam aktörleri; kilit belgede
   (`locked`), gizleme yalnız görünüm; sınıfsız aktöre Add / Remove Component; ortam
   ekstralarından Ground Mist Setup ve World Environment önizlemesi; pano sistem panosu JSON.
   `aa3726d` çekirdek: `locked`, oturumda kimlik dizini ve döngü reddi. `1a36338` 5a:
   sanallaştırılmış Outliner (Forge'un arama / tür filtresi / göz / kilit; hiyerarşi ve
   katlama; aralık seçimi; çift tıkla ad; sürükle-bırakla ebeveyn, dünya yeri korunur),
   `defineFeatureEditor` (SDK 0.1.5), gizleme oturumda, bench: ilk kurma 47,8 ms, seçim p95
   3,5 ms, kaydırma p95 0,9 ms, arama 23,1 ms, 23 DOM satırı (ilk denemede her yeniden
   kurmada bileşen kopyası 191 / 203 ms'ye çıkarıyordu). `e3f44f6` 5b: Details panele
   (şemadan form, çoklu seçim "Multiple Values", sınıf override'ı + sıfırlama, Add / Remove
   Component, kaydırıcı tek adım, gizmo sürüklemesinde canlı alanlar, asset adı ve seçici).
   `c887976` 5c: çoğalt / sil / kopyala / yapıştır, grupla / çöz, Parent to active / Unparent,
   gruba tıklamak grubu seçer, Alt + sürükle çoğaltma, kısayol tablosu. `15a704b` 5d: Add
   Actor menüsü ve sürükle-bırak (Forge'un yerleştirme kuralı; SDK 0.1.6). `1963a77` 5e: ana
   menü, World Settings, Details eklentileri (Ground Mist, World Environment önizlemesi; SDK
   0.1.7); `selection.spec`'in zamanlamaya bağlı kırılması (Ctrl+tık gizmo tutamağına
   denk geliyordu) giderildi. `cd55e12` 5f: bütün kısayollar tek tabloda, Outliner sağ tık
   menüsü. Forge'da viewport sağ tık menüsü yoktu (sağ tuş kamera); burada da yok. Editör
   smoke'u 28 test. A 934 / 1.021.
6. ~~Content Browser: ağaç / filtre / arama / küçük resim, referans güvenli taşıma ve
   silme, içe aktarma (GLB / doku / ses + meta, GLB optimizasyonu), Open Level, motor
   içeriği kipi.~~ — **tamam** (2026-11-14). 6a `3b79d70` ağaç ve sanallaştırılmış
   grid; 6b `b6fe4fe` WebGPU küçük resimleri; 6c `531bf2f` referans güvenli
   dosya işlemleri; 6d `8ddb1be` yeni asset / klasör; 6e `1f1f8e7` import /
   reimport; 6f `e4ac2c4` + `102543f` viewport'a sürükle-bırak, Open Level,
   Set as Start Level, Ctrl+B, Use Selected / Browse To (SDK 0.1.8–0.1.9).
   *6g (`397e8d2`, tamam):* `--engine-content` motor içeriğini ve bütün
   paketleri yazılabilir listeler; proje köklerinin mevcut yazma kuralları korunur.
   Motor tarafına taşıma / kopyalama aynı içerik kökünde kalır (kaynak da denetlenir);
   motor / paket içeriğinden projeye kopyalama normal kipteki gibi çalışır. Motor
   kayıtları mevcut işlemli kayıt servisinden geçer; yanıt yolları `engine:` etiketini
   korur, sınıf deposu ve editörün sınıf listesi tazelenir. Açılan motor level'ının
   yazılabilirliği kendi kökünden alınır: düzenle → kaydet → yeniden aç ve 409 akışı
   çalışır; örnek proje kayıtları açılmaz. Kabul geçti: geçici motor / proje
   içeriğinde 10 yeni entegrasyon testi (dosya işlemleri, import / reimport,
   sınıf listesi, level kayıt / 409, kök sınırları); 2 yeni tarayıcı testi
   (motor level'ını kaydet / yeniden aç, canlı sınıf listesi, örnek salt okunur).
   Tam `npm run gate` yeşil: 1.946 test, 39 editör smoke'u, 1 dist smoke'u;
   SDK yüzeyi değişmedi. Tarayıcı koşusu `forceWebGL`; yeni WebGPU render kabulü değil.
   Asset editörleri adım 7'de; gerçek motor içeriği testte değiştirilmez.
7. ~~Asset editörleri (genel veri editörü + önizlemeler).~~ **Tamam** (`3545277`, 2026-11-14).
   **Uygulama planı (kullanıcı onayı 2026-11-14):** tek ortak pencere;
   başka asset'e geçiş / kapanışta Save / Discard / Cancel. Taslak yalnız
   önizlemeyi etkiler; başarılı kayıtta açık level güncellenir, kirli level
   verisi ve override'lar korunur. İzin içerik kökünden; salt okunur asset
   incelenir, değiştirilemez. Yeni bağımlılık, alias veya katman kuralı yok.
   - [x] **7a Oturum + pencere:** JSON asset / model meta / aktör sınıfı
     adaptörleri; revizyon, dirty, bağımsız undo / redo (sürükleme tek adım,
     büyük diziler ilgisiz değişiklikte kopyalanmaz), mevcut `/save`;
     başarıda kanonik belgeyi tekrar oku; hata / 409 taslağı korur, Reload
     onay ister. Browser çift tık / Open; Ctrl+E aktörün kaynak sınıfı veya
     modelini açar. Kısayollar pencere dışındaki level'a sızmaz.
   - [x] **7b Genel veri + tablo:** kayıtlı bütün JSON asset türleri
     şemadan form; dizilerde tablo (basit değer tek sütun, nesnede basit
     alanlar şema sırasıyla sütun; bileşik alan seçili satır ayrıntısında).
     Satır ekle / sil / sırala; iki görünüm aynı taslak; 1.000 satırda
     en fazla 200 DOM satırı.
   - [x] **7c Önizleme:** `render/editor` içinde, aynı tek renderer / GPU;
     canvas geçici yüzeye, level sunumu ve thumbnail işi duraklar; kapanışta
     geri döner. Taslağa özel geometri / materyal; orbit / pan / zoom /
     Focus; geç kalan yükleme iptali ve kaynak temizliği. Özellik
     `editorRender.ts` modülünde isteğe bağlı `assetPreviews`; mevcut helper
     kayıtları korunur. `FeatureEditorDef.assetEditors` tür / önizleme /
     araç eklentisi kaydı; üç boyutlu tip içermeyen eklenti bağlamı.
   - [x] **7d Materyal:** şemadan alanlar, mevcut preset'ler, vertex renk
     gradyanlı küre; kayıtta kullanımlar ve thumbnail tazelenir.
   - [x] **7e Static Mesh:** model / slot / geometri bilgisi; meta'ya import
     ayarları (GLB değişmez); slot seçiciler, UVW form + gizmo, vertex
     doldur / sil. Ham renk dizileri formda açılmaz; yükleyici renk
     varsayılanlarını uygular. Geometri uyuşmazsa veri korunup uyarılır.
     Optimize ayarı GLB'yi kayıtta dönüştürmez, mevcut Reimport uygular.
   - [x] **7f Aktör sınıfı:** ad, bileşen ağacı, Add / Remove, uzamsal
     ebeveynlik ve varsayılanlar; kararlı bileşen kimlikleri; silmede çocuk
     üst ebeveyne (Details gibi), döngü reddi. İzole editör World'ü,
     fizik / gameplay yok. Sunucunun gördüğü kayıtlı örneklerin override'ını
     geçersiz kılan sınıf kaydı dosya / aktör raporuyla reddedilir; level
     dosyası otomatik dönüştürülmez. Açık kirli örnekler de korunur.
   - [x] **7g Kabul + kapanış:** oturum / tablo / kayıt / sınıf uyumluluk
     testleri ve geçici içerikte tarayıcı kabulü; motor / paket izinleri,
     pencere geçişleri, kısayollar, 409, kayıtta sahne tazeleme, kaynak
     bırakma. Tam gate + render smoke + başlıklı Chrome gerçek WebGPU;
     referanslar kullanıcı kabulü olmadan güncellenmez. SDK 0.1.10,
     snapshot / changelog; HTTP ve asset şemaları değişmez. Plan,
     mimari / harita ve PORT_LOG kapanışta ayrı docs commit'inde.
   **Kabul:** tam gate yeşil (1.957 birim / sunucu testi, 47 editör ve
   1 dist smoke); asset editörlerinin 8 tarayıcı testi başlıklı Chrome'da
   gerçek WebGPU ile geçti. Render smoke 17/17; referanslar değiştirilmedi.
   1.000 satırlı tablo, bağımsız undo, kirli level'ın korunması, salt okunur
   paket, 409 / Reload, geç yükleme ve tekrar aç-kapat GPU kaynakları denetlendi.
   **Kapsam dışı:** Actor Script betikleri, çarpışma (Faz 6), sahnede Mesh
   Paint, otomatik topoloji onarımı, gelişmiş 409 karşılaştırması (adım 8).
   Sınıf uyumluluğu yalnız sunucuya görünür köklerde; depo dışı oyunlar
   kendiliğinden taranmaz.
8. ~~Play (oturum katmanı) + 409 akışı (yeniden yükle / karşılaştır).~~ **Tamam** (2026-11-15,
   `0494b0c` `b424fcf` `35cc624` `327013c` `3375fe8`). **Kullanıcı kararları (2026-11-15, hepsi öneri):**
   birleştirme alan düzeyinde (bileşenler yerel kimlikle, öbür diziler bütün); Reload ve
   birleştirme undo geçmişini temizler; Play yalnız açık level'ın kirli dosyalarını taşır;
   salt okunur projede de Play çalışır.
   - *8a sunucu katmanı (`0494b0c`):* `POST /__forge/play` level'ın kirli dosyalarını
     (`level.json`, `cells/<x>_<z>.json`; başka dosya 403) kaydın belge denetiminden geçirip
     kanonik biçimde `.forge-session/<id>/`'e yazar, hücre dizinini katman + diskten kurar;
     `GET /__forge/play?id=` level'ı ve kamera pozunu, `read?play=<id>` önce katmanı okur
     (bilinmeyen oturum 410). Oturum sunucu açılışında silinir, en fazla 8 tutulur; yeni
     oturum yanına yazılıp yer değiştirir. Starter `.gitignore`'u ve `create-project`
     `.forge-*` klasörlerini dışlar (eskiden yalnız `.forge/`).
   - *8b editörde Play (`b424fcf`):* Play düğmesi (Show'un sağı, Forge) ve P; oturum
     editör sekmesi başına (sessionStorage), her Play onu değiştirir ve yeni sekme açar
     (`noopener`: oyunun kendi süreci / GPU cihazı; böyle açılan sekme adla yeniden
     bulunamaz, Forge da her seferinde açıyordu). Oyun `?play=<id>` ile level'ı katmandan
     okur, kamera editörün perspektif pozundan başlar (yeniden yüklemede de); sunucunun
     tutmadığı oturum bilgi ekranı. `forceWebGL` oyuna geçer; kirli level'dan çıkış sorar.
     Asset taslağı Play'e giremez: asset penceresi modal, kapanış kaydeder ya da atar.
   - *8c çekirdek (`35cc624`):* `core/edit/merge.ts` (JSON üç yönlü birleştirme, level
     planı), `LevelSession` tabanı (okunan / son kaydedilen belge), `compare`, `rebase`
     (Reload / merge; ebeveyni kaybolan birleşme reddedilir, hiçbir şey değişmez),
     `readLevelFromServer`.
   - *8d level 409 (`327013c`):* kayıt 409 alınca şerit (`level-conflict`): Compare… /
     Reload. Compare penceresi kendiliğinden birleşenleri sayar, çakışan aktörleri alan alan
     iki değerle gösterir (Mine / Theirs, All mine / All theirs, Select); Apply sonrası
     değişiklikler kaydedilmemiş kalır, sonraki Save diskin revizyonlarına karşı yazar.
   - *8e asset 409 (`3375fe8`):* asset oturumu `compare` / `merge` (aynı birleştirme),
     pencerede Compare…; ortak `openCompareWindow` (level aktör başına, asset alan başına).
   **Kabul:** tam gate yeşil (1.985 birim / sunucu testi, 53 editör ve 1 dist smoke);
   adımın 14 tarayıcı testi (Play 2, level 409 3, asset 9) başlıklı Chrome'da gerçek WebGPU
   ile geçti, oyun sekmesi `webgpu` backend'inde açıldı; render smoke 17/17, referanslar
   değişmedi. A 934 / 1.021 değişmedi. **Sınır:** dosya izleme ve kirli olmayan level'ın
   kendiliğinden tazelenmesi adım 9'da (aynı `rebase` ve şerit).
9. ~~Ajan komutları (A12) + editörün canlı tazelenmesi.~~ **Tamam** (2026-11-15, `293f9a1` `549a916`
   `23fe6bb` `2cd6854` `b6fc44a` `d53e1c9` `592839b`). **Kullanıcı kararları (2026-11-15, hepsi öneri):**
   süreçler arası kayıt kilidi; olay kanalı Vite'ın HMR'ı (`forge:files`); ortak işlemler
   `src/engine/edit`; `add` sınıf ya da bileşen türüyle (Add Actor menü anahtarıyla değil); toplu kip
   (stdin, tek kayıt); canlı tazelemeye asset penceresi de girer; komutlar motor içeriğini ve paketleri
   yalnız okur.
   - *9a kilit (`293f9a1`):* kurtarma + kayıt `.forge-journal/save.lock` altında (`wx`; pid / makine /
     zaman); sahibi ölmüş kilit devralınır, başka makinenin kilidi alınmaz. Eskiden kayıttan önceki
     kurtarma başka sürecin süren kaydını geri sarabiliyor, iki kayıt aynı dosyanın revizyon denetimini
     birlikte geçebiliyordu (409 yerine kayıp güncelleme). Dev server, `forge edit`, `world:random`,
     içe aktarıcı aynı kurala uyar.
   - *9b ortak modül (`549a916`):* `tools/server/authoring.ts` dev server uçlarının okuyup yazdığı her
     şey (yazma politikası, salt okunur kökler, asset dizini, sınıf deposu, belge denetimi, kayıt
     servisleri, `/save`'in yanıtı); açılışı staging'e ve Play katmanına dokunmaz. `projectAuthoring.ts`
     `npm run dev`'in proje seçenekleri, `gameSchemas.ts` oyun modülünün şemaları (kendi geçici Vite
     önbelleğiyle: açık dev server'ın `node_modules/.vite`'ı değişmez; ilk koşuda bulunan hata).
     `tools/edit/localClient.ts` dev server'sız `SaveClient`. Aynı düzenleme HTTP'den ve yerel
     istemciden aynı baytları yazar.
   - *9c işlemler (`23fe6bb`):* editörün DOM'suz işlemleri `src/engine/edit`'e (actorOps, hierarchy,
     formPath, actorFields = Details'in alan / override / bileşen düzenlemeleri, newActor = Add
     Actor'ün yeni aktörü); davranış aynı.
   - *9d komutlar (`2cd6854`):* `npm run forge -- edit --project … --level … [--json] <komut>` ya da
     `-` (stdin, satır başına bir komut, tek kayıt). Yazanlar `add`, `move`, `delete`, `set`
     (sınıflı aktörde override), `reset`; okuyanlar `find` (`--name`, `--component`, `--class`,
     `--near` + `--radius`, `--limit`) ve `show <id> [--effective]`; kimlik GUID ya da benzersiz önek.
     Her yazma editörün işlemi, çekirdek level oturumunda tek düzenleme, editörün kaydedicisiyle tek
     kayıt. Çalışamayan komut hiçbir şey kaydetmez; 409'da level yeniden okunup komutlar bir kez daha
     koşar (ikinci 409 çıkış 2). Tekil bileşen level'da varsa `add` reddeder.
   - *9e olaylar (`b6fc44a`):* içerik kökleri klasör klasör izlenir (Node `fs.watch`); sessizleşene
     kadar toplanan değişiklikler (bir kayıt = bir paket, gizli adlar hariç) sunucunun dizinini ve
     sınıf deposunu tazeler, editöre HMR kanalında `forge:files` gider. Önerilen Vite izleyicisi
     (chokidar) smoke'ta silinip yeniden kurulan level klasörünü kaybetti, özyinelemeli `fs.watch`
     üzerine yeniden adlandırılan dosyayı; klasör olayları ikisinde de doğru (kanal aynı kaldı).
   - *9f canlı tazeleme (`d53e1c9`):* oturumun tutmadığı revizyonda level dosyası: temiz level
     kendiliğinden yeniden okunur (Reload, undo geçmişi temizlenir), kirliyse 409 şeridi. Paket
     süren kaydı bekler; editörün kendi kaydı başkasının değişikliği sayılmaz. Content Browser,
     renderer'ın dosya tablosu, sınıflar, sahnenin kullandığı asset'ler ve asset penceresi de izler.
   - *9g kabul (`592839b`):* `tests/editor/agent.spec.ts` (4 test); `conflict.spec` şeridi Save'den önce görür.
   **Kabul:** tam gate yeşil (2.021 birim / sunucu testi, 57 editör ve 1 dist smoke); A12 kabulü `agent.spec`'te: Details'te X ve bileşen alanı, Delete, Add Actor'ün Empty Actor'ü ve Save ile `forge edit`'in aynı değişikliği projenin kopyasında level dosyalarını bayt bayt aynı yazar (eklenen aktörün GUID'i hariç). Canlı tazeleme: temiz level sayfa yenilenmeden izler, kirli level şerit açar, kendi kayıt şerit açmaz. Tarayıcı koşuları başsız Chrome'da `forceWebGL`; bu adımda başlıklı gerçek WebGPU koşusu yapılmadı (bulut ortamında GPU yok), `render/**` değişmedi, render smoke gerekmedi. SDK yüzeyi ve HTTP uçları değişmedi (yeni olan HMR olayı `forge:files`). A 934 / 1.021 değişmedi.
10. ~~Editör smoke tam seti → kapı → kapanış.~~ **Tamam** (2026-11-15, `90ee6be` `1c0fbbc` `69516ed` `e673c7d`). **Kullanıcı kararları (2026-11-15, hepsi öneri):** oyunun editör tarafı (INV-A32) bu adımda en küçük haliyle; `npm run smoke:editor:webgpu` betiği; testler `console.error` ve 400 üstü yanıtları da hata sayar.
   - *10a ortak yardımcı:* `tests/editor/support.ts` (adres ve `forceWebGL`, açılış, level yazımı, gizmo sürüklemesi, hatalar); 17 spec ona taşındı. Hata: sayfa hatası, her `console.error`, her 4xx / 5xx yanıt (`409 POST /__forge/save` biçiminde); tasarım gereği eksikler (hücresiz level'ın `cells.json`'u, önbellekte olmayan küçük resim) ve testin bilerek ürettiği 409'lar adıyla izinli.
   - *10b `editor-authoring` karşılığı:* araç düğmeleri, Add Actor küpü sürükle-bırakla, Move gizmo, Details'te X, yerleştirmeye kadar undo ve redo, Save, diskte dosya (hücre dosyası dahil), yeniden aç (aynı GUID ve X), Play sekmesinde aktör. **Bulunan hata:** kayıt sürerken bir düzenleme ya da ikinci Ctrl+S Save'i açıyor, ikinci basış "A save is already running" gösteriyordu; Save yanıt gelene kadar meşgul (`aria-busy`).
   - *10c Forge'un öteki editör smoke'ları:* Rotate (halkanın tek başına geçtiği noktadan) ve Scale sürüklemesi snap'le, tek undo; Top görünümde picking; boyut değişince araç çubuğu üst çubukta, canvas panelle; Quality açık Play sekmesine canlı; Play Make Default'tan kaydedilmeden; Outliner aralıkları (Ctrl + Shift, katlanmış çocuklar, gizli başlangıç); dar pencerede Add Actor. Kapsam dışı: `actor-lights` (K12), `boot-errors` / `content-loading` (Faz 6), `debug-panel` yakalama (5a / 6), landscape / foliage / mesh paint (5a), araçlar (8), `content-new-ai` (K12).
   - *INV-A32 (`69516ed`):* dev server projenin `editor.ts` ve `src/**/editor.ts`'lerini `virtual:forge/game-editors` ile editöre verir (yalnız `npm run dev`); editör motorunkilerle birleştirir, hatalı dosya editörü adıyla durdurur. Önceden `forge check` bu yolu kabul ediyor ama editör yüklemiyordu.
   - *Adım 9'un Windows testleri (`1c0fbbc`):* kilit testinin alt süreci modülü `file://` URL'siyle import eder; sürekli akış testi üç pencere sürer; bu, gerçek bir hatayı gösterdi: dispose sırasında revizyon okuyan paket sonradan gönderiliyordu.
   **Kabul:** tam gate yeşil (2.026 birim / sunucu testi, 66 editör ve 1 dist smoke, `verify:dist --strict`: dist'te editör yok); `npm run smoke:editor:webgpu` başlıklı Chrome'da gerçek WebGPU ile 66 / 66 (her editör ve Play sekmesi `webgpu` backend'i kanıtladı; ilk koşuda kopyala / yapıştır başlıklı sayfada pano izni istedi, `e673c7d`); `npm run bench:outliner` 50.000 aktörde ilk kurma 50,1 ms, seçim p95 4,8 ms, kaydırma p95 1,2 ms, arama 25 ms, 23 DOM satırı; A12 `agent.spec`'te. `render/**` değişmedi, render smoke gerekmedi. SDK yüzeyi değişmedi. A 934 / 1.021.

- [x] Editör kabuğu ve servisleri (§2.2): viewport host, kamera, seçim (CPU
      raycast picking), gizmo (Forge'unki, karar 2), pivot, grup / hiyerarşi,
      undo / redo. *Adım 3–4 (2026-11-14):* viewport, kamera, picking, gizmo, snap,
      pivot; *adım 5:* grup / hiyerarşi, düzenleme işlemleri, kısayollar.
- [x] Editör çizim katmanı: gizmo, seçim çerçevesi, ızgara ve yardımcı
      çizimler TRAA'dan sonra, jitter'sız ayrı bir pass'te çizilir (TRAA
      geçmişine girerlerse titrer ve iz bırakır); derinlik testi sahne
      derinliğine karşı yapılır. *Adım 3 (2026-11-14):* `render/editor/overlay.ts`;
      gizmo adım 4'te bu katmana çizilir.
- [x] **Önce UI kiti (K7):** tasarım token'ları + Forge `paramFields` mantığı
      (kaydırıcı + kutu, sınıra çekme, %30/%70, TR ipucu / EN ad) küçük bir kit
      olarak taşınır; şemadan üretilen Details ve taşınan paneller aynı kiti
      kullanır. *Adım 1 (2026-11-13):* `src/editor/ui` (form görünümü, parametre
      kuralları, token'lar, ikonlar), `?editor-kit`, `npm run smoke:editor`.
- [x] DOM panelleri uyarlanarak taşınır (framework yok, redesign yok): Outliner,
      Details (şema tabanlı), Content Browser, World Settings, ortam ve
      post-process ayrıntıları (görünüm ayarı burada yapılır), Add Actor menüsü.
      Outliner sanallaştırılmış liste; 50.000 aktörde akıcı (mimari A1 ölçüm
      sahnesi). `data-testid` sözleşmesi korunur. *Adım 5 (2026-11-14):* Outliner
      (`npm run bench:outliner` eşik içinde), Details, World Settings, ortam ayrıntıları,
      Add Actor; *adım 6 (2026-11-14):* Content Browser (6a–g), motor içeriği
      kipi ve 39 editör smoke'u ile kutu kapandı.
- [x] Kaydet / aç, Open Level, Play (runtime'ı yeni sekmede açar; kaydedilmemiş
      anlık görüntüyle, diske yazmadan — mimari A6; oturum katmanı, karar 8).
      *Adım 8 (2026-11-15):* oturum katmanı, `?play=<id>`, 409'da Compare / Reload.
- [x] Dist doğrulaması (`verify:dist --strict`: editör sızıntısı yok; motor
      içeriği ve seçili paketler dist'te) ve alt dizin (`base`) yayını testi
      kapıya ve CI'a girer (mimari §4.8 build, §4.10, F06). 2a'dan taşındı
      (2026-11-11). *Adım 2 (2026-11-13):* `verify:dist --strict`, üretim build'i
      statik içerikle (`tools/build-content.ts`), `npm run smoke:dist`.
- [x] **Genel veri editörü (mimari A13):** oyunun şemalı veri asset'leri
      (ekonomi, denge, tablolar) Content Browser'dan açılır, Details ile aynı
      kitle şemadan üretilen formda ve tablo görünümünde düzenlenir. Forge'daki
      Data Table editörünün yerini alır; oyuna özel düzenleme arayüzü yazılmaz.
      Materyal, static mesh ve aktör sınıfı editörleri bunun üstüne önizlemeyle
      (karar 7). *Adım 7 (2026-11-14):* ortak oturum / pencere, sanal tablo,
      materyal / model / aktör sınıfı araçları ve tek GPU'da taslak önizlemeleri.
- [x] **Ajan düzenleme komutları (mimari A12):** editörün düzenleme modeli
      üzerinden CLI: aktör ekle / taşı / sil, bileşen alanı yaz, sınıf
      override'ı; okuyan `find` / `show` (karar 5). Kayıt servisinden geçer
      (doğrulama, çakışma); çıktı kısa. Kabul: aynı değişiklik editörden ve
      komuttan aynı kanonik dosyayı yazar. *Adım 9 (2026-11-15):* `npm run forge -- edit`,
      ortak işlemler `src/engine/edit`, yerel istemci, süreçler arası kayıt kilidi; editörün
      canlı tazelenmesi; kabul `agent.spec` (editör ↔ komut bayt bayt aynı).
- [x] Kapı: Forge'daki `editor-authoring` smoke'unun karşılığı yeşil (yerleştir,
      gizmo araçları, Details'te X, undo / redo, kaydet, yeniden aç, Play; CI'da
      `forceWebGL`, yerelde WebGPU); dist'te editör sızıntısı yok, `base` yayını
      çalışıyor; Outliner 50.000 aktörde akıcı; A12 kabulü. *Adım 10 (2026-11-15):*
      `authoring.spec` (gate ve CI'da `forceWebGL` 66 editör smoke'u; `npm run
      smoke:editor:webgpu` gerçek WebGPU'da 66 / 66), `smoke:dist`, `bench:outliner`
      eşik içinde, `agent.spec`.
