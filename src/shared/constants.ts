import type { DefaultTopic, KeywordRules, Settings } from "./types";

export const APP_VERSION = "0.11.1";
export const EXPORT_SCHEMA_VERSION = 2;
export const DEFAULT_SETTINGS: Settings = {
  trackingEnabled: true,
  theme: "dark",
  earlyExitPromptEnabled: true,
  weeklyNotificationEnabled: false,
  panelCollapsed: false,
  onboardingCompleted: false,
  backupReminderEnabled: false,
  backupReminderDays: 7,
  analysisMode: "local_advanced",
  feedBadgesEnabled: true,
  transcriptAnalysisEnabled: true,
  watchIntent: "open",
  dailyWatchBudgetMinutes: 90,
  feedFilterMode: "soften_low",
  goals: {
    weeklyLearningVideos: 3,
    maxShortsPercent: 25,
    weeklyCompletedVideos: 3,
    lateNightStartHour: 1,
    maxLateNightMinutes: 60
  }
};
export const DEFAULT_KEYWORD_RULES: KeywordRules = {
  id: "default",
  ignored: [],
  clickbait: [],
  positive: [],
  updatedAt: new Date(0).toISOString()
};
export const DB_NAME = "demirtube-ai";
export const DB_VERSION = 3;
export const PERSIST_INTERVAL_MS = 5_000;
export const SEGMENT_GAP_SECONDS = 1.5;
export const EARLY_EXIT_SECONDS = 120;
export const COMPLETED_THRESHOLD = 0.9;
export const MAX_DIAGNOSTIC_LOGS = 100;

export const TOPIC_RULES: Record<Exclude<DefaultTopic, "Diğer">, string[]> = {
  "Yapay zekâ": ["yapay zeka", "yapay zekâ", "ai", "gpt", "chatgpt", "gemini", "claude", "llm", "openai",
    "makine öğrenmesi", "derin öğrenme", "yapay sinir ağı", "midjourney", "copilot", "prompt"],
  "Teknoloji": ["teknoloji", "tech", "telefon", "iphone", "android", "bilgisayar", "donanım", "inceleme"],
  "Programlama": ["kod", "coding", "programlama", "javascript", "typescript", "react", "python", "developer", "yazılım",
    "rust", "java", "c++", "sql", "algoritma", "backend", "frontend", "veritabanı", "docker", "derleyici"],
  "Siber güvenlik": ["siber", "cyber", "hacker", "güvenlik", "malware", "phishing", "exploit",
    "linux", "kali", "sızma testi", "pentest", "zafiyet", "şifreleme", "kimlik avı", "veri ihlali", "vpn"],
  "Futbol": ["futbol", "football", "maç", "gol", "transfer", "şampiyonlar ligi", "süper lig",
    "derbi", "fenerbahçe", "galatasaray", "trabzonspor", "puan durumu"],
  "Beşiktaş": ["beşiktaş", "bjk", "kara kartal"],
  "Basketbol": ["basketbol", "basketball", "nba", "euroleague"],
  "Formula 1": ["formula 1", "formula one", "f1", "grand prix", "verstappen", "ferrari", "mclaren"],
  "Otomobil": ["otomobil", "araba", "car", "motor", "tesla", "sürüş"],
  "Oyun": ["oyun", "gaming", "gameplay", "steam", "playstation", "xbox", "nintendo"],
  "Dizi ve film": ["dizi", "film", "movie", "series", "sinema", "netflix", "fragman", "trailer"],
  "Eğitim": ["eğitim", "ders", "öğren", "tutorial", "course", "nasıl yapılır", "rehber", "adım adım", "anlatım"],
  "Eğlence": ["eğlence", "komik", "challenge", "meydan okuma", "şaka", "prank", "tepki", "reaction", "vlog", "sohbet", "podcast"],
  "Bilim": ["bilim", "uzay", "astronomi", "evren", "fizik", "kimya", "biyoloji", "nasa", "mars"],
  "Tarih": ["tarih", "osmanlı", "savaş", "medeniyet", "belgesel", "antik", "tarihi"],
  "Finans": ["borsa", "kripto", "bitcoin", "ekonomi", "yatırım", "dolar", "finans", "altın"],
  "Sağlık": ["sağlık", "spor", "fitness", "beslenme", "diyet", "psikoloji", "uyku", "egzersiz"],
  "Seyahat": ["seyahat", "gezi", "vlog", "tatil", "kamp", "rota", "şehir rehberi"],
  "Müzik": ["müzik", "music", "şarkı", "konser", "albüm", "cover", "klip"],
  "Hazırlık": ["ybs", "yazılım mühendisliği", "bilgisayar mühendisliği", "yönetim bilişim", "bölüm tanıtım", "üniversite", "kampüs", "vize", "final", "ders çalışma", "hazırlık"]
};

export const CLICKBAIT_TERMS = ["şok", "bitti", "inanılmaz", "her şey değişti", "sonunda geldi", "bunu kimse bilmiyor", "you won't believe"];
