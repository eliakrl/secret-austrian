import { useEffect, useState } from 'react';
import { socket, emit, store } from './socket.js';
import { PolicyCard, statusText, nameOf } from './shared.jsx';
import { LIBERALS_TO_WIN, FASCISTS_TO_WIN, MIN_PLAYERS } from '../../shared/rules.js';
import { THEME, ROLE_NAMES } from '../../shared/theme.js';

const KEY = 'sa-player';

export default function Player() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [joined, setJoined] = useState(() => Boolean(store.get(KEY)));

  useEffect(() => {
    const onState = (s) => setState(s);
    const onKicked = () => {
      store.clear(KEY);
      setJoined(false);
      setState(null);
      setError('You were removed from the room.');
    };
    const resume = async () => {
      const saved = store.get(KEY);
      if (!saved) return;
      const res = await emit('player:resume', saved);
      if (!res.ok) {
        store.clear(KEY);
        setJoined(false);
        setError(res.error);
      }
    };
    socket.on('state', onState);
    socket.on('kicked', onKicked);
    socket.on('connect', resume);
    if (socket.connected) resume();
    return () => {
      socket.off('state', onState);
      socket.off('kicked', onKicked);
      socket.off('connect', resume);
    };
  }, []);

  async function run(event, payload) {
    const res = await emit(event, payload);
    setError(res.ok ? null : res.error);
    return res;
  }

  async function join(code, name) {
    const res = await run('player:join', { code, name });
    if (res.ok) {
      store.set(KEY, { code: res.code, playerId: res.playerId, token: res.token });
      setJoined(true);
    }
  }

  async function rejoin(saved) {
    const res = await run('player:resume', saved);
    if (res.ok) {
      store.set(KEY, saved);
      setJoined(true);
    }
  }

  async function leave() {
    await run('player:leave');
    store.clear(KEY);
    setJoined(false);
    setState(null);
  }

  const action = (payload) => run('game:action', payload);

  return (
    <div className="phone">
      {error && <div className="error" onClick={() => setError(null)}>{error}</div>}
      {!joined || !state ? (
        <JoinScreen onJoin={join} onRejoin={rejoin} />
      ) : !state.game ? (
        <PhoneLobby state={state} onStart={() => run('game:start')} onLeave={leave} />
      ) : (
        <PhoneGame state={state} act={action} onReset={() => run('game:reset')} />
      )}
    </div>
  );
}

function JoinScreen({ onJoin, onRejoin }) {
  const [code, setCode] = useState(() => new URLSearchParams(window.location.search).get('room') ?? '');
  const [name, setName] = useState('');
  const remembered = store.remembered(KEY);

  return (
    <main className="join">
      <h1>{THEME.title}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onJoin(code, name);
        }}
      >
        <label>
          Room code
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={4} autoCapitalize="characters" autoComplete="off" placeholder="ABCD" />
        </label>
        <label>
          Your name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={16} autoComplete="nickname" placeholder="Name" />
        </label>
        <button className="primary" disabled={code.length !== 4 || !name.trim()}>Join</button>
      </form>
      {remembered && (
        <button className="secondary" onClick={() => onRejoin(remembered)}>Rejoin room {remembered.code}</button>
      )}
      <a className="link" href="/host">Host a game on this screen</a>
    </main>
  );
}

function PhoneLobby({ state, onStart, onLeave }) {
  const { room, meId, meName } = state;
  const isVip = room.vipId === meId;
  const n = room.players.length;
  return (
    <main className="phone-lobby">
      <p className="eyebrow">Room {room.code}</p>
      <h2>You’re in, {meName}</h2>
      <p className="muted">{n} player{n === 1 ? '' : 's'} joined. Keep this screen open.</p>
      <ul className="player-list compact">
        {room.players.map((p) => <li key={p.id}>{p.name}</li>)}
      </ul>
      {isVip && (
        <button className="primary" disabled={n < MIN_PLAYERS} onClick={onStart}>
          {n < MIN_PLAYERS ? `Waiting for ${MIN_PLAYERS - n} more` : 'Everyone’s in, start'}
        </button>
      )}
      <button className="link" onClick={onLeave}>Leave room</button>
    </main>
  );
}

