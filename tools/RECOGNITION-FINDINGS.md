# Recognition findings

What the stress test (`recog-stress.mjs`) found, what caused it, what was changed, and what it measured before and after. Add a line whenever a failure teaches something; the point is not to make the same mistake twice.

How to read the numbers: "screen right" is the colour and rows the operator would see, judged against what the jersey is. WRONG GREEN is the only number that must be zero: a green on the wrong row passes a wrong jersey. A yellow with the right row on it is the app asking, which is allowed on a degraded frame.

## 2026-10-27 — first stress run (Haiku 5.5, thinking off, low effort)

Set: 10 real edge frames, 103 synthetic jerseys, 270 distorted frames; two runs each, 766 reads.

| category | screen right | number read | name read | WRONG GREEN | avg ms |
|---|---|---|---|---|---|
| real | 18/20 | 10/20 | 20/20 | 0 | 1289 |
| synth | 166/206 | 191/206 | 177/206 | 0 | 1125 |
| distort-real | 118/150 | 90/150 | 146/150 | 4 | 1128 |
| distort-synth | 345/390 | 368/390 | 306/390 | 5 | 1042 |
| all | 647/766 | 659/766 | 649/766 | 9 | 1088 |

("number read" on the real covered frames is low by design: the model is meant to read the visible digit and flag it, not guess the hidden one.)

### Failure classes and what was done

1. **Harness, not app: the two-jerseys frame.** The #5 jersey has no name; STEPHENSON is the other jersey in the picture. The judge demanded the name on the #5 row, so every variant of that frame "failed", and the crops that leave only the #5 in view were counted as wrong greens when green #5 is right. Lesson: the truth of a frame is the jersey the matcher should land on, not everything in the picture. Fixed in the harness.

2. **Lone digits with open fabric beside them flagged "second digit may be under a fold".** 30 of the 60 nameless single-digit reads, and the same digits under blur, grey, JPEG, tilt and small. Cause: the roster hint said to flag a hidden digit whenever one was "possible", and the model always finds it possible. Fix: the hint and the `number_complete` rule now ask for evidence within one digit's width of the digit (a fold line, crease, sleeve, hand, tag, shadow band or picture edge); smooth open fabric on both sides means complete. The 13-frame regression gate still catches every real fold, hand and cut-off (39/39).

