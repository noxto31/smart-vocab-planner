import {
  addDays,
  compareDates,
  endOfIsoWeek,
  enumerateDateRange,
  isRestDate,
  monthKey,
  nowIso,
  startOfIsoWeek
} from "./date";
import type {
  AdjustmentTrigger,
  DailyNewWordAssignment,
  DailyReviewAssignment,
  DailyTaskSummary,
  FeasibilityStatus,
  GeneratedPlanResult,
  LearningGoal,
  LocalDateString,
  LongTermPlanSummary,
  MonthlyPlanSummary,
  MonthlyReviewRecord,
  NewWordAssignmentStatus,
  PlanAdjustmentLog,
  PlanCoverageStatus,
  PlanStyle,
  ReviewHistoryRecord,
  ReviewResult,
  StagePlan,
  StudyPlan,
  WeeklyReviewRecord,
  WeeklyPlanSummary,
  WordItem,
  WordProgress
} from "./types";

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const;
export const REVIEW_LOAD_WEIGHT = 0.6;

export interface GeneratePlanInput {
  goal: LearningGoal;
  words: WordItem[];
  wordProgress: WordProgress[];
  existingNewAssignments: DailyNewWordAssignment[];
  existingReviewAssignments: DailyReviewAssignment[];
  existingDailyTasks?: DailyTaskSummary[];
  asOfDate: LocalDateString;
  version: number;
  triggerType: AdjustmentTrigger;
  reason: string;
  beforeSnapshot?: PlanCoverageStatus;
  preserveOpenDates?: LocalDateString[];
}

export interface NewWordResultInput {
  assignment: DailyNewWordAssignment;
  progress?: WordProgress;
  word: WordItem;
  result: Extract<NewWordAssignmentStatus, "learned" | "mastered" | "skipped" | "missed">;
  completedAt?: string;
}

export interface NewWordResultOutput {
  assignment: DailyNewWordAssignment;
  progress: WordProgress;
  reviewAssignment?: DailyReviewAssignment;
}

export interface ReviewResultInput {
  assignment: DailyReviewAssignment;
  progress: WordProgress;
  result: ReviewResult;
  completedAt?: string;
}

export interface ReviewResultOutput {
  assignment: DailyReviewAssignment;
  progress: WordProgress;
  reviewRecord: ReviewHistoryRecord;
  nextReviewAssignment?: DailyReviewAssignment;
}

export function validateGoal(goal: LearningGoal): string[] {
  const errors: string[] = [];
  if (compareDates(goal.startDate, goal.deadline) > 0) {
    errors.push("开始日期不能晚于截止日期");
  }
  if (!Number.isInteger(goal.targetRequiredCount) || goal.targetRequiredCount <= 0) {
    errors.push("目标需求词量必须是正整数");
  }
  if (!Number.isInteger(goal.dailyNewWordLimit) || goal.dailyNewWordLimit <= 0) {
    errors.push("每日新学上限必须是正整数");
  }
  if (!Number.isInteger(goal.dailyReviewLimit) || goal.dailyReviewLimit < 0) {
    errors.push("每日复习上限不能为负数");
  }
  if (goal.bufferDayRatio < 0 || goal.bufferDayRatio > 0.5) {
    errors.push("缓冲日比例需要在 0 到 0.5 之间");
  }
  if (goal.restWeekdays.length > 6) {
    errors.push("每周至少需要保留 1 个学习日");
  }
  if (!goal.timezone.trim()) {
    errors.push("计划时区不能为空");
  }
  return errors;
}

