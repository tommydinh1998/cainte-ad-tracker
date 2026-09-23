// Team Tasks — one todo list per department plus a shared calendar.
//
// Left: every open deadline across all departments, nearest first, and the
// next meetings. Right: Overview (who does what, per-department health), one
// tab per department (Content / Email / Influencer & Social / Paid ads) and a
// month calendar for weekly, biweekly and monthly meetings and reminders.
// Task rules mirror Cainté Signal: deadline ≤ 2 days = critical (red), ≤ 5 days
// = soon (orange), open ≥ 7 days without progress = "needs attention".
import { useEffect, useMemo, useRef, useState } from "react";
import { T, Chip } from "./theme.jsx";
import { api, goTo, takeHint } from "./brand.js";

// Departments come from the server (tk_departments) — the four defaults are
// seeded on first boot and the team can add, rename, recolour or delete them.
const DEPT_COLORS = [T.purple, T.blue, "#FF2D55", T.orange, T.teal, T.green, "#5856D6", "#A2845E", "#FF6B22", "#8E8E93"];
const deptOf = (key, depts) => depts.find(d => d.key === key) || { key, label: key, short: key, color: T.textSec, hint: "" };
const RECUR = [
  { key: "none",     label: "One-off" },
  { key: "weekly",   label: "Every week" },
  { key: "biweekly", label: "Every 2 weeks" },
  { key: "monthly",  label: "Every month" },
];
const recurLabel = (k) => (RECUR.find(r => r.key === k) || RECUR[0]).label;

