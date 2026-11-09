# Input trial: mouse + pedal against up/down keys + pedal

A temporary trial, not a feature (9 Nov 2026). The floor cannot agree on how the
operator should drive the result screens: a mouse and one pedal, or two
mechanical keys (up / down) and one pedal. Three things measure it; remove all
three in one commit once the decision is made (see "Removing it" below).

## 1. The model (no people needed)

`SIM_INPUT=1 SIM_ORDERS=1500 npx vitest run operator-sim` prints what the
Keystroke-Level Model (Card, Moran & Newell; operator values after Kieras)
says each setup costs over every result screen 1,500 simulated orders show.
Point the mouse 1.1 s, click 0.2 s, home the hand from the jersey 0.4 s each
way, one key step 0.3 s, pedal 0.3 s, decide 1.35 s (the same in both). The
model is in `src/lib/trial.js` (`modelDecision`, `KLM`).

Run of 9 Nov 2026, 50,288 screens over 43,988 jerseys:

| | mouse + pedal | keys + pedal | difference |
|---|---|---|---|
| screen time per order (29 jerseys) | 60.2 s | 59.3 s | 0.9 s, keys |
| screen time per 100 jerseys | 205.4 s | 202.3 s | 3.1 s, keys |

92% of screens end on the first option, which is the pedal in both setups, so
the setups cannot differ there. Where they do:

| screen | screens | first option | mouse | keys | who wins |
|---|---|---|---|---|---|
| yellow list | 10,412 | 76% | 21,732 s | 20,622 s | keys, 1.9 steps on average: one or two key presses beat reaching for the mouse |
| red (not read, duplicate) | 863 | 65% | 1,981 s | 1,856 s | keys, by a little |
| flag reasons menu | 1,439 | 20% | 4,465 s | 4,401 s | even: 3.2 steps on average is where the mouse catches up |
| green, supervisor, by hand | 37,574 | 100% | — | — | identical: the pedal |

**Judgement from the model:** a tie. Three seconds per hundred jerseys is
under one per cent of the time an order takes and well inside the model's
error. Speed will not decide this; what should is what the hands are doing:
the mouse needs a clean free hand and a clear patch of table, the keys can be
hit with a knuckle; the keys need the operator to watch the highlight move
down a long list, the mouse does not; and the setup someone is used to will
win on their own numbers. The 12-item reasons menu an order with no jersey
type shows is the one place the keys are slower by design.

## 2. The stand-alone simulator (people, no app)

`tools/input-trial.html` — open the file in a browser, no server. The jersey
under the camera (number, name, size, team, and anything wrong with it) is in
the top-left; the station's green / yellow / red screens are on the right.
A run is 30 jerseys: 20 greens, 4 yellow lists, 1 list without the jersey,
1 unreadable number (by hand), 2 damaged jerseys (flag → reason → photo),
1 wrong green, 1 duplicate. The same 30 come up again for the other setup, so
each tester works both setups on identical jerseys. Only the time from a
screen appearing to the choice on it counts: how long someone looks at a
jersey never enters it. Wrong choices and reaches for the wrong device (a
click under the keys setup, an arrow under the mouse setup) are counted.

Pedal = Enter, B or Space. Keys setup: A or ↓ down, ↑ up. Results stay in
that browser; 📊 Results shows the comparison and exports a CSV. Three runs
each by at least two people before deciding; the first run with any setup is
a learning run.

## 3. Recording on the real stations (people, real orders)

Settings → Input trial names the setup a station is using. From then on every
decision on a result screen is kept in that browser (`jerseyqc.trial.v1`):
screen, option index, by click or by key, key steps, seconds from the screen
appearing. "📊 Compare the setups" sums it up and exports a CSV. Nothing goes
to the hub. The number here includes the operator's look at the jersey while
the screen is up, so it is noisier than the simulator's; 100 passes with each
setup, by more than one operator, before reading anything into it.

## Removing it

Delete `src/lib/trial.js`, `src/lib/__tests__/trial.test.js`,
`tools/input-trial.html` and this file; in `src/App.jsx` drop the trial import,
the `onTrial` prop and `fire` wrapper in `ScanOverlay` (the three `onClick`
sites go back to `o.run`), the `onTrial` block above the scan-key effect, the
header pill, the Input trial section and `TrialPanel` under Settings; in
`src/config.js` drop `trialMethod`; in the operator simulation drop `scr`,
`listPick`, `listNone`, `fullReasons`, `inputReport` and the `screens` stat.
