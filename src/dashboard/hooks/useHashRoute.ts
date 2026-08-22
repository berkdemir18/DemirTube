// DemirTube · dashboard hash yönlendirmesi
//
// Sayfa, analiz dönemi ve dönem çıpası artık yalnızca bellekte değil URL'de tutulur:
//   #/channels?period=week&at=2026-07-28
// Böylece dashboard yenilendiğinde aynı ekran açılır, tarayıcı geri/ileri tuşları
// çalışır ve belirli bir ekranın bağlantısı paylaşılabilir.
import { useCallback, useEffect, useState } from "react";
import type { AnalyticsPeriod } from "../../analytics/period";
import { isPageId, type PageId } from "../navigation";

export type Route = {
  page: PageId;
  period: AnalyticsPeriod;
  anchor: Date;
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
  };
}

export function routeToHash({ page, period, anchor }: Route) {
  return `#/${page}?period=${period}&at=${dateKey(anchor)}`;
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));

  // Tarayıcı geri/ileri tuşu ve elle yazılan adres.
  useEffect(() => {
    const sync = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  // Durum değiştikçe adresi güncelle; aynı hash için yeni geçmiş kaydı oluşturma.
  useEffect(() => {
    const next = routeToHash(route);
    if (location.hash !== next) history.replaceState(null, "", next);
  }, [route.page, route.period, route.anchor.getTime()]);

  const setPage = useCallback((page: PageId) => {
    setRoute((current) => {
      if (current.page === page) return current;
      // Sayfa değişimi gerçek bir gezinme: geri tuşu önceki sayfaya dönsün.
      history.pushState(null, "", routeToHash({ ...current, page }));
      return { ...current, page };
    });
  }, []);

  // Dönem değişince çıpa bugüne döner (eski davranış korunur).
  const setPeriod = useCallback((period: AnalyticsPeriod) => {
    setRoute((current) => ({ ...current, period, anchor: new Date() }));
  }, []);

  const setAnchor = useCallback((anchor: Date) => {
    setRoute((current) => ({ ...current, anchor }));
  }, []);

  return { ...route, setPage, setPeriod, setAnchor };
}
