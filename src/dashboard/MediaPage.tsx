// DemirTube · Perde ekranı (film ve dizi)
//
// YouTube dışındaki sitelerde izlenenler: kaldığın yer, sıradaki bölüm,
// favoriler ve Türkiye'de nerede izlenebildiği.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowUpRight, BarChart3, Check, Clapperboard, Heart, KeyRound, Library, Link2, Play, Search, Trash2, X } from "lucide-react";
import { sendMessage } from "../shared/messages";
import type { WatchSession } from "../shared/types";
import { formatDuration } from "../shared/utils";
import { continueWatching, nextUp, siteLabel, type ContinueItem, type NextUp } from "../media/library";
import { TMDB_IMAGE } from "../media/tmdb";
import type { MediaLibrary, MediaProgress, MediaStatus, MediaTitle, TmdbSearchResult, WatchProviders } from "../media/types";
import { MediaInsights } from "./MediaInsights";
import { MediaLibraryGrid } from "./MediaLibraryGrid";
import { episodeLabel, nextLabel, poster, relativeDay } from "./media-format";

type Loaded = { library: MediaLibrary; status: MediaStatus };
type Tab = "watching" | "insights" | "library";

const TABS: { id: Tab; label: string; icon: typeof Play }[] = [
  { id: "watching", label: "İzliyorum", icon: Play },
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
    return value === "insights" || value === "library" ? value : "watching";
  } catch { return "watching"; }
}

