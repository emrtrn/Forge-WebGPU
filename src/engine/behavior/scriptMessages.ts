// Ported from Forge WebGL engine/behavior/scriptMessages.ts @ forge-webgl-final (04b5fb23); docs/PORT_LOG.md §2.
/**
 * Pure Actor Script message core.
 *
 * Behaviors enqueue messages; the runtime host decides when to flush them.
 * Indexed subscriptions keep dispatch keyed by message type plus optional
 * target entity, so later BehaviorContext integration does not need global
 * actor scans for every message.
 */
import type { EntityId } from "../legacy/entity.ts";

export type ScriptMessagePayload = Record<string, unknown>;

export interface ScriptMessageEnvelope {
  readonly id: string;
  readonly frame: number;
  readonly type: string;
  readonly source: EntityId;
  readonly target?: EntityId;
  readonly payload: ScriptMessagePayload;
}

export interface ScriptMessageInput {
  readonly frame?: number;
  readonly type: string;
  readonly source: EntityId;
  readonly target?: EntityId;
  readonly payload?: ScriptMessagePayload;
}

export type ScriptMessageHandler = (envelope: ScriptMessageEnvelope) => void;

export type ScriptMessageWarningCode =
  | "missing-target"
  | "missing-handler"
  | "recursive-dispatch"
  | "dispatch-limit";

export interface ScriptMessageWarning {
  readonly code: ScriptMessageWarningCode;
  readonly message: string;
  readonly envelope?: ScriptMessageEnvelope;
}

export interface ScriptMessageFlushResult {
  readonly processed: number;
  readonly delivered: number;
  readonly warnings: readonly ScriptMessageWarning[];
}

export type ScriptMessageTraceStatus = "delivered" | "missing-target" | "missing-handler";

export interface ScriptMessageTraceEntry {
  readonly envelope: ScriptMessageEnvelope;
  readonly delivered: number;
  readonly status: ScriptMessageTraceStatus;
  readonly warnings: readonly ScriptMessageWarning[];
}

export interface ScriptMessageBusOptions {
  readonly targetExists?: (target: EntityId) => boolean;
  readonly maxMessagesPerFlush?: number;
  readonly recentTraceLimit?: number;
  readonly idFactory?: () => string;
}

interface SubscriptionBucket {
  readonly allTargets: Set<ScriptMessageHandler>;
  readonly byTarget: Map<EntityId, Set<ScriptMessageHandler>>;
}

export class ScriptMessageBus {
  private readonly buckets = new Map<string, SubscriptionBucket>();
  private readonly targetExists: ((target: EntityId) => boolean) | undefined;
  private readonly maxMessagesPerFlush: number;
  private readonly recentTraceLimit: number;
  private readonly idFactory: (() => string) | undefined;
  private queue: ScriptMessageEnvelope[] = [];
  private recentTrace: ScriptMessageTraceEntry[] = [];
  private nextId = 1;
  private flushing = false;
  private activeWarnings: ScriptMessageWarning[] | null = null;

  constructor(options: ScriptMessageBusOptions = {}) {
    this.targetExists = options.targetExists;
    this.maxMessagesPerFlush = options.maxMessagesPerFlush ?? 1000;
    this.recentTraceLimit = options.recentTraceLimit ?? 20;
    this.idFactory = options.idFactory;
  }

  send(input: ScriptMessageInput): ScriptMessageEnvelope {
    return this.enqueue(input);
  }

  emit(input: Omit<ScriptMessageInput, "target">): ScriptMessageEnvelope {
    return this.enqueue(input);
  }

  subscribe(
    type: string,
    handler: ScriptMessageHandler,
    options: { readonly target?: EntityId } = {},
  ): () => void {
    const bucket = this.bucketFor(type);
    if (options.target) {
      let handlers = bucket.byTarget.get(options.target);
      if (!handlers) {
        handlers = new Set();
        bucket.byTarget.set(options.target, handlers);
      }
      handlers.add(handler);
      return () => {
        handlers?.delete(handler);
        if (handlers?.size === 0) bucket.byTarget.delete(options.target as EntityId);
      };
    }

    bucket.allTargets.add(handler);
    return () => {
      bucket.allTargets.delete(handler);
    };
  }

