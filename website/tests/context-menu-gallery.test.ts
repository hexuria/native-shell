import { expect, test } from 'bun:test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

// Opt in against a packaged gallery and a running ChromeDriver. This exercises
// the real app, Wasm runtime, pointer input and action sheet together.
const gallery = process.env.GALLERY_URL;
const driver = process.env.WEBDRIVER_URL ?? 'http://127.0.0.1:9517';
type ElementRef = Record<string, string>;

test.skipIf(!gallery)('gallery context menus work with mouse and touch', async () => {
  const cache = join(homedir(), '.cache');
  await mkdir(cache, { recursive: true });
  const profile = await mkdtemp(join(cache, 'nsh-gallery-browser-'));
  let session = '';
  async function request(path: string, body?: unknown, method?: string): Promise<any> {
    const response = await fetch(driver + path, {
      method: method ?? (body === undefined ? 'GET' : 'POST'),
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const result = await response.json() as { value: any };
    if (!response.ok) throw new Error(JSON.stringify(result.value));
    return result.value;
  }
  const command = (path: string, body?: unknown) => request('/session/' + session + path, body);
  const js = (script: string, ...args: unknown[]) => command('/execute/sync', { script, args });
  async function wait(script: string) {
    for (let i = 0; i < 200; i++) {
      if (await js(script)) return;
      await Bun.sleep(100);
    }
    throw new Error('Timed out: ' + script);
  }
  const target = (id: string): Promise<ElementRef> => js("return document.querySelector('[data-testid='+arguments[0]+']')", id);
  const text = (value: string): Promise<ElementRef> => js("return Array.from(document.querySelectorAll('*')).find(e=>e.textContent===arguments[0])", value);
  async function pointer(element: ElementRef, button = 0, kind = 'mouse', hold = 80, move = 0) {
    const point = await js('const r=arguments[0].getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}', element);
    const actions: unknown[] = [
      { type: 'pointerMove', duration: 0, origin: 'viewport', ...point },
      { type: 'pointerDown', button },
    ];
    if (move) actions.push({ type: 'pointerMove', duration: 150, origin: 'viewport', x: point.x + move, y: point.y });
    actions.push({ type: 'pause', duration: hold }, { type: 'pointerUp', button });
    await command('/actions', { actions: [{ type: 'pointer', id: 'gallery-' + kind, parameters: { pointerType: kind }, actions }] });
    await Bun.sleep(250);
  }
  async function status(requests: number, source: string, selection: string, presses = 0) {
    const value = await js("return document.querySelector('[data-testid=context-status]').textContent");
    for (const part of [`Requests: ${requests}`, `Target: ${source}`, `Selection: ${selection}`, `Presses: ${presses}`]) {
      expect(value).toContain(part);
    }
  }
  try {
    const created = await request('/session', {
      capabilities: { alwaysMatch: { browserName: 'chrome', 'goog:chromeOptions': {
        args: ['--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--window-size=1200,1000', '--user-data-dir=' + profile],
      } } },
    });
    session = created.sessionId;
    await command('/url', { url: gallery });
    await wait("return document.body.innerText.includes('Stocks')");
    await pointer(await text('Gestures'));
    await wait("return !!document.querySelector('[data-testid=context-child]')");
    await Bun.sleep(500);

    await pointer(await target('context-child'), 2);
    await status(1, 'Child', 'Waiting');
    await pointer(await text('Inspect'));
    await status(1, 'Child', 'Inspect');

    await pointer(await target('context-fallback'), 2);
    await status(2, 'Parent', 'Waiting');
    await pointer(await text('Mark as favorite'));
    await status(2, 'Parent', 'Favorite');

    await pointer(await target('context-disabled'), 2);
    await status(2, 'Parent', 'Favorite');
    await pointer(await target('context-editor'), 2);
    await status(2, 'Parent', 'Favorite');
    await command('/actions', { actions: [{ type: 'key', id: 'keyboard', actions: [
      { type: 'keyDown', value: '\uE00C' }, { type: 'keyUp', value: '\uE00C' },
    ] }] });

    await pointer(await target('context-child'), 0, 'touch', 750);
    await status(3, 'Child', 'Waiting');
    await pointer(await text('Inspect'));
    await status(3, 'Child', 'Inspect');

    // Moving before the long-press deadline cancels the menu request.
    await pointer(await target('context-child'), 0, 'touch', 650, 120);
    await status(3, 'Child', 'Inspect');
    await pointer(await target('context-child'));
    await status(3, 'Child', 'Inspect', 1);
  } finally {
    try {
      if (session) await request('/session/' + session, undefined, 'DELETE');
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
}, 45_000);
