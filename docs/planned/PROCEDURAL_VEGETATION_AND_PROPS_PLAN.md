# Forge WebGPU — Prosedürel Bitki ve Çevre Prop'u Planı

**Sürüm:** v0.26 · 2026-11-28 (PG3b açıldı: impostor görünümü ve sıkı kart, §10).
Önceki: v0.25 · 2026-11-26 (orman zemini için görsel hedefler ve ilk uygulama, §9.9.1–9.9.2).
Önceki: v0.24 · 2026-11-26 (orman zemini çalışması başladı, §9.9).
Önceki: v0.23 · 2026-11-26 (PG5b adım 6, karışık orman ve genç ağaçlar için kullanıcı görsel kabulü).
Önceki: v0.22 · 2026-11-25 (PG5b adım 5: türler, tek üretici; kullanıcı görsel kabulü).
Önceki: v0.21 (PG5b adım 1–4'ün kullanıcı görsel kabulü).
Önceki: v0.20 (PG5b adım 1–4: taç üreticisi, sprey, yaprak ışığı, LOD).
Önceki: v0.19 (PG5b açıldı: taç kalitesi, üretici sürümü 6; kullanıcı kararları).
Önceki: v0.18 · 2026-11-25 (PG5 editörü ve World Builder bağlantısı, §9.7; görsel kabul bekleniyor).
Önceki: v0.17 · 2026-11-22 (PG4 görsel kabul ve kapanış, §9.5–9.6).
Önceki: v0.16 (şerit/demet ot ve WebGPU yakın–uzak doğrulaması, §9.6).
Önceki: v0.14 (meşenin iç taç dağılımı ve doğal LOD karşılaştırması, §9.3–9.4).
Önceki: v0.11 · 2026-11-19 (kullanıcı PG3 / PV-WES görsel kabulünü verdi; kabuk / kaya
dokuları da KTX2). Önceki: v0.10 (PG3 kapandı: KTX2 atlaslar, §8 ölçüldü, PK7 ölçümle odun /
yaprak ayrımı, PV-WES-01–08 kanıtları). Önceki: v0.9 (PG0 ve PG2 kapandı: iki
ağaç, ortak WES tepkisi, foliage rüzgârı). v0.8 (PG1 kapandı: kaya GLB çıktısı, `forge generate`,
taş doku tarifi, triplanar + `variation`, A / C ölçümü).

**Önceki sürüm:** v0.6 · 2026-11-14 (WES ile birleşik bitki ailesi, ortak çalışma
zamanı davranışı ve 5c ile birlikte ilerleyen üretim dilimi; kullanıcı kararı).
**Durum:** PG0–PG3 uygulandı (5c ile, 2026-11-17 – 2026-11-19). PG4, çok saplı Hazel ve şerit/demet MeadowGrass için WebGPU doğrulaması ve kullanıcı görsel onayıyla kapandı (2026-11-22, §9.5–9.6). PG5 ve PG5b kapandı (2026-11-26, §9.7–9.8). PG3b (impostor görünümü, 2026-11-28 açıldı) ve PG6–PG7 ileride.
Başlama koşulu §2'de.
**İlgili belgeler:** [yeniden inşa planı](FORGE_WEBGPU_REBUILD_PLAN.md) (faz
sırası; küçük üretim dilimi 5c ile birlikte, tam araçlar 5d ile ilerler),
[mimari rapor](FORGE_WEBGPU_ARCHITECTURE.md) (ürün tezi §0.0, katmanlar §4.2,
özellik modülü §4.3, asset modeli A10). Çelişkide o iki belge geçerlidir.
**WES kaynağı:** Forge WebGL'deki
`docs/planned/WES/FORGE_WORLD_ENVIRONMENT_MEVSIM_HAVA_ZAMAN_TEKNIK_TASARIM_VE_UYGULAMA_PLANI_v0.3.md`
tarihsel referanstır ve değiştirilmez. WebGPU'da güncel ortak sözleşme mimari
§4.9'dadır; üretici ve bitki çıktısının ayrıntısı bu belgede yaşar. Eski WES'in
hazır kış modeli gereksinimi ve tekil ağaçta yalnız materyal desteği sınırı,
üretilen bitkiler için bu birleşik tasarımla yer değiştirir.
**Yerini aldığı belgeler:** `docs/procedural/` altındaki araştırma raporu ve
kapsam envanteri (2026-11-11, commit'lenmemişti; kaldırıldı). Doğrulanmış
bulguları Ek A'ya ve §4–§8'e taşındı.
**Kanıt arşivi:** `docs/research/procedural-vegetation-2026-11-11/` (kaynak
video, 812 kare, görüntüleyici). Yalnız bu makinede durur, depoya girmez.

> **Hedef:** World Builder'ın ürettiği dünyalarda ağaç, çalı, ot, kaya, kütük
> ve zemin döküntüsü için hazır model aranmasın. Motor bu varlıkları küçük bir
> tariften kendisi üretir; bitki çıktısı WES'e tepki veren bir bitki ailesidir
> ve lisansı projeye aittir. Tekil ağaç aktörü ve orman örnekleri aynı aileyi
> kullanır; rüzgâr, mevsim, kar ve ıslaklık sahnede görünümü değiştirir.

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

**Birleşik tasarım kararı (kullanıcı, 2026-11-14).** WES kabul ağaçları hazır
modellerden değil bu üreticiden gelir. Önceden geometri üretimi korunur;
çalışma zamanında ortak bitki sistemi WES'i okur. GLB geometri taşıyabilir,
ancak sahnedeki bitki bitki ailesine referans verir (§5.4, §6.9). Her ağaca
ayrı güncellenen script gerekmez.

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
| Biyolojik büyüme / ekosistem simülasyonu | Yaş üretim parametresidir; WES'e görsel tepki (§6.9) kapsam içindedir, biyolojik büyüme hesaplanmaz |
| Fiziksel kar yükü, dal eğilmesi / kırılması ve yaprak başına fizik | İlk kapsam görsel örtü ve yapraklılıktır; fiziksel genişleme ayrı iş |
| Binalar, yol ağı, yerleşim planı | World Builder'ın mevcut algoritmaları ve ayrı iş |
| İnsan yapımı prop'lar (çit, sandık, varil, donatı) | Kullanıcı kararı 2026-11-11; binalar ve kentsel çevreyle birlikte ayrı işte ele alınır |
| Tür kataloğu | Türler oyun verisidir (§5.3); motor yalnız üretici taşır |

---

## 2. Başlama koşulu ve ana plandaki yeri

Kullanıcı kararı (2026-11-14): bu güncelleme yalnız plandır. Önceki "Faz 5'in
tamamını bekle" sırası yerini iki dilime bırakır: ortak sözleşmeler ve küçük
üretici 5c'nin girdisi olacak şekilde 5c ile birlikte; tam tarif paneli ve
World Builder araçları 5d ile ilerler. Ana plan Faz 5'e bağlanır, yeni ana faz
açılmaz. Uygulamaya başlama yetkisi bu belge güncellemesinden çıkmaz.

**En az gereken ana plan çıktıları:**

| Ana plan | Bu işin ondan kullandığı |
|---|---|
| 2b | World Builder algoritmaları taşınmış; `world:random` yeni level formatını yazıyor; yerleşimler GUID + rol taşıyor |
| Faz 3 | Materyal sistemi (TSL), GLB + KTX2 yükleme, render kaynak önbelleği |
| Faz 4 | Editör kabuğu, Content Browser, şemadan form, genel veri editörü (A13), ajan komutları (A12) |
| 5a | Terrain (yerleşimin zemini) |
| 5c ile birlikte | GPU güdümlü foliage: instancing, culling, impostor, rüzgâr, fade; küçük üretim dilimi bununla birlikte doğrulanır |
| 5d, tam araçlar için | World Builder penceresi, tam tarif paneli ve önizleme worker'ı; küçük CLI üreticisinin önkoşulu değildir |

Faz 6–10 (oyun runtime'ı, su, deformasyon, ileri aydınlatma, Ridgebound göçü)
tam üretici kataloğunu beklemez. Terrain örtüsü 5a'da bitki kataloğundan
bağımsız ilerler; bitkiler aynı WES örtüsünü 5c'de tüketir.

**PG0'da birlikte doğrulanacak sözleşmeler:**

1. 5c'nin foliage türü mesh'i GUID ile, LOD zinciri ve impostor atlasıyla
   birlikte kabul ediyor mu?
2. 5c'nin rüzgârı köşe niteliklerinden mi besleniyor (§6.5)?
3. World Builder'ın model kaynağı listesi yeni bir kaynağa açık mı (§7.2)?
4. Bitki ailesini tekil aktör ve foliage aynı çevre tepkisiyle tüketiyor mu;
   WES durumu, zaman politikası ve kış LOD / impostor girdileri uyumlu mu?

---

## 3. Nasıl çalışır

```text
Tarif (küçük JSON: üretici + parametreler + seed listesi)
        │   saf kod, Node'da ve worker'da çalışır
        ▼
İskelet / biçim  ──►  Mesh (köşe, normal, UV, rüzgâr ağırlığı)
        │
        ├──►  LOD'ler (aynı iskeletten daha kaba örnekleme)
        ├──►  Mevsim uyumlu kart ve impostor temsilleri (bake)
        └──►  Basit collider + istatistik
        ▼
Bitki ailesi: kalıcı mesh / dokular + çevre tepki profili + collider
        ▼
Tekil bitki aktörü / World Builder / foliage: aile → prototip örnekleri
        │
WES: mevsim, hava, rüzgâr, örtü → ortak bitki sistemi
        ▼
5c foliage yolu / instanced static mesh: binlerce örneğin çizimi
```

Sorumluluklar:

| İş | Sahibi |
|---|---|
| **Biçim üretimi:** bir ağacın dalları, bir kayanın yüzeyi | Bu plan |
| **Yerleşim:** hangi tür nerede, hangi yoğunlukta | World Builder (zemin örtüsü kuralları, rol yerleşimi); bu plan dokunmaz |
| **Sunum:** instancing, culling, LOD seçimi, rüzgâr, impostor çizimi | Ana plan 5c |
| **Çevre durumu:** mevsim, hava, rüzgâr, kar / ıslaklık ve geçişlerin otoritesi | WES; mimari §4.9 |
| **Bitkinin tepkisi:** yapraklılık, renk, esneklik ve örtü kabulü | Bu planın aile profili + ortak bitki sistemi; çizim 5c |

Oyun üreticiyi çalıştırmaz; kalıcı bitki ailesini ve ortak davranışını tanır.
Geometri üreticisi yalnız editörde ve Node araçlarında yaşar. Mevsim değişimi
mesh üretmez, asset dosyalarına veya yerleşimlere geri yazmaz.

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
| **İğne yapraklı** | Çam, ladin, servi | Dallanan üretici + iğneli dal ucu kartları (iğne tek tek mesh olmaz) | PG2 küçük örnek; PG6 genişleme |
| **Frond / rozet** | Eğrelti, palmiye tacı, rozet bitki | Orta damar + iki yanda yaprakçık; merkezden yayılan dizilim | PG7 |
| **Mantar** | Tekil ve kümeli mantar, ağaç mantarı | Profil döndürme (sap + şapka) | PG7 |

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
  response             mevsim, rüzgâr ve örtü tepki profili (§5.4)
  collision            yok | gövde kapsülü | dışbükey kabuk
  linked               isteğe bağlı: başka tarif (ör. kütüğün ait olduğu ağaç)
```

### 5.2 Çıktı

Çıktı kalıcı dosyadır (kullanıcı kararı 2026-11-11): projeye yazılır ve
commit'lenir, önbellek gibi her makinede yeniden üretilmez. Her prototip için
sıradan asset'ler yazılır ve tarifin yanındaki klasörde durur:

- mesh dosyaları (LOD'leriyle), 5c'nin beklediği LOD sözleşmesinde; bitkide
  odun ve yapraklar ayrı çizilebilir, yaprak / küme kimlikleri kararlıdır;
- dokular: yaprak / kart atlası, impostor atlası, gerekirse kabuk ya da yüzey
  karosu;
- bitkilerde aile tanımı: prototipler, temsiller, tepki profili ve collider
  referansları; foliage türü ve tekil bitki bileşeni aynı aileye referans verir;
  kaya ve kütükte statik mesh olarak kullanılacak kayıt;
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

### 5.4 Bitki ailesi, örnek ve canlı durum

Alan adları şema uygulamasında kesinleşir; davranış sözleşmesi bağlayıcıdır.

| Sahip | Veri |
|---|---|
| **Aile asset'i** | Tarif kökeni ve sürümü; sınırlı prototip listesi; odun / yaprak LOD'leri, kart / impostor referansları; materyaller, collider ve çevre tepki profili |
| **Tepki profili** | Yaprak döken / herdem yeşil; mevsim başına yapraklılık ve renk hedefleri; rüzgâr esnekliği; odun / yaprak kar kabul maskeleri ve ıslanma tepkisi |
| **Tekil bitki bileşeni** | Aile GUID'i, prototip seçimi ve örnek seed'i; transform aktörün / uzamsal bileşenin mevcut modelinde; desteklenen override'lar şemalı |
| **Foliage örneği** | Aynı aile / prototip, kompakt transform ve seed; sırf çevre tepkisi için ayrı aktör veya script kurulmaz |
| **WES canlı durumu** | Geçerli mevsim ve geçiş ilerlemesi, hava, rüzgâr, kar / ıslaklık; aileye ve level asset'lerine geri yazılmaz |

Üretim seed'i prototip geometrisini belirler. Örnek seed'i renk, rüzgâr fazı
ve dökülme eşiklerinde çeşitlilik verir; her örnek için yeni mesh ürettirmez.
Mevsim değişimi aktör GUID'ini, foliage örnek dizisini, konum / dönüş / ölçek
ve seed'i değiştirmez. Tekil aktör ile foliage aynı tepki çözümleyicisini
kullanır; oyun etkileşim script'i gerekirse tekil aktöre ayrıca eklenir.

WES yokluğunda taban görünüm kullanılır; rüzgâr mevcut level / varsayılan
rüzgâr politikasıyla çözülür. Editör önizlemesi geçicidir. Save-game'e giren
WES durumu ortak otoritede saklanır; görünürlük ve renk gibi türetilebilir
değerler ağaç başına kopyalanmaz. Kalıcı oyun etkileşimleri ayrı aktör
durumudur; foliage ↔ etkileşimli aktör dönüşümü bu ilk kapsamın parçası değildir.

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
- **Mevsim tutarlılığı:** odun ve yaprak görünürlüğü, renk ve kar tüm LOD'lerde,
  impostor'da, HLOD varsa onun proxy'sinde ve gölgede aynı durumu temsil eder.
  Yaz atlasını beyaza boyamak çıplak kış siluetini karşılamaz. PG3 ölçümüyle
  (PK7, 2026-11-19) odun / yaprak ayrımı seçildi: impostor atlasında odun ve
  yaprak iki katman, yaprak katmanında dökülme eşiği; mevsim atlası yok (§10 PG3).

### 6.5 Rüzgâr ve collider

- Rüzgâr ağırlıkları iskeletten bilinir ve köşelere yazılır: gövde bükülmesi
  (yüksekliğe göre), dal salınımı (dal seviyesi ve faz), yaprak titremesi
  (uca uzaklık). Elle boyama gerekmez. Biçim 5c'nin rüzgâr sözleşmesine uyar.
- Collider: ağaçta gövde ve kalın dallar için kapsül; kayada ve kütükte
  dışbükey kabuk; ot, yaprak ve çakılda yok.

### 6.6 Dokular

Geometri prosedürel olsa da yüzey gerekir; lisans sorunu burada geri
gelmemeli. **Dokular da prosedürel üretilir (kullanıcı kararı 2026-11-11).**
Bu yetenek yalnız bitki ve kaya için değildir: terrain boya katmanları ve
ileride prosedürel binalar aynı altyapıyı kullanır. Bu yüzden genel bir
**materyal tarifi** olarak kurulur.

**Seçenekler.**

| Yol | Nasıl çalışır | Artı | Eksi |
|---|---|---|---|
| A. Gölgelendiricide | Renk, pürüz ve normal her karede, her pikselde gürültüden hesaplanır; doku dosyası yok | İndirme sıfır; çözünürlük sınırı ve döşeme tekrarı yok; parametre anında değişir; her yüzey benzersiz | Piksel başına sürekli GPU maliyeti; uzakta kırpışma (mip yok); alfa kartlarına uymaz |
| B. Pişirilmiş | Aynı tarif bir kez çalışır, döşenebilir doku dosyaları yazılır (renk, normal, ORM) | Oyunda sıradan doku maliyeti; mip ve KTX2; her materyalde çalışır | Sabit çözünürlük; döşeme tekrarı; bellek ve indirme |
| C. Karma | Ayrıntı pişirilmiş karodan; büyük ölçekli değişim (renk kayması, kir, yosun, pas, ıslaklık) gölgelendiricide az sayıda düşük frekanslı örnekle | B'nin maliyeti + A'nın çeşitliliği; tekrar gizlenir | İki parça birlikte tasarlanır |
| D. Yüklemede üretim | Tarif oyunla gider, doku oyuncunun cihazında açılışta üretilir | İndirme çok küçük | Sıkıştırılamaz (bellek ≈ 4 kat), açılış uzar; "kalıcı dosya" kararına ters |

Saltline (bkz. [referans notu](../reference/SALTLINE_FPS_REFERENCE.md) §8) A
yolunu kullanıyor: voronoi ve fraktal gürültüden boya / pas hasar modeli, doku
dosyası yok. `three 0.187.0` da aynı yolu destekliyor: TSL'de hazır gürültü
düğümleri var (`mx_noise`, `mx_fractal_noise`, `mx_worley_noise`,
`mx_cell_noise`) ve `examples/jsm/generators/` altındaki şehir üreticileri
materyallerini böyle kuruyor.

**Karar: C, karma (kullanıcı, 2026-11-11).** A yolu küçük ve kapalı bir sahnede iyi çalışır; açık
dünyada GPU zaten dar boğazdır (Faz 0 baseline'ında Derekavak GPU'ya bağlı) ve
ekranı dolduran yüzeylerde çok oktavlı gürültü her kare ödenir. Bu bir
ölçüm değil, beklentidir; PG1'de aynı kaya materyali A ve C ile R1'de
ölçülür; gölgelendiricide ne kadar iş kalacağı o sayıyla ayarlanır.

**Materyal tarifi.** Bitki tarifiyle aynı kurallara uyar: A13 veri asset'i,
kalıcı çıktı, CPU'da üretim (Node ve worker), `generatorVersion`.

| Doku üreticisi | Kapsadığı yüzeyler | İlk tüketici |
|---|---|---|
| **Gürültü yığını** | Taş, kaya, kabuk, toprak, kum, sıva, beton, paslı / boyalı metal | Kaya (PG1), kabuk (PG2), terrain katmanları |
| **Yaprak** | Parametrik dış hat + damar; renk, alfa, normal | Dallanan üretici (PG2) |
| **Desen** | Tuğla, taş duvar, kiremit, tahta, karo, oluklu sac | Prosedürel binalar (bu planın dışında) |

- Çıktı: döşenebilir renk, normal ve ORM dokuları; yükseklik ara üründür
  (normal ve oyukluk ondan türer).
- Tarifin katmanları şemalı bir listedir (gürültü türü, ölçek, karışım,
  renk rampası); görsel graf editörü yoktur (§1).
- Gölgelendirici tarafı, mimari §4.9'daki materyal katkısı olarak kurulur:
  büyük ölçekli renk değişimi ve yıpranma maskeleri. Maskeler köşe verisinden
  (oyukluk, üst yüz, yükseklik) ve düşük frekanslı dünya uzayı gürültüsünden
  beslenir.
- Dal ucu kartı ve impostor dokuları üretilen geometriden bake edilir (§6.7).

**Yedek kaynaklar (kullanıcı kararı 2026-11-11).** Prosedürel doku bir yüzeyde
yetmezse iki kaynak kullanılır; ikisi de karma yolun pişirilmiş karosunun
yerine geçer, gölgelendirici tarafındaki değişim katmanı aynı kalır:

- **Codex'e ürettirilen doku.** Kaynağı ve üretim istemi meta'da kayıtlıdır.
- **[Poly Haven](https://polyhaven.com/textures) dokuları.** Bütün varlıkları
  CC0'dır; atıf gerekmez, ticari kullanım ve yeniden dağıtım serbesttir
  (lisans sayfası, 2026-11-11). Meta'ya `CC0-1.0` ve kaynak adresi yazılır.
  Otomatik indirme yalnız resmî API ile yapılır (`api.polyhaven.com`: ücretsiz,
  ticari kullanıma açık, isteklerde yazılımı tanıtan bir User-Agent ister);
  site kazınmaz. Yalnız kullanılan doku projeye ya da içerik paketine girer;
  kitaplığın kendisi depoya alınmaz (A9).

**Beklenti.** Gürültü tabanlı yüzeyler (taş, sıva, beton, pas, boyalı metal,
toprak) prosedürel üretime en uygun sınıftır. Organik ince ayrıntı (kabuk,
yaprak yüzeyi) fotoğraf dokusu kadar zengin olmayabilir; görsel kabul
kullanıcıdadır.

### 6.7 Bake yolu

Kart ve impostor atlası için bitkinin çizilmesi gerekir. İki yol var:

| Yol | Artı | Eksi |
|---|---|---|
| **CPU rasterleyici** (saf kod, `engine`) | Node'da ve worker'da çalışır; World Builder CLI'ı tek başına tam asset üretir; CI'da sınanır; deterministik | Küçük bir rasterleyici yazılır (renk, alfa, normal, derinlik; ışık yok) |
| GPU bake (`render`) | Gerçek materyallerle çizer | Yalnız başlıklı tarayıcıda; CLI ve CI üretemez |

Karar CPU rasterleyicidir (kullanıcı, 2026-11-11). Atlaslar ışıksız G-buffer verisidir; görüş
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
| `src/engine/…` | Saf üretim ve ortak tepki çözümleme: rastgele akışlar, iskelet, mesh, LOD, kart kümeleme, kaya, rasterleyici, collider, istatistik; aile + WES → bitki görünüm hedefleri. three yok, DOM yok |
| `src/features/<ad>/schema.ts` | Tarif şeması ve üretici parametreleri; Node'da yüklenir |
| `src/features/<ad>/render.ts` | Üretilmiş kaynaklar → 5c toplu çizimi; odun / yaprak TSL materyalleri, rüzgâr, mevsim ve örtü katkıları; three kullanan ortak çizim yardımcıları `src/render/…` içinde |
| `src/features/<ad>/runtime.ts` | Ortak bitki alt sistemi; WES servisini okur, aktör ve foliage için aynı tepki hedeflerini sağlar; ağaç başına script / tick kurmaz |
| `src/features/<ad>/editor.ts` | Tarif paneli: form + önizleme + üret düğmesi |
| `tools/` | CLI: tarif doğrulama, üretim, asset yazımı |
| İçerik paketi / oyun projesi | Ön ayarlar, üretilmiş çıktılar |

Geometri üreticisi oyun build'ine girmez; ortak bitki çalışma zamanı sistemi
girer. Kayıt mevcut feature / servis mekanizmasıyla yapılır; yeni katman veya
bağımlılık kuralı gerektirmez. Editör görünümü aynı tepkiyi `inEditor` yaşam
döngüsüyle sunar; önizleme asset veya level kaydı üretmez.

### 6.9 WES tepkisi ve zaman politikası

**Akış:** WES durumu + aile profili → ortak görünüm hedefleri → tekil aktör /
foliage çizimi. WES koşulları ve geçişi belirler; bitki türünün nasıl tepki
vereceği ailede yaşar. Tür düzeyindeki hesaplar paylaşılır; örnek farklılıkları
kompakt veriden çözülür. Çevre değişimi toplu çizimi örnek başına materyallere
bölmez, her kare mesh / atlas üretmez ve shader yeniden derlemesi gerektirmez.

| Etki | İlk kapsam |
|---|---|
| İlkbahar / yaz | Tür profiline göre kademeli yaprak görünmesi ve genç → normal renk |
| Sonbahar / kış | Sonbahar rengi ve kademeli yaprak kaybı; yaprak dökende çıplak odun, herdem yeşilde profilin yapraklılığı |
| Rüzgâr | Ortak yön / güç / hamle; iskeletten ağırlıklar ve örnek fazıyla gövde, dal ve yaprak hareketi |
| Kar | WES `snowCoverage` × odun / yaprak kabul maskesi × yukarı bakan yüzey maskesi; dal altı / gövdeye uygunsuz beyazlama önlenir |
| Yağmur | WES `wetness` ile kabuk / yaprak renk ve pürüzlülük tepkisi |
| Gündüz–gece | Mevcut güneş, ay, gölge ve ortam ışığına doğal tepki; bitki başına ikinci aydınlatma saati yok |

**Yapraklılık.** Yaprak veya yaprak kümelerinin kararlı kimliklerinden
dökülme eşikleri türetilir. Aynı seed ve mevsim ilerlemesi aynı görünürlüğü
verir; her kare yeni rastgele seçim yapılmaz. WES mevsim hedefini ve geçiş
ilerlemesini yönetir; takvim ilk kapsamın önkoşulu değildir. Bu geçiş alanları
mevcut kodda var sayılmaz, uygulamada şemalı olarak eklenir.

**Zaman.** WebGPU'nun sabit `hour` + olay bazlı `transitionTo` kararı korunur.
Günün saati, geçen simülasyon süresi ve mevsim geçiş ilerlemesi ayrı girdilerdir.
Kar birikimi / erime / kuruma, WES'te ölçekli simülasyon süresi ve açık oranlarla
adımlanır; hız / birimler şemada belirtilir. Saat farkından geçen süre çıkarılmaz:
sabah → akşam atlamak kendiliğinden saatlerce kar biriktirmez. Saat sabitken
simülasyon çalışıyorsa birikim ve rüzgâr sürebilir; pause'da ilerlemez. Kış
yaprak hedefidir, kar örtüsü ayrı durumdur; karsız kış ve ilkbaharda kalan kar
mümkündür. Mevsim önizlemesinde hedef doğrudan gösterilebilir; normal geçiş
ortak ilerlemeyi tüketir. Otomatik takvim ve biyolojik büyüme sonraki işlerdir.

**Döküntü ve efekt.** Taçtaki yaprak kaybı ilk kapsamdadır. Havada düşen yaprak
efekti kamera çevresinde sınırlı bütçeyle sonradan eklenir; her yaprak fizik
nesnesi olmaz. Yerdeki döküntü aileye bağlı üretimden gelir (PG6). Doğrudan
mevsim atlaması / önizleme geçmiş dökülmelerin efektini topluca oynatmaz.

**Akış ve korumalar.** Hücre yüklenince mevcut WES durumundan kurulur;
geçmiş mevsim adımları yeniden oynatılmaz. Rüzgârla genişleyen sınırlar culling
ve gölgede hesaba katılır. Yaprak görünürlüğü ve deformasyon gölge geçitlerine
de uygulanır; collider ilk kapsamda odunsu taban temsiline bağlı kalır. WES
terrain paint / yüksekliklerini veya bitki yerleşimlerini değiştirmez. Yerel
kar hafızası / fiziksel kalınlık, kar yüküyle eğilme ve türe özgü gece açılma /
kapanma davranışları ayrı genişlemelerdir.

---

## 7. World Builder bağlantısı

### 7.1 Başlangıçtaki durum (Forge WebGL, 2b'de taşındı)

- Brief'te model satırları: `role`, `source`, `file`, `variant`. Kaynaklar
  `blender | tripo | ready` (`engine/worldbuilder/worldBrief.ts`).
- Zemin örtüsü dosyası bitkileri boya katmanına bağlar: `layer`,
  `foliageType`, `density`, `minWeight`, `seed`
  (`engine/worldbuilder/groundCover.ts`).
- Kayalar adetle serpilir; `prop.rock` rolünün `high`, `slope`, `river`
  varyantları var (`engine/worldbuilder/randomWorld.ts`).
- Modeli olmayan rol yer tutucu küp alır.

Taşınmış hâli başlarken yeniden doğrulanır; adlar değişmiş olabilir.

### 7.2 Bağlantı

1, 2, 3 ve 5 uygulandı (2026-11-25, §9.7); 4 (bağlı tarifler) PG6'da. Örtülerin
karışık ormanı (`stands`, genç ağaç, kenar; 2026-11-26) §9.8'de.

1. **Yeni model kaynağı:** `generated`. Satır dosya yolu yerine tarifi
   gösterir; çözümleme bitkilerde aile referansı üretir. Tekil yerleşim bitki
   bileşenli aktör, toplu örtü aynı aileyi kullanan foliage olur; yalnız
   `staticMesh` bağlamak bitkinin tamamlanmış çıktısı sayılmaz.
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
| Büyük ağaç | ≤ 20.000 (sürüm 6: ≤ 40.000, §9.8) | ≤ 5.000 | ≤ 800 | Impostor |
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

Bu ilk tablo tek görünüm hesabıdır; v0.6'daki mevsim temsillerinin ek belleği
ölçülmüş değildir. PG3 odun / yaprak ayrımı ve atlas seçeneklerini toplam
aile belleği, indirme, geçişte tepe bellek ve GPU süresiyle raporlar; bütçeler
bu ölçümle güncellenir. Dört mevsim diye belleği sessizce dört katına çıkarma
yoktur. G6 hedefleri korunur; geçişte en uzun kare ve hücre yüklemesi de ölçülür.

**Rapor:** her üretim köşe, üçgen, doku baytı, bake süresi ve collider
sayısını yazar; bütçeyi aşan tarif uyarı verir.

**PG3 ölçümü (2026-11-19).** Starter `Broadleaf` (yaprak döken) ve `Conifer`
(herdem yeşil), tür başına 3 prototip; `forge generate` çıktısı, Node tek iş
parçacığı; GPU belleği WebGPU API sınırında sayıldı (`tests/smoke/gpuMemory.ts`;
three sıkıştırılmış dokuyu 1 bayt sayar). Doku belleği 1 B/texel sınıfı
(UASTC → BC7) + mip zinciri.

| | Broadleaf | Conifer | İlk hedef |
|---|---:|---:|---:|
| Üçgen LOD0 / LOD1 / LOD2 (prototip) | 17,5 k / 3,4 k / 0,7 k | 14,1 k / 3,2 k / 0,6 k | ≤ 20 k / 5 k / 0,8 k |
| Impostor | 2 üçgen, 8 × 8 görüş × 128 px, odun + yaprak yan yana (2048 × 1024 × 2 doku) | aynı | 1024² × 2 |
| Dal ucu kartı atlası (yaprak + 12 küme kartı) | 1024², 1,33 MiB | 1024², 1,33 MiB | 2048², ≈ 10,7 MiB |
| Impostor atlası, prototip başına | 5,33 MiB | 5,33 MiB | ≈ 2,7 MiB |
| Tür başına doku belleği (3 prototip + kart) | **17,3 MiB** | **17,3 MiB** | ≈ 16 MiB (2 prototip) |
| Aynısı RGBA8 (KTX2'siz, PG3 öncesi) | 69,3 MiB | 69,3 MiB | |
| Kabuk karosu (ortak, 3 × 512² KTX2) | 1 MiB (PNG'yle 4) | ortak | 2,7–4 MiB |
| İndirme (3 prototip: LOD GLB'leri + KTX2) | 8,4 MB (GLB 4,6 + impostor 3,5 + kart 0,3) | 7,7 MB (4,0 + 3,4 + 0,3) | |
| Aynısı PNG'yle (PG3 öncesi) | 10,5 MB | 9,5 MB | |
| Bake: kart atlası / prototip impostor'u / KTX2 kodlama (prototip) | 1,7–2,6 s / 1,9–2,0 s / 2,3–2,6 s | aynı aralık | "saniyeler" |
| Tarif başına toplam `forge generate` | ≈ 16 s | ≈ 16 s | |

- **Güncellenen bütçe:** ağaç türü başına ≈ 6 MiB / prototip (impostor 5,33 +
  kart payı) + 1,33 MiB kart atlası; 3 prototipte ≈ 18 MiB. Impostor'un iki
  katmanı (odun / yaprak) §6.4'ün tek katman varsayımının iki katıdır; mevsimi
  bu ayrım taşıdığı için ek mevsim atlası yoktur (PK7).
- **İndirme hedefi:** tür başına (3 prototip) ≤ 9 MB; LOD0 GLB'si ≈ 1,1–1,2 MB /
  prototip en büyük pay. Meshopt sıkıştırması üretilmiş GLB'de kapalı
  (`GENERATED_MODEL_OPTIMIZE`); açmak ayrı karar.
- **CPU bake** (§6.7) kullanılabilir hızda: GPU yoluna geçme gerekçesi yok.
  İçe aktarılan GLB türünün çalışma anı bake'i (5c F3) worker'da, hazır ≈ 5 s.
- **Kabuk / kaya karoları** (`forge.surfaceTextureRecipe`, kullanıcı kararı
  2026-11-19): KTX2, bake edildiği gibi (triplanar M_Rock ve çevirmeyen M_Bark
  aynı görünür); doku başına 1,33 → 0,33 MiB. Ağaç impostor bake'i kabuğu
  tarifinden yeniden bake eder; starter ağaçları bayt bayt aynı kaldı.

---

## 9. Editör ve ajan yüzeyi

**Tarif paneli (insan):**

- Genel veri editörünün (A13) şemadan ürettiği form; parametre UI kuralları geçerli (kaydırıcı + kutu,
  sınıra çekme, TR ipucu / EN ad).
- Önizleme: kaynak, LOD0–2 ve impostor yan yana; kamera çevrede döner.
  Videodaki en yararlı fikir budur.
- Aynı önizleme yaz / sonbahar / kış / ilkbahar, yapraklılık geçişi, rüzgâr,
  kar ve ıslaklığı gösterir; aile profili düzenlemesi ile geçici WES önizlemesi
  ayrıdır. Tekil aktör ve foliage karşılaştırması yapılabilir.
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

### 9.1 Vegetation 2.0 denetimi ve ilk editör dilimi

**19 Kasım 2026.** Ağaç biçiminde darboğaz iskeletin üretim kuralı.
Broadleaf'te ana dal uzunluğu ortada en geniş olan tek bir eğriye bağlı.
Conifer'de gövde düz, ana dallar dört dalda bir aynı yükseklikten çıkıyor.
Her ebeveyn aynı seviyenin sabit sayıda çocuğunu üretiyor. Seed dal açısını,
uzunluğunu, eğriliğini ve yaprak yerleşimini değiştiriyor. Türün büyüdükçe
çatallanmasını, bağımsız taç genişliğini, en geniş noktasını veya doluluğunu
tarifle yönetmek bugün mümkün değil. `crownStart` yalnız başlangıcı belirliyor.

| Parça | Karar | Dayanak ve sonraki değişiklik |
|---|---|---|
| `treeParams`, `treeSkeleton` | Yeniden tasarla | Sap kimliği, ebeveyn, eğri ve yarıçap çıktısını koru. Yeni sürümde türün dallanma düzeni, taç zarfı, sap sayısı ve yaşa göre oranlar veriyle seçilebilsin. |
| `treeMesh` | İyileştir | Yay uzunluğu, taşınan kesit çerçevesi, UV ve rüzgâr ağırlıkları kullanılabilir. Tüpler kesişiyor. Ana dal birleşiminde yaka geometrisini çıplak yakın planda dene. |
| `leafTexture`, `treeCards` | İyileştir | İki yaprak çizim kuralı ve ilk seed'in terminal dallarından paylaşılan atlas var. Tür bazlı yaprak/dalcık biçimi, kümelerin açısı ve alfa mip örtüsünü karşılaştır. |
| `treeGenerator`, LOD planlayıcı, `bake`, `treeImpostor` | Koru | Ortak iskelet, kararlı küme kimliği, mesh üretiminden önce üçgen sınırı, ayrı odun/yaprak atlasları ve çok açılı bake var. Azalan LOD'ların taç örtüsü ayrıca kabul edilmeli. |
| `surfaceTexture`, GLB/KTX2, kaya üretimi | Koru | Kabukta renk/normal/ORM ayrı üretiliyor. Rounded ve Angular kaya tarifleri kendi topolojisi ve collider'ıyla aynı kayıt zincirini kullanıyor. Yakın plan kabuk ayrıntısı malzeme çalışması gerektiriyor. |
| `features/plant`, `features/procgen`, `render/plant`, `render/foliage` | Koru | Tarif, aile ve örnek ayrı. Tekil bitki ve foliage aynı aileyi, batch ve WES tepkisini kullanıyor. Yeni türler paket/proje tarifi olabilir. |
| `tools/procgen` ve asset editörü | İyileştir | Aynı saf üretici Node ve worker'da çalışıyor. Şema formu, belge geçmişi, revizyonlu kayıt, Content Browser ve GPU host'u ilk dilimi taşıyor. Aile onayı ve World Builder çözümlemesi açık. |

**Görsel baz çizgisi.** Yerel video paketinde kare 0000 kaynak / LOD / impostor
karşılaştırmasını, panel kesitlerinde tür, yaş, genişlik, doluluk ve sayaçlar
görülüyor (Ek A). Forge'da Derekavak'ın mevcut 16 WebGPU karesi aynı kamerada
yaz, sonbahar, kış ve karlı kışı dört temsilde gösteriyor. Yazın Broadleaf
LOD0'da küçük ve aralıklı yaprak kümeleri var. LOD1'de kümeler belirgin
koyulaşıyor, LOD2'de taçta boşluklar büyüyor. Kışın ön plandaki çıplak dallar
okunuyor. Aynı yakın kamerada impostor odunu kalın ve kesintili çiziyor.
Zorlanmış LOD görüntüsünden doğal geçiş mesafesinde sıçrama veya rüzgârın
hareket kalitesi hakkında karar verilemez. Asıl kareler referans projesinin
`render-refs/candidates/pg3-wes03-*.png` dizininde. §8'deki orman ölçümü
önceki PG3 koşusuna ait.

Editördeki yeni WebGPU çekimlerinde Broadleaf 1 ve 3'ün dal yönleri ve boşlukları
değişiyor, taç profilleri birbirine yakın kalıyor. Yakın planda aynı biçimli
yaprak demetleri ve ana dalların gövdeye keskin girişleri seçiliyor. Conifer'in
iğneleri tam ağaç kadrajında zayıf okunuyor. Yakınlaşınca ince iğne kümeleri ve
gövde etrafındaki düzenli katlar görülüyor. İlk kalite denemesinde dal yaka
profilini, tacın iç/dış yoğunluğunu ve iğne atlasının mip düzeylerindeki
örtüsünü ayrı ayrı karşılaştır. Editör, WES'siz denetim ışığı kullanıyor.

| Starter, seed 1 / 2 / 3 | Sap | Yaprak kümesi | LOD0 üçgen | LOD1 üçgen | LOD2 üçgen |
|---|---:|---:|---|---|---|
| Broadleaf | 295 | 840 | 17.529 / 17.667 / 17.419 | 3.437 / 3.437 / 3.431 | 705 / 711 / 693 |
| Conifer | 193 | 800 | 14.097 / 14.115 / 14.057 | 3.156 / 3.180 / 3.162 | 648 / 636 / 636 |

**İlk dilimin kanıtı.** `tests/editor/assets.spec.ts` içindeki iki
`tree recipe` senaryosu gerçek WebGPU'da ve `forceWebGL` ile geçti.
Yazılabilir proje tarifinde yükseklik ve seed değişti, üç LOD'lu aile kaydedilip
yeniden açıldı. Salt okunur pakette iki tür ve iki seed gösterildi. Yeni
çekimler `.forge-cache/asset-editor-visual/tree-*-webgpu.png` altında.
WebGPU'da tam atlaslı ilk seed için worker sayacı yaklaşık 2 saniye, aynı
atlasla seed 3 için Broadleaf'te 50 ms ve Conifer'de 32 ms gösterdi. Bunlar
tek koşunun worker süreleri. Girişten ekrana gecikme ve GPU süresi ayrıca
ölçülmeli. İki starter tarifinin 36'şar mevcut çıktısı CLI dry-run'da aynı
baytları verdi. Revizyon çakışması ve sap bütçesini aşan taslak için üretimin
tarifi koruduğu ve aile yazmadığı odaklı testte doğrulandı.

Bir tarif kopyalandığında materyal GUID'leri korunur. Kopyanın yaprak materyali
hâlâ kaynak ağacın atlasına bağlıysa, kopyadaki yaprak doku ayarları yeni
atlasın piksellerini değiştirir ama o materyal kaynak atlası göstermeye devam
eder. Aile onay ekranında materyal ve atlas sahipliği görünür olmalı.

**İlk denetimdeki uyumluluk önerisi (§9.2'de uygulandı).** Starter tarifleri `forge.treeRecipe/1` ve
`generatorVersion: 1` taşıyor. Bugünkü CLI üreticisi aile ve meta dosyalarına
3 yazıyor. Tarif değeri şu anda algoritma seçmiyor. Yeni morfolojiden önce
mevcut tarifleri eski uygulamaya açıkça yönlendiren sürüm seçici gerekli.
Yeni kontroller yalnız yeni sürümün şemasında açılmalı. Bir tarifin kopyasında
aynı seed, ışık, kamera ve LOD ile iki üreticiyi karşılaştır. Kullanıcı görsel
onayından sonra isteğe bağlı geçiş sun. Aile/prototip sırası, çıktı GUID'leri,
var olan dosyalar ve sahne yerleşimleri geçişin ayrı kabul noktalarıdır.

**Uygulama sırası**

1. **A — Baz çizgisi.** Derekavak matrisi ve iki starter türün tekil seed
   çekimleri. Kışın yakın dal birleşimi, doğal uzaklaşma ve hareketli rüzgâr
   için ayrı inceleme gerekiyor.
2. **B — Ağaç tarifi.** Content Browser'da tarifi aç, yüksekliği veya varyant
   tohumunu değiştir. Alttan seed ve mesh LOD'unu seç. Kamera sürüklemeyle
   döner, tekerlek yaklaşır, Shift+sürükleme kaydırır, Focus yeniden çerçeveler.
   Worker kısa bir düzenleme aralığından sonra düşük çözünürlüklü atlası,
   ardından tarif çözünürlüğünü verir. Sayaçtaki süre worker CPU süresidir.
   Save tarifi, Generate & Save Family ise tarifi ve ailesini birlikte kaydeder.
   Salt okunur pakette önizleme kullanılabilir. Kalıcı üretim proje kopyasında
   veya açıkça açılan paket düzenleme kipinde yapılır. CLI ile aynı GLB/KTX2
   üreticisi kullanılır. Alan hatası ve revizyon çakışmasında taslak korunur.
3. **C — Tür ve yaş.** İki farklı türde genç/olgun, yaz/çıplak ve en az üç seed
   ile dallanma, birleşim, taç örtüsü ve materyal çalışmasını karşılaştır.
4. **D — PG4.** Çok saplı çalı ve şerit/demet ot ayrı üreticilerden aynı editöre
   bağlanır. §8 bütçeleriyle başla, otun seyrelmesini hareketli kamerada ölç.
5. **E — PG5 editörü.** Yan yana Source/LOD/impostor, galeri, WES, bellek,
   aile onayı ve çalı/ot/kaya sunumlarını tamamla.
6. **F — 5d.** Var olan ground cover ve rol çözümlemesine tarif/aile başvurusu
   ile `generated` kaynağını ekle. Üretilen dünyada kaya rollerini, tekil
   bitkiyi ve foliage yerleşimini kaydet–yeniden aç üzerinden doğrula.

### 9.2 Aşama C · tür ve yaş karşılaştırması

Starter paketindeki `Oak.treerecipe.json` ve `Poplar.treerecipe.json`,
`forge.treeRecipe/2` içinde açıkça üretici 4'ü seçer. **Growth** bölümünden
yaş, olgunlaşma yaşı, taç genişliği, en geniş nokta, doluluk ve ana gövde
baskınlığı düzenlenir. Yaş, boyun yanında gövde kalınlığını, taç başlangıcını,
yan dal ve yaprak kümesi sayısını etkiler. Olgunlaşma yaşında büyüme durur.
Tür farkı iki tarifteki sayısal parametrelerden gelir. Bu tarifleri projeye
kopyalayıp **Generate & Save Family** ile üretince, boş yaprak slotu kopyanın
kendi atlasına bağlı bir materyal alır. Önizleme de aynı atlası kullanır.

Eski tariflerde eksik sürüm veya 1–3, tarihsel PG3 iskeletini ve çıktı
damgası 3'ü seçer. Broadleaf ve Conifer için CLI dry-run'da 72/72 dosya aynı
baytları verdi. Yeni iki tarif toplam 74 çıktı planladı. Her tarifte üç
prototip, üç mesh LOD'u, impostor'lar ve bir ortak yaprak materyali var.

| Tarif ve yaş | Sap sayısı | İskeletin X eksenindeki eni (m) | LOD0 üçgen | LOD1 üçgen | LOD2 üçgen |
|---|---:|---:|---:|---:|---:|
| Meşe, 12 | 41 | 4,7–6,3 | 1.892–1.971 | 436–449 | 88–94 |
| Meşe, 60 | 189–203 | 13,9–17,4 | 14.089–15.075 | 3.127–3.321 | 684–697 |
| Kavak, 12 | 61 | 1,2–1,7 | 1.932–1.967 | 304–310 | 76 |
| Kavak, 60 | 305–319 | 4,4–4,9 | 16.653–17.403 | 2.338–2.464 | 529–551 |

Aralıklar seed 1–3 üzerinden, en ölçümü LOD0 odun mesh'inin sınırlarından.
İki tarifte ana gövde 12 yaşta 6,16 m, 60 yaşta 12 m. Sabit kamera ve
ışıkla gerçek WebGPU editöründe LOD0'dan 30 kare alındı. Yerel karşılaştırma
levhaları `.forge-cache/vegetation-growth/comparison-leaf.jpg` ve
`comparison-wood.jpg`. **Wood only** aynı kadrajda yaprakları gizler.
WES kışı ve kar ayrı bir sahne kontrolü gerektirir.

İlk tariflerde (`31006ca`) üç seed'de olgun meşenin ana dalları yana yayılırken kavak dar ve dik
kalıyor. Genç kavaklarda tohum farkı bu ölçekte güç seçiliyor. Olgun
meşede büyük yaprak demetleri dal uçlarında tekrarlanıyor ve iç taçta geniş
boşluklar kalıyor. §9.3 bu meşede dalcık yönlerinin ve taç içindeki
dağılımın değişimini aynı kadrajda karşılaştırıyor.
Yakın planda dal birleşimleri, doğal LOD geçişleri ve rüzgâr kabulü açık.

---

### 9.3 Meşenin iç tacı

Meşe tarifinde ikinci ve üçüncü düzey dallar ebeveynin tabanına daha yakın
başlar ve daha geniş bir açı aralığına yayılır. LOD0, daha çok dalcığa
dağılan yaprak kümelerinin yarısını çizer. LOD1 ve LOD2 ince odunu daha erken
eler ve yaprak örtüsünü daha fazla dal ucu kartıyla taşır.

60 yaşta, seed 1–3 için gövde ekseninin 3 m çevresine düşen uç dal sayısı
25–29'dan 102–105'e çıktı. Gerçek WebGPU editöründe eski tarif (`31006ca`)
ve güncel tarif aynı oturumda, aynı ışık ve iki sabit açıyla çekildi. LOD0'da
taç merkezindeki yeşil piksel oranı altı eşleşmenin tamamında arttı.

| Seed | İlk açı, önce → sonra | İkinci açı, önce → sonra | Olgun ağaçta üçgen, LOD0 / LOD1 / LOD2 |
|---|---:|---:|---:|
| 1 | %43,3 → %70,3 | %43,6 → %72,4 | 16.213 / 3.949 / 610 |
| 2 | %39,6 → %69,7 | %41,3 → %65,3 | 16.689 / 3.986 / 645 |
| 3 | %43,4 → %78,1 | %46,4 → %75,1 | 17.274 / 4.097 / 648 |

Her eşleşmede ölçüm alanı eski görüntüdeki yeşil piksellerin sınır kutusunun
ortadaki yarı eni ve yarı boyudur. Aynı alan iki karede de kullanıldı.
8 bit ekran renklerinde G > R + 4 ve G > B + 8 yeşil sayıldı. Ölçüm bu
ışık ve kamera için görünür örtüyü gösterir. 12 yaşta üç seed'in LOD0 maliyeti
1.818–1.874 üçgen. 60 yaşta seed 0–255 taramasında LOD başına en yüksek
sayılar 19.138 / 4.699 / 735. CLI deneme üretimi üç prototip için 37 çıktı
planladı. Karşılaştırma levhaları yerelde `.forge-cache/oak-review/` altında
`oak-front.jpg`, `oak-side.jpg` ve `oak-lods.jpg`.

Olgun meşede iç dallar arasındaki boşluklar küçüldü. Tekrarlanan yaprak
kartları dış siluette hâlâ seçiliyor. İlk açıda zorlanmış LOD2'nin yeşil
piksel sayısı LOD0'ın %50–52'si. Bu tarifle başlayan doğal kamera geçişi
§9.4'te ölçüldü.

### 9.4 Meşede doğal LOD geçişi

**20 Kasım 2026.** 60 yaşındaki meşe ilk çekimde üç seed'de de LOD1'den
LOD2'ye geçerken bir karede seyrekleşti. Eşikte ağaç yalnız 41–47 piksel
yüksekliğindeyken bile arka plan dalların arasında belirginleşti. Aşağıda
alan, yaprak ve odun birlikte ağacın kapladığı piksel sayısıdır. Yüzdeler
kameranın hareketinden doğan alan değişimi çıkarıldıktan sonradır.

| Seed | LOD1 ↔ LOD2 eşiği | Uzaklaşırken alan değişimi, önce → sonra | Yaklaşırken alan değişimi, önce → sonra | Son üçgen, LOD0 / LOD1 / LOD2 |
|---|---:|---:|---:|---:|
| 1 | 541,18 m | −%34,8 → +%6,3 | +%53,4 → −%5,9 | 16.213 / 3.949 / 690 |
| 2 | 527,54 m | −%36,2 → −%0,9 | +%56,7 → +%0,9 | 16.689 / 3.986 / 701 |
| 3 | 490,76 m | −%37,7 → −%0,4 | +%60,5 → +%0,4 | 17.274 / 4.097 / 724 |

**Ölçüm.** Çalışma ağacındaki tariften geçici projede GLB/KTX2 ailesi üretildi.
Her prototip aynı noktada tek bir `forge.plant` olarak çizildi. Başlıklı Chrome,
NVIDIA Ampere WebGPU, 1920 × 1080, DPR 1, High, dikey görüş açısı 44°.
WES yaz, açık hava, saat 14.00. Rüzgâr, hamle ve gölgeler kapalı. Kamera
6 m yükseklikte sabit doğrultuda, 35 m yatay mesafeden başlayarak kare başına
0,5 m ilerledi ve aynı yoldan döndü (30 Hz, 15 m/sn).
`foliageBatches`, ailenin `screenSize` değerlerini LOD0 küre yarıçapı /
(`screenSize` × tan(dikey görüş açısı / 2)) ile metreye çevirir.
GPU kameradan örneğin köküne uzaklığı bu eşiklerle karşılaştırır.
Her karede ana görünümün GPU örnek sayaçları okundu. Önce ve sonra üç
yolda da her kamera pozu ve seçilen LOD birebir eşleşti.

Sabit arka plandan herhangi bir RGB kanalında 22/255'ten fazla ayrılan
pikseller sayıldı. Ardışık iki karenin alan oranı ikinci / ilk yatay kamera
mesafesinin karesiyle çarpıldı. Eşikte 0,5 m hareketin doğal alan farkı
yaklaşık %0,2. LOD0 → LOD1 geçişi 172–189 m civarında gerçekleşti. Bu ilk
geçişte toplam örtü %9–12 azalıyor ve yaprak kümelerinin tonu değişiyor.

**Neden ve düzeltme.** İlk tarifte LOD2 odunu tek başına çizildiğinde LOD1
alanının %50–56'sını, dal ucu kartları tek başına çizildiğinde %59–61'ini
korudu. LOD1'de 253 / 260 / 273 dal ucuna kart düşerken LOD2'de yalnız
53 / 54 / 57 uç temsil ediliyordu. Aynı kartları büyütmek toplam alanı
geri getirebildi, fakat seed 1'in tacı dar kaldı. Seçilen düzeltmede LOD2'nin
çapraz kartlarının arka yüzünü mevcut çift taraflı yaprak materyali çiziyor.
Boşalan üçgen bütçesiyle kart taşıyan dal ucu oranı %21'den %43'e,
üç seed'de uç sayısı 126 / 122 / 133'e çıktı. Odun, atlas, alfa eşiği ve
geçiş mesafesi iki çekimde aynı. Daha çok dal ucuna kart vermek dış hatları
ve doluluğu birlikte korudu. Özellikle seed 1'de bazı yaprak kümeleri hâlâ
yer değiştiriyor ve tepe yaklaşık üç piksel kısalıyor.

Yalnız üç LOD2 GLB'si ile metaları değişti. LOD0/1, atlaslar ve aile dahil
31 çıktı önceki üretimle, tekrarlanan üretimde 37/37 çıktı son üretimle
bayt bayt aynıydı. LOD0/1'den eşleşen 452 çekim de aynıydı. 60 yaşta
seed 0–255 taramasında en yüksek maliyet 19.138 / 4.699 / 779 üçgen.

Yerel adaylar: [gidiş-dönüş videosu, gerçek piksel boyu ve 3,5×](../../.forge-cache/oak-motion/review/mese-gecis.mp4),
[uzaklaşma kareleri](../../.forge-cache/oak-motion/review/uzaklasma.png),
[yaklaşma kareleri](../../.forge-cache/oak-motion/review/yaklasma.png).
Kare başına kamera konumu ve GPU sayaçları aynı dizinin üstündeki
`before/seed{1,2,3}/frames.json` ve `after/seed{1,2,3}/frames.json`
dosyalarında. Görsel kabul kullanıcıda. Sonraki öneri, kalan kenar ve tepe
değişiminin açıya bağımlılığını görmek için bu geçişi ikinci bir azimutta çekmek.

### 9.5 PG4 · Çok saplı fındık çalısı

Starter paketindeki `Hazel.treerecipe.json`, mevcut dallanan tarif şemasında
üretici 5'i seçer. Ağaç tarifinde **Habit → Shrub** seçildiğinde Hazel'ın
başlangıç biçimi uygulanır ve mevcut seed listesi korunur. Kayıttan önce
**Undo** önceki tarifi geri getirir. Bir kök boğazı çevresinde bağımsız odunsu ana saplar
oluşur. Her sapın eğrisi ve dal hiyerarşisi var. **Shrub** bölümündeki
**Main Stems** ve **Basal Spread**, sap sayısını ve sapların dipten yana
açılmasını düzenler. Boy, dallanma ve yaprak örtüsü mevcut alanları kullanır.
LOD2'de her ana sap üç üçgenle temsil edilir. Kalan bütçedeki dal ucu
kartları uç noktalar arasındaki boşluklara göre seçilir. Rüzgâr ağırlığı
sapların toprak hizasındaki ucunda düşük, sürgün uçlarında yüksektir.
İlk çalı ailesi fizik çarpışması olmadan üretilir.

Geçici yazılabilir projede editörün canlı WebGPU önizlemesinde **5 → 6** sap
ve **0,62 → 0,78** yayılım düzenlendi. Üç seed incelendi. **Generate & Save
Family** dokuz GLB'yi, ortak KTX2 atlasını ve materyalini, bitki ailesini ve
üç foliage türünü yazdı. Tarif yeniden açıldığında iki değer de korundu.
Aynı tarif tekrar üretildiğinde 25/25 dosya aynı baytları verdi. Broadleaf
ve Conifer'de 72/72, önceki meşe adayında 37/37 çıktı aynı kaldı.

| Seed | Kaydedilen aile LOD0 / LOD1 / LOD2 | LOD1–LOD2 eşiği |
|---|---:|---:|
| 1 | 2.578 / 350 / 98 | 106,10 m |
| 2 | 2.576 / 350 / 98 | 108,37 m |
| 3 | 2.544 / 368 / 98 | 106,19 m |

Sahne çekimi başlıklı Chrome, NVIDIA Ampere WebGPU, High, 1920 × 1080 ve
DPR 1 ile yapıldı. Yaz ve saat 14.00 sabitti. Rüzgâr gücü 0,32, yönü 35°,
hamle ve gölgeler kapalıydı. Dikey görüş açısı 44° olan kamera, 0,95 m
yükseklikte 4,5 m'den yaklaşık 125 m'ye ilerledi ve aynı yoldan döndü.
Kare başına gerçek LOD, ana görünümün GPU örnek sayaçlarından okundu.
Yakında toprağa giren ana saplar, üç seed'de de çalıya özgü enine açılım
ve farklı dal boşlukları görülüyor.

LOD1 → LOD2 geçişinde en ve görünür örtü tek karede çökmüyor. Kamera
mesafesi düzeltildikten sonra görünür alan uzaklaşırken yaklaşık %1–7
arttı, yaklaşırken %1–9 azaldı. Eşikte bitki yaklaşık 30–35 piksel
yüksekliğinde. Seed 2'de birkaç iri kart yer değiştiriyor. Kenar boşlukları
ve kartların tonu eşikte fark edilebiliyor. Uzaklaşırken ilk LOD geçişinde
görünür alan %5–8 azalıyor. Alan hesabı, her ekran satırında sabit arka
plandan bir RGB kanalında 25/255'ten fazla ayrılan pikselleri sayar.

Aynı aile gerçek sahnede bir `forge.plant` ve sekiz boyalı foliage örneği
olarak çizildi. Üretilen foliage türleri uzak temsilde mevcut mesafe
fade'ini kullanır. High kaliteyle grup, 185 m kamera konumunda sekiz,
195 m'de dört, 205 m'de sıfır foliage örneği çizdi. Tekil aktörde mevcut
mesafe davranışı geçerli. Otun seyrelme ve fade kabulü ayrı duruyor.

Yerel adaylar [çalılar ve sap dipleri](../../.forge-cache/pg4-shrub/review/cali-ve-dipler.png),
[kamera gidiş-dönüşü](../../.forge-cache/pg4-shrub/review/cali-gidis-donus.webp),
[uzaklaşma eşiği](../../.forge-cache/pg4-shrub/review/lod2-uzaklasma.png),
[yaklaşma eşiği](../../.forge-cache/pg4-shrub/review/lod2-yaklasma.png) ve
[foliage grubu](../../.forge-cache/pg4-shrub/review/painted-group.png).
Kare başına kamera ve GPU sayacı `.forge-cache/pg4-shrub/final/seed{1,2,3}/frames.json` içinde.
Kullanıcı 22 Kasım 2026'da görsel onayı verdi.

### 9.6 PG4 · Şerit/demet ot

Starter paketindeki `MeadowGrass.grassrecipe.json`, kök bölgesinden farklı
yönlere açılan ve uca doğru incelen eğri şeritler üretir. Tarif formunda
şerit boyu, genişliği, kıvrımı ve demet başına şerit sayısı düzenlenir.
LOD1 aynı demetten en fazla altı şerit seçer ve örtünün bir bölümünü
korumak için seçilen şeritleri genişletir. Kök uçlarının rüzgâr ağırlığı
sıfırdır. Üç prototip ve bunların foliage türleri tek bitki ailesi olarak
kaydedilir. Aile için impostor, doku veya collider üretilmez.

Yazılabilir geçici projede canlı önizlemede genişlik 0,037 → 0,048 m,
yoğunluk 12 → 13 şerit oldu. Seed 1, 2 ve 3 aynı kamera ve ışıkta iki
LOD ile çekildi. **Generate & Save Family** altı GLB'yi, altı metayı, üç
foliage türünü ve aileyi kaydetti. Editör yeniden açıldığında iki değer
korundu. Aynı tarifin CLI tekrar üretim karşılaştırmasında 16/16 çıktı
bayt bayt aynıydı.

| Seed | LOD0 üçgen | LOD1 üçgen |
|---|---:|---:|
| 1 | 117 | 18 |
| 2 | 117 | 18 |
| 3 | 117 | 18 |

Kaydedilen aile, geçici bir düz sahnede 1.190 demetlik boyalı foliage
örtüsü olarak çizildi. Başlıklı Chrome, RTX 3060 WebGPU, High, 1280 × 720,
DPR 1 ve 44° dikey görüş açısı kullanıldı. Yaz ve saat 14.00 sabitlendi.
Kamera örtünün merkezinden yatayda 9–76 m arasında gidip döndü. Ana
görünümün LOD sayaçları doğrudan GPU'dan okundu. Bütün 157 karede aynı tek
hücre ve 1.190 demet yüklü kaldı. LOD0 ve LOD1 yaklaşık 36,7–48,6 m
arasında birlikte çizildi ve dönüşte aynı pozlarda aynı sayılar görüldü.
Altı mesafede üç prototip için GPU ve CPU referans sayaçları eşleşti.

| Örtü merkezine yatay mesafe | LOD0 | LOD1 | Ortak fade pencereli kontrol, toplam |
|---|---:|---:|---:|
| 9,0 m | 1.189 | 0 | 1.189 |
| 34,8 m | 1.113 | 0 | 1.190 |
| 44,5 m | 222 | 453 | 1.190 |
| 49,7 m | 0 | 423 | 1.190 |
| 55,0 m | 0 | 192 | 1.157 |
| 60,6 m | 0 | 25 | 391 |
| 64,1 m | 0 | 0 | 11 |

Foliage türü başına `fadeSpread`, mevcut dither penceresini demetin
tohumu ve konumundan elde edilen kararlı bir pay kadar yakına kaydırır.
Bu koşuda High kaliteyle ortak pencere 39,1–59,5 m, kaydırma en fazla
25,5 m idi. Her demet kendi penceresinin sonunda GPU çizim listesinden
çıkar. Aynı kamera yolunda iki komşu kare arasındaki en yüksek örnek
sayısı düşüşü ortak pencerede 178, kaydırılmış pencerede 62 oldu. Aynı
51 m pozunda dither açık ve kapalıyken GPU 359 LOD1 demeti gönderdi.
Ot rengiyle eşleşen piksel sayısı aynı kırpımda 1.522'den 349'a indi.
Bu çekim fade'i örnek sayısındaki değişimden bağımsız gösteriyor.

Yakında şeritler dipte toplanıyor, uçlar rüzgârla salınıyor. Orta
mesafede örtüde boşluklar açılıyor. Uzakta son izler birkaç piksele
inerken incelme sürüyor. Aday gidiş–dönüşte belirgin bir geçiş bandı
veya tek karede boşalma görülmedi. Çok yakın planda şeritlerin
çokgen kıvrımları, uzakta ise son birkaç demette dither noktaları
seçiliyor. Çekim tek, düz boyalı foliage örtüsünü kapsıyor.
Kullanıcı MeadowGrass için 22 Kasım 2026'da görsel onay verdi.

Yerel adaylar [canlı düzenleme](../../.forge-cache/pg4-grass/review/editor-width-and-density.png),
[üç seed ve iki LOD](../../.forge-cache/pg4-grass/review/editor-seed-comparison.png),
[yeniden açılan tarif](../../.forge-cache/pg4-grass/review/editor-reopened.png),
[kök yakın çekimi](../../.forge-cache/pg4-grass/review/roots.png),
[rüzgâr ve kamera gidiş–dönüşü](../../.forge-cache/pg4-grass/review/meadow-grass-webgpu.mp4),
[kamera yolu karşılaştırması](../../.forge-cache/pg4-grass/review/camera-control.png),
[sabit pozda fade karşılaştırması](../../.forge-cache/pg4-grass/review/fade-control.png) ve
[kare başına sayaçlar](../../.forge-cache/pg4-grass/review/camera-metrics.csv).

### 9.7 PG5 · Editör ve World Builder bağlantısı

**Editör (E, 2026-11-25).** Ağaç / çalı / ot / kaya tarifi önizlemesi Source, LOD'lar
ve impostor'u yan yana ya da bütün tohumları birlikte gösterir; ailenin belleğini
yazar, mevsim / kar / ıslaklık / rüzgârı yalnız önizlemede dener. Kaya tarifi de
editörden üretilir. Related bölümü tarifin ailesini, materyal ve doku tariflerini,
foliage türlerini ve onu kullanan örtüleri açar. Aile önizlemesi prototipleri,
LOD'ları ve tekil `forge.plant`'i foliage örneğinin yanında dört mevsimde çizer.
Onay sayfası (`forge.familySheet`) projedeki ve paketlerdeki çıktılı tarifleri
listeler; kart seçilince çıktısı önizlemede görünür; onay / red / not kaydedilir,
onaylanan çıktı sonradan değişirse "Changed" olur.

**World Builder (F, 2026-11-25).** Brief'in model satırı `source: "generated"` +
`recipe` (tarif GUID'i); örtünün bitkisi `recipe`. Kaya rolleri üretilmiş
modellere, bitki tarifini gösteren landmark / prop rolleri `forge.plant`
aktörüne, örtü bitkileri prototip başına bir foliage kuralına çözülür (kuralın
yoğunluğu paylaşılır). Rastgele dünya her yerleşimin meydanına ya da merkezine en
yakın açık yere bir ağaç koyar (bina, yol ve sudan uzak). Altı örtü tariflere
bağlı: Broadleaf, Conifer, Hazel, MeadowGrass. Rapor: "no output", "rejected" ve
"Not approved" satırları (pencere ve CLI).

**Kanıt.** `recipeOutputs` / `recipeLinks` / `recipeMemory` / `familySheet` /
`worldBuild` / `worldLevel` testleri; `tools/world/generatedModels.test.ts` (yer
tutucu kaya yok, yerleşim başına bir Broadleaf, her kural aileden; reddedilen
kurulmuyor; proje tarifi bir kez üretiliyor ve elle düzenlenen ailesi korunuyor;
paketin çıktısız tarifi raporda). Editör: `assets.spec.ts` (tarif düzenle → üret →
kaydet → yeniden aç; aile / mevsim; onay sayfası) ve `worldBuilder.spec.ts` (dünya
kur → ağacı düzenle → kaydet → yeniden aç; sayfa Content Browser'da), WebGL'de ve
gerçek WebGPU'da. Kontrol çekimi `.forge-cache/world-builder/nature-webgpu.png`.

**Sınırlar.** Çöl çalısının (`desert-shrub`) tarifi yok. Kayalar Forge'daki gibi
yalnız vadi profilli arazilerde serpilir. Ot yoğunlukları Forge'un değerleri ve
tek öbekler için seyrek; ayarı örtü belgesinde. `forge.plant` viewport'ta
tıklanarak seçilmez, Focus aktörün noktasını alır (GPU toplu çizim; Outliner'dan
seçilir). Oak ve Poplar çıktısız.

### 9.8 PG5b · Taç kalitesi

**Sorun (2026-11-25, kullanıcı).** World Builder'ın kurduğu `World_1`'de ağaçlar
neredeyse yapraksız görünüyor; referans videonun (Ek A) çok gerisinde. Yaprak alanı
tacın izdüşümüne bölününce (LAI; kapalı bir ormanda kabaca 4–8):

| | Conifer LOD0 / LOD1 / LOD2 | Broadleaf LOD0 / LOD1 / LOD2 | Oak LOD0 |
|---|---:|---:|---:|
| LAI | 0,27 / 0,27 / 0,08 | 0,57 / 0,52 / 0,26 | 2,81 |
| Üçgen | 14,1 k / 3,2 k / 0,6 k | 17,5 k / 3,4 k / 0,7 k | 16,2 k |
| LOD0'da odunun payı | %55 | %62 | %58 |
| Yaprak kartının dolu payı | %15 | %29 | %32 |

1. Yaprak kümeleri yalnız uç sapların dış yarısında; ana dallar ve iç taç boş.
2. Kart dokusu seyrek; üçgen bütçesinin çoğu odunda, kartların yarısı arka yüz kopyası.
3. LOD'lar, kart ve impostor aynı seyrek LOD0'dan türüyor; LOD2 alanı da korumuyor.
   Eşikler uzak: LOD0 ≈ 120 m'ye, LOD1 ≈ 340 m'ye, impostor ≈ 790 m'den sonra.
4. Yaprak gölgelemesinde ışık geçirgenliği ve taç içi kararma yok; kart normali her
   yüzde ters döner.
5. `forest` örtüsü tek ağaç türü ve hektara ≈ 76 ağaç; Oak / Poplar çıktısız.

Alfa mip kaybı ölçüldü ve elendi (karolar mip boyunca aynı örtüyü koruyor). **Süreç
hatası:** PG2–PG3 kapıları üçgen ve kare süresine baktı; yaprak örtüsünün alt sınırı
hiçbir kapıda yoktu.

**Deneme (2026-11-25, depo dışında klonda).** Taç hacmini dolduran iskelet + dal boyunca
dolu "sprey" kartları (yapraklı dalcık) + taç normali, arkadan ışık ve iç kararma: aynı
yerleşimde LAI 5,9 (Broadleaf) / ≈ 10,8 (Conifer), LOD0 10,5–13,6 k üçgen. Dört World_1
pozunda 1600 × 900 `high` tek koşuda GPU +0,2–1,3 ms (en çok 6,1 ms). Kareler ve kod
`.forge-cache/vegetation-v6/` (yerel).

**Kararlar (kullanıcı, 2026-11-25).** Yeni üretici starter Broadleaf / Conifer'in yerine
geçer (GUID'ler aynı, eski görünüm kalkar; kurulmuş dünyalar yeniden kurulmadan
değişir). Yakın ağacın LOD0 tavanı 20 k yerine **40 k** üçgen, yalnız ilk 30–40 m için.

**Uygulama: üretici sürümü 6.**

- *İskelet.* Geniş yapraklı: taç zarfı (boy, genişlik, en geniş nokta, taç başlangıcı,
  doluluk, düzensizlik) içinde çekim noktalarına doğru büyüme (space colonization), dal
  kalınlığı boru modeliyle, ana gövde baskınlığı tarifte. İğne yapraklı: sık kat dalları,
  altta sarkan üstte kalkan eğri. Var olan **Growth** alanları kullanılır.
- *Sprey.* Tür başına 2 × 2 karo: yapraklı dalcığın rengi + alfası ve normali, CPU'da.
  Sprey sayısı hedef LAI'den çıkar (Fullness), kart alanı LOD'lar boyunca korunur;
  bütçeye sığmayan sayı, kartlar büyütülerek indirilir.
- *Gölgeleme.* Taca göre normal (iki yüzde aynı), yaprak normali, arkadan gelen ışık,
  taç derinliğine göre kararma (yaprak ve odun); mesh LOD'ları ve impostor aynı kuralda.
- *Kapı.* LAI alt sınırı bütün LOD'larda testte; LOD'lar arası alan farkı sınırlı.

**Adım 1–4 (2026-11-25, `4279194`).** `engine/procgen/tree/crown/` (parametre, iskelet,
taç ışığı, sprey + LOD), `texture/sprayTexture.ts`, `render/plant/crownShading.ts` ve
`leafLighting.ts`. Starter Broadleaf / Conifer sürüm 6'da, aile ve model GUID'leri aynı.

| Prototip 1 | LOD0 | LOD1 | LOD2 |
|---|---:|---:|---:|
| Broadleaf üçgen (odun + yaprak) | 11,4 k + 25,0 k | 1,4 k + 3,6 k | 86 + 714 |
| Broadleaf LAI | 6,2 | 6,2 | 6,2 |
| Conifer üçgen | 10,2 k + 14,7 k | 1,4 k + 2,8 k | 44 + 734 |
| Conifer LAI | 7,5 | 7,4 | 6,5 |

- *Eşikler.* LOD0 ≈ 40 m, LOD1 ≈ 119 m (önceden 340), LOD2 ≈ 250 m, sonra impostor.
- *Taç ışığı.* Yaprak alanı voksellere yazılır; 18 ışın açıklığı (`_LEAF`.y, odunda da)
  ve bükülmüş normali verir. Impostor aynı değeri normal dokusunun mavisinde taşır.
- *Ton.* Doygun mevsim tonu yeşille çarpılıp kararmaz, yaprağın parlaklığını alır.
  Örnek başına küçük ton farkı. `response.translucency` / `crownDepth` formda.
- *Form.* Sürüm 6'da Growth + Spray; `levels` ve `leaves` görünmez. Habit değişince
  starter'ın o alışkanlıktaki ön ayarı uygulanır.
- *Kapı.* `crownTree.test.ts`: her LOD'da LAI ≥ 4, LOD0'a göre alan farkı ≤ %20, tavanlar,
  karo örtüsü, nested LOD, taç şişmez, aynı tohum aynı bayt.

**Ölçüm (R1).** `measure:forest` (Derekavak, 1080p `high`): yaz gönderim 1,30 / p95 3,7 ms,
ana iş parçacığı 1,80 / 4,3 ms, GPU 2,94 ms (level'ın kendi foliage'ı 2,56); 15 m/s yürüyüş
1,95 / 3,23 ms; mevsim geçişinde pipeline +0; kar / kış doğru (PV-WES-03 çekimleri yenilendi).
World_1'in dört pozunda (1600 × 900, tek koşular, ±1 ms, bir pozda açılış sıçraması 9–12 ms):
GPU eski 1,8–5,0 → yeni 1,7–8,1 ms; orman içi pozlarda ≈ +2–3 ms. Impostor bake prototip başına
2 → ≈ 6 s, atlas ≈ 7 s; aile başına doku + 1,33 MiB (yaprak normali). Smoke: plants, impostors
(silüet IoU 0,79–0,97), foliageFar / Wind / Ring gerçek WebGPU ve WebGL'de; editör `assets` +
`worldBuilder` gerçek WebGPU'da.

**Sınırlar (adım 1–4).** Impostor yakına zorlandığında bulanık (128 px). Kullanıcı görsel kabulü:
2026-11-25.

**Adım 5 · türler (2026-11-25, `e1891dd`).** Kararlar (kullanıcı, öneriler gibi): LOD GLB'leri
meshopt'lu, yeni türler 2 prototip (Broadleaf / Conifer / Hazel 3); sürüm 1–4 (ve 5) tarifleri
okunurken 6'ya göçer; Hazel yeni görünüme taşınır, eski yol kalkar; ladin ayrı tarif değil, Conifer.

- *Tek üretici.* `treeGrowth`, `treeCards`, `treeParams`, `leafTexture` ve eski iskelet silindi.
  `crown/`: `crownEnvelope` (taç zarfı, dal kütleleri), `spreadingSkeleton` (yayılan ağaç, açık taçlı
  çam, çalı), `coniferSkeleton` (kat dalları). `forge.treeRecipe/3`: `levels` / `leaves` yok; göç boy,
  gövde, tohum, materyal, tepki, GUID ve (sürüm 4'te) growth'u korur, çıktı yeniden üretilene kadar
  eskisi gibi çizilir.
- *Taç.* Her tohumda dokuz dal kütlesi (`growth.clumping`), boş gövde çevresinde yükselen ana dallar
  (leaderDominance azaldıkça), sarkan / kalkan ince dal (`growth.droop`). Ladin gövdesinde katlar arası
  sürgün. Uzun iğneler dalcık ucunda tutam.
- *Kabuk.* `forge.surfaceTextureRecipe` katmanlarında `stretch` (dikey / yatay ayrı ölçek) ve `invert`;
  `BarkBirch`, `BarkPine`, `BarkSmooth` + materyalleri. `bark.twigTint` / `twigRadius`: ince dalın kabuk
  çarpanı (`_LEAF`.x odunda, `forge.plantFamily.twigTint`), impostor'da da.
- *Süre.* Impostor bake ≈ 6 → 1,1 s (gizli parça doku okumadan elenir), sprey atlası 0,5–2,5 s; doku
  başına ≈ 2 s KTX2 ayrı. UASTC RDO (< %2) ve ETC1S (normal 27 dB, alfa 30 dB) ölçülüp elendi.

| | Üçgen LOD0 / 1 / 2 (prototip 1) | LAI LOD0 / 2 | Çıktı |
|---|---:|---:|---:|
| Broadleaf (3) | 35,7 k / 5,0 k / 800 | 6,1 / 6,2 | 9,1 MB |
| Conifer (3) | 25,3 k / 4,2 k / 800 | 7,4 / 6,9 | 7,9 MB |
| Maple (2) | 40,0 k / 5,0 k / 800 | 5,8 / 5,7 | 6,8 MB |
| Birch (2) | 31,9 k / 5,0 k / 728 | 4,7 / 4,7 | 5,7 MB |
| Oak (2) | 40,0 k / 5,0 k / 799 | 5,9 / 5,0 | 6,6 MB |
| Poplar (2) | 23,9 k / 4,4 k / 484 | 7,1 / 7,0 | 5,0 MB |
| Pine (2) | 33,5 k / 5,0 k / 800 | 5,5 / 5,4 | 6,2 MB |
| Hazel (3, çalı) | 2,9 k / 0,5 k / 99 | 4,9 / 5,1 | 1,6 MB |

Taç testi sekiz tarifte (beş tohum): LAI ≥ 4, alan farkı ≤ %20, tavanlar. Smoke: plants, impostors,
foliageFar, foliageWind (WebGPU + WebGL); editör assets + worldBuilder gerçek WebGPU'da.
`measure:forest` yaz: gönderim 1,56 / ana iş parçacığı 2,10 / GPU 3,32 ms (G6 içinde). Son üretimin kış
ve yürüyüş sayıları makinede başka oturum çalışırken alındı, geçersiz; son taç değişikliğinden önceki
sakin koşu: kış 1,37 / 1,86, yürüyüş 2,03 / 3,32 ms. Adım 6'da boş makinede yeniden ölçülür.
*Sınırlar:* impostor yakına zorlanınca bulanık ve üzerinde çapraz gölge izi; yapraksız kışta LOD1'den
sonra ince dallar düşer. Kullanıcı görsel kabulü: 2026-11-25.

**Adım 6 · World Builder örtüleri (2026-11-26, `8710f0c`).** Kararlar (kullanıcı): §11.

- *Meşcere.* `forge.landscapeFoliage` kuralında `stand`: aynı tohum ve toplam yoğunluklu kurallar tek
  altıgen ızgarayı (jitter 0,8) `from`–`to` payıyla bölüşür, isteğe bağlı ≈ 60 m tür yaması
  (`engine/foliage/foliageStand.ts`). Slot dünya indeksinden hash'lenir: yerleşim hücre boyundan ve
  uzaklıktan bağımsız, yoğunluk ve paylar tam (eski ızgarada hedef 60 → 29 ağaç/ha), gövde aralığı testte.
  `edge`: boya ağırlığında `fadeIn`, `maxWeight` / `fadeOut`; kalan bitki oynamaz, `edgeScale` küçültür.
  Alanları olmayan kural eski algoritmayla üretilir (kurulmuş dünyalar, taşınan Forge testleri).
- *Erişim.* `stand.reach` (360 m) içinde seyrelme ve `grassDensity` etkisi yok; sonra aynı atlasla far
  billboard (3 km) ve arazi tonu. Type'lar değişmez: kural kendi batch'ini çizer (`ruleDraws`).
- *Genç ağaç.* Tarifte `young` (yaş payı 0,2 + tohumlar): olgunların ardına eklenen prototipler, rol
  `tree/<tohum>_young/…`, ortak atlas ve materyal, yarı boy impostor karesi (64 px). Yedi türde ikişer; LOD0
  10–16 k üçgen, LAI ≥ 4, alan farkı ≤ %20 (kaba LOD'lar dalcıkların 1,6 katını tutar; Conifer LOD2 0,73 →
  0,89). Tür başına 1,5–1,9 MB, toplam 11,8 MB. Olgun modeller ve dokular bayt bayt aynı. Editör önizlemesi,
  galeri ve onay sayfası gençleri `11 (young)` adıyla gösterir.
- *Örtüler.* Altı örtü `stands` + `age`, `prototypes`, `fadeIn` / `maxWeight` / `fadeOut`, `edgeScale`
  alanlarıyla. Orman (ağaç/ha, medium): Broadleaf 45, Conifer 40, Birch 35, Maple 20, Pine 15, Oak 12 + genç 95,
  orman altında Hazel 70, kenarda 200. Ot 1,0–1,8/m² (çayır), 0,5 (orman altı), 0,4 (bozkır). Tür başına en
  çok iki olgun ve bir genç prototip; gençler 200 m'ye kadar, billboard'suz.
- *Yerleşim ağaçları.* Broadleaf, Oak, Maple, Birch satırları kararlı `pick` ile; binadan önce 8 m, yer
  yoksa 4 m. Landmark'lar ve köy ağaçları yalnız olgun prototip alır.
- *Maliyet araçları (yalnız meşcere).* Gölge görünümleri bir kaba LOD çizer, yakın LOD uzaklıkları
  `stand.detail` (0,65) ile çarpılır, halkada impostor yerine billboard, halka hücresi 128 m. Bütün foliage'da:
  yakın LOD önce çizilir, hiçbir uzaklıkta çizilmeyecek LOD'un draw'ı atlanır.

Ölçüm (World_1'in brief'iyle World_3, `forest: high`, 1600 × 900 `high`, RTX 3060, 60 Hz adımlı, sakin makine,
birer koşu, ±1,5 ms):

| | GPU eski → yeni (ms) | Gönderim eski → yeni (ms) |
|---|---|---|
| Orman içi (3 poz) | 5,5–6,3 → 8,8–9,3 | 1,5–1,6 → 3,6–3,8 |
| Kenar (3 poz) | 4,3–4,9 → 8,5–10,8 | 1,7–1,9 → 3,7–4,3 |
| Havadan / uzak | 4,0–4,6 → 10,8–11,3 | 1,7–1,9 → 4,2–4,3 |

İlk kurulum 11–18 ms GPU, 5,2–6,6 ms gönderimdi. Sık orman 7–8 ms hedefini ≈ 1 ms, gönderim 3 ms'yi aşar;
kullanıcı böyle kabul etti (yoğunluk ve yapı kısılmadı). Süre üçgen ağırlıklı (≈ 1 ms / milyon), gönderim
batch sayısından (≈ 12 µs / draw). `measure:forest` (Derekavak) G6 içinde: yaz gönderim 1,50 / ana iş
parçacığı 2,02 / GPU 3,02 ms; kış 1,42 / 1,91 / 2,86; karlı kış 1,49 / 1,99 / 3,04; yürüyüş 2,20 / 3,50 / 4,29;
mevsim geçişinde pipeline +0. Meşcerede GPU / CPU görünür sayıları (gölge dahil) 140 karşılaştırmada birebir.
Smoke: plants, impostors, foliageFar / Ring / Wind, gpuCulling (16, WebGPU + WebGL); editör assets, worldBuilder,
foliage gerçek WebGPU'da. Kareler `.forge-cache/vegetation-v6/step6/shots/pg5b6-*.png` (yerel).
*Sınırlar:* ot karda yeşil kalır; çöl çalısının tarifi yok; bozkır ve çöl örtüsü çekimle bakılmadı. Eski
dünyanın bir ölçüm koşusunda sayfa bir kez çöktü, biri açılmadı (başka GPU yükü altında); sakin makinede
tekrarlamadı, nedeni bulunmadı. Kullanıcı görsel kabulü: 2026-11-26.

---

### 9.9 Orman zemini ve çayır geçişi

[ImageGen hedef görseli](../research/forest-floor/reference.webp) kullanıcının editör
kadrajından üretildi. Soldaki geniş gövdenin altında humus ve kuru yapraklar
görülüyor. Açıklıkta ot demetleri arasında toprak seçiliyor. Aradaki eğrelti
grupları orman kenarını belirginleştiriyor.

| Sıra | Uygulama | Görsel kontrol |
|---|---|---|
| 1 | World Builder `Forest` örtüsündeki `forest` katmanına döşenebilir humus, kuru yaprak ve ince dal materyali bağla. | Yakın planda yapraklar santimetre ölçeğinde okunmalı. Geniş planda göze çarpan dikiş veya düzenli desen görülmemeli. |
| 2 | Çayır ve orman otlarının yoğunluğunu boya ağırlığıyla kademelendir. Orman içinde humus açıkta kalsın. | Aynı ışıkta açıklık, kenar ve iç bölge ayırt edilmeli. Tam örtüdeki az sayıdaki demet de kontrol edilmeli. |
| 3 | Kenarda küçük eğrelti grupları, seyrek düşmüş dallar ve kısmen gömülü taşlar yerleştir. | Yürüyüş yüksekliğinde ölçekler okunmalı, ağaç aralarındaki görüş açıklığı korunmalı. |
| 4 | Geniş yapraklı ve ince gövdeli iki ağacın kök boğazını, yerleşim yüksekliğini ve temas gölgesini yakından incele. Bulgulara göre model veya yerleşimi düzelt. | Gövde eğimli zeminde de toprağa oturmalı. |

İlk karşılaştırmada aynı dünya tohumu, kamera, yaz mevsimi ve ışıkla üç kare
alınır: önceki görünüm, yalnız materyal, materyal ve ot kuralları. Editör
ızgarası kapatılır. Orman içinden bir yakın çekim dokunun ölçeğini gösterir.
Tarif yeni üretilen dünyalara uygulanır. Kaydedilmiş dünyalar kendi terrain
materyalini ve foliage kurallarını saklar.

**İlk uygulama, 26 Kasım 2026.** İlk iki adım `Forest` ön ayarında uygulandı.
Starter paketindeki `M_ForestFloor` için renk ve normal haritaları aynı
tohumdan üretiliyor (`node tools/procgen/forestFloor.ts`). 512 × 512 piksellik
karo zeminde 1,6 m kaplıyor. Humus üzerinde yaklaşık 2–9 cm uzunlukta yaprak
parçaları ve ince dallar var. Terrain katman dizisi piksel okuduğu için
haritalar PNG. Orman boyası tam ağırlıktayken ot kuralı adayların yaklaşık
%13'ünü geçiriyor; orta ağırlıkta (%50) tamamını geçiriyor. Çayır otu kendi
boyası arttıkça kademeli olarak tam yoğunluğa ulaşıyor.

[WebGPU karşılaştırması](../research/forest-floor/comparison.webp) `World_3`
brief'inin ayrı bir kopyasından alındı (tohum 37687, 1200 × 800, High).
İki kamera konumunda üçer çekim var. Alt sırada gövdeler arasındaki yeşil
zemin yerini yaprak örtüsüne bırakıyor. Üst sırada kenardaki otlar korunuyor.
Referansa göre gölgeli iç bölge hâlâ koyu ve tekdüze. Sonraki geçişte eğrelti
ve odunsu döküntüleri küçük gruplar hâlinde ekleyip aynı pozlarda incele.
Kök boğazı kontrolü ve kullanıcı görsel kabulü açık.

**İkinci uygulama, 26 Kasım 2026.** World Builder `Forest` ön ayarı, orta
orman boya ağırlığında iki eğrelti kümesi modeli kullanıyor. Yoğun orman
boyasına doğru eğreltiler çekiliyor ve yaprak örtüsü açıkta kalıyor. Üç
düşmüş dal modeli ve üç mevcut `RockRounded` modeli arazi normalini takip
ediyor. Ölçek, dönüş, gömülme miktarı ve boya ağırlığı yerleşimi çeşitlendiriyor.
Dallar ve taşlar yalnız yakın mesafede çiziliyor. Doku içindeki ince dallar
korundu. Aynı ışıkta humus ve yaprakların daha iyi ayrışması için renk
haritası ısıtıldı ve yaprakların renk farkı artırıldı.

Geniş yapraklı ve huş tabanları araziye yaklaşık düz yerde 1–2 cm içinde
oturuyordu. Yokuş aşağıda modelin taban çemberi, merkezin yükseklik örneğine
göre yaklaşık 16 ve 8 cm açıkta kalıyordu. Bu iki türün dik duran
gövdelerini aşağı alma miktarı örnek ölçeği, taban yarıçapı ve yerel
eğimden hesaplanıyor. İncelenen eğimli örneklerde tabanın en açıkta kalan noktası
arazinin yaklaşık 2 cm altında. Aynı gölge ayarlarında, yokuş aşağıdan
görünen kesik taban çizgisi zeminin altına geçti.

[Orman kenarı ve içi](../research/forest-floor/comparison-pass2.webp) ile
[düz ve eğimli kök yakın çekimleri](../research/forest-floor/root-contact.webp)
başlıklı Chrome'da gerçek WebGPU ile alındı (NVIDIA Ampere, 1200 × 800,
High, yaz, kuru zemin). `World_3` tohumu 37687. Oturum başlangıcının ayrı
kopyasıyla aynı iki kadraj ve yürüyüş yüksekliğinden ek pozlar kullanıldı.
Yeniden üretilen kopyada 64 arazi parçası, sahne ayarları ve ışık aktörleri
başlangıçla aynı. Karşılaştırma bölgesinde örneklenen 614 dal ve 775 taşın
geometrisi arazi yüzeyini kısmen kesiyor. Önceki karşılaştırma yukarıdaki
bağlantıda duruyor.

Asset denetimi ve 49 ilgili test geçti. Orman içindeki yaprak dokusu
daha belirgin. Gölge, ImageGen hedefinden hâlâ daha koyu ve homojen.
Oturumda GPU güdümlü batch sayacı 35'ten 43'e çıktı. Kare süresi ve
hareket hâlindeki performans ölçülmedi. Kullanıcı görsel kabulü açık.

#### 9.9.1 Referansa yaklaşmak için beş adım

ImageGen karesinde gövde diplerinden açıklığa doğru yosunlu kökler, kuru yaprak
birikintileri, çıplak toprak ve kısa ot adaları seçiliyor. İkinci WebGPU
geçişinde santimetrelik yapraklar yakından okunuyor. Yürüyüş yüksekliğinde
ise gövdeler arasındaki birkaç metrelik alan çoğunlukla aynı yüzey gibi
görünüyor. İlk iki adım yüzey dağılımı ve taç gölgesinin bu görünüme katkısını
ayrı ayrı sınar.

İkinci geçişin `World_3` kopyasında kameraların baktığı noktalardaki
[boya ağırlığı kuralı](../../src/engine/foliage/proceduralFoliage.ts) şöyle çalışıyor.
Son iki sütun adayın bu kuraldan geçme oranını gösterir. Nihai bitki sayısını
ayrıca tür yoğunluğu ve diğer yerleşim kuralları belirler.

| Kadraj | Orman boyası | Orman otu | İki eğrelti çeşidi |
|---|---:|---:|---:|
| Kenar, yürüyüş yüksekliği | %51,2 | %100 | %100 / %100 |
| Düşmüş dal | %64,9 | %100 | %97 / %100 |
| Orman içi | %100 | %12,6 | %0 / %0 |

İç kadrajın hedefi çevresinde 10 × 10 m alanda, 1 m aralıkla alınan 121 örnekte
orman boyası %96,4–100. Her iki eğrelti kuralı da bu aralıkta sıfıra iniyor.
İleride iç bölgede eğrelti istenirse uygun ceplere ayrı yerleşim kuralı gerekir.

| Sıra | Uygulama | Görsel karar |
|---|---|---|
| 1 | Mevcut 1,6 m yaprak karosunu koruyup dünya tohumuna bağlı, başlangıçta 2–6 m genişliğinde humus, kuru yaprak ve açık toprak cepleri üret. | Aynı gövdeler arasında yürürken geniş yüzeyler birbirinden ayırt ediliyor, yaklaşınca yapraklar santimetre ölçeğinde kalıyor. İlk oturumun kapsamı §9.9.2. |
| 2 | Sabit güneş ve pozlamada önce yaprak gölgelerinin katkısını incele. Sonra tek bir geniş yapraklı prototipte taç doluluğunu ve kümelenmeyi ayrı dene. | Açıklığın parlaklığı korunurken yaprak örtüsünde küçük güneş lekeleri seçiliyor. Kamera LOD sınırını geçince zemindeki ışık sıçramıyor. Aynı pozlarda başlangıç, yalnız yüzey, yalnız taç ve ikisi birlikte karşılaştırılıyor. |
| 3 | Açıklıkta ince, yana yatan 8–20 cm kısa ot adaları dene. Aynı adadaki demetlerin boy ve yönü yakın, kenarları seyrek olsun. İlk kıyası benzer toplam örnek sayısıyla yap. | Açıklıkta otların arasından toprak görülüyor. Orman kenarı ve görüş derinliği korunuyor. Mevcut MeadowGrass tarifi 42 cm ve demet başına 12 yaprak. |
| 4 | Doku üreticisinde kıvrılmış bütün yapraklar, parçalar ve üst üste birikimler oluştur. Aynı tohumdan üretilen pürüzlülük haritasıyla kuru yaprak ve humusun ışık tepkisini karşılaştır. | Yakından tek yaprağın kenarı, birkaç metre öteden birikintinin biçimi okunuyor. Kuru yüzey gölgede gri taneciklere dönüşmüyor. |
| 5 | Bir geniş yapraklı prototipte toprağa incelerek giren asimetrik yüzey kökleri dene. Kök aralarında yaprak birikimi, bazı orman taşlarının üstünde kesintili yosun ve yakınlarında küçük eğrelti cepleri oluştur. | Düz ve eğimli yakın çekimlerde gövdenin dairesel taban çizgisi kırılıyor. Taşın gömülü kenarı yapraklarla birleşiyor. Geometri eklenen turda aynı yürüyüşte GPU kare süresi, batch sayısı ve detayların görünme mesafesi karşılaştırılıyor. |

**Açık kaynak örneklerinin Forge'daki karşılığı**

- Terrain3D (MIT) geniş ölçekli renk değişimi ve doku tekrarını ayrı ele alıyor. Forge'da 25 m sonrasında uzak tekrarı kıran bir örnekleme zaten var. İlk adımın hedefi kameranın önündeki birkaç metre. [Terrain3D shader](https://github.com/TokisanGames/Terrain3D/blob/main/src/shaders/main.glsl) · [Forge terrain materyali](../../src/render/materials/terrain.ts)
- ProtonScatter (MIT) konuma göre ölçekleme ve maskeleme örnekleri sunuyor. Kısa ot adalarında ortak bir alanın demet boyunu ve sıklığını birlikte yönetmesi denenebilir. Forge'un mevcut stand dağılımı komşu türleri grupluyor. [Scatter yerleşim araçları](https://github.com/HungryProton/scatter/wiki/Modifiers) · [Forge stand dağılımı](../../src/engine/foliage/foliageStand.ts)
- ez-tree (MIT), LOD'ları aynı iskeletten üretirken yaprak sayısı ve ölçeğiyle taç örtüsünü dengeliyor. İkinci adımda aynı zemin parçasının gölgesini bir LOD geçişi boyunca izlemek için örnek. [ez-tree LOD seçenekleri](https://github.com/dgreenheck/ez-tree#readme)
- Poly Haven Forest Floor (CC0), dördüncü adımda aynı ışıkta prosedürel dokuya karşı denenebilecek kuru yaprak, toprak, normal ve pürüzlülük referansı. [Forest Floor](https://polyhaven.com/a/forest_floor) · [Asset lisansı](https://polyhaven.com/license)

#### 9.9.2 İlk oturum · Humus, kuru yaprak ve açık toprak cepleri

1. §9.9'daki ikinci geçişi başlangıç al. `World_3` brief'inin ayrı bir çalışma
   kopyasını ve 37687 tohumunu kullan. Mevcut kenar ve iç pozlarına, açıklıktan
   ormana bakan ve gökyüzüyle ön planı birlikte gösteren bir geniş poz ekle.
   Düzenleme öncesinde üç pozu kaydet.
2. World Builder ile üretilen `Forest` örtüsünde metre ölçeğindeki geçişleri
   uygula. Orman boyası hem yüzeyi hem ağaçları sürüyor. Görünümün
   çeşitlenmesini ağaçların veya alt bitkilerin yerlerini değiştirmeden sağla.
   Sonuç aynı tohum ve dünya konumunda tekrarlanmalı. 2–6 m ilk deneme aralığıdır.
3. Üç pozun önce/sonra çiftini gerçek WebGPU, High, 1200 × 800, yaz ve kuru
   zeminde al. Kamera, ışık ve pozlama her çiftte aynı olsun. Kısa yürüyüşte
   ceplerin dünyaya sabit kaldığını, tile sınırında dikiş oluşmadığını ve
   yakındaki yaprak ölçeğini kontrol et. Ağaç yerleşimini başlangıç kopyasıyla
   karşılaştır.
4. Karşılaştırmayı `docs/research/forest-floor/` altına ekle. Kullanılan geniş
   kamera pozunu, değişen dosyaları, odaklı doğrulamayı ve gözlenen sınırlamaları
   bu bölümde kaydet. Bu oturum ilk iki karşılaştırma durumunu üretir.
   Yalnız taç ve birleşik sonuç ikinci adıma, görsel kabul kullanıcıya aittir.

**Uygulama ve doğrulama, 26 Kasım 2026.** `Forest` örtüsünün orman
katmanı brief tohumunu arazi tanımına yazar. Materyal, dünya XZ düzleminde
5,4 m ve 2,2 m ölçekli iki gürültüyü karıştırır. Düşük değerlerde koyu
humus, ortada kuru yaprak ve yüksek değerlerde daha seyrek açık toprak
görünür. Toprağın ince tanesi ve küçük kesekleri aynı koordinatlardan gelir.
Yapraklı bölgede 1,6 m renk ve normal karosu tam ayrıntısıyla kullanılır.
Humus ve açık toprakta yaprak kabartması kademeli olarak azalır.

[Üç önce/sonra çifti](../research/forest-floor/comparison-surface-pockets.webp)
commit edilmemiş ikinci geçişten ayrılan `World_3` kopyasında alındı
(`37687`, başlıklı Chrome, WebGPU NVIDIA Ampere, High, 1200 × 800, DPR 1,
yaz ve kuru zemin). Her çiftte kamera, ışık ve çizim pozlaması (0,2)
eşleşti. Önceki kenar ve iç pozları kullanıldı. Açıklıktan ormana bakan
geniş pozun kamerası `[570, 3.0780811071395874, 332]`, hedefi
`[526, 4.2, 320]`, dikey görüş açısı 44° ve yerden yüksekliği 1,6 m.
Yüzey ayrımı orman içinde ve sınır yürüyüşünde belirgin. Geniş pozun
çayır ağırlıklı ön planında değişim daha sınırlı.

Yürüyüş kamerası `Z = 303` boyunca `X = 518`'den `X = 506`'ya, yerden
1,6 m yüksekte 7,5 saniyede ilerledi. `X = 512` parça sınırında
toprak-yaprak geçişi kesintisizdi ve desen dal, taş ve gövdelere göre
kaymadı. Orman içi pozuna dönüldüğünde zemin kırpımındaki ortalama mutlak
RGB farkı kanal başına 0,009/255'in altındaydı. Brief yeniden üretiminde
64 tile, global arazi verisi, level, hücreler ve foliage kuralları bayt
düzeyinde eşleşti. Tek veri farkı orman katmanına eklenen tohumdu.
Örtü, dünya üretimi ve terrain render dosyalarındaki 17 ilgili test geçti.
Doğrulama bu rota, bu tohum ve bu WebGPU koşuluyla sınırlı. GPU kare
süresi ve diğer kalite/mevsim koşulları açık. Kullanıcı yüzey ceplerinin
görsel kabulünü verdi (26 Kasım 2026).

Kod yüzeyi `forest.cover.json`, `groundCover.ts`, `worldBuild.ts`,
`terrainTypes.ts`, `terrainDefinition.ts`, `terrains.ts`,
`features/terrain/render.ts`, `terrain.ts`, `terrainDetail.ts` ve
`terrainForestFloor.ts`. Çalışma kopyası
`.forge-cache/forest-floor/surface-pockets-world` altında.

#### 9.9.3 İkinci oturum · Taç ve zemine düşen ışık

**26 Kasım 2026.** Çekimler `World_3` çalışma kopyasında alındı (tohum
37687, başlıklı Chrome, WebGPU NVIDIA Ampere, High, 1200 × 800, yaz,
kuru zemin). Önceki üç poza yürüyüş yüksekliğinde bir gölge ayrıntısı
eklendi. Ek pozun kamerası `[515, 2.2439200043678285, 303]`, hedefi
`[512, 0.6937842726707458, 304]` olarak seçildi. Kamera, ışık ve
pozlama her karşılaştırmada eşleşti. Rüzgâr çekim kopyasında sıfırlandı.
Arazinin, hücrelerin ve yerleşim kurallarının eşitliği dosya düzeyinde
doğrulandı. [Dört durumun çekimleri](../research/forest-floor/comparison-canopy-light.webp)

**Yaprak gölgesi.** Tanı çekimlerinde 60 ağaç yaprak çizim parçasının gölge
üretimi geçici olarak devre dışı bırakıldı. Gövde gölgeleri ve sahnedeki
yaprak çizimi korundu. Örnek zemin bölgelerinin ortalama parlaklığı
(8 bit) orman kenarında 14,4/255, orman içinde 19,0/255, açıklıkta
0,13/255 arttı. Orman içindeki tüm gölge üreticileri kapatılınca fark
26,3/255 oldu. [Gölge ve prototip kontrolleri](../research/forest-floor/canopy-light-controls.webp)

**Tek prototip denemesi.** `Broadleaf_1` (tohum 1) için doluluk 0,80 →
0,58 ve kümelenme 0,50 → 0,82 ayrı üretildi. Her adayda yalnız bu
prototipin üç GLB'si ve iki impostor dokusu çekim sırasında değiştirildi.
Yakın pozdaki örnek zemin alanında, mevcut taca göre parlaklığı en az
8/255 artan pikseller doluluk adayında %0,49, kümelenme adayında %0,31.
Karşılaştırmanın taç adayı doluluk 0,58. Yaprak alanı endeksi her
ağaç LOD'unda 5,1 ve LOD0 30.377 üçgen. Kenar ve iç pozlarındaki
aydınlanma küçük kaldı. Geniş pozda açıklığın örnek bölgesi aynı
ortalama parlaklığı korudu. Aday yalnız çekim kopyasında denendi.
Tarifler ve üretim çıktıları `.forge-cache/forest-floor/canopy-light-assets`
altında.

**LOD kontrolü.** Kamera adayın 38,86 m eşiğini doğal mesafeyle geçti.
GPU gölge listesinde bir örnek LOD1'den LOD2'ye geçti (5 → 4 ve 33 → 34).
Yaprakların örnek alanı örtmesini önlemek için ölçüm sırasında yalnız
ana görüşteki foliage gizlendi, gölgeler çizilmeye devam etti. Aynı
yaklaşık 3 × 3 m zemin alanında 289 dünya noktasının parlaklığı,
38,81 → 38,91 m geçişinde ortalama 0,09/255 mutlak fark gösterdi.
Bu rotada zeminde belirgin bir ışık sıçraması gözlenmedi. Doğrulama
tek prototip, tek rota ve bu sahne koşullarıyla sınırlı. GPU kare
süresi ve görsel kabul açık.

#### 9.9.4 Üçüncü oturum · Açıklıkta kısa ot adaları

**26 Kasım 2026.** `World_3` çalışma kopyasında (tohum 37687) kabul edilen
orman zemini ve mevcut ağaçlar kullanıldı. Açıklıkta `X = 533–622`,
`Z = 270–390` aralığındaki çayır otları için üç düzen karşılaştırıldı.
İlk sütun mevcut `MeadowGrass` tarifini ve World Builder konumlarını,
ikinci sütun aynı konumlarda kısa otu, üçüncü sütun kısa ot adalarını
gösteriyor. Üç düzen de aynı sayıda demeti sahnenin kayıtlı foliage
hücrelerinden yükledi. Deneme alanında 11.010, çekim alanında toplam
15.689 çayır otu demeti vardı. Normal prosedürel başlangıç da ayrıca
çekildi. [Üç düzenin WebGPU karşılaştırması](../research/forest-floor/comparison-short-grass.webp)

Deneme tarifi üç prototipte 17 cm nominal şerit boyu, 1,3 cm şerit
genişliği, 0,84 kıvrım ve 12 şerit kullanıyor. Eğik yerleşimde ölçülen
demet yüksekliği 9,5–18,8 cm, eğim 19,5–34,3°. Bir ada içindeki boy
farkı en çok 2 cm. Yön, adanın yönünden yaklaşık ±11° sapıyor.
Dünya tohumu ve konumla belirlenen ada merkezlerinin aralığı yaklaşık
4,6 m. Eş alanlı ada merkezi ve dış kenar örneklerinde merkez yaklaşık
4,5 kat daha sık. Çayır boya sınırı yakındaki yerleşimi kısıtlıyor.
206 demet uygun ada konumu bulunamadığında ilk konumunu korudu.

Önceki üç poz ile açıklık yakın pozu, başlıklı Chrome'da gerçek WebGPU
(NVIDIA Ampere), High, 1200 × 800, yaz ve kuru zeminde çekildi. Kamera,
ışık ve pozlama eşleşti. Çekim kopyasında rüzgâr sıfırdı. Yakın pozun
kamerası `[572, 3.1516477823257447, 332]`, hedefi
`[562, 1.4811119985580445, 328]`. Kamera `Z = 332` boyunca
`X = 572`'den `X = 554`'e yerden 1,6 m yüksekte 12 saniyede ilerledi.
Yürüyüş sonunda 23 ot hücresi hazırdı. Geniş pozda GPU, 1.236 kısa
ot demetini çizim için seçti. Orman içi karşılaştırma karesi piksel
düzeyinde eşleşti. Arazi ve diğer yerleşim verileri dosya düzeyinde
eşleşti. Üretimin tekrarı ve kayıtlı ot hücrelerinin okunması doğrulandı.

Kısa otlar ön planı açtı ve adalar yürüyüş yüksekliğinde seçildi.
Adaların arası mevcut yeşil çayır zemini olarak okunuyor. Çıplak
toprak etkisi zayıf. Aday `.forge-cache/forest-floor/short-grass-world`
çalışma kopyasında, üretim ve karşılaştırma dosyaları aynı önbelleğin
altında duruyor. Deneme bu alan ve çekim koşullarıyla sınırlı. GPU kare
süresi ve görsel kabul açık.

#### 9.9.5 Dördüncü oturum · Yaprak döküntüsü dokusu

**26 Kasım 2026.** `tools/procgen/forestFloor.ts --detail <çıktı>`
döşenebilir 512 × 512 renk, normal ve pürüzlülük PNG'lerini 6831
tohumundan üretir. 1,6 m karoda bütün yapraklar yaklaşık 3,6–10 cm
boyunda. Kıvrılan kenarlar, damarlar, yırtık parçalar ve ince dallar
humusun üzerinde yer alır. Yedi düzensiz birikimde yapraklar alttan
üste çizilir. Renk, kabartma ve pürüzlülük aynı görünür yüzeyi izler.
Aday üretimi iki koşuda aynı baytları verdi. Doku kenarındaki texel
farkları, üç haritada da iç komşulukla aynı büyüklükteydi. Varsayılan
üretim mevcut paket PNG'leriyle bayt düzeyinde eşleşti.

[WebGPU karşılaştırmasında](../research/forest-floor/comparison-leaf-litter.webp)
mevcut karo, yeni karo ve sabit 0,93 pürüzlülük, ardından yeni karo ve
pürüzlülük haritası yer alıyor. `World_3` (37687) kopyasında mevcut
kenar, iç ve geniş pozların yanında iki zemin ayrıntısı çekildi.
Kamera, ışık ve pozlama her sırada eşleşti. Çekim koşulları başlıklı
Chrome, WebGPU NVIDIA Ampere, High, 1200 × 800, yaz ve kuru zemin.
Yakın poz yerden 46 cm yüksekte, kamera
`[503.2, 1.2482621869444839, 303.25]`, hedef
`[502.15, 0.8193700772523861, 303.7]`. Çekim kopyasında rüzgâr sıfırdı.

Pürüzlülük ortalaması yaprak ağırlıklı texellerde 0,81, humusta 0,95.
WebGPU'da orman katmanının albedo dizisi alfasında 184–251 aralığı
doğrulandı. Sabit değerle harita arasındaki ortalama mutlak parlaklık
farkı yakın zemin kırpımında 0,53/255, orman içi kırpımında 0,55/255.
Yakındaki yaprak kenarları ve yığınlar daha belirgin. Birkaç metre ötede
birikimler seçiliyor, en koyu gölgede ayrım zayıflıyor. Arazideki tek veri
farkı orman katmanının materyal atamasıydı. Aday
`.forge-cache/forest-floor/litter-detail-world` kopyasında duruyor.
Doğrudan üretim, doku kenarı, TypeScript ve WebGPU kontrolleri tamam.
GPU kare süresi ölçülmedi. Görsel kabul açık.

#### 9.9.6 Beşinci oturum · Yüzey kökleri, yosun ve eğrelti

**26 Kasım 2026.** Kabul edilen yüzey ceplerini kullanan `World_3` (37687)
kopyasında `Broadleaf_1` prototipinin dokuz mevcut gövdesine asimetrik yüzey kökleri
eklendi. Gövde başına 4–6 kolun tabanı ve uçları, arazi yüksekliği sorgusuyla
biçimlendi. Uç örnekleri yaklaşık 3–4 cm toprağın altında. Kök aralarında
katlı kuru yapraklar var. Beş mevcut taşın görünen yüzüne kesintili yosun
oturtuldu. Taş kenarlarına kuru yapraklar ve toplam on küçük eğrelti eklendi.
Üretim dünya tohumu ve örneğin konumuyla tekrarlandı. Kopyadaki 344 mevcut
içerik dosyası bayt düzeyinde eşleşti. Adayın ekleri yeni modeller, foliage
türleri ve beş boyalı foliage hücresinde. Geometri üreticisi
[`forestSurfaceRoots.ts`](../../tools/procgen/forestSurfaceRoots.ts) ve deneme
dünyası `.forge-cache/forest-floor/root-details-world` altında.

[WebGPU karşılaştırması](../research/forest-floor/comparison-surface-roots.webp)
1,9° düz zemin, 19,6° eğim, taş kenarı ve yürüyüş yüksekliğinde iki orman içi
pozu içeriyor. Pencereli Chrome, NVIDIA Ampere WebGPU, High, 1200 × 800,
yaz ve kuru zemin kullanıldı. Rüzgâr sıfırdı. Görüş açısı 44°, pozlama 0,20.
Her çiftin kamera, ışık ve pozlama değerleri eşleşti.

| Poz | Kamera (x, y, z) | Bakış hedefi (x, y, z) |
|---|---|---|
| Düz kök | `[501.39616, 1.84400, 299.26712]` | `[498.87616, 1.13006, 297.63812]` |
| Eğimli kök | `[409.05939, -2.57840, 442.23267]` | `[409.50186, -2.34876, 445.35144]` |
| Taş kenarı | `[509.91085, 1.49413, 296.07241]` | `[508.71085, 1.12137, 295.37241]` |
| Yürüyüş yüksekliği, köke 7 m | `[504.75616, 2.39701, 301.43912]` | `[498.87616, 1.13006, 297.63812]` |
| Orman içi | `[504, 2.25, 303]` | `[498, 0.96, 305.2]` |

Yürüyüş rotası XZ `[522.5, 303.2]`–`[512.9, 303.9]`, göz yüksekliği 1,60 m
ve uzunluğu 9,63 m. İki önce ve iki aday turunda, 75 ısınma karesinden sonra
60 Hz simülasyon adımıyla tur başına 361 GPU zaman damgası örneği alındı.

| Koşul | GPU p50 (ms), tur 1 / 2 | GPU p95 (ms), tur 1 / 2 | GPU-driven batch | GPU-driven draw |
|---|---:|---:|---:|---:|
| Önce | 9,18 / 6,62 | 13,76 / 10,42 | 43 | 244 |
| Aday | 6,23 / 6,23 | 9,83 / 10,62 | 57 | 326 |

Rota boyunca 14 ek batch vardı. Bunlar konuma özel dokuz kök ve beş taş
modelinden geliyor. Eğreltiler mevcut batch'leri kullanıyor. GPU süreleri
koşular arasında dalgalandı. Ölçüm tek cihaz, tek kalite ve bu kısa rotayla sınırlı.

Düz kökün silueti 7 ve 12 m çekimlerinde seçiliyor. Kuru yaprak geometrisi
en çok yakın planda okunuyor. WebGPU ana kamera sayacı düz kökü 12 m'ye
kadar yüksek ayrıntıda (960 üçgen), 20 ve 24 m'de düşük ayrıntıda (256 üçgen)
ve 28 m'de kapsam dışında gösterdi. Taşın yosunlu yüzeyi ve yaprak kenarı
aynı modelde. Sayaç bu modeli 9 m'de çizime aldı, 12 m'de kapsam dışına çıkardı.
Uzaklıklar yatay kamera mesafesi, sayaç çizime alınan örneği ölçer.

Odaklı TypeScript, geometri geçerliliği, aynı tohumda tekrarlanabilirlik ve
WebGPU kontrolleri tamamlandı. Birleşim çizgisi bazı gövdelerde yakın planda
seçiliyor. Ölçümler tek prototip, tek tohum ve deneme yerleşimiyle sınırlı.
Görsel kabul açık.

## 10. Adımlar

Her adım dikey bir dilimdir ve kendi kapısıyla biter. Görsel beğeni kullanıcı
kabulüdür; kapılar işlevsel ve ölçülebilirdir.

**Sıra (2026-11-14):** PG0–PG3'ün küçük üretim / CLI ve ortak tepki dilimi
5c ile birlikte ilerler; 5c kapanışı bunların bitki kabulünü içerir. Tam
panel ve World Builder bağlantısı PG5'te 5d ile gelir. PG4–PG7 genişlemeleri
5c'nin iki ağaçlık kabulünü bekletmez. Bütün kutular hâlâ açıktır.

- [x] **PG0 Hazırlık.** §2'deki ana plan çıktıları ve dört sözleşme kodla
      doğrulanır; aile, tekil bileşen / foliage, WES zaman ve geçiş
      sözleşmeleri şemalanır; PK6
      kapanır. Ana plan bağlantısı bu sürümde vardır; uygulama durumu doğrulanır.
      **2026-11-18 (`c0937cd`):** PK6 kapandı (starter paketi). Şemalar:
      `features/procgen` `forge.rockRecipe@1`; `features/plant` `forge.plantFamily@1`
      (prototip başına LOD zinciri, impostor yuvası, odun / yaprak materyali, çarpışma,
      tepki profili: yaprak döken / herdem yeşil, mevsim başına yaprak oranı + renk,
      rüzgâr esnekliği, kar, ıslaklık) ve `forge.plant@1` (uzamsal: aile, prototip,
      örnek tohumu, gölge); `forge.foliageType`'a `family` + `prototype`. Sözleşmeler:
      (1) foliage türü GUID + LOD zinciri + impostor yuvası: var, batch LOD çiziyor;
      (2) köşe niteliğinden rüzgâr: şemada var, 5c batch'lerinde rüzgâr yok, PG2'de
      yazılır; (3) World Builder model kaynağı: PG5 / 5d; (4) aileyi tekil aktör ve
      foliage tüketmesi: şema hazır, çözümleyici ve çizim PG2. Kutu PG2 çözümleyicisiyle kapanır.
      **Kapandı (PG2, `b9608c8` / `3a8dd57`):** sözleşme 2 rüzgâr batch'lerde yazıldı, sözleşme 4 çözümleyici ve çizimle.
- [x] **PG1 Kaya, uçtan uca ince dilim.** Saf çekirdek (rastgele akışlar,
      mesh yazımı, LOD örneklemesi, collider, istatistik) + kaya üreticisi +
      tarif şeması + taş yüzeyi materyal tarifi (§6.6) + triplanar materyal +
      küçük CLI üretimi. Tam panel ve `generated` World Builder bağlantısı
      PG5'tedir. *Kapı:* hazır model olmadan üretilen kaya asset'i açılıyor;
      `verify:assets` yeşil; aynı tarif
      iki koşuda aynı sayıları veriyor; gerçek WebGPU'da tek kontrol çekimi;
      aynı kaya materyali gölgelendiricide (A) ve karma (C) yolla R1'de
      ölçüldü, karma yolun gölgelendirici payı sayıyla ayarlandı.
      **2026-11-18 (`eea639f`).** Kullanıcı kararları: collider model meta'sında
      (`forge.model` `collision.convex`, düz XYZ noktaları; Faz 6 grubu genişletir);
      doku tarifi `forge.surfaceTextureRecipe@1` (gürültü yığını: gradient / ridged /
      cellular katmanları, renk rampası, normal, ORM; CPU'da döşenebilir) ve
      `forge.material`'e `projection` (uv / triplanar, model uzayında, normal haritası
      izdüşüm başına türev çerçevesiyle) + `variation` (düşük frekanslı dünya gürültüsüyle
      renk kayması, köşe rengi R'den oyuk kiri, dünya normalinden üst yüz örtüsü; piksel
      başına bir gürültü örneği); A yolu yalnız ölçüm (dev `__forgeDev.proceduralStone`).
      Meta'ya isteğe bağlı `generated` kaydı (tarif, üretici, sürüm, SHA-256); köken
      `generated`, lisans `LicenseRef-forge-project`. CLI `npm run forge -- generate
      (--project | --pack) --recipe <dosya> [--force] [--dry-run] [--json]`
      (`tools/procgen/`): tarifin yanındaki klasöre tohum başına LOD GLB'leri (LOD başına
      tek GLB, UV'siz, köşe rengi oyukluk / üst yüz / yükseklik), LOD0 meta'sında collider,
      prototip başına foliage türü (5c LOD zinciri); GUID'ler tarif GUID'i + rolden, ikinci
      koşu aynı baytlar (`--force` ile 21 / 21 unchanged), tarifin bırakılan dosyaları
      silinir, başkasının dosyası korunur. Starter paketi `procgen/rocks/`: `Stone` doku
      tarifi (512 px, pişirme ~0,4 s), `M_Rock` (triplanar 1,5 m, `variation` açık,
      oyuk 0,5), `RockAngular` / `RockRounded` (3'er tohum, LOD 1.280 / 320 / 80 üçgen,
      32 noktalı kabuk; §8 büyük kaya bütçesinin içinde). `verify:assets` 0 hata.
      **A / C ölçümü** (`npm run measure:rock-material`, R1 NVIDIA Ampere, L03, 14 × 14 kaya,
      1080p `high`, 60 Hz adımlı, 120 kare ort. GPU ms; yakın = ekranı dolduran kayalar):

      | Kip | Yakın | Tarla |
      |---|---:|---:|
      | Dokusuz (M_White) | 1,48 | 0,76 |
      | C: pişirilmiş triplanar + `variation` | 1,55 | 1,11 |
      | C, `variation` kapalı | 1,44 | 0,91 |
      | A: gürültü yığını piksel başına | 2,85 | 1,93 |

      A, C'nin yaklaşık iki katı (ekran dolduğunda +1,3 ms); C'nin dokuları dokusuza göre
      ölçüm gürültüsü içinde, `variation` ~0,1–0,2 ms. Karar: gölgelendirici payı tek
      gürültü örneğinde kalır, ayrıntı pişirilmiş karoda. Kontrol çekimi
      `render-refs/candidates/pg1-rocks.png` (gerçek WebGPU, hata yok); renk / ışık kabulü
      kullanıcıda. Bilerek yok: tarif paneli (PG5), World Builder `generated` kaynağı (PG5),
      collider'ı kuran fizik (Faz 6), KTX2 (PG3).
- [x] **PG2 WES'e tepki veren iki ağaçlık dilim.** Bir yaprak döken ve bir
      iğne yapraklı küçük örnek; ortak iskelet, ayrılabilir odun / yaprak,
      kararlı dökülme eşikleri, kabuk / yaprak materyali, rüzgâr ağırlıkları
      ve kar maskeleri; aile asset'i, bitki bileşeni ve ortak tepki sistemi.
      *Kapı:* CLI üretimi bütçe içinde sonlanıyor; kaydet → yeniden aç aynı
      çıktı; tekil aktör ve foliage aynı WES durumunda aynı tepkiyi veriyor;
      rüzgâr, renk / yapraklılık geçişi ve kar / ıslaklık 5c yolunda çalışıyor.
      **2026-11-18 (`fa11eb2` `b9608c8` `bc05121` `3a8dd57`; kullanıcı: PG2–PG3 5c içinde).**
      *Rüzgâr:* GPU güdümlü batch'e örnek başına shading kancası (`render/gpu/instanceShading.ts`:
      köken, ölçek, 24 bitlik tohum, şablon konumu; dünya ofseti her yolun uzayına, gölge görünümleri
      dahil); `render/foliage/foliageWind.ts`: `height` Forge'un formülü, `vertex` `_WIND` ağırlıkları
      (gövde bükülmesi, dal salınımı, faz, yaprak titremesi); WES / level rüzgârı ve simülasyon zamanı
      ortak uniform. *Tepki:* `engine/plant/plantResponse.ts` (aile profili + WES → gösterilen yaprak oranı,
      ton, odun / yaprak karı, ıslaklık, esneklik; herdem yeşil yaprağını korur); WES'e
      `transitionSeason({season, seconds})` (simülasyon saniyesi, `seasonFrom` / `seasonProgress` canlı ve
      kayıt durumunda, geri yüklemede sürer). *Üretici:* `engine/procgen/tree/` (Codex): sap başına akış,
      phyllotaxis, taç biçimi, iğne yapraklıda katlı dallar, paralel taşıma tüpleri, çapraz yaprak
      kartları; `_LEAF` dökülme eşiği küme kimliğinden, LOD'lar arasında aynı. Yaprak / iğne kart dokusu
      `engine/procgen/texture/leafTexture.ts`. `forge.treeRecipe@1` (`features/plant`, ailenin tepki
      alanını paylaşır); aileye `sway` (tekil ve foliage aynı salınım). `forge generate`: yaprak dokusu,
      LOD başına GLB (odun / yaprak iki slot, `_WIND` / `_LEAF`), `forge.plantFamily`, prototip başına
      köşe ağırlıklı foliage türü; ikinci koşu aynı baytlar. Starter `procgen/trees/`: `Bark` dokusu,
      `M_Bark` / `M_Leaf` / `M_Needle`, `Broadleaf` (yaprak döken; LOD 17,5 k / 4,7 k / 0,8 k üçgen) ve
      `Conifer` (herdem yeşil; 14,1 k / 4,4 k / 0,8 k), 3'er tohum, Node'da ~60 ms / prototip.
      *Çizim:* `render/plant/plantDrawing.ts` dünya başına tek rüzgâr ve aile başına görünüm uniform'u
      (kare başına bir kez çözülür); kanca yaprak kümesini kararlı eşik + örnek kaydırmasıyla döker
      (gölgede de), mevsim tonu yaprak başına yayılımla, yukarı bakan odun / yaprağa kar (alt yüz koyu
      kalır), ıslaklık koyulaştırır ve pürüzü azaltır, rüzgâr esneklikle çarpılır. Tekil `forge.plant`
      ailenin prototipini foliage yolunda tek örnek olarak çizer (`features/plant/render.ts`); `family`'li
      foliage türü aynı prototipi aynı kancayla çizer: PV-WES-02 kurgu gereği aynı (yan yana sahne
      PG3 / adım 11'de). Mevsim yalnız uniform değiştirir, program yeniden derlenmez.
      *Smoke:* `foliageWind.smoke.ts` (sakin 0,000, rüzgârlı 0,10 / 0,13), `plants.smoke.ts` (çizim, kış
      yaprak döken çıplak, zamanlı geçişle yaz geri, kar; iki arka uç); halka smoke'u ve editör foliage
      testleri geçti. Adaylar `render-refs/candidates/pg2-plants-{summer,winter,snow}.png`; biçim, yoğunluk
      (iğne yapraklının seyrek iğneleri dahil), renk ve ışık kabulü kullanıcıda.
- [x] **PG3 LOD, kart ve impostor.** Dal ucu kartı kitaplığı, CPU bake, KTX2,
      impostor, foliage türü çıktısı. *Kapı:* 360° ve yukarıdan bakışta siluet
      tutarlı; gölge ve alfa LOD'ler arasında uyumlu; §8 bütçeleri ölçüldü ve
      güncellendi; PK7 ölçümle kapandı; çıplak kış ve ara mevsim silueti uzak
      temsilde / gölgede tutarlı; G6 üretilmiş ağaçlı sahnede sınırın içinde;
      aşağıdaki PV-WES kabul matrisi sağlandı.
      **2026-11-19 (`3253c3a` `a9d75fc` `0ffdcf5` `e603b87` `bd09bdf` `078dcfd`; teknik kapı geçti, görsel
      kabul kullanıcıda).** CPU rasterleyici, dal ucu kartları, impostor atlasları (`3253c3a`), batch'lerin son
      LOD'u impostor (`a9d75fc`), uzak billboard'lar PG3 biçiminde (`0ffdcf5`). *KTX2 (kullanıcı kararı
      2026-11-19: `forge generate` doğrudan KTX2 yazar, PNG yok):* UASTC LDR 4 × 4 + Zstd, kodlayıcının mip
      zinciri (`tools/procgen/ktx2.ts`, devDependency `ktx2-encoder` 0.6.0, sabit basis WebAssembly'si; aynı
      girdi aynı baytlar); yaprak atlası materyalin V çevirmesine göre saklanır (sıkıştırılmış doku gölgelendiricide
      çevrilmez), impostor atlası olduğu gibi. Bağımsız `.ktx2` doku asset'i ilk kez yüklendi: ortak
      `KTX2Loader`'a istek başlığı eksikti (dev server 403). Impostor yuvasına `color` (yaprak katmanının
      ortalaması; sıkıştırılmış atlas çalışma anında okunamadığı için üretilmiş ailenin uzak tonu kayboluyordu).
      Ağaç üreticisi v3. *Ölçümler:* §8 tablosu; `npm run measure:forest` (kayıt
      `render-refs/runs/2026-11-19T10-24-02-112Z-forest.json`); `foliageFar.smoke.ts` üretilmiş aile kipi
      (Broadleaf, iki arka uç: billboard'ların %99,1 / %98,6'sı modellerin üstünde, ton %8,1 / %6,7, kışın
      billboard katkısı %0,88 → %0,23); `impostors.smoke.ts` KTX2'yle iki arka uçta (dört yan, 30° / 60° /
      tepeden, kış ve sonbahar; IoU 0,61–0,92), `plants.smoke.ts` iki arka uçta. Adaylar:
      `render-refs/candidates/pg3-wes03-*.png`, `derekavak-p2-far-*-family*.png`, `pk7-*.png`.
      *Bulunan hata (`6a8a612`):* statik batch yeniden kurulunca detay / gölge fade'inin örnek attribute'u
      dispose edilmiyordu (hücre döngüsü başına bir GPU buffer'ı GC'ye kalıyordu; foliage'sız da); WebGL2
      ikizinde de aynısı. **Görsel kabul:** kullanıcı, 2026-11-19.

**PK7 ölçümü (2026-11-19; spike kodu commit'lenmedi, kullanıcı kararı).** Bugünkü odun / yaprak ayrımı
(tek atlas iki katman, yaprak katmanında dökülme eşiği) ile sınırlı mevsim atlası (yaz bileşiği + kış çıplak,
her biri tek katmanlı 1024² × 2 doku, aynı rasterleyiciyle) aynı ormanda, impostor her mesafede zorlanarak,
1080p `high`, 60 Hz adımlı, gerçek WebGPU (NVIDIA Ampere); kayıt
`render-refs/runs/2026-11-19T10-12-12-886Z-pk7-spike.json`, çekimler `candidates/pk7-*.png`.

| | Odun / yaprak ayrımı | Sınırlı mevsim atlası (yaz + kış) |
|---|---|---|
| Bellek / prototip | 5,33 MiB | 5,33 MiB (3 mevsimde 8 MiB) |
| GPU, grup pozu (impostor ekranın ~%20'si) | 3,62–3,82 ms | 3,03–3,80 ms |
| GPU, P2 | 2,65–3,51 ms | 2,68–2,86 ms |
| Doku okuması / piksel | 12 | 6 (geçişte iki atlas: 12) |
| Ara mevsim | sürekli dökülme, örnek başına eşik kayması | yok: atlas değişimi, bütün ağaçlar birlikte |
| Ton / kar | odun ve yaprağa ayrı | tek katman: sonbahar tonu gövdeye de geçer, kar ayrımı yok |

GPU farkı koşular arası gürültünün içinde (±0,3–0,8 ms); bellek eşit. **Sonuç:** odun / yaprak ayrımı kalır;
mevsim atlası yalnız bellek veya GPU'da kazanç olsaydı düşünülürdü, ölçüm kazanç göstermedi (görsel kabul
kullanıcıda).

**PV-WES kanıtları (2026-11-19, iki prosedürel ağaç türü, Derekavak'ın gerçek yerleşimi):**

- **01:** `plantResponse.test.ts` (mevsim karışımı, yaprak döken / herdem yeşil); `measure:forest`'ta her mevsimde
  1.640 örnek, aynı hücreler; görsel kabul kullanıcıda (`pg3-wes03-*`).
- **02:** tekil `forge.plant` ve aileli foliage aynı batch yolu ve kanca (PG2); `measure:forest` LOD çekimlerinde
  iki aileden birer tekil bitki ormanın önünde, her mevsimde yan yana (`pg3-wes03-*`).
- **03:** LOD 0 / 1 / 2 / impostor zorlanarak dört mevsim durumu, ormanın görüntü payı kış / yaz 0,63 / 0,65 /
  0,66 / 0,85 (impostor yakına zorlandığında odunu kalın gösterir, 128 px kare); kar her LOD'da artırır; uzak
  billboard'lar kışın çıplak (`foliageFar` aile kipi); gölge geçidi aynı maskeyle (`impostorMaterial`'ın
  `maskShadowNode`'u). HLOD foliage kullanmıyor.
- **04:** `plantResponse.test.ts` (karsız kış, ilkbaharda kalan kar), `surface.test.ts`.
- **05:** `measure:forest` kışta beş hücre döngüsü (6 km öteye, bütün halka boşalır, geri): halka 1.380 hücre /
  1.640 örnek, three 129 geometri / 60 doku, GPU 438,9 MiB, canlı buffer 701–714 (birikim yok), mevsim hemen
  kış (geçiş oynatılmaz), görüntü farkı %0,20–0,26 (rüzgâr).
- **06 / 07:** `surface.test.ts` (saat atlaması birikim değil, 30 / 60 / 144 Hz eşdeğer, pause, önizleme
  kayda sızmaz, WES yokluğunda taban), `worldEnvironmentTransition.test.ts`.
- **08:** `measure:forest`: P2 üretilmiş orman yaz / kış / kar gönderim 1,12–1,17 / p95 3,3–3,4 ms, ana iş
  parçacığı 1,60–1,67 / p95 3,9 ms, GPU 2,62–2,69 ms; 15 m/s yürüyüş 1,82 / 3,09 ms (en uzun 9,3 ms). Dört
  zamanlı mevsim geçişi (2 s, kare kare): **pipeline +0, shader modülü +0**, en uzun kare 9,0 ms, GPU en çok
  9,6 ms; GPU belleği 454,3 MiB sabit (tepe = canlı), JS yığını tepe ≈ 56 MiB. Ağaç başına script / materyal yok
  (tür başına batch).
- [x] **PG4 Çalı ve ot.** Çok saplı çalı ön ayarı; şerit / demet üreticisi.
      *Kapı:* çalı ağaçtan ayrı topolojiyle üretiliyor; ot yakın–uzak geçişi
      seyrelme ve fade ile çalışıyor.
      **Çalı dilimi** uygulandı. Editör kaydı, üç seed'in bütçeleri, doğal LOD
      geçişi ve boyalı foliage fade'i gerçek WebGPU'da doğrulandı (§9.5).
      Kullanıcı görsel onayı verdi (2026-11-22).
      **Ot dilimi** uygulandı. Editör kaydı, bütçeler, kararlı tekrar üretim
      ve doğal WebGPU geçişinde seyrelme + fade doğrulandı (§9.6).
      Kullanıcı ot için görsel onay verdi (2026-11-22); PG4 kapandı.
- [x] **PG5 World Builder'ın tam bağlantısı.** Zemin örtüsünün bitkileri
      tariflere bağlanır; bağlı tarifler; aile onay sayfası; başlangıç ön ayar
      paketi; tam tarif paneli ve `generated` kaynağı (5d). *Kapı:* üretilen
      dünyada doğa varlıkları için hazır model yok; kaya rolleri doluyor,
      tekil bitki / foliage aileyi kullanıyor; panel düzenle → üret → kaydet →
      yeniden aç çalışıyor; onay sayfası Content Browser'da görünüyor.
      **2026-11-25:** kod ve teknik kapı tamam (§9.7). Kullanıcı görsel kabulü PG5b
      adım 6 ile (2026-11-26). Bağlı tariflerin `linked` alanı ilk üreticisiyle PG6'da.
- [x] **PG5b Taç kalitesi (§9.8; kullanıcı, 2026-11-25).** *Kapı:* LAI alt sınırı
      testte; Broadleaf / Conifer World_1'de ve tekil pozda kullanıcı kabulü;
      `measure:forest` G6'yı tutuyor; PV-WES-01–03 (kış, kar, LOD eşitliği) yeniden.
  - [x] **1 Taç.** Sürüm 6 iskeletleri, sprey yerleşimi, LOD zinciri, starter tarifleri.
  - [x] **2 Dal dokusu.** Sprey atlası (renk + alfa + normal), kabuk (dikey oluk).
  - [x] **3 Yaprak ışığı.** Taç normali, geçirgenlik, iç kararma; impostor aynı kuralda.
  - [x] **4 LOD.** Eşikler, alan koruma, LAI / örtü testleri, 40 k LOD0.
  - [x] **5 Türler.** Akçaağaç, huş, meşe, kavak, çam, ladin (Conifer), Hazel; kabuklar; eski iskelet
        sürümleri (1–5) kalktı (`e1891dd`; kabul 2026-11-25).
  - [x] **6 World Builder.** Örtülerde karışık tür, orman yoğunluğu, genç ağaç, orman altı, kenar
        (`8710f0c`; kabul 2026-11-26).
- [ ] **PG3b Impostor görünümü ve verimi (kullanıcı, 2026-11-28; sonra denenecek).** Bugünkü impostor'un
      görünümü zayıf; önce o iyileşir, verim aynı değişiklikle gelir. Çıkış noktası, GTA 6 için paylaşılan
      teknik: atlas bizimkiyle aynı (yarım küre 8 × 8, en yakın 3 görüş harmanı), fark karttadır. Tek kare
      yerine siluete oturan 8 quad kullanılıyor; alfa testine giden alan küçülüyor. Atlasta ayrıca derinlik
      ve specular var.
      *Bilinen zayıflıklar (PG3, PG5b kayıtları):* 128 px karede bulanık; odun kalın ve kesintili; çapraz
      gölge izi; derinlik kanalı yok. §6.4 "normal + derinlik" diyor, ama v6'da mavi kanal taç ışığını
      taşıyor; `impostorMaterial.ts`'teki "b depth" yorumu bayat. Derinlik olmadan 3 görüş harmanı paralaksla
      çift kontur bırakabilir (denetlenecek).
      *Ölçüm (2026-11-28, starter ağaçları, tohum 1, Node'da bake; yer seviyesi uzak bakış: 0–15°, 256 yön,
      harmanlanan 3 görüşün birleşimi, alfa ≥ 8/255).* Ağaç, sphere'i kaplayan karenin yalnız **%14–20**'sini
      kaplıyor. Kalan piksellerde de 12 doku okuması yapılıyor, discard yüzünden erken derinlik testi yok,
      gölge kaskadlarında da aynı kart çiziliyor. Aynı oran atlası da etkiliyor: 128 px'lik karede ağaç
      ~50–60 px'lik bir alana düşüyor.

      | Kart (karenin yüzdesi) | Conifer | Pine | Poplar | Broadleaf | Oak | Birch |
      |---|---:|---:|---:|---:|---:|---:|
      | Kaplanan | 18 | 14 | 15 | 20 | 19 | 17 |
      | Görüş başına sıkı dikdörtgen | 33 | 35 | 23 | 35 | 30 | 34 |
      | Görüş başına 4 bant | 29 | 31 | 23 | 38 | 32 | 29 |
      | Görüş başına 8 bant | 26 | 22 | 21 | 30 | 27 | 25 |
      | Tablosuz tek kart, 8 bant | 31 | 34 | 23 | 39 | 45 | 30 |

      Bu, fragment sayısında ≈ %65–80 azalma demek. 8 bandın sıkı dikdörtgene katkısı az; uzakta 40–80 px'lik
      ağaçta ince bantlar 2 × 2 quad kaybı getirir. Geniş taçta tablosuz kart şişiyor: tepeden bakışta taç
      disk oluyor. Kare süresine etkisi impostor'ların GPU payına bağlı; bu pay henüz ölçülmedi.
  - [ ] **1 Denetim.** Aynı pozda LOD2 ile impostor yan yana: yakın, geçiş eşiği (~250 m) ve uzak; yaz,
        kış ve kar. Baskın zayıflık hangisi? Adaylar çözünürlük, harman hayaleti, ton / ışık farkı, odun.
        `measure:forest`'te impostor payı: doğal eşikte ve impostor zorlanarak, gölge dahil.
  - [ ] **2 Görüş başına sınır tablosu.** Bake, 64 görüşün her biri için bant başına [xmin, xmax] ve dikey
        aralık yazar. Tablo tek doğruluk kaynağı: hem kartı hem kırpmayı belirler. Üretilmiş ağaçta impostor
        yuvasında; içe aktarılan GLB'nin çalışma anı bake'i (`modelImpostor.ts`) pikselleri zaten elinde
        tuttuğu için tabloyu kendisi çıkarır.
  - [ ] **3 Sıkı kart.** 4 bant ya da sıkı dikdörtgen (denetime göre). Vertex shader, harmanlanan 3 görüşün
        sınırlarının maksimumunu alır. Görüş koordinatları kart üzerinde doğrusal olduğu için köşe sayısı
        örneklemeyi değiştirmez. Zemine eğilmiş örnekler için küçük pay: kart dünya-up'ıyla, görüşler yerel
        eksenle kuruluyor. Gölge geçidi aynı kartı kullanır.
  - [ ] **4 Kare kırpma.** Atlas kareleri tabloya göre kırpılarak bake edilir; aynı 128 px'te ≈ 2× doğrusal
        çözünürlük. Bellek bütçesi (§8) değişmez. Üretici sürümü artar, starter ağaçları yeniden üretilir.
  - [ ] **5 Derinlik (denetime göre).** Paralaks düzeltmeli harman ve / veya pixel depth offset (terrain
        kesişimi). Kanalın yeri karar ister: mavi kanal taç ışığında. Specular, denetim gerektirirse burada.
      *Kapı:* LOD2 ↔ impostor yan yana görsel kabul kullanıcıda; impostor fragment sayısı ve `measure:forest`
      önce / sonra (G6 tutuyor, impostor ve gölge payı); PV-WES-03 (dökülme, kış, kar) impostor'da yeniden;
      `impostors.smoke.ts` siluet IoU'su düşmüyor; §8 impostor belleği aşılmıyor.
- [ ] **PG6 Ölü odun, döküntü, iğne yapraklı.** *Kapı:* kütük ve döküntü
      bağlı ağaç tarifinden türüyor; PG2'nin iğne yapraklı örneği daha geniş
      ön ayarlarla kart bütçesinde. İsteğe bağlı yakın çevre yaprak efekti
      eklenirse parçacık bütçesi ölçülür ve mevsim atlaması geçmiş efekti üretmez.
- [ ] **PG7 Genişleme.** Frond / rozet, mantar ve sonrası. Her biri bir
      oyun isteyince ayrı adım olarak açılır.

**PV-WES kabul matrisi (uygulama kapıları; bugün test sonucu değildir):**

| ID | Koşul | Kanıt |
|---|---|---|
| PV-WES-01 | Yaz → sonbahar → kış → ilkbahar: yapraklılık / renk değişir; aktör GUID'i, foliage konum / dönüş / ölçek / seed ve örnek sayısı korunur | Saf tepki ve yerleşim karşılaştırması + gerçek WebGPU görsel kabul |
| PV-WES-02 | Aynı aile / seed / WES durumu tekil aktör ve foliage'da eşdeğer görünür | Yan yana sahne ve ortak çözümleyici kontrolü |
| PV-WES-03 | Yaprak kaybı, kar ve rüzgâr LOD / kart / impostor, HLOD kullanılıyorsa proxy ve gölgede tutarlıdır | Sabit kamera pozları, yakın–uzak ve çıplak kış çekimleri |
| PV-WES-04 | Karsız kış ve ilkbaharda kalan kar mümkün; kar maskesi dal altını uygunsuz beyazlatmaz | Bağımsız mevsim / örtü senaryoları |
| PV-WES-05 | Hücre yükle / boşalt sonrası güncel mevsim görünür; geçmiş geçiş / efekt oynatılmaz, kaynaklar sızmaz | Hücre döngüsü ve bellek / GPU kaynak sayımı |
| PV-WES-06 | Saat atlaması birikim süresi değildir; sabit saatte simülasyon ilerler, pause durdurur; aynı toplam sürede farklı kare adımları eşdeğer örtü verir | WES zaman / örtü deterministik kontrolleri |
| PV-WES-07 | Önizleme kayda sızmaz; WES terrain paint / yükseklik / fizik materyalini değiştirmez; WES yokluğu taban görünümü korur | Round-trip / byte karşılaştırması ve editör / Play / üretim kontrolü |
| PV-WES-08 | Üretilmiş orman G6'yı sağlar; shader program sayısı çevre geçişiyle büyümez, ağaç başına script / materyal oluşmaz | R1 gerçek WebGPU: gönderim ≤ 3 ms, ana iş parçacığı ≤ 6 ms; GPU süresi, geçişin en uzun karesi ve tepe bellek raporu |

**İş bölümü.** Saf ve iyi tanımlı parçalar (rastgele akış, tüp mesh, kaya
biçimi, rasterleyici, kart kümeleme) imza + kabul ölçütüyle Codex'e
verilebilir; tasarım, TSL materyalleri, editör paneli ve inceleme Claude'da.

---

## 11. Kararlar

**Kapalı:**

| Konu | Karar |
|---|---|
| Doğa varlıklarının kaynağı | Prosedürel üretim, "modeli kullanıcı getirir" kuralının yerini alır (kullanıcı, 2026-11-11) |
| İlk zamanlama | Yalnız plan; motor ve World Builder sonrası (kullanıcı, 2026-11-11); güncel sıra aşağıdaki 2026-11-14 kararıdır |
| WES ile birleşme | Bitki ailesi + ortak çevre tepkisi; WES kabul ağaçları prosedürel üretilir, GLB geometri taşıyabilir (kullanıcı, 2026-11-14) |
| Güncel sıra | PG0–PG3 küçük dilimi 5c ile, tam araçlar PG5 / 5d ile; önceki bütün Faz 5'i bekleme sırasının yerini alır; uygulama başlamadı (kullanıcı, 2026-11-14) |
| Yerleştirme ve davranış | Tekil bitki bileşenli aktör ile kompakt foliage aynı aile / tepki sistemini kullanır; ağaç başına script yok (kullanıcı, 2026-11-14) |
| Canlı geometri ve fizik | Geometri önceden üretilir; mevsimde yeniden üretim yok; ilk kapsam görsel yapraklılık / kar / ıslaklık / rüzgâr, biyolojik büyüme ve kar yükü fiziği ayrı (kullanıcı, 2026-11-14) |
| Zaman ve gün ışığı | Olay bazlı saat korunur; birikim süresi ve mevsim geçişi ayrı; gün–gece mevcut aydınlatmadan gelir (kullanıcı, 2026-11-14) |
| Yerleşimin yeniden üretimi | Yok (kullanıcı, 2026-11-07; plan 2b) |
| Üçüncü taraf hazır kitaplık | Kenney / Quaternius yok (kullanıcı, 2026-11-11) |
| Tarifin türü (eski PK1) | Genel veri editörünün (A13) şemalı veri asset'i; onun formuyla düzenlenir (kullanıcı, 2026-11-11) |
| Çıktının saklanışı (eski PK2) | Kalıcı dosya: projeye yazılır, commit'lenir; önbellek değil (kullanıcı, 2026-11-11) |
| Bake yolu (eski PK3) | CPU rasterleyici; Node'da ve worker'da çalışır (kullanıcı, 2026-11-11; §6.7) |
| Dokuların kaynağı | Dokular da prosedürel üretilir; genel materyal tarifi, ileride binalar da kullanır (kullanıcı, 2026-11-11; §6.6) |
| Doku yolu (eski PK4) | Karma (C): pişirilmiş karo + gölgelendiricide büyük ölçekli değişim (kullanıcı, 2026-11-11; §6.6) |
| Prosedürel doku yetmezse | Codex'e ürettirilen doku ve Poly Haven (CC0) dokuları (kullanıcı, 2026-11-11; §6.6) |
| İnsan yapımı prop'lar (eski PK5) | Bu işe dahil değil (kullanıcı, 2026-11-11) |
| Başlangıç ön ayarları (eski PK6) | `content/packs/starter/`: birkaç nötr ön ayar; bölgeye özgü türler oyun projesinde (kullanıcı, 2026-11-18) |
| Tarif asset türü | Üretici başına bir şemalı tür (`forge.rockRecipe`, `forge.treeRecipe`, …); ortak alanlar aynı adlarla (kullanıcı, 2026-11-18) |
| Bitki LOD çıktısı | LOD başına tek GLB; odun ve yaprak iki primitive / materyal slotu; yaprak küme kimliği ve dökülme eşiği köşe niteliğinde (kullanıcı, 2026-11-18) |
| Mevsimsel uzak temsil (eski PK7) | Odun / yaprak ayrımı: impostor atlasında iki katman, yaprak katmanında dökülme eşiği; ek mevsim atlası yok. Sınırlı mevsim atlası ölçümde bellek ve GPU'da kazanç göstermedi, ara mevsimi ve odun / yaprak tonunu kaybetti (ölçüm 2026-11-19, §10 PG3) |
| PG5 · aile onayı | Projede ayrı `*.familysheet.json`: tarif, durum, not, onaylanan çıktının özeti; çıktı değişirse "Changed" (kullanıcı, 2026-11-25) |
| PG5 · onaysız aile | Bekleyen / değişen kullanılır ve raporlanır; reddedilen kurulmaz; sayfası olmayan projede onay aranmaz (kullanıcı, 2026-11-25) |
| PG5 · `generated` başvurusu | Tarif GUID'i (brief satırı ve örtü bitkisi); prototipler yoğunluğu paylaşır (kullanıcı, 2026-11-25) |
| PG5 · eksik çıktı | Proje tarifi kurulumda üretilir; var olan çıktıya dokunulmaz; paket tarifi "no output" raporlanır (kullanıcı, 2026-11-25) |
| PG5 · tekil bitki | Brief'in landmark / prop satırları ve rastgele dünyada yerleşim başına bir `vegetation.tree` (kullanıcı, 2026-11-25) |
| PG5 · bağlı tarifler | Editörde Related bölümü; `linked` alanı PG6'da (kullanıcı, 2026-11-25) |
| PG5 · starter çıktıları | Hazel ve MeadowGrass; Oak / Poplar C aşamasının kabulünü bekler (kullanıcı, 2026-11-25) |
| PG5b · yeni üretici | Sürüm 6 starter Broadleaf / Conifer'in yerine geçer; GUID'ler aynı (kullanıcı, 2026-11-25) |
| PG5b · LOD0 tavanı | 40.000 üçgen, yalnız ilk 30–40 m; LOD1 / LOD2 tavanı aynı (kullanıcı, 2026-11-25) |
| PG5b · paket boyutu | LOD GLB'leri meshopt'lu; yeni türler 2 prototip, Broadleaf / Conifer / Hazel 3 (kullanıcı, 2026-11-25) |
| PG5b · eski üretici sürümleri | 1–5 tarifleri okunurken taç üreticisine göçer (`forge.treeRecipe/3`); çıktı yeniden üretilene kadar kalır (kullanıcı, 2026-11-25) |
| PG5b · Hazel ve ladin | Hazel taç üreticisine taşındı; ladin ayrı tarif değil, Conifer (kullanıcı, 2026-11-25) |
| PG5b · yerleşim | Kuralda isteğe bağlı `stand` (ortak altıgen ızgara, tür payı / yaması) ve boya rampası; alan yoksa yerleşim aynı (kullanıcı, 2026-11-25) |
| PG5b · genç ağaç | Aynı tarifte `young` yaş varyantı, prototipler sonda, 64 px impostor (kullanıcı, 2026-11-25) |
| PG5b · uzak orman | Meşcerenin kendi erişimi: seyrelmesiz halka, far billboard, arazi tonu; type'lar aynı (kullanıcı, 2026-11-25) |
| PG5b · örtü tablosu ve bütçe | Tablo tam; önce gölge LOD'u, LOD uzaklığı ve çizim sırası. Kalan aşım (orman içi ≈ 9 ms GPU) ve tablodan sapmalar (ot 1,0–1,8/m², en çok 2 olgun + 1 genç prototip, gençler 200 m) kabul (kullanıcı, 2026-11-26) |
| Üretilmiş dokuların sıkıştırması | `forge generate` ağaç atlaslarını ve yüzey dokusu tariflerini (kabuk, kaya) doğrudan KTX2 (UASTC + Zstd, mip'li) yazar; PNG yok (kullanıcı, 2026-11-19). Çalışma anında bake edilen GLB atlası RGBA8 kalır |

**Açık:** yok (PK7 PG3'te ölçümle kapandı).

---

## 12. Riskler

| Risk | Karşılık |
|---|---|
| Prosedürel görünüm hazır modelin kalitesine ulaşmaz | Kaya ve ağaç ilk iki adımda kullanıcı kabulüne çıkar; dokuda yedek kaynaklar (§6.6), modelde hazır model yolu açık kalır |
| Yaprak kartlarının overdraw'ı GPU'yu doldurur | Kart sayısı ve alanı bütçede; alfa boşluğu az kesim; PG3'te ölçüm |
| Doku belleği prototip sayısıyla çarpılır | Tür başına ortak atlas, KTX2, impostor yalnız büyük ağaçta (§8) |
| CPU rasterleyici kalitesi (alfa kenarı, mip) yetmez | Üst örnekleme; yetmezse GPU bake yedek yol olarak eklenir |
| Gölgelendirici tarafındaki gürültü GPU bütçesini yer | Yalnız düşük frekanslı, az örnekli katkılar; PG1 ölçümü; kalite profiline bağlanabilir |
| 5c sözleşmesi üreticinin çıktısıyla uyuşmaz | PG0'da kodla doğrulama; üretici 5c'ye uyar, tersi değil |
| Kapsam türden türe büyür | Üretici ailesi başına ayrı adım; PG7 yalnız oyun isteyince |
| Üretici değişince eski tarifler başka görünür | `generatorVersion` + çıktının kalıcı dosya olması |
| Kışın uzak orman yaz siluetinde kalır | PV-WES-03, PK7; mevsimsel alfa / odun ayrımı, HLOD varsa aynı kabul |
| Mevsim atlasları belleği veya geçişler kare süresini büyütür | PG3 toplam / tepe bellek ve en uzun kare ölçümü; prototip başına dört atlas varsayılmaz |
| Sabit saatle birikim karışır veya hücre yüklemesinde mevsim sıfırlanır | Tek WES otoritesi, açık simülasyon süresi ve PV-WES-05/06 |

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
| 2026-11-26 | v0.24 | Orman zemini, kenar bitkileri ve gövde temasını kapsayan çalışma açıldı (§9.9). |
| 2026-11-26 | v0.25 | İkinci geçişin ardından yüzey cepleri, taç ışığı, kısa ot adaları, yaprak detayı ve kök çevresi planlandı. İlk oturumun kapsamı ve WebGPU karşılaştırması tanımlandı (§9.9.1–9.9.2). |
| 2026-11-28 | v0.26 | PG3b açıldı (kullanıcı): impostor görünümü ve görüş başına sıkı kart. Ölçüm: ağaç, kartın %14–20'sini kaplıyor; görüş başına sıkı kart ile fragment ≈ %65–80 azalır, kırpılmış karede ≈ 2× çözünürlük. Kod yok |
| 2026-11-26 | v0.23 | PG5b adım 6 (`8710f0c`): meşcere yerleşimi, genç ağaçlar, altı örtü; ölçüm §9.8; kullanıcı görsel kabulü. PG5b ve PG5 kapandı |
| 2026-11-25 | v0.22 | PG5b adım 5 (`e1891dd`): sekiz tarif taç üreticisinde, meshopt, kabuklar, eski sürümler kalktı; kullanıcı görsel kabulü. Adım 6 yeni oturumda |
| 2026-11-25 | v0.21 | PG5b adım 1–4 kullanıcı görsel kabulü; adım 5–6 yeni oturumda |
| 2026-11-25 | v0.20 | PG5b adım 1–4 (`4279194`): LAI 6,2 / 7,5 bütün LOD'larda, `measure:forest` G6'da; adım 5–6 ve görsel kabul açık |
| 2026-11-25 | v0.19 | PG5b açıldı (§9.8): World_1 denetimi (LAI 0,08–0,57), klonda deneme, kullanıcı kararları (yer değiştirme, 40 k LOD0). Kod yok |
| 2026-11-25 | v0.18 | PG5: E (`88913ec` `3ce003b` `e4982df`) ve F (`62d153f` `6ef8a9b` `f838402`); kararlar kullanıcıda (öneriler gibi). §9.7. Görsel kabul bekleniyor |
| 2026-11-22 | v0.17 | MeadowGrass görsel onayı kaydedildi (§9.6). Hazel ve MeadowGrass kabulüyle PG4 kapandı. PG5 açık. |
| 2026-11-11 | v0.1 | Plan yazıldı; prosedürel üretim kararı ve zamanlama (kullanıcı). Eski araştırma raporu ve kapsam envanteri kaldırıldı. Uygulama yok |
| 2026-11-11 | v0.2 | Tarif A13 veri asset'i, çıktı kalıcı dosya (kullanıcı kararları; PK1 ve PK2 kapandı). §6.7'ye CPU / GPU bake hız karşılaştırması eklendi; PK3 açık |
| 2026-11-11 | v0.3 | Bake CPU'da (PK3 kapandı). Dokular da prosedürel (kullanıcı kararı): §6.6 materyal tarifi, dört yol, öneri karma; PK4 yeniden yazıldı, açık |
| 2026-11-11 | v0.4 | Doku yolu karma (C), yedek kaynaklar Codex ve Poly Haven (kullanıcı kararı; PK4 kapandı). Poly Haven lisansı ve API koşulları aynı gün sitesinden doğrulandı |
| 2026-11-11 | v0.5 | İnsan yapımı prop'lar kapsam dışı (kullanıcı kararı; PK5 kapandı); "Basit biçim" üreticisi yalnız mantara indi |
| 2026-11-19 | v0.11 | Kullanıcı görsel kabulü (PG3, PV-WES). Yüzey dokusu tarifi KTX2 (`a1a30c6`); `measure:rock-material` kayaların materyaliyle çizilmesini bekliyor: C yakın / tarla 1,16 / 0,88 ms (dokusuz 1,07 / 0,65), A 4,23 / 4,40 ms; PG1 kaydındaki A / C sayıları kayalar henüz yüklenmemişken alınmış olabilir (kayıt `2026-11-19T10-52-22-240Z-rock-material.json`) |
| 2026-11-19 | v0.10 | PG3 kapandı (`3253c3a` `a9d75fc` `0ffdcf5` `e603b87` `bd09bdf` `078dcfd`): KTX2 atlaslar (kullanıcı kararı), impostor `color`, §8 ölçüldü ve güncellendi, PK7 ölçümle (spike) odun / yaprak ayrımı, PV-WES-01–08 kanıtları `measure:forest` ile; statik batch attribute sızıntısı düzeltildi (`6a8a612`). Görsel kabul kullanıcıda |
| 2026-11-18 | v0.9 | PG0 ve PG2 kapandı (`fa11eb2` `b9608c8` `bc05121` `3a8dd57`): foliage rüzgârı, ortak tepki + WES mevsim geçişi, dallanan üretici + `forge.treeRecipe`, aile `sway`, tekil bitki ve aileli foliage aynı yol |
| 2026-11-18 | v0.8 | PG1 kapandı (`eea639f`): kaya GLB çıktısı + `forge generate`, `forge.surfaceTextureRecipe`, materyal `projection` / `variation`, model `collision`, meta `generated`, starter ön ayarları; A / C ölçüldü (A ~2×) |
| 2026-11-18 | v0.7 | Kullanıcı: PK6 starter paketi, üretici başına tarif türü, LOD başına tek GLB (odun / yaprak iki slot). PG0 şemaları (`c0937cd`); sözleşme denetimi: 5c foliage'ında rüzgâr yok, PG2'de |
| 2026-11-14 | v0.6 | Kullanıcının WES ile birleşik tasarım kararı kaydedildi: bitki ailesi, odun / yaprak ayrımı, tekil aktör / foliage eşitliği ve ortak tepki sistemi; rüzgâr, mevsim geçişi, görsel kar / ıslaklık, olay bazlı saatten ayrı birikim süresi; küçük üretim 5c ile, tam araçlar 5d ile; PK7 ve PV-WES kabul matrisi. Forge WES belgesi tarihsel referans; kod / bağımlılık değişikliği ve kapanan uygulama kutusu yok |
