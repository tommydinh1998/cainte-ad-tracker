import { useState, useEffect } from "react";
import { T, fmt, daysBetween, Chip, Label, IconBtn, Field } from "./theme.jsx";
import { api } from "./brand.js";

const today = new Date();

const PLATFORMS = ["Instagram", "TikTok", "Both", "Other"];        // a creator's main channel
const COLLAB_PLATFORMS = ["Instagram", "TikTok", "Both"];          // what a single collaboration runs on
// "Meta" was the old label for Instagram — kept in the colour map so legacy rows still render.
const PLATFORM_COLOR = { Instagram: "#C13584", Meta: "#C13584", TikTok: "#FF2D55", Both: "#5856D6", Other: "#8E8E93" };
const normPlatform = (p) => (p === "Meta" ? "Instagram" : (p || ""));

const TYPES = ["Gifting", "Paid", "Affiliate", "Ambassador", "Ongoing", "Other"];
const TYPE_COLOR = { Gifting: T.purple, Paid: T.blue, Affiliate: T.teal, Ambassador: T.orange, Ongoing: "#5856D6", Other: "#8E8E93" };

const GENDERS = ["Woman", "Man"];
const GENDER_COLOR = { Woman: "#FF2D55", Man: "#007AFF" };

// Agreed deliverables and actually delivered content share one vocabulary.
const CONTENT_TYPES = ["Reel", "Story", "TikTok Video", "Post", "UGC", "Other"];
const CONTENT_COLOR = { Reel: "#AF52DE", Story: "#FF9500", "TikTok Video": "#FF2D55", Post: "#007AFF", UGC: "#30B0C7", Other: "#8E8E93" };
const DELIVERABLES = CONTENT_TYPES;

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const monthLabel = (key) => { const [y, m] = key.split("-"); return `${MONTHS_SHORT[Number(m) - 1]} ${y}`; };
// A piece without an explicit date falls back to the month its collaboration was created.
const pieceMonth = (piece, collab) => (piece.postedOn || "").slice(0, 7) || String(collab?.createdAt || "").slice(0, 7);
const pieceQty = (p) => Math.max(1, Number(p.qty) || 1);
const countPieces = (list) => list.reduce((s, p) => s + pieceQty(p), 0);
const tallyTypes = (list) => {
  const t = {};
  list.forEach(p => { t[p.type] = (t[p.type] || 0) + pieceQty(p); });
  return t;
};
// pieces must already carry a `_month` key (see pieceMonth)
const monthSeries = (pieces, keys) => keys.map(key => {
  const inMonth = pieces.filter(p => p._month === key);
  return { key, total: countPieces(inMonth), byType: tallyTypes(inMonth) };
});
const monthKeysBack = (n, from = today) => Array.from({ length: n }, (_, i) => {
  const d = new Date(from.getFullYear(), from.getMonth() - (n - 1 - i), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
});
const monthKeysOfYear = (year) => MONTHS_SHORT.map((_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

const STATUS = {
  upcoming:    { label: "Upcoming",    color: T.blue },
  in_progress: { label: "In Progress", color: T.orange },
  completed:   { label: "Completed",   color: T.green },
  cancelled:   { label: "Cancelled",   color: T.textSec },
};
const STATUS_KEYS = ["upcoming", "in_progress", "completed", "cancelled"];

const RATING_TAGS = ["Easy to work with", "Delivers on time", "Good performance", "Would collaborate again"];

const kr = (n) => `${Number(n || 0).toLocaleString("da-DK")} kr`;
const initials = (name) => (name || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("").toUpperCase();

const MAX_FILE_MB = 10;
const fmtSize = (b) => b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`;
const fileToStaged = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve({ name: file.name, type: file.type || "application/octet-stream", size: file.size, dataBase64: String(reader.result).split(",")[1] || "" });
  reader.onerror = reject;
  reader.readAsDataURL(file);
});
// A collaboration's platform, falling back to the creator's main channel for older rows.
const collabPlatform = (creator, collab) => normPlatform(collab?.platform) || normPlatform(creator?.platform);
const platformMatch = (platform, filter) =>
  filter === "All" || platform === filter ||
  (platform === "Both" && (filter === "Instagram" || filter === "TikTok"));

// ── Small building blocks ─────────────────────────────────────────────────────
const StarRating = ({ value = 0, onChange, size = 18, readOnly = false }) => {
  const [hover, setHover] = useState(0);
  return (
    <div style={{ display: "inline-flex", gap: 2 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = (hover || value) >= n;
        return (
          <span key={n}
            onClick={readOnly ? undefined : () => onChange(n === value ? 0 : n)}
            onMouseEnter={readOnly ? undefined : () => setHover(n)}
            onMouseLeave={readOnly ? undefined : () => setHover(0)}
            style={{ cursor: readOnly ? "default" : "pointer", fontSize: size, lineHeight: 1, color: filled ? T.yellow : "rgba(60,60,67,0.2)", transition: "color 0.1s" }}>
            ★
          </span>
        );
      })}
    </div>
  );
};

const Segmented = ({ options, value, onChange, labelFor, colorFor }) => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {options.map(opt => {
      const active = value === opt;
      const c = colorFor ? colorFor(opt) : T.blue;
      return (
        <button key={opt} onClick={() => onChange(opt)}
          style={{ flex: "1 1 0", minWidth: 78, padding: "11px 8px", borderRadius: 12, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, background: active ? c : T.bg, color: active ? "#fff" : T.textSec, boxShadow: active ? `0 4px 14px ${c}45` : "none", transition: "all 0.15s" }}>
          {labelFor ? labelFor(opt) : opt}
        </button>
      );
    })}
  </div>
);

const MultiSelectChips = ({ options, selected, onToggle }) => (
  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
    {options.map(opt => {
      const active = selected.includes(opt);
      return (
        <button key={opt} onClick={() => onToggle(opt)}
          style={{ padding: "7px 14px", borderRadius: 99, fontSize: 13, fontWeight: 600, border: `1.5px solid ${active ? T.blue : "transparent"}`, background: active ? T.blue + "18" : T.pillBg, color: active ? T.blue : T.textSec, cursor: "pointer", transition: "all 0.15s" }}>
          {active ? "✓ " : ""}{opt}
        </button>
      );
    })}
  </div>
);

const smallInput = { width: "100%", background: T.bg, border: "1.5px solid rgba(60,60,67,0.1)", borderRadius: 10, padding: "10px 13px", color: T.text, fontSize: 14, boxSizing: "border-box", outline: "none", fontFamily: "inherit", transition: "border-color 0.15s" };
const textareaStyle = { ...smallInput, padding: "13px 15px", fontSize: 15, borderRadius: 12, lineHeight: 1.55, resize: "none" };
const focusBlue = { onFocus: e => e.target.style.borderColor = T.blue, onBlur: e => e.target.style.borderColor = "rgba(60,60,67,0.1)" };

const overlay = { position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.40)", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px 16px" };
const cardStyle = { background: "#fff", borderRadius: 22, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", padding: "30px 28px 32px", boxShadow: "0 24px 80px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.05)" };

const FormLabel = ({ children }) => (
  <div style={{ fontSize: 13, fontWeight: 600, color: T.textSec, marginBottom: 8 }}>{children}</div>
);

// ── Shared collaboration sub-form (used by Add-Influencer + Collaboration modals) ─
const CollabFields = ({ collab, patch }) => {
  const products = collab.products || [];
  const setProducts = (arr) =>
    patch({ products: arr, productCount: arr.reduce((s, p) => s + (Number(p.qty) || 0), 0) });
  const addProduct = () => setProducts([...products, { name: "", qty: 1 }]);
  const removeProduct = (i) => setProducts(products.filter((_, j) => j !== i));
  const updProduct = (i, f, v) => setProducts(products.map((p, j) => j === i ? { ...p, [f]: v } : p));
  const toggleDeliverable = (d) => {
    const sel = collab.deliverables || [];
    patch({ deliverables: sel.includes(d) ? sel.filter(x => x !== d) : [...sel, d] });
  };

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <FormLabel>Collaboration type</FormLabel>
        <Segmented options={TYPES} value={collab.type} onChange={v => patch({ type: v })} colorFor={t => TYPE_COLOR[t]} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <FormLabel>Platform <span style={{ color: T.textTert, fontWeight: 400 }}>— what this collaboration runs on</span></FormLabel>
        <Segmented options={COLLAB_PLATFORMS} value={normPlatform(collab.platform)} onChange={v => patch({ platform: v })}
          labelFor={p => p === "Both" ? "Both platforms" : p} colorFor={p => PLATFORM_COLOR[p]} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <FormLabel>Deliverables <span style={{ color: T.textTert, fontWeight: 400 }}>— what was agreed</span></FormLabel>
        <MultiSelectChips options={DELIVERABLES} selected={collab.deliverables || []} onToggle={toggleDeliverable} />
      </div>

      <ContentField collab={collab} patch={patch} />

      <div style={{ marginBottom: 20 }}>
        <FormLabel>Products sent <span style={{ color: T.textTert, fontWeight: 400 }}>— jewellery</span></FormLabel>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {products.map((p, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 28px", gap: 8, alignItems: "center" }}>
              <input value={p.name} onChange={e => updProduct(i, "name", e.target.value)} placeholder={`Product ${i + 1}`} style={smallInput} {...focusBlue} />
              <input type="number" min="1" value={p.qty} onChange={e => updProduct(i, "qty", e.target.value)} placeholder="Qty" style={{ ...smallInput, textAlign: "center" }} {...focusBlue} />
              <button onClick={() => removeProduct(i)} style={{ background: "none", border: "none", color: T.textTert, cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>
        <button onClick={addProduct} style={{ marginTop: 8, background: "none", border: "none", color: T.blue, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}>+ Add product</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <FormLabel>Total value</FormLabel>
        <div style={{ position: "relative" }}>
          <input type="number" min="0" value={collab.totalValue || ""} onChange={e => patch({ totalValue: e.target.value })} placeholder="0" style={{ ...smallInput, paddingRight: 40 }} {...focusBlue} />
          <span style={{ position: "absolute", right: 13, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: T.textTert }}>kr</span>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <FormLabel>Status</FormLabel>
        <Segmented options={STATUS_KEYS} value={collab.status} onChange={v => patch({ status: v })} labelFor={k => STATUS[k].label} colorFor={k => STATUS[k].color} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <FormLabel>Responsible</FormLabel>
        <input value={collab.responsible || ""} onChange={e => patch({ responsible: e.target.value })} placeholder="Employee name" style={smallInput} {...focusBlue} />
      </div>

      <div style={{ marginBottom: 20 }}>
        <FormLabel>Notes</FormLabel>
        <textarea value={collab.notes || ""} onChange={e => patch({ notes: e.target.value })} rows={3} placeholder="Comments…" style={textareaStyle} {...focusBlue} />
      </div>

      <AttachmentsField collab={collab} patch={patch} />
    </>
  );
};

// ── Content pieces editor (what actually got delivered, and when) ─────────────
const ContentField = ({ collab, patch }) => {
  const content = collab.content || [];
  const setContent = (arr) => patch({ content: arr });
  const add = () => setContent([...content, {
    type: normPlatform(collab.platform) === "TikTok" ? "TikTok Video" : "Reel",
    platform: normPlatform(collab.platform) === "Both" ? "Instagram" : (normPlatform(collab.platform) || "Instagram"),
    qty: 1, postedOn: isoDate(today), link: "",
  }]);
  const upd = (i, f, v) => setContent(content.map((p, j) => j === i ? { ...p, [f]: v } : p));
  const remove = (i) => setContent(content.filter((_, j) => j !== i));
  const total = countPieces(content);

  return (
    <div style={{ marginBottom: 20 }}>
      <FormLabel>
        Content received <span style={{ color: T.textTert, fontWeight: 400 }}>— counts towards the monthly overview</span>
      </FormLabel>

      {content.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
          {content.map((p, i) => (
            <div key={i} style={{ background: T.bg, borderRadius: 11, padding: "10px 11px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 60px 28px", gap: 7, alignItems: "center" }}>
                <select value={p.type} onChange={e => upd(i, "type", e.target.value)} style={{ ...smallInput, background: "#fff", cursor: "pointer" }}>
                  {CONTENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <input type="date" value={(p.postedOn || "").slice(0, 10)} onChange={e => upd(i, "postedOn", e.target.value)}
                  style={{ ...smallInput, background: "#fff" }} {...focusBlue} />
                <input type="number" min="1" value={p.qty} onChange={e => upd(i, "qty", e.target.value)} title="How many"
                  style={{ ...smallInput, background: "#fff", textAlign: "center" }} {...focusBlue} />
                <button onClick={() => remove(i)} style={{ background: "none", border: "none", color: T.textTert, cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 7, marginTop: 7 }}>
                <select value={normPlatform(p.platform)} onChange={e => upd(i, "platform", e.target.value)} style={{ ...smallInput, background: "#fff", cursor: "pointer" }}>
                  <option value="Instagram">Instagram</option>
                  <option value="TikTok">TikTok</option>
                </select>
                <input value={p.link || ""} onChange={e => upd(i, "link", e.target.value)} placeholder="Link (optional)"
                  style={{ ...smallInput, background: "#fff" }} {...focusBlue} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button onClick={add} style={{ background: "none", border: "none", color: T.blue, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}>+ Add content piece</button>
        {total > 0 && <span style={{ fontSize: 12, color: T.textSec }}>{total} piece{total !== 1 ? "s" : ""} logged</span>}
      </div>
    </div>
  );
};

// ── Attachments editor (agreements / contracts) ───────────────────────────────
const AttachmentsField = ({ collab, patch }) => {
  const existing = collab.attachments || [];
  const staged = collab._newFiles || [];

  const onPick = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const tooBig = files.find(f => f.size > MAX_FILE_MB * 1048576);
    if (tooBig) { alert(`"${tooBig.name}" is ${fmtSize(tooBig.size)} — max ${MAX_FILE_MB} MB per file.`); return; }
    const added = await Promise.all(files.map(fileToStaged));
    patch({ _newFiles: [...staged, ...added] });
  };
  const removeStaged = (i) => patch({ _newFiles: staged.filter((_, j) => j !== i) });
  const deleteExisting = async (id) => {
    patch({ attachments: existing.filter(a => a.id !== id) });
    await api(`/api/files/${id}`, { method: "DELETE" });
  };

  const row = { display: "flex", alignItems: "center", gap: 8, background: T.bg, borderRadius: 9, padding: "8px 11px", marginBottom: 6 };

  return (
    <div style={{ marginBottom: 4 }}>
      <FormLabel>Attachments <span style={{ color: T.textTert, fontWeight: 400 }}>— agreements, contracts</span></FormLabel>

      {existing.map(a => (
        <div key={a.id} style={row}>
          <span style={{ fontSize: 15 }}>📎</span>
          <a href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.blue, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.filename}</a>
          <span style={{ fontSize: 11, color: T.textTert, flexShrink: 0 }}>{fmtSize(a.size)}</span>
          <button onClick={() => deleteExisting(a.id)} style={{ background: "none", border: "none", color: T.textTert, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>✕</button>
        </div>
      ))}

      {staged.map((f, i) => (
        <div key={i} style={row}>
          <span style={{ fontSize: 15 }}>📎</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
          <span style={{ fontSize: 11, color: T.green, flexShrink: 0 }}>ready</span>
          <button onClick={() => removeStaged(i)} style={{ background: "none", border: "none", color: T.textTert, cursor: "pointer", fontSize: 15, lineHeight: 1, padding: 0 }}>✕</button>
        </div>
      ))}

      <label style={{ display: "inline-block", marginTop: 4, background: "none", border: `1.5px dashed rgba(60,60,67,0.2)`, borderRadius: 10, color: T.blue, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "9px 16px" }}>
        + Attach file
        <input type="file" multiple onChange={onPick} style={{ display: "none" }} />
      </label>
    </div>
  );
};

const cleanCollab = (c) => {
  const products = (c.products || []).filter(p => p.name && p.name.trim());
  const content = (c.content || []).filter(p => p.type).map(p => ({
    type: p.type,
    platform: normPlatform(p.platform) || (normPlatform(c.platform) === "Both" ? "Instagram" : normPlatform(c.platform)),
    qty: Math.max(1, Number(p.qty) || 1),
    postedOn: (p.postedOn || "").slice(0, 10),
    link: (p.link || "").trim(),
    notes: (p.notes || "").trim(),
  }));
  return {
    type: c.type || "Gifting",
    status: c.status || "upcoming",
    platform: normPlatform(c.platform) || "Instagram",
    content,
    deliverables: c.deliverables || [],
    products,
    productCount: products.reduce((s, p) => s + (Number(p.qty) || 0), 0),
    totalValue: Number(c.totalValue) || 0,
    responsible: (c.responsible || "").trim(),
    notes: (c.notes || "").trim(),
    _newFiles: c._newFiles || [],   // staged uploads — stripped before hitting the API
  };
};

const blankCollab = (platform) => ({
  type: "Gifting", status: "upcoming", platform: normPlatform(platform) || "Instagram",
  deliverables: [], content: [], products: [{ name: "", qty: 1 }], productCount: 0, totalValue: 0,
  responsible: "", notes: "", attachments: [], _newFiles: [],
});

// ── Add Influencer modal (creator + first collaboration) ──────────────────────
const InfluencerModal = ({ onClose, onAdd }) => {
  const [name, setName] = useState("");
  const [profileLink, setProfileLink] = useState("");
  const [platform, setPlatform] = useState("Instagram");
  const [gender, setGender] = useState("");
  const [collab, setCollab] = useState(blankCollab);
  const [errName, setErrName] = useState(false);
  const patch = (o) => setCollab(c => ({ ...c, ...o }));
  // Picking the creator's main channel pre-fills the collaboration's platform.
  const pickPlatform = (p) => {
    setPlatform(p);
    if (COLLAB_PLATFORMS.includes(p)) patch({ platform: p });
  };

  const submit = () => {
    if (!name.trim()) { setErrName(true); return; }
    onAdd({ name: name.trim(), profileLink: profileLink.trim(), platform, gender, collaboration: cleanCollab(collab) });
    onClose();
  };

  return (
    <div style={overlay}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: "-0.025em" }}>Add Influencer</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.textTert, cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 14, color: T.textSec, marginBottom: 22 }}>Creates the creator and their first collaboration.</div>

        <Field label="Influencer name" value={name} onChange={v => { setName(v); if (v.trim()) setErrName(false); }} placeholder="e.g. Jane Doe" required error={errName ? "Name is required" : null} />
        <Field label="Profile link" value={profileLink} onChange={setProfileLink} placeholder="https://instagram.com/…" />

        <div style={{ marginBottom: 20 }}>
          <FormLabel>Main channel <span style={{ color: T.textTert, fontWeight: 400 }}>— where the creator posts</span></FormLabel>
          <Segmented options={PLATFORMS} value={platform} onChange={pickPlatform} colorFor={p => PLATFORM_COLOR[p]} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <FormLabel>Gender <span style={{ color: T.textTert, fontWeight: 400 }}>— for product insights</span></FormLabel>
          <Segmented options={GENDERS} value={gender} onChange={setGender} colorFor={g => GENDER_COLOR[g]} />
        </div>

        <div style={{ height: 1, background: T.border, margin: "4px 0 22px" }} />

        <CollabFields collab={collab} patch={patch} />

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "15px 0", background: T.bg, border: "none", borderRadius: 13, color: T.text, fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} style={{ flex: 2, padding: "15px 0", background: T.blue, border: "none", borderRadius: 13, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 18px ${T.blue}40` }}>Add Influencer</button>
        </div>
      </div>
    </div>
  );
};

