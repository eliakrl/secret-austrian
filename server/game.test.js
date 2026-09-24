import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGame, act, playerView, publicView, eligibleChancellors, GameError } from './game.js';

function seeded(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const makePlayers = (n) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }));
const newGame = (n, seed = 1) => createGame(makePlayers(n), seeded(seed));
const voteAll = (g, ja) => g.players.filter((p) => p.alive).forEach((p) => act(g, p.id, { type: 'vote', ja }));
const cardCount = (g) => g.deck.length + g.discard.length + g.hand.length + g.liberal + g.fascist;

test('role counts match the rules', () => {
  const expected = { 5: [3, 1], 6: [4, 1], 7: [4, 2], 8: [5, 2], 9: [5, 3], 10: [6, 3] };
  for (const [n, [lib, fas]] of Object.entries(expected)) {
    const g = newGame(Number(n));
    const count = (r) => g.players.filter((p) => p.role === r).length;
    assert.equal(count('liberal'), lib);
    assert.equal(count('fascist'), fas);
    assert.equal(count('leader'), 1);
  }
});

test('rejects too few or too many players', () => {
  assert.throws(() => newGame(4), GameError);
  assert.throws(() => newGame(11), GameError);
});

test('leader knows the team only in 5-6 player games', () => {
  for (const [n, knows] of [[5, true], [6, true], [7, false], [10, false]]) {
    const g = newGame(n);
    const leader = g.players.find((p) => p.role === 'leader');
    assert.equal(playerView(g, leader.id).me.team.length > 0, knows);
    const fascist = g.players.find((p) => p.role === 'fascist');
    assert.ok(playerView(g, fascist.id).me.team.some((t) => t.role === 'leader'));
    const liberal = g.players.find((p) => p.role === 'liberal');
    assert.equal(playerView(g, liberal.id).me.team.length, 0);
  }
});

test('public view never leaks roles or cards before game over', () => {
  const g = newGame(7);
  const view = JSON.stringify(publicView(g));
  assert.ok(!view.includes('"role":"'));
  assert.ok(!view.includes('"hand"'));
});

test('three failed votes enact the top policy and reset term limits', () => {
  const g = newGame(7);
  g.termLimited = { presidentId: 'p1', chancellorId: 'p2' };
  const top = g.deck[0];
  for (let i = 0; i < 3; i++) {
    act(g, g.presidentId, { type: 'nominate', targetId: eligibleChancellors(g)[0] });
    voteAll(g, false);
  }
  assert.equal(g[top], 1);
  assert.equal(g.tracker, 0);
  assert.deepEqual(g.termLimited, { presidentId: null, chancellorId: null });
  assert.equal(g.phase, 'nominate');
  assert.equal(cardCount(g), 17);
});

test('term limits block last president and chancellor, except president at 5 alive', () => {
  const g = newGame(6);
  g.termLimited = { presidentId: 'p3', chancellorId: 'p4' };
  g.presidentId = 'p0';
  assert.ok(!eligibleChancellors(g).includes('p3'));
  assert.ok(!eligibleChancellors(g).includes('p4'));
  g.players[5].alive = false;
  assert.ok(eligibleChancellors(g).includes('p3'));
  assert.ok(!eligibleChancellors(g).includes('p4'));
});

test('electing the leader as chancellor after 3 fascist policies wins for fascists', () => {
  const g = newGame(7);
  g.fascist = 3;
  const leader = g.players.find((p) => p.role === 'leader');
  g.presidentId = g.players.find((p) => p.id !== leader.id).id;
  act(g, g.presidentId, { type: 'nominate', targetId: leader.id });
  voteAll(g, true);
  assert.equal(g.phase, 'gameover');
  assert.equal(g.winner, 'fascist');
});

