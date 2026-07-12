// Shared design system for the Cainte trackers (Ad Tracker + Influencer Tracker).
// Single source of truth for theme tokens, small helpers and presentational
// components so both modules look and feel identical.

export const T = {
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
  teal:    "#30B0C7",
  yellow:  "#FFCC00",
  inputBg: "rgba(118,118,128,0.12)",
  pillBg:  "rgba(116,116,128,0.10)",
};

export const fmt = (d) => d.toLocaleDateString("en-GB", { month: "short", day: "numeric" });
export const daysBetween = (a, b) => Math.floor((b - a) / 86400000);

// ── Shared small components ───────────────────────────────────────────────────
export const Chip = ({ children, color, bg }) => (
  <span style={{ fontSize:11, fontWeight:600, color, background:bg||color+"18", borderRadius:6, padding:"2px 8px" }}>
    {children}
  </span>
);

export const Label = ({ children }) => (
  <div style={{ fontSize:11, fontWeight:700, color:T.textTert, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:5 }}>
    {children}
  </div>
);

export const IconBtn = ({ onClick, title, emoji }) => (
  <button onClick={onClick} title={title}
    style={{ background:"none", border:"none", fontSize:15, padding:"6px 7px", borderRadius:8, cursor:"pointer", lineHeight:1 }}>
    {emoji}
  </button>
);

export const StatusBtn = ({ active, color, onClick, children }) => (
  <button onClick={onClick}
    style={{ padding:"5px 13px", borderRadius:99, fontSize:12, fontWeight:600, border:`1.5px solid ${active?color:"transparent"}`, background:active?color+"18":T.pillBg, color:active?color:T.textSec, cursor:"pointer", transition:"all 0.15s" }}>
    {children}
  </button>
);

export const Field = ({ label, value, onChange, placeholder, type="text", error, required }) => (
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