// ── Add / Edit collaboration modal (under an existing creator) ────────────────
const CollaborationModal = ({ creator, editCollab, onClose, onSave }) => {
  const isEdit = !!editCollab;
  const [collab, setCollab] = useState(() => editCollab
    ? {
        ...editCollab,
        platform: collabPlatform(creator, editCollab) || "Instagram",
        content: editCollab.content || [],
        products: editCollab.products?.length ? editCollab.products : [{ name: "", qty: 1 }],
      }
    : blankCollab(creator.platform));
  const patch = (o) => setCollab(c => ({ ...c, ...o }));

  const submit = () => {
    const data = cleanCollab(collab);
    onSave(isEdit ? { ...data, id: editCollab.id } : data);
    onClose();
  };

  return (
    <div style={overlay}>
      <div style={cardStyle}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: "-0.025em" }}>{isEdit ? "Edit Collaboration" : "New Collaboration"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.textTert, cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 14, color: T.textSec, marginBottom: 22 }}>{creator.name}</div>

        <CollabFields collab={collab} patch={patch} />

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "15px 0", background: T.bg, border: "none", borderRadius: 13, color: T.text, fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} style={{ flex: 2, padding: "15px 0", background: T.blue, border: "none", borderRadius: 13, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 18px ${T.blue}40` }}>{isEdit ? "Save Changes" : "Add Collaboration"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Quick "log a content piece" modal ─────────────────────────────────────────
const QuickContentModal = ({ creator, collab, onClose, onSave }) => {
  const platform = collabPlatform(creator, collab);
  const [piece, setPiece] = useState({
    type: platform === "TikTok" ? "TikTok Video" : "Reel",
    platform: platform === "Both" ? "Instagram" : (platform || "Instagram"),
    qty: 1, postedOn: isoDate(today), link: "",
  });
  const set = (k, v) => setPiece(p => ({ ...p, [k]: v }));

  return (
    <div style={overlay}>
      <div style={{ ...cardStyle, maxWidth: 440 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: "-0.025em" }}>Log content</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.textTert, cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 14, color: T.textSec, marginBottom: 20 }}>{creator.name} · {collab.type} collaboration</div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Content type</FormLabel>
          <MultiSelectChips options={CONTENT_TYPES} selected={[piece.type]} onToggle={t => set("type", t)} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Platform</FormLabel>
          <Segmented options={["Instagram", "TikTok"]} value={piece.platform} onChange={v => set("platform", v)} colorFor={p => PLATFORM_COLOR[p]} />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 90px", gap: 10, marginBottom: 18 }}>
          <div>
            <FormLabel>Date received</FormLabel>
            <input type="date" value={piece.postedOn} onChange={e => set("postedOn", e.target.value)} style={smallInput} {...focusBlue} />
          </div>
          <div>
            <FormLabel>How many</FormLabel>
            <input type="number" min="1" value={piece.qty} onChange={e => set("qty", e.target.value)} style={{ ...smallInput, textAlign: "center" }} {...focusBlue} />
          </div>
        </div>

        <div style={{ marginBottom: 4 }}>
          <FormLabel>Link <span style={{ color: T.textTert, fontWeight: 400 }}>— optional</span></FormLabel>
          <input value={piece.link} onChange={e => set("link", e.target.value)} placeholder="https://…" style={smallInput} {...focusBlue} />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "14px 0", background: T.bg, border: "none", borderRadius: 13, color: T.text, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => { onSave(creator.id, collab.id, piece); onClose(); }}
            style={{ flex: 2, padding: "14px 0", background: T.blue, border: "none", borderRadius: 13, color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 18px ${T.blue}40` }}>Log content</button>
        </div>
      </div>
    </div>
  );
};

