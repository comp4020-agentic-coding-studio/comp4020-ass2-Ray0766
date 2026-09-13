// A real browser, driven over the DevTools protocol, with no new dependency.
//
// Every other check in spec/ reads source or reads the built HTML through
// JSDOM, and for colour that is a dead end: JSDOM has no layout and no
// computed colour, the theme's axe pass therefore cannot fire a contrast rule
// at all, and the theme's own contrast.ts notes axe-core cannot read oklch
// even when it can see it. A semi-transparent wash or a relative-colour fill
// has no token value to check --- the only honest reading is the pixel the
// compositor produced. CLAUDE.md §7 says so, and until now it was satisfied by
// hand, which is why a fill could go three rounds with unreadable ink on it.
//
// puppeteer would do this in ten lines and stays out of package.json on
// purpose (CLAUDE.md §7: the browser is a tool, not a dependency of the site).
// So: spawn the Chrome already on the machine, talk to it over the protocol
// puppeteer itself speaks, and decode the one-pixel PNGs it hands back. Node
// ships a WebSocket client and zlib, which is the whole toolkit.

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";
import { gzipSync, inflateSync } from "node:zlib";

/** Channel values in 0..1, the shape the theme's contrast helpers take. */
export type Rgb = [number, number, number];

// ---------------------------------------------------------------------------
// Finding a browser
// ---------------------------------------------------------------------------

const CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/opt/google/chrome/chrome",
];

/** The browser binary, or a hard failure. Deliberately not a skip: a colour
 *  check that quietly does nothing on a machine without Chrome is worse than
 *  no check, because the suite still reports green. CHROME_PATH overrides. */
export function findChrome(): string {
  const explicit = process.env.CHROME_PATH;
  if (explicit) {
    if (!existsSync(explicit)) throw new Error(`CHROME_PATH points at ${explicit}, which does not exist`);
    return explicit;
  }
  const found = CANDIDATES.find((path) => existsSync(path));
  if (found) return found;
  throw new Error(
    "No Chrome or Chromium found. This check reads rendered pixels, so it needs a real browser; " +
      "install Chrome or set CHROME_PATH.",
  );
}

// ---------------------------------------------------------------------------
// Serving the build
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4",
  ".vtt": "text/vtt",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

export interface StaticSite {
  /** `http://127.0.0.1:<port>` --- join with a base-relative path. */
  readonly origin: string;
  close(): Promise<void>;
}

/** Serve a built directory at the sub-path the build was made for. Astro bakes
 *  `base` into every asset URL, so mounting dist/ at the origin root 404s the
 *  stylesheet and the page renders unstyled --- which on a colour check would
 *  look like a palette bug.
 *
 *  `cache` is the `cache-control` header, and `no-store` is right for almost
 *  everything here: a budget measured with a warm cache is a measurement of this
 *  machine. It is wrong for exactly one thing. A **prefetch** is a request whose
 *  whole purpose is to be reused by the navigation that follows it, and a
 *  response that says `no-store` can never be — so a prefetch served this way is
 *  a request that happened and bought nothing, and a check that only counts the
 *  request is measuring the harness. GitHub Pages serves assets with a
 *  `max-age`; a check about prefetching has to as well. */
