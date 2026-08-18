/** Design philosophy: 溫暖紙本工作檯、墨藍資訊欄、橘朱校對線；把段落填空變成可專注操作的數位講義。 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CircleHelp,
  ClipboardCheck,
  Flame,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
  X,
} from "lucide-react";
import rawBank from "@/data/completeWordsBank.json";

type Answer = {
  number: number;
  answer: string;
  kind: "target" | "support";
  target: string;
};

type TargetWord = { global_id: number; word: string; pos?: string };

type Task = {
  task_id: number;
  topic_anchor: string;
  target_words: TargetWord[];
  full_passage: string;
  gapped_passage: string;
  answer_key: Answer[];
  word_count: number;
};

type StoredProgress = {
  attempted: number;
  correct: number;
  wrongByTask: Record<string, number>;
  today: string;
  todayGroups: number;
};

type GradedResult = { correct: Record<number, boolean>; score: number };

const bank = (rawBank as { tasks: Task[] }).tasks;
const STORAGE_KEY = "toefl-word-lab-paragraph-progress-v1";

const defaultProgress: StoredProgress = {
  attempted: 0,
  correct: 0,
  wrongByTask: {},
  today: "",
  todayGroups: 0,
};

const todayKey = () => new Date().toLocaleDateString("en-CA");

function readProgress(): StoredProgress {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { ...defaultProgress, today: todayKey() };
    const parsed = JSON.parse(saved) as StoredProgress;
    return parsed.today === todayKey()
      ? parsed
      : { ...parsed, today: todayKey(), todayGroups: 0 };
  } catch {
    return { ...defaultProgress, today: todayKey() };
  }
}

function getGaps(task: Task) {
  return Array.from(task.gapped_passage.matchAll(/_+/g)).map((match, index) => {
    const before = task.gapped_passage.slice(0, match.index);
    const visiblePrefix = before.match(/([A-Za-z]+)$/)?.[1] ?? "";
    const fullAnswer = task.answer_key[index]?.answer ?? "";
    return {
      number: index + 1,
      visiblePrefix,
      expected: fullAnswer.slice(visiblePrefix.length),
      fullAnswer,
      kind: task.answer_key[index]?.kind ?? "support",
    };
  });
}

function buildSession(progress: StoredProgress, seed: number) {
  const taskById = new Map(bank.map((task) => [task.task_id, task]));
  const priority = Object.entries(progress.wrongByTask)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => Number(id))
    .filter((id) => taskById.has(id));
  const offset = (seed * 10) % bank.length;
  const fresh = [...bank.slice(offset), ...bank.slice(0, offset)]
    .map((task) => task.task_id)
    .filter((id) => !priority.includes(id));
  return [...priority, ...fresh].slice(0, 10).map((id) => taskById.get(id)!);
}

function PaperMark() {
  return (
    <img
      src="/manus-storage/toefl-word-lab-mark_0a852ed9.png"
      alt="TOEFL Word Lab"
      className="h-8 w-8 object-contain sm:h-9 sm:w-9"
    />
  );
}

export default function Home() {
  const [progress, setProgress] = useState<StoredProgress>(() => readProgress());
  const [seed, setSeed] = useState(0);
  const [session, setSession] = useState<Task[]>(() => buildSession(readProgress(), 0));
  const [activeIndex, setActiveIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Record<number, string>>>({});
  const [results, setResults] = useState<Record<number, GradedResult>>({});
  const [countedTaskIds, setCountedTaskIds] = useState<number[]>([]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const task = session[activeIndex];
  const currentGaps = useMemo(() => (task ? getGaps(task) : []), [task]);
  const currentAnswers = task ? answers[task.task_id] ?? {} : {};
  const currentResult = task ? results[task.task_id] : undefined;
  const sessionDone = Object.keys(results).filter((id) => session.some((item) => item.task_id === Number(id))).length;
  const accuracy = progress.attempted ? Math.round((progress.correct / progress.attempted) * 100) : null;
  const reviewCount = Object.values(progress.wrongByTask).filter((weight) => weight > 0).length;

  const startNewPractice = () => {
    const nextSeed = seed + 1;
    setSeed(nextSeed);
    setSession(buildSession(progress, nextSeed));
    setActiveIndex(0);
    setAnswers({});
    setResults({});
    setCountedTaskIds([]);
  };

  const updateAnswer = (gapNumber: number, value: string, maxLength: number) => {
    if (!task) return;
    const clean = value.replace(/[^a-zA-Z]/g, "").slice(0, maxLength);
    setAnswers((previous) => ({
      ...previous,
      [task.task_id]: { ...previous[task.task_id], [gapNumber]: clean },
    }));
    if (results[task.task_id]) {
      setResults((previous) => {
        const next = { ...previous };
        delete next[task.task_id];
        return next;
      });
    }
  };

  const gradeTask = () => {
    if (!task) return;
    const correctness: Record<number, boolean> = {};
    currentGaps.forEach((gap) => {
      correctness[gap.number] = (currentAnswers[gap.number] ?? "").toLowerCase() === gap.expected.toLowerCase();
    });
    const score = Object.values(correctness).filter(Boolean).length;
    setResults((previous) => ({ ...previous, [task.task_id]: { correct: correctness, score } }));

    if (!countedTaskIds.includes(task.task_id)) {
      setCountedTaskIds((previous) => [...previous, task.task_id]);
      setProgress((previous) => {
        const missed = currentGaps.length - score;
        const wrongByTask = { ...previous.wrongByTask };
        if (missed > 0) wrongByTask[task.task_id] = (wrongByTask[task.task_id] ?? 0) + missed;
        else if (wrongByTask[task.task_id]) wrongByTask[task.task_id] = Math.max(0, wrongByTask[task.task_id] - 2);
        return {
          ...previous,
          attempted: previous.attempted + currentGaps.length,
          correct: previous.correct + score,
          wrongByTask,
          today: todayKey(),
          todayGroups: previous.today === todayKey() ? previous.todayGroups + 1 : 1,
        };
      });
    }
  };

  const goNext = () => setActiveIndex((value) => Math.min(value + 1, session.length - 1));

  if (!task) return null;

  const passagePieces = task.gapped_passage.split(/(_+)/g);
  let gapCursor = 0;

  return (
    <div className="min-h-screen bg-[#f5f1e8] text-[#1d303c]">
      <div className="warning-strip">
        <CircleHelp size={13} />
        <span>學習紀錄僅儲存在目前瀏覽器。請避免無痕模式，才能保留錯題優先順序。</span>
      </div>

      <header className="sticky top-0 z-30 border-b border-[#d7d0c1] bg-[#fbf9f3]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-4 px-4 py-3 sm:px-7">
          <a href="#top" className="flex items-center gap-2.5" aria-label="TOEFL Word Lab 首頁">
            <PaperMark />
            <span className="brand-lockup"><b>TOEFL</b> WORD LAB</span>
          </a>
          <div className="hidden items-center gap-5 lg:flex">
            <span className="flex items-center gap-2 text-xs font-medium text-[#7b6757]">
              <Flame size={15} className="text-[#c85c36]" /> 錯題優先模式
            </span>
            <div className="border-l border-[#d7d0c1] pl-5 text-right">
              <p className="text-[10px] tracking-[0.12em] text-[#8f867b]">今日目標</p>
              <p className="font-mono text-xs font-bold text-[#213d4b]">{progress.todayGroups} / 2 組 · {progress.todayGroups * 10} / 20 題</p>
            </div>
          </div>
          <button type="button" onClick={startNewPractice} className="lab-button lab-button-light">
            <RefreshCw size={15} /> <span className="hidden sm:inline">新的練習</span><span className="sm:hidden">換題</span>
          </button>
        </div>
      </header>

      <main id="top">
        <section className="hero-sheet">
          <img src="/manus-storage/toefl-word-lab-hero_f9c1a980.png" alt="紙本學習桌面" className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#f6f1e5]/98 via-[#f6f1e5]/91 to-[#f6f1e5]/35" />
          <div className="relative mx-auto max-w-[1440px] px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
            <div className="max-w-xl">
              <p className="eyebrow">2026 TOEFL 閱讀字彙練習 · 84 組段落題</p>
              <h1>讀段落，依字首<br /><em>補回完整單字。</em></h1>
              <p className="mt-5 max-w-md text-sm leading-7 text-[#5d5a54] sm:text-base">每組含 10 個缺字。先讀懂段落，再讓字首、詞性與上下文一起幫你補上答案；送出後立即校對，錯題會留在你的下一輪。</p>
              <div className="mt-7 flex flex-wrap gap-4 text-xs font-medium text-[#7b6757]">
                <span><b className="mr-2 text-[#c85c36]">01</b>讀脈絡</span>
                <span>—</span>
                <span><b className="mr-2 text-[#c85c36]">02</b>補字母</span>
                <span>—</span>
                <span><b className="mr-2 text-[#c85c36]">03</b>立即校對</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1440px] px-4 py-7 sm:px-7 sm:py-9">
          <div className="workbench-grid">
            <aside className="index-panel">
              <div className="panel-kicker"><ClipboardCheck size={14} /> 稿件索引 <span>{session.length} 組</span></div>
              <div className="task-nav" aria-label="題組導覽">
                {session.map((item, index) => {
                  const done = Boolean(results[item.task_id]);
                  const active = index === activeIndex;
                  return (
                    <button
                      type="button"
                      key={item.task_id}
                      aria-label={`第 ${index + 1} 組，${done ? "已作答" : "尚未作答"}`}
                      onClick={() => setActiveIndex(index)}
                      className={`task-dot ${active ? "active" : ""} ${done ? "done" : ""}`}
                    >{index + 1}</button>
                  );
                })}
              </div>
              <div className="mt-6 space-y-4 border-t border-[#ddd6c7] pt-5 text-xs">
                <Stat label="本輪稿件" value={`${sessionDone}/10`} />
                <Stat label="總答題數" value={progress.attempted.toString()} />
                <Stat label="累積正確率" value={accuracy === null ? "—" : `${accuracy}%`} />
                <Stat label="待複習" value={reviewCount.toString()} accent />
              </div>
              <div className="mt-6 border-t border-[#ddd6c7] pt-4 text-[11px] leading-5 text-[#82796e]">
                <Sparkles size={13} className="mr-1 inline text-[#c85c36]" />
                每次答錯都會提高題組的回訪權重。
              </div>
            </aside>

            <section className="worksheet-panel">
              <div className="flex items-start justify-between gap-4 border-b border-[#dfd7c8] pb-4">
                <div>
                  <p className="worksheet-index">{String(activeIndex + 1).padStart(2, "0")} <span>—</span> {task.topic_anchor}</p>
                  <p className="mt-1 font-mono text-[10px] tracking-[0.13em] text-[#918779]">WORKSHEET {String(activeIndex + 1).padStart(2, "0")} / 10 · COMPLETE THE WORDS</p>
                </div>
                <div className={`status-label ${currentResult ? "checked" : ""}`}>{currentResult ? `${currentResult.score}/10 已校對` : "待校對"}</div>
              </div>

              <div className="mt-6 flex items-center gap-2 text-xs text-[#8b8073]"><Target size={14} className="text-[#c85c36]" /> 閱讀段落，補回每個底線所缺失的字母。</div>
              <p className="passage-text" aria-label="填空段落">
                {passagePieces.map((piece, index) => {
                  if (!/^_+$/.test(piece)) return <span key={`${piece}-${index}`}>{piece}</span>;
                  const gap = currentGaps[gapCursor++];
                  const isCorrect = currentResult?.correct[gap.number];
                  const state = currentResult ? (isCorrect ? "correct" : "incorrect") : "";
                  return (
                    <span key={`gap-${gap.number}`} className="inline-gap-wrap">
                      <input
                        aria-label={`第 ${gap.number} 空，已顯示字首 ${gap.visiblePrefix}`}
                        className={`inline-gap ${state}`}
                        style={{ width: `${Math.max(36, gap.expected.length * 12 + 18)}px` }}
                        value={currentAnswers[gap.number] ?? ""}
                        maxLength={gap.expected.length}
                        onChange={(event) => updateAnswer(gap.number, event.target.value, gap.expected.length)}
                        onKeyDown={(event) => { if (event.key === "Enter") gradeTask(); }}
                      />
                      {currentResult && !isCorrect && <span className="answer-popover">{gap.expected}</span>}
                    </span>
                  );
                })}
              </p>

              <div className="mt-8 border-t border-[#dfd7c8] pt-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <label className="input-caption">輸入缺失字母 <span>— 每空只填入底線所代表的部分</span></label>
                    <p className="mt-2 font-mono text-xs text-[#8f867b]">按 Enter 送出 · 需完成 10 空</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={gradeTask} className="lab-button lab-button-primary"><ClipboardCheck size={16} /> 提交並批改</button>
                    {currentResult && activeIndex < session.length - 1 && <button type="button" onClick={goNext} className="lab-button lab-button-light">下一組 <ArrowRight size={16} /></button>}
                  </div>
                </div>
                {currentResult && (
                  <div className={`result-strip ${currentResult.score === 10 ? "perfect" : ""}`}>
                    {currentResult.score === 10 ? <Trophy size={17} /> : <BookOpen size={17} />}
                    <span>{currentResult.score === 10 ? "這一組全對。錯題權重已降低。" : `本組答對 ${currentResult.score}/10；錯誤答案已標示正解，並加入下一輪優先複習。`}</span>
                  </div>
                )}
              </div>

              <div className="mt-7 border-t border-[#dfd7c8] pt-4 text-xs text-[#8b8073]">
                <span className="font-semibold text-[#5f5449]">本組目標詞</span><span className="mx-2">·</span>{task.target_words.map((word) => word.word).join(" · ")}
              </div>
            </section>

            <aside className="review-panel">
              <img src="/manus-storage/toefl-word-lab-review-panel_fe8882e5.png" alt="深藍色紙本學習桌面" className="absolute inset-0 h-full w-full object-cover opacity-70" />
              <div className="absolute inset-0 bg-[#183547]/88" />
              <div className="relative flex h-full min-h-[330px] flex-col p-6 text-[#f7f4eb]">
                <p className="panel-kicker text-[#edc8b7]"><Flame size={14} /> 專屬錯題</p>
                <h2 className="mt-5 text-3xl font-semibold leading-tight">錯題會<br /><em>更常回來。</em></h2>
                <p className="mt-4 text-sm leading-6 text-[#d0dce0]">答錯的段落會在下一輪優先出現；連續答對後，回訪權重才會逐步下降。</p>
                <div className="mt-6 border-t border-white/20 pt-5">
                  <p className="text-[11px] tracking-[0.12em] text-[#aec2ca]">目前待複習</p>
                  <p className="mt-1 font-mono text-3xl font-bold text-white">{reviewCount}<span className="ml-1 text-sm font-normal text-[#aec2ca]">組</span></p>
                </div>
                <div className="mt-auto rounded-sm border border-white/15 bg-white/5 p-4 text-xs leading-5 text-[#d5e0e3]">
                  <Check size={14} className="mr-1 inline text-[#ef9f79]" /> 紀錄只留在此裝置，重新開啟也能延續。
                </div>
              </div>
            </aside>
          </div>

          <div className="mt-7 grid gap-5 lg:grid-cols-[1.1fr_1fr]">
            <div className="study-note">
              <img src="/manus-storage/toefl-word-lab-study-card_2233896b.png" alt="學習筆記與文具" className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#1f3742]/92 via-[#1f3742]/68 to-transparent" />
              <div className="relative max-w-md p-7 sm:p-9">
                <p className="eyebrow text-[#edc8b7]">本輪策略</p>
                <h2 className="mt-3 text-3xl font-semibold leading-tight text-[#fffaf0]">先讀完整段落，<br /><em>再回頭補字母。</em></h2>
                <p className="mt-4 text-sm leading-6 text-[#d6e1e1]">Complete the Words 不只考字彙，也考你能否同時使用詞性、搭配與段落訊息。</p>
              </div>
            </div>
            <div className="method-note">
              <p className="eyebrow">題庫資料</p>
              <h2 className="mt-2 text-2xl font-semibold">84 組 · 840 空</h2>
              <p className="mt-3 text-sm leading-6 text-[#686057]">以 2026 Complete the Words 真題樣本的段落長度、10 空結構與功能詞／內容詞比例校準；所有 521 個目標詞均至少作為一次填答答案出現。</p>
              <div className="mt-5 flex gap-3 font-mono text-xs text-[#7b6757]"><span>72–80 詞／組</span><span>·</span><span>本機儲存</span><span>·</span><span>即時校對</span></div>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-[#d7d0c1] px-4 py-5 text-center text-xs text-[#84796b]">TOEFL WORD LAB · 你的作答紀錄只保存在目前使用的瀏覽器</footer>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="flex items-baseline justify-between gap-3"><span className="text-[#887e72]">{label}</span><span className={`font-mono font-bold ${accent ? "text-[#c85c36]" : "text-[#243c49]"}`}>{value}</span></div>;
}
