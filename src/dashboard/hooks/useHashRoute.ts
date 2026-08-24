// DemirTube · dashboard hash yönlendirmesi
//
// Sayfa, analiz dönemi ve dönem çıpası artık yalnızca bellekte değil URL'de tutulur:
//   #/channels?period=week&at=2026-07-28&channel=Fireship
// Böylece dashboard yenilendiğinde aynı ekran açılır, tarayıcı geri/ileri tuşları
// çalışır ve belirli bir ekranın bağlantısı paylaşılabilir.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalyticsPeriod } from "../../analytics/period";
import { isPageId, type PageId } from "../navigation";

export type Route = {
  page: PageId;
  period: AnalyticsPeriod;
  anchor: Date;
  /** Kanallar ekranında açık olan kanal profili; liste görünümünde boştur. */
  channel?: string;
  /** Konular ekranında odaklanılan konu; liste görünümünde boştur. */
  topic?: string;
};

const DEFAULT_ROUTE: Route = { page: "overview", period: "week", anchor: new Date() };
const periods = new Set<string>(["day", "week", "month", "all"]);

function dateKey(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function parseAnchor(value: string | null) {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return undefined;
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [pagePart, queryPart] = raw.split("?");
  const query = new URLSearchParams(queryPart ?? "");
  const period = query.get("period");
  return {
    page: isPageId(pagePart) ? pagePart : DEFAULT_ROUTE.page,
    period: period && periods.has(period) ? period as AnalyticsPeriod : DEFAULT_ROUTE.period,
    anchor: parseAnchor(query.get("at")) ?? new Date(),
    channel: query.get("channel") || undefined,
    topic: query.get("topic") || undefined,
  };
}

export function routeToHash({ page, period, anchor, channel, topic }: Route) {
  const base = `#/${page}?period=${period}&at=${dateKey(anchor)}`;
  // Ayrıntı seçimleri yalnızca ait oldukları ekranda adreste tutulur; başka
  // sayfaya geçince adres temiz kalsın.
  if (page === "channels" && channel) return `${base}&channel=${encodeURIComponent(channel)}`;
  if (page === "topics" && topic) return `${base}&topic=${encodeURIComponent(topic)}`;
  return base;
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  // Bir sonraki adres yazımının geçmişe yeni kayıt bırakıp bırakmayacağı.
  // Bayrak, `history.pushState` çağrısını state güncelleyicisinin dışında tutar:
  // React StrictMode güncelleyiciyi iki kez çalıştırdığı için, pushState orada
  // kalsaydı tek tıklamada iki geçmiş kaydı oluşuyor ve geri tuşu boş bir adıma
  // düşüyordu.
  const pushNext = useRef(false);

  // Tarayıcı geri/ileri tuşu ve elle yazılan adres.
  useEffect(() => {
    const sync = () => { pushNext.current = false; setRoute(parseHash(location.hash)); };
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Durum değiştikçe adresi güncelle; aynı hash için yeni geçmiş kaydı oluşturma.
  useEffect(() => {
    const next = routeToHash(route);
    const push = pushNext.current;
    pushNext.current = false;
    if (location.hash === next) return;
    if (push) history.pushState(null, "", next);
    else history.replaceState(null, "", next);
  }, [route.page, route.period, route.anchor.getTime(), route.channel, route.topic]);

  // Sayfa değişimi gerçek bir gezinme: geri tuşu önceki sayfaya dönsün.
  const setPage = useCallback((page: PageId) => {
    pushNext.current = true;
    // Menüden sayfa değişimi ayrıntı seçimini bırakır; kanal profili açıkken
    // başka ekrana geçip geri dönünce liste görünümü beklenir.
    setRoute((current) => current.page === page ? current : { ...current, page, channel: undefined, topic: undefined });
  }, []);

  // Dönem değişince çıpa bugüne döner (eski davranış korunur).
  const setPeriod = useCallback((period: AnalyticsPeriod) => {
    setRoute((current) => ({ ...current, period, anchor: new Date() }));
  }, []);

  const setAnchor = useCallback((anchor: Date) => {
    setRoute((current) => ({ ...current, anchor }));
  }, []);

  // Kanal profili açmak da gezinmedir: geri tuşu kanal listesine dönmeli.
  const setChannel = useCallback((channel?: string) => {
    pushNext.current = true;
    setRoute((current) => current.channel === channel && current.page === "channels"
      ? current
      : { ...current, page: "channels", channel });
  }, []);

  const setTopic = useCallback((topic?: string) => {
    pushNext.current = true;
    setRoute((current) => current.topic === topic && current.page === "topics"
      ? current
      : { ...current, page: "topics", topic });
  }, []);

  return { ...route, setPage, setPeriod, setAnchor, setChannel, setTopic };
}
