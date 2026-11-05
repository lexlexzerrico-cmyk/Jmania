// REPFORGE settings. Leave a value empty to turn that feature off.
// Setup steps for both are in repforge/README.md.
export default {
  // Supabase → Project Settings → API (or Data API): "Project URL" and the "anon" / "publishable" key.
  // The anon key is meant to be public; the database rules in supabase/schema.sql keep scores honest.
  SUPABASE_URL: "",
  SUPABASE_ANON_KEY: "",

  // developer.spotify.com → Dashboard → your app → Client ID. (Not the Client Secret: never put that here.)
  SPOTIFY_CLIENT_ID: ""
};
