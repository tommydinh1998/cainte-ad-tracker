import { useEffect, useMemo, useState } from "react";
import { T, Chip } from "./theme.jsx";
import { api } from "./brand.js";

// Must Win Battles — the few things the company has to win right now (ranked),
// what's in motion on each, and an idea catalog anyone can add to. Ideas get
// promoted into battles; battles are worked through concrete steps.

// ── Constants ────────────────────────────────────────────────────────────────
const GRAY = "#8E8E93";
const STATUS = {
  active:  { label: "Active",  color: T.blue },
  next:    { label: "Up next", color: T.purple },
  won:     { label: "Won",     color: T.green },
  paused:  { label: "Paused",  color: T.orange },
  dropped: { label: "Dropped", color: GRAY },
};
const HEALTH = {
  on_track:  { label: "On track",  color: T.green },
  at_risk:   { label: "At risk",   color: T.orange },
  off_track: { label: "Off track", color: T.red },
};
const IDEA_STATUS = {
  new:         { label: "New",         color: T.blue },
  considering: { label: "Considering", color: T.teal },
  parked:      { label: "Parked",      color: GRAY },
  promoted:    { label: "Promoted",    color: T.green },
};
const CATEGORIES = ["Product", "Marketing", "Brand", "Sales", "Customer", "Ops", "Other"];
const VIEWS = [
  { key: "overview", label: "Overview" },
  { key: "progress", label: "In progress" },
  { key: "ideas",    label: "Idea catalog" },
];
const VIEW_KEY = "cainte_mwb_view";
const MAX_ACTIVE = 3; // mirrored server-side (MWB_MAX_ACTIVE)

const iso = (v) => (v ? String(v).slice(0, 10) : "");
const fmtD = (v) => {
  if (!v) return "";
  const d = new Date(iso(v) + "T00:00:00");
  return isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};
