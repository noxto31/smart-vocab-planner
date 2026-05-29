# AI 规划合约

v0.2.0 不接入真实外部 AI API，只提供本地 mock 服务与清晰边界。

## 输入

```ts
type AIPlanningInput = {
  text: string;
  currentTimezone: string;
  currentInventoryCount: number;
  currentGoal?: LearningGoal;
};
```

## 输出

```ts
type AIPlanningSuggestion = {
  interpretedGoal: string;
  targetType: string;
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
};
```

## Mock 模式

`src/services/plannerService.ts` 中的 `analyzeNaturalLanguageGoal` 根据“四级、六级、雅思”等关键词生成建议。它不联网、不读取用户隐私数据、不修改实际计划。

## 用户确认流程

1. 用户输入自然语言目标。
2. 系统显示 AI mock 建议。
3. 用户点击“应用到目标表单”。
4. 建议只填入表单，不直接保存。
5. 用户点击“保存并生成计划”后，本地校验目标、容量和词库供给，再生成实际计划。

## 本地校验

任何 AI 建议都必须经过：

- 目标词量正整数校验。
- 截止日期校验。
- 每日新词上限和复习上限校验。
- 真实词库供给判断。
- 不可行状态判断。

AI 不允许直接决定每个单词的复习日期，不允许绕过库存缺口或容量限制。

## 当前不实现

- 真实大模型 API 调用。
- API Key 管理。
- AI 在线释义、例句或任意单词排期。
- 依赖网络才能运行的核心背词功能。
