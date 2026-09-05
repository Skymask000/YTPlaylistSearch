function tokenize(query) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

function buildHaystack(item, scopes) {
  const parts = [];
  if (scopes.song)        parts.push(item.title ?? "");
  if (scopes.channel)     parts.push(item.channelTitle ?? "");
  if (scopes.description) parts.push(item.descriptionShort ?? "");
  if (scopes.playlist)    parts.push(item.playlistTitle ?? "");
  return parts.join(" ").toLowerCase();
}

export function filter(items, query, scopes) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return items;
  return items.filter((item) => {
    const hay = buildHaystack(item, scopes);
    if (hay.length === 0) return false;
    return tokens.every((tok) => hay.includes(tok));
  });
}
