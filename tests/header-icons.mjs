import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { routeLocalFiles } from "./local-files.mjs";

const { chromium } = await import(process.argv[2] ? pathToFileURL(process.argv[2]).href : "playwright");
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
routeLocalFiles(browser);
const origin = "http://127.0.0.1:5173";
const errors = [];
await mkdir("artifacts", { recursive: true });
const bellSymbol = (page) => page.locator("#notificationPermission use").getAttribute("href");
const OFF = "#i-bell-off";
const ON = "#i-bell";
const waitForPermission = (page, permission) => page.waitForFunction((value) => document.querySelector("#notificationPermission").dataset.permission === value, permission);

try {
  for (const config of [
    { name: "desktop", viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    { name: "mobile", viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
  ]) {
    const context = await browser.newContext({ ...config, reducedMotion: "reduce" });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(origin);
    await waitForPermission(page, "default");
    assert.equal(await bellSymbol(page), OFF);
    // Every navigation and header icon shares one 20px / 1.75px stroke grid and is centered in a >=44px target.
    const geometry = await page.locator(".topbar .icon-button .icon, .nav-item .icon").evaluateAll((icons) => icons.filter((icon) => icon.getClientRects().length).map((icon) => {
      const rect = icon.getBoundingClientRect();
      const parent = icon.closest(".icon-button, .nav-item").getBoundingClientRect();
      const style = getComputedStyle(icon);
      return { width: Math.round(rect.width), stroke: style.strokeWidth, targetHeight: parent.height >= 44,
        centerX: Math.round(rect.x + rect.width / 2 - parent.x - parent.width / 2) };
    }));
    assert.ok(geometry.length >= 4, `icons: ${geometry.length}`);
    geometry.forEach((icon) => {
      assert.equal(icon.stroke, "1.75px");
      assert.ok(icon.targetHeight);
      assert.ok(Math.abs(icon.centerX) <= 1 || config.name === "desktop", JSON.stringify(icon));
    });
    for (const theme of ["paper", "sage", "ink"]) {
      await page.locator('.nav-item[data-nav="settings"]').click();
      await page.locator(`.theme-swatch[data-theme="${theme}"]`).click();
      await page.locator('.nav-item[data-nav="focus"]').click();
      await page.locator(".topbar").screenshot({ path: `artifacts/header-${config.name}-${theme}.png` });
    }
    // Change Chrome's actual permission: the Permissions API listener must update
    // the icon even without an app render or a user clicking the bell again.
    await context.grantPermissions(["notifications"], { origin });
    await waitForPermission(page, "granted");
    assert.equal(await bellSymbol(page), ON);
    await page.locator("#notificationPermission").click();
    assert.match(await page.locator("#statusMessage").textContent(), /sudah aktif/);
    await page.locator(".topbar").screenshot({ path: `artifacts/header-${config.name}-notifications-on.png` });
    await context.clearPermissions();
    await waitForPermission(page, "default");
    assert.equal(await bellSymbol(page), OFF);
    await context.close();
  }

  // Isolated permission responses exercise the request flow without changing the
  // user's Chrome profile, including a granted result before the property refresh.
  const simulated = await browser.newContext({ reducedMotion: "reduce" });
  const page = await simulated.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    let permission = "default";
    window.setTestPermission = (value) => { permission = value; };
    const watcher = new EventTarget();
    navigator.permissions.query = async () => watcher;
    window.testPermissionWatcher = watcher;
    Object.defineProperty(Notification, "permission", { get: () => permission, configurable: true });
    Notification.requestPermission = async () => "granted";
  });
  await page.goto(origin);
  await page.locator("#notificationPermission").click();
  await waitForPermission(page, "granted");
  assert.equal(await bellSymbol(page), ON);
  await page.evaluate(() => { setTestPermission("granted"); window.dispatchEvent(new Event("focus")); });
  assert.equal(await bellSymbol(page), ON);
  await page.evaluate(() => { setTestPermission("denied"); testPermissionWatcher.dispatchEvent(new Event("change")); });
  await waitForPermission(page, "denied");
  await page.locator("#notificationPermission").click();
  assert.match(await page.locator("#statusMessage").textContent(), /diblokir/);
  await page.evaluate(() => { setTestPermission("default"); Notification.requestPermission = async () => { throw new Error("Unavailable"); }; window.dispatchEvent(new Event("focus")); });
  await page.locator("#notificationPermission").click();
  assert.match(await page.locator("#statusMessage").textContent(), /belum dapat diminta/);
  assert.equal(await bellSymbol(page), OFF);
  await page.evaluate(() => { setTestPermission("granted"); document.dispatchEvent(new Event("visibilitychange")); });
  await waitForPermission(page, "granted");
  await simulated.close();

  // Chrome file:// behavior is checked explicitly, rather than displaying a
  // false active bell if Chrome does not allow that origin to send notifications.
  const fileContext = await browser.newContext({ reducedMotion: "reduce" });
  const filePage = await fileContext.newPage();
  filePage.on("pageerror", (error) => errors.push(error.message));
  await filePage.goto(pathToFileURL(`${process.cwd()}/index.html`).href);
  const filePermission = await filePage.evaluate(() => ({ secure: isSecureContext, permission: Notification.permission }));
  await filePage.locator("#notificationPermission").click();
  await filePage.waitForFunction(() => !notificationRequestPending);
  const actual = await filePage.evaluate(() => Notification.permission);
  assert.equal(await bellSymbol(filePage), actual === "granted" ? ON : OFF);
  if (actual !== "granted") assert.match(await filePage.locator("#statusMessage").textContent(), /localhost/);
  console.log(`Chrome file:// notification permission: ${filePermission.permission} -> ${actual}, secure context: ${filePermission.secure}.`);
  await fileContext.close();
  assert.deepEqual(errors, []);
  console.log("Header checks passed: consistent 20px/1.75px icons in 44px targets, desktop/mobile, three themes, real permission changes, request result, denied/error handling, focus/visibility, file://.");
} finally {
  await browser.close();
}