// ── Dates ('YYYY-MM-DD', local) ───────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const todayYMD = () => ymd(new Date());
const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const daysUntil = (s) => Math.round((parse(s) - parse(todayYMD())) / 86400000);
const ageDays = (ts) => Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const WEEKDAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const fmtShort = (s) => { const d = parse(s); return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`; };
const fmtLong = (s) => { const d = parse(s); return `${WEEKDAYS[(d.getDay() + 6) % 7]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; };
const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const deadlineInfo = (deadline) => {
  if (!deadline) return null;
  const d = daysUntil(deadline);
  if (d < 0)   return { color: T.red,     label: `Overdue ${-d} ${d === -1 ? "day" : "days"}`, level: "overdue" };
  if (d === 0) return { color: T.red,     label: "Due today",     level: "critical" };
  if (d === 1) return { color: T.red,     label: "Due tomorrow",  level: "critical" };
  if (d === 2) return { color: T.red,     label: "Due in 2 days", level: "critical" };
  if (d <= 5)  return { color: T.orange,  label: `Due in ${d} days`, level: "soon" };
  return { color: T.textSec, label: `${fmtShort(deadline)} · ${d} days`, level: "later" };
};

// Expand event rules into dated occurrences inside [from, to] (inclusive).
const expandEvents = (events, from, to) => {
  const out = [];
  for (const ev of events) {
    const start = ev.start_date;
    if (!start) continue;
    const last = ev.until && ev.until < to ? ev.until : to;
    if (ev.recurrence === "none") {
      if (start >= from && start <= to) out.push({ ...ev, date: start });
      continue;
    }
    if (start > last) continue;
    if (ev.recurrence === "monthly") {
      const sd = parse(start), day = sd.getDate();
      const cur = new Date(parse(from).getFullYear(), parse(from).getMonth(), 1);
      const end = parse(last);
      while (cur <= end) {
        const dim = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
        if (day <= dim) {
          const s = ymd(new Date(cur.getFullYear(), cur.getMonth(), day));
          if (s >= start && s >= from && s <= last) out.push({ ...ev, date: s });
        }
        cur.setMonth(cur.getMonth() + 1);
      }
      continue;
    }
    const step = ev.recurrence === "biweekly" ? 14 : 7;
    let s = start;
    if (s < from) { const skip = Math.ceil((parse(from) - parse(s)) / 86400000 / step); s = addDays(s, skip * step); }
    while (s <= last) { out.push({ ...ev, date: s }); s = addDays(s, step); }
  }
  return out.sort((a, b) => (a.date + (a.time || "99")).localeCompare(b.date + (b.time || "99")));
};

// ── Attachments ───────────────────────────────────────────────────────────────
const fmtSize = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const readFileB64 = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ filename: file.name, mimetype: file.type || "application/octet-stream", dataBase64: String(r.result).split(",")[1] || "" });
  r.onerror = reject;
  r.readAsDataURL(file);
});
const FileChip = ({ file, onRemove }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 600, color: T.blue, background: T.blue + "12", borderRadius: 7, padding: "3px 8px", maxWidth: 260 }}>
    <a href={`/api/tk/files/${file.id}`} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {file.filename}</a>
    {onRemove && <button type="button" onClick={onRemove} title="Remove" style={{ border: "none", background: "none", color: T.textTert, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>}
  </span>
);

const useIsMobile = () => {
  const [m, setM] = useState(() => window.innerWidth < 900);
  // Narrow desktops get the short department labels in the tab strip.
  useEffect(() => { const f = () => setM(window.innerWidth < 900); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return m;
};

// ── Shared pieces ─────────────────────────────────────────────────────────────
const card = { background: "#fff", borderRadius: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 0 0 0.5px rgba(0,0,0,0.04)" };
const inputStyle = { background: T.bg, border: "1.5px solid rgba(60,60,67,0.1)", borderRadius: 12, padding: "11px 13px", fontSize: 14, fontFamily: "inherit", color: T.text, outline: "none", boxSizing: "border-box" };
const Input = ({ value, onChange, style, ...rest }) => (
  <input value={value} onChange={e => onChange(e.target.value)} {...rest}
    style={{ ...inputStyle, width: "100%", ...style }}
    onFocus={e => e.target.style.borderColor = T.blue} onBlur={e => e.target.style.borderColor = "rgba(60,60,67,0.1)"} />
);
const Select = ({ value, onChange, options, style }) => (
  <select value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, width: "100%", ...style }}>
    {options.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
  </select>
);
const Btn = ({ onClick, children, kind = "plain", small, style, disabled, type = "button", color = T.blue }) => (
  <button type={type} onClick={onClick} disabled={disabled} style={{
    padding: small ? "6px 12px" : "10px 18px", borderRadius: 11, cursor: disabled ? "default" : "pointer",
    fontSize: small ? 12.5 : 14, fontWeight: 600, fontFamily: "inherit", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap",
    border: kind === "plain" ? `1px solid ${T.border}` : "none",
    background: kind === "primary" ? color : kind === "danger" ? T.red + "14" : kind === "ghost" ? "transparent" : "#fff",
    color: kind === "primary" ? "#fff" : kind === "danger" ? T.red : kind === "ghost" ? T.textSec : T.text,
    boxShadow: kind === "primary" ? `0 4px 14px ${color}40` : "none", ...style,
  }}>{children}</button>
);
const Pill = ({ active, color = T.text, onClick, children, dot }) => (
  <button type="button" onClick={onClick} style={{ padding: "6px 13px", borderRadius: 99, fontSize: 12.5, fontWeight: 600, border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6,
    background: active ? color : T.pillBg, color: active ? "#fff" : T.textSec, transition: "all 0.15s", whiteSpace: "nowrap" }}>
    {dot && <span style={{ width: 7, height: 7, borderRadius: "50%", background: active ? "#fff" : color }} />}{children}
  </button>
);
const FieldRow = ({ label, children, style }) => (
  <div style={{ marginBottom: 14, ...style }}>
    <div style={{ fontSize: 12.5, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>{label}</div>
    {children}
  </div>
);
const SectionTitle = ({ children, color = T.textTert, right }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "18px 0 8px" }}>
    <div style={{ fontSize: 11, fontWeight: 800, color, textTransform: "uppercase", letterSpacing: "0.08em" }}>{children}</div>
    {right}
  </div>
);
const Stat = ({ label, value, color = T.text }) => (
  <div style={{ ...card, padding: "12px 16px", flex: "1 1 120px" }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
    <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: "-0.02em", marginTop: 2 }}>{value}</div>
  </div>
);
const Modal = ({ title, onClose, children, width = 520 }) => {
  useEffect(() => { const f = (e) => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", f); return () => window.removeEventListener("keydown", f); }, [onClose]);
  return (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
    <div onClick={e => e.stopPropagation()} style={{ ...card, width: "100%", maxWidth: width, padding: "22px 24px", maxHeight: "92vh", overflowY: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>{title}</div>
        <button type="button" onClick={onClose} style={{ border: "none", background: T.pillBg, width: 30, height: 30, borderRadius: 9, cursor: "pointer", fontSize: 18, lineHeight: 1 }}>×</button>
      </div>
      {children}
    </div>
  </div>
  );
};

// ── Task row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, showDept, highlighted, mobile, depts, collection, onStatus, onDeadline, onEdit, onDelete }) {
  const dl = task.status === "done" ? null : deadlineInfo(task.deadline);
  const stale = task.status !== "done" && ageDays(task.updated_at) >= 7;
  const done = task.status === "done", doing = task.status === "doing";
  const dept = deptOf(task.department, depts);
  return (
    <div id={`task-${task.id}`} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "11px 12px", borderRadius: 12, marginBottom: 4, flexWrap: mobile ? "wrap" : "nowrap",
      background: highlighted ? T.blue + "12" : dl && (dl.level === "overdue" || dl.level === "critical") ? T.red + "08" : "transparent",
      outline: highlighted ? `1.5px solid ${T.blue}` : "none", transition: "background 0.3s" }}>
      <button type="button" title={done ? "Mark as not done" : "Mark as done"} onClick={() => onStatus(done ? "todo" : "done")}
        style={{ width: 24, height: 24, minWidth: 24, marginTop: 1, borderRadius: "50%", cursor: "pointer",
          border: `2px solid ${done ? T.green : task.priority === "high" ? T.orange : "rgba(60,60,67,0.25)"}`,
          background: done ? T.green : "transparent", color: "#fff", fontSize: 13, lineHeight: 1, fontWeight: 800 }}>
        {done ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div onClick={onEdit} style={{ fontSize: 15, fontWeight: task.priority === "high" && !done ? 700 : 500, color: done ? T.textTert : T.text, textDecoration: done ? "line-through" : "none", cursor: "pointer", wordBreak: "break-word" }}>
          {task.title}
        </div>
        {task.note && !done && <div style={{ fontSize: 13, color: T.textSec, marginTop: 3, whiteSpace: "pre-wrap" }}>{task.note}</div>}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, alignItems: "center" }}>
          {showDept && <Chip color={dept.color}>{dept.short}</Chip>}
          {collection && <span onClick={e => { e.stopPropagation(); goTo({ product: "collection", collectionId: collection.id }); }} title="Open in Collection Tracker" style={{ cursor: "pointer" }}><Chip color={T.text} bg={T.pillBg}>📦 {collection.name}</Chip></span>}
          {task.owner ? <Chip color={T.teal}>👤 {task.owner}</Chip> : !done && <Chip color={T.textTert} bg={T.pillBg}>Unassigned</Chip>}
          {task.priority === "high" && !done && <Chip color={T.orange}>High priority</Chip>}
          {doing && <Chip color={T.blue}>In progress</Chip>}
          {dl && <Chip color={dl.color}>{dl.level === "overdue" || dl.level === "critical" ? "⚠ " : "📅 "}{dl.label}</Chip>}
          {stale && !dl?.level?.match(/overdue|critical/) && <Chip color={T.orange}>Needs attention · {ageDays(task.updated_at)} days idle</Chip>}
          {done && task.completed_at && <Chip color={T.green}>Done {fmtShort(ymd(new Date(task.completed_at)))}</Chip>}
          {(task.files || []).map(f => <FileChip key={f.id} file={f} />)}
        </div>
      </div>
      {!done && (
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", justifyContent: mobile ? "flex-start" : "flex-end", flexBasis: mobile ? "100%" : "auto", order: mobile ? 3 : 0, paddingLeft: mobile ? 36 : 0 }}>
          <input type="date" value={task.deadline || ""} onChange={e => onDeadline(e.target.value)} title="Deadline"
            style={{ ...inputStyle, padding: "5px 8px", fontSize: 12, width: 132, background: "transparent", color: task.deadline ? T.text : T.textTert }} />
          <button type="button" onClick={() => onStatus(doing ? "todo" : "doing")} title={doing ? "Back to To do" : "Mark as in progress"}
            style={{ padding: "5px 11px", borderRadius: 99, fontSize: 11.5, fontWeight: 700, border: `1.5px solid ${doing ? T.blue : "transparent"}`, background: doing ? T.blue + "18" : T.pillBg, color: doing ? T.blue : T.textSec, cursor: "pointer", whiteSpace: "nowrap" }}>
            {doing ? "In progress" : "Start"}
          </button>
          <button type="button" onClick={onEdit} title="Edit" style={{ width: 28, height: 28, borderRadius: 8, border: "none", background: "transparent", cursor: "pointer", fontSize: 14 }}>✎</button>
        </div>
      )}
      <button type="button" onClick={onDelete} title="Delete" style={{ width: 26, height: 26, borderRadius: 8, border: "none", background: "transparent", color: T.textTert, fontSize: 18, cursor: "pointer", lineHeight: 1, order: mobile ? 2 : 0 }}>×</button>
    </div>
  );
}

// ── Task edit modal ───────────────────────────────────────────────────────────
function TaskModal({ task, owners, depts, collections, onSave, onClose, onUpload, onRemoveFile }) {
  const [uploading, setUploading] = useState(false);
  const pick = async (e) => { const files = [...(e.target.files || [])]; e.target.value = ""; if (!files.length) return; setUploading(true); try { for (const f of files) await onUpload(task.id, await readFileB64(f)); } finally { setUploading(false); } };
  const [f, setF] = useState({ title: task.title, note: task.note || "", owner: task.owner || "", priority: task.priority, department: task.department, deadline: task.deadline || "", status: task.status, collection_id: task.collection_id ? String(task.collection_id) : "" });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title="Edit task" onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (f.title.trim()) onSave(f); }}>
        <FieldRow label="Task"><Input value={f.title} onChange={set("title")} autoFocus /></FieldRow>
        <FieldRow label="Notes / what does “done” look like?"><textarea value={f.note} onChange={e => set("note")(e.target.value)} rows={3} style={{ ...inputStyle, width: "100%", resize: "vertical", lineHeight: 1.45 }} /></FieldRow>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FieldRow label="Owner"><Input value={f.owner} onChange={set("owner")} placeholder="Who does it?" list="tk-owners" /></FieldRow>
          <FieldRow label="Deadline"><Input type="date" value={f.deadline} onChange={set("deadline")} /></FieldRow>
          <FieldRow label="Department"><Select value={f.department} onChange={set("department")} options={depts} /></FieldRow>
          <FieldRow label="Priority"><Select value={f.priority} onChange={set("priority")} options={[{ key: "normal", label: "Normal" }, { key: "high", label: "High" }]} /></FieldRow>
          <FieldRow label="Status"><Select value={f.status} onChange={set("status")} options={[{ key: "todo", label: "To do" }, { key: "doing", label: "In progress" }, { key: "done", label: "Done" }]} /></FieldRow>
          {collections.length > 0 && <FieldRow label="Collection (Collection Tracker)"><Select value={f.collection_id} onChange={set("collection_id")} options={[{ key: "", label: "— none —" }, ...collections.map(c => ({ key: String(c.id), label: c.name }))]} /></FieldRow>}
        </div>
        <datalist id="tk-owners">{owners.map(o => <option key={o} value={o} />)}</datalist>
        <FieldRow label="Attachments">
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {(task.files || []).map(f => <FileChip key={f.id} file={f} onRemove={() => onRemoveFile(task.id, f.id)} />)}
            <label style={{ fontSize: 12.5, fontWeight: 600, color: T.blue, cursor: "pointer", padding: "3px 6px" }}>
              {uploading ? "Uploading…" : "+ Add file"}<input type="file" multiple onChange={pick} style={{ display: "none" }} />
            </label>
            <span style={{ fontSize: 11.5, color: T.textTert }}>PDF, images, docs. Max 10 MB each.</span>
          </div>
        </FieldRow>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 6 }}>
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn type="submit" kind="primary" disabled={!f.title.trim()}>Save</Btn>
        </div>
      </form>
    </Modal>
  );
}

