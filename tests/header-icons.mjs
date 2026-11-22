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
    assert.equal(await bellSymbol(page), "#icon-bell-off");
    const geometry = await page.locator(".topbar svg").evaluateAll((icons) => icons.map((icon) => {
      const rect = icon.getBoundingClientRect();
      const parent = icon.closest(".brand-mark, .icon-button").getBoundingClientRect();
      const style = getComputedStyle(icon);
      return { width: rect.width, height: rect.height, stroke: style.strokeWidth,
        centerX: rect.x + rect.width / 2 - parent.x - parent.width / 2,
        centerY: rect.y + rect.height / 2 - parent.y - parent.height / 2 };
    }));
    assert.equal(geometry.length, 4);
    geometry.forEach((icon) => assert.deepEqual(icon, { width: 24, height: 24, stroke: "2px", centerX: 0, centerY: 0 }));
    for (const theme of ["paper", "sage", "ink"]) {
      await page.locator("#settingsToggle").click();
      await page.locator("#setupTab").click();
      await page.locator(`.theme-swatch[data-theme="${theme}"]`).click();
      await page.locator("#settingsClose").click();
      await page.locator(".topbar").screenshot({ path: `artifacts/header-${config.name}-${theme}.png` });
    }
    // Change Chrome's actual permission: the Permissions API listener must update
    // the icon even without an app render or a user clicking the bell again.
    await context.grantPermissions(["notifications"], { origin });
    await waitForPermission(page, "granted");
    assert.equal(await bellSymbol(page), "#icon-bell");
    await page.locator("#notificationPermission").click();
    assert.match(await page.locator("#statusMessage").textContent(), /sudah aktif/);
    await page.locator(".topbar").screenshot({ path: `artifacts/header-${config.name}-notifications-on.png` });
    await context.clearPermissions();
    await waitForPermission(page, "default");
    assert.equal(await bellSymbol(page), "#icon-bell-off");
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
  assert.equal(await bellSymbol(page), "#icon-bell");
  await page.evaluate(() => { setTestPermission("granted"); window.dispatchEvent(new Event("focus")); });
  assert.equal(await bellSymbol(page), "#icon-bell");
  await page.evaluate(() => { setTestPermission("denied"); testPermissionWatcher.dispatchEvent(new Event("change")); });
  await waitForPermission(page, "denied");
  await page.locator("#notificationPermission").click();
  assert.match(await page.locator("#statusMessage").textContent(), /diblokir/);
  await page.evaluate(() => { setTestPermission("default"); Notification.requestPermission = async () => { throw new Error("Unavailable"); }; window.dispatchEvent(new Event("focus")); });
  await page.locator("#notificationPermission").click();
  assert.match(await page.locator("#statusMessage").textContent(), /belum dapat diminta/);
  assert.equal(await bellSymbol(page), "#icon-bell-off");
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
  assert.equal(await bellSymbol(filePage), actual === "granted" ? "#icon-bell" : "#icon-bell-off");
  if (actual !== "granted") assert.match(await filePage.locator("#statusMessage").textContent(), /localhost/);
  console.log(`Chrome file:// notification permission: ${filePermission.permission} -> ${actual}, secure context: ${filePermission.secure}.`);
  await fileContext.close();
  assert.deepEqual(errors, []);
  console.log("Header checks passed: four centered 24px/2px icons, desktop/mobile, three themes, real permission changes, request result, denied/error handling, focus/visibility, file://.");
} finally {
  await browser.close();
}
