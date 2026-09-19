import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Mic, MicOff, Play, Send, Square, Volume2 } from 'lucide-react';
import { advisorFacts } from './lib/advisor';
import { periodPerformance } from './lib/portfolio';
import type { MarketContext } from './lib/briefing';
import type { Analysis, Row } from './lib/types';
import { clientName, list, redact } from './lib/format';
import './live-call.css';

type Role = 'advisor' | 'client';
type Turn = { role: Role; text: string; at: number };
type Card = { title: string; guidance: string; question: string; evidenceIds: string[]; source: string };
type Fact = { id: string; title: string; text: string; source: string };
type Readiness = { deepgram: boolean; elevenlabs: boolean; elevenlabsIssue?: string; customVoice?: boolean; m3: boolean };
type DemoVoice = 'default' | 'rachel' | 'george' | 'adam';

function advisorReady(text: string) {
  const words = text.trim().split(/\s+/);
  return words.length >= 5 && !(/\b(let me|give me|one moment|just a moment|hold on|bear with me|i(?:'m| am) (?:checking|thinking|looking)|i(?:'ll| will) (?:check|look))\b/i.test(text) && words.length < 20);
}

function defaultScenario(analysis: Analysis) {
  const movement = periodPerformance(analysis, '1M');
  if (movement.available && movement.change != null && movement.change < 0) {
    return `You are the client, upset that your latest recorded portfolio value fell ${Math.abs(movement.change * 100).toFixed(1)}% over one month. You do not know whether markets, cash flows, or something else caused it. Open by asking the adviser why the value is down. Ask a pointed follow-up after each answer, and answer the adviser's questions from your own knowledge.`;
  }
  return 'You are the client, concerned about the latest portfolio statement and whether your money is on track. Open by asking the adviser to explain the portfolio status. Ask a natural follow-up after each answer, and answer the adviser’s questions from your own knowledge.';
}

