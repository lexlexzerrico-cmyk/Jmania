// Spotify connection (Authorization Code + PKCE, no server needed).
// Needs a Client ID from developer.spotify.com and this page's exact URL added as a Redirect URI.
const SCOPES = "user-read-currently-playing user-read-playback-state user-modify-playback-state";
const K = { tok: "repforge-spotify-token", ver: "repforge-spotify-verifier", st: "repforge-spotify-state" };

const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n) => b64url(crypto.getRandomValues(new Uint8Array(n)));
const get = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} };

export function createSpotify(clientId) {
  const redirectUri = location.origin + location.pathname;
  let tok = null; try { tok = JSON.parse(get(K.tok)); } catch (e) {}

  async function tokenRequest(body) {
    const r = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, ...body })
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error_description || j.error || "Spotify sign-in failed");
    tok = { access: j.access_token, refresh: j.refresh_token || tok?.refresh, exp: Date.now() + (j.expires_in - 60) * 1000 };
    set(K.tok, JSON.stringify(tok));
  }

  async function connect() {
    if (!clientId) throw new Error("Add your Spotify Client ID to js/config.js first");
    const verifier = rand(64), state = "sp_" + rand(12);
    const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
    set(K.ver, verifier); set(K.st, state);
    const q = new URLSearchParams({ response_type: "code", client_id: clientId, scope: SCOPES, redirect_uri: redirectUri,
      code_challenge_method: "S256", code_challenge: challenge, state });
    location.assign("https://accounts.spotify.com/authorize?" + q);
  }

  // Call on page load: finishes sign-in if Spotify just sent the user back here.
  async function handleRedirect() {
    const q = new URLSearchParams(location.search), state = q.get("state");
    if (!state || !state.startsWith("sp_")) return false;
    history.replaceState(null, "", redirectUri + location.hash);
    if (state !== get(K.st)) throw new Error("Spotify sign-in expired. Try connecting again.");
    if (q.get("error")) throw new Error(q.get("error") === "access_denied" ? "Spotify connection cancelled" : "Spotify: " + q.get("error"));
    await tokenRequest({ grant_type: "authorization_code", code: q.get("code"), redirect_uri: redirectUri, code_verifier: get(K.ver) });
    set(K.ver, null); set(K.st, null);
    return true;
  }

  async function api(path, opts = {}, retry = true) {
    if (!tok) throw new Error("Spotify isn’t connected");
    if (Date.now() > tok.exp && tok.refresh) await tokenRequest({ grant_type: "refresh_token", refresh_token: tok.refresh });
    const r = await fetch("https://api.spotify.com/v1" + path, { ...opts, headers: { Authorization: "Bearer " + tok.access, ...(opts.headers || {}) } });
    if (r.status === 401 && retry && tok.refresh) { await tokenRequest({ grant_type: "refresh_token", refresh_token: tok.refresh }); return api(path, opts, false); }
    if (r.status === 204 || r.status === 202) return null;
    if (r.status === 403) throw new Error(opts.method ? "Playback controls need Spotify Premium" : "Spotify refused this account. Ask the app owner to add you in the Spotify dashboard.");
    if (r.status === 404) throw new Error("Start playing on a Spotify device first");
    if (r.status === 429) throw new Error("Spotify is rate limiting. Try again in a moment.");
    const text = await r.text();
    if (!r.ok) throw new Error("Spotify error " + r.status);
    return text ? JSON.parse(text) : null;
  }

  return {
    redirectUri,
    get configured() { return !!clientId; },
    get connected() { return !!tok; },
    connect, handleRedirect,
    disconnect() { tok = null; set(K.tok, null); },
    async nowPlaying() {
      const j = await api("/me/player?additional_types=episode");
      if (!j || !j.item) return null;
      const it = j.item;
      return { playing: j.is_playing, title: it.name, artist: (it.artists || []).map((a) => a.name).join(", ") || it.show?.name || "",
        art: (it.album?.images || it.images || []).slice(-2)[0]?.url || null, progress: j.progress_ms, duration: it.duration_ms,
        device: j.device?.name || "" };
    },
    play: () => api("/me/player/play", { method: "PUT" }),
    pause: () => api("/me/player/pause", { method: "PUT" }),
    next: () => api("/me/player/next", { method: "POST" }),
    prev: () => api("/me/player/previous", { method: "POST" })
  };
}
