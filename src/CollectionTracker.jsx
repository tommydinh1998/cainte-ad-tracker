import { useEffect, useMemo, useState } from "react";
import { T, Chip } from "./theme.jsx";

// ── Constants ────────────────────────────────────────────────────────────────
const GRAY = "#8E8E93";
const COLLECTION_STATUSES = ["Planning", "Samples", "Content", "Marketing", "Ready", "Launched", "On hold"];
const COLLECTION_COLOR = { Planning: GRAY, Samples: T.orange, Content: T.purple, Marketing: T.blue, Ready: T.green, Launched: T.text, "On hold": T.red };

const SAMPLE_STATUSES = ["Ordered", "In transit", "Received"];
const SAMPLE_COLOR = { Ordered: GRAY, "In transit": T.orange, Received: T.green };

const CONTENT_TYPES = ["Product photos", "Campaign shoot", "Social content", "Video content", "E-commerce images", "Other"];
const CONTENT_STATUSES = ["Not started", "Planned", "In progress", "Done"];
const MARKETING_TYPES = ["Teaser", "Campaign start", "Influencer seeding", "Paid content", "Newsletter", "Website update", "Launch day", "Other"];
const MARKETING_STATUSES = ["Planned", "In progress", "Done"];
const TASK_STATUSES = ["To do", "In progress", "Done"];
const PRIORITIES = ["Low", "Medium", "High"];
const GENERIC_COLOR = { "Not started": GRAY, Planned: T.blue, "In progress": T.orange, Done: T.green, "To do": GRAY, Low: GRAY, Medium: T.orange, High: T.red };

const statusColor = (v) => COLLECTION_COLOR[v] || SAMPLE_COLOR[v] || GENERIC_COLOR[v] || GRAY;

const EVENT_TYPES = {
  launch:    { label: "Launch",           color: T.text },
  sample:    { label: "Sample arrival",   color: T.orange },
  content:   { label: "Content deadline", color: T.purple },
  marketing: { label: "Marketing",        color: T.blue },
  task:      { label: "Task deadline",    color: T.green },
};

// ── Date helpers ─────────────────────────────────────────────────────────────
const iso = (v) => (v ? String(v).slice(0, 10) : "");
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtD = (v) => {
  if (!v) return "—";
  const d = new Date(iso(v));
  return isNaN(d) ? "—" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};
const daysUntil = (v) => (v ? Math.round((new Date(iso(v)) - new Date(todayISO())) / 86400000) : null);

