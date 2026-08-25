/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import {
  collectHistoryEntries, parseDurationLabel, parseHistoryCard, parseHistoryDateLabel,
  parseProgressPercent, reachedCutoff, withinDays,
} from "../src/content/history-parser";

const NOW = new Date(2026, 7, 25, 12, 0, 0); // 25 Ağustos 2026

/** Geçmiş sayfasındaki tek bir kartın gerçekçi işaretlemesi. */
function card({
  videoId = "abc123", title = "Rust ile sistem programlama", channel = "Kod Kanalı",
  duration = "12:30", progress = "45",
}: Partial<{ videoId: string; title: string; channel: string; duration: string; progress: string }> = {}) {
  return `
    <ytd-video-renderer>
      <ytd-thumbnail>
        <a href="/watch?v=${videoId}"><img src="https://i.ytimg.com/vi/${videoId}/hq.jpg"></a>
        <ytd-thumbnail-overlay-time-status-renderer><span>${duration}</span></ytd-thumbnail-overlay-time-status-renderer>
        ${progress === "" ? "" : `<ytd-thumbnail-overlay-resume-playback-renderer><div id="progress" style="width: ${progress}%"></div></ytd-thumbnail-overlay-resume-playback-renderer>`}
      </ytd-thumbnail>
      <div id="meta">
        <a id="video-title" href="/watch?v=${videoId}">${title}</a>
        <ytd-channel-name id="channel-name"><a href="/@kanal">${channel}</a></ytd-channel-name>
      </div>
    </ytd-video-renderer>`;
}

function section(label: string, cards: string) {
  return `<ytd-item-section-renderer><div id="title">${label}</div>${cards}</ytd-item-section-renderer>`;
}

function render(html: string) {
  document.body.innerHTML = html;
  return document.body;
}

describe("süre ve ilerleme okuma", () => {
  it("dakika ve saatli süreleri saniyeye çevirir", () => {
    expect(parseDurationLabel("12:30")).toBe(750);
    expect(parseDurationLabel("1:02:30")).toBe(3_750);
    expect(parseDurationLabel(" 0:45 ")).toBe(45);
    expect(parseDurationLabel("CANLI")).toBe(0);
    expect(parseDurationLabel("")).toBe(0);
  });

  it("küçük resimdeki kaldığın yer çubuğunu yüzdeye çevirir", () => {
    const root = render(card({ progress: "63.5" }));
    expect(parseProgressPercent(root.querySelector("ytd-video-renderer")!)).toBeCloseTo(63.5, 1);

    const withoutBar = render(card({ progress: "" }));
    expect(parseProgressPercent(withoutBar.querySelector("ytd-video-renderer")!)).toBeUndefined();
  });
});

describe("bölüm tarihi", () => {
  it("göreli etiketleri çözer", () => {
    expect(parseHistoryDateLabel("Bugün", NOW)?.getDate()).toBe(25);
    expect(parseHistoryDateLabel("Dün", NOW)?.getDate()).toBe(24);
    expect(parseHistoryDateLabel("Today", NOW)?.getDate()).toBe(25);
  });

  it("Türkçe ve İngilizce tarihleri çözer", () => {
    const turkish = parseHistoryDateLabel("22 Ağu 2026", NOW)!;
    expect(turkish.getMonth()).toBe(7);
    expect(turkish.getDate()).toBe(22);

    const english = parseHistoryDateLabel("Aug 22, 2026", NOW)!;
    expect(english.getMonth()).toBe(7);
    expect(english.getDate()).toBe(22);
  });

  it("çözemediği etiket için tarih uydurmaz", () => {
    expect(parseHistoryDateLabel("Bu hafta bir ara", NOW)).toBeUndefined();
    expect(parseHistoryDateLabel("", NOW)).toBeUndefined();
  });
});

describe("kart okuma", () => {
  it("videoyu, kanalı, süreyi ve ilerlemeyi okur", () => {
    const root = render(card());
    const entry = parseHistoryCard(root.querySelector("ytd-video-renderer")!, NOW)!;

    expect(entry).toMatchObject({
      videoId: "abc123",
      title: "Rust ile sistem programlama",
      channelName: "Kod Kanalı",
      durationSeconds: 750,
      url: "https://www.youtube.com/watch?v=abc123",
    });
    expect(entry.progressPercent).toBe(45);
    expect(entry.topics.length).toBeGreaterThan(0);
  });

  it("Shorts bağlantısını doğru çözer", () => {
    const root = render(`
      <ytd-video-renderer>
        <a id="video-title" href="/shorts/short99">Kısa video</a>
        <ytd-channel-name id="channel-name"><a href="/@k">Kanal</a></ytd-channel-name>
      </ytd-video-renderer>`);
    const entry = parseHistoryCard(root.querySelector("ytd-video-renderer")!)!;

    expect(entry.videoId).toBe("short99");
    expect(entry.url).toBe("https://www.youtube.com/shorts/short99");
  });

  it("başlığı okunamayan veya bağlantısız kartı atlar", () => {
    const noLink = render("<ytd-video-renderer><div>boş</div></ytd-video-renderer>");
    expect(parseHistoryCard(noLink.querySelector("ytd-video-renderer")!)).toBeNull();

    // "Yorumlar 1,4 B" gibi metinler başlık sayılmaz (usableTitle koruması).
    const junk = render(`<ytd-video-renderer><a id="video-title" href="/watch?v=x1">YouTube</a></ytd-video-renderer>`);
    expect(parseHistoryCard(junk.querySelector("ytd-video-renderer")!)).toBeNull();
  });
});

describe("sayfa toplama", () => {
  const page = section("Bugün", card({ videoId: "a1", title: "Bugünkü video" }))
    + section("Dün", card({ videoId: "b1", title: "Dünkü video" }) + card({ videoId: "b2", title: "İkinci dünkü video" }))
    + section("10 Tem 2026", card({ videoId: "c1", title: "Eski video" }));

  it("her kartı kendi bölümünün tarihiyle eşler", () => {
    const entries = collectHistoryEntries(render(page), NOW);

    expect(entries.map((entry) => entry.videoId)).toEqual(["a1", "b1", "b2", "c1"]);
    expect(new Date(entries[0].watchedAt!).getDate()).toBe(25);
    expect(new Date(entries[1].watchedAt!).getDate()).toBe(24);
    expect(new Date(entries[3].watchedAt!).getMonth()).toBe(6);
  });

  it("aynı video birden çok kez göründüğünde bir kez alır", () => {
    const repeated = section("Bugün", card({ videoId: "a1" })) + section("Dün", card({ videoId: "a1" }));
    expect(collectHistoryEntries(render(repeated), NOW)).toHaveLength(1);
  });

  it("gün aralığına göre eler ve sınıra ulaşıldığını bildirir", () => {
    const entries = collectHistoryEntries(render(page), NOW);

    expect(withinDays(entries, 30, NOW).map((entry) => entry.videoId)).toEqual(["a1", "b1", "b2"]);
    expect(reachedCutoff(entries, 30, NOW)).toBe(true);
    expect(reachedCutoff(entries, 365, NOW)).toBe(false);
  });

  it("bölüm başlığı olmayan sayfada da kartları toplar", () => {
    const flat = card({ videoId: "z1" }) + card({ videoId: "z2" });
    const entries = collectHistoryEntries(render(flat), NOW);

    expect(entries).toHaveLength(2);
    expect(entries[0].watchedAt).toBeUndefined();
    // Tarihi bilinmeyen kayıt elenmez; kullanıcı geçmişi boşuna kaybetmesin.
    expect(withinDays(entries, 30, NOW)).toHaveLength(2);
  });
});
