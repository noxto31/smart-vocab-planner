import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { addDays, compareDates, endOfIsoWeek, monthKey, nowIso, startOfIsoWeek, todayInShanghai } from "./domain/date";
import { TARGET_LABELS, recommendBooks } from "./domain/recommendation";
import type {
  DailyTask,
  FeasibilityStatus,
  PlanStyle,
  TargetType,
  UserGoal,
  Weekday
} from "./domain/types";
import {
  createDemoGoalAndPlan,
  exportBackup,
  generateAndSavePlan,
  importBackup,
  importWordText,
  loadAllData,
  loadDemoDataset,
  recordDailyProgress,
  resetAllData,
  saveGoal,
  type AppDataState
} from "./services/plannerService";

type TabId = "dashboard" | "goal" | "today" | "plans" | "books" | "stats" | "data";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "dashboard", label: "总览" },
  { id: "goal", label: "目标设置" },
  { id: "today", label: "今日任务" },
  { id: "plans", label: "计划查看" },
  { id: "books", label: "词书管理" },
  { id: "stats", label: "统计" },
  { id: "data", label: "数据管理" }
];

const weekdays: Array<{ value: Weekday; label: string }> = [
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
  { value: 0, label: "周日" }
];

const feasibilityLabels: Record<FeasibilityStatus, string> = {
  feasible: "进度正常",
  atRisk: "略有压力",
  infeasible: "按现有限制无法完成",
  completed: "目标已完成"
};