test('electing a non-leader in the danger zone clears them', () => {
  const g = newGame(7);
  g.fascist = 3;
  const lib = g.players.find((p) => p.role === 'liberal');
  g.presidentId = g.players.find((p) => p.id !== lib.id).id;
  act(g, g.presidentId, { type: 'nominate', targetId: lib.id });
  voteAll(g, true);
  assert.equal(g.phase, 'legislative_president');
  assert.ok(publicView(g).players.find((p) => p.id === lib.id).cleared);
});

test('legislative session: president discards, chancellor enacts, hands are private', () => {
  const g = newGame(5);
  const chancellor = eligibleChancellors(g)[0];
  act(g, g.presidentId, { type: 'nominate', targetId: chancellor });
  voteAll(g, true);
  assert.equal(playerView(g, g.presidentId).me.hand.length, 3);
  assert.equal(playerView(g, chancellor).me.hand, null);
  assert.throws(() => act(g, chancellor, { type: 'discard', index: 0 }), GameError);
  act(g, g.presidentId, { type: 'discard', index: 0 });
  assert.equal(playerView(g, chancellor).me.hand.length, 2);
  const policy = g.hand[0];
  act(g, chancellor, { type: 'enact', index: 0 });
  assert.equal(g[policy], 1);
  assert.equal(cardCount(g), 17);
});

test('veto: accepted discards both and advances tracker, refused forces enact', () => {
  const g = newGame(7);
  g.fascist = 5;
  const chancellor = eligibleChancellors(g)[0];
  const president = g.presidentId;
  act(g, president, { type: 'nominate', targetId: chancellor });
  voteAll(g, true);
  act(g, president, { type: 'discard', index: 0 });
  act(g, chancellor, { type: 'veto' });
  act(g, president, { type: 'vetoResponse', accept: false });
  assert.throws(() => act(g, chancellor, { type: 'veto' }), GameError);
  assert.equal(g.phase, 'legislative_chancellor');

  const g2 = newGame(7);
  g2.fascist = 5;
  const c2 = eligibleChancellors(g2)[0];
  act(g2, g2.presidentId, { type: 'nominate', targetId: c2 });
  voteAll(g2, true);
  act(g2, g2.presidentId, { type: 'discard', index: 0 });
  act(g2, c2, { type: 'veto' });
  act(g2, g2.presidentId, { type: 'vetoResponse', accept: true });
  assert.equal(g2.tracker, 1);
  assert.equal(g2.phase, 'nominate');
  assert.equal(cardCount(g2), 17 + 5); // the 5 fascist policies were set by hand
});

test('veto is not available before 5 fascist policies', () => {
  const g = newGame(7);
  const chancellor = eligibleChancellors(g)[0];
  act(g, g.presidentId, { type: 'nominate', targetId: chancellor });
  voteAll(g, true);
  act(g, g.presidentId, { type: 'discard', index: 0 });
  assert.equal(playerView(g, chancellor).me.canVeto, false);
  assert.throws(() => act(g, chancellor, { type: 'veto' }), GameError);
});

function forceFascistEnact(g) {
  const chancellor = eligibleChancellors(g)[0];
  act(g, g.presidentId, { type: 'nominate', targetId: chancellor });
  voteAll(g, true);
  g.hand = ['fascist', 'fascist', 'fascist'];
  act(g, g.presidentId, { type: 'discard', index: 0 });
  act(g, chancellor, { type: 'enact', index: 0 });
}

test('special election returns rotation to the player after the caller', () => {
  const g = newGame(7);
  g.deck = g.deck.filter((c) => c === 'fascist').concat(g.deck.filter((c) => c === 'liberal'));
  g.fascist = 2; // next fascist policy unlocks special election in 7-8 player games
  g.presidentId = 'p0';
  forceFascistEnact(g);
  assert.equal(g.phase, 'executive');
  assert.equal(g.power.type, 'special');
  act(g, 'p0', { type: 'special', targetId: 'p4' });
  assert.equal(g.presidentId, 'p4');
  act(g, 'p4', { type: 'nominate', targetId: eligibleChancellors(g)[0] });
  voteAll(g, false);
  assert.equal(g.presidentId, 'p1');
});

