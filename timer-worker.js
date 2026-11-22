// Keep timer accounting moving when the page's UI interval is throttled.
// A worker cannot keep a discarded/frozen tab or a sleeping computer alive.
setInterval(() => postMessage("tick"), 1000);