// ── Entity configs (drive tables + modal forms) ──────────────────────────────
const SECTIONS = {
  products: {
    title: "Products", singular: "product",
    fields: [
      { key: "name", label: "Product name", type: "text", required: true },
      { key: "sku", label: "SKU / style no.", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [["name", "Product"], ["sku", "SKU"], ["category", "Category"], ["notes", "Notes"]],
  },
  samples: {
    title: "Samples", singular: "sample",
    fields: [
      { key: "product_name", label: "Product / sample", type: "text", required: true },
      { key: "status", label: "Status", type: "segment", options: SAMPLE_STATUSES },
      { key: "expected_date", label: "Expected arrival", type: "date" },
      { key: "received_date", label: "Received date", type: "date" },
      { key: "comments", label: "Comments", type: "textarea" },
    ],
    columns: [["product_name", "Sample"], ["status", "Status", "badge"], ["expected_date", "Expected", "date"], ["received_date", "Received", "date"], ["comments", "Comments"]],
  },
  content_items: {
    title: "Content & Photoshoots", singular: "content item",
    fields: [
      { key: "type", label: "Type", type: "select", options: CONTENT_TYPES },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "deadline", label: "Deadline", type: "date" },
      { key: "status", label: "Status", type: "segment", options: CONTENT_STATUSES },
      { key: "owner", label: "Responsible", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [["type", "Type"], ["title", "Title"], ["deadline", "Deadline", "date"], ["status", "Status", "badge"], ["owner", "Responsible"]],
  },
  marketing_activities: {
    title: "Marketing Timeline", singular: "activity",
    fields: [
      { key: "type", label: "Activity", type: "select", options: MARKETING_TYPES },
      { key: "title", label: "Title", type: "text", required: true },
      { key: "activity_date", label: "Date", type: "date" },
      { key: "status", label: "Status", type: "segment", options: MARKETING_STATUSES },
      { key: "owner", label: "Responsible", type: "text" },
      { key: "notes", label: "Notes", type: "textarea" },
    ],
    columns: [["activity_date", "Date", "date"], ["type", "Activity"], ["title", "Title"], ["status", "Status", "badge"], ["owner", "Responsible"]],
  },
  tasks: {
    title: "Tasks", singular: "task",
    fields: [
      { key: "title", label: "Task", type: "text", required: true },
      { key: "owner", label: "Responsible", type: "text" },
      { key: "deadline", label: "Deadline", type: "date" },
      { key: "status", label: "Status", type: "segment", options: TASK_STATUSES },
      { key: "priority", label: "Priority", type: "segment", options: PRIORITIES },
    ],
    columns: [["title", "Task"], ["owner", "Responsible"], ["deadline", "Deadline", "date"], ["status", "Status", "badge"], ["priority", "Priority", "badge"]],
  },
};

const COLLECTION_FIELDS = [
  { key: "name", label: "Collection name", type: "text", required: true },
  { key: "launch_date", label: "Launch date", type: "date" },
  { key: "status", label: "Status", type: "segment", options: COLLECTION_STATUSES },
  { key: "owners", label: "Responsible (comma-separated)", type: "text" },
  { key: "description", label: "Description", type: "textarea" },
];

// ── API ──────────────────────────────────────────────────────────────────────
const jreq = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ctApi = {
  data: () => fetch("/api/ct/data").then((r) => r.json()),
  createCollection: (b) => fetch("/api/ct/collections", jreq("POST", b)).then((r) => r.json()),
  createChild: (cid, key, b) => fetch(`/api/ct/collections/${cid}/${key}`, jreq("POST", b)).then((r) => r.json()),
  update: (key, id, b) => fetch(`/api/ct/${key}/${id}`, jreq("PUT", b)).then((r) => r.json()),
  remove: (key, id) => fetch(`/api/ct/${key}/${id}`, { method: "DELETE" }),
  createIdea: (b) => fetch("/api/ct/ideas", jreq("POST", b)).then((r) => r.json()),
  uploadIdeaFile: (ideaId, f) => fetch(`/api/ct/ideas/${ideaId}/files`, jreq("POST", { filename: f.name, mimetype: f.type, dataBase64: f.dataBase64 })).then((r) => r.json()),
  removeIdeaFile: (id) => fetch(`/api/ct/idea-files/${id}`, { method: "DELETE" }),
};

// ── Image staging (Inspiration bank) ─────────────────────────────────────────
const MAX_FILE_MB = 10;
const fileToStaged = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, dataBase64: String(reader.result).split(",")[1] || "" });
  reader.onerror = reject;
  reader.readAsDataURL(file);
});
const linkDomain = (url) => {
  try { return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, ""); }
  catch { return url; }
};
const linkHref = (url) => (/^https?:\/\//.test(url) ? url : `https://${url}`);

// ── Shared styles (mirrors InfluencerTracker) ────────────────────────────────
const smallInput = { width: "100%", background: T.bg, border: "1.5px solid rgba(60,60,67,0.1)", borderRadius: 10, padding: "10px 13px", color: T.text, fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit", transition: "border-color 0.15s" };
const textareaStyle = { ...smallInput, padding: "13px 15px", fontSize: 15, borderRadius: 12, lineHeight: 1.55, resize: "none" };
const focusBlue = { onFocus: (e) => (e.target.style.borderColor = T.blue), onBlur: (e) => (e.target.style.borderColor = "rgba(60,60,67,0.1)") };
const selectStyle = { background: T.inputBg, border: "none", borderRadius: 12, padding: "7px 12px", color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit", cursor: "pointer" };
const overlay = { position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.40)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" };
const modalCard = { background: "#fff", borderRadius: 22, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: "30px 28px 32px", boxShadow: "0 24px 80px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.05)" };
const card = { background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 0 0 0.5px rgba(0,0,0,0.04)" };

const FormLabel = ({ children }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: T.textSec, marginBottom: 8 }}>{children}</div>
);

const Segmented = ({ options, value, onChange, colorFor }) => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {options.map((opt) => {
      const active = value === opt;
      const c = colorFor ? colorFor(opt) : T.blue;
      return (
        <button key={opt} onClick={() => onChange(opt)} type="button"
          style={{ flex: "1 1 0", minWidth: 78, padding: "10px 8px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: active ? c : T.bg, color: active ? "#fff" : T.textSec, boxShadow: active ? `0 4px 14px ${c}45` : "none", transition: "all 0.15s" }}>
          {opt}
        </button>
      );
    })}
  </div>
);

// Generic add/edit modal driven by a field config
function EntityModal({ title, fields, initial = {}, onSubmit, onDelete, onClose, submitLabel = "Save" }) {
  const [form, setForm] = useState(() => {
    const f = {};
    for (const field of fields) {
      let v = initial[field.key];
      if (field.type === "date") v = v ? iso(v) : "";
      f[field.key] = v ?? (field.type === "segment" || field.type === "select" ? field.options[0] : "");
    }
    return f;
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const valid = fields.every((f) => !f.required || String(form[f.key] || "").trim());

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try { await onSubmit(form); } finally { setBusy(false); }
  };

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</div>
          <button onClick={onClose} style={{ background: T.pillBg, border: "none", borderRadius: 99, width: 30, height: 30, cursor: "pointer", color: T.textSec, fontSize: 13 }}>✕</button>
        </div>
        {fields.map((f) => (
          <div key={f.key} style={{ marginBottom: 18 }}>
            <FormLabel>{f.label}{f.required && <span style={{ color: T.red, marginLeft: 3 }}>*</span>}</FormLabel>
            {f.type === "segment" ? (
              <Segmented options={f.options} value={form[f.key]} onChange={(v) => set(f.key, v)} colorFor={statusColor} />
            ) : f.type === "select" ? (
              <select value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} style={{ ...smallInput, cursor: "pointer" }}>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "textarea" ? (
              <textarea rows={3} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} style={textareaStyle} {...focusBlue} />
            ) : (
              <input type={f.type === "date" ? "date" : "text"} value={form[f.key]} onChange={(e) => set(f.key, e.target.value)} style={smallInput} {...focusBlue} />
            )}
          </div>
        ))}
        <div style={{ display: "flex", gap: 10, marginTop: 26 }}>
          {onDelete && (
            <button onClick={() => window.confirm("Delete this? This cannot be undone.") && onDelete()}
              style={{ background: T.red + "14", border: "none", borderRadius: 14, color: T.red, padding: "14px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Delete
            </button>
          )}
          <button onClick={submit} disabled={!valid || busy}
            style={{ flex: 1, background: valid ? T.blue : T.pillBg, border: "none", borderRadius: 14, color: valid ? "#fff" : T.textTert, padding: "14px 0", fontSize: 16, fontWeight: 700, cursor: valid ? "pointer" : "default", boxShadow: valid ? `0 4px 18px ${T.blue}40` : "none" }}>
            {busy ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Inspiration-bank modal: fields + image upload (staged locally, sent on save)
function IdeaModal({ initial, existingFiles, onSubmit, onDelete, onDeleteFile, onClose }) {
  const isNew = !initial;
  const [form, setForm] = useState({
    title: initial?.title || "", link: initial?.link || "", category: initial?.category || "",
    notes: initial?.notes || "", added_by: initial?.added_by || "",
  });
  const [staged, setStaged] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const valid = form.title.trim().length > 0;

  const pickFiles = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    const ok = [];
    for (const f of files) {
      if (f.size > MAX_FILE_MB * 1048576) { alert(`${f.name} is larger than ${MAX_FILE_MB} MB and was skipped.`); continue; }
      ok.push(await fileToStaged(f));
    }
    setStaged((p) => [...p, ...ok]);
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try { await onSubmit(form, staged); } finally { setBusy(false); }
  };

  const thumb = { width: 74, height: 74, objectFit: "cover", borderRadius: 10, display: "block" };
  const thumbWrap = { position: "relative", flexShrink: 0 };
  const thumbX = { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 99, border: "none", background: T.text, color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: 1 };

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalCard}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{isNew ? "New Idea" : "Edit Idea"}</div>
          <button onClick={onClose} style={{ background: T.pillBg, border: "none", borderRadius: 99, width: 30, height: 30, cursor: "pointer", color: T.textSec, fontSize: 13 }}>✕</button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Title<span style={{ color: T.red, marginLeft: 3 }}>*</span></FormLabel>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Chunky chain necklace" style={smallInput} {...focusBlue} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <FormLabel>Link <span style={{ color: T.textTert, fontWeight: 400 }}>— webshop, Pinterest, Instagram…</span></FormLabel>
          <input value={form.link} onChange={(e) => set("link", e.target.value)} placeholder="https://…" style={smallInput} {...focusBlue} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 18 }}>
          <div>
            <FormLabel>Category</FormLabel>
            <input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="e.g. Necklaces" style={smallInput} {...focusBlue} />
          </div>
          <div>
            <FormLabel>Added by</FormLabel>
            <input value={form.added_by} onChange={(e) => set("added_by", e.target.value)} placeholder="Your name" style={smallInput} {...focusBlue} />
          </div>
        </div>
        <div style={{ marginBottom: 18 }}>
          <FormLabel>Notes</FormLabel>
          <textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="What do you like about it?" style={textareaStyle} {...focusBlue} />
        </div>

        <div style={{ marginBottom: 6 }}>
          <FormLabel>Images</FormLabel>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
            {(existingFiles || []).map((f) => (
              <div key={f.id} style={thumbWrap}>
                <img src={`/api/ct/idea-files/${f.id}`} alt={f.filename} style={thumb} />
                <button title="Remove image" onClick={() => window.confirm("Remove this image?") && onDeleteFile(f.id)} style={thumbX}>✕</button>
              </div>
            ))}
            {staged.map((f, i) => (
              <div key={i} style={thumbWrap}>
                <img src={`data:${f.type};base64,${f.dataBase64}`} alt={f.name} style={{ ...thumb, opacity: 0.85 }} />
                <button title="Remove image" onClick={() => setStaged((p) => p.filter((_, j) => j !== i))} style={thumbX}>✕</button>
              </div>
            ))}
            <label style={{ width: 74, height: 74, borderRadius: 10, border: `1.5px dashed rgba(60,60,67,0.25)`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: T.blue, fontSize: 22, background: T.bg }}>
              +
              <input type="file" accept="image/*" multiple onChange={pickFiles} style={{ display: "none" }} />
            </label>
          </div>
          <div style={{ fontSize: 11, color: T.textTert, marginTop: 8 }}>Max {MAX_FILE_MB} MB per image.</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {onDelete && (
            <button onClick={() => window.confirm("Delete this idea and its images?") && onDelete()}
              style={{ background: T.red + "14", border: "none", borderRadius: 14, color: T.red, padding: "14px 20px", fontSize: 15, fontWeight: 600, cursor: "pointer" }}>
              Delete
            </button>
          )}
          <button onClick={submit} disabled={!valid || busy}
            style={{ flex: 1, background: valid ? T.blue : T.pillBg, border: "none", borderRadius: 14, color: valid ? "#fff" : T.textTert, padding: "14px 0", fontSize: 16, fontWeight: 700, cursor: valid ? "pointer" : "default", boxShadow: valid ? `0 4px 18px ${T.blue}40` : "none" }}>
            {busy ? "Saving…" : isNew ? "Add Idea" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Calendar events from the full dataset ────────────────────────────────────
function buildEvents(data) {
  const byId = Object.fromEntries(data.collections.map((c) => [c.id, c]));
  const ev = [];
  for (const c of data.collections) if (c.launch_date) ev.push({ date: iso(c.launch_date), type: "launch", title: `Launch: ${c.name}`, collectionId: c.id });
  for (const s of data.samples) {
    const d = s.status === "Received" ? s.received_date : s.expected_date;
    if (d) ev.push({ date: iso(d), type: "sample", title: `Sample: ${s.product_name}`, sub: byId[s.collection_id]?.name, collectionId: s.collection_id });
  }
  for (const i of data.content_items) if (i.deadline) ev.push({ date: iso(i.deadline), type: "content", title: `${i.type}: ${i.title}`, sub: byId[i.collection_id]?.name, collectionId: i.collection_id });
  for (const m of data.marketing_activities) if (m.activity_date) ev.push({ date: iso(m.activity_date), type: "marketing", title: `${m.type}: ${m.title}`, sub: byId[m.collection_id]?.name, collectionId: m.collection_id });
  for (const t of data.tasks) if (t.deadline) ev.push({ date: iso(t.deadline), type: "task", title: `Task: ${t.title}`, sub: byId[t.collection_id]?.name, collectionId: t.collection_id });
  return ev.sort((a, b) => a.date.localeCompare(b.date));
}

const EMPTY = { collections: [], products: [], samples: [], content_items: [], marketing_activities: [], tasks: [], ideas: [], idea_files: [] };

// ── Main component ───────────────────────────────────────────────────────────
export default function CollectionTracker() {
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [detailId, setDetailId] = useState(null);
  const [detailTab, setDetailTab] = useState("products");
  const [showAdd, setShowAdd] = useState(false);
  const [editInfo, setEditInfo] = useState(false);
  const [rowModal, setRowModal] = useState(null); // { key, row | null }
  const [ideaModal, setIdeaModal] = useState(null); // { idea: row | null }
  const [ideaSearch, setIdeaSearch] = useState("");
  const [fIdeaCat, setFIdeaCat] = useState("All");

  // filters (Collections tab)
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("All");
  const [fOwner, setFOwner] = useState("All");
  const [fSample, setFSample] = useState("All");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");

  // calendar
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calType, setCalType] = useState("all");

  const reload = () => ctApi.data().then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { reload(); }, []);

  const events = useMemo(() => buildEvents(data), [data]);
  const today = todayISO();

  const openCollection = (id) => { setDetailId(id); setDetailTab("products"); setActiveTab("collections"); };

  const detail = data.collections.find((c) => c.id === detailId) || null;
  const childRows = (key) => data[key].filter((r) => r.collection_id === detailId);

  const owners = useMemo(() => {
    const s = new Set();
    for (const c of data.collections) for (const o of (c.owners || "").split(",")) { const t = o.trim(); if (t) s.add(t); }
    return [...s].sort();
  }, [data.collections]);

  // ── Derived (dashboard) ──
  const activeCollections = data.collections.filter((c) => c.status !== "Launched");
  const samplesIncoming = data.samples.filter((s) => s.status !== "Received").length;
  const overdueTasks = data.tasks.filter((t) => t.status !== "Done" && t.deadline && iso(t.deadline) < today).length;
  const in14 = (d) => { const n = daysUntil(d); return n !== null && n >= 0 && n <= 14; };
  const contentDue = data.content_items.filter((i) => i.status !== "Done" && in14(i.deadline)).length;
  const upcoming = data.collections
    .filter((c) => c.launch_date && iso(c.launch_date) >= today && c.status !== "Launched")
    .sort((a, b) => iso(a.launch_date).localeCompare(iso(b.launch_date)))
    .slice(0, 6);

  const filteredCollections = data.collections.filter((c) => {
    if (search) {
      const q = search.toLowerCase();
      if (!c.name.toLowerCase().includes(q) && !(c.description || "").toLowerCase().includes(q) && !(c.owners || "").toLowerCase().includes(q)) return false;
    }
    if (fStatus !== "All" && c.status !== fStatus) return false;
    if (fOwner !== "All" && !(c.owners || "").toLowerCase().includes(fOwner.toLowerCase())) return false;
    if (fFrom && (!c.launch_date || iso(c.launch_date) < fFrom)) return false;
    if (fTo && (!c.launch_date || iso(c.launch_date) > fTo)) return false;
    if (fSample !== "All" && !data.samples.some((s) => s.collection_id === c.id && s.status === fSample)) return false;
    return true;
  });

  // ── Small UI helpers ──
  const TabBtn = ({ tab, label }) => {
    const active = activeTab === tab && !detail;
    return (
      <button onClick={() => { setDetailId(null); setActiveTab(tab); }}
        style={{ padding: "8px 18px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 14, fontWeight: active ? 700 : 500, background: active ? T.text : T.pillBg, color: active ? "#fff" : T.textSec, transition: "all 0.15s", flexShrink: 0 }}>
        {label}
      </button>
    );
  };
  const pill = (active, label, onClick, color) => (
    <button key={label} onClick={onClick} style={{ padding: "7px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, flexShrink: 0, background: active && color ? color + "18" : active ? T.text : T.pillBg, color: active && color ? color : active ? "#fff" : T.textSec, transition: "all 0.15s" }}>{label}</button>
  );
  const StatusChip = ({ value }) => <Chip color={statusColor(value)}>{value}</Chip>;
  const DateCell = ({ row, col }) => {
    const v = row[col[0]];
    const overdue = v && iso(v) < today && row.status && !["Done", "Received", "Launched"].includes(row.status);
    return <span style={{ color: overdue ? T.red : T.textSec, fontWeight: overdue ? 600 : 400 }}>{fmtD(v)}</span>;
  };

  // ── Section table (detail view) ──
  const SectionTable = ({ sectionKey }) => {
    const cfg = SECTIONS[sectionKey];
    const rows = childRows(sectionKey);
    return (
      <div style={{ ...card, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: rows.length ? `1px solid ${T.border}` : "none" }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{cfg.title}</div>
          <button onClick={() => setRowModal({ key: sectionKey, row: null })}
            style={{ background: T.blue + "14", border: "none", borderRadius: 99, color: T.blue, padding: "7px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            + Add
          </button>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: "26px 20px", color: T.textTert, fontSize: 14, textAlign: "center" }}>No {cfg.singular}s yet — add the first one.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr>
                  {cfg.columns.map(([k, label]) => (
                    <th key={k} style={{ textAlign: "left", padding: "10px 20px", fontSize: 11, fontWeight: 700, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} onClick={() => setRowModal({ key: sectionKey, row })}
                    style={{ cursor: "pointer" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.bg)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {cfg.columns.map((col) => (
                      <td key={col[0]} style={{ padding: "13px 20px", borderBottom: `1px solid ${T.border}`, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {col[2] === "badge" ? <StatusChip value={row[col[0]]} /> : col[2] === "date" ? <DateCell row={row} col={col} /> : (row[col[0]] || <span style={{ color: T.textTert }}>—</span>)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  };

  // ── Dashboard pieces ──
  const Kpi = ({ label, value, alert }) => (
    <div style={{ ...card, padding: "18px 20px", flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.03em", color: alert ? T.red : T.text }}>{value}</div>
      <div style={{ fontSize: 13, color: T.textSec, marginTop: 2 }}>{label}</div>
    </div>
  );

  const TimelineRows = () => {
    const rows = data.collections
      .filter((c) => c.launch_date && c.status !== "Launched")
      .map((c) => {
        const sampleDates = data.samples
          .filter((s) => s.collection_id === c.id && (s.expected_date || s.received_date))
          .map((s) => iso(s.expected_date || s.received_date)).sort();
        return { c, start: sampleDates[0] || iso(c.created_at), end: iso(c.launch_date) };
      })
      .filter((r) => r.start && r.end >= r.start);
    if (!rows.length) return <div style={{ ...card, padding: 24, color: T.textTert, fontSize: 14, textAlign: "center" }}>No upcoming launches with dates yet.</div>;
    const min = rows.reduce((a, r) => (r.start < a ? r.start : a), today);
    const max = rows.reduce((a, r) => (r.end > a ? r.end : a), today);
    const span = Math.max(1, new Date(max) - new Date(min));
    const pct = (d) => Math.min(100, Math.max(0, ((new Date(d) - new Date(min)) / span) * 100));
    return (
      <div style={{ ...card, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map(({ c, start, end }) => (
          <div key={c.id} onClick={() => openCollection(c.id)} style={{ display: "grid", gridTemplateColumns: "160px 1fr 90px", gap: 14, alignItems: "center", cursor: "pointer" }}>
            <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</div>
            <div style={{ position: "relative", height: 12, background: T.bg, borderRadius: 6 }}>
              <div style={{ position: "absolute", top: -3, bottom: -3, left: `${pct(today)}%`, width: 2, background: T.red, zIndex: 1 }} />
              <div title={`${fmtD(start)} → ${fmtD(end)}`} style={{ position: "absolute", top: 0, height: "100%", borderRadius: 6, background: COLLECTION_COLOR[c.status] || T.text, opacity: 0.85, left: `${pct(start)}%`, width: `${Math.max(2, pct(end) - pct(start))}%` }} />
            </div>
            <div style={{ fontSize: 12, color: T.textSec, textAlign: "right" }}>{fmtD(end)}</div>
          </div>
        ))}
      </div>
    );
  };

  // ── Inspiration bank derived data + handlers ──
  const ideaFilesFor = (ideaId) => data.idea_files.filter((f) => f.idea_id === ideaId);
  const ideaCategories = useMemo(() => [...new Set(data.ideas.map((i) => i.category).filter(Boolean))].sort(), [data.ideas]);
  const filteredIdeas = data.ideas
    .filter((i) => {
      if (fIdeaCat !== "All" && i.category !== fIdeaCat) return false;
      if (ideaSearch) {
        const q = ideaSearch.toLowerCase();
        if (![i.title, i.notes, i.category, i.added_by, i.link].some((v) => (v || "").toLowerCase().includes(q))) return false;
      }
      return true;
    })
    .sort((a, b) => b.id - a.id);

  const saveIdea = async (form, staged) => {
    let idea = ideaModal.idea;
    if (idea) await ctApi.update("ideas", idea.id, form);
    else idea = await ctApi.createIdea(form);
    for (const f of staged) await ctApi.uploadIdeaFile(idea.id, f);
    await reload();
    setIdeaModal(null);
  };
  const deleteIdea = async () => {
    await ctApi.remove("ideas", ideaModal.idea.id);
    await reload();
    setIdeaModal(null);
  };
  const deleteIdeaFile = async (fileId) => {
    await ctApi.removeIdeaFile(fileId);
    await reload();
    setIdeaModal((m) => m); // keep modal open; thumbnails come from data
  };

  // ── Save handlers ──
  const saveCollection = async (form) => {
    const created = await ctApi.createCollection(form);
    await reload();
    setShowAdd(false);
    if (created?.id) openCollection(created.id);
  };
  const saveRow = async (form) => {
    const { key, row } = rowModal;
    if (row) await ctApi.update(key, row.id, form);
    else await ctApi.createChild(detailId, key, form);
    await reload();
    setRowModal(null);
  };
  const deleteRow = async () => {
    const { key, row } = rowModal;
    await ctApi.remove(key, row.id);
    await reload();
    setRowModal(null);
  };

  // ── Render ──
  const headerStats = (
    <div style={{ fontSize: 13, color: T.textSec, marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
      <span>{activeCollections.length} active collection{activeCollections.length !== 1 ? "s" : ""}</span>
      {samplesIncoming > 0 && <span style={{ color: T.orange, fontWeight: 500 }}>{samplesIncoming} sample{samplesIncoming !== 1 ? "s" : ""} incoming</span>}
      {overdueTasks > 0 && <span style={{ color: T.red, fontWeight: 500 }}>{overdueTasks} overdue task{overdueTasks !== 1 ? "s" : ""}</span>}
    </div>
  );

  return (
    <>
      {/* Sticky header */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(242,242,247,0.92)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 32px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: T.text, lineHeight: 1 }}>Collection Tracker</h1>
              {headerStats}
            </div>
            <button onClick={() => (activeTab === "inspiration" && !detail ? setIdeaModal({ idea: null }) : setShowAdd(true))}
              style={{ background: T.blue, border: "none", borderRadius: 99, color: "#fff", padding: "11px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer", flexShrink: 0, boxShadow: `0 4px 18px ${T.blue}38`, letterSpacing: "-0.01em" }}>
              {activeTab === "inspiration" && !detail ? "+ Add Idea" : "+ New Collection"}
            </button>
          </div>
          <div style={{ display: "flex", gap: 8, paddingBottom: 14, overflowX: "auto", alignItems: "center" }}>
            <TabBtn tab="dashboard" label="Dashboard" />
            <TabBtn tab="collections" label="Collections" />
            <TabBtn tab="calendar" label="Calendar" />
            <TabBtn tab="inspiration" label="Inspiration" />
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 80px" }}>
        {loading ? (
          <div style={{ textAlign: "center", color: T.textTert, padding: 60 }}>Loading…</div>
        ) : detail ? (
          /* ── COLLECTION DETAIL ── */
          <>
            <button onClick={() => setDetailId(null)} style={{ background: "none", border: "none", color: T.blue, fontSize: 14, fontWeight: 600, cursor: "pointer", padding: 0, marginBottom: 16 }}>← All collections</button>
            <div style={{ ...card, padding: "24px 26px", marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" }}>{detail.name}</div>
                    <StatusChip value={detail.status} />
                  </div>
                  <div style={{ fontSize: 13, color: T.textSec, marginTop: 8, display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>Launch: <b style={{ color: T.text }}>{fmtD(detail.launch_date)}</b>{daysUntil(detail.launch_date) !== null && daysUntil(detail.launch_date) >= 0 && <span style={{ color: T.blue, fontWeight: 600 }}> · {daysUntil(detail.launch_date)} days</span>}</span>
                    {detail.owners && <span>Responsible: <b style={{ color: T.text }}>{detail.owners}</b></span>}
                    {childRows("samples").length > 0 && <span>Samples: <b style={{ color: T.text }}>{childRows("samples").filter((s) => s.status === "Received").length}/{childRows("samples").length} received</b></span>}
                  </div>
                  {detail.description && <div style={{ fontSize: 14, color: T.textSec, marginTop: 10, maxWidth: 640, lineHeight: 1.5 }}>{detail.description}</div>}
                </div>
                <button onClick={() => setEditInfo(true)}
                  style={{ background: T.pillBg, border: "none", borderRadius: 99, color: T.text, padding: "9px 18px", fontSize: 13, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                  Edit info
                </button>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 18, overflowX: "auto" }}>
              {Object.entries(SECTIONS).map(([key, cfg]) =>
                pill(detailTab === key, cfg.title, () => setDetailTab(key)))}
            </div>
            <SectionTable sectionKey={detailTab} />
          </>
        ) : activeTab === "dashboard" ? (
          /* ── DASHBOARD ── */
          <>
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 28 }}>
              <Kpi label="Active collections" value={activeCollections.length} />
              <Kpi label="Samples incoming" value={samplesIncoming} />
              <Kpi label="Content due (14 days)" value={contentDue} />
              <Kpi label="Overdue tasks" value={overdueTasks} alert={overdueTasks > 0} />
            </div>

            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>Upcoming launches</div>
            {upcoming.length === 0 ? (
              <div style={{ ...card, padding: 24, color: T.textTert, fontSize: 14, textAlign: "center", marginBottom: 28 }}>No upcoming launches.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 14, marginBottom: 28 }}>
                {upcoming.map((c) => (
                  <div key={c.id} onClick={() => openCollection(c.id)} style={{ ...card, padding: "18px 20px", cursor: "pointer" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.blue, textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {daysUntil(c.launch_date) === 0 ? "Today" : `${daysUntil(c.launch_date)} days`}
                    </div>
                    <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.01em", margin: "6px 0 8px" }}>{c.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <StatusChip value={c.status} />
                      <span style={{ fontSize: 12, color: T.textSec }}>{fmtD(c.launch_date)}</span>
                    </div>
                    {c.owners && <div style={{ fontSize: 12, color: T.textSec, marginTop: 8 }}>{c.owners}</div>}
                  </div>
                ))}
              </div>
            )}

            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>Sample → launch timeline</div>
            <div style={{ marginBottom: 28 }}><TimelineRows /></div>

            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>Pipeline</div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, marginBottom: 28 }}>
              {COLLECTION_STATUSES.map((s) => {
                const cols = data.collections.filter((c) => c.status === s);
                return (
                  <div key={s} style={{ ...card, minWidth: 160, flex: 1, padding: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: COLLECTION_COLOR[s], textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                      {s} <span style={{ color: T.textTert }}>{cols.length}</span>
                    </div>
                    {cols.map((c) => (
                      <div key={c.id} onClick={() => openCollection(c.id)}
                        style={{ background: T.bg, borderRadius: 10, padding: "10px 12px", marginBottom: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        {c.name}
                        <div style={{ fontSize: 11, color: T.textSec, fontWeight: 400, marginTop: 3 }}>{fmtD(c.launch_date)}</div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 12 }}>Next 14 days</div>
            {(() => {
              const soon = events.filter((e) => in14(e.date));
              if (!soon.length) return <div style={{ ...card, padding: 24, color: T.textTert, fontSize: 14, textAlign: "center" }}>Nothing scheduled in the next 14 days.</div>;
              return (
                <div style={{ ...card, overflow: "hidden" }}>
                  {soon.map((e, i) => (
                    <div key={i} onClick={() => openCollection(e.collectionId)}
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: i < soon.length - 1 ? `1px solid ${T.border}` : "none", cursor: "pointer", fontSize: 14 }}
                      onMouseEnter={(ev) => (ev.currentTarget.style.background = T.bg)}
                      onMouseLeave={(ev) => (ev.currentTarget.style.background = "transparent")}>
                      <span style={{ fontSize: 12, color: T.textSec, minWidth: 88 }}>{fmtD(e.date)}</span>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: EVENT_TYPES[e.type].color, flexShrink: 0 }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.title}</span>
                      {e.sub && <span style={{ marginLeft: "auto", fontSize: 12, color: T.textTert, flexShrink: 0 }}>{e.sub}</span>}
                    </div>
                  ))}
                </div>
              );
            })()}
          </>
        ) : activeTab === "collections" ? (
          /* ── COLLECTIONS LIST ── */
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search collections…"
                style={{ ...smallInput, width: 220 }} {...focusBlue} />
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={selectStyle}>
                <option>All</option>{COLLECTION_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <select value={fOwner} onChange={(e) => setFOwner(e.target.value)} style={selectStyle}>
                <option>All</option>{owners.map((o) => <option key={o}>{o}</option>)}
              </select>
              <select value={fSample} onChange={(e) => setFSample(e.target.value)} style={selectStyle} title="Sample status">
                <option>All</option>{SAMPLE_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textSec }}>
                Launch <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} style={{ ...selectStyle, cursor: "auto" }} /> –
                <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} style={{ ...selectStyle, cursor: "auto" }} />
              </span>
            </div>

            {filteredCollections.length === 0 ? (
              <div style={{ ...card, padding: 40, color: T.textTert, fontSize: 14, textAlign: "center" }}>
                {data.collections.length === 0 ? "No collections yet — create the first one." : "No collections match the filters."}
              </div>
            ) : (
              <div style={{ ...card, overflow: "hidden" }}>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                    <thead>
                      <tr>
                        {["Collection", "Launch", "Status", "Responsible", "Products", "Samples", "Tasks"].map((h) => (
                          <th key={h} style={{ textAlign: "left", padding: "11px 20px", fontSize: 11, fontWeight: 700, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.07em", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCollections.map((c) => {
                        const samples = data.samples.filter((s) => s.collection_id === c.id);
                        const tasks = data.tasks.filter((t) => t.collection_id === c.id);
                        const cells = [
                          <span style={{ fontWeight: 600 }}>{c.name}</span>,
                          fmtD(c.launch_date),
                          <StatusChip value={c.status} />,
                          c.owners || <span style={{ color: T.textTert }}>—</span>,
                          data.products.filter((p) => p.collection_id === c.id).length,
                          samples.length ? `${samples.filter((s) => s.status === "Received").length}/${samples.length} received` : "—",
                          tasks.length ? `${tasks.filter((t) => t.status === "Done").length}/${tasks.length} done` : "—",
                        ];
                        return (
                          <tr key={c.id} onClick={() => openCollection(c.id)} style={{ cursor: "pointer" }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = T.bg)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                            {cells.map((cell, i) => (
                              <td key={i} style={{ padding: "13px 20px", borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{cell}</td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        ) : activeTab === "calendar" ? (
          /* ── CALENDAR ── */
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.02em" }}>
                {new Date(calYear, calMonth, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <select value={calType} onChange={(e) => setCalType(e.target.value)} style={selectStyle}>
                  <option value="all">All types</option>
                  {Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                {pill(false, "←", () => { const d = new Date(calYear, calMonth - 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); })}
                {pill(false, "Today", () => { setCalYear(now.getFullYear()); setCalMonth(now.getMonth()); })}
                {pill(false, "→", () => { const d = new Date(calYear, calMonth + 1, 1); setCalYear(d.getFullYear()); setCalMonth(d.getMonth()); })}
              </div>
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14, fontSize: 12, color: T.textSec }}>
              {Object.entries(EVENT_TYPES).map(([k, v]) => (
                <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: v.color }} /> {v.label}
                </span>
              ))}
            </div>
            {(() => {
              const first = new Date(calYear, calMonth, 1);
              const startOffset = (first.getDay() + 6) % 7; // Monday-first
              const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
              const prefix = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;
              const monthEvents = events.filter((e) => e.date.startsWith(prefix) && (calType === "all" || e.type === calType));
              const byDay = {};
              for (const e of monthEvents) { const d = Number(e.date.slice(8, 10)); (byDay[d] ||= []).push(e); }
              const cells = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                    <div key={d} style={{ textAlign: "center", fontSize: 11, fontWeight: 700, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.07em", padding: "4px 0" }}>{d}</div>
                  ))}
                  {cells.map((d, i) => {
                    if (d === null) return <div key={`e${i}`} />;
                    const dateStr = `${prefix}-${String(d).padStart(2, "0")}`;
                    const isToday = dateStr === today;
                    return (
                      <div key={d} style={{ ...card, minHeight: 92, padding: 8, boxShadow: isToday ? `0 0 0 2px ${T.blue}` : card.boxShadow }}>
                        <div style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? T.blue : T.textSec, marginBottom: 6 }}>{d}</div>
                        {(byDay[d] || []).map((e, j) => (
                          <div key={j} onClick={() => openCollection(e.collectionId)} title={e.sub ? `${e.title} (${e.sub})` : e.title}
                            style={{ fontSize: 11, background: T.bg, borderLeft: `3px solid ${EVENT_TYPES[e.type].color}`, borderRadius: 6, padding: "3px 6px", marginBottom: 4, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                            {e.title}
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        ) : (
          /* ── INSPIRATION BANK ── */
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 18 }}>
              <input value={ideaSearch} onChange={(e) => setIdeaSearch(e.target.value)} placeholder="Search ideas…"
                style={{ ...smallInput, width: 220 }} {...focusBlue} />
              {ideaCategories.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {pill(fIdeaCat === "All", "All", () => setFIdeaCat("All"))}
                  {ideaCategories.map((c) => pill(fIdeaCat === c, c, () => setFIdeaCat(fIdeaCat === c ? "All" : c)))}
                </div>
              )}
            </div>

            {filteredIdeas.length === 0 ? (
              <div style={{ ...card, padding: 48, textAlign: "center" }}>
                <div style={{ fontSize: 34, marginBottom: 10 }}>💡</div>
                <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                  {data.ideas.length === 0 ? "The inspiration bank is empty" : "No ideas match"}
                </div>
                <div style={{ fontSize: 14, color: T.textSec }}>
                  {data.ideas.length === 0 ? "Save images, links and notes for future product ideas." : "Try another search or category."}
                </div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 16 }}>
                {filteredIdeas.map((idea) => {
                  const files = ideaFilesFor(idea.id);
                  return (
                    <div key={idea.id} onClick={() => setIdeaModal({ idea })} style={{ ...card, overflow: "hidden", cursor: "pointer", display: "flex", flexDirection: "column" }}>
                      {files.length > 0 && (
                        <div style={{ position: "relative", background: T.bg }}>
                          <img src={`/api/ct/idea-files/${files[0].id}`} alt={idea.title}
                            style={{ width: "100%", height: 210, objectFit: "cover", display: "block" }} />
                          {files.length > 1 && (
                            <span style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.62)", color: "#fff", fontSize: 11, fontWeight: 600, borderRadius: 99, padding: "3px 9px" }}>
                              +{files.length - 1} more
                            </span>
                          )}
                        </div>
                      )}
                      <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>{idea.title}</span>
                          {idea.category && <Chip color={T.purple}>{idea.category}</Chip>}
                        </div>
                        {idea.notes && <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{idea.notes}</div>}
                        {idea.link && (
                          <a href={linkHref(idea.link)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
                            style={{ fontSize: 13, fontWeight: 600, color: T.blue, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5 }}>
                            🔗 {linkDomain(idea.link)}
                          </a>
                        )}
                        <div style={{ fontSize: 11, color: T.textTert, marginTop: "auto" }}>
                          {idea.added_by ? `${idea.added_by} · ` : ""}{fmtD(idea.created_at)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modals ── */}
      {showAdd && (
        <EntityModal title="New Collection" fields={COLLECTION_FIELDS} submitLabel="Create"
          onSubmit={saveCollection} onClose={() => setShowAdd(false)} />
      )}
      {editInfo && detail && (
        <EntityModal title="Edit Collection" fields={COLLECTION_FIELDS} initial={detail}
          onSubmit={async (form) => { await ctApi.update("collections", detail.id, form); await reload(); setEditInfo(false); }}
          onDelete={async () => { await ctApi.remove("collections", detail.id); await reload(); setEditInfo(false); setDetailId(null); }}
          onClose={() => setEditInfo(false)} />
      )}
      {ideaModal && (
        <IdeaModal
          initial={ideaModal.idea}
          existingFiles={ideaModal.idea ? ideaFilesFor(ideaModal.idea.id) : []}
          onSubmit={saveIdea}
          onDelete={ideaModal.idea ? deleteIdea : null}
          onDeleteFile={deleteIdeaFile}
          onClose={() => setIdeaModal(null)} />
      )}
      {rowModal && (
        <EntityModal
          title={`${rowModal.row ? "Edit" : "Add"} ${SECTIONS[rowModal.key].singular}`}
          fields={SECTIONS[rowModal.key].fields}
          initial={rowModal.row || {}}
          onSubmit={saveRow}
          onDelete={rowModal.row ? deleteRow : null}
          onClose={() => setRowModal(null)} />
      )}
    </>
  );
}
