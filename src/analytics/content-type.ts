import type { ContentType } from "../shared/types";
import { normalizeText } from "../shared/utils";

export type ContentTypeSignals = {
  path?: string;
  durationSeconds?: number;
  title?: string;
  description?: string;
  hashtags?: string[];
  channelName?: string;
  isLive?: boolean;
  isPremiere?: boolean;
  category?: string;
  chapterCount?: number;
};

export function classifyContentType(signals: ContentTypeSignals): ContentType {
  const title = normalizeText(signals.title ?? "");
  const channel = normalizeText(signals.channelName ?? "");
  const description = normalizeText(signals.description ?? "");
  const category = normalizeText(signals.category ?? "");
  const hashtags = normalizeText((signals.hashtags ?? []).join(" "));
  const context = `${title} ${channel} ${description} ${category} ${hashtags}`;
  const duration = signals.durationSeconds ?? 0;

  // "Canlı yayın nasıl yapılır?" gibi normal videoları yalnızca başlık veya
  // açıklamadaki kelimeler yüzünden canlı sayma. Aktif yayın kanıtı içerik
  // script'inde güncel YouTube oynatıcı durumundan gelir.
  if (signals.isLive) return "livestream";
  if (signals.isPremiere || /\b(premiere|promiyer|galasi)\b/.test(context)) return "premiere";

  // Kısa süre tek başına Shorts kanıtı değildir; normal bir 45 sn video da olabilir.
  if (signals.path?.startsWith("/shorts")) return "short";
  const explicitShort = /(^|\s)#?shorts?\b|\byoutube shorts\b|\bkisa video\b/.test(`${title} ${description} ${hashtags}`);
  if (explicitShort && (duration === 0 || duration <= 180)) return "short";

  const podcastScore =
    (/\b(podcast|podkast|video podcast)\b/.test(title) ? 4 : 0)
    + (/\b(podcast|podkast)\b/.test(channel) ? 3 : 0)
    + (/\b(podcast|podkast|bolum \d+|episode \d+|uzun sohbet)\b/.test(`${description} ${hashtags}`) ? 2 : 0)
    + (duration >= 900 && /\b(sohbet|konuk|roportaj)\b/.test(context) ? 1 : 0);
  if (podcastScore >= 3) return "podcast";

  const musicScore =
    (/\b(official music video|official audio|lyrics?|lyric video|muzik videosu|klip)\b/.test(title) ? 4 : 0)
    + (/\b(music|muzik|records|vevo)\b/.test(channel) ? 2 : 0)
    + (/\b(artist|album|song|sarki|besteci|composer)\b/.test(`${description} ${category} ${hashtags}`) ? 2 : 0)
    + (/\b(music|muzik)\b/.test(category) ? 3 : 0);
  if (musicScore >= 3) return "music";

  if (duration >= 2_400 || (duration >= 1_800 && (signals.chapterCount ?? 0) >= 5)) return "long_form";
  if ((signals.durationSeconds ?? 0) > 0) return "standard";
  return "unknown";
}
