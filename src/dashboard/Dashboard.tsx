// DemirTube Aurora UI v2 · unified dashboard visual system
//
// Bu bileşen yalnızca kabuktur: navigasyon, üst çubuk ve seçili sayfanın
// yerleştirilmesi. Veri erişimi hooks/useAppData, adres durumu hooks/useHashRoute,
// sayfa eşlemesi pages.tsx içindedir.
import { Suspense, useEffect, useState } from "react";
import { AlertTriangle, BarChart3, GitCompareArrows, Menu, Moon, Search, Sun, X } from "lucide-react";
import { analyticsPeriodLabels, sessionsInPeriod, videosInPeriod, type AnalyticsPeriod } from "../analytics/period";
import { previousPeriodAnchor } from "../analytics/insights-suite";
import { Onboarding } from "./Onboarding";
import { DateNav } from "./DateNav";
import { PeriodComparisonStrip } from "./PeriodComparisonStrip";
import { navigationSections, periodPages, sectionForPage } from "./navigation";
import { pages } from "./pages";
import { useAppData } from "./hooks/useAppData";
import { useHashRoute } from "./hooks/useHashRoute";
import { CommandPalette } from "./CommandPalette";
import { PageErrorBoundary } from "./ErrorBoundary";
import type { Command } from "./command-search";
import { datedFileName, downloadFile } from "./file-download";
import { BrandMark, BrandName } from "../shared/Brand";

const NARROW_QUERY = "(max-width: 820px)";

