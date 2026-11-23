import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { routeLocalFiles } from "./local-files.mjs";
const { chromium } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
routeLocalFiles(browser);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Makassar", reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("quiet-pomo-state-v1")));
const task = (id) => page.locator(`[data-task-id="${id}"]`);
try {
  await page.goto("http://127.0.0.1:5173");
  await page.evaluate(() => {
    state.settings.ambientSound = "";
    state.settings.alarmSound = "";
    addTask("First", 1); addTask("Second", 2); addTask("Third", 1);
    state.tasks.forEach((task, i) => { task.id = `task${i + 1}`; });
    state.activeTaskId = "task1";
    state.remainingSeconds = 1;
    startTimer(); lastTickAt = Date.now() - 1000; runSecond();
  });
  assert.equal((await stored()).activeTaskId, "task2");
  assert.equal((await stored()).tasks[0].completed, true);
  assert.equal(await page.locator("#timerTitle").textContent(), "Rehat singkat");
  assert.match(await page.locator("#contextMeta").textContent(), /Berikutnya: Second/);
  assert.match(await page.locator("#timerStatusText").textContent(), /Sesi fokus selesai/);
  await page.locator("#skipMode").click();
  assert.equal(await page.locator("#currentTask").textContent(), "Second");
  assert.equal(await page.locator("#timerTitle").textContent(), "Sedang dikerjakan");
  // Both short and long break completion show the task only on returning to focus.
  for (const mode of ["shortBreak", "longBreak"]) {
    await page.evaluate((mode) => { setMode(mode); state.remainingSeconds = 1; startTimer(); lastTickAt = Date.now() - 1000; runSecond(); }, mode);
    assert.equal((await stored()).mode, "pomodoro");
    assert.equal(await page.locator("#currentTask").textContent(), "Second");
  }
  // Tasks are visible beside the timer on desktop; no overlay needs opening.
  assert.equal(await page.locator("#view-tasks").isVisible(), true);
  await task("task2").locator(".task-check").click();
  assert.equal(await task("task2").locator(".task-check").getAttribute("aria-checked"), "true");
  assert.equal((await stored()).activeTaskId, "task3");
  assert.equal((await stored()).tasks[1].done, 0); // Manual completion preserves measured Pomodoros.
  await task("task2").locator(".task-check").click();
  await task("task2").locator(".task-select").click();
  assert.equal((await stored()).activeTaskId, "task2");
  await task("task2").locator(".task-expand").click();
  const subtaskInput = task("task2").locator(".subtask-form input");
  await subtaskInput.fill("Research"); await subtaskInput.press("Enter");
  await subtaskInput.fill("Write <draft>"); await subtaskInput.press("Enter");
  await page.evaluate(() => { state.tasks[1].done = 1; state.remainingSeconds = 1; startTimer(); lastTickAt = Date.now() - 1000; runSecond(); });
  assert.equal((await stored()).tasks[1].done, 2);
  assert.equal((await stored()).tasks[1].completed, false);
  assert.equal((await stored()).activeTaskId, "task2");
  await task("task2").locator('.subtask-row input').nth(0).check();
  await task("task2").locator('.subtask-row input').nth(1).check();
  await task("task2").locator(".task-check").click();
  assert.equal((await stored()).tasks[1].completed, true);
  await task("task2").locator('.subtask-row input').nth(0).uncheck();
  assert.equal((await stored()).tasks[1].completed, false);
  await page.reload();
  assert.equal((await stored()).tasks[1].subtasks.length, 2);
  assert.equal((await stored()).tasks[1].subtasks[0].completed, false);
  await task("task2").locator(".task-expand").click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    if (width === 390) await page.locator('.nav-item[data-nav="tasks"]').click();
    await page.screenshot({ path: `artifacts/tasks-subtasks-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  }
  await page.locator('.nav-item[data-nav="stats"]').click();
  const oldBackup = { app: "Quiet Pomo", version: 2, exportedAt: "2026-10-03T00:00:00Z", current: { date: "2026-10-03", sessions: 2, focusSeconds: 1800 }, history: [{ id: "legacy", date: null, sessions: 42, focusSeconds: 63000 }] };
  const upload = async (backup) => page.locator("#importHistoryFile").setInputFiles({ name: "old-export.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(backup)) });
  const before = await stored();
  await upload(oldBackup);
  await page.locator("#confirmDialog").waitFor({ state: "visible" });
  assert.equal(await page.locator("#confirmDialog").isVisible(), true);
  await page.locator("#confirmCancel").click();
  assert.equal((await stored()).history.length, before.history.length);
  await upload(oldBackup); await page.locator("#confirmAccept").click();
  assert.equal((await stored()).history.length, before.history.length + 2);
  assert.deepEqual((await stored()).stats, before.stats);
  assert.deepEqual((await stored()).tasks, before.tasks);
  await upload(oldBackup); await page.locator("#confirmAccept").click();
  assert.equal((await stored()).history.length, before.history.length + 2);
  const overlapping = { ...oldBackup, history: [], current: { date: before.stats.date, sessions: 1, focusSeconds: 500 } };
  await upload(overlapping);
  await page.locator("#confirmImportOptions").waitFor({ state: "visible" });
  assert.equal(await page.locator("#confirmImportCurrent").isChecked(), false);
  await page.locator("#confirmAccept").click();
  assert.equal((await stored()).history.length, before.history.length + 2);
  await upload(overlapping);
  await page.locator("#confirmImportOptions").waitFor({ state: "visible" });
  await page.locator("#confirmImportCurrent").check();
  await page.locator("#confirmAccept").click();
  assert.equal((await stored()).history.length, before.history.length + 3);
  const persisted = await stored();
  await upload({ ...oldBackup, version: 999 });
  assert.equal(await page.locator("#confirmDialog").isVisible(), false);
  assert.deepEqual(await stored(), persisted);
  // Import is transactional when localStorage is full.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await upload({ ...oldBackup, history: [{ id: "new-entry", date: "2026-10-01", sessions: 1, focusSeconds: 1200 }] });
  await page.locator("#confirmAccept").click();
  assert.equal(await page.evaluate(() => state.history.length), persisted.history.length);
  assert.equal(await page.locator("#storageWarning").isVisible(), true);

  const audioContext = await browser.newContext();
  const audioPage = await audioContext.newPage();
  audioPage.on("pageerror", (error) => errors.push(error.message));
  await audioPage.addInitScript(() => {
    window.audioEvents = []; window.audioClock = 0; window.immediateAlarms = 0;
    class FakeAudioContext {
      state = "running";
      destination = {};
      get currentTime() { return window.audioClock; }
      resume() { return Promise.resolve(); }
      decodeAudioData() { return window.delayDecode ? new Promise((resolve) => { window.finishDecode = resolve; }) : Promise.resolve({}); }
      createBufferSource() {
        const event = { stopped: false, at: null };
        window.audioEvents.push(event);
        return { connect() {}, disconnect() {}, start(at) { event.at = at; }, stop() { event.stopped = true; }, onended: null };
      }
    }
    window.AudioContext = FakeAudioContext;
    window.Audio = class { play() { window.immediateAlarms += 1; return Promise.resolve(); } };
  });
  await audioPage.goto("http://127.0.0.1:5173");
  const start = async () => {
    await audioPage.evaluate(() => {
      state.settings.ambientSound = ""; state.settings.alarmSound = "assets/notification/victory.mp3";
      setMode("pomodoro"); state.remainingSeconds = 10; startTimer();
    });
    await audioPage.waitForFunction(() => scheduledAlarm !== null);
  };
  await start();
  assert.ok(await audioPage.evaluate(() => Math.abs(scheduledAlarm.at - audioClock - 10) < 1));
  await audioPage.evaluate(() => pauseTimer());
  assert.equal(await audioPage.evaluate(() => audioEvents.at(-1).stopped), true);
  await start();
  const skippedSource = await audioPage.evaluate(() => audioEvents.length - 1);
  await audioPage.evaluate(() => skipMode());
  assert.equal(await audioPage.evaluate((index) => audioEvents[index].stopped, skippedSource), true);
  await audioPage.evaluate(() => pauseTimer());
  await start();
  await audioPage.evaluate(() => setMode(state.mode));
  assert.equal(await audioPage.evaluate(() => audioEvents.at(-1).stopped), true);
  await start();
  // Simulate a throttled UI interval: the scheduled audio has already started.
  await audioPage.evaluate(() => { audioClock = scheduledAlarm.at + 1; lastTickAt = Date.now() - 11000; runSecond(); });
  assert.equal(await audioPage.evaluate(() => immediateAlarms), 0);
  assert.equal(await audioPage.evaluate(() => audioEvents.at(-1).stopped), false);
  assert.equal(await audioPage.evaluate(() => state.stats.sessions), 1);
  // A fetch/decode resolving after Pause must never arm an old alarm.
  await audioPage.evaluate(() => { alarmBuffers.clear(); window.delayDecode = true; setMode("pomodoro"); startTimer(); });
  await audioPage.waitForFunction(() => typeof finishDecode === "function");
  const sources = await audioPage.evaluate(() => audioEvents.length);
  await audioPage.evaluate(async () => { pauseTimer(); finishDecode({}); await Promise.resolve(); });
  assert.equal(await audioPage.evaluate(() => audioEvents.length), sources);
  await audioContext.close();

  // Exercise actual Chrome Web Audio decoding and the dedicated Worker, too.
  const realContext = await browser.newContext();
  const realPage = await realContext.newPage();
  realPage.on("pageerror", (error) => errors.push(error.message));
  await realPage.goto("http://127.0.0.1:5173");
  await realPage.evaluate(() => { state.settings.ambientSound = ""; state.remainingSeconds = 30; });
  await realPage.locator("#startPause").click();
  await realPage.waitForFunction(() => scheduledAlarm?.source.buffer?.duration > 0 && audioContext.state === "running");
  assert.ok(await realPage.evaluate(() => scheduledAlarm.at > audioContext.currentTime));
  assert.equal(await realPage.evaluate(() => timerWorker instanceof Worker), true);
  await realPage.evaluate(() => { clearInterval(timerId); timerId = null; });
  // Worker messages must update accounting even with the UI interval removed.
  await realPage.waitForFunction(() => state.remainingSeconds < 30, null, { timeout: 5000 });
  await realPage.locator("#startPause").click();
  assert.equal(await realPage.evaluate(() => scheduledAlarm), null);
  await realContext.close();
  assert.deepEqual(errors, []);
  console.log("Task/timer/import regressions passed: breaks, checklist, selection, subtasks, persistence, mobile, v2 import, cancellation, deduplication, validation, storage rollback, audio scheduling/cancellation and delayed callbacks.");
} finally { await browser.close(); }
