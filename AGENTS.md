# AGENTS.md

## 项目名称

smart-vocab-planner（智能背单词计划安排器）

## 当前版本方向

当前开发目标是 v0.2.1：逐词操作与当日结算一致性修复版。

项目不再限定为“只做数量规划工具”。现行定位是：

1. 真正可背词的软件；
2. 动态计划中枢；
3. AI 规划接口。

## 技术栈

- React
- TypeScript
- Vite
- Dexie / IndexedDB
- Vitest

## 核心约束

- 调度逻辑必须与界面分离，并能被单元测试调用。
- 每日新词任务和复习任务必须绑定具体 `wordId`。
- 词库供给缺口不得被计为用户未完成。
- 用户学习欠缺不得被删除或伪造成已完成。
- 复习历史不得因重排而丢失。
- AI 建议必须经过本地校验和用户确认后才能影响目标。
- 当前版本不接真实 AI API，不抓取商业完整词书。

## 数据兼容

- v0.2.1 使用 Dexie v2 数据结构。
- v0.1.0 备份可导入，但旧数量记录只能作为 legacy 历史保留，不得随机映射到具体单词。

## 必须维护的文件

- `README.md`
- `CHANGELOG.md`
- `WORKLOG.md`
- `TASK_FULL.md`
- `docs/product_scope.md`
- `docs/data_model.md`
- `docs/scheduling_algorithm.md`
- `docs/ai_planning_contract.md`
- `docs/v0.2.0_acceptance.md`
- `docs/v0.2.1_acceptance.md`

## 验证命令

```bash
npm.cmd test
npm.cmd run build
```
