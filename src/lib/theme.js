// Light or dark (the co-op, 26 Nov 2026: a switch in the admin panel, and the stations
// most of all, under the floor's lights). The choice is per browser, so per station PC:
// "dark", "light" or "system" (follow the PC's own setting), kept in localStorage. It sets
// data-theme on <html>, which picks the colour tokens in index.css. The admin panel uses
// it (its own choice, jerseyqc.theme); a station uses settings.theme, applied only while the
// sign-in screen or the supervisor board is up (App.jsx, themedScreen) and cleared otherwise.
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
// Back to the app's own dark, and no longer following the PC: the screens not yet built on the
// tokens call this, so "Follow this PC" can never turn them light (Fable's review, 26 Nov 2026).
export function clearTheme(root = typeof document !== "undefined" ? document.documentElement : null) {
  try { if (followSystem) window.matchMedia("(prefers-color-scheme: light)").removeEventListener("change", followSystem); } catch { /* no matchMedia */ }
  followSystem = null;
  root?.removeAttribute("data-theme");
}
export function saveTheme(choice) {
  try { localStorage.setItem(THEME_KEY, choice); } catch { /* private window: this page only */ }
  return applyTheme(choice);
}
