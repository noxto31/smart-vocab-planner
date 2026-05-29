import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { addDays, dateInTimezone } from "../src/domain/date";
import { parseBackupData } from "../src/domain/backup";
import type { BackupDataV1, DailyReviewAssignment, LearningGoal, WordItem, WordProgress } from "../src/domain/types";
import {
  exportBackup,
  generateAndSavePlan,
  importBackup,
  importWordText,
  recordNewWordAssignmentResult,
  recordReviewAssignmentResult,
  resetAllData,
  saveGoal,
  settleDailyTasks,
  settlePastOpenTasks
} from "../src/services/plannerService";
import { db } from "../src/storage/db";

describe("v0.2.1 服务层逐词操作与当日结算", () => {
  beforeEach(async () => {
    await resetAllData();
  });

  it("处理一个已学习新词，不得提前重排当天其他任务", async () => {
    const { goal, today } = await seedNewWordPlan(20, { targetRequiredCount: 20, dailyNewWordLimit: 10, deadline: addDays(todayDate(), 1) });
    const first = (await getNewAssignments(goal.id, today))[0];

    await recordNewWordAssignmentResult({ assignmentId: first.id, result: "learned" });

    const todayAssignments = await getNewAssignments(goal.id, today);
    expect(todayAssignments.filter((assignment) => assignment.status === "learned")).toHaveLength(1);
    expect(todayAssignments.filter((assignment) => assignment.status === "planned")).toHaveLength(9);
    expect(await countFutureRescheduledNew(goal.id, today, todayAssignments.slice(1).map((assignment) => assignment.wordId))).toBe(0);
    expect((await latestPlan()).coverage.learningBacklogCount).toBe(0);
    expect((await getReviewAssignments(goal.id)).some((assignment) => assignment.wordId === first.wordId)).toBe(true);
    expect((await latestLog()).explanation).not.toContain("当天剩余任务未完成");
  });

  it("处理一个已掌握新词，不得提前重排当天其他任务", async () => {
    const { goal, today } = await seedNewWordPlan(20, { targetRequiredCount: 20, dailyNewWordLimit: 10, deadline: addDays(todayDate(), 1) });
    const first = (await getNewAssignments(goal.id, today))[0];

    await recordNewWordAssignmentResult({ assignmentId: first.id, result: "mastered" });

    const todayAssignments = await getNewAssignments(goal.id, today);
    expect(todayAssignments.filter((assignment) => assignment.status === "mastered")).toHaveLength(1);
    expect(todayAssignments.filter((assignment) => assignment.status === "planned")).toHaveLength(9);
    expect((await latestPlan()).coverage.learningBacklogCount).toBe(0);
    expect(await countFutureRescheduledNew(goal.id, today, todayAssignments.slice(1).map((assignment) => assignment.wordId))).toBe(0);
  });

  it("明确将一个新词标记为未完成时，只处理这一个词", async () => {
    const { goal, today } = await seedNewWordPlan(20, { targetRequiredCount: 20, dailyNewWordLimit: 10, deadline: addDays(todayDate(), 1) });
    const first = (await getNewAssignments(goal.id, today))[0];

    await recordNewWordAssignmentResult({ assignmentId: first.id, result: "missed" });

    const todayAssignments = await getNewAssignments(goal.id, today);
    expect(todayAssignments.filter((assignment) => assignment.status === "missed")).toHaveLength(1);
    expect(todayAssignments.filter((assignment) => assignment.status === "planned")).toHaveLength(9);
    expect((await latestPlan()).coverage.learningBacklogCount).toBe(1);
    expect(await countFutureRescheduledNew(goal.id, today, [first.wordId])).toBe(1);
    expect(await countFutureRescheduledNew(goal.id, today, todayAssignments.slice(1).map((assignment) => assignment.wordId))).toBe(0);
  });

  it("暂时跳过一个新词时，只处理这一个词", async () => {
    const { goal, today } = await seedNewWordPlan(20, { targetRequiredCount: 20, dailyNewWordLimit: 10, deadline: addDays(todayDate(), 1) });
    const first = (await getNewAssignments(goal.id, today))[0];

    await recordNewWordAssignmentResult({ assignmentId: first.id, result: "skipped" });

    const todayAssignments = await getNewAssignments(goal.id, today);
    expect(todayAssignments.filter((assignment) => assignment.status === "skipped")).toHaveLength(1);
    expect(todayAssignments.filter((assignment) => assignment.status === "planned")).toHaveLength(9);
    expect((await latestPlan()).coverage.learningBacklogCount).toBe(1);
  });

  it("完成一个正常复习，不得影响当天其余复习任务", async () => {
    const { goal, today } = await seedReviewPlan(10, todayDate());
    const first = (await getReviewAssignments(goal.id, today))[0];

    await recordReviewAssignmentResult({ assignmentId: first.id, result: "known" });

    const todayReviews = await getReviewAssignments(goal.id, today);
    expect(todayReviews.filter((assignment) => assignment.status === "completed")).toHaveLength(1);
    expect(todayReviews.filter((assignment) => assignment.status === "planned")).toHaveLength(9);
    expect((await latestPlan()).coverage.overdueReviewCount).toBe(0);
    expect(await countFutureRescheduledReviews(goal.id, today, todayReviews.slice(1).map((assignment) => assignment.wordId))).toBe(0);
  });

  it("将一个复习词标记为未完成时，只处理这一个词", async () => {
    const { goal, today } = await seedReviewPlan(10, todayDate());
    const first = (await getReviewAssignments(goal.id, today))[0];

    await recordReviewAssignmentResult({ assignmentId: first.id, result: "not_completed" });

    const todayReviews = await getReviewAssignments(goal.id, today);
    expect(todayReviews.filter((assignment) => assignment.status === "overdue")).toHaveLength(1);
    expect(todayReviews.filter((assignment) => assignment.status === "planned")).toHaveLength(9);
    expect((await latestPlan()).coverage.overdueReviewCount).toBe(1);
    expect(await countFutureRescheduledReviews(goal.id, today, todayReviews.slice(1).map((assignment) => assignment.wordId))).toBe(0);
  });

  it("用户主动结算部分完成的新词任务，并且重复结算幂等", async () => {
    const { goal, today } = await seedNewWordPlan(10, { targetRequiredCount: 10, dailyNewWordLimit: 10, deadline: todayDate() });
    const assignments = await getNewAssignments(goal.id, today);
    for (const assignment of assignments.slice(0, 4)) {
      await recordNewWordAssignmentResult({ assignmentId: assignment.id, result: "learned" });
    }

    const firstSettlement = await settleDailyTasks({ goalId: goal.id, date: today, mode: "manual" });
    const countsAfterFirst = await snapshotCounts(goal.id);
    const secondSettlement = await settleDailyTasks({ goalId: goal.id, date: today, mode: "manual" });
    const countsAfterSecond = await snapshotCounts(goal.id);

    expect(firstSettlement.settledNewWordCount).toBe(6);
    expect(secondSettlement.replanned).toBe(false);
    expect(countsAfterFirst).toEqual(countsAfterSecond);
    expect((await latestPlan()).coverage.learningBacklogCount).toBe(6);
    expect((await latestLog()).triggerType).toBe("daily_settlement");
  });

  it("用户主动结算部分完成的复习任务，并且重复结算幂等", async () => {
    const { goal, today } = await seedReviewPlan(10, todayDate());
    const assignments = await getReviewAssignments(goal.id, today);
    for (const assignment of assignments.slice(0, 4)) {
      await recordReviewAssignmentResult({ assignmentId: assignment.id, result: "known" });
    }

    const firstSettlement = await settleDailyTasks({ goalId: goal.id, date: today, mode: "manual" });
    const countsAfterFirst = await snapshotCounts(goal.id);
    const secondSettlement = await settleDailyTasks({ goalId: goal.id, date: today, mode: "manual" });
    const countsAfterSecond = await snapshotCounts(goal.id);

    expect(firstSettlement.settledReviewCount).toBe(6);
    expect(secondSettlement.replanned).toBe(false);
    expect(countsAfterFirst).toEqual(countsAfterSecond);
    expect((await latestPlan()).coverage.overdueReviewCount).toBe(6);
    expect((await latestLog()).triggerType).toBe("daily_settlement");
  });

  it("进入第二天后自动处理昨日未完成新词，且不影响今天任务", async () => {
    const yesterday = "2026-06-01";
    const today = addDays(yesterday, 1);
    const { goal } = await seedNewWordPlan(20, {
      startDate: yesterday,
      deadline: today,
      targetRequiredCount: 20,
      dailyNewWordLimit: 10
    });
    const yesterdayAssignments = await getNewAssignments(goal.id, yesterday);
    for (const assignment of yesterdayAssignments.slice(0, 4)) {
      await recordNewWordAssignmentResult({ assignmentId: assignment.id, result: "learned" });
    }

    const first = await settlePastOpenTasks({ goalId: goal.id, today });
    const todayAssignmentsAfterFirst = await getNewAssignments(goal.id, today);
    const countsAfterFirst = await snapshotCounts(goal.id);
    const second = await settlePastOpenTasks({ goalId: goal.id, today });

    expect(first.reduce((sum, item) => sum + item.settledNewWordCount, 0)).toBe(6);
    expect(second).toHaveLength(0);
    expect(todayAssignmentsAfterFirst.filter((assignment) => assignment.status === "planned")).toHaveLength(10);
    expect((await latestPlan()).coverage.learningBacklogCount).toBe(6);
    expect(await snapshotCounts(goal.id)).toEqual(countsAfterFirst);
  });

  it("进入第二天后自动处理昨日未完成复习，且不影响今天复习", async () => {
    const yesterday = "2026-06-01";
    const today = addDays(yesterday, 1);
    const { goal } = await seedReviewPlan(20, yesterday, today);
    const yesterdayAssignments = await getReviewAssignments(goal.id, yesterday);
    for (const assignment of yesterdayAssignments.slice(0, 4)) {
      await recordReviewAssignmentResult({ assignmentId: assignment.id, result: "known" });
    }

    const first = await settlePastOpenTasks({ goalId: goal.id, today });
    const todayReviewsAfterFirst = await getReviewAssignments(goal.id, today);
    const countsAfterFirst = await snapshotCounts(goal.id);
    const second = await settlePastOpenTasks({ goalId: goal.id, today });

    expect(first.reduce((sum, item) => sum + item.settledReviewCount, 0)).toBe(6);
    expect(second).toHaveLength(0);
    expect(todayReviewsAfterFirst.filter((assignment) => assignment.status === "planned")).toHaveLength(10);
    expect((await latestPlan()).coverage.overdueReviewCount).toBe(6);
    expect(await snapshotCounts(goal.id)).toEqual(countsAfterFirst);
  });

  it("回归：词库不足但完成全部可执行任务时，库存缺口不计为学习欠缺", async () => {
    const today = todayDate();
    const { goal } = await seedNewWordPlan(70, { targetRequiredCount: 300, dailyNewWordLimit: 300, startDate: today, deadline: today });
    const assignments = await getNewAssignments(goal.id, today);
    const wordsById = new Map((await db.words.toArray()).map((word) => [word.id, word]));
    await db.dailyNewAssignments.bulkPut(
      assignments.map((assignment) => ({
        ...assignment,
        status: "learned" as const,
        completedAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z"
      }))
    );
    await db.wordProgress.bulkPut(
      assignments.map((assignment) => {
        const word = wordsById.get(assignment.wordId);
        if (!word) {
          throw new Error("missing word");
        }
        return {
          wordId: assignment.wordId,
          state: "reviewing" as const,
          firstAssignedDate: today,
          firstLearnedDate: today,
          nextReviewDate: addDays(today, 1),
          reviewStage: 0,
          lapseCount: 0,
          sourceBookIds: word.sourceBookIds,
          updatedAt: "2026-06-01T00:00:00.000Z"
        };
      })
    );
    await generateAndSavePlan(goal, addDays(today, 1), "daily_learning_result", "测试完成全部可执行任务", [today]);

    const coverage = (await latestPlan()).coverage;
    expect(coverage.availableWordCount).toBe(70);
    expect(coverage.inventoryGapCount).toBe(230);
    expect(coverage.learningBacklogCount).toBe(0);
    expect(coverage.completedWordCount).toBe(70);
  });

  it("回归：完整词库只完成 70 词，主动结算后 230 个具体词进入待补学", async () => {
    const today = todayDate();
    const { goal } = await seedNewWordPlan(300, {
      targetRequiredCount: 300,
      dailyNewWordLimit: 300,
      startDate: today,
      deadline: today
    });
    const assignments = await getNewAssignments(goal.id, today);
    const wordsById = new Map((await db.words.toArray()).map((word) => [word.id, word]));
    await db.dailyNewAssignments.bulkPut(
      assignments.slice(0, 70).map((assignment) => ({
        ...assignment,
        status: "learned" as const,
        completedAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:00.000Z"
      }))
    );
    await db.wordProgress.bulkPut(
      assignments.slice(0, 70).map((assignment) => {
        const word = wordsById.get(assignment.wordId);
        if (!word) {
          throw new Error("missing word");
        }
        return {
          wordId: assignment.wordId,
          state: "reviewing" as const,
          firstAssignedDate: today,
          firstLearnedDate: today,
          nextReviewDate: addDays(today, 1),
          reviewStage: 0,
          lapseCount: 0,
          sourceBookIds: word.sourceBookIds,
          updatedAt: "2026-06-01T00:00:00.000Z"
        };
      })
    );

    await settleDailyTasks({ goalId: goal.id, date: today, mode: "manual" });

    const coverage = (await latestPlan()).coverage;
    expect(coverage.inventoryGapCount).toBe(0);
    expect(coverage.learningBacklogCount).toBe(230);
  }, 10000);

  it("回归：导入新词书补足库存缺口", async () => {
    const today = todayDate();
    const { goal } = await seedNewWordPlan(70, { targetRequiredCount: 300, dailyNewWordLimit: 30, startDate: today, deadline: addDays(today, 20) });
    await importWordText(makeCsv(180, 70), "csv");

    const coverage = (await latestPlan()).coverage;
    expect(coverage.availableWordCount).toBe(250);
    expect(coverage.inventoryGapCount).toBe(50);
    expect((await getNewAssignments(goal.id)).filter((assignment) => assignment.status === "planned")).toHaveLength(250);
    expect((await latestLog()).triggerType).toBe("wordbook_import");
  });

  it("v0.2.1 备份恢复、v0.2.0 与 v0.1.0 备份兼容、时区边界保持正常", async () => {
    const today = todayDate();
    await seedNewWordPlan(10, { targetRequiredCount: 10, dailyNewWordLimit: 10, startDate: today, deadline: addDays(today, 5) });
    const backup = await exportBackup();
    expect(backup.backupVersion).toBe("v0.4.0");
    expect(backup.schemaVersion).toBe(3);
    await importBackup(JSON.stringify(backup));
    expect((await db.dailyNewAssignments.toArray()).length).toBeGreaterThan(0);
    expect((await db.goalVersions.toArray()).length).toBeGreaterThan(0);

    const v020 = {
      schemaVersion: 2 as const,
      backupVersion: "v0.2.0" as const,
      exportedAt: "2026-06-01T00:00:00.000Z",
      goals: [makeGoal({ id: "goal:v020" })],
      wordBooks: [],
      words: [],
      wordProgress: [],
      studyPlans: [],
      dailyTasks: [],
      dailyNewAssignments: [],
      dailyReviewAssignments: [],
      reviewHistory: [],
      legacyProgressRecords: [],
      adjustmentLogs: []
    };
    const parsed020 = parseBackupData(JSON.stringify(v020));
    expect(parsed020.backupVersion).toBe("v0.4.0");
    expect(parsed020.migrationMeta.sourceBackupVersion).toBe("v0.2.0");

    const parsed010 = parseBackupData(JSON.stringify(makeLegacyBackup()));
    expect(parsed010.backupVersion).toBe("v0.4.0");
    expect(parsed010.migrationMeta.sourceBackupVersion).toBe("v0.1.0");
    expect(parsed010.legacyProgressRecords[0].sourceVersion).toBe("v0.1.0");
    expect(dateInTimezone(new Date("2026-01-01T15:01:00.000Z"), "Asia/Tokyo")).toBe("2026-01-02");
  });
});

