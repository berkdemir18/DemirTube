// DemirTube Aurora UI v2 · unified dashboard visual system
import { useMemo, useState, type CSSProperties } from "react";
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
          <p>{accuracy.sampleCount} sonuç · ortalama hata {accuracy.meanAbsoluteError} puan</p>
        </article>
        <article>
          <Gauge />
          <small>Kişisel model</small>
          <strong>{confidenceLabel(model.confidence)}</strong>
          <p>En güçlü sinyal: {strongestModelSignal(model).label}</p>
        </article>
        <article>
          <TrendingUp />
          <small>Model durumu</small>
          <strong>
            {model.sampleCount < 6
              ? "Öğreniyor"
              : accuracy.improving
              ? "Gelişiyor ↑"
              : "Kalibre oluyor"}
          </strong>
          <p>
            {model.adaptationGeneration > 0
              ? `${model.adaptationGeneration}. nesil · ${model.sampleCount} örnek`
              : `${model.sampleCount} davranış örneği birikiyor`}
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

function ModelWeightsCard({
  model,
  accuracy,
}: {
  model: PersonalModel;
  accuracy: { accuracyRate: number; sampleCount: number; improving: boolean };
}) {
  const signals: { key: keyof typeof model.weights; label: string; color: string }[] = [
    { key: "channel", label: "Kanal geçmişi", color: "#8b5cf6" },
    { key: "topic", label: "Konu ilgisi", color: "#00c9d4" },
    { key: "duration", label: "Süre uyumu", color: "#10b981" },
    { key: "title", label: "Başlık biçimi", color: "#f59e0b" },
    { key: "format", label: "Video formatı", color: "#c4b5fd" },
  ];

  return (
    <section className="surface model-weights-card">
      <div className="section-head">
        <div>
          <h2><Sparkles size={16} /> Kişisel model ağırlıkları</h2>
          <p>Model izledikçe bu ağırlıkları gerçek tahmin hatalarına göre ayarlar.</p>
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
