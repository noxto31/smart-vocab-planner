import { describe, expect, it } from "vitest";
import { createBackupData, parseBackupData } from "../src/domain/backup";
import { importWordsFromCsv } from "../src/domain/importWords";
import type { UserGoal } from "../src/domain/types";

describe("词表导入与备份", () => {
  it("多词书包含相同单词时只计一个目标词，并保留多个来源", () => {
    const csv = `word,meaning,book_name,level,tags
ability,能力,Foundation Demo,A2,noun
ability,能力,CET4 Core Demo,A2,noun;duplicate
adapt,适应,Foundation Demo,A2,verb
adapt,适应,CET6 Bridge Demo,B1,verb;duplicate`;
    const result = importWordsFromCsv(csv);

    expect(result.addedCount).toBe(2);
    expect(result.duplicateCount).toBe(2);
    expect(result.words).toHaveLength(2);
    expect(result.words.find((word) => word.normalizedWord === "ability")?.sourceBookNames).toEqual([
      "Foundation Demo",
      "CET4 Core Demo"
    ]);
  });

  it("导出后重新导入能够恢复目标和完成记录", () => {
    const goal = makeGoal();
    const backup = createBackupData({
      goals: [goal],
      wordBooks: [],
      words: [],
      studyPlans: [],
      dailyTasks: [],
      reviewTasks: [],
      progressRecords: [
        {
          id: "progress:goal:test:2026-01-02",
          goalId: goal.id,
          date: "2026-01-02",
          newWordsCompleted: 18,
          reviewsCompleted: 6,
          minutesSpent: 40,
          note: "恢复测试",
          createdAt: "2026-01-02T00:00:00.000Z"
        }
      ],
      adjustmentLogs: []
    });
    const restored = parseBackupData(JSON.stringify(backup));

    expect(restored.goals[0].targetVocabularyCount).toBe(120);
    expect(restored.progressRecords[0].newWordsCompleted).toBe(18);
    expect(restored.progressRecords[0].note).toBe("恢复测试");
  });

  it("字段错误会给出明确原因", () => {
    const result = importWordsFromCsv("meaning,book_name\n能力,Foundation Demo");
    expect(result.errors).toContain("CSV 缺少必填字段 word");
  });
});

function makeGoal(): UserGoal {
  return {
    id: "goal:test",
    targetType: "CET4",
    targetDescription: "备份测试",
    startDate: "2026-01-01",
    deadline: "2026-02-01",
    targetVocabularyCount: 120,
    currentEstimatedVocabulary: 1000,
    dailyNewWordLimit: 20,
    dailyReviewLimit: 80,
    studyDaysPerWeek: 6,
    restWeekdays: [0],
    bufferDayRatio: 0.1,
    planStyle: "steady",
    selectedBookIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
