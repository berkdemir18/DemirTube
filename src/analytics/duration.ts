export type DurationBucket = "0–5 dakika" | "5–10 dakika" | "10–20 dakika" | "20–40 dakika" | "40+ dakika";
export const durationBucket = (seconds: number): DurationBucket => {
  const minutes = seconds / 60;
  if (minutes < 5) return "0–5 dakika";
  if (minutes < 10) return "5–10 dakika";
  if (minutes < 20) return "10–20 dakika";
  if (minutes < 40) return "20–40 dakika";
  return "40+ dakika";
};
