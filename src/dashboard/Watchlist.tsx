// DemirTube Aurora UI v2 · unified dashboard visual system
import { useEffect, useState } from "react";
import { Archive, BookmarkCheck, ExternalLink, Trash2 } from "lucide-react";
import { sendMessage } from "../shared/messages";
import type { WatchlistItem } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { Empty, PageHeading } from "./ui";

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

export function Watchlist({ items, onRemove }: { items: WatchlistItem[]; onRemove: (videoId: string) => void }) {
  const [archive, setArchive] = useState<ArchivedItem[]>([]);
  const extensionAvailable = Boolean(globalThis.chrome?.runtime?.id);

  useEffect(() => {
    if (!extensionAvailable) return;
    void sendMessage<ArchivedItem[] | null>({ type: "WATCHLIST_ARCHIVE_GET" })
      .then((list) => { if (Array.isArray(list)) setArchive(list); })
      .catch(() => undefined);
  }, [extensionAvailable, items]);

  const staleCount = items.filter((item) => staleDays(item.addedAt) >= STALE_DAYS).length;
  const stats = archiveStats(archive);

  return <><PageHeading eyebrow="SONRA İZLE" title="Kişisel Listem" copy="Keşfet rozetinden veya video içi koçtan kaydettiğin videolar burada durur." />
    {staleCount > 0 ? (
      <p className="watchlist-stale-notice">⏳ {staleCount} video {STALE_DAYS}+ gündür bekliyor — izle ya da listeden çıkar, arşivi unutmaz.</p>
    ) : null}
    {items.length ? <section className="watchlist-grid premium-grid">{items.map((item) => {
      const days = staleDays(item.addedAt);
      return <article key={item.videoId}><span><BookmarkCheck size={18}/></span><div><small>{item.topics.join(" · ") || "Konu bekleniyor"}</small><h2>{item.title}</h2><p>{item.channelName} · {formatDuration(item.durationSeconds)}{days >= STALE_DAYS ? <em className="watchlist-stale-badge"> · ⏳ {days} gündür bekliyor</em> : null}</p></div><a href={item.url} target="_blank" rel="noreferrer" aria-label="Videoyu aç"><ExternalLink size={16}/></a><button onClick={() => onRemove(item.videoId)} aria-label="Listeden kaldır"><Trash2 size={16}/></button></article>;
    })}</section> : <Empty>Henüz listene video eklemedin. YouTube’da bir DemirTube rozetine veya video içi koçtaki “Kişisel listeme ekle” düğmesine bas.</Empty>}

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
