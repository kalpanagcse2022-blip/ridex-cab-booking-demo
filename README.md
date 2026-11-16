# RideX — cab booking, live tracking, driver approval and demo payments

A complete customer / driver / admin ride-booking web app.

- **Customers** sign up, book a ride (GPS pickup, searched destination, vehicle, payment method), follow the driver on a live map, pay, rate and send feedback.
- **Drivers** apply, wait for admin approval, go online/offline, accept or reject requests, share their GPS, run the trip and confirm payment.
- **Admins** approve or revoke drivers, manage customers, rides, payments, complaints and fares, and use **Live Tracking** to see every driver (Online / Offline, approval, last seen), online drivers on a map, and open rides with route and driver position.

Stack: Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · PostgreSQL · Drizzle ORM · Leaflet / OpenStreetMap.

---

## 1. What you need on Windows

| Install | Notes |
|---|---|
| **Node.js 22 LTS** (20.9 or newer works) | https://nodejs.org — use the Windows installer and keep "Add to PATH" ticked. |
| **PostgreSQL 14 or newer** | https://www.postgresql.org/download/windows/ — the installer also installs **pgAdmin**. **Remember the password you give the `postgres` user.** Keep the default port **5432**. |
| **Chrome or Edge** | For the demo (Chrome DevTools can simulate a GPS position). |
| **Internet access** | Needed once at build/first run (Google Fonts) and always for the map tiles and address search — see section 8. |

There is nothing else to install: no map key, no payment account, no C++ build tools (all packages are pure JavaScript).

## 2. Set it up (about 10 minutes)

1. **Extract the ZIP.** Right-click `ridex-project.zip` → **Extract All…** → for example `C:\ridex`. The project is inside a folder called `ridex`.
2. **Open a terminal in the project folder.** In File Explorer open `C:\ridex\ridex`, click the address bar, type `cmd` and press Enter (Command Prompt). *PowerShell works too — see Troubleshooting if it refuses to run `npm`.*
3. **Install dependencies:**
   ```
   npm install
   ```
4. **Create an empty database.** Easiest with pgAdmin: open **pgAdmin** → connect to your server (enter your `postgres` password) → right-click **Databases** → **Create → Database…** → name it `ridex` → **Save**.
   *Or from a terminal (adjust the version folder):*
   ```
   "C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres -c "CREATE DATABASE ridex;"
   ```
5. **Create your settings file.** In the project folder:
   ```
   copy .env.example .env
   ```
   Open `.env` in Notepad and set:
   - `DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/ridex` — replace `YOUR_PASSWORD` with your `postgres` password. If the password contains characters such as `@ # / :` write them percent-encoded (`@` → `%40`, `#` → `%23`, `/` → `%2F`, `:` → `%3A`).
   - `ADMIN_SETUP_CODE=` — any long random text you choose (it is used once, in step 7).

   `.env` is the **only** place you configure the database. Never share or commit it.
6. **Create the tables** (safe to run again — it only adds what is missing):
   ```
   npx drizzle-kit push
   ```
7. **Start the app:**
   ```
   npm run dev
   ```
   Open **http://localhost:3000** in your browser. (For a production-style run: `npm run build` then `npm start`.) If Windows Firewall asks about Node.js, "Allow" on private networks is enough.
8. **Create the first administrator** — open **http://localhost:3000/admin/setup**, enter your name, e-mail, a password of 10+ characters and the `ADMIN_SETUP_CODE` from `.env`. This page closes permanently once an admin exists. (Alternative: set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `.env` before the first start and the admin is created automatically.)

RideX ships **no default admin account and no default password.**

## 3. Logging in

| Role | Where | How you get an account |
|---|---|---|
| **Admin** | http://localhost:3000/admin/login | Created in step 8. Change the password under **Admin Settings → Password**. |
| **Customer** | http://localhost:3000/login | Sign up at `/signup`. |
| **Driver** | http://localhost:3000/login | Apply at `/drive` (account stays *pending*). An admin must approve it under **Driver Verification** before the driver can go online. |

Each role lands on its own page after login: customers on **My Rides**, drivers on **Driver dashboard**, admins on the **Admin dashboard**.

## 4. Demo: driver online/offline and live tracking on the admin map

Sessions are stored per browser profile, so use **three separate browser sessions**: normal **Chrome** = admin, a **Chrome Incognito** window = driver, **Edge** (or Firefox) = customer. Logging in as someone else in the same browser would replace the first login.