export function Dashboard() {
  const app = useAppData();
  const { page, period, anchor, channel, topic, setPage, setPeriod, setAnchor, setChannel, setTopic } = useHashRoute();
  const [menu, setMenu] = useState(false);
  const [isNarrow, setIsNarrow] = useState(() => matchMedia(NARROW_QUERY).matches);
  const [comparePrevious, setComparePrevious] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  const { data, extensionAvailable } = app;
  const extensionVersion = extensionAvailable ? chrome.runtime.getManifest().version : "geliştirme";

  const closeMenu = () => {
    if (isNarrow) document.querySelector<HTMLElement>(".app-main")?.focus();
    setMenu(false);
  };

  useEffect(() => {
    const media = matchMedia(NARROW_QUERY);
    const update = () => { setIsNarrow(media.matches); if (!media.matches) setMenu(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // Ctrl/Cmd+K komut paletini açar. Yazı alanındayken kısayol yakalanmaz.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!data) return;
    const theme = data.settings.theme === "system"
      ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
      : data.settings.theme;
    document.documentElement.dataset.theme = theme;
  }, [data?.settings.theme]);

  if (app.loadError) return (
    <div className="fatal-state">
      <BrandMark size={54} />
      <h1>Dashboard açılamadı</h1>
      <p>{app.loadError}</p>
      <button className="button primary" onClick={() => void app.load()}>Tekrar dene</button>
      <small>Eklenti yeni güncellendiyse chrome://extensions sayfasından yenileyip bu sekmeyi tekrar aç.</small>
    </div>
  );

  if (!data) return <div className="loading">DemirTube hazırlanıyor…</div>;

  const filteredSessions = sessionsInPeriod(data.sessions, period, anchor);
  const filteredVideos = videosInPeriod(data.videos, data.sessions, period, anchor);
  const comparisonAnchor = previousPeriodAnchor(period, anchor);
  const previousSessions = period === "all" ? [] : sessionsInPeriod(data.sessions, period, comparisonAnchor);
  const previousVideos = period === "all" ? [] : videosInPeriod(data.videos, data.sessions, period, comparisonAnchor);

  const content = pages[page]({
    data,
    watchlist: app.watchlist,
    period,
    anchor,
    videos: filteredVideos,
    sessions: filteredSessions,
    currentWeekVideos: videosInPeriod(data.videos, data.sessions, "week", new Date()),
    currentWeekSessions: sessionsInPeriod(data.sessions, "week", new Date()),
    previousVideos,
    previousSessions,
    extensionAvailable,
    setSettings: app.setSettings,
    deleteVideo: app.deleteVideo,
    saveFeedback: app.saveFeedback,
    resetFeedback: app.resetFeedback,
    clear: app.clear,
    importData: app.importData,
    exportData: app.exportData,
    generateReport: app.generateReport,
    removeFromWatchlist: app.removeFromWatchlist,
    reclassifyTopics: app.reclassifyTopics,
    channel,
    setChannel,
    topic,
    setTopic,
  });

  const runCommand = (command: Command) => {
    if (command.kind === "page") { setPage(command.page); return; }
    if (command.kind === "period") { setPeriod(command.period); return; }
    if (command.kind === "channel") { setChannel(command.channelName); return; }
    if (command.kind === "topic") { setTopic(command.topic); return; }
    if (command.kind === "video") { window.open(command.url, "_blank", "noopener,noreferrer"); return; }
    if (command.action === "open-settings") { setPage("settings"); return; }
    if (command.action === "generate-report") { setPage("report"); void app.generateReport(); return; }
    if (command.action === "toggle-theme") {
      void app.setSettings({ ...data.settings, theme: data.settings.theme === "light" ? "dark" : "light" });
      return;
    }
    // export-data: Ayarlar ekranındaki yedekle aynı dosyayı üretir ve son yedek
    // tarihini günceller, böylece yedek hatırlatması bu indirmeyi de görür.
    void app.exportData().then(async (payload) => {
      downloadFile(JSON.stringify(payload, null, 2), datedFileName("demirtube", "json"), "application/json");
      await app.setSettings({ ...data.settings, lastLocalExportAt: new Date().toISOString() });
    });
  };

  const activeSection = sectionForPage(page);
  const activePageLabel = activeSection.children.find(([id]) => id === page)?.[1] ?? activeSection.label;

  return (
    <div className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      {!data.settings.onboardingCompleted ? (
        <Onboarding onComplete={() => app.setSettings({ ...data.settings, onboardingCompleted: true })} />
      ) : null}

      {paletteOpen ? (
        <CommandPalette videos={data.videos} onClose={() => setPaletteOpen(false)} onRun={runCommand} />
      ) : null}

      {!menu ? (
        <button aria-label="Menüyü aç" className="mobile-menu" onClick={() => setMenu(true)}>
          <Menu />
        </button>
      ) : (
        <button aria-label="Menüyü kapat" className="sidebar-backdrop" onClick={closeMenu} />
      )}

      <aside className={`sidebar ${menu ? "open" : ""}`} aria-hidden={isNarrow && !menu} inert={isNarrow && !menu}>
        <div className="brand">
          <span><BrandMark size={34} /></span>
          <div className="brand-copy"><strong><BrandName /></strong><small>Kişisel izleme zekân</small></div>
          <button aria-label="Menüyü kapat" className="close-menu" onClick={closeMenu}>
            <X />
          </button>
        </div>

        <nav className="nav-primary" aria-label="Ana navigasyon">
          {navigationSections.map((section) => {
            const Icon = section.icon;
            const isActive = section === activeSection;
            return (
              <div className={`nav-section ${isActive ? "active" : ""}`} key={section.label}>
                <button
                  className={`nav-primary-button ${isActive ? "active" : ""}`}
                  onClick={() => { setPage(section.root); closeMenu(); }}
                >
                  <Icon size={17} />
                  <span>{section.label}</span>
                </button>
                {isActive && section.children.length ? (
                  <div className="nav-secondary">
                    {section.children.map(([id, label]) => (
                      <button
                        key={id}
                        className={page === id ? "active" : ""}
                        onClick={() => { setPage(id); closeMenu(); }}
                      >
                        <i aria-hidden="true" />
                        <span>{label}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="privacy">
          <span><BarChart3 size={18} /></span>
          <p>
            <strong>Yerel-first çalışır</strong>
            <small>Bulut yalnızca sen açarsan kullanılır.</small>
          </p>
        </div>
      </aside>

      <main className="app-main" tabIndex={-1}>
        <header className="topbar">
          <div className="topbar-context"><small>{activeSection.label.toLocaleUpperCase("tr-TR")}</small><strong>{activePageLabel}</strong></div>
          {periodPages.has(page) ? (
            <>
              <div className="period-selector" aria-label="Analiz dönemi">
                {(Object.entries(analyticsPeriodLabels) as [AnalyticsPeriod, string][]).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={period === value}
                    onClick={() => setPeriod(value)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <DateNav period={period} anchor={anchor} onChange={setAnchor} />
              {period !== "all" ? <button className={`compare-toggle ${comparePrevious ? "active" : ""}`} type="button" aria-pressed={comparePrevious} onClick={() => setComparePrevious((value) => !value)}><GitCompareArrows size={15}/><span>Önceki dönem</span></button> : null}
            </>
          ) : null}
          <div className="system-status"><i /><span>{extensionAvailable ? `Canlı yerel veri · v${extensionVersion}` : "Örnek geliştirme verisi"}</span></div>
          <button
            aria-label="Komut paletini aç (Ctrl+K)"
            title="Komut paleti · Ctrl+K"
            className="palette-button"
            onClick={() => setPaletteOpen(true)}
          >
            <Search size={16} /><kbd>Ctrl</kbd><kbd>K</kbd>
          </button>
          <button
            aria-label="Renk temasını değiştir"
            className="theme-button"
            onClick={() => void app.setSettings({ ...data.settings, theme: data.settings.theme === "light" ? "dark" : "light" })}
          >
            {data.settings.theme === "light" ? <Moon /> : <Sun />}
          </button>
        </header>

        {app.dataLoss?.expected ? (
          <div className="data-loss-banner" role="alert">
            <span aria-hidden="true"><AlertTriangle size={20} /></span>
            <div>
              <strong>Yerel veritabanı sıfırlanmış görünüyor</strong>
              <p>
                Bu cihazda daha önce {app.dataLoss.expected.videos} video ve {app.dataLoss.expected.sessions} oturum kayıtlıydı;
                şu an {app.dataLoss.actual.videos} video görünüyor. Tarayıcı site verisi temizliği veya eklentinin yeniden
                yüklenmesi IndexedDB'yi silmiş olabilir. Ayarlar → Yerel veriler bölümünden son JSON yedeğini
                <strong> birleştir</strong> modunda içe aktarırsan geçmişin geri gelir.
              </p>
            </div>
            <div className="data-loss-actions">
              <button className="button primary" type="button" onClick={() => setPage("settings")}>Yedeği içe aktar</button>
              <button className="button" type="button" onClick={() => void app.dismissDataLoss()}>Bu doğru, yoksay</button>
            </div>
          </div>
        ) : null}

        <div className="page" key={page}>
          {periodPages.has(page) && comparePrevious && period !== "all" ? <PeriodComparisonStrip currentVideos={filteredVideos} currentSessions={filteredSessions} previousVideos={previousVideos} previousSessions={previousSessions}/> : null}
          <PageErrorBoundary resetKey={page} onGoHome={() => setPage("overview")}>
            <Suspense fallback={<div className="loading">Sayfa yükleniyor…</div>}>{content}</Suspense>
          </PageErrorBoundary>
        </div>
      </main>
    </div>
  );
}
