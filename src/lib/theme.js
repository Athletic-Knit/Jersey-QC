// Light or dark (the co-op, 26 Nov 2026: a switch in the admin panel, and the stations
// most of all, under the floor's lights). The choice is per browser, so per station PC:
// "dark", "light" or "system" (follow the PC's own setting), kept in localStorage. It sets
// data-theme on <html>, which picks the colour tokens in index.css. Phase 1: the admin
// panel uses it; the station screens still draw their own dark colours inline until they
// are converted, so nothing changes on a station yet.
export const THEME_KEY = "jerseyqc.theme";
export const THEMES = [
  { id: "dark", label: "Dark" },
  { id: "light", label: "Light" },
  { id: "system", label: "Follow this PC" },
];

export function loadTheme() {
  try { const v = localStorage.getItem(THEME_KEY); return THEMES.some(t => t.id === v) ? v : "dark"; } catch { return "dark"; }
}
// "dark" or "light": what a choice means on this PC right now.
export function resolveTheme(choice, prefersLight = () => { try { return window.matchMedia("(prefers-color-scheme: light)").matches; } catch { return false; } }) {
  if (choice === "light" || choice === "dark") return choice;
  return prefersLight() ? "light" : "dark";
}
let followSystem = null;
export function applyTheme(choice = loadTheme(), root = typeof document !== "undefined" ? document.documentElement : null) {
  if (!root) return resolveTheme(choice);
  const set = () => root.setAttribute("data-theme", resolveTheme(choice));
  set();
  try {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    if (followSystem) mq.removeEventListener("change", followSystem);
    followSystem = choice === "system" ? set : null;
    if (followSystem) mq.addEventListener("change", followSystem);
  } catch { /* no matchMedia (tests) */ }
  return resolveTheme(choice);
}
export function saveTheme(choice) {
  try { localStorage.setItem(THEME_KEY, choice); } catch { /* private window: this page only */ }
  return applyTheme(choice);
}
