# Sound

Ses dosyası asset türü (mimari §4.6).

- `schema.ts`: `forge.sound@1` ikili asset türü; `wav`, `ogg`, `mp3`
  uzantılarını iddia eder. Sürüm 1'de içe aktarma ayarı yok (meta dosyasında
  `import: {}`).
- `feature.ts`: yalnız asset türünü kurar.
- Şimdilik yalnız şema (plan 2b içe aktarıcı, kullanıcı kararı 2026-11-12).
  İçe aktarma ayarları Faz 3'te sürüm 2 ve geçiş zinciriyle; ses bileşeni
  yok (K12), çalma `src/engine/audio` kütüphanesiyle Faz 6'da.
