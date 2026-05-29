import { nowIso } from "./date";
import type { AIAdviceType, AIPlanningAdvice, AIPlanningSuggestion, AIServiceMode, LearningGoal, PlanCoverageStatus, TargetType, WordBook } from "./types";

export interface PlanningAdviceInput {
  text: string;
  currentGoal?: LearningGoal | null;
  coverage?: PlanCoverageStatus | null;
  wordBooks?: WordBook[];
  mode?: AIServiceMode;
  adviceType?: AIAdviceType;
}

export function buildLocalPlanningAdvice(input: PlanningAdviceInput): AIPlanningAdvice {
  const suggestion = buildLocalSuggestion(input);
  const validationErrors = validatePlanningSuggestion(suggestion, input.currentGoal ?? null, input.coverage ?? null);
  return {
    id: `ai-advice:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    createdAt: nowIso(),
    mode: input.mode ?? "local_rule",
    adviceType: input.adviceType ?? "goal_parse",
    inputSummary: summarizeInput(input),
    suggestion,
    validationStatus: validationErrors.length > 0 ? "fallback" : "valid",
    validationErrors
  };
}

export function validatePlanningSuggestion(
  suggestion: AIPlanningSuggestion,
  currentGoal: LearningGoal | null,
  coverage: PlanCoverageStatus | null
): string[] {
  const errors: string[] = [];
  if (suggestion.suggestedTargetWordCount <= 0 || !Number.isInteger(suggestion.suggestedTargetWordCount)) {
    errors.push("建议目标词量必须是正整数");
  }
  if (currentGoal && suggestion.suggestedDailyNewWordRange) {
    const [min, max] = suggestion.suggestedDailyNewWordRange;
    if (max > currentGoal.dailyNewWordLimit * 2) {
      errors.push("建议每日新词明显超过当前容量，需要用户确认调整上限");
    }
    if (min <= 0 || min > max) {
      errors.push("建议每日新词范围无效");
    }
  }
  if (coverage && suggestion.suggestedTargetWordCount > coverage.enabledWordCount && coverage.enabledWordCount > 0) {
    const gap = suggestion.suggestedTargetWordCount - coverage.enabledWordCount;
    if (gap > 0) {
      errors.push(`建议目标仍需要补充 ${gap} 个真实词条后才能完整排期`);
    }
  }
  return errors;
}

function buildLocalSuggestion(input: PlanningAdviceInput): AIPlanningSuggestion {
  const text = input.text.trim() || "希望建立一个可持续的词汇学习计划";
  const lower = text.toLowerCase();
  const targetType = inferTargetType(text, lower);
  const needsFoundation = /基础|不稳|薄弱|弱|补|四级过了/.test(text);
  const suggestedTargetWordCount = inferTargetCount(targetType, needsFoundation);
  const range = inferDailyRange(input.currentGoal ?? null, suggestedTargetWordCount);
  const executableBooks = (input.wordBooks ?? []).filter((book) => (book.actualWordCount ?? book.importedWordCount ?? 0) > 0);
  const inventoryGapCount = Math.max(0, suggestedTargetWordCount - (input.coverage?.enabledWordCount ?? executableBooks.reduce((sum, book) => sum + (book.actualWordCount ?? 0), 0)));

  return {
    id: `suggestion:${Date.now()}`,
    mode: input.mode ?? "local_rule",
    adviceType: input.adviceType ?? "goal_parse",
    interpretedGoal: text,
    targetType,
    suggestedTargetWordCount,
    suggestedDailyNewWordRange: range,
    inventoryGapCount,
    suggestedStages: [
      {
        name: "基础补齐",
        purpose: needsFoundation ? "先补足高频基础词和薄弱词" : "快速确认基础词是否存在明显缺口",
        suggestedWordCount: Math.round(suggestedTargetWordCount * (needsFoundation ? 0.35 : 0.2)),
        role: "foundation"
      },
      {
        name: `${targetType} 核心`,
        purpose: "学习目标考试或用途的核心词",
        suggestedWordCount: Math.round(suggestedTargetWordCount * 0.55),
        role: "core"
      },
      {
        name: "复习冲刺",
        purpose: "降低新词压力，集中处理复习、逾期和重点遗忘词",
        suggestedWordCount: Math.max(0, suggestedTargetWordCount - Math.round(suggestedTargetWordCount * (needsFoundation ? 0.35 : 0.2)) - Math.round(suggestedTargetWordCount * 0.55)),
        role: "sprint"
      }
    ],
    recommendedBookCategories: [
      {
        name: "基础高频词",
        role: "基础补齐",
        reason: needsFoundation ? "用户表达了基础不稳，需要先降低目标词书学习门槛" : "用于校准基础覆盖，避免直接进入高压目标词书",
        expectedWordCount: Math.round(suggestedTargetWordCount * 0.25),
        hasExecutableWords: executableBooks.some((book) => book.isFoundation),
        importRequirement: "如当前没有基础词条，需要导入合法基础词表"
      },
      {
        name: `${targetType} 核心词`,
        role: "目标核心",
        reason: "与当前目标最直接相关，导入并启用后才能生成真实具体任务",
        expectedWordCount: Math.round(suggestedTargetWordCount * 0.55),
        hasExecutableWords: executableBooks.some((book) => book.targetType === targetType),
        importRequirement: "需要用户导入或启用对应目标词表"
      },
      {
        name: "强化与冲刺高频",
        role: "冲刺高频",
        reason: "在剩余时间允许时补充扩展词，并优先消化复习压力",
        expectedWordCount: Math.round(suggestedTargetWordCount * 0.2),
        hasExecutableWords: false,
        importRequirement: "可作为候选补充词书，不应在未导入时参与排期"
      }
    ],
    explanation: `当前使用本地规则模式生成建议。建议目标 ${suggestedTargetWordCount} 词，每日新词建议 ${range[0]}-${range[1]} 个；当前预计词库缺口 ${inventoryGapCount} 个。`
  };
}

function inferTargetType(text: string, lower: string): TargetType {
  if (text.includes("雅思") || lower.includes("ielts")) {
    return "IELTS";
  }
  if (text.includes("托福") || lower.includes("toefl")) {
    return "TOEFL";
  }
  if (lower.includes("gre")) {
    return "GRE";
  }
  if (text.includes("六级") || lower.includes("cet6")) {
    return "CET6";
  }
  if (text.includes("四级") || lower.includes("cet4")) {
    return "CET4";
  }
  return "CUSTOM";
}

function inferTargetCount(targetType: TargetType, needsFoundation: boolean): number {
  const base: Record<TargetType, number> = {
    CET4: 650,
    CET6: 900,
    POSTGRAD: 1100,
    IELTS: 1300,
    TOEFL: 1300,
    GRE: 1800,
    CUSTOM: 600
  };
  return base[targetType] + (needsFoundation ? 200 : 0);
}

function inferDailyRange(goal: LearningGoal | null, targetCount: number): [number, number] {
  if (goal) {
    return [Math.max(5, Math.floor(goal.dailyNewWordLimit * 0.6)), goal.dailyNewWordLimit];
  }
  if (targetCount >= 1200) {
    return [20, 35];
  }
  return [12, 25];
}

function summarizeInput(input: PlanningAdviceInput): string {
  const pieces = [`目标文本：${input.text.trim() || "空"}`];
  if (input.currentGoal) {
    pieces.push(`当前目标：${input.currentGoal.targetType} ${input.currentGoal.targetRequiredCount}词`);
  }
  if (input.coverage) {
    pieces.push(`词库：启用${input.coverage.enabledWordCount}，缺口${input.coverage.inventoryGapCount}`);
  }
  return pieces.join("；");
}