export function LiveCall({ analysis, context, customers, onSelectCustomer, onSelectScope, onClose }: { analysis: Analysis; context?: MarketContext; customers: Row[]; onSelectCustomer: (id: number) => void; onSelectScope: (scope: string) => void; onClose: () => void }) {
  const [readiness, setReadiness] = useState<Readiness>();
  const [status, setStatus] = useState('Ready to start');
  const [active, setActive] = useState(false);
  const [docked, setDocked] = useState(false);
  const [sessionLabel, setSessionLabel] = useState('');
  const [logId, setLogId] = useState('');
  const [micOn, setMicOn] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [clientThinking, setClientThinking] = useState(false);
  const [autoReply, setAutoReply] = useState(true);
  const [scenario, setScenario] = useState(() => defaultScenario(analysis));
  const [manualLine, setManualLine] = useState('');
  const [voice, setVoice] = useState<DemoVoice>('default');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [partials, setPartials] = useState<Record<Role, string>>({ advisor: '', client: '' });
  const [answerHistory, setAnswerHistory] = useState<{ at: number; cards: Card[] }[]>([]);
  const [liveEvidence, setLiveEvidence] = useState<Fact[]>([]);
  const [callFacts, setCallFacts] = useState<Fact[]>([]);
  const [cardMode, setCardMode] = useState('');
  const socketRef = useRef<WebSocket | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micContextRef = useRef<AudioContext | null>(null);
  const voiceContextRef = useRef<AudioContext | null>(null);
  const voiceSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceTimerRef = useRef<number | null>(null);
  const micResumeTimerRef = useRef<number | null>(null);
  const voiceAbortRef = useRef<AbortController | null>(null);
  const suppressAdvisorUntilRef = useRef(0);
  const advisorReplyTimerRef = useRef<number | null>(null);
  const autoReplyRef = useRef(autoReply);
  const scenarioRef = useRef(scenario);
  const voiceBusyRef = useRef(false);
  const clientThinkingRef = useRef(false);
  autoReplyRef.current = autoReply;
  scenarioRef.current = scenario;

  const facts = useMemo(() => {
    const blocks = advisorFacts(analysis, context)
      .filter(f => ['mandate', 'actions', 'policy', 'customer', 'attention', 'cash', 'positions', 'limits', 'events', 'performance:1M', 'performance:reported'].includes(f.id))
      .map(f => ({ id: f.id, title: f.title, text: [...f.text, ...(f.rows?.slice(0, 5).map(r => `${r.name}: ${r.value}`) || [])].join(' ').trim().slice(0, 1200), source: f.evidence[0]?.location || 'Compass client analysis' }))
      .filter(f => f.text);
    const notes = analysis.notes.slice(0, 4).map(note => typeof note.Note === 'string' ? redact(note.Note) : '').filter(Boolean);
    if (notes.length) blocks.push({ id: 'client-notes', title: 'Recorded client preferences and concerns', text: notes.join(' | ').slice(0, 1200), source: analysis.evidence.find(e => e.id === 'note-0')?.location || 'ClientNotes' });
    return blocks;
  }, [analysis, context]);

  useEffect(() => {
    if (!active) setScenario(defaultScenario(analysis));
  }, [analysis.customer.ClientId, analysis.scope]);

  useEffect(() => {
    let alive = true;
    fetch('/api/live-call/status').then(r => r.json()).then(data => { if (alive) { setReadiness(data); if (data.elevenlabsIssue) setStatus(data.elevenlabsIssue); } }).catch(() => { if (alive) setStatus('Live Call server unavailable'); });
    return () => { alive = false; releaseResources(); };
  }, []);

  function sendAudio(data: ArrayBuffer) {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return;
    const bytes = new Uint8Array(1 + data.byteLength);
    bytes[0] = 0;
    bytes.set(new Uint8Array(data), 1);
    socket.send(bytes);
  }

  async function startMicrophone() {
    const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    const audio = new AudioContext({ sampleRate: 16000 });
    if (audio.sampleRate !== 16000) { media.getTracks().forEach(t => t.stop()); await audio.close(); throw new Error('This browser did not provide 16 kHz audio. Use Chrome for the demo.'); }
    await audio.audioWorklet.addModule('/live-call-pcm-worklet.js');
    const source = audio.createMediaStreamSource(media);
    const capture = new AudioWorkletNode(audio, 'live-call-pcm-capture');
    const silent = audio.createGain(); silent.gain.value = 0;
    capture.port.onmessage = event => {
      if (performance.now() <= suppressAdvisorUntilRef.current) return;
      const packet = event.data as ArrayBuffer;
      const samples = new Int16Array(packet);
      let power = 0;
      for (let i = 0; i < samples.length; i += 8) power += samples[i] * samples[i];
      if (Math.sqrt(power / Math.ceil(samples.length / 8)) > 800) cancelScheduledReply();
      sendAudio(packet);
    };
    source.connect(capture); capture.connect(silent); silent.connect(audio.destination);
    await audio.resume();
    micStreamRef.current = media; micContextRef.current = audio; setMicOn(true);
  }

  function pauseMicrophone() {
    if (micResumeTimerRef.current != null) clearTimeout(micResumeTimerRef.current);
    micResumeTimerRef.current = null;
    suppressAdvisorUntilRef.current = Number.POSITIVE_INFINITY;
    micStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = false; });
    setMicOn(false);
  }

  function resumeMicrophone(delayMs: number, nextStatus = 'Listening') {
    if (micResumeTimerRef.current != null) clearTimeout(micResumeTimerRef.current);
    micResumeTimerRef.current = window.setTimeout(() => {
      micResumeTimerRef.current = null;
      if (socketRef.current?.readyState !== WebSocket.OPEN) return;
      micStreamRef.current?.getAudioTracks().forEach(track => { track.enabled = true; });
      // Discard a final worklet packet that may straddle the unmute boundary.
      suppressAdvisorUntilRef.current = performance.now() + 150;
      setMicOn(!!micStreamRef.current);
      voiceBusyRef.current = false; setVoiceBusy(false); setStatus(nextStatus);
    }, delayMs);
  }

  async function speak(text: string) {
    if (voiceBusyRef.current || !text.trim()) return;
    cancelScheduledReply();
    pauseMicrophone();
    voiceBusyRef.current = true; setVoiceBusy(true); setStatus('ElevenLabs is generating the client voice…');
    const abort = new AbortController();
    voiceAbortRef.current = abort;
    let playbackStarted = false;
    try {
      const response = await fetch('/api/live-call/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice }), signal: abort.signal });
      if (!response.ok) { const error = await response.json().catch(() => ({})); throw new Error(error.error || 'Client voice unavailable.'); }
      if (!response.body) throw new Error('Client voice stream unavailable.');
      const audio = new AudioContext({ sampleRate: 16000 });
      if (audio.sampleRate !== 16000) throw new Error('This browser did not provide 16 kHz audio.');
      voiceContextRef.current = audio;
      await audio.resume();
      let pending = new Uint8Array(0);
      let streamDone = false;
      let nextStart = 0;
      const finish = () => {
        if (voiceTimerRef.current != null) clearInterval(voiceTimerRef.current);
        voiceTimerRef.current = null;
        if (voiceContextRef.current !== audio) return;
        window.setTimeout(() => {
          if (voiceContextRef.current !== audio) return;
          socketRef.current?.send(JSON.stringify({ type: 'client-playback', status: 'end' }));
          setStatus('Clearing loudspeaker echo…');
          resumeMicrophone(900);
          voiceAbortRef.current = null; voiceContextRef.current = null; voiceSourceRef.current = null;
          void audio.close();
        }, Math.max(0, (nextStart - audio.currentTime) * 1000 + 80));
      };
      voiceTimerRef.current = window.setInterval(() => {
        if (pending.length < 3200 && !streamDone) return;
        const count = Math.min(3200, pending.length & ~1);
        if (!count) { if (streamDone) finish(); return; }
        const chunk = pending.slice(0, count);
        pending = pending.slice(count);
        const samples = new Float32Array(count / 2);
        const view = new DataView(chunk.buffer);
        for (let i = 0; i < samples.length; i++) samples[i] = view.getInt16(i * 2, true) / 32768;
        const buffer = audio.createBuffer(1, samples.length, 16000);
        buffer.copyToChannel(samples, 0);
        const source = audio.createBufferSource(); source.buffer = buffer; source.connect(audio.destination);
        nextStart = Math.max(nextStart, audio.currentTime + 0.03);
        source.start(nextStart);
        nextStart += samples.length / 16000;
        voiceSourceRef.current = source;
        if (!playbackStarted) {
          playbackStarted = true;
          socketRef.current?.send(JSON.stringify({ type: 'client-playback', status: 'start', text: text.trim(), voice }));
        }
        setStatus('Client is speaking…');
      }, 100);
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const merged = new Uint8Array(pending.length + value.length);
        merged.set(pending); merged.set(value, pending.length);
        pending = merged;
      }
      streamDone = true;
    } catch (e) {
      if (abort.signal.aborted) return;
      socketRef.current?.send(JSON.stringify({ type: 'client-playback', status: 'error', message: e instanceof Error ? e.message : 'Client voice unavailable.' }));
      if (voiceTimerRef.current != null) clearInterval(voiceTimerRef.current);
      voiceTimerRef.current = null;
      void voiceContextRef.current?.close(); voiceContextRef.current = null;
      voiceAbortRef.current = null;
      const message = e instanceof Error ? e.message : 'Client voice unavailable.';
      setStatus(message);
      resumeMicrophone(playbackStarted ? 900 : 0, message);
    }
  }

  function requestClientReply(source: 'opening' | 'auto' | 'manual' = 'manual') {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN || !readiness?.m3 || !readiness?.elevenlabs) return;
    if (clientThinkingRef.current || voiceBusyRef.current) return;
    cancelScheduledReply();
    clientThinkingRef.current = true;
    setClientThinking(true);
    socket.send(JSON.stringify({ type: 'client-reply', scenario: scenarioRef.current, source }));
  }

  function cancelScheduledReply() {
    if (advisorReplyTimerRef.current != null) {
      clearTimeout(advisorReplyTimerRef.current);
      if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(JSON.stringify({ type: 'advisor-wait', status: 'cancelled' }));
    }
    advisorReplyTimerRef.current = null;
  }

  function scheduleAutoReply() {
    cancelScheduledReply();
    socketRef.current?.send(JSON.stringify({ type: 'advisor-wait', status: 'scheduled', delayMs: 3500 }));
    advisorReplyTimerRef.current = window.setTimeout(() => {
      advisorReplyTimerRef.current = null;
      if (autoReplyRef.current && !voiceBusyRef.current && !clientThinkingRef.current) requestClientReply('auto');
    }, 3500);
  }

  async function start() {
    if (active) return;
    if (!readiness?.deepgram) { setStatus('Add a Deepgram API key to .env.local and restart.'); return; }
    if (!readiness?.elevenlabs) { setStatus(readiness?.elevenlabsIssue || 'Add a working ElevenLabs API key to .env.local and restart.'); return; }
    setTurns([]); setPartials({ advisor: '', client: '' }); setAnswerHistory([]); setLiveEvidence([]); setCallFacts(facts); setCardMode(''); setLogId('');
    setSessionLabel(clientName(analysis.customer));
    const url = new URL('/api/live-call/socket', location.href);
    url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(url);
    socketRef.current = socket;
    socket.onopen = async () => {
      socket.send(JSON.stringify({ type: 'start', facts, context: { clientId: analysis.customer.ClientId, clientName: clientName(analysis.customer), portfolioScope: analysis.scope } }));
      setActive(true); setDocked(true); setStatus('Connecting microphone…');
      try { await startMicrophone(); setStatus('Listening'); }
      catch (e) { setStatus(e instanceof Error ? e.message : 'Microphone unavailable.'); }
      if (socketRef.current === socket && autoReplyRef.current) requestClientReply('opening');
    };
    socket.onmessage = event => {
      const data = JSON.parse(event.data);
      if (data.type === 'started') setLogId(data.logId);
      if (data.type === 'partial') {
        setPartials(old => ({ ...old, [data.role]: data.text }));
        if (data.role === 'advisor' && data.text?.trim()) cancelScheduledReply();
      }
      if (data.type === 'turn') {
        setTurns(old => [...old, { role: data.role, text: data.text, at: data.at }]);
        if (data.role === 'advisor' && autoReplyRef.current && advisorReady(data.text)) scheduleAutoReply();
      }
      if (data.type === 'suggestions') {
        setAnswerHistory(old => old.at(-1)?.cards[0]?.guidance === data.cards?.[0]?.guidance ? old : [...old, { at: Date.now(), cards: data.cards }]);
        setCardMode(data.mode);
      }
      if (data.type === 'live-evidence') setLiveEvidence(old => [...old.filter(f => f.id !== data.evidence.id), data.evidence]);
      if (data.type === 'client-text') { clientThinkingRef.current = false; setClientThinking(false); void speak(data.text); }
      if (data.type === 'client-status' && data.status === 'thinking') { clientThinkingRef.current = true; setClientThinking(true); }
      if (data.type === 'client-status' && data.status === 'error') { clientThinkingRef.current = false; setClientThinking(false); setStatus('M3 could not generate a client reply. Use a manual line.'); }
      if (data.type === 'stream' && data.status === 'error') setStatus(`Deepgram ${data.role} stream failed.`);
      if (data.type === 'stream' && data.status === 'closed') setStatus(`Deepgram ${data.role} stream closed: ${data.detail || 'connection ended'}`);
      if (data.type === 'error') setStatus(data.message);
    };
    socket.onerror = () => setStatus('Live Call connection failed.');
    socket.onclose = () => { setActive(false); setMicOn(false); };
  }

  function releaseResources() {
    cancelScheduledReply();
    if (micResumeTimerRef.current != null) clearTimeout(micResumeTimerRef.current);
    micResumeTimerRef.current = null;
    if (voiceTimerRef.current != null) clearInterval(voiceTimerRef.current);
    voiceAbortRef.current?.abort(); voiceAbortRef.current = null;
    if (voiceSourceRef.current) voiceSourceRef.current.onended = null;
    try { voiceSourceRef.current?.stop(); } catch { /* already ended */ }
    voiceSourceRef.current = null;
    void voiceContextRef.current?.close(); voiceContextRef.current = null;
    micStreamRef.current?.getTracks().forEach(t => t.stop()); micStreamRef.current = null;
    void micContextRef.current?.close(); micContextRef.current = null;
    socketRef.current?.close(); socketRef.current = null;
  }

  function stop() {
    releaseResources();
    suppressAdvisorUntilRef.current = 0;
    voiceBusyRef.current = false; clientThinkingRef.current = false;
    setVoiceBusy(false); setMicOn(false); setActive(false); setClientThinking(false); setStatus('Call ended');
  }

  const factOrder = ['performance:1M', 'performance:reported', 'cash', 'positions', 'limits'];
  const caseFacts = (active ? callFacts : facts).filter(f => factOrder.includes(f.id)).sort((a, b) => factOrder.indexOf(a.id) - factOrder.indexOf(b.id));
  const cards = answerHistory.at(-1)?.cards || [];
  const olderAnswers = answerHistory.slice(0, -1).reverse();

  return <div className={`live-call-page${docked ? ' is-docked' : ''}`} role="dialog" aria-modal={!docked} aria-label="Live Call copilot">
    <header className="live-call-top"><div><div className="live-call-nav"><button className="live-call-back" onClick={() => { stop(); onClose(); }}><ArrowLeft size={17}/> Close call</button><button className="live-call-back" onClick={() => setDocked(!docked)}>{docked ? 'Expand call' : 'View Compass alongside call'}</button></div><h1>Live Call <span>· {active ? sessionLabel : clientName(analysis.customer)}</span></h1><p>Advisor copilot · Deepgram adviser transcription · M3 client and guidance · ElevenLabs voice</p></div><div className="live-call-controls"><span className={`live-call-indicator ${active ? 'on' : ''}`}>{active ? 'LIVE' : 'READY'}</span>{!active ? <button className="live-call-primary" disabled={!readiness?.deepgram || !readiness?.elevenlabs} onClick={() => void start()}><Play size={15}/>Start call</button> : <button className="live-call-stop" onClick={stop}><Square size={14}/>End call</button>}</div></header>
    <div className="live-call-context"><label>Client<select value={analysis.customer.ClientId} disabled={active} onChange={e => onSelectCustomer(Number(e.target.value))}>{customers.map(customer => <option key={customer.ClientId} value={customer.ClientId}>{clientName(customer)}</option>)}</select></label><label>Portfolio<select value={analysis.scope} disabled={active} onChange={e => onSelectScope(e.target.value)}><option value="all">All portfolios</option>{list<Row>(analysis.customer.Portfolios).map(portfolio => <option key={portfolio.PortfolioId} value={String(portfolio.PortfolioId)}>{portfolio.PortfolioNr || `Portfolio ${portfolio.PortfolioId}`}</option>)}</select></label><span>Choose the case context before starting the call.</span></div>
    <div className="live-call-status" role="status"><span>{micOn ? <Mic size={15}/> : <MicOff size={15}/>} {status}</span><span>{readiness?.elevenlabsIssue && status !== readiness.elevenlabsIssue ? readiness.elevenlabsIssue : logId ? `Local log · ${logId.slice(0, 8)}` : !readiness?.elevenlabsIssue ? `Deepgram ${readiness?.deepgram ? 'configured' : 'missing'} · ElevenLabs ${readiness?.elevenlabs ? 'configured' : 'missing'} · M3 ${readiness?.m3 ? 'configured' : 'missing'}` : ''}</span></div>
    <div className="live-call-layout"><section className="live-call-transcript"><div className="live-call-section-head"><h2>Conversation</h2><span>{turns.length} turns</span></div><div className="live-call-turns">{!turns.length && <p className="live-call-empty">Start the call. The client will raise the portfolio concern, then you can respond by voice.</p>}{turns.map((turn, i) => <article key={i} className={`live-call-turn ${turn.role}`}><span>{turn.role === 'advisor' ? 'ADVISER' : 'CLIENT'} · {new Date(turn.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><p>{turn.text}</p></article>)}{roles.map(role => partials[role] && <article key={role} className={`live-call-turn ${role} partial`}><span>{role === 'advisor' ? 'ADVISER' : 'CLIENT'} · listening</span><p>{partials[role]}</p></article>)}</div></section>
      <aside className="live-call-aside"><section className="live-call-guidance"><div className="live-call-section-head"><h2>Live answer</h2><span>{cardMode || 'Case context'}</span></div>{!cards.length && <p className="live-call-empty">A reconciled answer appears when the client speaks. The recorded case facts stay below while you think.</p>}{cards.map((card, i) => <article className="live-call-card" key={`${card.evidenceIds.join(':')}:${i}`}><h3>{card.title}</h3><p><b>Say:</b> {card.guidance}</p>{card.question && <strong>Ask: {card.question}</strong>}<small>Source: {card.source}</small></article>)}{olderAnswers.length > 0 && <details className="live-call-history"><summary>Earlier answers ({olderAnswers.length})</summary>{olderAnswers.map(entry => <article key={entry.at}><time>{new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><b>{entry.cards[0]?.title}</b><p>{entry.cards[0]?.guidance}</p></article>)}</details>}<div className="live-call-reference"><h3>Recorded case facts</h3>{caseFacts.map(f => <article key={f.id}><b>{f.title}</b><p>{f.text.slice(0, f.id === 'positions' ? 320 : 350)}</p><small>Source: {f.source}</small></article>)}{liveEvidence.length > 0 && <><h3>Evidence noticed during this call</h3>{[...liveEvidence].reverse().map(f => <article key={f.id}><b>{f.title}</b><p>{f.text}</p><small>Source: {f.source}</small></article>)}</>}</div></section>
        <section className="live-call-client"><div className="live-call-section-head"><h2>Simulated client</h2><Volume2 size={17}/></div><label>Client voice<select value={voice} onChange={e => setVoice(e.target.value as DemoVoice)}><option value="default">{readiness?.customVoice ? 'Configured custom voice' : 'Rachel · warm and conversational'}</option><option value="george">George · calm and natural</option><option value="adam">Adam · deep</option></select></label><label>Client scenario<textarea value={scenario} onChange={e => setScenario(e.target.value)} rows={4} maxLength={500}/></label><label className="live-call-checkbox"><input type="checkbox" checked={autoReply} onChange={e => { setAutoReply(e.target.checked); if (!e.target.checked) cancelScheduledReply(); }}/>Start with client and reply after a substantive adviser turn and quiet pause</label><button className="live-call-primary" disabled={!active || !readiness?.m3 || !readiness?.elevenlabs || clientThinking || voiceBusy} onClick={() => requestClientReply()}><Play size={14}/>{clientThinking ? 'M3 is thinking…' : voiceBusy ? 'Client is speaking…' : 'Prompt client now'}</button><div className="live-call-manual"><label>Manual client line<input value={manualLine} onChange={e => setManualLine(e.target.value)} maxLength={500} placeholder="Type a client line for the demo"/></label><button title="Speak manual client line" disabled={!active || !readiness?.elevenlabs || voiceBusy || !manualLine.trim()} onClick={() => { const line = manualLine.trim(); setManualLine(''); void speak(line); }}><Send size={16}/></button></div><p className="live-call-hint">Use headphones to prevent the adviser microphone from picking up the simulated client voice. This demo uses synthetic conversation and case data.</p></section></aside></div>
  </div>;
}

const roles: Role[] = ['advisor', 'client'];
