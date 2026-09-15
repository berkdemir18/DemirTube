// DemirTube · Perde › Öneri
//
// Puan bir kara kutudan gelmiyor: her kart hangi sevdiğin yapımdan geldiğini,
// hangi türüne uyduğunu ve nerede zayıf olduğunu yazıyor. Kullanıcının her
// tepkisi (listeye ekle, ilgilenmiyorum, izledim) motoru anında düzeltir.
import { useEffect, useMemo, useState } from "react";
import { Check, Heart, RefreshCw, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { sendMessage } from "../shared/messages";
import { scoreRecommendations, tasteProfile, type Recommendation } from "../media/recommend";
import type { MediaLibrary, MediaStatus, RecPool, WatchProviders } from "../media/types";
import { TMDB_IMAGE } from "../media/tmdb";
import { decimal, poster } from "./media-format";

type Props = {
  library: MediaLibrary;
  status: MediaStatus;
  pool: RecPool | null | undefined;
  poolError?: string;
  refreshing: boolean;
  onRefresh: () => void;
  onChanged: () => Promise<void>;
  onOpen: (key: string) => void;
};

type KindFilter = "all" | "tv" | "movie";

export function MediaRecommend({ library, status, pool, poolError, refreshing, onRefresh, onChanged }: Props) {
  const [kind, setKind] = useState<KindFilter>("all");
  const [busy, setBusy] = useState<string>();
  const now = useMemo(() => new Date(), [library]);
  const profile = useMemo(() => tasteProfile(library, now), [library, now]);
  const all = useMemo(() => (pool ? scoreRecommendations(library, pool, now) : []), [library, pool, now]);
  const visible = all.filter((item) => kind === "all" || item.candidate.kind === kind);
  const [top, ...rest] = visible;

  const act = async (item: Recommendation, action: "favorite" | "dismiss" | "liked" | "disliked") => {
    setBusy(item.key);
    try {
      const result = { ...item.candidate, genreNames: item.genres };
      if (action === "favorite") await sendMessage({ type: "MEDIA_TOGGLE_FAVORITE", result });
      else if (action === "dismiss") await sendMessage({ type: "MEDIA_DISMISS", result });
      else await sendMessage({ type: "MEDIA_RATE", result, rating: action });
      await onChanged();
    } finally { setBusy(undefined); }
  };

  if (!status.hasApiKey) return <Notice title="Öneri için TMDB anahtarı gerekiyor" copy="İzleme takibi anahtarsız da çalışıyor, ama öneri listeleri TMDB'den geliyor. Anahtarı İzliyorum sekmesinden girebilirsin." />;
  if (pool === null && !profile.loved.length) return <Notice title="Önce neyi sevdiğini görmem lazım" copy="Birkaç bölüm bitir, bir filmi sonuna kadar izle ya da bir yapımın ayrıntısında beğendim de. Öneriler sevdiğin yapımların etrafından toplanıyor; boş zevkten öneri çıkarmak falcılık olur." />;
  if (poolError) return <Notice title="Öneriler alınamadı" copy={poolError} />;
  if (pool === undefined) return <Notice title="Öneriler hazırlanıyor" copy="Sevdiğin yapımların TMDB öneri listeleri toplanıyor…" />;

  return <div className="perde-recs">
    <section className="perde-taste">
      <div className="perde-taste-copy">
        <span className="media-eyebrow"><Sparkles size={13} />NEYE GÖRE ÖNERİYORUM</span>
        <h2>{profile.loved.length} sevdiğin yapımın etrafından {all.length} öneri.</h2>
        <p>Sevgiyi davranışından çıkarıyorum: bitirdiğin ve art arda izlediğin artı, ilk bölümlerde bıraktığın eksi. Açıkça "beğendim" ya da "beğenmedim" dediğin her şey bunu ezer.</p>
      </div>
      <div className="perde-taste-lists">
        <div>
          <small>Sevdiklerin</small>
          <ul>{profile.loved.slice(0, 6).map((item) => <li key={item.title.key} title={item.basis}>
            {poster(item.title.posterPath, "w92") ? <img src={poster(item.title.posterPath, "w92")} alt="" /> : null}
            <span><b>{item.title.name}</b><em>{item.basis}</em></span>
          </li>)}</ul>
        </div>
        {profile.disliked.length ? <div>
          <small>Seni tutmayanlar</small>
          <ul>{profile.disliked.slice(0, 3).map((item) => <li key={item.title.key} className="cold">
            {poster(item.title.posterPath, "w92") ? <img src={poster(item.title.posterPath, "w92")} alt="" /> : null}
            <span><b>{item.title.name}</b><em>{item.basis}</em></span>
          </li>)}</ul>
        </div> : null}
        <div className="perde-taste-genres">
          <small>Tür zevkin</small>
          <ul>{profile.genres.filter((genre) => Math.abs(genre.weight) >= 0.05).slice(0, 7).map((genre) => <li key={genre.name}>
            <span>{genre.name}</span>
            <span className={`perde-diverge ${genre.weight < 0 ? "neg" : ""}`}><i style={{ width: `${Math.min(50, Math.abs(genre.weight) * 60)}%` }} /></span>
          </li>)}</ul>
        </div>
      </div>
    </section>

    <div className="perde-recs-bar">
      <div className="perde-chips" role="tablist" aria-label="Tür">
        {([["all", "Hepsi"], ["tv", "Dizi"], ["movie", "Film"]] as [KindFilter, string][]).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={kind === id} className={kind === id ? "on" : ""} onClick={() => setKind(id)}>
          {label}<span>{all.filter((item) => id === "all" || item.candidate.kind === id).length}</span>
        </button>)}
      </div>
      <button type="button" className="media-button" onClick={onRefresh} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "spin" : ""} />{refreshing ? "Yenileniyor…" : "Önerileri yenile"}</button>
    </div>

    {top ? <TopPick item={top} busy={busy === top.key} onAct={act} /> : <p className="media-note">Bu filtrede öneri kalmadı.</p>}

    {rest.length ? <div className="perde-rec-grid">{rest.slice(0, 23).map((item) => <RecCard key={item.key} item={item} busy={busy === item.key} onAct={act} />)}</div> : null}
    <p className="perde-foot">Öneri listeleri ve puanlar TMDB'den; uyum puanını senin geçmişinle DemirTube hesaplıyor. Liste 12 saatte bir tazeleniyor.</p>
  </div>;
}

