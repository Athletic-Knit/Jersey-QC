// Text normalisation (src/lib/text.js): names compared without accents,
// capitals, apostrophes, spaces or hyphens but as a whole (N4), and jersey
// numbers kept exactly, leading zeros included, so 07 is not 7 (N2; Noam,
// 23 Nov 2026).
import { describe, it, expect } from "vitest";
import { norm, normNum, nameMatches, editDistance, stripAccents } from "../text.js";

describe("norm", () => {
  it("keeps accented letters instead of dropping them", () => {
    expect(norm("CÔTÉ")).toBe("cote");
    expect(norm("Bélanger")).toBe("belanger");
    expect(stripAccents("Müller")).toBe("Muller");
  });
  it("drops punctuation", () => {
    expect(norm("O'Brien")).toBe("obrien");
    expect(norm("Smith-Jones")).toBe("smithjones");
  });
});

describe("normNum", () => {
  // N2 (Noam, 23 Nov 2026): 07 and 7 are different jerseys, so leading zeros are kept.
  it("keeps the digits exactly, leading zeros included", () => {
    expect(normNum("07")).toBe("07");
    expect(normNum("007")).toBe("007");
    expect(normNum(" #07 ")).toBe("07");
    expect(normNum("7")).toBe("7");
    expect(normNum("00")).toBe("00");
    expect(normNum("0")).toBe("0");
    expect(normNum("#19")).toBe("19");
    expect(normNum(19)).toBe("19");
    expect(normNum("")).toBe("");
    expect(normNum(null)).toBe("");
  });
});

describe("nameMatches", () => {
  // N4 (Noam, 23 Nov 2026): the whole name or nothing. Only capitals, accents and
  // apostrophes may differ; spaces and hyphens are ignored (the owner, 23 Nov 2026).
  it("needs the whole name: one word of it, missing letters or extra words do not match", () => {
    expect(nameMatches("BLAKE", "Jordan Blake")).toBe(false);
    expect(nameMatches("Jordan Blake", "Blake")).toBe(false);
    expect(nameMatches("DYK", "Van Dyk")).toBe(false);
    expect(nameMatches("SMITH", "Smithe")).toBe(false);
    expect(nameMatches("SMITHE", "Smith")).toBe(false);
    expect(nameMatches("BLAKE", "Blakely")).toBe(false);
    expect(nameMatches("", "Blake")).toBe(false);
    expect(nameMatches("", "")).toBe(false);
  });
  it("ignores capitals, accents, apostrophes, spaces and hyphens", () => {
    expect(nameMatches("JORDAN BLAKE", "Jordan Blake")).toBe(true);
    expect(nameMatches("ONEIL", "O'Neil")).toBe(true);
    expect(nameMatches("O'NEIL", "ONeil")).toBe(true);
    expect(nameMatches("COTE", "Côté")).toBe(true);
    expect(nameMatches("DELACRUZ", "De La Cruz")).toBe(true);
    expect(nameMatches("DE-LA-CRUZ", "De La Cruz")).toBe(true);
    expect(nameMatches("SMITH JONES", "Smith-Jones")).toBe(true);
  });
  it("is accent-insensitive", () => {
    expect(nameMatches("COTE", "Côté")).toBe(true);
  });
});

describe("editDistance", () => {
  it("counts single edits", () => {
    expect(editDistance("19", "10")).toBe(1);
    expect(editDistance("1", "10")).toBe(1);
    expect(editDistance("10", "100")).toBe(1);
    expect(editDistance("8", "88")).toBe(1);
    expect(editDistance("smith", "smyth")).toBe(1);
  });
});