export function generateWordLevelPlan(input: GeneratePlanInput): GeneratedPlanResult {
  const goalErrors = validateGoal(input.goal);
  if (goalErrors.length > 0) {
    throw new Error(goalErrors.join("；"));
  }

  const timestamp = nowIso();
  const availableWords = selectAvailableWords(input.words, input.wordProgress);
  const selectedWords = selectWordsForGoal(input.words, input.goal, input.wordProgress);
  const targetWords = selectedWords.slice(0, Math.min(input.goal.targetRequiredCount, selectedWords.length));
  const progressMap = new Map(input.wordProgress.map((item) => [item.wordId, { ...item }]));
  targetWords.forEach((word) => {
    if (!progressMap.has(word.id)) {
      progressMap.set(word.id, createInitialProgress(word, timestamp));
    }
  });

  const preserveOpenDates = new Set(input.preserveOpenDates ?? []);
  const overdueReviewAssignments = input.existingReviewAssignments.map((assignment) => ({ ...assignment }));

  const completedWordIds = getCompletedWordIds(Array.from(progressMap.values()), input.existingNewAssignments);
  const backlogWordIds = getBacklogWordIds(Array.from(progressMap.values()), input.existingNewAssignments, input.asOfDate);
  const protectedOpenWordIds = new Set(
    input.existingNewAssignments
      .filter((assignment) => isOpenNewAssignment(assignment.status) && preserveOpenDates.has(assignment.date))
      .map((assignment) => assignment.wordId)
  );
  const historicalNewAssignments = input.existingNewAssignments.filter(
    (assignment) =>
      compareDates(assignment.date, input.asOfDate) < 0 ||
      isClosedNewAssignment(assignment.status) ||
      (isOpenNewAssignment(assignment.status) && preserveOpenDates.has(assignment.date))
  );
  const historicalReviewAssignments = overdueReviewAssignments.filter(
    (assignment) =>
      assignment.status === "completed" ||
      compareDates(assignment.date, input.asOfDate) < 0 ||
      (isOpenReviewAssignment(assignment.status) && preserveOpenDates.has(assignment.date))
  );
  const futureReviewAssignments = overdueReviewAssignments.filter(
    (assignment) =>
      assignment.status !== "completed" &&
      compareDates(assignment.date, input.asOfDate) >= 0 &&
      !(isOpenReviewAssignment(assignment.status) && preserveOpenDates.has(assignment.date))
  );

  const effectiveDates = enumerateDateRange(input.asOfDate, input.goal.deadline).filter(
    (date) => !isRestDate(date, input.goal.restWeekdays)
  );
  const bufferDates = getBufferDates(effectiveDates, input.goal.bufferDayRatio);

  const completedSet = new Set(completedWordIds);
  const backlogSet = new Set(backlogWordIds);
  const targetWordIds = new Set(targetWords.map((word) => word.id));
  const uncompletedTargetWords = targetWords.filter((word) => !completedSet.has(word.id));
  const backlogWords = uncompletedTargetWords.filter((word) => backlogSet.has(word.id));
  const notStartedWords = uncompletedTargetWords.filter((word) => !backlogSet.has(word.id) && !protectedOpenWordIds.has(word.id));

  const reviewSchedule = scheduleReviewAssignments({
    goal: input.goal,
    asOfDate: input.asOfDate,
    existingFutureReviews: futureReviewAssignments,
    overdueReviews: historicalReviewAssignments.filter((assignment) => assignment.status === "overdue"),
    preservedReviews: historicalReviewAssignments.filter(
      (assignment) => isOpenReviewAssignment(assignment.status) && preserveOpenDates.has(assignment.date)
    ),
    effectiveDates,
    timestamp
  });

  const scheduledNewAssignments: DailyNewWordAssignment[] = [];
  const newCapacityByDate = new Map(effectiveDates.map((date) => [date, input.goal.dailyNewWordLimit]));
  const preservedNewCountByDate = new Map<LocalDateString, number>();
  historicalNewAssignments.forEach((assignment) => {
    if (isOpenNewAssignment(assignment.status) && preserveOpenDates.has(assignment.date) && newCapacityByDate.has(assignment.date)) {
      newCapacityByDate.set(assignment.date, Math.max(0, (newCapacityByDate.get(assignment.date) ?? 0) - 1));
      preservedNewCountByDate.set(assignment.date, (preservedNewCountByDate.get(assignment.date) ?? 0) + 1);
    }
  });
  const reviewCountByDate = countReviewsByDate([...historicalReviewAssignments, ...reviewSchedule.assignments], effectiveDates);
  const newSchedule = scheduleNewWordsByLoad({
    items: [
      ...backlogWords.map((word) => ({ word, status: "rescheduled" as const })),
      ...notStartedWords.map((word) => ({ word, status: "planned" as const }))
    ],
    goal: input.goal,
    effectiveDates,
    capacityByDate: newCapacityByDate,
    existingNewCountByDate: preservedNewCountByDate,
    reviewCountByDate,
    progressMap,
    timestamp,
    rescheduledFrom: findOriginalAssignmentDate(input.existingNewAssignments)
  });
  scheduledNewAssignments.push(...newSchedule.assignments);

  const newAssignments = [...historicalNewAssignments, ...scheduledNewAssignments].sort(compareNewAssignments);
  const reviewAssignments = [...historicalReviewAssignments, ...reviewSchedule.assignments].sort(compareReviewAssignments);
  let dailyTasks = buildDailySummaries({
    goal: input.goal,
    planId: `plan:${input.goal.id}:${input.version}`,
    asOfDate: input.asOfDate,
    newAssignments,
    reviewAssignments,
    existingDailyTasks: input.existingDailyTasks ?? [],
    bufferDates,
    coverage: computeCoverageStatus(input.goal, availableWords, selectedWords, Array.from(progressMap.values()), newAssignments, reviewAssignments, input.asOfDate)
  });

  const coverage = computeCoverageStatus(input.goal, availableWords, selectedWords, Array.from(progressMap.values()), newAssignments, reviewAssignments, input.asOfDate);
  const requiredDailyAverage = computeRequiredDailyAverage(coverage.targetRequiredCount - coverage.completedWordCount, effectiveDates.length);
  const dailyLimitGap = Math.max(0, requiredDailyAverage - input.goal.dailyNewWordLimit);
  const remainingConcreteNewWords = targetWords.filter((word) => !completedSet.has(word.id)).length;
  const feasibilityStatus = resolveFeasibilityStatus({
    coverage,
    remainingEffectiveDays: effectiveDates.length,
    requiredDailyAverage,
    dailyNewWordLimit: input.goal.dailyNewWordLimit,
    reviewOverflow: reviewSchedule.overflow,
    newWordOverflow: newSchedule.overflow
  });
  const adjustmentReason = buildPlanReason({
    baseReason: input.reason,
    feasibilityStatus,
    coverage,
    remainingEffectiveDays: effectiveDates.length,
    requiredDailyAverage,
    dailyLimitGap,
    reviewOverflow: reviewSchedule.overflow,
    newWordOverflow: newSchedule.overflow,
    dailyNewWordLimit: input.goal.dailyNewWordLimit
  });

  const plan: StudyPlan = {
    id: `plan:${input.goal.id}:${input.version}`,
    goalId: input.goal.id,
    generatedAt: timestamp,
    version: input.version,
    feasibilityStatus,
    remainingConcreteNewWords,
    remainingEffectiveDays: effectiveDates.length,
    requiredDailyAverage,
    dailyLimitGap,
    newWordOverflowCount: newSchedule.overflow,
    reviewWeight: REVIEW_LOAD_WEIGHT,
    coverage,
    adjustmentReason
  };
  dailyTasks = dailyTasks.map((task) => ({
    ...task,
    feasibilityStatus
  }));

  const affectedDates = dailyTasks
    .filter((task) => compareDates(task.date, input.asOfDate) >= 0 && (task.boundNewWordCount > 0 || task.plannedReviewCount > 0))
    .map((task) => task.date);
  const beforeSnapshot = input.beforeSnapshot ?? emptyCoverage(input.goal);
  const adjustmentLog: PlanAdjustmentLog = {
    id: `adjustment:${input.goal.id}:${input.version}`,
    createdAt: timestamp,
    triggerType: input.triggerType,
    reason: input.reason,
    beforeSnapshot,
    afterSnapshot: coverage,
    affectedDates,
    explanation: adjustmentReason
  };

  const summaries = summarizePlan(input.goal, plan, dailyTasks, input.asOfDate);
  const stagePlans = buildStagePlans(input.goal, plan, dailyTasks, input.asOfDate, timestamp);
  const weeklyReviewRecords = buildWeeklyReviewRecords(input.goal, summaries.weeklyPlans, Array.from(progressMap.values()), plan, timestamp);
  const monthlyReviewRecords = buildMonthlyReviewRecords(input.goal, stagePlans, summaries.monthlyPlans, Array.from(progressMap.values()), plan, timestamp);
  return {
    plan,
    dailyTasks,
    newAssignments,
    reviewAssignments,
    wordProgress: Array.from(progressMap.values()).sort((a, b) => a.wordId.localeCompare(b.wordId)),
    stagePlans,
    weeklyReviewRecords,
    monthlyReviewRecords,
    adjustmentLog,
    ...summaries
  };
}

export const generateStudyPlan = generateWordLevelPlan;

export function computeCoverageStatus(
  goal: LearningGoal,
  availableWords: WordItem[],
  enabledWords: WordItem[],
  wordProgress: WordProgress[],
  newAssignments: DailyNewWordAssignment[],
  reviewAssignments: DailyReviewAssignment[],
  asOfDate: LocalDateString
): PlanCoverageStatus {
  const availableWordCount = availableWords.length;
  const enabledWordCount = enabledWords.length;
  const selectedWordIds = new Set(enabledWords.slice(0, Math.min(goal.targetRequiredCount, enabledWords.length)).map((word) => word.id));
  const progressByWord = new Map(wordProgress.map((progress) => [progress.wordId, progress]));
  const assignedWordIds = new Set<string>();
  const completedWordIds = new Set<string>();
  const backlogWordIds = new Set<string>();
  const reviewingWordIds = new Set<string>();
  const masteredWordIds = new Set<string>();

  newAssignments.forEach((assignment) => {
    if (!selectedWordIds.has(assignment.wordId)) {
      return;
    }
    assignedWordIds.add(assignment.wordId);
    if (assignment.status === "learned" || assignment.status === "mastered") {
      completedWordIds.add(assignment.wordId);
    }
    if (assignment.status === "skipped" || assignment.status === "missed") {
      backlogWordIds.add(assignment.wordId);
    }
  });

  progressByWord.forEach((progress) => {
    if (!selectedWordIds.has(progress.wordId)) {
      return;
    }
    if (progress.state !== "not_started" && progress.state !== "excluded") {
      assignedWordIds.add(progress.wordId);
    }
    if (progress.state === "learned" || progress.state === "reviewing" || progress.state === "mastered") {
      completedWordIds.add(progress.wordId);
    }
    if (progress.state === "learned" || progress.state === "reviewing") {
      reviewingWordIds.add(progress.wordId);
    }
    if (progress.state === "mastered") {
      masteredWordIds.add(progress.wordId);
    }
    if (progress.state === "learning_backlog") {
      backlogWordIds.add(progress.wordId);
    }
  });

  const overdueReviewWordIds = new Set(
    reviewAssignments
      .filter(
        (assignment) =>
          assignment.status === "overdue"
      )
      .map((assignment) => assignment.wordId)
  );

  return {
    targetRequiredCount: goal.targetRequiredCount,
    availableWordCount,
    enabledWordCount,
    assignedWordCount: assignedWordIds.size,
    completedWordCount: completedWordIds.size,
    reviewingWordCount: reviewingWordIds.size,
    masteredWordCount: masteredWordIds.size,
    inventoryGapCount: Math.max(0, goal.targetRequiredCount - enabledWordCount),
    learningBacklogCount: backlogWordIds.size,
    overdueReviewCount: overdueReviewWordIds.size
};
}

