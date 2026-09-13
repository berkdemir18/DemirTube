import type { Confidence, VideoFormat, VideoMetadata, VideoRecord } from "../shared/types";
import { CLICKBAIT_TERMS } from "../shared/constants";
import { durationBucket } from "./duration";
import { evidenceLevel } from "./evidence";
import { normalizeText, round } from "../shared/utils";

export type VideoIntent =
  | "tutorial" | "review" | "comparison" | "news" | "commentary"
  | "interview" | "documentary" | "gameplay" | "vlog" | "sports"
  | "music" | "entertainment" | "unknown";

export type IntelligenceSignal = {
  label: string;
  evidence: string;
  tone: "positive" | "neutral" | "warning";
};

export type VideoIntelligence = {
  intent: VideoIntent;
  intentLabel: string;
  format: VideoFormat;
  formatLabel: string;
  valueType: "learning" | "entertainment" | "mixed";
  depthLabel: string;
  attentionLabel: string;
  freshnessLabel: string;
  confidence: Confidence;
  summary: string;
  watchAdvice: string;
  titlePatterns: string[];
  signals: IntelligenceSignal[];
};

export type WatchOutcome = {
  label: string;
  explanation: string;
  tone: "positive" | "neutral" | "warning";
};

export type AutonomousInsight = {
  key: string;
  eyebrow: string;
  headline: string;
  explanation: string;
  confidence: Confidence;
};

const intentRules: Array<{ intent: VideoIntent; label: string; terms: RegExp }> = [
  { intent: "tutorial", label: "Öğretici / rehber", terms: /\bnasil\b|\brehber\b|\btutorial\b|\bders\b|\bogren|\bkurulum\b|\badim adim\b|\begitim\b|\buygulamali\b|\bbirlikte yap\b|\bproje yap/ },
  { intent: "review", label: "İnceleme", terms: /\bincele|\breview\b|\btest ett|\bdenedim\b|\balinir mi\b|\bkullanim deneyimi\b/ },
  { intent: "comparison", label: "Karşılaştırma", terms: /\bkarşılaştır|\bkarsilast|\bversus\b|\bvs\b|\bhangisi\b|\bfarkları\b|\bfarklari\b/ },
  { intent: "news", label: "Haber / güncelleme", terms: /\bhaber\b|\bson dakika\b|\baciklandi\b|\bguncelleme\b|\byeni geldi\b|\bduyuruldu\b|\bgundem\b/ },
  { intent: "interview", label: "Röportaj / sohbet", terms: /\broportaj\b|\binterview\b|\bkonuk\b|\bsohbet\b|\bpodcast\b|\bpodkast\b/ },
  { intent: "documentary", label: "Belgesel / araştırma", terms: /\bbelgesel\b|\bdocumen|\bhikayesi\b|\bnasil oldu\b|\barastirma\b|\bdosya\b/ },
  { intent: "commentary", label: "Yorum / analiz", terms: /\byorum\b|\banaliz\b|\bdeğerlendirme\b|\bdegerlendirme\b|\btepki\b|\breaction\b|\bfikirlerim\b/ },
  { intent: "gameplay", label: "Oynanış / oyun", terms: /\bgameplay\b|\boynuyoruz\b|\boynanis\b|\blets play\b|\bwalkthrough\b|\bbolum \d+\b/ },
  { intent: "vlog", label: "Vlog / günlük yaşam", terms: /\bvlog\b|\bbir gunum\b|\bgunluk hayat\b|\bgezi gunlugu\b|\bbenimle\b/ },
  { intent: "sports", label: "Spor / maç", terms: /\bmac ozeti\b|\bgoller\b|\bfutbol\b|\bbasketbol\b|\bderbi\b|\blig\b|\bspor\b/ },
  { intent: "music", label: "Müzik", terms: /\bofficial audio\b|\bofficial music video\b|\blyrics?\b|\bmuzik\b|\bsarki\b|\bklip\b/ },
  { intent: "entertainment", label: "Eğlence", terms: /\bchallenge\b|\bmeydan okuma\b|\bkomik\b|\beglence\b|\bprank\b|\bdeniyoruz\b/ }
];

// Amaç kuralları her çağrıda yeniden derleniyordu: 12 kural × 3 metin × geçmişteki
// her video = yüz binlerce RegExp kurulumu. Derlenmiş global kopyalar bir kez üretilir.
const globalPatterns = new Map<string, RegExp>();

