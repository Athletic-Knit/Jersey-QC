// The ship-with field of both order forms (25 Nov 2026): numbers as chips, a "Next number" key,
// a comma by itself after every six digits, ✕ on a chip.
import { describe, it, expect } from "vitest";
import { shipParts, shipNorm, shipPress, shipRemove, orderList } from "../roster.js";

const type = (text, keys) => [...keys].reduce((v, k) => shipPress(v, k), text);

describe("the ship-with field", () => {
  it("six digits make a chip, and a comma follows by itself", () => {
    const v = type("", "264248");
    expect(v).toBe("264248, ");
    expect(shipParts(v)).toEqual({ done: ["264248"], cur: "" });
  });

  it("the number being typed is not a chip yet", () => {
    expect(shipParts("264248, 2642")).toEqual({ done: ["264248"], cur: "2642" });
    expect(shipParts("")).toEqual({ done: [], cur: "" });
  });

  it("Next number ends a shorter number, and does nothing with nothing typed", () => {
    expect(shipPress("12345", ",")).toBe("12345, ");
    expect(shipPress("", ",")).toBe("");
    expect(shipPress("264248, ", ",")).toBe("264248, ");
  });

  it("three numbers are three chips and orderList reads them as before", () => {
    const v = type("", "264248264249264250");
    expect(shipParts(v).done).toEqual(["264248", "264249", "264250"]);
    expect(orderList(v)).toEqual(["264248", "264249", "264250"]);
  });

  it("backspace takes the separator first, then the digits", () => {
    expect(shipPress("264248, ", "⌫")).toBe("264248");
    expect(shipPress("264248, 26", "⌫")).toBe("264248, 2");
    expect(shipPress("264248, 2", "⌫")).toBe("264248, ");
  });

  it("the ✕ of a chip takes that number out and keeps what is being typed", () => {
    expect(shipRemove("264248, 264249, 12", 0)).toBe("264249, 12");
    expect(shipRemove("264248, 264249, ", 1)).toBe("264248, ");
  });

  it("a typed or pasted text is cleaned: no letters, long runs split into orders", () => {
    expect(shipNorm("a264248264249b")).toBe("264248, 264249, ");
    expect(shipNorm("264248, 264249")).toBe("264248, 264249, ");
    expect(shipNorm("264248,12")).toBe("264248, 12");
  });
});
