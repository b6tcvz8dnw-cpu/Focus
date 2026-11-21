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
import { createStorage } from "../src/data/storage.js";
import { getRemainingSeconds, getNextBreakMode } from "../src/core/timer.js";
import { calculateStats } from "../src/data/records.js";
import { normalizeStatsData, normalizeTimerSettings, validateBackupPayload, CURRENT_DATA_SCHEMA_VERSION, CURRENT_BACKUP_VERSION } from "../src/data/schema.js";

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
    "timerPage", "overviewPage", "calendarPage", "analyticsPage",
    "studyRoomPage", "settingsPage", "start", "reset", "hourglassStart",
    "hourglassSandTop", "hourglassSandBottom", "exportData", "importData"
  ]) {
    assert.ok(html.includes('id="' + id + '"'), "missing #" + id);
  }
});

test("HTML loads the external application module and its source parses", async () => {
  const html = await read("../index.html");
  assert.ok(html.includes('<script type="module" src="./src/main.js"></script>'));
  const script = await read("../src/main.js");
  const executable = script.replace(/^\s*import\s+[^;]+;\s*/gm, "");
  assert.doesNotThrow(() => new vm.Script(executable, { filename: "src/main.js" }));
  assert.ok(script.includes("./core/date-time.js"), "date-time module should be imported");
  assert.ok(script.includes("./data/storage.js"), "storage module should be imported");
  assert.ok(script.includes("./core/timer.js"), "timer module should be imported");
  assert.ok(script.includes("./data/records.js"), "record module should be imported");
  assert.ok(!script.includes("localStorage."), "app should use the storage adapter");
});

test("core timer and Study Room functions remain present", async () => {
  const script = await read("../src/main.js");
  for (const name of [
    "startTimer", "persistTimer", "restoreTimerRuntime", "complete",
    "tick", "startHourglass", "updateStudyRoom", "updateStudySky",
    "loadStudyRoomWeather"
  ]) {
    assert.ok(script.includes("function " + name + "("), "missing function " + name);
  }
});

test("existing local storage keys are preserved", async () => {
  const script = await read("../src/main.js");
  for (const key of [
    "focus-stats", "focus-notifications", "focus-timer-runtime",
    "focus-timer-settings", "focus-room-quiet-text",
    "focus-appearance", "focus-mark", "focus-preimport-backup"
  ]) {
    assert.ok(script.includes(key), "missing storage key: " + key);
  }
});

test("PWA manifest remains valid and standalone-capable", async () => {
  const manifest = JSON.parse(await read("../manifest.webmanifest"));
  assert.equal(manifest.short_name, "FOCUS");
  assert.equal(manifest.display, "standalone");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
});

