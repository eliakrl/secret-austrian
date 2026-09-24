// Pure game engine: all rules live here, no networking.
// A game is a plain object mutated by act(). Views for the host screen and
// each phone are derived with publicView() / playerView() so hidden info
// never leaves the server unless that player is allowed to see it.

import {
  MIN_PLAYERS, MAX_PLAYERS, LIBERAL_POLICIES, FASCIST_POLICIES,
  LIBERALS_TO_WIN, FASCISTS_TO_WIN, VETO_UNLOCK, LEADER_ZONE, TRACKER_LIMIT,
  FASCISTS_BY_COUNT, fascistTrack, leaderKnowsTeam,
} from '../shared/rules.js';
import { THEME, POWER_VERBS } from '../shared/theme.js';

export class GameError extends Error {}

export function shuffle(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const partyOf = (role) => (role === 'liberal' ? 'liberal' : 'fascist');

const byId = (g, id) => g.players.find((p) => p.id === id);
const nameOf = (g, id) => byId(g, id)?.name ?? '?';
const alivePlayers = (g) => g.players.filter((p) => p.alive);

function log(g, text) {
  g.log.push({ t: Date.now(), text });
}

// ---------------------------------------------------------------- setup

export function createGame(players, rng = Math.random) {
  const n = players.length;
  if (n < MIN_PLAYERS || n > MAX_PLAYERS) {
    throw new GameError(`Need ${MIN_PLAYERS}–${MAX_PLAYERS} players to start`);
  }
  const fascists = FASCISTS_BY_COUNT[n];
  const roles = shuffle(
    ['leader', ...Array(fascists).fill('fascist'), ...Array(n - 1 - fascists).fill('liberal')],
    rng,
  );
  const g = {
    rng,
    players: players.map((p, i) => ({ id: p.id, name: p.name, role: roles[i], alive: true })),
    track: fascistTrack(n),
    deck: shuffle(
      [...Array(LIBERAL_POLICIES).fill('liberal'), ...Array(FASCIST_POLICIES).fill('fascist')],
      rng,
    ),
    discard: [],
    liberal: 0,
    fascist: 0,
    tracker: 0,
    presidentId: players[Math.floor(rng() * n)].id,
    resumeAfterId: null, // set by a special election: rotation continues after this player
    nomineeId: null,
    chancellorId: null,
    termLimited: { presidentId: null, chancellorId: null },
    phase: 'nominate',
    votes: {},
    lastVote: null,
    hand: [],
    vetoRejected: false,
    power: null,
    investigated: [],
    cleared: [], // players publicly proven not to be the leader
    knowledge: {}, // playerId -> [{ targetId, party }] from investigations
    winner: null,
    winReason: null,
    log: [],
  };
  log(g, `The game begins. ${nameOf(g, g.presidentId)} is the first presidential candidate.`);
  return g;
}

// ---------------------------------------------------------------- helpers

export function eligibleChancellors(g) {
  const alive = alivePlayers(g);
  return alive
    .filter((p) => p.id !== g.presidentId)
    .filter((p) => p.id !== g.termLimited.chancellorId)
    // with only 5 players left, the last president may be chancellor again
    .filter((p) => !(alive.length > 5 && p.id === g.termLimited.presidentId))
    .map((p) => p.id);
}

function nextAliveAfter(g, id) {
  const i = g.players.findIndex((p) => p.id === id);
  for (let k = 1; k <= g.players.length; k++) {
    const p = g.players[(i + k) % g.players.length];
    if (p.alive) return p.id;
  }
  return id;
}

function ensureDeck(g) {
  if (g.deck.length < 3) {
    g.deck = shuffle([...g.deck, ...g.discard], g.rng);
    g.discard = [];
    log(g, 'The discard pile was shuffled back into the deck.');
  }
}

function startNomination(g) {
  g.phase = 'nominate';
  g.nomineeId = null;
  g.chancellorId = null;
  g.votes = {};
  g.hand = [];
  g.vetoRejected = false;
  g.power = null;
}

function nextPresident(g) {
  const from = g.resumeAfterId ?? g.presidentId;
  g.resumeAfterId = null;
  g.presidentId = nextAliveAfter(g, from);
  startNomination(g);
}

function win(g, winner, reason) {
  g.winner = winner;
  g.winReason = reason;
  g.phase = 'gameover';
  g.hand = [];
  g.power = null;
  log(g, reason);
}

function clear(g, id) {
  if (!g.cleared.includes(id)) g.cleared.push(id);
}

function enactPolicy(g, policy, { chaos = false } = {}) {
  g[policy]++;
  g.tracker = 0;
  log(g, chaos
    ? `Three failed elections. The country is in chaos and the top policy is enacted: ${THEME[policy]}.`
    : `A ${THEME[policy]} policy was enacted.`);

  if (g.liberal >= LIBERALS_TO_WIN) return win(g, 'liberal', `${LIBERALS_TO_WIN} ${THEME.liberal} policies enacted. ${THEME.liberal}s win!`);
  if (g.fascist >= FASCISTS_TO_WIN) return win(g, 'fascist', `${FASCISTS_TO_WIN} ${THEME.fascist} policies enacted. ${THEME.fascist}s win!`);
  if (g.fascist === VETO_UNLOCK && policy === 'fascist') log(g, 'Veto power is now unlocked.');

  ensureDeck(g);
  const power = !chaos && policy === 'fascist' ? g.track[g.fascist - 1] : null;
  if (power) {
    g.phase = 'executive';
    g.power = { type: power };
    if (power === 'peek') g.power.cards = g.deck.slice(0, 3);
    log(g, `President ${nameOf(g, g.presidentId)} must ${POWER_VERBS[power]}.`);
  } else {
    nextPresident(g);
  }
}

function failGovernment(g) {
  g.tracker++;
  if (g.tracker >= TRACKER_LIMIT) {
    g.termLimited = { presidentId: null, chancellorId: null };
    enactPolicy(g, g.deck.shift(), { chaos: true });
  } else {
    nextPresident(g);
  }
}

function resolveVote(g) {
  const voters = alivePlayers(g);
  const ja = voters.filter((p) => g.votes[p.id]).length;
  const nein = voters.length - ja;
  const passed = ja > voters.length / 2;
  g.lastVote = { presidentId: g.presidentId, nomineeId: g.nomineeId, votes: { ...g.votes }, ja, nein, passed };
  g.votes = {};

  if (!passed) {
    log(g, `The vote failed (${ja}–${nein}). The election tracker advances.`);
    return failGovernment(g);
  }

  g.chancellorId = g.nomineeId;
  g.termLimited = { presidentId: g.presidentId, chancellorId: g.chancellorId };
  log(g, `President ${nameOf(g, g.presidentId)} and Chancellor ${nameOf(g, g.chancellorId)} were elected (${ja}–${nein}).`);

  if (g.fascist >= LEADER_ZONE) {
    if (byId(g, g.chancellorId).role === 'leader') {
      return win(g, 'fascist', `${nameOf(g, g.chancellorId)} is ${THEME.leader} and was elected Chancellor. ${THEME.fascist}s win!`);
    }
    clear(g, g.chancellorId);
    log(g, `${nameOf(g, g.chancellorId)} is confirmed not to be ${THEME.leader}.`);
  }

  ensureDeck(g);
  g.hand = g.deck.splice(0, 3);
  g.phase = 'legislative_president';
}

// ---------------------------------------------------------------- actions

function need(cond, message) {
  if (!cond) throw new GameError(message);
}

function needPhase(g, phase) {
  need(g.phase === phase, 'You can’t do that right now');
}

function needPresident(g, id) {
  need(id === g.presidentId, 'Only the President can do that');
}

function needTarget(g, actorId, targetId) {
  const t = byId(g, targetId);
  need(t && t.alive && targetId !== actorId, 'Pick another living player');
  return t;
}

function needCard(g, index) {
  need(Number.isInteger(index) && index >= 0 && index < g.hand.length, 'Invalid card');
}

function needPower(g, actorId, type) {
  needPhase(g, 'executive');
  needPresident(g, actorId);
  need(g.power.type === type, 'That is not the current power');
}

export function act(g, actorId, action = {}) {
  need(g.phase !== 'gameover', 'The game is over');
  const actor = byId(g, actorId);
  need(actor, 'You are not in this game');
  need(actor.alive, 'Executed players can’t act');

  switch (action.type) {
    case 'nominate': {
      needPhase(g, 'nominate');
      needPresident(g, actorId);
      need(eligibleChancellors(g).includes(action.targetId), 'That player can’t be Chancellor');
      g.nomineeId = action.targetId;
      g.votes = {};
      g.phase = 'vote';
      log(g, `${actor.name} nominated ${nameOf(g, action.targetId)} for Chancellor.`);
      return;
    }

    case 'vote': {
      needPhase(g, 'vote');
      need(typeof action.ja === 'boolean', 'Vote Ja or Nein');
      g.votes[actorId] = action.ja;
      if (alivePlayers(g).every((p) => p.id in g.votes)) resolveVote(g);
      return;
    }

    case 'discard': {
      needPhase(g, 'legislative_president');
      needPresident(g, actorId);
      needCard(g, action.index);
      g.discard.push(...g.hand.splice(action.index, 1));
      g.phase = 'legislative_chancellor';
      return;
    }

    case 'enact': {
      needPhase(g, 'legislative_chancellor');
      need(actorId === g.chancellorId, 'Only the Chancellor can do that');
      needCard(g, action.index);
      const [policy] = g.hand.splice(action.index, 1);
      g.discard.push(...g.hand);
      g.hand = [];
      return enactPolicy(g, policy);
    }

    case 'veto': {
      needPhase(g, 'legislative_chancellor');
      need(actorId === g.chancellorId, 'Only the Chancellor can do that');
      need(g.fascist >= VETO_UNLOCK, 'Veto is not unlocked yet');
      need(!g.vetoRejected, 'The President already refused the veto');
      g.phase = 'veto';
      log(g, `Chancellor ${actor.name} wants to veto this agenda.`);
      return;
    }

    case 'vetoResponse': {
      needPhase(g, 'veto');
      needPresident(g, actorId);
      if (action.accept) {
        g.discard.push(...g.hand);
        g.hand = [];
        log(g, `President ${actor.name} agreed to the veto. Both policies are discarded.`);
        ensureDeck(g);
        return failGovernment(g);
      }
      g.vetoRejected = true;
      g.phase = 'legislative_chancellor';
      log(g, `President ${actor.name} refused the veto. The Chancellor must enact a policy.`);
      return;
    }

    case 'investigate': {
      needPower(g, actorId, 'investigate');
      need(!g.power.result, 'You already investigated someone');
      const t = needTarget(g, actorId, action.targetId);
      need(!g.investigated.includes(t.id), 'That player was already investigated');
      g.investigated.push(t.id);
      g.power.targetId = t.id;
      g.power.result = partyOf(t.role);
      (g.knowledge[actorId] ??= []).push({ targetId: t.id, party: g.power.result });
      log(g, `President ${actor.name} investigated ${t.name}.`);
      return;
    }

    case 'special': {
      needPower(g, actorId, 'special');
      const t = needTarget(g, actorId, action.targetId);
      log(g, `President ${actor.name} called a special election. ${t.name} is the next presidential candidate.`);
      g.resumeAfterId = g.presidentId;
      g.presidentId = t.id;
      startNomination(g);
      return;
    }

    case 'execute': {
      needPower(g, actorId, 'execute');
      const t = needTarget(g, actorId, action.targetId);
      t.alive = false;
      log(g, `President ${actor.name} executed ${t.name}.`);
      if (t.role === 'leader') {
        return win(g, 'liberal', `${t.name} was ${THEME.leader}. ${THEME.liberal}s win!`);
      }
      clear(g, t.id);
      log(g, `${t.name} was not ${THEME.leader}.`);
      return nextPresident(g);
    }

    case 'done': {
      // President acknowledges a peek or an investigation result.
      needPhase(g, 'executive');
      needPresident(g, actorId);
      need(g.power.type === 'peek' || (g.power.type === 'investigate' && g.power.result), 'Finish your action first');
      return nextPresident(g);
    }

    default:
      throw new GameError('Unknown action');
  }
}

// ---------------------------------------------------------------- views

export function publicView(g) {
  const over = g.phase === 'gameover';
  return {
    phase: g.phase,
    players: g.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      hasVoted: g.phase === 'vote' && p.id in g.votes,
      cleared: g.cleared.includes(p.id),
      role: over ? p.role : undefined,
    })),
    presidentId: g.presidentId,
    nomineeId: g.nomineeId,
    chancellorId: g.chancellorId,
    termLimited: g.termLimited,
    liberal: g.liberal,
    fascist: g.fascist,
    track: g.track,
    tracker: g.tracker,
    deckCount: g.deck.length,
    discardCount: g.discard.length,
    vetoUnlocked: g.fascist >= VETO_UNLOCK,
    leaderZone: g.fascist >= LEADER_ZONE,
    lastVote: g.lastVote,
    power: g.power && { type: g.power.type, targetId: g.power.targetId ?? null },
    winner: g.winner,
    winReason: g.winReason,
    log: g.log.slice(-40),
  };
}

