# Forge WebGPU — Prosedürel Bitki ve Çevre Prop'u Planı

**Sürüm:** v0.10 · 2026-11-19 (PG3 kapandı: KTX2 atlaslar, §8 ölçüldü, PK7 ölçümle odun /
yaprak ayrımı, PV-WES-01–08 kanıtları; görsel kabul kullanıcıda). Önceki: v0.9 (PG0 ve PG2 kapandı: iki
ağaç, ortak WES tepkisi, foliage rüzgârı). v0.8 (PG1 kapandı: kaya GLB çıktısı, `forge generate`,
taş doku tarifi, triplanar + `variation`, A / C ölçümü).

**Önceki sürüm:** v0.6 · 2026-11-14 (WES ile birleşik bitki ailesi, ortak çalışma
zamanı davranışı ve 5c ile birlikte ilerleyen üretim dilimi; kullanıcı kararı).
**Durum:** PG0–PG3 uygulandı (5c ile, 2026-11-17 – 2026-11-19); PG4–PG7 bekliyor.
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
| Kabuk karosu (ortak, 3 × 512² PNG, sıkıştırılmamış) | 4 MiB | ortak | 2,7–4 MiB |
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
- **Açık:** kabuk / kaya karoları (`forge.surfaceTextureRecipe`) hâlâ PNG; KTX2
  bu adımda yalnız ağaç atlaslarında (kullanıcı isteği).

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

---

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
      ikizinde de aynısı.

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
- [ ] **PG4 Çalı ve ot.** Çok saplı çalı ön ayarı; şerit / demet üreticisi.
      *Kapı:* çalı ağaçtan ayrı topolojiyle üretiliyor; ot yakın–uzak geçişi
      seyrelme ve fade ile çalışıyor.
- [ ] **PG5 World Builder'ın tam bağlantısı.** Zemin örtüsünün bitkileri
      tariflere bağlanır; bağlı tarifler; aile onay sayfası; başlangıç ön ayar
      paketi; tam tarif paneli ve `generated` kaynağı (5d). *Kapı:* üretilen
      dünyada doğa varlıkları için hazır model yok; kaya rolleri doluyor,
      tekil bitki / foliage aileyi kullanıyor; panel düzenle → üret → kaydet →
      yeniden aç çalışıyor; onay sayfası Content Browser'da görünüyor.
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
| Üretilmiş atlasların sıkıştırması | `forge generate` doğrudan KTX2 (UASTC + Zstd, mip'li) yazar; PNG yok (kullanıcı, 2026-11-19). Çalışma anında bake edilen GLB atlası RGBA8 kalır |

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
| 2026-11-11 | v0.1 | Plan yazıldı; prosedürel üretim kararı ve zamanlama (kullanıcı). Eski araştırma raporu ve kapsam envanteri kaldırıldı. Uygulama yok |
| 2026-11-11 | v0.2 | Tarif A13 veri asset'i, çıktı kalıcı dosya (kullanıcı kararları; PK1 ve PK2 kapandı). §6.7'ye CPU / GPU bake hız karşılaştırması eklendi; PK3 açık |
| 2026-11-11 | v0.3 | Bake CPU'da (PK3 kapandı). Dokular da prosedürel (kullanıcı kararı): §6.6 materyal tarifi, dört yol, öneri karma; PK4 yeniden yazıldı, açık |
| 2026-11-11 | v0.4 | Doku yolu karma (C), yedek kaynaklar Codex ve Poly Haven (kullanıcı kararı; PK4 kapandı). Poly Haven lisansı ve API koşulları aynı gün sitesinden doğrulandı |
| 2026-11-11 | v0.5 | İnsan yapımı prop'lar kapsam dışı (kullanıcı kararı; PK5 kapandı); "Basit biçim" üreticisi yalnız mantara indi |
| 2026-11-19 | v0.10 | PG3 kapandı (`3253c3a` `a9d75fc` `0ffdcf5` `e603b87` `bd09bdf` `078dcfd`): KTX2 atlaslar (kullanıcı kararı), impostor `color`, §8 ölçüldü ve güncellendi, PK7 ölçümle (spike) odun / yaprak ayrımı, PV-WES-01–08 kanıtları `measure:forest` ile; statik batch attribute sızıntısı düzeltildi (`6a8a612`). Görsel kabul kullanıcıda |
| 2026-11-18 | v0.9 | PG0 ve PG2 kapandı (`fa11eb2` `b9608c8` `bc05121` `3a8dd57`): foliage rüzgârı, ortak tepki + WES mevsim geçişi, dallanan üretici + `forge.treeRecipe`, aile `sway`, tekil bitki ve aileli foliage aynı yol |
| 2026-11-18 | v0.8 | PG1 kapandı (`eea639f`): kaya GLB çıktısı + `forge generate`, `forge.surfaceTextureRecipe`, materyal `projection` / `variation`, model `collision`, meta `generated`, starter ön ayarları; A / C ölçüldü (A ~2×) |
| 2026-11-18 | v0.7 | Kullanıcı: PK6 starter paketi, üretici başına tarif türü, LOD başına tek GLB (odun / yaprak iki slot). PG0 şemaları (`c0937cd`); sözleşme denetimi: 5c foliage'ında rüzgâr yok, PG2'de |
| 2026-11-14 | v0.6 | Kullanıcının WES ile birleşik tasarım kararı kaydedildi: bitki ailesi, odun / yaprak ayrımı, tekil aktör / foliage eşitliği ve ortak tepki sistemi; rüzgâr, mevsim geçişi, görsel kar / ıslaklık, olay bazlı saatten ayrı birikim süresi; küçük üretim 5c ile, tam araçlar 5d ile; PK7 ve PV-WES kabul matrisi. Forge WES belgesi tarihsel referans; kod / bağımlılık değişikliği ve kapanan uygulama kutusu yok |