1. **Admin** (Chrome): sign in at `/admin/login`, open **Live Tracking**. Keep this tab visible.
2. **Driver** (Incognito): open `/drive`, apply (choose vehicle type **RideX Mini** to match the customer step below).
3. **Admin:** **Driver Verification** → **Approve**. On **Live Tracking** the new driver is listed as **Offline · Approved**.
4. **Driver:** log in at `/login` → **Driver dashboard** shows *You are offline* → press **Go Online**, and click **Allow** when the browser asks for location.
   - *No GPS on your PC?* Press **F12** in the driver window → in DevTools press **Ctrl+Shift+P**, type **Sensors**, Enter → under **Location** pick a city or choose *Other…* and enter latitude `13.0100`, longitude `80.2600`. **Keep DevTools open** on that tab while demonstrating — Chrome only applies the override while it is open. This feeds the browser's real Geolocation API; it simulates a device position, it is not fake data inside RideX.
5. **Admin → Live Tracking:** within a few seconds the driver shows **Online**, **Eligible for requests**, "GPS live", and an orange marker appears on the map.
6. **Move the driver:** in the driver window's Sensors panel change the latitude (for example to `13.0300`, longitude `80.2500`). The admin marker moves within about 5–15 seconds.
7. **Customer** (Edge): sign up, **Book Ride** — allow location or type a pickup, pick a destination (for example *Guindy, Chennai*), choose **Mini**, **Confirm Ride**. On the admin page the request appears under **Waiting for a driver** ("Sent to 1 driver").
8. **Driver:** press **Accept**. The admin page now shows the ride under **Active rides**, the driver's row says **On a trip**, and selecting the ride draws pickup, destination, route and the driver's current position. The customer sees the driver and the route too.
9. **Driver:** **I've arrived → Start ride → Complete ride.** The admin status pill follows each step; after completion the ride **leaves Active tracking** (a notice says so), the driver becomes **Eligible** again, and the ride stays in **Ride Management** with its history.
10. **Payment (demo):** the customer pays with **Pay now (demo checkout)** → customer sees green **Payment Successful**, the driver sees green **Payment Received**, admin sees the same on **Payments & Reports**. No real money moves.
11. **Driver:** press **Go Offline.** Admin shows **Offline**, the marker disappears from the map, the driver is no longer eligible.

Extra things worth showing:
- **Denied permission:** block location for the site in the driver's browser → the admin row says *Location permission is denied on the driver's device* and no marker is drawn.
- **Stale location:** stop moving the simulated device; after 90 seconds the marker turns grey and reads *Last known location … — not live*.
- **Driver closes the tab without pressing Go Offline:** after 2 minutes the admin row says *Online, but not reachable* and the driver is no longer sent requests.
- **Network loss:** disconnect the admin PC from the internet — the page keeps the last data and shows a banner with the time of the last successful update.

## 5. How Live Tracking decides what to show

- **Every driver** is listed (filters: All / Online / Eligible / Offline / Not approved, plus search) with: **Online or Offline**, **approval** (Approved / Pending / Rejected / Access revoked), **eligibility**, **last seen**, and **location state**.
- **Eligible for requests** means *all* of: account active · approved · access granted · marked online · the driver app contacted RideX within the last **2 minutes** · not on a trip. Dispatch uses exactly the same rule, and the server refuses `accept` from drivers who are not approved/online.
- **Last seen** comes from the driver dashboard's refresh (about every 5 seconds while it is open), GPS posts, and going online/offline.
- **On the map:** every **online** driver with a stored GPS position — orange when the fix is under 90 seconds old, grey ("last known") when older. Offline drivers and drivers without a position are never drawn. RideX never invents a position.
- **Open rides:** *Active rides* (assigned / arrived / in progress) and *Waiting for a driver*. Selecting a ride shows pickup, destination, route and the driver's position; completed and cancelled rides disappear from tracking but stay in Ride Management.
- **Refresh:** the page polls a small admin-only endpoint (`GET /api/admin?view=live`) every 4 seconds while the tab is visible; the driver and customer pages poll every 4–5 seconds. There are no WebSockets.

## 6. Payments are a demo

There is **no real payment gateway** (no Razorpay or similar) and **no real money moves**. "Online" checkout is a simulation recorded with a `DEMO-` reference and the screens say so. Cash is confirmed by the driver. A payment is shown as successful (green) only when the database says `PAID`; customer, driver and admin screens read the same stored status.

## 7. Configuration reference (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **yes** | PostgreSQL connection string (also used by `npx drizzle-kit push`). |
| `ADMIN_SETUP_CODE` | one of the two admin options | Enables the one-time `/admin/setup` page. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | one of the two admin options | Seeds the first administrator on first start (password 10+ chars). |
| `NOMINATIM_USER_AGENT` | recommended for public use | Contact string for the public address-search service, e.g. `RideX/1.0 (you@example.com)`. |
| `NOMINATIM_BASE_URL`, `OSRM_BASE_URL` | no | Use your own geocoder / router instead of the public demo servers. |

