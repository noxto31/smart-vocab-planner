import { addDays, compareDates, enumerateDateRange, monthKey, weekdayOf } from "./date";
import { describePressure, labelFeasibility, labelPressure, stageStatusLabels } from "./labels";
import type {
  DailyTaskSummary,
  LearningGoal,
  LocalDateString,
  PlanAdjustmentLog,
  StagePlan,
  StudyPlan
} from "./types";

export interface TodayTaskCardView {
  date: LocalDateString;
  originalNewWords: number;
  adjustedNewWords: number;
  newWords: number;
  reviews: number;
  catchUpNewWords: number;
  overdueReviews: number;
  totalLoad: number;
  pressureStatus: string;
  pressureDescription: string;
  adjustmentReason: string;
  completedNewWords: number;
  completedReviews: number;
  progressText: string;
}

export interface WeekPlanDayView {
  date: LocalDateString;
  weekday: string;
  newWords: number;
  reviews: number;
  catchUpNewWords: number;
  overdueReviews: number;
  totalLoad: number;
  pressureStatus: string;
  isRestDay: boolean;
  isBufferDay: boolean;
  isDynamicallyAdjusted: boolean;
  adjustmentReason: string;
}

export interface MonthHeatmapDayView extends WeekPlanDayView {
  isCompleted: boolean;
  isUnfinished: boolean;
  hasCatchUpOrOverdue: boolean;
}

export interface StageTimelineItemView {
  id: string;
  name: string;
  dateRange: string;
  targetWords: number;
  completedWords: number;
  remainingWords: number;
  status: string;
  changedByRecovery: boolean;
  note: string;
}

export interface DetailedPlanRowView {
  date: LocalDateString;
  newWords: number;
  reviews: number;
  catchUpNewWords: number;
  overdueReviews: number;
  pressureStatus: string;
  isPrimaryView: false;
}

const weekdayLabels = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"] as const;

export function buildTodayTaskCard(input: {
  date: LocalDateString;
  task?: DailyTaskSummary | null;
  latestPlan?: StudyPlan | null;
  latestAdjustment?: PlanAdjustmentLog | null;
}): TodayTaskCardView {
  const task = input.task;
  const original = task?.originalNewWordCount ?? task?.plannedNewWordCount ?? 0;
  const adjusted = task?.adjustedNewWordCount ?? task?.boundNewWordCount ?? 0;
  const catchUp = task?.catchUpNewWordCount ?? Math.max(0, adjusted - original);
  const reviews = task?.plannedReviewCount ?? 0;
  const totalLoad = task?.totalLoad ?? adjusted + reviews * (input.latestPlan?.reviewWeight ?? 0.6);
  const completedNew = task?.completedNewWordCount ?? 0;
  const completedReviews = task?.completedReviewCount ?? 0;
  const totalTaskCount = adjusted + reviews;
  const doneTaskCount = completedNew + completedReviews;
  return {
    date: input.date,
    originalNewWords: original,
    adjustedNewWords: adjusted,
    newWords: adjusted,
    reviews,
    catchUpNewWords: catchUp,
    overdueReviews: task?.overdueReviewCount ?? 0,
    totalLoad,
    pressureStatus: labelPressure(task?.capacityStatus),
    pressureDescription: describePressure(task?.capacityStatus),
    adjustmentReason: task?.dynamicAdjustmentReason ?? task?.adjustmentReason ?? input.latestAdjustment?.explanation ?? "暂无调整",
    completedNewWords: completedNew,
    completedReviews,
    progressText: totalTaskCount > 0 ? `${doneTaskCount} / ${totalTaskCount}` : "今日暂无任务"
  };
}

export function buildWeekPlanCards(tasks: DailyTaskSummary[], weekStart: LocalDateString): WeekPlanDayView[] {
  const byDate = new Map(tasks.map((task) => [task.date, task]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = addDays(weekStart, index);
    return buildWeekDayView(date, byDate.get(date));
  });
}

