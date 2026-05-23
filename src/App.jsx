import { useState, useEffect, useCallback } from "react";
import {
  LayoutDashboard, Clock, Users, ClipboardList,
  UserCheck, UserX, AlertCircle, LogIn, LogOut,
  Search, Shield, Eye, EyeOff, CheckCircle,
  Timer, ArrowLeft, Lock, UserPlus, Trash2, X,
  FileSpreadsheet, Download, Calendar, Loader2, RefreshCw
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "./api.js";

/* ─────────── CONSTANTS ─────────── */
const DEPT_OPTIONS = ["Engineering", "Design", "HR", "Sales", "Marketing", "Finance", "Operations", "Support"];

const DEPT_STYLE = {
  Engineering: { bar: "#3B82F6" }, Design: { bar: "#8B5CF6" }, HR: { bar: "#EC4899" },
  Sales: { bar: "#F59E0B" }, Marketing: { bar: "#10B981" }, Finance: { bar: "#14B8A6" },
  Operations: { bar: "#6366F1" }, Support: { bar: "#0EA5E9" },
};

const AVATAR_COLORS = [
  "#3B82F6", "#8B5CF6", "#06B6D4", "#EC4899", "#F59E0B", "#10B981",
  "#6366F1", "#14B8A6", "#F97316", "#A855F7", "#0EA5E9", "#F43F5E",
];

/* ─────────── HELPERS ─────────── */
function makeInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function pickColor(seed) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function calcDuration(cin, cout) {
  if (!cin || !cout) return null;
  const s = (t) => { const [h, m, ss] = t.split(":").map(Number); return h * 3600 + m * 60 + (ss || 0); };
  const d = s(cout) - s(cin);
  if (d < 0) return "--";
  return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m`;
}

function calcLiveHours(cin, now) {
  if (!cin) return null;
  const [h, m, ss] = cin.split(":").map(Number);
  const start = new Date(); start.setHours(h, m, ss || 0, 0);
  const diff = Math.max(0, Math.floor((now.getTime() - start.getTime()) / 1000));
  return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m ${diff % 60}s`;
}

/* ─────────── UI ATOMS ─────────── */
function StatusBadge({ status }) {
  const MAP = {
    present: { bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0", label: "Present" },
    late:    { bg: "#FFFBEB", color: "#B45309", border: "#FDE68A", label: "Late" },
    absent:  { bg: "#FEF2F2", color: "#B91C1C", border: "#FECACA", label: "Absent" },
    left:    { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE", label: "Clocked Out" },
  };
  const s = MAP[status] || { bg: "#F8FAFC", color: "#64748B", border: "#E2E8F0", label: status };
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 99, fontSize: 11, fontWeight: 600, padding: "3px 10px"
    }}>{s.label}</span>
  );
}

function PinDots({ filled, total = 4 }) {
  return (
    <div style={{ display: "flex", gap: 10, justifyContent: "center", margin: "8px 0" }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          width: 14, height: 14, borderRadius: "50%", border: "2px solid #CBD5E1",
          background: i < filled ? "#1D4ED8" : "transparent",
          transition: "background 0.15s"
        }} />
      ))}
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "10px 13px", border: "1px solid #E2E8F0", borderRadius: 9,
  fontSize: 13, color: "#1E293B", background: "#F8FAFC", outline: "none", boxSizing: "border-box"
};

