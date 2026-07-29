/* ============================================================
   jerk-signal.mjs — JERKMANIA matchmaking / signaling server
   ------------------------------------------------------------
   A tiny WebSocket relay so two browsers can find each other and
   trade their WebRTC handshake. It NEVER sees game traffic — once
   the two peers connect, the match runs peer-to-peer and the
   server just drops out.

   It does three things:
     • "queue"      — ranked quick match: pair the next two waiters
     • "host"/"join"— private room by code
     • "signal"     — relay the offer/answer blob between a pair

   Run:   npm install && npm start      (see README.md for hosting)
   ============================================================ */
import { WebSocketServer } from "ws";
import http from "http";

const PORT = process.env.PORT || 8080;

// A tiny HTTP server so hosting health checks (which GET "/") get a 200;
// the WebSocket server shares the same port for the actual signaling.
const server = http.createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("JERKMANIA signaling server OK");
});
const wss = new WebSocketServer({ server });

const rooms = new Map();   // roomCode -> [clientA, clientB]
let queue = [];            // clients waiting for a ranked match

function send(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch {} }

function pair(a, b) {
  a._peer = b; b._peer = a;
  // First player hosts (creates the offer); second answers.
  send(a, { t: "peer", role: "host", name: b._name });
  send(b, { t: "peer", role: "guest", name: a._name });
}

function dropFromQueue(ws) { queue = queue.filter((c) => c !== ws); }

function leaveRoom(ws) {
  const code = ws._room;
  if (!code || !rooms.has(code)) return;
  const arr = rooms.get(code).filter((c) => c !== ws);
  if (arr.length) rooms.set(code, arr); else rooms.delete(code);
}

wss.on("connection", (ws) => {
  ws._name = "Player";

  ws.on("message", (raw) => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }
    ws._name = (m.name || ws._name).toString().slice(0, 24);

    if (m.t === "queue") {
      // Rank-aware only loosely: FIFO pairing keeps it simple and fair enough.
      const other = queue.shift();
      if (other && other.readyState === 1) pair(other, ws);
      else { queue.push(ws); send(ws, { t: "waiting" }); }

    } else if (m.t === "host" || m.t === "join") {
      const code = (m.room || "").toString().trim().toUpperCase().slice(0, 12);
      if (!code) return send(ws, { t: "error", msg: "Room code required." });
      ws._room = code;
      const arr = rooms.get(code) || [];
      if (arr.length >= 2) return send(ws, { t: "full", msg: "That room is full." });
      arr.push(ws); rooms.set(code, arr);
      if (arr.length === 2) pair(arr[0], arr[1]);
      else send(ws, { t: "waiting" });

    } else if (m.t === "signal") {
      // Relay the SDP blob verbatim to the paired peer.
      if (ws._peer && ws._peer.readyState === 1) send(ws._peer, { t: "signal", data: m.data });
    }
  });

  ws.on("close", () => {
    dropFromQueue(ws);
    leaveRoom(ws);
    if (ws._peer && ws._peer.readyState === 1) send(ws._peer, { t: "left" });
    if (ws._peer) ws._peer._peer = null;
  });

  ws.on("error", () => {});
});

server.listen(PORT, () => console.log(`JERKMANIA signaling server listening on :${PORT}`));
