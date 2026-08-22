import { DEFAULT_KEYWORD_RULES, MAX_DIAGNOSTIC_LOGS } from "../shared/constants";
import type { CustomTopicRule, DiagnosticLog, KeywordRules, WeeklyReport } from "../shared/types";
import { getDatabase, withDatabase } from "./database";

export const auxiliaryRepository = {
  async customTopics() { return withDatabase((database) => database.getAll("customTopics")); },
  async putCustomTopic(rule: CustomTopicRule) { await withDatabase((database) => database.put("customTopics", rule)); return rule; },
  async removeCustomTopic(id: string) { await withDatabase((database) => database.delete("customTopics", id)); },
  async keywordRules(): Promise<KeywordRules> {
    return (await withDatabase((database) => database.get("keywordRules", "default"))) ?? DEFAULT_KEYWORD_RULES;
  },
  async putKeywordRules(rules: KeywordRules) { await withDatabase((database) => database.put("keywordRules", rules)); return rules; },
  async diagnostics() { return withDatabase((database) => database.getAll("diagnostics")); },
  async log(entry: DiagnosticLog) {
    const database = await getDatabase();
    await database.put("diagnostics", entry);
    const logs = await database.getAllFromIndex("diagnostics", "by-timestamp");
    for (const old of logs.slice(0, Math.max(0, logs.length - MAX_DIAGNOSTIC_LOGS))) await database.delete("diagnostics", old.id);
  },
  async reports() { return withDatabase((database) => database.getAll("weeklyReports")); },
  async putReport(report: WeeklyReport) { await withDatabase((database) => database.put("weeklyReports", report)); return report; }
};
