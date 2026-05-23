# SkillAuro Attendance Management System

A full-stack attendance tracker with a **React + Vite** frontend, a **Node + Express + SQLite** backend, and **Excel report exports**.

## ✨ Features

- 🔐 **Two login modes**: Admin and Employee (ID + PIN)
- 👥 **Admin manages employees** — create/delete with custom Employee ID and 4-digit PIN
- ⏱ **Clock In / Clock Out** with auto-detection of late arrivals (after 9:15 AM)
- 📊 **Live dashboard** with stats, weekly chart, recent activity, department overview
- 📅 **Per-employee history** — last 30 days, with totals
- 📁 **Excel reports** — single day or date range, with Detail / Summary / Info sheets
- 💾 **SQLite database** — all data persists across server restarts (stored in `server/data/attendance.db`)
- 🔄 **Auto-refresh** every 15 s in the admin view

## 🛠 Tech Stack

| Layer    | Tech                                      |
|----------|-------------------------------------------|
| Frontend | React 19, Vite, Lucide Icons, Recharts    |
| Backend  | Node.js, Express, better-sqlite3, xlsx    |
| Database | SQLite (single file, no setup needed)     |

---

## 🚀 Running in VS Code (step-by-step)

### 1. Open the project
- `File` → `Open Folder…` → select the project folder
- Open the integrated terminal: `` Ctrl + ` ``

### 2. Install dependencies (only the first time)
```bash
npm install
```

### 3. Start the app (frontend + backend together)
```bash
npm start
```

This runs both servers in parallel:
- **SERVER** (blue) → Express API at `http://localhost:4000`
- **CLIENT** (green) → Vite dev server at `http://localhost:5173`

### 4. Open the app
Open **http://localhost:5173/** in your browser. The frontend automatically proxies `/api/*` requests to the backend, so you only need that one URL.

### 5. First time use
1. Click **Admin Login**
2. Default credentials: `admin` / `admin123`
3. Go to **Manage Employees** → **Add Employee**
4. Create an employee with a custom ID (e.g. `EMP001`) and 4-digit PIN
5. Share that ID + PIN with the employee
6. They sign in via **Employee Login** and can clock in/out
7. Go to **Reports (Excel)** to download daily or range reports

---

## 📂 Project structure

```
.
├── server/
│   ├── server.js                # Express API + SQLite + Excel export
│   └── data/
│       └── attendance.db        # SQLite database (auto-created on first run)
├── src/
│   ├── App.jsx                  # Main React app (login, portals, admin)
│   ├── api.js                   # Fetch wrapper for the backend
│   ├── main.tsx                 # React entry point
│   └── index.css                # Tailwind styles
├── package.json
└── vite.config.ts               # Vite proxy /api → :4000
```

---

## 📜 Useful scripts

| Script               | What it does                                          |
|----------------------|--------------------------------------------------------|
| `npm start`          | Start backend (nodemon) **and** frontend together     |
| `npm run dev`        | Start only the frontend (Vite)                        |
| `npm run server`     | Start only the backend with auto-reload (nodemon)     |
| `npm run start:server` | Start only the backend (plain node, no reload)      |
| `npm run build`      | Build production bundle into `dist/`                  |

---

## 🗄 Where is the data stored?

Everything is in **`server/data/attendance.db`** — a single SQLite file.

- **Restarting the server preserves all data.** ✅
- To **back up** your data, copy the `.db` file somewhere safe.
- To **reset everything**, delete the file and restart the server (a fresh empty database is auto-created).

### Database schema
```sql
employees   (id, name, dept, role, initials, clr, pin, createdAt)
attendance  (id, employeeId, date, clockIn, clockOut, status)
```

---

## 📊 Excel report contents

Every downloaded `.xlsx` file has **three sheets**:

1. **Daily Records** — every employee × every day in the range, with clock in/out, duration, status
2. **Summary** — per-employee totals: present days, late days, absent days, total hours worked, attendance %
3. **Report Info** — metadata: generated at, date range, total employees

### API endpoints (for reference)

| Method | Endpoint                                | Purpose                         |
|--------|------------------------------------------|---------------------------------|
| POST   | `/api/auth/admin`                       | Admin login                      |
| POST   | `/api/auth/employee`                    | Employee login                   |
| GET    | `/api/employees`                        | List all employees               |
| POST   | `/api/employees`                        | Create employee                  |
| DELETE | `/api/employees/:id`                    | Delete employee                  |
| GET    | `/api/attendance/today`                 | Today's attendance map           |
| POST   | `/api/attendance/clock`                 | Clock in/out (auto-detected)     |
| GET    | `/api/attendance/employee/:id?days=30`  | Personal history                 |
| GET    | `/api/attendance/weekly`                | Last 7 days aggregate            |
| GET    | `/api/reports/excel?date=YYYY-MM-DD`    | Daily Excel report               |
| GET    | `/api/reports/excel?from=...&to=...`    | Date-range Excel report          |

---

## 🔧 Troubleshooting

**"Backend Server Not Running" screen appears**
→ Make sure you ran `npm start` (not just `npm run dev`). The Express server must be running on port 4000.

**`better-sqlite3` install errors on Windows**
→ You need Python and build tools. Run `npm install --global windows-build-tools` (older Node) or install **Visual Studio Build Tools** with the "Desktop development with C++" workload, then `npm install` again.

**Port already in use**
→ Change the port in `server/server.js` (`const PORT = ...`) and in `vite.config.ts` (`target: "http://localhost:4000"`).

**Reset all data**
→ Stop the server, delete `server/data/attendance.db`, restart.

---

## 🔐 Changing admin credentials

Edit these two lines at the top of `server/server.js`:
```js
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";
```

