// Tiny API client — all calls go to the Express backend via /api proxy
const BASE = "/api";

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  let data;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const api = {
  // Auth
  loginAdmin:    (username, password) => request("/auth/admin", { method: "POST", body: JSON.stringify({ username, password }) }),
  loginEmployee: (employeeId, pin)    => request("/auth/employee", { method: "POST", body: JSON.stringify({ employeeId, pin }) }),

  // Employees
  listEmployees:  ()    => request("/employees"),
  createEmployee: (emp) => request("/employees", { method: "POST", body: JSON.stringify(emp) }),
  deleteEmployee: (id)  => request(`/employees/${encodeURIComponent(id)}`, { method: "DELETE" }),

  // Attendance
  getTodayAttendance: ()             => request("/attendance/today"),
  clock:              (employeeId)   => request("/attendance/clock", { method: "POST", body: JSON.stringify({ employeeId }) }),
  employeeHistory:    (id, days=30)  => request(`/attendance/employee/${encodeURIComponent(id)}?days=${days}`),
  weekly:             ()             => request("/attendance/weekly"),

  // Excel download (returns blob URL)
  downloadExcel: async ({ date, from, to } = {}) => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (from) params.set("from", from);
    if (to)   params.set("to", to);
    const url = `${BASE}/reports/excel?${params.toString()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to download report");
    const blob = await res.blob();
    const cd = res.headers.get("Content-Disposition") || "";
    const match = cd.match(/filename="?([^"]+)"?/);
    const filename = match ? match[1] : "attendance-report.xlsx";
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objUrl; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(objUrl), 1000);
  },
};