function matchCount(pattern: RegExp, text: string) {
  let compiled = globalPatterns.get(pattern.source);
  if (!compiled) {
    compiled = new RegExp(pattern.source, "g");
    globalPatterns.set(pattern.source, compiled);
  }
  return text.match(compiled)?.length ?? 0;
}

/**
 * Geçmişteki bir kaydın formatı. Aynı kayıt tek bir puanlama turunda onlarca kez
 * sorgulanıyor (keşfette 40 kart × tüm geçmiş); sonuç kayıt bazında saklanır.
 */
const recordFormats = new Map<string, VideoFormat>();
/**
 * Nesne kimliğine bağlı önbellek. Anahtar üretmek (başlığı da içeren bir dize
 * birleştirme) tek başına ölçülebilir bir maliyetti: 1500 videoluk kütüphanede
 * bu fonksiyon iki milyondan fazla kez çağrılıyor.
 */
const recordFormatsByRef = new WeakMap<VideoRecord, VideoFormat>();

export function recordVideoFormat(video: VideoRecord): VideoFormat {
  if (video.videoFormat) return video.videoFormat;
  const byRef = recordFormatsByRef.get(video);
  if (byRef !== undefined) return byRef;
  const key = `${video.videoId}|${video.contentType}|${video.durationSeconds}|${video.title}`;
  let cached = recordFormats.get(key);
  if (cached === undefined) {
    cached = formatOf(video, intentOf(video)).format;
    if (recordFormats.size > 4_000) recordFormats.clear();
    recordFormats.set(key, cached);
  }
  recordFormatsByRef.set(video, cached);
  return cached;
}

function intentOf(metadata: VideoMetadata): { intent: VideoIntent; label: string; matches: number } {
  const title = normalizeText(metadata.title);
  const description = normalizeText(metadata.description ?? "");
  const supporting = normalizeText([
    metadata.channelName,
    ...(metadata.hashtags ?? []),
    ...metadata.topics,
    ...(metadata.transcriptAnalysis?.keywords ?? [])
  ].join(" "));
  const matches = intentRules
    .map((rule, priority) => {
      const titleMatches = matchCount(rule.terms, title);
      const descriptionMatches = matchCount(rule.terms, description);
      const supportingMatches = matchCount(rule.terms, supporting);
      return {
        ...rule,
        priority,
        matches: titleMatches + descriptionMatches + supportingMatches,
        score: titleMatches * 5 + descriptionMatches * 2 + supportingMatches * 3
      };
    })
    .toSorted((a, b) => b.score - a.score || a.priority - b.priority);
  return matches[0]?.score ? matches[0] : { intent: "unknown", label: "Genel içerik", matches: 0 };
}

function titlePatterns(title: string) {
  const normalized = normalizeText(title);
  const patterns: string[] = [];
  if (CLICKBAIT_TERMS.some((term) => normalized.includes(normalizeText(term)))) patterns.push("yüksek merak dili");
  if (/\?/.test(title)) patterns.push("soru başlığı");
  if (/\d/.test(title)) patterns.push("sayısal vaat");
  if (/[A-ZÇĞİÖŞÜ]{4,}/.test(title)) patterns.push("büyük harf vurgusu");
  if (/\b(en|ilk|tek|asla|mutlaka|kesin)\b/.test(normalized)) patterns.push("kesinlik iddiası");
  return patterns;
}

