# WORKLOG

## 2026-05-26

### 已完成

- 完整读取并遵守 `AGENTS.md` 和 `TASK_FULL.md`。
- 创建设计文档：
  - `docs/product_scope.md`
  - `docs/data_model.md`
  - `docs/scheduling_algorithm.md`
  - `docs/development_plan.md`
- 初始化 React + TypeScript + Vite + Dexie + Vitest 项目。
- 实现核心领域模块：
  - 日期处理：`src/domain/date.ts`
  - 类型模型：`src/domain/types.ts`
  - CSV/JSON 导入与去重：`src/domain/importWords.ts`
  - 词书推荐：`src/domain/recommendation.ts`
  - 计划生成与动态重排：`src/domain/scheduler.ts`
  - 备份校验：`src/domain/backup.ts`
  - 演示数据：`src/domain/sampleData.ts`
- 实现 IndexedDB 存储和服务层：
  - `src/storage/db.ts`
  - `src/services/plannerService.ts`
- 实现中文 MVP 界面：
  - 总览仪表盘
  - 目标设置
  - 今日任务记录
  - 计划查看
  - 词书管理与导入
  - 统计
  - 数据导入导出和清空
- 创建演示数据：
  - `sample-data/wordbooks.json`
  - `sample-data/demo_words.csv`
  - `sample-data/duplicate_multi_book.csv`
  - `sample-data/word_import_template.csv`
  - `sample-data/demo_backup.json`
- 创建自动化测试：
  - `tests/scheduler.test.ts`
  - `tests/importBackup.test.ts`

### 测试与构建

- `npm.cmd test`：通过，2 个测试文件，11 个测试。
- `npm.cmd run build`：通过，TypeScript 和 Vite 生产构建成功。

### 覆盖的关键场景

- 正常生成长期、月度、周度和每日计划。
- 1000 个待学习词、100 个有效学习日平均分配为每日 10 个。
- 休息日不安排任务。
- 缓冲日生效。
- 少完成后欠缺任务进入后续重排。
- 超额完成后剩余任务减少。
- 连续三天未完成时不缩减总目标。
- 剩余学习天数不足时判定不可行。
- 每日新学上限生效。
- 多词书导入去重并保留来源。
- 导出后重新导入可恢复目标和完成记录。

### 尚未完成但不影响 MVP 使用的问题

- 复习任务第一版按数量调度，尚未扩展到逐个单词的复习卡片。
- 未实现发音、拼写、例句或 AI 生成内容，符合第一版范围约束。
- 统计图暂用表格和数字摘要，后续可加入轻量图表。
