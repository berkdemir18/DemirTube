// DemirTube · popup
//
// Popup, dashboard'u açmadan "bugün ne oldu" sorusunu cevaplar: bugünkü aktif
// süre, günlük bütçe durumu, son yedi günün çubukları, seri ve öne çıkan konu.
// Hesabın tamamı service worker'daki GET_DAILY_PULSE'tan gelir; burada yalnızca
// biçimlendirme yapılır.
import { useEffect, useState } from "react";
import { BarChart3, EyeOff, Flame, PauseCircle, PlayCircle, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { DEFAULT_SETTINGS } from "../shared/constants";
import { sendMessage } from "../shared/messages";
import type { DailyPulse } from "../analytics/daily-pulse";
import type { BudgetState, FeedRuntimeStatus, Settings } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { calculateDailyPulse } from "../analytics/daily-pulse";
import { seedData } from "../dashboard/seed-data";
import { BrandMark, BrandName } from "../shared/Brand";

const extensionRuntimeAvailable = typeof chrome !== "undefined" && Boolean(chrome.runtime?.id);
const extensionVersion = extensionRuntimeAvailable ? chrome.runtime.getManifest().version : "geliştirme";

const budgetCopy: Record<DailyPulse["budgetState"], string> = {
  off: "Günlük bütçe kapalı",
  safe: "Bütçenin içindesin",
  near: "Bütçenin sonuna yaklaştın",
  over: "Günlük bütçeyi aştın"
};

function PulseCard({ pulse }: { pulse: DailyPulse }) {
  const peak = Math.max(...pulse.weekBars.map((bar) => bar.seconds), 1);
  const delta = pulse.deltaPercent;
  const budgetWidth = Math.min(100, pulse.budgetPercent);

  return (
    <section className="popup-pulse">
      <div className="popup-pulse-head">
        <div>
          <small>BUGÜN</small>
          <strong>{pulse.activeSeconds ? formatDuration(pulse.activeSeconds) : "Henüz izleme yok"}</strong>
        </div>
        {delta !== undefined && pulse.activeSeconds > 0 ? (
          <span className={`popup-pulse-delta ${delta > 0 ? "up" : "down"}`}>
            {delta > 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            %{Math.abs(delta)}
          </span>
        ) : null}
      </div>

      {pulse.budgetMinutes > 0 ? (
        <div className="popup-pulse-budget">
          <div className={`popup-pulse-budget-track ${pulse.budgetState}`}>
            <i style={{ width: `${budgetWidth}%` }} />
          </div>
          <small>
            {budgetCopy[pulse.budgetState]} · {Math.round(pulse.activeSeconds / 60)}/{pulse.budgetMinutes} dk
          </small>
        </div>
      ) : null}

      <div className="popup-pulse-metrics">
        <div><strong>{pulse.videoCount}</strong><small>video</small></div>
        <div><strong>{pulse.completedCount}</strong><small>tamamlandı</small></div>
        <div><strong>%{Math.round(pulse.shortsPercent)}</strong><small>Shorts</small></div>
      </div>

      <div className="popup-pulse-bars" aria-hidden="true">
        {pulse.weekBars.map((bar) => (
          <span key={bar.dayKey} className={bar.isToday ? "today" : ""}>
            <i style={{ height: `${Math.max(4, Math.round(bar.seconds / peak * 100))}%` }} />
            <em>{bar.label}</em>
          </span>
        ))}
      </div>
      <p className="visually-hidden">
        Son yedi gün: {pulse.weekBars.map((bar) => `${bar.label} ${formatDuration(bar.seconds)}`).join(", ")}.
      </p>

      <div className="popup-pulse-chips">
        {pulse.streakDays > 0 ? (
          <span className="popup-pulse-chip"><Flame size={12} />{pulse.streakDays} günlük seri</span>
        ) : null}
        {pulse.topTopic ? (
          <span className="popup-pulse-chip">{pulse.topTopic.topic} · {formatDuration(pulse.topTopic.seconds)}</span>
        ) : null}
      </div>

      {pulse.lastVideo ? (
        <p className="popup-pulse-last" title={pulse.lastVideo.title}>
          Son: <strong>{pulse.lastVideo.title}</strong> · %{pulse.lastVideo.completionPercent}
        </p>
      ) : null}
    </section>
  );
}

export function Popup() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [feed, setFeed] = useState<FeedRuntimeStatus>();
  const [pulse, setPulse] = useState<DailyPulse>();
  const [budget, setBudget] = useState<BudgetState>();
  const [error, setError] = useState("");

  useEffect(() => {
    // Eklenti bağlamı yoksa (vite dev sunucusu) arayüz örnek veriyle çalışır.
    if (!extensionRuntimeAvailable) {
      setPulse(calculateDailyPulse(seedData.videos, seedData.sessions, seedData.settings));
      return;
    }
    Promise.all([
      sendMessage<Settings>({ type: "GET_SETTINGS" }).then(setSettings),
      sendMessage<FeedRuntimeStatus | undefined>({ type: "GET_FEED_STATE" }).then(setFeed),
      // Nabız hesaplanamazsa (ör. veritabanı henüz açılmadıysa) popup'ın geri
      // kalanı yine çalışmalı; bu istek kendi hatasını yutar.
      sendMessage<DailyPulse | undefined>({ type: "GET_DAILY_PULSE" }).then(setPulse).catch(() => undefined),
      sendMessage<BudgetState | undefined>({ type: "GET_BUDGET_STATE" }).then(setBudget).catch(() => undefined)
    ]).catch(() => setError("Eklenti yenilendi. Bu pencereyi kapatıp tekrar aç."));
  }, []);

  const toggle = async () => {
    try {
      const next = { ...settings, trackingEnabled: !settings.trackingEnabled };
      if (extensionRuntimeAvailable) await sendMessage({ type: "SET_SETTINGS", settings: next });
      setSettings(next);
      setError("");
    } catch {
      setError("Takip ayarı kaydedilemedi. Eklentiyi yenileyip tekrar dene.");
    }
  };

  return (
    <main className="popup">
      <header>
        <span><BrandMark size={34} /></span>
        <div>
          <strong><BrandName /></strong>
          <small>Yerel-first izleme analizi · v{extensionVersion}</small>
        </div>
        <b className={`popup-status ${settings.trackingEnabled ? "active" : ""}`}>
          {settings.trackingEnabled ? "Aktif" : "Kapalı"}
        </b>
      </header>

      {error ? <p className="popup-error" role="alert">{error}</p> : null}

      {pulse ? <PulseCard pulse={pulse} /> : null}

      {budget?.shortsPaused ? (
        <p className="popup-shorts-pause">
          <EyeOff size={13} />
          <span>Shorts bugünlük gizli</span>
          <button
            type="button"
            onClick={() => void sendMessage<BudgetState>({ type: "SET_SHORTS_PAUSE", active: false }).then(setBudget)}
          >
            Geri aç
          </button>
        </p>
      ) : null}

      {/* Dashboard en sık istenen eylem: nabız kartının hemen altında ve tek
          tıklık mesafede duruyor. Takibi durdurmak ise nadir ve geri
          döndürülebilir bir karar; listenin sonunda. */}
      <button
        className="button primary"
        onClick={() => { if (extensionRuntimeAvailable) void chrome.runtime.openOptionsPage(); }}
      >
        <BarChart3 size={17} />Dashboard'u aç
      </button>
      <section>
        <div className={`status-dot ${settings.trackingEnabled ? "active" : ""}`} />
        <div>
          <strong>{settings.trackingEnabled ? "Takip açık" : "Takip duraklatıldı"}</strong>
          <p>{settings.trackingEnabled ? "YouTube oturumları yerel olarak kaydediliyor." : "Yeni oturum kaydedilmiyor."}</p>
        </div>
      </section>

      <section>
        <div className={`status-dot ${feed?.state === "active" ? "active" : ""}`} />
        <div>
          <strong>Keşfet analizi</strong>
          <p>{feed?.message ?? "YouTube ana sayfası bekleniyor."}</p>
        </div>
      </section>


      <button className="button" onClick={() => void toggle()}>
        {settings.trackingEnabled ? <PauseCircle size={17} /> : <PlayCircle size={17} />}
        {settings.trackingEnabled ? "Takibi durdur" : "Takibi başlat"}
      </button>

      <footer><ShieldCheck size={15} />Bulut yalnızca sen etkinleştirirsen kullanılır.</footer>
    </main>
  );
}
