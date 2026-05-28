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

export type WordStatus = "new" | "known" | "excluded" | "learning" | "mastered";

export type FeasibilityStatus = "feasible" | "atRisk" | "infeasible" | "completed";

export type CompletionStatus = "planned" | "completed" | "partial" | "missed" | "rest";

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface UserGoal {
  id: string;
  targetType: TargetType;
  targetDescription: string;
  startDate: LocalDateString;
  deadline: LocalDateString;
  targetVocabularyCount: number;
  currentEstimatedVocabulary?: number;
  dailyNewWordLimit: number;
  dailyReviewLimit: number;
  studyDaysPerWeek: number;
  restWeekdays: Weekday[];
  bufferDayRatio: number;
  planStyle: PlanStyle;
  selectedBookIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface WordBook {
  id: string;
  name: string;
  targetType: TargetType | "GENERAL";
  difficulty: string;
  estimatedWordCount: number;
  sourceDescription: string;
  hasImportedWords: boolean;
  recommendationTags: string[];
  isFoundation: boolean;
  isTargetBook: boolean;
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
  status: WordStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StudyPlan {
  id: string;
  goalId: string;
  generatedAt: string;
  version: number;
  feasibilityStatus: FeasibilityStatus;
  remainingNewWords: number;
  remainingEffectiveDays: number;
  requiredDailyAverage: number;
  dailyLimitGap: number;
  adjustmentReason: string;
}

export interface DailyTask {
  id: string;
  goalId: string;
  planId: string;
  date: LocalDateString;
  plannedNewWordCount: number;
  plannedReviewCount: number;
  actualNewWordCount: number;
  actualReviewCount: number;
  missedNewWordCount: number;
  missedReviewCount: number;
  completionStatus: CompletionStatus;
  isBufferDay: boolean;
  isRestDay: boolean;
  sourceBookNames: string[];
  adjustmentReason: string;
}

export type ReviewResult = "mastered" | "uncertain" | "forgotten" | "missed" | "pending";

export interface ReviewTask {
  id: string;
  wordId: string;
  dueDate: LocalDateString;
  reviewStage: number;
  result: ReviewResult;
  completedAt?: string;
  rescheduledFrom?: LocalDateString;
}

export interface ProgressRecord {
  id: string;
  goalId: string;
  date: LocalDateString;
  newWordsCompleted: number;
  reviewsCompleted: number;
  minutesSpent: number;
  note: string;
  createdAt: string;
}

export type AdjustmentTrigger = "initial" | "dailyRecord" | "settingsChange" | "import" | "manual";

export interface PlanAdjustmentLog {
  id: string;
  createdAt: string;
  triggerType: AdjustmentTrigger;
  previousPlanVersion: number;
  newPlanVersion: number;
  reason: string;
  changesSummary: string;
  feasibilityStatus: FeasibilityStatus;
}

export interface LongTermPlanSummary {
  totalTargetWords: number;
  completedNewWords: number;
  remainingNewWords: number;
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
  actualNewWords: number;
  actualReviews: number;
  bufferDays: number;
  completionRate: number;
  projectedCumulativeRate: number;
}

export interface WeeklyPlanSummary {
  weekStart: LocalDateString;
  weekEnd: LocalDateString;
  plannedNewWords: number;
  plannedReviews: number;
  actualNewWords: number;
  actualReviews: number;
  missedNewWords: number;
  completionRate: number;
}

export interface GeneratedPlanResult {
  plan: StudyPlan;
  dailyTasks: DailyTask[];
  longTerm: LongTermPlanSummary;
  monthlyPlans: MonthlyPlanSummary[];
  weeklyPlans: WeeklyPlanSummary[];
  adjustmentLog: PlanAdjustmentLog;
}

export interface BackupData {
  schemaVersion: 1;
  exportedAt: string;
  goals: UserGoal[];
  wordBooks: WordBook[];
  words: WordItem[];
  studyPlans: StudyPlan[];
  dailyTasks: DailyTask[];
  reviewTasks: ReviewTask[];
  progressRecords: ProgressRecord[];
  adjustmentLogs: PlanAdjustmentLog[];
}
