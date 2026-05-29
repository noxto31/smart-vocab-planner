# WORKLOG

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
