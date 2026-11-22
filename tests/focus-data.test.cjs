const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../focus-data.js");
const data = globalThis.QuietPomoData;
const at = (day, hour = 12) => new Date(2026, 9, day, hour);
const fresh = (date = data.dateKey(at(3))) => ({ stats: { date, sessions: 0, focusSeconds: 0 }, history: [] });

test("migration preserves undated legacy totals without inventing a day", () => {
  const state = fresh();
  data.migrate(state, { stats: { sessions: 42, focusSeconds: 63000 } }, at(3));
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].date, null);
  assert.equal(state.history[0].sessions, 42);
  assert.equal(state.history[0].focusSeconds, 63000);
  assert.equal(state.stats.focusSeconds, 0);
  const reloaded = data.migrate(fresh(), JSON.parse(JSON.stringify(state)), at(3));
  assert.equal(reloaded.history.length, 1);
});

test("rollover archives the previous day exactly once", () => {
  const state = fresh(data.dateKey(at(2)));
  state.stats.sessions = 2;
  state.stats.focusSeconds = 3000;
  assert.equal(data.rollover(state, at(3)), true);
  assert.equal(data.rollover(state, at(3)), false);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].date, "2026-10-02");
  assert.deepEqual({ ...state.stats, id: undefined }, { id: undefined, date: "2026-10-03", sessions: 0, focusSeconds: 0 });
});

test("empty days and empty resets do not create archive clutter", () => {
  const state = fresh();
  assert.equal(data.archive(state, "reset", at(3)), null);
  data.rollover(state, at(4));
  assert.equal(state.history.length, 0);
});

test("repeated resets keep separate archives on the same day", () => {
  const state = fresh();
  state.stats.focusSeconds = 120;
  data.archive(state, "reset", at(3));
  state.stats.focusSeconds = 60;
  data.archive(state, "reset", at(3));
  assert.equal(state.history.length, 2);
  assert.notEqual(state.history[0].id, state.history[1].id);
  assert.equal(state.history.reduce((sum, entry) => sum + entry.focusSeconds, 0), 180);
});

test("focus crossing local midnight is split between both dates", () => {
  const state = fresh(data.dateKey(at(2)));
  const start = new Date(2026, 9, 2, 23, 59, 50).getTime();
  data.recordFocus(state, start, 30);
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].date, "2026-10-02");
  assert.equal(state.history[0].focusSeconds, 10);
  assert.equal(state.stats.date, "2026-10-03");
  assert.equal(state.stats.focusSeconds, 20);
});

test("midnight split conserves focus even for millisecond-aligned ticks", () => {
  const state = fresh(data.dateKey(at(2)));
  data.recordFocus(state, new Date(2026, 9, 2, 23, 59, 59, 500).getTime(), 2);
  assert.equal(state.history[0].focusSeconds, 0.5);
  assert.equal(state.stats.focusSeconds, 1.5);
  const restored = data.migrate(fresh(), JSON.parse(JSON.stringify(state)), at(3));
  assert.equal(restored.history[0].focusSeconds + restored.stats.focusSeconds, 2);
});

test("periods include today and the first day, excluding future and undated data", () => {
  const now = at(3);
  assert.equal(data.inPeriod({ date: "2026-09-27" }, "7", now), true);
  assert.equal(data.inPeriod({ date: "2026-09-26" }, "7", now), false);
  assert.equal(data.inPeriod({ date: "2026-09-04" }, "30", now), true);
  assert.equal(data.inPeriod({ date: "2026-09-03" }, "30", now), false);
  assert.equal(data.inPeriod({ date: "2026-10-03" }, "1", now), true);
  assert.equal(data.inPeriod({ date: "2026-10-04" }, "7", now), false);
  assert.equal(data.inPeriod({ date: null }, "30", now), false);
  assert.equal(data.inPeriod({ date: null }, "all", now), true);
});

test("invalid calendar dates are rejected", () => {
  assert.equal(data.validDate("2026-02-30"), false);
  assert.equal(data.validDate("2026-13-01"), false);
  assert.equal(data.validDate("2026-10-03"), true);
});
