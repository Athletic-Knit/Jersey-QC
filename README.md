# Jersey QC Scanner

A web app for checking finished sports jerseys on the finishing floor before they are boxed and shipped.

## What it does

- An operator lays a jersey under an overhead camera and presses a foot pedal (or lets hands-free scanning take the picture by itself).
- A Claude model (an AI that reads images) reads the player's name and number from the photo.
- The app compares what it read with the order's **roster** (the list of every jersey in the order) and shows one of three screens:
  - **Green**: exactly one jersey on the roster fits. The operator ticks a short checklist (name and number, size tag, logos and so on) and confirms.
  - **Yellow**: the read is unsure, or more than one jersey fits. The operator picks the right one from a list.
  - **Red**: nothing on the roster fits, or the read failed. The operator scans again or flags the jersey.
- Every jersey goes into a **box** for its team or size. The app names the boxes (5.1, 5.2 …), says when to close one, and prints the box labels and the list of what is in each box on a Zebra label printer.
- A jersey with a fault is **flagged**: the operator picks a reason, the app prints a black flag ticket, and the jersey goes in the DAMAGED box.
- A **supervisor board** on another PC shows every station live: what each one is on, what needs attention, and Excel reports for an order, a day or a range of days.

How to use it at a station: [docs/OPERATOR-GUIDE.md](docs/OPERATOR-GUIDE.md).
How it is installed and run: [docs/DEPLOY.md](docs/DEPLOY.md).

## The three stages

Every change passes through three copies of the app, in this order. Each has its own folder, its own git branch, its own port and its own data, so trying something never touches the floor.

| Stage | What it is for | Branch | Folder | Port |
|---|---|---|---|---|
| **Development** | Where changes are made and first tried | `development` | `C:\Users\coop\JerseyQC-dev` on AK-NB-164 | 5174 |
| **Testing** | A copy of production to try changes on before the floor gets them | `testing` | `C:\JerseyQC-testing` | 5175 |
| **Production** | What the floor uses | `production` | `C:\JerseyQC` on the server PC, AK-NB-165 | 5173 |

**The rule:** development → testing → production, one step at a time, and only when the owner says so. Nothing reaches production that was not on testing first. Never edit files in the production folder by hand.

**Where production really is.** Production used to run from a OneDrive folder (`...\OneDrive - Athletic Knit\Desktop\Jersey-QC-master`) that two PCs shared. `tools/setup-production.ps1` moves it to `C:\JerseyQC` on the server PC. When that script has been run, it leaves a file called `PRODUCTION-MOVED.txt` in the OneDrive folder. If that file is there, production is `C:\JerseyQC`. If it is not, production is still the OneDrive folder. See [docs/DEPLOY.md](docs/DEPLOY.md).

## Running it for development

