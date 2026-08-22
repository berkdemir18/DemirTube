import { useCallback, useEffect, useRef, useState } from "react";
import {
  BarChart3,
  BookmarkCheck,
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Clock3,
  Cloud,
  Coffee,
  Compass,
  Crosshair,
  Database,
  FileText,
  GraduationCap,
  Info,
  Play,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UserRound,
} from "lucide-react";
import { BrandMark, BrandName } from "../shared/Brand";
import type { ReactNode, SyntheticEvent } from "react";
import type { PreferenceResult } from "../analytics/preference-score";
import { VIDEO_FORMAT_OPTIONS } from "../analytics/video-intelligence";
import { buildAttentionSections } from "../analytics/insights-suite";
import { sendMessage } from "../shared/messages";
import type {
  Settings,
  CloudAnalysisInput,
  CloudVideoAnalysis,
  UserVideoFeedback,
  VideoDecision,
  VideoFormat,
  VideoMetadata,
  VideoRecord,
  WatchSession,
  WatchlistItem,
  WatchIntent,
  TrackingRuntimeStatus,
} from "../shared/types";

type Context = {
  video?: VideoRecord;
  feedback?: UserVideoFeedback;
  sessions: WatchSession[];
  channelVideoCount?: number;
};

type DetailTab = "why" | "content" | "personal" | "ai";

const detailTabs: Array<{ id: DetailTab; label: string; icon: typeof BarChart3 }> = [
  { id: "why", label: "Neden?", icon: BarChart3 },
  { id: "content", label: "İçerik", icon: FileText },
  { id: "personal", label: "Kişisel", icon: UserRound },
  { id: "ai", label: "AI", icon: Sparkles },
];

const watchModes: Array<{ id: WatchIntent; label: string; description: string; icon: typeof Compass }> = [
  { id: "open", label: "Bir bakayım", description: "Önce göz at", icon: Compass },
  { id: "learn", label: "Bir şey öğren", description: "Bilgi edin", icon: GraduationCap },
  { id: "relax", label: "Kafa dağıt", description: "Rahat izle", icon: Coffee },
  { id: "focus", label: "Odaklan", description: "Dikkatim burada", icon: Crosshair },
];

