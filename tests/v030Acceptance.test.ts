import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays } from "../src/domain/date";
import { parseBackupData } from "../src/domain/backup";
import { applyReviewResult, generateWordLevelPlan } from "../src/domain/scheduler";
import { recommendBooks } from "../src/domain/recommendation";
import type { BackupDataV1, DailyReviewAssignment, LearningGoal, WordBook, WordItem, WordProgress } from "../src/domain/types";
import {
  analyzeNaturalLanguageGoal,
  exportBackup,
  generateAndSavePlan,
  importBackup,
  importWordText,
  resetAllData,
  saveGoal
} from "../src/services/plannerService";
import { db } from "../src/storage/db";

describe("v0.3.0 智能背词 Beta 验收", () => {
  beforeEach(async () => {
    await resetAllData();
  });

  it("自然语言目标生成建议但不会自动改变正式执行目标", async () => {
    await importWordText(makeCsv(20), "csv");
    const goal = await saveGoal(makeGoal({ targetRequiredCount: 20 }));
    await generateAndSavePlan(goal, goal.startDate, "initial", "测试初始计划");

    const before = await db.goals.get(goal.id);
    const suggestion = await analyzeNaturalLanguageGoal("我三个月后准备考六级，现在词汇比较弱，希望安排一个实际能完成的背词计划。");
    const after = await db.goals.get(goal.id);

    expect(suggestion.targetType).toBe("CET6");
    expect(suggestion.recommendedBookCategories.some((item) => item.importRequirement?.includes("导入"))).toBe(true);
    expect(after?.targetRequiredCount).toBe(before?.targetRequiredCount);
    expect(await db.aiPlanningAdvices.count()).toBe(1);
    expect(await db.dailyNewAssignments.count()).toBe(20);

    await saveGoal({
      ...goal,
      goalInputMode: "natural_language",
      originalGoalText: "我三个月后准备考六级，现在词汇比较弱，希望安排一个实际能完成的背词计划。",
      interpretedGoal: suggestion.interpretedGoal,
      targetType: suggestion.targetType,
      targetRequiredCount: suggestion.suggestedTargetWordCount
    });
    expect(await db.aiAdviceApplications.count()).toBe(1);
  });

  it("保存目标和生成计划会写入目标版本、阶段计划、周度复盘和月度复盘", async () => {
    await importWordText(makeCsv(40), "csv");
    const goal = await saveGoal(makeGoal({ targetRequiredCount: 30, dailyNewWordLimit: 10, deadline: "2026-06-12" }));
    await generateAndSavePlan(goal, goal.startDate, "initial", "v0.3.0 生成完整计划");

    expect(await db.goalVersions.count()).toBe(1);
    expect(await db.stagePlans.count()).toBeGreaterThanOrEqual(3);
    expect(await db.weeklyReviews.count()).toBeGreaterThan(0);
    expect(await db.monthlyReviews.count()).toBeGreaterThan(0);
    const plan = await db.studyPlans.orderBy("version").last();
    expect(plan?.coverage.enabledWordCount).toBe(40);
    expect(plan?.coverage.reviewingWordCount).toBe(0);
  });

  it("词库大于目标时按启用词书与阶段规则选择具体词，不按字母随意截取", () => {
    const goal = makeGoal({
      targetRequiredCount: 1,
      selectedBookIds: ["book:foundation", "book:general"],
      needsFoundationRepair: true
    });
    const words: WordItem[] = [
      makeWord("apple", ["book:general"], ["普通"], "core"),
      makeWord("zebra", ["book:foundation"], ["基础", "核心"], "foundation")
    ];
    const plan = generateWordLevelPlan({
      goal,
      words,
      wordProgress: [],
      existingNewAssignments: [],
      existingReviewAssignments: [],
      asOfDate: goal.startDate,
      version: 1,
      triggerType: "initial",
      reason: "测试优先级"
    });

    expect(plan.newAssignments).toHaveLength(1);
    expect(plan.newAssignments[0].wordId).toBe("word:zebra");
  });

  it("推荐但未导入词书不会被当作可执行词库，推荐结果说明导入要求", () => {
    const goal = makeGoal({ selectedBookIds: ["book:imported"] });
    const books: WordBook[] = [
      makeBook("book:recommended", "CET6 推荐词书", false),
      { ...makeBook("book:imported", "已导入词书", true), actualWordCount: 12, importedWordCount: 12 }
    ];
    const recommendations = recommendBooks(goal, books, 12);

    const recommended = recommendations.find((item) => item.book.id === "book:recommended");
    const imported = recommendations.find((item) => item.book.id === "book:imported");
    expect(recommended?.hasExecutableWords).toBe(false);
    expect(recommended?.importRequirement).toContain("导入");
    expect(imported?.status).toBe("enabled");
  });

  it("重点遗忘词标识来自真实复习结果", () => {
    const progress: WordProgress = {
      wordId: "word:test",
      state: "reviewing",
      firstLearnedDate: "2026-06-01",
      nextReviewDate: "2026-06-02",
      reviewStage: 0,
      lapseCount: 1,
      sourceBookIds: ["book:test"],
      updatedAt: "2026-06-01T00:00:00.000Z"
    };
    const assignment: DailyReviewAssignment = {
      id: "review:goal:test:2026-06-02:word:test:stage-0",
      goalId: "goal:test",
      date: "2026-06-02",
      wordId: "word:test",
      reviewStage: 0,
      status: "planned",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    };

    const output = applyReviewResult({ assignment, progress, result: "forgot" });

    expect(output.progress.isDifficult).toBe(true);
    expect(output.progress.difficultyReason).toContain("不认识");
    expect(output.reviewRecord.result).toBe("forgot");
  });

  it("v0.3.0 备份往返和异常备份导入安全失败", async () => {
    await importWordText(makeCsv(8), "csv");
    const goal = await saveGoal(makeGoal({ targetRequiredCount: 8 }));
    await generateAndSavePlan(goal, goal.startDate, "initial", "测试备份");
    const backup = await exportBackup();
    expect(backup.schemaVersion).toBe(3);
    expect(backup.goalVersions).toHaveLength(1);
    expect(backup.stagePlans.length).toBeGreaterThan(0);

    await expect(importBackup("{bad json")).rejects.toThrow("备份 JSON 解析失败");
    expect(await db.goals.count()).toBe(1);

    await importBackup(JSON.stringify(backup));
    expect(await db.dailyNewAssignments.count()).toBe(8);
    expect(await db.weeklyReviews.count()).toBeGreaterThan(0);
  });

  it("v0.1.0 legacy 备份迁移为 v0.3.0 且不伪造具体单词历史", () => {
    const restored = parseBackupData(JSON.stringify(makeLegacyBackup()));

    expect(restored.backupVersion).toBe("v0.3.0");
    expect(restored.migrationMeta.sourceBackupVersion).toBe("v0.1.0");
    expect(restored.legacyProgressRecords).toHaveLength(1);
    expect(restored.dailyNewAssignments).toHaveLength(0);
    expect(restored.reviewHistory).toHaveLength(0);
  });
});

