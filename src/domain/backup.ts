import { getLocalTimeZone, nowIso } from "./date";
import type {
  BackupData,
  BackupDataV1,
  BackupDataV2,
  BackupDataV3,
  GoalVersionRecord,
  LegacyProgressRecord,
  LearningGoal,
  WordItem
} from "./types";

const V3_ARRAY_FIELDS = [
  "goals",
  "goalVersions",
  "stagePlans",
  "wordBooks",
  "words",
  "wordProgress",
  "studyPlans",
  "dailyTasks",
  "dailyNewAssignments",
  "dailyReviewAssignments",
  "reviewHistory",
  "dailySettlements",
  "weeklyReviews",
  "monthlyReviews",
  "aiPlanningAdvices",
  "aiAdviceApplications",
  "legacyProgressRecords",
  "adjustmentLogs"
] as const;

const V2_ARRAY_FIELDS = [
  "goals",
  "wordBooks",
  "words",
  "wordProgress",
  "studyPlans",
  "dailyTasks",
  "dailyNewAssignments",
  "dailyReviewAssignments",
  "reviewHistory",
  "legacyProgressRecords",
  "adjustmentLogs"
] as const;

const V1_ARRAY_FIELDS = [
  "goals",
  "wordBooks",
  "words",
  "studyPlans",
  "dailyTasks",
  "reviewTasks",
  "progressRecords",
  "adjustmentLogs"
] as const;

type BackupCreateInput = Omit<
  BackupDataV3,
  | "schemaVersion"
  | "backupVersion"
  | "softwareVersion"
  | "exportedAt"
  | "migrationMeta"
  | "goalVersions"
  | "stagePlans"
  | "dailySettlements"
  | "weeklyReviews"
  | "monthlyReviews"
  | "aiPlanningAdvices"
  | "aiAdviceApplications"
> &
  Partial<
    Pick<
      BackupDataV3,
      | "goalVersions"
      | "stagePlans"
      | "dailySettlements"
      | "weeklyReviews"
      | "monthlyReviews"
      | "aiPlanningAdvices"
      | "aiAdviceApplications"
    >
  >;

export function createBackupData(data: BackupCreateInput): BackupDataV3 {
  return {
    schemaVersion: 3,
    backupVersion: "v0.3.0",
    softwareVersion: "0.3.0",
    exportedAt: nowIso(),
    migrationMeta: {
      sourceBackupVersion: "v0.3.0",
      migratedAt: nowIso(),
      notes: ["v0.3.0 原生备份"]
    },
    goalVersions: data.goalVersions ?? makeInitialGoalVersions(data.goals, "v0.3.0 原生备份缺少目标历史时生成的初始版本"),
    stagePlans: data.stagePlans ?? [],
    dailySettlements: data.dailySettlements ?? [],
    weeklyReviews: data.weeklyReviews ?? [],
    monthlyReviews: data.monthlyReviews ?? [],
    aiPlanningAdvices: data.aiPlanningAdvices ?? [],
    aiAdviceApplications: data.aiAdviceApplications ?? [],
    ...data
  };
}

export function parseBackupData(text: string): BackupData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("备份 JSON 解析失败");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("备份内容不是有效对象");
  }

  const candidate = parsed as Record<string, unknown>;
  if (candidate.schemaVersion === 3) {
    V3_ARRAY_FIELDS.forEach((field) => {
      if (!Array.isArray(candidate[field])) {
        throw new Error(`v0.3.0 备份缺少数组字段 ${field}`);
      }
    });
    return candidate as unknown as BackupDataV3;
  }

  if (candidate.schemaVersion === 2) {
    V2_ARRAY_FIELDS.forEach((field) => {
      if (!Array.isArray(candidate[field])) {
        throw new Error(`v0.2.x 备份缺少数组字段 ${field}`);
      }
    });
    return migrateBackupV2(candidate as unknown as BackupDataV2);
  }

  if (candidate.schemaVersion === 1) {
    V1_ARRAY_FIELDS.forEach((field) => {
      if (!Array.isArray(candidate[field])) {
        throw new Error(`v0.1.0 备份缺少数组字段 ${field}`);
      }
    });
    return migrateBackupV1(candidate as unknown as BackupDataV1);
  }

  throw new Error("备份版本不受支持");
}

