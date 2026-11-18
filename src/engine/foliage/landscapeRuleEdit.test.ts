import assert from "node:assert/strict";
import { test } from "vitest";
import {
  addRule,
  duplicateRule,
  moveRule,
  nextRuleId,
  removeRule,
  ruleIndex,
} from "./landscapeRuleEdit.ts";

test("nextRuleId fills the first gap and compares ids as strings", () => {
  assert.equal(nextRuleId([]), "rule-1");
  assert.equal(nextRuleId([
    { id: "rule-3" },
    { id: "rule-1" },
    { id: "rule-1" },
    { id: "rule-02" },
    { id: "forest" },
    { id: "" },
  ]), "rule-2");
});

test("addRule appends caller defaults and overrides with a fresh id and independent nested values", () => {
  const existing = { id: "rule-1" };
  const rules = Object.freeze([existing]);
  const defaults = {
    id: "",
    layer: "",
    density: 0.25,
    minWeight: 0.5,
    height: { enabled: false, min: -10000, max: 10000, falloff: 0 },
    noise: { amount: 0, scale: 20 },
  };
  const fields = { id: "rule-1", layer: "forest", density: 0, noise: { amount: 0.4, scale: 25 } };
  const defaultsBefore = structuredClone(defaults);
  const fieldsBefore = structuredClone(fields);

  const added = addRule(rules, defaults, fields);
  assert.equal(added.id, "rule-2");
  assert.deepEqual(added.rules, [existing, { ...defaultsBefore, ...fieldsBefore, id: "rule-2" }]);
  assert.equal(added.rules[0], existing);
  assert.notEqual(added.rules, rules);
  assert.deepEqual(rules, [{ id: "rule-1" }]);
  assert.deepEqual(defaults, defaultsBefore);
  assert.deepEqual(fields, fieldsBefore);

  defaults.height.min = -500;
  fields.noise.amount = 0.7;
  assert.deepEqual(added.rules[1], { ...defaultsBefore, ...fieldsBefore, id: "rule-2" });
});

test("removeRule removes matching ids and returns a new array for an absent id", () => {
  const kept = { id: "rule-2" };
  const rules = Object.freeze([{ id: "rule-1" }, kept, { id: "rule-1" }]);

  assert.deepEqual(removeRule(rules, "rule-1"), [kept]);
  const absent = removeRule(rules, "missing");
  assert.deepEqual(absent, rules);
  assert.notEqual(absent, rules);
});

test("moveRule moves up and down and clamps at both ends", () => {
  const first = { id: "first" };
  const second = { id: "second" };
  const third = { id: "third" };
  const fourth = { id: "fourth" };
  const rules = Object.freeze([first, second, third, fourth]);

  assert.deepEqual(moveRule(rules, "third", -1), [first, third, second, fourth]);
  assert.deepEqual(moveRule(rules, "second", 1), [first, third, second, fourth]);
  assert.deepEqual(moveRule(rules, "third", -10), [third, first, second, fourth]);
  assert.deepEqual(moveRule(rules, "second", 10), [first, third, fourth, second]);
});

test("moveRule returns an unchanged copy for zero delta or an absent id", () => {
  const rules = Object.freeze([{ id: "rule-1" }, { id: "rule-2" }]);
  const noMovement = moveRule(rules, "rule-1", 0);
  const absent = moveRule(rules, "missing", 1);

  assert.deepEqual(noMovement, rules);
  assert.notEqual(noMovement, rules);
  assert.deepEqual(absent, rules);
  assert.notEqual(absent, rules);
});

test("duplicateRule inserts a deep copy after the source with a fresh id", () => {
  const source = { id: "rule-1", slope: { min: 0, max: 90, falloff: 0 }, extra: { values: [1, 2] } };
  const last = { id: "rule-3" };
  const rules = Object.freeze([source, last]);
  const expectedCopy = { ...structuredClone(source), id: "rule-2" };

  const duplicated = duplicateRule(rules, source.id);
  assert.equal(duplicated.id, "rule-2");
  assert.deepEqual(duplicated.rules, [source, expectedCopy, last]);
  assert.equal(duplicated.rules[0], source);
  assert.equal(duplicated.rules[2], last);

  source.slope.max = 60;
  source.extra.values.push(3);
  assert.deepEqual(duplicated.rules[1], expectedCopy);
});

test("duplicateRule returns an unchanged copy and null for an absent id", () => {
  const rules = Object.freeze([{ id: "rule-1" }]);
  const duplicated = duplicateRule(rules, "missing");

  assert.equal(duplicated.id, null);
  assert.deepEqual(duplicated.rules, rules);
  assert.notEqual(duplicated.rules, rules);
});

test("ruleIndex finds the first exact match and returns -1 for an absent id", () => {
  const rules = [{ id: "" }, { id: "rule-01" }, { id: "rule-1" }, { id: "rule-1" }];

  assert.equal(ruleIndex(rules, ""), 0);
  assert.equal(ruleIndex(rules, "rule-1"), 2);
  assert.equal(ruleIndex(rules, "rule-2"), -1);
});
