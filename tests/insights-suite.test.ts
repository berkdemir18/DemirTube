import { describe, expect, it } from "vitest";
import {
  buildAttentionSections,
  buildWatchJourney,
  channelDecision,
  comparePeriodSummaries,
  evaluateGoals,
  previousPeriodAnchor,
  summarizePeriod
} from "../src/analytics/insights-suite";
import type { UserGoals, VideoRecord, WatchSession } from "../src/shared/types";

const video = (id: string, patch: Partial<VideoRecord> = {}): VideoRecord => ({
  videoId:id,title:id,channelName:"Kanal",url:`https://youtube.com/watch?v=${id}`,durationSeconds:100,topics:["Eğitim"],
  firstSeenAt:"2026-08-01T10:00:00",lastSeenAt:"2026-08-01T10:02:00",totalWatchSeconds:80,totalActiveWatchSeconds:80,
  uniqueWatchedSeconds:80,rewatchSeconds:0,uniquePlaybackSegments:[{start:0,end:80}],completionRate:.8,sessionCount:1,
  completed:false,regretScore:10,engagementScore:80,contentType:"standard",...patch
});
const session = (id:string, videoId:string, startedAt:string, watchSeconds=60): WatchSession => ({
  id,videoId,startedAt,endedAt:new Date(new Date(startedAt).getTime()+watchSeconds*1000).toISOString(),watchSeconds,maximumPosition:watchSeconds,
  pauseCount:0,forwardSeekCount:0,backwardSeekCount:0,tabHiddenCount:0,playbackSegments:[{start:0,end:watchSeconds}],endedNaturally:false,active:false
});

describe("içgörü paketi", () => {
  it("önceki dönem anchor ve karşılaştırma deltalarını hesaplar", () => {
    expect(previousPeriodAnchor("week", new Date(2026,7,14)).getDate()).toBe(7);
    const result = comparePeriodSummaries(
      summarizePeriod([video("a")],[session("s","a","2026-08-01T10:00:00",120)]),
      summarizePeriod([video("b")],[session("p","b","2026-07-25T10:00:00",60)])
    );
    expect(result.watchSeconds.percent).toBe(100);
  });

  it("30 dakikadan yakın video geçişlerini tek yolculukta toplar", () => {
    const sessions = [session("s1","a","2026-08-01T10:00:00"),session("s2","b","2026-08-01T10:10:00"),session("s3","a","2026-08-01T12:00:00")];
    const journeys = buildWatchJourney([video("a"),video("b",{topics:["Teknoloji"]})],sessions);
    expect(journeys).toHaveLength(2);
    expect(journeys[1].items[1].transition).toBe("Eğitim → Teknoloji");
  });

  it("hedef ilerlemesini ve kanal kararını açıklanabilir üretir", () => {
    const goals:UserGoals={weeklyLearningVideos:1,maxShortsPercent:25,weeklyCompletedVideos:1,lateNightStartHour:1,maxLateNightMinutes:60};
    const watched = video("a",{completed:true});
    expect(evaluateGoals([watched],[session("s","a","2026-08-01T10:00:00")],goals).every((goal)=>goal.met)).toBe(true);
    expect(channelDecision([watched,video("b"),video("c")]).label).toBe("Daha sık izlenebilir");
  });

  it("altyazı bölümlerini izlenme ve tekrar durumuyla birleştirir", () => {
    const watched = video("a",{durationSeconds:100,uniquePlaybackSegments:[{start:0,end:50}],transcriptAnalysis:{available:true,wordCount:20,keywords:[],summary:"",informationDensity:50,repetitionRate:0,titlePromiseCoverage:50,promiseVerdict:"partial",analyzedAt:"2026-08-01T10:00:00Z",keyMoments:[{startSeconds:0,label:"Giriş"},{startSeconds:50,label:"Test"}]}});
    const sections = buildAttentionSections(watched,[{start:0,end:50},{start:0,end:50}]);
    expect(sections[0].status).toBe("tekrar izlendi");
    expect(sections[1].status).toBe("atlanmış");
  });
});
