# Hey Lucaccola 👋

This is where Secret Austrian stands and how to jump in. The README covers setup and the file layout; this file covers what's done, what's next and how we work together.

## What it is

A *Secret Hitler* clone you play like Jackbox. One person opens a room on a shared screen (TV or laptop), and that screen is the public board: policy tracks, election tracker, who's President, who's nominated, vote results, history. Everyone joins on their phone with a 4-letter code or the QR, and the phone shows only your private stuff: your role, voting, your policy cards when you're in government, and presidential powers.

## What's done (v0.1, 24 Sep 2026)

- The full original ruleset works: roles for 5–10 players, nominations, term limits, voting, the President discarding and the Chancellor enacting, veto after 5 fascist policies, chaos after 3 failed elections, all four powers (investigate, peek, special election, execution), and every win condition.
- The server owns all game state, so nobody can cheat by inspecting the page.
- Refreshing a phone or the host screen puts you back in your seat.
- 15 tests, including one that plays 3,000 random full games and checks nothing breaks.
- Bots for testing alone: `npm run bots -- ABCD 6` adds 6 bots to room ABCD.
- One full 7-player game was played start to finish through the actual UI.

## Get it running (about 2 minutes)

```bash
git clone https://github.com/Eliakrl/secret-austrian.git
cd secret-austrian
npm install
npm run dev
```

1. Open http://localhost:5173/host. That's the board.
2. Open http://localhost:5173 in another tab (or on your phone, on the same Wi-Fi) and join with the code.
3. Run `npm run bots -- <CODE> 5` in a second terminal to fill the room, then press Start.

## Ideas for what's next (nothing decided, pick what's fun)

- **Vote reveal moment:** all Ja/Nein cards flip at once on the host screen, maybe with sound.
- **Role reveal at game start:** a proper "look at your phone now" moment instead of just a tap-to-reveal card.
- **Animations** when a policy gets enacted or someone gets executed.
- **Online hosting** so it works outside one Wi-Fi network (Render, Fly.io or Railway all run Node + websockets).
- **Our own twists:** new powers, a different theme or art, house rules. Names are all in `shared/theme.js` and the rulebook numbers are in `shared/rules.js`.
- **Real art** for the policy cards and board instead of CSS boxes.

## How we work together

- Don't push straight to `main`. Make a branch (`git checkout -b vote-animation`), push it, and open a PR so the other person can look before merging.
- Run `npm test` before pushing anything that touches `server/game.js`.
- New rule, new test: add it to `server/game.test.js`.
- Tell each other what you're working on so we don't both build the same thing.

## If you use Claude Code

`CLAUDE.md` in this repo gives your Claude the full context automatically: architecture, decisions made so far, conventions and gotchas. Just open the folder and start asking.
