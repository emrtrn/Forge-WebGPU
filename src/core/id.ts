// Persistent identity (architecture §4.6). Actors, assets and levels carry a
// GUID from the moment they are created; references are made by GUID only.
// Components are not GUID'd: they are addressed as actor id + local key (A1).

export const ID_PREFIX = {
  actor: "act",
  asset: "ast",
  level: "lvl",
} as const;

export type IdKind = keyof typeof ID_PREFIX;

export type ActorId = `act_${string}`;
export type AssetId = `ast_${string}`;
export type LevelId = `lvl_${string}`;

export type IdOf<K extends IdKind> = `${(typeof ID_PREFIX)[K]}_${string}`;

const HEX_LENGTH = 32; // 128 random bits
const ID_PATTERN = /^(act|ast|lvl)_[0-9a-f]{32}$/;

export function createId<K extends IdKind>(kind: K): IdOf<K> {
  const bytes = new Uint8Array(HEX_LENGTH / 2);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `${ID_PREFIX[kind]}_${hex}` as IdOf<K>;
}

export function isId<K extends IdKind>(value: unknown, kind: K): value is IdOf<K> {
  return (
    typeof value === "string" &&
    ID_PATTERN.test(value) &&
    value.startsWith(`${ID_PREFIX[kind]}_`)
  );
}
