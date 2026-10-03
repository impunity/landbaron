export function googleDocPreview(value: string) {
  if (!value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com' || url.port || url.username || url.password) return null;
    const match = url.pathname.match(/^\/document\/(?:u\/\d+\/)?d\/(e\/)?([A-Za-z0-9_-]+)(?:\/|$)/);
    if (!match) return null;
    return match[1] ? `https://docs.google.com/document/d/e/${match[2]}/pub` : `https://docs.google.com/document/d/${match[2]}/preview`;
  } catch {
    return null;
  }
}