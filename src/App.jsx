import { useState } from "react";
import { T } from "./theme.jsx";
import AdTracker from "./AdTracker.jsx";
import InfluencerTracker from "./InfluencerTracker.jsx";
import CollectionTracker from "./CollectionTracker.jsx";
import BudgetTracker from "./BudgetTracker.jsx";
import KpiTracker from "./KpiTracker.jsx";
import { BRANDS, getBrand, setBrand } from "./brand.js";

const PRODUCTS = [
  { key: "ads",        label: "Ad Tracker" },
  { key: "influencer", label: "Influencer Tracker" },
  { key: "collection", label: "Collection Tracker" },
  { key: "budget",     label: "Kampagne Budget" },
  { key: "kpi",        label: "KPI" },
];

export default function App() {
  const [authed,  setAuthed]  = useState(() => sessionStorage.getItem("cainte_auth") === "1");
  const [pwInput, setPwInput] = useState("");
  const [pwError, setPwError] = useState(false);
  const [product, setProduct] = useState(() => sessionStorage.getItem("cainte_product") || "ads");
  const [brand,   setBrandState] = useState(getBrand);

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

  const switchProduct = (key) => {
    setProduct(key);
    sessionStorage.setItem("cainte_product", key);
  };

  // Switching brand remounts the active tracker (see key={brand} below), which
  // re-runs its initial fetch against the new brand.
  const switchBrand = (key) => {
    setBrand(key);
    setBrandState(key);
  };

  // ── Password gate ──────────────────────────────────────────────────────────
  if (!authed) {
    return (
      <div style={{ minHeight:"100vh", background:T.bg, fontFamily:"-apple-system,'SF Pro Display',BlinkMacSystemFont,sans-serif", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
        <style>{`*{box-sizing:border-box;margin:0;padding:0;} input::placeholder{color:rgba(60,60,67,0.3);}`}</style>
        <div style={{ background:"#fff", borderRadius:22, padding:"40px 36px", width:"100%", maxWidth:380, boxShadow:"0 8px 40px rgba(0,0,0,0.10), 0 0 0 0.5px rgba(0,0,0,0.06)", textAlign:"center" }}>
          <img src="/avatar.jpg" alt="" style={{ width:88, height:88, borderRadius:"50%", objectFit:"cover", marginBottom:20, boxShadow:"0 4px 16px rgba(0,0,0,0.10)" }} />
          <div style={{ fontSize:22, fontWeight:700, color:T.text, letterSpacing:"-0.025em", marginBottom:8 }}>Cainte Ops</div>
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

  // ── Authenticated app shell ────────────────────────────────────────────────
  return (
    <div style={{ minHeight:"100vh", background:T.bg, fontFamily:"-apple-system,'SF Pro Display','SF Pro Text',BlinkMacSystemFont,sans-serif", color:T.text }}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0;}
        input::placeholder,textarea::placeholder{color:rgba(60,60,67,0.28);}
        button{font-family:inherit;}
        ::-webkit-scrollbar{width:0;}
      `}</style>

      {/* ── Top-level product switch ── */}
      <div style={{ borderBottom:`1px solid ${T.border}`, background:"#fff" }}>
        <div style={{ maxWidth:1100, margin:"0 auto", padding:"10px 32px", display:"flex", alignItems:"center", gap:14, flexWrap:"wrap" }}>
          {/* Brand switch — same three products, separate data per brand */}
          <div style={{ display:"flex", gap:4, background:T.pillBg, borderRadius:99, padding:3 }}>
            {BRANDS.map(b => {
              const active = brand === b.key;
              return (
                <button key={b.key} onClick={() => switchBrand(b.key)} title={`Switch to ${b.label}`}
                  style={{ padding:"7px 15px", borderRadius:99, border:"none", cursor:"pointer", fontSize:12, fontWeight:800, letterSpacing:"0.06em", textTransform:"uppercase", background:active?b.color:"transparent", color:active?"#fff":T.textSec, boxShadow:active?`0 1px 6px ${b.color}55`:"none", transition:"all 0.15s" }}>
                  {b.label}
                </button>
              );
            })}
          </div>
          <div style={{ width:1, height:20, background:T.border }} />
          <div style={{ display:"flex", gap:4, background:T.pillBg, borderRadius:99, padding:3 }}>
            {PRODUCTS.map(p => {
              const active = product === p.key;
              return (
                <button key={p.key} onClick={() => switchProduct(p.key)}
                  style={{ padding:"7px 16px", borderRadius:99, border:"none", cursor:"pointer", fontSize:13, fontWeight:active?700:500, background:active?"#fff":"transparent", color:active?T.text:T.textSec, boxShadow:active?"0 1px 3px rgba(0,0,0,0.12)":"none", transition:"all 0.15s" }}>
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {product === "ads"
        ? <AdTracker key={brand} />
        : product === "influencer"
          ? <InfluencerTracker key={brand} />
          : product === "collection"
            ? <CollectionTracker key={brand} />
            : product === "budget"
              ? <BudgetTracker key={brand} />
              : <KpiTracker key={brand} />}
    </div>
  );
}
