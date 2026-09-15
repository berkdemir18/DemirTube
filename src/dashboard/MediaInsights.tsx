// DemirTube · Perde › Analiz
//
// Her kart tek bir cümle söyler; görsel o cümlenin kanıtıdır, süsü değil.
// Veri yetmediğinde kart susar ve ne kadar izleyince konuşacağını söyler.
import { useMemo } from "react";
import { Flame, Hourglass, MoonStar, PauseCircle, Sparkles, Tv } from "lucide-react";
import { formatDuration } from "../shared/utils";
import { bingeInsight, clockInsight, finishInsight, genreShares, showPaces, siteShares, stalledTitles, tasteGaps, weekSummary } from "../media/insights";
import type { MediaLibrary } from "../media/types";
import { percentWith } from "../media/turkish";
import { chartSeries } from "./chart-theme";
import { WEEKDAYS, decimal, durationParts, percent, poster } from "./media-format";

type Props = { library: MediaLibrary; youtubeWeekSeconds?: number; onOpen: (key: string) => void };

export function MediaInsights({ library, youtubeWeekSeconds, onOpen }: Props) {
  const now = useMemo(() => new Date(), [library]);
  const week = useMemo(() => weekSummary(library, now, youtubeWeekSeconds), [library, now, youtubeWeekSeconds]);
  const clock = useMemo(() => clockInsight(library, 60, now), [library, now]);
  const binge = useMemo(() => bingeInsight(library), [library]);
  const paces = useMemo(() => showPaces(library, now), [library, now]);
  const stalled = useMemo(() => stalledTitles(library, now), [library, now]);
  const gaps = useMemo(() => tasteGaps(library, now), [library, now]);
  const genres = useMemo(() => genreShares(library), [library]);
  const sites = useMemo(() => siteShares(library, now), [library, now]);
  const finish = useMemo(() => finishInsight(library, now), [library, now]);

  const hasAnything = Object.keys(library.progress).length > 0;
  if (!hasAnything) {
    return <section className="perde-empty">
      <Sparkles size={22} />
      <h2>Analiz için önce biraz izlemek lazım</h2>
      <p>Bir dizi ya da film açtığında kayıt başlar. Saat ve gün analizi 3 saatlik izlemeden, maraton analizi üç oturuştan sonra açılır. Az veriyle konuşan analiz yanıltır.</p>
    </section>;
  }

  return <div className="perde-insights">
    <WeekLede week={week} />

    <div className="perde-grid">
      {clock ? <ClockCard clock={clock} /> : <Pending icon={<MoonStar size={18} />} title="Saatlerin" copy={`Saat ve gün analizi 3 saatlik kayıttan sonra açılır. Şu an ${formatDuration((library.sessions ?? []).reduce((sum, item) => sum + item.seconds, 0))} var.`} />}

      {binge ? <BingeCard binge={binge} library={library} onOpen={onOpen} /> : <Pending icon={<Flame size={18} />} title="Maratonlar" copy="Art arda bölüm analizi en az üç oturuştan sonra açılır." />}

      {paces.length ? <article className="perde-card perde-pace">
        <header><Hourglass size={18} /><span>TEMPO</span></header>
        <h3>{paceHeadline(paces[0])}</h3>
        <ol>{paces.map((pace) => <li key={pace.title.key}>
          <button type="button" onClick={() => onOpen(pace.title.key)}>
            <span className="perde-pace-name"><b>{pace.title.name}</b><small>{pace.etaDays !== undefined ? (pace.remainingEpisodes ? `${pace.remainingEpisodes} bölüm kaldı · bu hızla ${pace.etaDays} gün` : "Son bölümdesin") : `${decimal(pace.episodesPerDay * 7)} bölüm/hafta`}</small></span>
            <span className="perde-meter"><i style={{ width: `${pace.percent ?? 0}%` }} /></span>
            <em>{pace.percent !== undefined ? `%${pace.percent}` : `${pace.finishedEpisodes} bölüm`}</em>
          </button>
        </li>)}</ol>
      </article> : null}

      {genres ? <article className="perde-card perde-genres">
        <header><Sparkles size={18} /><span>TÜR DNA'SI</span></header>
        <h3>{genres[0].label} {percent(genres[0].share)} ile başı çekiyor{genres[1] ? `, ardından ${genres[1].label.toLocaleLowerCase("tr-TR")}` : ""}.</h3>
        <div className="perde-stack" role="img" aria-label={genres.map((item) => `${item.label} ${percent(item.share)}`).join(", ")}>
          {genres.map((item, index) => <i key={item.label} style={{ flexGrow: item.share, background: chartSeries[index % chartSeries.length] }} />)}
        </div>
        <ul className="perde-legend">{genres.map((item, index) => <li key={item.label}><i style={{ background: chartSeries[index % chartSeries.length] }} />{item.label}<b>{percent(item.share)}</b></li>)}</ul>
        <small className="perde-foot">İzleme süresine göre. Birden fazla türü olan yapımın süresi türlerine eşit bölünür.</small>
      </article> : null}

      {sites.length ? <article className="perde-card perde-sites">
        <header><Tv size={18} /><span>NEREDEN · 30 GÜN</span></header>
        <h3>{sites.length === 1 ? `Hepsi tek yerden: ${sites[0].label}.` : `En çok ${sites[0].label} (${percent(sites[0].share)}), gerisi ${sites.length - 1} farklı yerden.`}</h3>
        <ul className="perde-bars">{sites.slice(0, 6).map((item) => <li key={item.label}>
          <span>{item.label}</span><span className="perde-meter"><i style={{ width: `${Math.max(2, item.share * 100)}%` }} /></span><b>{formatDuration(item.seconds)}</b>
        </li>)}</ul>
      </article> : null}

      <article className="perde-card perde-finish">
        <header><PauseCircle size={18} /><span>BİTİRME</span></header>
        <h3>{finishHeadline(finish)}</h3>
        <div className="perde-figures">
          <div><strong>{finish.episodesFinished}</strong><small>bölüm bitti</small></div>
          <div><strong>{finish.moviesFinished}<span>/{finish.moviesStarted}</span></strong><small>film bitti</small></div>
          {finish.averageStopPercent !== undefined ? <div><strong>%{finish.averageStopPercent}</strong><small>bıraktığın filmlerde kaldığın yer</small></div> : null}
        </div>
      </article>
    </div>

    {stalled.length ? <section className="perde-stalled">
      <div className="perde-section-head"><h2>Yarıda kalanlar</h2><p>İki haftadır dokunmadıkların. En çok zaman verdiğin başta.</p></div>
      <div className="perde-stalled-rail">{stalled.map((item) => <button type="button" key={item.title.key} className="perde-stalled-card" onClick={() => onOpen(item.title.key)}>
        <span className="perde-stalled-art">{poster(item.title.posterPath) ? <img src={poster(item.title.posterPath)} alt="" loading="lazy" /> : null}<em>{item.daysIdle} gün</em></span>
        <b>{item.title.name}</b>
        <small>{item.label}</small>
        <small>{formatDuration(item.watchedSeconds)} verdin</small>
      </button>)}</div>
    </section> : null}

    {gaps.length ? <section className="perde-gaps">
      <div className="perde-section-head"><h2>Herkes sevdi, sen tutunamadın</h2><p>TMDB puanı 7,8 ve üstü olup yarıda bıraktıkların. Belki bir şans daha, belki gerçekten sana göre değil.</p></div>
      <ul>{gaps.map((gap) => <li key={gap.title.key}><button type="button" onClick={() => onOpen(gap.title.key)}>
        {poster(gap.title.posterPath, "w185") ? <img src={poster(gap.title.posterPath, "w185")} alt="" /> : null}
        <span><b>{gap.title.name}</b><small>TMDB {decimal(gap.voteAverage)} · izlediğin bölümlerin {percentWith(gap.finishedShare * 100, "possessive-accusative")} bitirdin</small></span>
      </button></li>)}</ul>
    </section> : null}
  </div>;
}