export function serveBuild(root: string, base: string, cache = "no-store"): Promise<StaticSite> {
  const prefix = `/${base.replace(/^\/|\/$/g, "")}`;
  const dir = resolve(root);

  const server: Server = createServer((request, response) => {
    // A page can ask for something this cannot parse --- a protocol-relative
    // `//` is the one that turned up --- and an exception in here takes the
    // whole run down rather than the request, so nothing gets out of this
    // handler but a response.
    let path: string;
    try {
      path = decodeURIComponent(new URL(request.url ?? "/", "http://127.0.0.1").pathname);
    } catch {
      response.writeHead(400).end("unparseable request path");
      return;
    }
    const relative = prefix === "/" ? path : path.startsWith(prefix) ? path.slice(prefix.length) : null;
    if (relative === null) {
      response.writeHead(404).end("outside the site base");
      return;
    }

    // normalize() collapses any ../ before the join, so a crafted URL cannot
    // read outside the build directory.
    let file = join(dir, normalize(relative));
    if (!file.startsWith(dir + sep) && file !== dir) {
      response.writeHead(403).end("outside the build");
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    if (!existsSync(file)) {
      response.writeHead(404).end("not built");
      return;
    }

    let body: Buffer;
    try {
      body = readFileSync(file);
    } catch {
      response.writeHead(500).end("could not read the file");
      return;
    }

    // Compress what a real host compresses. It makes no difference to a colour
    // reading and all the difference to a timing one: the island is 593 kB of
    // JavaScript and 148 kB of gzip, and served raw on a throttled connection
    // it spends 2.8 s on the wire instead of 0.7 s. A first-frame budget
    // measured against the uncompressed file is a measurement of this test
    // server, and GitHub Pages has served gzip since before this repo existed.
    const type = MIME[extname(file)] ?? "application/octet-stream";
    const compressible = /^(?:text\/|application\/(?:javascript|json|xml)|image\/svg)/.test(type);
    const wanted = String(request.headers["accept-encoding"] ?? "").includes("gzip");
    const encoded = compressible && wanted ? gzipSync(body, { level: 9 }) : null;

    response.writeHead(200, {
      "content-type": type,
      "content-length": String((encoded ?? body).byteLength),
      "cache-control": cache,
      ...(encoded ? { "content-encoding": "gzip", vary: "accept-encoding" } : {}),
    });
    response.end(encoded ?? body);
  });

  return new Promise((fulfil, fail) => {
    server.once("error", fail);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) {
        fail(new Error("the static server did not bind a port"));
        return;
      }
      fulfil({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

// ---------------------------------------------------------------------------
// The protocol
// ---------------------------------------------------------------------------

interface Message {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { message: string };
}

interface Waiter {
  method: string;
  fulfil: () => void;
}

class Connection {
  #socket: WebSocket;
  #nextId = 1;
  #calls = new Map<
    number,
    { method: string; fulfil: (value: Record<string, unknown>) => void; fail: (error: Error) => void }
  >();
  #waiting: Waiter[] = [];
  #collecting: { method: string; seen: Record<string, unknown>[] }[] = [];

  private constructor(socket: WebSocket) {
    this.#socket = socket;
    socket.addEventListener("message", (event) => this.#receive(String(event.data)));
  }

  static open(url: string): Promise<Connection> {
    return new Promise((fulfil, fail) => {
      const socket = new WebSocket(url);
      socket.addEventListener("open", () => fulfil(new Connection(socket)), { once: true });
      socket.addEventListener("error", () => fail(new Error(`could not connect to ${url}`)), { once: true });
    });
  }

  #receive(raw: string): void {
    const message = JSON.parse(raw) as Message;
    if (message.id !== undefined) {
      const call = this.#calls.get(message.id);
      this.#calls.delete(message.id);
      if (!call) return;
      // The method, in the message. The protocol's own errors are four words
      // long — "Invalid parameters" — and a stack that points at this line says
      // nothing about which of thirty calls produced it. Cost: one probe spent
      // bisecting a sweep to find out that the four words came from
      // `Page.captureScreenshot`.
      if (message.error) call.fail(new Error(`${call.method}: ${message.error.message}`));
      else call.fulfil(message.result ?? {});
      return;
    }
    if (message.method) {
      for (const sink of this.#collecting) {
        if (sink.method === message.method) sink.seen.push(message.params ?? {});
      }
      const still: Waiter[] = [];
      for (const waiter of this.#waiting) {
        if (waiter.method === message.method) waiter.fulfil();
        else still.push(waiter);
      }
      this.#waiting = still;
    }
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const id = this.#nextId++;
    return new Promise((fulfil, fail) => {
      this.#calls.set(id, { method, fulfil, fail });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Resolves the next time the browser emits `method`. Register before the
   *  command that causes it, or the event arrives while nobody is listening. */
  expect(method: string): Promise<void> {
    return new Promise((fulfil) => this.#waiting.push({ method, fulfil }));
  }

  /** Every `method` event from now on, into an array the caller keeps. The
   *  resource timing API cannot answer what a page's own JavaScript is not told
   *  — request priority is the one that matters for a first-frame budget, and
   *  it only exists in the protocol. */
  collect(method: string): Record<string, unknown>[] {
    const seen: Record<string, unknown>[] = [];
    this.#collecting.push({ method, seen });
    return seen;
  }

  close(): void {
    this.#socket.close();
  }
}

// ---------------------------------------------------------------------------
// One tab
// ---------------------------------------------------------------------------

export type ColourScheme = "light" | "dark";

/** Throughput in bytes per second, latency in milliseconds — the units
 *  `Network.emulateNetworkConditions` takes. */
export interface NetworkConditions {
  download: number;
  upload: number;
  latency: number;
}

/** Chrome DevTools' own "Slow 4G" preset, arithmetic and all, so a budget
 *  measured here is the number a marker would read off the Network panel
 *  rather than an approximation of it. */
export const SLOW_4G: NetworkConditions = {
  download: (1.6 * 1024 * 1024) / 8,
  upload: (750 * 1024) / 8,
  latency: 562.5,
};

/** The keys a driver in this repo sends, with the descriptor Chrome wants for
 *  each. `engine/input.ts` reads `event.code` for the walk keys and `event.key`
 *  for Enter and Escape, so both are sent for all of them. */
const KEYS = {
  Enter: { windowsVirtualKeyCode: 13, key: "Enter", code: "Enter", text: "\r" },
  Tab: { windowsVirtualKeyCode: 9, key: "Tab", code: "Tab", text: "" },
  Space: { windowsVirtualKeyCode: 32, key: " ", code: "Space", text: " " },
  // No text, so it goes out as a rawKeyDown like Tab does. Escape with a
  // text payload is a key press nobody's keyboard produces.
  Escape: { windowsVirtualKeyCode: 27, key: "Escape", code: "Escape", text: "" },
  ArrowUp: { windowsVirtualKeyCode: 38, key: "ArrowUp", code: "ArrowUp", text: "" },
  ArrowDown: { windowsVirtualKeyCode: 40, key: "ArrowDown", code: "ArrowDown", text: "" },
  ArrowLeft: { windowsVirtualKeyCode: 37, key: "ArrowLeft", code: "ArrowLeft", text: "" },
  ArrowRight: { windowsVirtualKeyCode: 39, key: "ArrowRight", code: "ArrowRight", text: "" },
} as const;

export type Key = keyof typeof KEYS;

export class Tab {
  #connection: Connection;
  #process: ChildProcess;
  #profile: string;

  private constructor(connection: Connection, process: ChildProcess, profile: string) {
    this.#connection = connection;
    this.#process = process;
    this.#profile = profile;
  }

  static async launch(): Promise<Tab> {
    const binary = findChrome();
    const profile = mkdtempSync(join(tmpdir(), "slop-chrome-"));
    const child = spawn(
      binary,
      [
        "--headless=new",
        "--remote-debugging-port=0",
        `--user-data-dir=${profile}`,
        // The pixel has to mean what the stylesheet said. Without an sRGB
        // profile Chrome colour-manages the screenshot to the display's
        // profile and every sampled channel drifts a few counts; without
        // scale-factor 1 the screenshot is in device pixels and no longer
        // shares coordinates with the layout.
        "--force-color-profile=srgb",
        "--force-device-scale-factor=1",
        "--hide-scrollbars",
        "--disable-lcd-text",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--mute-audio",
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );

    const endpoint = await new Promise<string>((fulfil, fail) => {
      let buffered = "";
      const timer = setTimeout(() => fail(new Error(`Chrome printed no devtools endpoint:\n${buffered}`)), 30_000);
      child.stderr?.on("data", (chunk: Buffer) => {
        buffered += chunk.toString();
        const match = /ws:\/\/127\.0\.0\.1:(\d+)\//.exec(buffered);
        if (match) {
          clearTimeout(timer);
          fulfil(`http://127.0.0.1:${match[1]}`);
        }
      });
      child.once("exit", (code) => {
        clearTimeout(timer);
        fail(new Error(`Chrome exited with ${code} before listening:\n${buffered}`));
      });
    });

    const created = (await (await fetch(`${endpoint}/json/new?about:blank`, { method: "PUT" })).json()) as {
      webSocketDebuggerUrl: string;
    };
    const connection = await Connection.open(created.webSocketDebuggerUrl);
    await connection.send("Page.enable");
    await connection.send("Runtime.enable");
    // Headless Chrome has no window the OS has focused, so `document.hasFocus()`
    // is false and Chrome *defers every focus event until the document is
    // focused again* --- which never happens. `element.focus()` still moves
    // `document.activeElement`, so a check that only reads activeElement looks
    // fine, and any page code listening for `focusin` or `focus` never runs at
    // all. Measured on /studio/: activeElement was TEXTAREA#desk-prompt and the
    // document-level focusin listener had fired zero times, which made a
    // hand-over that depends on knowing where the reader was look broken when
    // it was the harness that could not tell it.
    await connection.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    return new Tab(connection, child, profile);
  }

  /** Both marking viewports are desktop-shaped as far as input is concerned;
   *  what the site keys off is width, so `mobile` stays false and the phone
   *  size is just a narrow window. */
  async viewport(width: number, height: number): Promise<void> {
    await this.#connection.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
  }

  /** Drive the OS preference and the theme's own attribute together. The site
   *  forces dark on a first visit and the footer toggle writes
   *  `data-theme`, so the attribute is the thing that actually decides; the
   *  emulated media query keeps any `prefers-color-scheme` rule in step. */
  async colourScheme(scheme: ColourScheme): Promise<void> {
    await this.#connection.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme }],
    });
  }

  /** Every emulated media feature at once. `setEmulatedMedia` replaces the whole
   *  list rather than adding to it, so anything that wants a second preference
   *  alongside the colour scheme has to send both in one call. */
  async media(features: { colourScheme?: ColourScheme; reducedMotion?: boolean }): Promise<void> {
    const list: { name: string; value: string }[] = [];
    if (features.colourScheme) list.push({ name: "prefers-color-scheme", value: features.colourScheme });
    if (features.reducedMotion !== undefined) {
      list.push({ name: "prefers-reduced-motion", value: features.reducedMotion ? "reduce" : "no-preference" });
    }
    await this.#connection.send("Emulation.setEmulatedMedia", { features: list });
  }

  /** JavaScript off, the way a reader turns it off — not "the island did not
   *  run this time". A no-JS check that boots the island and then reads the
   *  DOM is reading the page the island left behind, which is a different
   *  page; this reads the one the server sent. Applies from the next
   *  navigation. */
  async scripts(enabled: boolean): Promise<void> {
    await this.#connection.send("Emulation.setScriptExecutionDisabled", { value: !enabled });
  }

  /** Throttle the connection, and say whether the cache is allowed to answer.
   *  `null` restores full speed. A budget measured with a warm cache is a
   *  measurement of this machine, not of the page. */
  async network(conditions: NetworkConditions | null, cache: "on" | "off" = "on"): Promise<void> {
    await this.#connection.send("Network.enable");
    await this.#connection.send("Network.setCacheDisabled", { cacheDisabled: cache === "off" });
    await this.#connection.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: conditions?.latency ?? 0,
      downloadThroughput: conditions?.download ?? -1,
      uploadThroughput: conditions?.upload ?? -1,
    });
  }

  /** Runs `source` in every document this tab opens, before anything the page
   *  itself runs. It is how something that happens *during* load can be
   *  observed without putting a stopwatch in the page: the page ships what it
   *  ships, and the harness watches from outside it. */
  async onNewDocument(source: string): Promise<void> {
    await this.#connection.send("Page.addScriptToEvaluateOnNewDocument", { source });
  }

  /** Every event of one protocol method from now on. `Network.enable` has to be
   *  on for the Network ones, which `network()` does. */
  collect(method: string): Record<string, unknown>[] {
    return this.#connection.collect(method);
  }

  async goto(url: string): Promise<void> {
    const loaded = this.#connection.expect("Page.loadEventFired");
    await this.#connection.send("Page.navigate", { url });
    await loaded;
  }

  /** The browser's Back button, which is not `history.back()` and not a
   *  navigation to the previous URL.
   *
   *  It traverses the session history the way the chrome button does —
   *  `Page.navigateToHistoryEntry` is the protocol call behind it — because the
   *  thing being asked about is what the *browser* does on a traversal, and a
   *  traversal is the one navigation that can end without a document being
   *  parsed at all. A `goto` of the previous URL would answer a different
   *  question with the same address bar, which is the mistake this file already
   *  has a comment about one method up.
   *
   *  It deliberately does **not** wait for `Page.loadEventFired`. A restore from
   *  the back/forward cache resumes the document instead of creating one, so no
   *  load event is coming and an await here would hang until the timeout and
   *  then report a failure that is really a success. The caller polls for what
   *  it actually needs; `history()` says where the tab ended up.
   *
   *  Returns the URL it left and the URL it went to, so a caller can fail with
   *  the journey in the message rather than with "something did not happen". */
  async back(): Promise<{ from: string; to: string }> {
    const history = (await this.#connection.send("Page.getNavigationHistory")) as {
      currentIndex: number;
      entries: { id: number; url: string }[];
    };
    const at = history.currentIndex;
    if (at <= 0) throw new Error("Back was pressed with nothing behind this page in the session history");
    const target = history.entries[at - 1]!;
    await this.#connection.send("Page.navigateToHistoryEntry", { entryId: target.id });
    return { from: history.entries[at]!.url, to: target.url };
  }

  /** Where the tab is in its own session history: every entry's URL, and which
   *  one is current. Read after a traversal to prove it went where it was sent. */
  async history(): Promise<{ index: number; urls: string[] }> {
    const history = (await this.#connection.send("Page.getNavigationHistory")) as {
      currentIndex: number;
      entries: { url: string }[];
    };
    return { index: history.currentIndex, urls: history.entries.map((entry) => entry.url) };
  }

  /** Wait for the page to stop moving. `load` is not that moment: a webfont
   *  swapping in or a lazy image resolving relayouts the page afterwards, and
   *  it does so *without* changing the scroll offset --- so an element's
   *  recorded rectangle silently goes stale while every obvious check still
   *  agrees. Seen as a two-pixel drift that failed one combination in a run and
   *  passed the next.
   *
   *  `<video>` is the same hazard one step later, and it is the one that turned
   *  up the moment a second browser-driving check started running alongside the
   *  first. The home page's hero loop is sized by its own intrinsic ratio, so
   *  the stage is one height before `loadedmetadata` and another after --- and
   *  metadata arrives well after `load` and after every image. With one Chrome
   *  on an idle machine it lands before anything here looks; with two of them
   *  competing for the CPU it lands *during* the sampling, which moved the
   *  weight bar 300px down the page between one run and the next and tripped
   *  that check's own scroll guard. So: wait for the videos too, and then poll
   *  until the document height actually holds still, rather than trusting that
   *  the list of things worth waiting for is now complete. */
  async settle(): Promise<void> {
    await this.evaluate(`return (async () => {
      for (const image of document.images) image.loading = "eager";
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((image) => !image.complete)
          .map((image) => new Promise((done) => { image.onload = image.onerror = done; })),
      );
      await Promise.all(
        [...document.querySelectorAll("video")]
          .filter((video) => video.readyState < HTMLMediaElement.HAVE_METADATA)
          .map((video) => new Promise((done) => {
            // A poster-only hero on a machine with no codec would otherwise
            // wait forever; a bounded wait leaves the stability poll below as
            // the backstop.
            const timer = setTimeout(done, 10000);
            const finish = () => { clearTimeout(timer); done(); };
            video.addEventListener("loadedmetadata", finish, { once: true });
            video.addEventListener("error", finish, { once: true });
          })),
      );
      let previous = -1;
      let stable = 0;
      const deadline = performance.now() + 10000;
      while (stable < 6 && performance.now() < deadline) {
        await new Promise((done) => setTimeout(done, 50));
        const height = document.documentElement.scrollHeight;
        stable = height === previous ? stable + 1 : 0;
        previous = height;
      }
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return null;
    })();`);
  }

  /** A real key press, dispatched by the browser rather than by a synthetic
   *  DOM event. It matters for the two things a synthetic `KeyboardEvent`
   *  cannot do: Enter on a focused button runs the browser's own activation
   *  behaviour (so `click` fires the way it does for a person), and Tab moves
   *  the browser's sequential focus, which is the only way to ask where the
   *  keyboard actually goes next. */
  async press(key: Key): Promise<void> {
    const { text, ...descriptor } = KEYS[key];
    await this.#connection.send("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      ...descriptor,
      ...(text ? { text, unmodifiedText: text } : {}),
    });
    await this.#connection.send("Input.dispatchKeyEvent", { type: "keyUp", ...descriptor });
  }

  /** A key held down for a while and then let go, which is what walking is.
   *
   *  `press` sends the down and the up in the same millisecond, and
   *  `engine/input.ts` drives the figure for as long as the key is held — so a
   *  `press("ArrowUp")` moves the figure by about a tenth of a pixel and reads
   *  exactly like a walk that did not happen. Anything asking the figure to move
   *  has to hold. */
  async hold(key: Key, milliseconds: number): Promise<void> {
    const { text, ...descriptor } = KEYS[key];
    await this.#connection.send("Input.dispatchKeyEvent", {
      type: text ? "keyDown" : "rawKeyDown",
      ...descriptor,
      ...(text ? { text, unmodifiedText: text } : {}),
    });
    await new Promise<void>((done) => setTimeout(done, milliseconds));
    await this.#connection.send("Input.dispatchKeyEvent", { type: "keyUp", ...descriptor });
  }

  /** Move the pointer to a point in **viewport** CSS pixels, and leave it there.
   *
   *  `:hover` is the one state a probe cannot reach from inside the page: there
   *  is no API that sets it, and a class that stands in for it is a check of the
   *  stand-in. So the pointer is moved the way a pointer moves, and the
   *  hover-only declarations — the theme washes an outline button with
   *  `--at-accent-soft` on `:hover` and on nothing else — are then readable as
   *  computed style and as composited pixels.
   *
   *  A `mouseMoved` with `buttons: 0` is a move, not a press: nothing is
   *  clicked, and the hover survives until the next move. Call it at (-1, -1)
   *  to take the pointer off everything. */
  async hover(x: number, y: number): Promise<void> {
    await this.#connection.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      button: "none",
      buttons: 0,
      clickCount: 0,
    });
  }

  /** A real click, dispatched by the browser at a point in **viewport** CSS
   *  pixels: a move, a press and a release, with the pointer left where it
   *  landed.
   *
   *  It matters for the same reason `press` does. A link inside an Astro
   *  `<ClientRouter>` is navigated by the router's own listener on a real click
   *  event — and a driver that reaches for `location.assign` when it cannot find
   *  the link performs a **hard** navigation instead, which is a different
   *  journey with the same address bar. One did: fourteen reported round trips
   *  through a soft navigation were fourteen full page loads, because the page
   *  it was leaving from had no link back and the fallback said nothing. A
   *  driver with a fallback answers a question you did not ask.
   *
   *  So there is no fallback here. If a caller cannot find the link, it has to
   *  fail rather than navigate some other way. */
  async click(x: number, y: number): Promise<void> {
    const at = { x, y, button: "left" as const, buttons: 1, clickCount: 1 };
    await this.#connection.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...at, buttons: 0 });
    await this.#connection.send("Input.dispatchMouseEvent", { type: "mousePressed", ...at });
    await this.#connection.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...at });
  }

  async evaluate<T>(source: string): Promise<T> {
    const result = (await this.#connection.send("Runtime.evaluate", {
      expression: `(() => { ${source} })()`,
      returnByValue: true,
      awaitPromise: true,
    })) as { result: { value?: T; description?: string }; exceptionDetails?: { text: string; exception?: { description?: string } } };
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value as T;
  }

  /** A PNG of a region given in **viewport** CSS pixels, base64 as the protocol
   *  hands it over. Omit the region for the whole viewport.
   *
   *  `clip` is documented in page coordinates, so a viewport region is offset by
   *  the current scroll before it goes out --- measured, not assumed: clipping a
   *  scrolled page with the raw viewport rect returns the wrong band. */
  async screenshot(region?: { x: number; y: number; width: number; height: number }): Promise<string> {
    const scroll = region
      ? await this.evaluate<{ x: number; y: number }>("return { x: window.scrollX, y: window.scrollY };")
      : { x: 0, y: 0 };
    const shot = (await this.#connection.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
      ...(region
        ? { clip: { x: region.x + scroll.x, y: region.y + scroll.y, width: region.width, height: region.height, scale: 1 } }
        : {}),
    })) as { data: string };
    return shot.data;
  }

  /** The composited colour at one point, in **viewport** CSS pixels. A 1×1 clip
   *  keeps the transfer to about seventy bytes, which is why this decodes its
   *  own PNG rather than reaching for a library. */
  async pixel(x: number, y: number): Promise<Rgb> {
    return decodeSinglePixelPng(Buffer.from(await this.screenshot({ x, y, width: 1, height: 1 }), "base64"));
  }

  /** A whole region of the composite, decoded once, in **viewport** CSS pixels.
   *
   *  `pixel()` is a protocol round trip each, which is the right shape for the
   *  handful of points a control's fill needs and the wrong one for a scene: a
   *  40x40 cell profile of a 1920x923 canvas is fourteen thousand readings, and
   *  at a round trip apiece that is not a check anybody runs. One screenshot and
   *  one inflate is the same information in about a second. */
  async raster(region?: { x: number; y: number; width: number; height: number }): Promise<Raster> {
    return decodePng(Buffer.from(await this.screenshot(region), "base64"));
  }

  async close(): Promise<void> {
    this.#connection.close();
    const exited = new Promise<void>((done) => this.#process.once("exit", () => done()));
    this.#process.kill();
    await exited;
    // Chrome flushes its profile on the way out, so a removal racing the exit
    // fails with ENOTEMPTY. A leftover temp directory is not worth failing a
    // colour check over either way.
    try {
      rmSync(this.#profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch {
      /* the OS will reap it */
    }
  }
}

// ---------------------------------------------------------------------------
// A reading taken from one layout
// ---------------------------------------------------------------------------

/** Take a reading, and take it again if the page moved underneath it.
 *
 *  Both colour checks read an element's geometry inside the page and then
 *  sample its pixels from Node a moment later, so anything that relays out in
 *  between moves every recorded coordinate while the sampler goes on reading
 *  the old ones. Each of them therefore records the scroll offset on the way in,
 *  re-reads it on the way out, and fails the case when the two disagree.
 *
 *  That guard is right and stays exactly as strict as it was. But a guard that
 *  trips is not a verdict about the page --- it says this particular reading is
 *  worthless, and the answer to a worthless reading is to take another one.
 *  Which matters as soon as there are two of these checks: they run in parallel
 *  vitest workers, each driving its own Chrome, and a page that settles before
 *  anything looks at it on an idle machine settles mid-sample on a busy one.
 *
 *  `settle()` between attempts, and the last attempt is returned whatever
 *  happened, so a page that genuinely will not hold still still fails --- on the
 *  caller's own assertion, with the numbers that prove it. */
export async function whileStill<T extends { scroll: { x: number; y: number } }>(
  tab: Tab,
  read: () => Promise<T>,
  attempts = 4,
): Promise<T & { scrolledAfter: { x: number; y: number } }> {
  let last: (T & { scrolledAfter: { x: number; y: number } }) | undefined;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const result = await read();
    const scrolledAfter = await tab.evaluate<{ x: number; y: number }>("return { x: scrollX, y: scrollY };");
    last = { ...result, scrolledAfter };
    if (scrolledAfter.x === result.scroll.x && scrolledAfter.y === result.scroll.y) return last;
    await tab.settle();
  }
  return last!;
}

