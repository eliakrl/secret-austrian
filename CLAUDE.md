# Secret Austrian: context for Claude

Two friends, Luca (GitHub: Eliakrl, repo owner) and Lucaccola, are building this together. Each may be working with their own Claude. Read `README.md` for setup and `HANDOFF.md` for status and the ideas list.

## What this is

A non-commercial clone of *Secret Hitler* (CC BY-NC-SA 4.0; keep the attribution in the README and don't add anything commercial). It's played Jackbox-style: a **host screen** (`/host`, on a TV or laptop) shows only public information, and each **phone** (`/`) shows only that player's private info and actions.

## Architecture

- **Server-authoritative.** All game state lives on the server. Clients render views and send actions; they never compute rules.
- `server/game.js` is the whole rules engine. It is pure, with no I/O or sockets:
  - `createGame(players, rng)` → game object.
  - `act(game, playerId, action)` validates and mutates, and throws `GameError` for illegal moves. Actions: `nominate`, `vote`, `discard`, `enact`, `veto`, `vetoResponse`, `investigate`, `special`, `execute`, `done`.
  - `publicView(game)` is for the host screen. `playerView(game, id)` is `publicView` plus `me` (role, team, hand, eligible chancellors, power details, investigation knowledge).
  - Phases: `nominate → vote → legislative_president → legislative_chancellor (→ veto) → [executive] → nominate …`, ending in `gameover`.
- `server/rooms.js` handles in-memory rooms: 4-letter codes, player tokens for reconnect, lobby join and remove. Rooms vanish when the server restarts; that's accepted for now.
- `server/index.js` is Express + Socket.io. Every event replies via ack with `{ ok, error?, ...data }`. After any change, `broadcast(room)` pushes a fresh `state` to the host room (`CODE:host`) and to each player's room (`CODE:p:<id>`). Events: `host:create`, `host:resume`, `player:join`, `player:resume`, `player:leave`, `room:kick`, `game:start`, `game:reset`, `game:action`. The host screen or the first player to join ("VIP") can start and reset the game.
- `shared/rules.js` holds the rulebook numbers. `shared/theme.js` holds every player-facing name. The leader role's internal key is `leader`, displayed as "the Austrian". Never hardcode display names in components or the engine; use `THEME`.
- The client is React 19 + Vite, with no router: `App.jsx` switches on the `/host` path. `Host.jsx` is the board, `Player.jsx` is the phone, and `shared.jsx` holds `Board`, `PolicyCard` and `statusText`. It uses plain CSS in `styles.css` with custom properties on `:root` (dark theme, blue for liberal, red for fascist, gold for accents).
- Identity is kept in `sessionStorage` so each tab is a separate player, which makes local testing possible. `localStorage` remembers the last seat for the "Rejoin" button.

## Hidden-information rule (most important invariant)

A role, hand, peek result or investigation result must only ever appear in `playerView` for a player entitled to it. Roles are public only at `gameover`. If you add a feature, add a test asserting it doesn't leak through `publicView` (see the existing "never leaks" test).

## Commands

```bash
npm run dev        # server :3001 + Vite :5173 (proxies /socket.io and /api)
npm test           # node --test; includes 3,000 random full games
npm run build && npm start   # production: server serves client/dist on :3001
npm run bots -- CODE [count] [delayMs] [--start]   # random-move bots
```

## Conventions

- Rules changes go in `server/game.js` with a test in `server/game.test.js`. Keep the random-game simulator passing. It checks that the 17 policies are conserved and that every game terminates.
- Plain JS (ESM), no TypeScript. Match the existing style: small functions and short comments that explain why.
- Work on feature branches and open PRs against `main`. Don't push to `main` directly, and ask your human before pushing.
- Commit messages are descriptive, imperative mood.

## Decisions made so far

- Format is host screen plus phones (not everyone on their own board). The host screen is display-only; the person hosting plays on their phone too.
- Start with the faithful original rules; twists come later.
- Bots exist only for testing. There are no AI opponents in the real game yet.
- Irreversible phone actions (nominate, discard, enact, execute…) use a pick-then-confirm pattern to avoid mis-taps.

## Known gaps / next up

See `HANDOFF.md` → "Ideas for what's next": vote reveal animation, role-reveal moment, sound, online hosting, card art, custom rules. Nothing is decided; confirm with the humans before building big features.
