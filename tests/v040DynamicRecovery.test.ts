import { describe, expect, it } from "vitest";
import { addDays } from "../src/domain/date";
import {
  applyNewWordResult,
  generateWordLevelPlan
} from "../src/domain/scheduler";
import type {
  DailyNewWordAssignment,
  DailyReviewAssignment,
  GeneratedPlanResult,
  LearningGoal,
  WordItem,
  WordProgress
} from "../src/domain/types";

describe("v0.4.0 动态进度恢复", () => {
  it("漏学一天后把待补学平滑分摊到剩余 9 天", () => {
    const startDate = "2026-06-01";
    const deadline = addDays(startDate, 9);
    const goal = makeGoal({ startDate, deadline, targetRequiredCount: 1000, dailyNewWordLimit: 200 });
    const words = makeWords(1000);
    const initial = makePlan(goal, words, [], [], [], startDate);

    expect(countsByDate(initial.dailyTasks).map((task) => task.newCount)).toEqual(Array(10).fill(100));

    const missedDay = finishFirstDay(initial, words, 0);
    const adjusted = makePlan(goal, words, missedDay.progress, missedDay.newAssignments, [], addDays(startDate, 1), 2);
    const futureCounts = adjusted.dailyTasks
      .filter((task) => task.date >= addDays(startDate, 1))
      .map((task) => task.boundNewWordCount);

    expect(adjusted.plan.coverage.learningBacklogCount).toBe(100);
    expect(Math.min(...futureCounts)).toBe(111);
    expect(Math.max(...futureCounts)).toBe(112);
    expect(futureCounts[0]).not.toBe(200);
    expect(adjusted.plan.coverage.targetRequiredCount).toBe(1000);
    expect(goal.deadline).toBe(deadline);
  });

  it("少完成一部分后只小幅增加后续学习日", () => {
    const startDate = "2026-06-01";
    const goal = makeGoal({
      startDate,
      deadline: addDays(startDate, 9),
      targetRequiredCount: 1000,
      dailyNewWordLimit: 200
    });
    const words = makeWords(1000);
    const initial = makePlan(goal, words, [], [], [], startDate);
    const partial = finishFirstDay(initial, words, 60);
    const adjusted = makePlan(goal, words, partial.progress, partial.newAssignments, [], addDays(startDate, 1), 2);
    const futureCounts = adjusted.dailyTasks
      .filter((task) => task.date >= addDays(startDate, 1))
      .map((task) => task.boundNewWordCount);

    expect(adjusted.plan.coverage.learningBacklogCount).toBe(40);
    expect(Math.min(...futureCounts)).toBeGreaterThanOrEqual(104);
    expect(Math.max(...futureCounts)).toBeLessThanOrEqual(105);
    expect(futureCounts[0]).not.toBe(140);
    expect(Math.max(...futureCounts) - Math.min(...futureCounts)).toBeLessThanOrEqual(1);
  });

  it("待补学优先避开复习高峰日", () => {
    const startDate = "2026-06-02";
    const highReviewDate = addDays(startDate, 2);
    const goal = makeGoal({
      startDate,
      deadline: addDays(startDate, 4),
      targetRequiredCount: 100,
      dailyNewWordLimit: 40,
      dailyReviewLimit: 120
    });
    const words = makeWords(100);
    const missedAssignments = words.map((word): DailyNewWordAssignment => ({
      id: `new:${goal.id}:2026-06-01:${word.id}`,
      goalId: goal.id,
      date: "2026-06-01",
      wordId: word.id,
      status: "missed",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    }));
    const progress = words.map((word): WordProgress => ({
      wordId: word.id,
      state: "learning_backlog",
      firstAssignedDate: "2026-06-01",
      lapseCount: 0,
      sourceBookIds: word.sourceBookIds,
      updatedAt: "2026-06-01T00:00:00.000Z"
    }));
    const highReviews = Array.from({ length: 110 }, (_, index): DailyReviewAssignment => ({
      id: `review:${goal.id}:${highReviewDate}:word:review-${index}:stage-0`,
      goalId: goal.id,
      date: highReviewDate,
      wordId: `word:review-${index}`,
      reviewStage: 0,
      status: "planned",
      createdAt: "2026-06-01T00:00:00.000Z",
      updatedAt: "2026-06-01T00:00:00.000Z"
    }));

    const adjusted = makePlan(goal, words, progress, missedAssignments, highReviews, startDate);
    const highDay = adjusted.dailyTasks.find((task) => task.date === highReviewDate);
    const lowDayMax = Math.max(
      ...adjusted.dailyTasks
        .filter((task) => task.date !== highReviewDate)
        .map((task) => task.catchUpNewWordCount ?? 0)
    );

    expect(highDay?.plannedReviewCount).toBe(110);
    expect(highDay?.catchUpNewWordCount ?? 0).toBeLessThan(lowDayMax);
    expect(highDay?.capacityStatus).toBe("near_limit");
  });

  it("每日新词上限不足时显示无法按期完成", () => {
    const startDate = "2026-06-01";
    const goal = makeGoal({
      startDate,
      deadline: addDays(startDate, 8),
      targetRequiredCount: 1000,
      dailyNewWordLimit: 105
    });
    const adjusted = makePlan(goal, makeWords(1000), [], [], [], startDate);

    expect(adjusted.plan.feasibilityStatus).toBe("infeasible");
    expect(adjusted.plan.requiredDailyAverage).toBe(112);
    expect(adjusted.plan.dailyLimitGap).toBe(7);
    expect(adjusted.plan.newWordOverflowCount).toBe(55);
    expect(adjusted.plan.coverage.targetRequiredCount).toBe(1000);
    expect(goal.deadline).toBe(addDays(startDate, 8));
    expect(adjusted.plan.adjustmentReason).toContain("至少需要每天 112 个新词");
    expect(adjusted.plan.adjustmentReason).toContain("当前每日新词上限 105 个");
  });
});