export function applyNewWordResult(input: NewWordResultInput): NewWordResultOutput {
  const timestamp = input.completedAt ?? nowIso();
  const baseProgress = input.progress ?? createInitialProgress(input.word, timestamp);
  const assignment: DailyNewWordAssignment = {
    ...input.assignment,
    status: input.result,
    completedAt: input.result === "learned" || input.result === "mastered" ? timestamp : undefined,
    updatedAt: timestamp
  };

  if (input.result === "learned" || input.result === "mastered") {
    const progress: WordProgress = {
      ...baseProgress,
      state: input.result === "mastered" ? "mastered" : "reviewing",
      firstAssignedDate: baseProgress.firstAssignedDate ?? input.assignment.date,
      firstLearnedDate: baseProgress.firstLearnedDate ?? input.assignment.date,
      reviewStage: input.result === "mastered" ? REVIEW_INTERVALS.length : 0,
      nextReviewDate: input.result === "mastered" ? undefined : addDays(input.assignment.date, REVIEW_INTERVALS[0]),
      reviewCount: baseProgress.reviewCount ?? 0,
      recentReviewResult: baseProgress.recentReviewResult,
      isDifficult: baseProgress.isDifficult ?? false,
      difficultyReason: baseProgress.difficultyReason,
      overdueCount: baseProgress.overdueCount ?? 0,
      goalIds: Array.from(new Set([...(baseProgress.goalIds ?? []), input.assignment.goalId])),
      sourceBookIds: input.word.sourceBookIds,
      updatedAt: timestamp
    };
    return {
      assignment,
      progress,
      reviewAssignment:
        input.result === "mastered"
          ? undefined
          : buildReviewAssignment({
              goalId: input.assignment.goalId,
              wordId: input.assignment.wordId,
              date: addDays(input.assignment.date, REVIEW_INTERVALS[0]),
              reviewStage: 0,
              timestamp
            })
    };
  }

  return {
    assignment,
    progress: {
      ...baseProgress,
      state: "learning_backlog",
      firstAssignedDate: baseProgress.firstAssignedDate ?? input.assignment.date,
      reviewCount: baseProgress.reviewCount ?? 0,
      isDifficult: baseProgress.isDifficult ?? false,
      overdueCount: baseProgress.overdueCount ?? 0,
      goalIds: Array.from(new Set([...(baseProgress.goalIds ?? []), input.assignment.goalId])),
      sourceBookIds: input.word.sourceBookIds,
      updatedAt: timestamp
    }
  };
}

export function applyReviewResult(input: ReviewResultInput): ReviewResultOutput {
  const timestamp = input.completedAt ?? nowIso();
  const reviewRecord: ReviewHistoryRecord = {
    id: `review-history:${input.assignment.id}:${timestamp}`,
    goalId: input.assignment.goalId,
    wordId: input.assignment.wordId,
    assignmentId: input.assignment.id,
    date: input.assignment.date,
    reviewStage: input.assignment.reviewStage,
    result: input.result,
    createdAt: timestamp
  };

  if (input.result === "not_completed") {
    return {
      assignment: {
        ...input.assignment,
        status: "overdue",
        result: input.result,
        updatedAt: timestamp
      },
      progress: {
        ...input.progress,
        nextReviewDate: input.assignment.date,
        recentReviewResult: input.result,
        reviewCount: (input.progress.reviewCount ?? 0) + 1,
        overdueCount: (input.progress.overdueCount ?? 0) + 1,
        isDifficult: resolveDifficultFlag(input.progress, input.result),
        difficultyReason: resolveDifficultyReason(input.progress, input.result),
        updatedAt: timestamp
      },
      reviewRecord
    };
  }

  const next = resolveNextReview(input.assignment.reviewStage, input.result);
  const assignment: DailyReviewAssignment = {
    ...input.assignment,
    status: "completed",
    result: input.result,
    completedAt: timestamp,
    updatedAt: timestamp
  };
  const progress: WordProgress = {
    ...input.progress,
    state: next.mastered ? "mastered" : "reviewing",
    lastReviewDate: input.assignment.date,
    nextReviewDate: next.nextDate ? addDays(input.assignment.date, next.nextDate) : undefined,
    reviewStage: next.nextStage,
    reviewCount: (input.progress.reviewCount ?? 0) + 1,
    recentReviewResult: input.result,
    lapseCount: input.progress.lapseCount + (input.result === "forgot" ? 1 : 0),
    isDifficult: resolveDifficultFlag(input.progress, input.result),
    difficultyReason: resolveDifficultyReason(input.progress, input.result),
    updatedAt: timestamp
  };

  return {
    assignment,
    progress,
    reviewRecord,
    nextReviewAssignment: next.nextDate
      ? buildReviewAssignment({
          goalId: input.assignment.goalId,
          wordId: input.assignment.wordId,
          date: addDays(input.assignment.date, next.nextDate),
          reviewStage: next.nextStage,
          timestamp
        })
      : undefined
  };
}

export function selectWordsForGoal(words: WordItem[], goal: LearningGoal, progress: WordProgress[] = []): WordItem[] {
  const excludedWordIds = new Set(progress.filter((item) => item.state === "excluded").map((item) => item.wordId));
  const progressByWord = new Map(progress.map((item) => [item.wordId, item]));
  return words
    .filter((word) => {
      if (excludedWordIds.has(word.id)) {
        return false;
      }
      if (goal.selectedBookIds.length === 0) {
        return true;
      }
      return word.sourceBookIds.some((bookId) => goal.selectedBookIds.includes(bookId));
    })
    .map((word) => ({
      word,
      score: computeWordPriority(word, goal, progressByWord.get(word.id))
    }))
    .sort((a, b) => b.score - a.score || a.word.normalizedWord.localeCompare(b.word.normalizedWord) || a.word.id.localeCompare(b.word.id))
    .map((item) => item.word);
}

export function selectAvailableWords(words: WordItem[], progress: WordProgress[] = []): WordItem[] {
  const excludedWordIds = new Set(progress.filter((item) => item.state === "excluded").map((item) => item.wordId));
  return words
    .filter((word) => !excludedWordIds.has(word.id))
    .sort((a, b) => a.normalizedWord.localeCompare(b.normalizedWord) || a.id.localeCompare(b.id));
}

