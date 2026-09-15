import { useState } from "react";
import type { WatchlistItem } from "../shared/types";

export const intentLabels = { open: "Serbest", learn: "Öğrenme", research: "Araştırma", focus: "Odak", relax: "Eğlence" };

export function LearningCard({ item, onSave }: { item: WatchlistItem; onSave: (item: WatchlistItem) => Promise<void> }) {
  const [draft, setDraft] = useState(item);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try { await onSave(draft); setStatus("Kaydedildi."); }
    catch { setStatus("Kaydedilemedi. Tekrar dene."); }
    finally { setBusy(false); }
  };
  const url = new URL(`https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`);
  url.searchParams.set("t", String(draft.noteSeconds ?? 0));
  // Seçim kutuları etiketin içinde olduğu için erişilebilir ad seçeneklerle
  // birleşiyordu ("AşamaKaydettimİzledim…"); ekran okuyucu ve testler için ad
  // aria-label ile sabitlendi.
  return <details className="learning-card"><summary>Notlar ve öğrenme takibi</summary>
    <label>Amaç<select aria-label="Amaç" value={draft.intent ?? "open"} onChange={e => setDraft({ ...draft, intent: e.target.value as WatchlistItem["intent"] })}>{Object.entries(intentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
    <label>Aşama<select aria-label="Aşama" value={draft.learningStage ?? "saved"} onChange={e => setDraft({ ...draft, learningStage: e.target.value as WatchlistItem["learningStage"] })}><option value="saved">Kaydettim</option><option value="watched">İzledim</option><option value="practiced">Denedim</option><option value="mastered">Yapabiliyorum</option></select></label>
    <label>Not / yapılacak iş<textarea maxLength={2000} value={draft.note ?? ""} onChange={e => setDraft({ ...draft, note: e.target.value })} /></label>
    <label>Videodaki saniye<input type="number" min="0" max={item.durationSeconds || undefined} value={draft.noteSeconds ?? 0} onChange={e => setDraft({ ...draft, noteSeconds: Math.max(0, Math.min(item.durationSeconds || Infinity, Number(e.target.value) || 0)) })} /></label>
    <a href={url.href} target="_blank" rel="noreferrer">Notun olduğu anı aç</a>
    <label>Tekrar tarihi<input type="date" value={draft.reviewOn ?? ""} onChange={e => setDraft({ ...draft, reviewOn: e.target.value })} /></label>
    <label>Bu seçim işine yaradı mı?<select aria-label="Bu seçim işine yaradı mı?" value={draft.useful === undefined ? "unknown" : String(draft.useful)} onChange={e => setDraft({ ...draft, useful: e.target.value === "unknown" ? undefined : e.target.value === "true" })}><option value="unknown">Henüz değerlendirmedim</option><option value="true">Evet</option><option value="false">Hayır</option></select></label>
    <button className="button" disabled={busy} onClick={() => void save()}>{busy ? "Kaydediliyor…" : "Kaydet"}</button><p role="status">{status}</p>
  </details>;
}
