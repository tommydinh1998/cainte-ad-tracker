// Det personlige indsendelseslink: ops.cainte.com/r/<token>
//
// Ingen adgangskode, ingen produktswitch, ingen navigation — kun denne persons
// felter for denne uge. 60-sekunders-reglen er hele designkravet: kan et tal
// ikke afleveres på under et minut fra telefonen, dør lag B i uge to.
import { useEffect, useState } from "react";
import { T } from "./theme.jsx";

const wrap = { minHeight:"100vh", background:T.bg, fontFamily:"-apple-system,'SF Pro Display','SF Pro Text',BlinkMacSystemFont,sans-serif", color:T.text, display:"flex", justifyContent:"center", padding:"32px 18px 60px" };
const card = { background:"#fff", borderRadius:22, padding:"28px 24px", width:"100%", maxWidth:460, boxShadow:"0 8px 40px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.05)" };

export default function KpiSubmit({ token }) {
  const [data,   setData]   = useState(null);
  const [error,  setError]  = useState("");
  const [values, setValues] = useState({});
  const [note,   setNote]   = useState("");
  const [saving, setSaving] = useState(false);
  const [done,   setDone]   = useState(false);

  useEffect(() => {
    fetch(`/api/kpi/me/${token}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(new Error(j.error || "kunne ikke hentes"))))
      .then(d => {
        setData(d);
        setValues(Object.fromEntries(d.fields.map(f => [f.id, f.value === null ? "" : String(f.value)])));
      })
      .catch(e => setError(e.message));
  }, [token]);

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
        {data.periodLabel} er registreret{data.past ? " — efter deadline" : ""}. Tallet er med på mandagsrapporten.
      </div>
      <button onClick={() => setDone(false)}
        style={{ marginTop:20, background:"none", border:"none", color:T.blue, fontSize:14, fontWeight:600, cursor:"pointer" }}>
        Ret tallet
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
          {data.owner.func || data.owner.name}
        </div>
        <div style={{ fontSize:23, fontWeight:700, letterSpacing:"-0.03em", margin:"4px 0 3px" }}>{data.periodLabel}</div>
        <div style={{ fontSize:13, color: data.past ? T.orange : T.textSec, marginBottom:24 }}>
          {data.past ? `Deadline var ${deadlineTxt} — indsendelsen markeres som for sen` : `Inden ${deadlineTxt}`}
        </div>

        {data.fields.length === 0 && (
          <div style={{ fontSize:14, color:T.textSec, padding:"18px 0" }}>
            Der er ingen tal på dig i denne uge. Det er ikke en fejl du skal rette — sig til hvis det er forkert.
          </div>
        )}

        {data.fields.map(f => (
          <div key={f.id} style={{ marginBottom:22 }}>
            <div style={{ fontSize:15, fontWeight:650, marginBottom:3 }}>{f.label}</div>
            {/* Definitionen står ved feltet, ikke i et dokument — glidende
                definitioner er den hyppigste grund til at tal inflaterer. */}
            {f.definition && <div style={{ fontSize:12.5, color:T.textSec, lineHeight:1.45, marginBottom:9 }}>{f.definition}</div>}
            <div style={{ position:"relative" }}>
              <input
                type="number" inputMode="decimal" step="any"
                value={values[f.id] ?? ""}
                onChange={e => setValues(v => ({ ...v, [f.id]: e.target.value }))}
                placeholder={f.last !== null ? String(f.last) : "0"}
                style={{ width:"100%", background:T.bg, border:"1.5px solid rgba(60,60,67,0.1)", borderRadius:14, padding:"16px 62px 16px 16px", fontSize:26, fontWeight:600, letterSpacing:"-0.02em", color:T.text, outline:"none", fontFamily:"inherit" }}
                onFocus={e => e.target.style.borderColor = T.blue}
                onBlur={e => e.target.style.borderColor = "rgba(60,60,67,0.1)"}
              />
              {f.unit && <span style={{ position:"absolute", right:16, top:"50%", transform:"translateY(-50%)", fontSize:14, fontWeight:600, color:T.textTert }}>{f.unit}</span>}
            </div>
            <div style={{ fontSize:12, color:T.textTert, marginTop:6 }}>
              {f.last !== null ? `Sidste uge: ${f.last}` : "Ingen tal sidste uge"}
            </div>
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
          Kan tallet ikke findes på under et minut, er spørgsmålet forkert — ikke dig.
        </div>
      </form>
    </div>
  );
}