export function formatOf(metadata: VideoMetadata, intent: { intent: VideoIntent }): { format: VideoFormat; label: string } {
  if (metadata.videoFormat) return { format: metadata.videoFormat, label: videoFormatLabel(metadata.videoFormat) };
  const text = normalizeText(`${metadata.title} ${metadata.description ?? ""} ${(metadata.hashtags ?? []).join(" ")}`)
    .normalize("NFD").replace(/\p{M}/gu, "").replace(/ı/g, "i");
  const minutes = metadata.durationSeconds / 60;
  if (metadata.contentType === "short") return { format: "short_vertical", label: "Kısa dikey video" };
  if (/\b(fragman|trailer|teaser|tanitim)\b/.test(text)) return { format: "trailer", label: "Fragman / tanıtım" };
  if (metadata.contentType === "music" || intent.intent === "music") return { format: "music_video", label: "Müzik videosu" };
  if (/\b(webinar|web semineri|online seminer)\b/.test(text)) return { format: "webinar", label: "Webinar / çevrim içi seminer" };
  if (/\b(canli performans|live performance|konser|acoustic session|akustik performans)\b/.test(text)) return { format: "live_performance", label: "Canlı performans" };
  if (/\b(asmr|ambient|ortam sesi|sleep sounds?|study sounds?)\b/.test(text)) return { format: "ambient_asmr", label: "ASMR / ortam videosu" };
  if (/\b(kamera arkasi|behind the scenes|making of|set gunlugu)\b/.test(text)) return { format: "behind_the_scenes", label: "Kamera arkası / yapım süreci" };
  if (/\b(derleme|compilation|best of|en iyi anlar)\b/.test(text)) return { format: "compilation", label: "Derleme / seçki" };
  if (/\b(unboxing|kutu acilimi|kutudan cikiyor)\b/.test(text)) return { format: "unboxing", label: "Kutu açılımı" };
  if (/\b(ilk bakis|first look|first impressions?|ilk izlenim)\b/.test(text)) return { format: "first_impressions", label: "İlk bakış / ilk izlenim" };
  if (/\b(walkthrough|tam cozum|bolum cozum|oyun rehberi)\b/.test(text)) return { format: "walkthrough", label: "Tam çözüm / walkthrough" };
  if (/\b(qa|q&a|soru cevap|sorularinizi cevapliyorum|ama\b)\b/.test(text)) return { format: "qa", label: "Soru-cevap / AMA" };
  if (/\b(munazara|debate|karsi karsiya|tartisma)\b/.test(text)) return { format: "debate", label: "Tartışma / münazara" };
  if (/\b(panel|yuvarlak masa|roundtable|acik oturum)\b/.test(text)) return { format: "panel_discussion", label: "Panel / yuvarlak masa" };
  if (/\b(video essay|video deneme|deneme filmi)\b/.test(text)) return { format: "video_essay", label: "Video deneme" };
  if (/\b(storytime|basimdan gecen|animi anlatiyorum|hikayemi anlatiyorum)\b/.test(text)) return { format: "storytime", label: "Hikâye / anı anlatımı" };
  if (/\b(case study|vaka analizi|ornek olay|basari hikayesi)\b/.test(text)) return { format: "case_study", label: "Vaka analizi" };
  if (/\b(deep dive|derin analiz|detayli analiz|tum detaylariyla)\b/.test(text)) return { format: "deep_dive", label: "Derin analiz" };
  if (/\b(top \d+|\d+ (madde|neden|ipucu|hata|yontem)|liste)\b/.test(text)) return { format: "listicle", label: "Liste / maddeli anlatım" };
  if (/\b(live coding|canli kodlama|birlikte kodlay|proje gelistir|build with me)\b/.test(text)) return { format: "coding_build", label: "Kodlama / proje yapımı" };
  if (/\b(ekran kaydi|screen recording|ekran paylasimi|uygulama demosu|product demo)\b/.test(text)) return { format: "screen_demo", label: "Ekran kaydı / ürün demosu" };
  if (/\b(kurs|course|lesson \d+|ders \d+|modul \d+|bolum \d+)\b/.test(text)) return { format: "course_lesson", label: "Kurs dersi / seri bölümü" };
  if (/\b(ders|lecture|seminer|sunum|konferans konusmasi)\b/.test(text)) return { format: "lecture", label: "Ders / konferans anlatımı" };
  if (metadata.contentType === "podcast") return { format: "conversation", label: "Uzun sohbet / podcast" };
  if (intent.intent === "tutorial") return { format: "step_by_step", label: /\b(uygulamali|kodlayarak|birlikte yap|proje)\b/.test(text) ? "Uygulamalı rehber" : "Adım adım öğretici" };
  if (intent.intent === "review") return { format: "hands_on_review", label: "Deneyim / ürün incelemesi" };
  if (intent.intent === "comparison") return { format: "comparison", label: "Karşılaştırmalı analiz" };
  if (intent.intent === "news") return { format: "news_update", label: "Haber / hızlı güncelleme" };
  if (intent.intent === "interview") return { format: "interview", label: "Konuklu sohbet / röportaj" };
  if (intent.intent === "documentary") return { format: "documentary_story", label: "Belgesel / hikâye anlatımı" };
  if (intent.intent === "commentary") return { format: "reaction", label: /\b(tepki|reaction)\b/.test(text) ? "Tepki / yorum" : "Yorumlu analiz" };
  if (intent.intent === "gameplay") return { format: "gameplay_series", label: "Oynanış / seri" };
  if (intent.intent === "vlog") return { format: "vlog", label: "Vlog / günlük anlatım" };
  if (intent.intent === "sports") return { format: "sports_highlights", label: /\b(ozet|goller|highlights?)\b/.test(text) ? "Maç özeti / öne çıkanlar" : "Spor yorumu" };
  if (minutes >= 30 || metadata.contentType === "long_form") return { format: "long_form", label: "Uzun anlatı" };
  if (/\b(nedir|neden|nasil|ne demek|aciklama)\b/.test(text)) return { format: "explainer", label: "Açıklayıcı anlatım" };
  return { format: "general", label: "Genel video" };
}