export function MediaPage({ youtubeSessions = [] }: { youtubeSessions?: WatchSession[] }) {
  const [data, setData] = useState<Loaded>();
  const [error, setError] = useState<string>();
  const [open, setOpen] = useState<string>();
  const [tab, setTabState] = useState<Tab>(storedTab);
  const extensionAvailable = Boolean(globalThis.chrome?.runtime?.id);
  const backfilled = useRef(false);

  const setTab = (next: Tab) => {
    setTabState(next);
    try { sessionStorage.setItem(TAB_KEY, next); } catch { /* önemsiz */ }
  };

  const load = useCallback(async () => {
    if (!extensionAvailable) return;
    try { setData(await sendMessage<Loaded>({ type: "MEDIA_GET" })); setError(undefined); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Veri okunamadı."); }
  }, [extensionAvailable]);

  useEffect(() => {
    void load();
    // Başka sekmede izlenirken sayfa açıksa canlı güncellensin.
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => { if (area === "local" && changes.mediaLibrary) void load(); };
    globalThis.chrome?.storage?.onChanged?.addListener(listener);
    return () => globalThis.chrome?.storage?.onChanged?.removeListener(listener);
  }, [load]);

  // Tür ve puan bilgisi olmayan eski kayıtları bir kez tamamla; kütüphane değişince liste kendiliğinden yenilenir.
  useEffect(() => {
    if (backfilled.current || !data?.status.hasApiKey) return;
    backfilled.current = true;
    void sendMessage({ type: "MEDIA_BACKFILL" }).catch(() => undefined);
  }, [data?.status.hasApiKey]);

  const library = data?.library;
  const status = data?.status;
  const shelf = useMemo(() => (library ? continueWatching(library) : []), [library]);
  const favorites = useMemo(() => Object.values(library?.titles ?? {}).filter((title) => title.favorite).toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [library]);
  const recent = useMemo(() => Object.values(library?.progress ?? {}).toSorted((a, b) => b.lastWatchedAt.localeCompare(a.lastWatchedAt)).slice(0, 12), [library]);
  const youtubeWeekSeconds = useMemo(() => {
    const since = Date.now() - 7 * 86_400_000;
    return youtubeSessions.reduce((sum, session) => new Date(session.startedAt).getTime() >= since ? sum + (session.watchSeconds ?? 0) : sum, 0);
  }, [youtubeSessions]);
  const hero = shelf[0];
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
      {hero ? <Hero item={hero} onOpen={() => setOpen(hero.title.key)} /> : <Intro status={status} />}
      {status && !status.hasApiKey ? <KeyCard onSaved={load} /> : null}

      {shelf.length > 1 ? <section className="media-row">
        <h2>Devam et</h2>
        <div className="media-rail">{shelf.slice(1).map((item) => <ContinueCard key={item.title.key} item={item} onOpen={() => setOpen(item.title.key)} />)}</div>
      </section> : null}

      <SearchBox enabled={Boolean(status?.hasApiKey)} library={library} onChanged={load} onOpen={setOpen} />

      <section className="media-row">
        <h2>Favorilerim</h2>
        {favorites.length ? <div className="media-posters">{favorites.map((title) => <PosterCard key={title.key} title={title} library={library!} hasKey={Boolean(status?.hasApiKey)} onOpen={() => setOpen(title.key)} />)}</div>
          : <p className="media-note">Yukarıdan bir film ya da dizi arayıp kalbe bas; nerede izleneceği burada durur.</p>}
      </section>

      {recent.length ? <section className="media-row">
        <h2>Son izlenenler</h2>
        <ol className="media-recent">{recent.map((item) => {
          const title = library!.titles[item.titleKey];
          return <li key={item.id}>
            <button type="button" onClick={() => setOpen(item.titleKey)}>
              {poster(title?.posterPath, "w92") ? <img src={poster(title?.posterPath, "w92")} alt="" loading="lazy" /> : <span className="media-thumb-empty"><Clapperboard size={16} /></span>}
              <span className="media-recent-main"><b>{title?.name ?? item.rawTitle}</b><small>{episodeLabel(item.season, item.episode)}{item.completed ? " · bitti" : ` · %${item.duration ? Math.round((item.position / item.duration) * 100) : 0}`}</small></span>
              {title && !title.tmdbId ? <span className="media-flag">eşleşmedi</span> : null}
              <span className="media-recent-meta">{siteLabel(item.site)}<small>{relativeDay(item.lastWatchedAt)}</small></span>
            </button>
          </li>;
        })}</ol>
      </section> : null}

      {status ? <MediaSettings status={status} onChanged={load} /> : null}
    </> : null}

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

function Hero({ item, onOpen }: { item: ContinueItem; onOpen: () => void }) {
  const backdrop = poster(item.title.backdropPath, "w1280") ?? poster(item.title.posterPath, "w780");
  const percent = item.next.state === "resume" ? item.next.percent : 100;
  return <section className="media-hero">
    {backdrop ? <img className="media-hero-art" src={backdrop} alt="" /> : <div className="media-hero-art media-hero-blank" />}
    <div className="media-hero-shade" />
    <div className="media-hero-copy">
      <span className="media-eyebrow"><Play size={13} />KALDIĞIN YER</span>
      <h1>{item.title.name}</h1>
      <p className="media-hero-next">{nextLabel(item.next)}</p>
      <div className="media-hero-bar"><i style={{ width: `${percent}%` }} /></div>
      <p className="media-hero-meta">{siteLabel(item.last.site)} · {relativeDay(item.last.lastWatchedAt)}{remaining(item.next) ? ` · ${remaining(item.next)}` : ""}</p>
      <div className="media-actions">
        {item.last.lastUrl ? <a className="media-button primary" href={item.last.lastUrl} target="_blank" rel="noreferrer"><Play size={16} />{item.next.state === "resume" ? "Kaldığın yerden aç" : "Siteye git"}</a> : null}
        <button type="button" className="media-button" onClick={onOpen}>Ayrıntı ve nerede izlenir</button>
      </div>
    </div>
  </section>;
}

function ContinueCard({ item, onOpen }: { item: ContinueItem; onOpen: () => void }) {
  const art = poster(item.title.backdropPath, "w780") ?? poster(item.title.posterPath, "w500");
  const percent = item.next.state === "resume" ? item.next.percent : 0;
  return <button type="button" className="media-continue" onClick={onOpen}>
    <span className="media-continue-art">{art ? <img src={art} alt="" loading="lazy" /> : <Clapperboard />}<i style={{ width: `${percent}%` }} /></span>
    <b>{item.title.name}</b>
    <small>{nextLabel(item.next)}</small>
  </button>;
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
    <label><Search size={18} /><input disabled={!enabled} placeholder={enabled ? "Film ya da dizi ara, favorilere ekle" : "Aramak için önce TMDB anahtarını gir"} value={search.query} onChange={(event) => search.setQuery(event.target.value)} /></label>
    {search.busy ? <p className="media-note">Aranıyor…</p> : search.message ? <p className="media-note">{search.message}</p> : null}
    {search.results.length ? <ul>{search.results.map((result) => {
      const key = `tmdb:${result.kind}:${result.tmdbId}`;
      const saved = library?.titles[key];
      return <li key={key}>
        {poster(result.posterPath, "w92") ? <img src={poster(result.posterPath, "w92")} alt="" loading="lazy" /> : <span className="media-thumb-empty"><Clapperboard size={16} /></span>}
        <span><b>{result.name}</b><small>{result.kind === "tv" ? "Dizi" : "Film"}{result.year ? ` · ${result.year}` : ""}</small></span>
        {saved ? <button type="button" className="media-icon" onClick={() => onOpen(key)} aria-label="Ayrıntıyı aç"><ArrowUpRight size={16} /></button> : null}
        <button type="button" className={`media-icon ${saved?.favorite ? "on" : ""}`} onClick={() => void toggle(result)} aria-pressed={Boolean(saved?.favorite)} aria-label={saved?.favorite ? "Favorilerden çıkar" : "Favorilere ekle"}><Heart size={16} /></button>
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
        <button type="button" className={`media-button ${title.favorite ? "primary" : ""}`} onClick={() => void act({ type: "MEDIA_TOGGLE_FAVORITE", titleKey: title.key })}><Heart size={16} />{title.favorite ? "Favorilerde" : "Favorilere ekle"}</button>
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
