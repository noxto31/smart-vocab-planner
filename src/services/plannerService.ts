import { addDays, compareDates, getLocalTimeZone, nowIso, todayInTimezone } from "../domain/date";
import { createBackupData, parseBackupData } from "../domain/backup";
import { importWordsFromCsv, importWordsFromJson, mergeWordItems } from "../domain/importWords";
import { buildDemoGoal, buildDemoWords, DEMO_WORD_BOOKS } from "../domain/sampleData";
import {
  applyNewWordResult,
  applyReviewResult,
  computeCoverageStatus,
  generateWordLevelPlan,
  selectWordsForGoal
} from "../domain/scheduler";
import type {
  AIPlanningSuggestion,
  BackupData,
  DailyNewWordAssignment,
  DailyReviewAssignment,
  DailyTaskSummary,
  GeneratedPlanResult,
  LegacyProgressRecord,
  PlanAdjustmentLog,
  ReviewHistoryRecord,
  ReviewResult,
  StudyPlan,
  UserGoal,
  WordBook,
  WordItem,
  WordProgress
} from "../domain/types";
import { clearAllData, db } from "../storage/db";

export interface AppDataState {
  goals: UserGoal[];
  wordBooks: WordBook[];
  words: WordItem[];
  wordProgress: WordProgress[];
  studyPlans: StudyPlan[];
  dailyTasks: DailyTaskSummary[];
  dailyNewAssignments: DailyNewWordAssignment[];
  dailyReviewAssignments: DailyReviewAssignment[];
  reviewHistory: ReviewHistoryRecord[];
  legacyProgressRecords: LegacyProgressRecord[];
  adjustmentLogs: PlanAdjustmentLog[];
}

export interface ImportServiceResult {
  addedCount: number;
  duplicateCount: number;
  inventoryGapBefore: number;
  inventoryGapAfter: number;
  replenishedCount: number;
  errors: string[];
}

