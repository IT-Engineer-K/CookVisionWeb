import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function load(file) {
  const source = await readFile(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
}

const { isPlusSubscription } = await load("./subscription.ts");

test("active and trialing subscriptions grant Plus access before period end", () => {
  const now = Date.parse("2026-11-24T00:00:00Z");
  assert.equal(
    isPlusSubscription({ status: "active", current_period_end: "2026-12-24T00:00:00Z" }, now),
    true,
  );
  assert.equal(
    isPlusSubscription({ status: "trialing", current_period_end: null }, now),
    true,
  );
});

test("expired, canceled, or missing subscriptions do not grant Plus access", () => {
  const now = Date.parse("2026-11-24T00:00:00Z");
  assert.equal(isPlusSubscription(null, now), false);
  assert.equal(
    isPlusSubscription({ status: "canceled", current_period_end: "2026-12-24T00:00:00Z" }, now),
    false,
  );
  assert.equal(
    isPlusSubscription({ status: "past_due", current_period_end: "2026-12-24T00:00:00Z" }, now),
    false,
  );
  assert.equal(
    isPlusSubscription({ status: "active", current_period_end: "2026-11-23T23:59:59Z" }, now),
    false,
  );
});
