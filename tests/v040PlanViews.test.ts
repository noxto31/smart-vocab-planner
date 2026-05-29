import { describe, expect, it } from "vitest";
import {
  buildDetailedPlanRows,
  buildMonthHeatmap,
  buildStageTimeline,
  buildTodayTaskCard,
  buildWeekPlanCards
} from "../src/domain/planViews";
import type { DailyTaskSummary, LearningGoal, StagePlan, StudyPlan } from "../src/domain/types";

describe("v0.4.0 计划视图数据", () => {
  it("今日卡片显示原计划、调整后计划、原因和任务压力", () => {
    const task = makeTask("2026-06-02", {
      originalNewWordCount: 100,
      catchUpNewWordCount: 12,
      adjustedNewWordCount: 112,
      boundNewWordCount: 112,
      plannedReviewCount: 80,
      totalLoad: 160,
      capacityStatus: "near_limit",
      dynamicAdjustmentReason: "昨天少完成 100 个新词，系统已分摊到后续学习日"
    });
    const card = buildTodayTaskCard({
      date: "2026-06-02",
      task,
      latestPlan: makePlan(),
      latestAdjustment: null
    });

    expect(card.originalNewWords).toBe(100);
    expect(card.adjustedNewWords).toBe(112);
    expect(card.catchUpNewWords).toBe(12);
    expect(card.reviews).toBe(80);
    expect(card.pressureStatus).toBe("偏高");
    expect(card.adjustmentReason).toContain("昨天少完成");
  });

  it("周计划卡片显示 7 天分布和动态调整状态", () => {
    const cards = buildWeekPlanCards([
      makeTask("2026-06-01", { boundNewWordCount: 111, catchUpNewWordCount: 11, isDynamicallyAdjusted: true }),
      makeTask("2026-06-02", { boundNewWordCount: 112, catchUpNewWordCount: 12, capacityStatus: "near_limit" })
    ], "2026-06-01");

    expect(cards).toHaveLength(7);
    expect(cards[0].newWords).toBe(111);
    expect(cards[0].isDynamicallyAdjusted).toBe(true);
    expect(cards[1].pressureStatus).toBe("偏高");
  });

  it("月历热力图按日期聚合总负荷和补学标记", () => {
    const days = buildMonthHeatmap([
      makeTask("2026-06-01", { boundNewWordCount: 100, plannedReviewCount: 20, totalLoad: 112, capacityStatus: "ok" }),
      makeTask("2026-06-02", { boundNewWordCount: 112, catchUpNewWordCount: 12, overdueReviewCount: 3, capacityStatus: "near_limit" })
    ], "2026-06");

    expect(days).toHaveLength(2);
    expect(days[1].hasCatchUpOrOverdue).toBe(true);
    expect(days[1].pressureStatus).toBe("偏高");
  });

  it("阶段时间轴显示阶段范围、目标、已完成和规则命名说明", () => {
    const timeline = buildStageTimeline({
      goal: makeGoal(),
      stages: [makeStage()],
      tasks: [
        makeTask("2026-06-01", { completedNewWordCount: 20 }),
        makeTask("2026-06-02", { completedNewWordCount: 10, isDynamicallyAdjusted: true })
      ]
    });

    expect(timeline[0].dateRange).toBe("2026-06-01 至 2026-06-05");
    expect(timeline[0].targetWords).toBe(100);
    expect(timeline[0].completedWords).toBe(30);
    expect(timeline[0].remainingWords).toBe(70);
    expect(timeline[0].changedByRecovery).toBe(true);
    expect(timeline[0].note).toContain("尚未绑定完整真实词书");
  });

  it("详细表格仍可查看但不是唯一计划展示", () => {
    const rows = buildDetailedPlanRows([makeTask("2026-06-01")]);

    expect(rows[0].date).toBe("2026-06-01");
    expect(rows[0].isPrimaryView).toBe(false);
    expect(rows[0].pressureStatus).toBe("正常");
  });
});

function makeTask(date: string, overrides: Partial<DailyTaskSummary> = {}): DailyTaskSummary {
  return {
    id: `task:${date}`,
    goalId: "goal:test",
    planId: "plan:test",
    date,
    plannedNewWordCount: 100,
    boundNewWordCount: 100,
    completedNewWordCount: 0,
    learningBacklogCount: 0,
    plannedReviewCount: 0,
    completedReviewCount: 0,
    overdueReviewCount: 0,
    inventoryGapCount: 0,
    isBufferDay: false,
    isRestDay: false,
    originalNewWordCount: 100,
    catchUpNewWordCount: 0,
    adjustedNewWordCount: 100,
    totalLoad: 100,
    comfortableLoad: 140,
    hardLoadLimit: 172,
    isDynamicallyAdjusted: false,
    capacityStatus: "ok",
    feasibilityStatus: "feasible",
    adjustmentReason: "安排 100 个新词",
    ...overrides
  };
}

function makePlan(): StudyPlan {
  return {
    id: "plan:test",
    goalId: "goal:test",
    generatedAt: "2026-06-01T00:00:00.000Z",
    version: 1,
    feasibilityStatus: "feasible",
    remainingConcreteNewWords: 100,
    remainingEffectiveDays: 10,
    requiredDailyAverage: 10,
    dailyLimitGap: 0,
    reviewWeight: 0.6,
    coverage: {
      targetRequiredCount: 100,
      availableWordCount: 100,
      enabledWordCount: 100,
      assignedWordCount: 100,
      completedWordCount: 0,
      reviewingWordCount: 0,
      masteredWordCount: 0,
      inventoryGapCount: 0,
      learningBacklogCount: 0,
      overdueReviewCount: 0
    },
    adjustmentReason: "测试"
  };
}

function makeStage(): StagePlan {
  return {
    id: "stage:test",
    goalId: "goal:test",
    name: "目标核心",
    role: "core",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    plannedNewWordCount: 100,
    plannedReviewCount: 30,
    targetBookIds: ["book:test"],
    status: "active",
    riskNote: "测试阶段",
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  };
}

function makeGoal(): LearningGoal {
  return {
    id: "goal:test",
    goalInputMode: "structured",
    interpretedGoal: "测试目标",
    targetType: "CUSTOM",
    startDate: "2026-06-01",
    deadline: "2026-06-10",
    targetRequiredCount: 100,
    dailyNewWordLimit: 100,
    dailyReviewLimit: 120,
    restWeekdays: [],
    bufferDayRatio: 0,
    planStyle: "steady",
    timezone: "Asia/Shanghai",
    selectedBookIds: ["book:test"],
    allowBookRecommendation: true,
    createdAt: "2026-06-01T00:00:00.000Z",
    updatedAt: "2026-06-01T00:00:00.000Z"
  };
}