function WeekLede({ week }: { week: ReturnType<typeof weekSummary> }) {
  const max = Math.max(1, ...week.weeks.map((item) => item.seconds));
  const change = week.previousSeconds > 0 ? (week.seconds - week.previousSeconds) / week.previousSeconds : undefined;
  const parts = durationParts(week.seconds);
  return <section className="perde-lede">
    <div className="perde-lede-copy">
      <span className="media-eyebrow">SON 7 GÜN</span>
      <p className="perde-lede-number">{parts.map((part) => <span key={part.unit}>{part.value}<small>{part.unit}</small></span>)}</p>
      <p className="perde-lede-sentence">
        {week.seconds === 0 ? "Bu hafta perde kapalı kaldı." : "perdede geçti."}
        {change !== undefined && week.seconds > 0 ? <> Geçen haftadan <b className={change >= 0 ? "up" : "down"}>{percent(Math.abs(change))} {change >= 0 ? "fazla" : "az"}</b>.</> : null}
        {week.youtubeSeconds !== undefined && week.youtubeSeconds > 0 ? <> Aynı sürede YouTube'da <b>{formatDuration(week.youtubeSeconds)}</b>{week.seconds > 0 ? `; ekran sürenin ${percentWith((week.seconds / (week.seconds + week.youtubeSeconds)) * 100, "possessive")} dizi ve film` : ""}.</> : null}
      </p>
    </div>
    <div className="perde-weeks" role="img" aria-label={`Son 8 hafta: ${week.weeks.map((item) => formatDuration(item.seconds)).join(", ")}`}>
      {week.weeks.map((item, index) => <span key={item.start} className={index === 7 ? "now" : ""}>
        <i style={{ height: `${Math.max(3, (item.seconds / max) * 100)}%` }} />
        <small>{index === 7 ? "bu hafta" : new Date(`${item.start}T12:00:00`).toLocaleDateString("tr-TR", { day: "numeric", month: "short" })}</small>
      </span>)}
    </div>
  </section>;
}

function ClockCard({ clock }: { clock: NonNullable<ReturnType<typeof clockInsight>> }) {
  const max = Math.max(...clock.hours);
  const weekdayMax = Math.max(1, ...clock.weekdays);
  const headline = clock.lateNightShare >= 0.2
    ? `Perdenin ${percentWith(clock.lateNightShare * 100, "possessive")} gece 00–05 arası.`
    : `En yoğun saatin ${String(clock.peakHour).padStart(2, "0")}:00.`;
  const size = 220, center = size / 2, inner = 52, outer = 100;
  return <article className="perde-card perde-clock">
    <header><MoonStar size={18} /><span>SAATLER · 60 GÜN</span></header>
    <h3>{headline}</h3>
    <div className="perde-clock-body">
      <svg className="perde-clock-dial" viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Saatlere göre izleme, en yoğun saat ${clock.peakHour}:00`}>
        {clock.hours.map((seconds, hour) => {
          const angle = ((hour + 0.5) / 24) * Math.PI * 2 - Math.PI / 2;
          const length = inner + (outer - inner) * (max ? seconds / max : 0);
          const late = hour < 5;
          return <line key={hour} x1={center + Math.cos(angle) * inner} y1={center + Math.sin(angle) * inner} x2={center + Math.cos(angle) * Math.max(inner + 2, length)} y2={center + Math.sin(angle) * Math.max(inner + 2, length)}
            className={late ? "late" : hour === clock.peakHour ? "peak" : ""} strokeWidth={9} strokeLinecap="round" />;
        })}
        {[0, 6, 12, 18].map((hour) => {
          const angle = (hour / 24) * Math.PI * 2 - Math.PI / 2;
          return <text key={hour} x={center + Math.cos(angle) * 34} y={center + Math.sin(angle) * 34 + 4} textAnchor="middle">{String(hour).padStart(2, "0")}</text>;
        })}
      </svg>
      <div className="perde-weekdays">
        {clock.weekdays.map((seconds, index) => <span key={WEEKDAYS[index]} className={index >= 5 ? "weekend" : ""}>
          <i style={{ height: `${Math.max(4, (seconds / weekdayMax) * 100)}%` }} /><small>{WEEKDAYS[index]}</small>
        </span>)}
        <p>Hafta sonu payı <b>{percent(clock.weekendShare)}</b></p>
      </div>
    </div>
  </article>;
}

function BingeCard({ binge, library, onOpen }: { binge: NonNullable<ReturnType<typeof bingeInsight>>; library: MediaLibrary; onOpen: (key: string) => void }) {
  const title = library.titles[binge.longest.titleKey];
  const art = poster(title?.backdropPath, "w780") ?? poster(title?.posterPath, "w500");
  const date = new Date(binge.longest.startedAt);
  return <article className="perde-card perde-binge">
    {art ? <img className="perde-binge-art" src={art} alt="" /> : null}
    <div className="perde-binge-copy">
      <header><Flame size={18} /><span>EN UZUN MARATON</span></header>
      <h3>{title?.name ?? "Bir dizi"}: <b>{binge.longest.episodes} bölüm</b> art arda.</h3>
      <p>{date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" })}, {date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} ile {new Date(binge.longest.endedAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })} arası · {formatDuration(binge.longest.seconds)}</p>
      <div className="perde-figures">
        <div><strong>{decimal(binge.episodesPerSitting)}</strong><small>bir oturuşta bölüm</small></div>
        <div><strong>{binge.count}</strong><small>3+ bölümlük maraton</small></div>
      </div>
      {title ? <button type="button" className="media-button" onClick={() => onOpen(title.key)}>Diziye git</button> : null}
    </div>
  </article>;
}

function Pending({ icon, title, copy }: { icon: React.ReactNode; title: string; copy: string }) {
  return <article className="perde-card perde-pending"><header>{icon}<span>{title.toLocaleUpperCase("tr-TR")}</span></header><p>{copy}</p></article>;
}

function paceHeadline(pace: ReturnType<typeof showPaces>[number]) {
  if (pace.etaDays !== undefined && pace.remainingEpisodes) return `Bu hızla ${pace.title.name} ${pace.etaDays} günde biter.`;
  return `${pace.title.name}: haftada ${decimal(pace.episodesPerDay * 7)} bölüm gidiyorsun.`;
}

function finishHeadline(finish: ReturnType<typeof finishInsight>) {
  if (!finish.moviesStarted) return finish.episodesFinished ? `${finish.episodesFinished} bölüm bitirdin, henüz film yok.` : "Henüz biten bir şey yok.";
  if (finish.moviesAbandoned && finish.averageStopPercent !== undefined) return `Başladığın ${finish.moviesStarted} filmden ${finish.moviesAbandoned} tanesini ortalama ${percentWith(finish.averageStopPercent, "locative")} kapattın.`;
  return `Başladığın ${finish.moviesStarted} filmin ${finish.moviesFinished} tanesini bitirdin.`;
}
