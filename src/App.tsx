import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { addDays, compareDates, getLocalTimeZone, monthKey, nowIso, startOfIsoWeek, todayInTimezone } from "./domain/date";
import { TARGET_LABELS, recommendBooks } from "./domain/recommendation";
import type {
  AIPlanningSuggestion,
  DailyNewWordAssignment,
  DailyReviewAssignment,
  DailyTaskSummary,
  FeasibilityStatus,
  PlanStyle,
  ReviewResult,
  TargetType,
  UserGoal,
  Weekday,
  WordItem
} from "./domain/types";
import {
  analyzeNaturalLanguageGoal,
  createDemoGoalAndPlan,
  exportBackup,
  generateAndSavePlan,
  importBackup,
  importWordText,
  loadAllData,
  loadDemoDataset,
  recordNewWordAssignmentResult,
  recordReviewAssignmentResult,
  resetAllData,
  saveGoal,
  type AppDataState
} from "./services/plannerService";

type TabId = "dashboard" | "goal" | "today" | "plans" | "books" | "stats" | "data";

const tabs: Array<{ id: TabId; label: string }> = [
  { id: "dashboard", label: "总览" },
  { id: "goal", label: "目标设置" },
  { id: "today", label: "今日学习" },
  { id: "plans", label: "计划" },
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
  atRisk: "需要关注",
  infeasible: "按现有限制无法完成",
  completed: "目标已完成"
};

const planStyleLabels: Record<PlanStyle, string> = {
  steady: "平稳型",
  frontLoaded: "前紧后松型",
  flexible: "弹性型"
};

