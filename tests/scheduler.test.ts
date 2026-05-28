import { describe, expect, it } from "vitest";
import { addDays } from "../src/domain/date";
import {
  applyProgressToDailyTask,
  createProgressRecord,
  generateStudyPlan
} from "../src/domain/scheduler";
import type { DailyTask, ProgressRecord, UserGoal, Weekday, WordItem } from "../src/domain/types";

describe("计划生成算法", () => {
  it("正常生成长期、月度、周度和每日计划", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 99), targetVocabularyCount: 1000, dailyNewWordLimit: 50 });
    const result = generateStudyPlan({
      goal,
      words: makeWords(1000),
      progressRecords: [],
      existingTasks: [],
      asOfDate: startDate,
      version: 1,
      triggerType: "initial",
      reason: "测试初始生成"
    });

    expect(result.plan.feasibilityStatus).toBe("feasible");
    expect(result.dailyTasks).toHaveLength(100);
    expect(result.monthlyPlans.length).toBeGreaterThan(0);
    expect(result.weeklyPlans.length).toBeGreaterThan(0);
    expect(result.longTerm.totalTargetWords).toBe(1000);
    expect(result.dailyTasks.every((task) => task.plannedNewWordCount === 10)).toBe(true);
  });

  it("休息日不安排新学任务", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({
      startDate,
      deadline: addDays(startDate, 13),
      targetVocabularyCount: 60,
      dailyNewWordLimit: 20,
      restWeekdays: [0, 6]
    });
    const result = generateStudyPlan({
      goal,
      words: makeWords(60),
      progressRecords: [],
      existingTasks: [],
      asOfDate: startDate,
      version: 1,
      triggerType: "initial",
      reason: "测试休息日"
    });

    const restTasks = result.dailyTasks.filter((task) => task.isRestDay);
    expect(restTasks.length).toBeGreaterThan(0);
    expect(restTasks.every((task) => task.plannedNewWordCount === 0 && task.plannedReviewCount === 0)).toBe(true);
  });

  it("存在缓冲日时，容量允许的情况下主要新学任务不占满全部日期", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({
      startDate,
      deadline: addDays(startDate, 29),
      targetVocabularyCount: 120,
      dailyNewWordLimit: 20,
      bufferDayRatio: 0.2
    });
    const result = generateStudyPlan({
      goal,
      words: makeWords(120),
      progressRecords: [],
      existingTasks: [],
      asOfDate: startDate,
      version: 1,
      triggerType: "initial",
      reason: "测试缓冲日"
    });

    const bufferTasks = result.dailyTasks.filter((task) => task.isBufferDay && !task.isRestDay);
    expect(bufferTasks.length).toBeGreaterThan(0);
    expect(bufferTasks.every((task) => task.plannedNewWordCount === 0)).toBe(true);
  });

  it("少完成 20 个单词后，欠缺量进入后续重排", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 9), targetVocabularyCount: 500, dailyNewWordLimit: 100 });
    const initial = generateStudyPlan({
      goal,
      words: makeWords(500),
      progressRecords: [],
      existingTasks: [],
      asOfDate: startDate,
      version: 1,
      triggerType: "initial",
      reason: "初始"
    });
    const record = makeRecord(goal.id, startDate, 30);
    const updatedTask = applyProgressToDailyTask(initial.dailyTasks[0], record);
    const adjusted = replan(goal, [record], [updatedTask], addDays(startDate, 1), 2);

    expect(updatedTask.missedNewWordCount).toBe(20);
    expect(adjusted.plan.remainingNewWords).toBe(470);
    expect(sumFutureNew(adjusted.dailyTasks, addDays(startDate, 1))).toBe(470);
    expect(adjusted.dailyTasks.find((task) => task.date === addDays(startDate, 1))?.plannedNewWordCount).toBeGreaterThan(50);
  });

  it("超额完成 15 个单词后，剩余总量减少 15 个", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 9), targetVocabularyCount: 500, dailyNewWordLimit: 100 });
    const initial = replan(goal, [], [], startDate, 1);
    const record = makeRecord(goal.id, startDate, 65);
    const updatedTask = applyProgressToDailyTask(initial.dailyTasks[0], record);
    const adjusted = replan(goal, [record], [updatedTask], addDays(startDate, 1), 2);

    expect(updatedTask.missedNewWordCount).toBe(0);
    expect(adjusted.plan.remainingNewWords).toBe(435);
    expect(sumFutureNew(adjusted.dailyTasks, addDays(startDate, 1))).toBe(435);
  });

  it("连续三天未完成时，不允许总目标被静默缩减", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 9), targetVocabularyCount: 300, dailyNewWordLimit: 60 });
    const initial = replan(goal, [], [], startDate, 1);
    const records: ProgressRecord[] = [];
    const historicalTasks: DailyTask[] = [];

    for (let index = 0; index < 3; index += 1) {
      const date = addDays(startDate, index);
      const record = makeRecord(goal.id, date, 0);
      const task = initial.dailyTasks.find((item) => item.date === date)!;
      records.push(record);
      historicalTasks.push(applyProgressToDailyTask(task, record));
    }

    const adjusted = replan(goal, records, historicalTasks, addDays(startDate, 3), 2);
    expect(goal.targetVocabularyCount).toBe(300);
    expect(adjusted.plan.remainingNewWords).toBe(300);
    expect(adjusted.dailyTasks.filter((task) => task.date < addDays(startDate, 3)).reduce((sum, task) => sum + task.missedNewWordCount, 0)).toBe(90);
  });

  it("剩余学习天数不足时，系统判定不可行并显示最低每日新学量", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 9), targetVocabularyCount: 1000, dailyNewWordLimit: 50 });
    const result = replan(goal, [], [], startDate, 1);

    expect(result.plan.feasibilityStatus).toBe("infeasible");
    expect(result.plan.requiredDailyAverage).toBe(100);
    expect(result.plan.dailyLimitGap).toBe(50);
    expect(result.plan.adjustmentReason).toContain("按现有限制无法完成");
  });

  it("每日新学上限生效", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 9), targetVocabularyCount: 600, dailyNewWordLimit: 50 });
    const result = replan(goal, [], [], startDate, 1);

    expect(Math.max(...result.dailyTasks.map((task) => task.plannedNewWordCount))).toBe(50);
  });
});

