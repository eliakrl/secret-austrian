import express from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Server } from 'socket.io';
import { createGame, act, publicView, playerView, GameError } from './game.js';
import { createRoom, getRoom, addPlayer, findPlayer, removePlayer, sweep, RoomError } from './rooms.js';

const PORT = Number(process.env.PORT) || 3001;
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

function roomSummary(room) {
  return {
    code: room.code,
    players: room.players.map((p) => ({ id: p.id, name: p.name, connected: p.sockets > 0 })),
    vipId: room.players[0]?.id ?? null, // first to join can start the game from their phone
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

  const isVip = () => session?.kind === 'player' && session.room.players[0]?.id === session.player.id;
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

  on('game:start', () => {
    const room = needControl();
    if (room.game) throw new RoomError('The game already started');
    room.game = createGame(room.players.map(({ id, name }) => ({ id, name })));
    broadcast(room);
  });

  on('game:reset', () => {
    const room = needControl();
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
