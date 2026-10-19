import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

// Exercise the actual player without starting Wasm or constructing a DOM.
const source = readFileSync(new URL('../../crates/nsh-platform-web/web/nsh.js', import.meta.url), 'utf8');
const { Player } = await import('data:text/javascript;base64,' + Buffer.from(source + '\nexport { Player };').toString('base64'));

function setup() {
  const player = Object.create(Player.prototype);
  const root = { parentNode: null };
  player.root = root;
  player.pointers = new Map();
  player.editable = (el: any) => !!el.editable;
  const events: unknown[] = [];
  player.event = (...args: unknown[]) => events.push(args);
  const view = (id: number, parentNode: any, listens = true) => ({
    _id: id, parentNode, _events: new Set(listens ? ['onContextMenu'] : []), _props: { longPressDelay: 1 },
  });
  const parent = view(2, root);
  const child = view(4, parent);
  const event = (target = child) => ({ target, prevented: false, preventDefault() { this.prevented = true; } });
  return { player, events, parent, child, event };
}

test('context menu chooses the innermost listener and falls back to its parent', () => {
  const { player, events, parent, child, event } = setup();
  player.contextMenu(event());
  child._events.clear();
  player.contextMenu(event());
  expect(events).toEqual([[4, 'onContextMenu'], [parent._id, 'onContextMenu']]);
});

test('native editable targets keep their menus', () => {
  const { player, events, child, event } = setup();
  const e = event(Object.assign(child, { editable: true }));
  player.contextMenu(e);
  expect(e.prevented).toBe(false);
  expect(events).toEqual([]);
});

test('touch long press fires once and suppresses the subsequent press', async () => {
  const { player, events, child, event } = setup();
  child._events.add('onPress');
  const p = { press: child, touch: true };
  player.pointers.set(1, p);
  player.pressIn(p);
  await Bun.sleep(15);
  player.contextMenu(event());
  player.pressOut(p, true);
  expect(events).toEqual([[4, 'onContextMenu']]);
});

test('browser menu arriving before the touch timer cancels that timer', async () => {
  const { player, events, child, event } = setup();
  child._events.add('onPress');
  const p = { press: child, touch: true };
  player.pointers.set(1, p);
  player.pressIn(p);
  player.contextMenu(event());
  await Bun.sleep(15);
  player.pressOut(p, true);
  expect(events).toEqual([[4, 'onContextMenu']]);
});

test('holding the mouse does not synthesize a touch context menu', async () => {
  const { player, events, child } = setup();
  const p = { press: child, touch: false };
  player.pressIn(p);
  await Bun.sleep(15);
  player.pressOut(p, true);
  expect(events).toEqual([]);
});