3. **Jerseys not the right way up.** Upside down: 6 → 9, 66 → 99, 81 → 18, MUNN → MUUN, LILLI → ROLLO. Sideways: 66 → 69/96, 11 → "1?", names garbled. Three wrong greens on a nameless roster (a 6 read as 9 with a #9 row open). Fix in three layers: the read now returns `orientation`; a turned frame is turned upright (`rotateDataUrl`) and read again, and the two reads must agree (`reconcile`); and a nameless number with an upside-down twin (6/9, 18/81, 66/99) on a turned jersey asks when the twin is open (`rotated180`). A name on the jersey already anchored these to the right row as a question, never a green.

4. **A number close up, no sleeves or collar in view, answered "no jersey".** The synthetic frames cropped to the number came back `jersey_present: false` with nothing read. Hands-free would have skipped that jersey in silence. Fix: the prompt says any printed name or number means something is there, and the parser never reports an empty table when a name or number was read.

5. **A two-letter name (NG) flagged as cut off.** Prompt now says a short name with open fabric on both sides is complete.

6. **Blown-out frames** (brightness pushed past white) lose the jersey entirely. Not fixable in the reader; the camera exposure is the fix. Left as a known limit.

7. **The AK badge is read as the name on nameless synthetic jerseys** ("#6 AK"). Harmless on a number-only roster (names are ignored) and never seen on the real frames, whose badge is a logo rather than plain text. Left.

## 2026-10-27 — second run: the first fix for turned jerseys was wrong

Wrong greens went 9 → 0, but "screen right" fell 647 → 617 and the average read doubled to 2.4 s. Two causes, both mine:

8. **The model's `orientation` answer is unreliable.** At low effort it called many upright frames "rotated_left" or "upside_down" (blurred, grey and heavy-JPEG frames most of all). Re-reading on that flag alone meant a second read on most scans, of a frame now really turned, which read worse. Lesson: never spend a read on a flag that has not been measured. Fix: the re-read happens only when the turn could change the answer — the number read has an upside-down twin (6/9, 18/81, 66/99) open on the roster (`turnMatters`). A #52 reads as #52 whichever way it lies. The prompt also now says nearly every jersey is upright.

9. **Asking when the upright read was right.** 99 upside down became 66 upright, which is the whole point of the re-read, and the policy then asked the operator because the two reads differed. Fix: the upright read wins when it says the lettering is upright, its number is whole, and it differs from the first read only the way a turn would (`settleTurned`); anything else asks with both.

10. **Harness display.** The failure line printed the read after it had been replaced by the re-read, so identical-looking reads were marked as differing. Lesson: log the inputs of a decision, not the state after it. Fixed.

11. **A lone 0 in the synthetic Impact font** reads as no number or as a 1 under blur and grey. The real jerseys' 0 is a distinct shape and the real #40 frames never showed this; noted, not acted on.

## 2026-10-27 — third run, after the narrow trigger

| category | screen right | number read | name read | WRONG GREEN | avg ms |
|---|---|---|---|---|---|
| real | 20/20 | 10/20 | 20/20 | 0 | 1179 |
| synth | 196/206 | 200/206 | 157/206 | 0 | 1287 |
| distort-real | 147/150 | 89/150 | 150/150 | 1 | 1261 |
| distort-synth | 382/390 | 377/390 | 282/390 | 2 | 1164 |
| all | 745/766 | 676/766 | 609/766 | 3 | 1216 |

Only 8 of 766 reads needed a turn. ("name read" on synthetic nameless jerseys counts the badge text "AK" as a wrong name; it never reaches the screen on a number-only roster.)

12. **The model confuses rotated-left with rotated-right.** Twice the turn it asked for landed the jersey upside down, the second read still said "upside down" and read 9 for a 6, both reads agreed on 9, and the merge let the agreement through as green. Two fixes: keep turning by what the latest read says, up to two more times, until a read says upright; and two reads of a jersey that is still not upright never agree into a green (`settleTurned`). Also the matcher's upside-down rule was skipped because "AK" (the badge) counted as a name: a name that matches no roster row anchors nothing.

13. **Known limit: a fold with no visible edge at a quarter of the frame size.** The real #35 with the 3 under a sleeve, shrunk to 250 px, reads as a confident #5 and goes green on the #5 row. At the size the app sends (800 px) and at 400 px it is caught every time. Keep the camera close enough that the number is at least a hand high in the frame.

14. **Known limit: a covered jersey upside down.** The real fold frame turned 180° reads "56?" and lists #54 and #5 without #35. Not a green; the operator reaches "none of these". A 5 has no upside-down twin, so no turn is tried.

15. **Harness, not app: the blank synthetic jersey** reads its badge "AK" as a name and fails the "nothing read" rule. The real badge is a logo. Left.

## 2026-10-27 — fourth run (turned, tilted, 6/9 and real subsets only, after item 12)

| category | screen right | number read | name read | WRONG GREEN | avg ms |
|---|---|---|---|---|---|
| real | 20/20 | 10/20 | 20/20 | 0 | 1307 |
| synth | 47/54 | 52/54 | 43/54 | 0 | 1775 |
| distort-real | 149/150 | 91/150 | 150/150 | 0 | 1174 |
| distort-synth | 143/150 | 144/150 | 106/150 | 0 | 1404 |
| all | 359/374 | 297/374 | 319/374 | 0 | 1360 |

Every remaining failure is a yellow with the right row on it (a sideways 66 read as 69 or 96 beside SEACH, a sideways LILLI garbled, EVANOVICH read as EVANOWICH, NG upside down read as GN) or a harness artefact (the badge on the blank jersey; the heavy-JPEG fold frame read in full and went green on the right #35, which the judge expected as a question).

16. **A 20° tilt makes the model flip between rotated-left and rotated-right.** With a 6/9 twin open it turns three times and ends by asking, with the right row listed. Three extra reads on a rare path; left as is, but a tilted jersey is a reason to say "lay it straight" on the screen one day.

Where it stands: 0 wrong greens in 1,140 live reads over the full set and the subset rerun, the 13-frame gate at 39/39, the operator simulation at 0 wrong greens over 1,500 orders with the self-check on.

## 2026-10-28 — a jersey with no name listed named rows

17. **Floor: a nameless navy #40 with a hand over the right digit listed #40, #41 and #45 VARGHESE.** The hidden-digit rule offered every open 4X row, and the fact that the jersey plainly has no name was never used. Fix in the matcher (`withoutNamed`): when the read has no name, the number sits in the middle of the jersey, nothing is said about the name area and at least one open nameless row is on the list, rows WITH names come off the list. Only the list changes: the named rows still block a green, so a hidden digit on a named jersey stays a question. Gate 13/13 after. Cost, from the operator simulation: a named jersey whose name is out of frame while a nameless row is open is no longer on its list — 125 of 45,755 scans (0.3%) — and goes by hand; the self-check then watches the next 5. Wrong greens stay at 0 over 1,500 orders.

## Self-check after a mistake (operator simulation, 1500 orders)

| | self-check off | self-check on |
|---|---|---|
| wrong greens from a misread digit shown to the operator | 170 | 167 |
| of those, caught by the operator on the big number | 84 | 93 |
| double-read scans | 0 | 3061 (6.5% of scans) |
| reads that disagreed | 0 | 841 |
| wrong greens stopped before the screen | 0 | 22 |
| pace, jerseys per hour (median) | 728 | 716 |

In the simulation mistakes are spread evenly, so a 5-jersey window after each one covers 6.5% of scans and catches that share. On the floor mistakes cluster (a bad light, a fold-prone order, a tired hour), which is what the window is for. The cost is one extra read on those scans and about 1.5% of pace.
