# 调度算法：v0.2.0

核心实现位于 `src/domain/scheduler.ts`，界面层只调用服务函数，不直接写调度逻辑。

## 新词绑定

1. 根据目标词书范围筛选 `WordItem`。
2. 按 `normalizedWord` 排序后取不超过 `targetRequiredCount` 的真实词条。
3. 为目标词条建立或更新 `WordProgress`。
4. 未完成目标词按优先级排期：
   - `learning_backlog` 先排。
   - `not_started` 后排。
5. 每个每日新词任务生成 `DailyNewWordAssignment`，并绑定具体 `wordId`。

## 词库不足

当 `targetRequiredCount > availableWordCount`：

- 只为真实存在的词条生成任务。
- `inventoryGapCount = targetRequiredCount - availableWordCount`。
- 不伪造缺失的具体单词。
- 不把库存缺口计入用户学习欠缺。
- 调整解释中提示需要补充词书。

## 用户未完成

当用户把具体新词标记为 `skipped` 或 `missed`：

- 对应 `WordProgress.state` 变为 `learning_backlog`。
- 历史任务保留，不删除。
- 重排时优先使用缓冲日，再使用后续有效学习日。
- 如果容量不足，计划状态为 `infeasible`，但不删除待补学词。

## 复习排期

基础节点：

- 新学后第 1 天
- 第 3 天
- 第 7 天
- 第 14 天
- 第 30 天

反馈规则：

- `forgot`：次日复习，`lapseCount + 1`。
- `vague`：缩短下一阶段间隔。
- `known`：进入正常下一阶段。
- `easy`：跳到更远阶段，达到末段后标记掌握。
- `not_completed`：当前任务变为逾期，不删除，后续重新安排。

每次复习写入 `reviewHistory`。

## 联合容量判断

重排时同时计算：

- 每日新词上限。
- 每日复习上限。
- 固定休息日。
- 缓冲日。
- 具体待补学词。
- 逾期复习任务。
- 库存缺口。
- 剩余有效学习日。

不可行状态必须显示最低每日新学量、当前上限和差距。

## 新词书补足缺口

导入词表后：

1. 先进行标准化去重。
2. 重新计算 `availableWordCount` 和 `inventoryGapCount`。
3. 新增且未重复的词进入目标候选词集合。
4. 为新增可用词生成后续 `DailyNewWordAssignment`。
5. 创建 `wordbook_import` 调整日志，记录新增、重复、补足和剩余缺口。

## 历史补录与重复修改

v0.2.0 的事实来源是具体任务状态和 `WordProgress`。同一任务再次修改时以 assignment id 覆盖，不通过数量累加，避免重复累计。v0.1.0 的数量记录只作为 legacy 展示，不参与具体单词完成统计。

## 时区

默认使用浏览器本地时区，目标保存 `timezone`。今日任务、复习到期和重排日期统一使用该时区的自然日。
