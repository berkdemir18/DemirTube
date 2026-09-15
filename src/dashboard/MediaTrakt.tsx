// DemirTube · Perde › Trakt
//
// İki yol. Varsayılan: trakt.tv/settings/data'dan indirilen dışa aktarım
// ZIP'ini yüklemek — Trakt, API uygulaması açmayı Ağustos 2026'da VIP'e
// bağladı ama dışa aktarım her hesapta ücretsiz. İkinci yol, VIP'i olan için
// canlı bağlantı: kendi API uygulaması + cihaz kodu (şifre eklentiye girmez).
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUpRight, Copy, FileUp, Link2, RefreshCw, Unplug } from "lucide-react";
import { sendMessage } from "../shared/messages";
import type { TraktStatus, TraktSyncSummary } from "../background/trakt-service";
import { readTraktExport } from "../media/trakt-export";
import { relativeDay } from "./media-format";

type Device = { user_code: string; verification_url: string; expires_in: number; interval: number };
const AUTO_SYNC_MS = 6 * 60 * 60 * 1000;

export function MediaTrakt({ onImported }: { onImported: () => Promise<void> }) {
  const [status, setStatus] = useState<TraktStatus>();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [device, setDevice] = useState<Device>();
  const [message, setMessage] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const autoSynced = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importing = useRef(false);

  const importFiles = async (files: File[]) => {
    // Tarayıcı dosya seçiminde change olayını birden fazla kez üretebiliyor; tek içe aktarma çalışsın.
    if (!files.length || importing.current) return;
    importing.current = true;
    setBusy(true); setMessage("Dosya okunuyor…");
    try {
      const read = await readTraktExport(files);
      setMessage(`${read.input.history.length} izleme, ${read.input.ratings.length} puan, ${read.input.watchlist.length} liste kaydı bulundu. Posterler TMDB'den tamamlanıyor, büyük geçmişte bir dakika sürebilir…`);
      const summary = await sendMessage<TraktSyncSummary>({ type: "TRAKT_IMPORT_EXPORT", input: read.input });
      setMessage(summaryText(summary));
      await onImported();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Dosya içe aktarılamadı.");
    } finally {
      importing.current = false;
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
      await refresh();
    }
  };

  const refresh = useCallback(async () => {
    try { setStatus(await sendMessage<TraktStatus>({ type: "TRAKT_STATUS" })); } catch { /* eklenti dışında */ }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const sync = useCallback(async (full = false) => {
    setBusy(true); setMessage(undefined);
    try {
      const summary = await sendMessage<TraktSyncSummary>({ type: "TRAKT_SYNC", full });
      setMessage(summaryText(summary));
      await onImported();
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "Senkron başarısız.");
    } finally {
      setBusy(false);
      await refresh();
    }
  }, [onImported, refresh]);

  // Bağlıysa ve son senkrondan 6 saat geçtiyse ekran açılınca sessizce senkronla.
  useEffect(() => {
    if (!status?.connected || status.syncing || autoSynced.current) return;
    autoSynced.current = true;
    if (!status.lastSyncAt || Date.now() - new Date(status.lastSyncAt).getTime() > AUTO_SYNC_MS) void sync(false);
  }, [status, sync]);

  // Kod ekrandayken Trakt'ın istediği aralıkla yokla.
  useEffect(() => {
    if (!device) return;
    let stopped = false;
    let delay = Math.max(5, device.interval) * 1000;
    const tick = async () => {
      if (stopped) return;
      try {
        const result = await sendMessage<{ state: string; username?: string }>({ type: "TRAKT_POLL" });
        if (result.state === "authorized") {
          setDevice(undefined);
          setMessage(`Bağlandı${result.username ? `: @${result.username}` : ""}. İlk içe aktarma başlıyor…`);
          await refresh();
          await sync(true);
          return;
        }
        if (result.state === "denied") { setDevice(undefined); setMessage("Trakt'ta izin verilmedi."); return; }
        if (result.state === "expired" || result.state === "invalid") { setDevice(undefined); setMessage("Kodun süresi doldu, yeniden dene."); return; }
        if (result.state === "slow-down") delay += 5000;
      } catch (reason) {
        setDevice(undefined);
        setMessage(reason instanceof Error ? reason.message : "Bağlantı kurulamadı.");
        return;
      }
      timer = window.setTimeout(() => void tick(), delay);
    };
    let timer = window.setTimeout(() => void tick(), delay);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [device, refresh, sync]);

  const saveApp = async () => {
    setBusy(true); setMessage(undefined);
    try { await sendMessage({ type: "TRAKT_SAVE_APP", clientId, clientSecret }); setClientId(""); setClientSecret(""); setEditing(false); await refresh(); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Kaydedilemedi."); }
    finally { setBusy(false); }
  };

  const connect = async () => {
    setBusy(true); setMessage(undefined);
    try { setDevice(await sendMessage<Device>({ type: "TRAKT_START_DEVICE" })); }
    catch (reason) { setMessage(reason instanceof Error ? reason.message : "Kod alınamadı."); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!confirm("Trakt bağlantısı kesilsin mi? İçe aktarılmış kayıtlar kütüphanende kalır.")) return;
    await sendMessage({ type: "TRAKT_DISCONNECT" });
    setMessage(undefined);
    await refresh();
  };

  if (!status) return null;

  return <section className="perde-trakt">
    <header>
      <span className="perde-trakt-logo" aria-hidden="true">t</span>
      <div>
        <h2>Trakt</h2>
        <p>{status.connected
          ? <>Bağlı{status.username ? <> · <b>@{status.username}</b></> : null}{status.lastSyncAt ? ` · son senkron ${relativeDay(status.lastSyncAt).toLocaleLowerCase("tr-TR")} ${new Date(status.lastSyncAt).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}` : ""}</>
          : status.lastFileImport ? `Dışa aktarımdan yüklendi · ${relativeDay(status.lastFileImport.at).toLocaleLowerCase("tr-TR")}. Yeni izlemeler için arada bir yeni ZIP yükle.`
          : "İzleme geçmişin, puanların ve izleme listen buraya gelsin. Analiz ve öneriler bunlarla hemen beslenir."}</p>
      </div>
    </header>

    {!status.connected ? <div className={`perde-trakt-drop ${dragging ? "over" : ""}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void importFiles([...event.dataTransfer.files]); }}>
      <ol>
        <li>Trakt'ta <a href="https://app.trakt.tv/settings/data" target="_blank" rel="noreferrer">Ayarlar → Veri <ArrowUpRight size={13} /></a> sayfasında dışa aktarmayı başlat, ZIP insin (VIP gerekmez)</li>
        <li>İnen ZIP'i buraya sürükle ya da seç</li>
      </ol>
      <input ref={fileInput} type="file" accept=".zip,.json,application/zip,application/json" multiple hidden onChange={(event) => void importFiles([...(event.target.files ?? [])])} />
      <button type="button" className="media-button primary" disabled={busy} onClick={() => fileInput.current?.click()}><FileUp size={16} />{busy ? "İçe aktarılıyor…" : "Trakt dışa aktarımını yükle"}</button>
      <small>Aynı dosyayı ya da daha yeni bir dışa aktarımı tekrar yüklemek güvenli: daha önce alınan izlemeler ikinci kez sayılmaz.</small>
    </div> : null}

    {!status.connected ? <details className="perde-trakt-live" open={editing || Boolean(device) || (status.configured && !status.connected && Boolean(message?.includes("Trakt")))}>
      <summary>Trakt VIP'in varsa: otomatik senkron</summary>

    {!status.configured || editing ? <div className="perde-trakt-setup">
      <ol>
        <li><a href="https://trakt.tv/oauth/applications/new" target="_blank" rel="noreferrer">trakt.tv'de yeni API uygulaması aç <ArrowUpRight size={13} /></a></li>
        <li>Ad: <code>DemirTube</code> · Redirect uri: <CopyCode value="urn:ietf:wg:oauth:2.0:oob" /> · izin kutularını boş bırak</li>
        <li>Kaydettikten sonra çıkan <b>Client ID</b> ve <b>Client Secret</b>'ı buraya yapıştır</li>
      </ol>
      <form onSubmit={(event) => { event.preventDefault(); void saveApp(); }}>
        <input value={clientId} onChange={(event) => setClientId(event.target.value)} placeholder="Client ID" autoComplete="off" spellCheck={false} aria-label="Trakt Client ID" />
        <input value={clientSecret} onChange={(event) => setClientSecret(event.target.value)} placeholder="Client Secret" type="password" autoComplete="off" spellCheck={false} aria-label="Trakt Client Secret" />
        <button type="submit" className="media-button primary" disabled={busy || clientId.trim().length < 20 || clientSecret.trim().length < 20}>Kaydet</button>
      </form>
      <small>Bilgiler yalnızca bu bilgisayarda, eklentinin yerel deposunda durur; yedeğe ve buluta girmez.</small>
    </div> : null}

    {status.configured && !status.connected && !editing && !device ? <div className="media-actions">
      <button type="button" className="media-button primary" onClick={() => void connect()} disabled={busy}><Link2 size={16} />Trakt hesabını bağla</button>
      <button type="button" className="media-button" onClick={() => setEditing(true)}>Uygulama bilgilerini değiştir</button>
    </div> : null}

    </details> : null}

    {device ? <div className="perde-trakt-device">
      <p><a href={device.verification_url} target="_blank" rel="noreferrer">{device.verification_url.replace(/^https?:\/\//, "")} <ArrowUpRight size={13} /></a> adresine git ve şu kodu gir:</p>
      <strong aria-live="polite">{device.user_code}</strong>
      <CopyCode value={device.user_code} label="Kodu kopyala" />
      <small>Onay verdiğin an burası kendiliğinden bağlanır. Kod {Math.round(device.expires_in / 60)} dakika geçerli.</small>
    </div> : null}

    {status.connected ? <div className="media-actions">
      <button type="button" className="media-button primary" onClick={() => void sync(false)} disabled={busy || status.syncing}><RefreshCw size={16} className={busy ? "spin" : ""} />{busy ? "Senkronlanıyor…" : "Şimdi senkronla"}</button>
      <button type="button" className="media-button" onClick={() => void sync(true)} disabled={busy}>Tüm geçmişi yeniden tara</button>
      <button type="button" className="media-button danger" onClick={() => void disconnect()}><Unplug size={16} />Bağlantıyı kes</button>
    </div> : null}

    {message ? <p className="perde-trakt-message" role="status">{message}</p>
      : status.lastResult && status.connected ? <p className="perde-trakt-message">{summaryText(status.lastResult)}</p> : null}
  </section>;
}

function CopyCode({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="perde-copy" onClick={() => { void navigator.clipboard?.writeText(value).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); }); }}>
    {label ? null : <code>{value}</code>}<Copy size={13} />{copied ? "kopyalandı" : label ?? ""}
  </button>;
}

function summaryText(summary: TraktSyncSummary) {
  const parts = [
    `${summary.plays} yeni izleme`,
    summary.newTitles ? `${summary.newTitles} yeni yapım` : undefined,
    summary.ratings ? `${summary.ratings} puan` : undefined,
    summary.watchlist ? `${summary.watchlist} liste kaydı` : undefined,
    summary.duplicates ? `${summary.duplicates} izleme Perde'de zaten vardı` : undefined,
    summary.skippedNoTmdb ? `${summary.skippedNoTmdb} kayıt TMDB karşılığı olmadığı için alınmadı` : undefined,
  ].filter(Boolean);
  return `Son senkron: ${parts.join(" · ")}.`;
}
