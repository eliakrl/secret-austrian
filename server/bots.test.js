import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, playerView } from './game.js';
import { botAction } from './bots.js';

test('bots alone always finish a game with legal moves', () => {
  for (let game = 0; game < 500; game++) {
    const n = 5 + (game % 6);
    const g = createGame(Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}` })));
    let steps = 0;
    while (g.phase !== 'gameover') {
      assert.ok(++steps < 3000, 'bots got stuck');
      const moves = g.players
        .map((p) => ({ id: p.id, action: botAction(playerView(g, p.id), p.id) }))
        .filter((m) => m.action);
      assert.ok(moves.length > 0, `no bot can move in phase ${g.phase}`);
      const { id, action } = moves[Math.floor(Math.random() * moves.length)];
      act(g, id, action); // throws if a bot picks an illegal move
    }
  }
});
