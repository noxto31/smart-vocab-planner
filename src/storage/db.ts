import Dexie, { type Table } from "dexie";
import type {
  DailyNewWordAssignment,
  DailyReviewAssignment,
  DailySettlementRecord,
  AIAdviceApplicationRecord,
  AIPlanningAdvice,
  GoalVersionRecord,
  DailyTaskSummary,
  LegacyProgressRecord,
  MonthlyReviewRecord,
  PlanAdjustmentLog,
  ReviewHistoryRecord,
  StagePlan,
  StudyPlan,
  UserGoal,
  WeeklyReviewRecord,
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
  goalVersions!: Table<GoalVersionRecord, string>;
  stagePlans!: Table<StagePlan, string>;
  dailySettlements!: Table<DailySettlementRecord, string>;
  weeklyReviews!: Table<WeeklyReviewRecord, string>;
  monthlyReviews!: Table<MonthlyReviewRecord, string>;
  aiPlanningAdvices!: Table<AIPlanningAdvice, string>;
  aiAdviceApplications!: Table<AIAdviceApplicationRecord, string>;
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

    this.version(3)
      .stores({
        goals: "id, targetType, deadline, updatedAt, activeGoalVersionId",
        goalVersions: "id, goalId, version, createdAt",
        stagePlans: "id, goalId, startDate, endDate, status",
        wordBooks: "id, name, targetType, status",
        words: "id, normalizedWord",
        wordProgress: "wordId, state, nextReviewDate, isDifficult",
        studyPlans: "id, goalId, version, generatedAt",
        dailyTasks: "id, goalId, date, planId",
        dailyNewAssignments: "id, goalId, date, wordId, status",
        dailyReviewAssignments: "id, goalId, date, wordId, status",
        reviewHistory: "id, goalId, wordId, date, result",
        dailySettlements: "id, goalId, date, mode",
        weeklyReviews: "id, goalId, weekStart, weekEnd",
        monthlyReviews: "id, goalId, month",
        aiPlanningAdvices: "id, createdAt, mode, adviceType",
        aiAdviceApplications: "id, adviceId, goalId, appliedAt",
        legacyProgressRecords: "id, goalId, date, sourceVersion",
        adjustmentLogs: "id, createdAt, triggerType"
      })
      .upgrade(async (transaction) => {
        const timestamp = new Date().toISOString();
        const goals = await transaction.table("goals").toArray();
        const wordBooks = await transaction.table("wordBooks").toArray();
        const wordProgress = await transaction.table("wordProgress").toArray();

        if (goals.length > 0) {
          const goalVersions = goals.map((goal, index) => {
            const versionId = `goal-version:${goal.id}:v1`;
            return {
              id: versionId,
              goalId: goal.id,
              version: 1,
              createdAt: goal.updatedAt ?? timestamp,
              reason: "v0.2.1 数据升级到 v0.3.0 时保留的初始目标版本",
              originalInput: goal.originalGoalText ?? goal.interpretedGoal,
              confirmedGoal: {
                ...goal,
                activeGoalVersionId: versionId,
                studyDaysPerWeek: goal.studyDaysPerWeek ?? Math.max(1, 7 - (goal.restWeekdays?.length ?? 0)),
                aiPlanningEnabled: goal.aiPlanningEnabled ?? goal.allowBookRecommendation ?? true
              },
              nextTargetRequiredCount: goal.targetRequiredCount,
              previousSelectedBookIds: [],
              nextSelectedBookIds: goal.selectedBookIds ?? []
            };
          });
          await transaction.table("goalVersions").bulkPut(goalVersions);
          await transaction.table("goals").bulkPut(
            goals.map((goal, index) => ({
              ...goal,
              activeGoalVersionId: goalVersions[index].id,
              studyDaysPerWeek: goal.studyDaysPerWeek ?? Math.max(1, 7 - (goal.restWeekdays?.length ?? 0)),
              aiPlanningEnabled: goal.aiPlanningEnabled ?? goal.allowBookRecommendation ?? true,
              needsFoundationRepair: goal.needsFoundationRepair ?? false
            }))
          );
        }

        if (wordBooks.length > 0) {
          await transaction.table("wordBooks").bulkPut(
            wordBooks.map((book) => ({
              ...book,
              status: book.status ?? (book.hasImportedWords ? "imported" : "recommended"),
              role: book.role ?? (book.isFoundation ? "foundation" : book.isTargetBook ? "core" : "custom"),
              enabledForGoalIds: book.enabledForGoalIds ?? [],
              priority: book.priority ?? (book.isFoundation ? 80 : book.isTargetBook ? 70 : 40),
              importedWordCount: book.importedWordCount ?? book.actualWordCount ?? 0,
              duplicateWordCount: book.duplicateWordCount ?? 0
            }))
          );
        }

        if (wordProgress.length > 0) {
          await transaction.table("wordProgress").bulkPut(
            wordProgress.map((progress) => ({
              ...progress,
              reviewCount: progress.reviewCount ?? 0,
              overdueCount: progress.overdueCount ?? 0,
              isDifficult: progress.isDifficult ?? false,
              goalIds: progress.goalIds ?? []
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
      db.goalVersions,
      db.stagePlans,
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
        db.wordBooks.clear(),
        db.words.clear(),
        db.wordProgress.clear(),
        db.studyPlans.clear(),
        db.dailyTasks.clear(),
        db.dailyNewAssignments.clear(),
        db.dailyReviewAssignments.clear(),
        db.reviewHistory.clear(),
        db.goalVersions.clear(),
        db.stagePlans.clear(),
        db.dailySettlements.clear(),
        db.weeklyReviews.clear(),
        db.monthlyReviews.clear(),
        db.aiPlanningAdvices.clear(),
        db.aiAdviceApplications.clear(),
        db.legacyProgressRecords.clear(),
        db.adjustmentLogs.clear()
      ]);
    }
  );
}
