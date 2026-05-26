import { useState, useEffect } from "react";

const PLATFORMS = ["Meta", "TikTok", "Boosting"];
const SLACK_CHANNEL = "C0B6UQRJC9E";
const PLATFORM_CONFIG = { Meta: { color: "#007AFF" }, TikTok: { color: "#FF2D55" }, Boosting: { color: "#FF9500" } };

const today = new Date();
const fmt = (d) => d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
const daysBetween = (a, b) => Math.floor((b - a) / 86400000);

let nextId = 10;
let nextAdId = 100;
const genAdId = () => `#${String(nextAdId++).padStart(4, "0")}`;

const AD_STATUS = {
  live:    { color: "#34C759", label: "Live" },
  pending: { color: "#8E8E93", label: "Pending" },
  issue:   { color: "#FF3B30", label: "Issue" },
};

const OWNER = {
  CAINTE: { label: "Cainte",  color: "#AF52DE", bg: "#AF52DE15" },
  PDM:    { label: "PDM",     color: "#007AFF", bg: "#007AFF15" },
};

const T = {
  bg:      "#F2F2F7",
  card:    "#FFFFFF",
  border:  "rgba(60,60,67,0.13)",
  text:    "#000000",
  textSec: "rgba(60,60,67,0.6)",
  textTert:"rgba(60,60,67,0.3)",
  blue:    "#007AFF",
  green:   "#34C759",
  red:     "#FF3B30",
  orange:  "#FF9500",
  purple:  "#AF52DE",
  inputBg: "rgba(118,118,128,0.12)",
  pillBg:  "rgba(116,116,128,0.10)",
};

const getBatchState = (batch) => {
  const live    = batch.ads.filter(a => a.status === "live").length;
  const pending = batch.ads.filter(a => a.status === "pending").length;
  const issues  = batch.ads.filter(a => a.status === "issue").length;
  return { live, pending, issues, isComplete: pending === 0 && issues === 0 };
};

const sendSlackNotification = async (batch, ad, issueNote, assignedTo) => {
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514", max_tokens: 1000,
        messages: [{ role: "user", content: `Send a Slack message to channel ${SLACK_CHANNEL} with this content:\n🚨 *Ad Issue Flagged*\n*Batch:* ${batch.name} (${batch.platform})\n*Ad:* ${ad.adId} · ${ad.name}\n${batch.creatorHandle ? `*Creator:* ${batch.creatorHandle}\n` : ""}*Issue:* ${issueNote}\n*Action required by:* ${assignedTo}\n*Submitted by:* ${batch.submittedBy}` }],
        mcp_servers: [{ type: "url", url: "https://mcp.slack.com/mcp", name: "slack" }]
      })
    });
    return r.ok;
  } catch { return false; }
};


