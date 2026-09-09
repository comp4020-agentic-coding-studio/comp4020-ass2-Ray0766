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
import { inflateSync } from "node:zlib";

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
 *  look like a palette bug. */
export function serveBuild(root: string, base: string): Promise<StaticSite> {
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
    response.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "content-length": String(body.byteLength),
      "cache-control": "no-store",
    });
    response.end(body);
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
  #calls = new Map<number, { fulfil: (value: Record<string, unknown>) => void; fail: (error: Error) => void }>();
  #waiting: Waiter[] = [];

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
      if (message.error) call.fail(new Error(message.error.message));
      else call.fulfil(message.result ?? {});
      return;
    }
    if (message.method) {
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
      this.#calls.set(id, { fulfil, fail });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Resolves the next time the browser emits `method`. Register before the
   *  command that causes it, or the event arrives while nobody is listening. */
  expect(method: string): Promise<void> {
    return new Promise((fulfil) => this.#waiting.push({ method, fulfil }));
  }

  close(): void {
    this.#socket.close();
  }
}

// ---------------------------------------------------------------------------
// One tab
// ---------------------------------------------------------------------------

export type ColourScheme = "light" | "dark";

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

  async goto(url: string): Promise<void> {
    const loaded = this.#connection.expect("Page.loadEventFired");
    await this.#connection.send("Page.navigate", { url });
    await loaded;
  }

  /** Wait for the page to stop moving. `load` is not that moment: a webfont
   *  swapping in or a lazy image resolving relayouts the page afterwards, and
   *  it does so *without* changing the scroll offset --- so an element's
   *  recorded rectangle silently goes stale while every obvious check still
   *  agrees. Seen as a two-pixel drift that failed one combination in a run and
   *  passed the next. */
  async settle(): Promise<void> {
    await this.evaluate(`return (async () => {
      for (const image of document.images) image.loading = "eager";
      await document.fonts.ready;
      await Promise.all(
        [...document.images]
          .filter((image) => !image.complete)
          .map((image) => new Promise((done) => { image.onload = image.onerror = done; })),
      );
      await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      return null;
    })();`);
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
// A one-pixel PNG
// ---------------------------------------------------------------------------

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

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
