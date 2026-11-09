// Det personlige indsendelseslink: ops.cainte.com/r/<token>
//
// Ingen adgangskode, ingen produktswitch, ingen navigation — kun denne persons
// felter for denne uge. 60-sekunders-reglen er hele designkravet: kan et tal
// ikke afleveres på under et minut fra telefonen, dør lag B i uge to.
import { useEffect, useState } from "react";
import { T } from "./theme.jsx";

const wrap = { minHeight:"100vh", background:T.bg, fontFamily:"-apple-system,'SF Pro Display','SF Pro Text',BlinkMacSystemFont,sans-serif", color:T.text, display:"flex", justifyContent:"center", padding:"32px 18px 60px" };
const card = { background:"#fff", borderRadius:22, padding:"28px 24px", width:"100%", maxWidth:460, boxShadow:"0 8px 40px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.05)" };

const fieldBox = { width:"100%", background:T.bg, border:"1.5px solid rgba(60,60,67,0.1)", borderRadius:14, color:T.text, outline:"none", fontFamily:"inherit" };

export default function KpiSubmit({ token }) {
  const [cadence, setCadence] = useState("weekly");
  const [data,   setData]   = useState(null);
  const [error,  setError]  = useState("");
  const [values, setValues] = useState({});
  const [note,   setNote]   = useState("");
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  useEffect(() => {
    setData(null);
    setDone(false);
    fetch(`/api/kpi/me/${token}?cadence=${cadence}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || "kunne ikke hentes"))))
      .then(d => {
        setData(d);
        setValues(Object.fromEntries(d.fields.map(f => [f.id, f.value === null ? "" : String(f.value)])));
      })
      .catch(e => setError(e.message));
  }, [token, cadence]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await fetch(`/api/kpi/me/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: data.period, values, note }),
      });
      if (!r.ok) throw new Error("kunne ikke gemmes");
      setDone(true);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  if (error) return (
    <div style={wrap}><div style={{ ...card, textAlign:"center" }}>
      <div style={{ fontSize:34, marginBottom:12 }}>🔒</div>
      <div style={{ fontSize:17, fontWeight:700, marginBottom:6 }}>Linket virker ikke</div>
      <div style={{ fontSize:14, color:T.textSec }}>{error}. Skriv til Tommy, så får du et nyt.</div>
    </div></div>
  );

  if (!data) return <div style={wrap}><div style={{ ...card, textAlign:"center", color:T.textSec }}>Henter …</div></div>;

  if (done) return (
    <div style={wrap}><div style={{ ...card, textAlign:"center" }}>
      <div style={{ width:56, height:56, borderRadius:"50%", background:T.green+"18", color:T.green, fontSize:28, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 16px" }}>✓</div>
      <div style={{ fontSize:19, fontWeight:700, letterSpacing:"-0.02em", marginBottom:6 }}>Modtaget</div>
      <div style={{ fontSize:14, color:T.textSec, lineHeight:1.5 }}>
        {periodName(data)} er registreret{data.past ? " — efter deadline" : ""}.
      </div>
      <button onClick={() => setDone(false)}
        style={{ marginTop:20, background:"none", border:"none", color:T.blue, fontSize:14, fontWeight:600, cursor:"pointer" }}>
        Ret
      </button>
    </div></div>
  );

  const deadline = data.deadline ? new Date(data.deadline) : null;
  const deadlineTxt = deadline
    ? deadline.toLocaleString("da-DK", { weekday:"long", day:"numeric", month:"short", hour:"2-digit", minute:"2-digit" })
    : "";

  return (
    <div style={wrap}>
      <style>{`*{box-sizing:border-box;margin:0;padding:0;} input::placeholder{color:rgba(60,60,67,0.28);}`}</style>
      <form style={card} onSubmit={submit}>
        <div style={{ fontSize:11, fontWeight:700, color:T.textTert, textTransform:"uppercase", letterSpacing:"0.09em" }}>
          {data.owner.func && data.owner.func !== data.owner.name ? `${data.owner.name} · ${data.owner.func}` : data.owner.name}
        </div>
        {data.cadences?.length > 1 && (
          <div style={{ display:"flex", background:"rgba(118,118,128,0.12)", borderRadius:10, padding:2, margin:"12px 0 14px" }}>
            {data.cadences.map(c => (
              <button key={c} type="button" onClick={() => setCadence(c)}
                style={{ flex:1, padding:"7px 0", border:"none", borderRadius:8, fontSize:13.5, cursor:"pointer", fontFamily:"inherit",
                         fontWeight: cadence === c ? 700 : 500, background: cadence === c ? "#fff" : "transparent",
                         color: cadence === c ? T.text : T.textSec, boxShadow: cadence === c ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
                {c === "weekly" ? "Uge" : "Måned"}
              </button>
            ))}
          </div>
        )}
        <div style={{ fontSize:23, fontWeight:700, letterSpacing:"-0.03em", margin:"4px 0 3px" }}>{periodName(data)}</div>
        <div style={{ fontSize:13, color: data.past ? T.orange : T.textSec, marginBottom:24 }}>
          {data.past ? `Deadline var ${deadlineTxt} — indsendelsen markeres som for sen` : `Inden ${deadlineTxt}`}
        </div>

        {data.fields.length === 0 && (
          <div style={{ fontSize:14, color:T.textSec, padding:"18px 0" }}>
            Der er ingen felter på dig i denne periode. Det er ikke en fejl du skal rette — sig til hvis det er forkert.
          </div>
        )}

        {/* Nyt i perioden øverst, »i alt« (i gang lige nu) nederst — så de to
            slags tal ikke blandes. Overskrifterne vises kun når der er begge. */}
        {data.fields.map((f, i) => (
          <div key={f.id} style={{ marginBottom:22 }}>
            {data.fields.some(x => x.total) && (i === 0 || f.total !== data.fields[i - 1].total) && (
              <div style={{ fontSize:11, fontWeight:700, color:T.textTert, textTransform:"uppercase", letterSpacing:"0.09em",
                            margin: i === 0 ? "0 0 14px" : "34px 0 14px", paddingTop: i === 0 ? 0 : 18,
                            borderTop: i === 0 ? "none" : "1px solid rgba(60,60,67,0.12)" }}>
                {f.total ? "I alt — i gang lige nu" : cadence === "weekly" ? "Nyt i ugen" : "Nyt i måneden"}
              </div>
            )}
            <div style={{ fontSize:15, fontWeight:650, marginBottom:3 }}>{f.label}</div>
            {/* Definitionen står ved feltet, ikke i et dokument — glidende
                definitioner er den hyppigste grund til at tal inflaterer. */}
            {f.definition && <div style={{ fontSize:12.5, color:T.textSec, lineHeight:1.45, marginBottom:9 }}>{f.definition}</div>}
            {f.kind === "text" ? (
              <textarea rows={4} value={values[f.id] ?? ""}
                onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                placeholder="Skriv her …"
                style={{ ...fieldBox, padding:"12px 14px", fontSize:15, lineHeight:1.45, resize:"vertical" }}
                onFocus={e => e.target.style.borderColor = T.blue}
                onBlur={e => e.target.style.borderColor = "rgba(60,60,67,0.1)"} />
            ) : (<>
            <div style={{ position:"relative" }}>
              <input
                type="number" inputMode="decimal" step="any"
                value={values[f.id] ?? ""}
                onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                placeholder={f.last !== null ? String(f.last) : "0"}
                style={{ ...fieldBox, padding:"16px 62px 16px 16px", fontSize:26, fontWeight:600, letterSpacing:"-0.02em" }}
                onFocus={e => e.target.style.borderColor = T.blue}
                onBlur={e => e.target.style.borderColor = "rgba(60,60,67,0.1)"}
              />
              {f.unit && <span style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", fontSize:14, fontWeight:600, color:T.textTert }}>{f.unit}</span>}
            </div>
            <div style={{ fontSize:12, color:T.textTert, marginTop:6, display:"flex", gap:10, flexWrap:"wrap" }}>
              {f.target !== null && (() => {
                const v = values[f.id];
                const hit = v !== "" && v !== undefined && Number(v) >= f.target;
                return <span style={{ fontWeight:700, color: v === "" || v === undefined ? T.textSec : hit ? T.green : T.red }}>
                  Mål: {f.target}{v !== "" && v !== undefined ? (hit ? " ✓" : " — ikke nået") : ""}
                </span>;
              })()}
              {f.auto && <span style={{ color:T.blue, fontWeight:600 }}>{f.autoNote || "Hentet fra Influencer Trackeren, ret hvis forkert"}</span>}
              <span>{f.last !== null ? `Sidst: ${f.last}` : `Intet tal ${cadence === "weekly" ? "sidste uge" : "sidste måned"}`}</span>
            </div>
            </>)}
          </div>
        ))}

        {data.fields.length > 0 && (
          <>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Kommentar (kun hvis noget er værd at vide)"
              style={{ width:"100%", background:T.bg, border:"1.5px solid rgba(60,60,67,0.1)", borderRadius:12, padding:"12px 14px", fontSize:14, color:T.text, outline:"none", fontFamily:"inherit", marginBottom:18 }} />
            <button type="submit" disabled={saving}
              style={{ width:"100%", padding:"16px 0", background:T.blue, border:"none", borderRadius:14, color:"#fff", fontSize:16, fontWeight:700, cursor:"pointer", opacity:saving?0.6:1, boxShadow:`0 4px 18px ${T.blue}40` }}>
              {saving ? "Sender …" : "Send"}
            </button>
          </>
        )}

        <div style={{ fontSize:11.5, color:T.textTert, textAlign:"center", marginTop:16, lineHeight:1.5 }}>
          Kan et felt ikke udfyldes på under et minut, er spørgsmålet forkert, ikke dig.
        </div>
      </form>
    </div>
  );
}

const MONTHS = ["januar","februar","marts","april","maj","juni","juli","august","september","oktober","november","december"];
function periodName(d) {
  const m = /^(\d{4})-(\d{2})$/.exec(d.period);
  return m ? `${MONTHS[Number(m[2]) - 1][0].toUpperCase()}${MONTHS[Number(m[2]) - 1].slice(1)} ${m[1]}` : d.periodLabel;
}
