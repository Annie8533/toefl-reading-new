/** Design philosophy: Cobalt Signal Console—以原創高對比控制台呈現參考網站的「一整句＋一個拼字空＋下一題」核心學習節奏。 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleHelp, ClipboardCheck, Flame, Gauge, RefreshCw, RotateCcw, Target, XCircle } from "lucide-react";
import rawBank from "@/data/completeWordsBank.json";

type Answer = { number: number; answer: string; kind: "target" | "support"; target: string };
type Task = { task_id: number; topic_anchor: string; full_passage: string; gapped_passage: string; answer_key: Answer[] };
type Question = { id: string; sourceTaskId: number; topic: string; before: string; prefix: string; expected: string; answer: string; after: string };
type StoredProgress = { attempted: number; correct: number; wrongByQuestion: Record<string, number>; today: string; todayGroups: number };
type Graded = { correct: boolean; submitted: string };
type Mode = "practice" | "review";
type Screen = "question" | "summary";

const bank = (rawBank as { tasks: Task[] }).tasks;
const STORAGE_KEY = "toefl-cobalt-signal-progress-v2";
const todayKey = () => new Date().toLocaleDateString("en-CA");
const blankProgress = (): StoredProgress => ({ attempted: 0, correct: 0, wrongByQuestion: {}, today: todayKey(), todayGroups: 0 });
const readProgress = (): StoredProgress => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : {};
    const base = { ...blankProgress(), ...saved, wrongByQuestion: saved.wrongByQuestion ?? {} };
    return base.today === todayKey() ? base : { ...base, today: todayKey(), todayGroups: 0 };
  } catch { return blankProgress(); }
};
const gapsOf = (task: Task) => Array.from(task.gapped_passage.matchAll(/_+/g)).map((m, i) => {
  const prefix = task.gapped_passage.slice(0, m.index).match(/([A-Za-z]+)$/)?.[1] ?? "";
  const answer = task.answer_key[i]?.answer ?? "";
  return { number: i + 1, prefix, expected: answer.slice(prefix.length), answer, kind: task.answer_key[i]?.kind ?? "support", rawLength: m[0].length, rawIndex: m.index ?? 0 };
});
const sentenceBounds = (text: string, startAt: number, endAt: number) => {
  const starts = [text.lastIndexOf(".", startAt - 1), text.lastIndexOf("!", startAt - 1), text.lastIndexOf("?", startAt - 1)];
  const start = Math.max(...starts) + 1;
  const tail = text.slice(endAt);
  const match = tail.match(/[.!?](?=\s|$)/);
  const end = match?.index === undefined ? text.length : endAt + match.index + 1;
  return { start, end };
};
const makeQuestions = (): Question[] => bank.flatMap(task => {
  const gaps = gapsOf(task);
  let shift = 0;
  return gaps.flatMap((gap, index) => {
    const fullGapStart = gap.rawIndex + shift;
    shift += gap.expected.length - gap.rawLength;
    if (gap.kind !== "target" || !gap.answer) return [];
    const wordStart = fullGapStart - gap.prefix.length;
    const wordEnd = wordStart + gap.answer.length;
    const bounds = sentenceBounds(task.full_passage, wordStart, wordEnd);
    return [{
      id: `${task.task_id}-${gap.number}`,
      sourceTaskId: task.task_id,
      topic: task.topic_anchor,
      before: task.full_passage.slice(bounds.start, wordStart).trimStart(),
      prefix: gap.prefix,
      expected: gap.expected,
      answer: gap.answer,
      after: task.full_passage.slice(wordEnd, bounds.end),
    }];
  });
});
const questions = makeQuestions();
const questionById = new Map(questions.map(question => [question.id, question]));
const makeRound = (progress: StoredProgress, seed: number) => {
  const priority = Object.entries(progress.wrongByQuestion).filter(([, weight]) => weight > 0).sort((a, b) => b[1] - a[1]).map(([id]) => id).filter(id => questionById.has(id));
  const offset = (seed * 10) % questions.length;
  const fresh = [...questions.slice(offset), ...questions.slice(0, offset)].map(question => question.id).filter(id => !priority.includes(id));
  return [...priority, ...fresh].slice(0, 10).map(id => questionById.get(id)!).filter(Boolean);
};
const normalizeInput = (value: string, question: Question) => {
  const letters = value.replace(/[^a-zA-Z]/g, "").slice(0, question.expected.length);
  return question.answer === question.answer.toUpperCase() ? letters.toUpperCase() : letters.toLowerCase();
};

function SignalMark() { return <span className="brand-mark" aria-label="TOEFL WORD LAB signal gap-grid mark"><img src="/manus-storage/cobalt-signal-mark_eba43549.png" alt=""/><i/><i/><i/></span>; }

export default function Home() {
  const [progress, setProgress] = useState<StoredProgress>(() => readProgress());
  const [seed, setSeed] = useState(0);
  const [mode, setMode] = useState<Mode>("practice");
  const [screen, setScreen] = useState<Screen>("question");
  const [session, setSession] = useState<Question[]>(() => makeRound(readProgress(), 0));
  const [active, setActive] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, Graded>>({});
  const [roundCounted, setRoundCounted] = useState(false);

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }, [progress]);
  const question = session[active];
  const result = question ? results[question.id] : undefined;
  const attemptedThisRound = Object.keys(results).length;
  const wrongThisRound = session.filter(item => results[item.id] && !results[item.id].correct);
  const reviewCount = Object.values(progress.wrongByQuestion).filter(weight => weight > 0).length;
  const accuracy = progress.attempted ? Math.round(progress.correct / progress.attempted * 100) : 0;

  const resetToNewRound = () => {
    const nextSeed = seed + 1;
    setSeed(nextSeed); setMode("practice"); setScreen("question"); setSession(makeRound(progress, nextSeed)); setActive(0); setDrafts({}); setResults({}); setRoundCounted(false);
  };
  const grade = () => {
    if (!question || result) return;
    const submitted = drafts[question.id] ?? "";
    const correct = submitted.toLowerCase() === question.expected.toLowerCase();
    setResults(previous => ({ ...previous, [question.id]: { correct, submitted } }));
    setProgress(previous => {
      const weights = { ...previous.wrongByQuestion };
      if (correct) { if (weights[question.id]) weights[question.id] = Math.max(0, weights[question.id] - 1); }
      else weights[question.id] = (weights[question.id] ?? 0) + 1;
      return { ...previous, attempted: previous.attempted + 1, correct: previous.correct + (correct ? 1 : 0), wrongByQuestion: weights };
    });
  };
  const nextQuestion = () => {
    if (active < session.length - 1) { setActive(index => index + 1); return; }
    if (mode === "practice" && !roundCounted) {
      setRoundCounted(true);
      setProgress(previous => ({ ...previous, today: todayKey(), todayGroups: previous.today === todayKey() ? previous.todayGroups + 1 : 1 }));
    }
    setScreen("summary");
  };
  const startReview = () => {
    if (!wrongThisRound.length) { resetToNewRound(); return; }
    setMode("review"); setScreen("question"); setSession(wrongThisRound); setActive(0); setDrafts({}); setResults({});
  };
  if (!question && screen === "question") return null;

  return <div className="signal-app single-app">
    <header className="signal-header"><a href="#top" className="signal-brand"><SignalMark/><span><b>TOEFL</b> // WORD<span>LAB</span></span></a><div className="header-meta"><span><Flame size={15}/> {mode === "review" ? "MISTAKE REVIEW" : "REVIEW FIRST"}</span><span className="header-divider"/><b>DAY {String(progress.todayGroups).padStart(2, "0")} / 02</b></div><button onClick={resetToNewRound} className="signal-button ghost"><RefreshCw size={16}/> NEW ROUND</button></header>
    <main id="top">
      <section className="signal-hero compact-hero"><img src="/manus-storage/cobalt-signal-hero_175d1730.png" alt="抽象字彙訊號網格"/><div className="hero-shade"/><div className="lexicon-grid" aria-hidden="true"><span>_</span><span>A</span><span>_</span><span>R</span><span>_</span><span>G</span></div><div className="hero-content"><p className="signal-kicker">TOEFL iBT 2026 · COMPLETE THE WORDS</p><h1>One sentence.<br/><em>One signal.</em></h1><p>每次練一個完整句子與一個單字拼寫；錯題會成為下一輪的起點。</p><div className="hero-readout"><strong>521</strong><span>TARGET WORDS / 10 QUESTIONS PER ROUND</span><i/></div></div><div className="signal-orbit"><span/><span/><b>{screen === "question" ? String(active + 1).padStart(2, "0") : "OK"}</b></div></section>
      <section className="signal-shell single-shell">
        {screen === "question" ? <>
          <div className="dashboard-bar"><div><p className="signal-kicker">{mode === "review" ? "MISTAKE SPELLING REVIEW" : "ROUND WORKSHEET"}</p><h2>{mode === "review" ? "Review" : "Round"} <span>{String(seed + 1).padStart(2, "0")}</span> <small>· {attemptedThisRound}/{session.length} answered</small></h2></div><div className="session-tabs">{session.map((item, index) => <button key={item.id} onClick={() => setActive(index)} className={`${index === active ? "is-active" : ""} ${results[item.id] ? (results[item.id].correct ? "is-done" : "is-missed") : ""}`} aria-label={`第 ${index + 1} 題`}>{String(index + 1).padStart(2, "0")}</button>)}</div></div>
          <div className="signal-workspace single-workspace">
            <section className="question-stage single-stage">
              <div className="stage-topline"><div><span className="stage-number">{String(active + 1).padStart(2, "0")}</span><span className="stage-topic">{question.topic}</span></div><span className={`stage-state ${result ? "ready" : ""}`}>{result ? (result.correct ? "SIGNAL CONFIRMED" : "REVIEW SAVED") : "AWAITING INPUT"}</span></div>
              <div className="instruction"><Target size={17}/><span>讀完整句子後，只補上缺失字母；不需要重打字首。</span></div>
              <p className="single-sentence"><span>{question.before}</span><span className="signal-word"><span className="word-prefix">{question.prefix}</span><span className="signal-gap-wrap"><input value={drafts[question.id] ?? ""} maxLength={question.expected.length} spellCheck={false} autoCapitalize="none" disabled={Boolean(result)} onChange={event => setDrafts(previous => ({ ...previous, [question.id]: normalizeInput(event.target.value, question) }))} onKeyDown={event => { if (event.key === "Enter") result ? nextQuestion() : grade(); }} style={{ width: `${Math.max(46, question.expected.length * 18 + 20)}px` }} className={`signal-gap ${result ? (result.correct ? "ok" : "no") : ""} ${question.answer === question.answer.toUpperCase() ? "is-caps" : ""}`} aria-label={`第 ${active + 1} 題，字首 ${question.prefix}`}/>{result && !result.correct && <span className="correction">{question.expected}</span>}</span></span><span>{question.after}</span></p>
              <div className="spelling-line"><span>TYPE THE MISSING LETTERS</span><b>{question.prefix}</b><i>{"_".repeat(Math.max(question.expected.length, 3))}</i><small>ENTER TO {result ? "CONTINUE" : "CHECK"}</small></div>
              {result && <div className={`grade-banner ${result.correct ? "win" : ""}`}>{result.correct ? <CheckCircle2 size={18}/> : <XCircle size={18}/>}<span>{result.correct ? "正確。這個單字會降低後續複習權重。" : <>正解是 <b>{question.answer}</b>。已加入錯題本，下一輪會更常出現。</>}</span></div>}
              <div className="stage-actions"><div className="input-hint"><CircleHelp size={15}/><span>COMPLETE THE WORD · ONE SENTENCE AT A TIME</span></div><div className="action-buttons">{!result ? <button onClick={grade} className="signal-button primary"><ClipboardCheck size={17}/> CHECK SIGNAL</button> : <button onClick={nextQuestion} className="signal-button primary">{active === session.length - 1 ? "FINISH ROUND" : "NEXT QUESTION"}<ArrowRight size={17}/></button>}</div></div>
              <div className="target-line"><span>TARGET WORD</span><p>{question.answer}</p></div>
            </section>
            <aside className="data-tower"><img src="/manus-storage/cobalt-signal-progress_2580d5ad.png" alt="抽象學習進度訊號"/><div className="tower-overlay"/><div className="tower-content"><p className="signal-kicker">LIVE METRICS</p><div className="tower-score"><span>{accuracy}%</span><small>ACCURACY</small></div><Metric label="ANSWERED" value={String(progress.attempted).padStart(3, "0")}/><Metric label="REVIEW WORDS" value={String(reviewCount).padStart(2, "0")}/><Metric label="TODAY" value={`${progress.todayGroups}/2`}/><div className="tower-rule"/><p className="tower-copy">錯題會在下一輪優先出現，直到連續答對為止。</p></div></aside>
          </div>
        </> : <RoundSummary mode={mode} total={session.length} wrong={wrongThisRound.length} onReview={startReview} onNext={resetToNewRound}/>} 
        <div className="signal-bottom"><div className="feature-block blue"><img src="/manus-storage/cobalt-signal-quiz_5a1d2f55.png" alt="抽象學習信號"/><div><p className="signal-kicker">ONE RULE</p><h3>Read wide.<br/><em>Spell precise.</em></h3></div></div><div className="feature-block white"><Gauge size={30}/><p className="signal-kicker">METHOD</p><h3>先讀完一整句，<br/>再完成一個單字。</h3><span>LOCAL PROGRESS · NO ACCOUNT REQUIRED</span></div></div>
      </section>
    </main><footer className="signal-footer"><span>WORDLAB / SINGLE WORD SPELLING</span><span>521 TARGET WORDS</span><span>LOCAL BROWSER MEMORY</span></footer>
  </div>;
}
function RoundSummary({ mode, total, wrong, onReview, onNext }: { mode: Mode; total: number; wrong: number; onReview: () => void; onNext: () => void }) { const clean = wrong === 0; return <section className="round-summary"><div className="summary-grid"><div><p className="signal-kicker">{mode === "review" ? "REVIEW COMPLETE" : "ROUND COMPLETE"}</p><h2>{clean ? <>Clean <em>signal.</em></> : <>Keep the <em>misses.</em></>}</h2><p>{clean ? "本輪每一題都已完成。可以直接開啟下一輪的新題。" : `本輪 ${total} 題中有 ${wrong} 題需要再看一次。錯題會以相同的「完整句子＋單字拼寫」形式逐題重練。`}</p></div><div className="summary-number"><strong>{total - wrong}/{total}</strong><span>ROUND SCORE</span></div></div><div className="summary-actions">{!clean && mode === "practice" && <button className="signal-button primary" onClick={onReview}><RotateCcw size={17}/> REVIEW MISSED WORDS</button>}<button className="signal-button next" onClick={onNext}><RefreshCw size={16}/> START NEXT ROUND</button></div></section> }
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric"><span>{label}</span><b>{value}</b></div>; }
