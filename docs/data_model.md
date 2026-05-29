# 数据模型：v0.2.1

## 核心数量

- `targetRequiredCount`：用户目标需求量，不因库存不足或学习欠缺自动减少。
- `availableWordCount`：当前数据库中符合目标范围的真实去重单词数。
- `assignedWordCount`：已经绑定到具体单词并进入每日安排或学习状态的数量。
- `completedWordCount`：用户实际完成新学的具体单词数量。

## 两类缺口

- `inventoryGapCount`：目标需求量超过当前真实词库供给的部分。它不是用户未完成任务。
- `learningBacklogCount`：已经分配了具体单词，但用户跳过、未完成或逾期未学的部分。

## 主要实体

### LearningGoal

保存目标输入方式、自然语言原文、解释后的目标、目标类型、目标需求词量、开始日期、截止日期、每日新词上限、每日复习上限、休息日、缓冲日比例、计划类型、计划时区和词书范围。

### WordItem

导入后的真实词条。以 `normalizedWord` 去重，一个单词可包含多个 `sourceBookIds` 和 `sourceBookNames`。

### WordProgress

每个具体单词的学习状态：

- `not_started`
- `assigned_new`
- `learning_backlog`
- `learned`
- `reviewing`
- `mastered`
- `excluded`

同时保存首次分配日期、首次学习日期、最近复习日期、下一次复习日期、复习阶段、遗忘次数和来源词书。

### DailyNewWordAssignment

每日新词任务，必须绑定 `wordId`。状态包括 `planned`、`learned`、`mastered`、`skipped`、`missed`、`rescheduled`。

### DailyReviewAssignment

每日复习任务，必须绑定 `wordId` 和 `reviewStage`。状态包括 `planned`、`completed`、`overdue`、`rescheduled`；结果包括 `forgot`、`vague`、`known`、`easy`、`not_completed`。

### PlanCoverageStatus

计划覆盖快照，包含目标需求量、可供给量、已绑定量、实际完成量、库存缺口、学习欠缺和逾期复习。

### PlanAdjustmentLog

记录触发原因、调整前后覆盖快照、受影响日期和解释。用于说明库存补足、用户未完成、复习逾期或 AI 建议应用后的重排原因。

## Dexie v2 表

- `goals`
- `wordBooks`
- `words`
- `wordProgress`
- `studyPlans`
- `dailyTasks`
- `dailyNewAssignments`
- `dailyReviewAssignments`
- `reviewHistory`
- `legacyProgressRecords`
- `adjustmentLogs`

## 迁移策略

v0.1.0 的 `targetVocabularyCount` 迁移为 `targetRequiredCount`。旧 `WordItem.status` 不再作为具体学习事实使用。旧 `progressRecords` 只有数量，无法证明用户过去具体学了哪些词，因此迁移为 `legacyProgressRecords`，并标注“v0.1.0 历史数量记录”，不伪造具体单词历史。

## 备份策略

v0.2.1 备份使用：

```json
{
  "schemaVersion": 2,
  "backupVersion": "v0.2.1"
}
```

导入时支持识别 v0.1.0、v0.2.0 和 v0.2.1。v0.1.0 会转换为当前结构并保留旧数量记录。
