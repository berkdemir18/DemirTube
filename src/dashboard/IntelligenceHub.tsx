// DemirTube Aurora UI v2 · unified dashboard visual system
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { chartAccent, chartSeries } from "./chart-theme";
import {
  BrainCircuit, Clock3, Gauge, Network,
  RefreshCw, Search, Sparkles, Target, TrendingUp,
} from "lucide-react";
import type { UserVideoFeedback, VideoRecord, WatchSession } from "../shared/types";
import { formatDuration, round } from "../shared/utils";
import {
  analyzeCurrentSession, buildKnowledgeMap, predictionAccuracy,
  revisitRecommendations, semanticVideoSearch,
} from "../analytics/intelligence-hub";
import { derivePersonalModel, strongestModelSignal, type PersonalModel } from "../analytics/personal-model";
import { analyzeSelectionBias, discriminationLabel, type SelectionBiasReport } from "../analytics/selection-bias";
import { sendMessage } from "../shared/messages";
import { PageHeading } from "./ui";

export function IntelligenceHub({
  videos,
  sessions,
  feedback,
}: {
  videos: VideoRecord[];
  sessions: WatchSession[];
  feedback: UserVideoFeedback[];
}) {
  const [query, setQuery] = useState("");
  // Gösterim kaydı arka uçta yaşıyor (AppData'ya girmez, dışa aktarımı şişirmez);
  // yalnızca bu sayfa açıldığında okunur.
  const [selectionBias, setSelectionBias] = useState<SelectionBiasReport>();
  useEffect(() => {
    if (!globalThis.chrome?.runtime?.id) {
      // Vite geliştirme sunucusunda eklenti bağlamı yok; diğer sayfalar gibi
      // burada da örnek veriyle çalışılır.
      void import("./seed-data").then(({ seedImpressions }) =>
        setSelectionBias(analyzeSelectionBias(seedImpressions, videos)));
      return;
    }
    void sendMessage<SelectionBiasReport>({ type: "GET_SELECTION_BIAS" })
      .then(setSelectionBias)
      .catch(() => undefined);
  }, [videos]);
  const currentSession = useMemo(() => analyzeCurrentSession(videos, sessions), [videos, sessions]);
  const knowledge = useMemo(() => buildKnowledgeMap(videos), [videos]);
  const revisit = useMemo(() => revisitRecommendations(videos), [videos]);
  const accuracy = useMemo(() => predictionAccuracy(videos), [videos]);
  const model = useMemo(() => derivePersonalModel(videos), [videos]);
  const results = useMemo(
    () => semanticVideoSearch(query, videos, feedback).slice(0, 12),
    [query, videos, feedback]
  );
  const transcriptVideos = videos
    .filter((v) => v.transcriptAnalysis?.available)
    .toSorted((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
    .slice(0, 6);

  return (
    <>
      <PageHeading eyebrow="KİŞİSEL YAPAY ZEKÂ"
        title="Akıllı Merkez"
        copy="DemirTube'un öğrendikleri, mevcut oturumun ve içerik zekâsı tek yerde."
      />

      {/* Oturum zekâsı */}
      <section className={`surface session-intelligence mode-${currentSession.mode}`}>
        <span><BrainCircuit /></span>
        <div>
          <small>Şu anki izleme modu</small>
          <h2>{currentSession.label}</h2>
          <p>{currentSession.explanation}</p>
        </div>
        <dl>
          <div><dt>Video</dt><dd>{currentSession.videoCount}</dd></div>
          <div><dt>Aktif süre</dt><dd>{formatDuration(currentSession.watchSeconds)}</dd></div>
          <div><dt>Güven</dt><dd>{confidenceLabel(currentSession.confidence)}</dd></div>
        </dl>
      </section>

      {/* Üst metrik kartları */}
      <div className="intelligence-metrics premium-grid">
        <article>
          <Target />
          <small>Tahmin doğruluğu</small>
          <strong>{accuracy.sampleCount ? `%${accuracy.accuracyRate}` : "Veri birikiyor"}</strong>
          <p>
            {accuracy.sampleCount} sonuç · ortalama hata <span className="num">{accuracy.meanAbsoluteError}</span> puan
            {accuracy.sampleCount >= 3 ? (
              <>
                {" · "}
                {Math.abs(accuracy.systematicBias) < 3
                  ? "sistematik sapma yok"
                  : `${accuracy.systematicBias > 0 ? "düşük" : "yüksek"} tahmin eğilimi ${Math.abs(accuracy.systematicBias)} puan`}
                {accuracy.appliedCorrection !== 0
                  ? `, tahminlere ${accuracy.appliedCorrection > 0 ? "+" : ""}${accuracy.appliedCorrection} düzeltme uygulanıyor`
                  : ""}
              </>
            ) : null}
          </p>
        </article>
        <article>
          <Gauge />
          <small>Kişisel model</small>
          <strong>{confidenceLabel(model.confidence)}</strong>
          <p>En güçlü sinyal: {strongestModelSignal(model).label}</p>
        </article>
        <article className={accuracy.backtest.sampleCount >= 5 ? (accuracy.beatsBaseline ? "metric-good" : "metric-warn") : undefined}>
          <TrendingUp />
          <small>Taban çizgisine karşı</small>
          <strong>
            {accuracy.backtest.sampleCount < 5
              ? "Ölçülüyor"
              : accuracy.beatsBaseline
              ? `%${accuracy.skillPercent} daha iyi`
              : "Tabanı yenemiyor"}
          </strong>
          <p>
            {accuracy.backtest.sampleCount < 5 ? (
              `${model.sampleCount} davranış örneği birikiyor`
            ) : (
              <>
                Geriye dönük sınama · hata <span className="num">{accuracy.backtest.meanAbsoluteError}</span> puan,
                {" "}"hep ortalamayı söyle" tabanı <span className="num">{accuracy.backtest.baselineMeanAbsoluteError}</span> puan
              </>
            )}
          </p>
        </article>
        <article>
          <Clock3 />
          <small>Altyazı analizi</small>
          <strong>{videos.filter((v) => v.transcriptAnalysis?.available).length}</strong>
          <p>Ham altyazı saklanmadan analiz edilen video.</p>
        </article>
      </div>

      {/* Kişisel model ağırlıkları */}
      <ModelWeightsCard model={model} accuracy={accuracy} />

      {/* Seçim yanlılığı: modelin göremediği yarı */}
      <SelectionBiasCard report={selectionBias} />

      {/* Doğal dil arama */}
      <section className="surface semantic-search">
        <div className="section-head">
          <div>
            <h2><Search size={18} /> Geçmişine doğal dille sor</h2>
            <p>"Geçen ay beğendiğim yapay zekâ videoları" gibi aramalar yap.</p>
          </div>
          <span>Yerel arama</span>
        </div>
        <label>
          <Search size={17} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Örn. Beğendiğim ama tamamlamadığım uzun videolar"
          />
        </label>
        {query ? (
          <div className="semantic-results">
            {results.length ? results.map(({ video, score }) => (
              <a href={video.url} target="_blank" key={video.videoId}>
                <img src={video.thumbnailUrl} alt="" />
                <span>
                  <strong>{video.title}</strong>
                  <small>{video.channelName} · {video.topics.join(", ")}</small>
                </span>
                <b>{score}</b>
              </a>
            )) : <p>Bu ifadeye uyan kayıt bulunamadı.</p>}
          </div>
        ) : (
          <div className="query-examples">
            {[
              "Geçen ay izlediğim eğitim videoları",
              "Beğendiğim ama yarım bıraktığım videolar",
              "Pişman olduğum uzun videolar",
              "Son iki haftadaki Shorts videoları",
            ].map((example) => (
              <button key={example} onClick={() => setQuery(example)}>{example}</button>
            ))}
          </div>
        )}
      </section>

      {/* Bilgi haritası + yeniden izleme */}
      <div className="intelligence-columns">
        <section className="surface knowledge-map">
          <div className="section-head">
            <div>
              <h2><Network size={18} /> Bilgi ve ilgi haritası</h2>
              <p>Konuların derinliği ve birbiriyle bağlantısı.</p>
            </div>
          </div>
          <div className="knowledge-nodes">
            {knowledge.nodes.slice(0, 12).map((node) => (
              <article
                key={node.topic}
                style={{ "--node-size": `${Math.max(78, Math.min(145, 70 + node.videoCount * 10))}px` } as CSSProperties}
              >
                <strong>{node.topic}</strong>
                <span>{node.videoCount} video</span>
                <small>Derinlik {node.depth}/100</small>
              </article>
            ))}
          </div>
          {knowledge.edges.length ? (
            <div className="knowledge-edges">
              {knowledge.edges.slice(0, 7).map((edge) => (
                <span key={`${edge.source}-${edge.target}`}>
                  {edge.source} ↔ {edge.target}
                  <b>{edge.strength} ortak video</b>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className="surface revisit-list">
          <div className="section-head">
            <div>
              <h2><RefreshCw size={18} /> Yeniden bakmaya değer</h2>
              <p>Yarım kalan, sardığın veya bilgi yoğun videolar.</p>
            </div>
          </div>
          {revisit.length ? revisit.slice(0, 6).map((item) => (
            <a href={item.video.url} target="_blank" key={item.video.videoId}>
              <img src={item.video.thumbnailUrl} alt="" />
              <span>
                <strong>{item.video.title}</strong>
                <small>{item.reason}</small>
              </span>
              <b>{item.score}</b>
            </a>
          )) : <p className="soft-empty">Henüz güçlü bir yeniden izleme adayı yok.</p>}
        </section>
      </div>

      {/* Başlık-içerik tutarlılığı */}
      {transcriptVideos.length ? (
        <section className="surface transcript-library">
          <div className="section-head">
            <div>
              <h2>Başlık–içerik tutarlılığı</h2>
              <p>Altyazıdaki kavramlarla videonun vaadini karşılaştırır.</p>
            </div>
          </div>
          <div>
            {transcriptVideos.map((video) => {
              const t = video.transcriptAnalysis!;
              return (
                <article key={video.videoId}>
                  <span className={`promise-${t.promiseVerdict}`}>{promiseLabel(t.promiseVerdict)}</span>
                  <strong>{video.title}</strong>
                  <p>{t.summary}</p>
                  <dl>
                    <div><dt>Vaat kapsamı</dt><dd>%{t.titlePromiseCoverage}</dd></div>
                    <div><dt>Bilgi yoğunluğu</dt><dd>{t.informationDensity}/100</dd></div>
                    <div><dt>Tekrar</dt><dd>%{t.repetitionRate}</dd></div>
                  </dl>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}
    </>
  );
}

// ── Kişisel Model Ağırlık Kartı ────────────────────────────────────────────

/**
 * Modelin kör noktası: puan verip kullanıcının AÇMADIĞI kartlar. Doğruluk
 * kartı yalnızca izlenen videoları ölçer ve bu, modeli olduğundan iyi
 * gösterir. Burada ölçülen şey farklı bir soru: puan, hangi videoyu açacağını
 * gerçekten öngörüyor mu?
 */
function SelectionBiasCard({ report }: { report?: SelectionBiasReport }) {
  if (!report) return null;
  const strong = report.discrimination >= .58;
  // İki yuvarlanmış sayının farkı yuvarlanmış değildir: ham çıkarma ekranda
  // "+20.799999999999997" gibi görünüyordu.
  const scoreGap = round(report.openedAverageScore - report.skippedAverageScore);
  return (
    <section className="surface selection-bias-card">
      <div className="section-head">
        <div>
          <h2><Target size={16} /> Seçim yanlılığı</h2>
          <p>
            Keşfette gösterilen kartların kaçını açtığın. Modelin yalnızca
            izlediğin videolardan öğrenmesi, kendi önerilerinin tutup tutmadığını
            görmesini engelliyordu.
          </p>
        </div>
        <span>{report.shown} gösterim</span>
      </div>

      {report.enoughData ? (
        <>
          <div className="bias-summary">
            <div>
              <small>Ayırt etme gücü</small>
              <strong className={strong ? "good" : "warn"}>{report.discrimination.toFixed(2)}</strong>
              <p>{discriminationLabel(report.discrimination)}</p>
            </div>
            <div>
              <small>Açılma oranı</small>
              <strong>%{report.openRate}</strong>
              <p>{report.opened} / {report.shown} kart açıldı</p>
            </div>
            <div>
              <small>Puan farkı</small>
              <strong>{scoreGap > 0 ? "+" : ""}{scoreGap}</strong>
              <p>Açtıkların %{report.openedAverageScore}, atladıkların %{report.skippedAverageScore}</p>
            </div>
          </div>

          <div className="bias-bands">
            {report.bands.filter((band) => band.shown > 0).map((band) => (
              <div key={band.label} className="bias-band-row">
                <span>{band.label} puan</span>
                <div className="bias-band-bar-wrap">
                  <div className="bias-band-bar" style={{ width: `${band.openRate}%` }} />
                </div>
                <b>%{band.openRate}</b>
                <small>{band.shown} kart</small>
              </div>
            ))}
          </div>

          {report.overconfident > 0 ? (
            <p className="model-notice warn">
              {report.overconfident} kart 75 puan üzerinde önerildi ama açılmadı. Bunlar modelin fazla
              güvendiği yerler — ama "açmadın" ile "beğenmedin" aynı şey değil: kartı hiç görmemiş,
              sonraya bırakmış veya başka cihazda izlemiş olabilirsin.
            </p>
          ) : null}
        </>
      ) : (
        <p className="model-notice">
          Ölçüm için en az 20 gösterim ve hem açılmış hem atlanmış kart gerekiyor.
          Şu ana kadar {report.shown} kart kaydedildi.
        </p>
      )}
    </section>
  );
}

function ModelWeightsCard({
  model,
  accuracy,
}: {
  model: PersonalModel;
  accuracy: {
    accuracyRate: number;
    sampleCount: number;
    improving: boolean;
    beatsBaseline: boolean;
    skillPercent: number;
    weightsLearned: boolean;
    backtest: { sampleCount: number; meanAbsoluteError: number; baselineMeanAbsoluteError: number; hitRate: number };
  };
}) {
  const signals: { key: keyof typeof model.weights; label: string; color: string }[] = [
    { key: "channel", label: "Kanal geçmişi", color: chartAccent },
    { key: "topic", label: "Konu ilgisi", color: chartSeries[1] },
    { key: "duration", label: "Süre uyumu", color: chartSeries[2] },
    { key: "title", label: "Başlık biçimi", color: chartSeries[1] },
    { key: "format", label: "Video formatı", color: chartSeries[4] },
  ];

  return (
    <section className="surface model-weights-card">
      <div className="section-head">
        <div>
          <h2><Sparkles size={16} /> Kişisel model ağırlıkları</h2>
          <p>
            {accuracy.weightsLearned
              ? "Ağırlıklar geçmişin ilk diliminde aranıp hatayı en aza indirecek şekilde seçildi."
              : "Ağırlıklar henüz öncülde: arama için en az 25 ölçülebilir kayıt gerekiyor."}
          </p>
        </div>
        <div className="model-meta">
          {model.outcomeAccuracy !== undefined ? (
            <span className={`model-accuracy ${model.outcomeAccuracy >= 0.6 ? "good" : model.outcomeAccuracy >= 0.4 ? "mid" : "low"}`}>
              Sonuç doğruluğu %{round(model.outcomeAccuracy * 100)}
            </span>
          ) : null}
          <span className="model-gen">
            {model.adaptationGeneration > 0 ? `${model.adaptationGeneration}. nesil` : "İlk nesil"}
          </span>
        </div>
      </div>
      <div className="model-signals">
        {signals.map(({ key, label, color }) => {
          const weight = model.weights[key];
          const reliability = model.reliability[key];
          return (
            <div key={key} className="model-signal-row">
              <div className="model-signal-label">
                <span>{label}</span>
                <small>güvenilirlik %{round(reliability * 100)}</small>
              </div>
              <div className="model-signal-bar-wrap">
                <div
                  className="model-signal-bar"
                  style={{ width: `${round(weight * 100)}%`, background: color }}
                />
              </div>
              <b className="model-signal-weight">{round(weight * 100)}%</b>
            </div>
          );
        })}
      </div>
      {accuracy.backtest.sampleCount >= 5 ? (
        <p className={`model-notice ${accuracy.beatsBaseline ? "good" : "warn"}`}>
          {accuracy.beatsBaseline
            ? `Dürüst sınama: ${accuracy.backtest.sampleCount} kayıtta ortalama hata ${accuracy.backtest.meanAbsoluteError} puan, taban modelin hatası ${accuracy.backtest.baselineMeanAbsoluteError} puan. Model tabanın %${accuracy.skillPercent} altında hata yapıyor.`
            : `Dürüst sınama: model (${accuracy.backtest.meanAbsoluteError} puan hata) "hep kişisel ortalamayı söyle" tabanını (${accuracy.backtest.baselineMeanAbsoluteError} puan) henüz geçemiyor. Tahminler tabana yaklaştırılarak gösteriliyor.`}
        </p>
      ) : null}
      {model.sampleCount < 8 ? (
        <p className="model-notice">
          Model henüz öğreniyor. {Math.max(0, 8 - model.sampleCount)} video sonra daha güvenilir ağırlıklar oluşur.
        </p>
      ) : accuracy.improving ? (
        <p className="model-notice good">
          ↑ Model son örneklerde önceki örneklere kıyasla daha isabetli tahmin yapıyor.
        </p>
      ) : null}
    </section>
  );
}

// ── Yardımcılar ─────────────────────────────────────────────────────────────

function confidenceLabel(value: "low" | "medium" | "high") {
  return value === "high" ? "Yüksek" : value === "medium" ? "Orta" : "Düşük";
}

function promiseLabel(value: "fulfilled" | "partial" | "weak" | "unknown") {
  return value === "fulfilled"
    ? "Vaat karşılandı"
    : value === "partial"
    ? "Kısmen karşılandı"
    : value === "weak"
    ? "Zayıf eşleşme"
    : "Belirsiz";
}
