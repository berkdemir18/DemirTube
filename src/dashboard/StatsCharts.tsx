// DemirTube · istatistik sayfası grafikleri
//
// Hepsi yalnızca oturum/video kayıtlarından türetilir; hesap burada yapılır ki
// StatisticsPage sadece yerleşimle ilgilensin. Animasyonlar
// prefers-reduced-motion açıkken kapanır.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { WatchSession } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import { chartAxis, chartGrid, chartSeries } from "./chart-theme";

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

const tooltipStyle: CSSProperties = {
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--text)",
  fontSize: 12,
  boxShadow: "0 12px 30px rgba(0,0,0,.35)",
};

// Recharts satır rengini serinin dolgusundan alır; dolgu gradyan (url(#…))
// olunca metin koyu kalıp koyu zeminde okunmuyordu. Renk sabitlenir.
const tooltipProps = {
  contentStyle: tooltipStyle,
  itemStyle: { color: "var(--text)" },
  labelStyle: { color: "var(--muted)", marginBottom: 4 },
};

/** Sayıyı sıfırdan hedef değere yumuşakça sayar. */
export function CountUp({ value, format, duration = 1100 }: { value: number; format: (value: number) => string; duration?: number }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? value : 0));
  const from = useRef(0);
  useEffect(() => {
    if (reducedMotion()) { setShown(value); return; }
    const start = performance.now();
    const origin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = origin + (value - origin) * eased;
      setShown(next);
      from.current = next;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);
  return <>{format(shown)}</>;
}

const dayKey = (date: Date) => date.toLocaleDateString("en-CA");