test('investigation result goes only to the president and cannot repeat', () => {
  const g = newGame(9);
  g.presidentId = 'p0';
  forceFascistEnact(g);
  assert.equal(g.power.type, 'investigate');
  act(g, 'p0', { type: 'investigate', targetId: 'p3' });
  const result = playerView(g, 'p0').me.power.result;
  assert.ok(['liberal', 'fascist'].includes(result));
  assert.equal(JSON.stringify(publicView(g)).includes('"result"'), false);
  assert.deepEqual(playerView(g, 'p0').me.knowledge, [{ targetId: 'p3', party: result }]);
  act(g, 'p0', { type: 'done' });
  forceFascistEnact(g);
  assert.throws(() => act(g, g.presidentId, { type: 'investigate', targetId: 'p3' }), GameError);
});

test('executing the leader wins for liberals; dead players cannot act', () => {
  const g = newGame(5);
  const leader = g.players.find((p) => p.role === 'leader');
  const other = g.players.find((p) => p.role === 'liberal');
  g.fascist = 3;
  g.presidentId = other.id;
  g.phase = 'executive';
  g.power = { type: 'execute' };
  act(g, other.id, { type: 'execute', targetId: leader.id });
  assert.equal(g.winner, 'liberal');

  const g2 = newGame(5);
  const victim = g2.players.find((p) => p.role === 'liberal' && p.id !== g2.presidentId);
  g2.phase = 'executive';
  g2.power = { type: 'execute' };
  act(g2, g2.presidentId, { type: 'execute', targetId: victim.id });
  assert.equal(g2.phase, 'nominate');
  assert.throws(() => act(g2, victim.id, { type: 'vote', ja: true }), GameError);
});

// Plays thousands of games with random legal moves and checks invariants.
test('random games always terminate with a winner and keep 17 policies', () => {
  const rng = seeded(42);
  const pick = (arr) => arr[Math.floor(rng() * arr.length)];
  const winners = { liberal: 0, fascist: 0 };

  for (let game = 0; game < 3000; game++) {
    const n = 5 + (game % 6);
    const g = createGame(makePlayers(n), seeded(game + 1));
    let steps = 0;
    while (g.phase !== 'gameover') {
      assert.ok(++steps < 2000, 'game did not terminate');
      assert.equal(cardCount(g), 17);
      const pres = g.presidentId;
      const alive = g.players.filter((p) => p.alive && p.id !== pres).map((p) => p.id);
      switch (g.phase) {
        case 'nominate':
          act(g, pres, { type: 'nominate', targetId: pick(eligibleChancellors(g)) });
          break;
        case 'vote':
          for (const p of g.players.filter((p) => p.alive)) act(g, p.id, { type: 'vote', ja: rng() < 0.6 });
          break;
        case 'legislative_president':
          act(g, pres, { type: 'discard', index: Math.floor(rng() * 3) });
          break;
        case 'legislative_chancellor':
          if (playerView(g, g.chancellorId).me.canVeto && rng() < 0.3) act(g, g.chancellorId, { type: 'veto' });
          else act(g, g.chancellorId, { type: 'enact', index: Math.floor(rng() * 2) });
          break;
        case 'veto':
          act(g, pres, { type: 'vetoResponse', accept: rng() < 0.5 });
          break;
        case 'executive': {
          const type = g.power.type;
          if (type === 'peek') act(g, pres, { type: 'done' });
          else if (type === 'investigate') {
            act(g, pres, { type: 'investigate', targetId: pick(alive.filter((id) => !g.investigated.includes(id))) });
            act(g, pres, { type: 'done' });
          } else act(g, pres, { type, targetId: pick(alive) });
          break;
        }
        default:
          assert.fail(`unexpected phase ${g.phase}`);
      }
    }
    winners[g.winner]++;
  }
  assert.ok(winners.liberal > 0 && winners.fascist > 0);
});
