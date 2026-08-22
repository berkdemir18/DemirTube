import { createRoot, type Root } from "react-dom/client";
import { ThumbsUp } from "lucide-react";
import { BrandMark } from "../shared/Brand";
import { sendMessage } from "../shared/messages";
import type { VideoMetadata } from "../shared/types";

let root: Root | undefined;

export function mountShortsFeedbackDock(metadata: VideoMetadata) {
  unmountShortsFeedbackDock();
  const host = document.createElement("div"); host.id = "demirtube-shorts-dock";
  const shadow = host.attachShadow({ mode: "open" }); const style = document.createElement("style"); style.textContent = css;
  const container = document.createElement("div"); shadow.append(style, container); document.documentElement.append(host);
  root = createRoot(container); root.render(<ShortsDock metadata={metadata}/>);
}
export function unmountShortsFeedbackDock() { root?.unmount(); root = undefined; document.querySelector("#demirtube-shorts-dock")?.remove(); }

function ShortsDock({ metadata }: { metadata: VideoMetadata }) {
  const save = (patch: { liked?: boolean; reason?: "not_interesting" | "repetitive" | "accidental" }) => void sendMessage({ type: "SAVE_FEEDBACK", feedback: { videoId: metadata.videoId, updatedAt: new Date().toISOString(), ...patch } }).catch(() => undefined);
  return <details className="dt-shorts-dock"><summary><BrandMark size={18}/> DemirTube</summary><div><strong>Bu Short nasıldı?</strong><button onClick={() => save({ liked: true })}><ThumbsUp size={13}/> Sardı</button><button onClick={() => save({ reason: "not_interesting", liked: false })}>İlgimi çekmedi</button><button onClick={() => save({ reason: "repetitive", liked: false })}>Tekrardı</button><button onClick={() => save({ reason: "accidental" })}>Yanlışlıkla açtım</button></div></details>;
}
const css = `:host{all:initial;position:fixed;right:18px;bottom:18px;z-index:2147483647}.dt-shorts-dock{font:12px/1.4 Inter,Roboto,Arial,sans-serif}.dt-shorts-dock summary{display:flex;align-items:center;gap:7px;width:max-content;padding:7px 11px 7px 7px;border:1px solid rgba(255,255,255,.09);border-radius:999px;background:#0c1220;color:#f2f4fa;font-weight:750;cursor:pointer;box-shadow:0 8px 26px #0008}.dt-shorts-dock summary svg{border-radius:5px}.dt-shorts-dock>div{display:grid;gap:6px;width:205px;margin-top:8px;padding:10px;border:1px solid rgba(255,255,255,.09);border-radius:11px;background:#101a2f;color:#f2f4fa;box-shadow:0 12px 35px #0009}.dt-shorts-dock strong{font-size:11px}.dt-shorts-dock button{border:1px solid rgba(255,255,255,.09);border-radius:7px;background:#14213a;color:#f2f4fa;padding:7px;text-align:left;cursor:pointer}.dt-shorts-dock button:hover{border-color:#8b5cf6}.dt-shorts-dock button svg{vertical-align:middle;margin-right:4px}`;