function RoleCard({ game, me }) {
  const [open, setOpen] = useState(false);
  return (
    <button className={`role-card ${open ? `open role-${me.role}` : ''}`} onClick={() => setOpen(!open)}>
      {open ? (
        <>
          <span className="role-name">{ROLE_NAMES[me.role]}</span>
          <span className="role-party">Party: {THEME[me.party]}</span>
          {me.team.length > 0 && (
            <span className="role-team">
              {me.team.map((t) => `${nameOf(game, t.id)} (${ROLE_NAMES[t.role]})`).join(', ')}
            </span>
          )}
          {me.role === 'leader' && me.team.length === 0 && (
            <span className="role-team">You don’t know your {THEME.fascist}s. They know you.</span>
          )}
          <span className="hint">Tap to hide</span>
        </>
      ) : (
        <span className="hint">Tap to see your secret role</span>
      )}
    </button>
  );
}

// Select one option, then confirm. Prevents fat-finger mistakes.
function PickPlayer({ game, ids, confirmLabel, onConfirm }) {
  const [picked, setPicked] = useState(null);
  return (
    <div className="pick">
      <div className="pick-list">
        {ids.map((id) => (
          <button key={id} className={`choice${picked === id ? ' picked' : ''}`} onClick={() => setPicked(id)}>
            {nameOf(game, id)}
          </button>
        ))}
      </div>
      <button className="primary" disabled={!picked} onClick={() => onConfirm(picked)}>
        {picked ? `${confirmLabel} ${nameOf(game, picked)}` : 'Pick a player'}
      </button>
    </div>
  );
}

function PickCard({ cards, confirmLabel, onConfirm }) {
  const [picked, setPicked] = useState(null);
  return (
    <div className="pick">
      <div className="cards">
        {cards.map((c, i) => (
          <button key={i} className={`card-btn${picked === i ? ' picked' : ''}`} onClick={() => setPicked(i)}>
            <PolicyCard policy={c} />
          </button>
        ))}
      </div>
      <button className="primary" disabled={picked === null} onClick={() => onConfirm(picked)}>
        {picked === null ? 'Tap a card' : `${confirmLabel} ${THEME[cards[picked]]}`}
      </button>
    </div>
  );
}