async function seedNewWordPlan(count: number, goalOverrides: Partial<LearningGoal>) {
  const today = goalOverrides.startDate ?? todayDate();
  await importWordText(makeCsv(count), "csv");
  const goal = makeGoal({ startDate: today, deadline: goalOverrides.deadline ?? addDays(today, 7), ...goalOverrides });
  await saveGoal(goal);
  await generateAndSavePlan(goal, today, "initial", "测试初始计划");
  return { goal, today };
}

async function seedReviewPlan(count: number, date: string, secondDate?: string) {
  await importWordText(makeCsv(count), "csv");
  const goal = makeGoal({ startDate: date, deadline: addDays(date, 10), targetRequiredCount: count, dailyNewWordLimit: count });
  await saveGoal(goal);
  const words = await db.words.toArray();
  const timestamp = "2026-06-01T00:00:00.000Z";
  const progress: WordProgress[] = words.slice(0, count).map((word) => ({
    wordId: word.id,
    state: "reviewing",
    firstAssignedDate: date,
    firstLearnedDate: date,
    nextReviewDate: date,
    reviewStage: 0,
    lapseCount: 0,
    sourceBookIds: word.sourceBookIds,
    updatedAt: timestamp
  }));
  const reviews: DailyReviewAssignment[] = words.slice(0, count).map((word, index) => ({
    id: `review:${goal.id}:${date}:${word.id}:stage-0`,
    goalId: goal.id,
    date: index < 10 ? date : secondDate ?? date,
    wordId: word.id,
    reviewStage: 0,
    status: "planned",
    createdAt: timestamp,
    updatedAt: timestamp
  }));
  await db.wordProgress.bulkPut(progress);
  await db.dailyReviewAssignments.bulkPut(reviews);
  await generateAndSavePlan(goal, date, "initial", "测试复习计划", [date]);
  return { goal, today: date };
}

