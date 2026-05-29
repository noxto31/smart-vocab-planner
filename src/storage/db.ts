import Dexie, { type Table } from "dexie";
import type {
  DailyNewWordAssignment,
  DailyReviewAssignment,
  DailyTaskSummary,
  LegacyProgressRecord,
  PlanAdjustmentLog,
  ReviewHistoryRecord,
  StudyPlan,
  UserGoal,
  WordBook,
  WordItem,
  WordProgress
} from "../domain/types";

export class PlannerDatabase extends Dexie {
  goals!: Table<UserGoal, string>;
  wordBooks!: Table<WordBook, string>;
  words!: Table<WordItem, string>;
  wordProgress!: Table<WordProgress, string>;
  studyPlans!: Table<StudyPlan, string>;
  dailyTasks!: Table<DailyTaskSummary, string>;
  dailyNewAssignments!: Table<DailyNewWordAssignment, string>;
  dailyReviewAssignments!: Table<DailyReviewAssignment, string>;
  reviewHistory!: Table<ReviewHistoryRecord, string>;
  legacyProgressRecords!: Table<LegacyProgressRecord, string>;
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

    this.version(2)
      .stores({
        goals: "id, targetType, deadline, updatedAt",
        wordBooks: "id, name, targetType",
        words: "id, normalizedWord",
        wordProgress: "wordId, state, nextReviewDate",
        studyPlans: "id, goalId, version, generatedAt",
        dailyTasks: "id, goalId, date, planId",
        dailyNewAssignments: "id, goalId, date, wordId, status",
        dailyReviewAssignments: "id, goalId, date, wordId, status",
        reviewHistory: "id, goalId, wordId, date, result",
        legacyProgressRecords: "id, goalId, date, sourceVersion",
        adjustmentLogs: "id, createdAt, triggerType"
      })
      .upgrade(async (transaction) => {
        const oldGoals = await transaction.table("goals").toArray();
        const oldWords = await transaction.table("words").toArray();
        const oldProgress = await transaction.table("progressRecords").toArray();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
        await transaction.table("goals").clear();
        await transaction.table("words").clear();
        await transaction.table("goals").bulkPut(
          oldGoals.map((goal) => ({
            id: goal.id,
            goalInputMode: "structured",
            originalGoalText: goal.targetDescription,
            interpretedGoal: goal.targetDescription,
            targetType: goal.targetType,
            targetRequiredCount: goal.targetVocabularyCount,
            startDate: goal.startDate,
            deadline: goal.deadline,
            dailyNewWordLimit: goal.dailyNewWordLimit,
            dailyReviewLimit: goal.dailyReviewLimit,
            restWeekdays: goal.restWeekdays,
            bufferDayRatio: goal.bufferDayRatio,
            planStyle: goal.planStyle,
            timezone,
            selectedBookIds: goal.selectedBookIds ?? [],
            allowBookRecommendation: true,
            createdAt: goal.createdAt,
            updatedAt: goal.updatedAt
          }))
        );
        await transaction.table("words").bulkPut(
          oldWords.map((word) => {
            const { status: _status, ...rest } = word;
            return rest;
          })
        );
        if (oldProgress.length > 0) {
          await transaction.table("legacyProgressRecords").bulkPut(
            oldProgress.map((record) => ({
              ...record,
              sourceVersion: "v0.1.0",
              preservedReason: "旧版本只记录数量，无法可靠转换为具体单词历史，因此仅作为历史数量记录保留"
            }))
          );
        }
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
        db.goals.clear(),
        db.wordBooks.clear(),
        db.words.clear(),
        db.wordProgress.clear(),
        db.studyPlans.clear(),
        db.dailyTasks.clear(),
        db.dailyNewAssignments.clear(),
        db.dailyReviewAssignments.clear(),
        db.reviewHistory.clear(),
        db.legacyProgressRecords.clear(),
        db.adjustmentLogs.clear()
      ]);
    }
  );
}
