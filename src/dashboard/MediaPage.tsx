// DemirTube · Perde ekranı (film ve dizi)
//
// YouTube dışındaki sitelerde izlenenler: kaldığın yer, sıradaki bölüm,
// favoriler ve Türkiye'de nerede izlenebildiği.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, ArrowUpRight, BarChart3, CalendarClock, Check, ChevronLeft, ChevronRight, Clapperboard, Heart, KeyRound, Library, Link2, Play, Search, Sparkles, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { sendMessage } from "../shared/messages";
import type { WatchSession } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { continueWatching, nextUp, siteLabel, type ContinueItem, type NextUp } from "../media/library";
import { scoreRecommendations, upcomingEpisodes, type Recommendation, type UpcomingEpisode } from "../media/recommend";
import { TMDB_IMAGE } from "../media/tmdb";
import type { MediaLibrary, MediaProgress, MediaStatus, MediaTitle, RecPool, TmdbSearchResult, WatchProviders } from "../media/types";
import { MediaInsights } from "./MediaInsights";
import { MediaLibraryGrid } from "./MediaLibraryGrid";
import { MediaRecommend } from "./MediaRecommend";
import { MediaTrakt } from "./MediaTrakt";
import { episodeLabel, nextLabel, poster, relativeDay } from "./media-format";

type Loaded = { library: MediaLibrary; status: MediaStatus };
type Tab = "watching" | "recs" | "insights" | "library";

const TABS: { id: Tab; label: string; icon: typeof Play }[] = [
  { id: "watching", label: "İzliyorum", icon: Play },
  { id: "recs", label: "Öneri", icon: Sparkles },
  { id: "insights", label: "Analiz", icon: BarChart3 },
  { id: "library", label: "Kütüphane", icon: Library },
];
const TAB_KEY = "demirtube-perde-tab";

function remaining(next: NextUp) {
  return next.state === "resume" && next.duration > next.position ? `${Math.max(1, Math.round((next.duration - next.position) / 60))} dk kaldı` : undefined;
}

function storedTab(): Tab {
  try {
    const value = sessionStorage.getItem(TAB_KEY);
    return value === "recs" || value === "insights" || value === "library" ? value : "watching";
  } catch { return "watching"; }
}