// ---------------------------------------------------------------------------
// A one-pixel PNG
// ---------------------------------------------------------------------------

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A decoded region of the composite. Coordinates are relative to the region
 *  that was captured, not to the viewport, so a caller that clipped has to
 *  subtract the clip's own origin — which is exactly the arithmetic a sampler
 *  gets wrong silently, so `at` throws rather than returning an edge pixel. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  /** Channels in 0..1, the shape the theme's contrast helpers take. */
  at(x: number, y: number): Rgb;
  /** WCAG relative luminance at one pixel, 0..1. Linear light: this is the
   *  number a contrast ratio is made of, and it is dominated by bright pixels. */
  luminanceAt(x: number, y: number): number;
  /** Mean relative luminance over a rectangle, clipped to the raster. Zero
   *  pixels in range is an error rather than a zero: a cell outside the picture
   *  is a bug in the caller's grid, and returning 0 would make it the darkest
   *  thing on screen. */
  meanLuminance(x: number, y: number, width: number, height: number): number;
  /** Rec. 709 luma at one pixel, **gamma-encoded**, 0..255.
   *
   *  Not the same statistic as `luminanceAt`, and the difference is not
   *  academic. `receipts/rig-3d/CONTRACT-A2.md` states the machine room's
   *  brightness as "mean luminance of a 40x40 cell, 0-255", and that is this
   *  one — a mean of the encoded values, which is roughly perceptual. A mean of
   *  *linear* luminance is a different ranking: it is pulled up by a few very
   *  bright pixels and down by a lot of dark ones, and the two disagree about
   *  which cell is brightest. Measured: the figure in the machine room sits at
   *  rank 2 of 1104 under this metric and rank 6 under the linear one. A check
   *  that says it is using the contract's number has to use the contract's
   *  arithmetic. */
  lumaAt(x: number, y: number): number;
  /** Mean Rec. 709 luma over a rectangle, 0..255 — the contract's own cell
   *  reading. Same clipping and the same refusal to report an empty cell. */
  meanLuma(x: number, y: number, width: number, height: number): number;
  /** The brightest single pixel in a rectangle, as luma 0..255, and where it is.
   *  A cell mean cannot see a small bright thing: a 5x48 px bar of pure white
   *  inside a 40x40 cell moves that cell's mean by about seven counts and moves
   *  nothing in a ranking. 233 pixels is what one looks like. */
  peakLuma(x: number, y: number, width: number, height: number): { luma: number; x: number; y: number };
}