const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysUntil = (v) => Math.round((new Date(iso(v) + "T00:00:00") - new Date(todayISO() + "T00:00:00")) / 86400000);
const ago = (ts) => {
  if (!ts) return "";
  const d = Math.floor((Date.now() - new Date(ts)) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
};
// Impact high + effort low = do it first. 1–25.
const ideaScore = (i) => Number(i.impact || 0) * (6 - Number(i.effort || 0));

// ── API ──────────────────────────────────────────────────────────────────────
const jreq = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const j = (p) => p.then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Something went wrong"); return d; });
const mwbApi = {
  data: () => j(api("/api/mwb/data")),
  createBattle: (b) => j(api("/api/mwb/battles", jreq("POST", b))),
  updateBattle: (id, b) => j(api(`/api/mwb/battles/${id}`, jreq("PUT", b))),
  removeBattle: (id) => api(`/api/mwb/battles/${id}`, { method: "DELETE" }),
  reorder: (ids) => api("/api/mwb/battles/reorder", jreq("POST", { ids })),
  createStep: (bid, b) => j(api(`/api/mwb/battles/${bid}/steps`, jreq("POST", b))),
  updateStep: (id, b) => j(api(`/api/mwb/steps/${id}`, jreq("PUT", b))),
  removeStep: (id) => api(`/api/mwb/steps/${id}`, { method: "DELETE" }),
  createIdea: (b) => j(api("/api/mwb/ideas", jreq("POST", b))),
  updateIdea: (id, b) => j(api(`/api/mwb/ideas/${id}`, jreq("PUT", b))),
  removeIdea: (id) => api(`/api/mwb/ideas/${id}`, { method: "DELETE" }),
  vote: (id, delta) => j(api(`/api/mwb/ideas/${id}/vote`, jreq("POST", { delta }))),
  promote: (id) => j(api(`/api/mwb/ideas/${id}/promote`, { method: "POST" })),
  swap: (b) => j(api("/api/mwb/swap", jreq("POST", b))),
};

// ── Shared styles (mirrors the other trackers) ───────────────────────────────
const smallInput = { width: "100%", background: T.bg, border: "1.5px solid rgba(60,60,67,0.1)", borderRadius: 12, padding: "13px 15px", color: T.text, fontSize: 15, boxSizing: "border-box", outline: "none", fontFamily: "inherit", transition: "border-color 0.15s" };
const textareaStyle = { ...smallInput, lineHeight: 1.55, resize: "none" };
const focusBlue = { onFocus: (e) => (e.target.style.borderColor = T.blue), onBlur: (e) => (e.target.style.borderColor = "rgba(60,60,67,0.1)") };
const overlay = { position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.40)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" };
const modalCard = { background: "#fff", borderRadius: 22, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: "30px 28px 32px", boxShadow: "0 24px 80px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.05)" };
const card = { background: "#fff", borderRadius: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 0 0 0.5px rgba(0,0,0,0.04)" };
const sectionTitle = { fontSize: 13, fontWeight: 700, color: T.textSec, textTransform: "uppercase", letterSpacing: "0.08em", margin: "30px 0 12px" };
const primaryBtn = { padding: "12px 20px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: T.blue, color: "#fff", boxShadow: `0 4px 18px ${T.blue}40` };
const ghostBtn = { padding: "6px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: T.pillBg, color: T.textSec };

const FormLabel = ({ children }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: T.textSec, marginBottom: 8 }}>{children}</div>
);

const Segmented = ({ options, value, onChange }) => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {options.map(([key, meta]) => {
      const active = value === key;
      return (
        <button key={key} onClick={() => onChange(key)} type="button"
          style={{ flex: "1 1 0", minWidth: 78, padding: "10px 8px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: active ? meta.color : T.bg, color: active ? "#fff" : T.textSec, boxShadow: active ? `0 4px 14px ${meta.color}45` : "none", transition: "all 0.15s" }}>
          {meta.label}
        </button>
      );
    })}
  </div>
);

const Scale = ({ value, onChange, color }) => (
  <div style={{ display: "flex", gap: 6 }}>
    {[1, 2, 3, 4, 5].map((n) => (
      <button key={n} type="button" onClick={() => onChange(n)}
        style={{ flex: 1, padding: "10px 0", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700, background: n <= value ? color : T.bg, color: n <= value ? "#fff" : T.textTert }}>
        {n}
      </button>
    ))}
  </div>
);

const Dots = ({ n, color }) => (
  <span style={{ letterSpacing: 1 }}>
    {[1, 2, 3, 4, 5].map((i) => <span key={i} style={{ color: i <= n ? color : "rgba(60,60,67,0.15)" }}>●</span>)}
  </span>
);

const ProgressBar = ({ pct, color = T.blue, height = 6 }) => (
  <div style={{ height, borderRadius: 99, background: T.pillBg, overflow: "hidden" }}>
    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 99, background: color, transition: "width 0.3s" }} />
  </div>
);

const Modal = ({ title, onClose, children }) => (
  <div style={overlay} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <div style={modalCard}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div style={{ fontSize: 21, fontWeight: 700, letterSpacing: "-0.02em" }}>{title}</div>
        <button onClick={onClose} style={{ background: T.pillBg, border: "none", borderRadius: 99, width: 30, height: 30, cursor: "pointer", fontSize: 14, color: T.textSec }}>✕</button>
      </div>
      {children}
    </div>
  </div>
);

const ModalActions = ({ onDelete, onSubmit, valid, busy, label }) => (
  <div style={{ display: "flex", gap: 10 }}>
    {onDelete && (
      <button onClick={onDelete}
        style={{ padding: "14px 18px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, background: T.red + "14", color: T.red }}>
        Delete
      </button>
    )}
    <button onClick={onSubmit} disabled={!valid || busy}
      style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "none", cursor: valid ? "pointer" : "default", fontSize: 15, fontWeight: 700, background: valid ? T.blue : T.pillBg, color: valid ? "#fff" : T.textTert, boxShadow: valid ? `0 4px 18px ${T.blue}40` : "none" }}>
      {busy ? "Saving…" : label}
    </button>
  </div>
);

// ── Battle modal ─────────────────────────────────────────────────────────────
function BattleModal({ initial, owners, activeFull, onSubmit, onDelete, onClose }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState({
    title: initial?.title || "",
    why: initial?.why || "",
    success: initial?.success || "",
    owner: initial?.owner || "",
    deadline: iso(initial?.deadline),
    status: initial?.status || (activeFull ? "next" : "active"),
    health: initial?.health || "on_track",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const blocked = activeFull && form.status === "active" && initial?.status !== "active";
  const valid = form.title.trim().length > 0 && !blocked;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try { await onSubmit(form); } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? "Edit battle" : "New must win battle"} onClose={onClose}>
      <div style={{ marginBottom: 18 }}>
        <FormLabel>Battle <span style={{ color: T.red }}>*</span></FormLabel>
        <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Win the Danish 25–35 core customer" autoFocus={!editing} style={smallInput} {...focusBlue} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <FormLabel>Why it matters</FormLabel>
        <textarea value={form.why} onChange={(e) => set("why", e.target.value)} rows={3} placeholder="Why this is a must win right now" style={textareaStyle} {...focusBlue} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <FormLabel>What winning looks like</FormLabel>
        <textarea value={form.success} onChange={(e) => set("success", e.target.value)} rows={2} placeholder="Measurable target, e.g. 30% repeat rate by Q1" style={textareaStyle} {...focusBlue} />
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 180px" }}>
          <FormLabel>Owner</FormLabel>
          <input value={form.owner} onChange={(e) => set("owner", e.target.value)} list="mwb-owners" placeholder="Who drives it" style={smallInput} {...focusBlue} />
          <datalist id="mwb-owners">{owners.map((o) => <option key={o} value={o} />)}</datalist>
        </div>
        <div style={{ flex: "1 1 180px" }}>
          <FormLabel>Deadline</FormLabel>
          <input type="date" value={form.deadline} onChange={(e) => set("deadline", e.target.value)} style={smallInput} {...focusBlue} />
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <FormLabel>Status</FormLabel>
        <Segmented options={Object.entries(STATUS)} value={form.status} onChange={(v) => set("status", v)} />
        {blocked && <div style={{ fontSize: 13, color: T.red, marginTop: 8 }}>Max {MAX_ACTIVE} active battles. Move one to Won, Paused or Up next first, or save this one as Up next.</div>}
      </div>
      <div style={{ marginBottom: 26 }}>
        <FormLabel>Health</FormLabel>
        <Segmented options={Object.entries(HEALTH)} value={form.health} onChange={(v) => set("health", v)} />
      </div>
      <ModalActions onDelete={editing ? onDelete : null} onSubmit={submit} valid={valid} busy={busy} label={editing ? "Save changes" : "Create battle"} />
    </Modal>
  );
}

// ── Idea modal ───────────────────────────────────────────────────────────────
function IdeaModal({ initial, owners, onSubmit, onDelete, onClose }) {
  const editing = !!initial?.id;
  const [form, setForm] = useState({
    title: initial?.title || "",
    description: initial?.description || "",
    category: initial?.category || "",
    submitted_by: initial?.submitted_by || localStorage.getItem("cainte_mwb_me") || "",
    impact: initial?.impact || 3,
    effort: initial?.effort || 3,
    status: initial?.status || "new",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const valid = form.title.trim().length > 0;
  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      try { if (form.submitted_by) localStorage.setItem("cainte_mwb_me", form.submitted_by); } catch {}
      await onSubmit(form);
    } finally { setBusy(false); }
  };

  return (
    <Modal title={editing ? "Edit idea" : "New idea"} onClose={onClose}>
      <div style={{ marginBottom: 18 }}>
        <FormLabel>Idea <span style={{ color: T.red }}>*</span></FormLabel>
        <input value={form.title} onChange={(e) => set("title", e.target.value)} placeholder="Short and concrete" autoFocus={!editing} style={smallInput} {...focusBlue} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <FormLabel>Description</FormLabel>
        <textarea value={form.description} onChange={(e) => set("description", e.target.value)} rows={4} placeholder="What is it, and what would it do for us?" style={textareaStyle} {...focusBlue} />
      </div>
      <div style={{ marginBottom: 18 }}>
        <FormLabel>Category</FormLabel>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {CATEGORIES.map((c) => {
            const active = form.category === c;
            return (
              <button key={c} type="button" onClick={() => set("category", active ? "" : c)}
                style={{ padding: "8px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: active ? T.text : T.bg, color: active ? "#fff" : T.textSec }}>
                {c}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ marginBottom: 18 }}>
        <FormLabel>Submitted by</FormLabel>
        <input value={form.submitted_by} onChange={(e) => set("submitted_by", e.target.value)} list="mwb-owners-i" placeholder="Your name" style={smallInput} {...focusBlue} />
        <datalist id="mwb-owners-i">{owners.map((o) => <option key={o} value={o} />)}</datalist>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 18, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 200px" }}>
          <FormLabel>Impact (how big a win)</FormLabel>
          <Scale value={form.impact} onChange={(v) => set("impact", v)} color={T.green} />
        </div>
        <div style={{ flex: "1 1 200px" }}>
          <FormLabel>Effort (how hard)</FormLabel>
          <Scale value={form.effort} onChange={(v) => set("effort", v)} color={T.orange} />
        </div>
      </div>
      {editing && form.status !== "promoted" && (
        <div style={{ marginBottom: 18 }}>
          <FormLabel>Status</FormLabel>
          <Segmented options={Object.entries(IDEA_STATUS).filter(([k]) => k !== "promoted")} value={form.status} onChange={(v) => set("status", v)} />
        </div>
      )}
      <div style={{ height: 8 }} />
      <ModalActions onDelete={editing ? onDelete : null} onSubmit={submit} valid={valid} busy={busy} label={editing ? "Save changes" : "Add to catalog"} />
    </Modal>
  );
}

// ── Swap modal (plans change: bring something into focus, move something out) ─
// Either `incoming` is fixed ({ kind: "battle" | "idea", item }) and the user
// picks which active battle makes room, or `outgoing` (an active battle) is
// fixed and the user picks what replaces it from Up next, Paused or the ideas.
const OUT_STATUSES = ["next", "paused", "won", "dropped"];
function SwapModal({ incoming, outgoing, active, candidates, full, onSwap, onQueue, onClose }) {
  const [pick, setPick] = useState(null); // battle id (out) or candidate key (in)
  const [outStatus, setOutStatus] = useState("next");
  const [busy, setBusy] = useState(false);
  const pickingOut = !!incoming;
  const needsOut = pickingOut && full;
  const ready = pickingOut ? (!needsOut || pick) : !!pick;
  const showOutStatus = pickingOut ? !!pick : true;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      const inSide = pickingOut ? { kind: incoming.kind, id: incoming.item.id } : { kind: pick.split(":")[0], id: Number(pick.split(":")[1]) };
      await onSwap({
        ...(inSide.kind === "idea" ? { in_idea_id: inSide.id } : { in_battle_id: inSide.id }),
        out_id: pickingOut ? pick : outgoing.id,
        out_status: outStatus,
      });
    } finally { setBusy(false); }
  };

  const option = (key, selected, title, sub, badge) => (
    <button key={key} type="button" onClick={() => setPick(selected ? null : key)}
      style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", padding: "12px 14px", borderRadius: 12, marginBottom: 8, cursor: "pointer", border: `1.5px solid ${selected ? T.blue : "transparent"}`, background: selected ? T.blue + "10" : T.bg, fontFamily: "inherit" }}>
      <span style={{ width: 18, height: 18, borderRadius: 99, flexShrink: 0, border: `2px solid ${selected ? T.blue : "rgba(60,60,67,0.25)"}`, background: selected ? T.blue : "transparent", boxShadow: selected ? "inset 0 0 0 3px #fff" : "none" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: T.text }}>{title}</span>
        {sub && <span style={{ display: "block", fontSize: 12, color: T.textSec, marginTop: 2 }}>{sub}</span>}
      </span>
      {badge}
    </button>
  );

  const name = pickingOut ? incoming.item.title : outgoing.title;
  return (
    <Modal title={pickingOut ? "Bring into focus" : "Swap out battle"} onClose={onClose}>
      <div style={{ fontSize: 14, color: T.textSec, marginBottom: 18, lineHeight: 1.5 }}>
        {pickingOut
          ? <><b style={{ color: T.text }}>{name}</b> becomes an active battle. {full ? `Focus is full (${MAX_ACTIVE}/${MAX_ACTIVE}), so pick the one it replaces.` : "There's room, so you can add it directly or still swap one out."}</>
          : <>Pick what replaces <b style={{ color: T.text }}>{name}</b>. It takes the same spot in the priority order.</>}
      </div>

      <FormLabel>{pickingOut ? (full ? "Replace" : "Replace (optional)") : "Replace with"}</FormLabel>
      {pickingOut
        ? active.map((b, i) => option(b.id, pick === b.id, `#${i + 1} ${b.title}`, b.owner ? `👤 ${b.owner}` : null))
        : candidates.length === 0
          ? <div style={{ fontSize: 14, color: T.textTert, marginBottom: 12 }}>Nothing in Up next, Paused or the idea catalog yet.</div>
          : candidates.map((c) => option(c.key, pick === c.key, c.title, c.sub,
              <Chip color={c.kind === "idea" ? T.teal : STATUS[c.status]?.color || GRAY}>{c.kind === "idea" ? "Idea" : STATUS[c.status]?.label}</Chip>))}

      {showOutStatus && (
        <div style={{ margin: "14px 0 6px" }}>
          <FormLabel>What happens to {pickingOut ? "the replaced battle" : <b>{name}</b>}?</FormLabel>
          <Segmented options={OUT_STATUSES.map((k) => [k, STATUS[k]])} value={outStatus} onChange={setOutStatus} />
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginTop: 22 }}>
        {onQueue && (
          <button onClick={onQueue} style={{ padding: "14px 16px", borderRadius: 14, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, background: T.pillBg, color: T.textSec }}>
            Just add to Up next
          </button>
        )}
        <button onClick={submit} disabled={!ready || busy}
          style={{ flex: 1, padding: "14px 0", borderRadius: 14, border: "none", cursor: ready ? "pointer" : "default", fontSize: 15, fontWeight: 700, background: ready ? T.blue : T.pillBg, color: ready ? "#fff" : T.textTert, boxShadow: ready ? `0 4px 18px ${T.blue}40` : "none" }}>
          {busy ? "Saving…" : pickingOut && !pick ? "Make it active" : "⇄ Swap"}
        </button>
      </div>
    </Modal>
  );
}

// ── Steps (the concrete work under a battle) ─────────────────────────────────
function StepRow({ step, onToggle, onRemove }) {
  const late = !step.done && step.deadline && daysUntil(step.deadline) < 0;
  const soon = !step.done && step.deadline && daysUntil(step.deadline) >= 0 && daysUntil(step.deadline) <= 3;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `0.5px solid ${T.border}` }}>
      <button onClick={onToggle} title={step.done ? "Mark as open" : "Mark as done"}
        style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 99, border: `2px solid ${step.done ? T.green : "rgba(60,60,67,0.25)"}`, background: step.done ? T.green : "transparent", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", lineHeight: 1, padding: 0 }}>
        {step.done ? "✓" : ""}
      </button>
      <div style={{ flex: 1, minWidth: 0, fontSize: 14, color: step.done ? T.textTert : T.text, textDecoration: step.done ? "line-through" : "none" }}>{step.title}</div>
      {step.owner && <Chip color={T.textSec} bg={T.pillBg}>{step.owner}</Chip>}
      {step.deadline && (
        <span style={{ fontSize: 12, fontWeight: 600, color: late ? T.red : soon ? T.orange : T.textSec, whiteSpace: "nowrap" }}>
          {late ? "⚠ " : ""}{fmtD(step.deadline)}
        </span>
      )}
      <button onClick={onRemove} title="Remove task"
        style={{ background: "none", border: "none", cursor: "pointer", color: T.textTert, fontSize: 13, padding: "2px 4px" }}>✕</button>
    </div>
  );
}

