import { importWordsFromCsv } from "./importWords";
import type { UserGoal, WordBook, WordItem } from "./types";

export const DEMO_WORD_BOOKS: WordBook[] = [
  {
    id: "book:foundation-demo",
    name: "Foundation Demo",
    targetType: "GENERAL",
    difficulty: "A1-A2",
    estimatedWordCount: 24,
    sourceDescription: "项目演示元数据，不代表完整商业词书",
    hasImportedWords: true,
    recommendationTags: ["基础", "核心"],
    isFoundation: true,
    isTargetBook: false,
    overlapNote: "与 CET4 Core Demo 存在部分基础词重合"
  },
  {
    id: "book:cet4-core-demo",
    name: "CET4 Core Demo",
    targetType: "CET4",
    difficulty: "A2-B1",
    estimatedWordCount: 24,
    sourceDescription: "项目演示词书元数据与少量通用词",
    hasImportedWords: true,
    recommendationTags: ["四级", "核心", "高频"],
    isFoundation: false,
    isTargetBook: true
  },
  {
    id: "book:cet6-bridge-demo",
    name: "CET6 Bridge Demo",
    targetType: "CET6",
    difficulty: "B1-B2",
    estimatedWordCount: 16,
    sourceDescription: "项目演示词书元数据与少量通用词",
    hasImportedWords: true,
    recommendationTags: ["六级", "强化"],
    isFoundation: false,
    isTargetBook: true
  },
  {
    id: "book:ielts-core-demo",
    name: "IELTS Core Demo",
    targetType: "IELTS",
    difficulty: "B2",
    estimatedWordCount: 16,
    sourceDescription: "项目演示词书元数据与少量通用词",
    hasImportedWords: true,
    recommendationTags: ["雅思", "核心", "学术"],
    isFoundation: false,
    isTargetBook: true
  }
];

export const DEMO_WORDS_CSV = `word,meaning,book_name,level,tags
ability,能力,Foundation Demo,A2,noun
able,能够的,Foundation Demo,A1,adjective
about,关于,Foundation Demo,A1,preposition
above,在上方,Foundation Demo,A1,preposition
accept,接受,Foundation Demo,A2,verb
account,账户；说明,Foundation Demo,A2,noun
achieve,实现,Foundation Demo,A2,verb
action,行动,Foundation Demo,A2,noun
adapt,适应,Foundation Demo,A2,verb
address,地址；处理,Foundation Demo,A2,noun;verb
advance,进步,Foundation Demo,A2,noun;verb
affect,影响,Foundation Demo,A2,verb
afford,负担得起,Foundation Demo,A2,verb
agree,同意,Foundation Demo,A1,verb
allow,允许,Foundation Demo,A2,verb
appear,出现,Foundation Demo,A2,verb
apply,申请；应用,CET4 Core Demo,B1,verb
argue,争论,CET4 Core Demo,B1,verb
arrange,安排,CET4 Core Demo,B1,verb
arrive,到达,CET4 Core Demo,A2,verb
assess,评估,CET4 Core Demo,B1,verb
avoid,避免,CET4 Core Demo,B1,verb
balance,平衡,CET4 Core Demo,B1,noun;verb
benefit,益处,CET4 Core Demo,B1,noun;verb
challenge,挑战,CET4 Core Demo,B1,noun
change,改变,CET4 Core Demo,A2,noun;verb
choice,选择,CET4 Core Demo,A2,noun
common,常见的,CET4 Core Demo,A2,adjective
compare,比较,CET4 Core Demo,B1,verb
compete,竞争,CET4 Core Demo,B1,verb
concern,担心；涉及,CET4 Core Demo,B1,noun;verb
conduct,实施；行为,CET4 Core Demo,B1,noun;verb
consider,考虑,CET4 Core Demo,B1,verb
contain,包含,CET4 Core Demo,B1,verb
create,创造,CET4 Core Demo,A2,verb
decide,决定,CET4 Core Demo,A2,verb
demand,需求,CET6 Bridge Demo,B2,noun;verb
describe,描述,CET6 Bridge Demo,B1,verb
develop,发展,CET6 Bridge Demo,B1,verb
discover,发现,CET6 Bridge Demo,B1,verb
discuss,讨论,CET6 Bridge Demo,B1,verb
effect,影响；效果,CET6 Bridge Demo,B1,noun
effort,努力,CET6 Bridge Demo,B1,noun
environment,环境,CET6 Bridge Demo,B1,noun
evidence,证据,CET6 Bridge Demo,B2,noun
expect,期待,CET6 Bridge Demo,B1,verb
explain,解释,CET6 Bridge Demo,B1,verb
factor,因素,CET6 Bridge Demo,B1,noun
focus,焦点,CET6 Bridge Demo,B1,noun;verb
improve,改善,CET6 Bridge Demo,B1,verb
include,包括,CET6 Bridge Demo,B1,verb
increase,增加,CET6 Bridge Demo,B1,noun;verb
influence,影响,IELTS Core Demo,B2,noun;verb
involve,涉及,IELTS Core Demo,B2,verb
issue,议题,IELTS Core Demo,B2,noun
maintain,维持,IELTS Core Demo,B2,verb
measure,衡量,IELTS Core Demo,B2,noun;verb
method,方法,IELTS Core Demo,B1,noun
obtain,获得,IELTS Core Demo,B2,verb
perform,执行；表现,IELTS Core Demo,B2,verb
prevent,防止,IELTS Core Demo,B2,verb
process,过程,IELTS Core Demo,B1,noun
provide,提供,IELTS Core Demo,B1,verb
reduce,减少,IELTS Core Demo,B1,verb
require,要求,IELTS Core Demo,B2,verb
respond,回应,IELTS Core Demo,B1,verb
result,结果,IELTS Core Demo,B1,noun
select,选择,IELTS Core Demo,B1,verb
significant,重要的,IELTS Core Demo,B2,adjective
support,支持,IELTS Core Demo,B1,noun;verb
theory,理论,IELTS Core Demo,B2,noun
value,价值,IELTS Core Demo,B1,noun
vary,变化,IELTS Core Demo,B2,verb`;

export function buildDemoWords(): WordItem[] {
  return importWordsFromCsv(DEMO_WORDS_CSV).words;
}

export function buildDemoGoal(startDate: string, deadline: string, targetVocabularyCount: number): UserGoal {
  const timestamp = new Date().toISOString();
  return {
    id: "goal:demo",
    targetType: "CET4",
    targetDescription: "演示目标：用少量通用词验证计划生成和动态重排",
    startDate,
    deadline,
    targetVocabularyCount,
    currentEstimatedVocabulary: 1500,
    dailyNewWordLimit: 20,
    dailyReviewLimit: 80,
    studyDaysPerWeek: 6,
    restWeekdays: [0],
    bufferDayRatio: 0.1,
    planStyle: "steady",
    selectedBookIds: ["book:foundation-demo", "book:cet4-core-demo"],
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