async function getNewAssignments(goalId: string, date?: string) {
  const assignments = await db.dailyNewAssignments.where("goalId").equals(goalId).toArray();
  return assignments
    .filter((assignment) => !date || assignment.date === date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.wordId.localeCompare(b.wordId));
}

async function getReviewAssignments(goalId: string, date?: string) {
  const assignments = await db.dailyReviewAssignments.where("goalId").equals(goalId).toArray();
  return assignments
    .filter((assignment) => !date || assignment.date === date)
    .sort((a, b) => a.date.localeCompare(b.date) || a.wordId.localeCompare(b.wordId) || a.reviewStage - b.reviewStage);
}

async function latestPlan() {
  const plan = await db.studyPlans.orderBy("version").last();
  if (!plan) {
    throw new Error("missing plan");
  }
  return plan;
}

async function latestLog() {
  const log = await db.adjustmentLogs.orderBy("createdAt").last();
  if (!log) {
    throw new Error("missing log");
  }
  return log;
}

async function countFutureRescheduledNew(goalId: string, afterDate: string, wordIds: string[]) {
  const wordSet = new Set(wordIds);
  return (await getNewAssignments(goalId)).filter(
    (assignment) => assignment.status === "rescheduled" && compareDateString(assignment.date, afterDate) > 0 && wordSet.has(assignment.wordId)
  ).length;
}

