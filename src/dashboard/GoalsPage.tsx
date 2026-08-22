import { CheckCircle2, MoonStar, Target } from "lucide-react";
import type { Settings, VideoRecord, WatchSession } from "../shared/types";
import { evaluateGoals } from "../analytics/insights-suite";
import { Meter, PageHeading } from "./ui";

export function GoalsPage({ videos, sessions, settings, onSettings }: { videos: VideoRecord[]; sessions: WatchSession[]; settings: Settings; onSettings: (settings: Settings) => Promise<void> }) {
  const progress = evaluateGoals(videos, sessions, settings.goals);
  const update = (key: keyof Settings["goals"], value: number) => onSettings({ ...settings, goals: { ...settings.goals, [key]: value } });
  return <>
    <PageHeading eyebrow="HAFTALIK PUSULA" title="Kişisel Hedefler" copy="Engelleme yapmadan, seçtiğin izleme dengesine ne kadar yaklaştığını gösterir." />
    <section className="goal-progress-grid">{progress.map((goal) => <article className={`surface goal-progress ${goal.met ? "met" : ""}`} key={goal.key}><span>{goal.met ? <CheckCircle2/> : goal.key === "maxLateNightMinutes" ? <MoonStar/> : <Target/>}</span><div><small>{goal.label}</small><strong>{goal.detail}</strong><Meter value={goal.progress}/></div></article>)}</section>
    <section className="surface goal-settings"><div className="section-head"><div><h2>Hedefleri düzenle</h2><p>Değerler yalnızca cihazındaki ayarlarda saklanır.</p></div></div>
      <label><span>Haftalık öğrenme videosu</span><input type="number" min="0" max="50" value={settings.goals.weeklyLearningVideos} onChange={(event) => void update("weeklyLearningVideos", Number(event.target.value))}/></label>
      <label><span>En fazla Shorts payı (%)</span><input type="number" min="0" max="100" value={settings.goals.maxShortsPercent} onChange={(event) => void update("maxShortsPercent", Number(event.target.value))}/></label>
      <label><span>Haftalık tamamlanan video</span><input type="number" min="0" max="50" value={settings.goals.weeklyCompletedVideos} onChange={(event) => void update("weeklyCompletedVideos", Number(event.target.value))}/></label>
      <label><span>Gece başlangıç saati</span><input type="number" min="0" max="23" value={settings.goals.lateNightStartHour} onChange={(event) => void update("lateNightStartHour", Number(event.target.value))}/></label>
      <label><span>Haftalık gece izleme sınırı (dk)</span><input type="number" min="0" max="2000" value={settings.goals.maxLateNightMinutes} onChange={(event) => void update("maxLateNightMinutes", Number(event.target.value))}/></label>
    </section>
  </>;
}