  flush(): ScriptMessageFlushResult {
    if (this.flushing) {
      const warning: ScriptMessageWarning = {
        code: "recursive-dispatch",
        message: "ScriptMessageBus.flush() was called while a flush was already in progress.",
      };
      this.activeWarnings?.push(warning);
      return { processed: 0, delivered: 0, warnings: [warning] };
    }

    const warnings: ScriptMessageWarning[] = [];
    this.activeWarnings = warnings;
    this.flushing = true;
    let processed = 0;
    let delivered = 0;

    try {
      while (this.queue.length > 0) {
        if (processed >= this.maxMessagesPerFlush) {
          warnings.push({
            code: "dispatch-limit",
            message: `ScriptMessageBus stopped after ${this.maxMessagesPerFlush} messages in one flush.`,
          });
          break;
        }

        const envelope = this.queue.shift();
        if (!envelope) break;
        processed += 1;

        if (
          envelope.target !== undefined &&
          this.targetExists &&
          !this.targetExists(envelope.target)
        ) {
          const warning: ScriptMessageWarning = {
            code: "missing-target",
            message: `No runtime entity exists for message target "${envelope.target}".`,
            envelope,
          };
          warnings.push(warning);
          this.recordTrace({
            envelope,
            delivered: 0,
            status: "missing-target",
            warnings: [warning],
          });
          continue;
        }

        const handlers = this.handlersFor(envelope);
        if (handlers.length === 0) {
          const warning: ScriptMessageWarning = {
            code: "missing-handler",
            message: `No script message handler is subscribed for "${envelope.type}".`,
            envelope,
          };
          warnings.push(warning);
          this.recordTrace({
            envelope,
            delivered: 0,
            status: "missing-handler",
            warnings: [warning],
          });
          continue;
        }

        for (const handler of handlers) {
          handler(envelope);
          delivered += 1;
        }
        this.recordTrace({
          envelope,
          delivered: handlers.length,
          status: "delivered",
          warnings: [],
        });
      }
    } finally {
      this.flushing = false;
      this.activeWarnings = null;
    }

    return { processed, delivered, warnings };
  }

  clear(): void {
    this.queue = [];
    this.buckets.clear();
    this.recentTrace = [];
  }

  pendingCount(): number {
    return this.queue.length;
  }

  getRecentTrace(): readonly ScriptMessageTraceEntry[] {
    return this.recentTrace;
  }

  private enqueue(input: ScriptMessageInput): ScriptMessageEnvelope {
    const envelope: ScriptMessageEnvelope = {
      id: this.idFactory ? this.idFactory() : `script-message:${this.nextId++}`,
      frame: input.frame ?? 0,
      type: input.type,
      source: input.source,
      payload: input.payload ?? {},
    };
    if (input.target !== undefined) {
      (envelope as ScriptMessageEnvelope & { target: EntityId }).target = input.target;
    }
    this.queue.push(envelope);
    return envelope;
  }

  private bucketFor(type: string): SubscriptionBucket {
    let bucket = this.buckets.get(type);
    if (!bucket) {
      bucket = { allTargets: new Set(), byTarget: new Map() };
      this.buckets.set(type, bucket);
    }
    return bucket;
  }

  private handlersFor(envelope: ScriptMessageEnvelope): ScriptMessageHandler[] {
    const bucket = this.buckets.get(envelope.type);
    if (!bucket) return [];
    const handlers = new Set<ScriptMessageHandler>();
    for (const handler of bucket.allTargets) handlers.add(handler);
    if (envelope.target !== undefined) {
      const targetHandlers = bucket.byTarget.get(envelope.target);
      if (targetHandlers) {
        for (const handler of targetHandlers) handlers.add(handler);
      }
    }
    return [...handlers];
  }

  private recordTrace(entry: ScriptMessageTraceEntry): void {
    if (this.recentTraceLimit <= 0) return;
    this.recentTrace.push(entry);
    if (this.recentTrace.length > this.recentTraceLimit) {
      this.recentTrace.splice(0, this.recentTrace.length - this.recentTraceLimit);
    }
  }
}