// ── Event modal (create + edit) ───────────────────────────────────────────────
function EventModal({ event, date, depts, onSave, onDelete, onClose }) {
  const [f, setF] = useState({
    title: event?.title || "", kind: event?.kind || "meeting", department: event?.department || "",
    start_date: event?.start_date || date || todayYMD(), time: event?.time || "", recurrence: event?.recurrence || "none",
    until: event?.until || "", notes: event?.notes || "",
  });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title={event ? "Edit calendar entry" : "New calendar entry"} onClose={onClose}>
      <form onSubmit={e => { e.preventDefault(); if (f.title.trim() && f.start_date) onSave(f); }}>
        <FieldRow label="Title"><Input value={f.title} onChange={set("title")} placeholder="e.g. Weekly marketing sync" autoFocus /></FieldRow>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <FieldRow label="Type"><Select value={f.kind} onChange={set("kind")} options={[{ key: "meeting", label: "Meeting" }, { key: "reminder", label: "Reminder / milestone" }]} /></FieldRow>
          <FieldRow label="Department"><Select value={f.department} onChange={set("department")} options={[{ key: "", label: "Whole team" }, ...depts]} /></FieldRow>
          <FieldRow label={f.recurrence === "none" ? "Date" : "First date"}><Input type="date" value={f.start_date} onChange={set("start_date")} /></FieldRow>
          <FieldRow label="Time (optional)"><Input type="time" value={f.time} onChange={set("time")} /></FieldRow>
          <FieldRow label="Repeats"><Select value={f.recurrence} onChange={set("recurrence")} options={RECUR} /></FieldRow>
          {f.recurrence !== "none" && <FieldRow label="Until (optional)"><Input type="date" value={f.until} onChange={set("until")} /></FieldRow>}
        </div>
        {f.recurrence !== "none" && f.start_date && (
          <div style={{ fontSize: 12.5, color: T.textSec, marginTop: -6, marginBottom: 12 }}>
            {f.recurrence === "monthly" ? `Every month on the ${parse(f.start_date).getDate()}.` : `${recurLabel(f.recurrence)} on ${WEEKDAYS[(parse(f.start_date).getDay() + 6) % 7]}s.`}
          </div>
        )}
        <FieldRow label="Agenda / notes"><textarea value={f.notes} onChange={e => set("notes")(e.target.value)} rows={3} style={{ ...inputStyle, width: "100%", resize: "vertical", lineHeight: 1.45 }} /></FieldRow>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
          <div>{event && <Btn kind="danger" onClick={() => { if (confirm(`Delete “${event.title}”${event.recurrence !== "none" ? " and all its repeats" : ""}?`)) onDelete(); }}>Delete</Btn>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn type="submit" kind="primary" disabled={!f.title.trim() || !f.start_date}>{event ? "Save" : "Add"}</Btn>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── Department modal (create + edit) ──────────────────────────────────────────
function DeptModal({ dept, taskCount, onSave, onDelete, onClose }) {
  const [f, setF] = useState({ label: dept?.label || "", short: dept?.short || "", color: dept?.color || DEPT_COLORS[0], hint: dept?.hint || "" });
  const set = (k) => (v) => setF(p => ({ ...p, [k]: v }));
  return (
    <Modal title={dept ? "Edit department" : "New department"} onClose={onClose} width={460}>
      <form onSubmit={e => { e.preventDefault(); if (f.label.trim()) onSave({ ...f, short: f.short.trim() || f.label.trim() }); }}>
        <FieldRow label="Name"><Input value={f.label} onChange={set("label")} placeholder="e.g. Customer Service" autoFocus /></FieldRow>
        <FieldRow label="Short name (tabs, chips)"><Input value={f.short} onChange={set("short")} placeholder={f.label.trim() || "Optional"} maxLength={24} /></FieldRow>
        <FieldRow label="Colour">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {DEPT_COLORS.map(c => (
              <button key={c} type="button" onClick={() => set("color")(c)} title={c}
                style={{ width: 30, height: 30, borderRadius: "50%", background: c, border: "none", cursor: "pointer", outline: f.color === c ? `3px solid ${c}55` : "none", boxShadow: f.color === c ? "inset 0 0 0 3px #fff" : "none" }} />
            ))}
          </div>
        </FieldRow>
        <FieldRow label="What belongs here? (shown under the heading)"><Input value={f.hint} onChange={set("hint")} placeholder="e.g. Tickets, returns, reviews" /></FieldRow>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginTop: 6 }}>
          <div>{dept && <Btn kind="danger" onClick={() => { if (confirm(`Delete “${dept.label}”?${taskCount ? ` This also deletes its ${taskCount} task${taskCount === 1 ? "" : "s"}.` : ""} Meetings tagged to it move to “Whole team”.`)) onDelete(); }}>Delete</Btn>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn type="submit" kind="primary" color={f.color} disabled={!f.label.trim()}>{dept ? "Save" : "Create"}</Btn>
          </div>
        </div>
      </form>
    </Modal>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function TaskTracker() {
  const mobile = useIsMobile();
  const [data, setData] = useState({ departments: [], tasks: [], events: [], collections: [] });
  const [collectionFilter, setCollectionFilter] = useState(() => { const h = takeHint("cainte_tk_collection"); return h ? Number(h) : null; });
  // "" = everyone, "__none" = unassigned, otherwise an owner name. Remembered per browser.
  const [personFilter, setPersonFilterState] = useState(() => { try { return localStorage.getItem("cainte_tk_person") || ""; } catch { return ""; } });
  const setPersonFilter = (v) => { setPersonFilterState(v); try { localStorage.setItem("cainte_tk_person", v); } catch {} };
  const [deptModal, setDeptModal] = useState(null); // { dept? } — null = closed, {} = new
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => sessionStorage.getItem("cainte_tk_view") || "overview");
  const [highlight, setHighlight] = useState(null);
  const [editTask, setEditTask] = useState(null);
  const [eventModal, setEventModal] = useState(null); // { event?, date? }
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState(todayYMD);

  const load = async () => {
    try { const r = await api("/api/tk/data"); setData(await r.json()); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  // A stored tab may point at a department that has since been deleted.
  useEffect(() => {
    if (loading) return;
    if (view !== "overview" && view !== "calendar" && !data.departments.some(d => d.key === view)) switchView("overview");
  }, [loading, view, data.departments]);
  const switchView = (v) => { setView(v); sessionStorage.setItem("cainte_tk_view", v); };

  const { events } = data;
  const depts = data.departments;
  const collections = data.collections || [];
  const collectionOf = (id) => collections.find(c => c.id === id) || null;
  // Optional collection filter (set from the Collection Tracker's "Open in Team Tasks").
  const tasks = useMemo(() => data.tasks
    .filter(t => !collectionFilter || t.collection_id === collectionFilter)
    .filter(t => !personFilter || (personFilter === "__none" ? !t.owner : t.owner === personFilter)), [data.tasks, collectionFilter, personFilter]);
  const allOwners = useMemo(() => [...new Set(data.tasks.map(t => t.owner).filter(Boolean))].sort(), [data.tasks]);
  const openUnassigned = data.tasks.some(t => t.status !== "done" && !t.owner);
  // Collection launch dates show up as milestones next to the team's own events.
  const allEvents = useMemo(() => [...events, ...collections.filter(c => c.launch_date && c.status !== "Launched").map(c => ({
    id: `launch-${c.id}`, title: `🚀 Launch: ${c.name}`, kind: "reminder", department: "", start_date: c.launch_date, time: "", recurrence: "none", until: null, notes: "", launch: true, collectionId: c.id,
  }))], [events, collections]);
  const open = useMemo(() => tasks.filter(t => t.status !== "done"), [tasks]);
  const owners = allOwners;
  const sortOpen = (list) => [...list].sort((a, b) => {
    const da = a.deadline ? daysUntil(a.deadline) : 9999, db = b.deadline ? daysUntil(b.deadline) : 9999;
    if (da !== db) return da - db;
    if (a.priority !== b.priority) return a.priority === "high" ? -1 : 1;
    return new Date(b.created_at) - new Date(a.created_at);
  });

  // ── Mutations (server is the source of truth; replace the row from the response) ──
  const json = (r) => r.json();
  const addTask = async (body) => { const t = await api("/api/tk/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(json); setData(d => ({ ...d, tasks: [t, ...d.tasks] })); };
  const updateTask = async (id, patch) => { const t = await api(`/api/tk/tasks/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).then(json); setData(d => ({ ...d, tasks: d.tasks.map(x => x.id === id ? t : x) })); };
  const uploadFile = async (taskId, payload) => {
    const r = await api(`/api/tk/tasks/${taskId}/files`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!r.ok) { alert((await r.json()).error || "Upload failed"); return; }
    const f = await r.json();
    setData(d => ({ ...d, tasks: d.tasks.map(x => x.id === taskId ? { ...x, files: [...(x.files || []), f] } : x) }));
  };
  const removeFile = async (taskId, fileId) => {
    await api(`/api/tk/tasks/${taskId}/files/${fileId}`, { method: "DELETE" });
    setData(d => ({ ...d, tasks: d.tasks.map(x => x.id === taskId ? { ...x, files: (x.files || []).filter(f => f.id !== fileId) } : x) }));
  };
  const deleteTask = async (t) => { if (!confirm(`Delete “${t.title}”?`)) return; await api(`/api/tk/tasks/${t.id}`, { method: "DELETE" }); setData(d => ({ ...d, tasks: d.tasks.filter(x => x.id !== t.id) })); };
  const saveEvent = async (f) => {
    const isEdit = !!eventModal?.event;
    const ev = await api(isEdit ? `/api/tk/events/${eventModal.event.id}` : "/api/tk/events", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }).then(json);
    setData(d => ({ ...d, events: isEdit ? d.events.map(x => x.id === ev.id ? ev : x) : [...d.events, ev] }));
    setEventModal(null);
  };
  const saveDept = async (f) => {
    const isEdit = !!deptModal?.dept;
    const r = await api(isEdit ? `/api/tk/departments/${deptModal.dept.id}` : "/api/tk/departments", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    if (!r.ok) { alert((await r.json()).error || "Could not save department"); return; }
    const d = await r.json();
    setData(x => ({ ...x, departments: isEdit ? x.departments.map(y => y.id === d.id ? d : y) : [...x.departments, d] }));
    setDeptModal(null);
    if (!isEdit) switchView(d.key);
  };
  const deleteDept = async () => {
    const d = deptModal.dept;
    await api(`/api/tk/departments/${d.id}`, { method: "DELETE" });
    await load();
    setDeptModal(null);
    switchView("overview");
  };
  const deleteEvent = async () => { const id = eventModal.event.id; await api(`/api/tk/events/${id}`, { method: "DELETE" }); setData(d => ({ ...d, events: d.events.filter(x => x.id !== id) })); setEventModal(null); };

  const jumpTo = (task) => {
    switchView(task.department); setHighlight(task.id);
    setTimeout(() => { document.getElementById(`task-${task.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50);
    setTimeout(() => setHighlight(null), 2500);
  };

  const rowProps = (t, showDept) => ({
    task: t, showDept, highlighted: highlight === t.id, mobile, depts, collection: collectionOf(t.collection_id),
    onStatus: (s) => updateTask(t.id, { status: s }),
    onDeadline: (v) => updateTask(t.id, { deadline: v || null }),
    onEdit: () => setEditTask(t),
    onDelete: () => deleteTask(t),
  });

  // Upcoming occurrences for the sidebar (next 14 days).
  const upcomingEvents = useMemo(() => expandEvents(allEvents, todayYMD(), addDays(todayYMD(), 14)).slice(0, 6), [allEvents]);

  if (loading) return <div style={{ padding: 60, textAlign: "center", color: T.textSec }}>Loading…</div>;

  const meetingsPanel = (
        <div style={{ ...card, padding: "14px 16px", marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.08em" }}>Next 14 days</div>
            <button type="button" onClick={() => switchView("calendar")} style={{ border: "none", background: "none", color: T.blue, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Calendar ›</button>
          </div>
          {upcomingEvents.length === 0 && <div style={{ fontSize: 13, color: T.textTert }}>No meetings planned. Add weekly or monthly meetings in the calendar.</div>}
          {upcomingEvents.map((ev, i) => {
            const dept = ev.department ? deptOf(ev.department, depts) : null;
            const d = daysUntil(ev.date);
            return (
              <div key={`${ev.id}-${ev.date}`} onClick={() => { if (ev.launch) return goTo({ product: "collection", collectionId: ev.collectionId }); setSelectedDay(ev.date); setCalMonth(new Date(parse(ev.date).getFullYear(), parse(ev.date).getMonth(), 1)); switchView("calendar"); }}
                style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: i ? `1px solid ${T.border}` : "none", cursor: "pointer" }}>
                <div style={{ width: 40, textAlign: "center", flexShrink: 0 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: d === 0 ? T.red : T.textTert, textTransform: "uppercase" }}>{d === 0 ? "Today" : d === 1 ? "Tmrw" : WEEKDAYS[(parse(ev.date).getDay() + 6) % 7]}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: "-0.02em" }}>{parse(ev.date).getDate()}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.kind === "reminder" && !ev.launch ? "🔔 " : ""}{ev.title}</div>
                  <div style={{ fontSize: 12, color: T.textSec }}>{ev.time || "All day"}{dept ? ` · ${dept.short}` : " · Whole team"}{ev.recurrence !== "none" ? ` · ${recurLabel(ev.recurrence).toLowerCase()}` : ""}</div>
                </div>
              </div>
            );
          })}
        </div>
  );

  const tabs = [{ key: "overview", label: "Overview", color: T.text }, ...depts.map(d => ({ key: d.key, label: mobile ? d.short : d.label, color: d.color })), { key: "calendar", label: "📅 Calendar", color: T.text }];

  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", padding: mobile ? "16px 14px 80px" : "22px 28px 100px", display: "flex", gap: 20, flexDirection: mobile ? "column" : "row", alignItems: "flex-start" }}>
      {/* ── Left: deadlines + next meetings ── */}
      <aside style={{ width: mobile ? "100%" : 290, flexShrink: 0, position: mobile ? "static" : "sticky", top: 16 }}>
        <DeadlinePanel open={open} depts={depts} onJump={jumpTo} />
        {!mobile && meetingsPanel}
      </aside>

      {/* ── Right: tabs + content ── */}
      <main style={{ flex: 1, minWidth: 0, width: "100%" }}>
        {collectionFilter && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, background: T.text, color: "#fff", borderRadius: 12, padding: "9px 14px", marginBottom: 12, fontSize: 13.5, fontWeight: 600, flexWrap: "wrap" }}>
            📦 Showing tasks for <span style={{ fontWeight: 800 }}>{collectionOf(collectionFilter)?.name || "collection"}</span>
            <span style={{ opacity: 0.7, fontWeight: 500 }}>· {tasks.filter(t => t.status !== "done").length} open</span>
            <button type="button" onClick={() => goTo({ product: "collection", collectionId: collectionFilter })} style={{ marginLeft: "auto", border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: 99, padding: "4px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Open collection ›</button>
            <button type="button" onClick={() => setCollectionFilter(null)} style={{ border: "none", background: "rgba(255,255,255,0.15)", color: "#fff", borderRadius: 99, padding: "4px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Show all ×</button>
          </div>
        )}
        {allOwners.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.08em", marginRight: 4 }}>👤 Who</span>
            <Pill active={!personFilter} color={T.text} onClick={() => setPersonFilter("")}>Everyone</Pill>
            {allOwners.map(o => {
              const n = data.tasks.filter(t => t.owner === o && t.status !== "done" && (!collectionFilter || t.collection_id === collectionFilter)).length;
              return <Pill key={o} active={personFilter === o} color={T.teal} onClick={() => setPersonFilter(personFilter === o ? "" : o)}>{o}{n > 0 ? ` · ${n}` : ""}</Pill>;
            })}
            {openUnassigned && <Pill active={personFilter === "__none"} color={T.orange} onClick={() => setPersonFilter(personFilter === "__none" ? "" : "__none")}>Unassigned</Pill>}
            {personFilter && <span style={{ fontSize: 12.5, color: T.textSec, marginLeft: 4 }}>Showing {personFilter === "__none" ? "unassigned tasks" : `${personFilter}'s tasks`} everywhere — remembered on this device.</span>}
          </div>
        )}
        <div style={{ display: "flex", gap: 4, background: T.pillBg, borderRadius: 18, padding: 3, marginBottom: 18, flexWrap: "wrap", width: "fit-content", maxWidth: "100%" }}>
          {tabs.map(t => {
            const active = view === t.key;
            const count = depts.some(d => d.key === t.key) ? open.filter(x => x.department === t.key).length : null;
            const overdue = count !== null && open.some(x => x.department === t.key && x.deadline && daysUntil(x.deadline) <= 2);
            return (
              <button key={t.key} type="button" onClick={() => switchView(t.key)}
                style={{ padding: "7px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500, whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 7,
                  background: active ? "#fff" : "transparent", color: active ? T.text : T.textSec, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none", transition: "all 0.15s" }}>
                {t.key !== "overview" && t.key !== "calendar" && <span style={{ width: 8, height: 8, borderRadius: "50%", background: t.color }} />}
                {t.label}
                {count !== null && count > 0 && <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: overdue ? T.red : T.pillBg, color: overdue ? "#fff" : T.textSec }}>{count}</span>}
              </button>
            );
          })}
          <button type="button" onClick={() => setDeptModal({})} title="Add a department"
            style={{ padding: "7px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: "transparent", color: T.blue, whiteSpace: "nowrap" }}>
            + Department
          </button>
        </div>

        {view === "overview" && <Overview tasks={tasks} open={open} depts={depts} collections={collectionFilter ? [] : collections} personFilter={personFilter} onPickPerson={setPersonFilter} sortOpen={sortOpen} owners={owners} onJump={jumpTo} onOpenDept={switchView} rowProps={rowProps} />}
        {depts.some(d => d.key === view) && <DeptView key={view} dept={deptOf(view, depts)} tasks={tasks.filter(t => t.department === view)} owners={owners} sortOpen={sortOpen} onAdd={addTask} collections={collections} defaultCollection={collectionFilter} onEditDept={() => setDeptModal({ dept: deptOf(view, depts) })} rowProps={rowProps} mobile={mobile} />}
        {view === "calendar" && <CalendarView events={allEvents} open={open} depts={depts} month={calMonth} setMonth={setCalMonth} selected={selectedDay} setSelected={setSelectedDay} onNew={(date) => setEventModal({ date })} onEdit={(ev) => ev.launch ? goTo({ product: "collection", collectionId: ev.collectionId }) : setEventModal({ event: ev })} onJump={jumpTo} mobile={mobile} />}
      </main>
      {mobile && <div style={{ width: "100%" }}>{meetingsPanel}</div>}

      {editTask && <TaskModal task={data.tasks.find(t => t.id === editTask.id) || editTask} owners={owners} depts={depts} collections={collections} onUpload={uploadFile} onRemoveFile={removeFile} onClose={() => setEditTask(null)} onSave={async (f) => { await updateTask(editTask.id, { ...f, deadline: f.deadline || null, collection_id: f.collection_id ? Number(f.collection_id) : null }); setEditTask(null); }} />}
      {deptModal && <DeptModal dept={deptModal.dept} taskCount={deptModal.dept ? tasks.filter(t => t.department === deptModal.dept.key).length : 0} onClose={() => setDeptModal(null)} onSave={saveDept} onDelete={deleteDept} />}
      {eventModal && <EventModal event={eventModal.event} date={eventModal.date} depts={depts} onClose={() => setEventModal(null)} onSave={saveEvent} onDelete={deleteEvent} />}
    </div>
  );
}

// ── Sidebar: deadlines grouped by urgency ─────────────────────────────────────
function DeadlinePanel({ open, depts, onJump }) {
  const withDl = open.filter(t => t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline));
  const groups = [
    { key: "overdue", label: "Overdue",      color: T.red,     test: (d) => d < 0 },
    { key: "today",   label: "Today",        color: T.red,     test: (d) => d === 0 },
    { key: "soon",    label: "Next 2 days",  color: T.red,     test: (d) => d > 0 && d <= 2 },
    { key: "week",    label: "This week",    color: T.orange,  test: (d) => d > 2 && d <= 7 },
    { key: "later",   label: "Later",        color: T.textSec, test: (d) => d > 7 },
  ].map(g => ({ ...g, items: withDl.filter(t => g.test(daysUntil(t.deadline))) })).filter(g => g.items.length);
  const critical = withDl.filter(t => daysUntil(t.deadline) <= 2).length;
  const noDl = open.length - withDl.length;
  return (
    <div style={{ ...card, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>Deadlines</div>
        <div style={{ fontSize: 12, color: T.textSec }}>{withDl.length} open</div>
      </div>
      {critical > 0 && (
        <div style={{ background: T.red + "12", color: T.red, borderRadius: 10, padding: "7px 10px", fontSize: 12.5, fontWeight: 700, marginBottom: 8 }}>
          ⚠ {critical} {critical === 1 ? "deadline" : "deadlines"} within 2 days
        </div>
      )}
      {withDl.length === 0 && <div style={{ fontSize: 13, color: T.textTert, marginTop: 6 }}>No open tasks with a deadline.</div>}
      {groups.map(g => (
        <div key={g.key}>
          <div style={{ fontSize: 10.5, fontWeight: 800, color: g.color, textTransform: "uppercase", letterSpacing: "0.08em", margin: "12px 0 4px" }}>{g.label} · {g.items.length}</div>
          {g.items.slice(0, g.key === "later" ? 6 : 50).map(t => {
            const dept = deptOf(t.department, depts), d = daysUntil(t.deadline);
            return (
              <div key={t.id} onClick={() => onJump(t)} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "6px 6px", marginLeft: -6, borderRadius: 9, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = T.bg} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: dept.color, marginTop: 6, flexShrink: 0 }} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>{t.title}</div>
                  <div style={{ fontSize: 11.5, color: T.textSec, marginTop: 1 }}>
                    {dept.short}{t.owner ? ` · ${t.owner}` : ""} · <span style={{ color: g.color, fontWeight: 600 }}>{d < 0 ? `${-d}d overdue` : d === 0 ? "today" : d === 1 ? "tomorrow" : `${fmtShort(t.deadline)} (${d}d)`}</span>
                  </div>
                </div>
              </div>
            );
          })}
          {g.key === "later" && g.items.length > 6 && <div style={{ fontSize: 12, color: T.textTert, paddingLeft: 17 }}>+ {g.items.length - 6} more</div>}
        </div>
      ))}
      {noDl > 0 && <div style={{ fontSize: 12, color: T.textTert, marginTop: 12, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>{noDl} open {noDl === 1 ? "task has" : "tasks have"} no deadline yet.</div>}
    </div>
  );
}

// ── Overview: who does what + department health ───────────────────────────────
function Overview({ tasks, open, depts, collections = [], personFilter = "", onPickPerson, sortOpen, owners, onJump, onOpenDept, rowProps }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const toggleExpand = (o) => setExpanded(p => { const n = new Set(p); n.has(o) ? n.delete(o) : n.add(o); return n; });
  const weekAgo = Date.now() - 7 * 86400000;
  const doneThisWeek = tasks.filter(t => t.status === "done" && t.completed_at && new Date(t.completed_at) > weekAgo).length;
  const overdue = open.filter(t => t.deadline && daysUntil(t.deadline) < 0).length;
  const dueWeek = open.filter(t => t.deadline && daysUntil(t.deadline) >= 0 && daysUntil(t.deadline) <= 7).length;
  const unassigned = open.filter(t => !t.owner).length;
  const focus = sortOpen(open.filter(t => (t.deadline && daysUntil(t.deadline) <= 7) || t.priority === "high")).slice(0, 8);
  const byOwner = [...owners, ""].map(o => ({ owner: o, items: sortOpen(open.filter(t => (t.owner || "") === o)) })).filter(x => x.items.length);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 18 }}>
        <Stat label="Open tasks" value={open.length} />
        <Stat label="Overdue" value={overdue} color={overdue ? T.red : T.text} />
        <Stat label="Due within 7 days" value={dueWeek} color={dueWeek ? T.orange : T.text} />
        <Stat label="Unassigned" value={unassigned} color={unassigned ? T.orange : T.text} />
        <Stat label="Done this week" value={doneThisWeek} color={T.green} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 12 }}>
        {depts.map(d => {
          const items = open.filter(t => t.department === d.key);
          const od = items.filter(t => t.deadline && daysUntil(t.deadline) < 0).length;
          const crit = items.filter(t => t.deadline && daysUntil(t.deadline) >= 0 && daysUntil(t.deadline) <= 2).length;
          const doing = items.filter(t => t.status === "doing").length;
          const next = sortOpen(items).slice(0, 3);
          return (
            <div key={d.key} style={{ ...card, padding: "16px 18px", borderTop: `3px solid ${d.color}`, cursor: "pointer" }} onClick={() => onOpenDept(d.key)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em", color: d.color }}>{d.label}</div>
                <div style={{ fontSize: 12.5, color: T.textSec }}>{items.length} open</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, minHeight: 22 }}>
                {od > 0 && <Chip color={T.red}>{od} overdue</Chip>}
                {crit > 0 && <Chip color={T.red}>{crit} due ≤ 2 days</Chip>}
                {doing > 0 && <Chip color={T.blue}>{doing} in progress</Chip>}
                {items.length === 0 && <Chip color={T.green}>All clear</Chip>}
              </div>
              <div style={{ marginTop: 10 }}>
                {next.map(t => {
                  const dl = deadlineInfo(t.deadline);
                  return (
                    <div key={t.id} onClick={e => { e.stopPropagation(); onJump(t); }} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "5px 0", borderTop: `1px solid ${T.border}` }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500 }}>{t.title}</span>
                      {dl && <span style={{ color: dl.color, fontWeight: 600, whiteSpace: "nowrap", fontSize: 12 }}>{daysUntil(t.deadline) < 0 ? "overdue" : daysUntil(t.deadline) === 0 ? "today" : fmtShort(t.deadline)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {collections.length > 0 && (
        <div style={{ ...card, padding: "12px 16px 14px", marginTop: 16 }}>
          <SectionTitle right={<span style={{ fontSize: 12, color: T.textTert }}>Synced with Collection Tracker</span>}>Collections</SectionTitle>
          {collections.map(c => {
            const all = tasks.filter(t => t.collection_id === c.id), done = all.filter(t => t.status === "done").length;
            const od = all.filter(t => t.status !== "done" && t.deadline && daysUntil(t.deadline) < 0).length;
            const pct = all.length ? Math.round(done / all.length * 100) : 0;
            const launch = c.launch_date ? daysUntil(c.launch_date) : null;
            return (
              <div key={c.id} onClick={() => goTo({ product: "collection", collectionId: c.id })} style={{ display: "flex", alignItems: "center", gap: 14, padding: "9px 0", borderTop: `1px solid ${T.border}`, cursor: "pointer", flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 180px", minWidth: 0 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 700 }}>📦 {c.name}</div>
                  <div style={{ fontSize: 12, color: T.textSec }}>{c.status}{launch !== null ? ` · launch ${fmtShort(c.launch_date)}${launch >= 0 ? ` (${launch}d)` : ""}` : ""}{c.launch_date && launch < 0 && c.status !== "Launched" ? " · launch date passed" : ""}</div>
                </div>
                <div style={{ flex: "2 1 200px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, height: 8, borderRadius: 99, background: T.pillBg, overflow: "hidden" }}><div style={{ width: `${pct}%`, height: "100%", background: pct === 100 ? T.green : T.blue, transition: "width 0.3s" }} /></div>
                  <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 74, textAlign: "right" }}>{all.length ? `${done}/${all.length} · ${pct}%` : "no tasks"}</span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {od > 0 && <Chip color={T.red}>{od} overdue</Chip>}
                  {all.length - done > 0 && <Chip color={T.textSec} bg={T.pillBg}>{all.length - done} open</Chip>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {focus.length > 0 && (
        <div style={{ ...card, padding: "12px 10px 8px", marginTop: 16 }}>
          <SectionTitle color={T.red}>Focus now — due within 7 days or high priority</SectionTitle>
          {focus.map(t => <TaskRow key={t.id} {...rowProps(t, true)} />)}
        </div>
      )}

      <div style={{ ...card, padding: "12px 10px 8px", marginTop: 16 }}>
        <SectionTitle right={!personFilter && <span style={{ fontSize: 12, color: T.textTert }}>Click a name to see only their tasks</span>}>Who is doing what</SectionTitle>
        {byOwner.length === 0 && <div style={{ fontSize: 13, color: T.textTert, padding: "0 6px 10px" }}>No open tasks yet. Pick a department tab and add the first one.</div>}
        {byOwner.map(({ owner, items }) => {
          const showAll = !!personFilter || expanded.has(owner);
          const shown = showAll ? items : items.slice(0, 5);
          return (
            <div key={owner || "_"} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => onPickPerson && onPickPerson(owner || "__none")} title="Show only this person's tasks"
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, border: "none", background: "transparent", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
                  <span style={{ width: 26, height: 26, borderRadius: "50%", background: owner ? T.teal : T.pillBg, color: owner ? "#fff" : T.textTert, fontSize: 12, fontWeight: 800, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{owner ? owner.slice(0, 1).toUpperCase() : "?"}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{owner || "Unassigned"}</span>
                </button>
                <span style={{ fontSize: 12.5, color: T.textSec }}>{items.length} open{items.some(t => t.deadline && daysUntil(t.deadline) < 0) ? " · has overdue" : ""}</span>
                {items.length > 5 && !personFilter && (
                  <button type="button" onClick={() => toggleExpand(owner)} style={{ marginLeft: "auto", border: "none", background: T.pillBg, color: T.blue, borderRadius: 99, padding: "4px 11px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    {showAll ? "Show fewer" : `Show all ${items.length}`}
                  </button>
                )}
              </div>
              {shown.map(t => <TaskRow key={t.id} {...rowProps(t, true)} />)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Department view ───────────────────────────────────────────────────────────
function DeptView({ dept, tasks, owners, sortOpen, onAdd, onEditDept, rowProps, mobile, collections = [], defaultCollection = null }) {
  const [title, setTitle] = useState("");
  const [deadline, setDeadline] = useState("");
  const [owner, setOwner] = useState("");
  const [high, setHigh] = useState(false);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);
  const [collectionId, setCollectionId] = useState(defaultCollection ? String(defaultCollection) : "");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const titleRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await onAdd({ department: dept.key, title: title.trim(), deadline: deadline || null, owner: owner.trim(), priority: high ? "high" : "normal", note: note.trim(), collection_id: collectionId ? Number(collectionId) : null });
    setTitle(""); setDeadline(""); setHigh(false); setNote(""); setShowNote(false);
    titleRef.current?.focus();
  };

  const deptOwners = [...new Set(tasks.filter(t => t.status !== "done").map(t => t.owner).filter(Boolean))].sort();
  const filtered = ownerFilter === "all" ? tasks : tasks.filter(t => (t.owner || "") === (ownerFilter === "none" ? "" : ownerFilter));
  const open = filtered.filter(t => t.status !== "done");
  const urgent = sortOpen(open.filter(t => t.deadline && daysUntil(t.deadline) <= 2));
  const doing = sortOpen(open.filter(t => t.status === "doing" && !urgent.includes(t)));
  const todo = sortOpen(open.filter(t => t.status === "todo" && !urgent.includes(t)));
  const done = filtered.filter(t => t.status === "done").sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
  const weekAgo = Date.now() - 7 * 86400000;
  const allOpen = tasks.filter(t => t.status !== "done");

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.03em", color: dept.color }}>{dept.label}</div>
          <button type="button" onClick={onEditDept} title="Rename, recolour or delete this department"
            style={{ padding: "4px 10px", borderRadius: 99, border: `1px solid ${T.border}`, background: "#fff", color: T.textSec, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>✎ Edit department</button>
        </div>
        {dept.hint && <div style={{ fontSize: 13.5, color: T.textSec, marginTop: 2 }}>{dept.hint}</div>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 16 }}>
        <Stat label="Open" value={allOpen.length} />
        <Stat label="In progress" value={allOpen.filter(t => t.status === "doing").length} color={T.blue} />
        <Stat label="Due ≤ 2 days" value={allOpen.filter(t => t.deadline && daysUntil(t.deadline) <= 2).length} color={allOpen.some(t => t.deadline && daysUntil(t.deadline) <= 2) ? T.red : T.text} />
        <Stat label="Done this week" value={tasks.filter(t => t.status === "done" && t.completed_at && new Date(t.completed_at) > weekAgo).length} color={T.green} />
      </div>

      <form onSubmit={submit} style={{ ...card, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input ref={titleRef} value={title} onChange={e => setTitle(e.target.value)} placeholder={`New ${dept.short.toLowerCase()} task…`} autoFocus
            style={{ ...inputStyle, flex: "1 1 240px", fontSize: 15 }} onFocus={e => e.target.style.borderColor = dept.color} onBlur={e => e.target.style.borderColor = "rgba(60,60,67,0.1)"} />
          <input value={owner} onChange={e => setOwner(e.target.value)} placeholder="Owner" list="tk-owners-add" style={{ ...inputStyle, width: mobile ? "100%" : 140 }} />
          <datalist id="tk-owners-add">{owners.map(o => <option key={o} value={o} />)}</datalist>
          <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} title="Deadline (optional)" style={{ ...inputStyle, width: mobile ? "100%" : 150, color: deadline ? T.text : T.textTert }} />
          <button type="button" onClick={() => setHigh(h => !h)} title="High priority"
            style={{ padding: "0 13px", borderRadius: 12, fontSize: 13, fontWeight: 700, border: `1.5px solid ${high ? T.orange : "rgba(60,60,67,0.1)"}`, background: high ? T.orange + "18" : T.bg, color: high ? T.orange : T.textSec, cursor: "pointer" }}>
            {high ? "★ High" : "☆ High"}
          </button>
          <button type="button" onClick={() => setShowNote(s => !s)} title="Add a note"
            style={{ padding: "0 13px", borderRadius: 12, fontSize: 13, fontWeight: 700, border: `1.5px solid ${showNote ? T.blue : "rgba(60,60,67,0.1)"}`, background: showNote ? T.blue + "14" : T.bg, color: showNote ? T.blue : T.textSec, cursor: "pointer" }}>
            📝
          </button>
          <Btn type="submit" kind="primary" color={dept.color} disabled={!title.trim()}>Add</Btn>
        </div>
        {collections.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12.5, color: T.textSec }}>
            📦 Collection:
            <select value={collectionId} onChange={e => setCollectionId(e.target.value)} style={{ ...inputStyle, padding: "5px 9px", fontSize: 12.5, width: "auto", background: collectionId ? T.text + "10" : T.bg }}>
              <option value="">— none —</option>
              {collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        {showNote && <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="What does “done” look like? Links, context, acceptance criteria…" style={{ ...inputStyle, width: "100%", marginTop: 8, resize: "vertical", lineHeight: 1.45 }} />}
      </form>

      {deptOwners.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          <Pill active={ownerFilter === "all"} color={dept.color} onClick={() => setOwnerFilter("all")}>Everyone</Pill>
          {deptOwners.map(o => <Pill key={o} active={ownerFilter === o} color={dept.color} onClick={() => setOwnerFilter(o)}>{o}</Pill>)}
          {allOpen.some(t => !t.owner) && <Pill active={ownerFilter === "none"} color={dept.color} onClick={() => setOwnerFilter("none")}>Unassigned</Pill>}
        </div>
      )}

      <div style={{ ...card, padding: "6px 10px 10px" }}>
        {open.length === 0 && <div style={{ padding: "26px 10px", textAlign: "center", color: T.textTert, fontSize: 14 }}>Nothing open{ownerFilter !== "all" ? " for this filter" : ""}. 🎉</div>}
        {urgent.length > 0 && <><SectionTitle color={T.red}>⚠ Overdue & due within 2 days · {urgent.length}</SectionTitle>{urgent.map(t => <TaskRow key={t.id} {...rowProps(t)} />)}</>}
        {doing.length > 0 && <><SectionTitle color={T.blue}>In progress · {doing.length}</SectionTitle>{doing.map(t => <TaskRow key={t.id} {...rowProps(t)} />)}</>}
        {todo.length > 0 && <><SectionTitle>To do · {todo.length}</SectionTitle>{todo.map(t => <TaskRow key={t.id} {...rowProps(t)} />)}</>}
        {done.length > 0 && (
          <>
            <SectionTitle color={T.green} right={<button type="button" onClick={() => setShowDone(s => !s)} style={{ border: "none", background: "none", color: T.blue, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{showDone ? "Hide" : "Show"}</button>}>Done · {done.length}</SectionTitle>
            {showDone && done.slice(0, 40).map(t => <TaskRow key={t.id} {...rowProps(t)} />)}
          </>
        )}
      </div>
    </div>
  );
}

// ── Calendar ──────────────────────────────────────────────────────────────────
function CalendarView({ events, open, depts, month, setMonth, selected, setSelected, onNew, onEdit, onJump, mobile }) {
  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1), startOffset = (first.getDay() + 6) % 7;
  const dim = new Date(y, m + 1, 0).getDate();
  const gridStart = addDays(ymd(first), -startOffset);
  const cells = Array.from({ length: Math.ceil((startOffset + dim) / 7) * 7 }, (_, i) => addDays(gridStart, i));
  const occ = useMemo(() => expandEvents(events, cells[0], cells[cells.length - 1]), [events, cells[0], cells[cells.length - 1]]);
  const byDay = (d) => occ.filter(o => o.date === d);
  const dlByDay = (d) => open.filter(t => t.deadline === d);
  const today = todayYMD();
  const selEvents = byDay(selected), selDl = dlByDay(selected);

  return (
    <div style={{ display: "flex", gap: 16, flexDirection: mobile ? "column" : "row", alignItems: "flex-start" }}>
      <div style={{ ...card, padding: "14px 14px 10px", flex: 1, minWidth: 0, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button type="button" onClick={() => setMonth(new Date(y, m - 1, 1))} style={navBtn}>‹</button>
            <div style={{ minWidth: 150, textAlign: "center", fontSize: 16, fontWeight: 800, letterSpacing: "-0.02em" }}>{MONTHS[m]} {y}</div>
            <button type="button" onClick={() => setMonth(new Date(y, m + 1, 1))} style={navBtn}>›</button>
            <Btn small onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(today); }}>Today</Btn>
          </div>
          <Btn small kind="primary" onClick={() => onNew(selected)}>+ Add</Btn>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
          {WEEKDAYS.map(w => <div key={w} style={{ fontSize: 10.5, fontWeight: 800, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.06em", textAlign: "center", padding: "2px 0 6px" }}>{w}</div>)}
          {cells.map(d => {
            const inMonth = d.slice(0, 7) === monthKey(month), isSel = d === selected, isToday = d === today;
            const evs = byDay(d), dls = dlByDay(d);
            return (
              <div key={d} onClick={() => setSelected(d)} onDoubleClick={() => onNew(d)}
                style={{ minHeight: mobile ? 54 : 84, borderRadius: 10, padding: mobile ? "4px 4px" : "5px 6px", cursor: "pointer", background: isSel ? T.blue + "10" : inMonth ? T.bg : "transparent",
                  outline: isSel ? `1.5px solid ${T.blue}` : "none", opacity: inMonth ? 1 : 0.45, overflow: "hidden" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 12, fontWeight: isToday ? 800 : 600, color: isToday ? "#fff" : T.text, background: isToday ? T.red : "transparent", borderRadius: 99, width: 20, height: 20, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{parse(d).getDate()}</span>
                  {dls.length > 0 && <span title={`${dls.length} deadline(s)`} style={{ fontSize: 10, fontWeight: 800, color: d < today ? T.red : T.orange }}>⚑{dls.length}</span>}
                </div>
                {!mobile && evs.slice(0, 3).map(ev => {
                  const c = ev.department ? deptOf(ev.department, depts).color : T.text;
                  return <div key={`${ev.id}-${ev.date}`} onClick={e => { e.stopPropagation(); onEdit(ev); }} title={ev.title}
                    style={{ fontSize: 10.5, fontWeight: 600, marginTop: 3, padding: "2px 5px", borderRadius: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                      background: ev.kind === "meeting" ? c : "transparent", color: ev.kind === "meeting" ? "#fff" : c, border: ev.kind === "meeting" ? "none" : `1px solid ${c}` }}>
                    {ev.time ? `${ev.time} ` : ""}{ev.title}
                  </div>;
                })}
                {!mobile && evs.length > 3 && <div style={{ fontSize: 10, color: T.textTert, marginTop: 2 }}>+{evs.length - 3}</div>}
                {mobile && evs.length > 0 && <div style={{ display: "flex", gap: 2, marginTop: 4, flexWrap: "wrap" }}>{evs.slice(0, 4).map(ev => <span key={`${ev.id}-${ev.date}`} style={{ width: 6, height: 6, borderRadius: "50%", background: ev.department ? deptOf(ev.department, depts).color : T.text }} />)}</div>}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10, fontSize: 11.5, color: T.textSec, alignItems: "center" }}>
          {depts.map(d => <span key={d.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: d.color }} />{d.short}</span>)}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: T.text }} />Whole team</span>
          <span>· filled = meeting, outlined = reminder, ⚑ = task deadline · double-click a day to add</span>
        </div>
      </div>

      <div style={{ ...card, padding: "14px 16px", width: mobile ? "100%" : 300, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-0.02em" }}>{fmtLong(selected)}{selected === today ? " · Today" : ""}</div>
        <div style={{ marginTop: 10 }}>
          {selEvents.length === 0 && selDl.length === 0 && <div style={{ fontSize: 13, color: T.textTert }}>Nothing on this day.</div>}
          {selEvents.map(ev => {
            const c = ev.department ? deptOf(ev.department, depts).color : T.text;
            return (
              <div key={`${ev.id}-${ev.date}`} onClick={() => onEdit(ev)} style={{ borderLeft: `3px solid ${c}`, padding: "6px 10px", marginBottom: 8, background: T.bg, borderRadius: 8, cursor: "pointer" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{ev.kind === "reminder" && !ev.launch ? "🔔 " : ""}{ev.title}</div>
                <div style={{ fontSize: 12, color: T.textSec }}>{ev.time || "All day"} · {ev.department ? deptOf(ev.department, depts).short : "Whole team"}{ev.recurrence !== "none" ? ` · ${recurLabel(ev.recurrence)}` : ""}</div>
                {ev.notes && <div style={{ fontSize: 12.5, color: T.textSec, marginTop: 4, whiteSpace: "pre-wrap" }}>{ev.notes}</div>}
              </div>
            );
          })}
          {selDl.length > 0 && <div style={{ fontSize: 10.5, fontWeight: 800, color: T.orange, textTransform: "uppercase", letterSpacing: "0.08em", margin: "10px 0 4px" }}>Task deadlines</div>}
          {selDl.map(t => (
            <div key={t.id} onClick={() => onJump(t)} style={{ display: "flex", gap: 8, alignItems: "center", padding: "5px 0", cursor: "pointer", fontSize: 13.5 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: deptOf(t.department, depts).color }} />
              <span style={{ flex: 1, fontWeight: 600 }}>{t.title}</span>
              {t.owner && <span style={{ fontSize: 12, color: T.textSec }}>{t.owner}</span>}
            </div>
          ))}
        </div>
        <Btn small kind="primary" onClick={() => onNew(selected)} style={{ marginTop: 12, width: "100%" }}>+ Add meeting or reminder</Btn>
      </div>
    </div>
  );
}
const navBtn = { width: 30, height: 30, borderRadius: 9, border: "none", background: T.pillBg, cursor: "pointer", fontSize: 17, lineHeight: 1, color: T.text };
