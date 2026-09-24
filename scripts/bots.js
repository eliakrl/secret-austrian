// Fill a room with bots that make random legal moves, for testing.
// Usage: npm run bots -- <ROOM> [count=5] [delayMs=700] [--start]
// Join with your own phone first if you want to play alongside them.

import { io } from 'socket.io-client';
import { botAction } from '../server/bots.js';

const [code, countArg = '5', delayArg = '700'] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const autoStart = process.argv.includes('--start');
const url = process.env.SERVER ?? 'http://localhost:3001';
if (!code) {
  console.error('Usage: npm run bots -- <ROOM> [count] [delayMs] [--start]');
  process.exit(1);
}

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

    const action = botAction(game, meId);
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
