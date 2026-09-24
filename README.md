# Secret Austrian

A party-game clone of *Secret Hitler*, played Jackbox-style: one shared **host screen** (TV or laptop) shows the public board, and everyone plays on their **phone**.

## Play locally

```bash
npm install
npm run dev
```

- Open **http://localhost:5173/host** on the screen everyone can see. It opens a room and shows a 4-letter code + QR code.
- Players scan the QR (or open the shown URL) on phones connected to the **same Wi-Fi**, and enter their name.
- Start from the host screen, or from the phone of the first player who joined. 5–10 players.

Production-style: `npm run build && npm start`, then everything runs on http://localhost:3001.

## Testing without 5 friends

**Test mode (easiest):** open the host screen as **`/host?test`** (e.g. https://austrian.eliakarl.com/host?test). The lobby gets *Add bot / Fill to 5 / Fill to 10* buttons, and an *End game (test)* button during play. Bots are played by the server, so join with your phone, fill the rest with bots, and play. Bot speed: `BOT_DELAY_MS` env var (default 900).

**Script bots** (from your own terminal, against any server):

```bash
npm run bots -- ABCD 4          # add 4 bots to room ABCD (join with your own phone/tab first)
npm run bots -- ABCD 7 500 --start   # 7 bots, 500 ms per move, start automatically
npm test                         # rules engine tests, incl. 3,000 random full games
```

Each browser tab is its own player, so you can also open several tabs of http://localhost:5173 to play multiple seats.

## How it's built

| Path | What |
| --- | --- |
| `server/game.js` | The whole rules engine. Pure functions, no networking. `act(game, playerId, action)` mutates state; `publicView` / `playerView` decide what each screen may see. |
| `server/game.test.js` | Rules tests + random-game simulator. |
| `server/rooms.js` | In-memory rooms, join codes, reconnect tokens. |
| `server/index.js` | Express + Socket.io. Every change broadcasts a fresh view to the host and each phone. |
| `shared/rules.js` | Numbers from the rulebook (role counts, power track, win thresholds). |
| `shared/theme.js` | All names shown to players (roles, parties, powers). Rename things here. |
| `client/src/Host.jsx` | Host screen: lobby with QR, board, status, history, seats. |
| `client/src/Player.jsx` | Phone: join, secret role card, voting, policy cards, presidential powers. |
| `server/bots.js` | Bot move logic (random legal moves), used by test mode and the script. |
| `scripts/bots.js` | Script that connects bots over sockets, for testing. |

The server is the only source of truth. Phones never receive another player's role or cards unless the rules allow it (fascist teammates, investigation results), so nobody can cheat by inspecting the page.

Reconnects: refreshing a phone or the host screen puts you back in your seat. Rooms live in memory and disappear when the server restarts.

## Attribution

Based on [Secret Hitler](https://www.secrethitler.com/) by Goat, Wolf, & Cabbage, licensed under [CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/). This project is non-commercial and shared under the same license.

## Deployment

Live at **https://austrian.eliakarl.com** once set up. Hosted on Render's free tier (`render.yaml`), with the domain and proxy on Cloudflare.

- Every push to `main` auto-deploys. A deploy restarts the server and **ends any running game** (rooms live in memory), so don't merge to `main` during a game night.
- The free server sleeps after 15 min without traffic; the first visit then takes about a minute to wake it. Open the host page a minute before playing.
