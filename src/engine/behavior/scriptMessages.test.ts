// Ported from Forge WebGL tools/engine-tests.ts @ forge-webgl-final (04b5fb23): each check is
// copied unchanged and runs as a Vitest test; docs/PORT_LOG.md §2.
import assert from "node:assert/strict";
import { ScriptMessageBus } from "./scriptMessages.ts";
import { test } from "vitest";

const check = test;

check("script message bus dispatches by message type and target", () => {
  const deliveries: string[] = [];
  const bus = new ScriptMessageBus({
    targetExists: (target) => target === "lamp" || target === "switch",
  });

  bus.subscribe("Toggleable.Toggle", (envelope) => {
    deliveries.push(`any:${envelope.source}->${envelope.target ?? "*"}`);
  });
  bus.subscribe(
    "Toggleable.Toggle",
    (envelope) => {
      deliveries.push(`lamp:${String(envelope.payload.enabled)}`);
    },
    { target: "lamp" },
  );
  bus.subscribe("Lamp.Toggled", (envelope) => {
    deliveries.push(`emit:${String(envelope.payload.enabled)}`);
  });

  const sent = bus.send({
    frame: 12,
    type: "Toggleable.Toggle",
    source: "switch",
    target: "lamp",
    payload: { enabled: true },
  });
  const emitted = bus.emit({
    frame: 12,
    type: "Lamp.Toggled",
    source: "lamp",
    payload: { enabled: true },
  });
  const result = bus.flush();

  assert.equal(sent.id, "script-message:1");
  assert.equal(emitted.id, "script-message:2");
  assert.deepEqual(deliveries, ["any:switch->lamp", "lamp:true", "emit:true"]);
  assert.deepEqual(result, { processed: 2, delivered: 3, warnings: [] });
  assert.deepEqual(
    bus.getRecentTrace().map((entry) => ({
      type: entry.envelope.type,
      source: entry.envelope.source,
      target: entry.envelope.target ?? null,
      status: entry.status,
      delivered: entry.delivered,
    })),
    [
      {
        type: "Toggleable.Toggle",
        source: "switch",
        target: "lamp",
        status: "delivered",
        delivered: 2,
      },
      {
        type: "Lamp.Toggled",
        source: "lamp",
        target: null,
        status: "delivered",
        delivered: 1,
      },
    ],
  );
  assert.equal(bus.pendingCount(), 0);
});

check("script message bus reports missing target and missing handler", () => {
  const bus = new ScriptMessageBus({
    targetExists: (target) => target === "lamp",
  });

  bus.send({
    type: "Toggleable.Toggle",
    source: "switch",
    target: "missing-lamp",
  });
  bus.send({
    type: "Door.Open",
    source: "switch",
    target: "lamp",
  });
  const result = bus.flush();

  assert.equal(result.processed, 2);
  assert.equal(result.delivered, 0);
  assert.deepEqual(
    result.warnings.map((warning) => warning.code),
    ["missing-target", "missing-handler"],
  );
  assert.equal(result.warnings[0]?.envelope?.target, "missing-lamp");
  assert.equal(result.warnings[1]?.envelope?.type, "Door.Open");
  assert.deepEqual(
    bus.getRecentTrace().map((entry) => ({
      type: entry.envelope.type,
      target: entry.envelope.target,
      status: entry.status,
      warning: entry.warnings[0]?.code,
    })),
    [
      {
        type: "Toggleable.Toggle",
        target: "missing-lamp",
        status: "missing-target",
        warning: "missing-target",
      },
      {
        type: "Door.Open",
        target: "lamp",
        status: "missing-handler",
        warning: "missing-handler",
      },
    ],
  );
});

check("script message bus keeps dispatch target-indexed under many subscribers", () => {
  const bus = new ScriptMessageBus({ recentTraceLimit: 3 });
  const deliveries: string[] = [];
  for (let i = 0; i < 1000; i += 1) {
    const target = `actor:${i}`;
    bus.subscribe("Perf.Ping", () => deliveries.push(target), { target });
  }

  for (let i = 0; i < 5; i += 1) {
    bus.send({ frame: i, type: "Perf.Ping", source: "sender", target: "actor:999" });
  }
  const result = bus.flush();

  assert.equal(result.processed, 5);
  assert.equal(result.delivered, 5);
  assert.equal(deliveries.length, 5);
  assert.equal(deliveries.every((target) => target === "actor:999"), true);
  assert.deepEqual(
    bus.getRecentTrace().map((entry) => entry.envelope.frame),
    [2, 3, 4],
  );
});

check("script message bus can disable recent debug trace", () => {
  const bus = new ScriptMessageBus({ recentTraceLimit: 0 });
  let delivered = 0;
  bus.subscribe("Trace.Off", () => {
    delivered += 1;
  });

  bus.emit({ frame: 1, type: "Trace.Off", source: "sender" });
  const result = bus.flush();

  assert.equal(delivered, 1);
  assert.equal(result.processed, 1);
  assert.equal(bus.getRecentTrace().length, 0);
});

check("script message bus guards recursive flush while allowing queued follow-up messages", () => {
  const bus = new ScriptMessageBus();
  let nestedWarnings: readonly string[] = [];
  const deliveries: string[] = [];

  bus.subscribe("Ping", (envelope) => {
    nestedWarnings = bus.flush().warnings.map((warning) => warning.code);
    deliveries.push(envelope.type);
    bus.emit({ type: "Pong", source: envelope.source });
  });
  bus.subscribe("Pong", (envelope) => {
    deliveries.push(envelope.type);
  });

  bus.emit({ type: "Ping", source: "switch" });
  const result = bus.flush();

  assert.deepEqual(nestedWarnings, ["recursive-dispatch"]);
  assert.deepEqual(deliveries, ["Ping", "Pong"]);
  assert.deepEqual(
    result.warnings.map((warning) => warning.code),
    ["recursive-dispatch"],
  );
  assert.equal(result.processed, 2);
  assert.equal(result.delivered, 2);
});