`.env.example` contains placeholders only — no real secrets are included in this archive.

## 8. External services (no accounts or API keys needed)

| Service | Used for | Notes |
|---|---|---|
| **OpenStreetMap tiles** (`tile.openstreetmap.org`) | Map images | Free; their usage policy applies. |
| **Nominatim** (`nominatim.openstreetmap.org`) | Address search and reverse geocoding | Public demo server, rate-limited (about 1 request/second). Set `NOMINATIM_USER_AGENT`. |
| **OSRM** (`router.project-osrm.org`) | Road routes, distance and ETA | Public demo server; can be slow or unavailable. |
| **Google Fonts** | Inter / Poppins / Caveat fonts | Downloaded at build and first `npm run dev`. |

For real traffic, run your own Nominatim/OSRM and point `NOMINATIM_BASE_URL` / `OSRM_BASE_URL` at them. Browsers allow GPS only on `https://` pages and on `http://localhost` — a phone opening `http://<your-PC-ip>:3000` will be refused location access; use HTTPS for that.

## 9. Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server with hot reload (http://localhost:3000). |
| `npm run build` | Production build. |
| `npm start` | Serve the production build. |
| `npm run lint` | ESLint. |
| `npm run typecheck` | TypeScript check. |
| `npx drizzle-kit push` | Create / update the database tables from `src/db/schema.ts`. |

## 10. Project layout

```
src/app/              pages and API routes (App Router)
  api/                auth, rides, driver, admin (+ ?view=live), geo, notifications, fares, account
  admin/              admin pages (dashboard, verification, drivers, rides, live, customers, payments, feedback, …)
  book/ rides/ driver/ drive/ account/ login/ signup/ about/ help/
src/components/       UI: brand, headers/shells, maps, ride + payment cards, admin views, admin-live
src/lib/              business logic (service.ts), auth, geo/routing, GPS hooks, constants
src/db/               Drizzle schema and connection
drizzle.config.ts     reads DATABASE_URL from .env
public/images/        hero image
```

## 11. Troubleshooting (Windows)

- **PowerShell says "running scripts is disabled" when you type `npm`:** use **Command Prompt (cmd)** instead, or run once `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` in PowerShell.
- **`password authentication failed for user "postgres"`:** the password in `.env` is wrong (or needs percent-encoding, see step 5).
- **`ECONNREFUSED 127.0.0.1:5432`:** PostgreSQL is not running — start the *postgresql-x64-…* service (Services app) and check the port.
- **`database "ridex" does not exist`:** create it (step 4) or change the name in `DATABASE_URL`.
- **`DATABASE_URL is not set`:** the file must be called exactly `.env` (not `.env.txt`; in Notepad choose "All files" when saving) and sit next to `package.json`.
- **Port 3000 is in use:** `npm run dev -- -p 3001` and open http://localhost:3001.
- **The map is grey or empty:** the PC cannot reach `tile.openstreetmap.org` (offline, proxy or firewall).
- **No GPS position appears:** allow location for the site (padlock in the address bar). On `localhost` Chrome asks automatically; use the Sensors panel (section 4) if the PC has no location source.
- **Address search finds nothing / "service didn't respond":** the public Nominatim/OSRM servers are rate-limited — wait a moment and retry.

## 12. Known limitations

- Updates use polling (about 4–15 s end to end), not WebSockets.
- The public Nominatim and OSRM servers are demo services and can rate-limit or fail.
- "Online" is the driver's own switch plus a 2-minute contact check; a driver whose app is closed stays *marked* online (shown as "not reachable") until they or an admin set them offline.
- Admin sees a driver's *device-reported* GPS state (denied / unavailable / sharing); it cannot see inside the phone.
- There is no "forgot password" flow, and an admin cannot reset another person's password from the UI.
- A request nobody accepts stays open until someone accepts it or the customer cancels it.
- Tested with Chromium and with simulated GPS positions; real-phone GPS, Safari/Firefox and a native Windows installation have not been tested by the author.
- Online payment is a demo (section 6).

## 13. Moving existing data (optional)

This archive contains code only, never database content. To carry data from another RideX database:

```
pg_dump "OLD_DATABASE_URL" > ridex-backup.sql
psql "NEW_DATABASE_URL" < ridex-backup.sql
```

Run the second command after step 6 on an empty database. The dump contains personal data and password hashes — keep it private.