// ── Shared small components ───────────────────────────────────────────────────
const Chip = ({ children, color, bg }) => (
  <span style={{ fontSize:11, fontWeight:600, color, background:bg||color+"18", borderRadius:6, padding:"2px 8px" }}>
    {children}
  </span>
);
const Label = ({ children }) => (
  <div style={{ fontSize:11, fontWeight:700, color:T.textTert, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
    {children}
  </div>
);
const IconBtn = ({ onClick, title, emoji }) => (
  <button onClick={onClick} title={title}
    style={{ background:"none", border:"none", fontSize:15, padding:"6px 7px", borderRadius:8, cursor:"pointer", lineHeight:1 }}>
    {emoji}
  </button>
);
const StatusBtn = ({ active, color, onClick, children }) => (
  <button onClick={onClick}
    style={{ padding:"5px 13px", borderRadius:99, fontSize:12, fontWeight:600, border:`1.5px solid ${active?color:"transparent"}`, background:active?color+"18":T.pillBg, color:active?color:T.textSec, cursor:"pointer", transition:"all 0.15s" }}>
    {children}
  </button>
);

const ProgressBar = ({ batch }) => {
  const { live, pending, issues } = getBatchState(batch);
  const total = batch.ads.length;
  return (
    <div style={{ marginTop:10 }}>
      <div style={{ height:3, borderRadius:99, background:"rgba(60,60,67,0.08)", overflow:"hidden", display:"flex" }}>
        <div style={{ width:`${(live/total)*100}%`, background:T.green, transition:"width 0.4s ease" }} />
        <div style={{ width:`${(issues/total)*100}%`, background:T.red, transition:"width 0.4s ease" }} />
      </div>
      <div style={{ display:"flex", gap:12, marginTop:5 }}>
        {live>0    && <span style={{ fontSize:11, color:T.green,   fontWeight:500 }}>{live} live</span>}
        {issues>0  && <span style={{ fontSize:11, color:T.red,     fontWeight:500 }}>{issues} issue{issues>1?"s":""}</span>}
        {pending>0 && <span style={{ fontSize:11, color:T.textSec              }}>{pending} pending</span>}
      </div>
    </div>
  );
};

// ── IssueModal ────────────────────────────────────────────────────────────────
const IssueModal = ({ ad, batch, onConfirm, onClose }) => {
  const [note,       setNote]       = useState(ad.issueNote   || "");
  const [assignedTo, setAssignedTo] = useState(ad.assignedTo  || "CAINTE");
  const [sending,    setSending]    = useState(false);
  const [sent,       setSent]       = useState(false);

  const submit = async () => {
    if (!note.trim()) return;
    setSending(true);
    const ok = await sendSlackNotification(batch, ad, note, assignedTo);
    setSending(false); setSent(ok);
    onConfirm(note, assignedTo);
    setTimeout(onClose, 1400);
  };

  return (
    <div style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,0.45)", backdropFilter:"blur(8px)", WebkitBackdropFilter:"blur(8px)", display:"flex", alignItems:"center", justifyContent:"center", padding:"24px 16px" }}>
      <div style={{ background:"#FFFFFF", borderRadius:22, width:"100%", maxWidth:500, padding:"32px 28px 28px", boxShadow:"0 24px 80px rgba(0,0,0,0.18), 0 0 0 0.5px rgba(0,0,0,0.06)" }}>

        <div style={{ fontSize:22, fontWeight:700, color:T.text, letterSpacing:"-0.02em", marginBottom:8 }}>Flag Issue</div>
        <div style={{ fontSize:14, color:T.textSec, marginBottom:24, lineHeight:1.55 }}>
          <span style={{ color:T.text, fontWeight:600 }}>{ad.adId}</span>{" · "}{ad.name}
          <br /><span style={{ fontSize:13 }}>Will notify <span style={{ color:T.blue, fontWeight:500 }}>#cainte-ad-alerts</span></span>
        </div>

        {/* Assigned to */}
        <div style={{ marginBottom:18 }}>
          <Label>Action required by</Label>
          <div style={{ display:"flex", gap:10, marginTop:6 }}>
            {Object.entries(OWNER).map(([key, cfg]) => (
              <button key={key} onClick={() => setAssignedTo(key)}
                style={{ flex:1, padding:"12px 0", borderRadius:13, border:`2px solid ${assignedTo===key ? cfg.color : "transparent"}`, background:assignedTo===key ? cfg.bg : T.bg, color:assignedTo===key ? cfg.color : T.textSec, fontSize:15, fontWeight:700, cursor:"pointer", transition:"all 0.15s" }}>
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        {/* Note */}
        <div style={{ marginBottom:20 }}>
          <Label>Issue description</Label>
          <textarea value={note} onChange={e => setNote(e.target.value)}
            placeholder="Describe what's blocking this ad…"
            rows={4} autoFocus
            style={{ width:"100%", background:T.bg, border:`1.5px solid rgba(60,60,67,0.1)`, borderRadius:14, padding:"14px 16px", color:T.text, fontSize:15, lineHeight:1.55, resize:"none", boxSizing:"border-box", fontFamily:"inherit", outline:"none", transition:"border-color 0.15s" }}
            onFocus={e => e.target.style.borderColor = T.blue}
            onBlur={e => e.target.style.borderColor = "rgba(60,60,67,0.1)"}
          />
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <button onClick={onClose} style={{ flex:1, padding:"15px 0", background:T.bg, border:"none", borderRadius:14, color:T.text, fontSize:16, fontWeight:600, cursor:"pointer" }}>Cancel</button>
          <button onClick={submit} disabled={sending||!note.trim()}
            style={{ flex:2, padding:"15px 0", border:"none", borderRadius:14, background:sent?T.green:T.red, color:"#fff", fontSize:16, fontWeight:700, cursor:note.trim()?"pointer":"default", opacity:note.trim()?1:0.38, transition:"background 0.2s, opacity 0.15s", boxShadow:note.trim()?`0 4px 16px ${sent?T.green:T.red}40`:"none" }}>
            {sending?"Sending…":sent?"✓ Sent":"Flag & Notify"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── CopyCodesBtn ──────────────────────────────────────────────────────────────
const CopyCodesBtn = ({ ads }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    const codes = ads
      .filter(a => a.sparkCode?.trim())
      .map(a => a.sparkCode.trim())
      .join("\n");
    if (!codes) return;
    navigator.clipboard.writeText(codes).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const hasAnyCodes = ads.some(a => a.sparkCode?.trim());
  if (!hasAnyCodes) return null;

  return (
    <button onClick={handleCopy}
      style={{ background: copied ? T.green+"18" : T.pillBg, border:"none", borderRadius:7, color: copied ? T.green : T.blue, fontSize:11, fontWeight:600, padding:"3px 10px", cursor:"pointer", transition:"all 0.2s", flexShrink:0 }}>
      {copied ? "✓ Copied" : "Copy all codes"}
    </button>
  );
};

// ── BatchCard ─────────────────────────────────────────────────────────────────
const BatchCard = ({ batch, onUpdateAd, onDelete, onEdit }) => {
  const [expanded,    setExpanded]   = useState(false);
  const [issueModal,  setIssueModal] = useState(null);
  const { isComplete } = getBatchState(batch);
  const submittedDate  = new Date(batch.submittedDate);
  const daysSubmitted  = daysBetween(submittedDate, today);
  const hasIssues      = batch.ads.some(a => a.status === "issue");

  return (
    <div style={{ background:T.card, borderRadius:14, overflow:"hidden", border:`1px solid ${T.border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.04)" }}>
      <div style={{ padding:"13px 16px 12px" }}>
        {/* top row — chips + actions */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8, flexWrap:"wrap" }}>
          <Chip color={PLATFORM_CONFIG[batch.platform].color}>{batch.platform}</Chip>
          {batch.creatorHandle && <span style={{ fontSize:11, color:T.purple, fontWeight:500 }}>{batch.creatorHandle}</span>}
          {hasIssues && !isComplete && <Chip color={T.red}>Needs action</Chip>}
          {isComplete && <Chip color={T.green}>✓ Complete</Chip>}
          <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:2 }}>
            <IconBtn onClick={() => onEdit(batch)}      title="Edit"   emoji="✏️" />
            <IconBtn onClick={() => onDelete(batch.id)} title="Delete" emoji="🗑" />
            <button onClick={() => setExpanded(e=>!e)}
              style={{ background:T.pillBg, border:"none", borderRadius:7, color:T.textSec, fontSize:10, fontWeight:600, padding:"4px 9px", cursor:"pointer", letterSpacing:"0.01em" }}>
              {expanded?"Less ▲":"More ▼"}
            </button>
          </div>
        </div>

        {/* title + meta inline */}
        <div style={{ display:"flex", alignItems:"baseline", gap:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:15, fontWeight:700, color:T.text, letterSpacing:"-0.02em" }}>{batch.name}</div>
          <div style={{ fontSize:11, color:T.textSec }}>{batch.submittedBy} · {fmt(submittedDate)} · {daysSubmitted}d ago · {batch.ads.length} ad{batch.ads.length!==1?"s":""}</div>
        </div>

        <ProgressBar batch={batch} />
      </div>

      {expanded && (
        <div style={{ borderTop:`1px solid ${T.border}` }}>
          {(batch.link || batch.notes || (batch.platform === "TikTok" && batch.ads.some(a => a.sparkCode))) && (
            <div style={{ padding:"12px 16px 4px" }}>
              {batch.link && <div style={{ marginBottom:10 }}><Label>Source</Label><a href={batch.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:T.blue, wordBreak:"break-all", lineHeight:1.5 }}>{batch.link}</a></div>}
              {batch.platform === "TikTok" && batch.ads.some(a => a.sparkCode) && (
                <div style={{ marginBottom:10 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                    <Label>Spark Codes</Label>
                    <CopyCodesBtn ads={batch.ads} />
                  </div>
                  {batch.ads.filter(a => a.sparkCode).map(a => (
                    <div key={a.id} style={{ display:"flex", gap:10, alignItems:"center", marginBottom:4 }}>
                      <span style={{ fontSize:11, color:T.textTert, fontFamily:"ui-monospace,monospace", flexShrink:0, minWidth:44 }}>{a.adId}</span>
                      <span style={{ fontSize:12, color:T.textSec, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.name}</span>
                      <span style={{ fontSize:12, color:T.text, fontFamily:"ui-monospace,monospace", background:T.bg, borderRadius:6, padding:"2px 8px", flexShrink:0 }}>{a.sparkCode}</span>
                    </div>
                  ))}
                </div>
              )}
              {batch.notes && <div style={{ marginBottom:10 }}><Label>Notes</Label><div style={{ fontSize:13, color:T.text, lineHeight:1.55 }}>{batch.notes}</div></div>}
            </div>
          )}
          <div style={{ paddingBottom:6 }}>
            {batch.ads.map((ad,i) => (
              <div key={ad.id}>
                {i>0 && <div style={{ height:1, background:T.border, margin:"0 16px" }} />}
                <div style={{ padding:"9px 16px" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontSize:10, color:T.textTert, fontFamily:"ui-monospace,monospace", flexShrink:0, minWidth:44 }}>{ad.adId}</span>
                    <span style={{ flex:1, fontSize:13, color:T.text, fontWeight:500, minWidth:100 }}>{ad.name}</span>
                    {ad.assignedTo && <Chip color={OWNER[ad.assignedTo].color} bg={OWNER[ad.assignedTo].bg}>{OWNER[ad.assignedTo].label}</Chip>}
                    <div style={{ display:"flex", gap:5, flexShrink:0 }}>
                      {["live","pending"].map(s => (
                        <StatusBtn key={s} active={ad.status===s} color={AD_STATUS[s].color} onClick={() => onUpdateAd(batch.id,ad.id,s,"","")}>{AD_STATUS[s].label}</StatusBtn>
                      ))}
                      <StatusBtn active={ad.status==="issue"} color={T.red} onClick={() => setIssueModal({ad})}>Issue</StatusBtn>
                    </div>
                  </div>
                  {ad.issueNote && (
                    <div style={{ fontSize:11, color:T.red, marginTop:5, paddingLeft:52, lineHeight:1.5 }}>{ad.issueNote}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {issueModal && (
        <IssueModal ad={issueModal.ad} batch={batch}
          onConfirm={(note,assignedTo) => onUpdateAd(batch.id,issueModal.ad.id,"issue",note,assignedTo)}
          onClose={() => setIssueModal(null)} />
      )}
    </div>
  );
};

// ── ActionsView ───────────────────────────────────────────────────────────────
const ActionsView = ({ batches, onUpdateAd }) => {
  const [activeOwner, setActiveOwner] = useState("ALL");

  // Collect all issue ads across all batches
  const allIssues = [];
  batches.forEach(batch => {
    batch.ads.forEach(ad => {
      if (ad.status === "issue") {
        allIssues.push({ batch, ad });
      }
    });
  });

  const cainte = allIssues.filter(i => i.ad.assignedTo === "CAINTE");
  const pdm    = allIssues.filter(i => i.ad.assignedTo === "PDM");
  const unassigned = allIssues.filter(i => !i.ad.assignedTo);

  const visible = activeOwner === "ALL"    ? allIssues
                : activeOwner === "CAINTE" ? cainte
                : activeOwner === "PDM"    ? pdm
                :                           unassigned;

  if (allIssues.length === 0) {
    return (
      <div style={{ textAlign:"center", padding:"80px 24px", color:T.textSec }}>
        <div style={{ fontSize:48, marginBottom:16 }}>✅</div>
        <div style={{ fontSize:18, fontWeight:600, color:T.text, marginBottom:8 }}>No open actions</div>
        <div style={{ fontSize:14 }}>All ads are either live or pending setup.</div>
      </div>
    );
  }

  const Section = ({ owner, items }) => {
    if (items.length === 0) return null;
    const cfg = OWNER[owner] || { label:"Unassigned", color:T.textSec, bg:T.pillBg };
    return (
      <div style={{ marginBottom:32 }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
          <span style={{ fontSize:18, fontWeight:700, color:cfg.color, letterSpacing:"-0.02em" }}>{cfg.label}</span>
          <span style={{ fontSize:13, color:cfg.color, background:cfg.bg, borderRadius:99, padding:"2px 10px", fontWeight:600 }}>{items.length}</span>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {items.map(({ batch, ad }) => (
            <div key={`${batch.id}-${ad.id}`} style={{ background:T.card, borderRadius:16, border:`1px solid ${T.border}`, boxShadow:"0 1px 6px rgba(0,0,0,0.04)", overflow:"hidden" }}>
              {/* Coloured left stripe */}
              <div style={{ display:"flex" }}>
                <div style={{ width:4, background:cfg.color, flexShrink:0 }} />
                <div style={{ flex:1, padding:"16px 18px" }}>
                  {/* Top row */}
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10, flexWrap:"wrap" }}>
                    <Chip color={PLATFORM_CONFIG[batch.platform].color}>{batch.platform}</Chip>
                    <span style={{ fontSize:12, color:T.textSec }}>{batch.name}</span>
                    {batch.creatorHandle && <span style={{ fontSize:12, color:T.purple, fontWeight:500 }}>{batch.creatorHandle}</span>}
                    <span style={{ fontSize:11, color:T.textTert, fontFamily:"ui-monospace,monospace", marginLeft:"auto" }}>{ad.adId}</span>
                  </div>
                  {/* Ad name */}
                  <div style={{ fontSize:15, fontWeight:600, color:T.text, marginBottom:8, letterSpacing:"-0.01em" }}>{ad.name}</div>
                  {/* Issue note */}
                  {ad.issueNote && (
                    <div style={{ fontSize:13, color:T.textSec, lineHeight:1.55, marginBottom:10, padding:"10px 12px", background:T.bg, borderRadius:10 }}>
                      {ad.issueNote}
                    </div>
                  )}
                  {/* Source */}
                  {batch.link && (
                    <div style={{ marginBottom:14 }}>
                      <a href={batch.link} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize:12, color:T.blue, fontWeight:500, display:"inline-flex", alignItems:"center", gap:5, padding:"5px 10px", background:T.blue+"10", borderRadius:8, textDecoration:"none" }}>
                        <span>📎</span> View source
                      </a>
                    </div>
                  )}
                  {/* Actions */}
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    <button onClick={() => onUpdateAd(batch.id, ad.id, "live", "", "")}
                      style={{ padding:"7px 16px", borderRadius:99, border:"none", background:T.green+"18", color:T.green, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                      Mark Live
                    </button>
                    <button onClick={() => onUpdateAd(batch.id, ad.id, "pending", "", "")}
                      style={{ padding:"7px 16px", borderRadius:99, border:"none", background:T.pillBg, color:T.textSec, fontSize:13, fontWeight:600, cursor:"pointer" }}>
                      Back to Pending
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth:1100, margin:"0 auto", padding:"28px 32px 80px" }}>
      {/* Owner filter */}
      <div style={{ display:"flex", gap:8, marginBottom:28, flexWrap:"wrap" }}>
        {[
          { key:"ALL",      label:`All  (${allIssues.length})`,   color:T.text },
          { key:"CAINTE",   label:`Cainte  (${cainte.length})`,   color:OWNER.CAINTE.color },
          { key:"PDM",      label:`PDM  (${pdm.length})`,         color:OWNER.PDM.color },
          { key:"NONE",     label:`Unassigned  (${unassigned.length})`, color:T.textSec },
        ].map(({ key, label, color }) => {
          const active = activeOwner === key;
          return (
            <button key={key} onClick={() => setActiveOwner(key)}
              style={{ padding:"8px 18px", borderRadius:99, border:"none", cursor:"pointer", fontSize:13, fontWeight:active?700:400, background:active?color+"18":T.pillBg, color:active?color:T.textSec, transition:"all 0.15s" }}>
              {label}
            </button>
          );
        })}
      </div>

      {activeOwner === "ALL" ? (
        <>
          <Section owner="CAINTE"    items={cainte} />
          <Section owner="PDM"       items={pdm} />
          {unassigned.length > 0 && <Section owner="NONE" items={unassigned} />}
        </>
      ) : (
        <Section owner={activeOwner === "NONE" ? "NONE" : activeOwner} items={visible} />
      )}
    </div>
  );
};

// ── Field + SubmitModal ───────────────────────────────────────────────────────
const Field = ({ label, value, onChange, placeholder, type="text", error, required }) => (
  <div style={{ marginBottom:18 }}>
    <div style={{ fontSize:13, fontWeight:600, color:T.textSec, marginBottom:7 }}>
      {label}{required && <span style={{ color:T.red, marginLeft:3 }}>*</span>}
    </div>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{ width:"100%", background:T.bg, border:`1.5px solid ${error ? T.red : "rgba(60,60,67,0.1)"}`, borderRadius:12, padding:"13px 15px", color:T.text, fontSize:15, boxSizing:"border-box", outline:"none", fontFamily:"inherit", transition:"border-color 0.15s" }}
      onFocus={e=>e.target.style.borderColor=error?T.red:T.blue}
      onBlur={e=>e.target.style.borderColor=error?T.red:"rgba(60,60,67,0.1)"}
    />
    {error && <div style={{ fontSize:12, color:T.red, marginTop:4 }}>{error}</div>}
  </div>
);

const SubmitModal = ({ onClose, onAdd, onSave, editBatch }) => {
  const isEdit = !!editBatch;
  const isTikTok   = (p) => p === "TikTok";
  const isBoosting = (p) => p === "Boosting";

  const [form, setForm] = useState({
    name: editBatch?.name||"",
    platform: editBatch?.platform||"Meta",
    link: editBatch?.link||"",
    notes: editBatch?.notes||"",
    submittedBy: editBatch?.submittedBy||"",
    creatorHandle: editBatch?.creatorHandle||"",
  });

  // Each ad row: { name, sparkCode }
  const [adRows, setAdRows] = useState(() => {
    if (editBatch) return editBatch.ads.map(a => ({ name: a.name, sparkCode: a.sparkCode||"" }));
    return [{ name: "", sparkCode: "" }];
  });

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const addRow    = () => setAdRows(prev => [...prev, { name:"", sparkCode:"" }]);
  const removeRow = (i) => setAdRows(prev => prev.length > 1 ? prev.filter((_,j)=>j!==i) : prev);
  const updateRow = (i, field, val) => setAdRows(prev => prev.map((r,j) => j===i ? {...r,[field]:val} : r));

  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = "Batch name is required";
    if (!form.creatorHandle.trim()) e.creatorHandle = "Creator / profile handle is required";
    if (!isTikTok(form.platform) && !form.link.trim()) e.link = `${isBoosting(form.platform) ? "Post" : "Google Sheet / Drive"} link is required`;
    if (isTikTok(form.platform) && adRows.every(r => !r.sparkCode.trim())) e.sparkCode = "At least one spark code is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    let ads = [];
    if (!isBoosting(form.platform)) {
      ads = adRows.map((row, i) => {
        const name = row.name.trim() || `Ad ${i+1}`;
        const ex = editBatch?.ads[i];
        return ex
          ? { ...ex, name, sparkCode: row.sparkCode.trim() }
          : { id:i+1, adId:genAdId(), name, status:"pending", issueNote:"", assignedTo:"", sparkCode: row.sparkCode.trim() };
      });
    }

    const batchData = { ...form, totalAds: ads.length, ads };

    if (isEdit) {
      onSave({ ...editBatch, ...batchData });
    } else {
      onAdd({ id: nextId++, ...batchData, submittedDate: new Date() });
    }
    onClose();
  };

  const errStyle = { fontSize:12, color:T.red, marginTop:4, marginBottom:0 };
  const inputStyle = { width:"100%", background:T.bg, border:"1.5px solid rgba(60,60,67,0.1)", borderRadius:12, padding:"13px 15px", color:T.text, fontSize:15, boxSizing:"border-box", outline:"none", fontFamily:"inherit", transition:"border-color 0.15s" };
  const smallInput = { ...inputStyle, padding:"10px 13px", fontSize:14, borderRadius:10 };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,0.40)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px" }}>
      <div style={{ background:"#FFFFFF",borderRadius:22,width:"100%",maxWidth:560,maxHeight:"90vh",overflowY:"auto",padding:"32px 28px 36px",boxShadow:"0 24px 80px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.05)" }}>

        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:6 }}>
          <div style={{ fontSize:24,fontWeight:700,color:T.text,letterSpacing:"-0.025em" }}>{isEdit?"Edit Batch":"New Batch"}</div>
          <button onClick={onClose} style={{ background:"none",border:"none",fontSize:20,color:T.textTert,cursor:"pointer",padding:"2px 6px",lineHeight:1,borderRadius:8,marginTop:-2 }}>✕</button>
        </div>
        <div style={{ fontSize:14,color:T.textSec,marginBottom:24 }}>{isEdit?"Update details — ad statuses are preserved.":"All ads start as Pending. Agency marks them Live."}</div>

        {/* ── Step 1: Platform ── */}
        <div style={{ marginBottom:22 }}>
          <div style={{ fontSize:13,fontWeight:600,color:T.textSec,marginBottom:10 }}>Platform</div>
          <div style={{ display:"flex",gap:10 }}>
            {PLATFORMS.map(p=>{
              const active=form.platform===p; const c=PLATFORM_CONFIG[p].color;
              return <button key={p} onClick={()=>set("platform",p)} style={{ flex:1,padding:"13px 0",borderRadius:13,border:"none",cursor:"pointer",fontSize:15,fontWeight:600,transition:"all 0.18s",background:active?c:T.bg,color:active?"#fff":T.textSec,boxShadow:active?`0 4px 14px ${c}45`:"none" }}>{p}</button>;
            })}
          </div>
        </div>

        {/* ── Step 2: Batch info ── */}
        <Field label="Batch Name" value={form.name} onChange={v=>{set("name",v); if(v.trim()) setErrors(e=>({...e,name:null}));}} placeholder="e.g. June Partnership Ads" required error={errors.name} />
        <Field label="Creator / Profile Handle" value={form.creatorHandle} onChange={v=>{set("creatorHandle",v); if(v.trim()) setErrors(e=>({...e,creatorHandle:null}));}} placeholder="@handle" required error={errors.creatorHandle} />
        <Field label="Submitted by" value={form.submittedBy} onChange={v=>set("submittedBy",v)} placeholder="Your name" />

        {/* ── Step 3: Source — changes by platform ── */}
        {isTikTok(form.platform) ? null : (
          <Field
            label={isBoosting(form.platform) ? "Post Link" : "Google Sheet / Drive Link"}
            value={form.link}
            onChange={v=>{set("link",v); if(v.trim()) setErrors(e=>({...e,link:null}));}}
            placeholder="https://"
            required
            error={errors.link}
          />
        )}

        <Field label="Notes for Agency" value={form.notes} onChange={v=>set("notes",v)} placeholder="Context, priorities, geo restrictions…" />

        {/* ── Step 4: Ads — hidden for Boosting ── */}
        {!isBoosting(form.platform) && (

        {/* ── Step 4: Ads ── */}
        <div style={{ marginBottom:28 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
            <div style={{ fontSize:13,fontWeight:600,color:T.textSec }}>
              {isTikTok(form.platform) ? "Ads & Spark Codes" : "Ads"}
              <span style={{ color:T.textTert,fontWeight:400 }}> — IDs auto-assigned</span>
            </div>
          </div>
          {errors.sparkCode && <div style={{ fontSize:12, color:T.red, marginBottom:8 }}>{errors.sparkCode}</div>}

          {/* Column headers for TikTok */}
          {isTikTok(form.platform) && (
            <div style={{ display:"grid", gridTemplateColumns:"44px 1fr 160px 28px", gap:8, marginBottom:6, paddingLeft:0 }}>
              <div/>
              <div style={{ fontSize:11,fontWeight:600,color:T.textTert,textTransform:"uppercase",letterSpacing:"0.06em" }}>Ad Name</div>
              <div style={{ fontSize:11,fontWeight:600,color:T.textTert,textTransform:"uppercase",letterSpacing:"0.06em" }}>Spark Code</div>
              <div/>
            </div>
          )}

          <div style={{ display:"flex",flexDirection:"column",gap:8,maxHeight:280,overflowY:"auto" }}>
            {adRows.map((row,i) => (
              <div key={i} style={{ display:"grid", gridTemplateColumns: isTikTok(form.platform) ? "44px 1fr 160px 28px" : "44px 1fr 28px", gap:8, alignItems:"center" }}>
                {/* ID — assigned by DB on save */}
                <span style={{ fontSize:11,color:T.textTert,fontFamily:"ui-monospace,monospace",textAlign:"right",paddingRight:4 }}>
                  #auto
                </span>
                {/* Ad name */}
                <input
                  value={row.name}
                  onChange={e=>updateRow(i,"name",e.target.value)}
                  placeholder={`Ad ${i+1}`}
                  style={smallInput}
                  onFocus={e=>e.target.style.borderColor=T.blue}
                  onBlur={e=>e.target.style.borderColor="rgba(60,60,67,0.1)"}
                />
                {/* Spark code — TikTok only */}
                {isTikTok(form.platform) && (
                  <input
                    value={row.sparkCode}
                    onChange={e=>updateRow(i,"sparkCode",e.target.value)}
                    placeholder="Spark code…"
                    style={{ ...smallInput, fontFamily:"ui-monospace,monospace", fontSize:12 }}
                    onFocus={e=>e.target.style.borderColor=PLATFORM_CONFIG.TikTok.color}
                    onBlur={e=>e.target.style.borderColor="rgba(60,60,67,0.1)"}
                  />
                )}
                {/* Remove */}
                <button onClick={()=>removeRow(i)} style={{ background:"none",border:"none",color:T.textTert,cursor:"pointer",fontSize:16,padding:0,lineHeight:1,opacity:adRows.length===1?0.2:1 }}>✕</button>
              </div>
            ))}
          </div>

          {/* Meta: quick number generator | TikTok: + Add ad */}
          {!isTikTok(form.platform) ? (
            <div style={{ marginTop:10, display:"flex", alignItems:"center", gap:8 }}>
              <span style={{ fontSize:13, color:T.textSec }}>Generate</span>
              <input
                type="number" min="1" max="50"
                placeholder="e.g. 5"
                style={{ ...smallInput, width:80, textAlign:"center", padding:"8px 10px" }}
                onFocus={e=>e.target.style.borderColor=T.blue}
                onBlur={e=>e.target.style.borderColor="rgba(60,60,67,0.1)"}
                onChange={e => {
                  const n = Math.max(1, Math.min(50, Number(e.target.value)));
                  if (n && e.target.value) {
                    setAdRows(Array.from({length:n}, (_,i) => ({ name:"", sparkCode:"" })));
                    if (errors.ads) setErrors(err => ({...err, ads:null}));
                  }
                }}
              />
              <span style={{ fontSize:13, color:T.textSec }}>rows — or</span>
              <button onClick={addRow}
                style={{ background:"none", border:"none", color:T.blue, fontSize:13, fontWeight:600, cursor:"pointer", padding:0 }}>
                + Add one
              </button>
            </div>
          ) : (
            <button onClick={addRow}
              style={{ marginTop:10,background:"none",border:`1.5px dashed rgba(60,60,67,0.2)`,borderRadius:10,color:T.textSec,fontSize:13,fontWeight:600,cursor:"pointer",padding:"9px 0",width:"100%",transition:"all 0.15s" }}
              onMouseEnter={e=>e.target.style.borderColor=T.blue}
              onMouseLeave={e=>e.target.style.borderColor="rgba(60,60,67,0.2)"}>
              + Add ad
            </button>
          )}
        </div>
        )}

        <div style={{ display:"flex",gap:10 }}>
          <button onClick={onClose} style={{ flex:1,padding:"15px 0",background:T.bg,border:"none",borderRadius:13,color:T.text,fontSize:16,fontWeight:600,cursor:"pointer" }}>Cancel</button>
          <button onClick={handleSubmit} style={{ flex:2,padding:"15px 0",background:T.blue,border:"none",borderRadius:13,color:"#fff",fontSize:16,fontWeight:700,cursor:"pointer",boxShadow:`0 4px 18px ${T.blue}40` }}>{isEdit?"Save Changes":"Submit Batch"}</button>
        </div>
      </div>
    </div>
  );
};

// ── Main App ──────────────────────────────────────────────────────────────────
export default function AdTracker() {
  const [batches,        setBatches]       = useState([]);
  const [authed,         setAuthed]        = useState(() => sessionStorage.getItem("cainte_auth") === "1");
  const [pwInput,        setPwInput]       = useState("");
  const [pwError,        setPwError]       = useState(false);
  const [loading,        setLoading]       = useState(true);
  const [activeTab,      setActiveTab]     = useState("batches");
  const [showModal,      setShowModal]     = useState(false);
  const [editingBatch,   setEditingBatch]  = useState(null);
  const [filterPlatform, setFilterPlatform]= useState("All");
  const [filterState,    setFilterState]   = useState("All");
  const [search,         setSearch]        = useState("");

  const handleLogin = (e) => {
    e.preventDefault();
    if (pwInput === "coda") {
      sessionStorage.setItem("cainte_auth", "1");
      setAuthed(true);
      setPwError(false);
    } else {
      setPwError(true);
      setPwInput("");
    }
  };

  // Load all batches from API on mount
  useEffect(() => {
    fetch("/api/batches")
      .then(r => r.json())
      .then(data => { setBatches(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleUpdateAd = async (batchId, adId, newStatus, issueNote, assignedTo) => {
    // Optimistic update
    setBatches(prev => prev.map(b => b.id!==batchId ? b :
      { ...b, ads: b.ads.map(a => a.id!==adId ? a : {
        ...a,
        status:     newStatus,
        issueNote:  issueNote  !== undefined ? issueNote  : a.issueNote,
        assignedTo: assignedTo !== undefined ? assignedTo : a.assignedTo,
      })}
    ));
    // Persist to DB
    await fetch(`/api/ads/${adId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, issueNote: issueNote||"", assignedTo: assignedTo||"" })
    });
  };

  const handleDelete = async (id) => {
    setBatches(prev => prev.filter(b => b.id !== id));
    await fetch(`/api/batches/${id}`, { method: "DELETE" });
  };

  const handleAdd = async (batch) => {
    const res = await fetch("/api/batches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(batch)
    });
    const saved = await res.json();
    setBatches(prev => [saved, ...prev]);
  };

  const handleEdit   = batch   => setEditingBatch(batch);

  const handleSave   = async (updated) => {
    const res = await fetch(`/api/batches/${updated.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated)
    });
    const result = await res.json();
    setBatches(prev => prev.map(b => b.id!==updated.id ? b : { ...updated, ads: result.ads || updated.ads }));
  };

  const totalLive    = batches.reduce((s,b)=>s+b.ads.filter(a=>a.status==="live").length,    0);
  const totalPending = batches.reduce((s,b)=>s+b.ads.filter(a=>a.status==="pending").length, 0);
  const totalIssues  = batches.reduce((s,b)=>s+b.ads.filter(a=>a.status==="issue").length,   0);
  const cainteCount  = batches.reduce((s,b)=>s+b.ads.filter(a=>a.status==="issue"&&a.assignedTo==="CAINTE").length, 0);
  const pdmCount     = batches.reduce((s,b)=>s+b.ads.filter(a=>a.status==="issue"&&a.assignedTo==="PDM").length,    0);

  const filtered = batches.filter(b => {
    if (filterPlatform!=="All" && b.platform!==filterPlatform) return false;
    if (filterState==="Issues"     && !b.ads.some(a=>a.status==="issue")) return false;
    if (filterState==="Complete"   && !getBatchState(b).isComplete)       return false;
    if (filterState==="InProgress" && getBatchState(b).isComplete)        return false;
    if (search && !b.name.toLowerCase().includes(search.toLowerCase()))   return false;
    return true;
  });

  // ── Password gate (rendered after all hooks) ──────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight:"100vh", background:T.bg, fontFamily:"-apple-system,'SF Pro Display',BlinkMacSystemFont,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;} input::placeholder{color:rgba(60,60,67,0.3);}`}</style>
        <div style={{ background:"#fff", borderRadius:22, padding:"40px 36px", width:"100%", maxWidth:380, boxShadow:"0 8px 40px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.06)", textAlign:"center" }}>
          <div style={{ fontSize:36, marginBottom:16 }}>🔒</div>
          <div style={{ fontSize:22, fontWeight:700, color:T.text, letterSpacing:"-0.025em", marginBottom:8 }}>Cainte Ad Tracker</div>
          <div style={{ fontSize:14, color:T.textSec, marginBottom:28 }}>Enter the password to continue</div>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={pwInput}
              onChange={e => { setPwInput(e.target.value); setPwError(false); }}
              placeholder="Password"
              autoFocus
              style={{ width:"100%", background:T.bg, border:`1.5px solid ${pwError ? T.red : "rgba(60,60,67,0.12)"}`, borderRadius:14, padding:"14px 16px", fontSize:16, color:T.text, outline:"none", fontFamily:"inherit", marginBottom:12, transition:"border-color 0.15s", textAlign:"center", letterSpacing:"0.1em" }}
            />
            {pwError && <div style={{ fontSize:13, color:T.red, marginBottom:12 }}>Incorrect password</div>}
            <button type="submit"
              style={{ width:"100%", padding:"15px 0", background:T.blue, border:"none", borderRadius:14, color:"#fff", fontSize:16, fontWeight:700, cursor:"pointer", boxShadow:`0 4px 18px ${T.blue}40` }}>
              Enter
            </button>
          </form>
        </div>
      </div>
    );
  }

  const TabBtn = ({ tab, label, badge }) => {
    const active = activeTab === tab;
    return (
      <button onClick={() => setActiveTab(tab)}
        style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 18px", borderRadius:99, border:"none", cursor:"pointer", fontSize:14, fontWeight:active?700:500, background:active?T.text:T.pillBg, color:active?"#fff":T.textSec, transition:"all 0.15s", flexShrink:0 }}>
        {label}
        {badge > 0 && (
          <span style={{ background:active?"rgba(255,255,255,0.25)":T.red+"18", color:active?"#fff":T.red, fontSize:11, fontWeight:700, borderRadius:99, padding:"1px 7px", minWidth:20, textAlign:"center" }}>
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div style={{ minHeight:"100vh", background:T.bg, fontFamily:"-apple-system,'SF Pro Display','SF Pro Text',BlinkMacSystemFont,sans-serif", color:T.text }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        input::placeholder,textarea::placeholder{color:rgba(60,60,67,0.28);}
        button{font-family:inherit;}
        ::-webkit-scrollbar{width:0;}
      `}</style>

      {/* ── Sticky header ── */}
      <div style={{ position:"sticky",top:0,zIndex:50,background:"rgba(242,242,247,0.92)",backdropFilter:"blur(24px)",WebkitBackdropFilter:"blur(24px)",borderBottom:`1px solid ${T.border}` }}>
        <div style={{ maxWidth:1100,margin:"0 auto",padding:"22px 32px 0" }}>

          {/* Title row */}
          <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:16,gap:16 }}>
            <div>
              <h1 style={{ fontSize:32,fontWeight:700,letterSpacing:"-0.03em",color:T.text,lineHeight:1 }}>Ad Tracker</h1>
              <div style={{ fontSize:13,color:T.textSec,marginTop:6,display:"flex",gap:14,flexWrap:"wrap" }}>
                {totalLive>0    && <span style={{ color:T.green,fontWeight:500 }}>{totalLive} live</span>}
                {totalPending>0 && <span>{totalPending} pending</span>}
                {cainteCount>0  && <span style={{ color:T.purple,fontWeight:500 }}>{cainteCount} Cainte action{cainteCount!==1?"s":""}</span>}
                {pdmCount>0     && <span style={{ color:T.blue,fontWeight:500 }}>{pdmCount} PDM action{pdmCount!==1?"s":""}</span>}
              </div>
            </div>
            <button onClick={() => setShowModal(true)}
              style={{ background:T.blue,border:"none",borderRadius:99,color:"#fff",padding:"11px 22px",fontSize:15,fontWeight:600,cursor:"pointer",flexShrink:0,boxShadow:`0 4px 18px ${T.blue}38`,letterSpacing:"-0.01em" }}>
              + New Batch
            </button>
          </div>

          {/* Tab row */}
          <div style={{ display:"flex",gap:8,paddingBottom:14,overflowX:"auto",alignItems:"center" }}>
            <TabBtn tab="batches" label="Batches" badge={0} />
            <TabBtn tab="actions" label="Actions" badge={totalIssues} />

            {activeTab==="batches" && (
              <>
                <div style={{ width:1,height:20,background:T.border,flexShrink:0,marginLeft:4 }} />
                <div style={{ position:"relative",flexShrink:0 }}>
                  <span style={{ position:"absolute",left:11,top:"50%",transform:"translateY(-50%)",fontSize:13,color:T.textTert,pointerEvents:"none" }}>🔍</span>
                  <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…"
                    style={{ background:T.inputBg,border:"none",borderRadius:12,padding:"8px 14px 8px 32px",color:T.text,fontSize:13,width:170,outline:"none",fontFamily:"inherit" }} />
                </div>
                <div style={{ width:1,height:20,background:T.border,flexShrink:0 }} />
                {[["All","All"],["InProgress","In Progress"],["Issues","Needs Action"],["Complete","Complete"]].map(([key,label])=>{
                  const active=filterState===key;
                  return <button key={key} onClick={()=>setFilterState(key)} style={{ padding:"7px 14px",borderRadius:99,border:"none",cursor:"pointer",fontSize:13,fontWeight:active?600:400,flexShrink:0,background:active?T.text:T.pillBg,color:active?"#fff":T.textSec,transition:"all 0.15s" }}>{label}</button>;
                })}
                <div style={{ width:1,height:20,background:T.border,flexShrink:0,marginLeft:"auto" }} />
                {["All","Meta","TikTok"].map(p=>{
                  const active=filterPlatform===p; const c=PLATFORM_CONFIG[p]?.color;
                  return <button key={p} onClick={()=>setFilterPlatform(p)} style={{ padding:"7px 14px",borderRadius:99,border:"none",cursor:"pointer",fontSize:13,fontWeight:active?600:400,flexShrink:0,background:active&&c?c+"18":active?T.text:T.pillBg,color:active&&c?c:active?"#fff":T.textSec,transition:"all 0.15s" }}>{p}</button>;
                })}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {activeTab === "batches" ? (
        <div style={{ maxWidth:1100,margin:"0 auto",padding:"28px 32px 80px" }}>
          {filtered.length===0 ? (
            <div style={{ textAlign:"center",color:T.textSec,fontSize:16,padding:"80px 0" }}>No batches found</div>
          ) : (
            <div style={{ display:"flex",flexDirection:"column",gap:8 }}>
              {[...filtered].sort((a,b) => {
                const rank = b => {
                  const { issues, isComplete } = getBatchState(b);
                  if (issues > 0)   return 0; // issues first
                  if (!isComplete)  return 1; // pending middle
                  return 2;                   // complete last
                };
                return rank(a) - rank(b);
              }).map(batch=>(
                <BatchCard key={batch.id} batch={batch} onUpdateAd={handleUpdateAd} onDelete={handleDelete} onEdit={handleEdit} />
              ))}
            </div>
          )}
        </div>
      ) : (
        <ActionsView batches={batches} onUpdateAd={handleUpdateAd} />
      )}

      {loading && (
        <div style={{ position:"fixed",inset:0,background:T.bg,display:"flex",alignItems:"center",justifyContent:"center",zIndex:999 }}>
          <div style={{ fontSize:15,color:T.textSec }}>Loading…</div>
        </div>
      )}
      {showModal    && <SubmitModal onClose={()=>setShowModal(false)} onAdd={handleAdd} />}
      {editingBatch && <SubmitModal onClose={()=>setEditingBatch(null)} onAdd={handleAdd} onSave={handleSave} editBatch={editingBatch} />}
    </div>
  );
}
