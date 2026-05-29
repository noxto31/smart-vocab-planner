export type LocalDateString = string;

export type TargetType =
  | "CET4"
  | "CET6"
  | "POSTGRAD"
  | "IELTS"
  | "TOEFL"
  | "GRE"
  | "CUSTOM";

export type PlanStyle = "steady" | "frontLoaded" | "flexible";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type FeasibilityStatus = "feasible" | "atRisk" | "infeasible" | "completed";

export type GoalInputMode = "structured" | "natural_language";

export type WordLearningState =
  | "not_started"
  | "assigned_new"
  | "learning_backlog"
  | "learned"
  | "reviewing"
  | "mastered"
  | "excluded";

export type NewWordAssignmentStatus =
  | "planned"
  | "learned"
  | "mastered"
  | "skipped"
  | "missed"
  | "rescheduled";

export type ReviewAssignmentStatus = "planned" | "completed" | "overdue" | "rescheduled";

export type ReviewResult = "forgot" | "vague" | "known" | "easy" | "not_completed";

export type AdjustmentTrigger =
  | "initial"
  | "daily_learning_result"
  | "daily_review_result"
  | "wordbook_import"
  | "goal_change"
  | "ai_suggestion_applied"
  | "manual_recalculate";

export interface LearningGoal {
  id: string;
  goalInputMode: GoalInputMode;
  originalGoalText?: string;
  interpretedGoal?: string;
  targetType: TargetType;
  targetRequiredCount: number;
  startDate: LocalDateString;
  deadline: LocalDateString;
  dailyNewWordLimit: number;
  dailyReviewLimit: number;
  restWeekdays: Weekday[];
  bufferDayRatio: number;
  planStyle: PlanStyle;
  timezone: string;
  selectedBookIds: string[];
  allowBookRecommendation: boolean;
  createdAt: string;
  updatedAt: string;
}

export type UserGoal = LearningGoal;