/** sRGB relative luminance, WCAG 2.2's own arithmetic, on channels in 0..1. */
const relativeLuminance = (rgb: Rgb): number => {
  const linear = rgb.map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!;
};

/** Rec. 709 luma on the gamma-encoded channels, 0..255. The contract's number. */
const luma = (rgb: Rgb): number => (0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!) * 255;

/** A whole PNG, as Chrome hands it over.
 *
 *  `decodeSinglePixelPng` below stays as it is: at 1x1 every filter predicts
 *  from pixels outside the picture, so the stored bytes are the values whatever
 *  filter was picked, and it needs none of this. A region has neighbours, so all
 *  five filters have to be undone for real. Non-interlaced 8-bit RGB or RGBA is
 *  everything `Page.captureScreenshot` produces; anything else is refused rather
 *  than guessed at. */
export function decodePng(bytes: Buffer): Raster {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error("the screenshot is not a PNG");

  let header: { width: number; height: number; depth: number; colour: number; interlace: number } | undefined;
  const parts: Buffer[] = [];
  for (let offset = 8; offset + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("latin1");
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: chunk.readUInt32BE(0),
        height: chunk.readUInt32BE(4),
        depth: chunk[8]!,
        colour: chunk[9]!,
        interlace: chunk[12]!,
      };
    } else if (type === "IDAT") parts.push(Buffer.from(chunk));
    else if (type === "IEND") break;
    offset += 12 + length;
  }

  if (!header) throw new Error("the screenshot has no IHDR");
  if (header.depth !== 8 || header.interlace !== 0 || (header.colour !== 2 && header.colour !== 6)) {
    throw new Error(`unhandled PNG: depth ${header.depth}, colour type ${header.colour}, interlace ${header.interlace}`);
  }

  const { width, height } = header;
  const channels = header.colour === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(parts));
  if (raw.length < height * (stride + 1)) {
    throw new Error(`the screenshot is short: ${raw.length} bytes for ${height} scanlines of ${stride}`);
  }

  // Every filter predicts from the byte `channels` to the left (a) and the byte
  // above (b), with (c) above-left for Paeth. Outside the picture they are zero.
  const pixels = Buffer.alloc(height * stride);
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)]!;
    const source = row * (stride + 1) + 1;
    const target = row * stride;
    for (let index = 0; index < stride; index++) {
      const x = raw[source + index]!;
      const a = index >= channels ? pixels[target + index - channels]! : 0;
      const b = row > 0 ? pixels[target + index - stride]! : 0;
      const c = row > 0 && index >= channels ? pixels[target + index - stride - channels]! : 0;
      let value: number;
      switch (filter) {
        case 0:
          value = x;
          break;
        case 1:
          value = x + a;
          break;
        case 2:
          value = x + b;
          break;
        case 3:
          value = x + ((a + b) >> 1);
          break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          value = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter} on scanline ${row}`);
      }
      pixels[target + index] = value & 0xff;
    }
  }

  const at = (x: number, y: number): Rgb => {
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= width || y >= height) {
      throw new Error(`(${x}, ${y}) is outside the ${width}x${height} raster`);
    }
    const offset = y * stride + x * channels;
    if (channels === 4 && pixels[offset + 3] !== 255) {
      throw new Error(`the pixel at (${x}, ${y}) is not opaque (alpha ${pixels[offset + 3]})`);
    }
    return [pixels[offset]! / 255, pixels[offset + 1]! / 255, pixels[offset + 2]! / 255];
  };

  /** The clipped bounds of a rectangle, refusing an empty one. */
  const bounds = (x: number, y: number, boxWidth: number, boxHeight: number) => {
    const left = Math.max(0, Math.round(x));
    const top = Math.max(0, Math.round(y));
    const right = Math.min(width, Math.round(x + boxWidth));
    const bottom = Math.min(height, Math.round(y + boxHeight));
    if (right <= left || bottom <= top) {
      throw new Error(`the cell at (${x}, ${y}) ${boxWidth}x${boxHeight} is outside the raster`);
    }
    return { left, top, right, bottom };
  };

  const average = (
    measure: (rgb: Rgb) => number,
    x: number,
    y: number,
    boxWidth: number,
    boxHeight: number,
  ): number => {
    const { left, top, right, bottom } = bounds(x, y, boxWidth, boxHeight);
    let total = 0;
    let count = 0;
    for (let row = top; row < bottom; row++) {
      for (let column = left; column < right; column++) {
        total += measure(at(column, row));
        count++;
      }
    }
    return total / count;
  };

  return {
    width,
    height,
    at,
    luminanceAt: (x, y) => relativeLuminance(at(x, y)),
    meanLuminance: (x, y, boxWidth, boxHeight) => average(relativeLuminance, x, y, boxWidth, boxHeight),
    lumaAt: (x, y) => luma(at(x, y)),
    meanLuma: (x, y, boxWidth, boxHeight) => average(luma, x, y, boxWidth, boxHeight),
    peakLuma: (x, y, boxWidth, boxHeight) => {
      const { left, top, right, bottom } = bounds(x, y, boxWidth, boxHeight);
      let best = -1;
      let bestX = left;
      let bestY = top;
      for (let row = top; row < bottom; row++) {
        for (let column = left; column < right; column++) {
          const value = luma(at(column, row));
          if (value > best) {
            best = value;
            bestX = column;
            bestY = row;
          }
        }
      }
      return { luma: best, x: bestX, y: bestY };
    },
  };
}

export function decodeSinglePixelPng(bytes: Buffer): Rgb {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) throw new Error("the screenshot is not a PNG");

  let header: { width: number; height: number; depth: number; colour: number; interlace: number } | undefined;
  const data: Buffer[] = [];
  for (let offset = 8; offset + 8 <= bytes.length; ) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("latin1");
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      header = {
        width: chunk.readUInt32BE(0),
        height: chunk.readUInt32BE(4),
        depth: chunk[8]!,
        colour: chunk[9]!,
        interlace: chunk[12]!,
      };
    } else if (type === "IDAT") data.push(Buffer.from(chunk));
    else if (type === "IEND") break;
    offset += 12 + length;
  }

  if (!header) throw new Error("the screenshot has no IHDR");
  if (header.width !== 1 || header.height !== 1) {
    throw new Error(`expected a 1×1 screenshot, got ${header.width}×${header.height}`);
  }
  if (header.depth !== 8 || header.interlace !== 0 || (header.colour !== 2 && header.colour !== 6)) {
    throw new Error(`unhandled PNG: depth ${header.depth}, colour type ${header.colour}`);
  }

  // One scanline: a filter byte, then the channels. Every PNG filter predicts
  // from the pixel to the left and the row above; in a 1×1 image both are
  // outside the picture and therefore zero, so the stored bytes are the values
  // whichever filter Chrome picked.
  const raw = inflateSync(Buffer.concat(data));
  const channels = header.colour === 6 ? 4 : 3;
  if (raw.length < 1 + channels) throw new Error("the screenshot scanline is short");
  if (channels === 4 && raw[4] !== 255) throw new Error(`the screenshot pixel is not opaque (alpha ${raw[4]})`);
  return [raw[1]! / 255, raw[2]! / 255, raw[3]! / 255];
}

// ---------------------------------------------------------------------------
// A declared colour, resolved
// ---------------------------------------------------------------------------

/** Channels in 0..255 and an alpha in 0..1, as `RESOLVE_COLOUR` returns them. */
export type Resolved = [number, number, number, number];

/** Defines `resolveColour(value)` inside the page. Paste it at the top of a
 *  probe and call it on anything out of `getComputedStyle`.
 *
 *  Parsing the string here instead would be a trap. Chrome serialises a
 *  computed colour in whatever space the author wrote --- `--phase-episode` is
 *  relative-colour syntax and comes back as `oklch(0.416264 0.107958 72.9532)`
 *  --- and a regex that only knows `rgb()` either throws on it or, worse, is
 *  widened into a hand-rolled oklch conversion whose rounding is then the thing
 *  under test. A 1×1 canvas makes the browser do the conversion it would do to
 *  paint the pixel, in the same sRGB space the screenshot comes back in. */
export const RESOLVE_COLOUR = `
  const __probeCanvas = new OffscreenCanvas(1, 1);
  const __probeCtx = __probeCanvas.getContext("2d", { willReadFrequently: true });
  const resolveColour = (value) => {
    __probeCtx.clearRect(0, 0, 1, 1);
    __probeCtx.fillStyle = value;
    __probeCtx.fillRect(0, 0, 1, 1);
    const data = __probeCtx.getImageData(0, 0, 1, 1).data;
    return [data[0], data[1], data[2], data[3] / 255];
  };
`;

/** A resolved colour as channels in 0..1, refusing anything translucent: a
 *  declared colour with alpha below 1 is not the colour anyone sees, and the
 *  sampled pixel is the only reading that would be true of it. */
export function opaque(colour: Resolved, what: string): Rgb {
  const [r, g, b, alpha] = colour;
  if (alpha !== 1) throw new Error(`${what} is not opaque (alpha ${alpha}); the pixel is the only true reading`);
  return [r / 255, g / 255, b / 255];
}

export const formatHex = (rgb: Rgb): string =>
  `#${rgb.map((channel) => Math.round(channel * 255).toString(16).padStart(2, "0")).join("")}`;
