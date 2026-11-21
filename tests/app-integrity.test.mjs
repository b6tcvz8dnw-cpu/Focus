import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("main document has a valid Japanese HTML shell", async () => {
  const html = await read("../index.html");
  assert.match(html, /<!doctype html>/i);
  assert.match(html, /<html lang="ja">/i);
  assert.match(html, /<meta name="viewport"[^>]*viewport-fit=cover/i);
  assert.match(html, /<title>FOCUS/);
});

test("all HTML IDs are unique", async () => {
  const html = await read("../index.html");
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test("essential pages and controls remain present", async () => {
  const html = await read("../index.html");
  for (const id of [
    "timerPage",
    "overviewPage",
    "calendarPage",
    "analyticsPage",
    "studyRoomPage",
    "settingsPage",
    "start",
    "reset",
    "hourglassStart",
    "hourglassSandTop",
    "hourglassSandBottom",
    "exportData",
    "importData"
  ]) {
    assert.match(html, new RegExp(`\\bid=["']${id}["']`), `missing #${id}`);
  }
});

test("inline application JavaScript parses without syntax errors", async () => {
  const html = await read("../index.html");
  const match = html.match(/<script\\b[^>]*>([\\s\\S]*?)<\\/script>/i);
  assert.ok(match, "inline application script should exist");
  assert.doesNotThrow(() => new vm.Script(match[1], { filename: "index.html:inline-script" }));
});

test("core timer, study room, and recovery functions remain present", async () => {
  const html = await read("../index.html");
  for (const name of [
    "startTimer",
    "persistTimer",
    "restoreTimerRuntime",
    "complete",
    "tick",
    "startHourglass",
    "updateStudyRoom",
    "updateStudySky",
    "loadStudyRoomWeather"
  ]) {
    assert.match(html, new RegExp(`function\\s+${name}\\s*\\(`), `missing function ${name}`);
  }
});

test("existing local storage keys are preserved", async () => {
  const html = await read("../index.html");
  for (const key of [
    "focus-stats",
    "focus-notifications",
    "focus-timer-runtime",
    "focus-timer-settings",
    "focus-room-quiet-text",
    "focus-appearance",
    "focus-mark"
  ]) {
    assert.ok(html.includes(key), `missing storage key: ${key}`);
  }
});

test("PWA manifest remains valid and standalone-capable", async () => {
  const manifest = JSON.parse(await read("../manifest.webmanifest"));
  assert.equal(manifest.short_name, "FOCUS");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});

test("service worker retains versioned cache and offline assets", async () => {
  const sw = await read("../sw.js");
  assert.match(sw, /const CACHE=['"]focus-pwa-v\\d+['"]/);
  for (const asset of ["./index.html", "./manifest.webmanifest", "./icon.svg"]) {
    assert.ok(sw.includes(asset), `service worker should cache ${asset}`);
  }
  assert.match(sw, /caches\\.match/);
});