function createInitialProgress(word: WordItem, timestamp: string): WordProgress {
  return {
    wordId: word.id,
    state: "not_started",
    lapseCount: 0,
    sourceBookIds: word.sourceBookIds,
    reviewCount: 0,
    overdueCount: 0,
    isDifficult: false,
    goalIds: [],
    updatedAt: timestamp
  };
}

function getCompletedWordIds(progress: WordProgress[], assignments: DailyNewWordAssignment[]): string[] {
  const completed = new Set<string>();
  progress.forEach((item) => {
    if (item.state === "learned" || item.state === "reviewing" || item.state === "mastered") {
      completed.add(item.wordId);
    }
  });
  assignments.forEach((assignment) => {
    if (assignment.status === "learned" || assignment.status === "mastered") {
      completed.add(assignment.wordId);
    }
  });
  return Array.from(completed);
}

function getBacklogWordIds(
  progress: WordProgress[],
  assignments: DailyNewWordAssignment[],
  asOfDate: LocalDateString
): string[] {
  const backlog = new Set<string>();
  progress.forEach((item) => {
    if (item.state === "learning_backlog") {
      backlog.add(item.wordId);
    }
  });
  assignments.forEach((assignment) => {
    if (assignment.status === "skipped" || assignment.status === "missed") {
      backlog.add(assignment.wordId);
    }
  });
  return Array.from(backlog);
}

function isClosedNewAssignment(status: NewWordAssignmentStatus): boolean {
  return status === "learned" || status === "mastered" || status === "skipped" || status === "missed";
}

function isOpenNewAssignment(status: NewWordAssignmentStatus): boolean {
  return status === "planned" || status === "rescheduled";
}

function isOpenReviewAssignment(status: DailyReviewAssignment["status"]): boolean {
  return status === "planned" || status === "rescheduled";
}

function getBufferDates(studyDates: LocalDateString[], ratio: number): Set<LocalDateString> {
  const bufferCount = Math.floor(studyDates.length * ratio);
  if (bufferCount <= 0) {
    return new Set();
  }
  return new Set(studyDates.slice(-bufferCount));
}

interface NewWordScheduleItem {
  word: WordItem;
  status: Extract<NewWordAssignmentStatus, "planned" | "rescheduled">;
}

function scheduleNewWordsByLoad(input: {
  items: NewWordScheduleItem[];
  goal: LearningGoal;
  effectiveDates: LocalDateString[];
  capacityByDate: Map<LocalDateString, number>;
  existingNewCountByDate: Map<LocalDateString, number>;
  reviewCountByDate: Map<LocalDateString, number>;
  progressMap: Map<string, WordProgress>;
  timestamp: string;
  rescheduledFrom?: (wordId: string) => LocalDateString | undefined;
}): { assignments: DailyNewWordAssignment[]; overflow: number; newCountByDate: Map<LocalDateString, number> } {
  const assignments: DailyNewWordAssignment[] = [];
  const newCountByDate = new Map<LocalDateString, number>();
  input.effectiveDates.forEach((date) => {
    newCountByDate.set(date, input.existingNewCountByDate.get(date) ?? 0);
  });
  if (input.items.length === 0 || input.effectiveDates.length === 0) {
    return { assignments, overflow: input.items.length, newCountByDate };
  }

  const dailyAverage = Math.ceil(input.items.length / input.effectiveDates.length);
  const smoothExtra = Math.max(2, Math.ceil(dailyAverage * 0.2));
  const maxNewByDate = new Map(
    input.effectiveDates.map((date) => [
      date,
      Math.min(
        (input.capacityByDate.get(date) ?? 0) + (input.existingNewCountByDate.get(date) ?? 0),
        dailyAverage + smoothExtra
      )
    ])
  );
  let overflow = 0;

  for (const item of input.items) {
    const date = findBestDateForNewWord({
      dates: input.effectiveDates,
      capacityByDate: input.capacityByDate,
      newCountByDate,
      reviewCountByDate: input.reviewCountByDate,
      maxNewByDate
    });
    if (!date) {
      overflow += 1;
      continue;
    }

    const remaining = input.capacityByDate.get(date) ?? 0;
    input.capacityByDate.set(date, remaining - 1);
    newCountByDate.set(date, (newCountByDate.get(date) ?? 0) + 1);
    assignments.push({
      id: `new:${input.goal.id}:${date}:${item.word.id}`,
      goalId: input.goal.id,
      date,
      wordId: item.word.id,
      status: item.status,
      rescheduledFrom: item.status === "rescheduled" ? input.rescheduledFrom?.(item.word.id) : undefined,
      createdAt: input.timestamp,
      updatedAt: input.timestamp
    });
    const progress = input.progressMap.get(item.word.id);
    input.progressMap.set(item.word.id, {
      ...(progress ?? createInitialProgress(item.word, input.timestamp)),
      state: item.status === "rescheduled" ? "learning_backlog" : "assigned_new",
      firstAssignedDate: progress?.firstAssignedDate ?? date,
      sourceBookIds: item.word.sourceBookIds,
      updatedAt: input.timestamp
    });
  }
  return { assignments, overflow, newCountByDate };
}

function findBestDateForNewWord(input: {
  dates: LocalDateString[];
  capacityByDate: Map<LocalDateString, number>;
  newCountByDate: Map<LocalDateString, number>;
  reviewCountByDate: Map<LocalDateString, number>;
  maxNewByDate: Map<LocalDateString, number>;
}): LocalDateString | null {
  let bestDate: LocalDateString | null = null;
  let bestLoad = Number.POSITIVE_INFINITY;
  let bestNewCount = Number.POSITIVE_INFINITY;
  for (const date of input.dates) {
    const capacity = input.capacityByDate.get(date) ?? 0;
    const newCount = input.newCountByDate.get(date) ?? 0;
    const maxNew = input.maxNewByDate.get(date) ?? 0;
    if (capacity <= 0 || newCount >= maxNew) {
      continue;
    }
    const projectedLoad = newCount + 1 + (input.reviewCountByDate.get(date) ?? 0) * REVIEW_LOAD_WEIGHT;
    if (
      projectedLoad < bestLoad ||
      (projectedLoad === bestLoad && newCount < bestNewCount) ||
      (projectedLoad === bestLoad && newCount === bestNewCount && (!bestDate || compareDates(date, bestDate) < 0))
    ) {
      bestDate = date;
      bestLoad = projectedLoad;
      bestNewCount = newCount;
    }
  }
  return bestDate;
}

function countReviewsByDate(assignments: DailyReviewAssignment[], dates: LocalDateString[]): Map<LocalDateString, number> {
  const dateSet = new Set(dates);
  const counts = new Map(dates.map((date) => [date, 0]));
  assignments.forEach((assignment) => {
    if (!dateSet.has(assignment.date)) {
      return;
    }
    if (assignment.status === "planned" || assignment.status === "rescheduled" || assignment.status === "overdue") {
      counts.set(assignment.date, (counts.get(assignment.date) ?? 0) + 1);
    }
  });
  return counts;
}

