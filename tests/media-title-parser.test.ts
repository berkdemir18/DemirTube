import { describe, expect, it } from "vitest";
import { isGenericTitle, normalizeTitle, parseMediaTitle } from "../src/media/title-parser";

const parse = (documentTitle: string) => parseMediaTitle({ documentTitle });

describe("parseMediaTitle · sayfa başlıkları", () => {
  it.each([
    ["Loki 2. Sezon 4. Bölüm Türkçe Altyazılı İzle - DiziBox", "Loki", 2, 4],
    ["The Bear S03E02 izle | HD", "The Bear", 3, 2],
    ["Breaking Bad 5x14 izle - dizimom.com", "Breaking Bad", 5, 14],
    ["Kuruluş Osman 164. Bölüm izle", "Kuruluş Osman", 1, 164],
    ["Severance Sezon 2 Bölüm 10 Full HD", "Severance", 2, 10],
    ["Watch Shōgun Season 1 Episode 9 Online", "Shōgun", 1, 9],
    ["House of the Dragon 2.Sezon 8.Bölüm Türkçe Dublaj", "House of the Dragon", 2, 8],
    ["Andor S2 E7 - Disney+", "Andor", 2, 7],
  ])("%s", (title, query, season, episode) => {
    expect(parse(title)).toMatchObject({ query, season, episode, kind: "tv" });
  });

  it("filmde yılı ayırır ve film olduğunu anlar", () => {
    expect(parse("Dune: Part Two (2024) Full HD Tek Parça İzle")).toEqual({ query: "Dune: Part Two", year: 2024, kind: "movie" });
  });

  it("işaretsiz başlıkta türü bilinmiyor bırakır", () => {
    expect(parse("Oppenheimer izle - filmmakinesi")).toMatchObject({ query: "Oppenheimer", kind: "unknown" });
  });

  it("adın içindeki tireyi site ayracı sanmaz", () => {
    expect(parse("Spider-Man: Across the Spider-Verse izle")).toMatchObject({ query: "Spider-Man: Across the Spider-Verse" });
  });

  it("boş ya da yalnız gürültü olan başlıkta vazgeçer", () => {
    expect(parse("")).toBeUndefined();
    expect(parse("Full HD izle")).toBeUndefined();
  });
});

describe("parseMediaTitle · oynatıcı başlığı", () => {
  it("Netflix: dizi adı ayrı, bölüm alt satırda", () => {
    expect(parseMediaTitle({ documentTitle: "Netflix", platformTitle: "Stranger Things", platformSubtitle: "S4:E7 The Massacre at Hawkins Lab" }))
      .toMatchObject({ query: "Stranger Things", season: 4, episode: 7, kind: "tv" });
  });

  it("Prime: 'Season 1, Ep. 3' biçimi", () => {
    expect(parseMediaTitle({ documentTitle: "Prime Video", platformTitle: "The Boys", platformSubtitle: "Season 1, Ep. 3 Get Some" }))
      .toMatchObject({ query: "The Boys", season: 1, episode: 3 });
  });

  it("oynatıcı başlığı yoksa sayfa başlığına düşer", () => {
    expect(parseMediaTitle({ documentTitle: "Dark S01E01 izle", platformTitle: " " })).toMatchObject({ query: "Dark", season: 1, episode: 1 });
  });
});

describe("isGenericTitle", () => {
  it("platform ya da site adını başlık saymaz", () => {
    expect(isGenericTitle("Netflix")).toBe(true);
    expect(isGenericTitle("Disney+")).toBe(true);
    expect(isGenericTitle("DiziBox", "www.dizibox.plus")).toBe(true);
    expect(isGenericTitle("Loki", "www.dizibox.plus")).toBe(false);
  });
});

describe("normalizeTitle", () => {
  it("Türkçe karakter ve noktalama farkını siler", () => {
    expect(normalizeTitle("Kuruluş: Osman!")).toBe(normalizeTitle("kurulus osman"));
    expect(normalizeTitle("Shōgun")).toBe("shogun");
  });
});