test("service worker caches all extracted modules with a new version", async () => {
  const sw = await read("../sw.js");
  const cacheName = sw.match(/const CACHE='([^']+)'/)?.[1];
  assert.equal(cacheName, "focus-pwa-v36");
  for (const asset of [
    "./index.html", "./manifest.webmanifest", "./icon.svg", "./src/main.js",
    "./src/core/date-time.js", "./src/data/storage.js", "./src/core/timer.js", "./src/data/records.js", "./src/data/schema.js"
  ]) {
    assert.ok(sw.includes(asset), "service worker should cache " + asset);
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
    "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18",
    "2026-11-19", "2026-11-20", "2026-11-21"
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

test("getRemainingSeconds uses an absolute deadline and never goes below zero", () => {
  assert.equal(getRemainingSeconds(11000, 1000), 10);
  assert.equal(getRemainingSeconds(1000, 1000), 0);
  assert.equal(getRemainingSeconds(0, 1000), 0);
});

test("getNextBreakMode preserves short and long break cycle behavior", () => {
  assert.equal(getNextBreakMode(1, 4), "short");
  assert.equal(getNextBreakMode(3, 4), "short");
  assert.equal(getNextBreakMode(4, 4), "long");
  assert.equal(getNextBreakMode(8, 4), "long");
  assert.equal(getNextBreakMode(6, 3), "long");
});

test("calculateStats rebuilds totals and date buckets without mutating inputs", () => {
  const legacyHistory = { "2026-11-20": 12 };
  const records = [
    { date: "2026-11-20", timestamp: new Date(2026, 10, 20).getTime(), minutes: 25 },
    { date: "2026-11-21", timestamp: new Date(2026, 10, 21).getTime(), minutes: 30 }
  ];
  const totals = calculateStats({
    legacyCompleted: 2,
    legacyMinutes: 40,
    legacyHistory,
    records
  });
  assert.equal(totals.completed, 4);
  assert.equal(totals.minutes, 95);
  assert.equal(totals.history["2026-11-20"], 37);
  assert.equal(totals.history["2026-11-21"], 30);
  assert.deepEqual(legacyHistory, { "2026-11-20": 12 });
  assert.equal(records[0].minutes, 25);
});


test("legacy unversioned stats migrate without losing aggregate history", () => {
  const migrated = normalizeStatsData({
    completed: 5,
    minutes: 125,
    history: { "2026-11-20": 100, "2026-11-21": 25, invalid: 900 },
    records: [
      { id: "a", timestamp: new Date(2026, 10, 20, 12).getTime(), date: "2026-11-20", minutes: 25, note: "memo" },
      { id: "b", timestamp: new Date(2026, 10, 21, 12).getTime(), date: "2026-11-21", minutes: 25 }
    ],
    dailyGoal: 90,
    weeklyGoal: 400
  });
  assert.equal(migrated.schemaVersion, CURRENT_DATA_SCHEMA_VERSION);
  assert.equal(migrated.legacyCompleted, 3);
  assert.equal(migrated.legacyMinutes, 75);
  assert.deepEqual(migrated.legacyHistory, { "2026-11-20": 75, "2026-11-21": 0 });
  assert.equal(migrated.records.length, 2);
  assert.equal(migrated.dailyGoal, 90);
  assert.equal(migrated.weeklyGoal, 400);
});

test("schema migration discards malformed records and normalizes invalid goals", () => {
  const migrated = normalizeStatsData({
    completed: -4,
    minutes: "NaN",
    history: { "2026-11-21": -10, "2026-02-30": 20 },
    records: [
      { id: "bad", timestamp: "not-a-date", minutes: 20 },
      { id: "too-long", timestamp: 1790000000000, minutes: 121 },
      { id: "good", timestamp: 1790000000000, minutes: 30, note: "x".repeat(2100) }
    ],
    dailyGoal: -1,
    weeklyGoal: 999999
  });
  assert.equal(migrated.records.length, 1);
  assert.equal(migrated.records[0].note.length, 2000);
  assert.equal(migrated.dailyGoal, 60);
  assert.equal(migrated.weeklyGoal, 300);
  assert.deepEqual(migrated.legacyHistory, { "2026-11-21": 0 });
});

test("existing version-2 JSON backups remain import-compatible", () => {
  const result = validateBackupPayload({
    app: "FOCUS",
    version: 2,
    stats: {
      completed: 2,
      minutes: 50,
      history: { "2026-11-21": 50 },
      records: [
        { id: "old-1", timestamp: 1795262400000, date: "2026-11-21", minutes: 25 },
        { id: "old-2", timestamp: 1795266000000, date: "2026-11-21", minutes: 25 }
      ],
      dailyGoal: 60,
      weeklyGoal: 300
    },
    timerSettings: { focus: 25, short: 5, long: 15, cycle: 4 },
    appearance: { theme: "green" },
    mark: "star",
    notificationsEnabled: true,
    quietText: false
  });
  assert.equal(result.valid, true);
  assert.equal(result.data.version, CURRENT_BACKUP_VERSION);
  assert.equal(result.data.stats.records.length, 2);
  assert.deepEqual(result.data.timerSettings, { focus: 25, short: 5, long: 15, cycle: 4 });
});

test("backup validation rejects unsupported versions and invalid settings before import", () => {
  const base = { app: "FOCUS", version: 3, stats: { records: [] } };
  assert.equal(validateBackupPayload({ ...base, version: 99 }).valid, false);
  assert.equal(validateBackupPayload({ ...base, timerSettings: { focus: 0, short: 5, long: 15, cycle: 4 } }).valid, false);
  assert.equal(validateBackupPayload({ ...base, appearance: { theme: "unknown" } }).valid, false);
  assert.equal(validateBackupPayload({ app: "OTHER", version: 3, stats: { records: [] } }).valid, false);
});

test("timer settings normalizer accepts only bounded integer settings", () => {
  assert.deepEqual(normalizeTimerSettings({ focus: 25, short: 5, long: 15, cycle: 4 }), {
    focus: 25, short: 5, long: 15, cycle: 4
  });
  assert.equal(normalizeTimerSettings({ focus: 0, short: 5, long: 15, cycle: 4 }), null);
});
