// Fill a room with bots that make random legal moves, for testing.
// Usage: npm run bots -- <ROOM> [count=5] [delayMs=700] [--start]
// Join with your own phone first if you want to play alongside them.

import { io } from 'socket.io-client';

const [code, countArg = '5', delayArg = '700'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const autoStart = process.argv.includes('--start');
const url = process.env.SERVER ?? 'http://localhost:3001';
if (!code) {
  console.error('Usage: npm run bots -- <ROOM> [count] [delayMs] [--start]');
  process.exit(1);
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['Anna', 'Bruno', 'Clara', 'Dieter', 'Elsa', 'Franz', 'Greta', 'Hans', 'Ilse', 'Jonas'];

function bot(name) {
  const socket = io(url);
  let busy = false;
  let lastKey = null;

  const emit = (event, payload) => new Promise((res) => socket.emit(event, payload, res));

  let latest = null;
  socket.on('state', (state) => {
    latest = state;
    tick();
  });

  async function tick() {
    const { game, room, meId } = latest;
    if (!game) {
      if (autoStart && room.vipId === meId && room.players.length >= 5) await emit('game:start');
      return;
    }
    const me = game.me;
    const key = `${game.phase}-${game.log.length}-${me.myVote}`;
    if (busy || key === lastKey || !me.alive || game.phase === 'gameover') return;
    lastKey = key;

    const isPres = meId === game.presidentId;
    const others = game.players.filter((p) => p.alive && p.id !== meId).map((p) => p.id);
    let action = null;
    if (game.phase === 'vote' && me.myVote === null) action = { type: 'vote', ja: Math.random() < 0.65 };
    else if (game.phase === 'nominate' && isPres) action = { type: 'nominate', targetId: pick(me.eligible) };
    else if (me.hand && game.phase === 'legislative_president') action = { type: 'discard', index: Math.floor(Math.random() * 3) };
    else if (me.hand && game.phase === 'legislative_chancellor') {
      action = me.canVeto && Math.random() < 0.3 ? { type: 'veto' } : { type: 'enact', index: Math.floor(Math.random() * 2) };
    } else if (game.phase === 'veto' && isPres) action = { type: 'vetoResponse', accept: Math.random() < 0.5 };
    else if (game.phase === 'executive' && isPres) {
      const { power } = me;
      if (power.type === 'peek' || power.result) action = { type: 'done' };
      else if (power.type === 'investigate') action = { type: 'investigate', targetId: pick(others.filter((id) => !power.investigated.includes(id))) };
      else action = { type: power.type, targetId: pick(others) };
    }
    if (!action) return;

    busy = true;
    await sleep(delay);
    const res = await emit('game:action', action);
    if (!res.ok) console.log(`${name}: ${res.error}`);
    busy = false;
    lastKey = null;
    tick(); // re-evaluate against whatever state arrived meanwhile
  }

  socket.on('connect', async () => {
    const res = await emit('player:join', { code, name });
    console.log(res.ok ? `${name} joined ${code}` : `${name}: ${res.error}`);
  });
}

const delay = Number(delayArg);
NAMES.slice(0, Number(countArg)).forEach((n, i) => setTimeout(() => bot(n), i * 150));
