// Pieces used by both the host screen and phones.
import { boardSize } from '../../shared/rules.js';
import { THEME, POWER_VERBS } from '../../shared/theme.js';
import liberalBoard from './assets/boards/liberal.webp';
import fascist56 from './assets/boards/fascist-5-6.webp';
import fascist78 from './assets/boards/fascist-7-8.webp';
import fascist910 from './assets/boards/fascist-9-10.webp';

const FASCIST_BOARDS = { '5-6': fascist56, '7-8': fascist78, '9-10': fascist910 };

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

// Slot geometry, as fractions of the board photos (all four are 2000x667).
const IMG_W = 2000;
const IMG_H = 667;
const pct = (v, total) => `${(v / total) * 100}%`;
const box = (x0, x1, y0, y1) => ({ left: pct(x0, IMG_W), width: pct(x1 - x0, IMG_W), top: pct(y0, IMG_H), height: pct(y1 - y0, IMG_H) });

const FASCIST_SLOT_W = 286.8;
const fascistSlots = Array.from({ length: 6 }, (_, i) => box(137 + i * FASCIST_SLOT_W, 137 + (i + 1) * FASCIST_SLOT_W, 135, 528));
const LIBERAL_EDGES = [268, 562, 853, 1140, 1430, 1748];
const liberalSlots = LIBERAL_EDGES.slice(0, -1).map((x, i) => box(x, LIBERAL_EDGES[i + 1], 132, 532));
const TRACKER_X = [685, 881, 1077, 1275]; // the four circles printed on the liberal board
const TRACKER_Y = 585;

function BoardCards({ kind, count, slots }) {
  return slots.slice(0, count).map((style, i) => (
    <div key={i} className="board-slot" style={style}>
      <PolicyCard policy={kind} small />
    </div>
  ));
}

export function Board({ game }) {
  const fascistImage = FASCIST_BOARDS[boardSize(game.players.length)];
  return (
    <div className="board">
      <div className="board-art board-liberal">
        <img src={liberalBoard} alt={`${THEME.liberal} board`} draggable="false" />
        <BoardCards kind="liberal" count={game.liberal} slots={liberalSlots} />
        <span className="pile-count" style={{ left: pct(95, IMG_W), top: pct(150, IMG_H) }} aria-label="Draw pile">{game.deckCount}</span>
        <span className="pile-count" style={{ left: pct(1905, IMG_W), top: pct(150, IMG_H) }} aria-label="Discard pile">{game.discardCount}</span>
        <span
          className="tracker-token"
          style={{ left: pct(TRACKER_X[Math.min(game.tracker, TRACKER_X.length - 1)], IMG_W), top: pct(TRACKER_Y, IMG_H) }}
          aria-label={`Election tracker ${game.tracker}`}
        />
      </div>
      <div className="board-art board-fascist">
        <img src={fascistImage} alt={`${THEME.fascist} board`} draggable="false" />
        <BoardCards kind="fascist" count={game.fascist} slots={fascistSlots} />
      </div>
    </div>
  );
}