export function MediaPage({ youtubeSessions = [] }: { youtubeSessions?: WatchSession[] }) {
  const [data, setData] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string>();
  const [tab, setTabState] = useState<Tab>(storedTab);
  const [pool, setPool] = useState<RecPool | null>();
  const [poolError, setPoolError] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const extensionAvailable = Boolean(globalThis.chrome?.runtime?.id);
  const backfilled = useRef(false);

  const setTab = (next: Tab) => {
    setTabState(next);
    try { sessionStorage.setItem(TAB_KEY, next); } catch { /* önemsiz */ }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const load = useCallback(async () => {
    if (!extensionAvailable) return;
    try { setData(await sendMessage<Loaded>({ type: "MEDIA_GET" })); setError(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Veri okunamadı."); }
  }, [extensionAvailable]);

  const loadPool = useCallback(async (force = false) => {
    if (!extensionAvailable) return;
    if (force) setRefreshing(true);
    try { setPool(await sendMessage<RecPool | null>({ type: "MEDIA_REC_POOL", force })); setPoolError(undefined); }
    catch (reason) { setPoolError(reason instanceof Error ? reason.message : "Öneriler alınamadı."); }
    finally { setRefreshing(false); }
  }, [extensionAvailable]);

  useEffect(() => {
    void load();
    // Başka sekmede izlenirken sayfa açıksa canlı güncellensin.
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === "local" && changes.mediaLibrary) void load(); };
    globalThis.chrome?.storage?.onChanged?.addListener(listener);
    return () => globalThis.chrome?.storage?.onChanged?.removeListener(listener);
  }, [load]);

  // Tür, puan ve yeni bölüm tarihi olmayan ya da bayatlamış kayıtları bir kez tamamla.
  useEffect(() => {
    if (backfilled.current || !data?.status.hasApiKey) return;
    backfilled.current = true;
    void sendMessage({ type: "MEDIA_BACKFILL" }).catch(() => undefined).finally(() => void loadPool());
  }, [data?.status.hasApiKey, loadPool]);

  const library = data?.library;
  const status = data?.status;
  const shelf = useMemo(() => (library ? continueWatching(library, 8) : []), [library]);
  const favorites = useMemo(() => Object.values(library?.titles ?? {}).filter((title) => title.favorite).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [library]);
  const recent = useMemo(() => Object.values(library?.progress ?? {}).toSorted((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt)).slice(0, 14), [library]);
  const upcoming = useMemo(() => (library ? upcomingEpisodes(library) : []), [library]);
  const tonight = useMemo(() => (library && pool ? scoreRecommendations(library, pool).slice(0, 3) : []), [library, pool]);
  const youtubeWeekSeconds = useMemo(() => {
    const since = Date.now() - 7 * 86_400_000;
    return youtubeSessions.reduce((sum, session) => new Date(session.startedAt).getTime() >= since ? sum + (session.watchSeconds ?? 0) : sum, 0);
  }, [youtubeSessions]);
  const openTitle = open && library ? library.titles[open] : undefined;
  const titleCount = Object.keys(library?.titles ?? {}).length;

  if (!extensionAvailable) return <div className="media-page"><p className="media-note">Bu ekran eklenti içinde açıldığında çalışır.</p></div>;

  return <div className="media-page">
    <nav className="perde-tabs" aria-label="Perde bölümleri">
      <span className="perde-wordmark">Perde</span>
      <div role="tablist">
        {TABS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? "on" : ""} onClick={() => setTab(id)}>
          <Icon size={15} />{label}{id === "library" && titleCount ? <span>{titleCount}</span> : null}
        </button>)}
      </div>
    </nav>

    {error ? <p className="media-error">{error}</p> : null}

    {tab === "watching" ? <>
      {shelf.length ? <HeroStage items={shelf} onOpen={setOpen} /> : <Intro status={status} />}
      {status && !status.hasApiKey ? <KeyCard onSaved={load} /> : null}

      {tonight.length || upcoming.length ? <div className="perde-home-split">
        {tonight.length ? <section className="perde-tonight">
          <div className="perde-section-head">
            <h2>Bu akşam için</h2>
            <button type="button" className="perde-link" onClick={() => setTab("recs")}>Tüm öneriler<ArrowRight size={15} /></button>
          </div>
          <ol>{tonight.map((item, index) => <TonightCard key={item.key} item={item} rank={index + 1} onMore={() => setTab("recs")} />)}</ol>
        </section> : null}
        {upcoming.length ? <section className="perde-upcoming">
          <div className="perde-section-head"><h2>Yeni bölüm yolda</h2></div>
          <ol>{upcoming.slice(0, 5).map((item) => <UpcomingRow key={item.title.key} item={item} onOpen={() => setOpen(item.title.key)} />)}</ol>
        </section> : null}
      </div> : null}

      <MediaTrakt onImported={async () => { await load(); await loadPool(); }} />

      <section className="media-row">
        <div className="perde-section-head"><h2>Listem</h2><p>Kalbe bastıkların ve Türkiye'de nerede oldukları.</p></div>
        <SearchBox enabled={Boolean(status?.hasApiKey)} library={library} onChanged={load} onOpen={setOpen} />
        {favorites.length ? <div className="media-posters">{favorites.map((title) => <PosterCard key={title.key} title={title} library={library!} hasKey={Boolean(status?.hasApiKey)} onOpen={() => setOpen(title.key)} />)}</div>
          : <p className="media-note">Bir film ya da dizi arayıp kalbe bas, burada durur.</p>}
      </section>

      {recent.length ? <RecentTimeline items={recent} library={library!} onOpen={setOpen} /> : null}

      {status ? <MediaSettings status={status} onChanged={load} /> : null}
    </> : null}

    {tab === "recs" && library && status ? <MediaRecommend library={library} status={status} pool={pool} poolError={poolError} refreshing={refreshing} onRefresh={() => void loadPool(true)} onChanged={load} onOpen={setOpen} /> : null}
    {tab === "insights" && library ? <MediaInsights library={library} youtubeWeekSeconds={youtubeWeekSeconds} onOpen={setOpen} /> : null}
    {tab === "library" && library ? <MediaLibraryGrid library={library} onOpen={setOpen} /> : null}

    {openTitle && library ? <Detail title={openTitle} library={library} hasKey={Boolean(status?.hasApiKey)} onClose={() => setOpen(undefined)} onChanged={load} onMoved={setOpen} /> : null}
  </div>;
}

