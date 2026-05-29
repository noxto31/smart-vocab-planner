import { describe, expect, it } from "vitest";
import { createBackupData, parseBackupData } from "../src/domain/backup";
import { importWordsFromCsv } from "../src/domain/importWords";
import type { BackupDataV1, LearningGoal } from "../src/domain/types";

describe("词表导入与备份兼容", () => {
  it("字段错误会给出明确原因", () => {
    const result = importWordsFromCsv("meaning,book_name\n能力,Foundation Demo");
    expect(result.errors).toContain("CSV 缺少必填字段 word");
  });

  it("v0.4.0 导出后重新导入能够恢复具体任务相关数据", () => {
    const goal = makeGoal();
    const backup = createBackupData({
      goals: [goal],
      wordBooks: [],
      words: [],
      wordProgress: [
        {
          wordId: "word:test",
          state: "reviewing",
          firstAssignedDate: "2026-01-01",
          firstLearnedDate: "2026-01-01",
          nextReviewDate: "2026-01-02",
          reviewStage: 0,
          lapseCount: 0,
          sourceBookIds: ["book:test"],
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      studyPlans: [],
      dailyTasks: [],
      dailyNewAssignments: [
        {
          id: "new:goal:test:2026-01-01:word:test",
          goalId: goal.id,
          date: "2026-01-01",
          wordId: "word:test",
          status: "learned",
          completedAt: "2026-01-01T00:00:00.000Z",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      dailyReviewAssignments: [],
      reviewHistory: [],
      legacyProgressRecords: [],
      adjustmentLogs: []
    });
    const restored = parseBackupData(JSON.stringify(backup));

    expect(restored.backupVersion).toBe("v0.4.0");
    expect(restored.schemaVersion).toBe(3);
    expect(restored.goalVersions[0].goalId).toBe(goal.id);
    expect(restored.goals[0].targetRequiredCount).toBe(120);
    expect(restored.wordProgress[0].state).toBe("reviewing");
    expect(restored.dailyNewAssignments[0].wordId).toBe("word:test");
  });

  it("v0.1.0 备份会迁移目标和词表，并保留旧数量记录但不伪造具体单词历史", () => {
    const legacy: BackupDataV1 = {
      schemaVersion: 1,
      exportedAt: "2026-01-01T00:00:00.000Z",
      goals: [
        {
          id: "goal:old",
          targetType: "CET4",
          targetDescription: "旧目标",
          startDate: "2026-01-01",
          deadline: "2026-02-01",
          targetVocabularyCount: 300,
          dailyNewWordLimit: 30,
          dailyReviewLimit: 120,
          restWeekdays: [0],
          bufferDayRatio: 0.1,
          planStyle: "steady",
          selectedBookIds: ["book:test"],
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      wordBooks: [],
      words: [
        {
          id: "word:test",
          word: "ability",
          normalizedWord: "ability",
          meaning: "能力",
          sourceBookIds: ["book:test"],
          sourceBookNames: ["Test Book"],
          tags: [],
          status: "new",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z"
        }
      ],
      studyPlans: [],
      dailyTasks: [],
      reviewTasks: [],
      progressRecords: [
        {
          id: "progress:goal:old:2026-01-02",
          goalId: "goal:old",
          date: "2026-01-02",
          newWordsCompleted: 18,
          reviewsCompleted: 6,
          minutesSpent: 40,
          note: "旧记录",
          createdAt: "2026-01-02T00:00:00.000Z"
        }
      ],
      adjustmentLogs: []
    };
    const restored = parseBackupData(JSON.stringify(legacy));

    expect(restored.backupVersion).toBe("v0.4.0");
    expect(restored.migrationMeta.sourceBackupVersion).toBe("v0.1.0");
    expect(restored.goals[0].targetRequiredCount).toBe(300);
    expect(restored.words[0]).not.toHaveProperty("status");
    expect(restored.dailyNewAssignments).toHaveLength(0);
    expect(restored.wordProgress).toHaveLength(0);
    expect(restored.legacyProgressRecords[0].sourceVersion).toBe("v0.1.0");
    expect(restored.legacyProgressRecords[0].preservedReason).toContain("无法可靠转换为具体单词历史");
  });
});

function makeGoal(): LearningGoal {
  return {
    id: "goal:test",
    goalInputMode: "structured",
    interpretedGoal: "备份测试",
    targetType: "CET4",
    startDate: "2026-01-01",
    deadline: "2026-02-01",
    targetRequiredCount: 120,
    dailyNewWordLimit: 20,
    dailyReviewLimit: 80,
    restWeekdays: [0],
    bufferDayRatio: 0.1,
    planStyle: "steady",
    timezone: "Asia/Shanghai",
    selectedBookIds: [],
    allowBookRecommendation: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  };
}
