import { useEffect, useMemo, useState } from "react";
import { T, Chip } from "./theme.jsx";
import { api } from "./brand.js";

// ── Constants ────────────────────────────────────────────────────────────────
const GRAY = "#8E8E93";
const STATUSES = ["Planned", "Active", "Done"];
const STATUS_COLOR = { Planned: T.blue, Active: T.green, Done: GRAY };
const PLATFORMS = ["Meta", "TikTok", "Google", "Influencer", "Email", "Other"];
const PLATFORM_COLOR = { Meta: "#0081FB", TikTok: T.text, Google: "#EA4335", Influencer: T.purple, Email: T.teal, Other: GRAY };

const kr = (n) => `${Number(n || 0).toLocaleString("da-DK")} kr`;
const iso = (v) => (v ? String(v).slice(0, 10) : "");
const fmtD = (v) => {
  if (!v) return "";
  const d = new Date(iso(v));
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// ── API ──────────────────────────────────────────────────────────────────────
const jreq = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const kbApi = {
  data: () => api("/api/kb/data").then((r) => r.json()),
  createCampaign: (b) => api("/api/kb/campaigns", jreq("POST", b)).then((r) => r.json()),
  updateCampaign: (id, b) => api(`/api/kb/campaigns/${id}`, jreq("PUT", b)).then((r) => r.json()),
  removeCampaign: (id) => api(`/api/kb/campaigns/${id}`, { method: "DELETE" }),
  createExpense: (cid, b) => api(`/api/kb/campaigns/${cid}/expenses`, jreq("POST", b)).then((r) => r.json()),
  updateExpense: (id, b) => api(`/api/kb/expenses/${id}`, jreq("PUT", b)).then((r) => r.json()),
  removeExpense: (id) => api(`/api/kb/expenses/${id}`, { method: "DELETE" }),
  uploadFile: (expenseId, f) => api(`/api/kb/expenses/${expenseId}/files`, jreq("POST", { filename: f.name, mimetype: f.type, dataBase64: f.dataBase64 })).then((r) => r.json()),
  removeFile: (id) => api(`/api/kb/files/${id}`, { method: "DELETE" }),
};

// ── File staging (receipts) ──────────────────────────────────────────────────
const MAX_FILE_MB = 10;
const fileToStaged = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, dataBase64: String(reader.result).split(",")[1] || "" });
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

// ── Shared styles (mirrors the other trackers) ───────────────────────────────
const smallInput = { width: "100%", background: T.bg, border: "1.5px solid rgba(60,60,67,0.1)", borderRadius: 12, padding: "13px 15px", color: T.text, fontSize: 15, boxSizing: "border-box", outline: "none", fontFamily: "inherit", transition: "border-color 0.15s" };
const textareaStyle = { ...smallInput, lineHeight: 1.55, resize: "none" };
const focusBlue = { onFocus: (e) => (e.target.style.borderColor = T.blue), onBlur: (e) => (e.target.style.borderColor = "rgba(60,60,67,0.1)") };
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

const KrInput = ({ value, onChange, autoFocus }) => (
  <div style={{ position: "relative" }}>
    <input type="number" min="0" step="1" value={value} autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)} placeholder="0"
      style={{ ...smallInput, paddingRight: 42 }} {...focusBlue} />
    <span style={{ position: "absolute", right: 15, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: T.textTert }}>kr</span>
  </div>
);