function makePlan(
  goal: LearningGoal,
  words: WordItem[],
  progress: WordProgress[],
  newAssignments: DailyNewWordAssignment[],
  reviewAssignments: DailyReviewAssignment[],
  asOfDate: string,
  version = 1
): GeneratedPlanResult {
  return generateWordLevelPlan({
    goal,
    words,
    wordProgress: progress,
    existingNewAssignments: newAssignments,
    existingReviewAssignments: reviewAssignments,
    asOfDate,
    version,
    triggerType: version === 1 ? "initial" : "daily_settlement",
    reason: "测试动态恢复"
  });
}

function finishFirstDay(
  plan: GeneratedPlanResult,
  words: WordItem[],
  learnedCount: number
): {
  progress: WordProgress[];
  newAssignments: DailyNewWordAssignment[];
} {
  const firstDate = plan.dailyTasks[0].date;
  const firstDayAssignments = plan.newAssignments.filter((assignment) => assignment.date === firstDate);
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const progressMap = new Map(plan.wordProgress.map((progress) => [progress.wordId, progress]));
  const completed = new Set(firstDayAssignments.slice(0, learnedCount).map((assignment) => assignment.id));
  const updatedFirstDay = firstDayAssignments.map((assignment) => {
    const output = applyNewWordResult({
      assignment,
      word: wordMap.get(assignment.wordId)!,
      progress: progressMap.get(assignment.wordId),
      result: completed.has(assignment.id) ? "learned" : "missed",
      completedAt: `${firstDate}T00:00:00.000Z`
    });
    progressMap.set(output.progress.wordId, output.progress);
    return output.assignment;
  });

  return {
    progress: Array.from(progressMap.values()),
    newAssignments: [
      ...updatedFirstDay,
      ...plan.newAssignments.filter((assignment) => assignment.date !== firstDate)
    ]
  };
}

function countsByDate(tasks: GeneratedPlanResult["dailyTasks"]) {
  return tasks.map((task) => ({ date: task.date, newCount: task.boundNewWordCount }));
}

function makeGoal(overrides: Partial<LearningGoal> = {}): LearningGoal {
  const timestamp = "2026-06-01T00:00:00.000Z";
  return {
    id: "goal:v040",
    goalInputMode: "structured",
    interpretedGoal: "v0.4.0 测试目标",
    targetType: "CUSTOM",
    startDate: "2026-06-01",
    deadline: "2026-06-10",
    targetRequiredCount: 1000,
    dailyNewWordLimit: 200,
    dailyReviewLimit: 120,
    restWeekdays: [],
    bufferDayRatio: 0,
    planStyle: "steady",
    timezone: "Asia/Shanghai",
    selectedBookIds: ["book:v040"],
    allowBookRecommendation: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function makeWords(count: number): WordItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `word:v040-${index}`,
    word: `word${index}`,
    normalizedWord: `word${index.toString().padStart(4, "0")}`,
    meaning: "测试词",
    sourceBookIds: ["book:v040"],
    sourceBookNames: ["v0.4.0 Test Book"],
    tags: [],
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  }));
}
