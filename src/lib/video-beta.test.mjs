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

const { videoBetaEmail } = await load("./video-beta.ts");
const { mp4Duration } = await load("./mp4.ts");

function box(type, ...parts) {
  const data = Buffer.concat(parts);
  const header = Buffer.alloc(8);
  header.writeUInt32BE(data.length + 8);
  header.write(type, 4);
  return Buffer.concat([header, data]);
}

function makeMovie(movieSeconds, trackSeconds, handler = "vide", fragment = false) {
  const duration = (seconds) => {
    const data = Buffer.alloc(20);
    data.writeUInt32BE(1000, 12);
    data.writeUInt32BE(seconds * 1000, 16);
    return data;
  };
  const track = box("trak", box("mdia", box("mdhd", duration(trackSeconds)),
    box("hdlr", Buffer.alloc(8), Buffer.from(handler))));
  return Buffer.concat([
    box("ftyp", Buffer.from("isom\0\0\0\0")),
    box("moov", box("mvhd", duration(movieSeconds)), track, ...(fragment ? [box("mvex")] : [])),
    box("mdat", Buffer.from([1])),
  ]);
}

test("video beta requires a confirmed email at the exact university domain", () => {
  const confirmed = { email_confirmed_at: "2026-11-17T00:00:00Z" };
  assert.equal(videoBetaEmail({ ...confirmed, email: "Alumni@MS.DENDAI.AC.JP" }), "alumni@ms.dendai.ac.jp");
  for (const email of ["x@dendai.ac.jp", "x@ms.dendai.ac.jp.example", "x@mail.ms.dendai.ac.jp",
    "x@y@ms.dendai.ac.jp", "x@ms.dendai.ac.jp\n", "@ms.dendai.ac.jp"]) {
    assert.equal(videoBetaEmail({ ...confirmed, email }), null);
  }
  assert.equal(videoBetaEmail({ email: "x@ms.dendai.ac.jp" }), null);
});

test("MP4 duration covers longer tracks so a short movie header cannot hide a long track", () => {
  assert.equal(mp4Duration(makeMovie(2.5, 2.5)), 2.5);
  assert.equal(mp4Duration(makeMovie(1, 60)), 60);
});

test("MP4 duration rejects malformed containers, audio-only files and fragmented MP4", () => {
  const clip = makeMovie(1, 1);
  for (const bytes of [clip.subarray(0, clip.length - 2), makeMovie(1, 1, "soun"),
    makeMovie(1, 1, "vide", true), Buffer.from("fake mp4")]) {
    assert.equal(mp4Duration(bytes), null);
  }
});
