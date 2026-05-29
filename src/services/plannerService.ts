import { addDays, compareDates, getLocalTimeZone, nowIso, todayInTimezone } from "../domain/date";
import { createBackupData, parseBackupData } from "../domain/backup";
import { buildLocalPlanningAdvice } from "../domain/aiPlanning";
import { importWordsFromCsv, importWordsFromJson, mergeWordItems } from "../domain/importWords";
import { buildDemoGoal, buildDemoWords, DEMO_WORD_BOOKS } from "../domain/sampleData";
import {
  applyNewWordResult,
  applyReviewResult,
  computeCoverageStatus,
  generateWordLevelPlan,
  selectAvailableWords,
  selectWordsForGoal
} from "../domain/scheduler";
import type {
  AIPlanningSuggestion,
  AIAdviceApplicationRecord,
  AIPlanningAdvice,
  BackupData,
  DailySettlementRecord,
  DailyNewWordAssignment,
  DailyReviewAssignment,
  DailyTaskSummary,
  GeneratedPlanResult,
  GoalVersionRecord,
  LegacyProgressRecord,
  MonthlyReviewRecord,
  PlanAdjustmentLog,
  ReviewHistoryRecord,
  ReviewResult,
  StagePlan,
  StudyPlan,
  UserGoal,
  WeeklyReviewRecord,
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
  goalVersions: GoalVersionRecord[];
  stagePlans: StagePlan[];
  dailySettlements: DailySettlementRecord[];
  weeklyReviews: WeeklyReviewRecord[];
  monthlyReviews: MonthlyReviewRecord[];
  aiPlanningAdvices: AIPlanningAdvice[];
  aiAdviceApplications: AIAdviceApplicationRecord[];
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

export interface DailySettlementResult {
  date: string;
  settledNewWordCount: number;
  settledReviewCount: number;
  replanned: boolean;
}

export async function loadAllData(): Promise<AppDataState> {
  await settlePastOpenTasks();
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
    goalVersions,
    stagePlans,
    dailySettlements,
    weeklyReviews,
    monthlyReviews,
    aiPlanningAdvices,
    aiAdviceApplications,
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
    db.goalVersions.toArray(),
    db.stagePlans.toArray(),
    db.dailySettlements.toArray(),
    db.weeklyReviews.toArray(),
    db.monthlyReviews.toArray(),
    db.aiPlanningAdvices.toArray(),
    db.aiAdviceApplications.toArray(),
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
    goalVersions: goalVersions.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    stagePlans: stagePlans.sort((a, b) => compareDates(a.startDate, b.startDate)),
    dailySettlements: dailySettlements.sort((a, b) => compareDates(a.date, b.date)),
    weeklyReviews: weeklyReviews.sort((a, b) => compareDates(a.weekStart, b.weekStart)),
    monthlyReviews: monthlyReviews.sort((a, b) => a.month.localeCompare(b.month)),
    aiPlanningAdvices: aiPlanningAdvices.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    aiAdviceApplications: aiAdviceApplications.sort((a, b) => b.appliedAt.localeCompare(a.appliedAt)),
    legacyProgressRecords: legacyProgressRecords.sort((a, b) => compareDates(a.date, b.date)),
    adjustmentLogs: adjustmentLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export async function saveGoal(goal: UserGoal, options: { appliedAdviceId?: string } = {}): Promise<UserGoal> {
  const previous = await db.goals.get(goal.id);
  const updatedGoal = { ...goal, updatedAt: nowIso() };
  const version = await buildGoalVersionRecord(previous ?? null, updatedGoal, previous ? "用户修改目标或计划参数" : "创建执行目标");
  const goalWithVersion = { ...updatedGoal, activeGoalVersionId: version.id };
  version.confirmedGoal = goalWithVersion;
  const adviceApplication = await buildAdviceApplicationRecord(options.appliedAdviceId, previous ?? null, goalWithVersion);
  await db.transaction("rw", db.goals, db.goalVersions, db.aiAdviceApplications, async () => {
    await db.goals.put(goalWithVersion);
    await db.goalVersions.put(version);
    if (adviceApplication) {
      await db.aiAdviceApplications.put(adviceApplication);
    }
  });
  return goalWithVersion;
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
  const savedGoal = await saveGoal(goal);
  return generateAndSavePlan(savedGoal, startDate, "initial", "载入演示目标并生成具体单词计划");
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
  reason: string,
  preserveOpenDates: string[] = []
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
  const availableWords = selectAvailableWords(words, wordProgress);
  const beforeSnapshot = computeCoverageStatus(
    goal,
    availableWords,
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
    beforeSnapshot,
    preserveOpenDates
  });

  await db.transaction(
    "rw",
    [
      db.studyPlans,
      db.dailyTasks,
      db.dailyNewAssignments,
      db.dailyReviewAssignments,
      db.wordProgress,
      db.stagePlans,
      db.weeklyReviews,
      db.monthlyReviews,
      db.adjustmentLogs
    ],
    async () => {
      await Promise.all([
        db.studyPlans.put(result.plan),
        replaceByGoal(db.dailyTasks, goal.id, result.dailyTasks),
        replaceByGoal(db.dailyNewAssignments, goal.id, result.newAssignments),
        replaceByGoal(db.dailyReviewAssignments, goal.id, result.reviewAssignments),
        db.wordProgress.bulkPut(result.wordProgress),
        replaceByGoal(db.stagePlans, goal.id, result.stagePlans),
        replaceByGoal(db.weeklyReviews, goal.id, result.weeklyReviewRecords),
        replaceByGoal(db.monthlyReviews, goal.id, result.monthlyReviewRecords),
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
      `记录 ${assignment.date} 单个新词任务结果：${input.result}，同日其他未处理任务保持开放`,
      [assignment.date]
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
      `记录 ${assignment.date} 单个复习任务结果：${input.result}，同日其他未处理复习保持开放`,
      [assignment.date]
    );
  }
}

export async function settleDailyTasks(input: {
  goalId: string;
  date: string;
  mode: "manual" | "auto";
}): Promise<DailySettlementResult> {
  const goal = await db.goals.get(input.goalId);
  if (!goal) {
    throw new Error("找不到要结算的目标");
  }
  const [openNewAssignments, openReviewAssignments] = await Promise.all([
    db.dailyNewAssignments
      .where("goalId")
      .equals(input.goalId)
      .toArray()
      .then((items) => items.filter((assignment) => assignment.date === input.date && isOpenNewAssignment(assignment.status))),
    db.dailyReviewAssignments
      .where("goalId")
      .equals(input.goalId)
      .toArray()
      .then((items) => items.filter((assignment) => assignment.date === input.date && isOpenReviewAssignment(assignment.status)))
  ]);

  if (openNewAssignments.length === 0 && openReviewAssignments.length === 0) {
    return {
      date: input.date,
      settledNewWordCount: 0,
      settledReviewCount: 0,
      replanned: false
    };
  }

  const wordsById = new Map((await db.words.toArray()).map((word) => [word.id, word]));
  const progressByWord = new Map((await db.wordProgress.toArray()).map((progress) => [progress.wordId, progress]));
  const newOutputs = openNewAssignments.map((assignment) => {
    const word = wordsById.get(assignment.wordId);
    if (!word) {
      throw new Error(`找不到要结算的新词：${assignment.wordId}`);
    }
    return applyNewWordResult({
      assignment,
      word,
      progress: progressByWord.get(assignment.wordId),
      result: "missed"
    });
  });
  newOutputs.forEach((output) => progressByWord.set(output.progress.wordId, output.progress));
  const reviewOutputs = openReviewAssignments.map((assignment) => {
    const progress = progressByWord.get(assignment.wordId);
    if (!progress) {
      throw new Error(`找不到要结算的复习词状态：${assignment.wordId}`);
    }
    return applyReviewResult({
      assignment,
      progress,
      result: "not_completed"
    });
  });

  await db.transaction("rw", [db.dailyNewAssignments, db.dailyReviewAssignments, db.wordProgress, db.reviewHistory, db.dailySettlements], async () => {
    await Promise.all([
      db.dailyNewAssignments.bulkPut(newOutputs.map((output) => output.assignment)),
      db.dailyReviewAssignments.bulkPut(reviewOutputs.map((output) => output.assignment)),
      db.wordProgress.bulkPut([
        ...newOutputs.map((output) => output.progress),
        ...reviewOutputs.map((output) => output.progress)
      ]),
      reviewOutputs.length > 0 ? db.reviewHistory.bulkPut(reviewOutputs.map((output) => output.reviewRecord)) : Promise.resolve()
    ]);
  });

  await generateAndSavePlan(
    goal,
    addDays(input.date, 1),
    input.mode === "manual" ? "daily_settlement" : "past_due_auto_settlement",
    input.mode === "manual"
      ? `用户主动结算 ${input.date}：${openNewAssignments.length} 个新词转入待补学，${openReviewAssignments.length} 个复习转为逾期`
      : `系统跨日自动结算 ${input.date}：${openNewAssignments.length} 个历史新词转入待补学，${openReviewAssignments.length} 个历史复习转为逾期`,
    input.mode === "auto" ? [addDays(input.date, 1)] : []
  );

  const result = {
    date: input.date,
    settledNewWordCount: openNewAssignments.length,
    settledReviewCount: openReviewAssignments.length,
    replanned: true
  };
  await db.dailySettlements.put({
    id: `settlement:${input.goalId}:${input.date}:${input.mode}`,
    goalId: input.goalId,
    date: input.date,
    mode: input.mode,
    settledNewWordCount: result.settledNewWordCount,
    settledReviewCount: result.settledReviewCount,
    replanned: result.replanned,
    createdAt: nowIso()
  });
  return result;
}

export async function settlePastOpenTasks(input: {
  goalId?: string;
  today?: string;
} = {}): Promise<DailySettlementResult[]> {
  const goals = input.goalId ? [await db.goals.get(input.goalId)].filter(Boolean) as UserGoal[] : await db.goals.toArray();
  const results: DailySettlementResult[] = [];
  for (const goal of goals) {
    const today = input.today ?? todayInTimezone(goal.timezone);
    const [newAssignments, reviewAssignments] = await Promise.all([
      db.dailyNewAssignments.where("goalId").equals(goal.id).toArray(),
      db.dailyReviewAssignments.where("goalId").equals(goal.id).toArray()
    ]);
    const dates = new Set<string>();
    newAssignments.forEach((assignment) => {
      if (isOpenNewAssignment(assignment.status) && compareDates(assignment.date, today) < 0) {
        dates.add(assignment.date);
      }
    });
    reviewAssignments.forEach((assignment) => {
      if (isOpenReviewAssignment(assignment.status) && compareDates(assignment.date, today) < 0) {
        dates.add(assignment.date);
      }
    });

    for (const date of Array.from(dates).sort(compareDates)) {
      const result = await settleDailyTasks({ goalId: goal.id, date, mode: "auto" });
      if (result.replanned) {
        results.push(result);
      }
    }
  }
  return results;
}

export async function analyzeNaturalLanguageGoal(text: string): Promise<AIPlanningSuggestion> {
  const currentGoal = (await db.goals.orderBy("updatedAt").reverse().first()) ?? null;
  const coverage = currentGoal ? await getCurrentCoverage(currentGoal) : null;
  const advice = buildLocalPlanningAdvice({
    text,
    currentGoal,
    coverage,
    wordBooks: await db.wordBooks.toArray(),
    mode: "local_rule",
    adviceType: "goal_parse"
  });
  await db.aiPlanningAdvices.put(advice);
  return {
    ...advice.suggestion,
    id: advice.id,
    validationErrors: advice.validationErrors
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
    goalVersions: data.goalVersions,
    stagePlans: data.stagePlans,
    dailySettlements: data.dailySettlements,
    weeklyReviews: data.weeklyReviews,
    monthlyReviews: data.monthlyReviews,
    aiPlanningAdvices: data.aiPlanningAdvices,
    aiAdviceApplications: data.aiAdviceApplications,
    legacyProgressRecords: data.legacyProgressRecords,
    adjustmentLogs: data.adjustmentLogs
  });
}

export async function importBackup(text: string): Promise<BackupData> {
  const backup = parseBackupData(text);
  await db.transaction(
    "rw",
    [
      db.goals,
      db.goalVersions,
      db.stagePlans,
      db.wordBooks,
      db.words,
      db.wordProgress,
      db.studyPlans,
      db.dailyTasks,
      db.dailyNewAssignments,
      db.dailyReviewAssignments,
      db.reviewHistory,
      db.dailySettlements,
      db.weeklyReviews,
      db.monthlyReviews,
      db.aiPlanningAdvices,
      db.aiAdviceApplications,
      db.legacyProgressRecords,
      db.adjustmentLogs
    ],
    async () => {
      await Promise.all([
        db.goals.clear(),
        db.goalVersions.clear(),
        db.stagePlans.clear(),
        db.wordBooks.clear(),
        db.words.clear(),
        db.wordProgress.clear(),
        db.studyPlans.clear(),
        db.dailyTasks.clear(),
        db.dailyNewAssignments.clear(),
        db.dailyReviewAssignments.clear(),
        db.reviewHistory.clear(),
        db.dailySettlements.clear(),
        db.weeklyReviews.clear(),
        db.monthlyReviews.clear(),
        db.aiPlanningAdvices.clear(),
        db.aiAdviceApplications.clear(),
        db.legacyProgressRecords.clear(),
        db.adjustmentLogs.clear()
      ]);
      await Promise.all([
        db.goals.bulkPut(backup.goals),
        db.goalVersions.bulkPut(backup.goalVersions),
        db.stagePlans.bulkPut(backup.stagePlans),
        db.wordBooks.bulkPut(backup.wordBooks),
        db.words.bulkPut(backup.words),
        db.wordProgress.bulkPut(backup.wordProgress),
        db.studyPlans.bulkPut(backup.studyPlans),
        db.dailyTasks.bulkPut(backup.dailyTasks),
        db.dailyNewAssignments.bulkPut(backup.dailyNewAssignments),
        db.dailyReviewAssignments.bulkPut(backup.dailyReviewAssignments),
        db.reviewHistory.bulkPut(backup.reviewHistory),
        db.dailySettlements.bulkPut(backup.dailySettlements),
        db.weeklyReviews.bulkPut(backup.weeklyReviews),
        db.monthlyReviews.bulkPut(backup.monthlyReviews),
        db.aiPlanningAdvices.bulkPut(backup.aiPlanningAdvices),
        db.aiAdviceApplications.bulkPut(backup.aiAdviceApplications),
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
    selectAvailableWords(words, progress),
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
      status: book.status ?? (book.hasImportedWords ? "imported" : byId.get(book.id)?.status ?? "recommended"),
      role: book.role ?? byId.get(book.id)?.role ?? (book.isFoundation ? "foundation" : book.isTargetBook ? "core" : "custom"),
      priority: book.priority ?? byId.get(book.id)?.priority ?? (book.isFoundation ? 80 : book.isTargetBook ? 70 : 40),
      importedWordCount: book.importedWordCount ?? byId.get(book.id)?.importedWordCount ?? 0,
      duplicateWordCount: book.duplicateWordCount ?? byId.get(book.id)?.duplicateWordCount ?? 0,
      importedAt: book.hasImportedWords ? nowIso() : byId.get(book.id)?.importedAt
    });
  });
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

function withActualBookCounts(books: WordBook[], words: WordItem[]): WordBook[] {
  return books.map((book) => ({
    ...book,
    actualWordCount: words.filter((word) => word.sourceBookIds.includes(book.id)).length,
    status: resolveBookStatus(book, words),
    importedWordCount: words.filter((word) => word.sourceBookIds.includes(book.id)).length
  }));
}

async function buildGoalVersionRecord(previous: UserGoal | null, next: UserGoal, reason: string): Promise<GoalVersionRecord> {
  const existing = await db.goalVersions.where("goalId").equals(next.id).toArray();
  const version = existing.reduce((max, item) => Math.max(max, item.version), 0) + 1;
  const timestamp = nowIso();
  return {
    id: `goal-version:${next.id}:${version}:${Date.now()}`,
    goalId: next.id,
    version,
    createdAt: timestamp,
    reason,
    originalInput: next.originalGoalText ?? next.interpretedGoal ?? next.targetDescription,
    confirmedGoal: next,
    previousTargetRequiredCount: previous?.targetRequiredCount,
    nextTargetRequiredCount: next.targetRequiredCount,
    previousSelectedBookIds: previous?.selectedBookIds ?? [],
    nextSelectedBookIds: next.selectedBookIds,
    beforePressure: previous ? `每日新词上限 ${previous.dailyNewWordLimit}，每日复习上限 ${previous.dailyReviewLimit}` : undefined,
    afterPressure: `每日新词上限 ${next.dailyNewWordLimit}，每日复习上限 ${next.dailyReviewLimit}`
  };
}

async function buildAdviceApplicationRecord(adviceId: string | undefined, previous: UserGoal | null, next: UserGoal): Promise<AIAdviceApplicationRecord | null> {
  if (!adviceId) {
    return null;
  }
  const advice = await db.aiPlanningAdvices.get(adviceId);
  if (!advice) {
    return null;
  }
  return {
    id: `ai-application:${advice.id}:${Date.now()}`,
    adviceId: advice.id,
    goalId: next.id,
    appliedAt: nowIso(),
    beforeGoal: previous ?? next,
    afterGoal: next,
    impactSummary: `确认应用建议：目标词量 ${previous?.targetRequiredCount ?? "-"} -> ${next.targetRequiredCount}，词书范围 ${previous?.selectedBookIds.join("/") ?? "-"} -> ${next.selectedBookIds.join("/") || "全部已导入词"}`,
    localValidationPassed: advice.validationStatus !== "invalid"
  };
}

function resolveBookStatus(book: WordBook, words: WordItem[]): WordBook["status"] {
  const actual = words.some((word) => word.sourceBookIds.includes(book.id));
  if (actual && (book.enabledForGoalIds?.length ?? 0) > 0) {
    return "enabled";
  }
  if (actual || book.hasImportedWords) {
    return "imported";
  }
  return book.status ?? "recommended";
}

function isOpenNewAssignment(status: DailyNewWordAssignment["status"]): boolean {
  return status === "planned" || status === "rescheduled";
}

function isOpenReviewAssignment(status: DailyReviewAssignment["status"]): boolean {
  return status === "planned" || status === "rescheduled";
}