function MediaSettings({ status, onChanged }: { status: MediaStatus; onChanged: () => Promise<void> }) {
  const [changingKey, setChangingKey] = useState(false);
  const toggle = async () => { await sendMessage({ type: "MEDIA_SET_TRACKING", enabled: !status.trackingEnabled }); await onChanged(); };
  return <footer className="media-settings">
    <div>
      <b>Film ve dizi takibi {status.trackingEnabled ? "açık" : "kapalı"}</b>
      <small>YouTube dışındaki sitelerde 15 dakikadan uzun videoları sayar. Sayfa içeriği okunmaz; yalnızca başlık, süre ve adres kaydedilir.</small>
    </div>
    <div className="media-actions">
      <button type="button" className="media-button" onClick={() => void toggle()} aria-pressed={status.trackingEnabled}>{status.trackingEnabled ? "Takibi durdur" : "Takibi aç"}</button>
      {status.hasApiKey ? <button type="button" className="media-button" onClick={() => setChangingKey((value) => !value)}><KeyRound size={16} />TMDB anahtarı</button> : null}
    </div>
    {changingKey ? <KeyCard onSaved={async () => { setChangingKey(false); await onChanged(); }} /> : null}
  </footer>;
}

function Intro({ status }: { status?: MediaStatus }) {
  return <header className="media-intro">
    <span className="media-eyebrow"><Clapperboard size={14} />PERDE</span>
    <h1>İzlediğin her şey,<br />nerede kaldığınla birlikte.</h1>
    <p>Netflix, HBO Max, Prime, Disney+, Apple TV+ ya da başka herhangi bir sitede 15 dakikadan uzun bir video oynattığında DemirTube bunu fark eder, hangi dizinin kaçıncı bölümü olduğunu sayfadan çıkarır ve buraya yazar. Veri bilgisayarından çıkmaz.</p>
    {status && !status.trackingEnabled ? <p className="media-error">Takip şu an kapalı.</p> : null}
  </header>;
}

/**
 * Kaldığın her şey tek sahnede. Alttaki şeritten seçilen yapım sahneye gelir;
 * otomatik dönmez, çünkü okurken kayan afiş can sıkar.
 */
