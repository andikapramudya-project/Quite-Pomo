const { test } = require("node:test");
const assert = require("node:assert/strict");
require("../focus-data.js");
const data = globalThis.QuietPomoData;
const stats = (overrides = {}) => ({ id: "live", date: "2026-10-07", sessions: 2, focusSeconds: 3000, ...overrides });
const fresh = () => ({ stats: stats(), history: [] });
const file = (overrides = {}) => ({ app: "Quiet Pomo", version: 2, exportedAt: "2026-10-07T00:00:00Z", current: stats({ id: undefined, date: "2026-10-06" }), history: [], ...overrides });

test("the previous v2 export imports without changing live totals and is idempotent after reload", () => {
  const backup = data.parseBackup(file({ history: [{ id: "old", date: null, sessions: 42, focusSeconds: 63000 }] }));
  const original = fresh();
  const merged = data.mergeBackup(original, backup);
  assert.deepEqual(original, fresh());
  assert.deepEqual(merged.stats, original.stats);
  assert.equal(merged.history.length, 2);
  assert.equal(merged.history[0].date, null);
  const restored = data.migrate(fresh(), JSON.parse(JSON.stringify(merged)), new Date(2026, 9, 7));
  assert.equal(data.mergeBackup(restored, backup).added, 0);
  assert.equal(data.mergeBackup(restored, backup).history.length, 2);
});

test("v2 current matching live or archived totals is not duplicated", () => {
  const backup = data.parseBackup(file({ current: stats({ id: undefined }) }));
  assert.equal(data.mergeBackup(fresh(), backup).added, 0);
  const state = fresh();
  state.history.push(stats({ id: "archive", date: "2026-10-06" }));
  assert.equal(data.mergeBackup(state, data.parseBackup(file())).added, 0);
});

test("v3 snapshots merge cumulative counters and own exports do not duplicate active totals", () => {
  const state = fresh();
  const own = data.parseBackup(file({ version: 3, current: state.stats }));
  assert.equal(data.mergeBackup(state, own).added, 0);
  const first = data.parseBackup(file({ version: 3, current: stats({ id: "other" }) }));
  const merged = data.mergeBackup(state, first);
  const later = data.parseBackup(file({ version: 3, current: stats({ id: "other", sessions: 4, focusSeconds: 6000 }) }));
  const next = data.mergeBackup(merged, later);
  assert.equal(next.history.length, 1);
  assert.equal(next.history[0].focusSeconds, 6000);
  assert.equal(next.updated, 1);
  assert.equal(data.mergeBackup(next, first).history[0].focusSeconds, 6000);
  const archived = data.parseBackup(file({ version: 3, current: stats({ id: "new", sessions: 0, focusSeconds: 0 }), history: [stats({ id: "archive-other", sourceId: "other", sessions: 4, focusSeconds: 6000 })] }));
  assert.equal(data.mergeBackup(next, archived).history.length, 1);
});

test("different resets on the same date remain separate and empty snapshots add nothing", () => {
  const backup = data.parseBackup(file({ current: stats({ sessions: 0, focusSeconds: 0 }), history: [stats({ id: "reset-1" }), stats({ id: "reset-2" })] }));
  assert.equal(data.mergeBackup(fresh(), backup).history.length, 2);
});

test("malformed, future-version, invalid-date and nonfinite backups are rejected atomically", () => {
  for (const invalid of [file({ app: "Other" }), file({ version: 99 }), file({ history: null }), file({ current: stats({ date: "2026-02-30" }) }), file({ current: stats({ focusSeconds: Infinity }) }), file({ current: stats({ sessions: -1 }) }), file({ history: [{}] })]) {
    assert.throws(() => data.parseBackup(invalid));
  }
  const state = fresh();
  state.history.push(stats({ id: "conflict" }));
  const bad = data.parseBackup(file({ history: [stats({ id: "conflict", date: "2026-10-06" })] }));
  assert.throws(() => data.mergeBackup(state, bad));
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].date, "2026-10-07");
});

test("active counter IDs persist through migration and change when the day changes", () => {
  const initial = fresh();
  const sameDay = data.migrate(fresh(), initial, new Date(2026, 9, 7));
  assert.equal(sameDay.stats.id, "live");
  data.rollover(sameDay, new Date(2026, 9, 8));
  assert.notEqual(sameDay.stats.id, "live");
  assert.equal(sameDay.history[0].sourceId, "live");
});
