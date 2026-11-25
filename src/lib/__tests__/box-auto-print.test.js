// The box labels do not print by themselves when an order starts (the owner, 25 Nov 2026),
// unless the station switched it on in Settings → Label printer.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import { DEFAULT_SETTINGS } from "../../config.js";

describe("box labels printing by themselves", () => {
  it("is off by default, and a station saved before the setting existed reads it as off", () => {
    expect(DEFAULT_SETTINGS.boxAutoPrint).toBe(false);
    const saved = { stickers: true, scanKey: "Enter" };   // an older station's saved settings: no boxAutoPrint
    expect({ ...DEFAULT_SETTINGS, ...saved }.boxAutoPrint).toBe(false);
  });

  it("starting an order opens the set-out screen with the setting, not with a fixed true", () => {
    const src = fs.readFileSync(new URL("../../App.jsx", import.meta.url), "utf8");
    expect(src).toMatch(/setBoxAuto\(settings\.boxAutoPrint === true\)/);
    expect(src).not.toMatch(/setBoxAuto\(true\)/);
  });
});
