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

export type WordBookStatus = "recommended" | "imported" | "enabled" | "candidate" | "disabled";

export type WordBookRole = "foundation" | "core" | "extension" | "sprint" | "custom";

export type StageRole = "foundation" | "core" | "extension" | "sprint";

export type AIServiceMode = "local_rule" | "ai_assisted";

export type AIAdviceType =
  | "goal_parse"
  | "book_recommendation"
  | "plan_adjustment"
  | "weekly_diagnosis"
  | "monthly_diagnosis";

export type AdjustmentTrigger =
  | "initial"
  | "daily_learning_result"
  | "daily_review_result"
  | "daily_settlement"
  | "past_due_auto_settlement"
  | "wordbook_import"
  | "goal_change"
  | "ai_suggestion_applied"
  | "manual_recalculate";

export interface LearningGoal {
  id: string;
  goalInputMode: GoalInputMode;
  originalGoalText?: string;
  interpretedGoal?: string;
  targetDescription?: string;
  foundationDescription?: string;
  needsFoundationRepair?: boolean;
  targetType: TargetType;
  targetRequiredCount: number;
  startDate: LocalDateString;
  deadline: LocalDateString;
  dailyNewWordLimit: number;
  dailyReviewLimit: number;
  studyDaysPerWeek?: number;
  restWeekdays: Weekday[];
  bufferDayRatio: number;
  planStyle: PlanStyle;
  timezone: string;
  selectedBookIds: string[];
  allowBookRecommendation: boolean;
  aiPlanningEnabled?: boolean;
  activeGoalVersionId?: string;
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
  status?: WordBookStatus;
  role?: WordBookRole;
  enabledForGoalIds?: string[];
  priority?: number;
  importedWordCount?: number;
  duplicateWordCount?: number;
  coverageNote?: string;
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
  priorityScore?: number;
  priorityReasons?: string[];
  stageHint?: StageRole;
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
  reviewCount?: number;
  recentReviewResult?: ReviewResult;
  lapseCount: number;
  overdueCount?: number;
  isDifficult?: boolean;
  difficultyReason?: string;
  goalIds?: string[];
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
  enabledWordCount: number;
  assignedWordCount: number;
  completedWordCount: number;
  reviewingWordCount: number;
  masteredWordCount: number;
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
  goalChanged?: boolean;
  bookScopeChanged?: boolean;
  beforePressure?: string;
  afterPressure?: string;
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

export interface GoalVersionRecord {
  id: string;
  goalId: string;
  version: number;
  createdAt: string;
  reason: string;
  originalInput?: string;
  interpretedSuggestion?: AIPlanningSuggestion;
  confirmedGoal: LearningGoal;
  previousTargetRequiredCount?: number;
  nextTargetRequiredCount: number;
  previousSelectedBookIds: string[];
  nextSelectedBookIds: string[];
  beforePressure?: string;
  afterPressure?: string;
}

export interface StagePlan {
  id: string;
  goalId: string;
  goalVersionId?: string;
  name: string;
  role: StageRole;
  startDate: LocalDateString;
  endDate: LocalDateString;
  plannedNewWordCount: number;
  plannedReviewCount: number;
  targetBookIds: string[];
  status: "planned" | "active" | "completed" | "atRisk";
  riskNote: string;
  createdAt: string;
  updatedAt: string;
}

export interface DailySettlementRecord {
  id: string;
  goalId: string;
  date: LocalDateString;
  mode: "manual" | "auto";
  settledNewWordCount: number;
  settledReviewCount: number;
  replanned: boolean;
  createdAt: string;
}

export interface WeeklyReviewRecord {
  id: string;
  goalId: string;
  weekStart: LocalDateString;
  weekEnd: LocalDateString;
  plannedNewWords: number;
  actualNewWords: number;
  plannedReviews: number;
  actualReviews: number;
  newLearningBacklog: number;
  newOverdueReviews: number;
  newlyMasteredWords: number;
  difficultWordCount: number;
  inventoryGapChange: number;
  nextWeekLoadChange: number;
  status: FeasibilityStatus;
  explanation: string;
  createdAt: string;
}

export interface MonthlyReviewRecord {
  id: string;
  goalId: string;
  month: string;
  stageGoal: string;
  plannedNewWords: number;
  actualNewWords: number;
  plannedReviews: number;
  actualReviews: number;
  masteredWords: number;
  reviewPressure: number;
  importedWordCount: number;
  accumulatedBacklog: number;
  longTermStatus: FeasibilityStatus;
  nextMonthExpectedLoad: number;
  explanation: string;
  createdAt: string;
}

export interface AIPlanningAdvice {
  id: string;
  createdAt: string;
  mode: AIServiceMode;
  adviceType: AIAdviceType;
  inputSummary: string;
  suggestion: AIPlanningSuggestion;
  validationStatus: "valid" | "invalid" | "fallback";
  validationErrors: string[];
  failureReason?: string;
}

export interface AIAdviceApplicationRecord {
  id: string;
  adviceId: string;
  goalId: string;
  appliedAt: string;
  beforeGoal: LearningGoal;
  afterGoal: LearningGoal;
  impactSummary: string;
  localValidationPassed: boolean;
}

export interface GeneratedPlanResult {
  plan: StudyPlan;
  dailyTasks: DailyTaskSummary[];
  newAssignments: DailyNewWordAssignment[];
  reviewAssignments: DailyReviewAssignment[];
  wordProgress: WordProgress[];
  stagePlans: StagePlan[];
  weeklyReviewRecords: WeeklyReviewRecord[];
  monthlyReviewRecords: MonthlyReviewRecord[];
  longTerm: LongTermPlanSummary;
  monthlyPlans: MonthlyPlanSummary[];
  weeklyPlans: WeeklyPlanSummary[];
  adjustmentLog: PlanAdjustmentLog;
}

export interface AIPlanningSuggestion {
  id?: string;
  mode?: AIServiceMode;
  adviceType?: AIAdviceType;
  interpretedGoal: string;
  targetType: TargetType;
  suggestedTargetWordCount: number;
  suggestedDailyNewWordRange?: [number, number];
  inventoryGapCount?: number;
  suggestedStages: Array<{
    name: string;
    purpose: string;
    suggestedWordCount: number;
    role?: StageRole;
  }>;
  recommendedBookCategories: Array<{
    name: string;
    role: string;
    reason: string;
    expectedWordCount?: number;
    hasExecutableWords?: boolean;
    importRequirement?: string;
  }>;
  explanation: string;
  validationErrors?: string[];
}

export interface BackupDataV2 {
  schemaVersion: 2;
  backupVersion: "v0.2.0" | "v0.2.1";
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

export interface BackupDataV3 {
  schemaVersion: 3;
  backupVersion: "v0.3.0";
  softwareVersion: "0.3.0";
  exportedAt: string;
  migrationMeta: {
    sourceBackupVersion?: string;
    migratedAt: string;
    notes: string[];
  };
  goals: LearningGoal[];
  goalVersions: GoalVersionRecord[];
  stagePlans: StagePlan[];
  wordBooks: WordBook[];
  words: WordItem[];
  wordProgress: WordProgress[];
  studyPlans: StudyPlan[];
  dailyTasks: DailyTaskSummary[];
  dailyNewAssignments: DailyNewWordAssignment[];
  dailyReviewAssignments: DailyReviewAssignment[];
  reviewHistory: ReviewHistoryRecord[];
  dailySettlements: DailySettlementRecord[];
  weeklyReviews: WeeklyReviewRecord[];
  monthlyReviews: MonthlyReviewRecord[];
  aiPlanningAdvices: AIPlanningAdvice[];
  aiAdviceApplications: AIAdviceApplicationRecord[];
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

export type BackupData = BackupDataV3;

export type SupportedBackupData = BackupDataV1 | BackupDataV2 | BackupDataV3;