export function ActivityTrend({ sessions }: { sessions: WatchSession[] }) {
  const data = useMemo(() => {
    if (!sessions.length) return [];
    const totals = new Map<string, number>();
    let last = 0;
    for (const session of sessions) {
      const time = new Date(session.startedAt).getTime();
      last = Math.max(last, time);
      const key = dayKey(new Date(time));
      totals.set(key, (totals.get(key) ?? 0) + session.watchSeconds);
    }
    const end = new Date(last);
    const rows = Array.from({ length: 30 }, (_, index) => {
      const day = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (29 - index));
      return { key: dayKey(day), label: day.toLocaleDateString("tr-TR", { day: "numeric", month: "short" }), minutes: round((totals.get(dayKey(day)) ?? 0) / 60) };
    });
    return rows.map((row, index) => {
      const window = rows.slice(Math.max(0, index - 6), index + 1);
      return { ...row, average: round(window.reduce((sum, item) => sum + item.minutes, 0) / window.length) };
    });
  }, [sessions]);
  if (!data.length) return null;
  const total = data.reduce((sum, row) => sum + row.minutes, 0);
  const firstHalf = data.slice(0, 15).reduce((sum, row) => sum + row.minutes, 0);
  const secondHalf = total - firstHalf;
  const change = firstHalf ? round((secondHalf - firstHalf) / firstHalf * 100) : 0;
  const best = data.toSorted((a, b) => b.minutes - a.minutes)[0];
  return (
    <>
      <div className="trend-chips">
        <span><small>30 günde toplam</small><b>{formatDuration(total * 60)}</b></span>
        <span><small>Günlük ortalama</small><b>{formatDuration(total / 30 * 60)}</b></span>
        <span className={change > 0 ? "up" : change < 0 ? "down" : ""}><small>Son 15 gün, önceki 15 güne göre</small><b>{change > 0 ? "▲ %" + Math.abs(change) + " fazla" : change < 0 ? "▼ %" + Math.abs(change) + " az" : "• aynı"}</b></span>
        <span><small>En yoğun gün</small><b>{best.label}</b></span>
      </div>
      <div className="chart-legend">
        <span><i className="lg-bar" /> Sütun: o gün kaç dakika izledin</span>
        <span><i className="lg-line" /> Çizgi: son 7 günün günlük ortalaması (gidişat)</span>
        <span><i className="lg-zero" /> Sütun yoksa o gün kayıt yok</span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <defs>
            <linearGradient id="trend-bar" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartSeries[0]} stopOpacity={0.95} />
              <stop offset="100%" stopColor={chartSeries[0]} stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={chartGrid} />
          <XAxis dataKey="label" tick={{ fill: chartAxis, fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
          <YAxis tick={{ fill: chartAxis, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value} dk`} />
          <Tooltip {...tooltipProps} cursor={{ fill: "rgba(255,255,255,.04)" }} formatter={(value, name) => [formatDuration(Number(value) * 60), name]} />
          <Bar dataKey="minutes" name="O gün izleme" radius={[5, 5, 1, 1]} animationDuration={1100}>
            {data.map((row) => <Cell key={row.key} fill={row.key === best.key ? chartSeries[1] : "url(#trend-bar)"} />)}
          </Bar>
          <Line type="monotone" dataKey="average" name="7 gün ortalaması" stroke="#F4C27A" strokeWidth={2.5} dot={false} animationDuration={1600} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

export function peakHourLabel(sessions: WatchSession[]) {
  const hours = Array<number>(24).fill(0);
  sessions.forEach((session) => { hours[new Date(session.startedAt).getHours()] += session.watchSeconds; });
  const peak = hours.indexOf(Math.max(...hours));
  return hours[peak] ? `${String(peak).padStart(2, "0")}:00–${String(peak).padStart(2, "0")}:59` : "—";
}

export function HourClock({ sessions }: { sessions: WatchSession[] }) {
  const data = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ label: String(hour).padStart(2, "0"), minutes: 0 }));
    sessions.forEach((session) => { hours[new Date(session.startedAt).getHours()].minutes += session.watchSeconds / 60; });
    return hours.map((row) => ({ ...row, minutes: round(row.minutes) }));
  }, [sessions]);
  const peak = Math.max(...data.map((row) => row.minutes));
  return (
    <ResponsiveContainer width="100%" height={250}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="hour-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={chartSeries[1]} stopOpacity={0.95} />
            <stop offset="100%" stopColor={chartSeries[1]} stopOpacity={0.25} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" vertical={false} stroke={chartGrid} />
        <XAxis dataKey="label" tick={{ fill: chartAxis, fontSize: 10 }} tickLine={false} axisLine={false} interval={2} />
        <YAxis tick={{ fill: chartAxis, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={(value) => `${value} dk`} />
        <Tooltip {...tooltipProps} cursor={{ fill: "rgba(255,255,255,.04)" }} labelFormatter={(label) => `${label}:00 – ${label}:59`} formatter={(value) => [formatDuration(Number(value) * 60), "Aktif izleme"]} />
        <Bar dataKey="minutes" radius={[6, 6, 2, 2]} animationDuration={1100}>
          {data.map((row) => <Cell key={row.label} fill={row.minutes === peak && peak > 0 ? chartSeries[0] : "url(#hour-bar)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

const dayNames = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"];
const slots = [
  { label: "Gece", range: "00–06", from: 0, to: 6 },
  { label: "Sabah", range: "06–10", from: 6, to: 10 },
  { label: "Öğle", range: "10–14", from: 10, to: 14 },
  { label: "Öğleden sonra", range: "14–18", from: 14, to: 18 },
  { label: "Akşam", range: "18–21", from: 18, to: 21 },
  { label: "Gece geç", range: "21–24", from: 21, to: 24 },
];

const shortDuration = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  if (!minutes) return "";
  return minutes >= 60 ? `${Math.floor(minutes / 60)} sa${minutes % 60 ? ` ${minutes % 60}` : ""}` : `${minutes} dk`;
};

/**
 * Hangi gün, günün hangi bölümünde izlendiğini gösterir. Değer, o gün-dilimde
 * kaydedilen TOPLAM süre değil HAFTA BAŞINA ORTALAMA süredir: kaç hafta veri
 * varsa ona bölünür, böylece tek bir uzun pazartesi tüm tabloyu çarpıtmaz.
 */
export function WeekHeatmap({ sessions }: { sessions: WatchSession[] }) {
  const { grid, max, weeks, rowTotals, colTotals, peak } = useMemo(() => {
    const cells = Array.from({ length: 7 }, () => Array<number>(slots.length).fill(0));
    let first = Infinity;
    let last = 0;
    sessions.forEach((session) => {
      const date = new Date(session.startedAt);
      first = Math.min(first, date.getTime());
      last = Math.max(last, date.getTime());
      const hour = date.getHours();
      const slot = slots.findIndex((item) => hour >= item.from && hour < item.to);
      cells[(date.getDay() + 6) % 7][slot] += session.watchSeconds;
    });
    const weekCount = sessions.length ? Math.max(1, Math.ceil((last - first + 1) / (7 * 86_400_000))) : 1;
    const averaged = cells.map((row) => row.map((seconds) => seconds / weekCount));
    let best = { day: 0, slot: 0, seconds: 0 };
    averaged.forEach((row, day) => row.forEach((seconds, slot) => { if (seconds > best.seconds) best = { day, slot, seconds }; }));
    return {
      grid: averaged,
      max: Math.max(1, ...averaged.flat()),
      weeks: weekCount,
      rowTotals: averaged.map((row) => row.reduce((sum, value) => sum + value, 0)),
      colTotals: slots.map((_, slot) => averaged.reduce((sum, row) => sum + row[slot], 0)),
      peak: best,
    };
  }, [sessions]);
  const maxRow = Math.max(1, ...rowTotals);
  const busiestSlot = colTotals.indexOf(Math.max(...colTotals));
  return (
    <>
      <p className="wh-summary">
        Son <b>{weeks} haftanın</b> ortalaması. En çok <b>{dayNames[peak.day]} {slots[peak.slot].label.toLowerCase()}</b> ({slots[peak.slot].range}) izliyorsun,
        haftada ortalama <b>{formatDuration(peak.seconds)}</b>. Genel olarak en yoğun dilimin <b>{slots[busiestSlot].label.toLowerCase()}</b>.
      </p>
      <div className="week-heatmap" role="table" aria-label="Gün ve gün dilimine göre haftalık ortalama izleme">
        <div className="wh-row wh-head" role="row">
          <span />
          {slots.map((slot) => <small key={slot.label}><b>{slot.label}</b>{slot.range}</small>)}
          <small><b>Gün toplamı</b>haftalık ort.</small>
        </div>
        {grid.map((row, day) => (
          <div className="wh-row" role="row" key={dayNames[day]}>
            <span>{dayNames[day]}</span>
            {row.map((seconds, slot) => {
              const level = seconds / max;
              return (
                <i
                  key={slot}
                  role="cell"
                  title={`${dayNames[day]} ${slots[slot].range} · haftada ort. ${formatDuration(seconds)}`}
                  style={{ "--level": level ? 0.15 + level * 0.85 : 0, "--d": `${(day * 6 + slot) * 18}ms` } as CSSProperties}
                  className={`${level ? "" : "empty"} ${level > 0.55 ? "hot" : ""}`}
                >
                  {shortDuration(seconds) || "—"}
                </i>
              );
            })}
            <em><i style={{ width: `${(rowTotals[day] / maxRow) * 100}%` }} /><b>{shortDuration(rowTotals[day]) || "—"}</b></em>
          </div>
        ))}
      </div>
      <div className="wh-scale"><small>Az izleme</small>{[0.15, 0.35, 0.55, 0.75, 1].map((level) => <i key={level} style={{ "--level": level } as CSSProperties} />)}<small>Çok izleme</small></div>
    </>
  );
}

export function FormatDonut({ formats, total }: { formats: Array<{ label: string; seconds: number; count: number }>; total: number }) {
  const [active, setActive] = useState<number>();
  const data = formats.slice(0, 6).filter((format) => format.seconds > 0);
  if (!data.length) return null;
  const focus = active === undefined ? data[0] : data[active];
  return (
    <div className="format-donut">
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            dataKey="seconds"
            nameKey="label"
            innerRadius={62}
            outerRadius={92}
            paddingAngle={3}
            cornerRadius={6}
            stroke="none"
            animationDuration={1200}
            onMouseEnter={(_, index) => setActive(index)}
            onMouseLeave={() => setActive(undefined)}
          >
            {data.map((format, index) => (
              <Cell key={format.label} fill={chartSeries[index % chartSeries.length]} opacity={active === undefined || active === index ? 1 : 0.35} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="format-donut-center">
        <b>%{total ? round(focus.seconds / total * 100) : 0}</b>
        <small>{focus.label}</small>
      </div>
    </div>
  );
}

export function CompletionRings({ rows }: { rows: Array<[string, number]> }) {
  return (
    <div className="completion-rings">
      {rows.map(([label, value], index) => {
        const safe = Math.max(0, Math.min(100, value));
        return (
          <div key={label} style={{ "--i": index } as CSSProperties}>
            <svg viewBox="0 0 80 80">
              <circle className="cr-track" cx="40" cy="40" r="32" />
              <circle
                className="cr-value"
                cx="40" cy="40" r="32"
                pathLength={100}
                style={{ "--value": safe, stroke: chartSeries[index % chartSeries.length] } as CSSProperties}
                transform="rotate(-90 40 40)"
              />
            </svg>
            <b><CountUp value={safe} format={(v) => `%${Math.round(v)}`} /></b>
            <span>{label}</span>
          </div>
        );
      })}
    </div>
  );
}
