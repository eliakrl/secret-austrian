// Pieces used by both the host screen and phones.
import { LIBERALS_TO_WIN, LEADER_ZONE, VETO_UNLOCK, TRACKER_LIMIT } from '../../shared/rules.js';
import { THEME, POWER_NAMES, POWER_VERBS } from '../../shared/theme.js';

export const nameOf = (game, id) => game.players.find((p) => p.id === id)?.name ?? '?';

export function statusText(game) {
  const P = nameOf(game, game.presidentId);
  switch (game.phase) {
    case 'nominate':
      return `${P} is choosing a Chancellor`;
    case 'vote':
      return `Vote on President ${P} and Chancellor ${nameOf(game, game.nomineeId)}`;
    case 'legislative_president':
      return `President ${P} is discarding a policy`;
    case 'legislative_chancellor':
      return `Chancellor ${nameOf(game, game.chancellorId)} is enacting a policy`;
    case 'veto':
      return `Chancellor ${nameOf(game, game.chancellorId)} requested a veto. ${P} decides.`;
    case 'executive':
      return `President ${P} must ${POWER_VERBS[game.power.type]}`;
    case 'gameover':
      return game.winReason;
    default:
      return '';
  }
}

export function PolicyCard({ policy, small }) {
  return (
    <div className={`policy policy-${policy}${small ? ' small' : ''}`}>
      <span>{THEME[policy]}</span>
    </div>
  );
}

function Track({ kind, count, slots }) {
  return (
    <div className={`track track-${kind}`}>
      <div className="track-label">{kind === 'liberal' ? `${THEME.liberal}s` : `${THEME.fascist}s`}</div>
      <div className="track-slots">
        {slots.map((slot, i) => (
          <div key={i} className={`slot${slot.danger ? ' danger' : ''}`}>
            {i < count ? (
              <PolicyCard policy={kind} small />
            ) : (
              <div className="slot-empty">
                {slot.label && <span>{slot.label}</span>}
                {slot.last && <span className="slot-win">Win</span>}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Board({ game }) {
  const liberalSlots = Array.from({ length: LIBERALS_TO_WIN }, (_, i) => ({ last: i === LIBERALS_TO_WIN - 1 }));
  const fascistSlots = game.track.map((power, i) => ({
    label: [power && POWER_NAMES[power], i + 1 === VETO_UNLOCK && 'Veto unlocked'].filter(Boolean).join(' · '),
    danger: i >= LEADER_ZONE,
    last: i === game.track.length - 1,
  }));
  return (
    <div className="board">
      <Track kind="liberal" count={game.liberal} slots={liberalSlots} />
      <Track kind="fascist" count={game.fascist} slots={fascistSlots} />
      <div className="board-footer">
        <div className="tracker">
          <span>Election tracker</span>
          {Array.from({ length: TRACKER_LIMIT }, (_, i) => (
            <span key={i} className={`dot${i < game.tracker ? ' on' : ''}`} />
          ))}
        </div>
        <div className="piles">
          <span>Draw pile <b>{game.deckCount}</b></span>
          <span>Discard <b>{game.discardCount}</b></span>
        </div>
      </div>
    </div>
  );
}
