import { addDays, compareDates, nowIso, todayInShanghai } from "../domain/date";
import { createBackupData, parseBackupData } from "../domain/backup";
import {
  importWordsFromCsv,
  importWordsFromJson,
  mergeWordItems
} from "../domain/importWords";
import { buildDemoGoal, buildDemoWords, DEMO_WORD_BOOKS } from "../domain/sampleData";
import {
  applyProgressToDailyTask,
  createProgressRecord,
  generateStudyPlan
} from "../domain/scheduler";
import type {
  AdjustmentTrigger,
  BackupData,
  DailyTask,
  GeneratedPlanResult,
  PlanAdjustmentLog,
  ProgressRecord,
  ReviewTask,
  StudyPlan,
  UserGoal,
  WordBook,
  WordItem
} from "../domain/types";
import { clearAllData, db } from "../storage/db";

export interface AppDataState {
  goals: UserGoal[];
  wordBooks: WordBook[];
  words: WordItem[];
  studyPlans: StudyPlan[];
  dailyTasks: DailyTask[];
  reviewTasks: ReviewTask[];
  progressRecords: ProgressRecord[];
  adjustmentLogs: PlanAdjustmentLog[];
}

export interface ImportServiceResult {
  addedCount: number;
  duplicateCount: number;
  errors: string[];
}

export async function loadAllData(): Promise<AppDataState> {
  const [goals, wordBooks, words, studyPlans, dailyTasks, reviewTasks, progressRecords, adjustmentLogs] =
    await Promise.all([
      db.goals.toArray(),
      db.wordBooks.toArray(),
      db.words.toArray(),
      db.studyPlans.toArray(),
      db.dailyTasks.toArray(),
      db.reviewTasks.toArray(),
      db.progressRecords.toArray(),
      db.adjustmentLogs.toArray()
    ]);

  return {
    goals: goals.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    wordBooks: wordBooks.sort((a, b) => a.name.localeCompare(b.name)),
    words: words.sort((a, b) => a.normalizedWord.localeCompare(b.normalizedWord)),
    studyPlans: studyPlans.sort((a, b) => b.version - a.version),
    dailyTasks: dailyTasks.sort((a, b) => compareDates(a.date, b.date)),
    reviewTasks,
    progressRecords: progressRecords.sort((a, b) => compareDates(a.date, b.date)),
    adjustmentLogs: adjustmentLogs.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  };
}

export async function saveGoal(goal: UserGoal): Promise<UserGoal> {
  const updatedGoal = { ...goal, updatedAt: nowIso() };
  await db.goals.put(updatedGoal);
  return updatedGoal;
}

export async function loadDemoDataset(): Promise<ImportServiceResult> {
  const existingWords = await db.words.toArray();
  const mergedWords = mergeWordItems(existingWords, buildDemoWords());
  await db.transaction("rw", db.wordBooks, db.words, async () => {
    await db.wordBooks.bulkPut(mergeBooks(await db.wordBooks.toArray(), DEMO_WORD_BOOKS));
    await db.words.bulkPut(mergedWords.words);
  });
  return {
    addedCount: mergedWords.addedCount,
    duplicateCount: mergedWords.duplicateCount,
    errors: []
  };
}

export async function createDemoGoalAndPlan(): Promise<GeneratedPlanResult> {
  const words = await db.words.toArray();
  const startDate = todayInShanghai();
  const deadline = addDays(startDate, 75);
  const goal = buildDemoGoal(startDate, deadline, Math.max(1, Math.min(72, words.length || 72)));
  await saveGoal(goal);
  return generateAndSavePlan(goal, startDate, "initial", "载入演示目标并生成初始计划");
}

export async function importWordText(text: string, format: "csv" | "json"): Promise<ImportServiceResult> {
  const existingWords = await db.words.toArray();
  const result = format === "csv" ? importWordsFromCsv(text, existingWords) : importWordsFromJson(text, existingWords);
  if (result.errors.length > 0 && result.addedCount === 0) {
    return result;
  }

  await db.transaction("rw", db.wordBooks, db.words, async () => {
    await db.wordBooks.bulkPut(mergeBooks(await db.wordBooks.toArray(), result.books));
    await db.words.bulkPut(result.words);
  });
  return {
    addedCount: result.addedCount,
    duplicateCount: result.duplicateCount,
    errors: result.errors
  };
}