function AddStep({ owners, onAdd }) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [deadline, setDeadline] = useState("");
  const add = async (e) => {
    e?.preventDefault();
    if (!title.trim()) return;
    await onAdd({ title, owner, deadline });
    setTitle(""); setDeadline("");
  };
  const inp = { ...smallInput, padding: "9px 12px", fontSize: 14 };
  return (
    <form onSubmit={add} style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task…" style={{ ...inp, flex: "3 1 200px", width: "auto" }} {...focusBlue} />
      <input value={owner} onChange={(e) => setOwner(e.target.value)} list="mwb-owners-s" placeholder="Owner" style={{ ...inp, flex: "1 1 100px", width: "auto" }} {...focusBlue}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
      <datalist id="mwb-owners-s">{owners.map((o) => <option key={o} value={o} />)}</datalist>
      <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} style={{ ...inp, flex: "1 1 130px", width: "auto" }} {...focusBlue} />
      <button type="submit" disabled={!title.trim()}
        style={{ padding: "9px 16px", borderRadius: 12, border: "none", cursor: title.trim() ? "pointer" : "default", fontSize: 14, fontWeight: 700, background: title.trim() ? T.blue : T.pillBg, color: title.trim() ? "#fff" : T.textTert }}>
        Add
      </button>
    </form>
  );
}

