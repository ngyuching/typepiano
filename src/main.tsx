import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { answer, createSession, defaults, isBlack, ledgerSteps, normalizeSettings, pitchName, staffStep, type Note, type Settings } from './music';
import './style.css';
import { gradeProfiles, noteExplanation, sourceUrl } from './grades';
import { MidiControl } from './midi';
import { playNote as play } from './audio';
const SightReading=lazy(()=>import('./sight/SightReading').then(module=>({default:module.SightReading})));

const storageKey = 'note-garden-settings-v1';
const allPitches = Array.from({ length: 49 }, (_, i) => i + 36);
const shortcuts: Record<string, number> = { '1': 0, '2': 2, '3': 4, '4': 5, '5': 7, '6': 9, '7': 11, q: 1, w: 3, r: 6, t: 8, y: 10 };
const shortcutLabels: Record<number, string> = { 0: '1', 2: '2', 4: '3', 5: '4', 7: '5', 9: '6', 11: '7', 1: 'Q', 3: 'W', 6: 'R', 8: 'T', 10: 'Y' };
function loadSettings() { try { return normalizeSettings(JSON.parse(localStorage.getItem(storageKey) || '{}')); } catch { return defaults; } }

function Staff({ notes, start, current, error }: { notes: Note[]; start: number; current: number; error: boolean }) {
  // Extra vertical room covers C2–C6 even when a single clef is selected.
  const top = Math.min(38, ...notes.map(note => 130 - staffStep(note) * 6 - 20));
  const bottom = Math.max(158, ...notes.map(note => 130 - staffStep(note) * 6 + 20));
  return <svg className="staff" data-key={notes[0]?.key} viewBox={`0 ${top} 1000 ${bottom - top + 42}`} role="img" aria-label={`第 ${start + 1} 至 ${start + notes.length} 題五線譜`}>
    {[0, 1, 2, 3, 4].map(i => <line key={i} x1="26" x2="976" y1={130 - i * 12} y2={130 - i * 12} stroke="#69746e" strokeWidth="1" />)}
    {notes[0]?.key !== undefined && <g className="row-signature">
      <text x="28" y={notes[0].clef === 'treble' ? 131 : notes[0].clef === 'bass' ? 116 : notes[0].clef === 'alto' ? 119 : 107} className="clef" fontSize={notes[0].clef === 'treble' ? 53 : 40} fill="#385a46">{notes[0].clef === 'treble' ? '𝄞' : notes[0].clef === 'bass' ? '𝄢' : '𝄡'}</text>
      {Array.from({ length: Math.abs(notes[0].key!) }, (_, i) => {
        const sharp = notes[0].key! > 0;
        const steps = notes[0].clef === 'tenor' ? (sharp ? [2,6,3,7,4,8,5] : [5,8,4,7,3,6,2]) : (sharp ? [8,5,9,6,3,7,4] : [4,7,3,6,2,5,1]).map(n => n + (notes[0].clef === 'bass' ? -2 : notes[0].clef === 'alto' ? -1 : 0));
        return <text key={i} x={86 + i * 14} y={136 - steps[i] * 6} fontSize="24" fill="#385a46">{sharp ? '♯' : '♭'}</text>;
      })}
      <text x="29" y={top + 15} fontSize="12" fill="#7b9c8b">{notes[0].keyName} · {({treble:'高音',bass:'低音',alto:'中音',tenor:'次中音'})[notes[0].clef]}譜號</text>
    </g>}
    {notes.map((note, i) => {
      const rowKey = note.key !== undefined;
      const x = rowKey ? 240 + i * 78 : 85 + i * 94; const step = staffStep(note); const y = 130 - step * 6;
      const active = start + i === current; const done = start + i < current;
      const color = active ? (error ? '#d85050' : '#00a778') : done ? '#a1b5aa' : '#233b32';
      const down = step >= 4;
      return <g key={i}>
        {active && <rect x={x - 32} y={Math.min(66, y - 17)} width="70" height={Math.max(96, 151 - y)} rx="12" fill={error ? '#fff0ee' : '#e0f6ec'} fillOpacity="0.65" stroke={error ? '#e8aaa3' : '#a7e3cd'} />}
        {!rowKey && <text x={x - 36} y={note.clef === 'treble' ? 131 : note.clef === 'bass' ? 116 : note.clef === 'alto' ? 119 : 107} className="clef" fill={color} fontSize={note.clef === 'treble' ? 53 : 40}>{note.clef === 'treble' ? '𝄞' : note.clef === 'bass' ? '𝄢' : '𝄡'}</text>}
        {rowKey && <line x1={x + 36} x2={x + 36} y1="82" y2="130" stroke="#d1dbd2" />}
        {ledgerSteps(step).map(l => <line key={l} x1={x - 12} x2={x + 15} y1={130 - l * 6} y2={130 - l * 6} stroke={color} strokeWidth="1.5" />)}
        {note.accidental && <text className="clef accidental" x={x - (note.accidental === '𝄫' ? 29 : 21)} y={y + 6} fontSize="25" fill={color}>{note.accidental}</text>}
        <ellipse cx={x + 2} cy={y} rx="7.2" ry="5.2" transform={`rotate(-20 ${x + 2} ${y})`} fill={color} />
        <line x1={x + (down ? -4 : 8)} x2={x + (down ? -4 : 8)} y1={y} y2={y + (down ? 34 : -34)} stroke={color} strokeWidth="1.8" />
        <text x={x + 2} y={bottom + 24} textAnchor="middle" fontSize="11" fill={active ? '#00a778' : '#a6b2ab'}>{String(start + i + 1).padStart(2, '0')}</text>
      </g>;
    })}
  </svg>;
}

