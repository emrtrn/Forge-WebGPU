# Texture

Doku görseli asset türü (mimari §4.6).

- `schema.ts`: `forge.texture@2` ikili asset türü; `png`, `jpg`, `webp`, `ktx2`
  uzantılarını iddia eder. İçe aktarma ayarları (Faz 3 adım 4): `anisotropy`
  (1–16, varsayılan 8, GPU sınırına çekilir), `mipmaps`. Renk uzayı dokunun
  değil, onu kullanan materyal slotunundur (Forge kuralı). Sürüm 1 (ayarsız)
  dosyaları varsayılanlara geçer.
- `feature.ts`: yalnız asset türünü kurar.
- Yükleme render katmanında, kaynak önbelleğinde `texture:<guid>:<srgb|linear>`.