function Field({ label, hint, children }) {
  return (
    <div>
      <label style={{
        display: "block", fontSize: 11, color: "#64748B", fontWeight: 600,
        textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6
      }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Spinner({ size = 16, color = "#3B82F6" }) {
  return <Loader2 size={size} style={{ color, animation: "spin 0.9s linear infinite" }} />;
}

/* ═══════════════════════════════════════════
   LOGIN SCREEN
═══════════════════════════════════════════ */
function LoginScreen({ onEmpLogin, onAdminLogin }) {
  const [mode, setMode] = useState("choose");
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [adminUser, setAdminUser] = useState("");
  const [adminPass, setAdminPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);
  const [busy, setBusy] = useState(false);

  const triggerError = (msg) => {
    setError(msg); setShake(true);
    setTimeout(() => setShake(false), 500);
    setTimeout(() => setError(""), 3500);
  };

  const handlePinKey = (digit) => {
    setPin(p => p.length >= 4 ? p : p + digit);
  };
  const handlePinBack = () => setPin(p => p.slice(0, -1));

  useEffect(() => {
    if (pin.length === 4) {
      const trimmedId = empId.trim();
      if (!trimmedId) {
        triggerError("Please enter your Employee ID first.");
        setPin("");
        return;
      }
      (async () => {
        setBusy(true);
        try {
          const res = await api.loginEmployee(trimmedId, pin);
          setTimeout(() => onEmpLogin(res.emp), 200);
        } catch (err) {
          triggerError(err.message || "Login failed.");
          setPin("");
        } finally {
          setBusy(false);
        }
      })();
    }
  }, [pin]); // eslint-disable-line

  const handleAdminLogin = async () => {
    setBusy(true);
    try {
      await api.loginAdmin(adminUser.trim(), adminPass);
      onAdminLogin();
    } catch (err) {
      triggerError(err.message || "Invalid admin credentials.");
      setAdminPass("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0F172A", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif"
    }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ textAlign: "center", marginBottom: 40 }}>
        <div style={{
          width: 56, height: 56, background: "linear-gradient(135deg,#3B82F6,#1D4ED8)",
          borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 20, fontWeight: 800, color: "#fff", margin: "0 auto 16px"
        }}>SA</div>
        <div style={{ color: "#F1F5F9", fontSize: 22, fontWeight: 700 }}>SkillAuro Technologies</div>
        <div style={{ color: "#64748B", fontSize: 13, marginTop: 4 }}>Attendance Management System</div>
      </div>

      <div style={{
        background: "#1E293B", borderRadius: 20, padding: 36, width: "100%", maxWidth: 400,
        border: "1px solid #334155",
        transform: shake ? "translateX(-6px)" : "none",
        transition: shake ? "transform 0.05s" : "transform 0.15s"
      }}>
        {mode === "choose" && (
          <>
            <h2 style={{ color: "#F1F5F9", fontSize: 18, fontWeight: 600, textAlign: "center", margin: "0 0 8px" }}>Welcome Back</h2>
            <p style={{ color: "#64748B", fontSize: 13, textAlign: "center", margin: "0 0 28px" }}>How would you like to sign in?</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <button onClick={() => { setMode("employee"); setError(""); }} style={{
                padding: "16px 20px", borderRadius: 12, border: "1px solid #334155",
                background: "#0F172A", color: "#F1F5F9", cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 14, transition: "border-color 0.15s"
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#3B82F6"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#334155"}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1D4ED820", border: "1px solid #3B82F640", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <UserCheck size={18} style={{ color: "#3B82F6" }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Employee Login</div>
                  <div style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>Clock in/out with your ID & PIN</div>
                </div>
              </button>
              <button onClick={() => { setMode("admin"); setError(""); }} style={{
                padding: "16px 20px", borderRadius: 12, border: "1px solid #334155",
                background: "#0F172A", color: "#F1F5F9", cursor: "pointer", textAlign: "left",
                display: "flex", alignItems: "center", gap: 14, transition: "border-color 0.15s"
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = "#8B5CF6"}
                onMouseLeave={e => e.currentTarget.style.borderColor = "#334155"}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: "#7C3AED20", border: "1px solid #8B5CF640", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Shield size={18} style={{ color: "#8B5CF6" }} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>Admin Login</div>
                  <div style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>Manage employees & reports</div>
                </div>
              </button>
            </div>
          </>
        )}

        {mode === "employee" && (
          <>
            <button onClick={() => { setMode("choose"); setPin(""); setEmpId(""); setError(""); }}
              style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 20, padding: 0 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <h2 style={{ color: "#F1F5F9", fontSize: 17, fontWeight: 600, margin: "0 0 20px" }}>Employee Sign In</h2>

            <label style={{ display: "block", fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Employee ID</label>
            <input type="text" value={empId}
              onChange={e => { setEmpId(e.target.value); setPin(""); setError(""); }}
              placeholder="e.g. EMP001" autoComplete="off"
              style={{
                width: "100%", padding: "11px 14px", background: "#0F172A", border: "1px solid #334155",
                borderRadius: 10, color: "#F1F5F9", fontSize: 14, outline: "none", marginBottom: 24,
                boxSizing: "border-box", letterSpacing: "0.05em", fontFamily: "monospace"
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#0F172A", borderRadius: 10, padding: "10px 14px", marginBottom: 20, border: "1px solid #334155" }}>
              <Lock size={14} style={{ color: "#64748B" }} />
              <div style={{ color: "#94A3B8", fontSize: 12 }}>Your PIN is private — issued by the admin.</div>
            </div>

            <div style={{ textAlign: "center", marginBottom: 6 }}>
              <div style={{ color: "#94A3B8", fontSize: 12, marginBottom: 10 }}>
                {busy ? "Verifying..." : "Enter your 4-digit PIN"}
              </div>
              <PinDots filled={pin.length} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 20, opacity: busy ? 0.5 : 1, pointerEvents: busy ? "none" : "auto" }}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, "", 0, "⌫"].map((k, i) => (
                <button key={i} onClick={() => {
                  if (k === "⌫") handlePinBack();
                  else if (k !== "") handlePinKey(String(k));
                }} style={{
                  padding: "15px", borderRadius: 10, border: "1px solid #334155",
                  background: k === "" ? "transparent" : "#0F172A",
                  color: "#F1F5F9", fontSize: 18, fontWeight: 600,
                  cursor: k === "" ? "default" : "pointer",
                  transition: "background 0.1s", outline: "none"
                }}
                  onMouseEnter={e => { if (k !== "") e.currentTarget.style.background = "#1E3A5F"; }}
                  onMouseLeave={e => { if (k !== "") e.currentTarget.style.background = "#0F172A"; }}
                >{k}</button>
              ))}
            </div>
          </>
        )}

        {mode === "admin" && (
          <>
            <button onClick={() => { setMode("choose"); setAdminUser(""); setAdminPass(""); setError(""); }}
              style={{ background: "none", border: "none", color: "#64748B", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 13, marginBottom: 20, padding: 0 }}>
              <ArrowLeft size={14} /> Back
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: "#7C3AED20", border: "1px solid #8B5CF640", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Shield size={16} style={{ color: "#8B5CF6" }} />
              </div>
              <div>
                <h2 style={{ color: "#F1F5F9", fontSize: 16, fontWeight: 600, margin: 0 }}>Admin Access</h2>
                <div style={{ color: "#64748B", fontSize: 12 }}>Full system credentials</div>
              </div>
            </div>

            <label style={{ display: "block", fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Username</label>
            <input type="text" value={adminUser} onChange={e => setAdminUser(e.target.value)}
              placeholder="admin" autoComplete="off"
              style={{ width: "100%", padding: "11px 14px", background: "#0F172A", border: "1px solid #334155", borderRadius: 10, color: "#F1F5F9", fontSize: 14, outline: "none", marginBottom: 16, boxSizing: "border-box" }} />

            <label style={{ display: "block", fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Password</label>
            <div style={{ position: "relative", marginBottom: 24 }}>
              <input type={showPass ? "text" : "password"} value={adminPass}
                onChange={e => setAdminPass(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAdminLogin()}
                placeholder="••••••••"
                style={{ width: "100%", padding: "11px 42px 11px 14px", background: "#0F172A", border: "1px solid #334155", borderRadius: 10, color: "#F1F5F9", fontSize: 14, outline: "none", boxSizing: "border-box" }} />
              <button onClick={() => setShowPass(v => !v)} style={{
                position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
                background: "none", border: "none", color: "#475569", cursor: "pointer", padding: 0
              }}>
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            <button onClick={handleAdminLogin} disabled={busy} style={{
              width: "100%", padding: "13px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#7C3AED,#5B21B6)",
              color: "#fff", fontWeight: 700, fontSize: 15, cursor: busy ? "wait" : "pointer",
              opacity: busy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8
            }}>
              {busy && <Spinner size={14} color="#fff" />} Sign In as Admin
            </button>
          </>
        )}

        {error && (
          <div style={{
            marginTop: 16, background: "#FEF2F2", border: "1px solid #FECACA",
            borderRadius: 8, padding: "10px 14px", color: "#B91C1C", fontSize: 12,
            fontWeight: 500, textAlign: "center"
          }}>{error}</div>
        )}
      </div>

      <div style={{ marginTop: 18, fontSize: 11, color: "#475569", textAlign: "center", maxWidth: 400 }}>
        Don't have credentials? Contact your administrator to be added to the system.
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   EMPLOYEE PERSONAL PORTAL
═══════════════════════════════════════════ */
function EmployeePortal({ emp, onLogout }) {
  const [now, setNow] = useState(new Date());
  const [rec, setRec] = useState(null);
  const [clockMsg, setClockMsg] = useState(null);
  const [history, setHistory] = useState([]);
  const [tab, setTab] = useState("home");
  const [busy, setBusy] = useState(false);

  const loadToday = useCallback(async () => {
    try {
      const data = await api.getTodayAttendance();
      setRec(data.records[emp.id] || null);
    } catch (e) { console.error(e); }
  }, [emp.id]);

  const loadHistory = useCallback(async () => {
    try {
      const h = await api.employeeHistory(emp.id, 30);
      setHistory(h);
    } catch (e) { console.error(e); }
  }, [emp.id]);

  useEffect(() => {
    loadToday();
    loadHistory();
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, [loadToday, loadHistory]);

  const isIn = !!(rec?.clockIn && !rec?.clockOut);
  const isDone = !!(rec?.clockIn && rec?.clockOut);
  const status = !rec ? "absent" : isDone ? "left" : rec.status;

  const handleClock = async () => {
    setBusy(true);
    try {
      const res = await api.clock(emp.id);
      setClockMsg({ type: res.action, ts: res.time });
      await loadToday();
      await loadHistory();
      setTimeout(() => setClockMsg(null), 4000);
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const ds = DEPT_STYLE[emp.dept] || { bar: "#6366F1" };

  // Weekly summary from history (last 7 days)
  const last7 = history.slice(0, 7);
  const summary = {
    present: last7.filter(h => h.status === "present").length,
    late: last7.filter(h => h.status === "late").length,
    absent: 0, // we only have records when clocked in; absence not tracked yet
    hours: (() => {
      let totalSec = 0;
      for (const r of last7) {
        if (r.clockIn && r.clockOut) {
          const s = (t) => { const [h, m, ss] = t.split(":").map(Number); return h * 3600 + m * 60 + (ss || 0); };
          totalSec += Math.max(0, s(r.clockOut) - s(r.clockIn));
        }
      }
      return Math.floor(totalSec / 3600) + "h";
    })(),
  };

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", fontFamily: "'Inter',system-ui,sans-serif" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <header style={{ background: "#0F172A", padding: "0 28px", height: 64, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", fontSize: 12 }}>SA</div>
          <div>
            <div style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 14 }}>SkillAuro Technologies</div>
            <div style={{ color: "#475569", fontSize: 11 }}>Employee Attendance Portal</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#F1F5F9" }}>{timeStr}</div>
            <div style={{ fontSize: 11, color: "#475569" }}>{now.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
          </div>
          <button onClick={onLogout} style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 16px", background: "#1E293B", border: "1px solid #334155", borderRadius: 9, color: "#94A3B8", fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            <LogOut size={14} /> Logout
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 24px" }}>
        <div style={{ background: "#0F172A", borderRadius: 20, padding: "28px 32px", marginBottom: 24, display: "flex", alignItems: "center", justifyContent: "space-between", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", right: -20, top: -20, width: 140, height: 140, background: ds.bar + "15", borderRadius: "50%" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: emp.clr, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 20, flexShrink: 0, border: "3px solid " + emp.clr + "60" }}>{emp.initials}</div>
            <div>
              <div style={{ color: "#F1F5F9", fontSize: 20, fontWeight: 700 }}>Hello, {emp.name.split(" ")[0]}! 👋</div>
              <div style={{ color: "#64748B", fontSize: 13, marginTop: 4 }}>{emp.role} · {emp.dept}</div>
              <div style={{ color: "#475569", fontSize: 11, marginTop: 4, fontFamily: "monospace" }}>ID: {emp.id}</div>
              <div style={{ color: "#475569", fontSize: 12, marginTop: 6 }}>{dateStr}</div>
            </div>
          </div>
          <StatusBadge status={status} />
        </div>

        <div style={{ display: "flex", gap: 4, background: "#E2E8F0", borderRadius: 10, padding: 4, marginBottom: 24 }}>
          {[{ id: "home", label: "Today" }, { id: "history", label: "My History" }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "9px", borderRadius: 7, border: "none", cursor: "pointer",
              fontWeight: 600, fontSize: 13, transition: "all 0.15s",
              background: tab === t.id ? "#fff" : "transparent",
              color: tab === t.id ? "#0F172A" : "#64748B",
              boxShadow: tab === t.id ? "0 1px 4px #0002" : "none"
            }}>{t.label}</button>
          ))}
        </div>

        {tab === "home" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 18, padding: "32px", textAlign: "center" }}>
              <div style={{ fontFamily: "'IBM Plex Mono','Courier New',monospace", fontSize: 54, fontWeight: 700, color: "#0F172A", letterSpacing: "-0.02em", lineHeight: 1 }}>{timeStr}</div>
              {isIn && (
                <div style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 8, background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 99, padding: "6px 16px" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#10B981" }} />
                  <span style={{ color: "#15803D", fontSize: 12, fontWeight: 600 }}>Live: {calcLiveHours(rec.clockIn, now)}</span>
                </div>
              )}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
              {[
                { label: "Clock In", val: rec?.clockIn ? rec.clockIn.slice(0, 5) : "--:--", icon: <LogIn size={16} />, clr: "#10B981" },
                { label: "Clock Out", val: rec?.clockOut ? rec.clockOut.slice(0, 5) : "--:--", icon: <LogOut size={16} />, clr: "#3B82F6" },
                { label: "Duration", val: calcDuration(rec?.clockIn, rec?.clockOut) || (isIn ? "Live ⏱" : "--"), icon: <Timer size={16} />, clr: "#8B5CF6" },
              ].map(({ label, val, icon, clr }) => (
                <div key={label} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "18px 16px", textAlign: "center" }}>
                  <div style={{ color: clr, marginBottom: 8, display: "flex", justifyContent: "center" }}>{icon}</div>
                  <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 20, color: "#0F172A" }}>{val}</div>
                  <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 6, fontWeight: 500 }}>{label}</div>
                </div>
              ))}
            </div>

            {!isDone ? (
              <button onClick={handleClock} disabled={busy} style={{
                width: "100%", padding: "20px", borderRadius: 16, border: "none", cursor: busy ? "wait" : "pointer",
                fontWeight: 700, fontSize: 16, color: "#fff", letterSpacing: "0.01em",
                background: isIn ? "linear-gradient(135deg,#3B82F6,#1D4ED8)" : "linear-gradient(135deg,#10B981,#059669)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                opacity: busy ? 0.7 : 1
              }}>
                {busy ? <Spinner size={20} color="#fff" /> : isIn ? <><LogOut size={20} /> Clock Out Now</> : <><LogIn size={20} /> Clock In Now</>}
              </button>
            ) : (
              <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 16, padding: 20, textAlign: "center" }}>
                <CheckCircle size={28} style={{ color: "#10B981", margin: "0 auto 10px" }} />
                <div style={{ color: "#15803D", fontWeight: 600, fontSize: 15 }}>Session Complete!</div>
                <div style={{ color: "#16A34A", fontSize: 13, marginTop: 4 }}>You worked {calcDuration(rec.clockIn, rec.clockOut)} today. Have a great evening!</div>
              </div>
            )}

            {clockMsg && (
              <div style={{
                background: clockMsg.type === "in" ? "#F0FDF4" : "#EFF6FF",
                border: `1px solid ${clockMsg.type === "in" ? "#BBF7D0" : "#BFDBFE"}`,
                borderRadius: 12, padding: "14px 18px", textAlign: "center",
                color: clockMsg.type === "in" ? "#15803D" : "#1D4ED8", fontSize: 14, fontWeight: 600
              }}>
                {clockMsg.type === "in"
                  ? `✅ Clocked in successfully at ${clockMsg.ts.slice(0, 5)}`
                  : `👋 Clocked out successfully at ${clockMsg.ts.slice(0, 5)}`}
              </div>
            )}

            <div style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 14, padding: "16px 20px" }}>
              <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Today's Shift Info</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
                {[
                  { label: "Shift Start", val: "9:00 AM" },
                  { label: "Shift End", val: "6:00 PM" },
                  { label: "Work Hours", val: "9h 00m" },
                ].map(({ label, val }) => (
                  <div key={label} style={{ textAlign: "center", padding: "8px 0" }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1E293B" }}>{val}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 3 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === "history" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "14px 20px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", display: "grid", gridTemplateColumns: "1.5fr 0.9fr 0.9fr 0.9fr 0.9fr", fontSize: 11, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                <div>Date</div><div>Clock In</div><div>Clock Out</div><div>Duration</div><div>Status</div>
              </div>
              {history.length === 0 ? (
                <div style={{ padding: "30px", textAlign: "center", color: "#94A3B8", fontSize: 13 }}>
                  No attendance history yet. Clock in to start building your record!
                </div>
              ) : history.map((h, i) => {
                const dateLabel = new Date(h.date).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
                const isToday = h.date === new Date().toISOString().slice(0, 10);
                return (
                  <div key={h.date} style={{ padding: "15px 20px", borderBottom: i < history.length - 1 ? "1px solid #F1F5F9" : "none", display: "grid", gridTemplateColumns: "1.5fr 0.9fr 0.9fr 0.9fr 0.9fr", alignItems: "center", background: isToday ? "#FAFBFD" : "transparent" }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: "#1E293B" }}>
                      {dateLabel} {isToday && <span style={{ fontSize: 10, color: "#3B82F6", fontWeight: 600, marginLeft: 4 }}>TODAY</span>}
                    </div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, color: "#1E293B" }}>{h.clockIn ? h.clockIn.slice(0, 5) : <span style={{ color: "#CBD5E1" }}>—</span>}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, color: "#1E293B" }}>{h.clockOut ? h.clockOut.slice(0, 5) : <span style={{ color: "#CBD5E1" }}>—</span>}</div>
                    <div style={{ fontFamily: "monospace", fontSize: 13, color: "#64748B" }}>{calcDuration(h.clockIn, h.clockOut) || <span style={{ color: "#CBD5E1" }}>—</span>}</div>
                    <div><StatusBadge status={h.clockOut ? "left" : h.status} /></div>
                  </div>
                );
              })}
            </div>

            <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginBottom: 16 }}>Last 7 Days Summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
                {[
                  { label: "Days Present", val: summary.present, clr: "#10B981" },
                  { label: "Days Late", val: summary.late, clr: "#F59E0B" },
                  { label: "Days Recorded", val: last7.length, clr: "#3B82F6" },
                  { label: "Total Hours", val: summary.hours, clr: "#8B5CF6" },
                ].map(({ label, val, clr }) => (
                  <div key={label} style={{ background: "#F8FAFC", borderRadius: 12, padding: "14px 12px", textAlign: "center", border: "1px solid #E2E8F0" }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: clr }}>{val}</div>
                    <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ADD EMPLOYEE MODAL
═══════════════════════════════════════════ */
function AddEmployeeModal({ onClose, onSaved }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [dept, setDept] = useState(DEPT_OPTIONS[0]);
  const [role, setRole] = useState("");
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const tid = id.trim();
    const tname = name.trim();
    const trole = role.trim();
    if (!tid) return setErr("Employee ID is required.");
    if (!tname) return setErr("Employee name is required.");
    if (!trole) return setErr("Role is required.");
    if (!/^\d{4}$/.test(pin)) return setErr("PIN must be exactly 4 digits.");
    setBusy(true);
    try {
      const emp = {
        id: tid, name: tname, dept, role: trole,
        initials: makeInitials(tname), clr: pickColor(tid + tname), pin,
      };
      await api.createEmployee(emp);
      onSaved();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100, padding: 20 }} onClick={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <UserPlus size={16} style={{ color: "#3B82F6" }} />
            </div>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0F172A" }}>Add New Employee</h3>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 4 }}><X size={18} /></button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Field label="Employee ID *" hint="Unique ID (e.g. EMP001)">
            <input value={id} onChange={e => { setId(e.target.value); setErr(""); }} placeholder="EMP001" autoComplete="off" style={inputStyle} />
          </Field>
          <Field label="Full Name *">
            <input value={name} onChange={e => { setName(e.target.value); setErr(""); }} placeholder="John Doe" autoComplete="off" style={inputStyle} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Department *">
              <select value={dept} onChange={e => setDept(e.target.value)} style={inputStyle}>
                {DEPT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </Field>
            <Field label="Role / Title *">
              <input value={role} onChange={e => { setRole(e.target.value); setErr(""); }} placeholder="Developer" autoComplete="off" style={inputStyle} />
            </Field>
          </div>
          <Field label="4-Digit PIN *" hint="Employee will use this to clock in/out">
            <input value={pin}
              onChange={e => { const v = e.target.value.replace(/\D/g, "").slice(0, 4); setPin(v); setErr(""); }}
              placeholder="1234" inputMode="numeric" autoComplete="off"
              style={{ ...inputStyle, letterSpacing: "0.3em", fontFamily: "monospace" }} />
          </Field>

          {err && (
            <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "9px 12px", borderRadius: 8, fontSize: 12, fontWeight: 500 }}>{err}</div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            <button onClick={onClose} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#fff", color: "#64748B", fontWeight: 500, fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={submit} disabled={busy} style={{ flex: 1, padding: "11px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: busy ? "wait" : "pointer", opacity: busy ? 0.7 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              {busy && <Spinner size={13} color="#fff" />} Add Employee
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   ADMIN APP
═══════════════════════════════════════════ */
function AdminApp({ onLogout }) {
  const [view, setView] = useState("dashboard");
  const [now, setNow] = useState(new Date());
  const [employees, setEmployees] = useState([]);
  const [attend, setAttend] = useState({});
  const [weekData, setWeekData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selEmp, setSelEmp] = useState("");
  const [clockMsg, setClockMsg] = useState(null);
  const [empSearch, setEmpSearch] = useState("");
  const [empDept, setEmpDept] = useState("All");
  const [attStatus, setAttStatus] = useState("All");
  const [showAdd, setShowAdd] = useState(false);
  const [pinReveal, setPinReveal] = useState({});

  // Reports
  const today = new Date().toISOString().slice(0, 10);
  const [reportMode, setReportMode] = useState("daily"); // 'daily' | 'range'
  const [reportDate, setReportDate] = useState(today);
  const [reportFrom, setReportFrom] = useState(today);
  const [reportTo, setReportTo] = useState(today);
  const [downloading, setDownloading] = useState(false);
  const [reportMsg, setReportMsg] = useState(null);

  const loadAll = useCallback(async () => {
    try {
      const [emps, todayData, weekly] = await Promise.all([
        api.listEmployees(),
        api.getTodayAttendance(),
        api.weekly(),
      ]);
      setEmployees(emps);
      setAttend(todayData.records);
      setWeekData(weekly.map(w => ({ day: w.day, present: w.present, absent: w.absent })));
    } catch (e) {
      console.error("Load error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const t = setInterval(() => setNow(new Date()), 1000);
    const refresh = setInterval(loadAll, 15000); // auto-refresh every 15s
    return () => { clearInterval(t); clearInterval(refresh); };
  }, [loadAll]);

  const getStatus = (id) => {
    const r = attend[id];
    if (!r) return "absent";
    if (r.clockOut) return "left";
    return r.status;
  };

  const counts = {
    total: employees.length,
    present: employees.filter(e => ["present", "late", "left"].includes(getStatus(e.id))).length,
    absent: employees.filter(e => getStatus(e.id) === "absent").length,
    late: employees.filter(e => getStatus(e.id) === "late").length,
  };

  const handleClock = async () => {
    if (!selEmp) return;
    try {
      const res = await api.clock(selEmp);
      setClockMsg({ type: res.action, ts: res.time });
      await loadAll();
      setTimeout(() => setClockMsg(null), 4000);
    } catch (err) {
      alert(err.message);
    }
  };

  const selData = employees.find(e => e.id === selEmp);
  const selRec = selData ? attend[selData.id] : null;
  const isDone = !!(selRec?.clockIn && selRec?.clockOut);
  const canOut = !!(selRec?.clockIn && !selRec?.clockOut);

  const NAV = [
    { id: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
    { id: "clockin", label: "Clock In/Out", Icon: Clock },
    { id: "attendance", label: "Attendance", Icon: ClipboardList },
    { id: "employees", label: "Employees", Icon: Users },
    { id: "manage", label: "Manage Employees", Icon: UserPlus },
    { id: "reports", label: "Reports (Excel)", Icon: FileSpreadsheet },
  ];

  const filtEmp = employees.filter(e =>
    (empDept === "All" || e.dept === empDept) &&
    (e.name.toLowerCase().includes(empSearch.toLowerCase()) ||
      e.role.toLowerCase().includes(empSearch.toLowerCase()) ||
      e.dept.toLowerCase().includes(empSearch.toLowerCase()) ||
      e.id.toLowerCase().includes(empSearch.toLowerCase()))
  );

  const filtAtt = employees.filter(e => {
    const s = getStatus(e.id);
    if (attStatus === "All") return true;
    return attStatus.toLowerCase() === s.toLowerCase();
  });

  const depts = ["All", ...Array.from(new Set(employees.map(e => e.dept)))];
  const dateStr = now.toLocaleDateString("en-IN", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
  const timeStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const handleDelete = async (id) => {
    if (!window.confirm(`Delete employee ${id}? This cannot be undone.`)) return;
    try {
      await api.deleteEmployee(id);
      await loadAll();
    } catch (e) { alert(e.message); }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setReportMsg(null);
    try {
      if (reportMode === "daily") {
        await api.downloadExcel({ date: reportDate });
      } else {
        if (reportFrom > reportTo) {
          setReportMsg({ type: "err", text: "'From' date must be before 'To' date." });
          return;
        }
        await api.downloadExcel({ from: reportFrom, to: reportTo });
      }
      setReportMsg({ type: "ok", text: "✅ Report downloaded successfully!" });
    } catch (e) {
      setReportMsg({ type: "err", text: e.message });
    } finally {
      setDownloading(false);
      setTimeout(() => setReportMsg(null), 5000);
    }
  };

  const EmptyState = ({ title, msg, action }) => (
    <div style={{ background: "#fff", border: "1px dashed #CBD5E1", borderRadius: 14, padding: "48px 24px", textAlign: "center" }}>
      <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#F1F5F9", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        <Users size={22} style={{ color: "#94A3B8" }} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: "#0F172A", marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: "#64748B", marginBottom: 18 }}>{msg}</div>
      {action}
    </div>
  );

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F8FAFC", flexDirection: "column", gap: 14 }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <Spinner size={32} />
        <div style={{ color: "#64748B", fontSize: 14, fontWeight: 500 }}>Loading attendance data...</div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100vh", background: "#F8FAFC", fontFamily: "'Inter',system-ui,sans-serif", overflow: "hidden" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <aside style={{ width: 230, background: "#0F172A", display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "22px 18px 18px", borderBottom: "1px solid #1E293B" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 9, background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#fff", fontSize: 12 }}>SA</div>
            <div>
              <div style={{ color: "#F1F5F9", fontWeight: 600, fontSize: 13 }}>SkillAuro</div>
              <div style={{ color: "#475569", fontSize: 11 }}>Admin Panel</div>
            </div>
          </div>
        </div>

        <nav style={{ flex: 1, padding: "14px 10px", display: "flex", flexDirection: "column", gap: 3 }}>
          {NAV.map(({ id, label, Icon }) => {
            const active = view === id;
            return (
              <button key={id} onClick={() => setView(id)} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                border: "none", cursor: "pointer", textAlign: "left",
                background: active ? "#1D4ED8" : "transparent",
                color: active ? "#fff" : "#94A3B8", fontWeight: active ? 600 : 400,
                fontSize: 13, transition: "all 0.15s"
              }}>
                <Icon size={15} /> {label}
              </button>
            );
          })}
        </nav>

        <div style={{ padding: "14px 18px", borderTop: "1px solid #1E293B", display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={loadAll} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 7, padding: "8px 12px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#94A3B8", fontSize: 12, cursor: "pointer" }}>
            <RefreshCw size={12} /> Refresh
          </button>
          <button onClick={onLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, border: "1px solid #334155", background: "transparent", color: "#64748B", fontSize: 12, cursor: "pointer" }}>
            <LogOut size={13} /> Sign Out
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <header style={{ background: "#fff", borderBottom: "1px solid #E2E8F0", padding: "0 28px", height: 60, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#0F172A" }}>{NAV.find(n => n.id === view)?.label}</h1>
            <p style={{ margin: 0, fontSize: 11, color: "#94A3B8" }}>{dateStr}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ fontFamily: "monospace", fontSize: 20, fontWeight: 700, color: "#1E293B", background: "#F1F5F9", borderRadius: 9, padding: "6px 14px" }}>{timeStr}</div>
            {[
              { n: counts.present, c: "#10B981", l: "Present" },
              { n: counts.absent, c: "#EF4444", l: "Absent" },
              { n: counts.late, c: "#F59E0B", l: "Late" }
            ].map(({ n, c, l }) => (
              <div key={l} style={{ background: c + "18", border: `1px solid ${c}35`, borderRadius: 8, padding: "4px 10px", textAlign: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: c }}>{n}</div>
                <div style={{ fontSize: 10, color: c + "99", fontWeight: 500 }}>{l}</div>
              </div>
            ))}
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700 }}>A</div>
          </div>
        </header>

        <main style={{ flex: 1, overflowY: "auto", padding: 24 }}>
          {view === "dashboard" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {employees.length === 0 ? (
                <EmptyState title="No employees yet" msg="Get started by adding your first employee to the system."
                  action={
                    <button onClick={() => setView("manage")} style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <UserPlus size={14} /> Add First Employee
                    </button>
                  }
                />
              ) : (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
                    {[
                      { label: "Total Employees", value: counts.total, Icon: Users, clr: "#3B82F6", bg: "#EFF6FF" },
                      { label: "Present Today", value: counts.present, Icon: UserCheck, clr: "#10B981", bg: "#F0FDF4" },
                      { label: "Absent Today", value: counts.absent, Icon: UserX, clr: "#EF4444", bg: "#FEF2F2" },
                      { label: "Late Arrivals", value: counts.late, Icon: AlertCircle, clr: "#F59E0B", bg: "#FFFBEB" },
                    ].map(({ label, value, Icon, clr, bg }) => (
                      <div key={label} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "18px 20px", position: "relative", overflow: "hidden" }}>
                        <div style={{ position: "absolute", top: 14, right: 14, width: 34, height: 34, background: bg, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Icon size={16} style={{ color: clr }} />
                        </div>
                        <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>{label}</div>
                        <div style={{ fontSize: 34, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>{value}</div>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 290px", gap: 18 }}>
                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "22px 22px 14px" }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#0F172A", marginBottom: 16 }}>Weekly Attendance</div>
                      <ResponsiveContainer width="100%" height={200}>
                        <BarChart data={weekData} barGap={3} barSize={20}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                          <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94A3B8" }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: "#CBD5E1" }} axisLine={false} tickLine={false} domain={[0, Math.max(5, counts.total)]} />
                          <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #E2E8F0", fontSize: 11 }} />
                          <Bar dataKey="present" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Present" />
                          <Bar dataKey="absent" fill="#FCA5A5" radius={[4, 4, 0, 0]} name="Absent" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 20 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#0F172A", marginBottom: 14 }}>Recent Activity</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {(() => {
                          const acts = Object.entries(attend).flatMap(([id, rec]) => {
                            const emp = employees.find(e => e.id === id); if (!emp) return [];
                            const a = [];
                            if (rec.clockIn) a.push({ time: rec.clockIn, emp, action: "in" });
                            if (rec.clockOut) a.push({ time: rec.clockOut, emp, action: "out" });
                            return a;
                          }).sort((a, b) => b.time.localeCompare(a.time)).slice(0, 7);

                          if (acts.length === 0) {
                            return <div style={{ fontSize: 12, color: "#94A3B8", textAlign: "center", padding: "20px 0" }}>No activity yet today.</div>;
                          }
                          return acts.map((act, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                              <div style={{ width: 28, height: 28, borderRadius: "50%", background: act.emp.clr, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{act.emp.initials}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 11, fontWeight: 500, color: "#1E293B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{act.emp.name}</div>
                                <div style={{ fontSize: 10, color: "#94A3B8" }}>clocked {act.action} · {act.time.slice(0, 5)}</div>
                              </div>
                              <div style={{ width: 6, height: 6, borderRadius: "50%", flexShrink: 0, background: act.action === "in" ? "#10B981" : "#3B82F6" }} />
                            </div>
                          ));
                        })()}
                      </div>
                    </div>
                  </div>

                  {depts.length > 1 && (
                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 20 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "#0F172A", marginBottom: 14 }}>Department Overview</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                        {Array.from(new Set(employees.map(e => e.dept))).map(dept => {
                          const emps = employees.filter(e => e.dept === dept);
                          const present = emps.filter(e => getStatus(e.id) !== "absent").length;
                          const pct = Math.round(present / emps.length * 100);
                          const ds = DEPT_STYLE[dept] || { bar: "#6B7280" };
                          return (
                            <div key={dept} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 11, padding: 14 }}>
                              <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", marginBottom: 8 }}>{dept}</div>
                              <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", lineHeight: 1 }}>{present}<span style={{ fontSize: 12, fontWeight: 400, color: "#94A3B8" }}>/{emps.length}</span></div>
                              <div style={{ marginTop: 8, background: "#E2E8F0", borderRadius: 99, height: 3, overflow: "hidden" }}>
                                <div style={{ width: `${pct}%`, height: "100%", background: ds.bar, borderRadius: 99 }} />
                              </div>
                              <div style={{ fontSize: 10, color: "#94A3B8", marginTop: 5 }}>{pct}%</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {view === "clockin" && (
            <div style={{ maxWidth: 560, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ background: "#0F172A", borderRadius: 18, padding: "32px", textAlign: "center" }}>
                <div style={{ fontFamily: "monospace", fontSize: 50, fontWeight: 700, color: "#F8FAFC", letterSpacing: "-0.02em", lineHeight: 1 }}>
                  {now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </div>
                <div style={{ color: "#475569", fontSize: 13, marginTop: 10 }}>{dateStr}</div>
              </div>

              {employees.length === 0 ? (
                <EmptyState title="No employees to clock in" msg="Add employees first before tracking attendance."
                  action={<button onClick={() => setView("manage")} style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}><UserPlus size={14} /> Add Employee</button>}
                />
              ) : (
                <>
                  <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 22 }}>
                    <label style={{ display: "block", fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Select Employee</label>
                    <select value={selEmp} onChange={e => { setSelEmp(e.target.value); setClockMsg(null); }}
                      style={{ width: "100%", border: "1px solid #E2E8F0", borderRadius: 9, padding: "11px 14px", fontSize: 14, color: "#1E293B", background: "#F8FAFC", outline: "none", boxSizing: "border-box" }}>
                      <option value="">— Choose an employee —</option>
                      {employees.map(e => {
                        const s = getStatus(e.id);
                        return <option key={e.id} value={e.id}>{e.id} · {e.name} — {e.dept} {s === "present" ? "✓" : s === "late" ? "(Late)" : s === "left" ? "(Out)" : ""}</option>;
                      })}
                    </select>
                  </div>

                  {selData && (
                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 22 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, paddingBottom: 18, borderBottom: "1px solid #F1F5F9" }}>
                        <div style={{ width: 48, height: 48, borderRadius: "50%", background: selData.clr, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15, flexShrink: 0 }}>{selData.initials}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 16, color: "#0F172A" }}>{selData.name}</div>
                          <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>{selData.role} · {selData.dept}</div>
                        </div>
                        <StatusBadge status={getStatus(selData.id)} />
                      </div>

                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 20 }}>
                        {[
                          { label: "Clock In", val: selRec?.clockIn ? selRec.clockIn.slice(0, 5) : "--:--" },
                          { label: "Clock Out", val: selRec?.clockOut ? selRec.clockOut.slice(0, 5) : "--:--" },
                          { label: "Duration", val: calcDuration(selRec?.clockIn, selRec?.clockOut) || "--" },
                        ].map(({ label, val }) => (
                          <div key={label} style={{ background: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: 9, padding: "12px", textAlign: "center" }}>
                            <div style={{ fontSize: 10, color: "#94A3B8", fontWeight: 500, marginBottom: 5 }}>{label}</div>
                            <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 17, color: "#1E293B" }}>{val}</div>
                          </div>
                        ))}
                      </div>

                      {!isDone ? (
                        <button onClick={handleClock} style={{ width: "100%", padding: "15px", borderRadius: 11, border: "none", cursor: "pointer", fontWeight: 700, fontSize: 15, color: "#fff", background: canOut ? "linear-gradient(135deg,#3B82F6,#1D4ED8)" : "linear-gradient(135deg,#10B981,#059669)", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                          {canOut ? <><LogOut size={17} /> Clock Out Now</> : <><LogIn size={17} /> Clock In Now</>}
                        </button>
                      ) : (
                        <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: 11, padding: 16, textAlign: "center", color: "#15803D", fontSize: 13, fontWeight: 500 }}>
                          ✅ Work session completed for today
                        </div>
                      )}

                      {clockMsg && (
                        <div style={{ marginTop: 12, padding: "11px", borderRadius: 9, textAlign: "center", background: clockMsg.type === "in" ? "#F0FDF4" : "#EFF6FF", border: `1px solid ${clockMsg.type === "in" ? "#BBF7D0" : "#BFDBFE"}`, color: clockMsg.type === "in" ? "#15803D" : "#1D4ED8", fontSize: 13, fontWeight: 500 }}>
                          {clockMsg.type === "in" ? `✅ Clocked in at ${clockMsg.ts.slice(0, 5)}` : `👋 Clocked out at ${clockMsg.ts.slice(0, 5)}`}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {view === "attendance" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {employees.length === 0 ? (
                <EmptyState title="No attendance to show" msg="Add employees to start tracking attendance." />
              ) : (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    {["All", "Present", "Late", "Absent", "Left"].map(f => (
                      <button key={f} onClick={() => setAttStatus(f)} style={{ padding: "7px 16px", borderRadius: 99, border: attStatus === f ? "none" : "1px solid #E2E8F0", background: attStatus === f ? "#1D4ED8" : "#fff", color: attStatus === f ? "#fff" : "#64748B", fontWeight: 500, fontSize: 12, cursor: "pointer" }}>{f}</button>
                    ))}
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr", padding: "11px 22px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      <div>Employee</div><div>Dept</div><div>In</div><div>Out</div><div>Duration</div><div>Status</div>
                    </div>
                    {filtAtt.map((emp, i) => {
                      const rec = attend[emp.id]; const status = getStatus(emp.id);
                      return (
                        <div key={emp.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 0.8fr 0.8fr 0.8fr 0.8fr", padding: "13px 22px", borderBottom: i < filtAtt.length - 1 ? "1px solid #F1F5F9" : "none", alignItems: "center" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 30, height: 30, borderRadius: "50%", background: emp.clr, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{emp.initials}</div>
                            <div>
                              <div style={{ fontWeight: 500, fontSize: 12, color: "#1E293B" }}>{emp.name}</div>
                              <div style={{ fontSize: 10, color: "#94A3B8" }}>{emp.id} · {emp.role}</div>
                            </div>
                          </div>
                          <div style={{ fontSize: 11, fontWeight: 500, padding: "2px 8px", borderRadius: 99, display: "inline-flex", background: (DEPT_STYLE[emp.dept]?.bar || "#6B7280") + "18", color: (DEPT_STYLE[emp.dept]?.bar || "#6B7280"), maxWidth: "fit-content" }}>{emp.dept}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#1E293B" }}>{rec?.clockIn ? rec.clockIn.slice(0, 5) : "—"}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#1E293B" }}>{rec?.clockOut ? rec.clockOut.slice(0, 5) : "—"}</div>
                          <div style={{ fontFamily: "monospace", fontSize: 12, color: "#64748B" }}>{calcDuration(rec?.clockIn, rec?.clockOut) || "—"}</div>
                          <div><StatusBadge status={status} /></div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {view === "employees" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {employees.length === 0 ? (
                <EmptyState title="No employees yet" msg="Head to 'Manage Employees' to add your first one."
                  action={<button onClick={() => setView("manage")} style={{ padding: "10px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}><UserPlus size={14} /> Add Employee</button>}
                />
              ) : (
                <>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ position: "relative", flex: "0 0 260px" }}>
                      <Search size={13} style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
                      <input type="text" placeholder="Search by name, ID, role..." value={empSearch} onChange={e => setEmpSearch(e.target.value)}
                        style={{ width: "100%", paddingLeft: 32, paddingRight: 14, paddingTop: 9, paddingBottom: 9, border: "1px solid #E2E8F0", borderRadius: 9, fontSize: 13, color: "#1E293B", background: "#fff", outline: "none", boxSizing: "border-box" }} />
                    </div>
                    {depts.map(d => (
                      <button key={d} onClick={() => setEmpDept(d)} style={{
                        padding: "7px 13px", borderRadius: 99, cursor: "pointer", fontSize: 11,
                        border: "1px solid", transition: "all 0.15s",
                        ...(empDept === d ? { background: "#0F172A", color: "#fff", borderColor: "#0F172A" } : { background: "#fff", color: "#64748B", borderColor: "#E2E8F0" })
                      }}>{d}</button>
                    ))}
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 14 }}>
                    {filtEmp.map(emp => {
                      const status = getStatus(emp.id); const rec = attend[emp.id];
                      const ds = DEPT_STYLE[emp.dept] || { bar: "#6B7280" };
                      return (
                        <div key={emp.id} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 18, transition: "border-color 0.15s, box-shadow 0.15s" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = "#CBD5E1"; e.currentTarget.style.boxShadow = "0 2px 10px #0001"; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = "#E2E8F0"; e.currentTarget.style.boxShadow = "none"; }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
                            <div style={{ width: 40, height: 40, borderRadius: "50%", background: emp.clr, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{emp.initials}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: 13, color: "#0F172A", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.name}</div>
                              <div style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{emp.id} · {emp.role}</div>
                            </div>
                          </div>
                          <div style={{ marginBottom: 11 }}>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 9px", borderRadius: 99, background: ds.bar + "18", color: ds.bar, border: `1px solid ${ds.bar}40` }}>{emp.dept}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <StatusBadge status={status} />
                            <div style={{ textAlign: "right" }}>
                              {rec?.clockIn && <div style={{ fontSize: 10, fontFamily: "monospace", color: "#64748B" }}>in {rec.clockIn.slice(0, 5)}</div>}
                              {rec?.clockOut && <div style={{ fontSize: 10, fontFamily: "monospace", color: "#94A3B8" }}>out {rec.clockOut.slice(0, 5)}</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {view === "manage" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: "16px 20px" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#0F172A" }}>Employee Roster</div>
                  <div style={{ fontSize: 12, color: "#64748B", marginTop: 3 }}>{employees.length} {employees.length === 1 ? "employee" : "employees"} in the database</div>
                </div>
                <button onClick={() => setShowAdd(true)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 9, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#3B82F6,#1D4ED8)", color: "#fff", fontWeight: 600, fontSize: 13 }}>
                  <UserPlus size={15} /> Add Employee
                </button>
              </div>

              {employees.length === 0 ? (
                <EmptyState title="No employees added yet" msg="Click 'Add Employee' above to create your first employee with a custom ID and PIN." />
              ) : (
                <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, overflow: "hidden" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.6fr", padding: "11px 22px", background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", fontSize: 10, fontWeight: 600, color: "#64748B", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    <div>Employee</div><div>Department</div><div>Employee ID</div><div>PIN</div><div style={{ textAlign: "right" }}>Action</div>
                  </div>
                  {employees.map((emp, i) => (
                    <div key={emp.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 0.6fr", padding: "13px 22px", borderBottom: i < employees.length - 1 ? "1px solid #F1F5F9" : "none", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: emp.clr, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{emp.initials}</div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13, color: "#1E293B" }}>{emp.name}</div>
                          <div style={{ fontSize: 11, color: "#94A3B8" }}>{emp.role}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "#1E293B" }}>{emp.dept}</div>
                      <div style={{ fontFamily: "monospace", fontSize: 12, fontWeight: 600, color: "#0F172A" }}>{emp.id}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 600, color: "#0F172A", letterSpacing: "0.15em" }}>
                          {pinReveal[emp.id] ? emp.pin : "••••"}
                        </div>
                        <button onClick={() => setPinReveal(p => ({ ...p, [emp.id]: !p[emp.id] }))} style={{ background: "none", border: "none", cursor: "pointer", color: "#94A3B8", padding: 2, display: "flex" }}>
                          {pinReveal[emp.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <button onClick={() => handleDelete(emp.id)} style={{ background: "#FEF2F2", border: "1px solid #FECACA", color: "#B91C1C", padding: "6px 10px", borderRadius: 7, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, fontWeight: 500 }}>
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "14px 18px", fontSize: 12, color: "#1E40AF", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <Shield size={16} style={{ color: "#3B82F6", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>How it works:</strong> All employee data is stored securely in the SQLite database on the server.
                  Share the <strong>Employee ID</strong> and <strong>PIN</strong> with each employee privately so they can clock in/out.
                </div>
              </div>
            </div>
          )}

          {view === "reports" && (
            <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 18 }}>
              <div style={{ background: "linear-gradient(135deg,#1E40AF,#0F172A)", borderRadius: 16, padding: "28px 32px", color: "#fff", position: "relative", overflow: "hidden" }}>
                <FileSpreadsheet size={120} style={{ position: "absolute", right: -20, top: -10, opacity: 0.08 }} />
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#10B98130", border: "1px solid #10B98160", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <FileSpreadsheet size={20} style={{ color: "#34D399" }} />
                  </div>
                  <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Attendance Reports</h2>
                </div>
                <p style={{ margin: 0, color: "#94A3B8", fontSize: 13, maxWidth: 540 }}>
                  Download detailed attendance records as Excel (.xlsx) files. Includes daily logs, summary statistics, and report metadata.
                </p>
              </div>

              {/* Mode picker */}
              <div style={{ display: "flex", gap: 4, background: "#E2E8F0", borderRadius: 10, padding: 4 }}>
                {[
                  { id: "daily", label: "Single Day Report" },
                  { id: "range", label: "Date Range Report" },
                ].map(t => (
                  <button key={t.id} onClick={() => setReportMode(t.id)} style={{
                    flex: 1, padding: "10px", borderRadius: 7, border: "none", cursor: "pointer",
                    fontWeight: 600, fontSize: 13, transition: "all 0.15s",
                    background: reportMode === t.id ? "#fff" : "transparent",
                    color: reportMode === t.id ? "#0F172A" : "#64748B",
                    boxShadow: reportMode === t.id ? "0 1px 4px #0002" : "none"
                  }}>{t.label}</button>
                ))}
              </div>

              {/* Date picker card */}
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 24 }}>
                {reportMode === "daily" ? (
                  <Field label="Select Date" hint="Choose the day you want to export">
                    <div style={{ position: "relative" }}>
                      <Calendar size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
                      <input type="date" value={reportDate} onChange={e => setReportDate(e.target.value)} max={today}
                        style={{ ...inputStyle, paddingLeft: 36 }} />
                    </div>
                  </Field>
                ) : (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <Field label="From Date">
                      <div style={{ position: "relative" }}>
                        <Calendar size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
                        <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} max={today}
                          style={{ ...inputStyle, paddingLeft: 36 }} />
                      </div>
                    </Field>
                    <Field label="To Date">
                      <div style={{ position: "relative" }}>
                        <Calendar size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#94A3B8" }} />
                        <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} max={today}
                          style={{ ...inputStyle, paddingLeft: 36 }} />
                      </div>
                    </Field>
                  </div>
                )}

                <button onClick={handleDownload} disabled={downloading || employees.length === 0} style={{
                  marginTop: 22, width: "100%", padding: "14px", borderRadius: 11, border: "none",
                  background: employees.length === 0 ? "#CBD5E1" : "linear-gradient(135deg,#10B981,#059669)",
                  color: "#fff", fontWeight: 700, fontSize: 14,
                  cursor: downloading || employees.length === 0 ? "not-allowed" : "pointer",
                  opacity: downloading ? 0.7 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 10
                }}>
                  {downloading ? <><Spinner size={16} color="#fff" /> Generating Excel file...</> : <><Download size={17} /> Download Excel Report</>}
                </button>

                {employees.length === 0 && (
                  <div style={{ marginTop: 12, padding: "10px 12px", background: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 8, color: "#92400E", fontSize: 12, textAlign: "center" }}>
                    Add at least one employee before generating reports.
                  </div>
                )}

                {reportMsg && (
                  <div style={{
                    marginTop: 12, padding: "10px 14px", borderRadius: 8, fontSize: 13, fontWeight: 500, textAlign: "center",
                    background: reportMsg.type === "ok" ? "#F0FDF4" : "#FEF2F2",
                    border: `1px solid ${reportMsg.type === "ok" ? "#BBF7D0" : "#FECACA"}`,
                    color: reportMsg.type === "ok" ? "#15803D" : "#B91C1C"
                  }}>{reportMsg.text}</div>
                )}
              </div>

              {/* Quick actions */}
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 14, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#0F172A", marginBottom: 14 }}>Quick Downloads</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  {[
                    { label: "Today", fn: () => { setReportMode("daily"); setReportDate(today); setTimeout(handleDownload, 50); } },
                    {
                      label: "Last 7 Days", fn: () => {
                        const d = new Date(); d.setDate(d.getDate() - 6);
                        setReportMode("range"); setReportFrom(d.toISOString().slice(0, 10)); setReportTo(today);
                        setTimeout(handleDownload, 50);
                      }
                    },
                    {
                      label: "This Month", fn: () => {
                        const d = new Date(); d.setDate(1);
                        setReportMode("range"); setReportFrom(d.toISOString().slice(0, 10)); setReportTo(today);
                        setTimeout(handleDownload, 50);
                      }
                    },
                  ].map(({ label, fn }) => (
                    <button key={label} onClick={fn} disabled={employees.length === 0 || downloading} style={{
                      padding: "12px", borderRadius: 9, border: "1px solid #E2E8F0", background: "#F8FAFC",
                      color: "#1E293B", fontWeight: 600, fontSize: 12, cursor: employees.length === 0 ? "not-allowed" : "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7, transition: "all 0.15s"
                    }}
                      onMouseEnter={e => { if (employees.length > 0) { e.currentTarget.style.background = "#EFF6FF"; e.currentTarget.style.borderColor = "#BFDBFE"; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = "#F8FAFC"; e.currentTarget.style.borderColor = "#E2E8F0"; }}>
                      <Download size={13} /> {label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 12, padding: "14px 18px", fontSize: 12, color: "#1E40AF", display: "flex", gap: 10, alignItems: "flex-start" }}>
                <FileSpreadsheet size={16} style={{ color: "#3B82F6", flexShrink: 0, marginTop: 1 }} />
                <div>
                  <strong>Excel report contains:</strong>
                  <ul style={{ margin: "6px 0 0 18px", padding: 0, lineHeight: 1.7 }}>
                    <li><strong>Daily Records</strong> sheet — every employee × every day with clock-in/out times</li>
                    <li><strong>Summary</strong> sheet — per-employee totals (present/late/absent days, total hours, attendance %)</li>
                    <li><strong>Report Info</strong> sheet — generation date, range, and metadata</li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {showAdd && (
        <AddEmployeeModal
          onClose={() => setShowAdd(false)}
          onSaved={async () => { setShowAdd(false); await loadAll(); }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════
   ROOT — SESSION ROUTER
═══════════════════════════════════════════ */
export default function App() {
  const [session, setSession] = useState(null);
  const [serverDown, setServerDown] = useState(false);

  // Check server health on mount
  useEffect(() => {
    fetch("/api/health")
      .then(r => r.ok ? setServerDown(false) : setServerDown(true))
      .catch(() => setServerDown(true));
  }, []);

  if (serverDown) {
    return (
      <div style={{ minHeight: "100vh", background: "#0F172A", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "'Inter',system-ui,sans-serif" }}>
        <div style={{ background: "#1E293B", border: "1px solid #334155", borderRadius: 16, padding: 32, maxWidth: 480, textAlign: "center" }}>
          <AlertCircle size={42} style={{ color: "#EF4444", margin: "0 auto 14px" }} />
          <h2 style={{ color: "#F1F5F9", fontSize: 18, margin: "0 0 8px" }}>Backend Server Not Running</h2>
          <p style={{ color: "#94A3B8", fontSize: 13, margin: "0 0 20px", lineHeight: 1.6 }}>
            The API server isn't reachable at <code style={{ background: "#0F172A", padding: "2px 6px", borderRadius: 4, color: "#F59E0B" }}>http://localhost:4000</code>.
            <br /><br />
            Open a terminal in your project folder and run:
          </p>
          <pre style={{ background: "#0F172A", color: "#10B981", padding: "12px", borderRadius: 8, fontSize: 13, margin: 0, textAlign: "left" }}>
            npm start
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 18, padding: "10px 20px", borderRadius: 9, border: "none", background: "#3B82F6", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <LoginScreen
        onEmpLogin={emp => setSession({ role: "employee", emp })}
        onAdminLogin={() => setSession({ role: "admin" })}
      />
    );
  }
  if (session.role === "employee") {
    return <EmployeePortal emp={session.emp} onLogout={() => setSession(null)} />;
  }
  return <AdminApp onLogout={() => setSession(null)} />;
}