function Notice({ title, copy }: { title: string; copy: string }) {
  return <section className="perde-empty"><Sparkles size={22} /><h2>{title}</h2><p>{copy}</p></section>;
}

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const radius = size / 2 - 5;
  const circumference = 2 * Math.PI * radius;
  return <span className="perde-ring" style={{ width: size, height: size }} aria-label={`%${score} uyum`}>
    <svg viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} className="track" />
      <circle cx={size / 2} cy={size / 2} r={radius} className="value" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - score / 100)} />
    </svg>
    <b>{score}</b>
  </span>;
}

type ActProps = { item: Recommendation; busy: boolean; onAct: (item: Recommendation, action: "favorite" | "dismiss" | "liked" | "disliked") => Promise<void> };

function useProviderLogos(item: Recommendation, enabled: boolean) {
  const [providers, setProviders] = useState<WatchProviders>();
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    sendMessage<WatchProviders>({ type: "MEDIA_PROVIDERS", kind: item.candidate.kind, tmdbId: item.candidate.tmdbId }).then((value) => { if (active) setProviders(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [enabled, item.candidate.kind, item.candidate.tmdbId]);
  return providers;
}

function Actions({ item, busy, onAct, compact = false }: ActProps & { compact?: boolean }) {
  const [watched, setWatched] = useState(false);
  if (watched) return <div className="perde-rec-actions">
    <span className="perde-rec-ask">Nasıldı?</span>
    <button type="button" className="media-button" disabled={busy} onClick={() => void onAct(item, "liked")}><ThumbsUp size={15} />Beğendim</button>
    <button type="button" className="media-button" disabled={busy} onClick={() => void onAct(item, "disliked")}><ThumbsDown size={15} />Beğenmedim</button>
    <button type="button" className="media-icon" onClick={() => setWatched(false)} aria-label="Vazgeç"><X size={15} /></button>
  </div>;
  return <div className="perde-rec-actions">
    <button type="button" className={compact ? "media-icon" : "media-button primary"} disabled={busy} onClick={() => void onAct(item, "favorite")} aria-label="Listeme ekle"><Heart size={15} />{compact ? null : "Listeme ekle"}</button>
    <button type="button" className={compact ? "media-icon" : "media-button"} disabled={busy} onClick={() => setWatched(true)} aria-label="Zaten izledim"><Check size={15} />{compact ? null : "Zaten izledim"}</button>
    <button type="button" className={compact ? "media-icon" : "media-button"} disabled={busy} onClick={() => void onAct(item, "dismiss")} aria-label="İlgilenmiyorum"><X size={15} />{compact ? null : "İlgilenmiyorum"}</button>
  </div>;
}

function TopPick({ item, busy, onAct }: ActProps) {
  const art = poster(item.candidate.backdropPath, "w1280") ?? poster(item.candidate.posterPath, "w780");
  const providers = useProviderLogos(item, true);
  return <article className="perde-top-pick">
    {art ? <img className="perde-top-art" src={art} alt="" /> : null}
    <div className="perde-top-copy">
      <div className="perde-top-head">
        <ScoreRing score={item.score} size={76} />
        <div>
          <span className="media-eyebrow">EN İYİ EŞLEŞME</span>
          <h2>{item.candidate.name}</h2>
          <p className="perde-top-meta">{[item.candidate.kind === "tv" ? "Dizi" : "Film", item.candidate.year, item.candidate.voteAverage ? `★ ${decimal(item.candidate.voteAverage)}` : undefined, item.genres.slice(0, 3).join(", ")].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      {item.candidate.overview ? <p className="perde-top-overview">{item.candidate.overview}</p> : null}
      <ul className="perde-reasons">{item.reasons.map((reason) => <li key={reason} className={reason.startsWith("Dikkat") ? "warn" : ""}>{reason}</li>)}</ul>
      <Signals item={item} />
      {providers?.flatrate.length ? <div className="perde-top-where"><small>Türkiye'de abonelikle</small>{providers.flatrate.slice(0, 5).map((provider) => provider.logoPath ? <img key={provider.id} src={`${TMDB_IMAGE}/w92${provider.logoPath}`} alt={provider.name} title={provider.name} /> : <em key={provider.id}>{provider.name}</em>)}</div> : null}
      <Actions item={item} busy={busy} onAct={onAct} />
    </div>
  </article>;
}

function Signals({ item }: { item: Recommendation }) {
  const rows: [string, number][] = [["Sevdiklerinle bağ", item.signals.seeds], ["Tür uyumu", item.signals.taste], ["Kendi kalitesi", item.signals.quality]];
  return <dl className="perde-signals">{rows.map(([label, value]) => <div key={label}>
    <dt>{label}</dt><dd><span className="perde-meter"><i style={{ width: `${Math.round(value * 100)}%` }} /></span></dd>
  </div>)}</dl>;
}

function RecCard({ item, busy, onAct }: ActProps) {
  return <article className="perde-rec">
    <div className="perde-rec-art">
      {poster(item.candidate.posterPath) ? <img src={poster(item.candidate.posterPath)} alt="" loading="lazy" /> : null}
      <ScoreRing score={item.score} size={46} />
    </div>
    <b>{item.candidate.name}</b>
    <small>{[item.candidate.kind === "tv" ? "Dizi" : "Film", item.candidate.year, item.candidate.voteAverage ? `★ ${decimal(item.candidate.voteAverage)}` : undefined].filter(Boolean).join(" · ")}</small>
    <p className="perde-rec-reason">{item.reasons[0]}</p>
    {item.reasons.find((reason) => reason.startsWith("Dikkat")) ? <p className="perde-rec-reason warn">{item.reasons.find((reason) => reason.startsWith("Dikkat"))}</p> : null}
    <Actions item={item} busy={busy} onAct={onAct} compact />
  </article>;
}
