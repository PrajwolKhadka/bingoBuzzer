'use client';
import { useEffect, useRef, useState } from 'react';

const PREFIX = 'bingobuzz-';
const MAX = 5;
const ICE = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    ...(process.env.NEXT_PUBLIC_TURN_URL
      ? [{ urls: process.env.NEXT_PUBLIC_TURN_URL, username: process.env.NEXT_PUBLIC_TURN_USER, credential: process.env.NEXT_PUBLIC_TURN_PASS }]
      : []),
  ],
};
const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const mkCode = () => Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
const MEDALS = ['🥇', '🥈', '🥉', '4', '5'];

function Host({ onExit }) {
  const [code, setCode] = useState('');
  const [status, setStatus] = useState('Opening room...');
  const [phase, setPhase] = useState('waiting');
  const [ranking, setRanking] = useState([]);
  const [names, setNames] = useState([]);
  const [copied, setCopied] = useState(false);
  const players = useRef(new Map());
  const phaseRef = useRef('waiting');
  const rankRef = useRef([]);
  const t0 = useRef(0);
  const peerRef = useRef(null);

  const broadcast = (m) => players.current.forEach((p) => { try { if (p.conn.open) p.conn.send(m); } catch {} });
  const sync = () => setNames([...players.current.values()].map((p) => p.name));
  const changePhase = (p) => { phaseRef.current = p; setPhase(p); broadcast({ t: 'phase', phase: p }); };
  const startRound = () => { rankRef.current = []; setRanking([]); t0.current = performance.now(); changePhase('open'); };

  useEffect(() => {
    let dead = false;
    (async () => {
      const { default: Peer } = await import('peerjs');
      const boot = (tries = 0) => {
        if (dead) return;
        const c = mkCode();
        const peer = new Peer(PREFIX + c, { config: ICE });
        peerRef.current = peer;
        peer.on('open', () => { if (!dead) { setCode(c); setStatus('live'); } });
        peer.on('disconnected', () => { if (!dead) { setStatus('Reconnecting...'); try { peer.reconnect(); } catch {} } });
        peer.on('error', (e) => {
          if (dead) return;
          if (e.type === 'unavailable-id' && tries < 15) { peer.destroy(); boot(tries + 1); }
          else if (e.type !== 'peer-unavailable') setStatus('Connection issue (' + e.type + '). Retrying...');
        });
        peer.on('connection', (conn) => {
          conn.on('data', (m) => {
            if (!m || typeof m !== 'object') return;
            if (m.t === 'join') {
              const base = (String(m.name || '').trim() || 'Student').slice(0, 18);
              const taken = (x) => [...players.current].some(([id, p]) => id !== conn.peer && p.name.toLowerCase() === x.toLowerCase());
              let name = base, i = 2;
              while (taken(name)) name = base + ' ' + i++;
              players.current.set(conn.peer, { name, conn });
              conn.send({ t: 'joined', name, phase: phaseRef.current, buzzed: rankRef.current.some((r) => r.id === conn.peer) });
              sync();
            } else if (m.t === 'buzz') {
              const p = players.current.get(conn.peer);
              if (!p || phaseRef.current !== 'open') return;
              if (rankRef.current.some((r) => r.id === conn.peer)) return;
              rankRef.current = [...rankRef.current, { id: conn.peer, name: p.name, ms: Math.round(performance.now() - t0.current) }];
              setRanking(rankRef.current);
              if (rankRef.current.length >= MAX) changePhase('closed');
            }
          });
          conn.on('close', () => { if (players.current.get(conn.peer)?.conn === conn) { players.current.delete(conn.peer); sync(); } });
        });
      };
      boot();
    })();
    return () => { dead = true; try { peerRef.current?.destroy(); } catch {} };
  }, []);

  const link = typeof window !== 'undefined' ? `${location.origin}/?code=${code}` : '';
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {} };

  if (!code) return (<><h1>Bingo Buzzer</h1><p className="sub">{status}</p></>);

  return (
    <>
      <p className="pill">Room code</p>
      <div className="roomcode">{code}</div>
      <div className="row">
        <button className="btn ghost" onClick={copy}>{copied ? 'Link copied!' : 'Copy student link'}</button>
        <button className="btn ghost" onClick={onExit}>Close room</button>
      </div>
      {status !== 'live' && <p className="bar">{status}</p>}
      <div className="host">
        <section className="panel">
          <h2>Leaderboard</h2>
          <ol className="rank">
            {Array.from({ length: MAX }, (_, i) => {
              const r = ranking[i];
              return (
                <li key={i} className={r ? 'on' : ''} style={r ? undefined : { opacity: 0.4 }}>
                  <span className="n">{MEDALS[i]}</span>
                  <span>{r ? r.name : '...'}</span>
                  {r && <span className="t">{(r.ms / 1000).toFixed(2)}s</span>}
                </li>
              );
            })}
          </ol>
          <div className="row" style={{ marginTop: 18 }}>
            {phase === 'open'
              ? <button className="btn pink" onClick={() => changePhase('closed')}>Stop round</button>
              : <button className="btn" onClick={startRound}>{phase === 'waiting' ? 'Start round' : 'New round'}</button>}
          </div>
          <p className="sub" style={{ marginTop: 10 }}>
            {phase === 'waiting' && 'Buzzers are locked until you start.'}
            {phase === 'open' && 'Buzzers are LIVE!'}
            {phase === 'closed' && 'Buzzers locked.'}
          </p>
        </section>
        <section className="panel">
          <h2>{names.length} in the room</h2>
          <div className="chips">{names.map((n) => <span key={n}>{n}</span>)}</div>
        </section>
      </div>
    </>
  );
}

