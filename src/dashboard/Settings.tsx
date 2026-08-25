// DemirTube Aurora UI v2 · unified dashboard visual system
import { useEffect, useRef, useState } from "react";
import { BellRing, BrainCircuit, Captions, CheckCircle2, Cloud, Database, Download, ExternalLink, FileSpreadsheet, History, KeyRound, LayoutGrid, LogIn, LogOut, NotebookPen, PauseCircle, PlayCircle, RefreshCw, Stethoscope, Trash2, Upload, UserPlus } from "lucide-react";
import { sendMessage } from "../shared/messages";
import type { AppData, CloudConfig, CloudProviderId, CloudStatus, CustomTopicRule, DiagnosticsReport, GroqConfig, GroqStatus, LegacyAppData, Settings as SettingsType } from "../shared/types";
import { cloudHostPermissions, DEFAULT_CLOUD_PROVIDER } from "../cloud/cloud-service";
import { downloadVideosCsv } from "./file-download";
import { dailyNoteLine, dailyNoteMarkdown } from "../analytics/daily-note";
import { PageHeading } from "./ui";

type CloudResult = CloudStatus & { message?: string };

const cloudProviderLabels: Record<CloudProviderId, string> = { firebase: "Firebase", supabase: "Supabase" };

/** Sağlayıcı değişince eski sağlayıcının alanları formda kalmamalı. */
function emptyCloudConfig(provider: CloudProviderId, autoSync = true): CloudConfig {
  return provider === "firebase"
    ? { provider, apiKey: "", databaseUrl: "", autoSync }
    : { provider, supabaseUrl: "", anonKey: "", autoSync };
}
type GroqResult = GroqStatus & { message?: string };