export function buildMonthHeatmap(tasks: DailyTaskSummary[], month: string): MonthHeatmapDayView[] {
  const monthTasks = tasks.filter((task) => monthKey(task.date) === month);
  if (monthTasks.length === 0) {
    return [];
  }
  const start = monthTasks.reduce((min, task) => (compareDates(task.date, min) < 0 ? task.date : min), monthTasks[0].date);
  const end = monthTasks.reduce((max, task) => (compareDates(task.date, max) > 0 ? task.date : max), monthTasks[0].date);
  const byDate = new Map(monthTasks.map((task) => [task.date, task]));
  return enumerateDateRange(start, end).map((date) => {
    const task = byDate.get(date);
    const base = buildWeekDayView(date, task);
    return {
      ...base,
      isCompleted: Boolean(task && task.boundNewWordCount + task.plannedReviewCount > 0 && task.completedNewWordCount + task.completedReviewCount >= task.boundNewWordCount + task.plannedReviewCount),
      isUnfinished: Boolean(task && (task.learningBacklogCount > 0 || task.overdueReviewCount > 0)),
      hasCatchUpOrOverdue: Boolean(task && ((task.catchUpNewWordCount ?? 0) > 0 || task.overdueReviewCount > 0))
    };
  });
}

export function buildStageTimeline(input: {
  goal: LearningGoal | null;
  stages: StagePlan[];
  tasks: DailyTaskSummary[];
}): StageTimelineItemView[] {
  return input.stages.map((stage) => {
    const stageTasks = input.tasks.filter((task) => compareDates(task.date, stage.startDate) >= 0 && compareDates(task.date, stage.endDate) <= 0);
    const completed = stageTasks.reduce((sum, task) => sum + task.completedNewWordCount, 0);
    const changed = stageTasks.some((task) => task.isDynamicallyAdjusted);
    const targetWords = stage.plannedNewWordCount;
    return {
      id: stage.id,
      name: stage.name,
      dateRange: `${stage.startDate} 至 ${stage.endDate}`,
      targetWords,
      completedWords: completed,
      remainingWords: Math.max(0, targetWords - completed),
      status: stageStatusLabels[stage.status],
      changedByRecovery: changed,
      note: stage.targetBookIds.length > 0
        ? "当前阶段名称基于计划规则生成，尚未绑定完整真实词书。"
        : "当前阶段名称基于计划规则生成，尚未绑定完整真实词书。"
    };
  });
}

export function buildDetailedPlanRows(tasks: DailyTaskSummary[]): DetailedPlanRowView[] {
  return tasks.map((task) => ({
    date: task.date,
    newWords: task.boundNewWordCount,
    reviews: task.plannedReviewCount,
    catchUpNewWords: task.catchUpNewWordCount ?? 0,
    overdueReviews: task.overdueReviewCount,
    pressureStatus: labelPressure(task.capacityStatus),
    isPrimaryView: false
  }));
}

export function buildPlanRiskText(plan: StudyPlan | null): string {
  if (!plan) {
    return "创建目标并导入词表后会显示计划状态";
  }
  if (plan.feasibilityStatus === "infeasible") {
    return `剩余 ${plan.remainingConcreteNewWords} 个新词，${plan.remainingEffectiveDays} 个学习日，至少需要每天 ${plan.requiredDailyAverage} 个新词。`;
  }
  return labelFeasibility(plan.feasibilityStatus);
}

function buildWeekDayView(date: LocalDateString, task?: DailyTaskSummary): WeekPlanDayView {
  return {
    date,
    weekday: weekdayLabels[weekdayOf(date)],
    newWords: task?.boundNewWordCount ?? 0,
    reviews: task?.plannedReviewCount ?? 0,
    catchUpNewWords: task?.catchUpNewWordCount ?? 0,
    overdueReviews: task?.overdueReviewCount ?? 0,
    totalLoad: task?.totalLoad ?? 0,
    pressureStatus: labelPressure(task?.capacityStatus),
    isRestDay: task?.isRestDay ?? false,
    isBufferDay: task?.isBufferDay ?? false,
    isDynamicallyAdjusted: task?.isDynamicallyAdjusted ?? false,
    adjustmentReason: task?.dynamicAdjustmentReason ?? task?.adjustmentReason ?? "暂无调整"
  };
}

