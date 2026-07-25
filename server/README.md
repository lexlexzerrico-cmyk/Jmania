# JERKMANIA — Online 1v1 matchmaking server

This is an optional ~90-line WebSocket relay that lets **strangers Quick Match
for Ranked** and lets friends use a **private room code** instead of trading
copy-paste connect codes.

You do **not** need this to play a friend — the "Play a Friend" tab in the game
works with zero server (it trades WebRTC codes directly). You only need this for
Ranked quick-match and room codes.

The server never sees any gameplay. It only introduces two players and passes
along the one-time WebRTC handshake; the actual clap battle runs directly
browser-to-browser.

## Run it locally (test)

```bash
cd server
npm install
npm start          # listens on ws://localhost:8080
```

Then in the game's **Online 1v1 → Quick Match / Ranked** tab, set the server URL
to `ws://localhost:8080` and hit **Find Ranked Match** in two browser windows.

## Deploy it (free options)

The game is served over **https**, so browsers require a **`wss://`** (TLS)
server URL — a plain `ws://` address is blocked as mixed content. Every option
below gives you an `https`/`wss` URL automatically.

### Render.com (easiest)
1. Push this `server/` folder to a GitHub repo.
2. New → **Web Service** → point it at the repo.
3. Build command `npm install`, start command `npm start`.
4. Render sets `PORT` for you. When it's live, your URL is
   `wss://your-service.onrender.com`.

### Railway / Fly.io / Glitch
Any Node host works. Just run `npm start`; the server reads `PORT` from the
environment. Use the resulting host with the `wss://` scheme.

### Paste the URL into the game
Open **Online 1v1 → Quick Match / Ranked**, paste your `wss://…` URL, and it's
saved on that device. Share the same URL (and, for rooms, a room code) with
whoever you want to play.

## How pairing works
- **queue**: FIFO — the next two players waiting are matched for a Ranked game.
- **host/join**: two players entering the same room code are matched (casual).
- **signal**: the server relays the offer/answer blob between the pair, then
  gets out of the way.

## Notes / limits
- Strict "symmetric" NATs (some mobile carriers, locked-down corporate Wi-Fi)
  can block direct peer connections. Fixing that needs a **TURN** relay server,
  which is beyond this tiny signaling box — most home/desktop networks connect
  fine with the public STUN servers the client already uses.
- This is deliberately minimal: no accounts, no persistence, no anti-cheat.