function NoteTrainer() {
  const [settings, setSettings] = useState(loadSettings);
  const spellingCounts = useRef(new Map<number, number>());
  const [session, setSession] = useState(() => createSession(settings, spellingCounts.current));
  const sessionRef = useRef(session); sessionRef.current = session;
  const [octave, setOctave] = useState(4);
  const [pressed, setPressed] = useState<number | null>(null);
  const [wrong, setWrong] = useState(false);
  const [message, setMessage] = useState('看譜，找到對應的琴鍵。');
  const [clock, setClock] = useState(Date.now());
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { try { localStorage.setItem(storageKey, JSON.stringify(settings)); } catch { /* Storage is optional. */ } }, [settings]);
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 1000); return () => { clearInterval(id); clearTimeout(feedbackTimer.current); }; }, []);
  function restart(s = settings) {
    spellingCounts.current.clear();
    const next = createSession(s, spellingCounts.current); sessionRef.current = next; setSession(next);
    clearTimeout(feedbackTimer.current); setWrong(false); setPressed(null); setMessage('新一輪開始，慢慢來。');
  }
  function update(patch: Partial<Settings>, reset = true) {
    const next = normalizeSettings({ ...settings, ...patch }); setSettings(next); if (reset) restart(next);
  }
  function selectGrade(grade: number) {
    if (!grade) { update({ grade: 0 }); return; }
    const profile = gradeProfiles[grade - 1];
    update({ grade, low: profile.low, high: profile.high, clef: 'mixed', accidentals: true, rowKeys: true, traps: profile.traps });
  }
  function submit(midi: number) {
    if (sessionRef.current.finished !== null) return;
    if (midi < settings.low || midi > settings.high) { setMessage(`${pitchName(midi)} 在目前練習音域之外，請切換八度。`); return; }
    setPressed(midi);
    if (!settings.muted) void play(midi).catch(() => setMessage('無法播放聲音，仍可繼續練習。'));
    const previous = sessionRef.current;
    const correct = midi === previous.notes[previous.index].midi;
    const next = answer(previous, midi, settings, Date.now(), spellingCounts.current);
    sessionRef.current = next; setSession(next); setWrong(!correct);
    setMessage(correct ? (next.finished !== null ? '練習完成！每一次練習都在進步。' : `答對了：${noteExplanation(previous.notes[previous.index])}`) : `你按了 ${pitchName(midi)}，再看一次音符的位置、調號與變音記號。`);
    clearTimeout(feedbackTimer.current);
    feedbackTimer.current = setTimeout(() => { setPressed(null); setWrong(false); }, 450);
  }
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey || (event.target instanceof HTMLElement && (event.target.matches('input,select,textarea') || event.target.isContentEditable))) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); setOctave(o => Math.max(2, Math.min(6, o + (event.key === 'ArrowRight' ? 1 : -1)))); return; }
      const offset = shortcuts[event.key.toLowerCase()];
      if (offset !== undefined) { event.preventDefault(); submit((octave + 1) * 12 + offset); }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  const duration = session.started === null ? 0 : Math.max(0, Math.floor(((session.finished ?? clock) - session.started) / 1000));
  const elapsed = `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`;
  const keys = allPitches.filter(n => n >= settings.low && n <= settings.high);
  // White-key slots include the preceding natural key for ranges starting on a black key.
  const slotStart = isBlack(settings.low) ? settings.low - 1 : settings.low;
  const whites = allPitches.filter(n => n >= slotStart && n <= settings.high && !isBlack(n));
  const width = Math.max(whites.length * 46, 46);
  const firstRate = session.answered ? Math.round(session.firstCorrect / session.answered * 100) : 0;
  return <>
    <main>
      <section className="intro"><div><div className="eyebrow">PLAY · LEARN · GROW</div><h1>讓音符，落在指尖。</h1><p>讀懂五線譜，彈出每一個音。從一個八度，走向更寬廣的音域。</p></div><div className="range-badge"><span>你的練習音域</span><strong>{pitchName(settings.low)} <em>—</em> {pitchName(settings.high)}</strong><small>中央 C = C4</small></div></section>
      <section className="grade-panel" aria-label="ABRSM 難度分級"><div className="grade-heading"><strong>ABRSM 識譜分級</strong><span>循序練習，也能挑戰易混淆音符</span></div><div className="grade-buttons"><button className={!settings.grade ? 'active' : ''} onClick={() => selectGrade(0)}>自訂</button>{gradeProfiles.map(p => <button key={p.grade} className={settings.grade === p.grade ? 'active' : ''} onClick={() => selectGrade(p.grade)}>Grade {p.grade}</button>)}</div><p>{settings.grade ? gradeProfiles[settings.grade - 1].description : '自由設定音域、譜號、調號與變音題。選擇級別可套用建議難度。'}</p><small>依 ABRSM 樂理的識譜範圍設計；6–8 級為本站進階識譜挑戰，不涵蓋完整和聲、對位與創作考綱。 <a href={sourceUrl} target="_blank" rel="noreferrer">查看分級依據 ↗</a></small></section>
      <section className="settings" aria-label="練習設定">
        <div className="segmented"><button className={settings.mode === 'standard' ? 'selected' : ''} onClick={() => update({ mode: 'standard' })}>30 題練習</button><button className={settings.mode === 'infinite' ? 'selected' : ''} onClick={() => update({ mode: 'infinite' })}>∞ 無限練習</button></div>
        <div className="setting-group"><span className="setting-label">音域</span><label className="sr-only" htmlFor="low">最低音</label><select id="low" value={settings.low} onChange={e => { const low = +e.target.value; update({ grade: 0, low, high: Math.max(low, settings.high) }); }}>{allPitches.map(n => <option key={n} value={n}>{pitchName(n)}</option>)}</select><span className="range-dash">—</span><label className="sr-only" htmlFor="high">最高音</label><select id="high" value={settings.high} onChange={e => { const high = +e.target.value; update({ grade: 0, high, low: Math.min(high, settings.low) }); }}>{allPitches.map(n => <option key={n} value={n}>{pitchName(n)}</option>)}</select></div>
        <div className="setting-group"><label className="setting-label" htmlFor="clef">譜號</label><select id="clef" value={settings.clef} onChange={e => update({ grade: 0, clef: e.target.value as Settings['clef'] })}><option value="mixed">依級別混合</option><option value="treble">高音譜號</option><option value="bass">低音譜號</option><option value="alto">中音譜號</option><option value="tenor">次中音譜號</option></select></div>
        <label className="toggle-label"><input type="checkbox" checked={settings.accidentals} onChange={e => update({ accidentals: e.target.checked })}/><span className="toggle"/>升降記號</label>
        <label className="toggle-label"><input type="checkbox" checked={settings.rowKeys} onChange={e => update({ rowKeys: e.target.checked })}/><span className="toggle"/>每行不同調號</label>
        <label className="toggle-label"><input type="checkbox" disabled={!!settings.grade && settings.grade < 3} checked={settings.traps} onChange={e => update({ traps: e.target.checked, accidentals: e.target.checked || settings.accidentals })}/><span className="toggle"/>陷阱題</label>
      </section>
      <p className="notation-help">每格一題，直線分隔後臨時記號重設；調號適用全行、所有八度。♮ 還原本位音，𝄪 升兩個半音，𝄫 降兩個半音。答對後顯示音高解析。</p>
      <section className="sheet-card" aria-label="樂譜練習">
        <div className="sheet-toolbar"><div className="sheet-title"><span className="live-dot"/>{session.finished !== null ? '本輪已完成' : '跟著音符，慢慢前進'}<span className="sheet-subtitle">{settings.accidentals ? '自然音與升降音' : '自然音練習'}</span></div><div className="stats"><span>進度 <strong>{session.answered}<small>{settings.mode === 'standard' ? ' / 30' : ' 題'}</small></strong></span><span>錯誤 <strong>{session.errors}</strong></span><button className="icon-button" title="重新開始" aria-label="重新開始" onClick={() => restart()}>↻</button></div></div>
        <div className="progress-track"><div style={{ width: `${settings.mode === 'standard' ? session.answered / 30 * 100 : session.index * 10}%` }}/></div>
        <div className="sheet-scroll"><div className="sheet-content">{Array.from({ length: settings.mode === 'standard' ? 3 : 1 }, (_, row) => <Staff key={row} notes={session.notes.slice(row * 10, row * 10 + 10)} start={row * 10} current={session.index} error={wrong}/>)}</div></div>
        <div className={`feedback ${wrong ? 'error' : ''}`} role="status" aria-live="polite"><span>{wrong ? '○' : '✧'}</span> {message}<time>{elapsed}</time></div>
        {session.finished !== null && <div className="result"><div className="eyebrow">SESSION COMPLETE</div><h2>今天的 30 個音符，完成了。</h2><div className="result-stats"><span><strong>{elapsed}</strong>練習耗時</span><span><strong>{session.errors}</strong>錯誤次數</span><span><strong>{firstRate}%</strong>首次答對率</span></div><button className="primary-button" onClick={() => restart()}>再練習一輪 →</button></div>}
      </section>
      <section className="piano-section" aria-label="作答鋼琴"><div className="piano-heading"><div><span className="eyebrow">YOUR KEYBOARD</span><h2>找到它，彈出來。</h2></div><p>音名與八度都要正確 <span>·</span> 左右滑動查看琴鍵</p></div>
        <MidiControl onNote={submit}/>
        <div className="piano-shell"><div className="piano-controls"><div className="octave-control"><span>作答八度</span><button aria-label="降低八度" disabled={octave === 2} onClick={() => setOctave(o => o - 1)}>←</button><strong>C{octave}–B{octave}</strong><button aria-label="提高八度" disabled={octave === 6} onClick={() => setOctave(o => o + 1)}>→</button></div><div className="piano-actions"><button aria-pressed={!settings.muted} onClick={() => update({ muted: !settings.muted }, false)}>{settings.muted ? '♩ 聲音關閉' : '♫ 聲音開啟'}</button><button aria-pressed={settings.hints} onClick={() => update({ hints: !settings.hints }, false)}>{settings.hints ? '隱藏提示' : '顯示提示'}</button></div></div>
          <div className="keyboard-scroll"><div className="keyboard" style={{ width }}>
            {whites.map((midi, i) => <button key={midi} disabled={midi < settings.low} aria-label={pitchName(midi)} className={`piano-key white ${pressed === midi ? 'pressed' : ''} ${Math.floor(midi / 12) - 1 === octave ? 'keyboard-octave' : ''}`} style={{ left: i * 46 }} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); submit(midi); }} onClick={e => { if (e.detail === 0) submit(midi); }}>{settings.hints && <><span className="key-name">{pitchName(midi)}</span>{Math.floor(midi / 12) - 1 === octave && <kbd>{shortcutLabels[midi % 12]}</kbd>}</>}</button>)}
            {keys.filter(isBlack).map(midi => { const before = whites.filter(n => n < midi).length; return <button key={midi} aria-label={pitchName(midi)} className={`piano-key black ${pressed === midi ? 'pressed' : ''}`} style={{ left: before * 46 - 14 }} onPointerDown={e => { if (e.button !== 0) return; e.preventDefault(); submit(midi); }} onClick={e => { if (e.detail === 0) submit(midi); }}>{settings.hints && <><span className="key-name">{pitchName(midi)}</span>{Math.floor(midi / 12) - 1 === octave && <kbd>{shortcutLabels[midi % 12]}</kbd>}</>}</button>; })}
          </div></div><div className="piano-footnote"><span><i/> 綠色底線標示電腦鍵盤目前八度</span><span>← → 切換八度</span></div></div>
        <p className="keyboard-help">白鍵 <kbd>1</kbd> – <kbd>7</kbd> <span>／</span> 黑鍵 <kbd>Q</kbd> <kbd>W</kbd> <kbd>R</kbd> <kbd>T</kbd> <kbd>Y</kbd> <span>／</span> 點擊琴鍵也能作答</p>
      </section>
      <footer>NOTE GARDEN <span>每個音符，都是一點進步。</span></footer>
    </main>
  </>;
}
function App(){
  const [page,setPage]=useState<'notes'|'sight'>(()=>location.hash==='#sight'?'sight':'notes');
  function navigate(next:'notes'|'sight'){setPage(next);history.replaceState(null,'',next==='sight'?'#sight':'#notes');window.scrollTo(0,0);}
  return <><header className="site-header"><a className="brand" href="./"><span className="brand-icon">♫</span> 音符花園<span className="brand-en">NOTE GARDEN</span></a><nav className="practice-navigation" aria-label="練習模式"><button className={page==='notes'?'nav-active':''} aria-current={page==='notes'?'page':undefined} onClick={()=>navigate('notes')}>♧ 識譜練習</button><button className={page==='sight'?'nav-active':''} aria-current={page==='sight'?'page':undefined} onClick={()=>navigate('sight')}>♫ 視奏訓練</button></nav><span className="header-note">每天一點，讓讀譜成為直覺。</span></header>{page==='notes'?<NoteTrainer/>:<Suspense fallback={<main><p role="status">正在載入鋼琴視奏…</p></main>}><SightReading/></Suspense>}</>;
}
createRoot(document.getElementById('root')!).render(<App/>);