function findOriginalAssignmentDate(assignments: DailyNewWordAssignment[]): (wordId: string) => LocalDateString | undefined {
  const byWord = new Map<string, LocalDateString>();
  assignments.forEach((assignment) => {
    if (!byWord.has(assignment.wordId)) {
      byWord.set(assignment.wordId, assignment.date);
    }
  });
  return (wordId) => byWord.get(wordId);
}

function scheduleReviewAssignments(input: {
  goal: LearningGoal;
  asOfDate: LocalDateString;
  existingFutureReviews: DailyReviewAssignment[];
  overdueReviews: DailyReviewAssignment[];
  preservedReviews: DailyReviewAssignment[];
  effectiveDates: LocalDateString[];
  timestamp: string;
}): { assignments: DailyReviewAssignment[]; overflow: number } {
  const assignments = input.existingFutureReviews.map((assignment) => ({ ...assignment }));
  const reviewCapacityByDate = new Map(input.effectiveDates.map((date) => [date, input.goal.dailyReviewLimit]));
  input.preservedReviews.forEach((assignment) => {
    if (reviewCapacityByDate.has(assignment.date)) {
      reviewCapacityByDate.set(assignment.date, Math.max(0, (reviewCapacityByDate.get(assignment.date) ?? 0) - 1));
    }
  });
  assignments.forEach((assignment) => {
    if (assignment.status !== "completed" && reviewCapacityByDate.has(assignment.date)) {
      reviewCapacityByDate.set(assignment.date, Math.max(0, (reviewCapacityByDate.get(assignment.date) ?? 0) - 1));
    }
  });
  const reviewCountByDate = new Map(input.effectiveDates.map((date) => [date, input.goal.dailyReviewLimit - (reviewCapacityByDate.get(date) ?? 0)]));

  let overflow = 0;
  for (const overdue of input.overdueReviews) {
    const targetDate = findLowestReviewDate(input.effectiveDates, reviewCapacityByDate, reviewCountByDate);
    if (!targetDate) {
      overflow += 1;
      continue;
    }
    reviewCapacityByDate.set(targetDate, (reviewCapacityByDate.get(targetDate) ?? 0) - 1);
    reviewCountByDate.set(targetDate, (reviewCountByDate.get(targetDate) ?? 0) + 1);
    assignments.push({
      ...buildReviewAssignment({
        goalId: input.goal.id,
        wordId: overdue.wordId,
        date: targetDate,
        reviewStage: overdue.reviewStage,
        timestamp: input.timestamp
      }),
      status: "rescheduled",
      rescheduledFrom: overdue.date
    });
  }
  return { assignments, overflow };
}

function findLowestReviewDate(
  dates: LocalDateString[],
  capacityByDate: Map<LocalDateString, number>,
  reviewCountByDate: Map<LocalDateString, number>
): LocalDateString | null {
  let bestDate: LocalDateString | null = null;
  let bestCount = Number.POSITIVE_INFINITY;
  for (const date of dates) {
    if ((capacityByDate.get(date) ?? 0) <= 0) {
      continue;
    }
    const count = reviewCountByDate.get(date) ?? 0;
    if (count < bestCount || (count === bestCount && (!bestDate || compareDates(date, bestDate) < 0))) {
      bestDate = date;
      bestCount = count;
    }
  }
  return bestDate;
}

function buildReviewAssignment(input: {
  goalId: string;
  wordId: string;
  date: LocalDateString;
  reviewStage: number;
  timestamp: string;
}): DailyReviewAssignment {
  return {
    id: `review:${input.goalId}:${input.date}:${input.wordId}:stage-${input.reviewStage}`,
    goalId: input.goalId,
    date: input.date,
    wordId: input.wordId,
    reviewStage: input.reviewStage,
    status: "planned",
    createdAt: input.timestamp,
    updatedAt: input.timestamp
  };
}

function resolveNextReview(stage: number, result: ReviewResult): {
  nextStage: number;
  nextDate?: number;
  mastered: boolean;
} {
  if (result === "forgot") {
    return { nextStage: Math.max(0, stage), nextDate: 1, mastered: false };
  }
  if (result === "vague") {
    const nextStage = Math.min(stage + 1, REVIEW_INTERVALS.length - 1);
    const normal = REVIEW_INTERVALS[nextStage] ?? 30;
    return { nextStage, nextDate: Math.max(1, Math.floor(normal / 2)), mastered: false };
  }
  if (result === "known") {
    const nextStage = stage + 1;
    if (nextStage >= REVIEW_INTERVALS.length) {
      return { nextStage, mastered: true };
    }
    return { nextStage, nextDate: REVIEW_INTERVALS[nextStage], mastered: false };
  }
  if (result === "easy") {
    const nextStage = stage + 2;
    if (nextStage >= REVIEW_INTERVALS.length) {
      return { nextStage, mastered: true };
    }
    return { nextStage, nextDate: REVIEW_INTERVALS[nextStage], mastered: false };
  }
  return { nextStage: stage, mastered: false };
}

function buildDailySummaries(input: {
  goal: LearningGoal;
  planId: string;
  asOfDate: LocalDateString;
  newAssignments: DailyNewWordAssignment[];
  reviewAssignments: DailyReviewAssignment[];
  existingDailyTasks: DailyTaskSummary[];
  bufferDates: Set<LocalDateString>;
  coverage: PlanCoverageStatus;
}): DailyTaskSummary[] {
  const historicalTasks = input.existingDailyTasks.filter((task) => compareDates(task.date, input.asOfDate) < 0);
  const futureDates = enumerateDateRange(input.asOfDate, input.goal.deadline);
  const summaries = futureDates.map((date): DailyTaskSummary => {
    const dayNew = input.newAssignments.filter((assignment) => assignment.date === date);
    const dayReviews = input.reviewAssignments.filter((assignment) => assignment.date === date);
    const isRestDay = isRestDate(date, input.goal.restWeekdays);
    const originalNewWordCount = dayNew.filter((assignment) => assignment.status === "planned").length;
    const catchUpNewWordCount = dayNew.filter((assignment) => assignment.status === "rescheduled").length;
    const boundNewWordCount = originalNewWordCount + catchUpNewWordCount;
    const plannedReviewCount = dayReviews.filter((assignment) => assignment.status === "planned" || assignment.status === "rescheduled").length;
    const completedNewWordCount = dayNew.filter((assignment) => assignment.status === "learned" || assignment.status === "mastered").length;
    const completedReviewCount = dayReviews.filter((assignment) => assignment.status === "completed").length;
    const overdueReviewCount = dayReviews.filter((assignment) => assignment.status === "overdue" || assignment.status === "rescheduled").length;
    const learningBacklogCount = dayNew.filter((assignment) => assignment.status === "skipped" || assignment.status === "missed").length;
    const load = computeDailyLoad(boundNewWordCount, plannedReviewCount);
    const comfortableLoad = computeComfortableLoad(input.goal.dailyNewWordLimit, input.goal.dailyReviewLimit);
    const hardLoadLimit = computeHardLoadLimit(input.goal.dailyNewWordLimit, input.goal.dailyReviewLimit);
    const capacityStatus = resolveCapacityStatus({
      isRestDay,
      newCount: boundNewWordCount,
      reviewCount: plannedReviewCount,
      newLimit: input.goal.dailyNewWordLimit,
      reviewLimit: input.goal.dailyReviewLimit,
      totalLoad: load,
      comfortableLoad,
      hardLoadLimit
    });
    return {
      id: `task:${input.goal.id}:${date}`,
      goalId: input.goal.id,
      planId: input.planId,
      date,
      plannedNewWordCount: boundNewWordCount,
      boundNewWordCount,
      completedNewWordCount,
      learningBacklogCount,
      plannedReviewCount,
      completedReviewCount,
      overdueReviewCount,
      inventoryGapCount: input.coverage.inventoryGapCount,
      isBufferDay: input.bufferDates.has(date),
      isRestDay,
      originalNewWordCount,
      catchUpNewWordCount,
      adjustedNewWordCount: boundNewWordCount,
      totalLoad: load,
      comfortableLoad,
      hardLoadLimit,
      isDynamicallyAdjusted: catchUpNewWordCount > 0 || overdueReviewCount > 0,
      dynamicAdjustmentReason: buildDynamicAdjustmentReason(catchUpNewWordCount, overdueReviewCount),
      capacityStatus,
      feasibilityStatus: "feasible",
      adjustmentReason: buildDailyReason({
        originalNewWordCount,
        catchUpNewWordCount,
        reviewCount: plannedReviewCount,
        overdueReviewCount,
        inventoryGap: input.coverage.inventoryGapCount,
        isRestDay,
        capacityStatus
      })
    };
  });
  return [...historicalTasks, ...summaries].sort((a, b) => compareDates(a.date, b.date));
}

