// DemirTube Aurora UI v2 · unified dashboard visual system
import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { sendMessage } from "../shared/messages";
import type { WatchlistItem } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { Empty, PageHeading } from "./ui";
import { buildWatchPlan, usefulnessSummary } from "../analytics/watch-plan";
import { intentLabels } from "./LearningCard";
import type { WatchIntent } from "../shared/types";

import { WatchlistVideo, type ListPresentation } from "./WatchlistVideo";

type ArchivedItem = WatchlistItem & { removedAt: string };

const DAY_MS = 86_400_000;
const STALE_DAYS = 7;

function staleDays(addedAt: string) {
  const days = Math.floor((Date.now() - new Date(addedAt).getTime()) / DAY_MS);
  return Number.isFinite(days) ? days : 0;
}

function archiveStats(archive: ArchivedItem[]) {
  const countBy = (keyOf: (item: ArchivedItem) => string[]) => {
    const counts = new Map<string, number>();
    for (const item of archive) for (const key of keyOf(item)) counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts.entries()].toSorted((a, b) => b[1] - a[1]);
  };
  return {
    channels: countBy((item) => [item.channelName]).slice(0, 3),
    topics: countBy((item) => item.topics.length ? item.topics : ["Konu yok"]).slice(0, 3)
  };
}

export function Watchlist({ items, onRemove, onUpdated }: { items: WatchlistItem[]; onRemove: (videoId: string) => void; onUpdated: () => Promise<void> }) {
  const [presentations, setPresentations] = useState<ListPresentation[]>([]);
  const [scoreLoading, setScoreLoading] = useState(true);
  const [scoreFailed, setScoreFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(items);
  useEffect(() => setCurrent(items), [items]);
  const [minutes, setMinutes] = useState(25);
  const [intent, setIntent] = useState<WatchIntent>("open");
  const plan = buildWatchPlan(current, minutes, intent);
  const save = async (item: WatchlistItem) => {
    const { note, noteSeconds, intent, learningStage, reviewOn, useful } = item;
    const next = await sendMessage<WatchlistItem[]>({ type: "WATCHLIST_UPDATE", videoId: item.videoId, patch: { note, noteSeconds, intent, learningStage, reviewOn, useful } });
    setCurrent(next);
    await onUpdated();
  };
  const [archive, setArchive] = useState<ArchivedItem[]>([]);
  const extensionAvailable = Boolean(globalThis.chrome?.runtime?.id);

  useEffect(() => {
    if (!extensionAvailable) return;
    void sendMessage<ArchivedItem[] | null>({ type: "WATCHLIST_ARCHIVE_GET" })
      .then((list) => { if (Array.isArray(list)) setArchive(list); })
      .catch(() => undefined);
  }, [extensionAvailable, items]);

  useEffect(() => {
    let active = true;
    setScoreLoading(true); setScoreFailed(false);
    sendMessage<ListPresentation[]>({ type: "WATCHLIST_PRESENTATION" }).then(result => { if (active) setPresentations(result); }).catch(() => { if (active) setScoreFailed(true); }).finally(() => { if (active) setScoreLoading(false); });
    return () => { active = false; };
  }, [items]);

  const visible = current.filter(item => ((presentations.find(p => p.videoId === item.videoId)?.title || item.title) + " " + item.channelName + " " + item.topics.join(" ")).toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR")));
  const staleCount = items.filter((item) => staleDays(item.addedAt) >= STALE_DAYS).length;
  const stats = archiveStats(archive);
  const benefit = usefulnessSummary([...current, ...archive.filter(old => !current.some(item => item.videoId === old.videoId))], intent);
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
  const due = current.filter(item => item.reviewOn && item.reviewOn <= today);

  return <><PageHeading eyebrow="SONRA İZLE" title="Kişisel Listem" copy="Keşfet rozetinden veya video içi koçtan kaydettiğin videolar burada durur." />
    <section className="surface watch-planner"><h2>Şimdi ne izleyeyim?</h2>
      <div className="report-actions"><label>Ayırdığım dakika <input type="number" min="1" max="240" value={minutes} onChange={e => setMinutes(Math.max(1, Math.min(240, Number(e.target.value) || 1)))} /></label>
      <label>Amacım <select value={intent} onChange={e => setIntent(e.target.value as WatchIntent)}>{Object.entries(intentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      <p>{formatDuration(plan.reduce((sum, item) => sum + item.durationSeconds, 0))} için hazır · {plan.length} video</p>
      {plan.length ? <ol>{plan.map(item => <li key={item.videoId}><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a></li>)}</ol> : <p>Bu süre ve amaca uygun video yok. Süreyi artır veya videoların amacını işaretle.</p>}
      <p>{benefit.count ? `Faydalı bulduğun seçimler: %${benefit.percent} · ${benefit.count} yanıt. Bu, tamamlanma tahmini doğruluğu değildir.` : "Fayda ölçümü için aşağıdaki videoları değerlendir."}</p>
      {due.length > 0 && <p role="status">Tekrar zamanı: {due.map(item => item.title).join(" · ")}. Hatırlatmalar bu ekranda gösterilir.</p>}
    </section>
    {staleCount > 0 ? (
      <p className="watchlist-stale-notice">⏳ {staleCount} video {STALE_DAYS}+ gündür bekliyor — izle ya da listeden çıkar, arşivi unutmaz.</p>
    ) : null}
    <div className="saved-library-toolbar"><div><h2>Kaydettiğin videolar</h2><span>{visible.length} video</span></div><input type="search" aria-label="Listemde ara" placeholder="Video, kanal veya konu ara" value={query} onChange={e => setQuery(e.target.value)} /></div>
    {visible.length ? <section className="saved-video-grid">{visible.map(item => <WatchlistVideo key={item.videoId} item={item} presentation={presentations.find(p => p.videoId === item.videoId)} loading={scoreLoading} failed={scoreFailed} onSave={save} onRemove={onRemove} />)}</section> : <Empty>{current.length ? "Aramana uygun video bulunamadı." : "YouTube’da bir videoyu kişisel listene ekleyerek başla."}</Empty>}

    {archive.length ? (
      <section className="surface watchlist-archive">
        <div className="section-head" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <Archive size={16} />
          <div><strong>Geçmiş (istatistikler saklanır)</strong><small style={{ display: "block", color: "var(--muted)" }}>{archive.length} kaldırılmış video — kanal ve konu verisi unutulmaz.</small></div>
        </div>
        <p className="watchlist-archive-stats">
          En çok eklenen kanallar: {stats.channels.map(([name, count]) => `${name} (${count})`).join(" · ") || "—"}<br />
          Konular: {stats.topics.map(([name, count]) => `${name} (${count})`).join(" · ") || "—"}
        </p>
        <ul className="watchlist-archive-list">
          {archive.slice(0, 8).map((item) => (
            <li key={`${item.videoId}-${item.removedAt}`}>
              <span>{item.title}</span>
              <small>{item.channelName} · {new Date(item.removedAt).toLocaleDateString("tr-TR")}</small>
            </li>
          ))}
        </ul>
      </section>
    ) : null}
  </>;
}
