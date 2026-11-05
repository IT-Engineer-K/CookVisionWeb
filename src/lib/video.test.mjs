import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("./video.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { isVideoFile, videoFrameOffsets } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("detects videos by MIME or missing-MIME filename, without classifying images as videos", () => {
  assert.equal(isVideoFile({ name: "clip", type: "video/mp4" }), true);
  assert.equal(isVideoFile({ name: "IMG_0001.MOV", type: "" }), true);
  assert.equal(isVideoFile({ name: "clip.mp4", type: "application/octet-stream" }), true);
  assert.equal(isVideoFile({ name: "photo.jpg", type: "image/jpeg" }), false);
  assert.equal(isVideoFile({ name: "photo.mov", type: "image/jpeg" }), false);
  assert.equal(isVideoFile({ name: "notes.txt", type: "" }), false);
});

test("samples a short video at the beginning and near the end", () => {
  const times = videoFrameOffsets(5, 40);
  assert.equal(times.length, 2);
  assert.equal(times[0], 0);
  assert.ok(times.at(-1) < 5 && times.at(-1) > 4.8);
});

test("covers the entire long video within the remaining photo budget", () => {
  const times = videoFrameOffsets(3600, 7);
  assert.equal(times.length, 7);
  assert.equal(times[0], 0);
  assert.ok(times.at(-1) > 3599 && times.at(-1) < 3600);
  for (let i = 1; i < times.length; i++) assert.ok(times[i] > times[i - 1]);
});

test("a single remaining slot takes a frame near the middle", () => {
  const times = videoFrameOffsets(60, 1);
  assert.equal(times.length, 1);
  assert.ok(times[0] > 29 && times[0] < 31);
});

test("subsecond videos never seek past the end", () => {
  for (const time of videoFrameOffsets(0.02, 40)) assert.ok(time >= 0 && time < 0.02);
});

test("rejects unknown durations and invalid photo budgets", () => {
  for (const duration of [0, -1, NaN, Infinity]) assert.throws(() => videoFrameOffsets(duration, 40));
  for (const budget of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => videoFrameOffsets(60, budget));
});
