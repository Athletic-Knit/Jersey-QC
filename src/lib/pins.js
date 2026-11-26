// The sign-in PINs (admin panel phase 7, 26 Nov 2026; the co-op's decision 4: checked by the
// server, with the same values). The server (admin-plugin.js, POST /api/admin/pin) reads each
// PIN from .env.local: JQC_PIN_<ID> first (no VITE_ prefix: it never reaches a browser), then
// the old VITE_PIN_<ID>, then the default below — the values the floor has always had.
// The page sends the PIN typed and hears yes or no; it holds no PIN. Never imports config.js
// (it runs on the server too).
export const PIN_DEFAULTS = Object.freeze({
  inspector: "1111", sorter: "4444", packer: "2222", supervisor: "3333",
  station1: "1001", station2: "1002", station3: "1003",
});
export const PIN_IDS = Object.keys(PIN_DEFAULTS);

// { pin, from }: the PIN for a role or station id, and the .env.local name it came from
// ("default" when none is set). `from` may be shown; `pin` never leaves the server.
export function pinFor(env = {}, id) {
  if (!Object.prototype.hasOwnProperty.call(PIN_DEFAULTS, id)) return { pin: "", from: "" };
  const u = id.toUpperCase();
  for (const name of [`JQC_PIN_${u}`, `VITE_PIN_${u}`]) { const v = String(env[name] ?? ""); if (v) return { pin: v, from: name }; }
  return { pin: PIN_DEFAULTS[id], from: "default" };
}