export function Settings({
  data,
  settings,
  onSettings,
  onClear,
  onExport,
  onImport
}: {
  data: AppData;
  settings: SettingsType;
  onSettings: (settings: SettingsType) => Promise<void>;
  onClear: () => Promise<void>;
  onExport: () => Promise<AppData>;
  onImport: (data: AppData | LegacyAppData, mode: "merge" | "replace") => Promise<void>;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [cloudStatus, setCloudStatus] = useState<CloudStatus>({ configured: false, provider: DEFAULT_CLOUD_PROVIDER, signedIn: false, autoSync: true });
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>(emptyCloudConfig(DEFAULT_CLOUD_PROVIDER));
  const [groqStatus, setGroqStatus] = useState<GroqStatus>({ configured: false, model: "openai/gpt-oss-120b" });
  const [groqConfig, setGroqConfig] = useState<{ apiKey: string; model: GroqConfig["model"] }>({ apiKey: "", model: "openai/gpt-oss-120b" });
  const [credentials, setCredentials] = useState({ email: "", password: "" });
  const [importCandidate, setImportCandidate] = useState<AppData | LegacyAppData>();
  const [historyDays, setHistoryDays] = useState(30);
  const [historyStatus, setHistoryStatus] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [diagnostics, setDiagnostics] = useState<DiagnosticsReport>();
  const [topicDraft, setTopicDraft] = useState({ name: "", keywords: "", channels: "" });
  const [ntfyDraft, setNtfyDraft] = useState(settings.ntfyTopic ?? "");
  const [customTopics, setCustomTopics] = useState(data.customTopics);
  const [keywordDraft, setKeywordDraft] = useState({
    ignored: data.keywordRules.ignored.join(", "),
    clickbait: data.keywordRules.clickbait.join(", "),
    positive: data.keywordRules.positive.join(", ")
  });
  const extensionAvailable = Boolean(globalThis.chrome?.runtime?.id);

  useEffect(() => {
    if (!extensionAvailable) return;
    void Promise.all([
      sendMessage<CloudStatus>({ type: "CLOUD_GET_STATUS" }).then(setCloudStatus),
      sendMessage<GroqStatus>({ type: "AI_GET_STATUS" }).then((next) => {
        setGroqStatus(next);
        setGroqConfig((current) => ({ ...current, model: next.model }));
      })
    ]).catch(() => undefined);
  }, [extensionAvailable]);

  const runCloudAction = async (action: () => Promise<CloudResult>, success: string) => {
    setBusy(true);
    setStatus("");
    try {
      const result = await action();
      setCloudStatus(result);
      setStatus(result.message ?? success);
      setCredentials((current) => ({ ...current, password: "" }));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Bulut işlemi başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const saveCloudConfig = () => runCloudAction(async () => {
    const granted = await chrome.permissions.request({ origins: cloudHostPermissions(cloudConfig.provider) });
    if (!granted) throw new Error(`Bulut bağlantısı için ${cloudProviderLabels[cloudConfig.provider]} alan adı izni gerekli.`);
    return sendMessage<CloudResult>({ type: "CLOUD_CONFIGURE", config: cloudConfig });
  }, "Bulut proje bilgileri kaydedildi.");

  const runGroqAction = async (action: () => Promise<GroqResult>, success: string) => {
    setBusy(true);
    setStatus("");
    try {
      const result = await action();
      setGroqStatus(result);
      setGroqConfig((current) => ({ ...current, apiKey: "", model: result.model }));
      setStatus(result.message ?? success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Groq işlemi başarısız.");
    } finally {
      setBusy(false);
    }
  };

  const connectGroq = () => runGroqAction(async () => {
    const granted = await chrome.permissions.request({ origins: ["https://api.groq.com/*"] });
    if (!granted) throw new Error("Groq analizi için api.groq.com izni gerekli.");
    const result = await sendMessage<GroqResult>({ type: "AI_CONFIGURE", apiKey: groqConfig.apiKey, config: { model: groqConfig.model } });
    await onSettings({ ...settings, analysisMode: "groq_cloud" });
    return result;
  }, "Groq bağlandı. Derin analiz, video panelindeki düğmeye basıldığında çalışır.");

  const disconnectGroq = () => runGroqAction(async () => {
    const result = await sendMessage<GroqResult>({ type: "AI_RESET" });
    await onSettings({ ...settings, analysisMode: "local_advanced" });
    await chrome.permissions.remove({ origins: ["https://api.groq.com/*"] }).catch(() => false);
    return result;
  }, "Groq bağlantısı kaldırıldı; yerel gelişmiş analiz açık.");

  const changeAnalysisMode = async (analysisMode: SettingsType["analysisMode"]) => {
    if (analysisMode === "groq_cloud" && !groqStatus.configured) {
      setStatus("Önce aşağıdaki Groq kartından ücretsiz API anahtarını bağla.");
      return;
    }
    await onSettings({ ...settings, analysisMode });
  };

  /**
   * Tarama kullanıcının kendi sekmesinde, kendi isteğiyle başlar: burada
   * yalnızca istek bırakılır ve geçmiş sayfası açılır. Eklenti arka planda
   * kendi kendine geçmişe gitmez.
   */
  const requestHistoryImport = async () => {
    try {
      await sendMessage({ type: "REQUEST_HISTORY_IMPORT", days: historyDays });
      setHistoryStatus(`Geçmiş sayfası açılıyor. Sayfa açık kalsın; son ${historyDays} gün okunduğunda sağ üstte özet çıkacak.`);
      window.open("https://www.youtube.com/feed/history", "_blank", "noopener");
    } catch {
      setHistoryStatus("İstek kaydedilemedi. Eklentiyi yenileyip tekrar dene.");
    }
  };

  const exportFile = async () => {
    const data = await onExport();
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `demirtube-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    await onSettings({ ...settings, lastLocalExportAt: new Date().toISOString() });
    setStatus("Yedek indirildi.");
  };

  const exportCsv = () => {
    downloadVideosCsv(data.videos, "demirtube-videolar");
    setStatus("CSV indirildi; Excel veya Google Sheets'te açabilirsin.");
  };

  const toggleAutoBackup = async () => {
    const next = !settings.autoBackupEnabled;
    if (next && extensionAvailable) {
      const granted = await chrome.permissions.request({ permissions: ["downloads"] });
      if (!granted) { setStatus("Otomatik yedek için Chrome indirme izni gerekli."); return; }
    }
    await onSettings({ ...settings, autoBackupEnabled: next });
    setStatus(next ? "Otomatik yedek açık; İndirilenler/DemirTube klasörüne periyodik kaydedilir." : "Otomatik yedek kapatıldı.");
  };

  const saveNtfyTopic = async () => {
    const topic = ntfyDraft.trim();
    if (topic && !/^[a-zA-Z0-9_-]{1,64}$/.test(topic)) {
      setStatus("ntfy konu adı yalnızca harf, sayı, tire ve alt çizgi içerebilir.");
      return;
    }
    if (topic && extensionAvailable) {
      const granted = await chrome.permissions.request({ origins: ["https://ntfy.sh/*"] });
      if (!granted) { setStatus("ntfy bildirimi için ntfy.sh alan adı izni gerekli."); return; }
    }
    await onSettings({ ...settings, ntfyTopic: topic || undefined });
    setStatus(topic ? "ntfy konuğu kaydedildi; haftalık rapor telefona da düşer." : "ntfy bildirimi kapatıldı.");
  };

  const testNtfy = async () => {
    setBusy(true);
    try {
      await sendMessage({ type: "NTFY_TEST" });
      setStatus("Test bildirimi gönderildi; telefonunu kontrol et.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Test bildirimi gönderilemedi.");
    } finally { setBusy(false); }
  };

  const copyDailyNote = async () => {
    await navigator.clipboard.writeText(dailyNoteLine(data.videos, data.sessions));
    setStatus("Günlük özet satırı panoya kopyalandı; Obsidian günlük notuna yapıştırabilirsin.");
  };

  const downloadDailyNote = () => {
    const url = URL.createObjectURL(new Blob([dailyNoteMarkdown(data.videos, data.sessions)], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `demirtube-gunluk-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("Günlük not indirildi; Obsidian vault'undaki günlük notuna ekleyebilirsin.");
  };

  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const candidate = JSON.parse(await file.text()) as AppData | LegacyAppData;
      if (![1, 2].includes(candidate.version) || !Array.isArray(candidate.videos) || !Array.isArray(candidate.sessions)) throw new Error();
      setImportCandidate(candidate);
      setStatus("Yedek doğrulandı. Aşağıdan birleştirme biçimini seç.");
    } catch {
      setStatus("Dosya geçerli bir DemirTube yedeği değil.");
    }
  };

  const applyImport = async () => {
    if (!importCandidate) return;
    await onImport(importCandidate, importMode);
    setImportCandidate(undefined);
    setStatus("Yedek içe aktarıldı ve özetler yeniden hesaplandı.");
  };

  const runDiagnostic = async (type: "REBUILD_SUMMARIES" | "FINALIZE_STALE" | "REMOVE_ORPHANS", success: string) => {
    setBusy(true);
    try {
      await sendMessage({ type });
      setDiagnostics(await sendMessage<DiagnosticsReport>({ type: "GET_DIAGNOSTICS" }));
      setStatus(success);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Onarım tamamlanamadı.");
    } finally { setBusy(false); }
  };

  const addTopic = async () => {
    if (!topicDraft.name.trim() || !topicDraft.keywords.trim()) return;
    const now = new Date().toISOString();
    const rule: CustomTopicRule = {
      id: crypto.randomUUID(), name: topicDraft.name.trim(), icon: "🏷️",
      keywords: topicDraft.keywords.split(",").map((item) => item.trim()).filter(Boolean),
      channels: topicDraft.channels.split(",").map((item) => item.trim()).filter(Boolean),
      priority: customTopics.length + 1, enabled: true, createdAt: now, updatedAt: now
    };
    await sendMessage({ type: "PUT_CUSTOM_TOPIC", rule });
    setCustomTopics((current) => [...current, rule]);
    setTopicDraft({ name: "", keywords: "", channels: "" });
    setStatus("Özel konu kuralı kaydedildi. Yeni videolarda kullanılacak.");
  };

  const updateTopic = async (rule: CustomTopicRule, patch: Partial<CustomTopicRule>) => {
    const next = { ...rule, ...patch, updatedAt: new Date().toISOString() };
    await sendMessage({ type: "PUT_CUSTOM_TOPIC", rule: next });
    setCustomTopics((current) => current.map((item) => item.id === next.id ? next : item));
  };

  const deleteTopic = async (id: string) => {
    await sendMessage({ type: "DELETE_CUSTOM_TOPIC", id });
    setCustomTopics((current) => current.filter((item) => item.id !== id));
  };

  const saveKeywordRules = async () => {
    const split = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
    await sendMessage({ type: "PUT_KEYWORD_RULES", rules: {
      id: "default",
      ignored: split(keywordDraft.ignored),
      clickbait: split(keywordDraft.clickbait),
      positive: split(keywordDraft.positive),
      updatedAt: new Date().toISOString()
    } });
    setStatus("Başlık kelimesi kuralları kaydedildi.");
  };

  const toggleWeeklyNotification = async () => {
    const next = !settings.weeklyNotificationEnabled;
    if (next && extensionAvailable) {
      const granted = await chrome.permissions.request({ permissions: ["notifications"] });
      if (!granted) { setStatus("Haftalık bildirim için Chrome bildirim izni gerekli."); return; }
    }
    await onSettings({ ...settings, weeklyNotificationEnabled: next });
  };

  const toggleBackupReminder = async () => {
    const next = !settings.backupReminderEnabled;
    if (next && extensionAvailable) {
      const granted = await chrome.permissions.request({ permissions: ["notifications"] });
      if (!granted) { setStatus("Yerel yedek hatırlatması için Chrome bildirim izni gerekli."); return; }
    }
    await onSettings({ ...settings, backupReminderEnabled: next });
  };

  const exportDiagnostics = () => {
    if (!diagnostics) return;
    const safe = JSON.stringify(diagnostics, null, 2);
    const url = URL.createObjectURL(new Blob([safe], { type: "application/json" }));
    const link = document.createElement("a"); link.href = url; link.download = `demirtube-tanilama-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
  };

  const clear = async () => {
    if (!confirm("Tüm video ve oturum verileri kalıcı olarak silinsin mi?")) return;
    await onClear();
    setStatus("Bu cihazdaki izleme verileri silindi.");
  };

  return <>
    <PageHeading eyebrow="SİSTEM KONTROLÜ" title="Ayarlar" copy="Takip, görünüm, yerel veriler ve isteğe bağlı bulut yedeği senin kontrolünde."/>
    <div className="settings-stack">
      <section className="setting-row">
        <span className="setting-icon">{settings.trackingEnabled ? <PlayCircle/> : <PauseCircle/>}</span>
        <div><h2>İzleme takibi</h2><p>Kapalıyken yeni YouTube oturumları kaydedilmez.</p></div>
        <button aria-label="İzleme takibini değiştir" className={`toggle ${settings.trackingEnabled ? "active" : ""}`} onClick={() => onSettings({ ...settings, trackingEnabled: !settings.trackingEnabled })} aria-pressed={settings.trackingEnabled}><i/></button>
      </section>
      <section className="setting-row">
        <span className="setting-icon"><RefreshCw/></span>
        <div><h2>Erken çıkış sorusu</h2><p>İlk iki dakika içinde ayrıldığında, kapatılabilir kısa bir neden sorusu gösterir.</p></div>
        <button aria-label="Erken çıkış sorusunu değiştir" className={`toggle ${settings.earlyExitPromptEnabled ? "active" : ""}`} onClick={() => onSettings({ ...settings, earlyExitPromptEnabled: !settings.earlyExitPromptEnabled })} aria-pressed={settings.earlyExitPromptEnabled}><i/></button>
      </section>
      <section className="setting-row">
        <span className="setting-icon"><BrainCircuit/></span>
        <div><h2>Analiz zekâsı</h2><p>Yerel gelişmiş mod gizli ve hızlıdır. Groq bağlandığında derin analiz yalnızca video panelindeki düğmeye basılırsa çalışır.</p></div>
        <select aria-label="Analiz zekâsı modu" value={settings.analysisMode} onChange={(event) => void changeAnalysisMode(event.target.value as SettingsType["analysisMode"])}><option value="local_standard">Yerel standart</option><option value="local_advanced">Yerel gelişmiş</option><option value="groq_cloud">Groq derin analiz</option></select>
      </section>
      <section className="setting-row">
        <span className="setting-icon"><Captions/></span>
        <div><h2>Altyazı zekâsı</h2><p>Erişilebilir YouTube altyazısından konu, bilgi yoğunluğu, tekrar ve başlık vaadi çıkarır. Ham altyazıyı saklamaz.</p></div>
        <button aria-label="Altyazı analizini değiştir" className={`toggle ${settings.transcriptAnalysisEnabled ? "active" : ""}`} onClick={() => void onSettings({ ...settings, transcriptAnalysisEnabled: !settings.transcriptAnalysisEnabled })} aria-pressed={settings.transcriptAnalysisEnabled}><i/></button>
      </section>
      <section className="setting-row">
        <span className="setting-icon"><LayoutGrid/></span>
        <div><h2>YouTube akıllı rozetleri</h2><p>Ana sayfa, arama ve öneri kartlarında videoyu açmadan önce kişisel uyum veya başlık riski gösterir.</p></div>
        <button aria-label="YouTube akıllı rozetlerini değiştir" className={`toggle ${settings.feedBadgesEnabled ? "active" : ""}`} onClick={() => void onSettings({ ...settings, feedBadgesEnabled: !settings.feedBadgesEnabled })} aria-pressed={settings.feedBadgesEnabled}><i/></button>
      </section>
      <section className="surface rule-settings">
        <h2>Akıllı izleme pusulası</h2><p>Keşfet rozetleri ve video içi öneriler bu seçime göre karar verir. Hiçbir video otomatik açılmaz veya gizlenmez; yalnızca görünümü yumuşatır.</p>
        <div className="keyword-rule-form"><label>Şu anki amacın<select value={settings.watchIntent} onChange={(event) => void onSettings({ ...settings, watchIntent: event.target.value as SettingsType["watchIntent"] })}><option value="open">Serbest keşfet</option><option value="learn">Bir şey öğrenmek</option><option value="research">Araştırma yapmak</option><option value="focus">Odaklı kısa izleme</option><option value="relax">Rahatlamak</option></select></label><label>Günlük süre bütçesi<select value={settings.dailyWatchBudgetMinutes} onChange={(event) => void onSettings({ ...settings, dailyWatchBudgetMinutes: Number(event.target.value) })}><option value="30">30 dakika</option><option value="60">60 dakika</option><option value="90">90 dakika</option><option value="120">120 dakika</option><option value="180">180 dakika</option></select></label><label>Keşfet filtresi<select value={settings.feedFilterMode} onChange={(event) => void onSettings({ ...settings, feedFilterMode: event.target.value as SettingsType["feedFilterMode"] })}><option value="show_all">Tümünü normal göster</option><option value="soften_low">Düşük uyumu yumuşat</option><option value="hide_risky">Riskli kartları soluklaştır</option></select></label></div>
      </section>
      <section className="setting-row">
        <span className="setting-icon"><History/></span>
        <div>
          <h2>YouTube geçmişini oku</h2>
          <p>
            Model ilk günlerde tahmin üretemez çünkü henüz geçmişin yok. DemirTube, senin
            <strong> kendi</strong> YouTube geçmiş sayfanı bu cihazda okuyup son {historyDays} günü modele kanıt
            olarak ekleyebilir. Küçük resimdeki ilerleme çubuğundan yaklaşık tamamlanma oranı çıkarılır;
            hiçbir veri dışarı gitmez, izlediğin video sayfasına dokunulmaz. Zaten kayıtlı videoların üzerine yazmaz.
          </p>
          {historyStatus ? <p className="setting-note">{historyStatus}</p> : null}
        </div>
        <div className="setting-inline-actions">
          <select aria-label="Kaç günlük geçmiş" value={historyDays} onChange={(event) => setHistoryDays(Number(event.target.value))}>
            <option value="7">Son 7 gün</option>
            <option value="30">Son 30 gün</option>
            <option value="90">Son 90 gün</option>
          </select>
          <button className="button" type="button" onClick={() => void requestHistoryImport()}>Geçmiş sayfasını aç</button>
        </div>
      </section>
      <section className="setting-row">
        <span className="setting-icon"><Download/></span>
        <div><h2>Haftalık bildirim</h2><p>Haftalık rapor hazır olduğunda kısa bir yerel bildirim gösterir.</p></div>
        <button aria-label="Haftalık bildirimi değiştir" className={`toggle ${settings.weeklyNotificationEnabled ? "active" : ""}`} onClick={() => void toggleWeeklyNotification()} aria-pressed={settings.weeklyNotificationEnabled}><i/></button>
      </section>
      <section className="setting-row backup-reminder-row">
        <span className="setting-icon"><BellRing/></span>
        <div><h2>Yerel yedek hatırlatması</h2><p>Dosyayı otomatik yazmaz; seçtiğin sürede bir JSON yedeği indirmeni hatırlatır. Son yedek: {settings.lastLocalExportAt ? new Date(settings.lastLocalExportAt).toLocaleDateString("tr-TR") : "henüz yok"}</p></div>
        <div className="setting-inline-actions"><select aria-label="Yedek hatırlatma aralığı" value={settings.backupReminderDays} onChange={(event) => void onSettings({ ...settings, backupReminderDays: Number(event.target.value) })}><option value="3">3 günde bir</option><option value="7">7 günde bir</option><option value="14">14 günde bir</option><option value="30">30 günde bir</option></select><button aria-label="Yerel yedek hatırlatmasını değiştir" className={`toggle ${settings.backupReminderEnabled ? "active" : ""}`} onClick={() => void toggleBackupReminder()} aria-pressed={settings.backupReminderEnabled}><i/></button></div>
      </section>

      <section className="surface rule-settings">
        <h2>Özel konu</h2><p>Kendi konu adını, eşleşecek başlık kelimelerini ve isteğe bağlı kanal adlarını tanımla.</p>
        <div className="rule-form"><input placeholder="Konu adı" value={topicDraft.name} onChange={(event) => setTopicDraft({ ...topicDraft, name: event.target.value })}/><input placeholder="kelime, diğer kelime" value={topicDraft.keywords} onChange={(event) => setTopicDraft({ ...topicDraft, keywords: event.target.value })}/><input placeholder="kanal adı (isteğe bağlı)" value={topicDraft.channels} onChange={(event) => setTopicDraft({ ...topicDraft, channels: event.target.value })}/><button className="button" disabled={!extensionAvailable} onClick={() => void addTopic()}>Kural ekle</button></div>
        {customTopics.length ? <ul className="rule-list">{customTopics.toSorted((a,b)=>b.priority-a.priority).map((rule) => {
          const matched = data.videos.filter((video) => rule.keywords.some((keyword) => video.title.toLocaleLowerCase("tr").includes(keyword.toLocaleLowerCase("tr"))) || rule.channels.some((channel) => video.channelName.toLocaleLowerCase("tr").includes(channel.toLocaleLowerCase("tr")))).length;
          return <li key={rule.id}><input aria-label="Konu simgesi" className="topic-icon-input" defaultValue={rule.icon} onBlur={(event) => void updateTopic(rule,{icon:event.target.value})}/><input aria-label="Konu adı" defaultValue={rule.name} onBlur={(event) => void updateTopic(rule,{name:event.target.value.trim() || rule.name})}/><span>{rule.keywords.join(", ")} · {matched} eşleşme</span><input aria-label="Öncelik" type="number" min="0" value={rule.priority} onChange={(event) => void updateTopic(rule,{priority:Number(event.target.value)})}/><button className={`toggle mini ${rule.enabled?"active":""}`} aria-label="Kuralı etkinleştir" aria-pressed={rule.enabled} onClick={() => void updateTopic(rule,{enabled:!rule.enabled})}><i/></button><button className="icon-button danger" aria-label="Kuralı sil" onClick={() => void deleteTopic(rule.id)}><Trash2 size={14}/></button></li>;
        })}</ul> : null}
      </section>
      <section className="surface rule-settings">
        <h2>Başlık kelimesi kuralları</h2><p>İstatistikte yok sayılacak, teyitli clickbait ve olumlu ifadeleri virgülle ayır.</p>
        <div className="keyword-rule-form"><label>Yok say<input value={keywordDraft.ignored} onChange={(event) => setKeywordDraft({ ...keywordDraft, ignored: event.target.value })} placeholder="video, yeni"/></label><label>Clickbait<input value={keywordDraft.clickbait} onChange={(event) => setKeywordDraft({ ...keywordDraft, clickbait: event.target.value })} placeholder="şok, inanılmaz"/></label><label>Olumlu<input value={keywordDraft.positive} onChange={(event) => setKeywordDraft({ ...keywordDraft, positive: event.target.value })} placeholder="rehber, detaylı"/></label><button className="button" disabled={!extensionAvailable} onClick={() => void saveKeywordRules()}>Kuralları kaydet</button></div>
      </section>
      <section className="setting-row">
        <span className="setting-icon"><Database/></span>
        <div><h2>Görünüm</h2><p>Dashboard ve popup renk teması.</p></div>
        <select value={settings.theme} onChange={(event) => onSettings({ ...settings, theme: event.target.value as SettingsType["theme"] })}><option value="dark">Koyu</option><option value="light">Açık</option><option value="system">Sistem</option></select>
      </section>

      <section className="surface cloud-settings groq-settings">
        <div className="cloud-heading">
          <span className="setting-icon"><KeyRound/></span>
          <div><h2>Groq ücretsiz AI (Gemini değil)</h2><p>Video başlığı, açıklaması, konuları ve yalnızca altyazıdan çıkarılan özet sinyalleriyle daha derin bir Türkçe analiz üretir.</p></div>
          <span className={`cloud-badge ${groqStatus.configured ? "connected" : ""}`}>{groqStatus.configured ? <><CheckCircle2 size={14}/> Bağlı</> : "Kurulum gerekli"}</span>
        </div>
        {!groqStatus.configured ? <div className="cloud-setup">
          <ol>
            <li><a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Groq API Keys <ExternalLink size={12}/></a> sayfasından ücretsiz anahtar oluştur.</li>
            <li>Anahtarı aşağıya yapıştır ve modeli seç.</li>
            <li>Bağlantı test edilince Groq modu otomatik açılır.</li>
          </ol>
          <div className="cloud-form">
            <label>Groq API anahtarı<input type="password" autoComplete="off" value={groqConfig.apiKey} onChange={(event) => setGroqConfig({ ...groqConfig, apiKey: event.target.value })} placeholder="gsk_…"/></label>
            <label>Model<select value={groqConfig.model} onChange={(event) => setGroqConfig({ ...groqConfig, model: event.target.value as GroqConfig["model"] })}><option value="openai/gpt-oss-120b">GPT-OSS 120B · en güçlü</option><option value="openai/gpt-oss-20b">GPT-OSS 20B · daha hızlı</option></select></label>
            <p className="groq-privacy">Anahtar yalnızca bu cihazda saklanır; JSON yedeğine ve Supabase'e girmez. Ham altyazı ile izleme geçmişi gönderilmez.</p>
            <button disabled={busy || !extensionAvailable || !groqConfig.apiKey.trim()} className="button primary" onClick={() => void connectGroq()}>Groq'u bağla</button>
          </div>
        </div> : <div className="cloud-connected">
          <div><small>Seçili model</small><strong>{groqStatus.model}</strong></div>
          <div><small>Son bağlantı testi</small><strong>{groqStatus.lastTestedAt ? new Date(groqStatus.lastTestedAt).toLocaleString("tr-TR") : "Henüz yok"}</strong></div>
          <div className="cloud-actions"><button disabled={busy} className="button primary" onClick={() => void runGroqAction(() => sendMessage<GroqResult>({ type: "AI_TEST" }), "Groq bağlantısı çalışıyor.")}><RefreshCw size={16}/>Bağlantıyı test et</button><button disabled={busy} className="button" onClick={() => void disconnectGroq()}>Bağlantıyı kaldır</button></div>
          {groqStatus.lastError ? <p className="cloud-error">{groqStatus.lastError}</p> : null}
          <p className="groq-privacy">Groq yanıt vermez veya ücretsiz sınır dolarsa DemirTube hata vermeden yerel gelişmiş analize devam eder.</p>
          <p className="groq-privacy">Anahtar bu cihazda <strong>şifrelenmeden</strong> saklanır: Chrome profiline erişebilen biri onu okuyabilir. Anahtarın başkasının eline geçtiğini düşünüyorsan <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">Groq API Keys <ExternalLink size={12}/></a> sayfasından iptal et; “Bağlantıyı kaldır” yalnızca bu cihazdaki kopyayı siler.</p>
        </div>}
      </section>

      <section className="surface cloud-settings">
        <div className="cloud-heading">
          <span className="setting-icon"><Cloud/></span>
          <div><h2>Bulut yedekleme</h2><p>{cloudProviderLabels[cloudStatus.provider]} hesabınla cihazlar arasında birleştirilir. Yerel kayıt her zaman ana kopya olarak kalır.</p></div>
          <span className={`cloud-badge ${cloudStatus.signedIn ? "connected" : ""}`}>{cloudStatus.signedIn ? <><CheckCircle2 size={14}/> Bağlı</> : "Kurulum gerekli"}</span>
        </div>
        {!cloudStatus.configured ? <div className="cloud-setup">
          <div className="cloud-provider-picker" role="group" aria-label="Bulut sağlayıcısı">
            {(Object.keys(cloudProviderLabels) as CloudProviderId[]).map((provider) => (
              <button
                key={provider}
                type="button"
                aria-pressed={cloudConfig.provider === provider}
                className={cloudConfig.provider === provider ? "active" : ""}
                onClick={() => setCloudConfig(emptyCloudConfig(provider, cloudConfig.autoSync))}
              >
                {cloudProviderLabels[provider]}
              </button>
            ))}
          </div>
          {cloudConfig.provider === "firebase" ? <>
            <ol>
              <li>console.firebase.google.com üzerinde ücretsiz bir proje oluştur.</li>
              <li>Authentication → Sign-in method → <strong>E-posta/Şifre</strong> yöntemini aç.</li>
              <li>Build → Realtime Database'i oluştur ve <code>firebase/database.rules.json</code> içindeki kuralları yayınla.</li>
              <li>Proje ayarları → Web uygulaması'ndaki <code>apiKey</code> ile veritabanı adresini aşağıya gir.</li>
            </ol>
            <div className="cloud-form">
              <label>Web API key<input type="password" value={cloudConfig.apiKey} onChange={(event) => setCloudConfig({ ...cloudConfig, apiKey: event.target.value })} placeholder="AIza…"/></label>
              <label>Realtime Database adresi<input value={cloudConfig.databaseUrl} onChange={(event) => setCloudConfig({ ...cloudConfig, databaseUrl: event.target.value })} placeholder="https://projen-default-rtdb.europe-west1.firebasedatabase.app"/></label>
              <label className="check-label"><input type="checkbox" checked={cloudConfig.autoSync} onChange={(event) => setCloudConfig({ ...cloudConfig, autoSync: event.target.checked })}/> Otomatik senkronizasyon</label>
              <p className="groq-privacy">Firebase web API anahtarı gizli değildir; yedeğini koruyan şey veritabanı kurallarındaki hesap eşleşmesidir. Yedek yalnızca kendi hesabının <code>backups/&lt;uid&gt;</code> düğümüne yazılır.</p>
              <button disabled={busy || !extensionAvailable} className="button primary" onClick={saveCloudConfig}>Projeyi bağla</button>
            </div>
          </> : <>
            <ol><li>Ücretsiz bir Supabase projesi oluştur.</li><li><code>supabase/schema.sql</code> dosyasını SQL Editor'da çalıştır.</li><li>Project URL ve anon/publishable key'i aşağıya gir.</li></ol>
            <div className="cloud-form">
              <label>Project URL<input value={cloudConfig.supabaseUrl} onChange={(event) => setCloudConfig({ ...cloudConfig, supabaseUrl: event.target.value })} placeholder="https://projen.supabase.co"/></label>
              <label>Anon / publishable key<input type="password" value={cloudConfig.anonKey} onChange={(event) => setCloudConfig({ ...cloudConfig, anonKey: event.target.value })} placeholder="sb_publishable_…"/></label>
              <label className="check-label"><input type="checkbox" checked={cloudConfig.autoSync} onChange={(event) => setCloudConfig({ ...cloudConfig, autoSync: event.target.checked })}/> Otomatik senkronizasyon</label>
              <button disabled={busy || !extensionAvailable} className="button primary" onClick={saveCloudConfig}>Projeyi bağla</button>
            </div>
          </>}
        </div> : !cloudStatus.signedIn ? <div className="cloud-login">
          <label>E-posta<input type="email" autoComplete="email" value={credentials.email} onChange={(event) => setCredentials({ ...credentials, email: event.target.value })}/></label>
          <label>Şifre<input type="password" autoComplete="current-password" value={credentials.password} onChange={(event) => setCredentials({ ...credentials, password: event.target.value })}/></label>
          <div><button disabled={busy} className="button primary" onClick={() => runCloudAction(() => sendMessage<CloudResult>({ type: "CLOUD_SIGN_IN", ...credentials }), "Giriş yapıldı ve veriler birleştirildi.")}><LogIn size={16}/>Giriş yap</button><button disabled={busy} className="button" onClick={() => runCloudAction(() => sendMessage<CloudResult>({ type: "CLOUD_SIGN_UP", ...credentials }), "Hesap oluşturuldu.")}><UserPlus size={16}/>Hesap oluştur</button><button disabled={busy} className="button" onClick={() => runCloudAction(() => sendMessage<CloudResult>({ type: "CLOUD_RESET" }), "Proje bağlantısı sıfırlandı.")}>Proje bilgilerini değiştir</button></div>
        </div> : <div className="cloud-connected">
          <div><small>Bağlı hesap</small><strong>{cloudStatus.email}</strong></div>
          <div><small>Son senkronizasyon</small><strong>{cloudStatus.lastSyncedAt ? new Date(cloudStatus.lastSyncedAt).toLocaleString("tr-TR") : "Henüz yapılmadı"}</strong></div>
          <div className="cloud-actions"><button disabled={busy} className="button primary" onClick={() => runCloudAction(() => sendMessage<CloudResult>({ type: "CLOUD_SYNC" }), "Yerel ve bulut verileri birleştirildi.")}><RefreshCw size={16}/>Şimdi eşitle</button><button disabled={busy} className="button" onClick={() => runCloudAction(() => sendMessage<CloudResult>({ type: "CLOUD_SIGN_OUT" }), "Bulut hesabından çıkıldı.")}><LogOut size={16}/>Çıkış yap</button><button disabled={busy} className="button" onClick={() => runCloudAction(() => sendMessage<CloudResult>({ type: "CLOUD_RESET" }), "Proje bağlantısı sıfırlandı.")}>Projeyi değiştir</button></div>
          {cloudStatus.lastError ? <p className="cloud-error">{cloudStatus.lastError}</p> : null}
        </div>}
      </section>

      <section className="surface data-actions">
        <h2>Yerel veriler</h2>
        <p>IndexedDB kayıtları sekme veya tarayıcı kapanınca silinmez. Yalnızca eklenti verilerini temizlersen, eklentiyi kaldırırsan veya buradaki silme düğmesini kullanırsan gider.</p>
        <div><button className="button" onClick={exportFile}><Download size={16}/>JSON dışa aktar</button><button className="button" onClick={exportCsv}><FileSpreadsheet size={16}/>CSV indir</button><button className="button" onClick={() => input.current?.click()}><Upload size={16}/>JSON içe aktar</button><button className="button danger-button" onClick={clear}><Trash2 size={16}/>Bu cihazdaki verileri sil</button><input ref={input} hidden type="file" accept="application/json" onChange={(event) => importFile(event.target.files?.[0])}/></div>
        <section className="setting-row" style={{ border: 0, paddingLeft: 0, paddingRight: 0, paddingBottom: 0 }}>
          <span className="setting-icon"><Download/></span>
          <div><h2>Otomatik yedek</h2><p>Açıkken yedek, hatırlatma sıklığındaki süre dolduğunda sessizce İndirilenler/DemirTube klasörüne kaydedilir.</p></div>
          <button aria-label="Otomatik yedeği değiştir" className={`toggle ${settings.autoBackupEnabled ? "active" : ""}`} onClick={() => void toggleAutoBackup()} aria-pressed={Boolean(settings.autoBackupEnabled)}><i/></button>
        </section>
        {importCandidate ? <div className="import-preview"><p><strong>Yedek v{importCandidate.version}</strong><span>{importCandidate.videos.length} video · {importCandidate.sessions.length} oturum</span></p><select value={importMode} onChange={(event) => setImportMode(event.target.value as "merge" | "replace")}><option value="merge">Mevcut verilerle birleştir</option><option value="replace">Bu cihazdaki verilerin yerine koy</option></select><button className="button primary" onClick={() => void applyImport()}>İçe aktarmayı onayla</button></div> : null}
      </section>

      <section className="surface data-actions">
        <div className="cloud-heading"><span className="setting-icon"><BellRing/></span><div><h2>Telefon bildirimi (ntfy)</h2><p>ntfy.sh ücretsizdir, hesap gerekmez: telefona ntfy uygulamasını kur, bir konu adına abone ol, aynı adı buraya yaz. Haftalık rapor telefonuna push olarak düşer.</p></div></div>
        <div className="rule-form" style={{ gridTemplateColumns: "1fr auto auto", marginTop: 12 }}>
          <input value={ntfyDraft} onChange={(event) => setNtfyDraft(event.target.value)} placeholder="örn. berk-demirtube-x7q" aria-label="ntfy konu adı"/>
          <button className="button" onClick={() => void saveNtfyTopic()}>Kaydet</button>
          <button className="button" disabled={busy || !settings.ntfyTopic} onClick={() => void testNtfy()}>Test gönder</button>
        </div>
        {settings.ntfyTopic ? <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>Aktif konu: <code>ntfy.sh/{settings.ntfyTopic}</code> — telefonda bu konuya abone ol.</p> : null}
      </section>

      <section className="surface data-actions">
        <div className="cloud-heading"><span className="setting-icon"><NotebookPen/></span><div><h2>Obsidian'a aktar</h2><p>Bugünün izleme özetini tek satır Markdown olarak üretir; ikinci beynindeki günlük notuna yapıştır.</p></div></div>
        <div style={{ marginTop: 12 }}><button className="button" onClick={() => void copyDailyNote()}>Günlük satırı panoya kopyala</button><button className="button" onClick={downloadDailyNote}>.md olarak indir</button></div>
      </section>
      <button className="button onboarding-replay" onClick={() => void onSettings({ ...settings, onboardingCompleted: false })}>İlk kurulum tanıtımını yeniden göster</button>
      <section className="surface diagnostics">
        <div className="cloud-heading"><span className="setting-icon"><Stethoscope/></span><div><h2>Veri Sağlığı / Tanılama</h2><p>Kişisel içerik göndermeden yerel kayıt bütünlüğünü denetle ve güvenli onarımları çalıştır.</p></div><button className="button" disabled={!extensionAvailable} onClick={() => sendMessage<DiagnosticsReport>({ type: "GET_DIAGNOSTICS" }).then(setDiagnostics)}>Denetle</button></div>
        {diagnostics ? <dl className="diagnostic-grid"><div><dt>Videolar</dt><dd>{diagnostics.videoCount}</dd></div><div><dt>Oturumlar</dt><dd>{diagnostics.sessionCount}</dd></div><div><dt>Aktif kalan</dt><dd>{diagnostics.activeSessionCount}</dd></div><div><dt>Eksik metadata</dt><dd>{diagnostics.missingMetadata}</dd></div><div><dt>Yetim oturum</dt><dd>{diagnostics.orphanSessions}</dd></div><div><dt>Son kayıt</dt><dd>{diagnostics.lastSuccessfulCheckpoint ? new Date(diagnostics.lastSuccessfulCheckpoint).toLocaleString("tr-TR") : "Yok"}</dd></div></dl> : null}
        <div className="diagnostic-actions"><button disabled={busy || !extensionAvailable} className="button" onClick={() => void runDiagnostic("FINALIZE_STALE", "Açık kalmış oturumlar güvenli biçimde kapatıldı.")}>Açık oturumları kapat</button><button disabled={busy || !extensionAvailable} className="button" onClick={() => void runDiagnostic("REBUILD_SUMMARIES", "Video özetleri ham oturumlardan yeniden hesaplandı.")}>Özetleri / indeks verisini onar</button><button disabled={busy || !extensionAvailable} className="button" onClick={() => void runDiagnostic("REMOVE_ORPHANS", "Yetim oturumlar kaldırıldı.")}>Yetim kayıtları temizle</button><button disabled={!diagnostics} className="button" onClick={() => void navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2))}>Raporu kopyala</button><button disabled={!diagnostics} className="button" onClick={exportDiagnostics}>Raporu dışa aktar</button></div>
      </section>
      {status ? <p className="status global-status" role="status">{status}</p> : null}
    </div>
  </>;
}