function replan(goal: UserGoal, records: ProgressRecord[], tasks: DailyTask[], asOfDate: string, version: number) {
  return generateStudyPlan({
    goal,
    words: makeWords(goal.targetVocabularyCount),
    progressRecords: records,
    existingTasks: tasks,
    asOfDate,
    version,
    triggerType: version === 1 ? "initial" : "dailyRecord",
    reason: "测试重排"
  });
}

function makeGoal(overrides: Partial<UserGoal> = {}): UserGoal {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return {
    id: "goal:test",
    targetType: "CET4",
    targetDescription: "测试目标",
    startDate: "2026-01-01",
    deadline: "2026-04-10",
    targetVocabularyCount: 1000,
    currentEstimatedVocabulary: 1000,
    dailyNewWordLimit: 50,
    dailyReviewLimit: 10000,
    studyDaysPerWeek: 7,
    restWeekdays: [],
    bufferDayRatio: 0,
    planStyle: "steady",
    selectedBookIds: ["book:test"],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function makeWords(count: number): WordItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `word:test-${index}`,
    word: `word${index}`,
    normalizedWord: `word${index}`,
    meaning: "测试词",
    sourceBookIds: ["book:test"],
    sourceBookNames: ["Test Book"],
    tags: [],
    status: "new",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }));
}

function makeRecord(goalId: string, date: string, newWordsCompleted: number): ProgressRecord {
  return createProgressRecord({
    goalId,
    date,
    newWordsCompleted,
    reviewsCompleted: 0,
    minutesSpent: 30,
    note: ""
  });
}

function sumFutureNew(tasks: DailyTask[], fromDate: string): number {
  return tasks
    .filter((task) => task.date >= fromDate)
    .reduce((sum, task) => sum + task.plannedNewWordCount, 0);
}