const reviewLabels: Record<ReviewResult, string> = {
  forgot: "不认识",
  vague: "模糊",
  known: "认识",
  easy: "很熟悉",
  not_completed: "未完成"
};

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [data, setData] = useState<AppDataState | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [goalForm, setGoalForm] = useState<UserGoal>(() => createDefaultGoal());
  const [naturalGoalText, setNaturalGoalText] = useState("");
  const [aiSuggestion, setAiSuggestion] = useState<AIPlanningSuggestion | null>(null);
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importText, setImportText] = useState("");
  const [backupText, setBackupText] = useState("");
  const [revealedReviews, setRevealedReviews] = useState<Set<string>>(new Set());

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
  const today = currentGoal ? todayInTimezone(currentGoal.timezone) : todayInTimezone();
  const latestPlan = data?.studyPlans[0] ?? null;
  const wordsById = useMemo(() => new Map((data?.words ?? []).map((word) => [word.id, word])), [data?.words]);
  const currentGoalId = currentGoal?.id ?? "";
  const todayNewAssignments = useMemo(
    () =>
      (data?.dailyNewAssignments ?? []).filter(
        (assignment) =>
          assignment.goalId === currentGoalId &&
          assignment.date === today &&
          (assignment.status === "planned" || assignment.status === "rescheduled")
      ),
    [data?.dailyNewAssignments, currentGoalId, today]
  );
  const todayReviewAssignments = useMemo(
    () =>
      (data?.dailyReviewAssignments ?? []).filter(
        (assignment) =>
          assignment.goalId === currentGoalId &&
          assignment.date === today &&
          (assignment.status === "planned" || assignment.status === "rescheduled" || assignment.status === "overdue")
      ),
    [data?.dailyReviewAssignments, currentGoalId, today]
  );
  const todayTask = (data?.dailyTasks ?? []).find((task) => task.goalId === currentGoalId && task.date === today) ?? null;
  const goalTasks = (data?.dailyTasks ?? []).filter((task) => task.goalId === currentGoalId);
  const recommendations = useMemo(
    () => recommendBooks(currentGoal, data?.wordBooks ?? [], data?.words.length ?? 0).slice(0, 6),
    [currentGoal, data?.wordBooks, data?.words.length]
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
      const savedGoal = await saveGoal({ ...goalForm, updatedAt: nowIso() });
      const asOfDate = compareDates(savedGoal.startDate, today) > 0 ? savedGoal.startDate : todayInTimezone(savedGoal.timezone);
      await generateAndSavePlan(savedGoal, asOfDate, currentGoal ? "goal_change" : "initial", "保存目标后生成 v0.2.0 具体单词计划");
    }, "目标已保存，具体单词计划已生成");
  };

  const handleNaturalGoal = async () => {
    await runAction(async () => {
      const suggestion = await analyzeNaturalLanguageGoal(naturalGoalText);
      setAiSuggestion(suggestion);
    }, "已生成本地 mock AI 规划建议");
  };

  const applyAiSuggestion = () => {
    if (!aiSuggestion) {
      return;
    }
    setGoalForm({
      ...goalForm,
      goalInputMode: "natural_language",
      originalGoalText: naturalGoalText,
      interpretedGoal: aiSuggestion.interpretedGoal,
      targetType: aiSuggestion.targetType,
      targetRequiredCount: aiSuggestion.suggestedTargetWordCount,
      allowBookRecommendation: true,
      updatedAt: nowIso()
    });
    setMessage("AI 建议已填入表单，需点击“保存并生成计划”后才会改变执行目标");
  };

  const handleImport = async () => {
    await runAction(async () => {
      const result = await importWordText(importText, importFormat);
      const hints = result.errors.length > 0 ? `；提示：${result.errors.join("；")}` : "";
      setMessage(
        `导入完成：新增 ${result.addedCount} 个，重复 ${result.duplicateCount} 个，补足缺口 ${result.replenishedCount} 个，剩余缺口 ${result.inventoryGapAfter} 个${hints}`
      );
    }, "词表导入完成并已尝试重排");
  };

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportText(await file.text());
    }
  };

  const handleNewWordResult = async (assignmentId: string, result: "learned" | "mastered" | "skipped" | "missed") => {
    await runAction(async () => {
      await recordNewWordAssignmentResult({ assignmentId, result });
    }, "新词学习结果已保存，计划已重排");
  };

  const handleReviewResult = async (assignmentId: string, result: ReviewResult) => {
    await runAction(async () => {
      await recordReviewAssignmentResult({ assignmentId, result });
    }, "复习结果已保存，下一次复习已排期");
  };

  const handleExport = async () => {
    await runAction(async () => {
      const backup = await exportBackup();
      const text = JSON.stringify(backup, null, 2);
      setBackupText(text);
      downloadText("smart-vocab-planner-v0.2.0-backup.json", text, "application/json");
    }, "v0.2.0 完整备份已生成");
  };

  const handleImportBackup = async () => {
    await runAction(async () => {
      const backup = await importBackup(backupText);
      setMessage(`备份已导入，识别版本：${backup.backupVersion}`);
    }, "备份已导入");
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">VSP</span>
          <div>
            <strong>智能背词主流程</strong>
            <small>v0.2.0 本地离线</small>
          </div>
        </div>
        <nav className="nav-list" aria-label="主导航">
          {tabs.map((tab) => (
            <button className={activeTab === tab.id ? "active" : ""} key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}>
              {tab.label}
            </button>
          ))}
        </nav>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{currentGoal?.timezone ?? getLocalTimeZone()} 日期：{today}</p>
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
              <MetricCard label="目标需求词量" value={latestPlan?.coverage.targetRequiredCount ?? currentGoal?.targetRequiredCount ?? 0} />
              <MetricCard label="词库可供给" value={latestPlan?.coverage.availableWordCount ?? data?.words.length ?? 0} />
              <MetricCard label="词库供给缺口" value={latestPlan?.coverage.inventoryGapCount ?? 0} />
              <MetricCard label="已完成具体新词" value={latestPlan?.coverage.completedWordCount ?? 0} />
              <MetricCard label="待补学具体词" value={latestPlan?.coverage.learningBacklogCount ?? 0} />
              <MetricCard label="逾期复习" value={latestPlan?.coverage.overdueReviewCount ?? 0} />
            </div>

            <div className="two-column">
              <Panel title="今日任务">
                <div className="task-grid">
                  <MetricCard label="计划新词" value={todayTask?.plannedNewWordCount ?? todayNewAssignments.length} />
                  <MetricCard label="已绑定新词" value={todayTask?.boundNewWordCount ?? todayNewAssignments.length} />
                  <MetricCard label="计划复习" value={todayTask?.plannedReviewCount ?? todayReviewAssignments.length} />
                  <MetricCard label="容量状态" value={todayTask?.capacityStatus ?? "ok"} />
                </div>
                <div className="action-row">
                  <button type="button" onClick={() => setActiveTab("today")}>开始新词学习</button>
                  <button type="button" className="secondary" onClick={() => setActiveTab("today")}>开始今日复习</button>
                </div>
              </Panel>

              <Panel title="计划解释">
                {latestPlan ? (
                  <dl className="info-list">
                    <div><dt>剩余有效学习日</dt><dd>{latestPlan.remainingEffectiveDays}</dd></div>
                    <div><dt>最低每日新学</dt><dd>{latestPlan.requiredDailyAverage}</dd></div>
                    <div><dt>当前每日上限</dt><dd>{currentGoal?.dailyNewWordLimit ?? 0}</dd></div>
                    <div><dt>调整说明</dt><dd>{latestPlan.adjustmentReason}</dd></div>
                  </dl>
                ) : (
                  <EmptyState text="创建目标并导入词表后会显示计划解释" />
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
            <Panel title="自然语言目标">
              <div className="form-grid">
                <label className="wide">
                  目标描述
                  <textarea rows={4} value={naturalGoalText} onChange={(event) => setNaturalGoalText(event.target.value)} placeholder="例如：我想准备六级，但四级词也不牢，希望三个月内尽量补起来。" />
                </label>
              </div>
              <div className="action-row">
                <button type="button" className="secondary" onClick={handleNaturalGoal}>生成 AI mock 建议</button>
                <button type="button" onClick={applyAiSuggestion} disabled={!aiSuggestion}>应用到目标表单</button>
              </div>
              {aiSuggestion && (
                <div className="suggestion-box">
                  <strong>{aiSuggestion.interpretedGoal}</strong>
                  <p>{aiSuggestion.explanation}</p>
                  <DataTable
                    columns={["阶段", "目的", "建议词量"]}
                    rows={aiSuggestion.suggestedStages.map((stage) => [stage.name, stage.purpose, stage.suggestedWordCount])}
                  />
                </div>
              )}
            </Panel>

            <Panel title="结构化目标">
              <div className="form-grid">
                <label>
                  学习目的
                  <select value={goalForm.targetType} onChange={(event) => setGoalForm({ ...goalForm, targetType: event.target.value as TargetType })}>
                    {Object.entries(TARGET_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  开始日期
                  <input type="date" value={goalForm.startDate} onChange={(event) => setGoalForm({ ...goalForm, startDate: event.target.value })} />
                </label>
                <label>
                  截止日期
                  <input type="date" value={goalForm.deadline} onChange={(event) => setGoalForm({ ...goalForm, deadline: event.target.value })} />
                </label>
                <label>
                  目标需求词量
                  <input min={1} type="number" value={goalForm.targetRequiredCount} onChange={(event) => setGoalForm({ ...goalForm, targetRequiredCount: Number(event.target.value) })} />
                </label>
                <label>
                  每日新词上限
                  <input min={1} type="number" value={goalForm.dailyNewWordLimit} onChange={(event) => setGoalForm({ ...goalForm, dailyNewWordLimit: Number(event.target.value) })} />
                </label>
                <label>
                  每日复习上限
                  <input min={0} type="number" value={goalForm.dailyReviewLimit} onChange={(event) => setGoalForm({ ...goalForm, dailyReviewLimit: Number(event.target.value) })} />
                </label>
                <label>
                  缓冲日比例
                  <input max={0.5} min={0} step={0.01} type="number" value={goalForm.bufferDayRatio} onChange={(event) => setGoalForm({ ...goalForm, bufferDayRatio: Number(event.target.value) })} />
                </label>
                <label>
                  计划类型
                  <select value={goalForm.planStyle} onChange={(event) => setGoalForm({ ...goalForm, planStyle: event.target.value as PlanStyle })}>
                    {Object.entries(planStyleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  计划时区
                  <input value={goalForm.timezone} onChange={(event) => setGoalForm({ ...goalForm, timezone: event.target.value })} />
                </label>
              </div>
              <fieldset className="check-row">
                <legend>固定休息日</legend>
                {weekdays.map((weekday) => (
                  <label key={weekday.value}>
                    <input type="checkbox" checked={goalForm.restWeekdays.includes(weekday.value)} onChange={() => setGoalForm({ ...goalForm, restWeekdays: toggleWeekday(goalForm.restWeekdays, weekday.value) })} />
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
                      onChange={() => setGoalForm({ ...goalForm, selectedBookIds: toggleString(goalForm.selectedBookIds, book.id) })}
                    />
                    <span>{book.name}</span>
                    <small>{book.actualWordCount ?? 0} 个真实去重词 · {book.hasImportedWords ? "已导入可排期" : "推荐但未导入"}</small>
                  </label>
                ))}
              </div>
            </Panel>

            <div className="action-row">
              <button type="submit">保存并生成计划</button>
              <button type="button" className="secondary" onClick={() => void runAction(async () => { await loadDemoDataset(); await createDemoGoalAndPlan(); }, "演示目标和具体单词计划已创建")}>创建演示目标</button>
            </div>
          </form>
        )}

        {activeTab === "today" && (
          <section className="section-stack">
            <Panel title="今日状态">
              <div className="task-grid">
                <MetricCard label="计划新学数量" value={todayTask?.plannedNewWordCount ?? 0} />
                <MetricCard label="已绑定具体新词" value={todayNewAssignments.length} />
                <MetricCard label="实际完成新词" value={todayTask?.completedNewWordCount ?? 0} />
                <MetricCard label="待补学数量" value={latestPlan?.coverage.learningBacklogCount ?? 0} />
                <MetricCard label="计划复习数量" value={todayReviewAssignments.length} />
                <MetricCard label="逾期复习数量" value={latestPlan?.coverage.overdueReviewCount ?? 0} />
              </div>
            </Panel>

            <Panel title="新词学习">
              <AssignmentList
                assignments={todayNewAssignments}
                wordsById={wordsById}
                onResult={handleNewWordResult}
              />
            </Panel>

            <Panel title="今日复习">
              <ReviewList
                assignments={todayReviewAssignments}
                wordsById={wordsById}
                revealed={revealedReviews}
                onReveal={(id) => setRevealedReviews((value) => new Set(value).add(id))}
                onResult={handleReviewResult}
              />
            </Panel>
          </section>
        )}

        {activeTab === "plans" && (
          <section className="section-stack">
            <Panel title="长期覆盖">
              {latestPlan ? (
                <dl className="info-list">
                  <div><dt>目标需求量</dt><dd>{latestPlan.coverage.targetRequiredCount}</dd></div>
                  <div><dt>可供给词量</dt><dd>{latestPlan.coverage.availableWordCount}</dd></div>
                  <div><dt>已绑定计划量</dt><dd>{latestPlan.coverage.assignedWordCount}</dd></div>
                  <div><dt>实际完成量</dt><dd>{latestPlan.coverage.completedWordCount}</dd></div>
                  <div><dt>词库供给缺口</dt><dd>{latestPlan.coverage.inventoryGapCount}</dd></div>
                  <div><dt>学习欠缺任务</dt><dd>{latestPlan.coverage.learningBacklogCount}</dd></div>
                  <div><dt>逾期复习任务</dt><dd>{latestPlan.coverage.overdueReviewCount}</dd></div>
                </dl>
              ) : <EmptyState text="暂无计划" />}
            </Panel>

            <div className="two-column">
              <Panel title="月度计划">
                <DataTable
                  columns={["月份", "新学", "复习", "补学", "逾期"]}
                  rows={buildMonthlyRows(goalTasks).map((row) => [row.month, row.newCount, row.reviewCount, row.backlogCount, row.overdueCount])}
                />
              </Panel>
              <Panel title="周度计划">
                <DataTable
                  columns={["周起始", "新学", "复习", "补学", "逾期"]}
                  rows={buildWeeklyRows(goalTasks).map((row) => [row.weekStart, row.newCount, row.reviewCount, row.backlogCount, row.overdueCount])}
                />
              </Panel>
            </div>

            <Panel title="每日任务数量">
              <DataTable
                columns={["日期", "新词", "复习", "缺口", "补学", "状态"]}
                rows={goalTasks.slice(0, 160).map((task) => [
                  task.date,
                  task.boundNewWordCount,
                  task.plannedReviewCount,
                  task.inventoryGapCount,
                  task.learningBacklogCount,
                  task.capacityStatus
                ])}
              />
            </Panel>

            <Panel title="动态调整日志">
              <CompactLog logs={data?.adjustmentLogs ?? []} />
            </Panel>
          </section>
        )}

        {activeTab === "books" && (
          <section className="section-stack">
            <div className="metric-grid">
              <MetricCard label="合并去重词数" value={data?.words.length ?? 0} />
              <MetricCard label="当前目标缺口" value={latestPlan?.coverage.inventoryGapCount ?? 0} />
              <MetricCard label="已导入词书" value={(data?.wordBooks ?? []).filter((book) => book.hasImportedWords).length} />
              <MetricCard label="可排期词书" value={(data?.wordBooks ?? []).filter((book) => (book.actualWordCount ?? 0) > 0).length} />
            </div>

            <div className="action-row">
              <button type="button" onClick={() => void runAction(async () => { await loadDemoDataset(); }, "演示词表已载入，缺口已重算")}>载入演示词表</button>
              <button type="button" className="secondary" onClick={() => downloadText("word_import_template.csv", "word,meaning,book_name,level,tags\nexample,例子,My Word Book,B1,noun", "text/csv")}>下载 CSV 模板</button>
            </div>

            <Panel title="词书推荐与可执行状态">
              <DataTable
                columns={["词书", "状态", "真实词数", "推荐理由"]}
                rows={recommendations.map((item) => [
                  item.book.name,
                  (item.book.actualWordCount ?? 0) > 0 ? "已导入可排期词书" : "推荐但未导入词书",
                  item.book.actualWordCount ?? 0,
                  item.reasons.join("；")
                ])}
              />
            </Panel>

            <Panel title="导入词表">
              <div className="import-tools">
                <select value={importFormat} onChange={(event) => setImportFormat(event.target.value as "csv" | "json")}>
                  <option value="csv">CSV</option>
                  <option value="json">JSON</option>
                </select>
                <input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleFileImport} />
                <button type="button" onClick={handleImport}>导入并重排</button>
              </div>
              <textarea rows={10} value={importText} onChange={(event) => setImportText(event.target.value)} placeholder="粘贴 CSV 或 JSON 词表内容" />
            </Panel>

            <Panel title="已导入词书">
              <DataTable
                columns={["词书", "目标", "难度", "真实去重词数", "来源"]}
                rows={(data?.wordBooks ?? []).map((book) => [
                  book.name,
                  book.targetType,
                  book.difficulty,
                  book.actualWordCount ?? 0,
                  book.sourceDescription
                ])}
              />
            </Panel>
          </section>
        )}

        {activeTab === "stats" && (
          <section className="section-stack">
            <div className="metric-grid">
              <MetricCard label="已掌握" value={(data?.wordProgress ?? []).filter((item) => item.state === "mastered").length} />
              <MetricCard label="复习中" value={(data?.wordProgress ?? []).filter((item) => item.state === "reviewing" || item.state === "learned").length} />
              <MetricCard label="尚未开始" value={(data?.wordProgress ?? []).filter((item) => item.state === "not_started").length} />
              <MetricCard label="词库缺口" value={latestPlan?.coverage.inventoryGapCount ?? 0} />
              <MetricCard label="学习欠缺" value={latestPlan?.coverage.learningBacklogCount ?? 0} />
              <MetricCard label="逾期复习" value={latestPlan?.coverage.overdueReviewCount ?? 0} />
            </div>
            <Panel title="每日新词与复习完成">
              <DataTable
                columns={["日期", "新词完成", "复习完成", "补学", "逾期"]}
                rows={goalTasks.map((task) => [task.date, task.completedNewWordCount, task.completedReviewCount, task.learningBacklogCount, task.overdueReviewCount])}
              />
            </Panel>
            <Panel title="v0.1.0 历史数量记录">
              <DataTable
                columns={["日期", "新学数量", "复习数量", "说明"]}
                rows={(data?.legacyProgressRecords ?? []).map((record) => [record.date, record.newWordsCompleted, record.reviewsCompleted, record.preservedReason])}
              />
            </Panel>
          </section>
        )}

        {activeTab === "data" && (
          <section className="section-stack">
            <div className="action-row">
              <button type="button" onClick={handleExport}>导出完整备份</button>
              <button type="button" className="secondary" onClick={handleImportBackup}>导入备份</button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  if (window.confirm("确认清空本地数据？此操作会删除目标、词表、计划、具体任务和记录。")) {
                    void runAction(resetAllData, "本地数据已清空");
                  }
                }}
              >
                清空数据
              </button>
            </div>
            <Panel title="备份 JSON">
              <p className="muted">v0.2.0 备份包含具体新词任务、复习任务、学习状态、调整日志和旧版数量记录。</p>
              <textarea rows={18} value={backupText} onChange={(event) => setBackupText(event.target.value)} placeholder="导出的备份会显示在这里，也可以粘贴 v0.1.0 或 v0.2.0 备份 JSON 后导入" />
            </Panel>
          </section>
        )}
      </main>
    </div>
  );
}