// ── Sourcing modal ────────────────────────────────────────────────────────────
const SourcingModal = ({ editEntry, onClose, onSave }) => {
  const isEdit = !!editEntry;
  const [form, setForm] = useState({
    name: editEntry?.name || "", profileLink: editEntry?.profileLink || "",
    platform: normPlatform(editEntry?.platform) || "Instagram", comment: editEntry?.comment || "", addedBy: editEntry?.addedBy || "",
  });
  const [errName, setErrName] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = () => {
    if (!form.name.trim()) { setErrName(true); return; }
    onSave(isEdit ? { ...form, id: editEntry.id } : form);
    onClose();
  };

  return (
    <div style={overlay}>
      <div style={{ ...cardStyle, maxWidth: 480 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 }}>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.text, letterSpacing: "-0.025em" }}>{isEdit ? "Edit Profile" : "Save Profile"}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.textTert, cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontSize: 14, color: T.textSec, marginBottom: 22 }}>A potential creator to contact later.</div>

        <Field label="Name" value={form.name} onChange={v => { set("name", v); if (v.trim()) setErrName(false); }} placeholder="Name or @handle" required error={errName ? "Name is required" : null} />
        <Field label="Profile link" value={form.profileLink} onChange={v => set("profileLink", v)} placeholder="https://…" />

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Platform</FormLabel>
          <Segmented options={PLATFORMS} value={form.platform} onChange={v => set("platform", v)} colorFor={p => PLATFORM_COLOR[p]} />
        </div>

        <div style={{ marginBottom: 18 }}>
          <FormLabel>Comment</FormLabel>
          <textarea value={form.comment} onChange={e => set("comment", e.target.value)} rows={3} placeholder="e.g. High engagement — good for next launch." style={textareaStyle} {...focusBlue} />
        </div>

        <Field label="Added by" value={form.addedBy} onChange={v => set("addedBy", v)} placeholder="Your name" />

        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: "15px 0", background: T.bg, border: "none", borderRadius: 13, color: T.text, fontSize: 16, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
          <button onClick={submit} style={{ flex: 2, padding: "15px 0", background: T.blue, border: "none", borderRadius: 13, color: "#fff", fontSize: 16, fontWeight: 700, cursor: "pointer", boxShadow: `0 4px 18px ${T.blue}40` }}>{isEdit ? "Save Changes" : "Save Profile"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Inline status switcher ────────────────────────────────────────────────────
const StatusSwitch = ({ status, onChange }) => (
  <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
    {STATUS_KEYS.map(k => {
      const active = status === k;
      const c = STATUS[k].color;
      return (
        <button key={k} onClick={() => onChange(k)}
          style={{ padding: "5px 12px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: `1.5px solid ${active ? c : "transparent"}`, background: active ? c + "18" : T.pillBg, color: active ? c : T.textSec, cursor: "pointer", transition: "all 0.15s" }}>
          {STATUS[k].label}
        </button>
      );
    })}
  </div>
);

// ── Collaboration card ────────────────────────────────────────────────────────
const CollabCard = ({ creator, collab, showCreator, onStatus, onEdit, onDelete, onOpenCreator, onAddContent }) => {
  const st = STATUS[collab.status] || STATUS.upcoming;
  const created = new Date(collab.createdAt);
  const platform = collabPlatform(creator, collab);
  const content = collab.content || [];
  const contentTotal = countPieces(content);
  const contentByType = CONTENT_TYPES
    .map(t => [t, countPieces(content.filter(p => p.type === t))])
    .filter(([, n]) => n > 0);
  const lastPiece = content.map(p => p.postedOn).filter(Boolean).sort().slice(-1)[0];
  return (
    <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden", display: "flex" }}>
      <div style={{ width: 4, background: st.color, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "13px 16px" }}>
        {/* top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <Chip color={TYPE_COLOR[collab.type] || T.textSec}>{collab.type}</Chip>
          {platform && <Chip color={PLATFORM_COLOR[platform] || T.textSec}>{platform === "Both" ? "Both platforms" : platform}</Chip>}
          {showCreator && (
            <button onClick={() => onOpenCreator(creator)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>
              {creator.name}
            </button>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 2 }}>
            <span style={{ fontSize: 11, color: T.textTert, marginRight: 4 }}>{fmt(created)}</span>
            <IconBtn onClick={() => onEdit(creator, collab)} title="Edit" emoji="✏️" />
            <IconBtn onClick={() => onDelete(creator.id, collab.id)} title="Delete" emoji="🗑" />
          </div>
        </div>

        {/* deliverables (agreed) */}
        {collab.deliverables?.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: T.textTert }}>Agreed</span>
            {collab.deliverables.map(d => (
              <span key={d} style={{ fontSize: 11, fontWeight: 500, color: T.textSec, background: T.pillBg, borderRadius: 6, padding: "2px 8px" }}>{d}</span>
            ))}
          </div>
        )}

        {/* content received */}
        {contentTotal > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: T.textTert }}>Received</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{contentTotal}</span>
            {contentByType.map(([t, n]) => (
              <span key={t} style={{ fontSize: 11, fontWeight: 600, color: CONTENT_COLOR[t], background: CONTENT_COLOR[t] + "18", borderRadius: 6, padding: "2px 8px" }}>
                {n}× {t}
              </span>
            ))}
            {lastPiece && <span style={{ fontSize: 11, color: T.textTert }}>· last {lastPiece}</span>}
          </div>
        )}

        {/* products + value */}
        {(collab.productCount > 0 || collab.totalValue > 0) && (
          <div style={{ fontSize: 12, color: T.textSec, marginBottom: 8, lineHeight: 1.5 }}>
            {collab.productCount > 0 && <span>{collab.productCount} product{collab.productCount !== 1 ? "s" : ""}</span>}
            {collab.productCount > 0 && collab.totalValue > 0 && <span> · </span>}
            {collab.totalValue > 0 && <span>{kr(collab.totalValue)}</span>}
            {collab.products?.filter(p => p.name).length > 0 && (
              <span style={{ color: T.textTert }}> — {collab.products.filter(p => p.name).map(p => `${p.name}${p.qty > 1 ? ` ×${p.qty}` : ""}`).join(", ")}</span>
            )}
          </div>
        )}

        {collab.notes && <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, marginBottom: 8, padding: "8px 11px", background: T.bg, borderRadius: 9 }}>{collab.notes}</div>}

        {/* attachments */}
        {collab.attachments?.length > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
            {collab.attachments.map(a => (
              <a key={a.id} href={`/api/files/${a.id}`} target="_blank" rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: T.blue, background: T.blue + "10", borderRadius: 8, padding: "4px 10px", textDecoration: "none", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                📎 {a.filename}
              </a>
            ))}
          </div>
        )}

        {/* bottom row: responsible + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 2 }}>
          {collab.responsible && <span style={{ fontSize: 11, color: T.textSec }}>👤 {collab.responsible}</span>}
          {onAddContent && (
            <button onClick={() => onAddContent(creator, collab)} title="Log a content piece"
              style={{ background: T.pillBg, border: "none", borderRadius: 99, color: T.blue, fontSize: 11, fontWeight: 600, padding: "5px 11px", cursor: "pointer" }}>
              + Content
            </button>
          )}
          <div style={{ marginLeft: "auto" }}><StatusSwitch status={collab.status} onChange={s => onStatus(creator.id, collab.id, s)} /></div>
        </div>
      </div>
    </div>
  );
};

// ── Search box (shared by the Dashboard, Influencers and Sourcing tabs) ──────
const SearchBox = ({ value, onChange, placeholder }) => (
  <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 340 }}>
    <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: T.textTert, pointerEvents: "none" }}>🔍</span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: "100%", background: T.inputBg, border: "none", borderRadius: 12, padding: "10px 30px 10px 36px", color: T.text, fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
    {value && (
      <button onClick={() => onChange("")} title="Clear"
        style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: T.textTert, cursor: "pointer", fontSize: 13, lineHeight: 1, padding: 4 }}>✕</button>
    )}
  </div>
);

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color }) => (
  <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "16px 18px", flex: "1 1 140px", minWidth: 130, maxWidth: 300 }}>
    <div style={{ fontSize: 30, fontWeight: 700, color: color || T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 12, color: T.textSec, marginTop: 6, fontWeight: 500 }}>{label}</div>
  </div>
);

// ── Budget progress bar ───────────────────────────────────────────────────────
const BudgetBar = ({ label, spent, budget }) => {
  const pct = budget > 0 ? (spent / budget) * 100 : 0;
  const over = budget > 0 && spent > budget;
  const barColor = over ? T.red : pct > 80 ? T.orange : T.green;
  const remaining = budget - spent;
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{label}</span>
        <span style={{ fontSize: 13, color: T.textSec }}>
          <span style={{ color: T.text, fontWeight: 600 }}>{kr(spent)}</span>
          {budget > 0 && <> / {kr(budget)} · <span style={{ color: barColor, fontWeight: 600 }}>{Math.round(pct)}%</span></>}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 99, background: "rgba(60,60,67,0.10)", overflow: "hidden" }}>
        <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: barColor, borderRadius: 99, transition: "width 0.4s ease" }} />
      </div>
      {budget > 0 && (
        <div style={{ fontSize: 11, color: over ? T.red : T.textTert, marginTop: 5 }}>
          {over ? `${kr(-remaining)} over budget` : `${kr(remaining)} remaining`}
        </div>
      )}
    </div>
  );
};

// ── Monthly content bars (stacked by content type) ────────────────────────────
const MonthlyContentBars = ({ months, selected, onSelect, height = 150 }) => {
  const max = Math.max(1, ...months.map(m => m.total));
  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height, marginBottom: 8 }}>
        {months.map(m => {
          const active = selected === m.key;
          const h = m.total > 0 ? Math.max(6, (m.total / max) * (height - 22)) : 3;
          return (
            <div key={m.key} onClick={() => onSelect && onSelect(active ? null : m.key)}
              title={`${monthLabel(m.key)} — ${m.total} piece${m.total !== 1 ? "s" : ""}`}
              style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%", cursor: onSelect ? "pointer" : "default" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: m.total > 0 ? T.text : T.textTert, marginBottom: 4 }}>{m.total || ""}</div>
              <div style={{ width: "100%", maxWidth: 46, height: h, borderRadius: 6, overflow: "hidden", display: "flex", flexDirection: "column-reverse", background: m.total > 0 ? "transparent" : "rgba(60,60,67,0.10)", outline: active ? `2px solid ${T.blue}` : "none", outlineOffset: 2, transition: "opacity 0.15s" }}>
                {CONTENT_TYPES.map(t => {
                  const n = m.byType[t] || 0;
                  if (!n) return null;
                  return <div key={t} style={{ height: `${(n / m.total) * 100}%`, background: CONTENT_COLOR[t] }} />;
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        {months.map(m => (
          <div key={m.key} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: 10, fontWeight: selected === m.key ? 700 : 500, color: selected === m.key ? T.text : T.textSec }}>
            {MONTHS_SHORT[Number(m.key.split("-")[1]) - 1]}
          </div>
        ))}
      </div>
    </div>
  );
};

const TypeLegend = ({ totals }) => (
  <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
    {CONTENT_TYPES.map(t => (
      <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.textSec }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: CONTENT_COLOR[t], flexShrink: 0 }} />
        {t}{totals && <span style={{ color: T.text, fontWeight: 600 }}> {totals[t] || 0}</span>}
      </div>
    ))}
  </div>
);

// ── Creator profile ───────────────────────────────────────────────────────────
const CreatorProfile = ({ creator, onClose, onUpdateCreator, onAddCollab, onEditCollab, onCollabStatus, onDeleteCollab, onDeleteCreator, onAddContent }) => {
  const [rating, setRating] = useState(creator.rating || 0);
  const [tags, setTags] = useState(creator.ratingTags || []);
  const [note, setNote] = useState(creator.ratingNote || "");
  const [savedFlash, setSavedFlash] = useState(false);

  // Editable creator details (name / profile link / platform / gender)
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(creator.name);
  const [link, setLink] = useState(creator.profileLink || "");
  const [platform, setPlatform] = useState(normPlatform(creator.platform));
  const [gender, setGender] = useState(creator.gender || "");

  const dirty = rating !== (creator.rating || 0) || note !== (creator.ratingNote || "") ||
    JSON.stringify(tags) !== JSON.stringify(creator.ratingTags || []);

  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const saveRating = () => {
    onUpdateCreator({ ...creator, rating, ratingTags: tags, ratingNote: note });
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
  };

  const startEdit = () => { setName(creator.name); setLink(creator.profileLink || ""); setPlatform(normPlatform(creator.platform)); setGender(creator.gender || ""); setEditing(true); };
  const saveDetails = () => {
    onUpdateCreator({ ...creator, name: name.trim() || creator.name, profileLink: link.trim(), platform, gender, rating, ratingTags: tags, ratingNote: note });
    setEditing(false);
  };
  // Quick one-click gender setter (visible in the profile, not hidden behind edit)
  const setGenderNow = (g) => onUpdateCreator({ ...creator, gender: g, rating, ratingTags: tags, ratingNote: note });

  const collabs = creator.collaborations || [];
  const totalItems = collabs.reduce((s, c) => s + (c.productCount || 0), 0);
  const totalValue = collabs.reduce((s, c) => s + (Number(c.totalValue) || 0), 0);
  const byName = {};
  collabs.forEach(c => (c.products || []).forEach(p => { if (p.name) byName[p.name] = (byName[p.name] || 0) + (Number(p.qty) || 0); }));

  // Content delivered by this creator — total, split by type, and the last 6 months
  const pieces = collabs.flatMap(c => (c.content || []).map(p => ({ ...p, _month: pieceMonth(p, c) })));
  const contentTotal = countPieces(pieces);
  const contentTypes = tallyTypes(pieces);
  const last6 = monthSeries(pieces, monthKeysBack(6));

  return (
    <div style={overlay}>
      <div style={{ ...cardStyle, maxWidth: 620 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 54, height: 54, borderRadius: "50%", background: PLATFORM_COLOR[editing ? platform : creator.platform] + "22", color: PLATFORM_COLOR[editing ? platform : creator.platform], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 19, fontWeight: 700, flexShrink: 0 }}>
            {initials(editing ? name : creator.name)}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input value={name} onChange={e => setName(e.target.value)} placeholder="Influencer name" autoFocus style={{ ...smallInput, fontSize: 17, fontWeight: 700 }} {...focusBlue} />
                <input value={link} onChange={e => setLink(e.target.value)} placeholder="Profile link" style={smallInput} {...focusBlue} />
                <Segmented options={PLATFORMS} value={platform} onChange={setPlatform} colorFor={p => PLATFORM_COLOR[p]} />
                <Segmented options={GENDERS} value={gender} onChange={setGender} colorFor={g => GENDER_COLOR[g]} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button onClick={() => setEditing(false)} style={{ padding: "7px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: T.pillBg, color: T.textSec }}>Cancel</button>
                  <button onClick={saveDetails} style={{ padding: "7px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: T.blue, color: "#fff" }}>Save details</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>{creator.name}</div>
                  <button onClick={startEdit} title="Edit details" style={{ background: "none", border: "none", fontSize: 13, cursor: "pointer", padding: "2px 4px", lineHeight: 1, opacity: 0.75 }}>✏️</button>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5, flexWrap: "wrap" }}>
                  <Chip color={PLATFORM_COLOR[normPlatform(creator.platform)]}>{normPlatform(creator.platform)}</Chip>
                  {creator.profileLink && <a href={creator.profileLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.blue, wordBreak: "break-all" }}>{creator.profileLink}</a>}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: T.textSec, marginRight: 2 }}>Gender</span>
                  {GENDERS.map(g => {
                    const active = creator.gender === g;
                    const c = GENDER_COLOR[g];
                    return (
                      <button key={g} onClick={() => setGenderNow(g)}
                        style={{ padding: "5px 13px", borderRadius: 99, fontSize: 12, fontWeight: 600, border: `1.5px solid ${active ? c : "transparent"}`, background: active ? c + "18" : T.pillBg, color: active ? c : T.textSec, cursor: "pointer", transition: "all 0.15s" }}>
                        {g}
                      </button>
                    );
                  })}
                  {!creator.gender && <span style={{ fontSize: 11, color: T.textTert }}>— set for product insights</span>}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, color: T.textTert, cursor: "pointer", padding: "2px 6px", lineHeight: 1 }}>✕</button>
        </div>

        {/* Rating */}
        <div style={{ background: T.bg, borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
            <Label>Internal rating</Label>
            <StarRating value={rating} onChange={setRating} size={24} />
          </div>
          <MultiSelectChips options={RATING_TAGS} selected={tags} onToggle={toggleTag} />
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Short internal comment…" style={{ ...textareaStyle, marginTop: 12, background: "#fff" }} {...focusBlue} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button onClick={saveRating} disabled={!dirty && !savedFlash}
              style={{ padding: "8px 18px", borderRadius: 99, border: "none", cursor: dirty ? "pointer" : "default", fontSize: 13, fontWeight: 600, background: savedFlash ? T.green : dirty ? T.blue : T.pillBg, color: savedFlash || dirty ? "#fff" : T.textTert, transition: "all 0.15s" }}>
              {savedFlash ? "✓ Saved" : "Save rating"}
            </button>
          </div>
        </div>

        {/* Products received rollup */}
        {(totalItems > 0 || totalValue > 0) && (
          <div style={{ marginBottom: 18 }}>
            <Label>Products received</Label>
            <div style={{ display: "flex", gap: 18, margin: "8px 0 6px", flexWrap: "wrap" }}>
              <div><span style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{totalItems}</span> <span style={{ fontSize: 12, color: T.textSec }}>items</span></div>
              <div><span style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{kr(totalValue)}</span> <span style={{ fontSize: 12, color: T.textSec }}>total value</span></div>
            </div>
            {Object.keys(byName).length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {Object.entries(byName).map(([n, q]) => (
                  <span key={n} style={{ fontSize: 12, color: T.textSec, background: T.pillBg, borderRadius: 7, padding: "3px 9px" }}>{n} ×{q}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Content delivered */}
        {contentTotal > 0 && (
          <div style={{ background: T.bg, borderRadius: 14, padding: "16px 18px", marginBottom: 18 }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 10, gap: 10, flexWrap: "wrap" }}>
              <Label>Content delivered</Label>
              <span><span style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{contentTotal}</span> <span style={{ fontSize: 12, color: T.textSec }}>pieces</span></span>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {CONTENT_TYPES.filter(t => contentTypes[t]).map(t => (
                <span key={t} style={{ fontSize: 12, fontWeight: 600, color: CONTENT_COLOR[t], background: CONTENT_COLOR[t] + "18", borderRadius: 7, padding: "3px 10px" }}>
                  {contentTypes[t]}× {t}
                </span>
              ))}
            </div>
            <div style={{ fontSize: 11, color: T.textTert, marginBottom: 6 }}>Last 6 months</div>
            <MonthlyContentBars months={last6} height={96} />
          </div>
        )}

        {/* Collaborations history */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <Label>Collaborations ({collabs.length})</Label>
          <button onClick={() => onAddCollab(creator)} style={{ background: T.blue + "18", border: "none", borderRadius: 99, color: T.blue, fontSize: 13, fontWeight: 600, padding: "6px 14px", cursor: "pointer" }}>+ Add collaboration</button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {collabs.length === 0
            ? <div style={{ fontSize: 13, color: T.textSec, padding: "12px 0" }}>No collaborations yet.</div>
            : collabs.map(co => (
              <CollabCard key={co.id} creator={creator} collab={co} showCreator={false}
                onStatus={onCollabStatus} onEdit={onEditCollab} onDelete={onDeleteCollab} onOpenCreator={() => {}} onAddContent={onAddContent} />
            ))}
        </div>

        {/* Danger zone */}
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 22 }}>
          <button onClick={() => { if (confirm(`Delete ${creator.name} and all their collaborations?`)) { onDeleteCreator(creator.id); onClose(); } }}
            style={{ background: "none", border: "none", color: T.red, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>
            Delete creator
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Influencer Tracker module ────────────────────────────────────────────
export default function InfluencerTracker() {
  const [creators, setCreators] = useState([]);
  const [sourcing, setSourcing] = useState([]);
  const [monthlyBudget, setMonthlyBudget] = useState(0);
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  const [showAdd, setShowAdd] = useState(false);
  const [profileId, setProfileId] = useState(null);
  const [collabModal, setCollabModal] = useState(null);   // { creator, editCollab? }
  const [showAllProfiles, setShowAllProfiles] = useState(false); // dashboard: collabs-per-influencer expanded
  const [sourcingModal, setSourcingModal] = useState(null); // { editEntry? } | null
  const [showSourcingModal, setShowSourcingModal] = useState(false);
  const [contentModal, setContentModal] = useState(null);   // { creator, collab } — quick content logging

  // content tab
  const [contentYear, setContentYear] = useState(today.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
  const [fContentPlatform, setFContentPlatform] = useState("All");
  const [fContentType, setFContentType] = useState("All");

  // filters
  const [search, setSearch] = useState("");
  const [dashSearch, setDashSearch] = useState("");
  const [sourcingSearch, setSourcingSearch] = useState("");
  const [contentSearch, setContentSearch] = useState("");
  const [fPlatform, setFPlatform] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [fType, setFType] = useState("All");
  const [fDate, setFDate] = useState("All");
  const [fResp, setFResp] = useState("All");
  const [fStars, setFStars] = useState("All");

  useEffect(() => {
    Promise.all([
      api("/api/creators").then(r => r.json()),
      api("/api/sourcing").then(r => r.json()),
      api("/api/settings").then(r => r.json()),
    ]).then(([cr, so, st]) => { setCreators(cr); setSourcing(so); setMonthlyBudget(st.monthlyBudget || 0); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const saveBudget = async () => {
    const val = Number(budgetInput) || 0;
    setMonthlyBudget(val);
    setEditingBudget(false);
    await api("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ monthlyBudget: val }) });
  };

  // ── Creator/collab handlers ──
  const reload = async () => {
    const cr = await api("/api/creators").then(r => r.json());
    setCreators(cr);
  };
  const uploadFiles = async (collabId, files) => {
    for (const f of files) {
      await api(`/api/collaborations/${collabId}/files`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: f.name, mimetype: f.type, dataBase64: f.dataBase64 }),
      });
    }
  };

  const handleAddInfluencer = async (payload) => {
    const { _newFiles = [], ...collabData } = payload.collaboration || {};
    const res = await api("/api/creators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, collaboration: collabData }) });
    const saved = await res.json();
    setCreators(prev => [saved, ...prev]);
    const newCollabId = saved.collaborations?.[0]?.id;
    if (_newFiles.length && newCollabId) { await uploadFiles(newCollabId, _newFiles); await reload(); }
  };

  const handleUpdateCreator = async (creator) => {
    setCreators(prev => prev.map(c => c.id !== creator.id ? c : { ...c, name: creator.name, profileLink: creator.profileLink, platform: creator.platform, gender: creator.gender, rating: creator.rating, ratingTags: creator.ratingTags, ratingNote: creator.ratingNote }));
    await api(`/api/creators/${creator.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creator) });
  };

  const handleDeleteCreator = async (id) => {
    setCreators(prev => prev.filter(c => c.id !== id));
    if (profileId === id) setProfileId(null);
    await api(`/api/creators/${id}`, { method: "DELETE" });
  };

  const handleAddCollab = async (creatorId, collab) => {
    const { _newFiles = [], ...collabData } = collab;
    const res = await api(`/api/creators/${creatorId}/collaborations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(collabData) });
    const saved = await res.json();
    setCreators(prev => prev.map(c => c.id !== creatorId ? c : { ...c, collaborations: [saved, ...(c.collaborations || [])] }));
    if (_newFiles.length && saved.id) { await uploadFiles(saved.id, _newFiles); await reload(); }
  };

  const handleUpdateCollab = async (creatorId, collab) => {
    const { _newFiles = [], ...collabData } = collab;
    const res = await api(`/api/collaborations/${collab.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(collabData) });
    const saved = await res.json();
    // preserve existing attachments (PUT response carries none) until a reload refreshes them
    setCreators(prev => prev.map(c => c.id !== creatorId ? c : { ...c, collaborations: c.collaborations.map(co => co.id !== collab.id ? co : { ...co, ...saved, attachments: co.attachments || [] }) }));
    if (_newFiles.length) { await uploadFiles(collab.id, _newFiles); await reload(); }
  };

  const handleCollabStatus = async (creatorId, collabId, status) => {
    setCreators(prev => prev.map(c => c.id !== creatorId ? c : { ...c, collaborations: c.collaborations.map(co => co.id !== collabId ? co : { ...co, status }) }));
    await api(`/api/collaborations/${collabId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  };

  const handleDeleteCollab = async (creatorId, collabId) => {
    setCreators(prev => prev.map(c => c.id !== creatorId ? c : { ...c, collaborations: c.collaborations.filter(co => co.id !== collabId) }));
    await api(`/api/collaborations/${collabId}`, { method: "DELETE" });
  };

  // Quick-log a single content piece without opening the full collaboration editor
  const handleAddContentPiece = async (creatorId, collabId, piece) => {
    const res = await api(`/api/collaborations/${collabId}/content`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(piece),
    });
    const saved = await res.json();
    setCreators(prev => prev.map(c => c.id !== creatorId ? c : {
      ...c,
      collaborations: c.collaborations.map(co => co.id !== collabId ? co : { ...co, content: [saved, ...(co.content || [])] }),
    }));
  };

  // ── Sourcing handlers ──
  const handleSaveSourcing = async (entry) => {
    if (entry.id) {
      setSourcing(prev => prev.map(s => s.id !== entry.id ? s : { ...s, ...entry }));
      await api(`/api/sourcing/${entry.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
    } else {
      const res = await api("/api/sourcing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
      const saved = await res.json();
      setSourcing(prev => [saved, ...prev]);
    }
  };
  const handleDeleteSourcing = async (id) => {
    setSourcing(prev => prev.filter(s => s.id !== id));
    await api(`/api/sourcing/${id}`, { method: "DELETE" });
  };

  // modal openers wired to CollabCard signatures
  const openEditCollab = (creator, collab) => setCollabModal({ creator, editCollab: collab });
  const openAddCollab = (creator) => setCollabModal({ creator });

  // ── Derived data ──
  const allCollabs = creators.flatMap(cr => (cr.collaborations || []).map(co => ({ creator: cr, collab: co })));
  const countStatus = (s) => allCollabs.filter(x => x.collab.status === s).length;
  const activeCreators = creators.filter(cr => (cr.collaborations || []).some(co => co.status === "upcoming" || co.status === "in_progress")).length;
  const giftingCount = allCollabs.filter(x => x.collab.type === "Gifting").length;
  const paidCount = allCollabs.filter(x => x.collab.type === "Paid").length;

  // ── Platform split (per collaboration, not per creator) ──
  const platformCount = (p) => allCollabs.filter(x => collabPlatform(x.creator, x.collab) === p).length;
  const platformSplit = COLLAB_PLATFORMS.map(p => ({ platform: p, count: platformCount(p) }));
  const platformTotal = platformSplit.reduce((s, x) => s + x.count, 0);

  // ── Content pieces, flattened with creator + collaboration context ──
  const allPieces = creators.flatMap(cr => (cr.collaborations || []).flatMap(co => (co.content || []).map(p => ({
    ...p,
    creator: cr,
    collab: co,
    _month: pieceMonth(p, co),
    _platform: normPlatform(p.platform) || collabPlatform(cr, co),
  }))));

  const contentQ = contentSearch.trim().toLowerCase();
  const contentFiltered = allPieces.filter(p => {
    if (!platformMatch(p._platform, fContentPlatform)) return false;
    if (fContentType !== "All" && p.type !== fContentType) return false;
    if (contentQ) {
      const hay = [
        p.creator.name, p.creator.profileLink, p.type, p.collab?.type, p.collab?.notes,
        ...(p.collab?.products || []).map(x => x.name),
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(contentQ)) return false;
    }
    return true;
  });

  const thisMonthKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthKey = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}`;
  const piecesInMonth = (key, list = contentFiltered) => list.filter(p => p._month === key);

  const yearMonths = monthSeries(contentFiltered, monthKeysOfYear(contentYear));
  const yearTotal = yearMonths.reduce((s, m) => s + m.total, 0);
  const monthsElapsed = contentYear === today.getFullYear() ? today.getMonth() + 1 : 12;
  const avgPerMonth = monthsElapsed > 0 ? Math.round((yearTotal / monthsElapsed) * 10) / 10 : 0;
  const yearTypeTotals = tallyTypes(contentFiltered.filter(p => p._month.startsWith(String(contentYear))));
  const contentYears = Array.from(new Set([...allPieces.map(p => Number(p._month.slice(0, 4))).filter(Boolean), today.getFullYear()])).sort((a, b) => b - a);

  // Selected month, broken down per influencer
  const monthPieces = selectedMonth ? piecesInMonth(selectedMonth) : [];
  const monthByCreator = Object.values(monthPieces.reduce((acc, p) => {
    const k = p.creator.id;
    if (!acc[k]) acc[k] = { creator: p.creator, pieces: [] };
    acc[k].pieces.push(p);
    return acc;
  }, {})).sort((a, b) => countPieces(b.pieces) - countPieces(a.pieces));

  // Budget spend — Paid collaborations only, excl. cancelled, by createdAt
  const curMonth = today.getMonth(), curYear = today.getFullYear();
  const paidSpend = (pred) => allCollabs
    .filter(x => x.collab.type === "Paid" && x.collab.status !== "cancelled" && pred(new Date(x.collab.createdAt)))
    .reduce((s, x) => s + (Number(x.collab.totalValue) || 0), 0);
  const spentMonth = paidSpend(d => d.getMonth() === curMonth && d.getFullYear() === curYear);
  const spentYear = paidSpend(d => d.getFullYear() === curYear);
  const yearlyBudget = monthlyBudget * 12;

  // Collabs per influencer, most first (dashboard shows top 10 unless expanded)
  const creatorsByCollabs = creators
    .map(cr => ({ cr, count: (cr.collaborations || []).length, value: (cr.collaborations || []).reduce((s, c) => s + (Number(c.totalValue) || 0), 0) }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count || b.value - a.value);
  const topCreators = showAllProfiles ? creatorsByCollabs : creatorsByCollabs.slice(0, 10);

  // Top 5 most-sent products, split by creator gender
  const topProducts = (g) => {
    const tally = {};
    creators.filter(cr => cr.gender === g).forEach(cr =>
      (cr.collaborations || []).forEach(co =>
        (co.products || []).forEach(p => { if (p.name) tally[p.name] = (tally[p.name] || 0) + (Number(p.qty) || 0); })));
    return Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
  };
  const topWomenProducts = topProducts("Woman");
  const topMenProducts = topProducts("Man");

  const responsibles = Array.from(new Set(allCollabs.map(x => x.collab.responsible).filter(Boolean))).sort();

  const dateOk = (createdAt) => {
    if (fDate === "All") return true;
    const days = daysBetween(new Date(createdAt), today);
    return days <= Number(fDate);
  };

  // Case-insensitive match across a collaboration's searchable text (creator, products, notes, …)
  const collabMatches = (creator, collab, q) => {
    if (!q) return true;
    const hay = [
      creator.name, creator.profileLink,
      collab.type, collab.responsible, collab.notes,
      ...(collab.products || []).map(p => p.name),
      ...(collab.attachments || []).map(a => a.filename),
    ].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  };
  const dashQ = dashSearch.trim().toLowerCase();

  const filteredCollabs = allCollabs.filter(({ creator, collab }) => {
    if (!platformMatch(collabPlatform(creator, collab), fPlatform)) return false;
    if (fStatus !== "All" && collab.status !== fStatus) return false;
    if (fType !== "All" && collab.type !== fType) return false;
    if (fResp !== "All" && collab.responsible !== fResp) return false;
    if (!dateOk(collab.createdAt)) return false;
    if (!collabMatches(creator, collab, dashQ)) return false;
    return true;
  }).sort((a, b) => {
    const rank = (s) => STATUS_KEYS.indexOf(s);
    return rank(a.collab.status) - rank(b.collab.status);
  });

  const filteredCreators = creators.filter(cr => {
    if (fStars !== "All" && (cr.rating || 0) !== Number(fStars)) return false;
    if (search) {
      const q = search.trim().toLowerCase();
      const hay = [
        cr.name, cr.profileLink, cr.gender, cr.ratingNote,
        ...(cr.ratingTags || []),
        ...(cr.collaborations || []).flatMap(co => [co.type, co.responsible, co.notes, ...(co.products || []).map(p => p.name)]),
      ].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const sourcingQ = sourcingSearch.trim().toLowerCase();
  const filteredSourcing = sourcing.filter(s => {
    if (!sourcingQ) return true;
    const hay = [s.name, s.profileLink, s.platform, s.comment, s.addedBy].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(sourcingQ);
  });

  const profileCreator = creators.find(c => c.id === profileId) || null;

  // ── UI helpers ──
  const selectStyle = { background: T.inputBg, border: "none", borderRadius: 12, padding: "7px 12px", color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit", cursor: "pointer" };
  const pill = (active, label, onClick, color) => (
    <button key={label} onClick={onClick} style={{ padding: "7px 14px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 600 : 400, flexShrink: 0, background: active && color ? color + "18" : active ? T.text : T.pillBg, color: active && color ? color : active ? "#fff" : T.textSec, transition: "all 0.15s" }}>{label}</button>
  );

  const TabBtn = ({ tab, label }) => {
    const active = activeTab === tab;
    return (
      <button onClick={() => setActiveTab(tab)}
        style={{ padding: "8px 18px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 14, fontWeight: active ? 700 : 500, background: active ? T.text : T.pillBg, color: active ? "#fff" : T.textSec, transition: "all 0.15s", flexShrink: 0 }}>
        {label}
      </button>
    );
  };

  return (
    <>
      {/* Sticky header */}
      <div style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(242,242,247,0.92)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 32px 0" }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16, gap: 16 }}>
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 700, letterSpacing: "-0.03em", color: T.text, lineHeight: 1 }}>Influencer Tracker</h1>
              <div style={{ fontSize: 13, color: T.textSec, marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
                {countStatus("upcoming") > 0 && <span style={{ color: T.blue, fontWeight: 500 }}>{countStatus("upcoming")} upcoming</span>}
                {countStatus("in_progress") > 0 && <span style={{ color: T.orange, fontWeight: 500 }}>{countStatus("in_progress")} in progress</span>}
                <span>{activeCreators} active creator{activeCreators !== 1 ? "s" : ""}</span>
              </div>
            </div>
            <button onClick={() => setShowAdd(true)}
              style={{ background: T.blue, border: "none", borderRadius: 99, color: "#fff", padding: "11px 22px", fontSize: 15, fontWeight: 600, cursor: "pointer", flexShrink: 0, boxShadow: `0 4px 18px ${T.blue}38`, letterSpacing: "-0.01em" }}>
              + Add Influencer
            </button>
          </div>

          <div style={{ display: "flex", gap: 8, paddingBottom: 14, overflowX: "auto", alignItems: "center" }}>
            <TabBtn tab="dashboard" label="Dashboard" />
            <TabBtn tab="content" label="Content" />
            <TabBtn tab="influencers" label="Influencers" />
            <TabBtn tab="sourcing" label="Sourcing" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 32px 80px" }}>

        {/* ── DASHBOARD ── */}
        {activeTab === "dashboard" && (
          <>
            {/* Budget overview */}
            <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <Label>Budget</Label>
                {!editingBudget && (
                  <button onClick={() => { setBudgetInput(monthlyBudget ? String(monthlyBudget) : ""); setEditingBudget(true); }}
                    style={{ background: T.pillBg, border: "none", borderRadius: 99, color: T.blue, fontSize: 12, fontWeight: 600, padding: "5px 12px", cursor: "pointer" }}>
                    {monthlyBudget > 0 ? "Edit budget" : "Set budget"}
                  </button>
                )}
              </div>
              {editingBudget && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 13, color: T.textSec }}>Monthly budget</span>
                  <div style={{ position: "relative" }}>
                    <input type="number" min="0" value={budgetInput} onChange={e => setBudgetInput(e.target.value)} placeholder="0" autoFocus
                      style={{ ...smallInput, width: 170, paddingRight: 34 }} {...focusBlue} />
                    <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: T.textTert }}>kr</span>
                  </div>
                  <button onClick={saveBudget} style={{ padding: "8px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: T.blue, color: "#fff" }}>Save</button>
                  <button onClick={() => setEditingBudget(false)} style={{ padding: "8px 16px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, background: T.pillBg, color: T.textSec }}>Cancel</button>
                  <span style={{ fontSize: 12, color: T.textTert }}>Yearly is calculated as ×12</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 28, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 260px" }}><BudgetBar label="This month" spent={spentMonth} budget={monthlyBudget} /></div>
                <div style={{ flex: "1 1 260px" }}><BudgetBar label="This year" spent={spentYear} budget={yearlyBudget} /></div>
              </div>
              {monthlyBudget === 0 && !editingBudget && (
                <div style={{ fontSize: 12, color: T.textTert, marginTop: 12 }}>Set a monthly budget to track spend against it. Spend counts Paid collaborations only.</div>
              )}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <StatCard label="Upcoming" value={countStatus("upcoming")} color={T.blue} />
              <StatCard label="In Progress" value={countStatus("in_progress")} color={T.orange} />
              <StatCard label="Completed" value={countStatus("completed")} color={T.green} />
              <StatCard label="Active creators" value={activeCreators} />
              <StatCard label="Gifting" value={giftingCount} color={T.purple} />
              <StatCard label="Paid" value={paidCount} color={T.blue} />
              <StatCard label="Content this month" value={countPieces(piecesInMonth(thisMonthKey, allPieces))} color={T.teal} />
            </div>

            {/* Platform split — which platform each collaboration runs on */}
            <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "16px 18px", marginBottom: 24 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
                <Label>Collaborations per platform</Label>
                <span style={{ fontSize: 12, color: T.textSec }}>{platformTotal} collaboration{platformTotal !== 1 ? "s" : ""} in total</span>
              </div>
              {platformTotal === 0 ? (
                <div style={{ fontSize: 13, color: T.textSec }}>No collaborations yet.</div>
              ) : (
                <>
                  <div style={{ display: "flex", height: 10, borderRadius: 99, overflow: "hidden", background: "rgba(60,60,67,0.08)", marginBottom: 14 }}>
                    {platformSplit.filter(x => x.count > 0).map(({ platform, count }) => (
                      <div key={platform} title={`${platform}: ${count}`} style={{ width: `${(count / platformTotal) * 100}%`, background: PLATFORM_COLOR[platform] }} />
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
                    {platformSplit.map(({ platform, count }) => {
                      const pieces = countPieces(allPieces.filter(p => p.collab && collabPlatform(p.creator, p.collab) === platform));
                      return (
                        <div key={platform} style={{ flex: "1 1 150px", minWidth: 140 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
                            <span style={{ width: 9, height: 9, borderRadius: 3, background: PLATFORM_COLOR[platform], flexShrink: 0 }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{platform === "Both" ? "Both platforms" : platform}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                            <span style={{ fontSize: 22, fontWeight: 700, color: T.text, letterSpacing: "-0.02em" }}>{count}</span>
                            <span style={{ fontSize: 12, color: T.textSec }}>
                              {platformTotal > 0 ? `${Math.round((count / platformTotal) * 100)}%` : "0%"}{pieces > 0 ? ` · ${pieces} pieces` : ""}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Top 10 profiles + Top 5 products */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24, alignItems: "flex-start" }}>
              {/* Collabs per influencer */}
              <div style={{ flex: "1 1 320px", background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <Label>Collabs per influencer <span style={{ color: T.textTert, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· click to open</span></Label>
                  {creatorsByCollabs.length > 10 && (
                    <button onClick={() => setShowAllProfiles(v => !v)}
                      style={{ background: T.pillBg, border: "none", borderRadius: 99, color: T.blue, fontSize: 12, fontWeight: 600, padding: "5px 12px", cursor: "pointer", flexShrink: 0 }}>
                      {showAllProfiles ? "Show top 10" : `Show all (${creatorsByCollabs.length})`}
                    </button>
                  )}
                </div>
                {topCreators.length === 0 ? (
                  <div style={{ fontSize: 13, color: T.textSec, padding: "8px 0" }}>No collaborations yet.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {topCreators.map(({ cr, count, value }, i) => (
                      <div key={cr.id} onClick={() => setProfileId(cr.id)}
                        style={{ display: "flex", alignItems: "center", gap: 10, borderRadius: 8, padding: "7px 6px", cursor: "pointer" }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.textTert, width: 20, flexShrink: 0 }}>{i + 1}</span>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cr.name}</span>
                        {cr.rating > 0 && <StarRating value={cr.rating} size={11} readOnly />}
                        <span style={{ fontSize: 12, color: T.textSec, flexShrink: 0 }}>{count} collab{count !== 1 ? "s" : ""}</span>
                        {value > 0 && <span style={{ fontSize: 11, color: T.textTert, flexShrink: 0, minWidth: 64, textAlign: "right" }}>{kr(value)}</span>}
                        <button title={`New collab with ${cr.name}`} onClick={(e) => { e.stopPropagation(); openAddCollab(cr); }}
                          style={{ background: T.blue + "18", border: "none", borderRadius: 99, width: 24, height: 24, cursor: "pointer", color: T.blue, fontSize: 14, fontWeight: 700, lineHeight: 1, flexShrink: 0 }}>+</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Top 5 products by gender */}
              <div style={{ flex: "1 1 320px", background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "16px 18px" }}>
                <div style={{ marginBottom: 12 }}><Label>Top 5 products sent</Label></div>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  {[["Woman", topWomenProducts], ["Man", topMenProducts]].map(([g, list]) => (
                    <div key={g} style={{ flex: "1 1 130px", minWidth: 120 }}>
                      <div style={{ marginBottom: 8 }}><Chip color={GENDER_COLOR[g]}>{g === "Woman" ? "Women" : "Men"}</Chip></div>
                      {list.length === 0 ? (
                        <div style={{ fontSize: 12, color: T.textTert }}>No data yet</div>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {list.map(([name, qty], i) => (
                            <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                              <span style={{ color: T.textTert, width: 14, flexShrink: 0 }}>{i + 1}</span>
                              <span style={{ flex: 1, minWidth: 0, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                              <span style={{ color: T.textSec, fontWeight: 600, flexShrink: 0 }}>×{qty}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12, flexWrap: "wrap" }}>
              <SearchBox value={dashSearch} onChange={setDashSearch} placeholder="Search collaborations…" />
              {dashQ && (
                <span style={{ fontSize: 12, color: T.textSec }}>
                  {filteredCollabs.length} match{filteredCollabs.length !== 1 ? "es" : ""}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
              {["All", ...STATUS_KEYS].map(s => pill(fStatus === s, s === "All" ? "All status" : STATUS[s].label, () => setFStatus(s), s !== "All" ? STATUS[s].color : null))}
              <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />
              {["All", ...TYPES].map(t => pill(fType === t, t === "All" ? "All types" : t, () => setFType(t), t !== "All" ? TYPE_COLOR[t] : null))}
              <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />
              {["All", ...COLLAB_PLATFORMS].map(p => pill(fPlatform === p, p === "Both" ? "Both platforms" : p, () => setFPlatform(p), p !== "All" ? PLATFORM_COLOR[p] : null))}
              <div style={{ flex: 1 }} />
              <select value={fDate} onChange={e => setFDate(e.target.value)} style={selectStyle}>
                <option value="All">Any date</option>
                <option value="7">Last 7 days</option>
                <option value="30">Last 30 days</option>
                <option value="90">Last 90 days</option>
              </select>
              <select value={fResp} onChange={e => setFResp(e.target.value)} style={selectStyle}>
                <option value="All">Anyone</option>
                {responsibles.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {filteredCollabs.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textSec, fontSize: 16, padding: "70px 0" }}>
                {allCollabs.length === 0 ? "No collaborations yet — add your first influencer." : "No collaborations match these filters."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredCollabs.map(({ creator, collab }) => (
                  <CollabCard key={collab.id} creator={creator} collab={collab} showCreator
                    onStatus={handleCollabStatus} onEdit={openEditCollab} onDelete={handleDeleteCollab}
                    onOpenCreator={c => setProfileId(c.id)} onAddContent={(cr, co) => setContentModal({ creator: cr, collab: co })} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── CONTENT ── */}
        {activeTab === "content" && (
          <>
            {/* Filters + year */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 20 }}>
              {["All", ...COLLAB_PLATFORMS.filter(p => p !== "Both")].map(p =>
                pill(fContentPlatform === p, p === "All" ? "All platforms" : p, () => setFContentPlatform(p), p !== "All" ? PLATFORM_COLOR[p] : null))}
              <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />
              {["All", ...CONTENT_TYPES].map(t =>
                pill(fContentType === t, t === "All" ? "All types" : t, () => setFContentType(t), t !== "All" ? CONTENT_COLOR[t] : null))}
              <div style={{ flex: 1 }} />
              <SearchBox value={contentSearch} onChange={setContentSearch} placeholder="Search creators, products…" />
              <select value={contentYear} onChange={e => { setContentYear(Number(e.target.value)); setSelectedMonth(null); }} style={selectStyle}>
                {contentYears.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
              <StatCard label="This month" value={countPieces(piecesInMonth(thisMonthKey))} color={T.teal} />
              <StatCard label="Last month" value={countPieces(piecesInMonth(lastMonthKey))} />
              <StatCard label={`Total ${contentYear}`} value={yearTotal} color={T.blue} />
              <StatCard label="Avg per month" value={avgPerMonth} color={T.purple} />
              <StatCard label="Creators delivering" value={new Set(contentFiltered.filter(p => p._month.startsWith(String(contentYear))).map(p => p.creator.id)).size} />
            </div>

            {/* Monthly chart */}
            <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "18px 20px", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
                <Label>Content pieces per month <span style={{ color: T.textTert, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>· click a month for details</span></Label>
                <span style={{ fontSize: 12, color: T.textSec }}>{contentYear}</span>
              </div>
              <MonthlyContentBars months={yearMonths} selected={selectedMonth} onSelect={setSelectedMonth} />
              <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                <TypeLegend totals={yearTypeTotals} />
              </div>
            </div>

            {/* Month detail */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
              <Label>{selectedMonth ? monthLabel(selectedMonth) : "Pick a month above"}</Label>
              {selectedMonth && (
                <span style={{ fontSize: 13, color: T.textSec }}>
                  <span style={{ color: T.text, fontWeight: 700 }}>{countPieces(monthPieces)}</span> piece{countPieces(monthPieces) !== 1 ? "s" : ""} from {monthByCreator.length} creator{monthByCreator.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>

            {!selectedMonth ? (
              <div style={{ textAlign: "center", color: T.textSec, fontSize: 15, padding: "50px 0" }}>Select a month in the chart to see who delivered what.</div>
            ) : monthByCreator.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textSec, fontSize: 15, padding: "50px 0" }}>No content logged for {monthLabel(selectedMonth)}.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {monthByCreator.map(({ creator, pieces }) => {
                  const types = tallyTypes(pieces);
                  const total = countPieces(pieces);
                  return (
                    <div key={creator.id} style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "14px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div onClick={() => setProfileId(creator.id)}
                          style={{ width: 38, height: 38, borderRadius: "50%", background: PLATFORM_COLOR[normPlatform(creator.platform)] + "22", color: PLATFORM_COLOR[normPlatform(creator.platform)], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, flexShrink: 0, cursor: "pointer" }}>
                          {initials(creator.name)}
                        </div>
                        <button onClick={() => setProfileId(creator.id)}
                          style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>
                          {creator.name}
                        </button>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          {CONTENT_TYPES.filter(t => types[t]).map(t => (
                            <span key={t} style={{ fontSize: 11, fontWeight: 600, color: CONTENT_COLOR[t], background: CONTENT_COLOR[t] + "18", borderRadius: 6, padding: "3px 9px" }}>{types[t]}× {t}</span>
                          ))}
                        </div>
                        <div style={{ marginLeft: "auto", display: "flex", alignItems: "baseline", gap: 5 }}>
                          <span style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{total}</span>
                          <span style={{ fontSize: 12, color: T.textSec }}>piece{total !== 1 ? "s" : ""}</span>
                        </div>
                      </div>

                      {/* per collaboration */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                        {Object.values(pieces.reduce((acc, p) => {
                          if (!acc[p.collab.id]) acc[p.collab.id] = { collab: p.collab, list: [] };
                          acc[p.collab.id].list.push(p);
                          return acc;
                        }, {})).map(({ collab, list }) => (
                          <div key={collab.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                            <Chip color={TYPE_COLOR[collab.type] || T.textSec}>{collab.type}</Chip>
                            <Chip color={PLATFORM_COLOR[collabPlatform(creator, collab)] || T.textSec}>
                              {collabPlatform(creator, collab) === "Both" ? "Both platforms" : collabPlatform(creator, collab)}
                            </Chip>
                            <span style={{ color: T.textSec }}>
                              {list.sort((a, b) => (a.postedOn || "").localeCompare(b.postedOn || "")).map((p, i) => (
                                <span key={p.id || i}>
                                  {i > 0 && ", "}
                                  {p.link
                                    ? <a href={p.link} target="_blank" rel="noopener noreferrer" style={{ color: T.blue }}>{pieceQty(p) > 1 ? `${pieceQty(p)}× ` : ""}{p.type}</a>
                                    : <>{pieceQty(p) > 1 ? `${pieceQty(p)}× ` : ""}{p.type}</>}
                                  {p.postedOn && <span style={{ color: T.textTert }}> ({p.postedOn.slice(8, 10)}/{p.postedOn.slice(5, 7)})</span>}
                                </span>
                              ))}
                            </span>
                            <button onClick={() => setContentModal({ creator, collab })}
                              style={{ marginLeft: "auto", background: T.pillBg, border: "none", borderRadius: 99, color: T.blue, fontSize: 11, fontWeight: 600, padding: "4px 10px", cursor: "pointer", flexShrink: 0 }}>
                              + Content
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── INFLUENCERS ── */}
        {activeTab === "influencers" && (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              <SearchBox value={search} onChange={setSearch} placeholder="Search creators, products, notes…" />
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {["All", "5", "4", "3", "2", "1"].map(s => {
                  const active = fStars === s;
                  return (
                    <button key={s} onClick={() => setFStars(s)}
                      style={{ padding: "7px 12px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: active ? 700 : 500, background: active ? T.text : T.pillBg, color: active ? "#fff" : T.textSec, transition: "all 0.15s" }}>
                      {s === "All" ? "All" : `${s}★`}
                    </button>
                  );
                })}
              </div>
            </div>

            {filteredCreators.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textSec, fontSize: 16, padding: "70px 0" }}>
                {creators.length === 0 ? "No influencers yet." : "No creators match your search."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredCreators.map(cr => {
                  const collabs = cr.collaborations || [];
                  const ongoing = collabs.filter(c => c.status === "upcoming" || c.status === "in_progress").length;
                  const pieceTotal = countPieces(collabs.flatMap(c => c.content || []));
                  return (
                    <div key={cr.id} onClick={() => setProfileId(cr.id)}
                      style={{ textAlign: "left", background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: PLATFORM_COLOR[normPlatform(cr.platform)] + "22", color: PLATFORM_COLOR[normPlatform(cr.platform)], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{initials(cr.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>{cr.name}</span>
                          <Chip color={PLATFORM_COLOR[normPlatform(cr.platform)]}>{normPlatform(cr.platform)}</Chip>
                          {cr.rating > 0 && <StarRating value={cr.rating} size={13} readOnly />}
                        </div>
                        <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>
                          {collabs.length} collaboration{collabs.length !== 1 ? "s" : ""}
                          {ongoing > 0 && <span style={{ color: T.orange }}> · {ongoing} ongoing</span>}
                          {pieceTotal > 0 && <span> · {pieceTotal} content piece{pieceTotal !== 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); openAddCollab(cr); }}
                        style={{ background: T.blue + "18", border: "none", borderRadius: 99, color: T.blue, fontSize: 13, fontWeight: 600, padding: "7px 14px", cursor: "pointer", flexShrink: 0 }}>
                        + Collab
                      </button>
                      <span style={{ fontSize: 18, color: T.textTert, flexShrink: 0 }}>›</span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── SOURCING ── */}
        {activeTab === "sourcing" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
              <div style={{ fontSize: 13, color: T.textSec }}>Shared list of potential creators to contact.</div>
              <button onClick={() => setShowSourcingModal(true)}
                style={{ background: T.blue + "18", border: "none", borderRadius: 99, color: T.blue, fontSize: 13, fontWeight: 600, padding: "8px 16px", cursor: "pointer" }}>+ Add Potential Influencer</button>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 20, flexWrap: "wrap" }}>
              <SearchBox value={sourcingSearch} onChange={setSourcingSearch} placeholder="Search saved profiles…" />
            </div>

            {filteredSourcing.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textSec, fontSize: 16, padding: "70px 0" }}>
                {sourcing.length === 0 ? "No saved profiles yet." : "No profiles match your search."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredSourcing.map(s => (
                  <div key={s.id} style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>{s.name}</span>
                      <Chip color={PLATFORM_COLOR[normPlatform(s.platform)]}>{normPlatform(s.platform)}</Chip>
                      {s.profileLink && <a href={s.profileLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.blue, wordBreak: "break-all" }}>{s.profileLink}</a>}
                      <div style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
                        <IconBtn onClick={() => setSourcingModal({ editEntry: s })} title="Edit" emoji="✏️" />
                        <IconBtn onClick={() => handleDeleteSourcing(s.id)} title="Delete" emoji="🗑" />
                      </div>
                    </div>
                    {s.comment && <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5, marginTop: 8 }}>{s.comment}</div>}
                    {s.addedBy && <div style={{ fontSize: 11, color: T.textTert, marginTop: 6 }}>Added by {s.addedBy}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {loading && (
        <div style={{ position: "fixed", inset: 0, background: T.bg, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999 }}>
          <div style={{ fontSize: 15, color: T.textSec }}>Loading…</div>
        </div>
      )}

      {/* Modals */}
      {showAdd && <InfluencerModal onClose={() => setShowAdd(false)} onAdd={handleAddInfluencer} />}
      {collabModal && (
        <CollaborationModal
          creator={collabModal.creator}
          editCollab={collabModal.editCollab}
          onClose={() => setCollabModal(null)}
          onSave={(data) => collabModal.editCollab
            ? handleUpdateCollab(collabModal.creator.id, data)
            : handleAddCollab(collabModal.creator.id, data)}
        />
      )}
      {contentModal && (
        <QuickContentModal
          creator={contentModal.creator}
          collab={contentModal.collab}
          onClose={() => setContentModal(null)}
          onSave={handleAddContentPiece}
        />
      )}
      {(showSourcingModal || sourcingModal) && (
        <SourcingModal
          editEntry={sourcingModal?.editEntry}
          onClose={() => { setShowSourcingModal(false); setSourcingModal(null); }}
          onSave={handleSaveSourcing}
        />
      )}
      {profileCreator && (
        <CreatorProfile
          creator={profileCreator}
          onClose={() => setProfileId(null)}
          onUpdateCreator={handleUpdateCreator}
          onAddCollab={openAddCollab}
          onEditCollab={openEditCollab}
          onCollabStatus={handleCollabStatus}
          onDeleteCollab={handleDeleteCollab}
          onDeleteCreator={handleDeleteCreator}
          onAddContent={(cr, co) => setContentModal({ creator: cr, collab: co })}
        />
      )}
    </>
  );
}
