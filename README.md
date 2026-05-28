# 智能背单词计划安排器

本项目是一个本地离线的 Vocabulary Smart Planner MVP。它不做完整背词训练器，而是聚焦目标管理、词书导入、计划生成、完成记录、动态重排、不可行判断和数据备份。

## 技术栈

- React
- TypeScript
- Vite
- Dexie / IndexedDB
- Vitest

## 启动方式

首次使用先安装依赖：

```bash
npm.cmd install
```

启动本地开发服务：

```bash
npm.cmd run dev
```

运行测试：

```bash
npm.cmd test
```

生产构建：

```bash
npm.cmd run build
```

## 使用流程

1. 打开应用后进入“词书管理”，点击“载入演示词表”，或导入自己的 CSV/JSON 词表。
2. 进入“目标设置”，填写学习目的、日期、目标词数、每日上限、休息日、缓冲日和词书范围。
3. 点击“保存并生成计划”。
4. 在“总览”和“计划查看”中查看长期、月度、周度和每日计划。
5. 在“今日任务”记录实际新学、复习和学习时长。
6. 系统会从次日开始重排未来任务，不改变总目标、截止日期和历史记录。
7. 在“数据管理”中导出或导入完整备份 JSON。

## 导入词表格式

CSV 字段：

```csv
word,meaning,book_name,level,tags
example,例子,My Word Book,B1,noun
adapt,适应,My Word Book,B1,verb;core
```

JSON 顶层应为数组，每项至少包含 `word` 字段，可选 `meaning`、`book_name`、`level`、`tags`。

## 演示数据

`sample-data/` 包含：

- `wordbooks.json`：演示词书元数据。
- `demo_words.csv`：约 70 个通用演示词。
- `duplicate_multi_book.csv`：多词书重复单词示例。
- `word_import_template.csv`：导入模板。
- `demo_backup.json`：演示备份结构。

演示词表只用于功能展示和测试，不代表任何商业词书完整内容。

## 核心规则

- 计划基于目标词数、完成记录、学习日、休息日、缓冲日和每日上限生成。
- 少完成的新词不会被取消，会进入未来重排。
- 超额完成的新词会计入实际进度，降低后续剩余量。
- 动态调整不会静默修改总目标、截止日期、词书范围或历史完成记录。
- 当 `剩余新词 / 剩余有效学习日` 超过每日新学上限时，计划状态显示为“按现有限制无法完成”。

## 当前测试结果

已通过：

```text
npm.cmd test
2 个测试文件，11 个测试通过

npm.cmd run build
TypeScript 与 Vite 生产构建通过
```
