# Forge WebGPU — Prosedürel Bitki ve Çevre Prop'u Planı

**Sürüm:** v0.2 · 2026-11-11 (v0.1'den fark: tarifin türü ve çıktının
saklanışı karara bağlandı; bake yolunda hız karşılaştırması eklendi)
**Durum:** Plan. Uygulama başlamadı; kod, bağımlılık ya da ana plan kutusu
değişmedi. Başlama koşulu §2'de.
**İlgili belgeler:** [yeniden inşa planı](FORGE_WEBGPU_REBUILD_PLAN.md) (faz
sırası; bu iş onun Faz 5'inden sonra başlar),
[mimari rapor](FORGE_WEBGPU_ARCHITECTURE.md) (ürün tezi §0.0, katmanlar §4.2,
özellik modülü §4.3, asset modeli A10). Çelişkide o iki belge geçerlidir.
**Yerini aldığı belgeler:** `docs/procedural/` altındaki araştırma raporu ve
kapsam envanteri (2026-11-11, commit'lenmemişti; kaldırıldı). Doğrulanmış
bulguları Ek A'ya ve §4–§8'e taşındı.
**Kanıt arşivi:** `docs/research/procedural-vegetation-2026-11-11/` (kaynak
video, 812 kare, görüntüleyici). Yalnız bu makinede durur, depoya girmez.

> **Hedef:** World Builder'ın ürettiği dünyalarda ağaç, çalı, ot, kaya, kütük
> ve zemin döküntüsü için hazır model aranmasın. Motor bu varlıkları küçük bir
> tariften kendisi üretir; çıktı sıradan bir asset'tir ve lisansı projeye
> aittir.

---

## 1. Neden ve ne

**Sorun.** Bugünkü düzende World Builder bir ağacın, kayanın, çalının yerini
belirler ve oraya yer tutucu koyar; modeli kullanıcı getirir. Her dünya için
uygun model bulmak zor, bulunanların lisansı ayrı bir yük. Kenney / Quaternius
bu projede yok (plan 2b, kullanıcı kararı 2026-11-11).

**Karar (kullanıcı, 2026-11-11).** Doğa varlıklarında "modeli kullanıcı
getirir" kuralının yerini prosedürel üretim alır. Bina, köprü, araç, karakter
ve tekil kahraman objeler bu planın dışındadır; onlar için bugünkü kaynaklar
(Blender, Tripo, hazır model) geçerli kalır.

**Ürün tezine uygunluk (mimari §0.0).**

- *İnsan istemsiz müdahale eder:* tür, seed, yaş, boy, taç gibi kontroller
  şemadan üretilen formda kaydırıcıdır; sonucu yan yana önizlemede görür.
- *Ajana hazır sistem:* tarif küçük, kanonik bir JSON'dur. Ajan binlerce
  köşeyi değil 30–40 satırlık tarifi yazar; değişiklik küçük bir diff'tir.
- *Ayarlar şemalı:* her üreticinin parametreleri şema DSL'iyle tanımlanır.

**Bu planın kapsamadıkları.**

| Kapsam dışı | Neden |
|---|---|
| Görsel node / graf editörü | §0.0: grafik üstünde yazılan araçlar motora girmez |
| Oyun sırasında üretim | Çıktı önceden üretilir; oyun build'ine üretici kodu girmez |
| Yerleşimin yeniden üretimi, sahiplik, "yalnız değişeni güncelle" | Kullanıcı kararı 2026-11-07 (plan 2b); sahne onaydan sonra kullanıcınındır |
| Biyolojik büyüme / çevre simülasyonu | Gereken şey kontrol edilebilir biçim; simülasyon kapsamı büyütür |
| Binalar, yol ağı, yerleşim planı | World Builder'ın mevcut algoritmaları ve ayrı iş |
| Tür kataloğu | Türler oyun verisidir (§5.3); motor yalnız üretici taşır |

---

## 2. Başlama koşulu ve ana plandaki yeri

Kullanıcı kararı (2026-11-11): bu iş şimdi yalnız planlanır; motor ve World
Builder hazır olunca başlar. Ana plana yeni faz eklenmedi; başlarken tek satırla
bağlanır.

**En az gereken ana plan çıktıları:**

| Ana plan | Bu işin ondan kullandığı |
|---|---|
| 2b | World Builder algoritmaları taşınmış; `world:random` yeni level formatını yazıyor; yerleşimler GUID + rol taşıyor |
| Faz 3 | Materyal sistemi (TSL), GLB + KTX2 yükleme, render kaynak önbelleği |
| Faz 4 | Editör kabuğu, Content Browser, şemadan form, genel veri editörü (A13), ajan komutları (A12) |
| 5a | Terrain (yerleşimin zemini) |
| 5c | GPU güdümlü foliage: instancing, culling, impostor, rüzgâr, fade |
| 5d | World Builder penceresi ve önizleme worker'ı |

Faz 6–10 (oyun runtime'ı, su, deformasyon, ileri aydınlatma, Ridgebound göçü)
bu işi beklemez, bu iş de onları beklemez. Hangi noktada başlanacağı kullanıcı
kararıdır.

**Başlarken ana planda doğrulanacak üç nokta** (bugünden değişiklik istemez):

1. 5c'nin foliage türü mesh'i GUID ile, LOD zinciri ve impostor atlasıyla
   birlikte kabul ediyor mu?
2. 5c'nin rüzgârı köşe niteliklerinden mi besleniyor (§6.5)?
3. World Builder'ın model kaynağı listesi yeni bir kaynağa açık mı (§7.2)?

---

## 3. Nasıl çalışır

```text
Tarif (küçük JSON: üretici + parametreler + seed listesi)
        │   saf kod, Node'da ve worker'da çalışır
        ▼
İskelet / biçim  ──►  Mesh (köşe, normal, UV, rüzgâr ağırlığı)
        │
        ├──►  LOD'ler (aynı iskeletten daha kaba örnekleme)
        ├──►  Kart atlası + impostor atlası (bake)
        └──►  Basit collider + istatistik
        ▼
Sıradan asset'ler: mesh dosyaları + dokular + foliage türü
        ▼
World Builder: rol → asset; yer tutucu yerine gerçek model
        ▼
5c foliage yolu / instanced static mesh: binlerce örneğin çizimi
```

Üç ayrı iş var ve bu plan yalnız ilkini kurar:

| İş | Sahibi |
|---|---|
| **Biçim üretimi:** bir ağacın dalları, bir kayanın yüzeyi | Bu plan |
| **Yerleşim:** hangi tür nerede, hangi yoğunlukta | World Builder (zemin örtüsü kuralları, rol yerleşimi); bu plan dokunmaz |
| **Sunum:** instancing, culling, LOD seçimi, rüzgâr, impostor çizimi | Ana plan 5c |

Çıktı sıradan asset olduğu için oyunun kendisi üreticiyi tanımaz. Üretici
yalnız editörde ve Node araçlarında yaşar.

---

## 4. Üretici aileleri

Motor tür değil **üretici** taşır. Bir üretici, aynı teknikle yapılan bütün
varlıkları kapsar; "meşe" ya da "granit" o üreticinin bir ön ayarıdır (§5.3).

| Üretici | Ne üretir | Teknik | Sıra |
|---|---|---|---|
| **Kaya** | Büyük kaya, taş, çakıl; köşeli ve yuvarlak | Başlangıç hacmi (rastgele noktaların dışbükey kabuğu ya da alt bölünmüş küre) + düzlem kesikleri + çok ölçekli gürültü + alt yüz düzleme / gömülme | PG1 |
| **Dallanan** | Geniş yapraklı ağaç, çok saplı çalı, ayakta kuru ağaç | Seviye başına parametrik dallanma (Weber–Penn ailesi) + taç zarfı; dal boyunca tüp mesh; uçlara yaprak | PG2 |
| **Şerit / demet** | Çim, uzun ot, saz, basit çiçek sapı | Kökten çıkan eğri şeritler; boy, kıvrım, genişlik eğrisi, demet dağılımı | PG4 |
| **Ölü odun** | Kütük, devrilmiş gövde, kırık dal | Dallanan iskeletten kesit: uç kapakları, kırık yüzeyi, yatırma | PG6 |
| **Döküntü** | Düşmüş yaprak, kozalak, dal parçası, çakıl kümesi | Dallanan ve Kaya üreticilerinin parçalarından küçük mesh'ler | PG6 |
| **İğne yapraklı** | Çam, ladin, servi | Dallanan üretici + iğneli dal ucu kartları (iğne tek tek mesh olmaz) | PG6 |
| **Frond / rozet** | Eğrelti, palmiye tacı, rozet bitki | Orta damar + iki yanda yaprakçık; merkezden yayılan dizilim | PG7 |
| **Basit biçim** | Mantar, çit direği, sandık, varil | Profil döndürme / uzatma + parça birleştirme | PG7, PK5'e bağlı |

**Seçimlerin gerekçesi.**

- **Parametrik dallanma**, doğrudan kontrol verir: her dal seviyesinde uzunluk,
  açı, sayı, eğrilik, incelme. Videodaki üst kontroller (Ek A) bu modelle
  karşılanır. *Space colonization* (taç hacmine dağıtılmış noktalara doğru
  büyüme) ancak taç doldurma yetersiz kalırsa ikinci yöntem olarak eklenir.
  L-system kullanıcıya açılmaz; kural dili yazdırmak §0.0'a uymaz.
- **Çalı ayrı topolojidir:** kök boğazından çok sap çıkar. Ağaç üreticisine
  "gövde boyu sıfır" hilesiyle sığdırılmaz; aynı çekirdeğin ayrı bir ön ayarı
  ve başlangıç kuralı olur.
- **Kaya en basit ailedir:** alfa yok, rüzgâr yok, kart yok. Bu yüzden bütün
  hattı (tarif → mesh → LOD → asset → World Builder) ilk o sınar (§10).
- **Ortak kavramlar:** sap, bağlanma noktası, organ (yaprak, iğne, çiçek),
  zarf, materyal profili. Dallanan, şerit ve frond üreticileri bunları
  paylaşır; tek bir "özyinelemeli ağaç" sınıfına zorlanmaz.

`three 0.187.0` içindeki `examples/jsm/generators/TreeGenerator.js` yalnız
referanstır: `three/webgpu` import ettiği için katman kuralıyla `render`
dışına giremez, yaprak üretmez ve tek sıralı rastgele akış kullanır (§6.1).

---

## 5. Veri sözleşmesi

Alan adları öneridir; şema uygulamada kesinleşir.

### 5.1 Tarif

Tarif, Content Browser'da görünen küçük bir JSON asset'idir. Faz 4'ün genel
veri editörünün (A13) şemalı veri asset'i olarak kayıtlıdır ve onun formuyla
düzenlenir (kullanıcı kararı 2026-11-11). A13 mekanizması yalnız oyunun
tanımladığı türlere açık kurulduysa, motor özelliklerine de açılır.

```text
Üretim tarifi
  id (GUID), schema
  generator            "rock" | "branching" | "blade" | …
  generatorVersion     çıktıyı değiştiren her üretici değişikliğinde artar
  params               o üreticinin şemalı parametreleri
  variants             seed listesi; her seed bir prototip üretir
  lod                  LOD başına hedefler (§8)
  materials            kabuk / yaprak / yüzey materyal ve doku referansları
  collision            yok | gövde kapsülü | dışbükey kabuk
  linked               isteğe bağlı: başka tarif (ör. kütüğün ait olduğu ağaç)
```

### 5.2 Çıktı

Çıktı kalıcı dosyadır (kullanıcı kararı 2026-11-11): projeye yazılır ve
commit'lenir, önbellek gibi her makinede yeniden üretilmez. Her prototip için
sıradan asset'ler yazılır ve tarifin yanındaki klasörde durur:

- mesh dosyası (LOD'leriyle), 5c'nin beklediği LOD sözleşmesinde;
- dokular: yaprak / kart atlası, impostor atlası, gerekirse kabuk ya da yüzey
  karosu;
- bitkilerde foliage türü; kaya ve kütükte statik mesh olarak kullanılacak
  kayıt;
- meta: kaynak "üretildi", tarifin GUID'i, üretici sürümü, içerik özeti,
  proje lisansı. Böylece `verify:assets` üçüncü taraf kaydı aramaz.

Yeniden üretim aynı dosyaların üstüne yazar ve GUID'leri korur; yerleşimler
kırılmaz. Var olan çıktının üstüne yazmak açık bir kullanıcı eylemidir
(level'lardaki `--force` kuralının karşılığı).

### 5.3 Ön ayarlar ve türler

Tür ön ayarları (meşe, huş, granit…) içeriktir. İki yerde durabilir:

- **İçerik paketi** (`content/packs/<id>/`): tarif + önceden üretilmiş çıktı.
  Proje manifestte seçer; paket editörden yazılmaz (A9).
- **Oyun projesi:** projenin kendi tarifleri. Paketteki bir ön ayarı
  değiştirmek isteyen, onu projeye kopyalayıp orada üretir.

Bölgeye ya da kültüre bağlı seçim (hangi dünyada hangi türler) bölge
profilinde, yani oyun verisinde kalır.

---

## 6. Teknik tasarım

### 6.1 Determinizm

- Her dal ve organ, kararlı kimliğinden türeyen **kendi rastgele akışını**
  kullanır (`hash(seed, dal yolu)`). Tek sıralı akışta bir dala yaprak eklemek
  bütün ağacı değiştirir.
- Biçim, LOD örneklemesi ve doku üretimi ayrı akışlardır.
- Aynı tarif + aynı üretici sürümü aynı çıktıyı verir. Seed tek başına yetmez;
  `generatorVersion` bunun için var.
- Oyun pişmiş dosyayı yüklediği için cihazlar arası kayan nokta farkı sorun
  olmaz.
- Testler Node'da yapısal ölçülere bakar (köşe / üçgen sayısı, sınır kutusu,
  bütçe, sonlanma). Bit düzeyinde özet karşılaştırması yalnız aynı çalışma
  ortamında güvenilirdir.

### 6.2 Dallanan üretici

- **İskelet:** sap listesi; her sapta merkez eğrisi, yarıçap eğrisi, ebeveyn,
  seviye. Mesh iskeletten ayrıdır; LOD, kart, kütük ve collider aynı iskeletten
  türer.
- **Yüzey:** eğri boyunca kesit halkaları, paralel taşıma çerçevesi (gereksiz
  burulma olmaz), uca doğru incelme, kökte genişleme. UV'de çevre U, yay
  uzunluğu V; kabuk dokusu dal uzunluğuyla tutarlı kalır.
- **Çatal:** ilk sürümde örtüşen kapalı tüpler. Yakın planda dikiş rahatsız
  ederse ayrı birleşim mesh'i eklenir.
- **Üst kontroller:** tür ön ayarı, seed, yaş, boy, genişlik, en geniş nokta,
  doluluk, düzensizlik. Dal seviyesi profilleri ileri ayar olarak kapalı durur.
- **Bütçe ve sonlanma:** en çok derinlik, sap, organ ve köşe sayısı tarifte
  sınırdır; sınır aşılırsa üretim durur ve rapor eder.

### 6.3 Kaya üreticisi

- Biçim bir fonksiyondur: aynı tarif farklı çözünürlükte yeniden örneklenir.
  LOD, sadeleştirmeyle değil **daha kaba örneklemeyle** çıkar; siluet korunur.
- Materyal nesne uzayında üç eksenli (triplanar) izdüşüm kullanır; UV açılımı
  gerekmez.
- Köşe rengine oyukluk / üst yüz ağırlığı yazılır; materyal bunu kir, yosun ya
  da kar karışımı için kullanabilir.
- Alt yüz düzlenir, gömülme derinliği tarifte durur; yerleşimde zemine oturur.
- Collider: dışbükey kabuk, az noktalı.

### 6.4 LOD, kart ve impostor

| Düzey | Nasıl elde edilir |
|---|---|
| LOD0 | İskeletin tam örneklemesi; yaprak yoğunluğu ve en ince odun eşiği bütçeye göre |
| LOD1 | Daha az kesit ve çevre dilimi; ince dallar düşer; yapraklar dal ucu kartlarına geçer |
| LOD2 | Yalnız gövde + ana dallar; az sayıda büyük kart |
| Impostor | Bitkinin çok açıdan önceden çizilmiş atlası; uzak mesafede tek dörtgen |

- **Dal ucu kartı kitaplığı:** tür başına 8–16 dal ucu kümesi bir kez
  bake edilir ve o türün bütün prototipleri aynı atlası paylaşır. Atlas
  prototip başına çoğalmaz (§8).
- **Impostor:** yarım küre üstünde 8 × 8 görüş, renk + alfa ve normal + derinlik
  dokuları; komşu görüşler karıştırılır. Videodaki "1024 px, 64 views, 12 MB"
  görüş başına 128 px demektir ve yalnız uzakta yeter (Ek A).
- **Geçiş:** LOD seçimi ekrandaki boyuta göre; hysteresis ve kısa dither fade.
  Bunlar 5c'nin işidir; üretici yalnız her LOD'un sınırını ve önerilen ekran
  boyutu eşiğini verir.
- Ot ve küçük taşta impostor yoktur; uzaklıkla seyrelme ve fade yeter.

### 6.5 Rüzgâr ve collider

- Rüzgâr ağırlıkları iskeletten bilinir ve köşelere yazılır: gövde bükülmesi
  (yüksekliğe göre), dal salınımı (dal seviyesi ve faz), yaprak titremesi
  (uca uzaklık). Elle boyama gerekmez. Biçim 5c'nin rüzgâr sözleşmesine uyar.
- Collider: ağaçta gövde ve kalın dallar için kapsül; kayada ve kütükte
  dışbükey kabuk; ot, yaprak ve çakılda yok.

### 6.6 Dokular

Geometri prosedürel olsa da doku gerekir; lisans sorunu burada geri gelmemeli.

| Doku | Önerilen kaynak |
|---|---|
| Yaprak (renk, alfa, normal) | Prosedürel: parametrik yaprak dış hattı + damar; CPU'da atlasa çizilir |
| Dal ucu kartı, impostor | Üretilen geometriden bake (§6.7) |
| Kabuk, kaya yüzeyi | Prosedürel döşenebilir karo (gürültü tabanlı); yetmezse PK4 |

Prosedürel kabuk ve kaya yüzeyi yakın planda fotoğraf dokusu kadar zengin
olmayabilir. Bu risk PK4'te ele alınır.

### 6.7 Bake yolu

Kart ve impostor atlası için bitkinin çizilmesi gerekir. İki yol var:

| Yol | Artı | Eksi |
|---|---|---|
| **CPU rasterleyici** (saf kod, `engine`) | Node'da ve worker'da çalışır; World Builder CLI'ı tek başına tam asset üretir; CI'da sınanır; deterministik | Küçük bir rasterleyici yazılır (renk, alfa, normal, derinlik; ışık yok) |
| GPU bake (`render`) | Gerçek materyallerle çizer | Yalnız başlıklı tarayıcıda; CLI ve CI üretemez |

Öneri CPU rasterleyicidir (PK3). Atlaslar ışıksız G-buffer verisidir; görüş
başına 128–256 px ve 64 görüş, worker'da saniyeler mertebesinde bir iştir.
Bu tahmindir, PG3'te ölçülür.

**Hız.** Çizim adımının kendisi GPU'da belirgin biçimde hızlıdır
(milisaniyeler; CPU'da saniyeler). Ama bu fark sonucu değiştirmez:

- Bake kare başına değil, tarif başına **bir kez** yapılır ve çıktı kalıcı
  dosyadır.
- Toplam sürenin büyük kısmı çizim dışındadır: mesh üretimi, doku sıkıştırma
  (KTX2 kodlaması iki yolda da CPU işidir) ve dosya yazımı.
- Kaydırıcı sürüklenirken görülen önizleme bake değildir; gerçek mesh zaten
  GPU'da çizilir.

Belirleyici olan hız değil, **nerede çalışabildiğidir**: World Builder dünyayı
komut satırından, tarayıcı açmadan üretir. İki yolu birlikte tutmak da
önerilmez; aynı tarif iki yolda piksel düzeyinde farklı atlas verir. Ölçümde
CPU bake kullanımı engelleyecek kadar yavaş çıkarsa GPU yoluna tek yol olarak
geçilir.

### 6.8 Katmanlar

| Yer | İçerik |
|---|---|
| `src/engine/…` | Saf üretim: rastgele akışlar, iskelet, mesh, LOD, kart kümeleme, kaya, rasterleyici, collider, istatistik. three yok, DOM yok; çıktı typed array |
| `src/features/<ad>/schema.ts` | Tarif şeması ve üretici parametreleri; Node'da yüklenir |
| `src/features/<ad>/render.ts` | Typed array → geometri; kabuk, yaprak, kaya TSL materyalleri |
| `src/features/<ad>/editor.ts` | Tarif paneli: form + önizleme + üret düğmesi |
| `tools/` | CLI: tarif doğrulama, üretim, asset yazımı |
| İçerik paketi / oyun projesi | Ön ayarlar, üretilmiş çıktılar |

Özelliğin `runtime.ts` dosyası boş kalabilir: oyun yalnız üretilmiş asset'i
yükler.

---

## 7. World Builder bağlantısı

### 7.1 Bugünkü durum (Forge WebGL, 2b'de taşınıyor)

- Brief'te model satırları: `role`, `source`, `file`, `variant`. Kaynaklar
  `blender | tripo | ready` (`engine/worldbuilder/worldBrief.ts`).
- Zemin örtüsü dosyası bitkileri boya katmanına bağlar: `layer`,
  `foliageType`, `density`, `minWeight`, `seed`
  (`engine/worldbuilder/groundCover.ts`).
- Kayalar adetle serpilir; `prop.rock` rolünün `high`, `slope`, `river`
  varyantları var (`engine/worldbuilder/randomWorld.ts`).
- Modeli olmayan rol yer tutucu küp alır.

Taşınmış hâli başlarken yeniden doğrulanır; adlar değişmiş olabilir.

### 7.2 Önerilen bağlantı

1. **Yeni model kaynağı:** `generated`. Satır dosya yolu yerine tarifi
   gösterir.
2. **Çözümleme adımı:** World Builder bir dünyayı yazarken `generated` kaynaklı
   her rol için tarifin çıktısı var mı bakar; yoksa üretir, asset'leri yazar,
   rolü bağlar. Var olan çıktıya dokunmaz.
3. **Varyant eşlemesi:** `high / slope / river` gibi varyantlar aynı tarifin
   farklı parametre kümeleri ya da ayrı tarifler olur (yuvarlak dere taşı,
   köşeli yamaç kayası).
4. **Bağlı tarifler:** bir ormanın kütüğü ve yaprak döküntüsü, o ormanın ağaç
   tarifinden türer; tür tutarlılığı elle kurulmaz.
5. **Örnek çeşitliliği yerleşimde:** ölçek, dönüş, renk tonu, rüzgâr fazı örnek
   başına değişir. Prototip sayısı sınırlı kalır (§8).

### 7.3 Konseptten sahne akışındaki yeri

Onay noktaları değişmez; yalnız doğa varlıklarında üçüncü onayın konusu değişir:

1. Sahne planı.
2. Greybox sahne: yer tutucularla.
3. **Aile onayı:** tür başına bir önizleme sayfası (prototipler × LOD'ler,
   ölçü çubuğuyla). Blender greybox modeli yerine üretilmiş prototip gösterilir.
4. Ayrıntı: yer tutucular üretilmiş asset'lerle değişir.

Onaydan sonra sahne kullanıcınındır. Bu sistem yerleşimi yeniden çalıştırmaz;
tarifi değiştirip yeniden üretmek kullanıcının açık eylemidir ve yalnız asset
dosyalarını yeniler.

---

## 8. Bütçeler

Aşağıdakiler **ilk hedeftir**, ölçüm değildir. PG3'te R1 (RTX 3060) üstünde,
5c'nin gerçek sahnesinde ölçülüp düzeltilir. Ana planın G6 sınırı (Derekavak
P2, 60 Hz: render gönderimi ≤ 3 ms, ana iş parçacığı ≤ 6 ms) üretilmiş
varlıklarla da tutmalıdır.

**Üçgen (prototip başına):**

| Varlık | LOD0 | LOD1 | LOD2 | Uzak |
|---|---:|---:|---:|---|
| Büyük ağaç | ≤ 20.000 | ≤ 5.000 | ≤ 800 | Impostor |
| Çalı | ≤ 4.000 | ≤ 800 | ≤ 100 | Fade |
| Ot demeti | ≤ 120 | ≤ 20 | — | Seyrelme + fade |
| Büyük kaya | ≤ 3.000 | ≤ 600 | ≤ 120 | Fade ya da HLOD |
| Taş / çakıl | ≤ 100 | — | — | Seyrelme + fade |

Karşılaştırma: videodaki akçaağaç 602.952 (kaynak), 273.380 (LOD0), 48.322
(LOD1), 7.792 (LOD2) üçgendir. O zincir tek ağaç gösterimi içindir, web'de
orman için değil.

**Prototip sayısı:** tür başına 4–6 ile başlanır.

**Doku belleği** (sıkıştırılmış, piksel başına 1 bayt sınıfı; mip zinciriyle):

| Doku | Boyut | Bellek |
|---|---|---:|
| Tür başına dal ucu kartı atlası, 2 doku | 2048² | ≈ 10,7 MiB |
| Impostor atlası, prototip başına 2 doku | 1024² | ≈ 2,7 MiB |
| Kabuk / kaya karosu, 2–3 doku | 1024² | ≈ 2,7–4 MiB |

Ağaç türü başına hedef ≈ 16 MiB: bir kart atlası + iki impostor prototipi.
Sıkıştırılmamış RGBA8'de aynı içerik dört katıdır; KTX2 bu yüzden zorunludur.
İndirme boyutu hedefi PG3'te ilk ölçümden sonra konur.

**Rapor:** her üretim köşe, üçgen, doku baytı, bake süresi ve collider
sayısını yazar; bütçeyi aşan tarif uyarı verir.

---

## 9. Editör ve ajan yüzeyi

**Tarif paneli (insan):**

- Genel veri editörünün (A13) şemadan ürettiği form; parametre UI kuralları geçerli (kaydırıcı + kutu,
  sınıra çekme, TR ipucu / EN ad).
- Önizleme: kaynak, LOD0–2 ve impostor yan yana; kamera çevrede döner.
  Videodaki en yararlı fikir budur.
- Sayaçlar: boy, yaprak, üçgen, doku belleği, üretim süresi.
- Varyant şeridi: seed başına küçük görüntü.
- Önizleme worker'da üretilir; kaydırıcı sürüklenirken kaba, bırakınca tam
  üretim; eski istekler numarayla elenir.
- Işık, renk ve pozlama ayarı kullanıcıdadır; panel yalnız parametreleri açar.

**Komut satırı (ajan ve World Builder):**

- Tarifi doğrula, üret, asset'leri yaz; kısa çıktı (sayılar, bütçe durumu,
  yazılan dosyalar).
- Tarif alanları JSON Schema ile doğrulanır; hata alan yolunu gösterir.
- Önizleme sayfası (§7.3) aynı CPU rasterleyiciyle Node'da üretilebilir.

---

## 10. Adımlar

Her adım dikey bir dilimdir ve kendi kapısıyla biter. Görsel beğeni kullanıcı
kabulüdür; kapılar işlevsel ve ölçülebilirdir.

- [ ] **PG0 Hazırlık.** §2'deki ana plan çıktıları ve üç nokta kodla
      doğrulanır; PK3–PK6 kapanır; ana plana bağlantı satırı eklenir.
- [ ] **PG1 Kaya, uçtan uca ince dilim.** Saf çekirdek (rastgele akışlar,
      mesh yazımı, LOD örneklemesi, collider, istatistik) + kaya üreticisi +
      tarif şeması + triplanar materyal + tarif paneli + CLI + World Builder'da
      `generated` kaynağı. *Kapı:* `world:random` dünyasında `prop.rock`
      rolleri hazır model olmadan doluyor; `verify:assets` yeşil; aynı tarif
      iki koşuda aynı sayıları veriyor; gerçek WebGPU'da tek kontrol çekimi.
- [ ] **PG2 Dallanan üretici: geniş yapraklı ağaç.** İskelet, tüp mesh,
      prosedürel yaprak, kabuk materyali, rüzgâr ağırlıkları, LOD0. *Kapı:*
      bütçe içinde sonlanma; düzenle → kaydet → yeniden aç aynı çıktı; rüzgâr
      5c yolunda çalışıyor.
- [ ] **PG3 LOD, kart ve impostor.** Dal ucu kartı kitaplığı, CPU bake, KTX2,
      impostor, foliage türü çıktısı. *Kapı:* 360° ve yukarıdan bakışta siluet
      tutarlı; gölge ve alfa LOD'ler arasında uyumlu; §8 bütçeleri ölçüldü ve
      güncellendi; G6 üretilmiş ağaçlı sahnede sınırın içinde.
- [ ] **PG4 Çalı ve ot.** Çok saplı çalı ön ayarı; şerit / demet üreticisi.
      *Kapı:* çalı ağaçtan ayrı topolojiyle üretiliyor; ot yakın–uzak geçişi
      seyrelme ve fade ile çalışıyor.
- [ ] **PG5 World Builder'ın tam bağlantısı.** Zemin örtüsünün bitkileri
      tariflere bağlanır; bağlı tarifler; aile onay sayfası; başlangıç ön ayar
      paketi. *Kapı:* üretilen bir dünyada doğa varlıkları için hazır model
      yok; onay sayfası Content Browser'da görünüyor.
- [ ] **PG6 Ölü odun, döküntü, iğne yapraklı.** *Kapı:* kütük ve döküntü
      bağlı ağaç tarifinden türüyor; iğne yapraklı ağaç kart bütçesinde.
- [ ] **PG7 Genişleme.** Frond / rozet, basit biçim ve sonrası. Her biri bir
      oyun isteyince ayrı adım olarak açılır.

**İş bölümü.** Saf ve iyi tanımlı parçalar (rastgele akış, tüp mesh, kaya
biçimi, rasterleyici, kart kümeleme) imza + kabul ölçütüyle Codex'e
verilebilir; tasarım, TSL materyalleri, editör paneli ve inceleme Claude'da.

---

## 11. Kararlar

**Kapalı:**

| Konu | Karar |
|---|---|
| Doğa varlıklarının kaynağı | Prosedürel üretim, "modeli kullanıcı getirir" kuralının yerini alır (kullanıcı, 2026-11-11) |
| Zamanlama | Şimdi yalnız plan; motor ve World Builder hazır olunca başlanır (kullanıcı, 2026-11-11) |
| Yerleşimin yeniden üretimi | Yok (kullanıcı, 2026-11-07; plan 2b) |
| Üçüncü taraf hazır kitaplık | Kenney / Quaternius yok (kullanıcı, 2026-11-11) |
| Tarifin türü (eski PK1) | Genel veri editörünün (A13) şemalı veri asset'i; onun formuyla düzenlenir (kullanıcı, 2026-11-11) |
| Çıktının saklanışı (eski PK2) | Kalıcı dosya: projeye yazılır, commit'lenir; önbellek değil (kullanıcı, 2026-11-11) |

**Açık (PG0'da kapanır):**

| ID | Soru | Öneri |
|---|---|---|
| PK3 | Kart ve impostor bake'i CPU'da mı, GPU'da mı? | CPU rasterleyici (§6.7) |
| PK4 | Kabuk ve kaya yüzeyi dokusu yetmezse kaynak ne? | Önce prosedürel karo; yetmezse Codex'e ürettirilen doku, kaynağı meta'da kayıtlı |
| PK5 | İnsan yapımı basit prop'lar (çit direği, sandık, varil) bu işe dahil mi? | PG7'ye kadar ertele; World Builder'ın çit ve donatı yerleşimi ihtiyaç doğurursa aç |
| PK6 | Başlangıç ön ayarları nerede durur? | `content/packs/starter/`: birkaç nötr ön ayar (geniş yapraklı, iğne yapraklı, çalı, ot, köşeli ve yuvarlak kaya); bölgeye özgü türler oyun projesinde |

---

## 12. Riskler

| Risk | Karşılık |
|---|---|
| Prosedürel görünüm hazır modelin kalitesine ulaşmaz | Kaya ve ağaç ilk iki adımda kullanıcı kabulüne çıkar; yetmezse PK4 ve hazır model yolu açık kalır |
| Yaprak kartlarının overdraw'ı GPU'yu doldurur | Kart sayısı ve alanı bütçede; alfa boşluğu az kesim; PG3'te ölçüm |
| Doku belleği prototip sayısıyla çarpılır | Tür başına ortak atlas, KTX2, impostor yalnız büyük ağaçta (§8) |
| CPU rasterleyici kalitesi (alfa kenarı, mip) yetmez | Üst örnekleme; yetmezse GPU bake yedek yol olarak eklenir |
| 5c sözleşmesi üreticinin çıktısıyla uyuşmaz | PG0'da kodla doğrulama; üretici 5c'ye uyar, tersi değil |
| Kapsam türden türe büyür | Üretici ailesi başına ayrı adım; PG7 yalnız oyun isteyince |
| Üretici değişince eski tarifler başka görünür | `generatorVersion` + çıktının kalıcı dosya olması |

---

## Ek A — Video gözlemleri

Kaynak: kullanıcının ekran kaydı (27,8 sn, 1920 × 1080, 812 kare; ürün adı
doğrulanmadı). Aşağıdakiler arayüzün gösterdiği değerlerdir; kare 0000 ve
panel kesitleri üstünde yeniden okundu.

| Gözlem | Değer | Bu plana etkisi |
|---|---|---|
| Yan yana görünüm | Source, LOD0, LOD1, LOD2, Impostor | Tarif panelinin önizlemesi (§9) |
| Üst kontroller | Species, Seed, Age, Height, Width, Widest point, Fullness, Irregularity | Dallanan üreticinin üst kontrolleri (§6.2) |
| Akçaağaç, 21,0 m | 220.793 yaprak; 602.952 / 273.380 / 48.322 / 7.792 üçgen | Web bütçesi çok daha sıkı olmalı (§8) |
| LOD denetimleri | LOD0 yaprak %45, en ince odun 1,5 cm; LOD1 birleştirme 45 cm, en ince odun 4 cm; LOD2 birleştirme 140 cm, en ince odun 10 cm | LOD = yaprak seyreltme + ince odun budama + kart kümeleme (§6.4) |
| Impostor etiketi | 1024 px, 64 views, 3 textures, 12 MB | 8 × 8 ızgara, görüş başına 128 px; karede belirgin bulanık |
| Yaş | Huş: 100 yaş 18,1 m / 125.307 yaprak; 22 yaş 12,5 m / 39.513 yaprak | Yaş yapıyı ve maliyeti değiştiriyor, yalnız ölçeği değil |
| Aynı parametre → aynı sonuç | Kavak, genişlik 0,22 → 0,37 → 0,27 → 0,22: sayılar 99.411 / 246.212'ye geri dönüyor | Determinizm beklentisi (§6.1) |
| Tür değişimi | Seed 3'e ve türün varsayılanlarına dönüyor | Tür = ön ayar (§5.3) |

Videoda gösterilmeyenler: rüzgâr, dışa aktarma, orman ölçeğinde performans,
ağaç dışı bitkiler, kullanılan algoritma.

## Ek B — Kaynaklar

Önceki araştırma oturumunda (2026-11-11) açılan kaynaklar; bu belge için
yeniden açılmadı.

- Weber, Penn (1995), *Creation and Rendering of Realistic Trees* —
  [PDF](https://courses.cs.duke.edu/cps124/fall01/resources/p119-weber.pdf)
- Runions, Lane, Prusinkiewicz (2007), *Modeling Trees with a Space
  Colonization Algorithm* —
  [PDF](https://algorithmicbotany.org/papers/colonization.egwnp2007.pdf)
- Prusinkiewicz, Lindenmayer, *The Algorithmic Beauty of Plants*, bölüm 1 —
  [PDF](https://algorithmicbotany.org/papers/abop/abop-ch1.pdf)
- GPU Gems 3, bölüm 16, *Vegetation Procedural Animation and Shading in
  Crysis* —
  [sayfa](https://developer.nvidia.com/gpugems/gpugems3/part-iii-rendering/chapter-16-vegetation-procedural-animation-and-shading-crysis)
- [EZ-Tree](https://github.com/dgreenheck/ez-tree) (MIT, three.js): sade
  algoritma referansı; rüzgârı `onBeforeCompile` ile kurduğu için materyal
  katmanı taşınamaz.
- [SeedThree](https://github.com/SkyeShark/SeedThree): README'sine göre
  WebGPU, Weber–Penn + L-system, LOD / kart / impostor; alfa sürümü, kodu
  sınanmadı.
- `node_modules/three/examples/jsm/generators/` (r187): `TreeGenerator`,
  `ForestGenerator`; yalnız referans (§4).

Bu kaynaklardan kod ya da doku alınmaz; algoritmalar Forge'un katman ve asset
kurallarına göre yeniden yazılır.

## İlerleme kaydı

| Tarih | Sürüm | Not |
|---|---|---|
| 2026-11-11 | v0.1 | Plan yazıldı; prosedürel üretim kararı ve zamanlama (kullanıcı). Eski araştırma raporu ve kapsam envanteri kaldırıldı. Uygulama yok |
| 2026-11-11 | v0.2 | Tarif A13 veri asset'i, çıktı kalıcı dosya (kullanıcı kararları; PK1 ve PK2 kapandı). §6.7'ye CPU / GPU bake hız karşılaştırması eklendi; PK3 açık |