export async function generateAndSavePlan(
  goal: UserGoal,
  asOfDate: string,
  triggerType: AdjustmentTrigger,
  reason: string
): Promise<GeneratedPlanResult> {
  const [words, progressRecords, existingTasks, existingPlans] = await Promise.all([
    db.words.toArray(),
    db.progressRecords.where("goalId").equals(goal.id).toArray(),
    db.dailyTasks.where("goalId").equals(goal.id).toArray(),
    db.studyPlans.where("goalId").equals(goal.id).toArray()
  ]);
  const nextVersion = existingPlans.reduce((max, plan) => Math.max(max, plan.version), 0) + 1;
  const result = generateStudyPlan({
    goal,
    words,
    progressRecords,
    existingTasks,
    asOfDate,
    version: nextVersion,
    triggerType,
    reason
  });

  await db.transaction("rw", db.studyPlans, db.dailyTasks, db.adjustmentLogs, async () => {
    const taskIdsToDelete = existingTasks
      .filter((task) => compareDates(task.date, asOfDate) >= 0)
      .map((task) => task.id);
    if (taskIdsToDelete.length > 0) {
      await db.dailyTasks.bulkDelete(taskIdsToDelete);
    }
    await db.studyPlans.put(result.plan);
    await db.dailyTasks.bulkPut(result.dailyTasks);
    await db.adjustmentLogs.put(result.adjustmentLog);
  });

  return result;
}

export async function recordDailyProgress(input: {
  goal: UserGoal;
  date: string;
  newWordsCompleted: number;
  reviewsCompleted: number;
  minutesSpent: number;
  note: string;
}): Promise<GeneratedPlanResult> {
  const record = createProgressRecord({
    goalId: input.goal.id,
    date: input.date,
    newWordsCompleted: input.newWordsCompleted,
    reviewsCompleted: input.reviewsCompleted,
    minutesSpent: input.minutesSpent,
    note: input.note
  });
  const existingTask = await db.dailyTasks.get(`task:${input.goal.id}:${input.date}`);
  await db.transaction("rw", db.progressRecords, db.dailyTasks, async () => {
    await db.progressRecords.put(record);
    if (existingTask) {
      await db.dailyTasks.put(applyProgressToDailyTask(existingTask, record));
    }
  });

  return generateAndSavePlan(input.goal, addDays(input.date, 1), "dailyRecord", `记录 ${input.date} 完成情况后重排`);
}

export async function exportBackup(): Promise<BackupData> {
  const data = await loadAllData();
  return createBackupData({
    goals: data.goals,
    wordBooks: data.wordBooks,
    words: data.words,
    studyPlans: data.studyPlans,
    dailyTasks: data.dailyTasks,
    reviewTasks: data.reviewTasks,
    progressRecords: data.progressRecords,
    adjustmentLogs: data.adjustmentLogs
  });
}

export async function importBackup(text: string): Promise<void> {
  const backup = parseBackupData(text);
  await clearAllData();
  await db.transaction(
    "rw",
    [
      db.goals,
      db.wordBooks,
      db.words,
      db.studyPlans,
      db.dailyTasks,
      db.reviewTasks,
      db.progressRecords,
      db.adjustmentLogs
    ],
    async () => {
      await Promise.all([
        db.goals.bulkPut(backup.goals),
        db.wordBooks.bulkPut(backup.wordBooks),
        db.words.bulkPut(backup.words),
        db.studyPlans.bulkPut(backup.studyPlans),
        db.dailyTasks.bulkPut(backup.dailyTasks),
        db.reviewTasks.bulkPut(backup.reviewTasks),
        db.progressRecords.bulkPut(backup.progressRecords),
        db.adjustmentLogs.bulkPut(backup.adjustmentLogs)
      ]);
    }
  );
}

export async function resetAllData(): Promise<void> {
  await clearAllData();
}

function mergeBooks(existingBooks: WordBook[], incomingBooks: WordBook[]): WordBook[] {
  const byId = new Map(existingBooks.map((book) => [book.id, book]));
  incomingBooks.forEach((book) => {
    byId.set(book.id, {
      ...(byId.get(book.id) ?? book),
      ...book,
      hasImportedWords: book.hasImportedWords || byId.get(book.id)?.hasImportedWords || false
    });
  });
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}
