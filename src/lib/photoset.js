// The pictures of one flag as the supervisor's lightbox takes them: the scan
// photo, then each damage photo, which one is open, and a caption
// ("#12 LEACH · Twill peeling"). The lightbox (App.jsx) walks between them.
export function photoSet(photo, damagePhotos = [], index = 0, caption = "") {
  const pics = [...(photo ? [{ src: photo, damage: false }] : []), ...(damagePhotos || []).filter(Boolean).map(src => ({ src, damage: true }))];
  return { pics, index, caption };
}