export function videoFormatLabel(format: VideoFormat): string {
  const labels: Record<VideoFormat, string> = {
    short_vertical: "Kısa dikey video",
    step_by_step: "Adım adım öğretici",
    hands_on_review: "Deneyim / ürün incelemesi",
    comparison: "Karşılaştırmalı analiz",
    news_update: "Haber / hızlı güncelleme",
    explainer: "Açıklayıcı anlatım",
    conversation: "Uzun sohbet / podcast",
    interview: "Konuklu sohbet / röportaj",
    documentary_story: "Belgesel / hikâye anlatımı",
    reaction: "Tepki / yorum",
    gameplay_series: "Oynanış / seri",
    vlog: "Vlog / günlük anlatım",
    sports_highlights: "Maç özeti / spor yorumu",
    music_video: "Müzik videosu",
    trailer: "Fragman / tanıtım",
    long_form: "Uzun anlatı",
    lecture: "Ders / konferans anlatımı",
    course_lesson: "Kurs dersi / seri bölümü",
    coding_build: "Kodlama / proje yapımı",
    screen_demo: "Ekran kaydı / ürün demosu",
    case_study: "Vaka analizi",
    deep_dive: "Derin analiz",
    listicle: "Liste / maddeli anlatım",
    qa: "Soru-cevap / AMA",
    debate: "Tartışma / münazara",
    panel_discussion: "Panel / yuvarlak masa",
    video_essay: "Video deneme",
    storytime: "Hikâye / anı anlatımı",
    unboxing: "Kutu açılımı",
    first_impressions: "İlk bakış / ilk izlenim",
    walkthrough: "Tam çözüm / walkthrough",
    compilation: "Derleme / seçki",
    behind_the_scenes: "Kamera arkası / yapım süreci",
    webinar: "Webinar / çevrim içi seminer",
    ambient_asmr: "ASMR / ortam videosu",
    live_performance: "Canlı performans",
    general: "Genel video",
  };
  return labels[format];
}

export const VIDEO_FORMAT_OPTIONS: ReadonlyArray<{ value: VideoFormat; label: string }> = ([
  "step_by_step", "course_lesson", "lecture", "coding_build", "screen_demo",
  "explainer", "deep_dive", "case_study", "listicle", "hands_on_review",
  "unboxing", "first_impressions", "comparison", "news_update", "video_essay",
  "conversation", "interview", "qa", "debate", "panel_discussion", "webinar",
  "documentary_story", "storytime", "reaction", "gameplay_series", "walkthrough",
  "vlog", "behind_the_scenes", "sports_highlights", "compilation",
  "music_video", "live_performance", "ambient_asmr", "trailer", "long_form",
  "short_vertical", "general"
] as VideoFormat[]).map((value) => ({ value, label: videoFormatLabel(value) }));