function Student({ initCode }) {
  const [name, setName] = useState('');
  const [code, setCode] = useState(initCode || '');
  const [stage, setStage] = useState('form');
  const [err, setErr] = useState('');
  const [phase, setPhase] = useState('waiting');
  const [pressed, setPressed] = useState(false);
  const [me, setMe] = useState('');
  const S = useRef({ id: 0, peer: null, conn: null, joined: false });

  useEffect(() => () => { S.current.id++; try { S.current.peer?.destroy(); } catch {} }, []);

  const join = async () => {
    const n = name.trim(), c = code.trim().toUpperCase();
    if (!n || c.length < 4) { setErr('Add your name and the 4 letter room code.'); return; }
    setErr(''); setStage('connecting');
    const s = S.current;
    const id = ++s.id;
    s.joined = false;
    try { s.peer?.destroy(); } catch {}
    const { default: Peer } = await import('peerjs');
    if (id !== s.id) return;
    const giveUp = (m) => { if (id !== s.id) return; s.id++; try { s.peer?.destroy(); } catch {} setErr(m); setStage('form'); };
    const start = () => {
      if (id !== s.id) return;
      const peer = new Peer({ config: ICE });
      s.peer = peer;
      const retry = () => { if (id !== s.id) return; setStage('reconnecting'); s.peer = null; try { peer.destroy(); } catch {} setTimeout(start, 1500); };
      const fail = () => { if (id !== s.id || s.peer !== peer) return; s.joined ? retry() : giveUp('Room not found. Check the code and try again.'); };
      peer.on('error', (e) => { if (s.joined && e.type !== 'peer-unavailable') return; fail(); });
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + c, { reliable: true });
        s.conn = conn;
        const t = setTimeout(() => { if (!conn.open) fail(); }, 9000);
        conn.on('open', () => { clearTimeout(t); conn.send({ t: 'join', name: n }); });
        conn.on('data', (m) => {
          if (id !== s.id || !m) return;
          if (m.t === 'joined') { s.joined = true; setMe(m.name); setPhase(m.phase); setPressed(!!m.buzzed); setStage('in'); }
          else if (m.t === 'phase') { setPhase(m.phase); if (m.phase === 'open') setPressed(false); }
        });
        conn.on('close', () => { clearTimeout(t); fail(); });
      });
    };
    start();
  };

  const buzz = () => {
    const c = S.current.conn;
    if (phase !== 'open' || pressed || !c || !c.open) return;
    c.send({ t: 'buzz' });
    setPressed(true);
  };

  if (stage === 'in' || stage === 'reconnecting') {
    const live = phase === 'open' && !pressed && stage === 'in';
    return (
      <>
        <h2>{me}</h2>
        {stage === 'reconnecting' && <p className="bar">Reconnecting...</p>}
        <button className={'buzz' + (live ? ' live' : '')} disabled={!live} onPointerDown={buzz}>
          {phase === 'waiting' ? 'WAIT' : phase === 'closed' ? 'LOCKED' : pressed ? 'SENT!' : 'BUZZ!'}
        </button>
        <p className="sub">
          {phase === 'waiting' && 'Get ready. The host will start the round.'}
          {phase === 'open' && (pressed ? 'Buzz sent! Watch the host screen.' : 'GO GO GO!')}
          {phase === 'closed' && 'Round over. Watch the host screen!'}
        </p>
      </>
    );
  }

  return (
    <>
      <h1>Bingo Buzzer</h1>
      <p className="sub">Buzz first. Win the round.</p>
      <div className="card">
        {err && <p className="err">{err}</p>}
        <input placeholder="Your name" maxLength={18} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <input className="code" placeholder="CODE" maxLength={4} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoComplete="off" autoCapitalize="characters" />
        <button className="btn" onClick={join} disabled={stage === 'connecting'}>{stage === 'connecting' ? 'Joining...' : "Let's go!"}</button>
      </div>
    </>
  );
}

export default function Home() {
  const [mode, setMode] = useState('student');
  const [pre, setPre] = useState('');
  useEffect(() => {
    const c = new URLSearchParams(location.search).get('code');
    if (c) setPre(c.toUpperCase().slice(0, 4));
  }, []);
  if (mode === 'host') return <Host onExit={() => setMode('student')} />;
  return (
    <>
      <Student key={pre} initCode={pre} />
      <button className="btn ghost" onClick={() => setMode('host')}>Teacher? Host a room</button>
    </>
  );
}
