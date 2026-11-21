import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("main document has a valid Japanese HTML shell", async () => {
  const html = await read("../index.html");
  assert.ok(html.toLowerCase().includes("<!doctype html>"));
  assert.ok(html.includes('<html lang="ja">'));
  assert.ok(html.includes("viewport-fit=cover"));
  assert.ok(html.includes("<title>FOCUS"));
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
    assert.ok(html.includes(`id="${id}"`), `missing #${id}`);
  }
});

test("inline application JavaScript parses without syntax errors", async () => {
  const html = await read("../index.html");
  const start = html.indexOf("<script>");
  const end = html.lastIndexOf("</script>");
  assert.ok(start >= 0 && end > start, "inline application script should exist");
  const script = html.slice(start + "<script>".length, end);
  assert.doesNotThrow(() => new vm.Script(script, { filename: "index.html:inline-script" }));
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
    assert.ok(html.includes(`function ${name}(`), `missing function ${name}`);
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
  const cacheName = sw.match(/const CACHE='([^']+)'/)?.[1];
  assert.ok(cacheName?.startsWith("focus-pwa-v"), "service worker cache should be versioned");
  for (const asset of ["./index.html", "./manifest.webmanifest", "./icon.svg"]) {
    assert.ok(sw.includes(asset), `service worker should cache ${asset}`);
  }
  assert.ok(sw.includes("caches.match"), "service worker should have a cache lookup");
});
