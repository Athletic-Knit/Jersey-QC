# Jersey QC Scanner: Roadmap

## Vision

Grow this tool into a **complete finishing-floor system**: one platform for every step from the moment a finished jersey comes off the line to the moment it ships.

How each built piece works is in `CLAUDE.md`; the latest decisions are in `CHANGELOG.md`.

> **Status, 23 Nov 2026.** QC scanning, reporting and packing assist are built and in use on the floor. Real orders have been run (the largest on record is a 521-jersey sort on 18 Nov 2026; the station was checked for a 500-jersey order on 11 Nov). Orders that ship together already share boxes. Still ahead: the items below.

## Done

- QC scanning: camera read by a Claude model, roster matching (exact, close, number-only, turned and folded jerseys), green / yellow / red screens, hands-free scanning, the operator's tick-off checklist, the self-check after a mistake.
- Matching rules of the 23 Nov 2026 review: a doubtful read is always yellow; 07 and 7 are different jerseys; green needs the whole name; a team name never decides a green.
- Flagging: one short reasons menu that follows the jersey type, "Dirt or mark" cleaned at the station, damage photos, flag tickets, the DAMAGED box.
- Boxes by team, by size or not sorted; box labels, box lists and count labels on the Zebra; Box full; the box model that learns box sizes from the floor; shortage warnings before sealing.
- Orders that ship together: boxes left open at Finish order are taken by the next order of the group, and the count label names both orders.
- Unfinished orders kept on the server (Finish later), picked up at any station, jerseys back from repair, and the supervisor's Settle (back and good, or ship short).
- Supervisor board: live station cards, rosters sent to stations, one station per order, 90 days of look-back, Wall view.
- Reports: order workbook with summary and boxes, day sheet (operators, defects by category, pass and flag rates), damage report with photos, Compare days.
- The Print menu: any label of the current order or a past one.
- Sorter role (sorting only, no inspection).
- The API key added by the server, not the page (the code side; see below for the setting).
- Development, testing and production stages with promotion scripts, backups and each stage's own packages; the hub refuses to write over a data file it cannot read.

## Next: put the floor setup right

- [ ] **Take the key off the page.** Rename `VITE_CLAUDE_API_KEY` to `CLAUDE_API_KEY` in each `.env.local` (the code reads both, but the old name is still sent to every browser). Check whether the server PC's file has been renamed.
- [ ] **Move production out of OneDrive.** Run `tools/setup-production.ps1` on the server PC, then `-StopOnly` on AK-NB-164, so one server writes one data file. Look for `PRODUCTION-MOVED.txt` in the OneDrive folder to see whether it has been done.
- [ ] **The testing server.** Confirm which PC runs it (`C:\JerseyQC-testing`, port 5175, started with `Servers\Testing server.bat`). A testing server was set up by hand on 19 Nov 2026; `CLAUDE.md` still says "not set up yet".
- [ ] **A fixed home for the server.** An always-on PC on the wired network, a real certificate (no browser warning), and a production build instead of the development server.
- [ ] **Sign-in and the hub.** The PINs are in the browser's code and the hub has no authentication: anyone on the network can call it. Real sign-in comes with a proper server.
- [ ] Bug fixes and refinements from floor feedback; the decisions left open by the 23 Nov 2026 review (see `CHANGELOG.md`, "Left open").

## Reporting

- [ ] Compare the damage report's columns with the existing Damage Scanning Spreadsheet (nobody has done it yet).
- [ ] Real shift times: the comparison splits a day into before noon, noon to 6 pm and after 6 pm until the floor's shifts are known.

## Packing

- [ ] **Weight.** The owner will supply a weight regression (all 9 sizes weighed) to replace the box model's estimates; later a scale connected to the station PC.
- [ ] **A separate Packer station.** The role is on the sign-in screen, blocked as "under development".
- [ ] New list layouts tried on paper on 13 Nov 2026 (20 names a label): waiting for the manager's decision. (The count label with the size mix is done.)

## Hardware not yet tested

- [ ] Hands-free thresholds on real fabric over a long shift (`src/lib/motion.js`).
- [ ] A camera unplugged mid-order; two cameras on one PC.
- [ ] One big push button in place of the pedal (the owner's plan for the Select key).

## Pack-by-player

An alternative packing workflow for orders that ship to individual players:

- Group all jerseys belonging to one player across several order lines.
- Guide the operator through one player's complete kit at a time.
- Per-player packing slips.

## Shipping prep and order coordination

Orders that ship together already share boxes (above). Still to come:

- **Shipments:** group orders by shipping destination; flag a shipment that waits on another order; track which boxes belong to which shipment.
- **Shipping documents:** packing lists and bills of lading from scan data; carrier details, box count and weight pre-filled; export in the format of Athletic Knit's shipping or ERP system.
- **Order status view:** every active order on the floor, where it is (scanning, packing, labelled, ready to ship), which are blocked, and estimated completion from scan rates.

## Technical considerations

- **Database.** Everything is one JSON file on the server (`data/hub.json`), plus one file per unfinished order. It should become a real database (for example SQLite) before pack-by-player and shipments: boxes → jerseys → players → orders → shipments.
- **Offline.** The floor needs the system to keep working through network hiccups; today a station keeps its open order in the browser, but reads need the server and the internet.
- **Tablets.** Packing and labelling may suit a tablet layout.