On AK-NB-164, in PowerShell (use `npm.cmd` and `npx.cmd`: PowerShell's script policy on these PCs blocks plain `npm`):

```powershell
cd C:\Users\coop\JerseyQC-dev
git switch development
git pull
npm.cmd ci                      # this folder's own packages
# .env.local: copy it from production's folder (ask the owner); it is not in git
$env:JQC_STAGE = "development"
npx.cmd vite --config vite.config.stage.js
```

Then open `https://localhost:5174/?station=station1` for a station, or `https://localhost:5174/` for the supervisor. The browser warns about the certificate the first time: click Advanced, then Continue.

The same thing in one double-click: `Servers\Development server.bat`. It also takes the newest `development` from GitHub first (unless the folder has work not yet committed).

The development server keeps its data in `data\hub-test.json`, never in the floor's file.

## Tests and checks

Run these in the development folder before every commit:

| Command | What it checks |
|---|---|
| `npx eslint src hub-plugin.js` | Code style and common mistakes (must be clean) |
| `npx vitest run` | Every unit test (over 500 of them) |
| `$env:SIM_ORDERS=3000; npx vitest run operator-sim` | The operator simulation: thousands of whole orders through the real matching code, with a camera that misreads and an operator who makes mistakes. It must report **WRONG GREEN 0** |

Other simulations (packing, recognition stress, replay of a real order) are described in `CLAUDE.md` under "Simulations".

## Where things are

| Path | What is there |
|---|---|
| `src/App.jsx` | Every screen of the station and the supervisor board, in one file |
| `src/config.js` | Floor settings: the model, the checklist, the flag reasons, jersey types, roles, stations, default settings |
| `src/main.jsx`, `src/index.css` | Start-up, the two typefaces, and the screen zoom for large monitors |
| `src/lib/attention.js` | Records when the station's screen was left or sat idle |
| `src/lib/audio.js` | The sounds (pass, flag, scan, retry) |
| `src/lib/boxes.js` | The old flat "N jerseys fill a box" count; only the packing simulation uses it now |
| `src/lib/boxmodel.js` | Which box a set of jerseys fits in, by room and weight, learnt from the floor's answers |
| `src/lib/colour.js` | Compares the jersey colour the camera saw with a colour column on the roster |
| `src/lib/damage.js` | The damage report workbook, with photos |
| `src/lib/dupoptions.js` | The buttons of the ALREADY DONE screen |
| `src/lib/export.js` | Excel and CSV exports: order results, scan log, day sheet, comparison of days |
| `src/lib/hub.js` | How a station and the board talk to the server |
| `src/lib/labels.js` | Every label layout, in ZPL (the Zebra printer's own language) |
| `src/lib/ledgerview.js` | How the board reads the server's record of orders and scans |
| `src/lib/match.js` | Matching a read against the roster: green, yellow or red |
| `src/lib/motion.js` | Hands-free: when a new jersey has been laid down and is still |
| `src/lib/orderstore.js` | Unfinished orders and what is still out on them |
| `src/lib/pace.js` | Jerseys per hour and time left, from working time |
| `src/lib/persist.js` | Saving the open order and settings in the station's browser |
| `src/lib/printjobs.js` | Everything an order can print, for the Print menu |
| `src/lib/replay.js` | Plays a past order back through today's screens (development and testing only) |
| `src/lib/roster.js` | Reading roster files (CSV, Excel), boxes, sorting, shortages |
| `src/lib/scanpolicy.js` | Which screen a read leads to |
| `src/lib/text.js` | Name and number clean-up shared by reading and matching |
| `src/lib/vigilance.js` | The self-check after a mistake, and the operator's inspection checklist |
| `src/lib/vision.js` | The request to the Claude model: one photo in, name and number out |
| `src/lib/__tests__/`, `src/__tests__/` | The tests |
| `hub-plugin.js` | **The hub**: the server side. Stations report to it, the board reads from it, rosters, unfinished orders and labels go through it. Its header lists every route |
| `replay-plugin.js` | Finds a past order for the replay (development and testing only) |
| `vite.config.js` | Production's server: port 5173, HTTPS, the hub, the API proxy |
| `vite.config.stage.js` | The development and testing servers (ports 5174 and 5175) |
| `Servers\` | One double-click file per stage |
| `tools\` | Scripts: promotion between stages, the server's auto-start, printer checks, simulations, stress tests |
| `docs\` | The operator guide and the deployment guide |
| `data\` | (not in git) the hub's data file, unfinished orders, backups and the server log |

## Documents

- [docs/OPERATOR-GUIDE.md](docs/OPERATOR-GUIDE.md): using the station and the supervisor board.
- [docs/DEPLOY.md](docs/DEPLOY.md): PCs, folders, promotion, printers, troubleshooting (for IT).
- [CLAUDE.md](CLAUDE.md): the detailed notes for developers (and Claude sessions): every rule and the reason for it. Dense, and partly history.
- [CHANGELOG.md](CHANGELOG.md): the changes from the code review of 23 Nov 2026, the latest decisions.
- [ROADMAP.md](ROADMAP.md): what is planned.
- [DEMO-CHECKLIST.md](DEMO-CHECKLIST.md): the work list from before the October demo, kept as a record.

## Settings in `.env.local`

Each stage folder has a file called `.env.local` with its settings. It is never in git. Every setting has a default, so only the API key is required.

**Important:** any setting whose name starts with `VITE_` is sent to every browser that opens the app. Anyone on the network can read it. That is fine for options, but never for the API key.

| Setting | What it does | Default |
|---|---|---|
| `CLAUDE_API_KEY` | The Anthropic API key. The server adds it to each request to the model, so the stations never see it. **Required** | none |
| `VITE_CLAUDE_API_KEY` | The old name of the key. Still read, but because of the `VITE_` name it is sent to every browser. Rename it to `CLAUDE_API_KEY` | none |
| `VITE_CLAUDE_MODEL` | Which Claude model reads the jerseys | `claude-haiku-5-5` |
| `VITE_CLAUDE_EFFORT` | `low`, `medium` or `high` | `low` |
| `VITE_CLAUDE_THINKING` | `off` or `adaptive` | `off` |
| `VITE_SEND_MAX_PX` | Longest side of the photo sent to the model, in pixels | `800` |
| `VITE_OPERATORS` | Names offered at sign-in, separated by commas ("Other" is always offered too) | `Person 1,Person 2,Person 3` |
| `VITE_PIN_STATION1`, `2`, `3` | The PIN of each station (inspectors and sorters sign in with it) | set in `src/config.js` |
| `VITE_PIN_SUPERVISOR` | The supervisor's PIN | set in `src/config.js` |
| `VITE_PIN_INSPECTOR`, `VITE_PIN_SORTER`, `VITE_PIN_PACKER`, `VITE_PIN_ADMIN` | Role PINs kept in `src/config.js`. Not used to sign in today: inspectors and sorters use the station's PIN, the Packer role is blocked, Admin is not offered | set in `src/config.js` |
| `VITE_PIN_REQUIRED` | `false` turns the PIN off | `true` |
| `JERSEY_PRINTER_STATION1`, `2`, `3` | The Windows print queue for that station's labels, as seen from the server PC | none |
| `JERSEY_PRINTER` | The print queue for any station without its own. A Zebra plugged into the server PC wins over a printer shared from another PC | the first Zebra queue on the server PC |
| `JERSEY_LABEL_SIZE` | The sticker roll, in inches, width x height | `1x0.5` |
| `JERSEY_FLAG_PRINTER_STATION1`, `2`, `3`, `JERSEY_FLAG_PRINTER` | The queue for flag tickets, per station and for all | the station's label printer |
| `JERSEY_FLAG_LABEL_SIZE` | The flag ticket roll | `2x1` |
| `JQC_STAGE_PRINT` | `1` lets the development or testing server print. Without it they print nothing (production always prints) | off |
| `JQC_REPLAY_FROM` | Development and testing only: the floor data file(s) the replay reads from, separated by `;` | `C:\JerseyQC\data\hub.json` |

Two more are set by the scripts, not in `.env.local`:

| Setting | What it does |
|---|---|
| `JQC_STAGE` | `development` or `testing`: tells `vite.config.stage.js` which stage to run. `tools\stage.ps1` sets it |
| `VITE_REPLAY` | `1` shows "Replay an order" on the order screen. `vite.config.stage.js` sets it for development and testing; production never has it |

The PINs are a convenience gate against passers-by, not security: they are in the browser's code.

## Network needs

- The server PC must reach `api.anthropic.com` (the model).
- Station browsers must reach `cdnjs.cloudflare.com` to read Excel roster files and to make Excel reports.
- Stations reach the server on port 5173 over HTTPS (the camera only works on HTTPS).
