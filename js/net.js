/* ============================================================
   net.js — real online 1v1 transport (WebRTC DataChannel)
   ------------------------------------------------------------
   Two ways to connect two REAL browsers with no game backend:

   1) Copy-paste "Direct Connect" (zero server): the host makes an
      offer code, the friend pastes it and returns an answer code.
      Works anywhere WebRTC can reach a STUN server.

   2) Room / ranked matchmaking via a tiny signaling server (see
      server/jerk-signal.mjs). The server only relays the two codes
      and pairs players — the actual match runs peer-to-peer.

   Transport is a single reliable, ordered DataChannel. Messages are
   small JSON objects (see PROTO in main.js). NOTE: this cannot run
   inside the sandboxed Artifact preview (its CSP blocks STUN/ICE);
   it works on the hosted site.
   ============================================================ */

const ICE = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// ---- compact, shareable codes (gzip when available, else base64) ----------
async function pack(obj) {
  const json = JSON.stringify(obj);
  if (typeof CompressionStream === "undefined") {
    return "JM0" + btoa(unescape(encodeURIComponent(json)));
  }
  const cs = new CompressionStream("gzip");
  const buf = await new Response(new Blob([json]).stream().pipeThrough(cs)).arrayBuffer();
  let bin = "";
  new Uint8Array(buf).forEach((b) => (bin += String.fromCharCode(b)));
  return "JMg" + btoa(bin);
}
async function unpack(code) {
  code = (code || "").trim();
  if (code.startsWith("JM0")) return JSON.parse(decodeURIComponent(escape(atob(code.slice(3)))));
  if (code.startsWith("JMg")) {
    const bin = atob(code.slice(3));
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const buf = await new Response(new Blob([arr]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(buf));
  }
  throw new Error("That doesn't look like a JERKMANIA connect code.");
}

export class Net extends EventTarget {
  constructor() {
    super();
    this.pc = null;
    this.dc = null;
    this.ws = null;
    this.role = null;     // "host" | "guest"
    this.open = false;
    this._closed = false;
  }

  _newPc() {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    pc.onconnectionstatechange = () => {
      const s = pc.connectionState;
      if (s === "connected") this.dispatchEvent(new CustomEvent("status", { detail: "Linked!" }));
      if ((s === "failed" || s === "disconnected" || s === "closed") && this.open) {
        this.dispatchEvent(new Event("close"));
      }
    };
    return pc;
  }

  _bindChannel(dc) {
    this.dc = dc;
    dc.onopen = () => {
      this.open = true;
      this._closeWs();
      this.dispatchEvent(new Event("open"));
    };
    dc.onclose = () => {
      if (!this.open) return;
      this.open = false;
      this.dispatchEvent(new Event("close"));
    };
    dc.onmessage = (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      this.dispatchEvent(new CustomEvent("msg", { detail: m }));
    };
  }

  // Wait until ICE candidate gathering finishes (or a short timeout) so the
  // single code we hand out already contains the candidates (no trickle).
  _iceComplete(pc) {
    return new Promise((res) => {
      if (pc.iceGatheringState === "complete") return res();
      let done = false;
      const finish = () => {
        if (done) return; done = true;
        pc.removeEventListener("icegatheringstatechange", onState);
        pc.removeEventListener("icecandidate", onCand);
        clearTimeout(t);
        res();
      };
      // Resolve the MOMENT gathering ends (end-of-candidates fires a null
      // candidate) instead of always waiting a fixed delay — this is what made
      // "Generate reply" feel like it hung on phone networks.
      const onState = () => { if (pc.iceGatheringState === "complete") finish(); };
      const onCand = (e) => { if (!e.candidate) finish(); };
      pc.addEventListener("icegatheringstatechange", onState);
      pc.addEventListener("icecandidate", onCand);
      // Hard cap: after 1.4s, use whatever candidates we have. Host/local
      // candidates alone connect two devices on most networks.
      const t = setTimeout(finish, 1400);
    });
  }

  // ---- Manual (copy-paste) signaling --------------------------------------
  async createOffer() {
    this.role = "host";
    this.pc = this._newPc();
    this._bindChannel(this.pc.createDataChannel("jerk", { ordered: true }));
    await this.pc.setLocalDescription(await this.pc.createOffer());
    await this._iceComplete(this.pc);
    return pack({ t: this.pc.localDescription.type, s: this.pc.localDescription.sdp });
  }

  async acceptOffer(code) {
    this.role = "guest";
    this.pc = this._newPc();
    this.pc.ondatachannel = (e) => this._bindChannel(e.channel);
    const d = await unpack(code);
    await this.pc.setRemoteDescription({ type: d.t, sdp: d.s });
    await this.pc.setLocalDescription(await this.pc.createAnswer());
    await this._iceComplete(this.pc);
    return pack({ t: this.pc.localDescription.type, s: this.pc.localDescription.sdp });
  }

  async acceptAnswer(code) {
    const d = await unpack(code);
    await this.pc.setRemoteDescription({ type: d.t, sdp: d.s });
  }

  // ---- Server signaling (room code or ranked queue) -----------------------
  // mode: "host" (create room) | "join" (join room) | "queue" (ranked match)
  connectServer(url, { mode, room = "", rank = 0, name = "" }) {
    let ws;
    try { ws = new WebSocket(url); }
    catch { this.dispatchEvent(new CustomEvent("neterror", { detail: "Bad server URL." })); return; }
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ t: mode, room, rank, name }));
    ws.onerror = () => this.dispatchEvent(new CustomEvent("neterror", { detail: "Can't reach the matchmaking server." }));
    ws.onclose = () => { if (!this.open && !this._closed) this.dispatchEvent(new CustomEvent("status", { detail: "Server closed the connection." })); };

    ws.onmessage = async (e) => {
      let m;
      try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === "waiting") {
        this.dispatchEvent(new CustomEvent("status", { detail: mode === "queue" ? "Searching for an opponent…" : "Waiting for your friend to join…" }));
      } else if (m.t === "peer") {
        this.dispatchEvent(new CustomEvent("status", { detail: "Opponent found — connecting…" }));
        this.role = m.role;
        this._peerName = m.name || "Opponent";
        if (m.role === "host") {
          const offer = await this.createOffer();
          ws.send(JSON.stringify({ t: "signal", data: offer }));
        }
      } else if (m.t === "signal") {
        if (this.role === "host") {
          await this.acceptAnswer(m.data);
        } else {
          const answer = await this.acceptOffer(m.data);
          ws.send(JSON.stringify({ t: "signal", data: answer }));
        }
      } else if (m.t === "full" || m.t === "error") {
        this.dispatchEvent(new CustomEvent("neterror", { detail: m.msg || "Room unavailable." }));
      } else if (m.t === "left") {
        this.dispatchEvent(new CustomEvent("neterror", { detail: "Your opponent left before connecting." }));
      }
    };
  }

  get peerName() { return this._peerName || "Opponent"; }

  send(obj) { if (this.open && this.dc) { try { this.dc.send(JSON.stringify(obj)); } catch {} } }

  _closeWs() { if (this.ws) { try { this.ws.close(); } catch {} this.ws = null; } }

  close() {
    this._closed = true;
    this.open = false;
    this._closeWs();
    try { this.dc && this.dc.close(); } catch {}
    try { this.pc && this.pc.close(); } catch {}
    this.dc = this.pc = null;
  }
}

export function netSupported() {
  return typeof RTCPeerConnection !== "undefined";
}
