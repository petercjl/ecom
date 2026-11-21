// Douyin's own embed uses the same public work ID as the desktop work URL.
export function mediaPageUrl(url) {
  const target = new URL(url);
  const work = target.pathname.match(/^\/video\/(\d{16,22})\/?$/);
  if (target.origin !== 'https://www.douyin.com' || !work ||
      target.search || target.hash) return target.href;
  const player = new URL('https://open.douyin.com/player/video');
  player.searchParams.set('vid', work[1]);
  return player.href;
}
