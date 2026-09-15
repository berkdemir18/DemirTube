import { describe, expect, it } from "vitest";
import { classifyExportFiles } from "../src/media/trakt-export";
import { readZip } from "../src/media/zip";

/** Test için en küçük geçerli ZIP: her dosya deflate ya da stored. */
async function deflateRaw(raw: Uint8Array) {
  const stream = new Blob([raw as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function makeZip(files: { name: string; content: string; store?: boolean }[]) {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const raw = encoder.encode(file.content);
    const data = file.store ? raw : await deflateRaw(raw);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, file.store ? 0 : 8, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, name.length, true);
    const localBytes = new Uint8Array([...new Uint8Array(local.buffer), ...name, ...data]);
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(10, file.store ? 0 : 8, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, raw.length, true);
    central.setUint16(28, name.length, true);
    central.setUint32(42, offset, true);
    centrals.push(new Uint8Array([...new Uint8Array(central.buffer), ...name]));
    locals.push(localBytes);
    offset += localBytes.length;
  }
  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  const all = new Uint8Array([...locals.flatMap((item) => [...item]), ...centrals.flatMap((item) => [...item]), ...new Uint8Array(eocd.buffer)]);
  return all.buffer;
}

const show = { title: "Severance", year: 2022, ids: { trakt: 1, slug: "severance", tmdb: 95396 } };
const historyPage1 = [{ id: 1, watched_at: "2026-09-01T21:00:00.000Z", action: "watch", type: "episode", show, episode: { season: 1, number: 1, ids: {} } }];
const historyPage2 = [
  { id: 2, watched_at: "2026-09-02T21:00:00.000Z", action: "watch", type: "episode", show, episode: { season: 1, number: 2, ids: {} } },
  { id: 1, watched_at: "2026-09-01T21:00:00.000Z", action: "watch", type: "episode", show, episode: { season: 1, number: 1, ids: {} } },
];

describe("readZip", () => {
  it("deflate ve stored dosyaları açar, filtreye uymayanı atlar", async () => {
    const zip = await makeZip([
      { name: "trakt/watched-history-1.json", content: JSON.stringify(historyPage1) },
      { name: "trakt/readme.txt", content: "merhaba", store: true },
      { name: "trakt/watchlist-1.json", content: "[]", store: true },
    ]);
    const entries = await readZip(zip, (name) => name.endsWith(".json"));
    expect(entries.map((entry) => entry.name)).toEqual(["trakt/watched-history-1.json", "trakt/watchlist-1.json"]);
    expect(JSON.parse(new TextDecoder().decode(entries[0].bytes))).toEqual(historyPage1);
  });

  it("ZIP olmayan dosyada anlaşılır hata verir", async () => {
    await expect(readZip(new TextEncoder().encode("bu bir zip değil ama yeterince uzun bir metin").buffer)).rejects.toThrow("ZIP dosyası değil");
  });
});

describe("classifyExportFiles", () => {
  it("dosyaları adına değil içeriğine göre ayırır, sayfalar arası tekrarı atar", () => {
    const result = classifyExportFiles([
      { name: "watched-history-1.json", data: historyPage1 },
      { name: "watched-history-2.json", data: historyPage2 },
      { name: "ratings-shows-1.json", data: [{ rated_at: "2026-09-03T00:00:00Z", rating: 9, type: "show", show }] },
      { name: "watchlist-1.json", data: [{ listed_at: "2026-09-04T00:00:00Z", type: "movie", movie: { title: "Dune", year: 2021, ids: { tmdb: 438631 } } }] },
      { name: "lists-favoriler-1.json", data: [{ listed_at: "2026-09-04T00:00:00Z", type: "movie", movie: { title: "X", ids: { tmdb: 1 } } }] },
      { name: "watched-shows-1.json", data: [{ last_watched_at: "2026-09-02T21:00:00Z", plays: 2, show, seasons: [] }] },
      { name: "comments-1.json", data: [] },
    ]);
    expect(result.input.history.map((item) => item.id)).toEqual([1, 2]);
    expect(result.input.ratings).toHaveLength(1);
    expect(result.input.watchlist).toHaveLength(1);
    expect(result.files).toBe(4);
    expect(result.skippedFiles).toEqual(["lists-favoriler-1.json", "watched-shows-1.json", "comments-1.json"]);
  });

  it("kimliği olmayan geçmiş kaydına kararlı kimlik verir", () => {
    const entry = { watched_at: "2026-09-01T21:00:00.000Z", type: "episode", show, episode: { season: 1, number: 1, ids: {} } };
    const first = classifyExportFiles([{ name: "history.json", data: [entry] }]).input.history[0].id;
    const second = classifyExportFiles([{ name: "history.json", data: [{ ...entry }] }]).input.history[0].id;
    expect(first).toBe(second);
    expect(first).toBeLessThan(0);
  });
});