function HeroStage({ items, onOpen }: { items: ContinueItem[]; onOpen: (key: string) => void }) {
  const [index, setIndex] = useState(0);
  const safeIndex = Math.min(index, items.length - 1);
  const item = items[safeIndex];
  const backdrop = poster(item.title.backdropPath, "w1280") ?? poster(item.title.posterPath, "w780");
  const percent = item.next.state === "resume" ? item.next.percent : 100;
  const go = (delta: number) => setIndex((value) => (Math.min(value, items.length - 1) + delta + items.length) % items.length);

  return <section className="media-hero perde-stage" aria-roledescription="carousel" aria-label="Kaldığın yerler"
    onKeyDown={(event) => { if (event.key === "ArrowRight") go(1); if (event.key === "ArrowLeft") go(-1); }}>
    {backdrop ? <img key={item.title.key} className="media-hero-art perde-stage-art" src={backdrop} alt="" /> : <div className="media-hero-art media-hero-blank" />}
    <div className="media-hero-shade" />
    <div className="media-hero-copy" key={`copy-${item.title.key}`}>
      <span className="media-eyebrow"><Play size={13} />KALDIĞIN YER{items.length > 1 ? ` · ${safeIndex + 1}/${items.length}` : ""}</span>
      <h1>{item.title.name}</h1>
      <p className="media-hero-next">{nextLabel(item.next)}</p>
      <div className="media-hero-bar"><i style={{ width: `${percent}%` }} /></div>
      <p className="media-hero-meta">{siteLabel(item.last.site)} · {relativeDay(item.last.lastWatchedAt)}{remaining(item.next) ? ` · ${remaining(item.next)}` : ""}{item.title.genres?.length ? ` · ${item.title.genres.slice(0, 2).join(", ")}` : ""}</p>
      <div className="media-actions">
        {item.last.lastUrl ? <a className="media-button primary" href={item.last.lastUrl} target="_blank" rel="noreferrer"><Play size={16} />{item.next.state === "resume" ? "Kaldığın yerden aç" : "Sıradaki bölüme git"}</a> : null}
        <button type="button" className="media-button" onClick={() => onOpen(item.title.key)}>Ayrıntı ve nerede izlenir</button>
      </div>
    </div>
    {items.length > 1 ? <div className="perde-stage-strip">
      <button type="button" className="media-icon" onClick={() => go(-1)} aria-label="Önceki"><ChevronLeft size={18} /></button>
      <ol>{items.map((entry, position) => {
        const art = poster(entry.title.backdropPath, "w300") ?? poster(entry.title.posterPath, "w185");
        const fill = entry.next.state === "resume" ? entry.next.percent : 0;
        return <li key={entry.title.key}><button type="button" className={position === safeIndex ? "on" : ""} aria-current={position === safeIndex} onClick={() => setIndex(position)} aria-label={entry.title.name}>
          {art ? <img src={art} alt="" /> : <Clapperboard size={16} />}<i style={{ width: `${fill}%` }} />
        </button></li>;
      })}</ol>
      <button type="button" className="media-icon" onClick={() => go(1)} aria-label="Sonraki"><ChevronRight size={18} /></button>
    </div> : null}
  </section>;
}

function TonightCard({ item, rank, onMore }: { item: Recommendation; rank: number; onMore: () => void }) {
  const art = poster(item.candidate.backdropPath, "w780") ?? poster(item.candidate.posterPath, "w500");
  return <li><button type="button" className="perde-tonight-card" onClick={onMore}>
    <span className="perde-tonight-art">{art ? <img src={art} alt="" loading="lazy" /> : null}<em>%{item.score}</em></span>
    <span className="perde-tonight-copy">
      <small>{rank}. öneri · {item.candidate.kind === "tv" ? "Dizi" : "Film"}{item.candidate.year ? ` · ${item.candidate.year}` : ""}</small>
      <b>{item.candidate.name}</b>
      <span>{item.reasons[0]}</span>
    </span>
  </button></li>;
}

function UpcomingRow({ item, onOpen }: { item: UpcomingEpisode; onOpen: () => void }) {
  const date = new Date(`${item.airDate}T12:00:00`);
  const when = item.daysUntil === 0 ? "Bugün" : item.daysUntil === 1 ? "Yarın" : item.daysUntil < 7 ? date.toLocaleDateString("tr-TR", { weekday: "long" }) : `${item.daysUntil} gün sonra`;
  return <li><button type="button" onClick={onOpen}>
    <span className="perde-upcoming-date"><b>{date.getDate()}</b><small>{date.toLocaleDateString("tr-TR", { month: "short" })}</small></span>
    <span className="perde-upcoming-copy"><b>{item.title.name}</b><small>{item.season}. sezon {item.episode}. bölüm</small></span>
    <span className={`perde-upcoming-when ${item.daysUntil <= 1 ? "soon" : ""}`}><CalendarClock size={14} />{when}</span>
  </button></li>;
}