export function analyzeVideoIntelligence(metadata: VideoMetadata, history: VideoRecord[] = []): VideoIntelligence {
  const text = normalizeText(`${metadata.title} ${metadata.description ?? ""} ${(metadata.hashtags ?? []).join(" ")}`);
  const intent = intentOf(metadata);
  const format = formatOf(metadata, intent);
  const patterns = titlePatterns(metadata.title);
  const isLivestream = metadata.contentType === "livestream";
  const educational = intent.intent === "tutorial" || intent.intent === "documentary"
    || metadata.topics.some((topic) => ["Eğitim", "Programlama", "Yapay zekâ", "Siber güvenlik"].includes(topic));
  const entertainment = ["entertainment", "gameplay", "vlog", "sports", "music"].includes(intent.intent)
    || metadata.topics.some((topic) => ["Oyun", "Dizi ve film", "Futbol", "Basketbol"].includes(topic));
  const valueType = educational && entertainment ? "mixed" : educational ? "learning" : entertainment ? "entertainment" : "mixed";
  const minutes = metadata.durationSeconds / 60;
  const depthLabel = isLivestream
    ? "Akış süresi değişken"
    : metadata.contentType === "short" || minutes < 5
    ? "Hızlı tüketim"
    : (metadata.chapterCount ?? 0) >= 4 || minutes >= 25
      ? "Derinlemesine"
      : "Dengeli anlatım";
  const attentionLabel = isLivestream
    ? "Canlı odak"
    : metadata.contentType === "short" || minutes < 8
    ? "Düşük odak yükü"
    : (metadata.chapterCount ?? 0) >= 3
      ? "Bölümlü odak"
      : minutes >= 30 ? "Uzun odak" : "Orta odak";
  const freshnessLabel = isLivestream
    ? "Anlık içerik"
    : intent.intent === "news" || /\bbugun\b|\bson dakika\b|\bguncel\b|\b202[0-9]\b/.test(text)
    ? "Zamana duyarlı"
    : "Kalıcı içerik";
  // Konu karşılaştırması küme üzerinden: `includes` her kayıt için konu
  // dizisini baştan tarıyordu ve bu filtre geçmişin tamamı kadar çalışıyor.
  const ownTopics = new Set(metadata.topics);
  const similar = history.filter((video) =>
    video.videoId !== metadata.videoId
    && (video.topics.some((topic) => ownTopics.has(topic))
      || recordVideoFormat(video) === format.format)
  );
  const evidence = evidenceLevel(similar.length + (metadata.description ? 2 : 0) + (intent.matches ? 1 : 0), 3, 8);
  const averageCompletion = !isLivestream && similar.length
    ? similar.reduce((sum, video) => sum + video.completionRate, 0) / similar.length * 100
    : undefined;
  const liveHistory = isLivestream ? similar.filter((video) => video.contentType === "livestream") : [];
  const averageLiveMinutes = liveHistory.length
    ? liveHistory.reduce((sum, video) => sum + video.totalActiveWatchSeconds, 0) / liveHistory.length / 60
    : undefined;
  const averageRegret = similar.length
    ? similar.reduce((sum, video) => sum + video.regretScore, 0) / similar.length
    : undefined;
  const signals: IntelligenceSignal[] = isLivestream ? [
    {
      label: "Canlı yayın",
      evidence: "Sabit süre ve klasik tamamlama yerine aktif izleme süresi ile etkileşim ölçülür",
      tone: "neutral"
    },
    {
      label: intent.label,
      evidence: intent.matches ? `${intent.matches} amaç sinyali bulundu` : "Başlık ve açıklama yayın amacını genel olarak gösteriyor",
      tone: "neutral"
    },
    {
      label: format.label,
      evidence: "Başlık, açıklama ve yayın yapısından format tahmini",
      tone: "neutral"
    }
  ] : [
    {
      label: intent.label,
      evidence: intent.matches ? `${intent.matches} amaç sinyali bulundu` : "Başlık ve açıklama genel bir amaç gösteriyor",
      tone: "neutral"
    },
    {
      label: format.label,
      evidence: "Başlık, açıklama ve video yapısından format tahmini",
      tone: "neutral"
    },
    {
      label: depthLabel,
      evidence: `${durationBucket(metadata.durationSeconds)}${metadata.chapterCount ? ` · ${metadata.chapterCount} bölüm işareti` : ""}`,
      tone: depthLabel === "Derinlemesine" ? "positive" : "neutral"
    }
  ];
  if (patterns.length) {
    const isWarning = patterns.includes("yüksek merak dili") || patterns.includes("kesinlik iddiası");
    signals.push({
      label: isWarning ? "Yanıltıcı Başlık (Clickbait) Riski" : "Başlık dikkat çekmeye çalışıyor",
      evidence: patterns.join(", "),
      tone: isWarning ? "warning" : "neutral"
    });
  }
  if (averageCompletion !== undefined) signals.push({
    label: "Geçmişine benziyor",
    evidence: `${similar.length} benzer videoda ortalama %${round(averageCompletion)} tamamlama`,
    tone: averageCompletion >= 60 ? "positive" : averageRegret !== undefined && averageRegret >= 55 ? "warning" : "neutral"
  });
  if (averageLiveMinutes !== undefined) signals.push({
    label: "Geçmiş canlı yayın davranışın",
    evidence: `${liveHistory.length} benzer yayında ortalama ${round(averageLiveMinutes)} dakika aktif izleme`,
    tone: averageLiveMinutes >= 15 ? "positive" : "neutral"
  });
  if (metadata.transcriptAnalysis?.available) signals.push({
    label: metadata.transcriptAnalysis.promiseVerdict === "fulfilled" ? "Başlık vaadi içerikte karşılanıyor"
      : metadata.transcriptAnalysis.promiseVerdict === "weak" ? "Başlık ile içerik zayıf eşleşiyor"
        : "Başlık vaadi kısmen karşılanıyor",
    evidence: `%${metadata.transcriptAnalysis.titlePromiseCoverage} kavram kapsamı · ${metadata.transcriptAnalysis.informationDensity}/100 bilgi yoğunluğu`,
    tone: metadata.transcriptAnalysis.promiseVerdict === "fulfilled" ? "positive"
      : metadata.transcriptAnalysis.promiseVerdict === "weak" ? "warning" : "neutral"
  });
  const summary = isLivestream
    ? `${format.label}; ${valueType === "learning" ? "öğrenme" : valueType === "entertainment" ? "eğlence" : "karma değer"} odaklı bir canlı yayın. Sabit süre ve tamamlanma yerine aktif izleme süresi, geri dönüş ve beğeni sinyalleri değerlendirilir.`
    : `${format.label}; ${valueType === "learning" ? "öğrenme" : valueType === "entertainment" ? "eğlence" : "karma değer"} odaklı, ${depthLabel.toLocaleLowerCase("tr-TR")} bir video.${metadata.transcriptAnalysis?.available ? ` Altyazı analizi ${metadata.transcriptAnalysis.informationDensity}/100 bilgi yoğunluğu gösteriyor.` : ""}`;
  let watchAdvice = "İlk dakikalardaki vaat ile içeriğin gerçekten uyuşup uyuşmadığını kontrol et.";
  if (isLivestream && averageLiveMinutes !== undefined && averageLiveMinutes >= 15) watchAdvice = "Benzer canlı yayınlarda uzun süre kalıyorsun; konu ve kanal uyumu güçlü olabilir.";
  else if (isLivestream) watchAdvice = "Canlı yayında tamamlanma hedefi yok; birkaç dakika izleyip akışın o anki ihtiyacına uyup uymadığına bak.";
  else if (averageCompletion !== undefined && averageCompletion >= 70) watchAdvice = "Benzer içerikleri genelde tamamlıyorsun; güçlü bir eşleşme olabilir.";
  else if (averageRegret !== undefined && averageRegret >= 55) watchAdvice = "Benzer videolarda pişmanlık yüksek; önce açıklama ve bölümlere göz atman daha iyi olabilir.";
  else if (depthLabel === "Derinlemesine") watchAdvice = "Uzun odak istiyor; bölümlerden ihtiyacın olan kısmı seçerek başlamak mantıklı.";
  else if (metadata.contentType === "short") watchAdvice = "Hızlı tüketim formatı; gerçekten istediğin konu buysa izlemeye devam et.";
  return {
    intent: intent.intent,
    intentLabel: intent.label,
    format: format.format,
    formatLabel: format.label,
    valueType,
    depthLabel,
    attentionLabel,
    freshnessLabel,
    confidence: evidence.confidence,
    summary,
    watchAdvice,
    titlePatterns: patterns,
    signals
  };
}

