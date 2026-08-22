import type {
  CloudAnalysisInput, CloudVideoAnalysis, GroqConfig, GroqStatus
} from "../shared/types";

const CONFIG_KEY = "groqConfig";
const SECRET_KEY = "groqSecret";
const META_KEY = "groqMeta";
const API_BASE = "https://api.groq.com/openai/v1";
export const DEFAULT_GROQ_MODEL: GroqConfig["model"] = "openai/gpt-oss-120b";

type GroqMeta = { lastTestedAt?: string; lastError?: string };

async function stored<T>(key: string) {
  return (await chrome.storage.local.get(key))[key] as T | undefined;
}

async function write(key: string, value: unknown) {
  await chrome.storage.local.set({ [key]: value });
}

function safeMessage(status: number, payload: unknown) {
  const error = payload && typeof payload === "object" && "error" in payload
    ? payload.error as { message?: string; failed_generation?: unknown }
    : undefined;
  const message = error?.message;
  if (status === 401) return "Groq API anahtarı geçersiz veya iptal edilmiş.";
  if (status === 403) return "Bu Groq projesinin seçili modele erişimi yok.";
  if (status === 429) return "Groq ücretsiz kullanım sınırına ulaşıldı. Bir süre sonra yerel analizle devam edilecek.";
  if (status === 400 && (error?.failed_generation || /failed to generate json|failed_generation/i.test(message ?? ""))) {
    return "Groq yapılandırılmış yanıtı tamamlayamadı. İstek kotayı tekrar harcamadan durduruldu; yeniden deneyebilirsin.";
  }
  return String(message ?? `Groq isteği başarısız (${status}).`).slice(0, 300);
}

async function groqFetch(path: string, apiKey: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(safeMessage(response.status, await response.json().catch(() => ({}))));
  return response;
}

async function testKey(apiKey: string, model: GroqConfig["model"]) {
  await groqFetch(groqModelPath(model), apiKey);
}

