# Forge WebGPU — Prosedürel Bina ve Kentsel Çevre Planı

**Sürüm:** v0.2 · 2026-11-12 (v0.1'den fark: üç referansın kodu okundu, Ek A;
ayna ayrı varyant, parça kimliği niteliği, modül hizalama varsayılan; kapsam
envanteri kaldırıldı)
**Durum:** Plan. Uygulama başlamadı; kod, bağımlılık ya da ana plan kutusu
değişmedi. Başlama koşulu §2'de.
**İlgili belgeler:** [yeniden inşa planı](FORGE_WEBGPU_REBUILD_PLAN.md) (faz
sırası), [mimari rapor](FORGE_WEBGPU_ARCHITECTURE.md) (ürün tezi §0.0,
katmanlar §4.2, özellik modülü §4.3, asset modeli A10),
[prosedürel bitki ve çevre prop'u planı](PROCEDURAL_VEGETATION_AND_PROPS_PLAN.md)
(ortak kararlar ve ortak altyapı; aşağıda "bitki planı"). Çelişkide ilk iki
belge geçerlidir; ortak kararlarda bitki planı.
**Yerini aldığı belge:** `docs/planned/` altındaki araştırma ve kapsam
envanteri (2026-11-11, commit'lenmemişti; kaldırıldı). Örnek olarak kullanıldı;
doğrulanan bulguları Ek A'da, 13 kategorisinin bu plandaki karşılığı Ek B'de.

> **Hedef:** World Builder'ın ürettiği yerleşimlerde sıradan bina, çit, duvar
> ve sokak donatısı için hazır model aranmasın. Motor bu varlıkları küçük bir
> tariften kendisi üretir; çıktı sıradan bir asset'tir ve lisansı projeye
> aittir.

---

## 1. Neden ve ne

**Sorun.** World Builder bugün her parsele rol renkli bir küp, her çit
parçasına ve donatıya bir kutu koyar; modeli kullanıcı getirir (Blender, Tripo
ya da hazır model). Bir köyde onlarca bina ve yüzlerce çit parçası vardır; her
dünya için uygun model bulmak zor, lisansı ayrı yük. Kenney / Quaternius bu
projede yok.

**Karar (kullanıcı, 2026-11-11).** Bitki planı insan yapımı prop'ları ve Desen
doku üreticisini bu işe bıraktı. Bu plan **yalnız biçim üretir**: bina, doğrusal
sınır elemanları (duvar, çit, korkuluk), sokak donatısı ve bunların desen
dokuları. Binanın nereye konacağını World Builder seçer.

**Ürün tezine uygunluk (mimari §0.0).**

- *İnsan istemsiz müdahale eder:* kat sayısı, çatı tipi, pencere ritmi, duvar
  malzemesi şemadan üretilen formda kaydırıcı ve seçimdir; sonuç yan yana
  önizlemede görünür.
- *Ajana hazır sistem:* tarif küçük, kanonik bir JSON'dur. Ajan bir evin
  köşelerini değil 30–40 satırlık tarifini yazar.
- *Ayarlar şemalı:* cephe kuralları dahil her şey şema DSL'iyle tanımlanır;
  kural dili ya da graf yoktur.

**Bu planın kapsamadıkları.**

| Kapsam dışı | Neden |
|---|---|
| Yerleşim planlama: sokak deseni, bölge, ada, parsel, park ve meydan düzeni | World Builder'ın algoritmaları ve ayrı iş (kullanıcı kararı 2026-11-11). Bu işin World Builder'dan istediği iki değişiklik §7.2'de, kalan eksikler §7.3'te |
| Shape grammar dili, PCG grafı, görsel node editörü | §0.0: grafik üstünde yazılan araçlar ve kural dilleri motora girmez |
| Oyun sırasında üretim | Çıktı kalıcı dosyadır; oyun build'ine üretici kodu girmez |
| Parsel başına benzersiz bina | Kullanıcı kararı 2026-11-11: prototip seti (§5.3) |
| Modüler parça montajı; gölgelendiricide çizilen cephe | Kullanıcı kararı 2026-11-11: bütün mesh + karo doku (§6.2) |
| İç mekân | Kullanıcı kararı 2026-11-11: yalnız dış kabuk |
| Yüksek katlı ve yoğun şehir binaları (giydirme cephe, bitişik nizam) | Önce köy / kasaba (kullanıcı kararı 2026-10-28); PB6 adayı |
| Simgesel ve tekil yapılar, köprü, araç, karakter | Bugünkü kaynaklar geçerli: Blender, Tripo, hazır model |
| Trafik ve yaya için yol semantiği (şerit, dönüş izni, yaya topolojisi) | Motorda tüketicisi yok (K12: AI mantığı oyun kodunda); "ileride lazım olur" §0.0'a göre girmez |
| Gerçek coğrafi veriden bina (OpenStreetMap, açık veri) | Ayrı girdi yolu ve ayrı lisans yükü (ODbL); World Builder'ın işi |
| Levha ve tabela yazısı | Oyun verisidir; üretici yalnız boş yüzey ve doku yuvası verir |
| Bina tipolojisi ve mimari stil kataloğu | Stil oyun verisidir (§5.4); motor yalnız üretici taşır |

---

## 2. Başlama koşulu ve ana plandaki yeri

Kullanıcı kararı (2026-11-11): bu iş şimdi yalnız planlanır. Ana plana yeni
faz eklenmedi; başlarken tek satırla bağlanır.

**Bitki planından gereken.** Bu iş yeni altyapı kurmaz, yeni üretici ekler.
Ortak parçalar bitki planının PG1 adımında kurulur ve bu iş ondan sonra başlar:

| Bitki planı | Bu işin ondan kullandığı |
|---|---|
| PG1 | Saf çekirdek (rastgele akışlar, mesh yazımı, collider, istatistik), üretim tarifi asset türü ve paneli, CLI, World Builder'da `generated` kaynağı, materyal tarifi ve gürültü yığını doku üreticisi, karma yolun gölgelendirici payı ölçümü |
| PG3 | CPU rasterleyici ve KTX2 yazımı (PB3'ün pişmiş uzak cephesi için). PG3 o güne kapanmadıysa rasterleyici PB3'te yazılır; ortografik çekim yeter |

PG2 ve PG4–PG7 bu işi beklemez, bu iş de onları beklemez.

**Ana plandan gereken.**

| Ana plan | Bu işin ondan kullandığı |
|---|---|
| 2b | World Builder algoritmaları taşınmış (parsel, arazi kullanımı, bina, ped, teras, donatı, çit); yerleşimler GUID + rol taşıyor |
| Faz 3 | Materyal sistemi (TSL), GLB + KTX2 yükleme, statik mesh instancing |
| Faz 4 | Editör kabuğu, Content Browser, genel veri editörü (A13), ajan komutları (A12) |
| 5a | Terrain (ped ve duvarların zemini) |
| 5b | HLOD (uzak yerleşim) |
| 5d | World Builder penceresi ve önizleme worker'ı |

**Başlarken kodla doğrulanacak noktalar** (bugünden değişiklik istemez):

1. Statik mesh instancing, örnek başına renk tonu niteliğini materyal katkısına
   taşıyabiliyor mu (§6.6)? Taşıyamıyorsa ton, örneğin dünya konumunun
   hash'inden gölgelendiricide türetilir (three'nin şehir üreticisindeki yol,
   Ek A.1).
2. Statik mesh'ler hangi yolla çiziliyor: klasik instancing mi, three r187'deki
   meshlet hattı gibi GPU güdümlü bir yol mu? İkincisi üreticinin çıktısına
   kısıt koyar (§6.7) ve ana planın kararıdır, bu planın değil.
3. Spline boyunca mesh süpürme (Forge'da yol yüzeyinin `meshAsset` yolu) hangi
   fazda geldi? Bordür ve kaldırım kesiti ona bağlıdır (PB6).
4. 5b'nin HLOD'u girdi olarak kaynak mesh'in en kaba LOD'unu kabul ediyor mu
   (§6.7)?
5. Asset meta'sında adlandırılmış bağlanma noktası (giriş, levha yüzü) için
   hazır bir sözleşme var mı (§5.2)?

---

## 3. Nasıl çalışır

```text
Tarif (küçük JSON: üretici + parametreler + varyant listesi)
        │   saf kod, Node'da ve worker'da çalışır
        ▼
Ayak izi ve kütle  ──►  Cephe ızgarası  ──►  Mesh (köşe, normal, UV, maske)
        │
        ├──►  LOD'ler (aynı tariften daha kaba üretim)
        ├──►  Pişmiş uzak cephe dokusu (bake)
        └──►  Kutu collider + giriş noktası + ölçüler
        ▼
Sıradan asset'ler: prototip mesh'leri + paylaşılan karo dokular
        ▼
World Builder: rol → tarif; parsele sığan prototipi seçer
        ▼
Faz 3 instancing / 5b HLOD: çizim
```

| İş | Sahibi |
|---|---|
| **Biçim üretimi:** bir evin duvarı, çatısı, penceresi; bir çit panosu; bir lamba direği | Bu plan |
| **Yerleşim:** hangi bina hangi parsele, çit nereden geçer, lamba kaç metrede bir | World Builder; bu plan yalnız §7.2'deki iki bağlantıyı ister |
| **Sunum:** instancing, culling, LOD seçimi, HLOD | Ana plan Faz 3 ve 5b |

Çıktı sıradan asset olduğu için oyun üreticiyi tanımaz. Üretici yalnız editörde
ve Node araçlarında yaşar.

---

## 4. Üretici aileleri

Motor bina türü değil **üretici** taşır. "Taş köy evi" ya da "ahşap ahır" bir
üreticinin ön ayarıdır (§5.4).

| Üretici | Ne üretir | Teknik | Sıra |
|---|---|---|---|
| **Desen** (doku) | Tuğla, kesme ve moloz taş, kiremit, tahta kaplama, karo, oluklu sac | Parça yerleşimi (sıra, kayma, derz) + parça başına sapma + üstüne gürültü yığını; bitki planındaki materyal tarifinin üçüncü doku üreticisi | PB1, PB2 |
| **Doğrusal modül** | Bahçe ve istinat duvarı, çit panosu, korkuluk, bordür, kapı | Kesit ya da pano tanımından sabit boylu parça; World Builder dizer | PB1 (masif), PB4 (panolu) |
| **Bina kabuğu** | Az katlı konut, dükkân, depo, ahır, kulübe | Ayak izi → katlar → şemalı cephe ızgarası → çatı → ekler | PB2, PB5 |
| **Direk** | Sokak lambası, elektrik direği, levha direği | Gövde + kol + uç parçası; sabit topoloji | PB4 |
| **Döndürme** | Varil, fıçı, saksı, çöp kutusu, baba | Profil eğrisinin eksen çevresinde döndürülmesi | PB4 |
| **Kasa** | Sandık, kasa, palet, bank | Tahta ve çıta kutuları; sabit topoloji | PB4 |

**Seçimlerin gerekçesi.**

- **Kütle ile stil ayrıdır.** Ayak izi ve kat sayısı bir hacim verir; cephe
  kuralları o hacmi giydirir. City Sample'ın ana fikri budur (Ek A.4); kural dili
  ve modül kitaplığı alınmadı.
- **Masif duvar en basit ailedir:** gövde ve harpuşta, alfa yok, açıklık yok.
  Bu yüzden desen dokusunu ve World Builder bağlantısını ilk o sınar (PB1),
  bitki planında kayanın yaptığı gibi.
- **Donatı üreticilerinin topolojisi sabittir.** Serbest parça listesi (genel
  parametrik modelleyici) yoktur; öyle bir araç tarifi büyütür ve ajanı yeniden
  köşe yazmaya iter. Sabit topolojiye sığmayan donatı (trafik ışığı, durak,
  oyun grubu, hidrant) hazır model yolunda kalır ya da PB6'da kendi üreticisini
  alır.
- **Ortak kavramlar:** ayak izi, yüz, kat bandı, aks, açıklık, bağlanma
  noktası, materyal yuvası. Balkon korkuluğu Doğrusal modülün kesitini kullanır.

`three 0.187.0` içindeki `examples/jsm/generators/CityGenerator.js` ve `city/`
klasörü (gökdelen, kaldırım, lamba, trafik ışığı, bank, çöp kutusu, hidrant,
sokak ağacı, araç, yaya) yalnız referanstır: `three/webgpu` ve `three/tsl`
import ettiği için katman kuralıyla `render` dışına giremez. Okunan kısımları ve
bu plana etkileri Ek A.1'de.

---

## 5. Veri sözleşmesi

Alan adları öneridir; şema uygulamada kesinleşir.

### 5.1 Tarif

Bitki planındaki **üretim tarifi** asset türünün aynısıdır (A13 veri asset'i,
aynı panel, aynı CLI); yalnız `generator` değeri ve parametreleri farklıdır.

```text
Üretim tarifi
  id (GUID), schema
  generator            "building" | "linear" | "pole" | "lathe" | "crate"
  generatorVersion     çıktıyı değiştiren her üretici değişikliğinde artar
  params               o üreticinin şemalı parametreleri
  variants             prototip listesi (§5.3)
  lod                  LOD başına hedefler (§8)
  materials            duvar / çatı / doğrama materyal tarifi referansları
  collision            yok | kutu
```

Bina üreticisinin `params` alanları (özet):

```text
  footprint            biçim (dikdörtgen | L | T | U), en ve boy aralığı
  storeys              kat sayısı aralığı, kat yüksekliği, zemin kat yüksekliği
  foundation           temel eteği derinliği, zemin kat döşeme kotu
  facade               aks genişliği hedefi + kural listesi (§6.2)
  openings             pencere / kapı ölçüleri, girinti, çerçeve, pervaz, kepenk
  roof                 tip (düz | tek eğim | beşik | kırma), eğim, saçak, parapet
  additions            baca, sundurma, balkon, giriş basamağı (sayı ve olasılık)
```

### 5.2 Çıktı

Çıktı kalıcı dosyadır: projeye yazılır ve commit'lenir. Her prototip için:

- mesh dosyası (LOD'leriyle);
- pişmiş uzak cephe dokusu (yalnız bina, LOD2 için);
- statik mesh kaydı ve kutu collider;
- meta: kaynak "üretildi", tarifin GUID'i, üretici sürümü, içerik özeti, proje
  lisansı; ayrıca **ölçüler** (ayak izi eni ve boyu, yükseklik, kat sayısı) ve
  **bağlanma noktaları** (giriş kapısının yeri ve yönü, levha yüzü). World
  Builder prototipi bu ölçülerle seçer (§7.2).

Karo dokular (duvar, çatı, doğrama) prototipin değil **materyal tarifinin**
çıktısıdır ve bütün prototipler onları paylaşır.

Yeniden üretim aynı dosyaların üstüne yazar ve GUID'leri korur. Var olan
çıktının üstüne yazmak açık bir kullanıcı eylemidir.

### 5.3 Prototip seti

Bir tarif sınırlı sayıda bina üretir (ilk hedef 4–8); World Builder parsele
uyanı seçer ve aynı bina yerleşimde tekrar eder (kullanıcı kararı 2026-11-11).
Gerekçe: az dosya, instancing çalışır, ağaçlardaki modelin aynısıdır.

- Her varyant bir seed taşır; isteğe bağlı olarak ayak izi ölçüsünü ve kat
  sayısını sabitler. Sabitlenmeyen değer tarifteki aralıktan seed'le çekilir.
- Bir tarifin varyantları parsel boyutlarını kapsayacak biçimde seçilir: dar,
  orta ve geniş cepheli en az birer prototip.
- **Ölçekleme yoktur.** Bina ölçeklenirse pencere ve kapı da ölçeklenir.
- **Örnek çeşitliliği yerleşimdedir:** duvar ve doğrama renk tonu ile yıpranma
  fazı örnek başına değişir.
- **Ayna ayrı varyanttır,** örnek dönüşümü değil. Negatif ölçek üçgen yönünü
  çevirir ve three'nin meshlet hattı aynalı nesneyi hiç kabul etmez (Ek A.2).
  Varyant `mirror` bayrağı taşır; üretici aynı seed'den aynalı mesh'i yazar.
- Giriş, prototipin yerel +Z yönündedir (World Builder'ın bugünkü kuralı).

### 5.4 Ön ayarlar ve stil

Mimari stil (hangi bölgede taş duvar ve kırma çatı, hangisinde ahşap ve beşik
çatı) içeriktir ve iki yerde durabilir:

- **İçerik paketi** (`content/packs/<id>/`): birkaç nötr ön ayar + önceden
  üretilmiş çıktı.
- **Oyun projesi:** projenin kendi tarifleri.

Hangi rolün hangi tarifi kullandığı bölge profilinde, yani oyun verisinde
durur. Bina tipolojisi ya da stil listesi motor deposuna girmez.

---

## 6. Teknik tasarım

### 6.1 Determinizm

Bitki planı §6.1 geçerlidir. Buna ek olarak:

- Her cephe hücresi kendi rastgele akışını kullanır
  (`hash(seed, yüz, kat, aks)`). Bir aksa balkon eklemek öteki aksların
  penceresini değiştirmez.
- Kütle, cephe, ekler ve LOD ayrı akışlardır.

### 6.2 Bina kabuğu

Bina üreticinin yazdığı tek mesh'tir (kullanıcı kararı 2026-11-11); parçaları
ayrı asset ya da ayrı aktör değildir. Level'da bir bina bir aktördür.

- **Ayak izi.** Dik açılı çokgen: PB2'de dikdörtgen, PB5'te dikdörtgenlerin
  birleşimi olarak L, T ve U. Eğik ve düzensiz çokgen yoktur; o ihtiyaç parsel
  başına benzersiz binaya aittir.
- **Kütle.** Kat sayısı × kat yüksekliği; zemin kat ayrı yükseklik alabilir.
  **Temel eteği** zemin kotunun altına uzanır: World Builder binayı pedin
  altına gömer (Forge'da `FOUNDATION`), eğimli zeminde pedin kenarında boşluk
  kalmaz.
- **Cephe ızgarası.** Her duvar yüzü kat bantlarına ve akslara bölünür. Aks
  genişliği hedeftir; artan pay köşelere dağıtılır. Her hücreye sıralı bir
  **kural listesinden** öğe atanır:

  ```text
  kural   katlar (zemin | üst | hepsi)  ·  yüz (ön | yan | arka | hepsi)
          öğe (duvar | pencere | kapı | vitrin | balkon kapısı)
          ritim (her aks | n akstan biri | olasılık)  ·  simetri
  ```

  Liste yukarıdan aşağı okunur, ilk eşleşen kural kazanır. Ön yüzde tek giriş
  kapısı her zaman vardır. Bu bir kural dili değildir: koşul, döngü ya da
  alt kural yoktur; liste formda satır satır düzenlenir.
- **Açıklık.** Pencere ve kapı, hücrenin dörtgenlere ayrılmasıyla açılır:
  çevre duvarı, girinti yüzleri, çerçeve, cam, pervaz, isteğe bağlı kepenk.
  **Boolean / CSG kullanılmaz;** cephe zaten hücrelere bölünmüştür.
- **Çatı.** Düz + parapet, tek eğim, beşik, kırma. Dikdörtgen ayak izinde
  kapalı formül; bileşik ayak izinde düz iskelet (*straight skeleton*), PB5.
  Saçak taşması ve kalınlığı parametredir. Kiremit geometri değil dokudur.
- **Ekler.** Baca, sundurma, balkon, giriş basamağı. Her biri kütlenin
  bağlanma noktalarına oturur ve bütçeden pay alır.
- **Materyal yuvası en çok üçtür:** duvar, çatı, doğrama. Cam, kapı tahtası,
  çerçeve ve metal aksam tek bir küçük **doğrama atlasında** durur; cam
  saydam değildir (iç mekân yok), düşük pürüzlü koyu yüzeydir. Yuva sayısı
  çizim çağrısını çarptığı için sınırdır.
- **Parça kimliği.** Her köşe, ait olduğu bölgenin kimliğini (duvar, temel,
  çatı, çerçeve, cam, kapı, ek) adlı bir nitelikte taşır; köşe renginde değil.
  three'nin gökdelen üreticisi bütün binayı bu yolla tek materyal ve tek çizim
  çağrısıyla çiziyor (Ek A.1). PB2 üç yuvayla başlar; karo dokuları bir doku
  dizisinde toplayıp tek yuvaya inmek PB3'te ölçülür.
- **Pencere kimliği.** Cam köşeleri pencerenin kararlı kimliğini taşır. İç mekân
  izlenimi ve gece ışığı (PB6) bu veriye dayanır; baştan yazılır, maliyeti bir
  niteliktir.
- **Mesh indekslidir ve aynı köşeler kaynaklıdır.** Kümeleyen ya da sadeleştiren
  bir çizim yolu paylaşılan köşe ister. three'nin meshlet aracı indekssiz
  girdiyi kendisi kaynaklıyor (Ek A.2); çıktı yine indeksli yazılır, dosya
  küçülür ve o adıma bağımlı kalınmaz.
- **Üçgen sırası çizim sırasıdır.** Tek mesh'i çizici sıralayamaz; dış yüzeyler
  önce, girinti içleri ve gizli kalan yüzler sonra yazılır (three'nin gökdelen
  üreticisindeki kural, Ek A.1).
- **Bütçe ve sonlanma:** en çok kat, aks, ek ve köşe sayısı tarifte sınırdır;
  sınır aşılırsa üretim durur ve rapor eder.

### 6.3 Doğrusal modül

İki kip vardır; ikisi de World Builder'ın dizdiği parçalar üretir.

| Kip | Örnek | Parça | Ölçekleme |
|---|---|---|---|
| **Masif** | Bahçe duvarı, istinat duvarı, bordür | Gövde + harpuşta kesiti, birim boy | Boyda ve yükseklikte serbest: materyal dünya ölçeğinde izdüşüm kullanır, doku gerilmez |
| **Panolu** | Tahta çit, tel çit, korkuluk | Direk + pano; sabit boylar (ör. 1, 2, 4 m), uç parça, kapı | Yok: tahta ve çubuk gerilir. World Builder parça boyunu bu setten seçer |

- Eğimde parça, iki ucundaki zemin yüksekliğine göre döner (World Builder'ın
  bugünkü davranışı). Masif duvarda basamaklı kip ayrı parametredir.
- Collider: kutu.

### 6.4 Donatı üreticileri

- **Direk:** gövde (kesit ve incelme), isteğe bağlı kol, uç parçası (armatür,
  izolatör, levha yüzü). Levha yüzü boş bir doku yuvasıdır.
- **Döndürme:** profil eğrisi + dilim sayısı; isteğe bağlı çember, kapak, ayak.
- **Kasa:** tahta, çıta ve köşe parçalarından kutu; bank aynı üreticinin
  oturak + ayak ön ayarıdır.
- Parça kimliği (§6.2) donatıda da kullanılır; hedef tür başına tek mesh ve tek
  materyal yuvasıdır (three'nin donatı üreticilerindeki düzen, Ek A.1).
- Collider: kutu ya da kapsül; küçük parçalarda yok.

### 6.5 Desen dokusu

Bitki planı §6.6'daki materyal tarifinin kuralları geçerlidir: A13 veri
asset'i, kalıcı çıktı, CPU'da üretim, karma yol.

- **Desen = yerleşim + gürültü yığını.** Yerleşim parçaların dizilişini verir
  (sıra yüksekliği, parça boyu, sıra kayması, derz genişliği ve derinliği);
  parça başına renk, yükseklik ve kenar aşınması sapması eklenir; üstüne gürültü
  yığını katmanı gelir.
- Yerleşim türleri: şaşırtmalı sıra (tuğla, kesme taş), düzensiz hücre (moloz
  taş), bindirmeli sıra (kiremit, tahta kaplama), ızgara (karo), oluk (sac).
- Çıktı döşenebilir renk, normal ve ORM dokularıdır. Karo boyu desen modülünün
  tam katıdır; kenar sürekliliği testle doğrulanır.
- **Gerçek ölçü.** Materyal tarifi karonun metre cinsinden boyunu taşır; mesh
  UV'si metredir. Bir tuğla her binada aynı boydadır.

### 6.6 UV ve gölgelendirici payı

- Duvar UV'si çevre boyunca sürekli sarılır (U yay uzunluğu, V yükseklik);
  derz köşede hizalı kalır. Çatıda V eğim boyuncadır, sıralar saçağa paralel
  kalır.
- **Modül hizalama varsayılandır:** üretici kat yüksekliğini, pencere
  yüksekliğini ve aks genişliğini desen modülünün tam katına yuvarlar; tuğla
  sırası açıklık kenarında bölünmez. three'nin gökdelen üreticisi aynı kuralı
  uyguluyor (Ek A.1). Tarif kapatabilir.
- **Gölgelendirici payı** (karma yolun değişim katmanı, mimari §4.9'daki
  materyal katkısı): büyük ölçekli renk kayması, zeminden yukarı kir ve nem,
  saçak altı akıntı lekesi, yosun. Maskeler köşe verisinden (yükseklik, oyukluk,
  saçak altı) ve düşük frekanslı dünya uzayı gürültüsünden beslenir.
- **Payı ucuz tutan üç kural** (three'nin şehir üreticisinden, Ek A.1): çok
  düşük frekanslı ton köşede hesaplanır ve yüzeyde enterpole edilir; akıntı
  lekesi dikeyde gerilmiş tek bir gürültüdür; ince ayrıntı kameraya uzaklıkla
  söner ve sönünce dalı hiç çalışmaz. Hash tamsayıdır; `fract(sin())` sürücüler arasında
  aynı sonucu vermez.
- **Örnek başına ton:** duvar ve doğrama rengi örnek niteliğinden kayar; aynı
  prototipin iki örneği farklı görünür.

### 6.7 LOD ve uzak görünüm

| Düzey | Nasıl elde edilir |
|---|---|
| LOD0 | Tam üretim: açıklık girintisi, çerçeve, pervaz, ekler |
| LOD1 | Girinti ve pervaz yok (pencere duvar düzleminde, aynı doğrama atlası); küçük ekler düşer; saçak kalınlığı yok |
| LOD2 | Yalnız kütle + çatı; cephe **pişmiş uzak cephe dokusundan**; tek materyal yuvası |
| Uzak | 5b HLOD; girdisi LOD2 |

- LOD sadeleştirmeyle değil, aynı tarifin daha kaba üretimiyle çıkar; siluet
  korunur.
- **Pişmiş uzak cephe:** LOD0'ın yüz başına ortografik çekimi (renk + normal),
  CPU rasterleyiciyle, prototip başına tek atlas.
- Çok açılı impostor yoktur: bina kutuya yakındır ve LOD2 zaten ucuzdur.
- Çit, duvar ve donatıda LOD2 ve bake yoktur; uzaklıkla fade yeter.
- LOD seçimi, hysteresis ve fade sunumun işidir; üretici her LOD'un sınırını ve
  önerilen ekran boyutu eşiğini verir. Küçük varlıkta görünürlük mesafesi
  boyutla orantılıdır (Slop New York'un kuralı, Ek A.3).
- **Gölge vekili:** LOD2 gölge geçişinde de kullanılabilir. İki referans da
  gölgeyi görünen geometriden daha ucuz bir şeyle atıyor: Slop New York yalnız
  konum taşıyan, hücrelere bölünmüş vekillerle; three'nin meshlet örneği ayrı
  bir eşikle seçilen daha kaba düzeyle (Ek A.2, A.3). Kullanıp kullanmamak
  sunumun kararıdır.
- **Meshlet hattı gelirse** (§2, nokta 2): LOD1'i hattın kendi sadeleştirme
  zinciri karşılayabilir; LOD2 yine gerekir. three'nin örneği hattın üstüne
  ayrı bir uzak materyal koyuyor: aynı geometri, 340 m'den sonra ucuz materyal.
  Hattın bugünkü kısıtları üreticiyi bağlar: aynalı nesne, köşe rengi,
  saydamlık, çift yüz, düz gölgeleme, displacement ve `vertexNode` yok; materyal
  opak ya da alfa testli olmalı (Ek A.2).

### 6.8 Collider ve giriş noktası

- Bina: ayak izinin dikdörtgenleri × yükseklik kutuları; çatı için tek kutu.
  Saçak, balkon ve baca collider almaz.
- Navigasyon ayrı veri istemez: navmesh collider geometrisinden kurulur.
- Giriş noktası asset meta'sındadır (§5.2), aktörde tekrarlanmaz. Bir oyun
  kapıya etkileşim ya da kendi iç mekânını bağlamak isterse bu noktayı okur.

### 6.9 Katmanlar

Bitki planı §6.8 ile aynı düzen; ortak çekirdek paylaşılır.

| Yer | İçerik |
|---|---|
| `src/engine/…` | Saf üretim: ayak izi, cephe ızgarası, çatı, doğrusal modül, donatı, desen dokusu, collider, istatistik. three yok, DOM yok; çıktı typed array |
| `src/features/<ad>/schema.ts` | Üretici parametreleri ve cephe kuralı şeması; Node'da yüklenir |
| `src/features/<ad>/render.ts` | Typed array → geometri; duvar, çatı ve doğrama TSL materyalleri |
| `src/features/<ad>/editor.ts` | Tarif panelinin bina önizlemesi |
| `tools/` | Bitki planının CLI'ı; yeni komut yok, yeni üretici var |
| İçerik paketi / oyun projesi | Ön ayarlar, üretilmiş çıktılar |

---

## 7. World Builder bağlantısı

### 7.1 Bugünkü durum (Forge WebGL, 2b'de taşınıyor)

Forge `engine/worldbuilder` üstünde 2026-11-11'de okundu. Taşınmış hâli
başlarken yeniden doğrulanır; adlar değişmiş olabilir.

- Aşama sırası: plan → yollar → yerleşim yerleri → sokaklar → parseller →
  arazi kullanımı → binalar → donatı → çitler. Yeniden çalıştırılabilir aşama
  yüzeyi 2b'de taşınmaz; algoritmalar taşınır.
- Bölge profilinde rol başına: arazi kullanımı, ayak izi en / boy aralığı, kat
  aralığı, kat yüksekliği, giriş kuralı, `assetIds`, çit tanımı
  (`regionProfile.ts`, `roles`).
- Bina: parsel başına bir küp, girişi (+Z) sokağa bakar; ayak izi rolün
  aralığından seed'le çekilir ve parsele sığdırılır. Her binaya ped; eğimde
  istinat duvarı ve merdiven küpleri (`structure.retainingWall`,
  `structure.stairs`).
- Donatı: `streetFurniture` kuralları rol, yol sınıfı ve konum (giriş, kavşak,
  aralıklı) taşır.
- Çit: parsel sınırında, en çok 4 m'lik düz parçalar; girişte boşluk.
- Brief'teki model satırlarının kaynağı `blender | tripo | ready`.

### 7.2 Önerilen bağlantı

1. **`generated` kaynağı.** Bitki planı §7.2'deki kaynak bina, yapı, çit ve
   donatı rolleri için de geçerlidir. World Builder çıktısı olmayan tarifi
   üretir; var olan çıktıya dokunmaz.
2. **Prototip seçimi (yerleşimdeki ilk değişiklik).** Rol `generated` ise World
   Builder ayak izini aralıktan çekmez. Tarifin prototiplerinin ölçülerini
   çıktı meta'sından okur, parselin yapılaşabilir alanına sığanlar arasından
   seed'le seçer ve pedi seçilen prototipin ayak izinden kurar. Hiçbiri
   sığmazsa en küçüğünü koyar ve raporlar. Komşu parsellerde aynı prototipi art
   arda seçmekten kaçınır.
3. **Çit parça boyu (ikinci değişiklik).** Panolu çitte parça boyu, tarifin
   modül setindeki boylardan seçilir; masif duvarda bugünkü serbest boy kalır.
4. **İstinat duvarı** masif Doğrusal modülden gelir; boyu ve yüksekliği
   ölçeklenir.
5. **Örnek çeşitliliği:** renk tonu, yıpranma fazı ve ayna örnek başına
   yerleşimde verilir (§5.3).

Merdiven (`structure.stairs`) PB5'e kadar yer tutucu kalır.

### 7.3 Yerleşim tarafında kalan eksikler (bu planın dışında)

Kapsam envanterinin gösterdiği ve Forge'da olmayan yerleşim işleri. Ayrı iştir;
buraya yalnız bina tarafını etkiledikleri için yazıldı:

| Eksik | Bina tarafına etkisi |
|---|---|
| Izgara ve radyal sokak deseni (bugün ağırlıkları yok sayılıyor) | Yok |
| Bitişik nizam ve köşe parseli | PB6: yan duvarı kör, köşede iki cepheli prototip |
| Park ve meydanın iç düzeni | Yok; varlıkları bitki planı ve PB4 verir |
| Kaldırım ve bordür | PB6: kesit modülü (§2, nokta 3) |
| Otopark, yükleme alanı | Yok |

### 7.4 Konseptten sahne akışındaki yeri

Onay noktaları değişmez; bina ve donatıda üçüncü onayın konusu değişir:

1. Sahne planı.
2. Greybox sahne: yer tutucularla.
3. **Aile onayı:** tarif başına bir önizleme sayfası (prototipler × LOD'ler,
   ölçü çubuğu ve insan boyu işaretiyle). Blender greybox modeli yerine
   üretilmiş prototip gösterilir.
4. Ayrıntı: yer tutucular üretilmiş asset'lerle değişir.

Onaydan sonra sahne kullanıcınındır. Tarifi değiştirip yeniden üretmek açık bir
eylemdir ve yalnız asset dosyalarını yeniler; yerleşim yeniden çalışmaz.

---

## 8. Bütçeler

Aşağıdakiler **ilk hedeftir**, ölçüm değildir. PB3'te R1 (RTX 3060) üstünde
ölçülüp düzeltilir. Ana planın G6 sınırı (Derekavak P2, 60 Hz: render gönderimi
≤ 3 ms, ana iş parçacığı ≤ 6 ms) üretilmiş yerleşimle de tutmalıdır.

**Üçgen (prototip başına):**

| Varlık | LOD0 | LOD1 | LOD2 | Uzak |
|---|---:|---:|---:|---|
| Az katlı bina (1–3 kat) | ≤ 6.000 | ≤ 1.200 | ≤ 80 | HLOD |
| Yardımcı yapı (ahır, depo, kulübe) | ≤ 2.000 | ≤ 400 | ≤ 40 | HLOD |
| Çit panosu / duvar parçası | ≤ 300 | ≤ 60 | — | Fade |
| Donatı | ≤ 800 | ≤ 150 | — | Fade |

**Prototip sayısı:** tarif başına 4–8.

**Çizim çağrısı.** Bina başına LOD0–1'de en çok 3, LOD2'de 1 materyal yuvası.
Görünür bir yerleşimde bina çağrıları için ilk hedef ≤ 100. Faz 1'in çağrı
başına ≈ 8 µs ölçüsüyle bu ≈ 0,8 ms eder; hesap bir tahmindir.

**Doku belleği** (sıkıştırılmış, piksel başına 1 bayt sınıfı; mip zinciriyle):

| Doku | Boyut | Bellek |
|---|---|---:|
| Duvar ya da çatı karosu, 3 doku | 1024² | ≈ 4 MiB |
| Doğrama atlası, 3 doku | 512² | ≈ 1 MiB |
| Pişmiş uzak cephe, prototip başına 2 doku | 512² | ≈ 0,7 MiB |

Bir yerleşim stili için hedef ≈ 18 MiB: iki duvar karosu + bir çatı karosu +
doğrama atlası + sekiz prototipin uzak cephesi. Karo dokular bütün prototiplerde
ortaktır; KTX2 zorunludur.

**Rapor:** her üretim köşe, üçgen, materyal yuvası, doku baytı, bake süresi ve
collider sayısını yazar; bütçeyi aşan tarif uyarı verir.

---

## 9. Editör ve ajan yüzeyi

Bitki planı §9'daki tarif paneli ve komut satırı aynen kullanılır. Bu işin
eklediği:

- **Önizleme:** prototipler yan yana, LOD0–2 ile; ölçü çubuğu ve insan boyu
  işareti. Seçilen prototipin ölçüleri (ayak izi, yükseklik, kat) sayaçtadır.
- **Cephe kuralı listesi** şemadan üretilen satır formudur: ekle, sil, sırala.
- **Parsel denemesi:** verilen parsel eni ve boyu için hangi prototiplerin
  sığdığını gösterir; World Builder'ın seçimi sürpriz olmaz.
- Işık, renk ve pozlama ayarı kullanıcıdadır; panel yalnız parametreleri açar.
- Komut satırı çıktısına prototip ölçüleri ve parsel kapsaması eklenir.

---

## 10. Adımlar

Her adım dikey bir dilimdir ve kendi kapısıyla biter. Görsel beğeni kullanıcı
kabulüdür; kapılar işlevsel ve ölçülebilirdir.

- [ ] **PB0 Hazırlık.** Bitki planı PG1 kapandı; §2'deki ana plan çıktıları ve
      beş nokta kodla doğrulandı; BK2 kapanır; ana plana bağlantı satırı
      eklenir.
- [ ] **PB1 Desen dokusu ve masif duvar, uçtan uca ince dilim.** Desen
      üreticisi (şaşırtmalı sıra, düzensiz hücre) + Doğrusal modülün masif kipi
      + World Builder'da istinat ve bahçe duvarı rolleri. *Kapı:*
      `world:random` dünyasında `structure.retainingWall` hazır model olmadan
      doluyor; karo kenarları sürekli (test); aynı tarif iki koşuda aynı
      sayıları veriyor; `verify:assets` yeşil; gerçek WebGPU'da tek kontrol
      çekimi.
- [ ] **PB2 Basit bina.** Dikdörtgen ayak izi, katlar, temel eteği, cephe
      ızgarası ve kural listesi, pencere ve kapı, dört çatı tipi, kutu
      collider, giriş noktası, LOD0; kiremit ve tahta desenleri; prototip seti;
      World Builder'da prototip seçimi. *Kapı:* bina rolleri hazır model
      olmadan doluyor; ped seçilen prototipin ayak iziyle eşleşiyor; giriş
      sokağa bakıyor; bütçe içinde sonlanma; düzenle → kaydet → yeniden aç
      aynı çıktı.
- [ ] **PB3 LOD, uzak cephe ve ölçüm.** LOD1, LOD2, pişmiş uzak cephe, KTX2,
      örnek başına ton, HLOD girdisi. *Kapı:* LOD geçişinde siluet ve renk
      tutarlı; §8 bütçeleri R1'de ölçüldü ve güncellendi; G6 üretilmiş
      yerleşimli sahnede sınırın içinde.
- [ ] **PB4 Çit ve donatı.** Doğrusal modülün panolu kipi (çit, korkuluk,
      kapı); Direk, Döndürme ve Kasa üreticileri; World Builder'da çit parça
      boyu. *Kapı:* çit ve donatı rolleri hazır model olmadan doluyor; çit
      eğimde zemine oturuyor ve girişte boşluk bırakıyor.
- [ ] **PB5 Bina genişlemesi.** L, T ve U ayak izi; düz iskelet çatı; zemin kat
      dükkânı (vitrin, tente); balkon, sundurma, baca; merdiven; aile onay
      sayfası; başlangıç ön ayar paketi. *Kapı:* bileşik ayak izinde çatı
      kapalı (açık kenar ve çakışan yüz yok, test); onay sayfası Content
      Browser'da görünüyor; üretilen bir yerleşimde sıradan bina, çit ve donatı
      için hazır model yok.
- [ ] **PB6 Genişleme.** Her biri bir oyun isteyince ayrı adım olarak açılır:
      bitişik nizam ve köşe binası (komşuya bakan duvar kör); yüksek katlı bina
      ve giydirme cephe; iç mekân izlenimi ve gece pencere ışığı (camın
      arkasında gölgelendiricide sahte oda; uzakta yalnız oda ortalaması);
      kaldırım ve bordür kesiti; yeni donatı üreticileri.

**İş bölümü.** Saf ve iyi tanımlı parçalar (desen yerleşimi, cephe ızgarası
bölme, çatı geometrisi, düz iskelet, profil döndürme) imza + kabul ölçütüyle
Codex'e verilebilir; tasarım, TSL materyalleri, editör paneli, World Builder
bağlantısı ve inceleme Claude'da.

---

## 11. Kararlar

**Kapalı:**

| Konu | Karar |
|---|---|
| Tarifin türü, çıktının saklanışı, bake yolu, doku yolu, yedek doku kaynakları | Bitki planı §11'deki kararlar bu iş için de geçerli (kullanıcı, 2026-11-11) |
| Yerleşimin yeniden üretimi | Yok (kullanıcı, 2026-11-07; plan 2b) |
| İnsan yapımı prop'lar ve Desen doku üreticisi | Bu işte (kullanıcı, 2026-11-11) |
| Zamanlama | Şimdi yalnız plan (kullanıcı, 2026-11-11) |
| Kapsam | Yalnız biçim üretimi; binanın yerini World Builder seçer (kullanıcı, 2026-11-11) |
| Bina çeşitliliği | Prototip seti; World Builder parsele uyanı seçer (kullanıcı, 2026-11-11; §5.3) |
| Cephe yöntemi | Bütün mesh + karo doku; modüler montaj ve gölgelendiricide cephe reddedildi (kullanıcı, 2026-11-11; §6.2) |
| İç mekân | Yalnız dış kabuk (kullanıcı, 2026-11-11) |
| Ölçek sırası | Önce köy / kasaba, şehir sonra (kullanıcı, 2026-10-28) |
| Kapsam envanteri belgesi (eski BK1) | Kaldırıldı; bulguları Ek A ve Ek B'de (kullanıcı, 2026-11-11) |

**Öneriyle yazılanlar** (kullanıcıya 2026-11-11'de sunuldu, itiraz gelmedi;
açık onay da verilmedi):

| Konu | Yazılan |
|---|---|
| Trafik ve yaya semantiği | Kapsam dışı; bina aktörü GUID + rol, asset giriş noktası taşır |
| Simgesel yapı, köprü, araç, karakter | Bugünkü kaynaklar |
| Gerçek coğrafi veriden bina | Kapsam dışı |
| Başlama sırası | Bitki planı PG1'den sonra |
| Stil ve tipoloji kataloğu | Motor deposuna girmez |

**Açık (PB0'da kapanır):**

| ID | Soru | Öneri |
|---|---|---|
| BK2 | Başlangıç ön ayarları nerede durur? | Bitki planının PK6'sıyla aynı yer (`content/packs/starter/`): birkaç nötr bina, duvar, çit ve donatı ön ayarı; bölgeye özgü stiller oyun projesinde |

---

## 12. Riskler

| Risk | Karşılık |
|---|---|
| Aynı prototipin tekrarı göze batar | Örnek başına ton ve ayna; tarif başına 4–8 prototip; rol başına birden çok tarif. Yetmezse parsel başına benzersiz bina ayrı kullanıcı kararıdır |
| Hiçbir prototip dar ya da düzensiz parsele sığmaz | World Builder en küçüğünü koyar ve raporlar; panelde parsel denemesi; ön ayar setinde dar cepheli prototip |
| Prosedürel bina kutu gibi görünür | Açıklık girintisi, saçak, temel, baca, sundurma; kullanıcı kabulü PB2'de; hazır model yolu açık kalır |
| Büyük duvarda karo tekrarı görünür | Gölgelendiricideki değişim katmanı; parça başına renk sapması |
| Derz açıklık kenarında bölünür | Modül hizalama (§6.6) |
| Çizim çağrısı sayısı artar | En çok 3 materyal yuvası; LOD2 tek yuva; HLOD; parça kimliğiyle tek yuva seçeneği; PB3 ölçümü |
| Ana plan statik mesh'te GPU güdümlü bir yola geçer ve üreticinin çıktısı uymaz | Çıktı baştan o yolun kısıtlarına uygun: ayna ayrı varyant, köşe rengi yok, indeksli ve kaynaklı köşe, opak tek yüz (§6.2, §6.7) |
| Kapsam envanterdeki 13 kategoriye doğru büyür | Üretici ailesi başına ayrı adım; PB6 yalnız oyun isteyince |
| Donatı üreticileri genel modelleyiciye dönüşür | Sabit topoloji kuralı (§4) |
| Bitki planı gecikir | Bu iş yalnız PG1'e bağlıdır; rasterleyici gerekirse PB3'te yazılır |
| Taşınan World Builder bugünkünden farklı çıkar | PB0'da kodla doğrulama; üretici World Builder'a uyar |
| Üretici değişince eski tarifler başka görünür | `generatorVersion` + çıktının kalıcı dosya olması |

---

## Ek A — Referans incelemesi

2026-11-11 ve 2026-11-12'de bu plan için açılan kaynaklar. Kodu okunan üç
kaynak ayrı başlıktadır; "→" bu plana etkisini gösterir. Okunmayan dosyalar her
başlıkta adıyla yazılıdır.

### A.1 three r187 şehir üreticisi

[Örnek](https://threejs.org/examples/?q=city#webgpu_generator_city). Okunan:
`examples/jsm/generators/CityGenerator.js` (679 satır),
`city/SkyscraperGenerator.js` (1.799; oda ışın atma gövdeleri hariç),
`city/InstancedMeshGenerator.js`, `city/StreetlightGenerator.js` ve örnek
sayfanın betiği. `city/` altındaki öteki üreticiler (trafik ışığı, bank, çöp
kutusu, hidrant, sokak ağacı, kaldırım, araç, yaya) okunmadı; PB4 başında
okunur.

- **Yerleşim sabit ızgaradır:** ada × parsel. Her parsele kendi seed'iyle ayrı
  bir gökdelen üretilir; köşe parselinde binanın sokağa bakan köşesi pahlanır.
  → Yerleşim World Builder'ın işi. Parsel başına benzersiz bina bu planın
  seçimi değil (§5.3); meshlet örneği de geometri paylaşmak için şehri karo
  olarak çoğaltıyor (A.2).
- **Cephe çerçevesi.** Ayak izi çokgeninin her kenarı bir yüz çerçevesidir (u
  kenar boyunca, v yukarı, n dışarı). Cephe düz (u, v) uzayında dizilir ve tek
  matrisle yerine konur. Aks sayısı `floor(uzunluk / aks genişliği)`; artan pay
  iki uca eşit marjdır. Köşede çift parça çıkmasın diye her yüz yalnız kendi
  başlangıç köşesine payanda koyar. → §6.2'deki ızgara aynı düzendir.
- **Modül hizalama.** Kat yüksekliği, pencere yüksekliği, aks ve payanda
  genişliği tuğla modülüne (0,3 × 0,6 m) yuvarlanır; toplam yükseklik buna göre
  düzeltilir. → §6.6.
- **Tek mesh, tek materyal.** Küçük hazır parçalar (payanda, pencere çerçevesi,
  cam, alem) matrislerle çoğaltılır ve tek geometriye yazılır. Her köşe `partId`
  taşır; materyal onu düz enterpolasyonla okur ve dallanır. Yazım sırası çizim
  sırasıdır: cephe önden arkaya, gizli arka duvar en sonda. Çıktı indekssizdir.
  → Parça kimliği ve üçgen sırası §6.2; indeksli çıktı farkı A.2.
- **Pencere en pahalı parçadır:** delikli çerçeve yüzü + dört girinti yüzü + düz
  bir kayıt; arka kapak ve dış yan yüz yazılmaz. → §6.2 açıklık, §8 bütçesi.
- **Materyal tuğlayı doku kullanmadan çizer:** bina yerel konumundan şaşırtmalı
  sıra, piksel ayak izine göre yumuşatılan derz, tuğla başına hash'li ton. Çok
  düşük frekanslı ton köşede hesaplanır; akıntı dikeyde gerilmiş gürültüdür;
  çatı kiri yalnız yatay yüzeyde çalışan bir daldır; hash tamsayıdır. Bina
  rengi, dünya konumundan parsel hücresi hash'lenerek paletten seçilir.
  → Ucuzluk kuralları §6.6; konumdan ton §2 nokta 1. Tuğlayı gölgelendiricide
  çizmek alınmadı: doku yolu kapalı karardır (pişmiş karo + gölgelendirici
  değişimi, §11).
- **İç mekân izlenimi.** Her cam köşesi baktığı odanın merkezini ve boyunu
  taşır; komşu iki üç aks aynı odayı paylaşır; gölgelendirici o kutuya ışın
  atar. Uzak materyal ışın atmaz, odanın ortalama rengini ve ışığını verir.
  → Pencere kimliği §6.2; PB6.
- **Donatı.** Her tür tek birleşik geometri + `partId` + tek materyaldir ve
  `InstancedMesh` ile dizilir. Yerleşim ada kenarı boyunca yürür (lamba ≈ 30 m,
  ağaç ≈ 16 m, köşede çöp kutusu). → §6.4; aralıklar World Builder'ın konusu.
- **Kutu vekili.** Kule başına bir kutu, tek çizim çağrısı. Yalnız GI probe
  bake'inde ayrıntılı şehrin yerine çizilir; gölge için değildir. → Bu planın
  işi değil; aynı ihtiyacı LOD2 karşılar.

### A.2 three r187 meshlet hattı

[Örnek](https://threejs.org/examples/?q=city#webgpu_meshlets_city). Okunan:
örnek sayfanın betiği; `pipelines/MeshletDrawingPipeline.js` (5.571 satır)
içinden sınıf belgesi ve destek denetimleri; `utils/MeshletGeometryUtils.js`
başı. Ayıklama ve çizim gövdeleri okunmadı. Hat three çekirdeğinde değil, örnek
eklentisidir (`renderer.drawingPipeline`).

- Geometri bir kez işlenir: aynı köşeler kaynaklanır, 64 üçgenlik kümeler ve
  meshoptimizer ile en çok altı sadeleştirilmiş düzey çıkar (üçgen oranı 1 →
  0,015). Kaynaklanmayan indekssiz girdide küme ≈ 21 üçgende kalır ve düzey
  çıkmaz.
- Her karede compute shader nesne başına düzey seçer; nesneler ve kümeler
  frustum ve hiyerarşik derinlikle ayıklanır. Aynı geometri + materyali paylaşan
  bütün nesneler tek dolaylı çizimdir. Gölge geçişinde düzey ayrı eşikle
  seçilir.
- **Destek koşulları:** materyal opak ya da alfa testli ve ön yüzlü;
  `vertexColors`, `flatShading`, saydamlık, displacement ve `vertexNode` yok;
  dünya matrisinin determinantı pozitif (aynalı nesne yok); skinned, morph ve
  batched mesh yok. `positionNode` desteklenir. Uymayan nesne olağan hatta
  çizilir.
- Örnek şehri 6 × 6 karo olarak çoğaltır; karolar kule geometrilerini paylaşır.
  Her kule bir `LOD` nesnesindedir: aynı geometri, 340 m'den sonra ucuz
  materyal (oda ortalaması; yıpranma ve kabartma yok). Statik içerik
  `BundleGroup` ile GPU'da tutulur.
- → §2 nokta 2, §5.3 (ayna ayrı varyant), §6.2 (indeksli ve kaynaklı köşe),
  §6.7, §12. Hattı kullanıp kullanmamak ana planın kararıdır.

### A.3 Slop New York

[Depo](https://github.com/mrdoob/slop-newyork), commit `2813185` (2026-11-10).
Okunan: README, `PORTING.md`, `js/buildings.js`, `js/building-footprints.js`,
`js/building-details.js`, `js/scene-culling.js`; `js/tsl-materials.js` (3.498
satır) içinden `filteredPulse`, `distantWindowLight`, `facadeCell` ve
`createPreWarBuildingMaterial`'in başı. Yol ağı, trafik, yaya, simge yapı ve
öteki materyaller okunmadı.

- **Veri.** 37.353 bina NYC Open Data'dan gelir: avlulu ayak izi çokgeni, çatı
  yüksekliği, yapım on yılı; 0,5 m ızgarada ≈ 440 KB ikili dosya. Aynı biçimi
  OpenStreetMap'ten üreten araç vardır (ODbL). Kod MIT. → Gerçek veriden şehir
  ayrı bir sorundur ve veri lisansı taşır; kapsam dışı (§1).
- **Bina geometrisi yalnız kütledir.** Ayak izi duvarlara ekstrüde edilir, düz
  çatı üçgenlenir; binalar cephe materyali × 1 km hücre başına tek mesh'te
  birleşir. Beş cephe materyali vardır (iki kagir, üç giydirme cam); yapım
  yılına göre seçilir.
- **Cephe tümüyle gölgelendiricidedir.** Köşeler duvarın enini, yüksekliğini,
  komşu çatının üstünde açıkta kalan yüksekliği, seed'i, duvar boyunca konumu ve
  duvar türünü taşır. Gölgelendirici bundan aks × kat hücresini kurar (köşeler
  arasına tam aks sığdırır); pencere, kayıt, klima, korniş ve tuğlayı çizer.
  İnce çizgiler piksel ayak izine göre kutu filtresiyle yumuşatılır; uzak
  pencere ışıkları kümelenir. Duvar türü dörttür: dükkânlı ön, ön, avlu ve
  komşuya bitişik (kör); bitişiklik komşu ayak izleri örneklenerek bulunur.
  → Gölgelendiricide cephe reddedildi (§1); yüksek katlı adımda yeniden bakılır
  (PB6). Kör duvar PB6'daki bitişik nizam maddesinin karşılığıdır.
- **Ayrıntılar** (korniş, su deposu, HVAC, tente, tabela, iskele) üst sınırlı
  `InstancedMesh` havuzlarıdır. Quadtree ile oyuncunun 560 m çevresi için
  doldurulur, oyuncu 18 m yürüyünce yenilenir, yakın bina önce gelir.
  → Alınmadı: bu planda ekler prototip mesh'inin parçasıdır.
- **Ayıklama ve gölge.** Küçük varlığın görünürlük mesafesi tipik boyutu ×
  1.100'dür (en az 300 m; 2.000 m'yi aşan hep görünür). Büyük statik gölge
  atıcılar yalnız konum taşıyan, 500 m'lik hücrelere bölünmüş vekillerle gölge
  atar; vekilleri yalnız gölge kameraları çizer. → §6.7.

### A.4 Öteki kaynaklar

| Kaynak | Görülen | Bu plana etkisi |
|---|---|---|
| [City Sample PCG](https://dev.epicgames.com/documentation/unreal-engine/city-sample-pcg-for-unreal-engine?lang=en-US) (Epic belgesi) | 18 PCG grafı. Parsel grafı ayak izini üretir; bina, ayak izinin en az–en çok yüksekliğe ekstrüzyonu ve üstüne shape grammar uygulanmasıdır. Shape grammar, modüler mesh'leri spline ya da çokgen boyunca bir dizgi diliyle dizen veri asset'idir. Trafik, yaya ve trafik ışığı kurulumu yok | Kütle / stil ayrımı alındı (§4). Dizgi dili ve modül kitaplığı alınmadı (§1) |
| Forge WebGL `engine/worldbuilder` | §7.1 | World Builder bağlantısı (§7.2) |

**Doğrulanamayanlar:** Epic'in 27 Ağustos 2026 duyurusu (sayfa 403 verdi);
orijinal City Sample sayfaları (açılmadı). Bu plan bunlara dayanmaz.

Bu kaynaklardan kod, veri ya da içerik alınmaz; algoritmalar Forge'un katman ve
asset kurallarına göre yeniden yazılır.

## Ek B — Kapsam envanterinin bu plandaki karşılığı

| Envanter | Bu planda |
|---|---|
| U01 Yerleşim planlama | World Builder; kapsam dışı |
| U02 Bölgeler ve imar | World Builder ve bölge profili; kapsam dışı |
| U03 Yollar ve ulaşım | World Builder (yol sınıfı, spline, kavşak, köprü Forge'da var); bordür ve kaldırım kesiti PB6 |
| U04 Şehir adaları ve parseller | World Builder; kapsam dışı |
| U05 Prosedürel binalar | Bina kabuğu üreticisi (PB2, PB5); tipoloji oyun verisi |
| U06 Sokak çevresi | Doğrusal modül (PB1, PB4); yerleşimi World Builder |
| U07 Şehir nesneleri | Direk, Döndürme, Kasa (PB4); sabit topolojiye sığmayanlar hazır model |
| U08 Parklar ve kamusal alanlar | Düzeni World Builder (§7.3); varlıkları bitki planı ve PB4 |
| U09 Altyapı | Direk üreticisi (elektrik direği); gerisi oyun isteyince |
| U10 Mimari ve kentsel ayrıntılar | Bina ekleri (PB2, PB5) ve gölgelendirici payı (§6.6) |
| U11 Özel işlev alanları | Kapsam dışı; oyun isteyince |
| U12 Simgesel ve özel yapılar | Kapsam dışı; hazır model ya da Blender |
| U13 Şehir anlam ve bağlantı verileri | Trafik ve yaya kapsam dışı; kalan: GUID + rol, giriş noktası (§6.8) |

## İlerleme kaydı

| Tarih | Sürüm | Not |
|---|---|---|
| 2026-11-11 | v0.1 | Plan yazıldı. Kapsam envanteri değerlendirildi; kullanıcı kararları: yalnız biçim üretimi, prototip seti, bütün mesh + karo doku, yalnız dış kabuk. Uygulama yok |
| 2026-11-12 | v0.2 | Üç referansın kodu okundu (three r187 şehir üreticisi ve meshlet hattı, Slop New York); Ek A yeniden yazıldı. Gövdeye girenler: ayna ayrı varyant, parça kimliği niteliği (donatıda da), üçgen sırası, modül hizalama varsayılan, gölge vekili ve meshlet kısıtları kodla düzeltildi. Kapsam envanteri belgesi kaldırıldı (kullanıcı onayı). Uygulama yok |