const planStyleLabels: Record<PlanStyle, string> = {
  steady: "平稳型",
  frontLoaded: "前紧后松型",
  flexible: "弹性型"
};

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [data, setData] = useState<AppDataState | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [goalForm, setGoalForm] = useState<UserGoal>(() => createDefaultGoal());
  const [recordForm, setRecordForm] = useState({
    date: todayInShanghai(),
    newWordsCompleted: 0,
    reviewsCompleted: 0,
    minutesSpent: 30,
    note: ""
  });
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importText, setImportText] = useState("");
  const [backupText, setBackupText] = useState("");

  const refresh = async () => {
    const loaded = await loadAllData();
    setData(loaded);
    if (loaded.goals[0]) {
      setGoalForm(loaded.goals[0]);
    }
  };

  useEffect(() => {
    void refresh().catch((caught) => setError(String(caught)));
  }, []);

  const currentGoal = data?.goals[0] ?? null;
  const latestPlan = data?.studyPlans[0] ?? null;
  const goalTasks = useMemo(
    () => (currentGoal && data ? data.dailyTasks.filter((task) => task.goalId === currentGoal.id) : []),
    [currentGoal, data]
  );
  const today = todayInShanghai();
  const todayTask = goalTasks.find((task) => task.date === today) ?? goalTasks.find((task) => compareDates(task.date, today) >= 0) ?? null;
  const completedNewWords = data?.progressRecords
    .filter((record) => !currentGoal || record.goalId === currentGoal.id)
    .reduce((sum, record) => sum + record.newWordsCompleted, 0) ?? 0;
  const missedNewWords = goalTasks.reduce((sum, task) => sum + task.missedNewWordCount, 0);
  const uniqueWordCount = data?.words.length ?? 0;
  const selectedWordsCount = currentGoal
    ? data?.words.filter((word) =>
        currentGoal.selectedBookIds.length === 0 || word.sourceBookIds.some((bookId) => currentGoal.selectedBookIds.includes(bookId))
      ).length ?? 0
    : uniqueWordCount;

  const monthlyRows = useMemo(() => buildMonthlyRows(goalTasks, currentGoal?.targetVocabularyCount ?? 1), [goalTasks, currentGoal]);
  const weeklyRows = useMemo(() => buildWeeklyRows(goalTasks), [goalTasks]);
  const recommendations = useMemo(
    () => recommendBooks(currentGoal, data?.wordBooks ?? [], uniqueWordCount).slice(0, 5),
    [currentGoal, data?.wordBooks, uniqueWordCount]
  );

  const runAction = async (action: () => Promise<void>, successMessage: string) => {
    setError("");
    setMessage("");
    try {
      await action();
      await refresh();
      setMessage(successMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };

  const handleGoalSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await runAction(async () => {
      const savedGoal = await saveGoal({
        ...goalForm,
        studyDaysPerWeek: 7 - goalForm.restWeekdays.length,
        selectedBookIds: goalForm.selectedBookIds,
        updatedAt: nowIso()
      });
      const asOfDate = compareDates(savedGoal.startDate, today) > 0 ? savedGoal.startDate : today;
      await generateAndSavePlan(savedGoal, asOfDate, currentGoal ? "settingsChange" : "initial", "保存目标设置后生成计划");
    }, "目标已保存，计划已生成");
  };

  const handleRecordSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentGoal) {
      setError("请先创建目标");
      return;
    }
    await runAction(async () => {
      await recordDailyProgress({
        goal: currentGoal,
        date: recordForm.date,
        newWordsCompleted: recordForm.newWordsCompleted,
        reviewsCompleted: recordForm.reviewsCompleted,
        minutesSpent: recordForm.minutesSpent,
        note: recordForm.note
      });
    }, "完成记录已保存，未来计划已重排");
  };

  const handleImport = async () => {
    await runAction(async () => {
      const result = await importWordText(importText, importFormat);
      if (result.errors.length > 0) {
        setMessage(`导入完成：新增 ${result.addedCount} 个，重复 ${result.duplicateCount} 个；提示：${result.errors.join("；")}`);
      } else {
        setMessage(`导入完成：新增 ${result.addedCount} 个，重复 ${result.duplicateCount} 个`);
      }
    }, "词表导入完成");
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setImportText(await file.text());
  };

  const handleExport = async () => {
    await runAction(async () => {
      const backup = await exportBackup();
      const text = JSON.stringify(backup, null, 2);
      setBackupText(text);
      downloadText("vocabulary-smart-planner-backup.json", text, "application/json");
    }, "备份已生成");
  };

  const handleImportBackup = async () => {
    await runAction(async () => {
      await importBackup(backupText);
    }, "备份已导入");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">VSP</span>
          <div>
            <strong>智能背单词计划安排器</strong>
            <small>本地离线 MVP</small>
          </div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {tabs.map((tab) => (
            <button
              className={activeTab === tab.id ? "active" : ""}
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Asia/Shanghai 日期：{today}</p>
            <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
          </div>
          <div className={`status-pill ${latestPlan?.feasibilityStatus ?? "empty"}`}>
            {latestPlan ? feasibilityLabels[latestPlan.feasibilityStatus] : "尚未生成计划"}
          </div>
        </header>

        {message && <div className="notice success">{message}</div>}
        {error && <div className="notice error">{error}</div>}

        {activeTab === "dashboard" && (
          <section className="section-stack">
            <div className="metric-grid">
              <MetricCard label="目标词数" value={currentGoal?.targetVocabularyCount ?? 0} />
              <MetricCard label="已完成新学" value={completedNewWords} />
              <MetricCard label="待学习" value={latestPlan?.remainingNewWords ?? currentGoal?.targetVocabularyCount ?? 0} />
              <MetricCard label="去重词表" value={uniqueWordCount} />
            </div>

            <div className="two-column">
              <Panel title="今日任务">
                {todayTask ? (
                  <div className="task-highlight">
                    <strong>{todayTask.date}</strong>
                    <span>新学 {todayTask.plannedNewWordCount} 个</span>
                    <span>复习 {todayTask.plannedReviewCount} 个</span>
                    <span>{todayTask.adjustmentReason}</span>
                  </div>
                ) : (
                  <EmptyState text="暂无今日任务，请先载入词表并生成计划" />
                )}
              </Panel>

              <Panel title="可行性">
                {latestPlan ? (
                  <dl className="info-list">
                    <div>
                      <dt>剩余有效学习日</dt>
                      <dd>{latestPlan.remainingEffectiveDays}</dd>
                    </div>
                    <div>
                      <dt>最低每日新学</dt>
                      <dd>{latestPlan.requiredDailyAverage}</dd>
                    </div>
                    <div>
                      <dt>与上限差距</dt>
                      <dd>{latestPlan.dailyLimitGap}</dd>
                    </div>
                    <div>
                      <dt>说明</dt>
                      <dd>{latestPlan.adjustmentReason}</dd>
                    </div>
                  </dl>
                ) : (
                  <EmptyState text="计划生成后会显示不可行原因" />
                )}
              </Panel>
            </div>

            <Panel title="最近调整">
              <CompactLog logs={data?.adjustmentLogs ?? []} />
            </Panel>
          </section>
        )}

        {activeTab === "goal" && (
          <form className="section-stack" onSubmit={handleGoalSubmit}>
            <Panel title="学习目标">
              <div className="form-grid">
                <label>
                  学习目的
                  <select
                    value={goalForm.targetType}
                    onChange={(event) => setGoalForm({ ...goalForm, targetType: event.target.value as TargetType })}
                  >
                    {Object.entries(TARGET_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  开始日期
                  <input
                    type="date"
                    value={goalForm.startDate}
                    onChange={(event) => setGoalForm({ ...goalForm, startDate: event.target.value })}
                  />
                </label>
                <label>
                  截止日期
                  <input
                    type="date"
                    value={goalForm.deadline}
                    onChange={(event) => setGoalForm({ ...goalForm, deadline: event.target.value })}
                  />
                </label>
                <label>
                  目标词汇量
                  <input
                    min={1}
                    type="number"
                    value={goalForm.targetVocabularyCount}
                    onChange={(event) => setGoalForm({ ...goalForm, targetVocabularyCount: Number(event.target.value) })}
                  />
                </label>
                <label>
                  当前自评词汇量
                  <input
                    min={0}
                    type="number"
                    value={goalForm.currentEstimatedVocabulary ?? 0}
                    onChange={(event) => setGoalForm({ ...goalForm, currentEstimatedVocabulary: Number(event.target.value) })}
                  />
                </label>
                <label>
                  目标说明
                  <input
                    value={goalForm.targetDescription}
                    onChange={(event) => setGoalForm({ ...goalForm, targetDescription: event.target.value })}
                  />
                </label>
              </div>
              <button type="button" className="secondary" onClick={() => setGoalForm({ ...goalForm, targetVocabularyCount: Math.max(1, selectedWordsCount) })}>
                使用当前去重词数
              </button>
            </Panel>

            <Panel title="任务容量">
              <div className="form-grid">
                <label>
                  每日新学上限
                  <input
                    min={1}
                    type="number"
                    value={goalForm.dailyNewWordLimit}
                    onChange={(event) => setGoalForm({ ...goalForm, dailyNewWordLimit: Number(event.target.value) })}
                  />
                </label>
                <label>
                  每日复习上限
                  <input
                    min={0}
                    type="number"
                    value={goalForm.dailyReviewLimit}
                    onChange={(event) => setGoalForm({ ...goalForm, dailyReviewLimit: Number(event.target.value) })}
                  />
                </label>
                <label>
                  缓冲日比例
                  <input
                    max={0.5}
                    min={0}
                    step={0.01}
                    type="number"
                    value={goalForm.bufferDayRatio}
                    onChange={(event) => setGoalForm({ ...goalForm, bufferDayRatio: Number(event.target.value) })}
                  />
                </label>
                <label>
                  计划类型
                  <select
                    value={goalForm.planStyle}
                    onChange={(event) => setGoalForm({ ...goalForm, planStyle: event.target.value as PlanStyle })}
                  >
                    {Object.entries(planStyleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <fieldset className="check-row">
                <legend>固定休息日</legend>
                {weekdays.map((weekday) => (
                  <label key={weekday.value}>
                    <input
                      type="checkbox"
                      checked={goalForm.restWeekdays.includes(weekday.value)}
                      onChange={() => setGoalForm({ ...goalForm, restWeekdays: toggleWeekday(goalForm.restWeekdays, weekday.value) })}
                    />
                    {weekday.label}
                  </label>
                ))}
              </fieldset>
            </Panel>

            <Panel title="词书范围">
              <div className="book-select-list">
                {(data?.wordBooks ?? []).map((book) => (
                  <label key={book.id}>
                    <input
                      type="checkbox"
                      checked={goalForm.selectedBookIds.includes(book.id)}
                      onChange={() =>
                        setGoalForm({
                          ...goalForm,
                          selectedBookIds: toggleString(goalForm.selectedBookIds, book.id)
                        })
                      }
                    />
                    <span>{book.name}</span>
                    <small>{book.difficulty} · {book.estimatedWordCount} 词</small>
                  </label>
                ))}
              </div>
            </Panel>

            <div className="action-row">
              <button type="submit">保存并生成计划</button>
              <button type="button" className="secondary" onClick={() => void runAction(async () => { await loadDemoDataset(); await createDemoGoalAndPlan(); }, "演示目标和计划已创建")}>
                创建演示目标
              </button>
            </div>
          </form>
        )}

        {activeTab === "today" && (
          <section className="section-stack">
            <Panel title="当前任务">
              {todayTask ? (
                <div className="task-grid">
                  <MetricCard label="日期" value={todayTask.date} />
                  <MetricCard label="计划新学" value={todayTask.plannedNewWordCount} />
                  <MetricCard label="计划复习" value={todayTask.plannedReviewCount} />
                  <MetricCard label="状态" value={todayTask.completionStatus === "rest" ? "休息日" : "待记录"} />
                </div>
              ) : (
                <EmptyState text="暂无可记录任务" />
              )}
            </Panel>

            <Panel title="记录完成情况">
              <form className="form-grid" onSubmit={handleRecordSubmit}>
                <label>
                  日期
                  <input
                    type="date"
                    value={recordForm.date}
                    onChange={(event) => setRecordForm({ ...recordForm, date: event.target.value })}
                  />
                </label>
                <label>
                  实际新学
                  <input
                    min={0}
                    type="number"
                    value={recordForm.newWordsCompleted}
                    onChange={(event) => setRecordForm({ ...recordForm, newWordsCompleted: Number(event.target.value) })}
                  />
                </label>
                <label>
                  实际复习
                  <input
                    min={0}
                    type="number"
                    value={recordForm.reviewsCompleted}
                    onChange={(event) => setRecordForm({ ...recordForm, reviewsCompleted: Number(event.target.value) })}
                  />
                </label>
                <label>
                  学习分钟
                  <input
                    min={0}
                    type="number"
                    value={recordForm.minutesSpent}
                    onChange={(event) => setRecordForm({ ...recordForm, minutesSpent: Number(event.target.value) })}
                  />
                </label>
                <label className="wide">
                  备注
                  <input value={recordForm.note} onChange={(event) => setRecordForm({ ...recordForm, note: event.target.value })} />
                </label>
                <button type="submit">保存记录并重排</button>
              </form>
            </Panel>
          </section>
        )}

        {activeTab === "plans" && (
          <section className="section-stack">
            <Panel title="长期计划">
              {latestPlan && currentGoal ? (
                <dl className="info-list">
                  <div>
                    <dt>总目标</dt>
                    <dd>{currentGoal.targetVocabularyCount}</dd>
                  </div>
                  <div>
                    <dt>已完成</dt>
                    <dd>{completedNewWords}</dd>
                  </div>
                  <div>
                    <dt>剩余</dt>
                    <dd>{latestPlan.remainingNewWords}</dd>
                  </div>
                  <div>
                    <dt>计划状态</dt>
                    <dd>{feasibilityLabels[latestPlan.feasibilityStatus]}</dd>
                  </div>
                  <div>
                    <dt>调整说明</dt>
                    <dd>{latestPlan.adjustmentReason}</dd>
                  </div>
                </dl>
              ) : (
                <EmptyState text="尚未生成长期计划" />
              )}
            </Panel>

            <div className="two-column">
              <Panel title="月度计划">
                <DataTable
                  columns={["月份", "新学", "复习", "缓冲日", "完成率"]}
                  rows={monthlyRows.map((row) => [
                    row.month,
                    row.plannedNewWords,
                    row.plannedReviews,
                    row.bufferDays,
                    `${Math.round(row.completionRate * 100)}%`
                  ])}
                />
              </Panel>
              <Panel title="周计划">
                <DataTable
                  columns={["周起始", "周结束", "新学", "复习", "欠缺"]}
                  rows={weeklyRows.map((row) => [
                    row.weekStart,
                    row.weekEnd,
                    row.plannedNewWords,
                    row.plannedReviews,
                    row.missedNewWords
                  ])}
                />
              </Panel>
            </div>

            <Panel title="每日计划">
              <div className="daily-list">
                {goalTasks.slice(0, 120).map((task) => (
                  <div className={`daily-row ${task.isRestDay ? "rest" : ""}`} key={task.id}>
                    <span>{task.date}</span>
                    <strong>新学 {task.plannedNewWordCount}</strong>
                    <strong>复习 {task.plannedReviewCount}</strong>
                    <span>{task.isBufferDay ? "缓冲" : task.isRestDay ? "休息" : "学习"}</span>
                    <small>{task.adjustmentReason}</small>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        )}

        {activeTab === "books" && (
          <section className="section-stack">
            <div className="action-row">
              <button type="button" onClick={() => void runAction(async () => { await loadDemoDataset(); }, "演示词书和词表已载入")}>
                载入演示词表
              </button>
              <button type="button" className="secondary" onClick={() => downloadText("word_import_template.csv", "word,meaning,book_name,level,tags\nexample,例子,My Word Book,B1,noun", "text/csv")}>
                下载 CSV 模板
              </button>
            </div>

            <Panel title="词书推荐">
              <div className="recommendation-list">
                {recommendations.map((item) => (
                  <article key={item.book.id}>
                    <strong>{item.book.name}</strong>
                    <span>{item.book.difficulty} · {item.book.estimatedWordCount} 词</span>
                    <p>{item.reasons.join("；")}</p>
                  </article>
                ))}
              </div>
            </Panel>

            <Panel title="导入词表">
              <div className="import-tools">
                <select value={importFormat} onChange={(event) => setImportFormat(event.target.value as "csv" | "json")}>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleFileImport} />
                <button type="button" onClick={handleImport}>
                  导入
                </button>
              </div>
              <textarea
                rows={10}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="粘贴 CSV 或 JSON 词表内容"
              />
            </Panel>

            <Panel title="已导入词书">
              <DataTable
                columns={["词书", "目标", "难度", "词数", "来源"]}
                rows={(data?.wordBooks ?? []).map((book) => [
                  book.name,
                  book.targetType,
                  book.difficulty,
                  book.estimatedWordCount,
                  book.sourceDescription
                ])}
              />
            </Panel>
          </section>
        )}

        {activeTab === "stats" && (
          <section className="section-stack">
            <div className="metric-grid">
              <MetricCard label="累计新学" value={completedNewWords} />
              <MetricCard label="累计复习" value={data?.progressRecords.reduce((sum, record) => sum + record.reviewsCompleted, 0) ?? 0} />
              <MetricCard label="欠缺新词" value={missedNewWords} />
              <MetricCard label="最低每日新学" value={latestPlan?.requiredDailyAverage ?? 0} />
            </div>
            <Panel title="完成记录">
              <DataTable
                columns={["日期", "新学", "复习", "分钟", "备注"]}
                rows={(data?.progressRecords ?? []).map((record) => [
                  record.date,
                  record.newWordsCompleted,
                  record.reviewsCompleted,
                  record.minutesSpent,
                  record.note
                ])}
              />
            </Panel>
          </section>
        )}

        {activeTab === "data" && (
          <section className="section-stack">
            <div className="action-row">
              <button type="button" onClick={handleExport}>
                导出全部数据
              </button>
              <button type="button" className="secondary" onClick={handleImportBackup}>
                导入备份
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (window.confirm("确认清空本地数据？此操作会删除目标、词表、计划和记录。")) {
                    void runAction(resetAllData, "本地数据已清空");
                  }
                }}
              >
                清空本地数据
              </button>
            </div>
            <Panel title="备份 JSON">
              <textarea
                rows={18}
                value={backupText}
                onChange={(event) => setBackupText(event.target.value)}
                placeholder="导出的备份会显示在这里，也可以粘贴备份 JSON 后导入"
              />
            </Panel>
          </section>
        )}
      </main>
    </div>
  );
}

function createDefaultGoal(): UserGoal {
  const startDate = todayInShanghai();
  const timestamp = nowIso();
  return {
    id: `goal:${Date.now()}`,
    targetType: "CET4",
    targetDescription: "",
    startDate,
    deadline: addDays(startDate, 90),
    targetVocabularyCount: 300,
    currentEstimatedVocabulary: 1500,
    dailyNewWordLimit: 30,
    dailyReviewLimit: 120,
    studyDaysPerWeek: 6,
    restWeekdays: [0],
    bufferDayRatio: 0.1,
    planStyle: "steady",
    selectedBookIds: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function toggleWeekday(values: Weekday[], value: Weekday): Weekday[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value].sort((a, b) => a - b) as Weekday[];
}

function toggleString(values: string[], value: string): string[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function MetricCard(props: { label: string; value: string | number }) {
  return (
    <div className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}

function Panel(props: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

function EmptyState(props: { text: string }) {
  return <p className="empty-state">{props.text}</p>;
}

function DataTable(props: { columns: string[]; rows: Array<Array<string | number>> }) {
  if (props.rows.length === 0) {
    return <EmptyState text="暂无数据" />;
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {props.columns.map((column) => (
              <th key={column}>{column}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactLog(props: { logs: Array<{ id: string; createdAt: string; changesSummary: string }> }) {
  if (props.logs.length === 0) {
    return <EmptyState text="暂无调整日志" />;
  }
  return (
    <div className="log-list">
      {props.logs.slice(0, 6).map((log) => (
        <article key={log.id}>
          <strong>{new Date(log.createdAt).toLocaleString("zh-CN")}</strong>
          <span>{log.changesSummary}</span>
        </article>
      ))}
    </div>
  );
}

function buildMonthlyRows(tasks: DailyTask[], targetVocabularyCount: number) {
  const groups = new Map<string, DailyTask[]>();
  tasks.forEach((task) => {
    const key = monthKey(task.date);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });
  let projected = 0;
  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, monthTasks]) => {
      const plannedNewWords = sumTasks(monthTasks, "plannedNewWordCount");
      projected += plannedNewWords;
      const actualNewWords = sumTasks(monthTasks, "actualNewWordCount");
      return {
        month,
        plannedNewWords,
        plannedReviews: sumTasks(monthTasks, "plannedReviewCount"),
        bufferDays: monthTasks.filter((task) => task.isBufferDay && !task.isRestDay).length,
        completionRate: plannedNewWords > 0 ? actualNewWords / plannedNewWords : 0,
        projectedRate: Math.min(1, projected / targetVocabularyCount)
      };
    });
}

function buildWeeklyRows(tasks: DailyTask[]) {
  const groups = new Map<string, DailyTask[]>();
  tasks.forEach((task) => {
    const key = startOfIsoWeek(task.date);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });
  return Array.from(groups.entries())
    .sort(([a], [b]) => compareDates(a, b))
    .map(([weekStart, weekTasks]) => ({
      weekStart,
      weekEnd: endOfIsoWeek(weekStart),
      plannedNewWords: sumTasks(weekTasks, "plannedNewWordCount"),
      plannedReviews: sumTasks(weekTasks, "plannedReviewCount"),
      missedNewWords: sumTasks(weekTasks, "missedNewWordCount")
    }));
}

function sumTasks(tasks: DailyTask[], field: keyof Pick<
  DailyTask,
  "plannedNewWordCount" | "plannedReviewCount" | "actualNewWordCount" | "missedNewWordCount"
>): number {
  return tasks.reduce((sum, task) => sum + Number(task[field]), 0);
}

function downloadText(filename: string, text: string, type: string) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default App;