function PhoneGame({ state, act, onReset }) {
  const { game, room, meId } = state;
  const me = game.me;
  const isPresident = meId === game.presidentId;
  const isChancellor = meId === game.chancellorId;
  const others = game.players.filter((p) => p.alive && p.id !== meId).map((p) => p.id);

  let panel = <p className="waiting">{statusText(game)}</p>;

  if (game.phase === 'gameover') {
    const won = game.winner === me.party;
    panel = (
      <div className="gameover">
        <h2>{won ? 'You won!' : 'You lost'}</h2>
        <p>{game.winReason}</p>
        {room.vipId === meId && <button className="primary" onClick={onReset}>Back to lobby</button>}
      </div>
    );
  } else if (!me.alive) {
    panel = <p className="waiting">You were executed. Stay quiet and watch the game unfold.</p>;
  } else if (game.phase === 'nominate' && isPresident) {
    panel = (
      <>
        <h3>You’re the presidential candidate</h3>
        <p className="muted">Nominate a Chancellor.</p>
        <PickPlayer game={game} ids={me.eligible} confirmLabel="Nominate" onConfirm={(id) => act({ type: 'nominate', targetId: id })} />
      </>
    );
  } else if (game.phase === 'vote') {
    panel = (
      <>
        <h3>Vote</h3>
        <p className="muted">President {nameOf(game, game.presidentId)} and Chancellor {nameOf(game, game.nomineeId)}?</p>
        <div className="vote-buttons">
          <button className={`vote ja${me.myVote === true ? ' picked' : ''}`} onClick={() => act({ type: 'vote', ja: true })}>{THEME.ja}</button>
          <button className={`vote nein${me.myVote === false ? ' picked' : ''}`} onClick={() => act({ type: 'vote', ja: false })}>{THEME.nein}</button>
        </div>
        {me.myVote !== null && <p className="muted">Vote locked in. You can change it until everyone has voted.</p>}
      </>
    );
  } else if (me.hand && game.phase === 'legislative_president') {
    panel = (
      <>
        <h3>Discard one policy</h3>
        <p className="muted">The other two go to the Chancellor.</p>
        <PickCard cards={me.hand} confirmLabel="Discard" onConfirm={(i) => act({ type: 'discard', index: i })} />
      </>
    );
  } else if (me.hand && game.phase === 'legislative_chancellor') {
    panel = (
      <>
        <h3>Enact one policy</h3>
        <PickCard cards={me.hand} confirmLabel="Enact" onConfirm={(i) => act({ type: 'enact', index: i })} />
        {me.canVeto && <button className="secondary" onClick={() => act({ type: 'veto' })}>Request veto</button>}
      </>
    );
  } else if (game.phase === 'veto' && isPresident) {
    panel = (
      <>
        <h3>Chancellor requests a veto</h3>
        <p className="muted">Agree and both policies are discarded (the election tracker advances). Refuse and the Chancellor must enact one.</p>
        <div className="vote-buttons">
          <button className="vote ja" onClick={() => act({ type: 'vetoResponse', accept: true })}>Agree</button>
          <button className="vote nein" onClick={() => act({ type: 'vetoResponse', accept: false })}>Refuse</button>
        </div>
      </>
    );
  } else if (game.phase === 'executive' && isPresident) {
    panel = <PowerPanel game={game} me={me} others={others} act={act} />;
  } else if (isChancellor && game.phase === 'legislative_president') {
    panel = <p className="waiting">You’re Chancellor. The President is picking which two policies to hand you.</p>;
  }

  return (
    <main className="phone-game">
      <header className="phone-header">
        <span>{state.meName}</span>
        <span className="score">
          <b className="lib">{game.liberal}/{LIBERALS_TO_WIN}</b> · <b className="fas">{game.fascist}/{FASCISTS_TO_WIN}</b>
        </span>
      </header>
      <RoleCard game={game} me={me} />
      <section className="panel" key={`${game.phase}-${game.log.length}`}>{panel}</section>
      {me.knowledge.length > 0 && (
        <section className="knowledge">
          <p className="eyebrow">Your investigations</p>
          {me.knowledge.map((k) => (
            <p key={k.targetId}>{nameOf(game, k.targetId)} is <b className={k.party === 'liberal' ? 'lib' : 'fas'}>{THEME[k.party]}</b></p>
          ))}
        </section>
      )}
    </main>
  );
}

function PowerPanel({ game, me, others, act }) {
  const { power } = me;
  if (power.type === 'peek') {
    return (
      <>
        <h3>Policy peek</h3>
        <p className="muted">The next three policies, in order. Only you see this.</p>
        <div className="cards">{power.cards.map((c, i) => <PolicyCard key={i} policy={c} />)}</div>
        <button className="primary" onClick={() => act({ type: 'done' })}>Done</button>
      </>
    );
  }
  if (power.type === 'investigate') {
    if (power.result) {
      return (
        <>
          <h3>Investigation result</h3>
          <p className="result">{nameOf(game, power.targetId)} is a <b className={power.result === 'liberal' ? 'lib' : 'fas'}>{THEME[power.result]}</b></p>
          <p className="muted">You may share this, or lie about it.</p>
          <button className="primary" onClick={() => act({ type: 'done' })}>Done</button>
        </>
      );
    }
    return (
      <>
        <h3>Investigate loyalty</h3>
        <p className="muted">See one player’s party membership.</p>
        <PickPlayer game={game} ids={others.filter((id) => !power.investigated.includes(id))} confirmLabel="Investigate" onConfirm={(id) => act({ type: 'investigate', targetId: id })} />
      </>
    );
  }
  if (power.type === 'special') {
    return (
      <>
        <h3>Special election</h3>
        <p className="muted">Choose the next presidential candidate.</p>
        <PickPlayer game={game} ids={others} confirmLabel="Choose" onConfirm={(id) => act({ type: 'special', targetId: id })} />
      </>
    );
  }
  return (
    <>
      <h3>Execution</h3>
      <p className="muted">Choose a player to execute. If they are {THEME.leader}, the {THEME.liberal}s win.</p>
      <PickPlayer game={game} ids={others} confirmLabel="Execute" onConfirm={(id) => act({ type: 'execute', targetId: id })} />
    </>
  );
}
