// Sizes are shown and printed in the short form (the owner, 25 Nov 2026): L-S is ladies small,
// Y-M youth medium, A-2XL adult 2XL, whatever the roster file says. Matching and the stored
// row keep the file's own spelling.
import { describe, it, expect } from "vitest";
import { shortSize, sameSize, lastSizeLetter, binEntries, buildBinMap } from "../roster.js";
import { jerseyLabel, flagLabel, binListItem, binListLabels } from "../labels.js";
import { summaryJobs } from "../printjobs.js";

describe("shortSize", () => {
  it("writes the family as one letter, a dash and the size", () => {
    expect(shortSize("Ladies-S")).toBe("L-S");
    expect(shortSize("Ladies S")).toBe("L-S");
    expect(shortSize("ladies small")).toBe("L-S");
    expect(shortSize("LADIES LARGE")).toBe("L-L");
    expect(shortSize("Womens M")).toBe("L-M");
    expect(shortSize("Youth M")).toBe("Y-M");
    expect(shortSize("youth-xl")).toBe("Y-XL");
    expect(shortSize("Adult 2XL")).toBe("A-2XL");
    expect(shortSize("Adult-3XL")).toBe("A-3XL");
    expect(shortSize("l-s")).toBe("L-S");     // a short form in lower case comes out upper
    expect(shortSize("w-m")).toBe("L-M");
  });
  it("leaves a short size, a size with no family, an empty one and one it cannot read as they are", () => {
    for (const s of ["A-M", "Y-S", "L-S", "XL", "OSFA", "", "2XL", "Youth OSFA", "Ladies petite"]) expect(shortSize(s)).toBe(s);
    expect(shortSize(undefined)).toBe("");
    expect(shortSize(null)).toBe("");
  });
  it("is only for the eye: sameSize still reads both spellings", () => {
    expect(sameSize("Ladies-S", "L-S")).toBe(false);   // the stored rows are not rewritten, as before
    expect(sameSize("l-s", "L-S")).toBe(true);
  });
  it("lastSizeLetter is the family in the short form", () => {
    expect(lastSizeLetter("L-S")).toBe("L-");
    expect(lastSizeLetter("Ladies S")).toBe("L-");
    expect(lastSizeLetter("Y-M")).toBe("Y-");
    expect(lastSizeLetter("A-XL")).toBe("A-");
    expect(lastSizeLetter("XL")).toBe("");
  });
});

describe("where a size is printed", () => {
  const roster = [
    { _id: 0, name: "", number: "12", team: "Navy", size: "Ladies-S" },
    { _id: 1, name: "", number: "13", team: "Navy", size: "Youth M" },
  ];
  it("the box label of a by-size order names the short size", () => {
    const map = buildBinMap(roster, {}, "size");
    expect(binEntries(roster, map).map(e => e.label).sort()).toEqual(["L-S", "Y-M"]);
  });
  it("the sticker, the ticket and the list line carry the short size", () => {
    const map = buildBinMap(roster, {}, "size");
    expect(jerseyLabel(roster[0], map).value).toBe("L-S");
    expect(jerseyLabel(roster[0], buildBinMap(roster, {}, "team")).value).toBe("Navy");   // by team: the team, untouched
    expect(flagLabel({ match: roster[1], reason: "x" }, map).size).toBe("Y-M");
    expect(binListItem(roster[0])).toBe("12-LS");
  });
  it("the count label's mix counts Ladies-S and L-S together, short", () => {
    const rows = [{ number: "1", name: "", team: "Navy", size: "Ladies-S" }, { number: "2", name: "", team: "Navy", size: "L-S" }, { number: "3", name: "", team: "Navy", size: "A-M" }];
    const l = binListLabels(rows, { bin: "1.1", label: "Navy" })[0];
    expect(l.mix).toBe("A-M 1   L-S 2");
  });
  it("the summary's lines carry the short size", () => {
    const pack = { orderNumber: "5", roster: [{ _id: 0, number: "7", name: "", team: "Navy", size: "Ladies small", scanned: "flag" }], log: [], binMap: null, closedBins: [] };
    const items = summaryJobs(pack).flatMap(l => l.items || []).map(i => i.text);
    expect(items.some(t => t.includes("L-S"))).toBe(true);
    expect(items.some(t => /Ladies/i.test(t))).toBe(false);
  });
});
