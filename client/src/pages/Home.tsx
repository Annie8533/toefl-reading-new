/** Design philosophy: Cobalt Signal Console—正式練習維持 2026 Complete the Words 的十空段落；只有錯題檢討逐句重練。 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, CircleHelp, ClipboardCheck, Flame, Gauge, RefreshCw, RotateCcw, Target, XCircle } from "lucide-react";
import rawBank from "@/data/completeWordsBank.json";

type Answer = { number: number; answer: string; kind: "target" | "support"; target: string };
type TargetWord = { global_id: number; word: string; pos?: string };
type Task = { task_id: number; topic_anchor: string; target_words: TargetWord[]; full_passage: string; gapped_passage: string; answer_key: Answer[] };
type Gap = { number: number; prefix: string; expected: string; answer: string; kind: "target" | "support"; fullWordStart: number; fullWordEnd: number };
type TaskResult = { correct: Record<number, boolean>; score: number; submitted: Record<number, string> };
type ReviewItem = { id: string; task: Task; gap: Gap; before: string; after: string };
type ReviewResult = { correct: boolean; submitted: string; practiceSlots: string[] };
type StoredProgress = { attempted: number; correct: number; wrongByGap: Record<string, number>; today: string; todayGroups: number; dailyDone: boolean; passageCursor: number; priorityReviewTaskIds: number[]; newSincePriority: number };
type Mode = "exam" | "review";
type Screen = "questions" | "summary" | "daily-choice";

const bank = (rawBank as { tasks: Task[] }).tasks;
const STORAGE_KEY = "toefl-cobalt-signal-progress-v3";
const todayKey = () => new Date().toLocaleDateString("en-CA");
const blankProgress = (): StoredProgress => ({ attempted: 0, correct: 0, wrongByGap: {}, today: todayKey(), todayGroups: 0, dailyDone: false, passageCursor: 0, priorityReviewTaskIds: [], newSincePriority: 0 });
const readProgress = (): StoredProgress => { try { const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}"); const state = { ...blankProgress(), ...saved, wrongByGap: saved.wrongByGap ?? {}, priorityReviewTaskIds: saved.priorityReviewTaskIds ?? [] }; return state.today === todayKey() ? state : { ...state, today: todayKey(), todayGroups: 0, dailyDone: false }; } catch { return blankProgress(); } };
const gapId = (taskId: number, number: number) => `${taskId}-${number}`;
const gapsOf = (task: Task): Gap[] => {
  const matches = Array.from(task.gapped_passage.matchAll(/_+/g));
  let fullCursor = 0; let gappedCursor = 0;
  return matches.map((match, index) => {
    const before = task.gapped_passage.slice(gappedCursor, match.index);
    fullCursor += before.length;
    const prefix = before.match(/([A-Za-z]+)$/)?.[1] ?? "";
    const answer = task.answer_key[index]?.answer ?? "";
    const expected = answer.slice(prefix.length);
    const fullWordStart = fullCursor - prefix.length;
    const fullWordEnd = fullCursor + expected.length;
    fullCursor += expected.length;
    gappedCursor = (match.index ?? 0) + match[0].length;
    return { number: index + 1, prefix, expected, answer, kind: task.answer_key[index]?.kind ?? "support", fullWordStart, fullWordEnd };
  });
};
const sentenceBounds = (text: string, wordStart: number, wordEnd: number) => {
  const boundary = Math.max(text.lastIndexOf(".", wordStart - 1), text.lastIndexOf("!", wordStart - 1), text.lastIndexOf("?", wordStart - 1)) + 1;
  const tail = text.slice(wordEnd); const ending = tail.match(/[.!?](?=\s|$)/);
  return { start: boundary, end: ending?.index === undefined ? text.length : wordEnd + ending.index + 1 };
};
const makeRound = (_progress: StoredProgress, startIndex: number) => {
  const offset = startIndex % bank.length;
  return [...bank.slice(offset), ...bank.slice(0, offset)].slice(0, 10);
};
const normalized = (value: string, answer: string, length: number) => { const letters = value.replace(/[^a-zA-Z]/g, "").slice(0, length); return answer === answer.toUpperCase() ? letters.toUpperCase() : letters.toLowerCase(); };
const normalizedExamAnswer = (value: string, answer: string) => { const letters = value.replace(/[^a-zA-Z]/g, ""); return answer === answer.toUpperCase() ? letters.toUpperCase() : letters.toLowerCase(); };

function SignalMark() { return <span className="brand-mark" aria-label="TOEFL WORD LAB signal gap-grid mark"><img src="/manus-storage/cobalt-signal-mark_eba43549.png" alt=""/><i/><i/><i/></span>; }

export default function Home() {
  const [progress, setProgress] = useState<StoredProgress>(() => readProgress());
  const [seed, setSeed] = useState(() => readProgress().passageCursor);
  const [mode, setMode] = useState<Mode>("exam");
  const [screen, setScreen] = useState<Screen>(() => { const saved = readProgress(); return saved.todayGroups >= 2 ? "daily-choice" : "questions"; });
  const [session, setSession] = useState<Task[]>(() => { const saved = readProgress(); return makeRound(saved, saved.passageCursor); });
  const [active, setActive] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Record<number, string>>>({});
  const [results, setResults] = useState<Record<number, TaskResult>>({});
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  const [reviewActive, setReviewActive] = useState(0);
  const [reviewDraft, setReviewDraft] = useState<Record<string, string>>({});
  const [reviewResults, setReviewResults] = useState<Record<string, ReviewResult>>({});
  const [reviewLetterAlert, setReviewLetterAlert] = useState("");
  const [roundCounted, setRoundCounted] = useState(false);
  const [priorityTask, setPriorityTask] = useState<Task | null>(null);
  const [dailyFinished, setDailyFinished] = useState(() => readProgress().dailyDone);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }, [progress]);
  const task = priorityTask ?? session[active];
  const isPriorityReview = Boolean(priorityTask);
  const gaps = useMemo(() => task ? gapsOf(task) : [], [task]);
  const current = task ? answers[task.task_id] ?? {} : {};
  const taskResult = task ? results[task.task_id] : undefined;
  const review = reviewItems[reviewActive];
  const reviewResult = review ? reviewResults[review.id] : undefined;
  const groupPosition = task ? bank.findIndex(item => item.task_id === task.task_id) + 1 : 0;
  const accuracy = progress.attempted ? Math.round(progress.correct / progress.attempted * 100) : 0;
  const reviewCount = Object.values(progress.wrongByGap).filter(weight => weight > 0).length;
  const priorityReviewCount = progress.priorityReviewTaskIds.length;
  const examScore = Object.values(results).reduce((total, item) => total + item.score, 0);

  const moveToPreparedNewPassage = () => { if (active < session.length - 1) { setActive(index => index + 1); return; } setSession(makeRound(progress, seed)); setActive(0); setAnswers({}); setResults({}); };
  const clearDailyDone = () => { setDailyFinished(false); setProgress(previous => ({ ...previous, dailyDone: false })); };
  const beginPriorityReview = () => { clearDailyDone(); const reviewTask = bank.find(item => item.task_id === progress.priorityReviewTaskIds[0]); if (!reviewTask) { moveToPreparedNewPassage(); setScreen("questions"); return; } setPriorityTask(reviewTask); setAnswers(previous => { const next = { ...previous }; delete next[reviewTask.task_id]; return next; }); setResults(previous => { const next = { ...previous }; delete next[reviewTask.task_id]; return next; }); setScreen("questions"); };
  const continueAfterDailyGoal = () => { clearDailyDone(); moveToPreparedNewPassage(); setScreen("questions"); };
  const finishDailyGoal = () => { setDailyFinished(true); setProgress(previous => ({ ...previous, dailyDone: true })); };

  const newRound = () => { const next = screen === "summary" ? seed : (seed + session.length) % bank.length; setSeed(next); setProgress(previous => ({ ...previous, passageCursor: next, dailyDone: false })); setDailyFinished(false); setMode("exam"); setScreen("questions"); setSession(makeRound(progress, next)); setActive(0); setAnswers({}); setResults({}); setReviewItems([]); setReviewActive(0); setReviewDraft({}); setReviewResults({}); setReviewLetterAlert(""); setRoundCounted(false); setPriorityTask(null); };
  const updateAnswer = (number: number, value: string, gap: Gap) => { if (!task || taskResult) return; setAnswers(previous => ({ ...previous, [task.task_id]: { ...previous[task.task_id], [number]: normalizedExamAnswer(value, gap.answer) } })); };
  const gradeTask = () => {
    if (!task || taskResult) return;
    const correct: Record<number, boolean> = {}; const submitted: Record<number, string> = {};
    gaps.forEach(gap => { submitted[gap.number] = current[gap.number] ?? ""; correct[gap.number] = submitted[gap.number].toLowerCase() === gap.expected.toLowerCase(); });
    const score = Object.values(correct).filter(Boolean).length;
    setResults(previous => ({ ...previous, [task.task_id]: { correct, score, submitted } }));
    setProgress(previous => {
      const weights = { ...previous.wrongByGap }; gaps.forEach(gap => { const id = gapId(task.task_id, gap.number); if (correct[gap.number]) { if (weights[id]) weights[id] = Math.max(0, weights[id] - 1); } else weights[id] = (weights[id] ?? 0) + 1; });
      const queue = previous.priorityReviewTaskIds.filter(id => id !== task.task_id);
      if (score < 5) queue.push(task.task_id);
      return { ...previous, attempted: previous.attempted + gaps.length, correct: previous.correct + score, wrongByGap: weights, priorityReviewTaskIds: queue };
    });
  };
  const advanceExamPassage = () => {
    const nextCursor = (seed + 1) % bank.length;
    if (isPriorityReview) { setPriorityTask(null); setSeed(nextCursor); setProgress(previous => ({ ...previous, passageCursor: nextCursor, newSincePriority: 0 })); if (active < session.length - 1) { setActive(index => index + 1); return; } setScreen("summary"); return; }
    const nextTodayGroups = progress.today === todayKey() ? progress.todayGroups + 1 : 1;
    if (nextTodayGroups === 2) { setSeed(nextCursor); setDailyFinished(false); setProgress(previous => ({ ...previous, passageCursor: nextCursor, newSincePriority: previous.newSincePriority + 1, today: todayKey(), todayGroups: nextTodayGroups, dailyDone: false })); setScreen("daily-choice"); return; }
    const currentWasHighError = Boolean(taskResult && taskResult.score < 5);
    const queuedIds = [...progress.priorityReviewTaskIds.filter(id => id !== task?.task_id), ...(currentWasHighError && task ? [task.task_id] : [])];
    const shouldInsertReview = progress.newSincePriority + 1 >= 5 && queuedIds.length > 0;
    if (shouldInsertReview) { const reviewTask = bank.find(item => item.task_id === queuedIds[0]); if (reviewTask) { setPriorityTask(reviewTask); setAnswers(previous => { const next = { ...previous }; delete next[reviewTask.task_id]; return next; }); setResults(previous => { const next = { ...previous }; delete next[reviewTask.task_id]; return next; }); setProgress(previous => ({ ...previous, newSincePriority: 0 })); return; } }
    setSeed(nextCursor); setProgress(previous => ({ ...previous, passageCursor: nextCursor, newSincePriority: previous.newSincePriority + 1, today: todayKey(), todayGroups: nextTodayGroups })); if (active < session.length - 1) { setActive(index => index + 1); return; } setScreen("summary");
  };
  const startTaskReview = () => {
    if (!task || !taskResult) return;
    const misses = gaps.filter(gap => !taskResult.correct[gap.number]).map(gap => { const bounds = sentenceBounds(task.full_passage, gap.fullWordStart, gap.fullWordEnd); return { id: gapId(task.task_id, gap.number), task, gap, before: task.full_passage.slice(bounds.start, gap.fullWordStart).trimStart(), after: task.full_passage.slice(gap.fullWordEnd, bounds.end) }; });
    if (!misses.length) { advanceExamPassage(); return; }
    setMode("review"); setScreen("questions"); setReviewItems(misses); setReviewActive(0); setReviewDraft({}); setReviewResults({}); setReviewLetterAlert("");
  };
  const continueAfterExam = () => { if (!taskResult) return; if (taskResult.score === gaps.length) advanceExamPassage(); else startTaskReview(); };
  const updateReviewDraft = (value: string) => {
    if (!review) return;
    const raw = value.replace(/[^a-zA-Z]/g, "").slice(0, review.gap.expected.length);
    const expected = review.gap.expected;
    const mismatch = raw.split("").findIndex((letter, index) => letter.toLowerCase() !== expected[index]?.toLowerCase());
    if (mismatch >= 0) {
      const safePrefix = raw.slice(0, mismatch);
      const nextLetter = expected[mismatch];
      setReviewDraft(previous => ({ ...previous, [review.id]: normalized(safePrefix, review.gap.answer, expected.length) }));
      setReviewLetterAlert(`第 ${mismatch + 1} 個字母不正確；下一個應輸入「${nextLetter}」。`);
      return;
    }
    setReviewLetterAlert("");
    setReviewDraft(previous => ({ ...previous, [review.id]: normalized(raw, review.gap.answer, expected.length) }));
  };
  const gradeReview = () => {
    if (!review) return;
    const submitted = reviewDraft[review.id] ?? "";
    if (submitted.length < review.gap.expected.length) { setReviewLetterAlert(`尚未完成拼寫；下一個應輸入「${review.gap.expected[submitted.length]}」。`); return; }
    const correct = submitted.toLowerCase() === review.gap.expected.toLowerCase();
    const previousSlots = reviewResults[review.id]?.practiceSlots ?? [];
    const practiceSlots = correct && previousSlots.length < 10 ? [...previousSlots, review.gap.answer] : previousSlots;
    setReviewResults(previous => ({ ...previous, [review.id]: { correct, submitted, practiceSlots } }));
    setReviewDraft(previous => ({ ...previous, [review.id]: "" }));
    setReviewLetterAlert("");
    setProgress(previous => { const weights = { ...previous.wrongByGap }; if (correct) weights[review.id] = Math.max(0, (weights[review.id] ?? 0) - 1); else weights[review.id] = (weights[review.id] ?? 0) + 1; return { ...previous, attempted: previous.attempted + 1, correct: previous.correct + (correct ? 1 : 0), wrongByGap: weights }; });
  };
  const nextReview = () => { if (reviewActive < reviewItems.length - 1) { setReviewActive(index => index + 1); setReviewLetterAlert(""); return; } setMode("exam"); setReviewItems([]); setReviewActive(0); setReviewDraft({}); setReviewResults({}); setReviewLetterAlert(""); advanceExamPassage(); };
  const skipTaskReview = () => { setMode("exam"); setReviewItems([]); setReviewActive(0); setReviewDraft({}); setReviewResults({}); setReviewLetterAlert(""); advanceExamPassage(); };
  const renderPassage = (): ReactNode[] => {
    if (!task) return []; const pieces = task.gapped_passage.split(/(_+)/g); const nodes: ReactNode[] = []; let gapIndex = 0;
    for (let index = 0; index < pieces.length; index += 1) { const piece = pieces[index]; const nextGap = /^_+$/.test(pieces[index + 1] ?? ""); if (/^_+$/.test(piece)) continue; if (nextGap) { const split = piece.match(/^(.*?)([A-Za-z]+)$/); const gap = gaps[gapIndex++]; if (split && gap) { const [, before, prefix] = split; if (before) nodes.push(<span key={`text-${index}`}>{before}</span>); const state = taskResult ? (taskResult.correct[gap.number] ? "ok" : "no") : ""; nodes.push(<span className="signal-word" key={`gap-${gap.number}`}><span className="word-prefix">{prefix}</span><span className="signal-gap-wrap"><input value={current[gap.number] ?? ""} spellCheck={false} autoCapitalize="none" disabled={Boolean(taskResult)} onChange={event => updateAnswer(gap.number, event.target.value, gap)} onKeyDown={event => { if (event.key === "Enter") taskResult ? continueAfterExam() : gradeTask(); }} style={{ width: "4.25em" }} className={`signal-gap exam-gap ${state} ${gap.answer === gap.answer.toUpperCase() ? "is-caps" : ""}`} aria-label={`第 ${gap.number} 空，字首 ${prefix}`}/>{taskResult && !taskResult.correct[gap.number] && <span className="correction">{gap.expected}</span>}</span></span>); index += 1; continue; } } nodes.push(<span key={`text-${index}`}>{piece}</span>); }
    return nodes;
  };

  return <div className="signal-app two-stage-app">
    <header className="signal-header"><a href="#top" className="signal-brand"><SignalMark/><span><b>TOEFL</b> // WORD<span>LAB</span></span></a><div className="header-meta"><span><Flame size={15}/> {mode === "review" ? "MISTAKE SPELLING REVIEW" : "PARAGRAPH EXAM MODE"}</span><span className="header-divider"/><b>DAY {String(progress.todayGroups).padStart(2, "0")} / 02</b></div><button onClick={newRound} className="signal-button ghost"><RefreshCw size={16}/> NEW ROUND</button></header>
    <main id="top"><section className="signal-hero compact-hero"><img src="/manus-storage/cobalt-signal-hero_175d1730.png" alt="抽象字彙訊號網格"/><div className="hero-shade"/><div className="lexicon-grid" aria-hidden="true"><span>_</span><span>A</span><span>_</span><span>R</span><span>_</span><span>G</span></div><div className="hero-content"><p className="signal-kicker">TOEFL iBT 2026 · COMPLETE THE WORDS</p><h1>{mode === "review" ? <>Review the <em>word.</em></> : <>Complete the <em>passage.</em></>}</h1><p>{mode === "review" ? "錯題檢討時，逐題回到完整句子重新拼寫。" : "考試練習時，每題是一整段文字與十個字內填空。"}</p><div className="hero-readout"><strong>{mode === "review" ? reviewItems.length : "10"}</strong><span>{mode === "review" ? "MISSED WORDS / SINGLE-SENTENCE REVIEW" : "GAPS / ONE ACADEMIC PASSAGE"}</span><i/></div></div><div className="signal-orbit"><span/><span/><b>{screen === "summary" ? "OK" : String(mode === "review" ? reviewActive + 1 : active + 1).padStart(2, "0")}</b></div></section>
      <section className="signal-shell">{screen === "daily-choice" ? <DailyChoice today={progress.todayGroups} hasPriority={priorityReviewCount > 0} finished={dailyFinished} onContinue={continueAfterDailyGoal} onPriority={beginPriorityReview} onFinish={finishDailyGoal}/> : screen === "summary" ? <Summary mode="exam" score={examScore} total={session.length * 10} hasMisses={false} onReview={newRound} onNext={newRound}/> : mode === "exam" && task ? <ExamStage task={task} gaps={gaps} active={active} session={session} groupPosition={groupPosition} totalGroups={bank.length} isPriorityReview={isPriorityReview} priorityReviewCount={priorityReviewCount} current={current} result={taskResult} renderPassage={renderPassage} onGrade={gradeTask} onNext={continueAfterExam} onSelect={setActive} accuracy={accuracy} attempted={progress.attempted} reviewCount={reviewCount} today={progress.todayGroups}/> : review ? <FreePracticeReviewStage item={review} index={reviewActive} total={reviewItems.length} draft={reviewDraft[review.id] ?? ""} result={reviewResult ?? { correct: false, submitted: "", practiceSlots: [] }} letterAlert={reviewLetterAlert} onDraft={updateReviewDraft} onGrade={gradeReview} onNext={nextReview} onSkip={skipTaskReview} accuracy={accuracy} attempted={progress.attempted} reviewCount={reviewCount} today={progress.todayGroups}/> : null}<div className="signal-bottom"><div className="feature-block blue"><img src="/manus-storage/cobalt-signal-quiz_5a1d2f55.png" alt="抽象學習信號"/><div><p className="signal-kicker">ONE RULE</p><h3>Read wide.<br/><em>Spell precise.</em></h3></div></div><div className="feature-block white"><Gauge size={30}/><p className="signal-kicker">DAILY NOTE</p><h3>Practice makes<br/><em>progress.</em></h3><span>每一次練習，都讓進步看得見。</span></div></div></section></main><footer className="signal-footer"><span>WORDLAB / COMPLETE THE WORDS</span><span>84 PASSAGES · 521 TARGET WORDS</span><span>LOCAL BROWSER MEMORY</span></footer>
  </div>;
}

function ExamStage({ task, gaps, active, session, groupPosition, totalGroups, isPriorityReview, priorityReviewCount, current, result, renderPassage, onGrade, onNext, onSelect, accuracy, attempted, reviewCount, today }: { task: Task; gaps: Gap[]; active: number; session: Task[]; groupPosition: number; totalGroups: number; isPriorityReview: boolean; priorityReviewCount: number; current: Record<number, string>; result?: TaskResult; renderPassage: () => ReactNode[]; onGrade: () => void; onNext: () => void; onSelect: (index: number) => void; accuracy: number; attempted: number; reviewCount: number; today: number }) { return <><div className="dashboard-bar"><div><p className="signal-kicker">{isPriorityReview ? "HIGH-ERROR PRIORITY REVIEW" : "PARAGRAPH EXAM WORKSHEET"}</p><h2>{isPriorityReview ? "高錯複習題組" : "題組"} <span>{String(groupPosition).padStart(2, "0")}</span> <small>· {groupPosition}/{totalGroups} {priorityReviewCount > 0 ? `· 待複習 ${priorityReviewCount} 組` : ""}</small></h2></div><div className="session-tabs">{session.map((item, index) => <button key={item.task_id} onClick={() => !isPriorityReview && onSelect(index)} className={`${!isPriorityReview && index === active ? "is-active" : ""} ${item.task_id === task.task_id && result ? "is-done" : ""}`} aria-label={`第 ${index + 1} 段`}>{String(index + 1).padStart(2, "0")}</button>)}</div></div><div className="signal-workspace"><section className="question-stage exam-stage"><div className="stage-topline"><div><span className="stage-number">{String(groupPosition).padStart(2, "0")}</span><span className="stage-topic">{task.topic_anchor}</span></div><span className={`stage-state ${result ? "ready" : ""}`}>{result ? `${result.score}/10 CHECKED` : isPriorityReview ? "PRIORITY REVIEW" : "AWAITING INPUT"}</span></div><div className="instruction"><Target size={17}/><span>{isPriorityReview ? "高錯複習：完成本段後將回到原本的新題順序。" : "考試題面：閱讀完整段落，補齊十個缺失字母。"}</span></div><p className="signal-passage exam-passage">{renderPassage()}</p><div className="stage-actions"><div className="input-hint"><CircleHelp size={15}/><span>10 GAPS · ONE ACADEMIC PASSAGE</span></div><div className="action-buttons">{!result ? <button onClick={onGrade} className="signal-button primary"><ClipboardCheck size={17}/> CHECK PASSAGE</button> : <button onClick={onNext} className="signal-button primary">{result.score === gaps.length ? "NEXT PASSAGE" : "REVIEW THIS PASSAGE"}<ArrowRight size={17}/></button>}</div></div>{result && <div className={`grade-banner ${result.score === 10 ? "win" : ""}`}>{result.score === 10 ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}<span>{result.score === 10 ? "CLEAN PASSAGE — all ten gaps are correct." : `${10 - result.score} 個錯誤字已保留，現在可逐句重新拼寫。`}</span></div>}<div className="target-line"><span>TARGET LEXICON</span><p>{task.target_words.map(word => word.word).join("  /  ")}</p></div></section><Metrics accuracy={accuracy} attempted={attempted} reviewCount={reviewCount} today={today}/></div></> }

function FreePracticeReviewStage({ item, index, total, draft, result, letterAlert, onDraft, onGrade, onNext, onSkip, accuracy, attempted, reviewCount, today }: { item: ReviewItem; index: number; total: number; draft: string; result: ReviewResult; letterAlert: string; onDraft: (value: string) => void; onGrade: () => void; onNext: () => void; onSkip: () => void; accuracy: number; attempted: number; reviewCount: number; today: number }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const slots = result.practiceSlots;
  useEffect(() => { inputRef.current?.focus(); }, [item.id, slots.length, result?.correct]);
  const message = result ? (result.correct ? `正確，已記錄第 ${slots.length} 次練習；可繼續練習或前往下一錯題。` : "拼寫不正確；你可立即再試一次，也可先前往下一錯題。") : "此區可自由練習，想拼幾次都可以。";
  const practiceRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [typedSlots, setTypedSlots] = useState<string[]>(() => Array(10).fill(""));
  const [practiceAlert, setPracticeAlert] = useState("");
  useEffect(() => { setTypedSlots(Array(10).fill("")); setPracticeAlert(""); window.setTimeout(() => practiceRefs.current[0]?.focus(), 0); }, [item.id]);
  const updateSlot = (slot: number, value: string) => {
    const answer = item.gap.answer;
    const raw = value.replace(/[^a-zA-Z]/g, "").slice(0, answer.length);
    const mismatch = raw.split("").findIndex((letter, position) => letter.toLowerCase() !== answer[position]?.toLowerCase());
    const next = [...typedSlots];
    if (mismatch >= 0) {
      next[slot] = normalized(raw, answer, answer.length);
      setTypedSlots(next);
      setPracticeAlert(`第 ${slot + 1} 格有拼寫錯誤，請自行檢查並修正。`);
      return;
    }
    const cleaned = normalized(raw, answer, answer.length);
    const wasComplete = typedSlots[slot].toLowerCase() === answer.toLowerCase();
    next[slot] = cleaned;
    setTypedSlots(next);
    setPracticeAlert("");
    if (cleaned.toLowerCase() === answer.toLowerCase() && !wasComplete) window.setTimeout(() => practiceRefs.current[slot + 1]?.focus(), 90);
  };
  const handleSlotKey = (slot: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const answer = item.gap.answer;
    if (!typedSlots[slot]) return;
    if (typedSlots[slot].toLowerCase() === answer.toLowerCase()) practiceRefs.current[slot + 1]?.focus();
    else setPracticeAlert(`第 ${slot + 1} 格尚未完成，請自行檢查拼寫。`);
  };
  return <><div className="dashboard-bar"><div><p className="signal-kicker">MISTAKE SPELLING REVIEW · FREE PRACTICE</p><h2>Review <span>{String(index + 1).padStart(2, "0")}</span> <small>· {index + 1}/{total} missed words</small></h2></div><div className="session-tabs">{Array.from({ length: total }, (_, number) => <button key={number} className={number === index ? "is-active" : ""} aria-label={`錯題 ${number + 1}`}>{String(number + 1).padStart(2, "0")}</button>)}</div></div><div className="signal-workspace single-workspace"><section className="question-stage review-stage"><div className="stage-topline"><div><span className="stage-number">{String(index + 1).padStart(2, "0")}</span><span className="stage-topic">{item.task.topic_anchor}</span></div><span className="stage-state ready">{typedSlots.filter(value => value.toLowerCase() === item.gap.answer.toLowerCase()).length}/10 PRACTICED</span></div><div className="instruction"><Target size={17}/><span>檢討模式：先讀完整句子，再在下方十格自由練習完整單字；每一格都可直接鍵入。</span></div><p className="single-sentence review-full-sentence"><span>{item.before}</span><mark>{item.gap.answer}</mark><span>{item.after}</span></p><div className="free-practice interactive-practice"><div className="practice-heading"><span>MORE PRACTICE</span><strong>自由拼寫練習區</strong><small>每格可直接輸入完整單字；正確後自動跳到下一格。</small></div><div className="practice-slots">{typedSlots.map((value, slot) => { const complete = value.toLowerCase() === item.gap.answer.toLowerCase(); const mismatch = value.split("").findIndex((letter, position) => letter.toLowerCase() !== item.gap.answer[position]?.toLowerCase()); return <label key={slot} className={`practice-slot ${complete ? "is-complete" : ""} ${mismatch >= 0 ? "has-alert" : ""}`}><em>{String(slot + 1).padStart(2, "0")}</em><input ref={node => { practiceRefs.current[slot] = node; }} value={value} disabled={complete} spellCheck={false} autoCapitalize="none" aria-label={`第 ${slot + 1} 次拼寫練習`} onChange={event => updateSlot(slot, event.target.value)} onKeyDown={event => handleSlotKey(slot, event)}/></label>; })}</div>{practiceAlert && <p className="practice-alert" role="alert">{practiceAlert}</p>}</div><div className="stage-actions"><div className="input-hint"><CircleHelp size={15}/><span>TYPE IN ANY OPEN BOX · WRONG LETTERS ARE FLAGGED IMMEDIATELY</span></div><div className="action-buttons"><button onClick={onNext} className="signal-button next">{index === total - 1 ? "RETURN TO PASSAGE" : "NEXT MISTAKE"}<ArrowRight size={17}/></button></div></div><div className="target-line"><span>REVIEW WORD</span><p>{item.gap.answer}</p></div><div className="review-skip-footer"><span>不想練習也可以直接前往下一段。</span><button onClick={onSkip} className="signal-button ghost">SKIP REVIEW · NEXT PASSAGE／跳過本次檢討<ArrowRight size={17}/></button></div></section><Metrics accuracy={accuracy} attempted={attempted} reviewCount={reviewCount} today={today}/></div></>;
  return <><div className="dashboard-bar"><div><p className="signal-kicker">MISTAKE SPELLING REVIEW · FREE PRACTICE</p><h2>Review <span>{String(index + 1).padStart(2, "0")}</span> <small>· {index + 1}/{total} missed words</small></h2></div><div className="session-tabs">{Array.from({ length: total }, (_, number) => <button key={number} className={number === index ? "is-active" : ""} aria-label={`錯題 ${number + 1}`}>{String(number + 1).padStart(2, "0")}</button>)}</div></div><div className="signal-workspace single-workspace"><section className="question-stage review-stage"><div className="stage-topline"><div><span className="stage-number">{String(index + 1).padStart(2, "0")}</span><span className="stage-topic">{item.task.topic_anchor}</span></div><span className={`stage-state ${slots.length ? "ready" : ""}`}>{slots.length ? `${slots.length}/10 PRACTICED` : "FREE PRACTICE"}</span></div><div className="instruction"><Target size={17}/><span>檢討模式：先看完整句子與正解，再自行決定要拼寫幾次。</span></div><p className="single-sentence"><span>{item.before}</span><span className="signal-word"><span className="word-prefix">{item.gap.prefix}</span><span className="signal-gap-wrap"><input ref={inputRef} value={draft} maxLength={item.gap.expected.length} spellCheck={false} autoCapitalize="none" onChange={event => onDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); onGrade(); } }} style={{ width: `${Math.max(46, item.gap.expected.length * 18 + 20)}px` }} className={`signal-gap ${letterAlert ? "letter-error" : ""} ${result ? (result.correct ? "ok" : "no") : ""} ${item.gap.answer === item.gap.answer.toUpperCase() ? "is-caps" : ""}`} aria-label={`錯題 ${index + 1}，字首 ${item.gap.prefix}`}/>{letterAlert && <span className="letter-alert" role="alert">{letterAlert}</span>}</span></span><span>{item.after}</span></p><div className="free-practice"><div className="practice-heading"><span>MORE PRACTICE</span><strong>拼寫練習區</strong><small>自由練習，請隨意拼打練習直到熟練。</small></div><div className="practice-slots">{Array.from({ length: 10 }, (_, slot) => <div key={slot} className={`practice-slot ${slots[slot] ? "is-complete" : ""}`}><em>{String(slot + 1).padStart(2, "0")}</em>{slots[slot] ? <><b>{slots[slot]}</b><span>正確</span></> : <i/>}</div>)}</div></div><div className="spelling-line"><span>TYPE THE MISSING LETTERS</span><b>{item.gap.prefix}</b><i>{"_".repeat(Math.max(3, item.gap.expected.length))}</i><small>ENTER TO CHECK · FOCUS STAYS HERE</small></div>{result && <div className={`grade-banner ${result.correct ? "win" : ""}`}>{result.correct ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}<span>{message}</span></div>}<div className="stage-actions"><div className="input-hint"><CircleHelp size={15}/><span>WRONG LETTERS ARE STOPPED IMMEDIATELY</span></div><div className="action-buttons"><button onClick={onGrade} className="signal-button primary"><ClipboardCheck size={17}/> CHECK SPELLING</button><button onClick={onNext} className="signal-button next">{index === total - 1 ? "RETURN TO PASSAGE" : "NEXT MISTAKE"}<ArrowRight size={17}/></button></div></div><div className="target-line"><span>REVIEW WORD</span><p>{item.gap.answer}</p></div></section><Metrics accuracy={accuracy} attempted={attempted} reviewCount={reviewCount} today={today}/></div></>;
}

function ReviewStage({ item, index, total, draft, result, onDraft, onGrade, onNext, accuracy, attempted, reviewCount, today }: { item: ReviewItem; index: number; total: number; draft: string; result?: ReviewResult; onDraft: (value: string) => void; onGrade: () => void; onNext: () => void; accuracy: number; attempted: number; reviewCount: number; today: number }) { return <><div className="dashboard-bar"><div><p className="signal-kicker">MISTAKE SPELLING REVIEW</p><h2>Review <span>{String(index + 1).padStart(2, "0")}</span> <small>· {index + 1}/{total} missed words</small></h2></div><div className="session-tabs">{Array.from({ length: total }, (_, number) => <button key={number} className={number === index ? "is-active" : ""} aria-label={`錯題 ${number + 1}`}>{String(number + 1).padStart(2, "0")}</button>)}</div></div><div className="signal-workspace single-workspace"><section className="question-stage review-stage"><div className="stage-topline"><div><span className="stage-number">{String(index + 1).padStart(2, "0")}</span><span className="stage-topic">{item.task.topic_anchor}</span></div><span className={`stage-state ${result ? "ready" : ""}`}>{result ? (result.correct ? "REPAIRED" : "STILL IN REVIEW") : "SPELL THE WORD"}</span></div><div className="instruction"><Target size={17}/><span>檢討模式：回到這個字所在的完整句子，再重新拼寫。</span></div><p className="single-sentence"><span>{item.before}</span><span className="signal-word"><span className="word-prefix">{item.gap.prefix}</span><span className="signal-gap-wrap"><input value={draft} maxLength={item.gap.expected.length} spellCheck={false} autoCapitalize="none" disabled={Boolean(result)} onChange={event => onDraft(event.target.value)} onKeyDown={event => { if (event.key === "Enter") result ? onNext() : onGrade(); }} style={{ width:`${Math.max(46, item.gap.expected.length * 18 + 20)}px` }} className={`signal-gap ${result ? (result.correct ? "ok" : "no") : ""} ${item.gap.answer === item.gap.answer.toUpperCase() ? "is-caps" : ""}`} aria-label={`錯題 ${index + 1}，字首 ${item.gap.prefix}`}/>{result && !result.correct && <span className="correction">{item.gap.expected}</span>}</span></span><span>{item.after}</span></p><div className="spelling-line"><span>TYPE THE MISSING LETTERS</span><b>{item.gap.prefix}</b><i>{"_".repeat(Math.max(3, item.gap.expected.length))}</i><small>ENTER TO {result ? "CONTINUE" : "CHECK"}</small></div>{result && <div className={`grade-banner ${result.correct ? "win" : ""}`}>{result.correct ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}<span>{result.correct ? "答對，這個字的錯題權重已降低。" : <>正解是 <b>{item.gap.answer}</b>。它會保留在下一輪的錯題優先序中。</>}</span></div>}<div className="stage-actions"><div className="input-hint"><CircleHelp size={15}/><span>ONE SENTENCE · ONE WORD REVIEW</span></div><div className="action-buttons">{!result ? <button onClick={onGrade} className="signal-button primary"><ClipboardCheck size={17}/> CHECK WORD</button> : <button onClick={onNext} className="signal-button primary">{index === total - 1 ? "FINISH REVIEW" : "NEXT REVIEW"}<ArrowRight size={17}/></button>}</div></div><div className="target-line"><span>REVIEW WORD</span><p>{item.gap.answer}</p></div></section><Metrics accuracy={accuracy} attempted={attempted} reviewCount={reviewCount} today={today}/></div></> }

function Summary({ mode, score, total, hasMisses, onReview, onNext }: { mode: Mode; score: number; total: number; hasMisses: boolean; onReview: () => void; onNext: () => void }) { return <section className="round-summary"><div className="summary-grid"><div><p className="signal-kicker">{mode === "exam" ? "EXAM ROUND COMPLETE" : "REVIEW COMPLETE"}</p><h2>{score === total ? <>Clean <em>signal.</em></> : <>Now review the <em>misses.</em></>}</h2><p>{mode === "exam" ? (hasMisses ? "段落考試已完成。下一步可把每個錯誤拆成一個完整句子，逐題重做拼寫。" : "本輪段落考試全部正確，可以直接開始下一輪。") : "逐句錯題檢討已完成。系統會保留尚未熟練的詞，並在下一輪優先安排。"}</p></div><div className="summary-number"><strong>{score}/{total}</strong><span>{mode === "exam" ? "GAP SCORE" : "REVIEW SCORE"}</span></div></div><div className="summary-actions">{mode === "exam" && hasMisses && <button className="signal-button primary" onClick={onReview}><RotateCcw size={17}/> REVIEW MISSED WORDS</button>}<button className="signal-button next" onClick={onNext}><RefreshCw size={16}/> START NEXT ROUND</button></div></section> }
function DailyChoice({ today, hasPriority, finished, onContinue, onPriority, onFinish }: { today: number; hasPriority: boolean; finished: boolean; onContinue: () => void; onPriority: () => void; onFinish: () => void }) { return <section className="daily-choice"><p className="signal-kicker">DAILY STUDY CHECKPOINT</p><h2>{finished ? <>今日練習 <em>已結束。</em></> : <>今日建議的 <em>2 組</em> 已完成。</>}</h2><p>{finished ? "你已選擇今天先到這裡。下次開啟時，會從下一題組繼續。" : `你已完成 ${today}/2 組段落練習。是否繼續？你可以自行決定，不會自動進入下一題。`}</p>{!finished && <div className="daily-choice-actions"><button onClick={onContinue} className="signal-button primary"><ArrowRight size={17}/> CONTINUE NEW PASSAGE／繼續新題</button>{hasPriority && <button onClick={onPriority} className="signal-button next"><RotateCcw size={17}/> REVIEW HIGH-ERROR PASSAGE／複習高錯題</button>}<button onClick={onFinish} className="signal-button ghost">TODAY&apos;S DONE／今天先到這裡</button></div>}</section> }

function Metrics({ accuracy, attempted, reviewCount, today }: { accuracy: number; attempted: number; reviewCount: number; today: number }) { return <aside className="data-tower"><img src="/manus-storage/cobalt-signal-progress_2580d5ad.png" alt="抽象學習進度訊號"/><div className="tower-overlay"/><div className="tower-content"><p className="signal-kicker">LIVE METRICS</p><div className="tower-score"><span>{accuracy}%</span><small>ACCURACY</small></div><Metric label="ATTEMPTS" value={String(attempted).padStart(3, "0")}/><Metric label="REVIEW WORDS" value={String(reviewCount).padStart(2, "0")}/><Metric label="TODAY" value={`${today}/2`}/><div className="tower-rule"/><p className="tower-copy">段落考試後，錯字會改以單句形式逐題檢討。</p></div></aside> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><b>{value}</b></div>; }
