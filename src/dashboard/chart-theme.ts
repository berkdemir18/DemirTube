// DemirTube · grafik paleti
//
// Recharts renkleri CSS değişkeni okuyamaz; grafiklerde kullanılan her renk
// buradan gelir ki palet tek yerden değişsin. Sıra, kategorik serilerde
// ayırt edilebilirliğe göre seçildi: önce vurgu, sonra sıcak/nötr tonlar.
export const chartSeries = [
  "#C0522F", // oksit · vurgu
  "#D9963C", // kor
  "#7A9A6B", // yosun
  "#8B9095", // çelik
  "#A8735A", // solmuş bakır
  "#5E7A6B", // koyu yosun
];

/** Tek serili grafiklerin ana rengi. */
export const chartAccent = chartSeries[0];
/** İkincil seri (karşılaştırma, önceki dönem). */
export const chartMuted = "#8B9095";
/** Izgara çizgisi ve eksen; zeminden ayrılır ama okumayı bölmez. */
export const chartGrid = "#26292B";
export const chartAxis = "#8B9095";