function computeDailyLoad(newCount: number, reviewCount: number): number {
  return Number((newCount + reviewCount * REVIEW_LOAD_WEIGHT).toFixed(1));
}

function computeComfortableLoad(newLimit: number, reviewLimit: number): number {
  return Number((newLimit + reviewLimit * REVIEW_LOAD_WEIGHT * 0.75).toFixed(1));
}

function computeHardLoadLimit(newLimit: number, reviewLimit: number): number {
  return Number((newLimit + reviewLimit * REVIEW_LOAD_WEIGHT).toFixed(1));
}

function resolveCapacityStatus(input: {
  isRestDay: boolean;
  newCount: number;
  reviewCount: number;
  newLimit: number;
  reviewLimit: number;
  totalLoad: number;
  comfortableLoad: number;
  hardLoadLimit: number;
}): DailyTaskSummary["capacityStatus"] {
  if (input.isRestDay) {
    return "rest";
  }
  if (input.newCount > input.newLimit || input.reviewCount > input.reviewLimit || input.totalLoad > input.hardLoadLimit) {
    return "over_limit";
  }
  if (
    input.totalLoad > input.comfortableLoad ||
    input.newCount >= Math.ceil(input.newLimit * 0.9) ||
    (input.reviewLimit > 0 && input.reviewCount >= Math.ceil(input.reviewLimit * 0.9))
  ) {
    return "near_limit";
  }
  if (input.totalLoad < input.comfortableLoad * 0.7) {
    return "light";
  }
  return "ok";
}

function buildDynamicAdjustmentReason(catchUpNewWordCount: number, overdueReviewCount: number): string | undefined {
  const notes: string[] = [];
  if (catchUpNewWordCount > 0) {
    notes.push(`含 ${catchUpNewWordCount} 个待补学新词`);
  }
  if (overdueReviewCount > 0) {
    notes.push(`含 ${overdueReviewCount} 个待补复习`);
  }
  return notes.length > 0 ? notes.join("，") : undefined;
}

function buildDailyReason(input: {
  originalNewWordCount: number;
  catchUpNewWordCount: number;
  reviewCount: number;
  overdueReviewCount: number;
  inventoryGap: number;
  isRestDay: boolean;
  capacityStatus: DailyTaskSummary["capacityStatus"];
}): string {
  if (input.isRestDay) {
    return "固定休息日，不安排新词或复习";
  }
  const notes = [`安排 ${input.originalNewWordCount + input.catchUpNewWordCount} 个新词`, `复习 ${input.reviewCount} 个`];
  if (input.catchUpNewWordCount > 0) {
    notes.push(`其中 ${input.catchUpNewWordCount} 个是前面没完成后分摊来的待补学`);
  }
  if (input.overdueReviewCount > 0) {
    notes.push(`含 ${input.overdueReviewCount} 个待补复习`);
  }
  if (input.capacityStatus === "near_limit") {
    notes.push("今日任务偏多，但仍在上限内");
  }
  if (input.capacityStatus === "over_limit") {
    notes.push("今日任务超过当前上限");
  }
  if (input.inventoryGap > 0) {
    notes.push(`当前词表还差 ${input.inventoryGap} 个词，暂时不能完整安排`);
  }
  return notes.join("；");
}

function resolveFeasibilityStatus(input: {
  coverage: PlanCoverageStatus;
  remainingEffectiveDays: number;
  requiredDailyAverage: number;
  dailyNewWordLimit: number;
  reviewOverflow: number;
  newWordOverflow: number;
}): FeasibilityStatus {
  if (input.coverage.completedWordCount >= input.coverage.targetRequiredCount) {
    return "completed";
  }
  if (
    input.remainingEffectiveDays === 0 ||
    input.requiredDailyAverage > input.dailyNewWordLimit ||
    input.reviewOverflow > 0 ||
    input.newWordOverflow > 0
  ) {
    return "infeasible";
  }
  if (
    input.coverage.inventoryGapCount > 0 ||
    input.coverage.learningBacklogCount > 0 ||
    input.coverage.overdueReviewCount > 0 ||
    input.requiredDailyAverage >= Math.ceil(input.dailyNewWordLimit * 0.9)
  ) {
    return "atRisk";
  }
  return "feasible";
}

function buildPlanReason(input: {
  baseReason: string;
  feasibilityStatus: FeasibilityStatus;
  coverage: PlanCoverageStatus;
  remainingEffectiveDays: number;
  requiredDailyAverage: number;
  dailyLimitGap: number;
  reviewOverflow: number;
  newWordOverflow: number;
  dailyNewWordLimit: number;
}): string {
  const notes = [input.baseReason];
  if (input.coverage.inventoryGapCount > 0) {
    notes.push(`当前词表还差 ${input.coverage.inventoryGapCount} 个词，这部分不计为用户未完成`);
  }
  if (input.coverage.learningBacklogCount > 0) {
    notes.push(`待补学 ${input.coverage.learningBacklogCount} 个，已保留具体单词并尽量分摊到后续学习日`);
  }
  if (input.coverage.overdueReviewCount > 0) {
    notes.push(`待补复习 ${input.coverage.overdueReviewCount} 个，优先安排到复习压力较低的日期`);
  }
  if (input.feasibilityStatus === "infeasible") {
    notes.push(
      `当前设置下无法按期完成：剩余有效学习日 ${input.remainingEffectiveDays} 天，至少需要每天 ${input.requiredDailyAverage} 个新词，当前每日新词上限 ${input.dailyNewWordLimit} 个`
    );
  }
  if (input.newWordOverflow > 0) {
    notes.push(`仍有 ${input.newWordOverflow} 个新词无法放入截止日前的学习日`);
  }
  if (input.reviewOverflow > 0) {
    notes.push(`复习容量不足，仍有 ${input.reviewOverflow} 个复习任务无法安排`);
  }
  return notes.join("；");
}

