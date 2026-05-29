# WORKLOG

## 2026-05-29 - v0.3.0 启动与设计冻结

### 远程状态核对

- 当前仓库：`https://github.com/noxto31/smart-vocab-planner.git`。
- 当前默认主分支：`master`，`origin/HEAD -> origin/master`。
- `master` 最新 commit：`7f3db39a57994f3032be05c6336080b78bcd1f05`。
- `v0.1.0` tag 指向：`9e61c3df1a2780dd2b5c12b3bf46a5d7115ec916`。
- `codex/v0.2.0-learning-loop` 最新 commit：`2942df8e952c5d148aa56df942e3639400dc51e8`。
- `codex/v0.2.1-daily-settlement-fix` 最新 commit：`06e177025efa142cc794daad5c60c0f588d6f849`。
- 实际存在 `v0.2.1` tag，指向 `master` 合并提交 `7f3db39a57994f3032be05c6336080b78bcd1f05`；这与本轮任务中“尚未创建 v0.2.1 tag”的说明不一致。
- GitHub Releases 页面显示当前没有 Release；本机无 `gh` CLI，无法用 CLI 查询或创建 Release。
- 本轮开始时不存在远程 `codex/v0.3.0-smart-vocab-beta` 分支，不存在 `v0.3.0` tag。

### v0.2.1 技术基线确认

- 已切换并拉取 `codex/v0.2.1-daily-settlement-fix`，远程已是最新。
- `package.json` 版本号为 `0.2.1`。
- README、CHANGELOG、WORKLOG 已描述具体单词学习和当日结算修复。
- `tests/serviceSettlement.test.ts` 存在并覆盖逐词操作、主动结算、跨日自动结算和幂等性。
- `src/services/plannerService.ts` 中逐词新词和复习保存均调用 `generateAndSavePlan` 时传入 `preserveOpenDates`，同日其他任务保持开放。
- `settleDailyTasks` 和 `settlePastOpenTasks` 存在。
- `src/domain/backup.ts` 支持 v0.2.1/v0.2.0/v0.1.0 备份解析和 legacy 迁移。

### 基线验证

```text
npm.cmd test
3 个测试文件，25 个测试通过

npm.cmd run build
TypeScript 与 Vite 生产构建通过
```

### 快照与 v0.3.0 分支

- 已创建并推送快照分支：`snapshot/v0.2.1-technical-baseline-before-v0.3.0` -> `06e177025efa142cc794daad5c60c0f588d6f849`。
- 已从 v0.2.1 技术基线创建开发分支：`codex/v0.3.0-smart-vocab-beta`。
- 已提交 `chore: start v0.3.0 beta branch`，将 `package.json` 和 `package-lock.json` 版本号更新为 `0.3.0`。

### 设计冻结文档

- 新增 `docs/v0.3.0_product_scope.md`。
- 新增 `docs/v0.3.0_user_flows.md`。
- 新增 `docs/v0.3.0_data_model.md`。
- 新增 `docs/v0.3.0_scheduling_contract.md`。
- 新增 `docs/v0.3.0_ai_planning_contract.md`。
- 新增 `docs/v0.3.0_migration_plan.md`。
- 新增 `docs/v0.3.0_acceptance.md`。
- 新增 `docs/v0.3.0_implementation_plan.md`。
- 同步更新 README、CHANGELOG、AGENTS 和 TASK_FULL，将 v0.3.0 边界改为开发目标，不虚构未实现能力。

### 核心实现

- 扩展 `src/domain/types.ts`：新增目标版本历史、阶段计划、词书状态、每日结算记录、周度复盘、月度复盘、AI 建议和 AI 应用记录。
- 升级 `src/storage/db.ts` 到 Dexie v3，并为 v0.2.1 数据补齐初始目标版本、词书状态和单词进度扩展字段。
- 升级 `src/domain/backup.ts` 到 v0.3.0 schema 3，兼容 v0.1.0、v0.2.0、v0.2.1 备份迁移。
- 新增 `src/domain/aiPlanning.ts`，实现本地规则规划建议、结构校验和失败降级边界。
- 扩展 `src/domain/scheduler.ts`：生成阶段计划、周度复盘、月度复盘，补齐 `enabledWordCount`、`reviewingWordCount`、`masteredWordCount`，并按词书和阶段优先级选择具体单词。
- 扩展 `src/services/plannerService.ts`：保存目标时写目标版本，确认自然语言建议后写 AI 应用记录，重排时写阶段和周月复盘，结算时写每日结算记录，导入备份在事务内清空和恢复。
- 更新 `src/App.tsx`：页面结构调整为今日任务、目标与阶段计划、背词执行、长期计划、词书与词库、学习历史、设置与数据，并展示目标历史、阶段、词书状态、词条历史、复习历史和复盘数据。

