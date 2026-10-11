import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { root } from '../scripts/prepare.mjs';
const html = fs.readFileSync(path.join(root, 'web/BLOOP.html'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'ios/BLOOP/Game/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);

// Exercise the shipped save/load code with an in-memory Web Storage implementation.
function savedGame(initial, storageThrows = false) {
  let stored = initial;
  const feedback = { textContent: '' };
  const context = vm.createContext({
    localStorage: {
      getItem: () => { if (storageThrows) throw new Error('storage unavailable'); return stored; },
      setItem: (_, value) => { if (storageThrows) throw new Error('storage full'); stored = value; }
    },
    BloopThemes: { applyTheme() {}, themeFor: () => ({ name: 'Test', family: 'Test' }) },
    render() {}, $: () => feedback
  });
  vm.runInContext(scripts[0], context);
  const ui = scripts.at(-1);
  const defaults = ui.slice(ui.indexOf('let save='), ui.indexOf('const soundEngine='));
  const persistence = ui.slice(ui.indexOf('function checkpoint()'), ui.indexOf('function toast('));
  vm.runInContext(defaults + '\nconst game = new Match3(); let practice=false, roundAdUsed=false;\n' + persistence, context);
  return { context, stored: () => stored, run: source => vm.runInContext(source, context) };
}

test('Progress, stars and an unfinished round survive an app restart', () => {
  const first = savedGame(null);
  first.run('save.unlocked=2; save.stars[1]=3; game.start(2); game.moves--; game.score=120; checkpoint();');
  const second = savedGame(first.stored());
  second.run('game.start(save.unlocked); restoreRound();');
  assert.equal(second.run('save.unlocked'), 2);
  assert.equal(second.run('save.stars[1]'), 3);
  assert.equal(second.run('game.level'), 2);
  assert.equal(second.run('game.score'), 120);
  assert.equal(second.run('game.moves'), first.run('game.moves'));
  assert.equal(second.run('JSON.stringify(game.board)'), first.run('JSON.stringify(game.board)'));
  assert.equal(second.run('JSON.stringify(game.jelly)'), first.run('JSON.stringify(game.jelly)'));
});

test('Broken JSON and unavailable storage do not stop a new game', () => {
  for (const [value, throws] of [['{broken', false], [null, true]]) {
    const app = savedGame(value, throws);
    assert.equal(app.run('save.unlocked'), 1);
    assert.doesNotThrow(() => app.run('game.start(1); checkpoint();'));
    assert.equal(app.run('game.board.length'), 64);
  }
});

test('Invalid saved rounds are rejected without loading damaged boards', () => {
  const good = savedGame(null);
  good.run('game.start(1); checkpoint();');
  const baseline = JSON.parse(good.stored());
  for (const damage of [
    a => { a.board.pop(); }, a => { a.board[0].color=99; },
    a => { a.moves=-1; }, a => { a.score=-1; },
    a => { a.level=200; }, a => { a.jelly[0]=4; }
  ]) {
    const value = structuredClone(baseline); damage(value.active);
    const app = savedGame(JSON.stringify(value));
    app.run('game.start(1); restoreRound();');
    assert.equal(app.run('game.level'), 1);
    assert.equal(app.run('game.board.length'), 64);
    assert.equal(app.run('game.matches().length'), 0);
    assert.equal(app.run('game.score'), 0);
  }
});

test('Completed rounds are not resumed and practice does not overwrite progress', () => {
  const app = savedGame(null);
  app.run('game.start(1); checkpoint();');
  const previous = app.stored();
  app.run('practice=true; game.start(10); checkpoint();');
  assert.equal(app.stored(), previous);
  app.run("practice=false; game.status='won'; checkpoint();");
  assert.equal(JSON.parse(app.stored()).active, null);
});
test('Source and mobile inline JavaScript parse without syntax errors', () => {
  for (const body of [html, mobile]) for (const m of body.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(m[1]);
});
test('Mobile package is self-contained and both platforms receive the same game', () => {
  assert.equal(mobile, fs.readFileSync(path.join(root, 'android/app/src/main/assets/game/index.html'), 'utf8'));
  assert.equal([...mobile.matchAll(/<(?:script|link|img|iframe)\b[^>]*(?:src|href)\s*=\s*["']https?:/gi)].length, 0);
  assert.equal([...mobile.matchAll(/(?:fetch|XMLHttpRequest|WebSocket)\s*\(/g)].length, 0);
});
test('Beta blocks commerce at every level while retaining the original source', () => {
  assert.ok(html.includes('const commerceOpen=!practice&&game.level>10;'));
  assert.ok(mobile.includes('const commerceOpen=false;'));
  const fn = mobile.match(/function commerceAllowed\(\)\{[^\n]+?return false;\}/)[0];
  for (const level of [1, 10, 11, 100, 200]) {
    const context = vm.createContext({ toast: () => {}, game: { level }, practice: false });
    vm.runInContext(fn, context);
    assert.equal(vm.runInContext('commerceAllowed()', context), false);
  }
});
test('All 200 levels start with a playable board', () => {
  const context = vm.createContext({});
  vm.runInContext(scripts[0], context);
  let seed = 934857;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const game = new context.Match3(random);
  for (let level = 1; level <= 200; level++) {
    game.start(level);
    assert.equal(game.board.length, 64);
    assert.equal(game.matches().length, 0, `initial matches in level ${level}`);
    assert.ok(game.legalMoves().length > 0, `no legal move in level ${level}`);
    assert.ok(game.moves > 0 && game.goal.target > 0);
    const [a, b] = game.legalMoves()[0], moves = game.moves;
    const swap = game.swap(a, b);
    assert.equal(swap.valid, true);
    assert.equal(game.moves, moves - 1);
    game.resolve(swap.groups, swap.forced, swap.preferred, 1);
    game.drop();
    assert.equal(game.board.length, 64);
    assert.ok(game.board.every(tile => tile && tile.color >= 0 && tile.color < 6));
  }
});
