import { getLocalTimeZone, nowIso } from "./date";
import type {
  BackupData,
  BackupDataV1,
  BackupDataV2,
  LegacyProgressRecord,
  LearningGoal,
  WordItem
} from "./types";

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

export function createBackupData(data: Omit<BackupDataV2, "schemaVersion" | "backupVersion" | "exportedAt">): BackupDataV2 {
  return {
    schemaVersion: 2,
    backupVersion: "v0.2.1",
    exportedAt: nowIso(),
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
  if (candidate.schemaVersion === 2) {
    V2_ARRAY_FIELDS.forEach((field) => {
      if (!Array.isArray(candidate[field])) {
        throw new Error(`v0.2.0 备份缺少数组字段 ${field}`);
      }
    });
    return candidate as unknown as BackupDataV2;
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

export function migrateBackupV1(backup: BackupDataV1): BackupDataV2 {
  return {
    schemaVersion: 2,
    backupVersion: "v0.2.1",
    exportedAt: nowIso(),
    goals: backup.goals.map((goal): LearningGoal => ({
      id: goal.id,
      goalInputMode: "structured",
      originalGoalText: goal.targetDescription,
      interpretedGoal: goal.targetDescription,
      targetType: goal.targetType,
      targetRequiredCount: goal.targetVocabularyCount,
      startDate: goal.startDate,
      deadline: goal.deadline,
      dailyNewWordLimit: goal.dailyNewWordLimit,
      dailyReviewLimit: goal.dailyReviewLimit,
      restWeekdays: goal.restWeekdays,
      bufferDayRatio: goal.bufferDayRatio,
      planStyle: goal.planStyle,
      timezone: getLocalTimeZone(),
      selectedBookIds: goal.selectedBookIds ?? [],
      allowBookRecommendation: true,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt
    })),
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