// ── Campaign modal (create / edit) ───────────────────────────────────────────
function CampaignModal({ initial, onSubmit, onDelete, onClose }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState({
    name: initial?.name || "",
    platform: initial?.platform || PLATFORMS[0],
    budget: initial?.budget != null && Number(initial.budget) > 0 ? String(Number(initial.budget)) : "",
    status: initial?.status || "Active",
    start_date: iso(initial?.start_date),
    end_date: iso(initial?.end_date),
    notes: initial?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const valid = form.name.trim().length > 0;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try { await onSubmit({ ...form, budget: Number(form.budget) || 0 }); } finally { setBusy(false); }
  };

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalCard}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{editing ? "Edit campaign" : "New campaign"}</div>
          <button onClick={onClose} style={{ background: T.pillBg, border: "none", borderRadius: 99, width: 30, height: 30, cursor: "pointer", fontSize: 14, color: T.textSec }}>✕</button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Campaign name <span style={{ color: T.red }}>*</span></FormLabel>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Fall drop — Meta boost" autoFocus={!editing} style={smallInput} {...focusBlue} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Platform</FormLabel>
          <Segmented options={PLATFORMS} value={form.platform} onChange={(v) => set("platform", v)} colorFor={(o) => PLATFORM_COLOR[o]} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Budget</FormLabel>
          <KrInput value={form.budget} onChange={(v) => set("budget", v)} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Status</FormLabel>
          <Segmented options={STATUSES} value={form.status} onChange={(v) => set("status", v)} colorFor={(o) => STATUS_COLOR[o]} />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <FormLabel>Start date</FormLabel>
            <input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} style={smallInput} {...focusBlue} />
          </div>
          <div style={{ flex: 1 }}>
            <FormLabel>End date</FormLabel>
            <input type="date" value={form.end_date} onChange={(e) => set("end_date", e.target.value)} style={smallInput} {...focusBlue} />
          </div>
        </div>

        <div style={{ marginBottom: 26 }}>
          <FormLabel>Notes</FormLabel>
          <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="Optional" style={textareaStyle} {...focusBlue} />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {editing && (
            <button onClick={onDelete}
              style={{ padding: "14px 18px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, background: T.red + "14", color: T.red }}>
              Delete
            </button>
          )}
          <button onClick={submit} disabled={!valid || busy}
            style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "none", cursor: valid ? "pointer" : "default", fontSize: 15, fontWeight: 700, background: valid ? T.blue : T.pillBg, color: valid ? "#fff" : T.textTert, boxShadow: valid ? `0 4px 18px ${T.blue}40` : "none" }}>
            {busy ? "Saving…" : editing ? "Save changes" : "Create campaign"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Expense modal (create / edit, with receipts) ─────────────────────────────
function ExpenseModal({ initial, existingFiles = [], onSubmit, onDelete, onDeleteFile, onClose }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState({
    title: initial?.title || "",
    amount: initial?.amount != null && Number(initial.amount) > 0 ? String(Number(initial.amount)) : "",
    expense_date: iso(initial?.expense_date) || todayISO(),
    note: initial?.note || "",
  });
  const [staged, setStaged] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const valid = form.title.trim().length > 0;

  const stageFiles = async (files) => {
    const ok = [];
    for (const f of files) {
      const isAllowed = f.type.startsWith("image/") || f.type === "application/pdf";
      if (!isAllowed) { alert(`${f.name || "File"} skipped — only images and PDFs.`); continue; }
      if (f.size > MAX_FILE_MB * 1048576) { alert(`${f.name} is larger than ${MAX_FILE_MB} MB and was skipped.`); continue; }
      ok.push(await fileToStaged(f));
    }
    if (ok.length) setStaged((p) => [...p, ...ok]);
  };
  const pickFiles = (e) => { stageFiles([...(e.target.files || [])]); e.target.value = ""; };
  const onPaste = (e) => {
    const files = [...(e.clipboardData?.items || [])]
      .filter((i) => i.kind === "file").map((i) => i.getAsFile()).filter(Boolean);
    if (files.length) {
      e.preventDefault();
      stageFiles(files.map((f, i) => (f.name ? f : new File([f], `receipt-${Date.now()}-${i}.png`, { type: f.type }))));
    }
  };

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try { await onSubmit({ ...form, amount: Number(form.amount) || 0 }, staged); } finally { setBusy(false); }
  };

  const isImg = (t) => (t || "").startsWith("image/");
  const thumb = { width: 74, height: 74, objectFit: "cover", borderRadius: 10, display: "block" };
  const thumbWrap = { position: "relative", flexShrink: 0 };
  const thumbX = { position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: 99, border: "none", background: T.text, color: "#fff", fontSize: 10, cursor: "pointer", lineHeight: 1 };
  const pdfChip = { width: 74, height: 74, borderRadius: 10, background: T.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 10, color: T.textSec, padding: 6, textAlign: "center", overflow: "hidden" };

  return (
    <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div style={modalCard} onPaste={onPaste}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{editing ? "Edit expense" : "Add expense"}</div>
          <button onClick={onClose} style={{ background: T.pillBg, border: "none", borderRadius: 99, width: 30, height: 30, cursor: "pointer", fontSize: 14, color: T.textSec }}>✕</button>
        </div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Description <span style={{ color: T.red }}>*</span></FormLabel>
          <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Meta ads 1–15 Sep" autoFocus={!editing} style={smallInput} {...focusBlue} />
        </div>

        <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
          <div style={{ flex: 1 }}>
            <FormLabel>Amount</FormLabel>
            <KrInput value={form.amount} onChange={(v) => set("amount", v)} />
          </div>
          <div style={{ flex: 1 }}>
            <FormLabel>Date</FormLabel>
            <input type="date" value={form.expense_date} onChange={(e) => set("expense_date", e.target.value)} style={smallInput} {...focusBlue} />
          </div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Note</FormLabel>
          <textarea value={form.note} onChange={(e) => set("note", e.target.value)} rows={2} placeholder="Optional" style={textareaStyle} {...focusBlue} />
        </div>

        <div style={{ marginBottom: 26 }}>
          <FormLabel>Receipts</FormLabel>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
            {existingFiles.map((f) => (
              <div key={`ex-${f.id}`} style={thumbWrap}>
                <a href={`/api/kb/files/${f.id}`} target="_blank" rel="noreferrer">
                  {isImg(f.mimetype)
                    ? <img src={`/api/kb/files/${f.id}`} alt={f.filename} style={thumb} />
                    : <div style={pdfChip}><span style={{ fontSize: 20 }}>📄</span>{f.filename}</div>}
                </a>
                <button style={thumbX} title="Remove receipt" onClick={() => onDeleteFile(f.id)}>✕</button>
              </div>
            ))}
            {staged.map((f, i) => (
              <div key={`st-${i}`} style={thumbWrap}>
                {isImg(f.type)
                  ? <img src={`data:${f.type};base64,${f.dataBase64}`} alt={f.name} style={{ ...thumb, opacity: 0.85 }} />
                  : <div style={pdfChip}><span style={{ fontSize: 20 }}>📄</span>{f.name}</div>}
                <button style={thumbX} title="Remove" onClick={() => setStaged((p) => p.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            <label style={{ width: 74, height: 74, borderRadius: 10, border: `1.5px dashed rgba(60,60,67,0.25)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, cursor: "pointer", color: T.textSec, fontSize: 11 }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>＋</span>Add
              <input type="file" accept="image/*,application/pdf" multiple onChange={pickFiles} style={{ display: "none" }} />
            </label>
          </div>
          <div style={{ fontSize: 11, color: T.textTert, marginTop: 8 }}>Images or PDFs — you can also paste a screenshot directly.</div>
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {editing && (
            <button onClick={onDelete}
              style={{ padding: "14px 18px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, background: T.red + "14", color: T.red }}>
              Delete
            </button>
          )}
          <button onClick={submit} disabled={!valid || busy}
            style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "none", cursor: valid ? "pointer" : "default", fontSize: 15, fontWeight: 700, background: valid ? T.blue : T.pillBg, color: valid ? "#fff" : T.textTert, boxShadow: valid ? `0 4px 18px ${T.blue}40` : "none" }}>
            {busy ? "Saving…" : editing ? "Save changes" : "Add expense"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Budget bar ───────────────────────────────────────────────────────────────
function BudgetBar({ budget, spent }) {
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const over = budget > 0 && spent > budget;
  const barColor = over ? T.red : pct >= 85 ? T.orange : T.green;
  const remaining = budget - spent;
  return (
    <div>
      <div style={{ height: 7, borderRadius: 99, background: T.bg, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: barColor, borderRadius: 99, transition: "width 0.25s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7, fontSize: 12.5, color: T.textSec }}>
        <span><span style={{ color: T.text, fontWeight: 600 }}>{kr(spent)}</span>{budget > 0 && <> / {kr(budget)} · <span style={{ color: barColor, fontWeight: 600 }}>{Math.round(pct)}%</span></>}</span>
        {budget > 0 && (
          <span style={{ color: over ? T.red : T.textSec, fontWeight: over ? 600 : 500 }}>
            {over ? `${kr(-remaining)} over budget` : `${kr(remaining)} left`}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function BudgetTracker() {
  const [data, setData] = useState({ campaigns: [], expenses: [], files: [] });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");
  const [expanded, setExpanded] = useState(null);
  const [campaignModal, setCampaignModal] = useState(null); // null | {} (new) | campaign (edit)
  const [expenseModal, setExpenseModal] = useState(null);   // null | { campaignId } | { campaignId, expense }

  const reload = () => kbApi.data().then((d) => { setData(d); setLoading(false); });
  useEffect(() => { reload(); }, []);

  const spentBy = useMemo(() => {
    const m = {};
    for (const e of data.expenses) m[e.campaign_id] = (m[e.campaign_id] || 0) + Number(e.amount || 0);
    return m;
  }, [data.expenses]);

  const filesBy = useMemo(() => {
    const m = {};
    for (const f of data.files) (m[f.expense_id] = m[f.expense_id] || []).push(f);
    return m;
  }, [data.files]);

  const campaigns = statusFilter === "All" ? data.campaigns : data.campaigns.filter((c) => c.status === statusFilter);

  const totals = useMemo(() => {
    // Overview counts everything that isn't Done — Done campaigns keep their
    // history but no longer occupy budget.
    const open = data.campaigns.filter((c) => c.status !== "Done");
    const budget = open.reduce((s, c) => s + Number(c.budget || 0), 0);
    const spent = open.reduce((s, c) => s + (spentBy[c.id] || 0), 0);
    return { budget, spent, remaining: budget - spent, count: open.length };
  }, [data.campaigns, spentBy]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const saveCampaign = async (form) => {
    if (campaignModal?.id) await kbApi.updateCampaign(campaignModal.id, form);
    else await kbApi.createCampaign(form);
    setCampaignModal(null);
    reload();
  };
  const deleteCampaign = async () => {
    if (!confirm("Delete this campaign and all its expenses?")) return;
    await kbApi.removeCampaign(campaignModal.id);
    setCampaignModal(null);
    reload();
  };
  const saveExpense = async (form, staged) => {
    let expenseId = expenseModal.expense?.id;
    if (expenseId) await kbApi.updateExpense(expenseId, form);
    else expenseId = (await kbApi.createExpense(expenseModal.campaignId, form)).id;
    for (const f of staged) await kbApi.uploadFile(expenseId, f);
    setExpenseModal(null);
    reload();
  };
  const deleteExpense = async () => {
    if (!confirm("Delete this expense?")) return;
    await kbApi.removeExpense(expenseModal.expense.id);
    setExpenseModal(null);
    reload();
  };
  const deleteFile = async (id) => {
    await kbApi.removeFile(id);
    setExpenseModal((p) => p); // modal stays open; refresh backing data
    reload();
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const stat = (label, value, color) => (
    <div style={{ ...card, padding: "18px 22px", flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: color || T.text }}>{value}</div>
    </div>
  );

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 80px" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: "-0.03em" }}>Kampagne Budget</div>
          <div style={{ fontSize: 14, color: T.textSec, marginTop: 3 }}>Budgets, spend and receipts per campaign</div>
        </div>
        <button onClick={() => setCampaignModal({})}
          style={{ padding: "12px 20px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: T.blue, color: "#fff", boxShadow: `0 4px 18px ${T.blue}40` }}>
          ＋ New campaign
        </button>
      </div>

      {/* Overview */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 26 }}>
        {stat("Total budget", kr(totals.budget))}
        {stat("Spent", kr(totals.spent))}
        {stat(totals.remaining < 0 ? "Over budget" : "Remaining", kr(Math.abs(totals.remaining)), totals.remaining < 0 ? T.red : T.green)}
        {stat("Open campaigns", totals.count)}
      </div>

      {/* Status filter */}
      <div style={{ display: "flex", gap: 4, background: T.pillBg, borderRadius: 99, padding: 3, width: "fit-content", marginBottom: 18 }}>
        {["All", ...STATUSES].map((s) => {
          const active = statusFilter === s;
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              style={{ padding: "7px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500, background: active ? "#fff" : "transparent", color: active ? T.text : T.textSec, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none", transition: "all 0.15s" }}>
              {s}
            </button>
          );
        })}
      </div>

      {/* Campaigns */}
      {loading ? (
        <div style={{ textAlign: "center", color: T.textSec, padding: "60px 0" }}>Loading…</div>
      ) : campaigns.length === 0 ? (
        <div style={{ ...card, padding: "56px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>💸</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No campaigns yet</div>
          <div style={{ fontSize: 14, color: T.textSec }}>Create a campaign and start logging spend against its budget.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {campaigns.map((c) => {
            const spent = spentBy[c.id] || 0;
            const open = expanded === c.id;
            const expenses = data.expenses.filter((e) => e.campaign_id === c.id);
            const dates = [fmtD(c.start_date), fmtD(c.end_date)].filter(Boolean).join(" – ");
            return (
              <div key={c.id} style={card}>
                {/* Card header */}
                <div onClick={() => setExpanded(open ? null : c.id)}
                  style={{ padding: "18px 22px", cursor: "pointer", display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div style={{ fontSize: 16.5, fontWeight: 700, letterSpacing: "-0.01em", flex: 1, minWidth: 160 }}>{c.name}</div>
                    {c.platform && <Chip color={PLATFORM_COLOR[c.platform] || GRAY}>{c.platform}</Chip>}
                    <Chip color={STATUS_COLOR[c.status] || GRAY}>{c.status}</Chip>
                    {dates && <span style={{ fontSize: 12, color: T.textTert }}>{dates}</span>}
                    <button onClick={(e) => { e.stopPropagation(); setCampaignModal(c); }} title="Edit campaign"
                      style={{ background: "none", border: "none", fontSize: 14, padding: "5px 7px", borderRadius: 8, cursor: "pointer", lineHeight: 1 }}>✏️</button>
                    <span style={{ fontSize: 12, color: T.textTert, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s" }}>▶</span>
                  </div>
                  <BudgetBar budget={Number(c.budget || 0)} spent={spent} />
                </div>

                {/* Expenses */}
                {open && (
                  <div style={{ borderTop: `1px solid ${T.border}`, padding: "16px 22px 20px" }}>
                    {c.notes && <div style={{ fontSize: 13.5, color: T.textSec, lineHeight: 1.55, marginBottom: 14, whiteSpace: "pre-wrap" }}>{c.notes}</div>}
                    {expenses.length === 0 ? (
                      <div style={{ fontSize: 13.5, color: T.textTert, padding: "6px 0 12px" }}>No expenses logged yet.</div>
                    ) : (
                      <div style={{ marginBottom: 12 }}>
                        {expenses.map((e) => {
                          const receipts = filesBy[e.id] || [];
                          return (
                            <div key={e.id}
                              onClick={() => setExpenseModal({ campaignId: c.id, expense: e })}
                              style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 4px", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}>
                              <span style={{ fontSize: 12.5, color: T.textTert, minWidth: 58, flexShrink: 0 }}>{fmtD(e.expense_date) || "—"}</span>
                              <span style={{ fontSize: 14, fontWeight: 500, flex: 1, minWidth: 120 }}>
                                {e.title}
                                {e.note && <span style={{ color: T.textTert, fontWeight: 400 }}> · {e.note}</span>}
                              </span>
                              {receipts.length > 0 && (
                                <span title={`${receipts.length} receipt${receipts.length > 1 ? "s" : ""}`} style={{ fontSize: 12.5, color: T.textSec, flexShrink: 0 }}>
                                  🧾{receipts.length > 1 ? ` ×${receipts.length}` : ""}
                                </span>
                              )}
                              <span style={{ fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{kr(e.amount)}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={() => setExpenseModal({ campaignId: c.id })}
                      style={{ padding: "9px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: T.blue + "14", color: T.blue }}>
                      ＋ Add expense
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      {campaignModal && (
        <CampaignModal
          initial={campaignModal.id ? campaignModal : null}
          onSubmit={saveCampaign}
          onDelete={deleteCampaign}
          onClose={() => setCampaignModal(null)}
        />
      )}
      {expenseModal && (
        <ExpenseModal
          key={expenseModal.expense?.id || "new"}
          initial={expenseModal.expense || null}
          existingFiles={expenseModal.expense ? (filesBy[expenseModal.expense.id] || []) : []}
          onSubmit={saveExpense}
          onDelete={deleteExpense}
          onDeleteFile={deleteFile}
          onClose={() => setExpenseModal(null)}
        />
      )}
    </div>
  );
}
