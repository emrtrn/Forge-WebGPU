# Taşıma günlüğü

Forge WebGL'den (`C:\Users\emret\Desktop\Forge`, yalnız okunur) bu depoya ne
geldiğinin kaydı (plan §7). Üç bölüm:

1. **Özellik envanteri:** Forge'un kullanıcıya görünen özellikleri; her satırda
   hedef faz ya da "taşınmayacak" + gerekçe. Kapsama matrisinin paydasıdır.
   Faz 0'da doldurulur.
2. **Taşıma günlüğü:** taşınan her modül. Cut-over'da (`forge-webgl-final`,
   Faz 2b başı) başlar.
3. **Port bekleyenler:** cut-over'dan sonra Forge WebGL'de taşınmış bir modüle
   gelen hata düzeltmeleri.

## 1. Özellik envanteri

Kaynak: Forge `main` @ _(Faz 0'da yazılır)_. Biçim ve kapsam Faz 0'da
kullanıcıyla kararlaştırılır.

_(Henüz doldurulmadı.)_

## 2. Taşıma günlüğü

Forge SHA: _(cut-over'da `forge-webgl-final`)_.

| Modül | Kaynak yol | Forge SHA | İşlem | Testler | Durum |
|---|---|---|---|---|---|

İşlem: taşındı / uyarlandı / yeniden yazıldı. Testler: taşınan / yeniden yazılan
/ düşen sayısı (2b test sınıflamasına göre).

## 3. Port bekleyenler

| Tarih | Forge commit | Modül | Ne | Durum |
|---|---|---|---|---|
