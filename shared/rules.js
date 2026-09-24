// Game constants from the original rules. Shared by server and client.

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

export const LIBERAL_POLICIES = 6;
export const FASCIST_POLICIES = 11;

export const LIBERALS_TO_WIN = 5;
export const FASCISTS_TO_WIN = 6;
export const VETO_UNLOCK = 5; // fascist policies needed before veto is allowed
export const LEADER_ZONE = 3; // fascist policies after which electing the leader as chancellor wins
export const TRACKER_LIMIT = 3; // failed elections before the top policy is forced

// Number of fascists (not counting the leader) per player count.
export const FASCISTS_BY_COUNT = { 5: 1, 6: 1, 7: 2, 8: 2, 9: 3, 10: 3 };

// Presidential power unlocked by each fascist policy slot (index 0 = first policy).
export function fascistTrack(playerCount) {
  if (playerCount <= 6) return [null, null, 'peek', 'execute', 'execute', null];
  if (playerCount <= 8) return [null, 'investigate', 'special', 'execute', 'execute', null];
  return ['investigate', 'investigate', 'special', 'execute', 'execute', null];
}

// The leader learns who the fascists are only in small games.
export const leaderKnowsTeam = (playerCount) => playerCount <= 6;