async function countFutureRescheduledReviews(goalId: string, afterDate: string, wordIds: string[]) {
  const wordSet = new Set(wordIds);
  return (await getReviewAssignments(goalId)).filter(
    (assignment) => assignment.status === "rescheduled" && compareDateString(assignment.date, afterDate) > 0 && wordSet.has(assignment.wordId)
  ).length;
}

async function snapshotCounts(goalId: string) {
  const newAssignments = await getNewAssignments(goalId);
  const reviewAssignments = await getReviewAssignments(goalId);
  const plan = await latestPlan();
  return {
    missedNew: newAssignments.filter((assignment) => assignment.status === "missed").length,
    rescheduledNew: newAssignments.filter((assignment) => assignment.status === "rescheduled").length,
    overdueReview: reviewAssignments.filter((assignment) => assignment.status === "overdue").length,
    rescheduledReview: reviewAssignments.filter((assignment) => assignment.status === "rescheduled").length,
    learningBacklogCount: plan.coverage.learningBacklogCount,
    overdueReviewCount: plan.coverage.overdueReviewCount
  };
}

function makeCsv(count: number, offset = 0) {
  return [
    "word,meaning,book_name,level,tags",
    ...Array.from({ length: count }, (_, index) => {
      const id = index + offset;
      return `word${id},测试词${id},Test Book,A1,test`;
    })
  ].join("\n");
}

function makeGoal(overrides: Partial<LearningGoal> = {}): LearningGoal {
  const startDate = overrides.startDate ?? todayDate();
  return {
    id: "goal:test",
    goalInputMode: "structured",
    interpretedGoal: "测试目标",
    targetType: "CET4",
    startDate,
    deadline: addDays(startDate, 7),
    targetRequiredCount: 10,
    dailyNewWordLimit: 10,
    dailyReviewLimit: 100,
    restWeekdays: [],
    bufferDayRatio: 0,
    planStyle: "steady",
    timezone: "Asia/Shanghai",
    selectedBookIds: ["book:test-book"],
    allowBookRecommendation: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z",
    ...overrides
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

function todayDate() {
  return "2026-06-01";
}

function compareDateString(a: string, b: string) {
  return a.localeCompare(b);
}
