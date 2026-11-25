# Operator and Supervisor Guide

How to use the Jersey QC Scanner, task by task. The first part is for the operator at a station; the second part is for the supervisor's board.

A few words used throughout:

- **Roster**: the list of every jersey in the order (name, number, team, size).
- **Pedal**: the foot pedal at the station. It sends the Enter key. One press scans a jersey when no screen is open, and picks the highlighted button when a screen is open.
- **Box**: a packing box at the station. A box has a two-number name: `5.2` is the second box of team (or size) 5.
- **Flag**: marking a jersey as faulty so it goes to the supervisor instead of into a box.

---

## Part 1: at the station

### Sign in

1. Open the station (on the floor, the station PC opens it by itself in full screen).
2. Pick your **role**:
   - **Inspector**: checks every jersey and packs it.
   - **Sorter**: sorts only. No inspection checklist, no damage photos. A sorter can only flag "No size tag", "Duplicate" and "Not on the roster".
   - **Packer** is shown but greyed out: it is not built yet.
   - **Supervisor** opens the supervisor board (Part 2).
3. Pick the **station** you are at (Station 1, 2 or 3). A station already in use on another PC is shown in red with the name of the person using it.
4. Pick **your name** from the list. If your name is not there, pick **Other** and type it on the keys on the screen.
5. Type the **station's PIN** on the keypad and press **Sign in**. (Your supervisor gives you the PIN.)

The station goes full screen. **Sign out** (top right) ends your shift at this station. The order stays saved.

### Start an order

1. On the "Set up the order" screen, either:
   - tap **📥 Assigned orders** and pick an order the supervisor sent (it shows as a green line, with **Change** to pick another), or
   - tap **Roster file** and pick a CSV or Excel file.
2. Check the **order number**. It is usually filled in from the roster. Tap the box to type it on the keypad.
3. **Ships with**: if this order ships together with other orders, type their numbers (the comma goes in by itself after every six digits). Leave it empty if it ships alone.
4. **Jersey type**: ECHL, ECHL replica (stitched) or Sublimated (printed). This decides which flag reasons you are offered. Leave it unset to be offered every reason.
5. **Boxes, how the order is sorted**: **By team**, **By size**, or **Not sorted** (the whole order in one run of boxes). If the supervisor already chose, it says "set by the supervisor".
6. Press **Start order →**.

An order the supervisor sent can only be open on one station at a time. If another station has it, it shows "In progress on Station N".

### Set out the boxes

When the order starts, the **Set out N boxes** screen lists each team (or size) and how many boxes it should fill. One 2 x 1 in box label prints for each box by itself.

1. Line up the boxes at the station.
2. Stick each label inside its box (BOX 5.1, BOX 5.2 …).
3. Close the screen.

If a box label did not print, press the print button on that screen to print them again. Later, the **Box labels** button in the Boxes dialog opens this screen again.

### Scan a jersey

1. Press **Start camera** once at the start of the order.
2. Lay the jersey flat under the camera, back up.
3. Press the **pedal** (or the **⚡ SCAN** button).
4. The app reads the jersey and shows a green, yellow or red screen (below).

**Hands-free.** After the first jersey you confirm, the app scans by itself: when you take one jersey away and the next lies still under the camera, it scans. After each confirm it waits 3 seconds (set in Settings, "Wait after a confirm") so you can put the jersey away. The **⏸ Pause scan** / **▶ Hands-free** button beside SCAN turns it off and on; the pedal always works.

After a **flag**, hands-free waits: the flagged jersey is usually still under the camera. Press the pedal to scan the next jersey and hands-free comes back.

**"No jersey in view"** or **"No name or number in view"** is a short yellow notice, not an error. The camera saw an empty table or no lettering. Nothing is recorded. Lay the jersey flat and scan again.

**Retry.** The **R** key, or **↻ Retry scan** on a screen, takes the picture again. Nothing is recorded. On the green screen, Retry is a mouse click only, so a stray key press can never pass a jersey. After a retry, an amber strip says "#N is NOT checked — no sticker, no bin" until the next scan. **No sticker, no box.**

### The green screen: one jersey fits

The screen shows the number, name and team on the left, and the **SIZE** and **BOX** on the right.

1. Check the jersey. The pill in the header says which look you are on:
   - **Inspect fully** (the first 5 jerseys of an order, the 5 after a flag for "Others", and a spot check after every 10): every check is a button you tick: Decoration, Size tag, Fabric damage, Holes, Thread damage.
   - **Quick look** (the rest): nothing to tick. "Look at: Decoration · Size tag" shows big, the other three small. After a flag, the check that goes with it (a wrong name or number → Decoration, a missing size label → Size tag, a hole → Holes …) is a tick button on the next 5 jerseys.
