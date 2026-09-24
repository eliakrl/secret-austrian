// Random-move bots for testing. Used by test mode on the server and by scripts/bots.js.

const pick = (arr, rng) => arr[Math.floor(rng() * arr.length)];

// Given a player's view (from playerView), return a legal action for that player, or null if it isn't their turn.
export function botAction(game, meId, rng = Math.random) {
  const me = game.me;
  if (!me || !me.alive || game.phase === 'gameover') return null;
  const isPres = meId === game.presidentId;
  const others = game.players.filter((p) => p.alive && p.id !== meId).map((p) => p.id);

  switch (game.phase) {
    case 'vote':
      return me.myVote === null ? { type: 'vote', ja: rng() < 0.65 } : null;
    case 'nominate':
      return isPres ? { type: 'nominate', targetId: pick(me.eligible, rng) } : null;
    case 'legislative_president':
      return me.hand ? { type: 'discard', index: Math.floor(rng() * me.hand.length) } : null;
    case 'legislative_chancellor':
      if (!me.hand) return null;
      return me.canVeto && rng() < 0.3 ? { type: 'veto' } : { type: 'enact', index: Math.floor(rng() * me.hand.length) };
    case 'veto':
      return isPres ? { type: 'vetoResponse', accept: rng() < 0.5 } : null;
    case 'executive': {
      if (!isPres) return null;
      const { power } = me;
      if (power.type === 'peek' || power.result) return { type: 'done' };
      if (power.type === 'investigate') {
        return { type: 'investigate', targetId: pick(others.filter((id) => !power.investigated.includes(id)), rng) };
      }
      return { type: power.type, targetId: pick(others, rng) };
    }
    default:
      return null;
  }
}
