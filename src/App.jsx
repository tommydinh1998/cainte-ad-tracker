import { useState, useEffect } from "react";

const PLATFORMS = ["Meta", "TikTok"];
const SLACK_CHANNEL = "C0B6UQRJC9E";
const PLATFORM_CONFIG = { Meta: { color: "#007AFF" }, TikTok: { color: "#FF2D55" } };

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

// ── DATA ──────────────────────────────────────────────────────────────────────
const initialBatches = [
  { id:1, name:"Pending TikTok Ads", platform:"TikTok", link:"https://docs.google.com/spreadsheets/d/16nR7bEciiskiDZe5qXNjTtOpm6Rn3SOvxbGI118rAWQ/edit?gid=526307413", submittedBy:"Brand Director", creatorHandle:"", submittedDate:new Date(today.getTime()-30*86400000), totalAds:7, notes:"Spark codes from annual plan sheet", ads:[
    {id:1,adId:"#1118",name:"Mathias Larsen — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:2,adId:"#1143",name:"Tyler Weyman — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:3,adId:"#1155",name:"Luke — Lifestyle inspo",status:"pending",issueNote:"⚠ Cannot run in DK. Run EU/USA/UK only.",assignedTo:"PDM"},
    {id:4,adId:"#1197",name:"Fake Meta - Mathias Larsen — Product focus",status:"pending",issueNote:"⚠ Cannot run in DK",assignedTo:"PDM"},
    {id:5,adId:"#1202",name:"Morgan — Awareness",status:"pending",issueNote:"",assignedTo:""},
    {id:6,adId:"#1203",name:"EA - Mathias L. — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:7,adId:"#1204",name:"EA - intern - amt sale — Product focus",status:"pending",issueNote:"",assignedTo:""},
  ]},
  { id:2, name:"Pending Meta Ads", platform:"Meta", link:"https://docs.google.com/spreadsheets/d/16nR7bEciiskiDZe5qXNjTtOpm6Rn3SOvxbGI118rAWQ/edit?gid=526307413", submittedBy:"Brand Director", creatorHandle:"", submittedDate:new Date(today.getTime()-30*86400000), totalAds:10, notes:"Meta ads from annual plan sheet — mix of fake profiles and creator ads", ads:[
    {id:1,adId:"#1132",name:"Diego Alvarez — Lifestyle inspo",status:"pending",issueNote:"",assignedTo:""},
    {id:2,adId:"#1169",name:"Fake Meta - gr.valentine — Lifestyle inspo",status:"pending",issueNote:"",assignedTo:""},
    {id:3,adId:"#1170",name:"Fake Meta - Oscar (@Oscarkeuning) — Lifestyle inspo",status:"pending",issueNote:"",assignedTo:""},
    {id:4,adId:"#1171",name:"Fake Meta - Mathias L. — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:5,adId:"#1183",name:"CAINTE Main ads — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:6,adId:"#1184",name:"Fake Meta - Niklas Broen — Lifestyle inspo",status:"pending",issueNote:"",assignedTo:""},
    {id:7,adId:"#1185",name:"Fake Meta - Manu Piqueras — Lifestyle inspo",status:"pending",issueNote:"",assignedTo:""},
    {id:8,adId:"#1186",name:"Fake Meta - Manu Piqueras V2 — Lifestyle inspo",status:"pending",issueNote:"",assignedTo:""},
    {id:9,adId:"#1190",name:"Fake Meta - Sille M. — Lifestyle inspo (CAVERE)",status:"pending",issueNote:"",assignedTo:""},
    {id:10,adId:"#1196",name:"Fake Meta - Mathias Larsen — Product focus",status:"pending",issueNote:"",assignedTo:""},
  ]},
  { id:3, name:"Womens Collection", platform:"Meta", link:"https://docs.google.com/spreadsheets/d/16nR7bEciiskiDZe5qXNjTtOpm6Rn3SOvxbGI118rAWQ/edit?gid=526307413", submittedBy:"Brand Director", creatorHandle:"", submittedDate:new Date(today.getTime()-10*86400000), totalAds:4, notes:"Womens collection folder", ads:[
    {id:1,adId:"#1181",name:"Fake Meta - Hailey Morgan — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:2,adId:"#1182",name:"Fake Meta - Sille M. — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:3,adId:"#1187",name:"Fake TikTok - intern V1 — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:4,adId:"#1188",name:"Fake TikTok - intern V2 — Product focus",status:"pending",issueNote:"",assignedTo:""},
  ]},
  { id:4, name:"Partnership — Jules", platform:"Meta", link:"https://drive.google.com/drive/folders/1OeuP1YgZZX2xU4h78SqqJfn8CnT397ZB", submittedBy:"Brand Director", creatorHandle:"@julesfrankenn", submittedDate:new Date(today.getTime()-5*86400000), totalAds:1, notes:"2x unboxing. Fake profile needs to be created first.", ads:[
    {id:1,adId:"#1191",name:"Jules — 2x Unboxing",status:"issue",issueNote:"Fake profile needs to be created by Tommy before agency can set up",assignedTo:"CAINTE"},
  ]},
  { id:5, name:"Partnership — Constanza", platform:"Meta", link:"https://drive.google.com/drive/folders/1hH_LXP9n9QB4wYx31jJw6K8IDuyl00qh", submittedBy:"Brand Director", creatorHandle:"Constanza.navarroo", submittedDate:new Date(today.getTime()-5*86400000), totalAds:1, notes:"Review needed.", ads:[
    {id:1,adId:"#1192",name:"Constanza — Product focus",status:"issue",issueNote:"Fake profile needs to be created by Tommy before agency can set up",assignedTo:"CAINTE"},
  ]},
  { id:6, name:"Partnership — Nico B.", platform:"Meta", link:"https://drive.google.com/file/d/1c5IgabtVCxF16-52qkEgPSN9s0-SQ5H/view", submittedBy:"Brand Director", creatorHandle:"", submittedDate:new Date(today.getTime()-5*86400000), totalAds:1, notes:"", ads:[
    {id:1,adId:"#1193",name:"Nico B. — Lifestyle inspo",status:"pending",issueNote:"",assignedTo:""},
  ]},
  { id:7, name:"Partnership — Emilian", platform:"Meta", link:"https://drive.google.com/file/d/12QzP-fUgoCPJ4vQSdrK0cHfrLQ7t3j48/view", submittedBy:"Brand Director", creatorHandle:"", submittedDate:new Date(today.getTime()-5*86400000), totalAds:1, notes:"", ads:[
    {id:1,adId:"#1194",name:"Emilian — Lifestyle inspo",status:"issue",issueNote:"Fake profile needs to be created by Tommy before agency can set up",assignedTo:"CAINTE"},
  ]},
  { id:8, name:"Partnership — Johnathan K.", platform:"Meta", link:"", submittedBy:"Brand Director", creatorHandle:"NAME PENDING", submittedDate:new Date(today.getTime()-5*86400000), totalAds:1, notes:"", ads:[
    {id:1,adId:"#1195",name:"Johnathan K. — Awareness",status:"issue",issueNote:"Creator handle/name still pending — cannot set up until confirmed",assignedTo:"CAINTE"},
  ]},
  { id:9, name:"Partnership — Ros", platform:"Meta", link:"https://drive.google.com/drive/folders/12uGaZ0GNalEnIQzCGv-7wdE7qb9F4lib", submittedBy:"Brand Director", creatorHandle:"@vroalap", submittedDate:new Date(today.getTime()-3*86400000), totalAds:1, notes:"", ads:[
    {id:1,adId:"#1198",name:"Ros — Lifestyle inspo",status:"issue",issueNote:"Fake profile needs to be created before agency can set up",assignedTo:"CAINTE"},
  ]},
  { id:10, name:"Partnership — Sara G.", platform:"Meta", link:"https://drive.google.com/drive/folders/1_52wojGWs_kRwkEqd81wB9KHvQzYJfaJ", submittedBy:"Brand Director", creatorHandle:"Sara Gruszczynski", submittedDate:new Date(today.getTime()-3*86400000), totalAds:1, notes:"", ads:[
    {id:1,adId:"#1199",name:"Sara G. — Lifestyle inspo",status:"issue",issueNote:"Fake profile needs to be created before agency can set up",assignedTo:"CAINTE"},
  ]},
  { id:11, name:"Partnership — Rina", platform:"Meta", link:"https://drive.google.com/drive/folders/1GGmeRpc-HcGiM9oDifPtZ0NTFvPT3NMh", submittedBy:"Brand Director", creatorHandle:"@rinasblc", submittedDate:new Date(today.getTime()-3*86400000), totalAds:1, notes:"", ads:[
    {id:1,adId:"#1200",name:"Rina — Lifestyle inspo",status:"issue",issueNote:"Partnership request needs to be sent",assignedTo:"CAINTE"},
  ]},
  { id:12, name:"Partnership — Loufalley", platform:"Meta", link:"https://drive.google.com/drive/folders/1BGhxM8ZHIiqKB5TQegWHeWN7kalm69Nw", submittedBy:"Brand Director", creatorHandle:"@iamloufalley", submittedDate:new Date(today.getTime()-3*86400000), totalAds:1, notes:"", ads:[
    {id:1,adId:"#1201",name:"Loufalley — Lifestyle inspo",status:"issue",issueNote:"Partnership request needs to be sent",assignedTo:"CAINTE"},
  ]},
  { id:13, name:"EA — Women & Men Sale", platform:"Meta", link:"https://docs.google.com/spreadsheets/d/16nR7bEciiskiDZe5qXNjTtOpm6Rn3SOvxbGI118rAWQ/edit?gid=526307413", submittedBy:"Brand Director", creatorHandle:"", submittedDate:new Date(today.getTime()-5*86400000), totalAds:2, notes:"Use this — Women EA and Men EA", ads:[
    {id:1,adId:"#1209",name:"Women EA — Awareness",status:"pending",issueNote:"",assignedTo:""},
    {id:2,adId:"#1210",name:"Men EA — Awareness",status:"pending",issueNote:""},
  ]},
  { id:14, name:"Hailey Morgan — Meta", platform:"Meta", link:"https://docs.google.com/spreadsheets/d/16nR7bEciiskiDZe5qXNjTtOpm6Rn3SOvxbGI118rAWQ/edit?gid=526307413", submittedBy:"Brand Director", creatorHandle:"Hailey Morgan", submittedDate:new Date(today.getTime()-5*86400000), totalAds:4, notes:"Multiple Hailey Morgan fake Meta ads", ads:[
    {id:1,adId:"#1211",name:"Fake Meta - Hailey V1 — Awareness",status:"pending",issueNote:"",assignedTo:""},
    {id:2,adId:"#1212",name:"Fake Meta - Hailey V2 — Awareness",status:"pending",issueNote:"",assignedTo:""},
    {id:3,adId:"#1213",name:"Fake Meta - Hailey V3 — Awareness",status:"pending",issueNote:"",assignedTo:""},
    {id:4,adId:"#1214",name:"Fake Meta - Hailey V4 — Awareness",status:"pending",issueNote:"",assignedTo:""},
  ]},
  { id:15, name:"Tommy / Fake Meta", platform:"Meta", link:"https://docs.google.com/spreadsheets/d/16nR7bEciiskiDZe5qXNjTtOpm6Rn3SOvxbGI118rAWQ/edit?gid=526307413", submittedBy:"Brand Director", creatorHandle:"", submittedDate:new Date(today.getTime()-5*86400000), totalAds:3, notes:"", ads:[
    {id:1,adId:"#1215",name:"Fake Meta - Tommy V1 — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:2,adId:"#1216",name:"Fake Meta - Tommy V2 — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:3,adId:"#1217",name:"Fake Meta - Tommy V3 — Product focus",status:"pending",issueNote:"",assignedTo:""},
  ]},
  { id:16, name:"Staunastrip & Remaining Meta", platform:"Meta", link:"https://docs.google.com/spreadsheets/d/16nR7bEciiskiDZe5qXNjTtOpm6Rn3SOvxbGI118rAWQ/edit?gid=526307413", submittedBy:"Brand Director", creatorHandle:"", submittedDate:new Date(today.getTime()-5*86400000), totalAds:5, notes:"", ads:[
    {id:1,adId:"#1218",name:"Fake Meta - Staunastrip — Product focus",status:"pending",issueNote:"Cannot run in DK",assignedTo:"PDM"},
    {id:2,adId:"#1219",name:"Fake Meta - Mathias L. V1 — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:3,adId:"#1220",name:"CAINTE V1 — Awareness",status:"pending",issueNote:"",assignedTo:""},
    {id:4,adId:"#1221",name:"CAINTE V2 — Product focus",status:"pending",issueNote:"",assignedTo:""},
    {id:5,adId:"#1222",name:"CAINTE V3 — Product focus",status:"pending",issueNote:"",assignedTo:""},
  ]},
  { id:17, name:"Remaining TikTok", platform:"TikTok", link:"https://docs.google.com/spreadsheets/d/16nR7bEciiskiDZe5qXNjTtOpm6Rn3SOvxbGI118rAWQ/edit?gid=526307413", submittedBy:"Brand Director", creatorHandle:"", submittedDate:new Date(today.getTime()-5*86400000), totalAds:2, notes:"", ads:[
    {id:1,adId:"#1224",name:"Diego A. — Lifestyle inspo",status:"pending",issueNote:"",assignedTo:""},
    {id:2,adId:"#1225",name:"CAINTE — Product focus",status:"pending",issueNote:"",assignedTo:""},
  ]},
  { id:18, name:"Partnership — Pablo", platform:"Meta", link:"https://docs.google.com/spreadsheets/d/16nR7bEciiskiDZe5qXNjTtOpm6Rn3SOvxbGI118rAWQ/edit?gid=526307413", submittedBy:"Brand Director", creatorHandle:"@pablokowiecki", submittedDate:new Date(today.getTime()-5*86400000), totalAds:1, notes:"19/05/2026 — no spark code yet", ads:[
    {id:1,adId:"#1205",name:"Fake Meta - Pablo — Lifestyle inspo",status:"issue",issueNote:"No spark code or creative yet",assignedTo:"CAINTE"},
  ]},
];

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

// ── BatchCard ─────────────────────────────────────────────────────────────────
const BatchCard = ({ batch, onUpdateAd, onDelete, onEdit }) => {
  const [expanded,    setExpanded]   = useState(false);
  const [issueModal,  setIssueModal] = useState(null);
  const { isComplete } = getBatchState(batch);
  const daysSubmitted  = daysBetween(batch.submittedDate, today);
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
          <div style={{ fontSize:11, color:T.textSec }}>{batch.submittedBy} · {fmt(batch.submittedDate)} · {daysSubmitted}d ago · {batch.ads.length} ad{batch.ads.length!==1?"s":""}</div>
        </div>

        <ProgressBar batch={batch} />
      </div>

      {expanded && (
        <div style={{ borderTop:`1px solid ${T.border}` }}>
          {(batch.link||batch.notes) && (
            <div style={{ padding:"12px 16px 4px" }}>
              {batch.link && <div style={{ marginBottom:10 }}><Label>Source</Label><a href={batch.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:12, color:T.blue, wordBreak:"break-all", lineHeight:1.5 }}>{batch.link}</a></div>}
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
                    <span style={{ fontSize:11, color:T.textTert, fontFamily:"ui-monospace,monospace", marginLeft:"auto" }}>{ad.adId}</span>
                  </div>
                  {/* Ad name */}
                  <div style={{ fontSize:15, fontWeight:600, color:T.text, marginBottom:8, letterSpacing:"-0.01em" }}>{ad.name}</div>
                  {/* Issue note */}
                  {ad.issueNote && (
                    <div style={{ fontSize:13, color:T.textSec, lineHeight:1.55, marginBottom:14, padding:"10px 12px", background:T.bg, borderRadius:10 }}>
                      {ad.issueNote}
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
const Field = ({ label, value, onChange, placeholder, type="text" }) => (
  <div style={{ marginBottom:18 }}>
    <div style={{ fontSize:13, fontWeight:600, color:T.textSec, marginBottom:7 }}>{label}</div>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
      style={{ width:"100%", background:T.bg, border:"1.5px solid rgba(60,60,67,0.1)", borderRadius:12, padding:"13px 15px", color:T.text, fontSize:15, boxSizing:"border-box", outline:"none", fontFamily:"inherit", transition:"border-color 0.15s" }}
      onFocus={e=>e.target.style.borderColor=T.blue}
      onBlur={e=>e.target.style.borderColor="rgba(60,60,67,0.1)"}
    />
  </div>
);

const SubmitModal = ({ onClose, onAdd, onSave, editBatch }) => {
  const isEdit = !!editBatch;
  const [form, setForm] = useState({ name:editBatch?.name||"", platform:editBatch?.platform||"Meta", link:editBatch?.link||"", notes:editBatch?.notes||"", submittedBy:editBatch?.submittedBy||"", creatorHandle:editBatch?.creatorHandle||"", totalAds:editBatch?.ads.length||1 });
  const [adNames, setAdNames] = useState(editBatch ? editBatch.ads.map(a=>a.name) : [""]);
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const handleTotalAdsChange = (val) => {
    const n = Math.max(1,Math.min(50,Number(val)));
    set("totalAds",n);
    setAdNames(prev=>Array.from({length:n},(_,i)=>prev[i]||""));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (isEdit) {
      const updatedAds = Array.from({length:Number(form.totalAds)},(_,i) => {
        const ex = editBatch.ads[i];
        return ex ? {...ex,name:adNames[i]?.trim()||ex.name}
                  : {id:i+1,adId:genAdId(),name:adNames[i]?.trim()||`Ad ${i+1}`,status:"pending",issueNote:"",assignedTo:""};
      });
      onSave({...editBatch,...form,totalAds:Number(form.totalAds),ads:updatedAds});
    } else {
      const ads = Array.from({length:Number(form.totalAds)},(_,i)=>({id:i+1,adId:genAdId(),name:adNames[i]?.trim()||`Ad ${i+1}`,status:"pending",issueNote:"",assignedTo:""}));
      onAdd({id:nextId++,...form,totalAds:Number(form.totalAds),submittedDate:new Date(),ads});
    }
    onClose();
  };

  return (
    <div style={{ position:"fixed",inset:0,zIndex:100,background:"rgba(0,0,0,0.40)",backdropFilter:"blur(8px)",WebkitBackdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"24px 16px" }}>
      <div style={{ background:"#FFFFFF",borderRadius:22,width:"100%",maxWidth:520,maxHeight:"90vh",overflowY:"auto",padding:"32px 28px 36px",boxShadow:"0 24px 80px rgba(0,0,0,0.16), 0 0 0 0.5px rgba(0,0,0,0.05)" }}>
        <div style={{ fontSize:24,fontWeight:700,color:T.text,letterSpacing:"-0.025em",marginBottom:6 }}>{isEdit?"Edit Batch":"New Batch"}</div>
        <div style={{ fontSize:14,color:T.textSec,marginBottom:28 }}>{isEdit?"Update details — ad statuses are preserved.":"All ads start as Pending. Agency marks them Live."}</div>

        <Field label="Batch Name" value={form.name} onChange={v=>set("name",v)} placeholder="e.g. June Image Ads" />
        <Field label="Google Sheet Link or Spark Codes" value={form.link} onChange={v=>set("link",v)} placeholder="https://" />
        <Field label="Creator / Profile Handle" value={form.creatorHandle} onChange={v=>set("creatorHandle",v)} placeholder="@handle — leave blank if not a partnership" />
        <Field label="Submitted by" value={form.submittedBy} onChange={v=>set("submittedBy",v)} placeholder="Your name" />
        <Field label="Notes for Agency" value={form.notes} onChange={v=>set("notes",v)} placeholder="Context, priorities, geo restrictions…" />

        <div style={{ marginBottom:22 }}>
          <div style={{ fontSize:13,fontWeight:600,color:T.textSec,marginBottom:10 }}>Platform</div>
          <div style={{ display:"flex",gap:10 }}>
            {PLATFORMS.map(p=>{
              const active=form.platform===p; const c=PLATFORM_CONFIG[p].color;
              return <button key={p} onClick={()=>set("platform",p)} style={{ flex:1,padding:"13px 0",borderRadius:13,border:"none",cursor:"pointer",fontSize:15,fontWeight:600,transition:"all 0.18s",background:active?c:T.bg,color:active?"#fff":T.textSec,boxShadow:active?`0 4px 14px ${c}45`:"none" }}>{p}</button>;
            })}
          </div>
        </div>

        <Field label="Number of Ads" value={String(form.totalAds)} onChange={handleTotalAdsChange} type="number" placeholder="1" />

        <div style={{ marginBottom:28 }}>
          <div style={{ fontSize:13,fontWeight:600,color:T.textSec,marginBottom:10 }}>Ad Names <span style={{ color:T.textTert,fontWeight:400 }}>— IDs auto-assigned</span></div>
          <div style={{ display:"flex",flexDirection:"column",gap:8,maxHeight:220,overflowY:"auto" }}>
            {adNames.map((name,i)=>(
              <div key={i} style={{ display:"flex",alignItems:"center",gap:10 }}>
                <span style={{ fontSize:11,color:T.textTert,fontFamily:"ui-monospace,monospace",flexShrink:0,width:50 }}>#{String(nextAdId+i).padStart(4,"0")}</span>
                <input value={name} onChange={e=>setAdNames(prev=>prev.map((n,j)=>j===i?e.target.value:n))} placeholder={`Ad ${i+1}`}
                  style={{ flex:1,background:T.bg,border:"1.5px solid rgba(60,60,67,0.1)",borderRadius:10,padding:"10px 13px",color:T.text,fontSize:14,boxSizing:"border-box",outline:"none",fontFamily:"inherit",transition:"border-color 0.15s" }}
                  onFocus={e=>e.target.style.borderColor=T.blue} onBlur={e=>e.target.style.borderColor="rgba(60,60,67,0.1)"} />
              </div>
            ))}
          </div>
        </div>

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
  const [loading,        setLoading]       = useState(true);
  const [activeTab,      setActiveTab]     = useState("batches");
  const [showModal,      setShowModal]     = useState(false);
  const [editingBatch,   setEditingBatch]  = useState(null);
  const [filterPlatform, setFilterPlatform]= useState("All");
  const [filterState,    setFilterState]   = useState("All");
  const [search,         setSearch]        = useState("");

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
