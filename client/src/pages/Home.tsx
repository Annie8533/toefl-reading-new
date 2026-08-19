/** Design philosophy: Cobalt Signal Console—鈷藍、訊號黃、幾何資料軌跡；以全寬考題舞台取代紙本講義。 */
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleHelp, ClipboardCheck, Flame, Gauge, RefreshCw, Target, Trophy, XCircle } from "lucide-react";
import rawBank from "@/data/completeWordsBank.json";

type Answer = { number: number; answer: string; kind: "target" | "support"; target: string };
type TargetWord = { global_id: number; word: string; pos?: string };
type Task = { task_id: number; topic_anchor: string; target_words: TargetWord[]; full_passage: string; gapped_passage: string; answer_key: Answer[] };
type StoredProgress = { attempted: number; correct: number; wrongByTask: Record<string, number>; today: string; todayGroups: number };
type GradedResult = { correct: Record<number, boolean>; score: number };

const bank = (rawBank as { tasks: Task[] }).tasks;
const STORAGE_KEY = "toefl-cobalt-signal-progress-v1";
const todayKey = () => new Date().toLocaleDateString("en-CA");
const blankProgress = (): StoredProgress => ({ attempted: 0, correct: 0, wrongByTask: {}, today: todayKey(), todayGroups: 0 });
const readProgress = () => { try { const saved = localStorage.getItem(STORAGE_KEY); const parsed = saved ? JSON.parse(saved) as StoredProgress : blankProgress(); return parsed.today === todayKey() ? parsed : { ...parsed, today: todayKey(), todayGroups: 0 }; } catch { return blankProgress(); } };
const gapsOf = (task: Task) => Array.from(task.gapped_passage.matchAll(/_+/g)).map((m, i) => { const prefix = task.gapped_passage.slice(0, m.index).match(/([A-Za-z]+)$/)?.[1] ?? ""; const full = task.answer_key[i]?.answer ?? ""; return { number: i + 1, prefix, expected: full.slice(prefix.length), answer: full, kind: task.answer_key[i]?.kind ?? "support" }; });
const makeSession = (progress: StoredProgress, seed: number) => { const map = new Map(bank.map(x => [x.task_id, x])); const review = Object.entries(progress.wrongByTask).filter(([,w]) => w > 0).sort((a,b) => b[1] - a[1]).map(([id]) => +id).filter(id => map.has(id)); const offset = (seed * 10) % bank.length; const rest = [...bank.slice(offset), ...bank.slice(0, offset)].map(x => x.task_id).filter(id => !review.includes(id)); return [...review, ...rest].slice(0, 10).map(id => map.get(id)!); };

function SignalMark() { return <span className="brand-mark" aria-label="TOEFL WORD LAB signal gap-grid mark"><img src="/manus-storage/cobalt-signal-mark_eba43549.png" alt=""/><i/><i/><i/></span>; }

