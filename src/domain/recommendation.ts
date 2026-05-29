import type { TargetType, UserGoal, WordBook, WordBookRole, WordBookStatus } from "./types";

export interface BookRecommendation {
  book: WordBook;
  score: number;
  reasons: string[];
  status: WordBookStatus;
  role: WordBookRole;
  expectedIndependentWordCount: number;
  relationshipToCurrentInventory: string;
  overlapWithEnabledBooks: string;
  hasExecutableWords: boolean;
  importRequirement: string;
  suggestedStagePosition: string;
}

export const TARGET_LABELS: Record<TargetType, string> = {
  CET4: "四级 CET-4",
  CET6: "六级 CET-6",
  POSTGRAD: "考研英语",
  IELTS: "雅思 IELTS",
  TOEFL: "托福 TOEFL",
  GRE: "GRE",
  CUSTOM: "自定义目标"
};

export function recommendBooks(goal: UserGoal | null, books: WordBook[], importedWordCount: number): BookRecommendation[] {
  if (!goal) {
    return books.slice(0, 4).map((book) => ({
      book,
      score: 1,
      reasons: ["先载入或导入词表，再根据目标和容量给出更精确推荐"],
      ...describeBookForGoal(book, null, importedWordCount)
    }));
  }

  return books
    .map((book) => {
      const reasons: string[] = [];
      let score = 0;

      if (book.targetType === goal.targetType) {
        score += 4;
        reasons.push(`匹配学习目标：${TARGET_LABELS[goal.targetType]}`);
      }
      if (book.targetType === "GENERAL") {
        score += 1;
        reasons.push("可作为通用基础补充");
      }
      if (goal.targetRequiredCount >= 800 && book.isFoundation) {
        score += 3;
        reasons.push("目标词量较高，适合作为基础词汇补齐");
      }
      if (book.isTargetBook) {
        score += 2;
        reasons.push("适合作为目标强化词书");
      }
      if (goal.dailyNewWordLimit <= 25 && book.recommendationTags.some((tag) => tag.includes("核心"))) {
        score += 2;
        reasons.push("每日上限较低，优先推荐核心高频范围");
      }
      if (importedWordCount > 0 && goal.selectedBookIds.includes(book.id)) {
        score += 2;
        reasons.push("已在当前计划范围内，能参与去重后排期");
      }
      if (book.hasImportedWords) {
        score += 1;
        reasons.push("已有可用词表，可直接用于生成计划");
      }

      if (reasons.length === 0) {
        reasons.push("可作为备选词书，需要结合导入词表后判断覆盖范围");
      }

      return { book, score, reasons, ...describeBookForGoal(book, goal, importedWordCount) };
    })
    .sort((a, b) => b.score - a.score || a.book.name.localeCompare(b.book.name));
}

function describeBookForGoal(book: WordBook, goal: UserGoal | null, importedWordCount: number): Omit<BookRecommendation, "book" | "score" | "reasons"> {
  const actualCount = book.actualWordCount ?? book.importedWordCount ?? 0;
  const isSelected = goal ? goal.selectedBookIds.includes(book.id) : false;
  const hasExecutableWords = actualCount > 0 && (isSelected || !goal);
  const role: WordBookRole = book.role ?? (book.isFoundation ? "foundation" : book.isTargetBook ? "core" : "custom");
  const status: WordBookStatus = goal?.selectedBookIds.includes(book.id) && actualCount > 0 ? "enabled" : book.status ?? resolveBookStatus(book, goal, actualCount);
  const roleLabel: Record<WordBookRole, string> = {
    foundation: "基础补齐",
    core: "目标核心",
    extension: "强化扩展",
    sprint: "冲刺高频",
    custom: "自定义"
  };
  return {
    status,
    role,
    expectedIndependentWordCount: actualCount || book.estimatedWordCount,
    relationshipToCurrentInventory: actualCount > 0 ? `当前已拥有 ${actualCount} 个可执行去重词` : "当前只有推荐元数据，尚未导入具体词条",
    overlapWithEnabledBooks: book.overlapNote ?? (importedWordCount > 0 ? "需导入或启用后按去重结果判断重合" : "尚无当前词库可比对"),
    hasExecutableWords,
    importRequirement: actualCount > 0 ? "已有具体词条，可在启用后参与排期" : "需要用户导入合法词表后才能参与排期",
    suggestedStagePosition: roleLabel[role]
  };
}

function resolveBookStatus(book: WordBook, goal: UserGoal | null, actualCount: number): WordBookStatus {
  if (goal?.selectedBookIds.includes(book.id) && actualCount > 0) {
    return "enabled";
  }
  if (actualCount > 0) {
    return "imported";
  }
  if (goal && (book.targetType === goal.targetType || book.isFoundation)) {
    return "candidate";
  }
  return "recommended";
}