function RecentTimeline({ items, library, onOpen }: { items: MediaProgress[]; library: MediaLibrary; onOpen: (key: string) => void }) {
  const groups = new Map<string, MediaProgress[]>();
  for (const item of items) {
    const label = relativeDay(item.lastWatchedAt);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  return <section className="media-row perde-timeline">
    <div className="perde-section-head"><h2>Son izlenenler</h2></div>
    {[...groups.entries()].map(([label, entries]) => <div key={label} className="perde-timeline-day">
      <h3>{label}</h3>
      <ol className="media-recent">{entries.map((item) => {
        const title = library.titles[item.titleKey];
        const share = item.duration ? Math.round((item.position / item.duration) * 100) : 0;
        return <li key={item.id}>
          <button type="button" onClick={() => onOpen(item.titleKey)}>
            {poster(title?.posterPath, "w92") ? <img src={poster(title?.posterPath, "w92")} alt="" loading="lazy" /> : <span className="media-thumb-empty"><Clapperboard size={16} /></span>}
            <span className="media-recent-main"><b>{title?.name ?? item.rawTitle}</b><small>{episodeLabel(item.season, item.episode)} · {formatDuration(item.watchedSeconds)}</small></span>
            {title && !title.tmdbId ? <span className="media-flag">eşleşmedi</span> : null}
            <span className="perde-timeline-progress" aria-label={item.completed ? "bitti" : `%${share}`}>{item.completed ? <Check size={14} /> : <span className="perde-meter"><i style={{ width: `${share}%` }} /></span>}</span>
            <span className="media-recent-meta">{siteLabel(item.site)}<small>{new Date(item.lastWatchedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</small></span>
          </button>
        </li>;
      })}</ol>
    </div>)}
  </section>;
}

function PosterCard({ title, library, hasKey, onOpen }: { title: MediaTitle; library: MediaLibrary; hasKey: boolean; onOpen: () => void }) {
  const next = nextUp(title, Object.values(library.progress));
  const providers = useProviders(hasKey, title);
  const streaming = providers?.flatrate ?? [];
  return <button type="button" className="media-poster" onClick={onOpen}>
    <span className="media-poster-art">{poster(title.posterPath) ? <img src={poster(title.posterPath)} alt="" loading="lazy" /> : <Clapperboard />}</span>
    <b>{title.name}</b>
    <small>{next ? nextLabel(next) : [title.kind === "tv" ? "Dizi" : title.kind === "movie" ? "Film" : "", title.year].filter(Boolean).join(" · ")}</small>
    {providers ? <span className="media-poster-where" aria-label={streaming.length ? `Abonelikle: ${streaming.map((item) => item.name).join(", ")}` : "Türkiye için abonelik kaydı yok"}>
      {streaming.length ? streaming.slice(0, 4).map((item) => item.logoPath ? <img key={item.id} src={`${TMDB_IMAGE}/w92${item.logoPath}`} alt="" title={item.name} /> : <em key={item.id}>{item.name}</em>)
        : <em>{providers.rent.length + providers.buy.length ? "Kiralık / satın alma" : "TR kaydı yok"}</em>}
    </span> : null}
  </button>;
}

/** Posterlerin altındaki platform logoları; service worker 24 saat önbellekler. */
function useProviders(hasKey: boolean, title: MediaTitle) {
  const [providers, setProviders] = useState<WatchProviders>();
  useEffect(() => {
    if (!hasKey || !title.tmdbId || title.kind === "unknown") return;
    let active = true;
    sendMessage<WatchProviders>({ type: "MEDIA_PROVIDERS", kind: title.kind, tmdbId: title.tmdbId }).then((value) => { if (active) setProviders(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [hasKey, title.kind, title.tmdbId]);
  return providers;
}

function KeyCard({ onSaved }: { onSaved: () => Promise<void> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const save = async () => {
    setBusy(true); setMessage(undefined);
    try { await sendMessage({ type: "MEDIA_SET_API_KEY", apiKey: value }); setValue(""); await onSaved(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Anahtar kaydedilemedi."); }
    finally { setBusy(false); }
  };
  return <section className="media-key">
    <KeyRound size={20} />
    <div>
      <h2>Posterler, sıradaki bölüm ve "nerede izlenir" için TMDB anahtarı</h2>
      <p>İzleme takibi anahtarsız da çalışır, ama o zaman sadece sayfa başlığı görünür. Anahtar ücretsiz: themoviedb.org → Ayarlar → API. Anahtar yalnızca bu bilgisayarda saklanır, TMDB'ye izleme geçmişin değil sadece aradığın ad gider.</p>
      <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <input type="password" autoComplete="off" spellCheck={false} placeholder="API anahtarı (v3) ya da okuma belirteci" value={value} onChange={(event) => setValue(event.target.value)} aria-label="TMDB API anahtarı" />
        <button type="submit" className="media-button primary" disabled={busy || value.trim().length < 20}>{busy ? "Deneniyor…" : "Kaydet"}</button>
      </form>
      {message ? <p className="media-error">{message}</p> : null}
    </div>
  </section>;
}

function useSearch(enabled: boolean) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TmdbSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const latest = useRef(0);
  useEffect(() => {
    const text = query.trim();
    if (!enabled || text.length < 2) { setResults([]); setMessage(undefined); return; }
    const id = ++latest.current;
    const timer = window.setTimeout(() => {
      setBusy(true);
      sendMessage<TmdbSearchResult[]>({ type: "MEDIA_SEARCH", query: text })
        .then((list) => { if (id === latest.current) { setResults(list.slice(0, 8)); setMessage(list.length ? undefined : "Sonuç yok."); } })
        .catch((reason) => { if (id === latest.current) setMessage(reason instanceof Error ? reason.message : "Arama başarısız."); })
        .finally(() => { if (id === latest.current) setBusy(false); });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [enabled, query]);
  return { query, setQuery, results, busy, message };
}

function SearchBox({ enabled, library, onChanged, onOpen }: { enabled: boolean; library?: MediaLibrary; onChanged: () => Promise<void>; onOpen: (key: string) => void }) {
  const search = useSearch(enabled);
  const toggle = async (result: TmdbSearchResult) => {
    await sendMessage({ type: "MEDIA_TOGGLE_FAVORITE", result });
    await onChanged();
  };
  return <section className="media-search">
    <label><Search size={18} /><input disabled={!enabled} placeholder={enabled ? "Film ya da dizi ara, listene ekle" : "Aramak için önce TMDB anahtarını gir"} value={search.query} onChange={(event) => search.setQuery(event.target.value)} /></label>
    {search.busy ? <p className="media-note">Aranıyor…</p> : search.message ? <p className="media-note">{search.message}</p> : null}
    {search.results.length ? <ul>{search.results.map((result) => {
      const key = `tmdb:${result.kind}:${result.tmdbId}`;
      const saved = library?.titles[key];
      return <li key={key}>
        {poster(result.posterPath, "w92") ? <img src={poster(result.posterPath, "w92")} alt="" loading="lazy" /> : <span className="media-thumb-empty"><Clapperboard size={16} /></span>}
        <span><b>{result.name}</b><small>{result.kind === "tv" ? "Dizi" : "Film"}{result.year ? ` · ${result.year}` : ""}</small></span>
        {saved ? <button type="button" className="media-icon" onClick={() => onOpen(key)} aria-label="Ayrıntıyı aç"><ArrowUpRight size={16} /></button> : null}
        <button type="button" className={`media-icon ${saved?.favorite ? "on" : ""}`} onClick={() => void toggle(result)} aria-pressed={Boolean(saved?.favorite)} aria-label={saved?.favorite ? "Listemden çıkar" : "Listeme ekle"}><Heart size={16} /></button>
      </li>;
    })}</ul> : null}
  </section>;
}

function Detail({ title, library, hasKey, onClose, onChanged, onMoved }: { title: MediaTitle; library: MediaLibrary; hasKey: boolean; onClose: () => void; onChanged: () => Promise<void>; onMoved: (key: string) => void }) {
  const [providers, setProviders] = useState<WatchProviders>();
  const [providerError, setProviderError] = useState<string>();
  const [fixing, setFixing] = useState(!title.tmdbId && hasKey);
  const search = useSearch(hasKey && fixing);
  const episodes = useMemo(() => Object.values(library.progress).filter((item) => item.titleKey === title.key).toSorted((a, b) => b.season - a.season || b.episode - a.episode), [library, title.key]);
  const next = nextUp(title, episodes);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  useEffect(() => {
    setProviders(undefined); setProviderError(undefined);
    if (!hasKey || !title.tmdbId || title.kind === "unknown") return;
    sendMessage<WatchProviders>({ type: "MEDIA_PROVIDERS", kind: title.kind, tmdbId: title.tmdbId }).then(setProviders).catch((reason) => setProviderError(reason instanceof Error ? reason.message : "Bilgi alınamadı."));
  }, [hasKey, title.kind, title.tmdbId]);

  useEffect(() => { if (fixing && !search.query) search.setQuery(title.name); }, [fixing]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (message: Parameters<typeof sendMessage>[0]) => { await sendMessage(message); await onChanged(); };
  const rematch = async (result: TmdbSearchResult) => {
    await act({ type: "MEDIA_REMATCH", titleKey: title.key, result });
    setFixing(false);
    onMoved(`tmdb:${result.kind}:${result.tmdbId}`);
  };
  const backdrop = poster(title.backdropPath, "w1280");

  // Kabuk animasyonlu bir kapsayıcı; fixed konum onun içinde kalmasın diye gövdeye taşınır.
  return createPortal(<div className="media-overlay" role="dialog" aria-modal="true" aria-label={title.name} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <article className="media-detail">
      <button type="button" className="media-icon media-close" onClick={onClose} aria-label="Kapat"><X size={18} /></button>
      <header className="media-detail-head">
        {backdrop ? <img src={backdrop} alt="" /> : null}
        <div>
          <span className="media-eyebrow">{title.kind === "tv" ? "DİZİ" : title.kind === "movie" ? "FİLM" : "EŞLEŞMEDİ"}{title.year ? ` · ${title.year}` : ""}</span>
          <h2>{title.name}</h2>
          {next ? <p className="media-hero-next">{nextLabel(next)}</p> : null}
        </div>
      </header>
      {title.overview ? <p className="media-overview">{title.overview}</p> : null}

      <div className="media-actions">
        <button type="button" className={`media-button ${title.favorite ? "primary" : ""}`} onClick={() => void act({ type: "MEDIA_TOGGLE_FAVORITE", titleKey: title.key })}><Heart size={16} />{title.favorite ? "Listemde" : "Listeme ekle"}</button>
        <span className="perde-rate" role="group" aria-label="Değerlendir">
          <button type="button" className={`media-icon ${title.userRating === "liked" ? "on" : ""}`} aria-pressed={title.userRating === "liked"} aria-label="Beğendim" title="Beğendim: öneriler buna göre şekillenir" onClick={() => void act({ type: "MEDIA_RATE", titleKey: title.key, rating: title.userRating === "liked" ? null : "liked" })}><ThumbsUp size={16} /></button>
          <button type="button" className={`media-icon ${title.userRating === "disliked" ? "on" : ""}`} aria-pressed={title.userRating === "disliked"} aria-label="Beğenmedim" title="Beğenmedim: benzerleri geri çekilir" onClick={() => void act({ type: "MEDIA_RATE", titleKey: title.key, rating: title.userRating === "disliked" ? null : "disliked" })}><ThumbsDown size={16} /></button>
        </span>
        {hasKey ? <button type="button" className="media-button" onClick={() => setFixing((value) => !value)}><Link2 size={16} />{title.tmdbId ? "Yanlış eşleşme mi?" : "Eşleştir"}</button> : null}
        <button type="button" className="media-button danger" onClick={() => { if (confirm(`"${title.name}" ve tüm izleme kaydı silinsin mi?`)) void act({ type: "MEDIA_DELETE", titleKey: title.key }).then(onClose); }}><Trash2 size={16} />Sil</button>
      </div>

      {fixing ? <section className="media-fix">
        <p>Doğru olanı seç; bu başlığa yazılmış bütün bölümler oraya taşınır.</p>
        <input value={search.query} onChange={(event) => search.setQuery(event.target.value)} aria-label="Doğru başlığı ara" />
        {search.busy ? <p className="media-note">Aranıyor…</p> : search.message ? <p className="media-note">{search.message}</p> : null}
        <ul>{search.results.map((result) => <li key={`${result.kind}:${result.tmdbId}`}>
          <button type="button" onClick={() => void rematch(result)}>
            {poster(result.posterPath, "w92") ? <img src={poster(result.posterPath, "w92")} alt="" /> : <span className="media-thumb-empty"><Clapperboard size={16} /></span>}
            <span><b>{result.name}</b><small>{result.kind === "tv" ? "Dizi" : "Film"}{result.year ? ` · ${result.year}` : ""}</small></span>
          </button>
        </li>)}</ul>
      </section> : null}

      {title.tmdbId && hasKey ? <section className="media-where">
        <h3>Türkiye'de nerede izlenir</h3>
        {providerError ? <p className="media-error">{providerError}</p> : !providers ? <p className="media-note">Bakılıyor…</p>
          : providers.flatrate.length + providers.rent.length + providers.buy.length === 0 ? <p className="media-note">JustWatch'ta Türkiye için kayıt yok. Bu, hiçbir platformda olmadığı anlamına gelmeyebilir; veri bazı platformları Türkiye'de takip etmiyor.</p>
          : <>
            <ProviderGroup label="Abonelikle" list={providers.flatrate} />
            <ProviderGroup label="Kirala" list={providers.rent} />
            <ProviderGroup label="Satın al" list={providers.buy} />
          </>}
        {providers?.link ? <a className="media-attribution" href={providers.link} target="_blank" rel="noreferrer">Veri: JustWatch (TMDB üzerinden) <ArrowUpRight size={12} /></a> : null}
      </section> : null}

      {episodes.length ? <section className="media-episodes">
        <h3>İzleme kaydı</h3>
        <ol>{episodes.map((item) => <EpisodeRow key={item.id} item={item} onToggle={() => void act({ type: "MEDIA_MARK_EPISODE", progressId: item.id, completed: !item.completed })} />)}</ol>
      </section> : null}
    </article>
  </div>, document.body);
}

function ProviderGroup({ label, list }: { label: string; list: WatchProviders["flatrate"] }) {
  if (!list.length) return null;
  return <div className="media-provider-group"><small>{label}</small><div>{list.map((provider) => <span key={provider.id} className="media-provider" title={provider.name}>
    {provider.logoPath ? <img src={`${TMDB_IMAGE}/w92${provider.logoPath}`} alt="" /> : null}{provider.name}
  </span>)}</div></div>;
}

function EpisodeRow({ item, onToggle }: { item: MediaProgress; onToggle: () => void }) {
  const percent = item.duration ? Math.round((item.position / item.duration) * 100) : 0;
  return <li>
    <button type="button" className={`media-check ${item.completed ? "on" : ""}`} onClick={onToggle} aria-pressed={item.completed} aria-label={item.completed ? "İzlenmedi olarak işaretle" : "İzlendi olarak işaretle"}>{item.completed ? <Check size={14} /> : null}</button>
    <span><b>{episodeLabel(item.season, item.episode)}</b><small>{item.completed ? "bitti" : `%${percent}`} · {formatDuration(item.watchedSeconds)} izlendi · {siteLabel(item.site)}</small></span>
    <time>{relativeDay(item.lastWatchedAt)}</time>
    {item.lastUrl ? <a className="media-icon" href={item.lastUrl} target="_blank" rel="noreferrer" aria-label="İzlediğin sayfayı aç"><ArrowUpRight size={15} /></a> : null}
  </li>;
}
