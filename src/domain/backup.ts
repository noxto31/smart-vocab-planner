import type { BackupData } from "./types";

const REQUIRED_ARRAY_FIELDS = [
  "goals",
  "wordBooks",
  "words",
  "studyPlans",
  "dailyTasks",
  "reviewTasks",
  "progressRecords",
  "adjustmentLogs"
] as const;

export function createBackupData(data: Omit<BackupData, "schemaVersion" | "exportedAt">): BackupData {
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
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
  if (candidate.schemaVersion !== 1) {
    throw new Error("备份版本不受支持");
  }

  REQUIRED_ARRAY_FIELDS.forEach((field) => {
    if (!Array.isArray(candidate[field])) {
      throw new Error(`备份缺少数组字段 ${field}`);
    }
  });

  return candidate as unknown as BackupData;
}
