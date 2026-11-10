# Forge WebGPU

Açık dünya oyunları için WebGPU tabanlı oyun motoru + editörü. Forge'un (WebGL,
`C:\Users\emret\Desktop\Forge`) yerini alır. Bu depo yalnız motordur: oyunlar
ayrı depolarda yaşar; GDD, oyun fikri ve türe özgü taksonomi buraya girmez.

## Belgeler

- [Yeniden inşa planı](docs/planned/FORGE_WEBGPU_REBUILD_PLAN.md): faz sırası,
  kutular, K kararları, ilerleme kaydı. Kutular bayatlayabilir; durumu kodla
  doğrula.
- [Mimari rapor](docs/planned/FORGE_WEBGPU_ARCHITECTURE.md): katmanlar, veri
  modeli, şema kaydı, kayıt servisi, SDK, A kararları. Çelişkide rapor geçerli.
- Kararların hepsi kapalı. Yeni bir mimari soru çıkarsa varsayma, sor.

## Komutlar

| Komut | Ne yapar |
|---|---|
| `npm run dev` | Dev server, port **5183** (`strictPort`) |
| `npm run gate` | Push öncesi kapı: aşağıdakilerin hepsi |
| `npm run typecheck` | `tsconfig.json` (tarayıcı, `src/`) + `tsconfig.tools.json` (Node, `tools/`) |
| `npm run verify:layers` | Katman denetimi + öz-testi |
| `npm run verify:file-size` | Dosya bütçesi: 800 satırda uyarı, 1.500'de hata |
| `npm run test` | Vitest; testler modülün yanında (`*.test.ts`) |
| `npm run build` | Vite üretim build'i |

Smoke portu **5283**. Forge WebGL 5173 / 5273, Ridgebound 5175 kullanır; başka
projenin sunucusunu yeniden kullanma.

## Katmanlar

`src/` altında, aşağıdan yukarı: `core` → `engine` → `render` → `runtime` →
`gameplay`; `editor` hepsini görür ama yalnız dinamik import'la yüklenir.
`tools/` Node'da çalışır; `core`, `engine` ve özellik şemalarını yükler.

- three (`three/webgpu`, `three/tsl`) yalnız `src/render/**` ve
  `src/features/*/render.ts` içinde. `import type` de sayılır.
- Bir özellik tek klasördür: `src/features/<ad>/{schema,runtime,render,editor,feature}.ts`.
  `schema.ts` Node'da da yüklenir; yalnız `core` import eder.
- Kuralların tek kaynağı `.dependency-cruiser.cjs`. Kural eklerken
  `tests/fixtures/layer-violations/` altına kasıtlı bir ihlal ve
  `expected.json`'a satırını ekle; öz-test eksik ya da fazla ihlalde kırılır.
- `tools/` betikleri `node dosya.ts` ile çalışır; göreli import'lar `.ts`
  uzantılı yazılır, `enum` / `namespace` gibi silinemeyen sözdizimi yok.

## Çalışma kuralları

- Doğrudan `main`. Her yeşil adım commit + push; kırık ara durum commit'lenmez.
- Push'tan önce `npm run gate`. İnceleme adımı yok; kapı tek güvence.
- Commit yol sınırlı atılır: `git commit -m "..." -- <yollar>`.
- three `0.187.0` tam sabit (K5). Rapier `0.19.3` Forge ile aynı; TypeScript ve
  Vite ana sürümleri de Forge'la aynı. Yükseltme faz sınırında, ayrı adımdır.
- Forge WebGL deposu buradan yalnız okunur. Algoritmalar olduğu gibi taşınır
  (plan §2.11); `SceneApp` / `RuntimeSceneApp` referans alınır, kopyalanmaz.
- Render kabulü yerelde, başlıklı tarayıcıda, gerçek WebGPU backend'inde
  yapılır. CI'da GPU yok; WebGL2'ye düşen koşu WebGPU kabulü sayılmaz.
