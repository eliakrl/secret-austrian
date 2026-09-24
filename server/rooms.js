// In-memory rooms. A room has one host screen and up to 10 players.
// Rooms vanish on server restart; that's fine for a party game.

import { randomBytes, randomUUID } from 'node:crypto';
import { MAX_PLAYERS } from '../shared/rules.js';

export class RoomError extends Error {}

const rooms = new Map();
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I or O, too easy to confuse
const token = () => randomBytes(16).toString('hex');

function newCode() {
  let code;
  do {
    code = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(code));
  return code;
}

export function createRoom() {
  const room = { code: newCode(), hostToken: token(), players: [], game: null, touched: Date.now() };
  rooms.set(room.code, room);
  return room;
}

export function getRoom(code) {
  const room = rooms.get(String(code ?? '').trim().toUpperCase());
  if (!room) throw new RoomError('Room not found. Check the code.');
  return room;
}

export function addPlayer(room, rawName) {
  const name = String(rawName ?? '').trim().replace(/\s+/g, ' ').slice(0, 16);
  if (!name) throw new RoomError('Enter a name');
  if (room.game) throw new RoomError('This game has already started');
  if (room.players.length >= MAX_PLAYERS) throw new RoomError('This room is full');
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    throw new RoomError('That name is taken');
  }
  const player = { id: randomUUID(), name, token: token(), sockets: 0 };
  room.players.push(player);
  return player;
}

export function findPlayer(room, id, playerToken) {
  const player = room.players.find((p) => p.id === id && p.token === playerToken);
  if (!player) throw new RoomError('Could not rejoin. Join again with your name.');
  return player;
}

export function removePlayer(room, id) {
  if (room.game) throw new RoomError('Can’t remove players during a game');
  room.players = room.players.filter((p) => p.id !== id);
}

// Drop rooms nobody has touched for a while.
export function sweep(maxAgeMs) {
  const cutoff = Date.now() - maxAgeMs;
  for (const [code, room] of rooms) if (room.touched < cutoff) rooms.delete(code);
}
