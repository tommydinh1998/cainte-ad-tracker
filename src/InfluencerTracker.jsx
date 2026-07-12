import { useState, useEffect } from "react";
import { T, fmt, daysBetween, Chip, Label, IconBtn, Field } from "./theme.jsx";

const today = new Date();

const PLATFORMS = ["Meta", "TikTok", "Both", "Other"];
const PLATFORM_COLOR = { Meta: "#007AFF", TikTok: "#FF2D55", Both: "#AF52DE", Other: "#8E8E93" };

const TYPES = ["Gifting", "Paid", "Affiliate", "Ambassador", "Other"];
const TYPE_COLOR = { Gifting: T.purple, Paid: T.blue, Affiliate: T.teal, Ambassador: T.orange, Other: "#8E8E93" };

const DELIVERABLES = ["Reel", "Story", "TikTok Video", "Post", "UGC", "Other"];

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
const platformMatch = (creatorPlatform, filter) =>
  filter === "All" || creatorPlatform === filter ||
  (creatorPlatform === "Both" && (filter === "Meta" || filter === "TikTok"));

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
        <FormLabel>Deliverables <span style={{ color: T.textTert, fontWeight: 400 }}>— pick any</span></FormLabel>
        <MultiSelectChips options={DELIVERABLES} selected={collab.deliverables || []} onToggle={toggleDeliverable} />
      </div>

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
    await fetch(`/api/files/${id}`, { method: "DELETE" });
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
  return {
    type: c.type || "Gifting",
    status: c.status || "upcoming",
    deliverables: c.deliverables || [],
    products,
    productCount: products.reduce((s, p) => s + (Number(p.qty) || 0), 0),
    totalValue: Number(c.totalValue) || 0,
    responsible: (c.responsible || "").trim(),
    notes: (c.notes || "").trim(),
    _newFiles: c._newFiles || [],   // staged uploads — stripped before hitting the API
  };
};

const blankCollab = () => ({ type: "Gifting", status: "upcoming", deliverables: [], products: [{ name: "", qty: 1 }], productCount: 0, totalValue: 0, responsible: "", notes: "", attachments: [], _newFiles: [] });

