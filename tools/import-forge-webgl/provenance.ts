// Licence and source of an imported Forge WebGL asset (plan 2b importer,
// architecture §4.6; user decision 2026-11-12: the licence is the user's
// responsibility).
//
// A meta file refuses "Unknown", and Forge marked 883 of its 995 assets so.
// The importer does not ask per asset: an ordered rule table decides from the
// asset's path and its Forge manifest entry (`license`, `source`). The first
// rule that matches wins. An asset whose licence nobody knows is still
// imported as `LicenseRef-forge-unverified` with the manifest's own text as
// its origin; it stays out of a game until the user replaces it. Kenney and
// Quaternius are not imported at all (user decision 2026-11-11).

export const UNVERIFIED_LICENSE = "LicenseRef-forge-unverified";
export const PROJECT_LICENSE = "LicenseRef-forge-project";

export interface ForgeAssetOrigin {
  /** Public-relative path, `assets/...`. */
  readonly path: string;
  /** Forge manifest `license` text; absent for a file the manifest does not list. */
  readonly license?: string | undefined;
  /** Forge manifest `source` object. */
  readonly source?: Readonly<Record<string, unknown>> | undefined;
}

export interface Provenance {
  readonly license: string;
  readonly source: { readonly origin: string; readonly author?: string; readonly url?: string };
}

export type ProvenanceDecision =
  | { readonly kind: "import"; readonly rule: string; readonly provenance: Provenance }
  | { readonly kind: "excluded"; readonly rule: string; readonly reason: string };

interface ProvenanceRule {
  readonly id: string;
  readonly matches: (asset: ForgeAssetOrigin) => boolean;
  readonly decide: (asset: ForgeAssetOrigin) => ProvenanceDecision;
}

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");
const originOf = (asset: ForgeAssetOrigin): string => text(asset.source?.origin);
/** Licence texts that are an SPDX id already, or the short form Forge used for one. */
const SPDX: Readonly<Record<string, string>> = { "CC0": "CC0-1.0", "CC0-1.0": "CC0-1.0", "CC-BY-4.0": "CC-BY-4.0", "MIT": "MIT" };

/** What Forge's manifest says about an asset's source, as one line. */
export function describeForgeSource(asset: ForgeAssetOrigin): string {
  const source = asset.source ?? {};
  const parts = [text(source.origin), text(source.pack), text(source.path)].filter((part) => part !== "");
  const license = text(asset.license);
  return `Forge WebGL manifest: ${parts.length ? parts.join(", ") : "no source"} (license: ${license || "none"})`;
}

function imported(rule: string, license: string, origin: string, extra: { author?: string; url?: string } = {}): ProvenanceDecision {
  return { kind: "import", rule, provenance: { license, source: { origin, ...extra } } };
}

/** The table, in order. */
export const PROVENANCE_RULES: readonly ProvenanceRule[] = [
  {
    id: "kenney-quaternius",
    matches: (asset) => /^assets\/(kenney|quaternius)/i.test(asset.path) || /kenney|quaternius/i.test(originOf(asset)),
    decide: () => ({ kind: "excluded", rule: "kenney-quaternius", reason: "no Kenney or Quaternius content in Forge WebGPU (user decision 2026-11-11)" }),
  },
  {
    id: "gaz52",
    matches: (asset) => asset.path.startsWith("assets/vehicles/gaz52/"),
    decide: () => imported("gaz52", "CC-BY-4.0", "Sketchfab", {
      author: "Vebis_V_stolb_GT",
      url: "https://sketchfab.com/3d-models/gaz-52-base-67e1d6c4ebb64c25ab8f34cf17697a49",
    }),
  },
  {
    id: "poly-haven",
    matches: (asset) => /^https:\/\/polyhaven\.com\//.test(originOf(asset)),
    decide: (asset) => imported("poly-haven", "CC0-1.0", "Poly Haven", { url: originOf(asset) }),
  },
  {
    id: "three-ages",
    matches: (asset) => originOf(asset) === "ThreeAges" || asset.path.startsWith("assets/ThreeAges/"),
    decide: () => imported("three-ages", PROJECT_LICENSE, "ThreeAges"),
  },
  {
    id: "ai-generated",
    matches: (asset) => /ai-generated/i.test(text(asset.license)) || /image_?gen/i.test(originOf(asset)),
    decide: () => imported("ai-generated", PROJECT_LICENSE, "ai-generated"),
  },
  {
    id: "world-builder-reference",
    matches: (asset) => asset.license === undefined && /\.reference\.(png|jpg|webp)$/.test(asset.path),
    decide: () => imported("world-builder-reference", PROJECT_LICENSE, "authored"),
  },
  {
    id: "project-local",
    matches: (asset) => /^project-local/i.test(text(asset.license)),
    decide: () => imported("project-local", PROJECT_LICENSE, "authored"),
  },
  {
    id: "spdx",
    matches: (asset) => Object.hasOwn(SPDX, text(asset.license)),
    decide: (asset) => {
      const origin = originOf(asset);
      return imported("spdx", SPDX[text(asset.license)]!, origin === "" || /^forge$/i.test(origin) ? "authored" : origin);
    },
  },
  {
    id: "unverified",
    // Unknown, NOASSERTION, no licence or a text no rule above reads.
    matches: () => true,
    decide: (asset) => imported("unverified", UNVERIFIED_LICENSE, describeForgeSource(asset)),
  },
];

export function provenanceOf(asset: ForgeAssetOrigin): ProvenanceDecision {
  const rule = PROVENANCE_RULES.find((entry) => entry.matches(asset))!;
  return rule.decide(asset);
}
