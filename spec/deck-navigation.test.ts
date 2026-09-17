// The phone reads the slide itself, rather than a 30% miniature of it.
// Every lecture supplies the route and return link; the controls, hash and
// text are then read from a real browser. No private Reveal state is changed.
import { afterAll, beforeAll, expect, it } from "vitest";
import { resolve } from "node:path";
import { gitOrigin, resolveDeployment } from "../scripts/pages-base";
import { loadContentDir } from "./lib/content";
import { serveBuild, Tab, type StaticSite } from "./lib/chrome";

const { base } = resolveDeployment(process.env, gitOrigin);
const prefix = base.replace(/\/$/, "");
const lectures = loadContentDir("src/content/lectures");
let site: StaticSite;
let tab: Tab;
const pause = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));
async function until(code: string) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await tab.evaluate(code)) return;
    await pause(50);
  }
  throw new Error(`The browser never reached: ${code}`);
}
async function click(selector: string) {
  const point = await tab.evaluate<{ x: number; y: number; hit: boolean }>(`
    const e=document.querySelector(${JSON.stringify(selector)});
    const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    return {x,y,hit:e.contains(document.elementFromPoint(x,y))};
  `);
  expect(point.hit, `${selector} must own its hit area`).toBe(true);
  await tab.click(point.x, point.y);
}
beforeAll(async () => {
  site = await serveBuild(resolve("dist"), base);
  tab = await Tab.launch();
}, 30000);
afterAll(async () => { await tab?.close(); await site?.close(); });

for (const lecture of lectures) {
  it(`${lecture.slug}: readable slides, visible navigation and the right lecture`, async () => {
    await tab.viewport(390, 844);
    await tab.goto("about:blank");
    await tab.goto(`${site.origin}${prefix}${lecture.frontmatter.slides}#/3`);
    await until(`return document.querySelector('.reveal')?.classList.contains('ready');`);
    const reading = await tab.evaluate<{ body: number[]; overflow: number; toolbar: boolean }>(`
      const slide=document.querySelector('.slides > section.present');
      const body=[...slide.querySelectorAll('p:not(.deck-source):not(.deck-figure):not(.deck-title__phase),li,td')]
        .filter(e=>e.checkVisibility()&&e.offsetWidth>0)
        .map(e=>parseFloat(getComputedStyle(e).fontSize)*e.getBoundingClientRect().width/e.offsetWidth);
      return {body, overflow:document.querySelector('.reveal').scrollWidth-innerWidth,
        toolbar:!!document.querySelector('.deck-toolbar')?.checkVisibility()};
    `);
    expect(reading.body.length).toBeGreaterThan(0);
    expect(Math.min(...reading.body), "body text must remain at least 16 CSS pixels after transforms").toBeGreaterThanOrEqual(16);
    expect(reading.overflow, "phone slide must fit horizontally").toBeLessThanOrEqual(1);
    expect(reading.toolbar).toBe(true);
    expect(await tab.evaluate(`return document.querySelector('.deck-toolbar a')?.getAttribute('href');`))
      .toBe(`${prefix}/lectures/${lecture.slug}/`);
    await click('.deck-toolbar button:last-child');
    await until(`return document.querySelector('.deck-toolbar output')?.textContent.startsWith('4 /');`);
    // A physical Tab/Enter activates Previous and keeps focus on its control.
    await tab.press("Tab");
    for (let count = 0; count < 50; count++) {
      if (await tab.evaluate(`return document.activeElement===document.querySelector('.deck-toolbar button:first-child');`)) break;
      await tab.press("Tab");
    }
    expect(await tab.evaluate(`return document.activeElement===document.querySelector('.deck-toolbar button:first-child');`)).toBe(true);
    await tab.press("Enter");
    await until(`return document.querySelector('.deck-toolbar output')?.textContent.startsWith('3 /');`);
    expect(await tab.evaluate(`return document.activeElement===document.querySelector('.deck-toolbar button:first-child');`)).toBe(true);
    const hash = await tab.evaluate<string>('return location.hash;');
    await tab.viewport(1920, 1080);
    await pause(100);
    expect(await tab.evaluate('return location.hash;')).toBe(hash);
    await tab.viewport(390, 844);
    await pause(100);
    expect(await tab.evaluate('return location.hash;')).toBe(hash);
    await click('.deck-toolbar a');
    // The URL changes before a streamed document finishes parsing. The resource
    // links precede their headings, so wait for the document before reading IDs.
    await until(`return location.pathname===${JSON.stringify(`${prefix}/lectures/${lecture.slug}/`)}&&document.readyState!=="loading";`);
    const links = await tab.evaluate<{ text: string; exists: boolean }[]>(`
      return [...document.querySelectorAll('.lecture-actions a[href^="#"]')].map(a=>({
        text:a.textContent.trim(),exists:!!document.getElementById(a.hash.slice(1))
      }));
    `);
    expect(links.some((link) => link.text === "Exercise")).toBe(true);
    expect(links.every((link) => link.exists)).toBe(true);
  }, 60000);
}