### 新增测试

- 新增 `tests/v030Acceptance.test.ts`，覆盖自然语言建议不自动应用、AI 应用记录、目标版本、阶段计划、周月复盘、词书推荐状态、具体词选择优先级、重点遗忘词、v0.3.0 备份往返、异常备份安全失败和 v0.1.0 legacy 迁移。
- 更新 `tests/importBackup.test.ts` 和 `tests/serviceSettlement.test.ts`，将备份期望升级为 v0.3.0，同时保留 v0.2.0/v0.1.0 兼容验证。

### 当前验证结果

```text
npm.cmd test
4 个测试文件，32 个测试通过

npm.cmd run build
TypeScript 与 Vite 生产构建通过
```

- `package.json` 未提供 `lint` 或 `typecheck` 脚本；类型检查已由 `npm.cmd run build` 中的 `tsc --noEmit` 覆盖。

## 2026-05-29 - v0.3.0 正式发布前修复

### 远程状态复核

- 默认主分支：`master`，`origin/HEAD -> origin/master`。
- 开发分支：`codex/v0.3.0-smart-vocab-beta` 已存在。
- 实际已存在远程 `v0.3.0` tag，但 GitHub Releases 页面显示没有 Release。
- 仓库原先没有 `.github/workflows` 发布工作流。

### 修复内容

- 修复 `availableWordCount` 与 `enabledWordCount` 语义混淆：`availableWordCount` 统计全部可用去重词，`enabledWordCount` 只统计当前目标已启用且参与计划计算的词。
- 修复 AI 建议应用记录误记：`saveGoal` 不再仅凭 `goalInputMode: natural_language` 写 AI 应用记录；只有显式传入 `appliedAdviceId` 时才记录应用。
- 更新 UI 展示，首页和长期计划页分别展示可供给词量与已启用词量。
- 新增 `.github/workflows/release-on-tag.yml`，在 `v*` tag 推送时由 GitHub Actions 执行 `npm ci`、`npm test`、`npm run build` 并创建 Release。

### 修复后验证

```text
npm.cmd test
4 个测试文件，34 个测试通过

npm.cmd run build
TypeScript 与 Vite 生产构建通过
```

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

### 最终发布前验证

```text
git fetch origin --tags
git checkout codex/v0.2.1-daily-settlement-fix
git pull origin codex/v0.2.1-daily-settlement-fix

npm.cmd test
3 个测试文件，25 个测试通过

npm.cmd run build
TypeScript 与 Vite 生产构建通过
```

- 确认 `master` 合并前仍位于 v0.1.0 基线提交。
- 确认本地 tag 仅有 `v0.1.0`，发布前不存在 `v0.2.1` tag。
- 确认 `package.json` 版本号为 `0.2.1`。
- 已准备 `docs/v0.2.1_release_notes.md`，用于当前环境无法直接创建 GitHub Release 时手动发布。

### 发布状态

- 修复提交：`a5c5aaa5c8b2e115663cc852d7adef1202a19e1c`，提交信息 `fix: implement v0.2.1 daily settlement and task consistency repair`。
- 快照分支已推送：`origin/snapshot/v0.2.0-reviewed-before-v0.2.1` -> `2942df8e952c5d148aa56df942e3639400dc51e8`。
- v0.2.1 修复分支已推送：`origin/codex/v0.2.1-daily-settlement-fix` -> `a5c5aaa5c8b2e115663cc852d7adef1202a19e1c`。
- GitHub 返回 PR 创建入口：`https://github.com/noxto31/smart-vocab-planner/pull/new/codex/v0.2.1-daily-settlement-fix`。
- PR 未能由当前环境自动创建：本机无 `gh` / `hub`，且未配置可用的 GitHub 自动化认证。
- v0.2.1 进入正式合并与发布流程。
- 当前环境无 `gh` / `hub`，且未配置可用的 GitHub 自动化认证；若仍无法创建 GitHub Release，将保留 release notes 供网页手动创建。

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
