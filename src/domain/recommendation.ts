import type { TargetType, UserGoal, WordBook } from "./types";

export interface BookRecommendation {
  book: WordBook;
  score: number;
  reasons: string[];
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
      reasons: ["先载入或导入词表，再根据目标和容量给出更精确推荐"]
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

      return { book, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.book.name.localeCompare(b.book.name));
}
