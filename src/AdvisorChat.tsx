import { useEffect, useId, useRef, useState } from 'react';
import { ArrowUp, ArrowUpRight, Compass, FileText, RefreshCw, Minus } from 'lucide-react';
import { advisorFacts, answerFromIds, routeQuestion, type AdvisorAnswer } from './lib/advisor';
import type { Analysis, Evidence } from './lib/types';
import type { MarketContext } from './lib/briefing';
import './advisor-chat.css';

interface Turn { question: string; answer: AdvisorAnswer }
export function AdvisorChat({ analysis, context, phase, onWorkspace, onEvidence, onNews, onRefresh, compact = false, onClose, draft }: {
  analysis: Analysis; context?: MarketContext; phase: string; onWorkspace: () => void; onEvidence: (e: Evidence) => void; onNews: (id: string, name: string) => void; onRefresh: () => void; compact?: boolean; onClose?: () => void; draft?: { text: string; id: number };
}) {
  const [turns, setTurns] = useState<Turn[]>([]), [input, setInput] = useState(''), [busy, setBusy] = useState(false);

  const [expanded, setExpanded] = useState(false);
  const end = useRef<HTMLDivElement>(null), thread = useRef<HTMLDivElement>(null), controller = useRef<AbortController | null>(null);
  const questionId = useId();
  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    setTurns([]); setInput(''); setBusy(false); setExpanded(false);
    return () => controller.current?.abort();
  }, [analysis.customer.ClientId, analysis.scope]);
  useEffect(()=>{if(draft)setInput(draft.text);},[draft]);
  useEffect(() => {
    if (!turns.length && !busy) return;
    if (compact) thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'smooth' });
    else end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, busy, compact]);
  const facts = advisorFacts(analysis, context);
  const hasEvent = facts.find(f => f.id === 'events')?.articles?.length;
  const initial = answerFromIds([...(hasEvent ? ['events'] : []), 'attention', 'performance:1M', 'customer'], facts);
  const suggestions = compact ? [
    { label: 'What needs attention?', question: 'What needs attention in this portfolio?' },
    { label: 'Explain performance', question: 'How has this portfolio performed over 1 month?' },
    { label: 'Where are we exposed?', question: 'Show exposure by country and industry' },
  ] : ['Prepare my briefing', 'What is wrong with this portfolio?', 'How has it performed over 1 year?', 'Exposure by country and industry', 'Any bankruptcy or material news?'].map(question => ({ label: question, question }));

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setInput(''); setBusy(true); setExpanded(false);
    const abort = new AbortController(); controller.current = abort;
    const previousQuestions = turns.slice(-4).map(t => t.question);
    const local = routeQuestion(question, facts, previousQuestions);
    let answer = answerFromIds(local, facts,'Local records · AI refinement pending');
    const turnIndex=turns.length;
    setTurns(old=>[...old,{question,answer}]);
    try {
      const response = await fetch('/api/advisor', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.any([abort.signal, AbortSignal.timeout(90000)]), body: JSON.stringify({ question, previousQuestions, candidates: facts.map(f => ({ id: f.id, title: f.title, text: f.text })), fallback: local }) });
      if (response.ok) { const result = await response.json(); if (Array.isArray(result.ids) && result.ids.length <= 5 && result.ids.every((id: string) => facts.some(f => f.id === id))) answer = answerFromIds(result.ids, facts, result.mode); }
    } catch { /* The local grounded answer remains available without an AI connection. */ }
    if (abort.signal.aborted) return;
    if(answer.mode.includes('pending'))answer={...answer,mode:'Local records · AI unavailable'};
    setTurns(old => old.map((t,i)=>i===turnIndex?{question,answer}:t)); setBusy(false);
  }

  function renderAnswer(answer: AdvisorAnswer, brief = false) {
    return <div className="chat-answer">
      {answer.blocks.map(block => <section key={block.id}>
        <h3>{block.title}</h3>
        {(brief && block.id === 'attention' && !expanded ? block.text.slice(0, 2) : block.text).map((p, i) => <p key={i}>{p}</p>)}
        {brief && block.id === 'attention' && block.text.length > 2 && <button className="text-button" onClick={() => setExpanded(!expanded)}>{expanded ? 'Show top two' : 'Show more priorities'}</button>}
        {block.rows && <div className="chat-fact-rows">{block.rows.map((r, i) => <div key={i}><span>{r.name}</span><strong>{r.value}</strong>{r.newsId && <button onClick={() => onNews(r.newsId!, r.name)}>News ↗</button>}</div>)}</div>}
        {block.articles?.map(article => <a className="chat-article" key={article.id} href={article.url} target="_blank" rel="noreferrer">{article.title}<small>{article.source} ↗</small></a>)}
        {block.evidence.length > 0 && <details className="chat-sources"><summary><FileText size={12} />{new Set(block.evidence.map(e => e.id)).size} sources</summary>{[...new Map(block.evidence.map(e => [e.id, e])).values()].map(e => <button key={e.id} onClick={() => onEvidence(e)}>{e.title} ↗</button>)}</details>}
      </section>)}
      <span className="chat-answer-mode">{answer.mode}{!compact && <> · {analysis.customer.ClientRef} · {analysis.scope === 'all' ? 'All supplied portfolios' : analysis.portfolios[0]?.PortfolioNr}</>}</span>
    </div>;
  }

  return <section className={`advisor-chat${compact ? ' advisor-chat--compact' : ''}`} aria-label="Ask Compass">
    <div className="chat-heading">
      {compact ? <div className="compact-chat-title"><span className="compact-chat-icon"><Compass size={18} /></span><div><h2>Ask Compass</h2><p>{analysis.customer.ClientRef} · {analysis.scope==='all'?'All portfolios':analysis.portfolios[0]?.PortfolioNr}</p></div>{onClose && <button className="ws-icon chat-minimize" aria-label="Minimize chat" onClick={onClose}><Minus size={20}/></button>}</div> : <><div><span className="eyebrow">YOUR ADVISER COPILOT</span><h2>Start with the brief. Ask what matters.</h2><p>Answers stay within this customer and the selected portfolio.</p></div><button className="button secondary" onClick={onWorkspace}>Open portfolio workspace <ArrowUpRight size={14} /></button></>}
    </div>
    <div className="chat-quick-actions" aria-label="Suggested questions">{suggestions.map(s => <button disabled={busy} key={s.question} onClick={() => void ask(s.question)}>{s.label}</button>)}</div>
    <div className="chat-thread" ref={thread} role="log" aria-live="polite" aria-label="Conversation with Compass" tabIndex={compact ? 0 : undefined}>
      {compact ? !turns.length && !busy && <div className="compact-chat-greeting"><p>Ask a question, or start with one above.</p><span>I can help with portfolio issues, performance, exposures and news.</span></div> : <article className="assistant-turn"><div className="chat-speaker"><Compass size={17} /><strong>Compass</strong><span>Customer briefing</span></div>{renderAnswer(initial, true)}<div className="chat-brief-footer"><button className="text-button" onClick={onWorkspace}>Full briefing, positions & graph ↗</button><button className="text-button" disabled={!!phase} onClick={onRefresh}><RefreshCw size={12} />{phase ? 'Checking news…' : 'Refresh sources'}</button></div>{phase && <p className="chat-progress" role="status">{phase}</p>}</article>}
      {turns.map((t, i) => <div className="chat-exchange" key={i}><div className="user-turn">{t.question}</div><article className="assistant-turn"><div className="chat-speaker"><Compass size={15} /><strong>Compass</strong></div>{renderAnswer(t.answer)}</article></div>)}
      {busy && <><div className="chat-thinking" role="status"><span className="chat-thinking-dot" />Refining the sourced answer with AI…</div></>}
    </div>
    <form className="chat-composer" onSubmit={e => { e.preventDefault(); void ask(input); }}>
      <label className="visually-hidden" htmlFor={questionId}>Ask about this customer</label>
      <textarea id={questionId} value={input} onChange={e => setInput(e.target.value)} rows={2} maxLength={1200} placeholder={compact ? 'Ask about this portfolio…' : 'Ask about performance, risks, a company, or the next conversation…'} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void ask(input); } }} />
      <button className="send-question" type="submit" disabled={busy || !input.trim()} aria-label="Send question"><ArrowUp size={19} /></button>
      <p>{compact ? 'Answers use this client’s available records and linked news.' : 'Source-backed answers. Missing data stays unknown. Responses prepare adviser review; no trades are executed.'}</p>
    </form>
    {!compact && <div ref={end} />}
  </section>;
}
