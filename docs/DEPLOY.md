# Deployment Guide (for IT)

How the Jersey QC Scanner is installed, run, updated and repaired.

**The one rule:** never edit, save or restart anything in the production folder by hand. Every change goes **development → testing → production**, one step at a time, and only when the owner says so. A file saved in the production folder is live on the floor at once: on 17 Nov 2026 an edit made there broke a server in the middle of a demo.

## The PCs

| PC | Role |
|---|---|
| **AK-NB-165** | **The server PC.** The floor's stations and the supervisor board talk to it on port 5173. The floor's server, its log and its data file are only on this PC. |
| **AK-NB-164** | The development laptop: the development folder and server (port 5174). The Zebra label printer was plugged in here and shared as `\\AK-NB-164\Zebra`; on 20 Nov 2026 the owner moved it to the server PC (see Printers). |
| Station PCs | Run a browser only (Edge in kiosk mode). Nothing is installed on them. |

Run `hostname` before doing anything, to be sure which PC you are on. What AK-NB-164 shows about "the server" is its own copy, never the floor's.

## Stages, folders and branches

The code is on GitHub: `https://github.com/Athletic-Knit/Jersey-QC`. Each stage is a separate clone on its own branch, with its own packages (`node_modules`), its own `.env.local` and its own data.

| Stage | Branch | Folder | Port | Server config | Data file |
|---|---|---|---|---|---|
| Development | `development` | `%USERPROFILE%\JerseyQC-dev` (on AK-NB-164: `C:\Users\coop\JerseyQC-dev`) | 5174 | `vite.config.stage.js` | `data\hub-test.json` |
| Testing | `testing` | `C:\JerseyQC-testing` | 5175 | `vite.config.stage.js` | `data\hub.json` (its own) |
| Production | `production` | `C:\JerseyQC` on AK-NB-165 | 5173 | `vite.config.js` | `data\hub.json` |

All three serve HTTPS with a self-signed certificate (the camera only works on HTTPS). The first time a PC opens a stage, the browser warns: click Advanced, then Continue.

The server is the Vite development server (`npm run dev`) with the hub built in as a plugin (`hub-plugin.js`). There is no separate build step.

**Is production still in OneDrive?** Until `tools\setup-production.ps1` has been run, production is the OneDrive folder `...\OneDrive - Athletic Knit\Desktop\Jersey-QC-master` (on both PCs, synced). After it has run, a file `PRODUCTION-MOVED.txt` sits in that OneDrive folder and production is `C:\JerseyQC`. Look for that file first.

