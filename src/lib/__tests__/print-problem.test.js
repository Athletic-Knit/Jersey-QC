// Why a print failed, as the station shows it (hub-plugin.js, ps1Problem).
import { describe, it, expect } from "vitest";
import { ps1Problem } from "../../../hub-plugin.js";

const SHARED = String.raw`\\AK-NB-164\Zebra`;

describe("the reason a print failed", () => {
  it("what PowerShell said comes first", () => {
    expect(ps1Problem({ code: 1 }, '\r\nException calling "Send": OpenPrinter failed (1801)\r\nAt line 3', "Zebra")).toBe('Exception calling "Send": OpenPrinter failed (1801)');
  });
  it("stopped after 30 s with nothing said: the printer did not answer; for a shared printer, which PC to look at", () => {
    expect(ps1Problem({ killed: true, signal: "SIGTERM", message: "Command failed: powershell -NoProfile …" }, "", SHARED))
      .toBe(`${SHARED} did not answer in 30 s: is AK-NB-164 (the PC that shares it) on, awake and on the network?`);
    expect(ps1Problem({ killed: true }, "", "ZDesigner ZD411")).toBe("ZDesigner ZD411 did not answer in 30 s");
  });
  it("never the bare command line", () => {
    expect(ps1Problem({ code: 3, message: "Command failed: powershell -NoProfile -File x.ps1" }, "")).toBe("the print script stopped (code 3) without saying why");
  });
});