function computeRequiredDailyAverage(remainingTarget: number, effectiveDays: number): number {
  if (remainingTarget <= 0) {
    return 0;
  }
  if (effectiveDays <= 0) {
    return remainingTarget;
  }
  return Math.ceil(remainingTarget / effectiveDays);
}

function emptyCoverage(goal: LearningGoal): PlanCoverageStatus {
  return {
    targetRequiredCount: goal.targetRequiredCount,
    availableWordCount: 0,
    enabledWordCount: 0,
    assignedWordCount: 0,
    completedWordCount: 0,
    reviewingWordCount: 0,
    masteredWordCount: 0,
    inventoryGapCount: goal.targetRequiredCount,
    learningBacklogCount: 0,
    overdueReviewCount: 0
  };
}

function computeWordPriority(word: WordItem, goal: LearningGoal, progress?: WordProgress): number {
  let score = word.priorityScore ?? 0;
  const selectedIndex = word.sourceBookIds
    .map((bookId) => goal.selectedBookIds.indexOf(bookId))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (selectedIndex !== undefined) {
    score += Math.max(0, 100 - selectedIndex * 10);
  }
  if (word.stageHint === "foundation" && goal.needsFoundationRepair) {
    score += 35;
  }
  if (word.stageHint === "core") {
    score += 25;
  }
  if (word.tags.some((tag) => /核心|高频|core|high/i.test(tag))) {
    score += 18;
  }
  if (word.tags.some((tag) => /基础|foundation/i.test(tag)) && goal.needsFoundationRepair) {
    score += 14;
  }
  if (progress?.state === "not_started" || !progress) {
    score += 5;
  }
  if (progress?.state === "mastered" || progress?.state === "excluded") {
    score -= 1000;
  }
  return score;
}

function resolveDifficultFlag(progress: WordProgress, result: ReviewResult): boolean {
  const nextLapses = progress.lapseCount + (result === "forgot" ? 1 : 0);
  const nextOverdue = (progress.overdueCount ?? 0) + (result === "not_completed" ? 1 : 0);
  if (nextLapses >= 2 || nextOverdue >= 2) {
    return true;
  }
  return result === "forgot" || (progress.recentReviewResult === "vague" && result === "vague") || progress.isDifficult === true;
}

function resolveDifficultyReason(progress: WordProgress, result: ReviewResult): string | undefined {
  if (result === "forgot") {
    return "复习中选择“不认识”，标记为重点遗忘词";
  }
  if (progress.recentReviewResult === "vague" && result === "vague") {
    return "连续两次复习结果为“模糊”";
  }
  if (((progress.overdueCount ?? 0) + (result === "not_completed" ? 1 : 0)) >= 2) {
    return "多次逾期或未完成复习";
  }
  return progress.difficultyReason;
}

