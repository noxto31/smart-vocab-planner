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
  DailyTask,
  FeasibilityStatus,
  GeneratedPlanResult,
  LocalDateString,
  LongTermPlanSummary,
  MonthlyPlanSummary,
  PlanAdjustmentLog,
  PlanStyle,
  ProgressRecord,
  StudyPlan,
  UserGoal,
  WeeklyPlanSummary,
  WordItem
} from "./types";

const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

export interface GeneratePlanInput {
  goal: UserGoal;
  words: WordItem[];
  progressRecords: ProgressRecord[];
  existingTasks?: DailyTask[];
  asOfDate: LocalDateString;
  version: number;
  triggerType: AdjustmentTrigger;
  reason: string;
}

export interface DailyRecordInput {
  goalId: string;
  date: LocalDateString;
  newWordsCompleted: number;
  reviewsCompleted: number;
  minutesSpent: number;
  note: string;
}

export function validateGoal(goal: UserGoal): string[] {
  const errors: string[] = [];
  if (compareDates(goal.startDate, goal.deadline) > 0) {
    errors.push("开始日期不能晚于截止日期");
  }
  if (!Number.isInteger(goal.targetVocabularyCount) || goal.targetVocabularyCount <= 0) {
    errors.push("目标词汇量必须是正整数");
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
  return errors;
}

export function generateStudyPlan(input: GeneratePlanInput): GeneratedPlanResult {
  const goalErrors = validateGoal(input.goal);
  if (goalErrors.length > 0) {
    throw new Error(goalErrors.join("；"));
  }

  const selectedWords = selectWordsForGoal(input.words, input.goal);
  const sourceBookNames = Array.from(new Set(selectedWords.flatMap((word) => word.sourceBookNames))).slice(0, 4);
  const completedNewWords = sumProgress(input.progressRecords, "newWordsCompleted");
  const remainingNewWords = Math.max(input.goal.targetVocabularyCount - completedNewWords, 0);
  const allFutureDates = enumerateDateRange(input.asOfDate, input.goal.deadline);
  const futureStudyDates = allFutureDates.filter((date) => !isRestDate(date, input.goal.restWeekdays));
  const bufferDates = getBufferDates(futureStudyDates, input.goal.bufferDayRatio);
  const primaryDates = futureStudyDates.filter((date) => !bufferDates.has(date));
  const remainingEffectiveDays = futureStudyDates.length;
  const requiredDailyAverage =
    remainingNewWords === 0 ? 0 : remainingEffectiveDays === 0 ? remainingNewWords : Math.ceil(remainingNewWords / remainingEffectiveDays);
  const capacityAll = remainingEffectiveDays * input.goal.dailyNewWordLimit;
  const capacityPrimary = primaryDates.length * input.goal.dailyNewWordLimit;
  const usesBufferForNewWords = remainingNewWords > capacityPrimary && remainingNewWords <= capacityAll;
  const allocationDates = usesBufferForNewWords || remainingNewWords > capacityPrimary ? futureStudyDates : primaryDates;
  const feasibleByNewWords = remainingNewWords <= capacityAll && (remainingNewWords === 0 || remainingEffectiveDays > 0);
  const newWordsToSchedule = feasibleByNewWords ? remainingNewWords : Math.min(remainingNewWords, capacityAll);
  const plannedNewByDate = allocateNewWords(
    newWordsToSchedule,
    allocationDates,
    input.goal.dailyNewWordLimit,
    input.goal.planStyle
  );

  const planId = `plan:${input.goal.id}:${input.version}`;
  const futureTasksWithoutReviews = allFutureDates.map((date) =>
    buildFutureTask({
      date,
      goal: input.goal,
      planId,
      plannedNewWordCount: plannedNewByDate.get(date) ?? 0,
      plannedReviewCount: 0,
      isBufferDay: bufferDates.has(date),
      sourceBookNames,
      reason: input.reason
    })
  );

  const reviewResult = scheduleReviewCounts({
    goal: input.goal,
    progressRecords: input.progressRecords,
    futureTasks: futureTasksWithoutReviews,
    asOfDate: input.asOfDate
  });

  const futureTasks = futureTasksWithoutReviews.map((task) => ({
    ...task,
    plannedReviewCount: reviewResult.assignments.get(task.date) ?? 0,
    adjustmentReason: buildTaskReason(task, usesBufferForNewWords, reviewResult.overflow)
  }));

  const historicalTasks = (input.existingTasks ?? [])
    .filter((task) => compareDates(task.date, input.asOfDate) < 0)
    .sort((a, b) => compareDates(a.date, b.date));

  const feasibilityStatus = resolveFeasibilityStatus({
    remainingNewWords,
    feasibleByNewWords,
    requiredDailyAverage,
    dailyNewWordLimit: input.goal.dailyNewWordLimit,
    usesBufferForNewWords,
    reviewOverflow: reviewResult.overflow
  });
  const dailyLimitGap = Math.max(0, requiredDailyAverage - input.goal.dailyNewWordLimit);
  const adjustmentReason = buildPlanReason({
    baseReason: input.reason,
    feasibilityStatus,
    remainingNewWords,
    remainingEffectiveDays,
    requiredDailyAverage,
    dailyLimitGap,
    usesBufferForNewWords,
    reviewOverflow: reviewResult.overflow
  });

  const plan: StudyPlan = {
    id: planId,
    goalId: input.goal.id,
    generatedAt: nowIso(),
    version: input.version,
    feasibilityStatus,
    remainingNewWords,
    remainingEffectiveDays,
    requiredDailyAverage,
    dailyLimitGap,
    adjustmentReason
  };

  const dailyTasks = [...historicalTasks, ...futureTasks].sort((a, b) => compareDates(a.date, b.date));
  const summaries = summarizePlan(input.goal, plan, dailyTasks, input.progressRecords, input.asOfDate);
  const adjustmentLog: PlanAdjustmentLog = {
    id: `adjustment:${input.goal.id}:${input.version}`,
    createdAt: nowIso(),
    triggerType: input.triggerType,
    previousPlanVersion: Math.max(0, input.version - 1),
    newPlanVersion: input.version,
    reason: input.reason,
    changesSummary: adjustmentReason,
    feasibilityStatus
  };

  return {
    plan,
    dailyTasks,
    adjustmentLog,
    ...summaries
  };
}

export function createProgressRecord(input: DailyRecordInput): ProgressRecord {
  return {
    id: `progress:${input.goalId}:${input.date}`,
    goalId: input.goalId,
    date: input.date,
    newWordsCompleted: Math.max(0, Math.floor(input.newWordsCompleted)),
    reviewsCompleted: Math.max(0, Math.floor(input.reviewsCompleted)),
    minutesSpent: Math.max(0, Math.floor(input.minutesSpent)),
    note: input.note.trim(),
    createdAt: nowIso()
  };
}

export function applyProgressToDailyTask(task: DailyTask, record: ProgressRecord): DailyTask {
  const missedNewWordCount = Math.max(0, task.plannedNewWordCount - record.newWordsCompleted);
  const missedReviewCount = Math.max(0, task.plannedReviewCount - record.reviewsCompleted);
  const completionStatus =
    missedNewWordCount === 0 && missedReviewCount === 0
      ? "completed"
      : record.newWordsCompleted === 0 && record.reviewsCompleted === 0
        ? "missed"
        : "partial";

  return {
    ...task,
    actualNewWordCount: record.newWordsCompleted,
    actualReviewCount: record.reviewsCompleted,
    missedNewWordCount,
    missedReviewCount,
    completionStatus,
    adjustmentReason:
      missedNewWordCount > 0
        ? `少完成 ${missedNewWordCount} 个新词，已进入后续重排`
        : record.newWordsCompleted > task.plannedNewWordCount
          ? `超额完成 ${record.newWordsCompleted - task.plannedNewWordCount} 个新词，后续任务会降低`
          : "已按记录更新"
  };
}

function selectWordsForGoal(words: WordItem[], goal: UserGoal): WordItem[] {
  return words.filter((word) => {
    if (word.status === "known" || word.status === "excluded") {
      return false;
    }
    if (goal.selectedBookIds.length === 0) {
      return true;
    }
    return word.sourceBookIds.some((bookId) => goal.selectedBookIds.includes(bookId));
  });
}

function sumProgress(records: ProgressRecord[], field: "newWordsCompleted" | "reviewsCompleted"): number {
  return records.reduce((total, record) => total + Math.max(0, record[field]), 0);
}

function getBufferDates(studyDates: LocalDateString[], ratio: number): Set<LocalDateString> {
  const bufferCount = Math.floor(studyDates.length * ratio);
  if (bufferCount <= 0) {
    return new Set();
  }
  return new Set(studyDates.slice(-bufferCount));
}

function allocateNewWords(
  totalWords: number,
  dates: LocalDateString[],
  dailyLimit: number,
  style: PlanStyle
): Map<LocalDateString, number> {
  const assignments = new Map<LocalDateString, number>(dates.map((date) => [date, 0]));
  if (totalWords <= 0 || dates.length === 0 || dailyLimit <= 0) {
    return assignments;
  }

  const cappedTotal = Math.min(totalWords, dates.length * dailyLimit);
  const weights = dates.map((date, index) => ({
    date,
    weight: weightForDate(style, index, dates.length)
  }));
  const totalWeight = weights.reduce((sum, item) => sum + item.weight, 0);
  const weighted = weights.map((item) => {
    const exact = (item.weight / totalWeight) * cappedTotal;
    return {
      date: item.date,
      exact,
      count: Math.min(dailyLimit, Math.floor(exact)),
      fraction: exact - Math.floor(exact)
    };
  });

  let remaining = cappedTotal - weighted.reduce((sum, item) => sum + item.count, 0);
  weighted
    .slice()
    .sort((a, b) => b.fraction - a.fraction || compareDates(a.date, b.date))
    .forEach((item) => {
      if (remaining <= 0 || item.count >= dailyLimit) {
        return;
      }
      item.count += 1;
      remaining -= 1;
    });

  let safety = dates.length * dailyLimit + 1;
  while (remaining > 0 && safety > 0) {
    for (const item of weighted) {
      if (remaining <= 0) {
        break;
      }
      if (item.count < dailyLimit) {
        item.count += 1;
        remaining -= 1;
      }
    }
    safety -= 1;
  }

  weighted.forEach((item) => assignments.set(item.date, item.count));
  return assignments;
}

function weightForDate(style: PlanStyle, index: number, totalDates: number): number {
  if (style === "frontLoaded" && totalDates > 1) {
    return 1.25 - (index / (totalDates - 1)) * 0.5;
  }
  if (style === "flexible") {
    return 1 + ((index % 3) - 1) * 0.04;
  }
  return 1;
}

function buildFutureTask(input: {
  date: LocalDateString;
  goal: UserGoal;
  planId: string;
  plannedNewWordCount: number;
  plannedReviewCount: number;
  isBufferDay: boolean;
  sourceBookNames: string[];
  reason: string;
}): DailyTask {
  const isRestDay = isRestDate(input.date, input.goal.restWeekdays);
  return {
    id: `task:${input.goal.id}:${input.date}`,
    goalId: input.goal.id,
    planId: input.planId,
    date: input.date,
    plannedNewWordCount: isRestDay ? 0 : input.plannedNewWordCount,
    plannedReviewCount: isRestDay ? 0 : input.plannedReviewCount,
    actualNewWordCount: 0,
    actualReviewCount: 0,
    missedNewWordCount: 0,
    missedReviewCount: 0,
    completionStatus: isRestDay ? "rest" : "planned",
    isBufferDay: input.isBufferDay,
    isRestDay,
    sourceBookNames: input.sourceBookNames.length > 0 ? input.sourceBookNames : ["当前目标词表"],
    adjustmentReason: input.reason
  };
}

function scheduleReviewCounts(input: {
  goal: UserGoal;
  progressRecords: ProgressRecord[];
  futureTasks: DailyTask[];
  asOfDate: LocalDateString;
}): { assignments: Map<LocalDateString, number>; overflow: number } {
  const rawDue = new Map<LocalDateString, number>();
  const addDue = (date: LocalDateString, count: number) => {
    rawDue.set(date, (rawDue.get(date) ?? 0) + count);
  };

  input.progressRecords.forEach((record) => {
    if (record.newWordsCompleted <= 0) {
      return;
    }
    REVIEW_INTERVALS.forEach((interval) => {
      const dueDate = addDays(record.date, interval);
      if (compareDates(dueDate, input.asOfDate) >= 0 && compareDates(dueDate, input.goal.deadline) <= 0) {
        addDue(dueDate, record.newWordsCompleted);
      }
    });
  });

  input.futureTasks.forEach((task) => {
    if (task.plannedNewWordCount <= 0) {
      return;
    }
    REVIEW_INTERVALS.forEach((interval) => {
      const dueDate = addDays(task.date, interval);
      if (compareDates(dueDate, input.asOfDate) >= 0 && compareDates(dueDate, input.goal.deadline) <= 0) {
        addDue(dueDate, task.plannedNewWordCount);
      }
    });
  });

  const assignments = new Map<LocalDateString, number>();
  let carry = 0;
  const dates = enumerateDateRange(input.asOfDate, input.goal.deadline);

  dates.forEach((date) => {
    const due = (rawDue.get(date) ?? 0) + carry;
    if (isRestDate(date, input.goal.restWeekdays)) {
      assignments.set(date, 0);
      carry = due;
      return;
    }
    const assigned = Math.min(input.goal.dailyReviewLimit, due);
    assignments.set(date, assigned);
    carry = due - assigned;
  });

  return { assignments, overflow: carry };
}

function resolveFeasibilityStatus(input: {
  remainingNewWords: number;
  feasibleByNewWords: boolean;
  requiredDailyAverage: number;
  dailyNewWordLimit: number;
  usesBufferForNewWords: boolean;
  reviewOverflow: number;
}): FeasibilityStatus {
  if (input.remainingNewWords === 0) {
    return "completed";
  }
  if (!input.feasibleByNewWords || input.requiredDailyAverage > input.dailyNewWordLimit) {
    return "infeasible";
  }
  if (input.usesBufferForNewWords || input.reviewOverflow > 0 || input.requiredDailyAverage >= Math.ceil(input.dailyNewWordLimit * 0.9)) {
    return "atRisk";
  }
  return "feasible";
}

function buildPlanReason(input: {
  baseReason: string;
  feasibilityStatus: FeasibilityStatus;
  remainingNewWords: number;
  remainingEffectiveDays: number;
  requiredDailyAverage: number;
  dailyLimitGap: number;
  usesBufferForNewWords: boolean;
  reviewOverflow: number;
}): string {
  if (input.feasibilityStatus === "completed") {
    return "目标新学任务已经完成，后续只保留必要复习安排";
  }
  if (input.feasibilityStatus === "infeasible") {
    return `${input.baseReason}；按现有限制无法完成：剩余 ${input.remainingNewWords} 个新词，剩余有效学习日 ${input.remainingEffectiveDays} 天，最低每日需要 ${input.requiredDailyAverage} 个，超过当前上限 ${input.dailyLimitGap} 个`;
  }
  const notes = [input.baseReason];
  if (input.usesBufferForNewWords) {
    notes.push("已启用缓冲日吸收剩余新学任务");
  }
  if (input.reviewOverflow > 0) {
    notes.push(`复习容量不足，仍有 ${input.reviewOverflow} 个复习任务需要后续处理`);
  }
  if (input.feasibilityStatus === "atRisk") {
    notes.push("计划接近容量上限，需要关注完成率");
  }
  return notes.join("；");
}

function buildTaskReason(task: DailyTask, usesBufferForNewWords: boolean, reviewOverflow: number): string {
  if (task.isRestDay) {
    return "固定休息日，不安排新学任务";
  }
  if (task.isBufferDay && task.plannedNewWordCount > 0 && usesBufferForNewWords) {
    return "使用缓冲日承接剩余任务";
  }
  if (reviewOverflow > 0 && compareDates(task.date, addDays(task.date, 0)) === 0) {
    return "复习任务按每日上限顺延";
  }
  return task.plannedNewWordCount > 0 || task.plannedReviewCount > 0 ? "按当前目标自动排期" : "缓冲或轻任务日";
}

function summarizePlan(
  goal: UserGoal,
  plan: StudyPlan,
  dailyTasks: DailyTask[],
  progressRecords: ProgressRecord[],
  asOfDate: LocalDateString
): {
  longTerm: LongTermPlanSummary;
  monthlyPlans: MonthlyPlanSummary[];
  weeklyPlans: WeeklyPlanSummary[];
} {
  const completedNewWords = sumProgress(progressRecords, "newWordsCompleted");
  const estimatedCompletionDate = estimateCompletionDate(goal.targetVocabularyCount, completedNewWords, dailyTasks, asOfDate);
  const longTerm: LongTermPlanSummary = {
    totalTargetWords: goal.targetVocabularyCount,
    completedNewWords,
    remainingNewWords: plan.remainingNewWords,
    remainingEffectiveDays: plan.remainingEffectiveDays,
    estimatedCompletionDate,
    feasibilityStatus: plan.feasibilityStatus,
    requiredDailyAverage: plan.requiredDailyAverage,
    stageSummaries: buildStageSummaries(goal, completedNewWords, plan.remainingNewWords)
  };

  return {
    longTerm,
    monthlyPlans: buildMonthlySummaries(goal, dailyTasks, completedNewWords),
    weeklyPlans: buildWeeklySummaries(dailyTasks)
  };
}

function estimateCompletionDate(
  targetVocabularyCount: number,
  completedNewWords: number,
  tasks: DailyTask[],
  asOfDate: LocalDateString
): LocalDateString | null {
  let cumulative = completedNewWords;
  const futureTasks = tasks.filter((task) => compareDates(task.date, asOfDate) >= 0).sort((a, b) => compareDates(a.date, b.date));
  for (const task of futureTasks) {
    cumulative += task.plannedNewWordCount;
    if (cumulative >= targetVocabularyCount) {
      return task.date;
    }
  }
  return completedNewWords >= targetVocabularyCount ? asOfDate : null;
}

function buildStageSummaries(goal: UserGoal, completedNewWords: number, remainingNewWords: number): string[] {
  const firstStage = Math.ceil(goal.targetVocabularyCount * 0.35);
  const secondStage = Math.ceil(goal.targetVocabularyCount * 0.75);
  return [
    `基础推进：累计 ${firstStage} 个新词前以稳定输入为主`,
    `强化巩固：累计 ${secondStage} 个新词前保持复习节奏`,
    `冲刺复盘：最后 ${remainingNewWords} 个剩余新词配合缓冲日处理欠缺`,
    `当前已完成 ${completedNewWords} / ${goal.targetVocabularyCount}`
  ];
}

function buildMonthlySummaries(goal: UserGoal, tasks: DailyTask[], completedNewWords: number): MonthlyPlanSummary[] {
  const groups = new Map<string, DailyTask[]>();
  tasks.forEach((task) => {
    const key = monthKey(task.date);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });

  let projected = completedNewWords;
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthTasks]) => {
      const plannedNewWords = sumTasks(monthTasks, "plannedNewWordCount");
      const plannedReviews = sumTasks(monthTasks, "plannedReviewCount");
      const actualNewWords = sumTasks(monthTasks, "actualNewWordCount");
      const actualReviews = sumTasks(monthTasks, "actualReviewCount");
      projected += plannedNewWords;
      return {
        month,
        plannedNewWords,
        plannedReviews,
        actualNewWords,
        actualReviews,
        bufferDays: monthTasks.filter((task) => task.isBufferDay && !task.isRestDay).length,
        completionRate: plannedNewWords > 0 ? actualNewWords / plannedNewWords : actualNewWords > 0 ? 1 : 0,
        projectedCumulativeRate: Math.min(1, projected / goal.targetVocabularyCount)
      };
    });
}

