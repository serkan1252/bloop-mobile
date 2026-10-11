import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { root } from '../scripts/prepare.mjs';
const html = fs.readFileSync(path.join(root, 'web/BLOOP.html'), 'utf8');
const mobile = fs.readFileSync(path.join(root, 'ios/BLOOP/Game/index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
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