function buildStagePlans(
  goal: LearningGoal,
  plan: StudyPlan,
  dailyTasks: DailyTaskSummary[],
  asOfDate: LocalDateString,
  timestamp: string
): StagePlan[] {
  const effectiveTasks = dailyTasks.filter((task) => !task.isRestDay);
  if (effectiveTasks.length === 0) {
    return [];
  }
  const stageDefs: Array<{ name: string; role: StagePlan["role"]; ratio: number; riskNote: string }> = [
    { name: "基础补齐", role: "foundation", ratio: goal.needsFoundationRepair ? 0.35 : 0.2, riskNote: "优先处理基础词和历史待补学" },
    { name: "目标核心", role: "core", ratio: 0.5, riskNote: "覆盖当前目标启用词书中的核心范围" },
    { name: "复习冲刺", role: "sprint", ratio: goal.needsFoundationRepair ? 0.15 : 0.3, riskNote: "降低新词压力，集中处理复习和逾期" }
  ];
  let cursor = 0;
  return stageDefs.map((stage, index) => {
    const isLast = index === stageDefs.length - 1;
    const length = isLast ? effectiveTasks.length - cursor : Math.max(1, Math.round(effectiveTasks.length * stage.ratio));
    const segment = effectiveTasks.slice(cursor, Math.max(cursor + length, cursor + 1));
    cursor += length;
    const startDate = segment[0]?.date ?? asOfDate;
    const endDate = segment[segment.length - 1]?.date ?? goal.deadline;
    const plannedNewWordCount = sumTasks(segment, "boundNewWordCount");
    const plannedReviewCount = sumTasks(segment, "plannedReviewCount");
    const status = compareDates(endDate, asOfDate) < 0 ? "completed" : compareDates(startDate, asOfDate) <= 0 ? "active" : plan.feasibilityStatus === "infeasible" ? "atRisk" : "planned";
    return {
      id: `stage:${goal.id}:${index + 1}`,
      goalId: goal.id,
      goalVersionId: goal.activeGoalVersionId,
      name: stage.name,
      role: stage.role,
      startDate,
      endDate,
      plannedNewWordCount,
      plannedReviewCount,
      targetBookIds: goal.selectedBookIds,
      status,
      riskNote: plan.coverage.inventoryGapCount > 0 ? `${stage.riskNote}；当前词库缺口 ${plan.coverage.inventoryGapCount}` : stage.riskNote,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  });
}

function buildWeeklyReviewRecords(
  goal: LearningGoal,
  weeklyPlans: WeeklyPlanSummary[],
  progress: WordProgress[],
  plan: StudyPlan,
  timestamp: string
): WeeklyReviewRecord[] {
  const difficultWordCount = progress.filter((item) => item.isDifficult).length;
  const masteredWords = progress.filter((item) => item.state === "mastered").length;
  return weeklyPlans.map((week, index) => {
    const nextWeek = weeklyPlans[index + 1];
    const load = week.plannedNewWords + week.plannedReviews;
    const nextLoad = nextWeek ? nextWeek.plannedNewWords + nextWeek.plannedReviews : 0;
    return {
      id: `weekly-review:${goal.id}:${week.weekStart}`,
      goalId: goal.id,
      weekStart: week.weekStart,
      weekEnd: week.weekEnd,
      plannedNewWords: week.plannedNewWords,
      actualNewWords: week.completedNewWords,
      plannedReviews: week.plannedReviews,
      actualReviews: week.completedReviews,
      newLearningBacklog: week.backlogWords,
      newOverdueReviews: week.overdueReviews,
      newlyMasteredWords: masteredWords,
      difficultWordCount,
      inventoryGapChange: plan.coverage.inventoryGapCount,
      nextWeekLoadChange: nextLoad - load,
      status: plan.feasibilityStatus,
      explanation: `本周计划新学 ${week.plannedNewWords}，实际 ${week.completedNewWords}；待补学 ${week.backlogWords}，逾期复习 ${week.overdueReviews}；下一周负荷变化 ${nextLoad - load}`,
      createdAt: timestamp
    };
  });
}

function buildMonthlyReviewRecords(
  goal: LearningGoal,
  stagePlans: StagePlan[],
  monthlyPlans: MonthlyPlanSummary[],
  progress: WordProgress[],
  plan: StudyPlan,
  timestamp: string
): MonthlyReviewRecord[] {
  const masteredWords = progress.filter((item) => item.state === "mastered").length;
  return monthlyPlans.map((month, index) => {
    const stage = stagePlans.find((item) => month.month >= monthKey(item.startDate) && month.month <= monthKey(item.endDate)) ?? stagePlans[0];
    const nextMonth = monthlyPlans[index + 1];
    return {
      id: `monthly-review:${goal.id}:${month.month}`,
      goalId: goal.id,
      month: month.month,
      stageGoal: stage?.name ?? "长期目标推进",
      plannedNewWords: month.plannedNewWords,
      actualNewWords: month.completedNewWords,
      plannedReviews: month.plannedReviews,
      actualReviews: month.completedReviews,
      masteredWords,
      reviewPressure: month.plannedReviews,
      importedWordCount: plan.coverage.enabledWordCount,
      accumulatedBacklog: month.backlogWords,
      longTermStatus: plan.feasibilityStatus,
      nextMonthExpectedLoad: nextMonth ? nextMonth.plannedNewWords + nextMonth.plannedReviews : 0,
      explanation: `${month.month} 阶段为 ${stage?.name ?? "长期目标推进"}，计划新学 ${month.plannedNewWords}，复习压力 ${month.plannedReviews}，累计待补学 ${month.backlogWords}`,
      createdAt: timestamp
    };
  });
}

function summarizePlan(
  goal: LearningGoal,
  plan: StudyPlan,
  dailyTasks: DailyTaskSummary[],
  asOfDate: LocalDateString
): {
  longTerm: LongTermPlanSummary;
  monthlyPlans: MonthlyPlanSummary[];
  weeklyPlans: WeeklyPlanSummary[];
} {
  const estimatedCompletionDate = estimateCompletionDate(goal.targetRequiredCount, plan.coverage.completedWordCount, dailyTasks, asOfDate);
  const longTerm: LongTermPlanSummary = {
    totalTargetWords: goal.targetRequiredCount,
    availableWordCount: plan.coverage.availableWordCount,
    assignedWordCount: plan.coverage.assignedWordCount,
    completedNewWords: plan.coverage.completedWordCount,
    inventoryGapCount: plan.coverage.inventoryGapCount,
    learningBacklogCount: plan.coverage.learningBacklogCount,
    overdueReviewCount: plan.coverage.overdueReviewCount,
    remainingEffectiveDays: plan.remainingEffectiveDays,
    estimatedCompletionDate,
    feasibilityStatus: plan.feasibilityStatus,
    requiredDailyAverage: plan.requiredDailyAverage,
    stageSummaries: buildStageSummaries(goal, plan.coverage)
  };

  return {
    longTerm,
    monthlyPlans: buildMonthlySummaries(goal, dailyTasks, plan.coverage.completedWordCount),
    weeklyPlans: buildWeeklySummaries(dailyTasks)
  };
}

function estimateCompletionDate(
  targetRequiredCount: number,
  completedNewWords: number,
  tasks: DailyTaskSummary[],
  asOfDate: LocalDateString
): LocalDateString | null {
  let cumulative = completedNewWords;
  const futureTasks = tasks.filter((task) => compareDates(task.date, asOfDate) >= 0).sort((a, b) => compareDates(a.date, b.date));
  for (const task of futureTasks) {
    cumulative += task.boundNewWordCount;
    if (cumulative >= targetRequiredCount) {
      return task.date;
    }
  }
  return completedNewWords >= targetRequiredCount ? asOfDate : null;
}

function buildStageSummaries(goal: LearningGoal, coverage: PlanCoverageStatus): string[] {
  const firstStage = Math.ceil(goal.targetRequiredCount * 0.35);
  const secondStage = Math.ceil(goal.targetRequiredCount * 0.75);
  return [
    `基础推进：累计 ${firstStage} 个具体新词前以稳定输入为主`,
    `强化巩固：累计 ${secondStage} 个具体新词前保持复习节奏`,
    `词库供给：当前 ${coverage.availableWordCount} 个可用去重词，缺口 ${coverage.inventoryGapCount} 个`,
    `当前完成 ${coverage.completedWordCount} / ${goal.targetRequiredCount}，待补学 ${coverage.learningBacklogCount} 个`
  ];
}

function buildMonthlySummaries(goal: LearningGoal, tasks: DailyTaskSummary[], completedNewWords: number): MonthlyPlanSummary[] {
  const groups = new Map<string, DailyTaskSummary[]>();
  tasks.forEach((task) => {
    const key = monthKey(task.date);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });

  let projected = completedNewWords;
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthTasks]) => {
      const plannedNewWords = sumTasks(monthTasks, "boundNewWordCount");
      projected += plannedNewWords;
      return {
        month,
        plannedNewWords,
        plannedReviews: sumTasks(monthTasks, "plannedReviewCount"),
        completedNewWords: sumTasks(monthTasks, "completedNewWordCount"),
        completedReviews: sumTasks(monthTasks, "completedReviewCount"),
        backlogWords: sumTasks(monthTasks, "learningBacklogCount"),
        overdueReviews: sumTasks(monthTasks, "overdueReviewCount"),
        bufferDays: monthTasks.filter((task) => task.isBufferDay && !task.isRestDay).length,
        completionRate: plannedNewWords > 0 ? sumTasks(monthTasks, "completedNewWordCount") / plannedNewWords : 0,
        projectedCumulativeRate: Math.min(1, projected / goal.targetRequiredCount)
      };
    });
}

function buildWeeklySummaries(tasks: DailyTaskSummary[]): WeeklyPlanSummary[] {
  const groups = new Map<string, DailyTaskSummary[]>();
  tasks.forEach((task) => {
    const key = startOfIsoWeek(task.date);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => compareDates(a, b))
    .map(([weekStart, weekTasks]) => {
      const plannedNewWords = sumTasks(weekTasks, "boundNewWordCount");
      return {
        weekStart,
        weekEnd: endOfIsoWeek(weekStart),
        plannedNewWords,
        plannedReviews: sumTasks(weekTasks, "plannedReviewCount"),
        completedNewWords: sumTasks(weekTasks, "completedNewWordCount"),
        completedReviews: sumTasks(weekTasks, "completedReviewCount"),
        backlogWords: sumTasks(weekTasks, "learningBacklogCount"),
        overdueReviews: sumTasks(weekTasks, "overdueReviewCount"),
        completionRate: plannedNewWords > 0 ? sumTasks(weekTasks, "completedNewWordCount") / plannedNewWords : 0
      };
    });
}

function sumTasks(tasks: DailyTaskSummary[], field: keyof Pick<
  DailyTaskSummary,
  | "boundNewWordCount"
  | "plannedReviewCount"
  | "completedNewWordCount"
  | "completedReviewCount"
  | "learningBacklogCount"
  | "overdueReviewCount"
>): number {
  return tasks.reduce((sum, task) => sum + Number(task[field]), 0);
}

function compareNewAssignments(a: DailyNewWordAssignment, b: DailyNewWordAssignment): number {
  return compareDates(a.date, b.date) || a.wordId.localeCompare(b.wordId);
}

function compareReviewAssignments(a: DailyReviewAssignment, b: DailyReviewAssignment): number {
  return compareDates(a.date, b.date) || a.wordId.localeCompare(b.wordId) || a.reviewStage - b.reviewStage;
}
