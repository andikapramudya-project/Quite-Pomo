import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { routeLocalFiles } from "./local-files.mjs";

// Design review for the "Quiet Desk" redesign: interaction states, keyboard paths, layout at
// five widths × three themes, touch targets, palette contrast, 200% text and reduced motion.
const { chromium } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
routeLocalFiles(browser);
const origin = "http://127.0.0.1:5173";
const errors = [];
const results = { layouts: [], contrast: {}, interactions: [] };
await mkdir("artifacts/redesign", { recursive: true });
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
  await page.locator("#timerDisplay").waitFor();

  // A first visit writes no demo data.
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem("quiet-pomo-state-v1")));
  assert.deepEqual(first.tasks, []);
  assert.deepEqual(first.history, []);
  assert.equal(await page.locator("#taskList .empty-state").count(), 1);
  assert.equal(await page.evaluate(() => document.body.dataset.timer), "idle");
  assert.equal(await page.locator("#resetTimer").isDisabled(), true);

  // Timer states are distinct: idle → running → paused → idle (Ulang), each with its own label.
  await page.evaluate(() => { state.settings.alarmSound = ""; state.settings.ambientSound = ""; });
  await page.locator("#startPause").click();
  assert.equal(await page.evaluate(() => document.body.dataset.timer), "running");
  assert.equal(await page.locator("#startPauseLabel").textContent(), "Jeda");
  assert.equal(await page.locator("#timerStatusText").textContent(), "Fokus berjalan");
  await page.evaluate(() => { lastTickAt -= 3000; runSecond(); });
  await page.locator("#startPause").click();
  assert.equal(await page.evaluate(() => document.body.dataset.timer), "paused");
  assert.equal(await page.locator("#startPauseLabel").textContent(), "Lanjutkan");
  assert.match(await page.title(), /Dijeda/);
  await page.locator("#resetTimer").click();
  assert.equal(await page.evaluate(() => document.body.dataset.timer), "idle");
  assert.equal(await page.locator("#startPauseLabel").textContent(), "Mulai fokus");
  results.interactions.push("idle/running/paused/reset states");

  // Space starts and pauses when focus is not on a control.
  await page.locator("body").click({ position: { x: 5, y: 500 } });
  await page.keyboard.press("Space");
  assert.equal(await page.evaluate(() => state.isRunning), true);

  // Changing mode during a focus session asks first; Escape keeps the session running.
  await page.locator('[data-mode="shortBreak"]').click();
  assert.equal(await page.locator("#confirmDialog").isVisible(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => [state.mode, state.isRunning].join()), "pomodoro,true");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.mode), "shortBreak");
  await page.keyboard.press("Space"); // On a focused radio Space activates it, not the timer shortcut.
  await page.locator("#confirmAccept").click();
  assert.equal(await page.evaluate(() => [state.mode, state.isRunning].join()), "shortBreak,false");
  assert.equal(await page.locator("#startPauseLabel").textContent(), "Mulai rehat");
  assert.equal(await page.evaluate(() => document.body.dataset.rest), "true");
  // Keyboard radio navigation when idle switches mode directly.
  await page.locator('[data-mode="shortBreak"]').focus();
  await page.keyboard.press("Home");
  assert.equal(await page.evaluate(() => state.mode), "pomodoro");
  results.interactions.push("mode confirm, Escape, radio keyboard, Space shortcut");

  // Task form validation, selection vs completion, delete with undo.
  await page.locator("#taskForm button[type=submit]").click();
  assert.equal(await page.locator("#taskInput").getAttribute("aria-invalid"), "true");
  assert.match(await page.locator("#taskFormHint").textContent(), /Tulis nama tugas/);
  await page.locator("#taskInput").fill("Menyusun rencana fokus");
  assert.equal(await page.locator("#taskInput").getAttribute("aria-invalid"), null);
  await page.locator('.estimate-step[data-step="1"]').click();
  await page.locator("#taskInput").press("Enter");
  await page.locator("#taskInput").fill("Fokus".repeat(40));
  await page.locator("#taskInput").press("Enter");
  const ids = await page.evaluate(() => state.tasks.map((task) => task.id));
  assert.equal(await page.evaluate(() => state.tasks[0].estimate), 2);
  assert.equal(await page.evaluate(() => state.activeTaskId), ids[0]);
  await page.locator(`[data-task-id="${ids[1]}"] .task-select`).click();
  assert.equal(await page.evaluate(() => state.activeTaskId), ids[1]);
  assert.equal(await page.locator(`[data-task-id="${ids[1]}"] .active-chip`).count(), 1);
  assert.equal(await page.locator(`[data-task-id="${ids[0]}"] .task-check`).getAttribute("aria-checked"), "false");
  await page.locator(`[data-task-id="${ids[0]}"] .task-check`).focus();
  await page.keyboard.press("Space");
  assert.equal(await page.locator(`[data-task-id="${ids[0]}"] .task-check`).getAttribute("aria-checked"), "true");
  assert.equal(await page.evaluate(() => document.activeElement.dataset.role), "check"); // Focus survives the move.
  assert.equal(await page.evaluate(() => state.stats.sessions), 0); // A checklist tick is not focus time.
  await page.locator(`[data-task-id="${ids[0]}"] .task-check`).click();
  await page.locator(`[data-task-id="${ids[0]}"] .task-expand`).click();
  await page.locator(`[data-task-id="${ids[0]}"] [data-role="delete"]`).click();
  assert.equal(await page.evaluate(() => state.tasks.length), 1);
  await page.locator("#statusAction").click();
  assert.equal(await page.evaluate(() => state.tasks.map((task) => task.id).join()), ids.join());
  results.interactions.push("task validation, select vs complete, focus retention, delete undo");

  // Task picker sheet: radio semantics, Escape, focus return.
  await page.locator("#changeTask").click();
  assert.equal(await page.locator("#taskSheet").isVisible(), true);
  assert.equal(await page.locator('#taskPickList [aria-checked="true"]').count(), 1);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("#taskSheet").isVisible(), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), "changeTask");
  results.interactions.push("task picker sheet");

  // Layout across widths and themes with long content in every view.
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const theme of ["paper", "sage", "ink"]) {
      await page.evaluate((theme) => { state.settings.theme = theme; render(); }, theme);
      for (const view of ["focus", "tasks", "stats", "settings"]) {
        await page.evaluate((view) => setView(view), view);
        assert.equal(await noOverflow(page), true, `${width}/${theme}/${view}: horizontal overflow`);
        const small = await page.locator("button, [role=radio], .switch-row, .choice, .check-label").evaluateAll((items) => items
          .filter((item) => item.getClientRects().length && !item.closest("[hidden], dialog:not([open]), .is-ghost") && getComputedStyle(item).visibility !== "hidden")
          .map((item) => ({ name: item.id || item.className || item.textContent.trim().slice(0, 20), w: item.getBoundingClientRect().width, h: item.getBoundingClientRect().height }))
          .filter((box) => box.h < 43.5 || box.w < 43.5));
        assert.deepEqual(small, [], `${width}/${theme}/${view}: small targets`);
      }
      if ([320, 390, 1440].includes(width)) {
        await page.evaluate(() => setView("focus"));
        await page.screenshot({ path: `artifacts/redesign/${theme}-${width}.png`, fullPage: true });
      }
      results.layouts.push({ width, theme, views: 4, overflow: false });
    }
  }

  // Palette contrast: hand-tuned themes and a sweep of custom palettes through the resolver.
  const contrast = await page.evaluate(() => {
    const checks = (tokens) => {
      const surfaces = [tokens.bg, tokens.surface, tokens.surface2];
      const min = (color, list = surfaces) => Math.min(...list.map((surface) => contrastRatio(color, surface)));
      return {
        text: min(tokens.text), muted: min(tokens.muted), field: min(tokens.fieldLine, [tokens.bg, tokens.surface]),
        toneFocus: min(tokens.toneFocus, [tokens.bg, tokens.surface]), toneRest: min(tokens.toneRest, [tokens.bg, tokens.surface]),
        danger: min(tokens.danger, [tokens.bg, tokens.surface]), control: contrastRatio(tokens.onControl, tokens.control),
      };
    };
    const builtIn = Object.fromEntries(Object.entries(THEME_TOKENS).map(([key, tokens]) => [key, checks(tokens)]));
    const samples = [];
    for (let r = 0; r <= 255; r += 51) for (let g = 0; g <= 255; g += 51) for (let b = 0; b <= 255; b += 51) samples.push(rgbToHex([r, g, b]));
    for (let v = 100; v <= 140; v += 2) samples.push(rgbToHex([v, v, v])); // light/dark crossover
    const worst = {};
    samples.forEach((bg) => Object.entries(checks(resolveCustomTokens(bg))).forEach(([key, value]) => { worst[key] = Math.min(worst[key] ?? 99, value); }));
    return { builtIn, custom: worst, samples: samples.length };
  });
  results.contrast = contrast;
  for (const values of Object.values(contrast.builtIn)) assert.ok(values.text >= 7, JSON.stringify(values));
  for (const values of [...Object.values(contrast.builtIn), contrast.custom]) {
    assert.ok(values.text >= 4.5, JSON.stringify(values)); // AA even at the light/dark crossover
    assert.ok(values.muted >= 4.5, JSON.stringify(values));
    assert.ok(values.field >= 3, JSON.stringify(values));
    assert.ok(values.toneFocus >= 3 && values.toneRest >= 3, JSON.stringify(values));
    assert.ok(values.danger >= 4.5, JSON.stringify(values));
    assert.ok(values.control >= 4.5, JSON.stringify(values));
  }

  // 200% text size on narrow screens.
  await page.evaluate(() => { state.settings.theme = "paper"; render(); document.documentElement.style.fontSize = "200%"; });
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const view of ["focus", "tasks", "stats", "settings"]) {
      await page.evaluate((view) => setView(view), view);
      assert.equal(await noOverflow(page), true, `200% text ${width}/${view}: horizontal overflow`);
    }
    await page.evaluate(() => setView("focus"));
    await page.screenshot({ path: `artifacts/redesign/text-200-${width}.png`, fullPage: true });
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });

  // Reduced motion keeps short opacity/color feedback and removes movement.
  const motion = await page.evaluate(() => ({
    reduced: QuietMotion.reduced(),
    thumb: getComputedStyle(document.querySelector(".mode-thumb")).transitionProperty,
    duration: parseFloat(getComputedStyle(document.querySelector(".mode-thumb")).transitionDuration),
  }));
  assert.equal(motion.reduced, true);
  assert.ok(!motion.thumb.includes("transform"), motion.thumb);
  assert.ok(motion.duration <= .12);
  await context.close();

  // Full motion: animations use transform/opacity only and never block the state change.
  const motionContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const live = await motionContext.newPage();
  live.on("pageerror", (error) => errors.push(error.message));
  await live.goto(origin);
  await live.evaluate(() => { state.settings.alarmSound = ""; state.settings.ambientSound = ""; addTask("Satu", 1); addTask("Dua", 1); });
  await live.evaluate(() => setView("tasks"));
  const before = await live.evaluate(() => state.tasks.length);
  await live.locator("[data-task-id] .task-expand").first().click();
  await live.locator('[data-role="delete"]').first().click();
  assert.equal(await live.evaluate(() => state.tasks.length), before - 1); // Immediate, while the ghost fades.
  const keyframes = await live.evaluate(() => document.getAnimations().filter((animation) => !(animation instanceof CSSTransition)).flatMap((animation) => animation.effect?.getKeyframes?.() || []).flatMap((frame) => Object.keys(frame)).filter((key) => !["offset", "easing", "composite", "computedOffset"].includes(key)));
  assert.ok(keyframes.every((key) => ["transform", "opacity"].includes(key)), keyframes.join());
  await live.evaluate(() => setView("focus"));
  await live.locator("#startPause").click();
  assert.equal(await live.evaluate(() => state.isRunning), true);
  await live.waitForTimeout(400);
  await live.screenshot({ path: "artifacts/redesign/motion-running-390.png" });
  await motionContext.close();
  results.interactions.push("motion: transform/opacity only, state applied immediately");

  assert.deepEqual(errors, []);
  await writeFile("artifacts/redesign/results.json", JSON.stringify(results, null, 2));
  console.log(`Design review passed: ${results.layouts.length} width/theme layouts × 4 views, ${contrast.samples} custom palettes (worst muted ${contrast.custom.muted.toFixed(2)}:1), 200% text, keyboard, sheets, dialogs, motion.`);
} finally {
  await browser.close();
}