export default function Home() {
  const [progress, setProgress] = useState<StoredProgress>(() => readProgress());
  const [seed, setSeed] = useState(0);
  const [session, setSession] = useState<Task[]>(() => makeSession(readProgress(), 0));
  const [active, setActive] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Record<number,string>>>({});
  const [results, setResults] = useState<Record<number, GradedResult>>({});
  const [counted, setCounted] = useState<number[]>([]);
  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); }, [progress]);

  const task = session[active];
  const gaps = useMemo(() => task ? gapsOf(task) : [], [task]);
  const current = task ? answers[task.task_id] ?? {} : {};
  const result = task ? results[task.task_id] : undefined;
  const solved = Object.keys(results).length;
  const reviewCount = Object.values(progress.wrongByTask).filter(w => w > 0).length;
  const accuracy = progress.attempted ? Math.round(progress.correct / progress.attempted * 100) : 0;

  const newRound = () => { const next = seed + 1; setSeed(next); setSession(makeSession(progress, next)); setActive(0); setAnswers({}); setResults({}); setCounted([]); };
  const update = (id:number, value:string, len:number, allCaps:boolean) => { if (!task) return; const letters = value.replace(/[^a-zA-Z]/g, "").slice(0,len); const normalized = allCaps ? letters.toUpperCase() : letters.toLowerCase(); setAnswers(prev => ({...prev, [task.task_id]: {...prev[task.task_id], [id]: normalized}})); if (results[task.task_id]) setResults(prev => { const next = {...prev}; delete next[task.task_id]; return next; }); };
  const grade = () => { if (!task) return; const correct: Record<number,boolean> = {}; gaps.forEach(g => correct[g.number] = (current[g.number] ?? "").toLowerCase() === g.expected.toLowerCase()); const score = Object.values(correct).filter(Boolean).length; setResults(prev => ({...prev, [task.task_id]: {correct, score}})); if (!counted.includes(task.task_id)) { setCounted(prev => [...prev, task.task_id]); setProgress(prev => { const missed = gaps.length-score; const weights={...prev.wrongByTask}; if(missed) weights[task.task_id]=(weights[task.task_id]??0)+missed; else if(weights[task.task_id]) weights[task.task_id]=Math.max(0,weights[task.task_id]-2); return {...prev,attempted:prev.attempted+gaps.length,correct:prev.correct+score,wrongByTask:weights,today:todayKey(),todayGroups:prev.today===todayKey()?prev.todayGroups+1:1}; }); } };
  if(!task) return null;
  const pieces = task.gapped_passage.split(/(_+)/g);
  const renderPassage = () => { const nodes: React.ReactNode[] = []; let gapIndex = 0; for (let index = 0; index < pieces.length; index += 1) { const piece = pieces[index]; const nextIsGap = /^_+$/.test(pieces[index + 1] ?? ""); if (/^_+$/.test(piece)) continue; if (nextIsGap) { const split = piece.match(/^(.*?)([A-Za-z]+)$/); const g = gaps[gapIndex++]; if (split && g) { const [ , before, prefix ] = split; if (before) nodes.push(<span key={`text-${index}`}>{before}</span>); const allCaps = g.answer === g.answer.toUpperCase(); const state = result ? (result.correct[g.number] ? "ok" : "no") : ""; nodes.push(<span className="signal-word" key={`word-${g.number}`}><span className="word-prefix">{prefix}</span><span className="signal-gap-wrap"><input value={current[g.number] ?? ""} maxLength={g.expected.length} spellCheck={false} autoCapitalize="none" onChange={e=>update(g.number,e.target.value,g.expected.length,allCaps)} onKeyDown={e=>{if(e.key==="Enter") grade();}} style={{width:`${Math.max(34,g.expected.length*13+18)}px`}} className={`signal-gap ${state} ${allCaps ? "is-caps" : ""}`} aria-label={`第 ${g.number} 空，字首 ${prefix}`}/>{result && !result.correct[g.number] && <span className="correction">{g.expected}</span>}</span></span>); index += 1; continue; } } nodes.push(<span key={`text-${index}`}>{piece}</span>); } return nodes; };
  return <div className="signal-app">
    <header className="signal-header"><a href="#top" className="signal-brand"><SignalMark/><span><b>TOEFL</b> // WORD<span>LAB</span></span></a><div className="header-meta"><span><Flame size={15}/> REVIEW SIGNAL ON</span><span className="header-divider"/><b>DAY {String(progress.todayGroups).padStart(2,"0")} / 02</b></div><button onClick={newRound} className="signal-button ghost"><RefreshCw size={16}/> NEW ROUND</button></header>
    <main id="top">
      <section className="signal-hero"><img src="/manus-storage/cobalt-signal-hero_175d1730.png" alt="抽象字彙訊號網格"/><div className="hero-shade"/><div className="lexicon-grid" aria-hidden="true"><span>_</span><span>A</span><span>_</span><span>R</span><span>_</span><span>G</span></div><div className="hero-content"><p className="signal-kicker">TOEFL iBT 2026 · COMPLETE THE WORDS</p><h1>Complete the <em>signal.</em></h1><p>84 組段落題，讓字首、詞性與上下文一起完成你的答案。</p><div className="hero-readout"><strong>840</strong><span>GAPS / 521 TARGET WORDS</span><i/></div></div><div className="signal-orbit"><span/><span/><b>{String(active+1).padStart(2,"0")}</b></div></section>
      <section className="signal-shell">
        <div className="dashboard-bar"><div><p className="signal-kicker">SESSION MAP</p><h2>Round <span>{String(seed+1).padStart(2,"0")}</span> <small>· {solved}/10 solved</small></h2></div><div className="session-tabs">{session.map((item,i)=><button key={item.task_id} onClick={()=>setActive(i)} className={`${i===active?"is-active":""} ${results[item.task_id]?"is-done":""}`} aria-label={`第 ${i+1} 組`}>{String(i+1).padStart(2,"0")}</button>)}</div></div>
        <div className="signal-workspace">
          <section className="question-stage">
            <div className="stage-topline"><div><span className="stage-number">{String(active+1).padStart(2,"0")}</span><span className="stage-topic">{task.topic_anchor}</span></div><span className={`stage-state ${result?"ready":""}`}>{result?`${result.score}/10 CHECKED`:"AWAITING INPUT"}</span></div>
            <div className="instruction"><Target size={17}/><span>將每一格補成完整字。只輸入缺失的字母，不需重打可見字首。</span></div>
            <p className="signal-passage">{renderPassage()}</p>
            <div className="stage-actions"><div className="input-hint"><CircleHelp size={15}/><span>ENTER 提交 · 10 GAPS PER SET</span></div><div className="action-buttons"><button onClick={grade} className="signal-button primary"><ClipboardCheck size={17}/> CHECK SIGNAL</button>{result && active<9 && <button onClick={()=>setActive(a=>a+1)} className="signal-button next">NEXT <ArrowRight size={17}/></button>}</div></div>
            {result && <div className={`grade-banner ${result.score===10?"win":""}`}>{result.score===10?<CheckCircle2 size={18}/>:<XCircle size={18}/>}<span>{result.score===10?"CLEAN SIGNAL — this task is now lower priority in review mode.":`SIGNAL RECORDED — ${10-result.score} gaps added to review weight.`}</span></div>}
            <div className="target-line"><span>TARGET LEXICON</span><p>{task.target_words.map(x=>x.word).join("  /  ")}</p></div>
          </section>
          <aside className="data-tower"><img src="/manus-storage/cobalt-signal-progress_2580d5ad.png" alt="抽象學習進度訊號"/><div className="tower-overlay"/><div className="tower-content"><p className="signal-kicker">LIVE METRICS</p><div className="tower-score"><span>{accuracy}%</span><small>ACCURACY</small></div><Metric label="ATTEMPTS" value={String(progress.attempted).padStart(3,"0")}/><Metric label="REVIEW SETS" value={String(reviewCount).padStart(2,"0")}/><Metric label="TODAY" value={`${progress.todayGroups}/2`}/><div className="tower-rule"/><p className="tower-copy">錯誤題組會自動提高下一輪的出現權重。</p></div></aside>
        </div>
        <div className="signal-bottom"><div className="feature-block blue"><img src="/manus-storage/cobalt-signal-quiz_5a1d2f55.png" alt="抽象學習信號"/><div><p className="signal-kicker">ONE RULE</p><h3>Read wide.<br/><em>Answer precise.</em></h3></div></div><div className="feature-block white"><Gauge size={30}/><p className="signal-kicker">METHOD</p><h3>先用段落鎖定詞義，<br/>再用字首完成拼字。</h3><span>LOCAL PROGRESS · NO ACCOUNT REQUIRED</span></div></div>
      </section>
    </main><footer className="signal-footer"><span>WORDLAB / COMPLETE THE WORDS</span><span>84 SETS · 840 GAPS</span><span>LOCAL BROWSER MEMORY</span></footer>
  </div>;
}
function Metric({label,value}:{label:string;value:string}){return <div className="metric"><span>{label}</span><b>{value}</b></div>}