export function evaluateWatchOutcome(video: VideoRecord | undefined, intelligence: VideoIntelligence): WatchOutcome | undefined {
  if (!video || video.isCurrentlyWatching || video.totalActiveWatchSeconds < 10) return undefined;
  if (video.contentType === "livestream") {
    const minutes = round(video.totalActiveWatchSeconds / 60);
    if (video.engagementScore >= 60 || video.totalActiveWatchSeconds >= 900) return {
      label: "Canlı yayın ilgini tuttu",
      explanation: `${minutes} dakika aktif izleme ve ${video.engagementScore}/100 etkileşim, yayının sende karşılık bulduğunu gösteriyor.`,
      tone: "positive"
    };
    if (video.regretScore >= 60) return {
      label: "Canlı yayın beklentini karşılamamış olabilir",
      explanation: `${minutes} dakika aktif izlemeden sonra ${video.regretScore}/100 pişmanlık sinyali oluştu.`,
      tone: "warning"
    };
    return {
      label: "Canlı yayın sonucu henüz belirsiz",
      explanation: `${minutes} dakika aktif izleme var; canlı yayınlarda tamamlanma oranı kullanılmaz.`,
      tone: "neutral"
    };
  }
  if (video.engagementScore >= 70 && video.regretScore < 35) return {
    label: "Tahmin olumlu doğrulandı",
    explanation: `%${round(video.completionRate * 100)} tamamlama ve ${video.engagementScore}/100 sarılma, bu formatın sana uyduğunu gösteriyor.`,
    tone: "positive"
  };
  if (video.regretScore >= 60) return {
    label: "Beklenti karşılanmamış olabilir",
    explanation: `${video.regretScore}/100 pişmanlık sinyali oluştu. ${video.regretFactors?.[0] ?? "Video erken bırakıldı."}`,
    tone: "warning"
  };
  return {
    label: "Karışık sonuç",
    explanation: `${intelligence.intentLabel} tahmini oluştu; davranışın henüz güçlü bir olumlu veya olumsuz sonuç göstermiyor.`,
    tone: "neutral"
  };
}

