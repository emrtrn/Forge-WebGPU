// Ported from Forge WebGL engine/persistence/saveGameStore.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Save-game persistence core.
 *
 * This module owns only the storage mechanics: slot keys, JSON envelopes,
 * schema migration and corrupt/quota-safe adapter calls. The saved payload is
 * opaque to the engine; game code decides what `payload` means.
 */

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): readonly string[];
}

export interface PersistenceLogger {
  warn(message: string, details?: unknown): void;
}

export interface SaveGameEnvelope<TPayload = unknown> {
  readonly schema: number;
  readonly gameId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly payload: TPayload;
}

export interface SaveGameSlotInfo {
  readonly slot: string;
  readonly schema: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface SaveGameStoreOptions {
  readonly gameId: string;
  readonly schema: number;
  readonly storage: StorageAdapter;
  readonly namespace?: string;
  readonly now?: () => string;
  readonly logger?: PersistenceLogger;
  readonly migrate?: (fromSchema: number, payload: unknown) => unknown;
}

export interface SaveGameWriteResult {
  readonly ok: boolean;
  readonly reason?: "storage-error";
}

const DEFAULT_NAMESPACE = "forge.saveGame";
const DEFAULT_LOGGER: PersistenceLogger = {
  warn(message, details) {
    if (details === undefined) console.warn(message);
    else console.warn(message, details);
  },
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function normalizeGameId(gameId: string): string {
  const trimmed = gameId.trim();
  if (trimmed.length === 0) throw new Error("SaveGameStore requires a non-empty gameId.");
  return trimmed;
}

function normalizeSchema(schema: number): number {
  if (!Number.isInteger(schema) || schema < 1) {
    throw new Error("SaveGameStore schema must be a positive integer.");
  }
  return schema;
}

function slotSuffix(slot: string): string {
  return encodeURIComponent(slot);
}

function parseSlotSuffix(suffix: string): string | null {
  try {
    return decodeURIComponent(suffix);
  } catch {
    return null;
  }
}

function maybeEnvelope(value: unknown, gameId: string): SaveGameEnvelope<unknown> | null {
  if (!isPlainObject(value)) return null;
  if (value.gameId !== gameId) return null;
  const schema = value.schema;
  if (typeof schema !== "number" || !Number.isInteger(schema) || schema < 1) return null;
  if (!isValidDateString(value.createdAt) || !isValidDateString(value.updatedAt)) return null;
  if (!("payload" in value)) return null;
  return {
    schema,
    gameId: value.gameId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    payload: value.payload,
  };
}

function parseEnvelope(raw: string, gameId: string): SaveGameEnvelope<unknown> | null {
  try {
    return maybeEnvelope(JSON.parse(raw) as unknown, gameId);
  } catch {
    return null;
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    if (initial) {
      for (const [key, value] of Object.entries(initial)) this.values.set(key, value);
    }
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  keys(): readonly string[] {
    return [...this.values.keys()];
  }
}

export function createMemoryStorageAdapter(initial?: Record<string, string>): MemoryStorageAdapter {
  return new MemoryStorageAdapter(initial);
}

export class SaveGameStore<TPayload = unknown> {
  private readonly gameId: string;
  private readonly schema: number;
  private readonly namespace: string;
  private readonly storage: StorageAdapter;
  private readonly now: () => string;
  private readonly logger: PersistenceLogger;
  private readonly migrate: ((fromSchema: number, payload: unknown) => unknown) | undefined;

  constructor(options: SaveGameStoreOptions) {
    this.gameId = normalizeGameId(options.gameId);
    this.schema = normalizeSchema(options.schema);
    this.namespace = options.namespace ?? DEFAULT_NAMESPACE;
    this.storage = options.storage;
    this.now = options.now ?? (() => new Date().toISOString());
    this.logger = options.logger ?? DEFAULT_LOGGER;
    this.migrate = options.migrate;
  }

  listSlots(): SaveGameSlotInfo[] {
    const prefix = this.slotPrefix();
    const slots: SaveGameSlotInfo[] = [];
    for (const key of this.safeKeys()) {
      if (!key.startsWith(prefix)) continue;
      const slot = parseSlotSuffix(key.slice(prefix.length));
      if (slot === null) continue;
      const envelope = this.readRawEnvelope(key, slot);
      if (!envelope) continue;
      slots.push({
        slot,
        schema: envelope.schema,
        createdAt: envelope.createdAt,
        updatedAt: envelope.updatedAt,
      });
    }
    return slots.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.slot.localeCompare(b.slot));
  }

  readSlot(slot: string): SaveGameEnvelope<TPayload> | null {
    const key = this.slotKey(slot);
    const envelope = this.readRawEnvelope(key, slot);
    if (!envelope) return null;
    const migrated = this.migrateEnvelope(envelope, slot);
    if (!migrated) return null;
    return migrated;
  }

  writeSlot(slot: string, payload: TPayload): SaveGameWriteResult {
    const key = this.slotKey(slot);
    const existing = this.readRawEnvelope(key, slot);
    const timestamp = this.now();
    const envelope: SaveGameEnvelope<TPayload> = {
      schema: this.schema,
      gameId: this.gameId,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      payload,
    };
    try {
      this.storage.setItem(key, JSON.stringify(envelope));
      return { ok: true };
    } catch (error) {
      this.logger.warn("Save-game write failed.", { slot, error });
      return { ok: false, reason: "storage-error" };
    }
  }

  deleteSlot(slot: string): boolean {
    try {
      this.storage.removeItem(this.slotKey(slot));
      return true;
    } catch (error) {
      this.logger.warn("Save-game delete failed.", { slot, error });
      return false;
    }
  }

  keyForSlot(slot: string): string {
    return this.slotKey(slot);
  }

  private slotPrefix(): string {
    return `${this.namespace}.${encodeURIComponent(this.gameId)}.slot.`;
  }

  private slotKey(slot: string): string {
    return `${this.slotPrefix()}${slotSuffix(slot)}`;
  }

  private safeKeys(): readonly string[] {
    try {
      return this.storage.keys();
    } catch (error) {
      this.logger.warn("Save-game slot listing failed.", { error });
      return [];
    }
  }

  private readRawEnvelope(key: string, slot: string): SaveGameEnvelope<unknown> | null {
    let raw: string | null;
    try {
      raw = this.storage.getItem(key);
    } catch (error) {
      this.logger.warn("Save-game read failed.", { slot, error });
      return null;
    }
    if (raw === null) return null;
    const envelope = parseEnvelope(raw, this.gameId);
    if (!envelope) {
      this.logger.warn("Save-game data is corrupt or incompatible.", { slot });
      return null;
    }
    return envelope;
  }

  private migrateEnvelope(
    envelope: SaveGameEnvelope<unknown>,
    slot: string,
  ): SaveGameEnvelope<TPayload> | null {
    if (envelope.schema > this.schema) {
      this.logger.warn("Save-game data uses a newer schema.", {
        slot,
        saveSchema: envelope.schema,
        currentSchema: this.schema,
      });
      return null;
    }

    let schema = envelope.schema;
    let payload = envelope.payload;
    while (schema < this.schema) {
      if (!this.migrate) {
        this.logger.warn("Save-game data needs migration but no migrate hook was supplied.", {
          slot,
          saveSchema: schema,
          currentSchema: this.schema,
        });
        return null;
      }
      try {
        payload = this.migrate(schema, payload);
        schema += 1;
      } catch (error) {
        this.logger.warn("Save-game migration failed.", { slot, fromSchema: schema, error });
        return null;
      }
    }

    return {
      schema,
      gameId: envelope.gameId,
      createdAt: envelope.createdAt,
      updatedAt: envelope.updatedAt,
      payload: payload as TPayload,
    };
  }
}
