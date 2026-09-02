// KPI-rapportering — femte produkt i Ops-appen.
//
// Ugerapporten er 16 tal: lag A trækkes af systemerne, lag B er ét tal pr.
// ansvarlig indsendt på et personligt link inden fredag kl. 12. Der er bevidst
// ingen måltal i piloten — vi tester rytmen, ikke resultaterne — så "afvigelse"
// er her ændringen mod forrige periode, ikke afstand til et mål.
import { useEffect, useState } from "react";
import { T, Chip, Label } from "./theme.jsx";
import { api } from "./brand.js";

const TABS = [
  { key: "week",   label: "Uge" },
  { key: "month",  label: "Måned" },
  { key: "subs",   label: "Indsendelser" },
  { key: "defs",   label: "Definitioner" },
  { key: "owners", label: "Ansvarlige" },
  { key: "pilot",  label: "Pilot" },
];

// Uden måltal er en afvigelse en bevægelse. 15 % er startpunktet — justeres når
// 2026-baseline er trukket og rigtige mål kan sættes.
const DEVIATION = 0.15;

const nf = (v, unit) => {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (unit === "EUR")   return n.toLocaleString("da-DK", { maximumFractionDigits: 0 }) + " €";
  if (unit === "%")     return n.toLocaleString("da-DK", { maximumFractionDigits: 1 }) + " %";
  if (unit === "x")     return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (unit === "antal") return n.toLocaleString("da-DK", { maximumFractionDigits: Number.isInteger(n) ? 0 : 1 });
  return n.toLocaleString("da-DK", { maximumFractionDigits: 2 });
};

// Periodenavigation client-side — spejler serverens kpiShiftPeriod.
const isoMonday = (key) => {
  const [y, w] = key.split("-W").map(Number);
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const day = jan4.getUTCDay() || 7;
  return new Date(Date.UTC(y, 0, 4 - day + 1) + (w - 1) * 7 * 86400000);
};
const isoKey = (d) => {
  const t = new Date(d.getTime());
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const week = Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
};
const shiftPeriod = (period, delta) => {
  if (/^\d{4}-W\d{2}$/.test(period)) return isoKey(new Date(isoMonday(period).getTime() + delta * 7 * 86400000));
  const [y, m] = period.split("-").map(Number);
  const t = y * 12 + (m - 1) + delta;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
};

const card = { background: "#fff", borderRadius: 18, boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 0 0 0.5px rgba(0,0,0,0.04)" };
const page = { maxWidth: 1100, margin: "0 auto", padding: "24px 32px 80px" };

const Btn = ({ onClick, children, kind = "plain", small, style }) => (
  <button onClick={onClick} style={{
    padding: small ? "6px 12px" : "9px 16px", borderRadius: 10, cursor: "pointer",
    fontSize: small ? 12.5 : 13.5, fontWeight: 600, fontFamily: "inherit",
    border: kind === "plain" ? `1px solid ${T.border}` : "none",
    background: kind === "primary" ? T.blue : kind === "danger" ? T.red + "14" : "#fff",
    color: kind === "primary" ? "#fff" : kind === "danger" ? T.red : T.text, ...style,
  }}>{children}</button>
);

const Modal = ({ title, onClose, children, onSave, saveLabel = "Gem" }) => (
  <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.32)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 90 }}>
    <div onClick={e => e.stopPropagation()} style={{ ...card, borderRadius: 22, width: "100%", maxWidth: 520, maxHeight: "88vh", overflowY: "auto", padding: "26px 26px 22px" }}>
      <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 20 }}>{title}</div>
      {children}
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 22 }}>
        <Btn onClick={onClose}>Annullér</Btn>
        {onSave && <Btn kind="primary" onClick={onSave}>{saveLabel}</Btn>}
      </div>
    </div>
  </div>
);