function makeGoal(overrides: Partial<LearningGoal> = {}): LearningGoal {
  return {
    id: "goal:test",
    goalInputMode: "structured",
    interpretedGoal: "测试目标",
    targetDescription: "测试目标",
    foundationDescription: "基础一般",
    needsFoundationRepair: false,
    targetType: "CET4",
    startDate: "2026-06-01",
    deadline: addDays("2026-06-01", 20),
    targetRequiredCount: 20,
    dailyNewWordLimit: 10,
    dailyReviewLimit: 60,
    studyDaysPerWeek: 6,
    restWeekdays: [0],
    bufferDayRatio: 0.1,
    planStyle: "steady",
    timezone: "Asia/Shanghai",
    selectedBookIds: ["book:test-book"],
    allowBookRecommendation: true,
    aiPlanningEnabled: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides
  };
}

function makeCsv(count: number): string {
  return [
    "word,meaning,book_name,level,tags",
    ...Array.from({ length: count }, (_, index) => `word${index},测试词${index},Test Book,A1,核心`)
  ].join("\n");
}

function makeWord(word: string, sourceBookIds: string[], tags: string[], stageHint: WordItem["stageHint"]): WordItem {
  return {
    id: `word:${word}`,
    word,
    normalizedWord: word,
    meaning: "测试词",
    sourceBookIds,
    sourceBookNames: sourceBookIds,
    tags,
    stageHint,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  };
}

function makeBook(id: string, name: string, imported: boolean): WordBook {
  return {
    id,
    name,
    targetType: "CET6",
    difficulty: "B1",
    estimatedWordCount: 500,
    sourceDescription: "测试词书",
    hasImportedWords: imported,
    status: imported ? "imported" : "recommended",
    role: "core",
    recommendationTags: ["六级", "核心"],
    isFoundation: false,
    isTargetBook: true
  };
}

function makeLegacyBackup(): BackupDataV1 {
  return {
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
    words: [],
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
}
