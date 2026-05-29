import { describe, expect, it } from "vitest";
import { addDays, dateInTimezone } from "../src/domain/date";
import { importWordsFromCsv } from "../src/domain/importWords";
import {
  applyNewWordResult,
  applyReviewResult,
  generateWordLevelPlan
} from "../src/domain/scheduler";
import type {
  DailyNewWordAssignment,
  DailyReviewAssignment,
  GeneratedPlanResult,
  LearningGoal,
  ReviewResult,
  WordItem,
  WordProgress
} from "../src/domain/types";

describe("v0.2.0 具体单词计划闭环", () => {
  it("导入 100 个去重词后生成可追溯到 wordId 的新词任务，且不超过每日上限", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 9), targetRequiredCount: 100, dailyNewWordLimit: 12 });
    const result = makePlan(goal, makeWords(100), [], [], startDate);

    expect(result.newAssignments).toHaveLength(100);
    expect(new Set(result.newAssignments.map((assignment) => assignment.wordId)).size).toBe(100);
    expect(Math.max(...result.dailyTasks.map((task) => task.boundNewWordCount))).toBeLessThanOrEqual(12);
    expect(result.plan.coverage.inventoryGapCount).toBe(0);
  });

  it("多词书重复单词只生成一个学习对象并保留多个来源", () => {
    const csv = `word,meaning,book_name,level,tags
ability,能力,Foundation Demo,A2,noun
ability,能力,CET4 Core Demo,A2,noun;duplicate
adapt,适应,Foundation Demo,A2,verb`;
    const result = importWordsFromCsv(csv);

    expect(result.words).toHaveLength(2);
    expect(result.words.find((word) => word.normalizedWord === "ability")?.sourceBookNames).toEqual([
      "Foundation Demo",
      "CET4 Core Demo"
    ]);
  });

  it("场景一：词库 70 词、目标 300 词，学完全部可执行任务后缺口不算用户欠缺", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: startDate, targetRequiredCount: 300, dailyNewWordLimit: 300 });
    const words = makeWords(70);
    const initial = makePlan(goal, words, [], [], startDate);

    expect(initial.plan.coverage.availableWordCount).toBe(70);
    expect(initial.plan.coverage.inventoryGapCount).toBe(230);
    expect(initial.newAssignments).toHaveLength(70);

    const learned = completeNewAssignments(initial, words, "learned");
    const adjusted = makePlan(
      goal,
      words,
      learned.progress,
      learned.newAssignments,
      addDays(startDate, 1),
      learned.reviewAssignments,
      2
    );

    expect(adjusted.plan.coverage.completedWordCount).toBe(70);
    expect(adjusted.plan.coverage.learningBacklogCount).toBe(0);
    expect(adjusted.plan.coverage.inventoryGapCount).toBe(230);
    expect(adjusted.plan.adjustmentReason).toContain("词库供给缺口 230 个，不计为用户未完成");
  });

  it("场景三：导入新增 180 个去重词后补足原库存缺口并生成后续任务", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 20), targetRequiredCount: 300, dailyNewWordLimit: 30 });
    const initialWords = makeWords(70);
    const firstPlan = makePlan(goal, initialWords, [], [], startDate);
    const learned = completeNewAssignments(firstPlan, initialWords, "learned");
    const importedWords = [...initialWords, ...makeWords(180, 70)];
    const afterImport = makePlan(
      goal,
      importedWords,
      learned.progress,
      learned.newAssignments,
      addDays(startDate, 1),
      learned.reviewAssignments,
      2,
      "导入新词书新增 180 个去重词"
    );

    expect(afterImport.plan.coverage.availableWordCount).toBe(250);
    expect(afterImport.plan.coverage.inventoryGapCount).toBe(50);
    expect(afterImport.newAssignments.filter((assignment) => assignment.status === "planned")).toHaveLength(180);
    expect(afterImport.adjustmentLog.explanation).toContain("词库供给缺口 50");
  });

  it("场景二：词库足够但用户只完成 70 个时，230 个具体词进入待补学重排", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 3), targetRequiredCount: 300, dailyNewWordLimit: 300 });
    const words = makeWords(300);
    const initial = makePlan(goal, words, [], [], startDate);
    const partial = completeSomeAndMissRest(initial, words, 70);
    const adjusted = makePlan(goal, words, partial.progress, partial.newAssignments, addDays(startDate, 1), [], 2);

    expect(adjusted.plan.coverage.inventoryGapCount).toBe(0);
    expect(adjusted.plan.coverage.completedWordCount).toBe(70);
    expect(adjusted.plan.coverage.learningBacklogCount).toBe(230);
    expect(adjusted.newAssignments.filter((assignment) => assignment.status === "rescheduled")).toHaveLength(230);
  });

  it("后续容量不足时显示不可行，不删除待补学任务", () => {
    const startDate = "2026-01-01";
    const originalGoal = makeGoal({ startDate, deadline: addDays(startDate, 1), targetRequiredCount: 300, dailyNewWordLimit: 300 });
    const words = makeWords(300);
    const initial = makePlan(originalGoal, words, [], [], startDate);
    const partial = completeSomeAndMissRest(initial, words, 70);
    const restrictedGoal = { ...originalGoal, dailyNewWordLimit: 50 };
    const adjusted = makePlan(restrictedGoal, words, partial.progress, partial.newAssignments, addDays(startDate, 1), [], 2);

    expect(adjusted.plan.feasibilityStatus).toBe("infeasible");
    expect(adjusted.plan.coverage.learningBacklogCount).toBe(230);
    expect(adjusted.plan.coverage.completedWordCount).toBe(70);
  });

  it("复习反馈会生成下一次具体复习并保留历史", () => {
    const startDate = "2026-01-01";
    const goal = makeGoal({ startDate, deadline: addDays(startDate, 40), targetRequiredCount: 1, dailyNewWordLimit: 1 });
    const word = makeWords(1)[0];
    const initial = makePlan(goal, [word], [], [], startDate);
    const learned = completeNewAssignments(initial, [word], "learned");
    const review = learned.reviewAssignments[0];

    expect(review.wordId).toBe(word.id);
    expect(review.date).toBe(addDays(startDate, 1));

    const forgot = applyReviewResult({
      assignment: review,
      progress: learned.progress[0],
      result: "forgot",
      completedAt: "2026-01-02T00:00:00.000Z"
    });
    expect(forgot.nextReviewAssignment?.date).toBe(addDays(review.date, 1));
    expect(forgot.progress.lapseCount).toBe(1);
    expect(forgot.reviewRecord.result).toBe("forgot");

    const vague = applyReviewResult({ assignment: { ...review, id: "review:vague" }, progress: learned.progress[0], result: "vague" });
    const known = applyReviewResult({ assignment: { ...review, id: "review:known" }, progress: learned.progress[0], result: "known" });
    const easy = applyReviewResult({ assignment: { ...review, id: "review:easy" }, progress: learned.progress[0], result: "easy" });
    const missed = applyReviewResult({ assignment: { ...review, id: "review:missed" }, progress: learned.progress[0], result: "not_completed" });

    expect(vague.nextReviewAssignment?.date).toBe(addDays(review.date, 1));
    expect(known.nextReviewAssignment?.date).toBe(addDays(review.date, 3));
    expect(easy.nextReviewAssignment?.date).toBe(addDays(review.date, 7));
    expect(missed.assignment.status).toBe("overdue");
    expect(missed.reviewRecord.result).toBe("not_completed");
  });

  it("Asia/Tokyo 日期边界按目标时区记录到正确自然日", () => {
    expect(dateInTimezone(new Date("2026-01-01T14:59:00.000Z"), "Asia/Tokyo")).toBe("2026-01-01");
    expect(dateInTimezone(new Date("2026-01-01T15:01:00.000Z"), "Asia/Tokyo")).toBe("2026-01-02");
  });
});