export function migrateBackupV1(backup: BackupDataV1): BackupDataV3 {
  const goals = backup.goals.map((goal): LearningGoal => ({
      id: goal.id,
      goalInputMode: "structured",
      originalGoalText: goal.targetDescription,
      interpretedGoal: goal.targetDescription,
      targetDescription: goal.targetDescription,
      targetType: goal.targetType,
      targetRequiredCount: goal.targetVocabularyCount,
      startDate: goal.startDate,
      deadline: goal.deadline,
      dailyNewWordLimit: goal.dailyNewWordLimit,
      dailyReviewLimit: goal.dailyReviewLimit,
      studyDaysPerWeek: goal.studyDaysPerWeek ?? Math.max(1, 7 - goal.restWeekdays.length),
      restWeekdays: goal.restWeekdays,
      bufferDayRatio: goal.bufferDayRatio,
      planStyle: goal.planStyle,
      timezone: getLocalTimeZone(),
      selectedBookIds: goal.selectedBookIds ?? [],
      allowBookRecommendation: true,
      aiPlanningEnabled: true,
      needsFoundationRepair: false,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt
    }));
  return {
    schemaVersion: 3,
    backupVersion: "v0.3.0",
    softwareVersion: "0.3.0",
    exportedAt: nowIso(),
    migrationMeta: {
      sourceBackupVersion: "v0.1.0",
      migratedAt: nowIso(),
      notes: ["v0.1.0 只记录数量，旧完成记录仅作为 legacy 历史保留"]
    },
    goals,
    goalVersions: makeInitialGoalVersions(goals, "v0.1.0 备份迁移生成的初始目标版本"),
    stagePlans: [],
    wordBooks: backup.wordBooks,
    words: backup.words.map((word): WordItem => {
      const { status: _status, ...rest } = word;
      return rest;
    }),
    wordProgress: [],
    studyPlans: [],
    dailyTasks: [],
    dailyNewAssignments: [],
    dailyReviewAssignments: [],
    reviewHistory: [],
    dailySettlements: [],
    weeklyReviews: [],
    monthlyReviews: [],
    aiPlanningAdvices: [],
    aiAdviceApplications: [],
    legacyProgressRecords: backup.progressRecords.map(
      (record): LegacyProgressRecord => ({
        ...record,
        sourceVersion: "v0.1.0",
        preservedReason: "旧版本只记录数量，无法可靠转换为具体单词历史，因此仅作为历史数量记录保留"
      })
    ),
    adjustmentLogs: []
  };
}

export function migrateBackupV2(backup: BackupDataV2): BackupDataV3 {
  const notes = [
    `${backup.backupVersion} 备份迁移到 v0.3.0`,
    "保留已有具体任务、复习历史、legacy 历史和调整日志",
    "v0.3.0 新增的复盘、AI 建议和结算记录缺失时初始化为空"
  ];
  return {
    schemaVersion: 3,
    backupVersion: "v0.3.0",
    softwareVersion: "0.3.0",
    exportedAt: nowIso(),
    migrationMeta: {
      sourceBackupVersion: backup.backupVersion,
      migratedAt: nowIso(),
      notes
    },
    goals: backup.goals.map((goal) => ({
      ...goal,
      studyDaysPerWeek: goal.studyDaysPerWeek ?? Math.max(1, 7 - goal.restWeekdays.length),
      aiPlanningEnabled: goal.aiPlanningEnabled ?? goal.allowBookRecommendation,
      needsFoundationRepair: goal.needsFoundationRepair ?? false
    })),
    goalVersions: makeInitialGoalVersions(backup.goals, `${backup.backupVersion} 迁移生成的初始目标版本`),
    stagePlans: [],
    wordBooks: backup.wordBooks.map((book) => ({
      ...book,
      status: book.status ?? (book.hasImportedWords ? "imported" : "recommended"),
      role: book.role ?? (book.isFoundation ? "foundation" : book.isTargetBook ? "core" : "custom"),
      enabledForGoalIds: book.enabledForGoalIds ?? [],
      priority: book.priority ?? (book.isFoundation ? 80 : book.isTargetBook ? 70 : 40),
      importedWordCount: book.importedWordCount ?? book.actualWordCount ?? 0,
      duplicateWordCount: book.duplicateWordCount ?? 0
    })),
    words: backup.words,
    wordProgress: backup.wordProgress.map((progress) => ({
      ...progress,
      reviewCount: progress.reviewCount ?? 0,
      overdueCount: progress.overdueCount ?? 0,
      isDifficult: progress.isDifficult ?? false,
      goalIds: progress.goalIds ?? []
    })),
    studyPlans: backup.studyPlans,
    dailyTasks: backup.dailyTasks,
    dailyNewAssignments: backup.dailyNewAssignments,
    dailyReviewAssignments: backup.dailyReviewAssignments,
    reviewHistory: backup.reviewHistory,
    dailySettlements: [],
    weeklyReviews: [],
    monthlyReviews: [],
    aiPlanningAdvices: [],
    aiAdviceApplications: [],
    legacyProgressRecords: backup.legacyProgressRecords,
    adjustmentLogs: backup.adjustmentLogs
  };
}

function makeInitialGoalVersions(goals: LearningGoal[], reason: string): GoalVersionRecord[] {
  return goals.map((goal) => {
    const versionId = goal.activeGoalVersionId ?? `goal-version:${goal.id}:v1`;
    return {
      id: versionId,
      goalId: goal.id,
      version: 1,
      createdAt: goal.updatedAt,
      reason,
      originalInput: goal.originalGoalText ?? goal.interpretedGoal,
      confirmedGoal: {
        ...goal,
        activeGoalVersionId: versionId
      },
      nextTargetRequiredCount: goal.targetRequiredCount,
      previousSelectedBookIds: [],
      nextSelectedBookIds: goal.selectedBookIds
    };
  });
}
