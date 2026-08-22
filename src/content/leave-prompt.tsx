import { X } from "lucide-react";
import { sendMessage } from "../shared/messages";
import type { LeaveReason } from "../shared/types";

const reasons: Array<[LeaveReason, string]> = [
  ["misleading_title", "Başlık yanıltıcıydı"],
  ["too_long", "Video çok uzundu"],
  ["repetitive", "İçerik kendini tekrarladı"],
  ["not_interesting", "Konu ilgimi çekmedi"],
  ["presentation", "Sunumu sevmedim"],
  ["accidental", "Yanlışlıkla açtım"],
  ["watch_later", "Daha sonra izleyeceğim"],
  ["other", "Başka bir neden"]
];

export function LeavePrompt({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const choose = async (reason: LeaveReason) => {
    await sendMessage({ type: "SET_LEAVE_REASON", sessionId, reason }).catch(() => undefined);
    onClose();
  };
  return <aside className="dt-leave" aria-label="Videodan neden ayrıldın?">
    <header><strong>Neden ayrıldın?</strong><button aria-label="Kapat" onClick={onClose}><X size={14}/></button></header>
    <p>İstersen tek dokunuşla sistemi düzeltebilirsin.</p>
    <div>{reasons.map(([value, label]) => <button key={value} onClick={() => choose(value)}>{label}</button>)}</div>
    <button className="dismiss" onClick={onClose}>Şimdi değil</button>
  </aside>;
}

export const leavePromptCss = `
  :host{all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647}
  *{box-sizing:border-box}.dt-leave{width:min(340px,calc(100vw - 24px));padding:14px;border:1px solid #304555;border-radius:12px;background:#0d1b26;color:#f7f5f2;font:12px/1.4 Inter,Roboto,Arial,sans-serif;box-shadow:0 16px 50px #0008}
  header{display:flex;justify-content:space-between;align-items:center}header strong{font-size:14px}button{border:1px solid #304555;border-radius:7px;background:#14213a;color:#dce6ec;padding:7px 9px;cursor:pointer}header button{padding:5px;display:grid}.dt-leave p{color:#8fa2b1;margin:6px 0 10px}.dt-leave>div{display:flex;flex-wrap:wrap;gap:6px}.dt-leave>div button:hover,.dt-leave>div button:focus{border-color:#8b5cf6;background:rgba(139,92,246,.1);outline:none}.dismiss{display:block;margin:9px 0 0 auto;background:transparent;border:0;color:#8fa2b1}
`;
