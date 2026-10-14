/** Normalize addresses, never usernames/passwords. Keys remain local and must not be logged. */
export function accountServerIdentity(value: string): string {
  try { const u=new URL(value); return `${u.origin.toLowerCase()}${u.pathname.replace(/\/+$/,'')}`; }
  catch { return String(value).trim().replace(/\/+$/,''); }
}
export function xtreamCandidateIdentity(server:string,username:string,password:string):string {
  return JSON.stringify(['xtream',accountServerIdentity(server),username,password]);
}
export function magCandidateIdentity(portal:string,mac:string):string {
  return JSON.stringify(['stalker',accountServerIdentity(portal),mac.trim().toUpperCase()]);
}
/** Existing storage IDs are authoritative: never rename Room/favorites during an import. */
export function reusableXtreamPlaylistId(playlists:Array<{id:string;source?:string;xtreamServer?:string;xtreamUsername?:string;xtreamPassword?:string}>,
  server:string,username:string,password:string):string|undefined {
  const key=xtreamCandidateIdentity(server,username,password);
  return playlists.find(pl=>pl.source==='xtream'&&xtreamCandidateIdentity(pl.xtreamServer||'',pl.xtreamUsername||'',pl.xtreamPassword||'')===key)?.id;
}