function buildWeeklySummaries(tasks: DailyTask[]): WeeklyPlanSummary[] {
  const groups = new Map<string, DailyTask[]>();
  tasks.forEach((task) => {
    const key = startOfIsoWeek(task.date);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });

  return Array.from(groups.entries())
    .sort(([a], [b]) => compareDates(a, b))
    .map(([weekStart, weekTasks]) => {
      const plannedNewWords = sumTasks(weekTasks, "plannedNewWordCount");
      const actualNewWords = sumTasks(weekTasks, "actualNewWordCount");
      return {
        weekStart,
        weekEnd: endOfIsoWeek(weekStart),
        plannedNewWords,
        plannedReviews: sumTasks(weekTasks, "plannedReviewCount"),
        actualNewWords,
        actualReviews: sumTasks(weekTasks, "actualReviewCount"),
        missedNewWords: sumTasks(weekTasks, "missedNewWordCount"),
        completionRate: plannedNewWords > 0 ? actualNewWords / plannedNewWords : actualNewWords > 0 ? 1 : 0
      };
    });
}

function sumTasks(tasks: DailyTask[], field: keyof Pick<
  DailyTask,
  | "plannedNewWordCount"
  | "plannedReviewCount"
  | "actualNewWordCount"
  | "actualReviewCount"
  | "missedNewWordCount"
>): number {
  return tasks.reduce((sum, task) => sum + Number(task[field]), 0);
}