// ── Add Influencer modal (creator + first collaboration) ──────────────────────
const InfluencerModal = ({ onClose, onAdd }) => {
  const [name, setName] = useState("");
  const [profileLink, setProfileLink] = useState("");
  const [platform, setPlatform] = useState("Meta");
  const [collab, setCollab] = useState(blankCollab);
  const [errName, setErrName] = useState(false);
  const patch = (o) => setCollab(c => ({ ...c, ...o }));

  const submit = () => {
    if (!name.trim()) { setErrName(true); return; }
    onAdd({ name: name.trim(), profileLink: profileLink.trim(), platform, collaboration: cleanCollab(collab) });
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

        <div style={{ marginBottom: 24 }}>
          <FormLabel>Platform</FormLabel>
          <Segmented options={PLATFORMS} value={platform} onChange={setPlatform} colorFor={p => PLATFORM_COLOR[p]} />
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
    ? { ...editCollab, products: editCollab.products?.length ? editCollab.products : [{ name: "", qty: 1 }] }
    : blankCollab());
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

// ── Sourcing modal ────────────────────────────────────────────────────────────
const SourcingModal = ({ editEntry, onClose, onSave }) => {
  const isEdit = !!editEntry;
  const [form, setForm] = useState({
    name: editEntry?.name || "", profileLink: editEntry?.profileLink || "",
    platform: editEntry?.platform || "Meta", comment: editEntry?.comment || "", addedBy: editEntry?.addedBy || "",
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
const CollabCard = ({ creator, collab, showCreator, onStatus, onEdit, onDelete, onOpenCreator }) => {
  const st = STATUS[collab.status] || STATUS.upcoming;
  const created = new Date(collab.createdAt);
  return (
    <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", overflow: "hidden", display: "flex" }}>
      <div style={{ width: 4, background: st.color, flexShrink: 0 }} />
      <div style={{ flex: 1, padding: "13px 16px" }}>
        {/* top row */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          <Chip color={TYPE_COLOR[collab.type] || T.textSec}>{collab.type}</Chip>
          {showCreator && <Chip color={PLATFORM_COLOR[creator.platform]}>{creator.platform}</Chip>}
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

        {/* deliverables */}
        {collab.deliverables?.length > 0 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {collab.deliverables.map(d => (
              <span key={d} style={{ fontSize: 11, fontWeight: 500, color: T.textSec, background: T.pillBg, borderRadius: 6, padding: "2px 8px" }}>{d}</span>
            ))}
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
          <div style={{ marginLeft: "auto" }}><StatusSwitch status={collab.status} onChange={s => onStatus(creator.id, collab.id, s)} /></div>
        </div>
      </div>
    </div>
  );
};

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard = ({ label, value, color }) => (
  <div style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "16px 18px", flex: "1 1 140px", minWidth: 130 }}>
    <div style={{ fontSize: 30, fontWeight: 700, color: color || T.text, letterSpacing: "-0.03em", lineHeight: 1 }}>{value}</div>
    <div style={{ fontSize: 12, color: T.textSec, marginTop: 6, fontWeight: 500 }}>{label}</div>
  </div>
);

// ── Creator profile ───────────────────────────────────────────────────────────
const CreatorProfile = ({ creator, onClose, onUpdateCreator, onAddCollab, onEditCollab, onCollabStatus, onDeleteCollab, onDeleteCreator }) => {
  const [rating, setRating] = useState(creator.rating || 0);
  const [tags, setTags] = useState(creator.ratingTags || []);
  const [note, setNote] = useState(creator.ratingNote || "");
  const [savedFlash, setSavedFlash] = useState(false);

  // Editable creator details (name / profile link / platform)
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(creator.name);
  const [link, setLink] = useState(creator.profileLink || "");
  const [platform, setPlatform] = useState(creator.platform);

  const dirty = rating !== (creator.rating || 0) || note !== (creator.ratingNote || "") ||
    JSON.stringify(tags) !== JSON.stringify(creator.ratingTags || []);

  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  const saveRating = () => {
    onUpdateCreator({ ...creator, rating, ratingTags: tags, ratingNote: note });
    setSavedFlash(true); setTimeout(() => setSavedFlash(false), 1500);
  };

  const startEdit = () => { setName(creator.name); setLink(creator.profileLink || ""); setPlatform(creator.platform); setEditing(true); };
  const saveDetails = () => {
    onUpdateCreator({ ...creator, name: name.trim() || creator.name, profileLink: link.trim(), platform, rating, ratingTags: tags, ratingNote: note });
    setEditing(false);
  };

  const collabs = creator.collaborations || [];
  const totalItems = collabs.reduce((s, c) => s + (c.productCount || 0), 0);
  const totalValue = collabs.reduce((s, c) => s + (Number(c.totalValue) || 0), 0);
  const byName = {};
  collabs.forEach(c => (c.products || []).forEach(p => { if (p.name) byName[p.name] = (byName[p.name] || 0) + (Number(p.qty) || 0); }));

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
                  <Chip color={PLATFORM_COLOR[creator.platform]}>{creator.platform}</Chip>
                  {creator.profileLink && <a href={creator.profileLink} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.blue, wordBreak: "break-all" }}>{creator.profileLink}</a>}
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
                onStatus={onCollabStatus} onEdit={onEditCollab} onDelete={onDeleteCollab} onOpenCreator={() => {}} />
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  const [showAdd, setShowAdd] = useState(false);
  const [profileId, setProfileId] = useState(null);
  const [collabModal, setCollabModal] = useState(null);   // { creator, editCollab? }
  const [sourcingModal, setSourcingModal] = useState(null); // { editEntry? } | null
  const [showSourcingModal, setShowSourcingModal] = useState(false);

  // filters
  const [search, setSearch] = useState("");
  const [fPlatform, setFPlatform] = useState("All");
  const [fStatus, setFStatus] = useState("All");
  const [fType, setFType] = useState("All");
  const [fDate, setFDate] = useState("All");
  const [fResp, setFResp] = useState("All");

  useEffect(() => {
    Promise.all([
      fetch("/api/creators").then(r => r.json()),
      fetch("/api/sourcing").then(r => r.json()),
    ]).then(([cr, so]) => { setCreators(cr); setSourcing(so); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // ── Creator/collab handlers ──
  const reload = async () => {
    const cr = await fetch("/api/creators").then(r => r.json());
    setCreators(cr);
  };
  const uploadFiles = async (collabId, files) => {
    for (const f of files) {
      await fetch(`/api/collaborations/${collabId}/files`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: f.name, mimetype: f.type, dataBase64: f.dataBase64 }),
      });
    }
  };

  const handleAddInfluencer = async (payload) => {
    const { _newFiles = [], ...collabData } = payload.collaboration || {};
    const res = await fetch("/api/creators", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, collaboration: collabData }) });
    const saved = await res.json();
    setCreators(prev => [saved, ...prev]);
    const newCollabId = saved.collaborations?.[0]?.id;
    if (_newFiles.length && newCollabId) { await uploadFiles(newCollabId, _newFiles); await reload(); }
  };

  const handleUpdateCreator = async (creator) => {
    setCreators(prev => prev.map(c => c.id !== creator.id ? c : { ...c, name: creator.name, profileLink: creator.profileLink, platform: creator.platform, rating: creator.rating, ratingTags: creator.ratingTags, ratingNote: creator.ratingNote }));
    await fetch(`/api/creators/${creator.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(creator) });
  };

  const handleDeleteCreator = async (id) => {
    setCreators(prev => prev.filter(c => c.id !== id));
    if (profileId === id) setProfileId(null);
    await fetch(`/api/creators/${id}`, { method: "DELETE" });
  };

  const handleAddCollab = async (creatorId, collab) => {
    const { _newFiles = [], ...collabData } = collab;
    const res = await fetch(`/api/creators/${creatorId}/collaborations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(collabData) });
    const saved = await res.json();
    setCreators(prev => prev.map(c => c.id !== creatorId ? c : { ...c, collaborations: [saved, ...(c.collaborations || [])] }));
    if (_newFiles.length && saved.id) { await uploadFiles(saved.id, _newFiles); await reload(); }
  };

  const handleUpdateCollab = async (creatorId, collab) => {
    const { _newFiles = [], ...collabData } = collab;
    const res = await fetch(`/api/collaborations/${collab.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(collabData) });
    const saved = await res.json();
    // preserve existing attachments (PUT response carries none) until a reload refreshes them
    setCreators(prev => prev.map(c => c.id !== creatorId ? c : { ...c, collaborations: c.collaborations.map(co => co.id !== collab.id ? co : { ...co, ...saved, attachments: co.attachments || [] }) }));
    if (_newFiles.length) { await uploadFiles(collab.id, _newFiles); await reload(); }
  };

  const handleCollabStatus = async (creatorId, collabId, status) => {
    setCreators(prev => prev.map(c => c.id !== creatorId ? c : { ...c, collaborations: c.collaborations.map(co => co.id !== collabId ? co : { ...co, status }) }));
    await fetch(`/api/collaborations/${collabId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  };

  const handleDeleteCollab = async (creatorId, collabId) => {
    setCreators(prev => prev.map(c => c.id !== creatorId ? c : { ...c, collaborations: c.collaborations.filter(co => co.id !== collabId) }));
    await fetch(`/api/collaborations/${collabId}`, { method: "DELETE" });
  };

  // ── Sourcing handlers ──
  const handleSaveSourcing = async (entry) => {
    if (entry.id) {
      setSourcing(prev => prev.map(s => s.id !== entry.id ? s : { ...s, ...entry }));
      await fetch(`/api/sourcing/${entry.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
    } else {
      const res = await fetch("/api/sourcing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry) });
      const saved = await res.json();
      setSourcing(prev => [saved, ...prev]);
    }
  };
  const handleDeleteSourcing = async (id) => {
    setSourcing(prev => prev.filter(s => s.id !== id));
    await fetch(`/api/sourcing/${id}`, { method: "DELETE" });
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

  const responsibles = Array.from(new Set(allCollabs.map(x => x.collab.responsible).filter(Boolean))).sort();

  const dateOk = (createdAt) => {
    if (fDate === "All") return true;
    const days = daysBetween(new Date(createdAt), today);
    return days <= Number(fDate);
  };

  const filteredCollabs = allCollabs.filter(({ creator, collab }) => {
    if (!platformMatch(creator.platform, fPlatform)) return false;
    if (fStatus !== "All" && collab.status !== fStatus) return false;
    if (fType !== "All" && collab.type !== fType) return false;
    if (fResp !== "All" && collab.responsible !== fResp) return false;
    if (!dateOk(collab.createdAt)) return false;
    return true;
  }).sort((a, b) => {
    const rank = (s) => STATUS_KEYS.indexOf(s);
    return rank(a.collab.status) - rank(b.collab.status);
  });

  const filteredCreators = creators.filter(cr => {
    if (!search) return true;
    const q = search.toLowerCase();
    return cr.name.toLowerCase().includes(q) || (cr.profileLink || "").toLowerCase().includes(q);
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
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 24 }}>
              <StatCard label="Upcoming" value={countStatus("upcoming")} color={T.blue} />
              <StatCard label="In Progress" value={countStatus("in_progress")} color={T.orange} />
              <StatCard label="Completed" value={countStatus("completed")} color={T.green} />
              <StatCard label="Active creators" value={activeCreators} />
              <StatCard label="Gifting" value={giftingCount} color={T.purple} />
              <StatCard label="Paid" value={paidCount} color={T.blue} />
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 22 }}>
              {["All", ...STATUS_KEYS].map(s => pill(fStatus === s, s === "All" ? "All status" : STATUS[s].label, () => setFStatus(s), s !== "All" ? STATUS[s].color : null))}
              <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />
              {["All", ...TYPES].map(t => pill(fType === t, t === "All" ? "All types" : t, () => setFType(t), t !== "All" ? TYPE_COLOR[t] : null))}
              <div style={{ width: 1, height: 20, background: T.border, flexShrink: 0 }} />
              {["All", "Meta", "TikTok"].map(p => pill(fPlatform === p, p, () => setFPlatform(p), p !== "All" ? PLATFORM_COLOR[p] : null))}
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
                    onStatus={handleCollabStatus} onEdit={openEditCollab} onDelete={handleDeleteCollab} onOpenCreator={c => setProfileId(c.id)} />
                ))}
              </div>
            )}
          </>
        )}

        {/* ── INFLUENCERS ── */}
        {activeTab === "influencers" && (
          <>
            <div style={{ position: "relative", marginBottom: 20, maxWidth: 340 }}>
              <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 14, color: T.textTert, pointerEvents: "none" }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search creators…"
                style={{ width: "100%", background: T.inputBg, border: "none", borderRadius: 12, padding: "10px 14px 10px 36px", color: T.text, fontSize: 14, outline: "none", fontFamily: "inherit" }} />
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
                  return (
                    <button key={cr.id} onClick={() => setProfileId(cr.id)}
                      style={{ textAlign: "left", background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "14px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 44, height: 44, borderRadius: "50%", background: PLATFORM_COLOR[cr.platform] + "22", color: PLATFORM_COLOR[cr.platform], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{initials(cr.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>{cr.name}</span>
                          <Chip color={PLATFORM_COLOR[cr.platform]}>{cr.platform}</Chip>
                          {cr.rating > 0 && <StarRating value={cr.rating} size={13} readOnly />}
                        </div>
                        <div style={{ fontSize: 12, color: T.textSec, marginTop: 4 }}>
                          {collabs.length} collaboration{collabs.length !== 1 ? "s" : ""}
                          {ongoing > 0 && <span style={{ color: T.orange }}> · {ongoing} ongoing</span>}
                        </div>
                      </div>
                      <span style={{ fontSize: 18, color: T.textTert, flexShrink: 0 }}>›</span>
                    </button>
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

            {sourcing.length === 0 ? (
              <div style={{ textAlign: "center", color: T.textSec, fontSize: 16, padding: "70px 0" }}>No saved profiles yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sourcing.map(s => (
                  <div key={s.id} style={{ background: T.card, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 1px 4px rgba(0,0,0,0.04)", padding: "14px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: T.text, letterSpacing: "-0.01em" }}>{s.name}</span>
                      <Chip color={PLATFORM_COLOR[s.platform]}>{s.platform}</Chip>
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
        />
      )}
    </>
  );
}
