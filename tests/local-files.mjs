import { readFile } from "node:fs/promises";
import { resolve, relative, extname, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

// Optional in-process HTTP responses for environments that block loopback sockets.
// The browser still sees the same origin, real files and localStorage behavior.
export function routeLocalFiles(browser) {
  if (process.env.QUIET_POMO_ROUTE_FILES !== "1") return;
  const root = fileURLToPath(new URL("../", import.meta.url));
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (options) => {
    const context = await newContext(options);
    await context.route("http://127.0.0.1:5173/**", async (route) => {
      const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
      const path = resolve(root, pathname === "/" ? "index.html" : pathname.slice(1));
      const subpath = relative(root, path);
      if (subpath.startsWith("..") || isAbsolute(subpath)) { await route.fulfill({ status: 403 }); return; }
      try {
        const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".wav": "audio/wav" };
        await route.fulfill({ status: 200, contentType: types[extname(path)] || "application/octet-stream", body: await readFile(path) });
      } catch { await route.fulfill({ status: 404 }); }
    });
    return context;
  };
}