function makePlan(
  goal: LearningGoal,
  words: WordItem[],
  progress: WordProgress[],
  newAssignments: DailyNewWordAssignment[],
  asOfDate: string,
  reviewAssignments: DailyReviewAssignment[] = [],
  version = 1,
  reason = "测试生成计划"
): GeneratedPlanResult {
  return generateWordLevelPlan({
    goal,
    words,
    wordProgress: progress,
    existingNewAssignments: newAssignments,
    existingReviewAssignments: reviewAssignments,
    asOfDate,
    version,
    triggerType: version === 1 ? "initial" : "manual_recalculate",
    reason
  });
}

function completeNewAssignments(
  plan: GeneratedPlanResult,
  words: WordItem[],
  result: "learned" | "mastered" | "skipped" | "missed"
): {
  progress: WordProgress[];
  newAssignments: DailyNewWordAssignment[];
  reviewAssignments: DailyReviewAssignment[];
} {
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const progressMap = new Map(plan.wordProgress.map((progress) => [progress.wordId, progress]));
  const newAssignments: DailyNewWordAssignment[] = [];
  const reviewAssignments: DailyReviewAssignment[] = [];

  plan.newAssignments.forEach((assignment) => {
    const output = applyNewWordResult({
      assignment,
      word: wordMap.get(assignment.wordId)!,
      progress: progressMap.get(assignment.wordId),
      result,
      completedAt: `${assignment.date}T00:00:00.000Z`
    });
    progressMap.set(output.progress.wordId, output.progress);
    newAssignments.push(output.assignment);
    if (output.reviewAssignment) {
      reviewAssignments.push(output.reviewAssignment);
    }
  });

  return { progress: Array.from(progressMap.values()), newAssignments, reviewAssignments };
}