const Inp = ({ label, value, onChange, placeholder, type = "text", area }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>{label}</div>
    {area
      ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3}
          style={{ width: "100%", background: T.bg, border: "1.5px solid rgba(60,60,67,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 14.5, color: T.text, outline: "none", fontFamily: "inherit", resize: "vertical" }} />
      : <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          style={{ width: "100%", background: T.bg, border: "1.5px solid rgba(60,60,67,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 14.5, color: T.text, outline: "none", fontFamily: "inherit" }} />}
  </div>
);

const Sel = ({ label, value, onChange, options }) => (
  <div style={{ marginBottom: 16 }}>
    <div style={{ fontSize: 13, fontWeight: 600, color: T.textSec, marginBottom: 6 }}>{label}</div>
    <select value={value ?? ""} onChange={e => onChange(e.target.value)}
      style={{ width: "100%", background: T.bg, border: "1.5px solid rgba(60,60,67,0.1)", borderRadius: 12, padding: "12px 14px", fontSize: 14.5, color: T.text, outline: "none", fontFamily: "inherit" }}>
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  </div>
);

export default function KpiTracker() {
  const [tab, setTab] = useState("week");
  const [period, setPeriod] = useState(null);          // aktiv uge
  const [monthPeriod, setMonthPeriod] = useState(null); // aktiv måned
  const [data, setData] = useState(null);
  const [monthData, setMonthData] = useState(null);
  const [pilot, setPilot] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async (p, setter) => {
    const r = await api("/api/kpi/data" + (p ? `?period=${p}` : ""));
    const d = await r.json();
    setter(d);
    return d;
  };

  useEffect(() => { load(period, setData).then(d => { if (!period) setPeriod(d.period); }); }, [period]);
  useEffect(() => {
    if (tab !== "month") return;
    const p = monthPeriod || new Date().toISOString().slice(0, 7);
    load(p, setMonthData).then(d => { if (!monthPeriod) setMonthPeriod(d.period); });
  }, [tab, monthPeriod]);
  useEffect(() => {
    if (tab !== "pilot" || !period) return;
    api(`/api/kpi/pilot?period=${period}&weeks=4`).then(r => r.json()).then(setPilot);
  }, [tab, period]);

  const refresh = async () => {
    await load(period, setData);
    if (monthPeriod) await load(monthPeriod, setMonthData);
  };

  if (!data) return <div style={page}><div style={{ color: T.textSec, padding: 40 }}>Henter …</div></div>;

  return (
    <div style={page}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: "-0.035em" }}>KPI-rapportering</div>
        <div style={{ fontSize: 13, color: T.textTert }}>Pilot · ingen måltal</div>
      </div>
      <div style={{ fontSize: 13.5, color: T.textSec, marginBottom: 20 }}>
        Lag A = maskine · Lag B = ét tal pr. ansvarlig, fredag inden 12
      </div>

      <div style={{ display: "flex", gap: 4, background: T.pillBg, borderRadius: 99, padding: 3, marginBottom: 22, width: "fit-content", flexWrap: "wrap" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={{ padding: "7px 15px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13,
                     fontWeight: tab === t.key ? 700 : 500, background: tab === t.key ? "#fff" : "transparent",
                     color: tab === t.key ? T.text : T.textSec, boxShadow: tab === t.key ? "0 1px 3px rgba(0,0,0,0.12)" : "none" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "week"  && <PeriodView d={data} cadence="weekly" onPeriod={setPeriod} onChanged={refresh} busy={busy} setBusy={setBusy} />}
      {tab === "month" && (monthData
        ? <PeriodView d={monthData} cadence="monthly" onPeriod={setMonthPeriod} onChanged={refresh} busy={busy} setBusy={setBusy} />
        : <div style={{ color: T.textSec }}>Henter …</div>)}
      {tab === "subs"   && <Submissions d={data} />}
      {tab === "defs"   && <Definitions d={data} onChanged={refresh} />}
      {tab === "owners" && <Owners d={data} onChanged={refresh} />}
      {tab === "pilot"  && <Pilot p={pilot} d={data} onChanged={() => api(`/api/kpi/pilot?period=${period}&weeks=4`).then(r => r.json()).then(setPilot)} />}
    </div>
  );
}

// ── Mandagsmødets skærm ───────────────────────────────────────────────────────
function PeriodView({ d, cadence, onPeriod, onChanged, busy, setBusy }) {
  const [open, setOpen] = useState(null);
  const [seen, setSeen] = useState(() => new Set());

  const metrics = d.metrics.filter(m => m.active && m.cadence === cadence);
  const entry = (mid, p = d.period) => d.entries.find(e => e.metric_id === mid && e.period === p);
  const prevPeriod = d.history[d.history.length - 2];

  const layerB = metrics.filter(m => m.layer === "B");
  const submitted = layerB.filter(m => entry(m.id)).length;

  // Et åbnet tal er et brugt tal. Uden det her kan port 3 ikke besvares.
  const openRow = (m) => {
    const next = open === m.id ? null : m.id;
    setOpen(next);
    if (next && !seen.has(m.id)) {
      setSeen(s => new Set(s).add(m.id));
      api("/api/kpi/views", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metric_id: m.id, period: d.period }) });
    }
  };

  return (
    <>
      <div style={{ ...card, padding: "18px 22px", marginBottom: 18, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Btn small onClick={() => onPeriod(shiftPeriod(d.period, -1))}>←</Btn>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em" }}>{d.periodLabel}</div>
            <div style={{ fontSize: 12.5, color: T.textSec }}>
              {d.deadline && `Deadline ${new Date(d.deadline).toLocaleString("da-DK", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
            </div>
          </div>
          <Btn small onClick={() => onPeriod(shiftPeriod(d.period, 1))}>→</Btn>
          <Btn small onClick={() => onPeriod(null)}>Nu</Btn>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          <Stat label="Lag B indsendt" value={`${submitted} / ${layerB.length}`} color={submitted === layerB.length ? T.green : T.orange} />
          <Stat label="Tal i alt" value={metrics.length} />
        </div>
      </div>

      {["A", "B"].map(layer => {
        const rows = metrics.filter(m => m.layer === layer);
        if (!rows.length) return null;
        return (
          <div key={layer} style={{ marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 9, paddingLeft: 4 }}>
              <Label>{layer === "A" ? "Lag A — maskine" : "Lag B — indtastet"}</Label>
              <span style={{ fontSize: 11.5, color: T.textTert }}>
                {layer === "A" ? "trækkes af systemerne" : "ét tal pr. ansvarlig · manglende markeres, ikke som nul"}
              </span>
            </div>
            <div style={{ ...card, overflow: "hidden" }}>
              {rows.map((m, i) => (
                <Row key={m.id} m={m} d={d} entry={entry(m.id)} prev={entry(m.id, prevPeriod)}
                     first={i === 0} open={open === m.id} onToggle={() => openRow(m)}
                     onChanged={onChanged} busy={busy} setBusy={setBusy} />
              ))}
            </div>
          </div>
        );
      })}

      {d.decisions.filter(x => x.period === d.period).length > 0 && (
        <div style={{ ...card, padding: "18px 22px" }}>
          <Label>Beslutninger truffet på {d.periodLabel.toLowerCase()}</Label>
          {d.decisions.filter(x => x.period === d.period).map(x => (
            <div key={x.id} style={{ fontSize: 14, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
              {x.body}
              <span style={{ color: T.textTert, fontSize: 12, marginLeft: 8 }}>
                {(d.metrics.find(m => m.id === x.metric_id) || {}).label || "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

const Stat = ({ label, value, color }) => (
  <div style={{ textAlign: "right" }}>
    <div style={{ fontSize: 11, fontWeight: 700, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
    <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em", color: color || T.text }}>{value}</div>
  </div>
);

function Row({ m, d, entry, prev, first, open, onToggle, onChanged, busy, setBusy }) {
  const [edit, setEdit] = useState("");
  const [decision, setDecision] = useState("");
  const owner = d.owners.find(o => o.id === m.owner_id);

  const val = entry ? Number(entry.value) : null;
  const prevVal = prev ? Number(prev.value) : null;
  const delta = val !== null && prevVal !== null && prevVal !== 0 ? (val - prevVal) / Math.abs(prevVal) : null;
  const deviating = delta !== null && Math.abs(delta) >= DEVIATION;
  // Op er ikke godt for stock-out og defekt-tickets. En rød pil der peger
  // forkert er værre end ingen farve — derfor bærer hvert tal sin retning.
  const dir = m.direction || "up";
  const good = dir === "neutral" ? null : (delta > 0) === (dir === "up");

  const save = async (value) => {
    setBusy(true);
    await api("/api/kpi/entries", { method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metric_id: m.id, period: d.period, value, submitted_by: "Tommy" }) });
    await onChanged();
    setBusy(false);
    setEdit("");
  };

  const addDecision = async () => {
    if (!decision.trim()) return;
    await api("/api/kpi/decisions", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metric_id: m.id, period: d.period, body: decision }) });
    setDecision("");
    await onChanged();
  };

  return (
    <div style={{ borderTop: first ? "none" : `1px solid ${T.border}` }}>
      <div onClick={onToggle} style={{ display: "flex", alignItems: "center", gap: 14, padding: "13px 20px", cursor: "pointer" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600, letterSpacing: "-0.01em" }}>{m.label}</div>
          <div style={{ fontSize: 11.5, color: T.textTert, marginTop: 2 }}>
            {m.layer === "A" ? m.source : (owner ? owner.name : "ingen ansvarlig")}
            {entry && !entry.on_time && <span style={{ color: T.orange, marginLeft: 8 }}>for sent</span>}
          </div>
        </div>

        {/* Kun afvigelser får farve. Tal der ligger stille skal ikke tage plads. */}
        {delta !== null && (
          <span style={{ fontSize: 12.5, fontWeight: 700, minWidth: 62, textAlign: "right",
                         color: !deviating || good === null ? T.textTert : good ? T.green : T.red }}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta * 100).toLocaleString("da-DK", { maximumFractionDigits: 0 })} %
          </span>
        )}

        <div style={{ minWidth: 110, textAlign: "right", fontSize: 16, fontWeight: 700, letterSpacing: "-0.02em",
                      color: val === null ? T.orange : deviating ? T.text : T.textSec }}>
          {val === null ? "— manglende" : nf(val, m.unit)}
        </div>
        <span style={{ color: T.textTert, fontSize: 12, width: 12 }}>{open ? "▾" : "▸"}</span>
      </div>

      {open && (
        <div style={{ padding: "0 20px 18px 20px", background: "rgba(118,118,128,0.04)" }}>
          {m.definition && <div style={{ fontSize: 13, color: T.textSec, lineHeight: 1.5, padding: "12px 0" }}>{m.definition}</div>}

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", margin: "4px 0 14px" }}>
            {d.history.map(p => {
              const e = d.entries.find(x => x.metric_id === m.id && x.period === p);
              return (
                <div key={p} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 9, padding: "6px 10px", minWidth: 64 }}>
                  <div style={{ fontSize: 10, color: T.textTert, fontWeight: 700 }}>{p.replace(/^\d{4}-/, "")}</div>
                  <div style={{ fontSize: 13, fontWeight: 650, color: e ? T.text : T.textTert }}>{e ? nf(Number(e.value), m.unit) : "—"}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input value={edit} onChange={e => setEdit(e.target.value)} placeholder={val === null ? "Indtast tal" : "Ret tal"}
              type="number" step="any"
              style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 14, width: 130, outline: "none", fontFamily: "inherit" }} />
            <Btn small kind="primary" onClick={() => save(edit)} style={{ opacity: busy ? 0.6 : 1 }}>Gem</Btn>
            {val !== null && <Btn small kind="danger" onClick={() => save(null)}>Ryd</Btn>}
            <div style={{ flex: 1 }} />
            <Chip color={m.layer === "A" ? T.blue : T.purple}>{m.layer === "A" ? "Lag A" : "Lag B"}</Chip>
            {m.func && <Chip color={T.textSec} bg={T.pillBg}>{m.func}</Chip>}
          </div>

          {/* Port 1: kan vi pege på beslutninger et tal har ændret? */}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input value={decision} onChange={e => setDecision(e.target.value)}
              placeholder="Dette tal ændrede noget — hvad besluttede vi?"
              style={{ flex: 1, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "9px 12px", fontSize: 13.5, outline: "none", fontFamily: "inherit" }} />
            <Btn small onClick={addDecision}>Log beslutning</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Disciplin-gitteret: port 2 ────────────────────────────────────────────────
function Submissions({ d }) {
  const layerB = d.metrics.filter(m => m.active && m.layer === "B" && m.cadence === "weekly");
  const byOwner = {};
  layerB.forEach(m => { (byOwner[m.owner_id] = byOwner[m.owner_id] || []).push(m); });

  return (
    <div style={{ ...card, padding: "20px 22px", overflowX: "auto" }}>
      <Label>Indsendelser pr. ansvarlig</Label>
      <div style={{ fontSize: 13, color: T.textSec, marginBottom: 16 }}>
        ✓ til tiden · ! for sent · — manglende. Der sendes ingen automatiske rykkere; det er selve målingen.
      </div>
      <table style={{ borderCollapse: "collapse", minWidth: 620, width: "100%" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", fontSize: 11, color: T.textTert, textTransform: "uppercase", letterSpacing: "0.07em", padding: "8px 10px" }}>Ansvarlig</th>
            {d.history.map(p => (
              <th key={p} style={{ fontSize: 11, color: T.textTert, fontWeight: 700, padding: "8px 6px" }}>{p.replace(/^\d{4}-/, "")}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Object.entries(byOwner).map(([oid, ms]) => {
            const owner = d.owners.find(o => String(o.id) === String(oid));
            return (
              <tr key={oid} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: "11px 10px", fontSize: 14, fontWeight: 600 }}>
                  {owner ? owner.name : "Ingen ansvarlig"}
                  <div style={{ fontSize: 11.5, color: T.textTert, fontWeight: 400 }}>{ms.map(m => m.label).join(" · ")}</div>
                </td>
                {d.history.map(p => {
                  const es = ms.map(m => d.entries.find(e => e.metric_id === m.id && e.period === p));
                  const all = es.every(Boolean);
                  const onTime = all && es.every(e => e.on_time);
                  return (
                    <td key={p} style={{ textAlign: "center", fontSize: 15, fontWeight: 700,
                                         color: !all ? T.textTert : onTime ? T.green : T.orange }}>
                      {!all ? "—" : onTime ? "✓" : "!"}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Registret ─────────────────────────────────────────────────────────────────
function Definitions({ d, onChanged }) {
  const [editing, setEditing] = useState(null);
  const blank = { label: "", unit: "antal", definition: "", layer: "B", cadence: "weekly", direction: "up", func: "", source: "", owner_id: "", active: true, sort_order: 99 };

  const save = async () => {
    const body = { ...editing, owner_id: editing.owner_id || null };
    const url = editing.id ? `/api/kpi/metrics/${editing.id}` : "/api/kpi/metrics";
    await api(url, { method: editing.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setEditing(null);
    onChanged();
  };

  const remove = async () => {
    if (!confirm("Slet tallet og hele dets historik?")) return;
    await api(`/api/kpi/metrics/${editing.id}`, { method: "DELETE" });
    setEditing(null);
    onChanged();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, color: T.textSec, maxWidth: 620 }}>
          Definitionen bor her og vises under indtastningsfeltet. Glidende definitioner er den hyppigste
          grund til at selvrapporterede tal inflaterer — så ret den her, ikke i et dokument.
        </div>
        <Btn kind="primary" onClick={() => setEditing(blank)}>+ Nyt tal</Btn>
      </div>

      {["weekly", "monthly", "quarterly"].map(c => {
        const rows = d.metrics.filter(m => m.cadence === c);
        if (!rows.length) return null;
        return (
          <div key={c} style={{ marginBottom: 20 }}>
            <Label>{c === "weekly" ? "Ugentligt" : c === "monthly" ? "Månedligt" : "Kvartalsvis"}</Label>
            <div style={{ ...card, overflow: "hidden" }}>
              {rows.map((m, i) => {
                const owner = d.owners.find(o => o.id === m.owner_id);
                return (
                  <div key={m.id} onClick={() => setEditing({ ...m, owner_id: m.owner_id || "" })}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: "pointer",
                             borderTop: i === 0 ? "none" : `1px solid ${T.border}`, opacity: m.active ? 1 : 0.45 }}>
                    <Chip color={m.layer === "A" ? T.blue : T.purple}>{m.layer}</Chip>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14.5, fontWeight: 600 }}>{m.label} {!m.active && <span style={{ color: T.textTert, fontWeight: 400 }}>· inaktiv</span>}</div>
                      <div style={{ fontSize: 12, color: T.textTert, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.definition || "ingen definition"}</div>
                    </div>
                    <span style={{ fontSize: 12, color: T.textSec, minWidth: 120, textAlign: "right" }}>{m.layer === "A" ? m.source : owner ? owner.name : "—"}</span>
                    <span style={{ fontSize: 12, color: T.textTert, width: 44, textAlign: "right" }}>{m.unit}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {editing && (
        <Modal title={editing.id ? "Ret tal" : "Nyt tal"} onClose={() => setEditing(null)} onSave={save}>
          <Inp label="Navn" value={editing.label} onChange={v => setEditing({ ...editing, label: v })} />
          <Inp label="Definition — vises under feltet" area value={editing.definition} onChange={v => setEditing({ ...editing, definition: v })} placeholder="fx: Feed + reels. Stories tæller ikke med." />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Sel label="Lag" value={editing.layer} onChange={v => setEditing({ ...editing, layer: v })}
                 options={[{ value: "A", label: "A — maskine" }, { value: "B", label: "B — indtastet" }]} />
            <Sel label="Kadence" value={editing.cadence} onChange={v => setEditing({ ...editing, cadence: v })}
                 options={[{ value: "weekly", label: "Ugentligt" }, { value: "monthly", label: "Månedligt" }, { value: "quarterly", label: "Kvartalsvis" }]} />
            <Sel label="Retning" value={editing.direction || "up"} onChange={v => setEditing({ ...editing, direction: v })}
                 options={[{ value: "up", label: "Op er godt" }, { value: "down", label: "Ned er godt" }, { value: "neutral", label: "Ingen retning" }]} />
            <Sel label="Enhed" value={editing.unit} onChange={v => setEditing({ ...editing, unit: v })}
                 options={[{ value: "antal", label: "antal" }, { value: "%", label: "%" }, { value: "EUR", label: "EUR" }, { value: "x", label: "x (ratio)" }, { value: "", label: "ingen" }]} />
            <Sel label="Ansvarlig" value={editing.owner_id} onChange={v => setEditing({ ...editing, owner_id: v })}
                 options={[{ value: "", label: "— ingen —" }, ...d.owners.map(o => ({ value: String(o.id), label: o.name }))]} />
            <Inp label="Funktion" value={editing.func || ""} onChange={v => setEditing({ ...editing, func: v })} />
            <Inp label="Kilde" value={editing.source || ""} onChange={v => setEditing({ ...editing, source: v })} />
          </div>
          <Sel label="Status" value={editing.active ? "1" : "0"} onChange={v => setEditing({ ...editing, active: v === "1" })}
               options={[{ value: "1", label: "Aktiv — med på rapporten" }, { value: "0", label: "Inaktiv — i registret, ikke på rapporten" }]} />
          {editing.id && <Btn kind="danger" small onClick={remove}>Slet tallet</Btn>}
        </Modal>
      )}
    </>
  );
}

// ── Ansvarlige og deres links ─────────────────────────────────────────────────
function Owners({ d, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [copied, setCopied] = useState(null);
  const base = typeof window !== "undefined" ? window.location.origin : "";

  const save = async () => {
    const url = editing.id ? `/api/kpi/owners/${editing.id}` : "/api/kpi/owners";
    await api(url, { method: editing.id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) });
    setEditing(null);
    onChanged();
  };

  const copy = (o) => {
    navigator.clipboard?.writeText(`${base}/r/${o.token}`);
    setCopied(o.id);
    setTimeout(() => setCopied(null), 1600);
  };

  const rotate = async (o) => {
    if (!confirm(`Nyt link til ${o.name}? Det gamle holder op med at virke med det samme.`)) return;
    await api(`/api/kpi/owners/${o.id}/rotate`, { method: "POST" });
    onChanged();
  };

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13.5, color: T.textSec, maxWidth: 620 }}>
          Hver ansvarlig har ét fast link. Ingen adgangskode — linket er adgangen, så send det som DM
          og rotér det hvis nogen forlader rollen.
        </div>
        <Btn kind="primary" onClick={() => setEditing({ name: "", func: "", slack_handle: "", active: true, sort_order: 99 })}>+ Ansvarlig</Btn>
      </div>

      <div style={{ ...card, overflow: "hidden" }}>
        {d.owners.map((o, i) => {
          const mine = d.metrics.filter(m => m.owner_id === o.id && m.active);
          return (
            <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 20px",
                                     borderTop: i === 0 ? "none" : `1px solid ${T.border}`, opacity: o.active ? 1 : 0.5 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 650 }}>
                  {o.name} {!o.active && <span style={{ fontSize: 12, color: T.textTert, fontWeight: 400 }}>· inaktiv</span>}
                </div>
                <div style={{ fontSize: 12, color: T.textTert, marginTop: 2 }}>
                  {o.slack_handle ? o.slack_handle + " · " : ""}{mine.length ? mine.map(m => m.label).join(" · ") : "ingen tal tilknyttet"}
                </div>
              </div>
              <code style={{ fontSize: 11.5, color: T.textSec, background: T.pillBg, padding: "5px 9px", borderRadius: 7 }}>/r/{o.token}</code>
              <Btn small onClick={() => copy(o)}>{copied === o.id ? "Kopieret" : "Kopiér link"}</Btn>
              <Btn small onClick={() => rotate(o)}>Nyt link</Btn>
              <Btn small onClick={() => setEditing({ ...o })}>Ret</Btn>
            </div>
          );
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? "Ret ansvarlig" : "Ny ansvarlig"} onClose={() => setEditing(null)} onSave={save}>
          <Inp label="Navn" value={editing.name} onChange={v => setEditing({ ...editing, name: v })} placeholder="fx Sofie" />
          <Inp label="Funktion" value={editing.func || ""} onChange={v => setEditing({ ...editing, func: v })} placeholder="fx Content / social" />
          <Inp label="Slack" value={editing.slack_handle || ""} onChange={v => setEditing({ ...editing, slack_handle: v })} placeholder="@sofie" />
          <Sel label="Status" value={editing.active ? "1" : "0"} onChange={v => setEditing({ ...editing, active: v === "1" })}
               options={[{ value: "1", label: "Aktiv — får påmindelse fredag" }, { value: "0", label: "Inaktiv" }]} />
        </Modal>
      )}
    </>
  );
}

// ── Evalueringsmødet ──────────────────────────────────────────────────────────
function Pilot({ p, d, onChanged }) {
  if (!p) return <div style={{ color: T.textSec }}>Henter …</div>;

  const Gate = ({ n, q, pass, value, need, children }) => (
    <div style={{ ...card, padding: "20px 22px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{ width: 26, height: 26, borderRadius: "50%", background: pass ? T.green : T.orange, color: "#fff",
                      fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{n}</div>
        <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: "-0.02em", flex: 1 }}>{q}</div>
        {value !== undefined && (
          <div style={{ fontSize: 19, fontWeight: 700, color: pass ? T.green : T.orange }}>
            {value}{need !== undefined && <span style={{ fontSize: 13, color: T.textTert, fontWeight: 600 }}> / {need}</span>}
          </div>
        )}
      </div>
      <div style={{ fontSize: 13.5, color: T.textSec, lineHeight: 1.55 }}>{children}</div>
    </div>
  );

  return (
    <>
      <div style={{ fontSize: 13.5, color: T.textSec, marginBottom: 16, maxWidth: 700 }}>
        Fire uger, tre spørgsmål. Svarene kommer fra det systemet har registreret undervejs — ikke fra
        hukommelsen i mødet. Ja til alle tre → baseline trækkes og måltal låses i oktober.
      </div>

      <Gate n="1" q="Blev tallene brugt?" pass={p.gates.used.pass} value={p.gates.used.value} need={p.gates.used.need}>
        Beslutninger logget på et tal i de sidste {p.periods.length} uger. Kan vi ikke pege på mindst tre,
        er det rapportering — ikke styring.
        {p.decisions.length > 0 && (
          <div style={{ marginTop: 12 }}>
            {p.decisions.map(x => (
              <div key={x.id} style={{ fontSize: 13.5, color: T.text, padding: "7px 0", borderTop: `1px solid ${T.border}` }}>
                {x.body}
                <span style={{ color: T.textTert, marginLeft: 8, fontSize: 12 }}>
                  {(d.metrics.find(m => m.id === x.metric_id) || {}).label || "—"} · {x.period}
                </span>
              </div>
            ))}
          </div>
        )}
      </Gate>

      <Gate n="2" q="Holdt disciplinen?" pass={p.gates.discipline.pass} value={p.gates.discipline.value} need={p.gates.discipline.need}>
        Uger hvor alle lag B-tal kom ind inden fredag kl. 12. Under tre af fire er kadencen for høj
        eller spørgsmålene forkerte — ikke personerne.
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {p.discipline.map(w => (
            <div key={w.period} style={{ background: "#fff", border: `1px solid ${T.border}`, borderRadius: 10, padding: "8px 12px" }}>
              <div style={{ fontSize: 11, color: T.textTert, fontWeight: 700 }}>{w.period.replace(/^\d{4}-/, "")}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: w.clean ? T.green : T.orange }}>{w.onTime} / {w.expected}</div>
            </div>
          ))}
        </div>
      </Gate>

      <Gate n="3" q="Hvad ryger ud?" pass={p.unopened.length === 0} value={p.unopened.length}>
        Tal ingen har åbnet på mandagsmødet i perioden. De fjernes før måltal sættes — et ark folk skimmer, dør.
        {p.unopened.length > 0 && (
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {p.unopened.map(m => (
              <span key={m.id} style={{ fontSize: 12.5, background: T.orange + "14", color: T.orange, borderRadius: 8, padding: "5px 10px", fontWeight: 600 }}>
                {m.label}
              </span>
            ))}
          </div>
        )}
      </Gate>
    </>
  );
}