2. Press the pedal once per tick button: it ticks the next one (yellow outline). Or tap any check.
3. When every tick button is ticked (on a quick look there is usually none), **✓ Confirm** unlocks. Press the pedal (or tap Confirm).
4. Put the jersey in the box shown.

If the jersey is not right, press **🚩 Flag** (see "Flag a jersey").

After you correct the app (you type over a green, the right jersey was not on a list, and so on), the next 5 jerseys are read twice and must agree before a green. The header shows **Checking · N**. This is normal.

### The yellow screen: pick the jersey

The camera was unsure, or more than one jersey fits (for example two #23s on different teams). The number read is at the top ("#23 · NAME"; a **?** means the camera doubted it). The list is sorted by size, but the size of the jersey you passed last comes first (then the sizes of the same kind), so a bundle of one size is one press of Enter each; a grey line under the number says so. On an order sorted by size the size is the biggest thing on each row. Every row is one line: the number big on the left, the name and team in the middle (the one that tells the rows apart is in amber), and the size big on the right.

1. Find the row that matches the jersey's **size tag** and name.
2. Tap it, or move the highlight with **A** / **↑** and press the pedal.
3. You go to the green screen for that jersey. If you picked the wrong row, press **← Back to the list**.

If the jersey is not on the list:

- **↻ Retry scan**: if the photo was bad (a fold, a hand in the way).
- **🚩 Flag**, then:
  - **No size tag**: the jersey has no size tag.
  - **Duplicate**: this jersey has already passed once. Pick its size.
  - **Not on the roster**: the number, name or size is not in this order. Pick its size (tick "Goalie jersey" if it is one).

A row with a **blue bar** on its left side is a jersey coming back: "🔧 Back from repair" or "✓ Was marked missing — found".

### The red screens

- **NOT FOUND** or **COULD NOT READ**: press **↻ Retry scan**. If it still fails, press **🚩 Flag** (No size tag, Duplicate, Not on the roster) or type the jersey in with **By hand**.
- **SCAN FAILED**: the model did not answer (the network or the server). Retry. If it keeps failing, see "When something goes wrong".
- **ALREADY DONE**: this jersey has been scanned before.
  - If it **passed** before: **Skip** (it was scanned twice by mistake), **Retry**, or **Duplicate** (there really are two of this jersey: it is flagged).
  - If it was **flagged** before: **Skip** is first, so the pedal skips. If it really is back from repair, tap **🔧 Back from repair — pass it** with the mouse. The pedal never passes a flagged jersey.

### Type a jersey by hand

Use this when the camera cannot read a jersey.

1. Press **⌨ By hand** (or the **W** key).
2. Type the number, and the name and team if you can, on the keys on the screen.
3. Save.
   - **One roster row fits**: you get the same green screen as a scan, with "← Back" to the form. Confirm records it as a pass, "Entered by hand".
   - **Several rows fit**: a list, as on the yellow screen.
   - **No row has that number**: "#88 is not on the roster — check the number". **← Back** (the pedal) returns to the form to fix a typo. If the number is right, press "#88 — not on the roster", then **🚩 Flag**.

### Blank jerseys

Jerseys with no name and no number cannot be read by the camera. When the roster has them, a green **Blanks · N** button appears beside By hand.

1. Tap **Blanks**. Each line is a team, size and style.
2. Tap **Count one** for each good jersey (or press the pedal to count one more of the last kind). **Flag one** for a faulty one. **Undo** takes back the last count.

### Flag a jersey

1. On the green screen, press **🚩 Flag**. (For a jersey that already passed: **🚩 Flag it** on the "Last passed" bar, or **🕘 History** → Flag it, or the roster row's Mark menu → Flag / damage.)
2. Pick the reason:

   | Reason | When |
   |---|---|
   | Name or number | The name or number is wrong, crooked or damaged |
   | Logo or crest | A logo or crest is missing, wrong or damaged |
   | Twill peeling | Stitched orders only: twill lifting or peeling |
   | Sublimation error | Sublimated orders only: a print or colour fault |
   | Stitching or seam | Loose or broken stitching, a seam or hem |
   | Holes | A hole or snag in the fabric |
   | Size label | The size label is wrong or missing |
   | Dirt or mark | See below: this is cleaned, not flagged |
   | Others | Anything else |

3. The **FLAGGED** screen shows the jersey and the reason. Two flag tickets print (a black column with the jersey in white, and the reason).
4. Stick a ticket on the jersey and put it in the **DAMAGED** box.
5. Press **Continue**.

**Dirt or mark** opens a blue **CLEAN IT NOW** screen. Wipe the mark off.

- **It is clean now**: the jersey is not flagged. It goes back to the green screen (or stays passed).
- **It will not come out**: it is flagged as "Dirt that will not come out".

**Damage photo.** On the FLAGGED screen, press **Photo of the damage**. For a defect (logo, twill, stitching, holes, dirt that will not come out) the pedal takes the photo too; for Name or number, Not on the roster, Duplicate and No size tag the pedal presses **Continue** instead. Set the damaged part under the camera, then press **Enter**: the photo is taken at once (no countdown), so set the jersey first. **Retake** or **Take another** as needed. The photos go to the supervisor and into the damage report.

**The DAMAGED box.** Every station has one, besides the team and size boxes. Its label does not print by itself: it is the same box all day. Print it from **🖨 Print → DAMAGED → Its label**. The Boxes dialog lists what is in it and has **🖨 Print its list**.

**Wrong size picked** on a "Not on the roster" or "Duplicate" flag: press **← Back · wrong size**. The flag is taken back. Throw away the tickets that printed, and pick the right size.

### Box full

1. When a box is full (by room or by weight: your judgement), tap **📦 Packing** (bottom left, beside History).
2. On the team's (or size's) row press **📦 Box 5.1 full**. (Or **📦 All boxes**, then **Box full** on that box's row.)
3. Answer "What size is Box 5.1?" (small, medium, large). The suggested one is marked. Your answer teaches the app how many jerseys fit in each box.
4. The box's list prints: a count label first, then the jersey lists. Tape the box and stick the labels on it.
5. That team carries on in the next box (5.2). Its label prints if it was not printed before.

The Boxes dialog warns **⚠ Short** when jerseys of a box's team or size are in no box yet (not scanned, flagged or missing). Check before you seal.

### Mark a jersey missing

In the roster table, open the row's **Mark** menu and choose **Missing**. On a passed row the Mark menu offers **Un-check** (scan it again) and **🚩 Flag / damage**.

To find a jersey in a long roster, tap **Number or name** above the table and type on the screen's keys. The **Filters** button narrows the table by box, done or to do, size and team.

### Finish the order

1. Tap **🏁 Finish order** in the header. (This is a click only: the pedal never finishes an order.)
2. Check the counts: passed, open, not scanned, and the amber list of jerseys that are in no box. **📋 See the summary first** opens the order summary: every jersey that passed (with its box), every one that failed (with why), and the missing ones, marked missing beside not scanned yet. The same screen is behind the **📋 Summary** button at the bottom of the station at any time; its **🖨 Print summary** prints the count label, the FAILED list and the MISSING list, and **With the passed list** adds every passed jersey.
3. If the order **ships with** other orders, choose for each box **Leave open** (it waits for the next order of the group) or **Full — close it**.
4. Press **✓ Finish order**. The lists of every open box print (each with a NOT IN BOX label when something of its team is flagged, missing or not scanned), the DAMAGED box's list, and the order summary.
5. The **"Order N is done"** screen stays up. From here:
   - **🖨 Print the box lists again**,
   - **🖨 Print something else…** (the Print menu),
   - **← Back to this order** if you are not finished,
   - **New order →** clears the order and waits for the next one.

If the server does not answer when you press New order, the screen keeps the order and says so. Fetch the supervisor. "Start a new order anyway" deletes the order from this station: use it only if the supervisor says the order is safe.

### Finish later, and unfinished orders

When an order cannot be finished today (jerseys out for repair, missing, not yet scanned):

1. Tap **⏸ Finish later** in the header.
2. Read the summary: "N of M jerseys are done", and what is still out.
3. Confirm. The whole order is saved on the server, and the station is free.

To pick it up again, on any station:

1. On the order screen, tap **⏸ Unfinished orders · N**.
2. Search by order number if needed, and tap the order.

On a picked-up order:

- Scan a jersey that came back as usual. The green screen says **🔧 Back from repair — check it is fixed** or **✓ Found — it was marked missing**. Check it and confirm.
- **🔧 Still out · N** lists what the order still waits for: back from repair, missing, extra jerseys with the supervisor, not scanned yet. **Pass it** passes one without the camera (tap twice to be sure).

### The Print menu

**🖨 Print** (in the header, on the order screen and on the done screen) prints any label again: every box label, every box list, one box's label or list, a jersey's sticker (search by number or name), or a flag ticket. **Another order** finds an order done before by its number. Labels always print on this station's printer.

### Other buttons

- **🕘 History**: every jersey scanned in this order, newest first. Flag one after the fact.
- **↶ Undo** on the "Last passed" bar: un-checks the last jersey (scan it again).
- **Missing · Dup · Flag** (beside History): the lists of missing, duplicate and flagged jerseys.
- **⚙ Settings**: keys, camera and its rotation, the wait after a confirm, the pick list's order, the label printer switches (stickers, flag tickets, box lists), packing.

### When something goes wrong

| What you see | What to do |
|---|---|
| **"No label printer for this station"**, or a printer error | Check the Zebra is on, has labels and is not paused. Press **Reprint** when it is back. Tell the supervisor: IT checks the printer from the server PC. Scanning carries on without labels |
| **"Board offline"** pill | The supervisor's board cannot be reached. Keep working. If jerseys stop being read too (SCAN FAILED each time), the server is down: stop and fetch the supervisor |
| **The hub is not saving anything** (a message from the server) | The server cannot read its data file. Stop and fetch the supervisor; IT must fix it (see `docs/DEPLOY.md`) |
| **A green you should not have passed** | Press **↶ Undo** on the "Last passed" bar (scan it again) or **🚩 Flag it**. For an older jersey: **🕘 History** → Flag it, or its roster row's Mark menu → Un-check. Take the sticker off and take it out of the box |
| **⚠ NOT SAVING — tell the supervisor** pill | The station's browser storage is full: a reload or crash would lose the work since. Do **not** reload or close the page. Tell the supervisor. **⏸ Finish later** puts the whole order on the server |
| **The page reloaded** | Press **▶ Resume** to carry on with the saved order |
| **The camera shows nothing** | Press **■** to stop the camera and **Start camera** again. Check the camera in Settings |

---

## Part 2: the supervisor board

Sign in as **Supervisor** with the supervisor's PIN. The supervisor's sign-in is the board only: no scanning.

### Station cards

One card per station, always showing now:

- the operator, the order, how many jerseys are done, the pace and the time left;
- **Now at**: the last jersey scanned;
- **Needs you**: the open problems of this order, the three that weigh most first. Each has a tag for where it goes (REMAKE, DECORATION, STITCHER, CLEANING, CHECK ORDER, SIGN OFF, DECIDE) and its photos (click to enlarge: the wheel or a pinch zooms, drag moves the picture, double-click toggles fit / 2x, the arrow keys or ‹ › show the next photo of the same jersey, Esc closes);
- **Still open from earlier orders**, each with **Done** when it has been dealt with;
- **Open order**, and **Remove** to take a card off the board. An open order starts on its **Summary** tab, the same summary the operator sees: pass rate, flag rate and pace, the boxes, and the jerseys Passed (with their box), Failed (with the reason) and Missing; Roster, Problems and Log are the next tabs.

A station that has signed out shows "signed out". A station silent for over 2 hours moves into a "Not reporting" strip.

The board sends no pop-ups, sounds or desktop notifications: the header count and the red lists are the whole story.

### Send a roster to a station

1. In **Send a roster**, choose **Send to** (any station, or one station).
2. Fill in the order number, order notes (from the order paper), jersey type, how the boxes are sorted, and ships with.
3. Choose the roster file and press **Send to stations**.

**Rosters sent** lists the rosters waiting or in progress, with who has each. **Release** lets another station take it; **Remove** takes it off the list.

### Orders and reports

- **Today**, **Pick a date…** or **A range of dates…** picks which day the orders list shows. The hub keeps 90 days; photos only for the newest 14.
- **Open order**: every jersey with its status, what was flagged and why, and the log.
- **⬇ Order sheet**: the order's Excel workbook (results, summary, boxes, attention).
- **Damage report**: every flagged jersey with its photos, as Excel (per order, or for the whole day).
- **⬇ Day sheet (Excel)**: the whole day, every station: jerseys per hour, time per jersey, flag rate, each operator, defects by category, every scan.
- **⬇ Compare days (Excel)**: one workbook over a range of dates: by day, by operator, by station, by part of the day, defects by day.

### The Unfinished pile

**⏸ Unfinished · N** opens every order put aside with Finish later. Each shows how long it has waited (amber from 2 days, red from 5).

- **Search** by order number.
- **→ Station 1 / 2 / 3** gives an order to that station (tap again to take it back). **Free it** frees an order a station left open.
- **✓ Settle…**: tick the jerseys still out, then:
  - **✓ Back and good**: they count as passed ("checked off by supervisor");
  - **📦 Ship short**: the order goes without them.
  Extra jerseys are closed either way. When nothing is left out, the entry closes. Settling is refused while a station has the order open.

### Wall view

**📺 Wall** shows one row per station in big letters, for a TV on the floor. Click or press Esc to return. Opening the address with `?view=wall` goes straight to it.

### Sign out

**Sign out** in the board's header ends your session on this PC.