function completeSomeAndMissRest(
  plan: GeneratedPlanResult,
  words: WordItem[],
  learnedCount: number
): {
  progress: WordProgress[];
  newAssignments: DailyNewWordAssignment[];
} {
  const wordMap = new Map(words.map((word) => [word.id, word]));
  const progressMap = new Map(plan.wordProgress.map((progress) => [progress.wordId, progress]));
  const newAssignments: DailyNewWordAssignment[] = [];
  plan.newAssignments.forEach((assignment, index) => {
    const output = applyNewWordResult({
      assignment,
      word: wordMap.get(assignment.wordId)!,
      progress: progressMap.get(assignment.wordId),
      result: index < learnedCount ? "learned" : "missed",
      completedAt: `${assignment.date}T00:00:00.000Z`
    });
    progressMap.set(output.progress.wordId, output.progress);
    newAssignments.push(output.assignment);
  });
  return { progress: Array.from(progressMap.values()), newAssignments };
}

function makeGoal(overrides: Partial<LearningGoal> = {}): LearningGoal {
  const timestamp = "2026-01-01T00:00:00.000Z";
  return {
    id: "goal:test",
    goalInputMode: "structured",
    interpretedGoal: "测试目标",
    targetType: "CET4",
    startDate: "2026-01-01",
    deadline: "2026-04-10",
    targetRequiredCount: 1000,
    dailyNewWordLimit: 50,
    dailyReviewLimit: 10000,
    restWeekdays: [],
    bufferDayRatio: 0,
    planStyle: "steady",
    timezone: "Asia/Shanghai",
    selectedBookIds: ["book:test"],
    allowBookRecommendation: true,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides
  };
}

function makeWords(count: number, offset = 0): WordItem[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + offset;
    return {
      id: `word:test-${id}`,
      word: `word${id}`,
      normalizedWord: `word${id}`,
      meaning: "测试词",
      sourceBookIds: ["book:test"],
      sourceBookNames: ["Test Book"],
      tags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
  });
}
