import Dexie, { type Table } from "dexie";
import type {
  DailyTask,
  PlanAdjustmentLog,
  ProgressRecord,
  ReviewTask,
  StudyPlan,
  UserGoal,
  WordBook,
  WordItem
} from "../domain/types";

export class PlannerDatabase extends Dexie {
  goals!: Table<UserGoal, string>;
  wordBooks!: Table<WordBook, string>;
  words!: Table<WordItem, string>;
  studyPlans!: Table<StudyPlan, string>;
  dailyTasks!: Table<DailyTask, string>;
  reviewTasks!: Table<ReviewTask, string>;
  progressRecords!: Table<ProgressRecord, string>;
  adjustmentLogs!: Table<PlanAdjustmentLog, string>;

  constructor() {
    super("VocabularySmartPlannerDB");
    this.version(1).stores({
      goals: "id, targetType, deadline, updatedAt",
      wordBooks: "id, name, targetType",
      words: "id, normalizedWord, status",
      studyPlans: "id, goalId, version, generatedAt",
      dailyTasks: "id, goalId, date, planId",
      reviewTasks: "id, wordId, dueDate, result",
      progressRecords: "id, goalId, date",
      adjustmentLogs: "id, createdAt, triggerType, newPlanVersion"
    });
  }
}

export const db = new PlannerDatabase();

export async function clearAllData(): Promise<void> {
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
        db.goals.clear(),
        db.wordBooks.clear(),
        db.words.clear(),
        db.studyPlans.clear(),
        db.dailyTasks.clear(),
        db.reviewTasks.clear(),
        db.progressRecords.clear(),
        db.adjustmentLogs.clear()
      ]);
    }
  );
}
