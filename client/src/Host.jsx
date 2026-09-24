import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { socket, emit, store } from './socket.js';
import { Board, statusText, nameOf } from './shared.jsx';
import { MIN_PLAYERS, MAX_PLAYERS } from '../../shared/rules.js';
import { THEME, ROLE_NAMES } from '../../shared/theme.js';

export default function Host() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const onState = (s) => setState(s);
    const connect = async () => {
      const saved = store.get('sa-host');
      if (saved && (await emit('host:resume', saved)).ok) return;
      const res = await emit('host:create');
      if (res.ok) store.set('sa-host', { code: res.code, hostToken: res.hostToken });
      else setError(res.error);
    };
    socket.on('state', onState);
    socket.on('connect', connect);
    if (socket.connected) connect();
    return () => {
      socket.off('state', onState);
      socket.off('connect', connect);
    };
  }, []);

  async function run(event, payload) {
    const res = await emit(event, payload);
    setError(res.ok ? null : res.error);
  }

  function newRoom() {
    store.clear('sa-host');
    window.location.reload();
  }

  if (!state) return <div className="host center"><p className="muted">{error ?? 'Opening a room…'}</p></div>;

  return (
    <div className={`host${state.game ? '' : ' host-menu'}`}>
      <header className="host-header">
        <div className="room-code">Room <b>{state.room.code}</b></div>
      </header>
      {error && <div className="error">{error}</div>}
      {state.game ? (
        <HostGame game={state.game} onReset={() => run('game:reset')} />
      ) : (
        <Lobby room={state.room} onStart={() => run('game:start')} onKick={(id) => run('room:kick', { playerId: id })} onNewRoom={newRoom} />
      )}
    </div>
  );
}

function useJoinUrl(code) {
  const [lanIp, setLanIp] = useState(null);
  useEffect(() => {
    fetch('/api/info').then((r) => r.json()).then((d) => setLanIp(d.lanIp)).catch(() => {});
  }, []);
  const { protocol, hostname, port, host } = window.location;
  const isLocal = ['localhost', '127.0.0.1'].includes(hostname);
  const origin = isLocal && lanIp ? `${protocol}//${lanIp}${port ? `:${port}` : ''}` : `${protocol}//${host}`;
  return `${origin}/?room=${code}`;
}

function Lobby({ room, onStart, onKick, onNewRoom }) {
  const url = useJoinUrl(room.code);
  const n = room.players.length;
  const canStart = n >= MIN_PLAYERS && n <= MAX_PLAYERS;
  return (
    <main className="lobby">
      <section className="join-card">
        <p className="eyebrow">Join on your phone</p>
        <div className="big-code">{room.code}</div>
        <div className="qr"><QRCodeSVG value={url} size={180} bgColor="#f4ecd8" fgColor="#1b1714" marginSize={2} /></div>
        <p className="url">{url}</p>
      </section>
      <section className="lobby-players">
        <h2>Players <span className="muted">{n}/{MAX_PLAYERS}</span></h2>
        {n === 0 && <p className="muted">Waiting for players to join…</p>}
        <ul className="player-list">
          {room.players.map((p, i) => (
            <li key={p.id} className={p.connected ? '' : 'offline'}>
              <span>{p.name}{i === 0 && <em className="tag">can start</em>}</span>
              <button className="link" onClick={() => onKick(p.id)} aria-label={`Remove ${p.name}`}>Remove</button>
            </li>
          ))}
        </ul>
        <button className="primary" disabled={!canStart} onClick={onStart}>
          {canStart ? 'Start game' : `Need ${MIN_PLAYERS}–${MAX_PLAYERS} players`}
        </button>
        <button className="link" onClick={onNewRoom}>Open a new room instead</button>
      </section>
    </main>
  );
}

function HostGame({ game, onReset }) {
  const showVotes = game.lastVote && game.phase !== 'vote';
  const alive = game.players.filter((p) => p.alive);
  const voted = game.players.filter((p) => p.hasVoted).length;

  return (
    <main className="host-game">
      <Board game={game} />
      <aside className="host-side">
        <section className={`status status-${game.phase}${game.winner ? ` win-${game.winner}` : ''}`}>
          <p className="eyebrow">{game.phase === 'gameover' ? 'Game over' : 'Now'}</p>
          <p className="status-text">{statusText(game)}</p>
          {game.phase === 'vote' && <p className="muted">{voted}/{alive.length} votes in. Vote on your phone.</p>}
          {game.phase !== 'gameover' && game.leaderZone && (
            <p className="warn">Danger zone: electing {THEME.leader} as Chancellor now wins it for the {THEME.fascist}s.</p>
          )}
          {showVotes && game.phase !== 'gameover' && (
            <p className="muted">
              Last vote: {nameOf(game, game.lastVote.presidentId)} + {nameOf(game, game.lastVote.nomineeId)}{' '}
              {game.lastVote.passed ? 'passed' : 'failed'} {game.lastVote.ja}–{game.lastVote.nein}
            </p>
          )}
          {game.phase === 'gameover' && <button className="primary" onClick={onReset}>Back to lobby</button>}
        </section>
        <section className="log">
          <p className="eyebrow">History</p>
          <ol>
            {[...game.log].reverse().map((entry) => <li key={entry.t + entry.text}>{entry.text}</li>)}
          </ol>
        </section>
      </aside>
      <section className="seats">
        {game.players.map((p) => {
          const vote = showVotes ? game.lastVote.votes[p.id] : undefined;
          return (
            <div key={p.id} className={`seat${p.alive ? '' : ' dead'}`}>
              <div className="seat-name">{p.name}</div>
              <div className="seat-badges">
                {p.id === game.presidentId && <span className="badge pres">President</span>}
                {p.id === game.chancellorId && <span className="badge chanc">Chancellor</span>}
                {p.id === game.nomineeId && !game.chancellorId && <span className="badge nominee">Nominee</span>}
                {game.phase === 'nominate' && p.id !== game.presidentId &&
                  (p.id === game.termLimited.chancellorId || (alive.length > 5 && p.id === game.termLimited.presidentId)) &&
                  <span className="badge limited">Term-limited</span>}
                {!p.alive && <span className="badge dead">Executed</span>}
                {p.cleared && p.alive && <span className="badge cleared">Not {THEME.leader}</span>}
                {game.phase === 'vote' && p.alive && <span className={`badge ${p.hasVoted ? 'voted' : 'waiting'}`}>{p.hasVoted ? 'Voted' : 'Voting'}</span>}
                {vote !== undefined && <span className={`badge ${vote ? 'ja' : 'nein'}`}>{vote ? THEME.ja : THEME.nein}</span>}
                {p.role && <span className={`badge role-${p.role}`}>{ROLE_NAMES[p.role]}</span>}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