function AssignmentList(props: {
  assignments: DailyNewWordAssignment[];
  wordsById: Map<string, WordItem>;
  onResult: (assignmentId: string, result: "learned" | "mastered" | "skipped" | "missed") => Promise<void>;
}) {
  if (props.assignments.length === 0) {
    return <EmptyState text="今日没有待学习的新词任务" />;
  }
  return (
    <div className="card-list">
      {props.assignments.map((assignment) => {
        const word = props.wordsById.get(assignment.wordId);
        return (
          <article className="word-card" key={assignment.id}>
            <div>
              <strong>{word?.word ?? assignment.wordId}</strong>
              <p>{word?.meaning || "暂无释义"}</p>
              <small>{word?.sourceBookNames.join(" / ") || "未知来源"} · {word?.level ?? "未标级"}</small>
            </div>
            <div className="button-strip">
              <button type="button" onClick={() => props.onResult(assignment.id, "learned")}>已学习</button>
              <button type="button" onClick={() => props.onResult(assignment.id, "mastered")}>已掌握</button>
              <button type="button" className="secondary" onClick={() => props.onResult(assignment.id, "skipped")}>暂时跳过</button>
              <button type="button" className="secondary" onClick={() => props.onResult(assignment.id, "missed")}>今日未完成</button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ReviewList(props: {
  assignments: DailyReviewAssignment[];
  wordsById: Map<string, WordItem>;
  revealed: Set<string>;
  onReveal: (assignmentId: string) => void;
  onResult: (assignmentId: string, result: ReviewResult) => Promise<void>;
}) {
  if (props.assignments.length === 0) {
    return <EmptyState text="今日没有到期复习任务" />;
  }
  return (
    <div className="card-list">
      {props.assignments.map((assignment) => {
        const word = props.wordsById.get(assignment.wordId);
        const revealed = props.revealed.has(assignment.id);
        return (
          <article className="word-card" key={assignment.id}>
            <div>
              <strong>{word?.word ?? assignment.wordId}</strong>
              <p>{revealed ? word?.meaning || "暂无释义" : "释义已隐藏"}</p>
              <small>复习阶段 {assignment.reviewStage + 1} · {assignment.status}</small>
            </div>
            <div className="button-strip">
              {!revealed && <button type="button" className="secondary" onClick={() => props.onReveal(assignment.id)}>查看释义</button>}
              {(Object.keys(reviewLabels) as ReviewResult[]).map((result) => (
                <button key={result} type="button" onClick={() => props.onResult(assignment.id, result)}>
                  {reviewLabels[result]}
                </button>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function createDefaultGoal(): UserGoal {
  const timezone = getLocalTimeZone();
  const startDate = todayInTimezone(timezone);
  const timestamp = nowIso();
  return {
    id: `goal:${Date.now()}`,
    goalInputMode: "structured",
    targetType: "CET4",
    interpretedGoal: "结构化目标",
    startDate,
    deadline: addDays(startDate, 90),
    targetRequiredCount: 300,
    dailyNewWordLimit: 30,
    dailyReviewLimit: 120,
    restWeekdays: [0],
    bufferDayRatio: 0.1,
    planStyle: "steady",
    timezone,
    selectedBookIds: [],
    allowBookRecommendation: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function toggleWeekday(values: Weekday[], value: Weekday): Weekday[] {
  return values.includes(value)
    ? values.filter((item) => item !== value)
    : ([...values, value].sort((a, b) => a - b) as Weekday[]);
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
          <tr>{props.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CompactLog(props: { logs: Array<{ id: string; createdAt: string; explanation: string; reason: string }> }) {
  if (props.logs.length === 0) {
    return <EmptyState text="暂无调整日志" />;
  }
  return (
    <div className="log-list">
      {props.logs.slice(0, 8).map((log) => (
        <article key={log.id}>
          <strong>{new Date(log.createdAt).toLocaleString("zh-CN")}</strong>
          <span>{log.reason}</span>
          <small>{log.explanation}</small>
        </article>
      ))}
    </div>
  );
}

function buildMonthlyRows(tasks: DailyTaskSummary[]) {
  const groups = new Map<string, DailyTaskSummary[]>();
  tasks.forEach((task) => {
    const key = monthKey(task.date);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });
  return Array.from(groups.entries()).map(([month, rows]) => ({
    month,
    newCount: sumTasks(rows, "boundNewWordCount"),
    reviewCount: sumTasks(rows, "plannedReviewCount"),
    backlogCount: sumTasks(rows, "learningBacklogCount"),
    overdueCount: sumTasks(rows, "overdueReviewCount")
  }));
}

function buildWeeklyRows(tasks: DailyTaskSummary[]) {
  const groups = new Map<string, DailyTaskSummary[]>();
  tasks.forEach((task) => {
    const key = startOfIsoWeek(task.date);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });
  return Array.from(groups.entries()).map(([weekStart, rows]) => ({
    weekStart,
    newCount: sumTasks(rows, "boundNewWordCount"),
    reviewCount: sumTasks(rows, "plannedReviewCount"),
    backlogCount: sumTasks(rows, "learningBacklogCount"),
    overdueCount: sumTasks(rows, "overdueReviewCount")
  }));
}

function sumTasks(tasks: DailyTaskSummary[], field: keyof Pick<DailyTaskSummary, "boundNewWordCount" | "plannedReviewCount" | "learningBacklogCount" | "overdueReviewCount">): number {
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
