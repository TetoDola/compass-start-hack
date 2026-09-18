import { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, Compass, FileText, RefreshCw } from 'lucide-react';
import { advisorFacts, answerFromIds, routeQuestion, type AdvisorAnswer } from './lib/advisor';
import type { Analysis, Evidence } from './lib/types';
import type { MarketContext } from './lib/briefing';

interface Turn { question: string; answer: AdvisorAnswer }
export function AdvisorChat({ analysis, context, phase, onWorkspace, onEvidence, onNews, onRefresh }: {
  analysis: Analysis; context?: MarketContext; phase: string; onWorkspace: () => void; onEvidence: (e: Evidence) => void; onNews: (id: string,name: string) => void; onRefresh: () => void;
}) {
  const [turns,setTurns] = useState<Turn[]>([]), [input,setInput] = useState(''), [busy,setBusy] = useState(false);
  const [expanded,setExpanded] = useState(false);
  const end = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null);
  useEffect(()=>()=>controller.current?.abort(),[]);
  useEffect(()=>{ if(turns.length) end.current?.scrollIntoView({behavior:'smooth',block:'end'}); },[turns,busy]);
  const facts = advisorFacts(analysis,context);
  const hasEvent = facts.find(f=>f.id==='events')?.articles?.length;
  const initial = answerFromIds([...(hasEvent ? ['events'] : []),'attention','performance:1M','customer'],facts);
  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setInput(''); setBusy(true); setExpanded(false);
    const abort = new AbortController(); controller.current=abort;
    const previousQuestions=turns.slice(-4).map(t=>t.question);
    const local = routeQuestion(question,facts,previousQuestions);
    let answer=answerFromIds(local,facts);
    try {
      const response=await fetch('/api/advisor',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.any([abort.signal,AbortSignal.timeout(20000)]),body:JSON.stringify({question,previousQuestions,candidates:facts.map(f=>({id:f.id,title:f.title,text:f.text})),fallback:local})});
      if(response.ok) { const result=await response.json(); if(Array.isArray(result.ids) && result.ids.length<=5 && result.ids.every((id: string)=>facts.some(f=>f.id===id))) answer=answerFromIds(result.ids,facts,result.mode); }
    } catch { /* The local grounded answer remains available without an AI connection. */ }
    if(abort.signal.aborted) return;
    setTurns(old=>[...old,{question,answer}]);setBusy(false);
  }
  function renderAnswer(answer: AdvisorAnswer, compact=false) {
    return <div className="chat-answer">{answer.blocks.map(block=><section key={block.id}><h3>{block.title}</h3>{(compact && block.id==='attention' && !expanded ? block.text.slice(0,2) : block.text).map((p,i)=><p key={i}>{p}</p>)}{compact && block.id==='attention' && block.text.length>2 && <button className="text-button" onClick={()=>setExpanded(!expanded)}>{expanded?'Show top two':'Show more priorities'}</button>}{block.rows && <div className="chat-fact-rows">{block.rows.map((r,i)=><div key={i}><span>{r.name}</span><strong>{r.value}</strong>{r.newsId && <button onClick={()=>onNews(r.newsId!,r.name)}>News ↗</button>}</div>)}</div>}{block.articles?.map(article=><a className="chat-article" key={article.id} href={article.url} target="_blank" rel="noreferrer">{article.title}<small>{article.source} ↗</small></a>)}{block.evidence.length>0 && <details className="chat-sources"><summary><FileText size={12}/>{new Set(block.evidence.map(e=>e.id)).size} sources</summary>{[...new Map(block.evidence.map(e=>[e.id,e])).values()].map(e=><button key={e.id} onClick={()=>onEvidence(e)}>{e.title} ↗</button>)}</details>}</section>)}<span className="chat-answer-mode">{answer.mode} · {analysis.customer.ClientRef} · {analysis.scope==='all'?'All supplied portfolios':analysis.portfolios[0]?.PortfolioNr}</span></div>;
  }
  return <div className="advisor-chat"><div className="chat-heading"><div><span className="eyebrow">YOUR ADVISER COPILOT</span><h2>Start with the brief. Ask what matters.</h2><p>Answers stay within this customer and the selected portfolio.</p></div><button className="button secondary" onClick={onWorkspace}>Open portfolio workspace <ArrowUpRight size={14}/></button></div>
    <div className="chat-quick-actions">{['Prepare my briefing','What is wrong with this portfolio?','How has it performed over 1 year?','Exposure by country and industry','Any bankruptcy or material news?'].map(q=><button disabled={busy} key={q} onClick={()=>ask(q)}>{q}</button>)}</div>
    <div className="chat-thread" aria-live="polite"><article className="assistant-turn"><div className="chat-speaker"><Compass size={17}/><strong>Compass</strong><span>Customer briefing</span></div>{renderAnswer(initial,true)}<div className="chat-brief-footer"><button className="text-button" onClick={onWorkspace}>Full briefing, positions & graph ↗</button><button className="text-button" disabled={!!phase} onClick={onRefresh}><RefreshCw size={12}/>{phase ? 'Checking news…' : 'Refresh sources'}</button></div>{phase && <p className="chat-progress" role="status">{phase}</p>}</article>
      {turns.map((t,i)=><div key={i}><div className="user-turn">{t.question}</div><article className="assistant-turn"><div className="chat-speaker"><Compass size={17}/><strong>Compass</strong></div>{renderAnswer(t.answer)}</article></div>)}{busy && <div className="chat-thinking" role="status">Checking the customer’s records…</div>}</div>
    <form className="chat-composer" onSubmit={e=>{e.preventDefault();void ask(input);}}><label className="visually-hidden" htmlFor="advisor-question">Ask about this customer</label><textarea id="advisor-question" value={input} onChange={e=>setInput(e.target.value)} rows={2} maxLength={1200} placeholder="Ask about performance, risks, a company, or the next conversation…" onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void ask(input);}}}/><button className="send-question" type="submit" disabled={busy||!input.trim()} aria-label="Send question"><ArrowUp size={19}/></button><p>Source-backed answers. Missing data stays unknown. Responses prepare adviser review; no trades are executed.</p></form><div ref={end}/>
  </div>;
}
