import { describe, expect, it } from "vitest";
import { buildLocalPlanningAdvice } from "../src/domain/aiPlanning";
import {
  feasibilityLabels,
  newWordStatusLabels,
  pressureStatusLabels,
  reviewResultLabels,
  reviewStatusLabels,
  wordBookStatusLabels,
  wordStateLabels
} from "../src/domain/labels";

describe("v0.4.0 中文用词与目标建议", () => {
  it("统一状态映射不把内部枚举裸露给用户", () => {
    const visibleLabels = [
      ...Object.values(pressureStatusLabels),
      ...Object.values(feasibilityLabels),
      ...Object.values(newWordStatusLabels),
      ...Object.values(reviewStatusLabels),
      ...Object.values(wordStateLabels),
      ...Object.values(reviewResultLabels),
      ...Object.values(wordBookStatusLabels)
    ];

    expect(visibleLabels).not.toContain("ok");
    expect(visibleLabels).not.toContain("near_limit");
    expect(visibleLabels).not.toContain("over_limit");
    expect(visibleLabels).not.toContain("planned");
    expect(visibleLabels).not.toContain("reviewing");
    expect(visibleLabels).not.toContain("mastered");
    expect(visibleLabels).toContain("待补学");
    expect(visibleLabels).toContain("偏高");
  });

  it("核心指标和状态映射使用自然中文", () => {
    expect(pressureStatusLabels.near_limit).toBe("偏高");
    expect(pressureStatusLabels.over_limit).toBe("超限");
    expect(wordStateLabels.learning_backlog).toBe("待补学");
    expect(wordBookStatusLabels.enabled).toBe("已纳入当前计划");
    expect(feasibilityLabels.infeasible).toBe("无法按期完成");
  });

  it("没有真实六级词表时不生成 900 词正式建议", () => {
    const advice = buildLocalPlanningAdvice({
      text: "我想准备六级，但基础不太稳，帮我安排一个计划。",
      wordBooks: []
    });

    expect(advice.suggestion.targetType).toBe("CET6");
    expect(advice.suggestion.suggestedTargetWordCount).not.toBe(900);
    expect(advice.suggestion.requiresWordbookImport).toBe(true);
    expect(advice.suggestion.isReferenceOnly).toBe(true);
    expect(advice.suggestion.explanation).toContain("无法生成可靠新增词量");
    expect(advice.suggestion.explanation).toContain("不是最终计划词量");
    expect(advice.validationErrors.join("；")).toContain("请先导入目标词表或使用演示模式");
  });
});
