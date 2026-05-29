import type {
  DailyTaskSummary,
  FeasibilityStatus,
  NewWordAssignmentStatus,
  PlanStyle,
  ReviewAssignmentStatus,
  ReviewResult,
  StagePlan,
  WordBookStatus,
  WordLearningState
} from "./types";

export const pressureStatusLabels: Record<DailyTaskSummary["capacityStatus"], string> = {
  light: "轻松",
  ok: "正常",
  near_limit: "偏高",
  over_limit: "超限",
  rest: "休息"
};

export const feasibilityLabels: Record<FeasibilityStatus, string> = {
  feasible: "进度正常",
  atRisk: "有完成风险",
  infeasible: "无法按期完成",
  completed: "已完成"
};

export const planStyleLabels: Record<PlanStyle, string> = {
  steady: "平稳型",
  frontLoaded: "前紧后松型",
  flexible: "弹性型"
};

export const reviewResultLabels: Record<ReviewResult, string> = {
  forgot: "不认识",
  vague: "模糊",
  known: "认识",
  easy: "很熟悉",
  not_completed: "未完成"
};

export const newWordStatusLabels: Record<NewWordAssignmentStatus, string> = {
  planned: "待学习",
  rescheduled: "已重新安排",
  learned: "已学习",
  mastered: "已掌握",
  skipped: "暂时跳过",
  missed: "今日未完成"
};

export const reviewStatusLabels: Record<ReviewAssignmentStatus, string> = {
  planned: "待复习",
  rescheduled: "已重新安排",
  completed: "已复习",
  overdue: "逾期复习"
};

export const wordStateLabels: Record<WordLearningState, string> = {
  not_started: "尚未开始",
  assigned_new: "已安排新词",
  learning_backlog: "待补学",
  learned: "已学习",
  reviewing: "复习中",
  mastered: "已掌握",
  excluded: "已排除"
};

export const wordBookStatusLabels: Record<WordBookStatus, string> = {
  recommended: "推荐导入",
  imported: "已导入",
  enabled: "已纳入当前计划",
  candidate: "可补充",
  disabled: "已停用"
};

export const stageStatusLabels: Record<StagePlan["status"], string> = {
  planned: "待开始",
  active: "进行中",
  completed: "已完成",
  atRisk: "有风险"
};

export function labelPressure(status: DailyTaskSummary["capacityStatus"] | undefined): string {
  return pressureStatusLabels[status ?? "ok"];
}

export function labelFeasibility(status: FeasibilityStatus | undefined): string {
  return status ? feasibilityLabels[status] : "尚未生成计划";
}

export function labelWordBookStatus(status: WordBookStatus | undefined): string {
  return wordBookStatusLabels[status ?? "recommended"];
}

export function describePressure(status: DailyTaskSummary["capacityStatus"] | undefined): string {
  const value = status ?? "ok";
  if (value === "light") {
    return "今日任务较轻";
  }
  if (value === "near_limit") {
    return "今日任务偏多，但仍在可接受范围内";
  }
  if (value === "over_limit") {
    return "今日任务已超过当前上限";
  }
  if (value === "rest") {
    return "今天是休息日";
  }
  return "今日任务正常";
}

