// The pictures of one flag as the supervisor's lightbox takes them: the scan
// photo, then each damage photo, which one is open, and a caption
// ("#12 LEACH · Twill peeling"). The lightbox (App.jsx) walks between them.
// Out of App.jsx only because a component file may export components alone
// (Vite's fast-refresh rule).
export function photoSet(photo, damagePhotos = [], index = 0, caption = "") {
  const pics = [...(photo ? [{ src: photo, damage: false }] : []), ...(damagePhotos || []).filter(Boolean).map(src => ({ src, damage: true }))];
  return { pics, index, caption };
}

// The caption under the photos: "#12 LEACH · Twill peeling"; a part that is
// missing is left out (no number, no name, no reason).
export function photoCaption(number, name, reason) {
  const n = String(number ?? "").trim(), who = n ? `#${n}${name ? " " + name : ""}` : String(name || "");
  return [who, reason].filter(Boolean).join(" · ");
}