export async function loadAllData(): Promise<AppDataState> {
  const [
    goals,
    wordBooks,
    words,
    wordProgress,
    studyPlans,
    dailyTasks,
    dailyNewAssignments,
    dailyReviewAssignments,
    reviewHistory,
    legacyProgressRecords,
    adjustmentLogs
  ] = await Promise.all([
    db.goals.toArray(),
    db.wordBooks.toArray(),
    db.words.toArray(),
    db.wordProgress.toArray(),
    db.studyPlans.toArray(),
    db.dailyTasks.toArray(),
    db.dailyNewAssignments.toArray(),
    db.dailyReviewAssignments.toArray(),
    db.reviewHistory.toArray(),
    db.legacyProgressRecords.toArray(),
    db.adjustmentLogs.toArray()
  ]);

  return {
    goals: goals.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    wordBooks: withActualBookCounts(wordBooks, words).sort((a, b) => a.name.localeCompare(b.name)),
    words: words.sort((a, b) => a.normalizedWord.localeCompare(b.normalizedWord)),
    wordProgress: wordProgress.sort((a, b) => a.wordId.localeCompare(b.wordId)),
    studyPlans: studyPlans.sort((a, b) => b.version - a.version),
    dailyTasks: dailyTasks.sort((a, b) => compareDates(a.date, b.date)),
    dailyNewAssignments: dailyNewAssignments.sort((a, b) => compareDates(a.date, b.date) || a.wordId.localeCompare(b.wordId)),
    dailyReviewAssignments: dailyReviewAssignments.sort((a, b) => compareDates(a.date, b.date) || a.wordId.localeCompare(b.wordId)),
    reviewHistory: reviewHistory.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    legacyProgressRecords: legacyProgressRecords.sort((a, b) => compareDates(a.date, b.date)),
    adjustmentLogs: adjustmentLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export async function saveGoal(goal: UserGoal): Promise<UserGoal> {
  const updatedGoal = { ...goal, updatedAt: nowIso() };
  await db.goals.put(updatedGoal);
  return updatedGoal;
}

export async function loadDemoDataset(): Promise<ImportServiceResult> {
  const currentGoal = (await db.goals.orderBy("updatedAt").reverse().first()) ?? null;
  const beforeCoverage = currentGoal ? await getCurrentCoverage(currentGoal) : null;
  const existingWords = await db.words.toArray();
  const mergedWords = mergeWordItems(existingWords, buildDemoWords());
  await db.transaction("rw", db.wordBooks, db.words, async () => {
    await db.wordBooks.bulkPut(mergeBooks(await db.wordBooks.toArray(), DEMO_WORD_BOOKS));
    await db.words.bulkPut(mergedWords.words);
  });
  const afterCoverage = currentGoal ? await getCurrentCoverage(currentGoal) : null;
  if (currentGoal) {
    await generateAndSavePlan(
      currentGoal,
      todayInTimezone(currentGoal.timezone),
      "wordbook_import",
      `载入演示词表，新增 ${mergedWords.addedCount} 个去重词，补足 ${Math.max(0, (beforeCoverage?.inventoryGapCount ?? 0) - (afterCoverage?.inventoryGapCount ?? 0))} 个原词库缺口`
    );
  }
  return {
    addedCount: mergedWords.addedCount,
    duplicateCount: mergedWords.duplicateCount,
    inventoryGapBefore: beforeCoverage?.inventoryGapCount ?? 0,
    inventoryGapAfter: afterCoverage?.inventoryGapCount ?? 0,
    replenishedCount: Math.max(0, (beforeCoverage?.inventoryGapCount ?? 0) - (afterCoverage?.inventoryGapCount ?? 0)),
    errors: []
  };
}

export async function createDemoGoalAndPlan(): Promise<GeneratedPlanResult> {
  const words = await db.words.toArray();
  const timezone = getLocalTimeZone();
  const startDate = todayInTimezone(timezone);
  const deadline = addDays(startDate, 75);
  const goal = {
    ...buildDemoGoal(startDate, deadline, Math.max(1, Math.min(72, words.length || 72))),
    timezone
  };
  await saveGoal(goal);
  return generateAndSavePlan(goal, startDate, "initial", "载入演示目标并生成具体单词计划");
}

export async function importWordText(text: string, format: "csv" | "json"): Promise<ImportServiceResult> {
  const currentGoal = (await db.goals.orderBy("updatedAt").reverse().first()) ?? null;
  const beforeCoverage = currentGoal ? await getCurrentCoverage(currentGoal) : null;
  const existingWords = await db.words.toArray();
  const result = format === "csv" ? importWordsFromCsv(text, existingWords) : importWordsFromJson(text, existingWords);
  if (result.errors.length > 0 && result.addedCount === 0) {
    return {
      addedCount: result.addedCount,
      duplicateCount: result.duplicateCount,
      inventoryGapBefore: beforeCoverage?.inventoryGapCount ?? 0,
      inventoryGapAfter: beforeCoverage?.inventoryGapCount ?? 0,
      replenishedCount: 0,
      errors: result.errors
    };
  }

  await db.transaction("rw", db.wordBooks, db.words, async () => {
    await db.wordBooks.bulkPut(mergeBooks(await db.wordBooks.toArray(), result.books));
    await db.words.bulkPut(result.words);
  });

  const afterCoverage = currentGoal ? await getCurrentCoverage(currentGoal) : null;
  const replenishedCount = Math.max(0, (beforeCoverage?.inventoryGapCount ?? 0) - (afterCoverage?.inventoryGapCount ?? 0));
  if (currentGoal) {
    await generateAndSavePlan(
      currentGoal,
      todayInTimezone(currentGoal.timezone),
      "wordbook_import",
      `导入词表新增 ${result.addedCount} 个去重词，重复 ${result.duplicateCount} 个，补足 ${replenishedCount} 个原词库缺口，剩余缺口 ${afterCoverage?.inventoryGapCount ?? 0} 个`
    );
  }

  return {
    addedCount: result.addedCount,
    duplicateCount: result.duplicateCount,
    inventoryGapBefore: beforeCoverage?.inventoryGapCount ?? 0,
    inventoryGapAfter: afterCoverage?.inventoryGapCount ?? 0,
    replenishedCount,
    errors: result.errors
  };
}

export async function generateAndSavePlan(
  goal: UserGoal,
  asOfDate: string,
  triggerType: Parameters<typeof generateWordLevelPlan>[0]["triggerType"],
  reason: string
): Promise<GeneratedPlanResult> {
  const [words, wordProgress, existingNewAssignments, existingReviewAssignments, existingDailyTasks, existingPlans] =
    await Promise.all([
      db.words.toArray(),
      db.wordProgress.toArray(),
      db.dailyNewAssignments.where("goalId").equals(goal.id).toArray(),
      db.dailyReviewAssignments.where("goalId").equals(goal.id).toArray(),
      db.dailyTasks.where("goalId").equals(goal.id).toArray(),
      db.studyPlans.where("goalId").equals(goal.id).toArray()
    ]);
  const selectedWords = selectWordsForGoal(words, goal, wordProgress);
  const beforeSnapshot = computeCoverageStatus(
    goal,
    selectedWords,
    wordProgress,
    existingNewAssignments,
    existingReviewAssignments,
    asOfDate
  );
  const nextVersion = existingPlans.reduce((max, plan) => Math.max(max, plan.version), 0) + 1;
  const result = generateWordLevelPlan({
    goal,
    words,
    wordProgress,
    existingNewAssignments,
    existingReviewAssignments,
    existingDailyTasks,
    asOfDate,
    version: nextVersion,
    triggerType,
    reason,
    beforeSnapshot
  });

  await db.transaction(
    "rw",
    [db.studyPlans, db.dailyTasks, db.dailyNewAssignments, db.dailyReviewAssignments, db.wordProgress, db.adjustmentLogs],
    async () => {
      await Promise.all([
        db.studyPlans.put(result.plan),
        replaceByGoal(db.dailyTasks, goal.id, result.dailyTasks),
        replaceByGoal(db.dailyNewAssignments, goal.id, result.newAssignments),
        replaceByGoal(db.dailyReviewAssignments, goal.id, result.reviewAssignments),
        db.wordProgress.bulkPut(result.wordProgress),
        db.adjustmentLogs.put(result.adjustmentLog)
      ]);
    }
  );

  return result;
}

export async function recordNewWordAssignmentResult(input: {
  assignmentId: string;
  result: "learned" | "mastered" | "skipped" | "missed";
}): Promise<void> {
  const assignment = await db.dailyNewAssignments.get(input.assignmentId);
  if (!assignment) {
    throw new Error("找不到新词任务");
  }
  const word = await db.words.get(assignment.wordId);
  if (!word) {
    throw new Error("找不到任务对应的单词");
  }
  const progress = await db.wordProgress.get(assignment.wordId);
  const output = applyNewWordResult({ assignment, word, progress, result: input.result });
  await db.transaction("rw", db.dailyNewAssignments, db.dailyReviewAssignments, db.wordProgress, async () => {
    await db.dailyNewAssignments.put(output.assignment);
    await db.wordProgress.put(output.progress);
    if (output.reviewAssignment) {
      await db.dailyReviewAssignments.put(output.reviewAssignment);
    }
  });
  const goal = await db.goals.get(assignment.goalId);
  if (goal) {
    await generateAndSavePlan(
      goal,
      addDays(assignment.date, 1),
      "daily_learning_result",
      `记录 ${assignment.date} 新词任务结果：${input.result}`
    );
  }
}

export async function recordReviewAssignmentResult(input: {
  assignmentId: string;
  result: ReviewResult;
}): Promise<void> {
  const assignment = await db.dailyReviewAssignments.get(input.assignmentId);
  if (!assignment) {
    throw new Error("找不到复习任务");
  }
  const progress = await db.wordProgress.get(assignment.wordId);
  if (!progress) {
    throw new Error("找不到复习词的学习状态");
  }
  const output = applyReviewResult({ assignment, progress, result: input.result });
  await db.transaction("rw", db.dailyReviewAssignments, db.wordProgress, db.reviewHistory, async () => {
    await db.dailyReviewAssignments.put(output.assignment);
    await db.wordProgress.put(output.progress);
    await db.reviewHistory.put(output.reviewRecord);
    if (output.nextReviewAssignment) {
      await db.dailyReviewAssignments.put(output.nextReviewAssignment);
    }
  });
  const goal = await db.goals.get(assignment.goalId);
  if (goal) {
    await generateAndSavePlan(
      goal,
      input.result === "not_completed" ? addDays(assignment.date, 1) : assignment.date,
      "daily_review_result",
      `记录 ${assignment.date} 复习结果：${input.result}`
    );
  }
}

export async function analyzeNaturalLanguageGoal(text: string): Promise<AIPlanningSuggestion> {
  const lower = text.toLowerCase();
  const isIelts = text.includes("雅思") || lower.includes("ielts");
  const isCet6 = text.includes("六级") || lower.includes("cet6");
  const isCet4 = text.includes("四级") || lower.includes("cet4");
  const targetType = isIelts ? "IELTS" : isCet6 ? "CET6" : isCet4 ? "CET4" : "CUSTOM";
  const suggestedTargetWordCount = isIelts ? 1200 : isCet6 ? 900 : isCet4 ? 650 : 500;
  return {
    interpretedGoal: text.trim() || "希望建立一个可持续的词汇学习计划",
    targetType,
    suggestedTargetWordCount,
    suggestedStages: [
      { name: "基础补齐", purpose: "先补足高频基础词和薄弱词", suggestedWordCount: Math.round(suggestedTargetWordCount * 0.35) },
      { name: "目标强化", purpose: "学习目标考试或用途的核心词", suggestedWordCount: Math.round(suggestedTargetWordCount * 0.45) },
      { name: "复习冲刺", purpose: "降低新词压力，集中处理复习和欠缺任务", suggestedWordCount: Math.round(suggestedTargetWordCount * 0.2) }
    ],
    recommendedBookCategories: [
      { name: "基础高频词", role: "补基础", reason: "用于降低目标词书直接学习的门槛" },
      { name: `${targetType} 核心词`, role: "主词书", reason: "与当前目标最直接相关，导入后可生成真实任务" }
    ],
    explanation: "当前版本使用本地 mock 解析目标，不调用真实 AI API。建议应用前仍会经过本地目标和容量校验。"
  };
}

export async function exportBackup(): Promise<BackupData> {
  const data = await loadAllData();
  return createBackupData({
    goals: data.goals,
    wordBooks: data.wordBooks,
    words: data.words,
    wordProgress: data.wordProgress,
    studyPlans: data.studyPlans,
    dailyTasks: data.dailyTasks,
    dailyNewAssignments: data.dailyNewAssignments,
    dailyReviewAssignments: data.dailyReviewAssignments,
    reviewHistory: data.reviewHistory,
    legacyProgressRecords: data.legacyProgressRecords,
    adjustmentLogs: data.adjustmentLogs
  });
}

export async function importBackup(text: string): Promise<BackupData> {
  const backup = parseBackupData(text);
  await clearAllData();
  await db.transaction(
    "rw",
    [
      db.goals,
      db.wordBooks,
      db.words,
      db.wordProgress,
      db.studyPlans,
      db.dailyTasks,
      db.dailyNewAssignments,
      db.dailyReviewAssignments,
      db.reviewHistory,
      db.legacyProgressRecords,
      db.adjustmentLogs
    ],
    async () => {
      await Promise.all([
        db.goals.bulkPut(backup.goals),
        db.wordBooks.bulkPut(backup.wordBooks),
        db.words.bulkPut(backup.words),
        db.wordProgress.bulkPut(backup.wordProgress),
        db.studyPlans.bulkPut(backup.studyPlans),
        db.dailyTasks.bulkPut(backup.dailyTasks),
        db.dailyNewAssignments.bulkPut(backup.dailyNewAssignments),
        db.dailyReviewAssignments.bulkPut(backup.dailyReviewAssignments),
        db.reviewHistory.bulkPut(backup.reviewHistory),
        db.legacyProgressRecords.bulkPut(backup.legacyProgressRecords),
        db.adjustmentLogs.bulkPut(backup.adjustmentLogs)
      ]);
    }
  );
  return backup;
}

export async function resetAllData(): Promise<void> {
  await clearAllData();
}

async function getCurrentCoverage(goal: UserGoal) {
  const [words, progress, newAssignments, reviewAssignments] = await Promise.all([
    db.words.toArray(),
    db.wordProgress.toArray(),
    db.dailyNewAssignments.where("goalId").equals(goal.id).toArray(),
    db.dailyReviewAssignments.where("goalId").equals(goal.id).toArray()
  ]);
  return computeCoverageStatus(
    goal,
    selectWordsForGoal(words, goal, progress),
    progress,
    newAssignments,
    reviewAssignments,
    todayInTimezone(goal.timezone)
  );
}

async function replaceByGoal<T extends { goalId: string }>(table: { where: (field: string) => { equals: (value: string) => { primaryKeys: () => Promise<string[]> } }; bulkDelete: (keys: string[]) => Promise<unknown>; bulkPut: (items: T[]) => Promise<unknown> }, goalId: string, items: T[]) {
  const keys = await table.where("goalId").equals(goalId).primaryKeys();
  if (keys.length > 0) {
    await table.bulkDelete(keys);
  }
  if (items.length > 0) {
    await table.bulkPut(items);
  }
}

function mergeBooks(existingBooks: WordBook[], incomingBooks: WordBook[]): WordBook[] {
  const byId = new Map(existingBooks.map((book) => [book.id, book]));
  incomingBooks.forEach((book) => {
    byId.set(book.id, {
      ...(byId.get(book.id) ?? book),
      ...book,
      hasImportedWords: book.hasImportedWords || byId.get(book.id)?.hasImportedWords || false,
      importedAt: book.hasImportedWords ? nowIso() : byId.get(book.id)?.importedAt
    });
  });
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function withActualBookCounts(books: WordBook[], words: WordItem[]): WordBook[] {
  return books.map((book) => ({
    ...book,
    actualWordCount: words.filter((word) => word.sourceBookIds.includes(book.id)).length
  }));
}
