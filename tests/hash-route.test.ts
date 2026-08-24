import { describe, expect, it } from "vitest";
import { parseHash, routeToHash } from "../src/dashboard/hooks/useHashRoute";

describe("dashboard hash yönlendirmesi", () => {
  it("boş hash için varsayılan rotayı verir", () => {
    const route = parseHash("");
    expect(route.page).toBe("overview");
    expect(route.period).toBe("week");
  });

  it("sayfa, dönem ve çıpayı adresten okur", () => {
    const route = parseHash("#/channels?period=month&at=2026-07-28");
    expect(route.page).toBe("channels");
    expect(route.period).toBe("month");
    expect(route.anchor.getFullYear()).toBe(2026);
    expect(route.anchor.getMonth()).toBe(6);
    expect(route.anchor.getDate()).toBe(28);
  });

  it("bilinmeyen sayfa ve dönemi varsayılana düşürür", () => {
    const route = parseHash("#/olmayan-sayfa?period=yüzyıl&at=bozuk");
    expect(route.page).toBe("overview");
    expect(route.period).toBe("week");
    expect(Number.isNaN(route.anchor.getTime())).toBe(false);
  });

  it("baştaki eğik çizgi olmadan da çözer", () => {
    expect(parseHash("#statistics").page).toBe("statistics");
  });

  it("üretilen adres yeniden çözüldüğünde aynı rotayı verir", () => {
    const route = { page: "titles", period: "day", anchor: new Date(2026, 0, 5) } as const;
    const parsed = parseHash(routeToHash({ ...route }));
    expect(parsed.page).toBe("titles");
    expect(parsed.period).toBe("day");
    expect(parsed.anchor.getTime()).toBe(new Date(2026, 0, 5).getTime());
  });

  it("tek haneli ay ve günü sıfırla doldurur", () => {
    expect(routeToHash({ page: "overview", period: "week", anchor: new Date(2026, 2, 9) }))
      .toBe("#/overview?period=week&at=2026-03-09");
  });

  it("kanal ve konu seçimini adresten okur, geri yazarken kodlar", () => {
    const parsed = parseHash("#/channels?period=week&at=2026-07-28&channel=Kod%20Kanal%C4%B1");
    expect(parsed.channel).toBe("Kod Kanalı");

    const hash = routeToHash({ page: "channels", period: "week", anchor: new Date(2026, 6, 28), channel: "Kod Kanalı" });
    expect(hash).toBe("#/channels?period=week&at=2026-07-28&channel=Kod%20Kanal%C4%B1");
    expect(parseHash(hash).channel).toBe("Kod Kanalı");

    const topicHash = routeToHash({ page: "topics", period: "all", anchor: new Date(2026, 6, 28), topic: "Yapay zekâ" });
    expect(parseHash(topicHash).topic).toBe("Yapay zekâ");
  });

  it("ayrıntı seçimini yalnızca ait olduğu sayfada adrese yazar", () => {
    // Kanal seçimi Konular ekranının adresine sızmamalı.
    const hash = routeToHash({ page: "topics", period: "week", anchor: new Date(2026, 6, 28), channel: "Kod Kanalı" });
    expect(hash).toBe("#/topics?period=week&at=2026-07-28");
    expect(parseHash(hash).channel).toBeUndefined();
  });
});
