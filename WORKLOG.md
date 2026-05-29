# WORKLOG

## 2026-05-29 - v0.2.1 修复

### 版本与快照

- v0.2.0 修复前最新 commit：`2942df8e952c5d148aa56df942e3639400dc51e8`。
- 已创建并推送快照分支：`snapshot/v0.2.0-reviewed-before-v0.2.1`。
- 当前修复分支：`codex/v0.2.1-daily-settlement-fix`。
- `package.json` 版本号更新为 `0.2.1`。

### 实际确认的缺陷代码路径

- `src/services/plannerService.ts` 中 `recordNewWordAssignmentResult` 在单个新词点击后调用 `generateAndSavePlan(goal, addDays(assignment.date, 1), ...)`。
- `src/domain/scheduler.ts` 中旧逻辑会把早于 `asOfDate` 的 `planned` 新词识别为 backlog。
- `recordReviewAssignmentResult` 对 `not_completed` 复习同样从次日重排，触发同日未操作复习被提前逾期或重排的风险。

### 修复方案

- 调度器不再自动把 past `planned` 新词视为学习欠缺；欠缺只能来自明确 `missed` / `skipped` 或结算。
- 调度器不再自动把 past `planned` 复习视为逾期；逾期只能来自明确 `overdue` 或结算。
- 单个词条结果保存时传入 `preserveOpenDates`，保护同日仍开放的任务。
- 新增 `settleDailyTasks`：用户主动结算指定日期开放任务。
- 新增 `settlePastOpenTasks`：跨日自动结算早于当前目标时区今日的开放任务。
- 跨日结算保护当前日期开放任务容量，避免历史欠缺挤掉今天正常任务。
- 备份版本更新为 `v0.2.1`，保留 v0.2.0 / v0.1.0 导入兼容。

### 新增或修改文件

- `src/domain/scheduler.ts`
- `src/domain/types.ts`
- `src/domain/backup.ts`
- `src/services/plannerService.ts`
- `src/App.tsx`
- `src/styles.css`
- `tests/serviceSettlement.test.ts`
- `tests/importBackup.test.ts`
- `README.md`
- `CHANGELOG.md`
- `docs/scheduling_algorithm.md`
- `docs/v0.2.1_acceptance.md`
- `docs/v0.2.1_pr_description.md`
- `package.json`
- `package-lock.json`

### 新增测试

- 单个新词“已学习 / 已掌握 / 今日未完成 / 暂时跳过”不影响同日其他开放任务。
- 单个复习“认识 / 未完成”不影响同日其他开放复习。
- 主动结算新词和复习。
- 重复结算幂等性。
- 跨日自动结算新词和复习。
- v0.2.0 三个核心业务场景回归。
- v0.2.1 备份、v0.2.0 / v0.1.0 备份兼容和 Asia/Tokyo 时区边界。
- 使用 `fake-indexeddb` 覆盖 Dexie 服务层真实交互路径。

### 测试与构建

```text
npm.cmd test
3 个测试文件，25 个测试通过

npm.cmd run build
TypeScript 与 Vite 生产构建通过
```

- `Invoke-WebRequest http://127.0.0.1:5173`：返回 200。

### 发布状态

- v0.2.1 尚未正式发布。
- 不创建 v0.2.1 tag 或 Release。
- 等待修复分支推送并创建 PR。

## 2026-05-29 - v0.2.0 开发

### Git 与版本

- 读取并核对 `package.json`、`src/`、`tests/`、`docs/`、`README.md`、`WORKLOG.md`、`AGENTS.md`、`TASK_FULL.md`。
- 确认 v0.1.0 为离线数量计划 MVP。
- 新增 `CHANGELOG.md`，补齐 v0.1.0 基线说明。
- 提交基线元数据：`chore: establish v0.1.0 baseline version metadata`。
- 创建并推送 tag：`v0.1.0`。
- Release 未创建：当前环境没有 `gh` CLI。
- 创建开发分支：`codex/v0.2.0-learning-loop`。
- 更新版本号为 `0.2.0`。

### 实际修改文件

- `package.json`
- `package-lock.json`
- `src/domain/types.ts`
- `src/domain/date.ts`
- `src/domain/importWords.ts`
- `src/domain/recommendation.ts`
- `src/domain/sampleData.ts`
- `src/domain/backup.ts`
- `src/domain/scheduler.ts`
- `src/storage/db.ts`
- `src/services/plannerService.ts`
- `src/App.tsx`
- `src/styles.css`
- `tests/scheduler.test.ts`
- `tests/importBackup.test.ts`
- `README.md`
- `CHANGELOG.md`
- `AGENTS.md`
- `TASK_FULL.md`
- `docs/product_scope.md`
- `docs/data_model.md`
- `docs/scheduling_algorithm.md`
- `docs/development_plan.md`
- `docs/ai_planning_contract.md`
- `docs/v0.2.0_acceptance.md`
- `docs/v0.2.0_pr_description.md`

### 完成的功能

- 具体单词级新词任务。
- 具体单词级复习任务。
- 复习反馈后生成下一次复习或逾期状态。
- 词库供给缺口与学习欠缺任务分开统计。
- 导入新词后补足目标缺口并重排。
- 自然语言目标入口和本地 AI mock 建议。
- 计划时区字段和浏览器本地时区默认值。
- v0.2.0 完整备份导出。
- v0.1.0 备份兼容迁移为 legacy 数量记录。

### 重构的核心逻辑

- `generateWordLevelPlan` 取代数量级调度，生成 `DailyNewWordAssignment` 和 `DailyReviewAssignment`。
- `PlanCoverageStatus` 统一计算目标需求、真实供给、已绑定、已完成、库存缺口、学习欠缺和逾期复习。
- UI 不再填写“完成多少个词”，而是逐词记录学习与复习结果。

### 测试命令与结果

```text
npm.cmd test
2 个测试文件，11 个测试通过
```

### 构建命令与结果

```text
npm.cmd run build
TypeScript 与 Vite 生产构建通过
```

### 本地运行检查

- `Start-Process npm.cmd -ArgumentList 'run','dev','--','--host','127.0.0.1','--port','5173'`：已启动本地 Vite 服务。
- `Invoke-WebRequest http://127.0.0.1:5173`：返回 200。
- 内置浏览器 DOM 检查尝试失败，原因是浏览器运行时异常退出；未将该项计为完整浏览器验收。

### 尚未实现

- 真实 AI API。
- 发音、例句、拼写训练。
- 登录、云同步、多端同步。
- v0.2.0 正式 tag / Release。

### GitHub 状态

- v0.1.0 tag 已推送。
- v0.2.0 主提交：`a730fcd`，提交信息 `feat: implement v0.2.0 word-level learning and dynamic planning loop`。
- v0.2.0 分支已推送：`origin/codex/v0.2.0-learning-loop`。
- GitHub 返回 PR 创建入口：`https://github.com/noxto31/smart-vocab-planner/pull/new/codex/v0.2.0-learning-loop`。
- 当前环境无 `gh` / `hub`；尝试通过 `winget install GitHub.cli` 安装 GitHub CLI 超时，已停止残留进程。PR 创建可能需要后续在有 GitHub CLI 或网页权限的环境中完成。
- 已补充 `docs/v0.2.0_pr_description.md`，可直接作为 PR 描述草稿。
