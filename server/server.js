// SkillAuro Attendance Backend
// Express + better-sqlite3 + xlsx (Excel export)

import express from "express";
import cors from "cors";
import Database from "better-sqlite3";
import * as XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ─── DATABASE SETUP ────────────────────────────────────────────────
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "attendance.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    dept      TEXT NOT NULL,
    role      TEXT NOT NULL,
    initials  TEXT NOT NULL,
    clr       TEXT NOT NULL,
    pin       TEXT NOT NULL,
    createdAt TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    employeeId TEXT NOT NULL,
    date       TEXT NOT NULL,          -- YYYY-MM-DD
    clockIn    TEXT,                   -- HH:MM:SS
    clockOut   TEXT,                   -- HH:MM:SS
    status     TEXT NOT NULL,          -- 'present' | 'late' | 'absent' | 'left'
    UNIQUE(employeeId, date),
    FOREIGN KEY (employeeId) REFERENCES employees(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_attendance_emp  ON attendance(employeeId);
`);

console.log("✅ Database initialized:", path.join(DATA_DIR, "attendance.db"));

// ─── HELPERS ──────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().slice(0, 10);

const calcDuration = (cin, cout) => {
  if (!cin || !cout) return null;
  const s = (t) => { const [h, m, ss] = t.split(":").map(Number); return h * 3600 + m * 60 + (ss || 0); };
  const d = s(cout) - s(cin);
  if (d < 0) return null;
  return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`;
};

// ─── EXPRESS SETUP ─────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json());

