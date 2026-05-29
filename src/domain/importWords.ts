import { nowIso } from "./date";
import type { WordBook, WordItem } from "./types";

export interface WordImportResult {
  words: WordItem[];
  books: WordBook[];
  addedCount: number;
  duplicateCount: number;
  errors: string[];
}

export function normalizeWord(word: string): string {
  return word
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9' -]/g, "");
}

export function makeWordId(normalizedWord: string): string {
  return `word:${encodeURIComponent(normalizedWord)}`;
}

export function makeBookId(name: string): string {
  const normalized = normalizeWord(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `book:${normalized || "imported"}`;
}

export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      field += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) {
    rows.push(row);
  }
  return rows;
}

export function importWordsFromCsv(text: string, existingWords: WordItem[] = []): WordImportResult {
  const rows = parseCsvRows(text);
  if (rows.length === 0) {
    return { words: existingWords, books: [], addedCount: 0, duplicateCount: 0, errors: ["CSV 文件为空"] };
  }

  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const wordIndex = headers.indexOf("word");
  const meaningIndex = headers.indexOf("meaning");
  const bookNameIndex = headers.indexOf("book_name");
  const levelIndex = headers.indexOf("level");
  const tagsIndex = headers.indexOf("tags");

  if (wordIndex === -1) {
    return {
      words: existingWords,
      books: [],
      addedCount: 0,
      duplicateCount: 0,
      errors: ["CSV 缺少必填字段 word"]
    };
  }

  const incomingWords: WordItem[] = [];
  const books = new Map<string, WordBook>();
  const errors: string[] = [];
  const timestamp = nowIso();

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const rawWord = row[wordIndex]?.trim() ?? "";
    const normalizedWord = normalizeWord(rawWord);
    if (!normalizedWord) {
      errors.push(`第 ${rowNumber} 行缺少有效 word`);
      return;
    }

    const bookName = row[bookNameIndex]?.trim() || "用户导入词表";
    const bookId = makeBookId(bookName);
    if (!books.has(bookId)) {
      books.set(bookId, {
        id: bookId,
        name: bookName,
        targetType: "CUSTOM",
        difficulty: "自定义",
        estimatedWordCount: 0,
        sourceDescription: "用户 CSV 导入",
        hasImportedWords: true,
        status: "imported",
        role: "custom",
        priority: 50,
        importedWordCount: 0,
        duplicateWordCount: 0,
        recommendationTags: ["用户导入"],
        isFoundation: false,
        isTargetBook: true
      });
    }

    incomingWords.push({
      id: makeWordId(normalizedWord),
      word: rawWord,
      normalizedWord,
      meaning: row[meaningIndex]?.trim() ?? "",
      sourceBookIds: [bookId],
      sourceBookNames: [bookName],
      level: row[levelIndex]?.trim() || undefined,
      tags: (row[tagsIndex]?.split(/[;|，,\s]+/) ?? []).map((tag) => tag.trim()).filter(Boolean),
      stageHint: inferStageHint(bookName, row[tagsIndex] ?? ""),
      createdAt: timestamp,
      updatedAt: timestamp
    });
  });

  const merged = mergeWordItems(existingWords, incomingWords);
  const bookList = Array.from(books.values()).map((book) => ({
    ...book,
    estimatedWordCount: incomingWords.filter((word) => word.sourceBookIds.includes(book.id)).length,
    importedWordCount: incomingWords.filter((word) => word.sourceBookIds.includes(book.id)).length
  }));

  return {
    words: merged.words,
    books: bookList,
    addedCount: merged.addedCount,
    duplicateCount: merged.duplicateCount,
    errors
  };
}

export function importWordsFromJson(text: string, existingWords: WordItem[] = []): WordImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { words: existingWords, books: [], addedCount: 0, duplicateCount: 0, errors: ["JSON 解析失败"] };
  }

  if (!Array.isArray(parsed)) {
    return { words: existingWords, books: [], addedCount: 0, duplicateCount: 0, errors: ["JSON 顶层必须是数组"] };
  }

  const header = "word,meaning,book_name,level,tags";
  const rows = parsed.map((item) => {
    if (!item || typeof item !== "object") {
      return ",,,,";
    }
    const record = item as Record<string, unknown>;
    return [
      csvEscape(String(record.word ?? "")),
      csvEscape(String(record.meaning ?? "")),
      csvEscape(String(record.book_name ?? record.bookName ?? "用户导入词表")),
      csvEscape(String(record.level ?? "")),
      csvEscape(Array.isArray(record.tags) ? record.tags.join(";") : String(record.tags ?? ""))
    ].join(",");
  });

  return importWordsFromCsv([header, ...rows].join("\n"), existingWords);
}

export function mergeWordItems(existingWords: WordItem[], incomingWords: WordItem[]): {
  words: WordItem[];
  addedCount: number;
  duplicateCount: number;
} {
  const byNormalized = new Map(existingWords.map((word) => [word.normalizedWord, { ...word }]));
  let addedCount = 0;
  let duplicateCount = 0;

  incomingWords.forEach((incoming) => {
    const existing = byNormalized.get(incoming.normalizedWord);
    if (!existing) {
      byNormalized.set(incoming.normalizedWord, incoming);
      addedCount += 1;
      return;
    }

    duplicateCount += 1;
    byNormalized.set(incoming.normalizedWord, {
      ...existing,
      meaning: existing.meaning || incoming.meaning,
      sourceBookIds: Array.from(new Set([...existing.sourceBookIds, ...incoming.sourceBookIds])),
      sourceBookNames: Array.from(new Set([...existing.sourceBookNames, ...incoming.sourceBookNames])),
      tags: Array.from(new Set([...existing.tags, ...incoming.tags])),
      level: existing.level || incoming.level,
      stageHint: existing.stageHint ?? incoming.stageHint,
      priorityScore: Math.max(existing.priorityScore ?? 0, incoming.priorityScore ?? 0),
      priorityReasons: Array.from(new Set([...(existing.priorityReasons ?? []), ...(incoming.priorityReasons ?? [])])),
      updatedAt: nowIso()
    });
  });

  return {
    words: Array.from(byNormalized.values()).sort((a, b) => a.normalizedWord.localeCompare(b.normalizedWord)),
    addedCount,
    duplicateCount
  };
}

function inferStageHint(bookName: string, rawTags: string): WordItem["stageHint"] {
  const source = `${bookName} ${rawTags}`.toLowerCase();
  if (/foundation|基础|cet4|四级/.test(source)) {
    return "foundation";
  }
  if (/core|核心|cet6|六级|ielts|toefl|gre|雅思|托福/.test(source)) {
    return "core";
  }
  if (/sprint|冲刺|high|高频/.test(source)) {
    return "sprint";
  }
  if (/extend|扩展|强化/.test(source)) {
    return "extension";
  }
  return "core";
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
