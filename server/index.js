import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { createGame, act, publicView, playerView, GameError } from './game.js';
import { createRoom, getRoom, addPlayer, addBot, findPlayer, removePlayer, sweep, RoomError } from './rooms.js';
import { botAction } from './bots.js';
import { MAX_PLAYERS } from '../shared/rules.js';

const PORT = Number(process.env.PORT) || 3001;
const BOT_DELAY_MS = Number(process.env.BOT_DELAY_MS) || 900;
const app = express();
const server = createServer(app);
const io = new Server(server);

// LAN address so the host screen can show a join link that works on phones.
function lanIp() {
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) if (net.family === 'IPv4' && !net.internal) return net.address;
  }
  return null;
}
app.get('/api/info', (_req, res) => res.json({ lanIp: lanIp() }));

// In production, serve the built client.
const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

// ---------------------------------------------------------------- state push

// The first human to join can start and reset the game from their phone.
const vipOf = (room) => room.players.find((p) => !p.bot)?.id ?? null;

function roomSummary(room) {
  return {
    code: room.code,
    players: room.players.map((p) => ({ id: p.id, name: p.name, bot: Boolean(p.bot), connected: p.bot || p.sockets > 0 })),
    vipId: vipOf(room),
    started: Boolean(room.game),
  };
}

function broadcast(room) {
  room.touched = Date.now();
  const summary = roomSummary(room);
  io.to(`${room.code}:host`).emit('state', { room: summary, game: room.game && publicView(room.game) });
  for (const p of room.players) {
    io.to(`${room.code}:p:${p.id}`).emit('state', {
      room: summary,
      meId: p.id,
      meName: p.name,
      game: room.game && playerView(room.game, p.id),
    });
  }
  scheduleBots(room);
}

// Test mode: bots move one at a time, each move triggering a broadcast that schedules the next.
function scheduleBots(room) {
  if (room.botTimer || !room.game || room.game.phase === 'gameover') return;
  const ready = room.players.filter((p) => p.bot && botAction(playerView(room.game, p.id), p.id));
  if (!ready.length) return;
  const delay = room.game.phase === 'vote' ? BOT_DELAY_MS / 3 : BOT_DELAY_MS;
  room.botTimer = setTimeout(() => {
    room.botTimer = null;
    if (!room.game) return;
    const bot = ready[Math.floor(Math.random() * ready.length)];
    const action = botAction(playerView(room.game, bot.id), bot.id); // state may have changed meanwhile
    if (action) {
      try {
        act(room.game, bot.id, action);
      } catch (err) {
        console.error(`bot ${bot.name} move failed:`, err.message);
      }
    }
    broadcast(room);
  }, delay);
}

function stopBots(room) {
  clearTimeout(room.botTimer);
  room.botTimer = null;
}

// ---------------------------------------------------------------- sockets

io.on('connection', (socket) => {
  let session = null; // { room, kind: 'host' | 'player', player? }

  function detach() {
    if (!session) return;
    const { room, kind, player } = session;
    if (kind === 'host') socket.leave(`${room.code}:host`);
    else {
      socket.leave(`${room.code}:p:${player.id}`);
      player.sockets = Math.max(0, player.sockets - 1);
    }
    session = null;
    broadcast(room);
  }

  function attachHost(room) {
    detach();
    session = { room, kind: 'host' };
    socket.join(`${room.code}:host`);
    broadcast(room);
  }

  function attachPlayer(room, player) {
    detach();
    session = { room, kind: 'player', player };
    player.sockets++;
    socket.join(`${room.code}:p:${player.id}`);
    broadcast(room);
  }

  const isVip = () => session?.kind === 'player' && vipOf(session.room) === session.player.id;
  function needControl() {
    if (!session || !(session.kind === 'host' || isVip())) throw new RoomError('Only the host can do that');
    return session.room;
  }

  // Every event replies through the ack callback with { ok, error?, ...data }.
  function on(event, handler) {
    socket.on(event, (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        reply({ ok: true, ...(handler(payload ?? {}) ?? {}) });
      } catch (err) {
        if (err instanceof GameError || err instanceof RoomError) reply({ ok: false, error: err.message });
        else {
          console.error(err);
          reply({ ok: false, error: 'Something went wrong on the server' });
        }
      }
    });
  }

  on('host:create', () => {
    const room = createRoom();
    attachHost(room);
    return { code: room.code, hostToken: room.hostToken };
  });

  on('host:resume', ({ code, hostToken }) => {
    const room = getRoom(code);
    if (room.hostToken !== hostToken) throw new RoomError('Room not found');
    attachHost(room);
    return { code: room.code };
  });

  on('player:join', ({ code, name }) => {
    const room = getRoom(code);
    const player = addPlayer(room, name);
    attachPlayer(room, player);
    return { code: room.code, playerId: player.id, token: player.token };
  });

  on('player:resume', ({ code, playerId, token }) => {
    const room = getRoom(code);
    attachPlayer(room, findPlayer(room, playerId, token));
    return { code: room.code };
  });

  on('player:leave', () => {
    if (session?.kind !== 'player') return;
    const { room, player } = session;
    removePlayer(room, player.id);
    detach();
    broadcast(room);
  });

  on('room:kick', ({ playerId }) => {
    if (session?.kind !== 'host') throw new RoomError('Only the host screen can remove players');
    const room = session.room;
    removePlayer(room, playerId);
    io.to(`${room.code}:p:${playerId}`).emit('kicked');
    broadcast(room);
  });

  on('room:addBots', ({ count = 1 }) => {
    if (session?.kind !== 'host') throw new RoomError('Only the host screen can add bots');
    const room = session.room;
    const n = Math.max(1, Math.min(Number(count) || 1, MAX_PLAYERS - room.players.length));
    for (let i = 0; i < n; i++) addBot(room);
    broadcast(room);
  });

  on('game:start', () => {
    const room = needControl();
    if (room.game) throw new RoomError('The game already started');
    room.game = createGame(room.players.map(({ id, name }) => ({ id, name })));
    broadcast(room);
  });

  on('game:reset', () => {
    const room = needControl();
    stopBots(room);
    room.game = null;
    broadcast(room);
  });

  on('game:action', (action) => {
    if (session?.kind !== 'player') throw new RoomError('Join the room first');
    const { room, player } = session;
    if (!room.game) throw new RoomError('The game hasn’t started');
    act(room.game, player.id, action);
    broadcast(room);
  });

  socket.on('disconnect', detach);
});

setInterval(() => sweep(6 * 60 * 60 * 1000), 10 * 60 * 1000).unref();

server.listen(PORT, () => {
  console.log(`Secret Austrian server on http://localhost:${PORT}`);
});