Development and testing never print unless their `.env.local` has `JQC_STAGE_PRINT=1`. (Their `.env.local` is copied from production and names the floor's Zebra.)

## The double-click files

In the `Servers` folder of each stage's folder:

| File | Where to run it | What it does |
|---|---|---|
| `Development server.bat` | AK-NB-164 | Clones the development folder if missing. Takes the newest `development` from GitHub (not when the folder has uncommitted work or is on another branch). Makes its own packages if needed. Starts the development server on 5174 **in that window**: keep it open. |
| `Testing server.bat` | The testing PC | Promotes development to testing on GitHub (`promote.ps1 -Yes`), takes it into `C:\JerseyQC-testing` (`pull-testing.ps1`), and starts the testing server on 5175 **in that window**: keep it open. Turns off the old "Jersey QC testing server" task if there is one. |
| `Production server.bat` | AK-NB-165 only | Shows what would move from testing to production, asks for one **Y**, promotes (`promote.ps1 -Production -Yes`), then makes sure the floor's server answers on 5173 (starts the "Jersey QC server" task, or runs it in the window if the task fails). On any other PC it stops and changes nothing. |

Each one copies `.env.local` from production into a new folder, and offers to add a firewall rule for its port if none exists (Windows asks for admin rights).

In the project's root folder:

| File | What it does |
|---|---|
| `promote-testing.bat` | `promote.ps1 -Yes`: development → testing on GitHub, no question |
| `pull-testing.bat` | `pull-testing.ps1`: the testing folder takes what was promoted to testing |
| `promote.bat` | `promote.ps1 -Production -Yes`: testing → production, no question. Run it in `C:\JerseyQC` on the server PC, on a break |
| `clear-prints.bat` | Clears the Zebra queue on this PC (see Printers) |
| `Start Station (kiosk).bat` | Opens a station in kiosk mode (see Stations) |
| `Start Jersey QC.bat` | The older way to start a server on 5173 in a window (from the folder it sits in), with a firewall check. On the server PC the scheduled task and `Production server.bat` do this job; if the server already answers, it only opens the board |

## Promotion: `tools\promote.ps1`

```
powershell -ExecutionPolicy Bypass -File tools\promote.ps1               development -> testing
powershell -ExecutionPolicy Bypass -File tools\promote.ps1 -Production   testing -> production
   add -Check to only show what would move; -Yes to skip the question
```

**To testing** (any folder of the project):

- Lists the commits waiting, and whether the server will reload.
- Asks for `YES` (unless `-Yes`).
- Moves the `testing` branch on GitHub forward to `development`. Fast-forward only: it refuses if testing has commits development does not.
- Prints the line that undoes it: `git push --force-with-lease origin <old>:refs/heads/testing`.

The testing folder then takes it with `pull-testing.bat` (or `Testing server.bat`, which does both).

**To production** (in the production folder, on the server PC):

- Refuses unless the folder is on the `production` branch with no uncommitted changes (changes made by hand are listed; sort them out first).
- Lists the commits and the files. It says whether the floor's server will reload (stations show Resume for a few seconds) or only the screens change. A server reload is caused by `hub-plugin.js`, `replay-plugin.js`, the two Vite configs, `src/lib/labels.js`, `roster.js`, `boxmodel.js` and the package files.
- Asks "Is the floor on a break?" and wants `YES` (unless `-Yes`).
- **Backs up** `data\hub*.json` and `data\hub*-orders\` into `data\backups\<date_time>\`. The newest 20 backups are kept.
- **If the packages changed** (`package.json` or `package-lock.json`): stops the "Jersey QC server" task and whatever listens on 5173, and refuses if it will not stop. After the move it runs `npm ci` and starts the task again. If the install fails, the server stays stopped and the script prints how to recover or go back.
- Fast-forwards `production` to `origin/testing` and pushes it. If the push fails, production has moved on this PC only; it says so and how to push later.
- Prints the line that undoes it: `git reset --hard <old>`, then `git push --force-with-lease origin production` (and `npm ci` with the server stopped, if packages changed).

Caution: until the server PC has this version of the script, its old `promote.bat` promotes `development` straight to production. Promote to production only when testing and development are the same, or run the new script by hand there.

## `tools\pull-testing.ps1`

Run in the testing folder (on the `testing` branch, no uncommitted changes). Backs up the testing data, fast-forwards to `origin/testing`, and if the packages changed (or the folder still links another folder's packages) stops the testing server on 5175 and runs `npm ci`. Start the server again with `Testing server.bat`.

## Packages

Each stage folder has its own `node_modules`, made by `npm ci` from its own `package-lock.json` (`tools\stagelib.ps1`). A stamp file in `node_modules` (`.jqc-lock-sha256`) records which lock file the packages were made from; when the lock file changes, the scripts make them again. A folder whose `node_modules` is a link to another folder's packages gets its own; the link is removed with `rmdir` alone, which never touches the folder it points to.

## The floor's server: the "Jersey QC server" task

On the server PC, a Windows scheduled task called **"Jersey QC server"** starts the server, hidden, when the user logs on, and restarts it within a minute if it stops. **The server PC must be logged in** for the server to run.

- The task runs `wscript.exe tools\serve-hidden.vbs`, which runs `npm run dev` with no window.
- Output goes to `data\server.log`. Each start moves the previous run's log to `data\server-previous.log`, so the log of a crash is kept.
- Set it up (once, no admin needed) with `tools\install-autostart.ps1` in the production folder.
- `schtasks /run /tn "Jersey QC server"` starts it; `schtasks /end /tn "Jersey QC server"` stops it.

The server reloads itself when one of its own files changes (see the list under Promotion). The process stays the same and the log says "server restarted". Stations reload and show Resume.

## Moving production out of OneDrive: `tools\setup-production.ps1`

Run once, **on the server PC, on a break** (stations are cut off for about a minute):

```
powershell -ExecutionPolicy Bypass -File tools\setup-production.ps1 -Check   shows the plan, changes nothing
powershell -ExecutionPolicy Bypass -File tools\setup-production.ps1          does it (asks for YES)
```

It copies the `production` branch to `C:\JerseyQC`, copies `.env.local` and the packages, stops the old server, merges every copy of the data file (the live file, this PC's OneDrive conflict copy `hub-<PC>-N.json`, and any `hub.json.unreadable-*`) into one with `tools\merge-hub-data.mjs`, points the "Jersey QC server" task at the new folder, starts it and checks it answers. Then it writes `PRODUCTION-MOVED.txt` in the old folder. Nothing in the old folder is deleted.

Then, **on the other PC** (AK-NB-164), so only one server is left:

```
powershell -ExecutionPolicy Bypass -File tools\setup-production.ps1 -StopOnly
```

This stops that PC's copy of the server on 5173 and disables its "Jersey QC server" task.

To go back: run `tools\install-autostart.ps1` in the old folder, then `schtasks /Run /TN "Jersey QC server"`.

Why it matters: while both PCs run a server out of one OneDrive folder, both write the same `data\hub.json`, and a file saved on one PC restarts the server on both.

## Data files

All in the stage's `data\` folder, never in git:

| Path | What it is |
|---|---|
| `data\hub.json` | The hub's state: stations, rosters sent, open boxes, the box model's answers, and the **ledger** (every scan and order, 90 days; photos on the newest 14 days) |
| `data\hub-orders\<id>.json` | Each unfinished order (Finish later), whole. Kept until the order is finished |
| `data\backups\<date_time>\` | Copies made by every promotion and testing pull (newest 20) |
| `data\server.log`, `data\server-previous.log` | The server's log, this run and the last |
| `data\hub-test.json`, `data\hub-test-orders\` | The development server's own data |

The hub writes its file whole or not at all (`hub.json.tmp`, then renamed).

**When the data file cannot be read.** At start-up the hub tries to read `hub.json` four times, half a second apart (OneDrive can hold a file for a moment).

- If the file is there but cannot be read, the hub is **blocked**: it writes nothing, and every request, reads too, gets an error 503, "the hub is not saving anything". Stations and the board show it. Nothing is written over the file.
- If the file is read but is broken (a write cut short), it is renamed to `hub.json.unreadable-<time>` and the hub starts empty. If it cannot be renamed, the hub is blocked.

What to do:

1. Read `data\server.log` for the reason.
2. Find what holds the file (OneDrive, an antivirus scan, an editor) and free it, or restore the newest good copy from `data\backups\`.
3. If a `hub.json.unreadable-*` file was made, do not delete it: it may still be put together. `tools\merge-hub-data.mjs` merges several copies into one.
4. Restart the server: `schtasks /end /tn "Jersey QC server"` then `schtasks /run /tn "Jersey QC server"`. Stations show Resume.

An unfinished order's file that does not parse is kept aside the same way (`<id>.json.unreadable-<time>`).

## Printers

The labels go to a **Zebra ZD411** (203 dpi, ZPL). The server builds the label and sends it raw to a Windows print queue on the **server PC** (`tools\print-raw.ps1`), so the printer is always driven from the server, never from the station's browser.

Two rolls: 1 x 0.5 in stickers (one per passed jersey, off by default per station) and 2 x 1 in labels (box labels, box lists, flag tickets).

Which queue is used, in order:

1. `JERSEY_PRINTER_STATION1` (2, 3) in `.env.local`, for that station. Never overridden.
2. A Zebra queue plugged into the server PC itself. This wins over a `JERSEY_PRINTER` that names a printer shared from **another** PC (every `.env.local` still names `\\AK-NB-164\Zebra`).
3. `JERSEY_PRINTER`.
4. The first queue on the server PC whose name or driver says Zebra, ZD4 or ZDesigner.

Flag tickets use `JERSEY_FLAG_PRINTER_STATIONn`, then `JERSEY_FLAG_PRINTER`, then the station's label printer. Roll sizes: `JERSEY_LABEL_SIZE` (default `1x0.5`), `JERSEY_FLAG_LABEL_SIZE` (default `2x1`). See the settings table in `README.md`.

A print that gets no answer is stopped after 30 seconds and the station shows why, in plain words.

**`tools\printer-check.ps1`**, run on the server PC, checks the path a label takes, step by step, with times: does the sharing PC's name resolve (and to what address), do its ports 445 and 135 answer, does the printer open, and one test label. `-NoPrint` skips the test label; `-Printer "<queue>"` checks another queue.

```
powershell -ExecutionPolicy Bypass -File tools\printer-check.ps1
```

Seen 12 Nov 2026: the printer's PC moved from wired to Wi-Fi and the server PC kept using the old address, so every label took 28 s or failed. The cure was on the network side (plug back into the wire, or `ipconfig /flushdns` on the server PC). A printer shared from another PC also needs that PC on, awake, and on the domain network (its firewall lets printer sharing in on the Domain profile only).

**`clear-prints.bat`** (`tools\clear-print-queue.ps1`), run on the PC the Zebra plugs into, throws away every label waiting in the queue and says "Cleared: N / Left: 0". Use it after testing with the Zebra unplugged: otherwise everything prints the moment it is plugged back in.

## Firewall

Other PCs reach a stage only when Windows Firewall lets its port in:

| Port | Stage |
|---|---|
| 5173 | Production (on the server PC) |
| 5174 | Development |
| 5175 | Testing |

The `Servers` bat files offer to add the rule. By hand, as an administrator:

```
netsh advfirewall firewall add rule name="Jersey QC 5173" dir=in action=allow protocol=TCP localport=5173 profile=domain,private
```

Outgoing, the server PC needs `api.anthropic.com` (HTTPS), and station browsers need `cdnjs.cloudflare.com` (for Excel files).

## Stations

A station is a PC with a browser, a camera over the table, a foot pedal (it sends Enter) and, ideally, a Zebra shared to the server PC.

**Kiosk launcher.** `Start Station (kiosk).bat` (or `Jersey QC Station.exe`, built from it by `tools\build-station-exe.ps1` with IExpress) opens Edge in kiosk mode on the station's address: full screen, no address bar, no tabs, no menus. Alt+F4 closes it.

- The first run asks for the server address (for example `https://AK-NB-165:5173`) and which station the PC is (`station1`, `station2`, `station3`), and keeps the answers in `%APPDATA%\JerseyQC\station.cfg`. Delete that file to be asked again.
- It uses its own browser profile (`%APPDATA%\JerseyQC\edge-profile`), so the station's sign-in and saved order are kept apart from anyone's own browsing.
- The first time, accept the certificate warning (Advanced, then Continue); the profile remembers it.
- Put a shortcut in the Startup folder (Win+R, `shell:startup`) to open the station at log-on.
- If Edge is missing it uses Chrome.

Use the server PC's **name** rather than its IP address: the address changes when a PC moves between Wi-Fi and wired.

The station addresses are `https://<server>:5173/?station=station1` (2, 3). The supervisor uses `https://<server>:5173/`. The wall view is `https://<server>:5173/?view=wall`.

The open order is saved in the station browser's storage, keyed by station, so a reload or a crash offers Resume.

## Troubleshooting

| Problem | Check |
|---|---|
| Stations cannot open the page | Is the "Jersey QC server" task running on AK-NB-165 (Task Scheduler, or `https://localhost:5173` on that PC)? Is the server PC logged in? Is the firewall rule there? Did the station use an old IP address? |
| The page opens but every scan fails ("SCAN FAILED") | `data\server.log`: look for `[anthropic]` lines. "no API key" means `.env.local` has no `CLAUDE_API_KEY`. A 401 means the key is wrong. Timeouts mean the server PC cannot reach `api.anthropic.com` |
| "The hub is not saving anything" | The data file cannot be read: see Data files |
| "Board offline" at a station | The station cannot reach the hub. If the server itself is up, scanning still works; if the whole server is down, scans fail too, because the model's requests go through the server |
| Labels do not print, or take 30 s | Run `tools\printer-check.ps1` on the server PC. Check `JERSEY_PRINTER` in `.env.local` and that the Zebra has labels and is not paused |
| A promotion refuses to run | Read what it says: wrong branch, changes made by hand, GitHub unreachable, or the server would not stop. It changes nothing when it refuses |
| The server reloaded during work | A server file changed (a promotion, or someone saved a file in production: they must not). Stations press Resume |
| A station's header shows "NOT SAVING" | The station browser's storage is full. The operator uses Finish later to put the order on the server; then clear the browser's site data for the app on that PC |
| Two servers write one data file | Production still in OneDrive with both PCs running a server: run `setup-production.ps1`, then `-StopOnly` on the other PC |

## For developers

- Work only in the development folder. Before committing: `npx eslint src hub-plugin.js` and `npx vitest run`; push `development` to GitHub after each commit.
- In PowerShell use `npm.cmd` / `npx.cmd`: the script policy on these PCs blocks plain `npm`.
- After editing anything in `src/lib`, hard-reload open station pages: the live reload keeps old objects in memory.
- `.claude/launch.json` has a `jersey-qc-test` entry that runs `vite.config.diag.js` on 5174 (that file is not in git; it uses `data\hub-test.json` and still prints on the Zebra). It and `Development server.bat` use the same port, so run one at a time.
- `tools\browser-harness.js` (a fake camera) and `tools\break-it.js` (a scenario suite) run in a browser tab against the test server. Their by-hand checks still expect the old "ENTERED BY HAND" screen and need updating.
- Details of every rule are in `CLAUDE.md`; the latest decisions are in `CHANGELOG.md`.
