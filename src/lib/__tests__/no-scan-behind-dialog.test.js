// No scan while any dialog is open (code review of 23 Nov 2026, finding H1).
// App.jsx has no component tests, so this reads its source and checks the rule:
//   1. every dialog state of the station is listed in anyDialogOpen (the one list);
//   2. the pedal handler, the hands-free gate, the SCAN button and By hand all use that one list,
//      never a hand-written copy that can fall behind;
//   3. a result screen already up ignores the pedal while a dialog is open over it.
// A new dialog: add its state to anyDialogOpen in App.jsx (the comment there says so); if it is
// not a dialog over the camera, add it to NOT_DIALOGS below with the reason.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "App.jsx"), "utf8").replaceAll("\r", "");   // App.jsx has Windows line ends: drop the CRs first
const lines = src.split("\n");

// The whole App component, from its declaration to the end of the file: a dialog state declared anywhere
// in it (not in a fixed window of lines) is checked. Its JSX starts at the last top-level `return (`.
const appStart = src.indexOf("export default function App()");
const appSrc = src.slice(appStart);
const renderSrc = appSrc.slice(appSrc.lastIndexOf("\n  return ("));

// States that look like dialogs but are not a screen over the camera (why, each).
const NOT_DIALOGS = {
  showFilters: "a panel inside the roster table; the camera stays usable",
};

// A whole-word match for a state name (so "finished" is not found inside "unfinished").
const word = n => new RegExp("(^|[^A-Za-z0-9_])" + n + "($|[^A-Za-z0-9_])");
// The text of the anyDialogOpen definition: from its `const` to the first line ending in `;`.
function definition(name = "dialogOverResult") {
  const i = lines.findIndex(l => l.includes("const " + name + " ="));
  expect(i).toBeGreaterThan(-1);
  let out = "";
  for (let j = i; j < lines.length; j++) { out += lines[j].replace(/\/\/.*$/, "") + "\n"; if (/;\s*(\/\/.*)?$/.test(lines[j])) break; }
  return out;
}

