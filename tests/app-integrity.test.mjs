import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import {
  formatClock,
  dateKey,
  buildWeekData,
  getStudySkyLevel
} from "../src/core/date-time.js";

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

test("application entrypoint is a module and parses after its import", async () => {
  const html = await read("../index.html");
  const start = html.indexOf('<script type="module">');
  const end = html.lastIndexOf("</script>");
  assert.ok(start >= 0 && end > start, "module entrypoint should exist");
  const script = html.slice(start + '<script type="module">'.length, end);
  const executable = script.replace(/^\s*import\s+[^;]+;\s*/, "");
  assert.doesNotThrow(() => new vm.Script(executable, { filename: "index.html:module-body" }));
  assert.ok(script.includes("./src/core/date-time.js"), "date-time module should be imported");\n  assert.ok(script.includes("./src/data/storage.js"), "storage module should be imported");\n  assert.ok(!script.includes("localStorage."), "app should use the storage adapter");
});

test("core timer and Study Room functions remain present", async () => {
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

test("service worker caches the extracted module with a new version", async () => {
  const sw = await read("../sw.js");
  const cacheName = sw.match(/const CACHE='([^']+)'/)?.[1];
  assert.equal(cacheName, "focus-pwa-v32");
  for (const asset of [
    "./index.html",
    "./manifest.webmanifest",
    "./icon.svg",
    "./src/core/date-time.js",\n    "./src/data/storage.js"
  ]) {
    assert.ok(sw.includes(asset), `service worker should cache ${asset}`);
  }
  assert.ok(sw.includes("caches.match"), "service worker should have a cache lookup");
});

test("formatClock keeps the existing MM:SS display contract", () => {
  assert.equal(formatClock(0), "00:00");
  assert.equal(formatClock(9), "00:09");
  assert.equal(formatClock(65), "01:05");
  assert.equal(formatClock(1500), "25:00");
});

test("dateKey uses local calendar fields and zero padding", () => {
  assert.equal(dateKey(new Date(2026, 0, 3, 23, 59)), "2026-01-03");
  assert.equal(dateKey(new Date(2026, 10, 21)), "2026-11-21");
});

test("buildWeekData returns seven chronological days without mutating history", () => {
  const history = { "2026-11-19": 25, "2026-11-21": 40 };
  const original = structuredClone(history);
  const week = buildWeekData(history, new Date(2026, 10, 21, 12));
  assert.equal(week.length, 7);
  assert.deepEqual(week.map((day) => day.key), [
    "2026-11-15",
    "2026-11-16",
    "2026-11-17",
    "2026-11-18",
    "2026-11-19",
    "2026-11-20",
    "2026-11-21"
  ]);
  assert.equal(week[4].minutes, 25);
  assert.equal(week[6].minutes, 40);
  assert.deepEqual(history, original);
});

test("buildWeekData normalizes invalid or negative stored minutes", () => {
  const week = buildWeekData({
    "2026-11-20": -5,
    "2026-11-21": "not-a-number"
  }, new Date(2026, 10, 21, 12));
  assert.equal(week[5].minutes, 0);
  assert.equal(week[6].minutes, 0);
});

test("Study Room sky progression preserves all existing thresholds", () => {
  assert.equal(getStudySkyLevel(0), 0);
  assert.equal(getStudySkyLevel(29), 0);
  assert.equal(getStudySkyLevel(30), 1);
  assert.equal(getStudySkyLevel(59), 1);
  assert.equal(getStudySkyLevel(60), 2);
  assert.equal(getStudySkyLevel(119), 2);
  assert.equal(getStudySkyLevel(120), 3);
  assert.equal(getStudySkyLevel(179), 3);
  assert.equal(getStudySkyLevel(180), 4);
});

test("storage adapter reads and writes text and JSON", () => {
  const values = new Map();
  const fakeStorage = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
  const store = createStorage(() => fakeStorage);
  assert.equal(store.getText("missing", "fallback"), "fallback");
  assert.equal(store.setText("theme", "night"), true);
  assert.equal(store.getText("theme"), "night");
  assert.equal(store.setJSON("settings", { focus: 25 }), true);
  assert.deepEqual(store.getJSON("settings"), { focus: 25 });
});

test("storage adapter safely handles malformed JSON and unavailable storage", () => {
  const fakeStorage = {
    getItem: () => "{broken",
    setItem: () => { throw new Error("quota exceeded"); }
  };
  const store = createStorage(() => fakeStorage);
  assert.deepEqual(store.getJSON("broken", { safe: true }), { safe: true });
  assert.equal(store.setText("blocked", "value"), false);
  const unavailable = createStorage(() => { throw new Error("storage blocked"); });
  assert.equal(unavailable.getText("key", "fallback"), "fallback");
  assert.equal(unavailable.setText("key", "value"), false);
});