// Simple request logger
app.use((req, _res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.url}`);
  next();
});

// ─── AUTH ─────────────────────────────────────────────────────────
// Admin credentials (you can change these or move to .env later)
const ADMIN_USER = "admin";
const ADMIN_PASS = "admin123";

app.post("/api/auth/admin", (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    return res.json({ ok: true, role: "admin" });
  }
  res.status(401).json({ ok: false, error: "Invalid admin credentials." });
});

app.post("/api/auth/employee", (req, res) => {
  const { employeeId, pin } = req.body || {};
  if (!employeeId || !pin) {
    return res.status(400).json({ ok: false, error: "Employee ID and PIN required." });
  }
  const emp = db.prepare("SELECT * FROM employees WHERE LOWER(id) = LOWER(?)").get(employeeId);
  if (!emp) return res.status(404).json({ ok: false, error: "Employee ID not found." });
  if (emp.pin !== pin) return res.status(401).json({ ok: false, error: "Incorrect PIN." });
  // Don't send PIN back to the client
  const { pin: _, ...safe } = emp;
  res.json({ ok: true, role: "employee", emp: safe });
});

// ─── EMPLOYEE CRUD ────────────────────────────────────────────────
app.get("/api/employees", (_req, res) => {
  const rows = db.prepare("SELECT id, name, dept, role, initials, clr, pin, createdAt FROM employees ORDER BY createdAt ASC").all();
  res.json(rows);
});

app.post("/api/employees", (req, res) => {
  const { id, name, dept, role, initials, clr, pin } = req.body || {};
  if (!id || !name || !dept || !role || !pin) {
    return res.status(400).json({ ok: false, error: "Missing required fields." });
  }
  if (!/^\d{4}$/.test(pin)) {
    return res.status(400).json({ ok: false, error: "PIN must be 4 digits." });
  }

  const existing = db.prepare("SELECT id FROM employees WHERE LOWER(id) = LOWER(?)").get(id);
  if (existing) return res.status(409).json({ ok: false, error: "Employee ID already exists." });

  try {
    db.prepare(`
      INSERT INTO employees (id, name, dept, role, initials, clr, pin)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, name, dept, role, initials, clr, pin);
    res.json({ ok: true, employee: { id, name, dept, role, initials, clr, pin } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.delete("/api/employees/:id", (req, res) => {
  const { id } = req.params;
  const info = db.prepare("DELETE FROM employees WHERE id = ?").run(id);
  if (info.changes === 0) return res.status(404).json({ ok: false, error: "Employee not found." });
  res.json({ ok: true });
});

// ─── ATTENDANCE ────────────────────────────────────────────────────
// Today's attendance map { employeeId: { clockIn, clockOut, status } }
app.get("/api/attendance/today", (_req, res) => {
  const date = todayStr();
  const rows = db.prepare("SELECT employeeId, clockIn, clockOut, status FROM attendance WHERE date = ?").all(date);
  const map = {};
  for (const r of rows) {
    map[r.employeeId] = { clockIn: r.clockIn, clockOut: r.clockOut, status: r.status };
  }
  res.json({ date, records: map });
});

// Clock in / out — toggles intelligently
app.post("/api/attendance/clock", (req, res) => {
  const { employeeId } = req.body || {};
  if (!employeeId) return res.status(400).json({ ok: false, error: "employeeId required." });

  const emp = db.prepare("SELECT id FROM employees WHERE id = ?").get(employeeId);
  if (!emp) return res.status(404).json({ ok: false, error: "Employee not found." });

  const date = todayStr();
  const now = new Date().toTimeString().slice(0, 8); // HH:MM:SS

  const existing = db.prepare("SELECT * FROM attendance WHERE employeeId = ? AND date = ?").get(employeeId, date);

  if (!existing) {
    // First clock-in of the day
    const status = now <= "09:15:00" ? "present" : "late";
    db.prepare(`
      INSERT INTO attendance (employeeId, date, clockIn, clockOut, status)
      VALUES (?, ?, ?, NULL, ?)
    `).run(employeeId, date, now, status);
    return res.json({ ok: true, action: "in", time: now, status });
  }
  if (existing.clockIn && !existing.clockOut) {
    // Clock out
    db.prepare("UPDATE attendance SET clockOut = ? WHERE id = ?").run(now, existing.id);
    return res.json({ ok: true, action: "out", time: now, status: existing.status });
  }
  // Already clocked out
  res.status(409).json({ ok: false, error: "Already clocked out for today." });
});

// History for a specific employee (last N days)
app.get("/api/attendance/employee/:id", (req, res) => {
  const { id } = req.params;
  const days = Math.min(parseInt(req.query.days) || 30, 365);
  const rows = db.prepare(`
    SELECT date, clockIn, clockOut, status
    FROM attendance
    WHERE employeeId = ?
    ORDER BY date DESC
    LIMIT ?
  `).all(id, days);
  res.json(rows);
});

// Weekly aggregate (last 7 days) for dashboard chart
app.get("/api/attendance/weekly", (_req, res) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  const totalEmps = db.prepare("SELECT COUNT(*) as c FROM employees").get().c;
  const result = days.map(date => {
    const present = db.prepare(`
      SELECT COUNT(*) as c FROM attendance
      WHERE date = ? AND clockIn IS NOT NULL
    `).get(date).c;
    return {
      date,
      day: new Date(date).toLocaleDateString("en-US", { weekday: "short" }),
      present,
      absent: Math.max(0, totalEmps - present),
    };
  });
  res.json(result);
});

// ─── EXCEL EXPORT ─────────────────────────────────────────────────
// /api/reports/excel?date=YYYY-MM-DD     → single day
// /api/reports/excel?from=YYYY-MM-DD&to=YYYY-MM-DD → date range
// /api/reports/excel                     → today
app.get("/api/reports/excel", (req, res) => {
  try {
    const { date, from, to } = req.query;

    let fromDate, toDate;
    if (date) {
      fromDate = toDate = date;
    } else if (from && to) {
      fromDate = from; toDate = to;
    } else {
      fromDate = toDate = todayStr();
    }

    const employees = db.prepare("SELECT * FROM employees ORDER BY id ASC").all();

    // Build list of dates in range
    const dateList = [];
    const start = new Date(fromDate);
    const end = new Date(toDate);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dateList.push(d.toISOString().slice(0, 10));
    }

    // Get attendance records in the range
    const recRows = db.prepare(`
      SELECT * FROM attendance WHERE date BETWEEN ? AND ?
    `).all(fromDate, toDate);
    const recIndex = {};
    for (const r of recRows) {
      recIndex[`${r.employeeId}|${r.date}`] = r;
    }

    // Build rows for the spreadsheet
    const rows = [];
    for (const d of dateList) {
      for (const emp of employees) {
        const r = recIndex[`${emp.id}|${d}`];
        rows.push({
          "Date": d,
          "Employee ID": emp.id,
          "Name": emp.name,
          "Department": emp.dept,
          "Role": emp.role,
          "Clock In": r?.clockIn || "—",
          "Clock Out": r?.clockOut || "—",
          "Duration": calcDuration(r?.clockIn, r?.clockOut) || "—",
          "Status": r ? (r.clockOut ? "Clocked Out" : r.status.charAt(0).toUpperCase() + r.status.slice(1)) : "Absent",
        });
      }
    }

    // ── Build summary sheet ──
    const summary = employees.map(emp => {
      const empRecs = recRows.filter(r => r.employeeId === emp.id);
      const presentDays = empRecs.filter(r => r.status === "present").length;
      const lateDays = empRecs.filter(r => r.status === "late").length;
      const totalDays = dateList.length;
      const absentDays = totalDays - empRecs.filter(r => r.clockIn).length;

      let totalSec = 0;
      for (const r of empRecs) {
        if (r.clockIn && r.clockOut) {
          const s = (t) => { const [h, m, ss] = t.split(":").map(Number); return h * 3600 + m * 60 + (ss || 0); };
          totalSec += Math.max(0, s(r.clockOut) - s(r.clockIn));
        }
      }
      const totalHours = `${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m`;

      return {
        "Employee ID": emp.id,
        "Name": emp.name,
        "Department": emp.dept,
        "Role": emp.role,
        "Present Days": presentDays,
        "Late Days": lateDays,
        "Absent Days": absentDays,
        "Total Days in Range": totalDays,
        "Total Hours Worked": totalHours,
        "Attendance %": totalDays > 0 ? Math.round(((presentDays + lateDays) / totalDays) * 100) + "%" : "0%",
      };
    });

    // ── Create workbook ──
    const wb = XLSX.utils.book_new();

    // Detail sheet
    const wsDetail = XLSX.utils.json_to_sheet(rows);
    wsDetail["!cols"] = [
      { wch: 12 }, { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 20 },
      { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsDetail, "Daily Records");

    // Summary sheet
    const wsSummary = XLSX.utils.json_to_sheet(summary);
    wsSummary["!cols"] = [
      { wch: 12 }, { wch: 22 }, { wch: 14 }, { wch: 20 },
      { wch: 13 }, { wch: 11 }, { wch: 13 }, { wch: 19 }, { wch: 19 }, { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsSummary, "Summary");

    // Header info sheet
    const info = [
      { Field: "Report Generated", Value: new Date().toLocaleString("en-IN") },
      { Field: "Company", Value: "SkillAuro Technologies" },
      { Field: "Report Type", Value: fromDate === toDate ? "Daily Report" : "Range Report" },
      { Field: "From", Value: fromDate },
      { Field: "To", Value: toDate },
      { Field: "Total Employees", Value: employees.length },
      { Field: "Total Days Covered", Value: dateList.length },
    ];
    const wsInfo = XLSX.utils.json_to_sheet(info);
    wsInfo["!cols"] = [{ wch: 22 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsInfo, "Report Info");

    // Send as download
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const filename = fromDate === toDate
      ? `attendance-${fromDate}.xlsx`
      : `attendance-${fromDate}_to_${toDate}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error("Excel export error:", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── HEALTH ────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ─── START ────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\n🚀 SkillAuro API running at http://localhost:${PORT}`);
  console.log(`   Database file: ${path.join(DATA_DIR, "attendance.db")}\n`);
});