function withTimeout<T>(request: Promise<T>, timeoutMs = 7_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Puanlama isteği zaman aşımına uğradı.")), timeoutMs);
    request.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

export function RecommendationPanel({ metadata, trackingStatus }: { metadata: VideoMetadata; trackingStatus?: TrackingRuntimeStatus }) {
  const [result, setResult] = useState<PreferenceResult>();
  const [context, setContext] = useState<Context>({ sessions: [] });
  const [settings, setSettings] = useState<Settings>();
  const [decision, setDecision] = useState<VideoDecision>();
  const [saved, setSaved] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailTab, setDetailTab] = useState<DetailTab>("why");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const collapsedRef = useRef(false);
  const collapseWriteRef = useRef(0);

  const applyCollapsed = useCallback((next: boolean) => {
    collapsedRef.current = next;
    setCollapsed(next);
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setLoadError(false);
    void sendMessage<Settings | null>({ type: "GET_SETTINGS" }).then((nextSettings) => {
      if (!nextSettings) return;
      setSettings(nextSettings);
      applyCollapsed(nextSettings.panelCollapsed);
    }).catch(() => undefined);

    void sendMessage<Context | null>({ type: "GET_VIDEO_CONTEXT", videoId: metadata.videoId }).then((nextContext) => {
      if (nextContext) setContext(nextContext);
    }).catch(() => undefined);

    void sendMessage<WatchlistItem[] | null>({ type: "WATCHLIST_GET" }).then((list) => {
      if (Array.isArray(list)) setSaved(list.some((item) => item.videoId === metadata.videoId));
    }).catch(() => undefined);

    void (async () => {
      let received = false;
      for (let attempt = 0; attempt < 2 && !received; attempt++) {
        try {
          const nextDecision = await withTimeout(
            sendMessage<VideoDecision | null>({ type: "GET_VIDEO_DECISION", metadata })
          );
          if (nextDecision) {
            setDecision(nextDecision);
            setResult(nextDecision.preference);
            received = true;
          }
        } catch {
          // İlk zaman aşımında aynı güvenli okuma bir kez daha denenir. İlk istek
          // sonradan tamamlansa bile service-worker önbelleği ikinci yanıtı hızlandırır.
        }
      }
      if (!received) {
        try {
          const preference = await withTimeout(
            sendMessage<PreferenceResult | null>({ type: "GET_RECOMMENDATION", metadata })
          );
          if (preference) {
            setResult(preference);
            received = true;
          }
        } catch {
          // Kullanıcıya sonsuz yüklenme yerine yeniden deneme kontrolü gösterilir.
        }
      }
      setLoadError(!received);
      setLoading(false);
    })();
  }, [applyCollapsed, metadata]);

  useEffect(() => {
    load();
  }, [load]);

  // Oynatma ilerlemesini yalnızca açık panelde ve seyrek aralıklarla yenile.
  // Tercih/karar modeli mevcut videoyu eğitim geçmişinden çıkardığı için her
  // 5 saniyede ağır modeli tekrar çalıştırmak sonuç üretmiyor, yalnızca kasıyor.
  useEffect(() => {
    if (collapsed) return;
    const refreshContext = () => {
      if (document.visibilityState === "hidden") return;
      void sendMessage<Context | null>({ type: "GET_VIDEO_CONTEXT", videoId: metadata.videoId })
        .then((nextContext) => { if (nextContext) setContext(nextContext); })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refreshContext, 20_000);
    return () => clearInterval(timer);
  }, [collapsed, metadata.videoId]);

  useEffect(() => {
    if (!globalThis.chrome?.storage?.onChanged) return;
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== "local") return;
      const next = changes.settings?.newValue as Settings | undefined;
      if (next && typeof next.panelCollapsed === "boolean") {
        setSettings(next);
        applyCollapsed(next.panelCollapsed);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [applyCollapsed]);

  const saveFeedback = async (patch: Partial<UserVideoFeedback>) => {
    await sendMessage({
      type: "SAVE_FEEDBACK",
      feedback: {
        videoId: metadata.videoId,
        updatedAt: new Date().toISOString(),
        ...context.feedback,
        ...patch,
      },
    });
    load();
  };

  const toggleCollapsed = async () => {
    const write = ++collapseWriteRef.current;
    const next = !collapsedRef.current;
    applyCollapsed(next);
    const current = settings ?? await sendMessage<Settings>({ type: "GET_SETTINGS" });
    if (!current || write !== collapseWriteRef.current) return;
    const nextSettings = { ...current, panelCollapsed: next };
    setSettings(nextSettings);
    await sendMessage({ type: "SET_SETTINGS", settings: nextSettings });
  };

  const toggleWatchlist = async () => {
    const response = await sendMessage<{ saved: boolean } | null>({
      type: "WATCHLIST_TOGGLE",
      item: { ...metadata, addedAt: new Date().toISOString() } as WatchlistItem,
    });
    if (response && typeof response.saved === "boolean") setSaved(response.saved);
  };

  const startWatching = () => {
    const video = document.querySelector<HTMLVideoElement>("video.html5-main-video");
    if (!video) return;
    video.scrollIntoView({ behavior: "smooth", block: "center" });
    void video.play().catch(() => undefined);
  };

  const changeIntent = async (watchIntent: WatchIntent) => {
    if (!settings || settings.watchIntent === watchIntent) return;
    const next = { ...settings, panelCollapsed: collapsedRef.current, watchIntent };
    setSettings(next);
    await sendMessage({ type: "SET_SETTINGS", settings: next });
    const nextDecision = await sendMessage<VideoDecision | null>({ type: "GET_VIDEO_DECISION", metadata });
    if (nextDecision) setDecision(nextDecision);
  };

  const video = context.video;
  const isLivestream = metadata.contentType === "livestream";
  // Hata durumunda önceki denemeden kalan puanı göstermek "Puanlama yanıt
  // vermedi" başlığıyla çelişiyordu; okunan sayı artık gerçekten güncel olan.
  const score = loadError
    ? null
    : decision?.score !== undefined ? Math.round(decision.score)
    : result?.score !== undefined ? Math.round(result.score)
    : null;
  const scoreTone = score !== null ? (score >= 70 ? "high" : score >= 45 ? "mid" : "low") : "none";
  const recommendationTitle = loadError
    ? "Puanlama yanıt vermedi"
    : decision
    ? decision.decisionLabel
    : isLivestream && score === null
      ? "Canlı yayın uyumu hesaplanıyor"
    : isLivestream && score !== null && score >= 70
        ? "Bu canlı yayın sana uygun görünüyor"
        : isLivestream && score !== null && score >= 45
          ? "Canlı yayına göz atılabilir"
          : isLivestream
            ? "Canlı yayın düşük öncelikli"
    : score === null
      ? "Kişisel uyum hesaplanıyor"
      : score >= 70
        ? "Şimdi izlemeye değer"
        : score >= 45
          ? "İzlenebilir bir seçim"
          : "Düşük öncelikli içerik";
  const primaryReason =
    (loadError ? "Arka plan isteği zaman aşımına uğradı. Yeniden deneyebilirsin." : undefined) ??
    result?.explanation?.[0] ??
    decision?.reasons.find((reason) => reason.includes("önceki video")) ??
    "Kanal, konu, süre, başlık ve video formatı geçmiş davranışınla karşılaştırılıyor.";
  const recommendedSpeed = metadata.durationSeconds > 1_200 ? 1.5 : metadata.durationSeconds > 600 ? 1.25 : 1;
  const adjustedMinutes = Math.max(1, Math.round(metadata.durationSeconds / recommendedSpeed / 60));

  const isolateInteraction = (event: SyntheticEvent) => event.stopPropagation();

  return (
    <aside
      className={`dt-panel dt-tone-${scoreTone} ${collapsed ? "dt-mini" : ""}`}
      aria-label="DemirTube video analizi"
      onClick={isolateInteraction}
      onDoubleClick={isolateInteraction}
      onPointerDown={isolateInteraction}
      onKeyDown={isolateInteraction}
    >
      <header className="dt-header">
        <div className="dt-brand">
          <span className="dt-logo"><BrandMark size={36} /></span>
          <span className="dt-brand-copy">
            <strong><BrandName /></strong>
            {!collapsed ? <small>Kişisel video rehberi</small> : null}
          </span>
        </div>
        {collapsed ? (
          <>
            <span className="dt-mini-score">{score === null ? "Analiz…" : `%${score} uygun`}</span>
            <button className="dt-mini-watch" type="button" onClick={startWatching}>
              İzle
            </button>
          </>
        ) : (
          <span className="dt-engine">
            {video?.cloudAnalysis ? <Cloud size={13} /> : <Database size={13} />}
            {video?.cloudAnalysis ? "Yerel + Groq" : "Yerel AI"}
          </span>
        )}
        <button
          className="dt-icon-button"
          type="button"
          aria-label={collapsed ? "Paneli genişlet" : "Paneli daralt"}
          onClick={() => void toggleCollapsed()}
        >
          {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
        </button>
      </header>

      {!collapsed && trackingStatus ? (
        <div className={`dt-live-status dt-live-${trackingStatus.state}`} role="status" title={trackingStatus.detail}>
          <i />
          <span><strong>{trackingStatus.label}</strong><small>{trackingStatus.detail}</small></span>
        </div>
      ) : null}

      {!collapsed ? (
        <>
          <section className="dt-mode-picker" aria-label="İzleme niyeti">
            <div className="dt-mode-title">
              <span className="dt-mode-title-copy">
                <strong>Bu videoyu neden açtın?</strong>
                <small>Öneriyi o anki ihtiyacına göre ayarla</small>
              </span>
              <PanelInfo title="İzleme niyeti">Bu seçim videonun kalitesini değiştirmez; öneriyi o anki ihtiyacınla uyumuna göre yeniden yorumlar.</PanelInfo>
            </div>
            <div className="dt-mode-options" aria-label="İzleme niyeti seçenekleri">
              {watchModes.map(({ id, label, description, icon: Icon }) => (
                <button key={id} type="button" aria-pressed={(settings?.watchIntent ?? "open") === id} onClick={() => void changeIntent(id)}>
                  <span className="dt-mode-icon"><Icon size={16}/></span>
                  <span className="dt-mode-option-copy"><strong>{label}</strong><small>{description}</small></span>
                </button>
              ))}
            </div>
          </section>
          <div className="dt-summary">
            <div className="dt-score-column">
              <div className="dt-score-label">
                <small>Sana uygunluk</small>
                <PanelInfo title="Sana uygunluk">
                  Kanal, konu, süre, başlık ve doğrulanmış video formatı sinyalleri kişisel model ağırlıklarıyla birleştirilir. Yeterli geçmiş yoksa kesin puan yerine “Yeni” gösterilir.
                </PanelInfo>
              </div>
              <div
                className={`dt-score-ring ${loading || score === null ? "dt-score-empty" : ""}`}
                style={{ background: score === null ? undefined : `conic-gradient(var(--dt-score-color) ${score * 3.6}deg, #203044 0)` }}
              >
                <span><strong>{loading ? "…" : score === null ? "—" : score}</strong><small>{loading ? "ANALİZ" : loadError ? "HATA" : score === null ? "PUAN YOK" : "/ 100"}</small></span>
              </div>
              {loadError ? (
                <button className="dt-score-retry" type="button" onClick={load}>Tekrar dene</button>
              ) : result?.enoughData ? (
                <span className={`dt-confidence dt-confidence-${result.model.confidence}`}>
                  {result.model.confidence === "high" ? "Yüksek" : result.model.confidence === "medium" ? "Orta" : "Düşük"} güven · {result.model.sampleCount} video
                </span>
              ) : <span className="dt-confidence">En az 5 geçmiş video gerekli</span>}
            </div>
            <div className="dt-summary-copy">
              <small>İZLEME KARARI</small>
              <h3>{recommendationTitle}</h3>
              <p>{primaryReason}</p>
            </div>
          </div>

          <div className="dt-time-saving">
            <Clock3 size={20} />
            <span>{isLivestream
              ? <><strong>CANLI</strong> · sabit süre ve tamamlanma hedefi yok</>
              : metadata.durationSeconds > 0
                ? <><strong>{recommendedSpeed}x</strong> ile yaklaşık <strong>{adjustedMinutes} dk</strong></>
                : "Süre bilgisi YouTube’dan bekleniyor"}</span>
            {!isLivestream && metadata.durationSeconds > 0 && recommendedSpeed > 1 ? (
              <button
                type="button"
                onClick={() => {
                  const currentVideo = document.querySelector<HTMLVideoElement>("video.html5-main-video");
                  if (currentVideo) currentVideo.playbackRate = recommendedSpeed;
                }}
              >
                Uygula
              </button>
            ) : null}
          </div>

          {!isLivestream && video?.predictionSnapshot?.estimatedCompletion !== undefined && video.totalActiveWatchSeconds > 0 ? (
            <div className="dt-prediction-outcome">
              <BarChart3 size={18}/>
              <span>
                <small>{video.isCurrentlyWatching ? "TAHMİN TAKİBİ" : "TAHMİN SONUCU"}</small>
                <strong>Tahmin: %{video.predictionSnapshot.estimatedCompletion} · {video.isCurrentlyWatching ? "Şu an" : "Gerçekleşen"}: %{Math.round(video.completionRate * 100)}</strong>
              </span>
              <b>{Math.abs(video.predictionSnapshot.estimatedCompletion - video.completionRate * 100) <= 15 ? "Yakın" : `${Math.round(Math.abs(video.predictionSnapshot.estimatedCompletion - video.completionRate * 100))} puan fark`}</b>
            </div>
          ) : null}

          {detailsOpen ? (
            <section className="dt-details" aria-label="Ayrıntılı video analizi">
              <div className="dt-tabs" role="tablist" aria-label="Analiz ayrıntıları">
                {detailTabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={detailTab === id}
                    onClick={() => setDetailTab(id)}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>
              <div className="dt-detail-content" role="tabpanel">
                {detailTab === "why" ? <WhyDetails result={result} decision={decision} primaryReason={primaryReason} /> : null}
                {detailTab === "content" ? <ContentDetails metadata={metadata} video={video} sessions={context.sessions} result={result} /> : null}
                {detailTab === "personal" ? <PersonalDetails metadata={metadata} video={video} result={result} /> : null}
                {detailTab === "ai" ? <AiDetails metadata={metadata} video={video} settings={settings} result={result} onAnalysisComplete={load} /> : null}
              </div>
            </section>
          ) : null}

          <div className="dt-actions">
            <button className="dt-primary-action" type="button" onClick={startWatching}>
              <Play size={18} fill="currentColor" />
              İzlemeye başla
            </button>
            <button className={`dt-secondary-action ${saved ? "saved" : ""}`} type="button" onClick={() => void toggleWatchlist()}>
              {saved ? <BookmarkCheck size={18} /> : <BookmarkPlus size={18} />}
              {saved ? "Kaydedildi" : "Sonra izle"}
            </button>
          </div>

          <div className="dt-feedback">
            <button
              className={context.feedback?.liked === true ? "selected positive" : ""}
              type="button"
              onClick={() => void saveFeedback({ liked: true })}
            >
              <ThumbsUp size={17} />
              Faydalı
            </button>
            <button
              className={context.feedback?.liked === false ? "selected negative" : ""}
              type="button"
              onClick={() => void saveFeedback({ liked: false })}
            >
              <ThumbsDown size={17} />
              Sarmadı
            </button>
          </div>

          <label className="dt-format-feedback">
            <span>
              <strong>Format doğru mu?</strong>
              <small>Doğrulaman kişisel format modelini geliştirir.</small>
            </span>
            <select
              aria-label="Video formatını doğrula"
              value={context.feedback?.manualVideoFormat ?? video?.videoFormat ?? result?.contentIntelligence.format ?? "general"}
              onChange={(event) => void saveFeedback({ manualVideoFormat: event.target.value as VideoFormat })}
            >
              {VIDEO_FORMAT_OPTIONS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <button className="dt-details-toggle" type="button" onClick={() => setDetailsOpen((open) => !open)}>
            <span>{detailsOpen ? "Hızlı özete dön" : "Ayrıntıları gör"}</span>
            {detailsOpen ? <ChevronUp size={18} /> : <ChevronRight size={18} />}
          </button>
        </>
      ) : null}
    </aside>
  );
}

function WhyDetails({
  result,
  decision,
  primaryReason,
}: {
  result?: PreferenceResult;
  decision?: VideoDecision;
  primaryReason: string;
}) {
  const signals = [
    ["Kanal sinyali", result?.signals?.channel, result?.signalEvidence?.channel, "Aynı kanaldaki geçmiş videoların tamamlama, tekrar izleme ve erken çıkmama davranışlarından hesaplanır."],
    ["Konu uyumu", result?.signals?.topic, result?.signalEvidence?.topic, "Videonun konuları ile geçmişte aynı konularda gösterdiğin tamamlama ve etkileşim karşılaştırılır."],
    ["Süre uygunluğu", result?.signals?.duration, result?.signalEvidence?.duration, "Video süresi kendi süre grubuna ayrılır ve benzer uzunluktaki videolardaki davranışınla karşılaştırılır."],
    ["Başlık benzerliği", result?.signals?.keyword, result?.signalEvidence?.keyword, "Başlıktaki anlamlı kelime ve ifadelerin geçmişteki tamamlama ve pişmanlık sonuçları kullanılır."],
    ["Video formatı", result?.signals?.format, result?.signalEvidence?.format, "Aynı anlatım biçimindeki videolarda ne kadar kaldığın ve memnun olup olmadığın karşılaştırılır."],
  ] as const;

  return (
    <>
      {decision?.scoreContributions.length ? <div className="dt-contribution-list">
        <div className="dt-contribution-base"><span>Nötr başlangıç</span><strong>50</strong></div>
        {decision.scoreContributions.map((item) => (
          <div className="dt-contribution-row" key={item.key}>
            <span><b>{item.label}</b><small>{item.evidence}</small></span>
            <strong className={item.points < 0 ? "negative" : ""}>{item.points > 0 ? "+" : ""}{item.points}</strong>
          </div>
        ))}
        <div className="dt-contribution-total"><span>Nihai kişisel eşleşme</span><strong>{decision.score}/100</strong></div>
      </div> : <div className="dt-signal-list">
        {signals.map(([label, value, evidence, help]) => {
          const percentage = value === undefined ? 0 : Math.min(100, Math.max(0, Math.round(value)));
          return (
            <div className="dt-signal-row" key={label}>
              <div className="dt-signal-copy">
                <span className="dt-signal-name">{label}<PanelInfo title={label}>{help}</PanelInfo></span>
                <small>{evidence ?? "Bu sinyal için henüz kanıt oluşmadı"}</small>
              </div>
              <strong>{value === undefined ? "—" : `${percentage}`}</strong>
              <i aria-label={value === undefined ? "Ölçülmedi" : `100 üzerinden ${percentage}`}><b style={{ width: `${percentage}%` }} /></i>
            </div>
          );
        })}
      </div>}
      <p className="dt-detail-note"><BarChart3 size={16} /> {primaryReason}</p>
    </>
  );
}

function PanelInfo({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="dt-info" name="dt-panel-info">
      <summary aria-label={`${title} hakkında bilgi`} title={`${title} nasıl hesaplanır?`}><Info size={13} /></summary>
      <div><strong>{title}</strong><p>{children}</p></div>
    </details>
  );
}

function ContentDetails({
  metadata,
  video,
  sessions,
  result,
}: {
  metadata: VideoMetadata;
  video?: VideoRecord;
  sessions: WatchSession[];
  result?: PreferenceResult;
}) {
  const transcript = metadata.transcriptAnalysis;
  // İçerik sekmesi açıklama ve altyazıyı da okuyan zengin analizi gösterir;
  // puanlama tarafı bilerek ortak (kart ile aynı) tabanda kalır.
  const content = result?.contentIntelligence ?? result?.intelligence;
  const attention = video ? buildAttentionSections(
    { ...video, transcriptAnalysis: metadata.transcriptAnalysis },
    sessions.flatMap((session) => session.playbackSegments)
  ) : [];
  return (
    <div className="dt-content-stack">
      <p>{content?.summary ?? "Başlık, açıklama ve video yapısı yerel olarak analiz ediliyor."}</p>
      {content ? (
        <div className="dt-chip-row">
          <span>{content.formatLabel}</span>
          <span>{content.attentionLabel}</span>
          <span>{content.depthLabel}</span>
          <span>{metadata.chapterCount ? `${metadata.chapterCount} bölüm` : content.freshnessLabel}</span>
        </div>
      ) : null}
      {content ? (
        <div className="dt-expectation-card">
          <strong>Bu videodan ne beklemelisin?</strong>
          <div>
            <span><small>Değer</small><b>{content.valueType === "learning" ? "Öğrenme" : content.valueType === "entertainment" ? "Eğlence" : "Karma"}</b></span>
            <span><small>Odak</small><b>{content.attentionLabel}</b></span>
            <span><small>Format</small><b>{content.formatLabel}</b></span>
          </div>
          <p>{content.watchAdvice}</p>
        </div>
      ) : null}
      {transcript?.available ? (
        <>
          <div className="dt-content-metrics">
            <div><small>Başlık vaadi</small><strong>%{transcript.titlePromiseCoverage}</strong></div>
            <div><small>Bilgi yoğunluğu</small><strong>{transcript.informationDensity}/100</strong></div>
          </div>
          {transcript.keyMoments.length ? (
            <div className="dt-moment-list">
              <strong>Önemli anlar</strong>
              {transcript.keyMoments.slice(0, 5).map((moment) => (
                <button key={`${moment.startSeconds}-${moment.label}`} type="button" onClick={() => {
                  const currentVideo = document.querySelector<HTMLVideoElement>("video.html5-main-video");
                  if (currentVideo) {
                    currentVideo.currentTime = moment.startSeconds;
                    void currentVideo.play().catch(() => undefined);
                  }
                }}>
                  <b>{Math.floor(moment.startSeconds / 60)}:{String(Math.floor(moment.startSeconds % 60)).padStart(2, "0")}</b>
                  <span>{moment.label}</span>
                </button>
              ))}
            </div>
          ) : null}
          {attention.length ? (
            <div className="dt-attention-list">
              <strong>Bölüm ve dikkat haritası</strong>
              {attention.map((section) => (
                <div key={`${section.startSeconds}-${section.label}`} className={`dt-attention-${section.status.replaceAll(" ", "-")}`}>
                  <span><b>{Math.floor(section.startSeconds / 60)}:{String(Math.floor(section.startSeconds % 60)).padStart(2, "0")}</b><small>{section.label}</small></span>
                  <em>{section.status} · %{section.watchedPercent}</em>
                </div>
              ))}
            </div>
          ) : null}
        </>
      ) : (
        <small>{metadata.contentType === "livestream"
          ? "Canlı akışta altyazı hazır değilse analiz metadata ve davranış sinyalleriyle sürer."
          : transcript?.status === "no_tracks"
            ? "YouTube altyazı izini henüz yayınlamadı; DemirTube otomatik yeniden deniyor."
            : transcript?.status === "empty_track"
              ? "Altyazı izi bulundu ancak YouTube boş metin döndürdü; diğer izler deneniyor."
              : transcript?.status === "fetch_failed"
                ? "Altyazı isteği geçici olarak tamamlanamadı; otomatik yeniden denenecek."
                : "Altyazı analizi hazırlanıyor."}</small>
      )}
    </div>
  );
}

function PersonalDetails({
  metadata,
  video,
  result,
}: {
  metadata: VideoMetadata;
  video?: VideoRecord;
  result?: PreferenceResult;
}) {
  const isLivestream = metadata.contentType === "livestream";
  return (
    <div className="dt-personal-grid">
      <div><small>{isLivestream ? "Tamamlama" : "Tahmini tamamlama"}</small><strong>{isLivestream ? "Uygulanmaz" : result?.estimatedCompletion === undefined ? "—" : `%${result.estimatedCompletion}`}</strong></div>
      <div><small>Aktif izlenen</small><strong>{video ? `${Math.round(video.totalActiveWatchSeconds / 60)} dk` : "Yeni"}</strong></div>
      <div><small>Etkileşim</small><strong>{video?.engagementScore ?? "—"}</strong></div>
      <div><small>Pişmanlık</small><strong>{video?.regretScore ?? "—"}</strong></div>
    </div>
  );
}

function AiDetails({
  metadata,
  video,
  settings,
  result,
  onAnalysisComplete,
}: {
  metadata: VideoMetadata;
  video?: VideoRecord;
  settings?: Settings;
  result?: PreferenceResult;
  onAnalysisComplete: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string>();

  const runAnalysis = async () => {
    setRunning(true);
    setMessage(undefined);
    const input: CloudAnalysisInput = {
      videoId: metadata.videoId,
      title: metadata.title,
      channelName: metadata.channelName,
      description: metadata.description,
      topics: metadata.topics,
      durationSeconds: metadata.durationSeconds,
      contentType: metadata.contentType,
      transcriptAnalysis: metadata.transcriptAnalysis,
    };
    try {
      await sendMessage<CloudVideoAnalysis>({ type: "AI_ANALYZE_VIDEO", input });
      setMessage("Derin analiz tamamlandı.");
      onAnalysisComplete();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Groq analizi başlatılamadı.");
    } finally {
      setRunning(false);
    }
  };

  if (video?.cloudAnalysis) {
    return (
      <div className="dt-content-stack">
        <strong className="dt-ai-heading"><Cloud size={16} /> Groq derin analiz</strong>
        <p>{video.cloudAnalysis.summary}</p>
        {video.cloudAnalysis.keyPoints.slice(0, 3).map((point) => <small key={point}>• {point}</small>)}
      </div>
    );
  }
  return (
    <div className="dt-content-stack">
      <strong className="dt-ai-heading"><Database size={16} /> Yerel analiz aktif</strong>
      <p>{result?.contentIntelligence?.watchAdvice ?? "Kişisel model yalnızca cihazındaki davranış sinyallerini kullanır."}</p>
      <small>Groq yalnızca aşağıdaki düğmeye bastığında çalışır. İzleme geçmişin gönderilmez.</small>
      <button className="dt-groq-action" type="button" disabled={running} onClick={() => void runAnalysis()}>
        <Cloud size={15} /> {running ? "Groq analiz ediyor…" : "Groq ile derin analiz"}
      </button>
      {message ? <small className="dt-ai-message">{message}</small> : null}
      {!settings?.analysisMode || settings.analysisMode !== "groq_cloud" ? <small>Groq bağlantısını Ayarlar’dan kurduktan sonra bu düğmeyi kullanabilirsin.</small> : null}
    </div>
  );
}
