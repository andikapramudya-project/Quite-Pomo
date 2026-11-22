import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { routeLocalFiles } from "./local-files.mjs";

// Optional argument: path to a bundled Playwright index.mjs; otherwise use installed playwright.
const { chromium } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
routeLocalFiles(browser);
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, timezoneId: "Asia/Makassar", reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.addInitScript(() => {
  if (localStorage.getItem("quiet-pomo-state-v1")) return;
  const now = new Date();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  localStorage.setItem("quiet-pomo-state-v1", JSON.stringify({
    settings: { theme: "sage", defaultThemeVersion: 2, ambientSound: "", pomodoro: 30 },
    stats: { date, sessions: 3, focusSeconds: 5400 },
    tasks: [{ id: "task1", name: "Write a thoughtful draft", estimate: 5, done: 3 }], activeTaskId: "task1",
  }));
});
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("quiet-pomo-state-v1")));
await mkdir("artifacts", { recursive: true });
try {
  await page.goto("http://127.0.0.1:5173");
  await page.locator("#sessionCount").waitFor();
  assert.equal(await page.locator("#sessionCount").textContent(), "3");
  await page.screenshot({ path: "artifacts/quiet-pomo-desktop.png", fullPage: true });

  await page.locator("#resetDay").click();
  await page.locator("#confirmCancel").click();
  assert.equal((await stored()).stats.sessions, 3);
  await page.locator("#resetDay").click();
  await page.locator("#confirmAccept").click();
  let saved = await stored();
  assert.equal(saved.history.length, 1);
  assert.equal(saved.history[0].focusSeconds, 5400);
  assert.equal(saved.stats.sessions, 0);
  assert.equal(saved.settings.theme, "sage");
  assert.equal(saved.settings.pomodoro, 30);
  assert.equal(saved.tasks.length, 1);
  await page.reload();
  assert.equal((await stored()).history.length, 1);

  await page.locator("#settingsToggle").click();
  await page.locator("#statisticsTab").click();
  assert.equal(await page.locator("#historyFocus").textContent(), "1h 30m");
  await page.locator('[data-period="7"]').click();
  assert.equal(await page.locator(".chart-column").count(), 7);
  await page.locator('[data-period="30"]').click();
  assert.equal(await page.locator(".chart-column").count(), 30);
  await page.screenshot({ path: "artifacts/quiet-pomo-statistics.png", fullPage: true });
  await page.locator("#historyDate").fill("2020-01-01");
  assert.equal(await page.locator("#historyFocus").textContent(), "0m");
  await page.locator("#clearHistoryDate").click();
  assert.equal(await page.locator("#historyFocus").textContent(), "1h 30m");
  await page.locator("#selectAllHistory").check();
  await page.locator('[data-period="30"]').click();
  assert.equal(await page.locator("#selectAllHistory").isChecked(), false);
  assert.equal(await page.locator("#historyList input").isChecked(), false);
  await page.locator("#selectAllHistory").check();
  await page.locator("#deleteHistory").click();
  await page.locator("#confirmCancel").click();
  assert.equal((await stored()).history.length, 1);
  await page.locator("#deleteHistory").click();
  await page.locator("#confirmAccept").click();
  assert.equal((await stored()).history.length, 0);
  await page.evaluate(() => {
    state.history.push({ id: "keep", date: state.stats.date, sessions: 2, focusSeconds: 3000, reason: "reset" });
    state.history.push({ id: "remove", date: state.stats.date, sessions: 1, focusSeconds: 1500, reason: "reset" });
    render();
  });
  await page.locator('[data-history-id="remove"]').check();
  await page.locator("#deleteHistory").click();
  await page.locator("#confirmAccept").click();
  assert.deepEqual((await stored()).history.map((entry) => entry.id), ["keep"]);

  await page.locator("#setupTab").click();
  const colors = () => page.evaluate(() => {
    const style = (selector) => getComputedStyle(document.querySelector(selector));
    return { card: style(".timer-card").backgroundColor, text: style("#timerDisplay").color, button: style("#startPause").backgroundColor, slider: style("#ambientVolume").getPropertyValue("--control").trim() };
  });
  await page.locator('[data-theme="paper"]').click();
  const paper = await colors();
  await page.locator('[data-theme="sage"]').click();
  const sage = await colors();
  assert.notEqual(paper.card, sage.card);
  assert.equal(paper.text, sage.text);
  assert.equal(paper.button, sage.button);
  assert.equal(paper.slider, sage.slider);
  await page.locator("#customColor").fill("#b6c8e0");
  await page.locator("#customThemeName").fill("Blue hour");
  await page.locator('#customThemeForm button[type="submit"]').click();
  assert.equal((await stored()).settings.customThemes.length, 1);
  await page.locator('#customThemeForm button[type="submit"]').click();
  assert.equal((await stored()).settings.customThemes.length, 1);
  await page.reload();
  assert.equal((await stored()).settings.customThemes[0].name, "Blue hour");
  await page.locator("#settingsToggle").click();
  await page.locator("#setupTab").click();
  await page.locator(".custom-theme-remove").click();
  assert.equal((await stored()).settings.theme, "paper");
  assert.equal(await page.locator(".theme-swatch").count(), 3);
  await page.locator('[data-theme="ink"]').click();
  const ink = await colors();
  assert.equal(ink.text, "rgb(250, 250, 250)");
  await page.screenshot({ path: "artifacts/quiet-pomo-ink.png", fullPage: true });
  await page.locator("#settingsClose").click();

  // A delayed background tick must never count more than the remaining focus duration.
  await page.evaluate(() => {
    state.remainingSeconds = 2;
    state.settings.alarmSound = "";
    startTimer();
    lastTickAt = Date.now() - 120000;
    runSecond();
  });
  saved = await stored();
  assert.equal(saved.stats.focusSeconds, 2);
  assert.equal(saved.stats.sessions, 1);
  assert.equal(saved.mode, "shortBreak");
  await page.locator('[data-mode="pomodoro"]').click();
  await page.locator("#skipMode").click();
  assert.equal((await stored()).stats.sessions, 1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('[data-mode="pomodoro"]').click();
  await page.screenshot({ path: "artifacts/quiet-pomo-mobile.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.locator("#settingsToggle").click();
  await page.locator("#statisticsTab").click();
  await page.screenshot({ path: "artifacts/quiet-pomo-mobile-statistics.png", fullPage: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await page.locator("#settingsDrawer").getAttribute("aria-hidden"), "false");
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("#settingsDrawer").getAttribute("aria-hidden"), "true");

  // The upgrader preserves totals and old custom/Clay colors without duplicating them.
  const upgradeContext = await browser.newContext({ timezoneId: "Asia/Makassar", reducedMotion: "reduce" });
  const upgrade = await upgradeContext.newPage();
  upgrade.on("pageerror", (error) => errors.push(error.message));
  await upgrade.addInitScript(() => {
    if (!localStorage.getItem("quiet-pomo-state-v1")) localStorage.setItem("quiet-pomo-state-v1", JSON.stringify({
      stats: { sessions: 42, focusSeconds: 63000 },
      settings: { theme: "clay", ambientSound: "" },
    }));
  });
  await upgrade.goto("http://127.0.0.1:5173");
  const upgraded = await upgrade.evaluate(() => JSON.parse(localStorage.getItem("quiet-pomo-state-v1")));
  assert.equal(upgraded.history[0].sessions, 42);
  assert.equal(upgraded.history[0].date, null);
  assert.equal(upgraded.settings.customThemes[0].name, "Clay");
  await upgrade.reload();
  assert.equal(await upgrade.evaluate(() => state.history.length), 1);
  assert.equal(await upgrade.evaluate(() => state.settings.customThemes.length), 1);
  await upgrade.locator("#settingsToggle").click();
  await upgrade.locator("#statisticsTab").click();
  await upgrade.locator('[data-period="all"]').click();
  assert.match(await upgrade.locator("#historyList").textContent(), /Data sebelumnya/);
  const downloadEvent = upgrade.waitForEvent("download");
  await upgrade.locator("#exportHistory").click();
  const download = await downloadEvent;
  assert.match(download.suggestedFilename(), /^quiet-pomo-statistics-.*\.json$/);
  await upgradeContext.close();

  // Check a live timer across midnight and make sure reset is canceled on storage failure.
  const midnightContext = await browser.newContext({ timezoneId: "Asia/Makassar", reducedMotion: "reduce" });
  const midnight = await midnightContext.newPage();
  midnight.on("pageerror", (error) => errors.push(error.message));
  await midnight.clock.install({ time: new Date("2026-10-02T23:59:50+08:00") });
  await midnight.goto("http://127.0.0.1:5173");
  const focusStart = await midnight.evaluate(() => { state.settings.ambientSound = ""; state.settings.alarmSound = ""; state.remainingSeconds = 30; startTimer(); return lastTickAt; });
  await midnight.clock.runFor(30000);
  const split = await midnight.evaluate(() => JSON.parse(localStorage.getItem("quiet-pomo-state-v1")));
  assert.equal(split.history.length, 1);
  const beforeMidnight = (new Date("2026-10-03T00:00:00+08:00").getTime() - focusStart) / 1000;
  assert.ok(Math.abs(split.history[0].focusSeconds - beforeMidnight) < 0.000001);
  assert.equal(split.history[0].date, "2026-10-02");
  assert.ok(Math.abs(split.stats.focusSeconds - (30 - beforeMidnight)) < 0.000001);
  assert.equal(split.stats.sessions, 1);
  assert.equal(split.stats.date, "2026-10-03");
  await midnight.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Full", "QuotaExceededError"); }; });
  await midnight.locator("#resetDay").click();
  await midnight.locator("#confirmAccept").click();
  assert.equal(await midnight.evaluate(() => state.stats.focusSeconds), split.stats.focusSeconds);
  assert.equal(await midnight.evaluate(() => state.stats.sessions), 1);
  assert.equal(await midnight.evaluate(() => state.history.length), 1);
  assert.equal(await midnight.locator("#storageWarning").isVisible(), true);
  await midnightContext.close();
  assert.deepEqual(errors, []);
  console.log("Browser smoke passed: reset/archive, persistence, filters, selective deletion, themes, legacy migration, export, midnight, storage failure, timer accounting, desktop/mobile, keyboard, no page errors.");
} finally {
  await browser.close();
}
