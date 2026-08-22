// DemirTube Aurora UI v2 · unified dashboard visual system
import { CalendarDays, ChevronLeft, ChevronRight, Undo2 } from "lucide-react";
import type { AnalyticsPeriod } from "../analytics/period";

type DateNavProps = {
  period: AnalyticsPeriod;
  anchor: Date;
  onChange: (next: Date) => void;
};

const pad = (value: number) => String(value).padStart(2, "0");
const dateInputValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const monthInputValue = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function sameMonth(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function isCurrentPeriod(period: AnalyticsPeriod, anchor: Date, today: Date) {
  if (period === "day") return sameDay(anchor, today);
  if (period === "month") return sameMonth(anchor, today);
  // Haftalık: anchor son 6 gün içindeyse mevcut haftadır.
  const diff = (today.getTime() - anchor.getTime()) / 86_400_000;
  return diff < 7 && diff >= 0;
}

/** Gün / hafta / ay bazında istenen döneme gitmeyi sağlayan gezinme çubuğu. */
export function DateNav({ period, anchor, onChange }: DateNavProps) {
  if (period === "all") return null;
  const today = new Date();
  const atCurrent = isCurrentPeriod(period, anchor, today);

  const shift = (direction: 1 | -1) => {
    const next = new Date(anchor);
    if (period === "day") next.setDate(next.getDate() + direction);
    else if (period === "week") next.setDate(next.getDate() + direction * 7);
    else next.setMonth(next.getMonth() + direction);
    onChange(next);
  };

  const weekStart = new Date(anchor);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekLabel = `${weekStart.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} – ${anchor.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}`;
  const selectedLabel = period === "day"
    ? anchor.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" })
    : period === "month"
      ? anchor.toLocaleDateString("tr-TR", { month: "long", year: "numeric" })
      : weekLabel;
  const periodLabel = period === "day" ? "Seçili gün" : period === "month" ? "Seçili ay" : "Seçili hafta";

  return (
    <div className="date-nav" aria-label="Dönem gezinmesi">
      <button className="date-nav-arrow" type="button" aria-label="Önceki dönem" onClick={() => shift(-1)}><ChevronLeft size={17} /></button>

      {period === "day" || period === "month" ? (
        <label className="date-nav-picker" title={`${periodLabel} seç`}>
          <span className="date-nav-display">
            <CalendarDays size={16} />
            <span><small>{periodLabel}</small><strong>{selectedLabel}</strong></span>
          </span>
          <input
            aria-label={periodLabel}
            type={period === "day" ? "date" : "month"}
            value={period === "day" ? dateInputValue(anchor) : monthInputValue(anchor)}
            max={period === "day" ? dateInputValue(today) : monthInputValue(today)}
            onChange={(event) => {
              if (!event.target.value) return;
              onChange(new Date(period === "day" ? `${event.target.value}T12:00:00` : `${event.target.value}-15T12:00:00`));
            }}
          />
        </label>
      ) : (
        <span className="date-nav-display date-nav-week">
          <CalendarDays size={16} />
          <span><small>{periodLabel}</small><strong>{selectedLabel}</strong></span>
        </span>
      )}

      <button className="date-nav-arrow" type="button" aria-label="Sonraki dönem" disabled={atCurrent} onClick={() => shift(1)}><ChevronRight size={17} /></button>
      {!atCurrent ? (
        <button type="button" className="date-nav-today" onClick={() => onChange(new Date())}>
          <Undo2 size={13} /> {period === "day" ? "Bugün" : period === "month" ? "Bu ay" : "Bu hafta"}
        </button>
      ) : null}
    </div>
  );
}