export interface LegacyUserGoal {
  id: string;
  targetType: TargetType;
  targetDescription?: string;
  startDate: LocalDateString;
  deadline: LocalDateString;
  targetVocabularyCount: number;
  currentEstimatedVocabulary?: number;
  dailyNewWordLimit: number;
  dailyReviewLimit: number;
  studyDaysPerWeek?: number;
  restWeekdays: Weekday[];
  bufferDayRatio: number;
  planStyle: PlanStyle;
  selectedBookIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WordBook {
  id: string;
  name: string;
  targetType: TargetType | "GENERAL";
  difficulty: string;
  estimatedWordCount: number;
  actualWordCount?: number;
  sourceDescription: string;
  hasImportedWords: boolean;
  recommendationTags: string[];
  isFoundation: boolean;
  isTargetBook: boolean;
  importedAt?: string;
  overlapNote?: string;
}

export interface WordItem {
  id: string;
  word: string;
  normalizedWord: string;
  meaning: string;
  sourceBookIds: string[];
  sourceBookNames: string[];
  level?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WordProgress {
  wordId: string;
  state: WordLearningState;
  firstAssignedDate?: LocalDateString;
  firstLearnedDate?: LocalDateString;
  lastReviewDate?: LocalDateString;
  nextReviewDate?: LocalDateString;
  reviewStage?: number;
  lapseCount: number;
  sourceBookIds: string[];
  updatedAt: string;
}

export interface DailyNewWordAssignment {
  id: string;
  goalId: string;
  date: LocalDateString;
  wordId: string;
  status: NewWordAssignmentStatus;
  rescheduledFrom?: LocalDateString;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailyReviewAssignment {
  id: string;
  goalId: string;
  date: LocalDateString;
  wordId: string;
  reviewStage: number;
  status: ReviewAssignmentStatus;
  result?: ReviewResult;
  rescheduledFrom?: LocalDateString;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewHistoryRecord {
  id: string;
  goalId: string;
  wordId: string;
  assignmentId: string;
  date: LocalDateString;
  reviewStage: number;
  result: ReviewResult;
  createdAt: string;
}

export interface PlanCoverageStatus {
  targetRequiredCount: number;
  availableWordCount: number;
  assignedWordCount: number;
  completedWordCount: number;
  inventoryGapCount: number;
  learningBacklogCount: number;
  overdueReviewCount: number;
}

export interface StudyPlan {
  id: string;
  goalId: string;
  generatedAt: string;
  version: number;
  feasibilityStatus: FeasibilityStatus;
  remainingConcreteNewWords: number;
  remainingEffectiveDays: number;
  requiredDailyAverage: number;
  dailyLimitGap: number;
  coverage: PlanCoverageStatus;
  adjustmentReason: string;
}

export interface DailyTaskSummary {
  id: string;
  goalId: string;
  planId: string;
  date: LocalDateString;
  plannedNewWordCount: number;
  boundNewWordCount: number;
  completedNewWordCount: number;
  learningBacklogCount: number;
  plannedReviewCount: number;
  completedReviewCount: number;
  overdueReviewCount: number;
  inventoryGapCount: number;
  isBufferDay: boolean;
  isRestDay: boolean;
  capacityStatus: "ok" | "near_limit" | "over_limit" | "rest";
  feasibilityStatus: FeasibilityStatus;
  adjustmentReason: string;
}

export type DailyTask = DailyTaskSummary;

export interface LegacyProgressRecord {
  id: string;
  goalId: string;
  date: LocalDateString;
  newWordsCompleted: number;
  reviewsCompleted: number;
  minutesSpent: number;
  note: string;
  sourceVersion: "v0.1.0";
  preservedReason: string;
  createdAt: string;
}

export interface PlanAdjustmentLog {
  id: string;
  createdAt: string;
  triggerType: AdjustmentTrigger;
  reason: string;
  beforeSnapshot: PlanCoverageStatus;
  afterSnapshot: PlanCoverageStatus;
  affectedDates: LocalDateString[];
  explanation: string;
}

export interface LongTermPlanSummary {
  totalTargetWords: number;
  availableWordCount: number;
  assignedWordCount: number;
  completedNewWords: number;
  inventoryGapCount: number;
  learningBacklogCount: number;
  overdueReviewCount: number;
  remainingEffectiveDays: number;
  estimatedCompletionDate: LocalDateString | null;
  feasibilityStatus: FeasibilityStatus;
  requiredDailyAverage: number;
  stageSummaries: string[];
}

export interface MonthlyPlanSummary {
  month: string;
  plannedNewWords: number;
  plannedReviews: number;
  completedNewWords: number;
  completedReviews: number;
  backlogWords: number;
  overdueReviews: number;
  bufferDays: number;
  completionRate: number;
  projectedCumulativeRate: number;
}

export interface WeeklyPlanSummary {
  weekStart: LocalDateString;
  weekEnd: LocalDateString;
  plannedNewWords: number;
  plannedReviews: number;
  completedNewWords: number;
  completedReviews: number;
  backlogWords: number;
  overdueReviews: number;
  completionRate: number;
}

export interface GeneratedPlanResult {
  plan: StudyPlan;
  dailyTasks: DailyTaskSummary[];
  newAssignments: DailyNewWordAssignment[];
  reviewAssignments: DailyReviewAssignment[];
  wordProgress: WordProgress[];
  longTerm: LongTermPlanSummary;
  monthlyPlans: MonthlyPlanSummary[];
  weeklyPlans: WeeklyPlanSummary[];
  adjustmentLog: PlanAdjustmentLog;
}

export interface AIPlanningSuggestion {
  interpretedGoal: string;
  targetType: TargetType;
  suggestedTargetWordCount: number;
  suggestedStages: Array<{
    name: string;
    purpose: string;
    suggestedWordCount: number;
  }>;
  recommendedBookCategories: Array<{
    name: string;
    role: string;
    reason: string;
  }>;
  explanation: string;
}

export interface BackupDataV2 {
  schemaVersion: 2;
  backupVersion: "v0.2.0";
  exportedAt: string;
  goals: LearningGoal[];
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

export interface BackupDataV1 {
  schemaVersion: 1;
  exportedAt: string;
  goals: LegacyUserGoal[];
  wordBooks: WordBook[];
  words: Array<WordItem & { status?: string }>;
  studyPlans: unknown[];
  dailyTasks: unknown[];
  reviewTasks: unknown[];
  progressRecords: Array<Omit<LegacyProgressRecord, "sourceVersion" | "preservedReason">>;
  adjustmentLogs: unknown[];
}

export type BackupData = BackupDataV2;