export function autonomousInsights(videos: VideoRecord[]): AutonomousInsight[] {
  const eligible = videos.filter((video) => !video.excludedFromAnalytics && !video.isCurrentlyWatching);
  if (!eligible.length) return [];
  const profiles = eligible.map((video) => ({ video, profile: analyzeVideoIntelligence(video, eligible) }));
  const groups = new Map<string, VideoRecord[]>();
  for (const item of profiles) {
    const key = item.profile.intentLabel;
    groups.set(key, [...(groups.get(key) ?? []), item.video]);
  }
  const ranked = [...groups.entries()]
    .map(([label, items]) => ({
      label,
      items,
      engagement: items.reduce((sum, item) => sum + item.engagementScore, 0) / items.length,
      completion: items.reduce((sum, item) => sum + item.completionRate, 0) / items.length * 100
    }))
    .toSorted((a, b) => b.engagement - a.engagement);
  const result: AutonomousInsight[] = [];
  const best = ranked.find((item) => item.items.length >= 2) ?? ranked[0];
  if (best) result.push({
    key: "best-format",
    eyebrow: "Sistem örüntüsü",
    headline: `${best.label} formatı sende daha güçlü çalışıyor`,
    explanation: `${best.items.length} videoda ortalama ${round(best.engagement)}/100 sarılma ve %${round(best.completion)} tamamlama görüldü.`,
    confidence: evidenceLevel(best.items.length, 3, 8).confidence
  });
  const clickbaitLike = profiles.filter((item) => item.profile.titlePatterns.some((pattern) => pattern === "yüksek merak dili" || pattern === "kesinlik iddiası"));
  if (clickbaitLike.length) {
    const regret = clickbaitLike.reduce((sum, item) => sum + item.video.regretScore, 0) / clickbaitLike.length;
    result.push({
      key: "title-risk",
      eyebrow: "Başlık davranışı",
      headline: regret >= 50 ? "Keskin vaatli başlıklar sende risk oluşturuyor" : "Keskin vaatli başlıklar şimdilik belirgin risk değil",
      explanation: `${clickbaitLike.length} videoda ortalama pişmanlık ${round(regret)}/100.`,
      confidence: evidenceLevel(clickbaitLike.length, 3, 8).confidence
    });
  }
  const learning = profiles.filter((item) => item.profile.valueType === "learning");
  const learningSeconds = learning.reduce((sum, item) => sum + item.video.totalActiveWatchSeconds, 0);
  const totalSeconds = eligible.reduce((sum, item) => sum + item.totalActiveWatchSeconds, 0);
  result.push({
    key: "value-balance",
    eyebrow: "İzleme karakteri",
    headline: learningSeconds / Math.max(totalSeconds, 1) >= .5 ? "İzleme süren öğrenme ağırlıklı" : "İzleme süren eğlence ve karma içerik ağırlıklı",
    explanation: `Aktif izleme sürenin %${round(learningSeconds / Math.max(totalSeconds, 1) * 100)} kadarı öğrenme sinyali taşıyan videolarda.`,
    confidence: evidenceLevel(eligible.length, 5, 12).confidence
  });
  return result.slice(0, 3);
}
