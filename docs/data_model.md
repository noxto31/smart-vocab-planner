# 数据模型设计

## 日期约定

系统统一使用 `YYYY-MM-DD` 日期字符串表示本地学习日。算法只处理日期字符串，不依赖运行环境的时区时刻，避免跨天造成任务错乱。项目默认解释为 Asia/Shanghai 的自然日。

## UserGoal

用户学习目标。动态调整不得静默修改其中的总目标、截止日期和用户选择范围。

字段：

- `id`：目标 ID。
- `targetType`：CET-4、CET-6、POSTGRAD、IELTS、TOEFL、GRE 或 CUSTOM。
- `targetDescription`：目标说明。
- `startDate`：计划开始日期。
- `deadline`：最终截止日期。
- `targetVocabularyCount`：总目标新学词数。
- `currentEstimatedVocabulary`：自评词汇量。
- `dailyNewWordLimit`：每日新学上限。
- `dailyReviewLimit`：每日复习上限。
- `studyDaysPerWeek`：每周学习天数。
- `restWeekdays`：固定休息日，0 表示周日，6 表示周六。
- `bufferDayRatio`：缓冲日比例。
- `planStyle`：`steady`、`frontLoaded` 或 `flexible`。
- `selectedBookIds`：纳入目标的词书范围。
- `createdAt`、`updatedAt`：更新时间。

## WordBook

词书元数据，不包含未经许可的商业词书全文。

字段：

- `id`
- `name`
- `targetType`
- `difficulty`
- `estimatedWordCount`
- `sourceDescription`
- `hasImportedWords`
- `recommendationTags`
- `isFoundation`
- `isTargetBook`
- `overlapNote`

## WordItem

导入后的单词。去重以 `normalizedWord` 为准，同一单词可保留多个 `sourceBookIds`。

字段：

- `id`
- `word`
- `normalizedWord`
- `meaning`
- `sourceBookIds`
- `sourceBookNames`
- `level`
- `tags`
- `status`：`new`、`known`、`excluded`、`learning`、`mastered`。
- `createdAt`、`updatedAt`

## StudyPlan

计划版本摘要。

字段：

- `id`
- `goalId`
- `generatedAt`
- `version`
- `feasibilityStatus`：`feasible`、`atRisk`、`infeasible`、`completed`。
- `remainingNewWords`
- `remainingEffectiveDays`
- `requiredDailyAverage`
- `dailyLimitGap`
- `adjustmentReason`

## DailyTask

每日任务。历史日期的实际完成记录不被未来重排覆盖。

字段：

- `id`
- `goalId`
- `planId`
- `date`
- `plannedNewWordCount`
- `plannedReviewCount`
- `actualNewWordCount`
- `actualReviewCount`
- `missedNewWordCount`
- `missedReviewCount`
- `completionStatus`：`planned`、`completed`、`partial`、`missed`、`rest`。
- `isBufferDay`
- `isRestDay`
- `sourceBookNames`
- `adjustmentReason`

## ReviewTask

第一版以数量调度为主，保留复习任务实体以支持后续扩展到单词级复习。

字段：

- `id`
- `wordId`
- `dueDate`
- `reviewStage`
- `result`
- `completedAt`
- `rescheduledFrom`

## ProgressRecord

用户每日填写的完成记录，是动态重排的事实来源。

字段：

- `id`
- `goalId`
- `date`
- `newWordsCompleted`
- `reviewsCompleted`
- `minutesSpent`
- `note`
- `createdAt`

## PlanAdjustmentLog

每次生成或重排计划时记录原因，便于解释。

字段：

- `id`
- `createdAt`
- `triggerType`：`initial`、`dailyRecord`、`settingsChange`、`import`、`manual`。
- `previousPlanVersion`
- `newPlanVersion`
- `reason`
- `changesSummary`
- `feasibilityStatus`

## BackupData

导出的备份包含：

- `schemaVersion`
- `exportedAt`
- `goals`
- `wordBooks`
- `words`
- `studyPlans`
- `dailyTasks`
- `reviewTasks`
- `progressRecords`
- `adjustmentLogs`

导入备份时必须校验基础结构；失败时展示明确错误，而不是静默丢弃数据。