export function playerView(g, id) {
  const view = publicView(g);
  const me = byId(g, id);
  if (!me) return { ...view, me: null };

  const knowsTeam = me.role === 'fascist' || (me.role === 'leader' && leaderKnowsTeam(g.players.length));
  const isPresident = id === g.presidentId;
  const isChancellor = id === g.chancellorId;
  const seesHand =
    (g.phase === 'legislative_president' && isPresident) ||
    (g.phase === 'legislative_chancellor' && isChancellor);

  return {
    ...view,
    me: {
      id,
      role: me.role,
      party: partyOf(me.role),
      alive: me.alive,
      team: knowsTeam
        ? g.players.filter((p) => p.id !== id && p.role !== 'liberal').map((p) => ({ id: p.id, role: p.role }))
        : [],
      myVote: g.phase === 'vote' ? (g.votes[id] ?? null) : null,
      hand: seesHand ? [...g.hand] : null,
      canVeto: g.phase === 'legislative_chancellor' && isChancellor && g.fascist >= VETO_UNLOCK && !g.vetoRejected,
      eligible: g.phase === 'nominate' && isPresident ? eligibleChancellors(g) : null,
      power: g.phase === 'executive' && isPresident ? { ...g.power, investigated: g.investigated } : null,
      knowledge: g.knowledge[id] ?? [],
    },
  };
}
