# Saltline: FPS karakteri referans notu

Durum: referans, plan değil. Faz sırasını ve K / A kararlarını değiştirmez.
Kaynak: claude.ai'da paylaşılan "Saltline" projesinin kopyası (tek HTML, 1,4 MB,
minify edilmiş, three r180 + WebGL2). Değerler kod okumasından alındı; birimler
(m, m/s, rad) kod bağlamından çıkarıldı, çalıştırılarak doğrulanmadı.

**Nasıl kullanılır:** FPS karakteri işine gelindiğinde başlangıç tablosu ve
fikir kaynağı olarak. Algoritmalar okunur, TSL / Forge katmanlarına göre yeniden
yazılır; kod kopyalanmaz (başkasının işi, minify). Oyun içeriği (hikâye, görev,
düşman türleri) bu depoya girmez; yalnız karakter hissi ve altyapı fikirleri.

## 1. Karakter ölçüleri

| Değer | Saltline |
|---|---|
| Göz yüksekliği (ayakta / çömelme) | 1,68 / 1,05 |
| Kapsül yarıçapı / boy | 0,32 / 1,8 (çömelince 1,15) |
| FOV (dünya / silah modeli) | 74 / 54 |
| ADS FOV | 52 |
| Sprint FOV artışı | +6 |
| Pitch sınırı | 1,5 rad |

## 2. Hareket (tek tablo, `Mt`)

| Değer | Saltline |
|---|---|
| Yürüme / sprint / çömelme / ADS hızı | 3,8 / 6,4 / 1,9 / 2,4 |
| Zemin ivmesi / yavaşlaması | 34 / 26 |
| Hava ivmesi | 9 |
| Yerçekimi | 21 (gerçekçi 9,8'in iki katından fazla: "ağır, çevik" his) |
| Zıplama | tepe yüksekliğinden türetilir: `v = sqrt(2·g·apex)`, apex = 1 |
| Coyote süresi / zıplama tamponu | 0,12 s / 0,13 s |
| Göz yüksekliği geçişi hızı | 11 |
| Can yenilenme (gecikme / hız) | 4 s / 25 |

Fikirler:
- Zıplama hızı elle girilmez, istenen tepe yüksekliğinden hesaplanır; yerçekimi
  değişince zıplama bozulmaz.
- Coyote + zıplama tamponu birlikte; ikisi de çok kısa.
- Hız hedefe ivmeyle yaklaşır (zemin / hava ayrı); anlık hız atlaması yok.

## 3. Kamera hissi

| Değer | Saltline |
|---|---|
| Adım uzunluğu (yürü / sprint / çömel) | 1,55 / 2,1 / 1,05 |
| Bob Y / X | 0,024 / 0,013 |
| Bob çarpanı sprint / ADS | 1,9 / 0,22 |
| Strafe roll | 0,02 |
| İniş çökmesi (dip) / üst sınır | 0,36 / 0,2 |
| Sarsıntı sönümü / pitch-yaw-roll | 1,7 / 0,03-0,03-0,045 |
| ADS'de bakış hassasiyeti çarpanı | 0,6 |

Fikirler: bob zamanla değil **katedilen mesafeyle** ilerler (adım uzunluğu);
ADS'de neredeyse kapanır; iniş ve hasar ayrı sarsıntı kanalları.

## 4. Silah / geri tepme

| Değer | Saltline |
|---|---|
| Şarjör / yedek | 30 / 120 |
| Geri tepme: uygula / tut / kalıcı oran / toparlanma | 34 / 0,09 s / 0,35 / 6,5 |
| Yayılma (spread) | sabit taban + mesafeye göre near / far aralığı |
| Görüş hizası (`sightY`) | modelden gelir (0,069) |

Fikirler:
- Geri tepme yalnız kamera döndürmez: bir kısmı (`recoilKeep` 0,35) kalıcı
  kalır, kalanı toparlanır. Oyuncu "namluyu geri indirir" hissi buradan.
- Silah modeli (viewmodel) kameradan ayrı, **sönümlü yay** (`k`, `c`) ile
  sürülür: yay `dt` büyükse alt adımlara bölünür (sabit ~8 ms), kare hızına
  bağımlı değil.
- ADS geçişi `smootherstep` (6t⁵-15t⁴+10t³) ile.
- Silah modeli ayrı FOV ve ayrı render sırasıyla çizilir; duvara girmez.

## 5. Mimari fikri

Oyun bir **modül sözleşmeleriyle** kurulu: input, player, weapon, enemies, hud,
audio, mats, render. Her modülün **stub** karşılığı var (aynı arayüz, boş
metotlar), bu sayede modüller bağımsız geliştirilip yerine takılıyor.
Forge'da karşılığı: özellik klasörü sözleşmesi + SDK; karakter denetleyici
ayrı bir özellik olarak aynı kalıba oturur.

Girdi katmanı tek bir durum nesnesi üretir (`move`, `look`, `fire`, `ads`,
`sprint`, `crouch`); klavye-fare (pointer lock), gamepad ve dokunmatik aynı
nesneyi doldurur. Hassasiyet ve Y ters çevirme bu katmanda.

## 6. HUD fikirleri (render'dan bağımsız, DOM + CSS)

- Pusula şeridi, dünya uzayı hedef işaretleri (ekran dışındaysa kenara yapışır).
- Nişangâh yayılmaya göre açılır; hit marker "zayıf nokta / öldürme" renkleri.
- Hasar yönü yayları; sağlık yalnız yaralıyken görünür.
- Etkileşim istemi: halka dolum göstergesi.
- Dokunmatik düzen: başparmak köşeleri boş tutulur, HUD yukarı kayar.
- `prefers-reduced-motion` ve güvenli alan (safe-area) desteği.

## 7. Bu belgede olmayanlar (okunmadı)

Çarpışma çözümü ve fizik, düşman yapay zekâsı ve navigasyon, ses sentezi,
silah ateş döngüsü ayrıntıları. Gerekirse ayrı okunur.

## 8. Render notu (FPS dışı, ileride S3 / malzeme için)

Hacimsel ışık: yarı çözünürlükte ışın yürütme + gölge haritası görünürlüğü +
iki loblu Henyey-Greenstein + derinliğe duyarlı blur. Malzemeler: voronoi /
fraktal gürültüden boya-pas hasar modeli, doku dosyası yok. İkisi de TSL'e
yeniden yazılacak algoritma olarak not edildi; plana kutu eklemek ayrı karar.
