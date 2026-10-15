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
  it("drops leading zeros but keeps 00", () => {
    expect(normNum("07")).toBe("7");
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
  it("matches a surname against a full roster name", () => {
    expect(nameMatches("BLAKE", "Jordan Blake")).toBe(true);
    expect(nameMatches("Jordan Blake", "Blake")).toBe(true);
    expect(nameMatches("BLAKE", "Blakely")).toBe(false);
    expect(nameMatches("", "Blake")).toBe(false);
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
