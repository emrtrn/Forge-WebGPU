# Texture

Doku görseli asset türü (mimari §4.6).

- `schema.ts`: `forge.texture@1` ikili asset türü; `png`, `jpg`, `webp`, `ktx2`
  uzantılarını iddia eder. Sürüm 1'de içe aktarma ayarı yok (meta dosyasında
  `import: {}`).
- `feature.ts`: yalnız asset türünü kurar.
- Şimdilik yalnız şema (plan 2b içe aktarıcı, kullanıcı kararı 2026-11-12).
  İçe aktarma ayarları (renk uzayı, mipmap, sıkıştırma) Faz 3'te sürüm 2 ve
  geçiş zinciriyle, materyallerle birlikte.