describe("no scan behind a dialog", () => {
  it("lists every dialog state of the station", () => {
    const def = definition() + definition("anyDialogOpen");
    expect(appStart).toBeGreaterThan(-1);
    const stateNames = [...appSrc.matchAll(/const \[(show[A-Z]\w*|bigPhoto|finished),\s*set\w+\]\s*=\s*useState/g)].map(m => m[1]);
    // Also every `{showX && ...` / `{bigPhoto && ...` / `{finished && ...` render site in App's JSX. Only names
    // starting with show, plus bigPhoto and finished, are checked: a dialog with any other state name (or a
    // prefixed condition such as `{signedIn && showX && ...`) must be added by hand and is not caught here.
    const renderNames = [...renderSrc.matchAll(/\{\s*(show[A-Z]\w*|bigPhoto|finished)\s*&&/g)].map(m => m[1]);
    const names = [...new Set([...stateNames, ...renderNames])];
    expect(names.length).toBeGreaterThan(10);   // the search itself works
    const missing = names.filter(n => !(n in NOT_DIALOGS) && !word(n).test(def));
    expect(missing).toEqual([]);   // a dialog not in anyDialogOpen would let the pedal scan behind it
  });

  it("names the dialogs the review found missing", () => {
    const def = definition() + definition("anyDialogOpen");
    for (const n of ["showPacking", "showStillOut", "showIssues", "showPark", "bigPhoto", "showHistory", "showBlanks", "finished"]) {
      expect(def).toMatch(word(n));
    }
  });

  it("the pedal handler uses the one list", () => {
    const i = src.indexOf("Global keyboard: the scan key, and the By hand key");
    expect(i).toBeGreaterThan(-1);
    const body = src.slice(i, i + 700);
    expect(body).toMatch(/anyDialogOpen/);
    expect(body).not.toMatch(/showBins|showPrint|showSettings/);   // no second hand-written list
  });

  it("the By hand key (W) opens the form from the camera screen, in the same handler, after the dialog check (the co-op, 25 Nov 2026)", () => {
    const i = src.indexOf("Global keyboard: the scan key, and the By hand key");
    const body = src.slice(i, i + 1400);
    expect(body.indexOf("anyDialogOpen")).toBeLessThan(body.indexOf("e.code === byHandKey"));
    expect(body).toMatch(/e\.code === byHandKey[\s\S]*actions\.manual\(\)/);
  });

  it("a flagged garment of an order not parked is offered back as a tap only, never a green (H3; the co-op, 26 Nov 2026)", () => {
    expect(src).toMatch(/import \{ matchRead, screenFor, tapOnly, holdBack \} from "\.\/lib\/scanpolicy\.js";/);   // the rule itself is tested in came-back.test.js
    expect(src).toMatch(/const matchOf = d => holdBack\(matchRead\(scanRoster, d\)\);/);   // camera reads
    expect(src).toMatch(/m = holdBack\(m\);/);                                                // typed entries
    expect(src).toMatch(/tapOnly\(c\) \? \{ mouseOnly: true \}/);                          // the list tile
    expect(src).toMatch(/options\.findIndex\(o => !o\.disabled && !o\.mouseOnly\)/);       // never the first highlight
    expect(src).toMatch(/cameBack: \{ was: "flag", reason: why\(r\._id\), \.\.\.\(pickedUp \? \{\} : \{ live: true \}\) \}/);
  });

  it("hands-free, the scan itself, the SCAN button and By hand use it", () => {
    expect(src).toMatch(/if \(anyDialogOpen\) \{ if \(gate\.armed\)/);   // the hands-free gate
    expect(src).toMatch(/if \(anyDialogOpen\) return;[^\n]*last line of defence/);   // doTriggerScan
    // The SCAN button and By hand: their `disabled` mentions anyDialogOpen (any spacing).
    // (the SCAN button is also off while a result is up: code review M1, see the last test)
    expect(src).toMatch(/doTriggerScan\(\);\s*\}\}\s*disabled=\{\s*scanning\s*\|\|\s*anyDialogOpen\s*\|\|\s*!!overlay\s*\}/);
    expect(src).toMatch(/actions\.manual\(\);\s*\}\}\s*disabled=\{\s*scanning\s*\|\|\s*anyDialogOpen\s*(\|\|\s*locatingUp\s*)?\}/);   // greyed too while "where is the damage" is up
    expect(src).not.toMatch(/\bmodalOpen\b/);   // the old, shorter list is gone
  });

  // Second half of H1: a result screen already up must not take the pedal while a dialog is open over it.
  it("the result screen ignores its keys while a dialog is open", () => {
    expect(src).toMatch(/const overlayPaused = dialogOverResult;/);
    // showBlanks hides itself while a result is up, so it must not pause the result (review of 23 Nov 2026): it is
    // in anyDialogOpen but not in dialogOverResult, and overlayPaused does not mention it.
    expect(src).not.toMatch(/const overlayPaused[^;]*showBlanks/);
    expect(src).toMatch(/const anyDialogOpen = dialogOverResult \|\| showBlanks;/);
    expect(definition("dialogOverResult")).not.toMatch(word("showBlanks"));
    const sites = src.match(/<ScanOverlay\b[^\n]*/g) || [];
    expect(sites.length).toBe(1);   // one render site: the narrow full-screen layout was removed with `wide` (consolidation, 23 Nov 2026)
    for (const s of sites) expect(s).toMatch(/paused=\{overlayPaused\}/);
    // ScanOverlay's own key handler returns at once when paused.
    const k = src.indexOf("a held key or pedal is one press");
    expect(k).toBeGreaterThan(-1);
    expect(src.slice(k, k + 400)).toMatch(/if \(paused\) return;/);
  });

  // The big photo and Finish later re-arm hands-free when they close, like every other dialog.
  it("the big photo and Finish later close through closeDialog", () => {
    expect(src).toMatch(/onClose=\{\(\) => closeDialog\(\(\) => setBigPhoto\(null\)\)\}/);
    expect(src).toMatch(/closeDialog\(\(\) => \{ setShowPark\(false\); setParkErr\(""\); \}\)/);
  });

  // The development replay driver goes through doRunScan directly: it respects the same list.
  it("the replay driver waits while a dialog is open", () => {
    expect(src).toMatch(/if \(scanning \|\| overlay \|\| anyDialogOpen\) return;/);
  });

  // Code review M1: a second scan must never replace a result that is not recorded yet.
  it("one scan at a time, and none over a result on screen", () => {
    const run = src.indexOf("const doRunScan = useCallback(");
    expect(run).toBeGreaterThan(-1);
    const body = src.slice(run, src.indexOf("const captureFrame = useCallback("));
    // The busy flag is a ref, checked and set before anything else, so two presses in one moment cannot both scan.
    expect(body.indexOf("if (scanBusyRef.current) return;")).toBeGreaterThan(-1);
    expect(body.indexOf("if (scanBusyRef.current) return;")).toBeLessThan(body.indexOf("setScanning(true)"));
    // "scanning" goes false only after the pictures are made, i.e. after the last wait before the result screen.
    const free = body.lastIndexOf("scanBusyRef.current = false; setScanning(false);");
    expect(free).toBeGreaterThan(body.indexOf("await cropDataUrl("));
    expect(body.slice(free)).not.toMatch(/\bawait\b/);   // nothing waits between "not busy" and the result screen
    // doTriggerScan (pedal, SCAN, hands-free) refuses while a result is up or a scan is reading.
    expect(src).toMatch(/if \(overlay \|\| scanBusyRef\.current\) return;/);
  });
});