function UpdateBox({ battle, onSave }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(battle.latest_update || "");
  if (!open) {
    return (
      <div style={{ background: T.bg, borderRadius: 12, padding: "11px 14px", marginTop: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            Latest update{battle.update_at ? ` · ${ago(battle.update_at)}` : ""}
          </div>
          <button onClick={() => { setText(battle.latest_update || ""); setOpen(true); }} style={ghostBtn}>✎ Update</button>
        </div>
        <div style={{ fontSize: 14, color: battle.latest_update ? T.text : T.textTert, marginTop: 5, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
          {battle.latest_update || "No update yet: where are we, and what's blocking?"}
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 12 }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus placeholder="Where are we, and what's blocking?" style={textareaStyle} {...focusBlue} />
      <div style={{ display: "flex", gap: 8, marginTop: 8, justifyContent: "flex-end" }}>
        <button onClick={() => setOpen(false)} style={ghostBtn}>Cancel</button>
        <button onClick={async () => { await onSave(text); setOpen(false); }} style={{ ...ghostBtn, background: T.blue, color: "#fff" }}>Post update</button>
      </div>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────
export default function BattlesTracker() {
  const [data, setData] = useState({ battles: [], steps: [], ideas: [] });
  const [loading, setLoading] = useState(true);
  const [view, setViewState] = useState(() => sessionStorage.getItem(VIEW_KEY) || "overview");
  const [battleModal, setBattleModal] = useState(null); // null | {} | battle
  const [ideaModal, setIdeaModal] = useState(null);     // null | {} | idea
  const [showArchive, setShowArchive] = useState(false);
  const [swap, setSwap] = useState(null); // null | { incoming } | { outgoing }
  const [ideaFilter, setIdeaFilter] = useState("open");  // open | parked | promoted | all
  const [ideaCat, setIdeaCat] = useState("");
  const [ideaSort, setIdeaSort] = useState("score");
  const [query, setQuery] = useState("");

  const setView = (v) => { setViewState(v); sessionStorage.setItem(VIEW_KEY, v); };
  const reload = () => mwbApi.data().then((d) => { setData(d); setLoading(false); });
  useEffect(() => { reload(); }, []);

  const stepsBy = useMemo(() => {
    const m = {};
    for (const s of data.steps) (m[s.battle_id] = m[s.battle_id] || []).push(s);
    return m;
  }, [data.steps]);

  const progressOf = (b) => {
    const s = stepsBy[b.id] || [];
    const done = s.filter((x) => x.done).length;
    return { done, total: s.length, pct: s.length ? Math.round((done / s.length) * 100) : 0 };
  };

  const active = data.battles.filter((b) => b.status === "active");
  const upNext = data.battles.filter((b) => b.status === "next");
  const archive = data.battles.filter((b) => ["won", "paused", "dropped"].includes(b.status));
  const owners = useMemo(() => {
    const set = new Set();
    data.battles.forEach((b) => b.owner && set.add(b.owner));
    data.steps.forEach((s) => s.owner && set.add(s.owner));
    data.ideas.forEach((i) => i.submitted_by && set.add(i.submitted_by));
    return [...set].sort();
  }, [data]);

  const activeIds = new Set(active.map((b) => b.id));
  const openSteps = data.steps.filter((s) => !s.done && activeIds.has(s.battle_id));
  const overdue = openSteps.filter((s) => s.deadline && daysUntil(s.deadline) < 0);
  const dueSoon = openSteps.filter((s) => s.deadline && daysUntil(s.deadline) >= 0 && daysUntil(s.deadline) <= 7);
  const openIdeas = data.ideas.filter((i) => i.status === "new" || i.status === "considering");
  const activeSteps = data.steps.filter((s) => activeIds.has(s.battle_id));
  const activeDone = activeSteps.filter((s) => s.done).length;

  // ── Mutations ──────────────────────────────────────────────────────────────
  const activeFull = active.length >= MAX_ACTIVE;
  const saveBattle = async (form) => {
    try {
      if (battleModal?.id) await mwbApi.updateBattle(battleModal.id, form);
      else await mwbApi.createBattle(form);
    } catch (e) { alert(e.message); return; }
    setBattleModal(null);
    reload();
  };
  const deleteBattle = async () => {
    if (!confirm("Delete this battle and all its tasks?")) return;
    await mwbApi.removeBattle(battleModal.id);
    setBattleModal(null);
    reload();
  };
  const patchBattle = async (b, patch) => {
    try { await mwbApi.updateBattle(b.id, patch); } catch (e) { alert(e.message); }
    reload();
  };
  // Moves a battle one place up/down within its own status group.
  const move = async (list, idx, dir) => {
    const j2 = idx + dir;
    if (j2 < 0 || j2 >= list.length) return;
    const group = [...list];
    [group[idx], group[j2]] = [group[j2], group[idx]];
    const others = data.battles.filter((b) => !group.includes(b));
    const ids = [...group, ...others].map((b) => b.id);
    const byId = Object.fromEntries(data.battles.map((b) => [b.id, b]));
    setData((d) => ({ ...d, battles: ids.map((id) => byId[id]) }));
    await mwbApi.reorder(ids);
    reload();
  };
  const addStep = async (bid, form) => { await mwbApi.createStep(bid, form); reload(); };
  const toggleStep = async (s) => {
    setData((d) => ({ ...d, steps: d.steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)) }));
    await mwbApi.updateStep(s.id, { done: !s.done });
    reload();
  };
  const removeStep = async (s) => {
    if (!confirm(`Remove task "${s.title}"?`)) return;
    await mwbApi.removeStep(s.id);
    reload();
  };
  const saveIdea = async (form) => {
    if (ideaModal?.id) await mwbApi.updateIdea(ideaModal.id, form);
    else await mwbApi.createIdea(form);
    setIdeaModal(null);
    reload();
  };
  const deleteIdea = async () => {
    if (!confirm("Delete this idea?")) return;
    await mwbApi.removeIdea(ideaModal.id);
    setIdeaModal(null);
    reload();
  };
  const vote = async (i) => {
    setData((d) => ({ ...d, ideas: d.ideas.map((x) => (x.id === i.id ? { ...x, votes: x.votes + 1 } : x)) }));
    await mwbApi.vote(i.id, 1);
  };
  const promote = (i) => setSwap({ incoming: { kind: "idea", item: i } });
  const queueIdea = async (i) => { await mwbApi.promote(i.id); setSwap(null); reload(); };
  const doSwap = async (body) => {
    try { await mwbApi.swap(body); } catch (e) { alert(e.message); return; }
    setSwap(null);
    reload();
  };
  // Candidates that can replace an active battle.
  const swapCandidates = [
    ...data.battles.filter((b) => b.status === "next" || b.status === "paused")
      .map((b) => ({ key: `battle:${b.id}`, kind: "battle", status: b.status, title: b.title, sub: b.owner ? `👤 ${b.owner}` : null })),
    ...data.ideas.filter((i) => i.status === "new" || i.status === "considering")
      .sort((a, b) => ideaScore(b) - ideaScore(a))
      .map((i) => ({ key: `idea:${i.id}`, kind: "idea", title: i.title, sub: `Score ${ideaScore(i)} · 👍 ${i.votes}${i.submitted_by ? ` · ${i.submitted_by}` : ""}` })),
  ];

  // ── Pieces ─────────────────────────────────────────────────────────────────
  const stat = (label, value, color, sub) => (
    <div style={{ ...card, padding: "16px 18px", flex: "1 1 130px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em", color: color || T.text }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: T.textSec, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  const deadlineChip = (d) => {
    if (!d) return null;
    const n = daysUntil(d);
    const c = n < 0 ? T.red : n <= 14 ? T.orange : T.textSec;
    return <span style={{ fontSize: 12, fontWeight: 600, color: c }}>⚑ {fmtD(d)}{n < 0 ? " · overdue" : n <= 14 ? ` · ${n}d left` : ""}</span>;
  };

  const ArrowBtns = ({ list, idx }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <button onClick={() => move(list, idx, -1)} disabled={idx === 0} title="Higher priority"
        style={{ ...ghostBtn, padding: "2px 8px", opacity: idx === 0 ? 0.3 : 1, cursor: idx === 0 ? "default" : "pointer" }}>▲</button>
      <button onClick={() => move(list, idx, 1)} disabled={idx === list.length - 1} title="Lower priority"
        style={{ ...ghostBtn, padding: "2px 8px", opacity: idx === list.length - 1 ? 0.3 : 1, cursor: idx === list.length - 1 ? "default" : "pointer" }}>▼</button>
    </div>
  );

  // Plain render function (not a component) so the add-task input keeps
  // focus across reloads.
  const renderBattleCard = (b, idx) => {
    const p = progressOf(b);
    const h = HEALTH[b.health] || HEALTH.on_track;
    const tasks = stepsBy[b.id] || [];
    return (
      <div key={b.id} style={{ ...card, padding: "22px 24px", display: "flex", gap: 18, borderLeft: `5px solid ${h.color}` }}>
        <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: "-0.04em", color: idx === 0 ? T.text : T.textTert, minWidth: 40, lineHeight: 1 }}>#{idx + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", cursor: "pointer" }} onClick={() => setBattleModal(b)}>{b.title}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              <Chip color={h.color}>{h.label}</Chip>
              {b.owner && <Chip color={T.textSec} bg={T.pillBg}>👤 {b.owner}</Chip>}
              {deadlineChip(b.deadline)}
            </div>
          </div>
          {b.why && <div style={{ fontSize: 14, color: T.textSec, marginTop: 6, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{b.why}</div>}
          {b.success && (
            <div style={{ fontSize: 13, marginTop: 10, background: T.green + "12", color: T.text, borderRadius: 10, padding: "8px 12px", lineHeight: 1.45 }}>
              <span style={{ fontWeight: 700, color: T.green }}>🏆 Winning = </span>{b.success}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14 }}>
            <div style={{ flex: 1 }}><ProgressBar pct={p.pct} color={h.color} /></div>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.textSec, whiteSpace: "nowrap" }}>{p.total ? `${p.done}/${p.total} tasks` : "No tasks yet"}</div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 2 }}>Tasks</div>
            {tasks.length === 0 && <div style={{ fontSize: 13, color: T.textTert, padding: "6px 0" }}>No tasks yet. What has to happen to win this?</div>}
            {tasks.map((s) => <StepRow key={s.id} step={s} onToggle={() => toggleStep(s)} onRemove={() => removeStep(s)} />)}
            <AddStep owners={owners} onAdd={(form) => addStep(b.id, form)} />
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <ArrowBtns list={active} idx={idx} />
          <button onClick={() => setSwap({ outgoing: b })} title="Swap this battle for something from Up next or the idea catalog"
            style={{ ...ghostBtn, padding: "5px 9px" }}>⇄</button>
        </div>
      </div>
    );
  };

  // ── Views ──────────────────────────────────────────────────────────────────
  const Overview = () => (
    <>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        {stat("Active battles", active.length, null, upNext.length ? `${upNext.length} up next` : null)}
        {stat("Tasks done", activeSteps.length ? `${Math.round((activeDone / activeSteps.length) * 100)}%` : "–", null, `${activeDone} of ${activeSteps.length}`)}
        {stat("Overdue tasks", overdue.length, overdue.length ? T.red : T.green, `${dueSoon.length} due within 7 days`)}
        {stat("Open ideas", openIdeas.length, null, `${data.battles.filter((b) => b.status === "won").length} battles won`)}
      </div>

      <div style={{ ...sectionTitle, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span>🎯 Our focus, in priority order</span>
        <span style={{ color: activeFull ? T.orange : T.textTert, textTransform: "none", letterSpacing: 0 }}>{active.length} / {MAX_ACTIVE} battles</span>
      </div>
      {active.length === 0 ? (
        <div style={{ ...card, padding: "48px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 34, marginBottom: 10 }}>🎯</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>No active battles yet</div>
          <div style={{ fontSize: 14, color: T.textSec, marginBottom: 16 }}>Pick the max 3 things we must win, and the whole team knows where to look.</div>
          <button onClick={() => setBattleModal({})} style={primaryBtn}>＋ New battle</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {active.map((b, i) => renderBattleCard(b, i))}
        </div>
      )}
      {activeFull && (
        <div style={{ fontSize: 13, color: T.textSec, marginTop: 10 }}>Focus is full ({MAX_ACTIVE}/{MAX_ACTIVE}). Plans changed? Use ⇄ on a battle to swap it for something from Up next or the idea catalog.</div>
      )}

      <div style={sectionTitle}>⏭ Up next</div>
      {upNext.length === 0 ? (
        <div style={{ fontSize: 14, color: T.textTert }}>Nothing queued. Promote an idea from the catalog, or add a battle with status "Up next".</div>
      ) : (
        <div style={{ ...card, padding: "4px 20px" }}>
          {upNext.map((b, i) => (
            <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `0.5px solid ${T.border}` : "none" }}>
              <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setBattleModal(b)}>
                <div style={{ fontSize: 15, fontWeight: 600 }}>{b.title}</div>
                {b.why && <div style={{ fontSize: 13, color: T.textSec, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.why}</div>}
              </div>
              {b.owner && <Chip color={T.textSec} bg={T.pillBg}>{b.owner}</Chip>}
              <button onClick={() => activeFull ? setSwap({ incoming: { kind: "battle", item: b } }) : patchBattle(b, { status: "active" })}
                title={activeFull ? "Focus is full. Swap it in for one of the active battles" : "Make this an active battle"}
                style={{ ...ghostBtn, background: T.blue + "18", color: T.blue }}>{activeFull ? "⇄ Swap in" : "Start ▸"}</button>
              <ArrowBtns list={upNext} idx={i} />
            </div>
          ))}
        </div>
      )}

      {archive.length > 0 && (
        <>
          <button onClick={() => setShowArchive((v) => !v)} style={{ ...sectionTitle, background: "none", border: "none", cursor: "pointer", padding: 0, display: "block" }}>
            {showArchive ? "▾" : "▸"} Won, paused & dropped ({archive.length})
          </button>
          {showArchive && (
            <div style={{ ...card, padding: "4px 20px" }}>
              {archive.map((b, i) => {
                const s = STATUS[b.status];
                return (
                  <div key={b.id} onClick={() => setBattleModal(b)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderTop: i ? `0.5px solid ${T.border}` : "none", cursor: "pointer" }}>
                    <div style={{ flex: 1, fontSize: 15, fontWeight: 600, color: b.status === "dropped" ? T.textSec : T.text }}>{b.status === "won" ? "🏆 " : ""}{b.title}</div>
                    <Chip color={s.color}>{s.label}</Chip>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );

  const Progress = () => {
    const battleOf = Object.fromEntries(data.battles.map((b) => [b.id, b]));
    const urgent = [...overdue, ...dueSoon].sort((a, b) => iso(a.deadline).localeCompare(iso(b.deadline)));
    return (
      <>
        {urgent.length > 0 && (
          <div style={{ ...card, padding: "16px 20px", marginBottom: 18, borderLeft: `5px solid ${overdue.length ? T.red : T.orange}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>⏰ Needs attention: {overdue.length} overdue, {dueSoon.length} due within 7 days</div>
            {urgent.map((s) => (
              <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, padding: "4px 0" }}>
                <span style={{ fontWeight: 700, color: daysUntil(s.deadline) < 0 ? T.red : T.orange, minWidth: 54 }}>{fmtD(s.deadline)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{s.title}{s.owner ? <span style={{ color: T.textSec }}> · {s.owner}</span> : null}</span>
                <span style={{ color: T.textTert, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 220 }}>{battleOf[s.battle_id]?.title}</span>
              </div>
            ))}
          </div>
        )}
        {active.length === 0 ? (
          <div style={{ ...card, padding: "48px 24px", textAlign: "center", color: T.textSec }}>No active battles. Start one from the Overview.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {active.map((b, idx) => {
              const p = progressOf(b);
              const h = HEALTH[b.health] || HEALTH.on_track;
              const steps = stepsBy[b.id] || [];
              return (
                <div key={b.id} style={{ ...card, padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: T.textTert }}>#{idx + 1}</span>
                    <div style={{ flex: 1, fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em", minWidth: 160 }}>{b.title}</div>
                    {b.owner && <Chip color={T.textSec} bg={T.pillBg}>👤 {b.owner}</Chip>}
                    {deadlineChip(b.deadline)}
                    <button onClick={() => setSwap({ outgoing: b })} style={ghostBtn}>⇄ Swap</button>
                    <button onClick={() => setBattleModal(b)} style={ghostBtn}>Edit</button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    {Object.entries(HEALTH).map(([k, m]) => (
                      <button key={k} onClick={() => patchBattle(b, { health: k })}
                        style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: `1.5px solid ${b.health === k ? m.color : "transparent"}`, background: b.health === k ? m.color + "18" : T.pillBg, color: b.health === k ? m.color : T.textSec, cursor: "pointer" }}>
                        {m.label}
                      </button>
                    ))}
                    <div style={{ flex: 1, minWidth: 120, marginLeft: 6 }}><ProgressBar pct={p.pct} color={h.color} /></div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.textSec }}>{p.pct}%</span>
                  </div>
                  <UpdateBox key={`${b.id}-${b.update_at}`} battle={b} onSave={(text) => patchBattle(b, { latest_update: text })} />
                  <div style={{ marginTop: 14 }}>
                    {steps.length === 0 && <div style={{ fontSize: 13, color: T.textTert, padding: "6px 0" }}>No tasks yet. Break the battle down into concrete tasks with owners and deadlines.</div>}
                    {steps.map((s) => <StepRow key={s.id} step={s} onToggle={() => toggleStep(s)} onRemove={() => removeStep(s)} />)}
                    <AddStep owners={owners} onAdd={(form) => addStep(b.id, form)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  const Ideas = () => {
    const q = query.trim().toLowerCase();
    let list = data.ideas.filter((i) =>
      ideaFilter === "all" ? true : ideaFilter === "open" ? (i.status === "new" || i.status === "considering") : i.status === ideaFilter);
    if (ideaCat) list = list.filter((i) => i.category === ideaCat);
    if (q) list = list.filter((i) => `${i.title} ${i.description} ${i.submitted_by}`.toLowerCase().includes(q));
    list = [...list].sort((a, b) =>
      ideaSort === "votes" ? b.votes - a.votes || ideaScore(b) - ideaScore(a)
      : ideaSort === "new" ? String(b.created_at).localeCompare(String(a.created_at))
      : ideaScore(b) - ideaScore(a) || b.votes - a.votes);
    const counts = {
      open: data.ideas.filter((i) => i.status === "new" || i.status === "considering").length,
      parked: data.ideas.filter((i) => i.status === "parked").length,
      promoted: data.ideas.filter((i) => i.status === "promoted").length,
      all: data.ideas.length,
    };
    const pill = (active, onClick, label) => (
      <button key={label} onClick={onClick}
        style={{ padding: "7px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500, background: active ? "#fff" : "transparent", color: active ? T.text : T.textSec, boxShadow: active ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
        {label}
      </button>
    );
    return (
      <>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 4, background: T.pillBg, borderRadius: 99, padding: 3 }}>
            {[["open", "Open"], ["parked", "Parked"], ["promoted", "Promoted"], ["all", "All"]].map(([k, l]) =>
              pill(ideaFilter === k, () => setIdeaFilter(k), `${l} ${counts[k]}`))}
          </div>
          <div style={{ display: "flex", gap: 4, background: T.pillBg, borderRadius: 99, padding: 3 }}>
            {[["score", "Best score"], ["votes", "Most votes"], ["new", "Newest"]].map(([k, l]) => pill(ideaSort === k, () => setIdeaSort(k), l))}
          </div>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search ideas…"
            style={{ ...smallInput, padding: "9px 14px", fontSize: 14, flex: "1 1 180px", width: "auto" }} {...focusBlue} />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 18 }}>
          {["", ...CATEGORIES].map((c) => {
            const a = ideaCat === c;
            return (
              <button key={c || "all"} onClick={() => setIdeaCat(c)}
                style={{ padding: "5px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, background: a ? T.text : T.pillBg, color: a ? "#fff" : T.textSec }}>
                {c || "All categories"}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize: 12, color: T.textTert, marginBottom: 12 }}>Score = impact × (6 − effort). High impact and low effort float to the top.</div>
        {list.length === 0 ? (
          <div style={{ ...card, padding: "48px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 34, marginBottom: 10 }}>💡</div>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{data.ideas.length ? "No ideas match" : "The catalog is empty"}</div>
            <div style={{ fontSize: 14, color: T.textSec, marginBottom: 16 }}>Everyone can add ideas. The best ones become Must Win Battles.</div>
            <button onClick={() => setIdeaModal({})} style={primaryBtn}>＋ New idea</button>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 14 }}>
            {list.map((i) => {
              const st = IDEA_STATUS[i.status] || IDEA_STATUS.new;
              const linked = i.battle_id && data.battles.find((b) => b.id === i.battle_id);
              return (
                <div key={i.id} style={{ ...card, padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10, opacity: i.status === "parked" ? 0.7 : 1 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em", cursor: "pointer" }} onClick={() => setIdeaModal(i)}>{i.title}</div>
                    <div title="Score" style={{ fontSize: 13, fontWeight: 800, color: "#fff", background: ideaScore(i) >= 15 ? T.green : ideaScore(i) >= 8 ? T.blue : GRAY, borderRadius: 8, padding: "3px 8px" }}>{ideaScore(i)}</div>
                  </div>
                  {i.description && <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5, whiteSpace: "pre-wrap", display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{i.description}</div>}
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                    <Chip color={st.color}>{st.label}</Chip>
                    {i.category && <Chip color={T.textSec} bg={T.pillBg}>{i.category}</Chip>}
                    {i.submitted_by && <span style={{ fontSize: 12, color: T.textTert }}>by {i.submitted_by}</span>}
                  </div>
                  <div style={{ display: "flex", gap: 14, fontSize: 12, color: T.textSec }}>
                    <span>Impact <Dots n={i.impact} color={T.green} /></span>
                    <span>Effort <Dots n={i.effort} color={T.orange} /></span>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: "auto", paddingTop: 4, flexWrap: "wrap" }}>
                    <button onClick={() => vote(i)} style={ghostBtn}>👍 {i.votes}</button>
                    {i.status === "promoted" ? (
                      <span style={{ fontSize: 12, color: T.green, fontWeight: 600, alignSelf: "center" }}>→ {linked ? linked.title : "Battle"}</span>
                    ) : (
                      <>
                        <button onClick={() => promote(i)} style={{ ...ghostBtn, background: T.green + "18", color: T.green }}>🎯 Make it a battle</button>
                        {i.status === "parked"
                          ? <button onClick={async () => { await mwbApi.updateIdea(i.id, { status: "considering" }); reload(); }} style={ghostBtn}>Unpark</button>
                          : <button onClick={async () => { await mwbApi.updateIdea(i.id, { status: "parked" }); reload(); }} style={ghostBtn}>Park</button>}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 80px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, marginBottom: 22 }}>
        <div>
          <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em" }}>Must Win Battles</div>
          <div style={{ fontSize: 14, color: T.textSec, marginTop: 3 }}>What we focus on, what's in motion, and the ideas waiting in line</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => setIdeaModal({})} style={{ ...primaryBtn, background: "#fff", color: T.text, boxShadow: "0 1px 3px rgba(0,0,0,0.12)" }}>💡 New idea</button>
          <button onClick={() => setBattleModal({})} style={primaryBtn}>＋ New battle</button>
        </div>
      </div>

      <div style={{ display: "flex", gap: 4, background: T.pillBg, borderRadius: 99, padding: 3, width: "fit-content", marginBottom: 22, maxWidth: "100%", overflowX: "auto" }}>
        {VIEWS.map((v) => {
          const a = view === v.key;
          const badge = v.key === "progress" ? overdue.length : v.key === "ideas" ? openIdeas.length : 0;
          return (
            <button key={v.key} onClick={() => setView(v.key)}
              style={{ padding: "7px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: a ? 700 : 500, background: a ? "#fff" : "transparent", color: a ? T.text : T.textSec, boxShadow: a ? "0 1px 3px rgba(0,0,0,0.12)" : "none", whiteSpace: "nowrap" }}>
              {v.label}
              {badge > 0 && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: "#fff", background: v.key === "progress" ? T.red : T.blue, borderRadius: 99, padding: "1px 6px" }}>{badge}</span>}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ textAlign: "center", color: T.textSec, padding: "60px 0" }}>Loading…</div>
      ) : view === "progress" ? Progress() : view === "ideas" ? Ideas() : Overview()}

      {battleModal && <BattleModal initial={battleModal} owners={owners} activeFull={activeFull} onSubmit={saveBattle} onDelete={deleteBattle} onClose={() => setBattleModal(null)} />}
      {swap && (
        <SwapModal incoming={swap.incoming} outgoing={swap.outgoing} active={active} candidates={swapCandidates} full={activeFull}
          onSwap={doSwap} onQueue={swap.incoming?.kind === "idea" ? () => queueIdea(swap.incoming.item) : null} onClose={() => setSwap(null)} />
      )}
      {ideaModal && <IdeaModal initial={ideaModal} owners={owners} onSubmit={saveIdea} onDelete={deleteIdea} onClose={() => setIdeaModal(null)} />}
    </div>
  );
}
