// DemirTube · Perde › Kütüphane
import { useMemo, useState } from "react";
import { Clapperboard, Heart } from "lucide-react";
import { formatDuration } from "../shared/utils";
import { titleSummaries, type TitleSummary } from "../media/insights";
import type { MediaLibrary } from "../media/types";
import { decimal, poster, relativeDay } from "./media-format";

type Filter = "all" | "watching" | "stalled" | "finished" | "favorite" | "tv" | "movie";
type Sort = "recent" | "time" | "rating" | "name";

const FILTERS: [Filter, string][] = [["all", "Hepsi"], ["watching", "İzliyorum"], ["stalled", "Yarıda"], ["finished", "Bitti"], ["favorite", "Favori"], ["tv", "Dizi"], ["movie", "Film"]];
const STATUS_LABEL: Record<TitleSummary["status"], string> = { watching: "İzliyorsun", stalled: "Yarıda", finished: "Bitti", planned: "Listende" };

export function MediaLibraryGrid({ library, onOpen }: { library: MediaLibrary; onOpen: (key: string) => void }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("recent");
  const summaries = useMemo(() => titleSummaries(library), [library]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map(([id]) => [id, summaries.filter((item) => matches(item, id)).length])) as Record<Filter, number>, [summaries]);
  const visible = useMemo(() => summaries.filter((item) => matches(item, filter)).toSorted(sorter(sort)), [summaries, filter, sort]);
  const total = summaries.reduce((sum, item) => sum + item.watchedSeconds, 0);

  return <div className="perde-library">
    <div className="perde-library-bar">
      <p><b>{summaries.length}</b> yapım · toplam <b>{formatDuration(total)}</b></p>
      <div className="perde-chips" role="tablist" aria-label="Filtre">
        {FILTERS.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={filter === id} className={filter === id ? "on" : ""} onClick={() => setFilter(id)} disabled={id !== "all" && counts[id] === 0}>
          {label}<span>{counts[id]}</span>
        </button>)}
      </div>
      <label className="perde-sort">Sırala
        <select value={sort} onChange={(event) => setSort(event.target.value as Sort)}>
          <option value="recent">Son izlenen</option>
          <option value="time">En çok zaman</option>
          <option value="rating">TMDB puanı</option>
          <option value="name">Ada göre</option>
        </select>
      </label>
    </div>

    {visible.length ? <div className="perde-library-grid">{visible.map((item) => <button type="button" key={item.title.key} className="perde-tile" onClick={() => onOpen(item.title.key)}>
      <span className="perde-tile-art">
        {poster(item.title.posterPath) ? <img src={poster(item.title.posterPath)} alt="" loading="lazy" /> : <Clapperboard />}
        <em className={`perde-status ${item.status}`}>{STATUS_LABEL[item.status]}</em>
        {item.title.favorite ? <Heart className="perde-tile-fav" size={16} /> : null}
        {item.percent !== undefined ? <i className="perde-tile-bar" style={{ width: `${item.percent}%` }} /> : null}
      </span>
      <b>{item.title.name}</b>
      <small>{[item.title.kind === "tv" ? "Dizi" : item.title.kind === "movie" ? "Film" : "Eşleşmedi", item.title.year, item.title.voteAverage ? `★ ${decimal(item.title.voteAverage)}` : undefined].filter(Boolean).join(" · ")}</small>
      <small>{item.watchedSeconds ? `${formatDuration(item.watchedSeconds)}${item.lastWatchedAt ? ` · ${relativeDay(item.lastWatchedAt)}` : ""}` : "Henüz izlenmedi"}</small>
      {item.title.genres?.length ? <span className="perde-tile-genres">{item.title.genres.slice(0, 2).join(" · ")}</span> : null}
    </button>)}</div> : <p className="media-note">Bu filtrede bir şey yok.</p>}
  </div>;
}

function matches(item: TitleSummary, filter: Filter) {
  switch (filter) {
    case "all": return true;
    case "favorite": return item.title.favorite;
    case "tv": return item.title.kind === "tv";
    case "movie": return item.title.kind === "movie";
    default: return item.status === filter;
  }
}

function sorter(sort: Sort) {
  return (a: TitleSummary, b: TitleSummary) => {
    switch (sort) {
      case "time": return b.watchedSeconds - a.watchedSeconds;
      case "rating": return (b.title.voteAverage ?? 0) - (a.title.voteAverage ?? 0);
      case "name": return a.title.name.localeCompare(b.title.name, "tr-TR");
      default: return (b.lastWatchedAt ?? b.title.addedAt).localeCompare(a.lastWatchedAt ?? a.title.addedAt);
    }
  };
}