export function groqModelPath(model: GroqConfig["model"]) {
  return `models/${model.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
}

export async function configureGroq(apiKey: string, config: GroqConfig) {
  const normalizedKey = apiKey.trim();
  if (normalizedKey.length < 20) throw new Error("Geçerli bir Groq API anahtarı gir.");
  await testKey(normalizedKey, config.model);
  const now = new Date().toISOString();
  await Promise.all([
    write(SECRET_KEY, { apiKey: normalizedKey }),
    write(CONFIG_KEY, config),
    write(META_KEY, { lastTestedAt: now, lastError: undefined } satisfies GroqMeta)
  ]);
  return getGroqStatus();
}

export async function testGroqConnection() {
  const [secret, config] = await Promise.all([
    stored<{ apiKey?: string }>(SECRET_KEY),
    stored<GroqConfig>(CONFIG_KEY)
  ]);
  if (!secret?.apiKey || !config) throw new Error("Groq bağlantısı henüz yapılandırılmadı.");
  try {
    await testKey(secret.apiKey, config.model);
    await write(META_KEY, { lastTestedAt: new Date().toISOString(), lastError: undefined } satisfies GroqMeta);
  } catch (error) {
    await write(META_KEY, { ...(await stored<GroqMeta>(META_KEY)), lastError: error instanceof Error ? error.message : "Bağlantı testi başarısız." });
    throw error;
  }
  return getGroqStatus();
}

export async function resetGroq() {
  await chrome.storage.local.remove([CONFIG_KEY, SECRET_KEY, META_KEY]);
  return getGroqStatus();
}

export async function getGroqStatus(): Promise<GroqStatus> {
  const [config, secret, meta] = await Promise.all([
    stored<GroqConfig>(CONFIG_KEY),
    stored<{ apiKey?: string }>(SECRET_KEY),
    stored<GroqMeta>(META_KEY)
  ]);
  return {
    configured: Boolean(config && secret?.apiKey),
    model: config?.model ?? DEFAULT_GROQ_MODEL,
    lastTestedAt: meta?.lastTestedAt,
    lastError: meta?.lastError
  };
}

export function fingerprintCloudInput(input: CloudAnalysisInput) {
  const value = JSON.stringify({
    title: input.title,
    description: input.description?.slice(0, 2_000),
    topics: input.topics,
    durationSeconds: input.durationSeconds,
    contentType: input.contentType,
    transcript: input.transcriptAnalysis ? {
      keywords: input.transcriptAnalysis.keywords,
      summary: input.transcriptAnalysis.summary,
      promise: input.transcriptAnalysis.promiseVerdict,
      moments: input.transcriptAnalysis.keyMoments
    } : undefined
  });
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeGroqAnalysis(
  value: unknown,
  model: string,
  fingerprint: string,
  now = new Date()
): CloudVideoAnalysis {
  const payload = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const string = (key: string, fallback: string) => typeof payload[key] === "string"
    ? String(payload[key]).trim().slice(0, 1_200) || fallback
    : fallback;
  const list = (key: string) => Array.isArray(payload[key])
    ? (payload[key] as unknown[]).filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 300)).filter(Boolean).slice(0, 6)
    : [];
  const verdicts = new Set(["fulfilled", "partial", "weak", "unknown"]);
  const confidences = new Set(["low", "medium", "high"]);
  return {
    provider: "groq",
    model,
    summary: string("summary", "Groq bu video için güvenilir bir özet üretemedi."),
    keyPoints: list("keyPoints"),
    titleVerdict: verdicts.has(String(payload.titleVerdict)) ? String(payload.titleVerdict) as CloudVideoAnalysis["titleVerdict"] : "unknown",
    valueAssessment: string("valueAssessment", "Değer değerlendirmesi oluşmadı."),
    recommendation: string("recommendation", "Yerel DemirTube analizini dikkate al."),
    risks: list("risks"),
    confidence: confidences.has(String(payload.confidence)) ? String(payload.confidence) as CloudVideoAnalysis["confidence"] : "low",
    analyzedAt: now.toISOString(),
    inputFingerprint: fingerprint
  };
}

export function needsTurkishRewrite(value: CloudVideoAnalysis) {
  const text = [value.summary, value.valueAssessment, value.recommendation, ...value.keyPoints, ...value.risks].join(" ").toLocaleLowerCase("tr-TR");
  const englishHints = [" the ", " and ", " this ", " video ", " is ", " with ", " for ", " watch ", " content ", " summary "];
  return englishHints.filter((hint) => text.includes(hint)).length >= 2;
}

export const GROQ_VIDEO_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    titleVerdict: { type: "string", enum: ["fulfilled", "partial", "weak", "unknown"] },
    valueAssessment: { type: "string" },
    recommendation: { type: "string" },
    risks: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
  },
  required: ["summary", "keyPoints", "titleVerdict", "valueAssessment", "recommendation", "risks", "confidence"],
  additionalProperties: false,
} as const;

export function groqCompletionPayload(model: string, messages: Array<{ role: "system" | "user"; content: string }>) {
  return {
    model,
    store: false,
    temperature: 0,
    reasoning_effort: "low",
    max_completion_tokens: 1_200,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "demirtube_video_analysis",
        strict: true,
        schema: GROQ_VIDEO_ANALYSIS_SCHEMA,
      },
    },
    messages,
  };
}

async function completion(apiKey: string, model: string, messages: Array<{ role: "system" | "user"; content: string }>) {
  const response = await groqFetch("chat/completions", apiKey, { method: "POST", body: JSON.stringify({
    ...groqCompletionPayload(model, messages)
  }) });
  const body = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = body.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Groq boş yanıt döndürdü; yerel analiz kullanılacak.");
  try { return JSON.parse(content.replace(/^```json\s*/i, "").replace(/```$/, "").trim()); }
  catch { throw new Error("Groq yanıtı beklenen JSON biçiminde değildi; yerel analiz kullanılacak."); }
}

export async function analyzeVideoWithGroq(input: CloudAnalysisInput): Promise<CloudVideoAnalysis> {
  const [secret, config] = await Promise.all([
    stored<{ apiKey?: string }>(SECRET_KEY),
    stored<GroqConfig>(CONFIG_KEY)
  ]);
  if (!secret?.apiKey || !config) throw new Error("Groq bağlantısı yapılandırılmadı; yerel analiz kullanılacak.");
  const fingerprint = fingerprintCloudInput(input);
  const transcript = input.transcriptAnalysis;
  const userPayload = {
    title: input.title,
    channel: input.channelName,
    description: input.description?.slice(0, 2_000),
    topics: input.topics,
    durationMinutes: Math.round(input.durationSeconds / 60),
    contentType: input.contentType,
    transcriptDerived: transcript?.available ? {
      summary: transcript.summary.slice(0, 500),
      keywords: transcript.keywords.slice(0, 12),
      informationDensity: transcript.informationDensity,
      repetitionRate: transcript.repetitionRate,
      localTitleCoverage: transcript.titlePromiseCoverage,
      keyMoments: transcript.keyMoments.slice(0, 3)
    } : undefined
  };
  const parsed = await completion(secret.apiKey, config.model, [
        {
          role: "system",
          content: "Sen DemirTube video analiz motorusun. Yalnızca verilen veriye dayan. contentType livestream ise sabit süre, bitirme veya tamamlama varsayma; anlık değer, yayın amacı, izleyicinin istediği anda katılıp ayrılabilmesi ve metadata belirsizliği üzerinden değerlendir. ZORUNLU DİL KURALI: summary, keyPoints, valueAssessment, recommendation ve risks alanlarının tamamı Türkçe olmalı; başlık, altyazı veya kaynak İngilizce olsa bile açıklamayı Türkçe yaz. Sadece özel adlar ve model isimleri İngilizce kalabilir. Kısa, somut ve ihtiyatlı ol. JSON dışında metin yazma. Şema: {summary:string,keyPoints:string[],titleVerdict:'fulfilled'|'partial'|'weak'|'unknown',valueAssessment:string,recommendation:string,risks:string[],confidence:'low'|'medium'|'high'}"
        },
        { role: "user", content: JSON.stringify(userPayload) }
  ]);
  let analysis = normalizeGroqAnalysis(parsed, config.model, fingerprint);
  if (needsTurkishRewrite(analysis)) {
    const translated = await completion(secret.apiKey, config.model, [
      { role: "system", content: "Aşağıdaki JSON analizini eksiksiz Türkçeye çevir. Anahtarları, titleVerdict ve confidence değerlerini aynen koru. Açıklama metinlerinde İngilizce bırakma. Sadece JSON döndür." },
      { role: "user", content: JSON.stringify(analysis) }
    ]);
    analysis = normalizeGroqAnalysis(translated, config.model, fingerprint);
  }
  return analysis;
}
