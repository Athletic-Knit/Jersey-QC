# Jersey QC Scanner — Roadmap

## Vision

The long-term goal is to evolve this tool into a **complete finishing floor management system** — a single platform that covers every process from the moment a finished jersey comes off the line to the moment it ships out the door.

Built so far: QC scanning (roster matching, defect flagging), reporting and damage tracking, and packing assist (boxes, labels, lists).

Still ahead: pack-by-player, shipping prep, and cross-order coordination.

---

> **Status, 17 Nov 2026.** Phases 1 to 3 are built except for the items marked open below. The one thing that has never happened is a real order run start to finish by an operator: the largest order on record is 81 jerseys. Phases 4 and 5 are not started. Details of how each piece works are in `CLAUDE.md`.

## Phase 1 — Production test & stabilisation *(built; floor test open)*

- [x] Camera-based QC scanning with Claude Haiku OCR
- [x] Roster matching (exact, fuzzy, number-only, turned and folded jerseys, boxes by team or size)
- [x] Supervisor board (multi-station, rosters sent to stations, one station per order, 90 days of look-back). "Pack groups" from the first prototype do not exist in this version; see Phase 5.
- [x] Excel/CSV export of scan results and event log
- [x] Server-side API proxy and image optimisation. The proxy adds the API key on the server (17 Nov 2026).
- [ ] Take the key off the page: rename `VITE_CLAUDE_API_KEY` to `CLAUDE_API_KEY` in `.env.local` (the code reads both; the old name is still handed to every browser)
- [ ] Full production floor test (a real order, a real operator; not yet run)
- [ ] A fixed home for the server (one always-on PC on the wired network, a built copy instead of the development server, its data out of the synced folder)
- [ ] Bug fixes and refinements from test feedback

---

## Phase 2 — Reporting & damage tracking *(built)*

### Summary reports
- [x] Damage findings per jersey: reason, scan photo, damage photos, Excel damage report
- [x] Missing pieces: marked at the station, counted at Finish order, listed on the order's Summary sheet ("Not in a box")
- [x] Breakdown by defect category (decoration, artwork, sewing, label, fabric, cleaning, order, other): "Defects" sheet on the day sheet, on the order's Summary sheet, and day by day on the comparison
- [x] Pass rate, flag rate and scan time per operator, per station and per order: day sheet ("Summary", "Orders", "Operators") and the order's Summary sheet

### Damage tracking integration
- [x] One scan event carries the match result, the flag reason and the damage photos; the damage report is exported from the same records
- [ ] Confirm the damage report's columns against the existing Damage Scanning Spreadsheet (nobody has compared them)

### Productivity tracking
- [x] Jerseys per hour, flag rate, time per order (station screen, board, day sheet)
- [x] Comparing days: "Compare days" on the supervisor board, one workbook over a date range (by day, by operator, operator by day, station by day, defects by day)
- [ ] Shifts: the comparison splits a day into before noon, noon to 6 pm and after 6 pm until the floor's real shift times are given

---

## Phase 3 — Packing assist *(built; packer station open)*

| Order type | Description | Status |
|---|---|---|
| Names + numbers | Player-specific jerseys | Built |
| Numbers only | Number decoration, no name | Built |
| No decoration | Blank jerseys | Built: counted in by team and size on the "Blanks" screen; the roster may give a quantity per line |

### Features
- [x] Box building: boxes named 5.1, 5.2 per team or size, Box full, contents tracked (done by the inspector while scanning)
- [x] Label printing: jersey stickers, box labels, box lists, flag tickets, and a Print menu for reprints and past orders (Zebra ZD411)
- [x] Box manifest: the list labels on the box and a "Boxes" sheet in the order's Excel
- [x] Shortage alerts: the Boxes dialog and Finish order say which jerseys are in no box (not scanned, flagged, missing) before the boxes are sealed
- [ ] A separate Packer station (the role is on the sign-in screen, blocked as "under development")
- [ ] New label layouts tried on paper on 13 Nov (20 names a label, count label with sizes): waiting for the manager's decision

---

## Phase 4 — Pack-by-player

An alternative packing workflow for orders that ship to individual players or are sorted by person rather than by team/bin:

- Group all jerseys belonging to one player across multiple order lines
- Guide operator through packing one player's complete kit at a time
- Generate per-player packing slips
- Useful for custom name+number orders, fan jerseys, direct-to-consumer fulfillment

---

## Phase 5 — Shipping prep & order coordination

### Cross-order linking
Connect multiple orders that need to ship together (extends the existing pack group concept):
- Consolidate orders by shipping destination
- Flag when a shipment is incomplete (waiting on another order)
- Track which boxes belong to which shipment

### Shipping documentation
- Generate packing lists and BOLs from scan data
- Pre-fill carrier information (address, box count, weight estimate)
- Export in formats compatible with Athletic Knit's shipping/ERP workflow

### Order status dashboard
A supervisor-level view showing every active order across the finishing floor:
- Where each order is in the process (scanning → packing → labeled → ready to ship)
- Which orders are blocked or flagged
- Estimated completion times based on scan rate data

---

## Technical considerations for future phases

- **Database**: everything is still one JSON file on the server (`data/hub.json`), Phase 3 included. It must become a real database (SQLite) before Phase 4: boxes → jerseys → players → orders → shipments. Until then the file must not sit in a folder that two PCs sync and both write (on 17 Nov 2026 that cost one PC its loaded history; the file was kept aside and nothing was lost).
- **Label printing**: done. The server builds ZPL and sends it raw to the Zebra's Windows queue.
- **Offline resilience**: the factory floor needs the system to keep working during network hiccups — consider a service worker or local-first data sync strategy
- **Mobile**: packing and labelling phases may benefit from a tablet-optimised layout; the current dark theme and large-text overlays already work reasonably well on mobile
