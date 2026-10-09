import { useEffect, useRef, useState } from 'react';
import { audioContext, playNote, resumeAudio, scheduleClick, scheduleTone } from '../audio';
import { MidiControl, type MidiInputEvent } from '../midi';
import { isBlack, pitchName } from '../music';
import { assessInput, beatLabel, emptyAssessment, expectedNotes, generateExercise, sanitizeSight, secondsPerTick, sightDefaults, sightProfiles, slowInput, summarize, type Assessment, type Exercise, type PerformanceResult, type SightReadingSettings } from './engine';
import { Score } from './Score';
import './sight.css';
const settingsKey='note-garden-sight-settings-v1';const resultsKey='note-garden-sight-results-v1';
function loadSettings(){try{return sanitizeSight(JSON.parse(localStorage.getItem(settingsKey)||'{}'));}catch{return sightDefaults;}}
function loadHistory():PerformanceResult[]{try{const value=JSON.parse(localStorage.getItem(resultsKey)||'[]');return Array.isArray(value)?value.filter(v=>v&&typeof v.id==='string'&&typeof v.pitchScore==='number').slice(0,20):[];}catch{return [];}}
type Phase='idle'|'preview'|'countin'|'playing'|'slow'|'demo'|'complete'|'aborted';
type Run={phase:Phase;kind:'timed'|'slow'|'demo';start:number;previewEnd:number;nextClick:number;nextEvent:number;assessment:Assessment;cancel:(()=>void)[]};
const shortcut:Record<string,number>={'1':0,'2':2,'3':4,'4':5,'5':7,'6':9,'7':11,q:1,w:3,r:6,t:8,y:10};
const noNote=()=>{};
export function SightReading(){
  const [settings,setSettings]=useState(loadSettings);const [exercise,setExercise]=useState(()=>generateExercise(settings));const [phase,setPhase]=useState<Phase>('idle');
  const [assessment,setAssessment]=useState(emptyAssessment);const [tick,setTick]=useState(-1);const [count,setCount]=useState(0);const [listened,setListened]=useState(false);const listenedRef=useRef(false);
  const [result,setResult]=useState<PerformanceResult|null>(null);const [history,setHistory]=useState(loadHistory);const [notice,setNotice]=useState('先觀察調號、拍子與雙手位置，再開始視奏。');
  const [octave,setOctave]=useState(4);const [pressed,setPressed]=useState<number|null>(null);const [starting,setStarting]=useState(false);
  const run=useRef<Run|null>(null);const token=useRef(0);const pressedTimer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined);const held=useRef(new Set<string>());
  const current=useRef({settings,exercise});current.current={settings,exercise};
  const locked=starting||['preview','countin','playing','slow','demo'].includes(phase);
  useEffect(()=>{try{localStorage.setItem(settingsKey,JSON.stringify(settings));}catch{/* Optional storage. */}},[settings]);
  function clearRun(){token.current++;const active=run.current;run.current=null;active?.cancel.forEach(cancel=>cancel());held.current.clear();setStarting(false);}
  function abort(message='已停止，本次不記錄成績；可重練原曲。'){if(!run.current&&!starting)return;clearRun();setPhase('aborted');setTick(-1);setNotice(message);}
  function complete(active:Run){const {settings:s,exercise:ex}=current.current;const record=summarize(ex,s,active.assessment,listenedRef.current);clearRun();setAssessment(active.assessment);setResult(record);setPhase('complete');setTick(-1);setNotice('練習完成。查看音高與起音節奏，再選擇重練或換一首。');setHistory(previous=>{const next=[record,...previous].slice(0,20);try{localStorage.setItem(resultsKey,JSON.stringify(next));}catch{/* Optional storage. */}return next;});}
  function countIn(active:Run,at:number){const {exercise:ex,settings:s}=current.current;active.start=at+ex.barTicks*secondsPerTick(ex,s.bpm);active.nextClick=-ex.barTicks;active.phase='countin';setPhase('countin');setNotice('預備拍，跟著節拍準備開始。');}
  async function begin(kind:'timed'|'slow'|'demo',skipPreview=false){
    if(locked)return;const ticket=++token.current;setStarting(true);setResult(null);setAssessment(emptyAssessment());setTick(-1);held.current.clear();
    try{
      const ctx=await resumeAudio();if(ticket!==token.current)return;
      const active:Run={phase:'idle',kind,start:0,previewEnd:0,nextClick:0,nextEvent:0,assessment:emptyAssessment(),cancel:[]};run.current=active;setStarting(false);
      if(kind==='demo'){listenedRef.current=true;setListened(true);countIn(active,ctx.currentTime+.1);}
      else if(!skipPreview&&settings.preview>0){active.phase='preview';active.previewEnd=ctx.currentTime+settings.preview;setCount(settings.preview);setPhase('preview');setNotice('預覽中，可以試彈；試彈不計分。');}
      else countIn(active,ctx.currentTime+.1);
    }catch{setStarting(false);setNotice('無法啟動音訊，請確認瀏覽器聲音權限後重試。');}
  }
  function newExercise(patch:Partial<SightReadingSettings>={}){const next=sanitizeSight({...settings,...patch});setSettings(next);const ex=generateExercise(next);setExercise(ex);listenedRef.current=false;setListened(false);setAssessment(emptyAssessment());setResult(null);setPhase('idle');setTick(-1);setNotice('新曲已準備好，先看調號與拍子。');}
  function update(patch:Partial<SightReadingSettings>,regenerate=false){if(locked)return;if(regenerate){newExercise(patch);return;}setSettings(s=>sanitizeSight({...s,...patch}));setResult(null);setAssessment(emptyAssessment());setPhase('idle');setTick(-1);}
  function input(midi:number,timestamp=performance.now(),source='screen'){
    setPressed(midi);clearTimeout(pressedTimer.current);pressedTimer.current=setTimeout(()=>setPressed(null),180);
    void playNote(midi).catch(()=>{});
    const active=run.current;const {settings:s,exercise:ex}=current.current;if(!active||active.kind==='demo')return;
    if(active.phase==='preview')return;
    const expected=expectedNotes(ex,s.hands);
    if(active.phase==='slow'){
      active.assessment=slowInput(expected,active.assessment,midi);setAssessment(active.assessment);
      const matched=new Set(active.assessment.matches.map(m=>m.id));const next=expected.find(n=>!matched.has(n.id));setTick(next?.tick??ex.totalTicks);
      if(!next)complete(active);return;
    }
    if(active.kind!=='timed'||!['playing','countin'].includes(active.phase))return;
    const time=audioContext().currentTime+(timestamp-performance.now())/1000-active.start-s.latency/1000;
    if(time<-.3||time>ex.totalTicks*secondsPerTick(ex,s.bpm)+.3)return;
    active.assessment=assessInput(expected,active.assessment,midi,time,ex,s.bpm);setAssessment(active.assessment);
    if(source!=='midi')setNotice('畫面／電腦鍵盤適合單手慢練；雙手跟拍建議使用 MIDI。');
  }
  function midi(event:MidiInputEvent){const id=`${event.deviceId}:${event.channel}:${event.midi}`;if(event.kind==='off'){held.current.delete(id);return;}if(held.current.has(id))return;held.current.add(id);input(event.midi,event.timestamp,'midi');}
  const actions=useRef({abort,complete,countIn,input,midi});actions.current={abort,complete,countIn,input,midi};
  useEffect(()=>{
    const timer=setInterval(()=>{
      const active=run.current;if(!active)return;const {exercise:ex,settings:s}=current.current;const ctx=audioContext();const now=ctx.currentTime;const spt=secondsPerTick(ex,s.bpm);
      if(active.phase==='preview'){const left=Math.ceil(active.previewEnd-now);setCount(Math.max(0,left));if(left<=0)actions.current.countIn(active,now+.1);return;}
      if(active.phase==='slow')return;
      if(active.phase==='countin'){
        setCount(Math.max(1,Math.ceil((active.start-now)/(ex.beatTicks*spt))));
        if(now>=active.start){active.phase=active.kind==='demo'?'demo':active.kind==='slow'?'slow':'playing';setPhase(active.phase);setNotice(active.phase==='slow'?'慢練中：彈對同一時點全部音符才前進。':active.phase==='demo'?'示範播放中；此曲已標記為已聆聽。':'演奏中，保持節奏，彈錯也繼續。');if(active.phase==='slow'){const next=expectedNotes(ex,s.hands)[0];setTick(next?.tick??0);active.cancel.forEach(cancel=>cancel());active.cancel=[];return;}}
      }
      const songSeconds=now-active.start;const ahead=now+.12;
      // Count-in always clicks; during performance the metronome toggle applies.
      while(active.start+active.nextClick*spt<ahead&&active.nextClick<ex.totalTicks){
        const at=active.start+active.nextClick*spt;const inCount=active.nextClick<0;
        if(inCount||s.metronome){const barTick=((active.nextClick%ex.barTicks)+ex.barTicks)%ex.barTicks;const unit=1920/Number(ex.meter.split('/')[1]);let offset=0;const accents=new Set<number>([0]);ex.groups.forEach(g=>{offset+=g*unit;accents.add(offset);});active.cancel.push(scheduleClick(Math.max(now,at),accents.has(barTick)));}
        active.nextClick+=ex.beatTicks;
        if(active.kind==='slow'&&active.nextClick>=0)break;
      }
      if(active.kind==='demo'){
        const audible=ex.events.filter(e=>!e.tieFrom&&(s.hands==='both'||s.hands===e.hand)).sort((a,b)=>a.tick-b.tick);
        while(active.nextEvent<audible.length&&active.start+audible[active.nextEvent].tick*spt<ahead){const event=audible[active.nextEvent++];let duration=event.duration;let next=event;while(next.tieTo){const continuation=ex.events.find(e=>e.id===next.tieTo);if(!continuation)break;duration+=continuation.duration;next=continuation;}for(const note of event.notes)active.cancel.push(scheduleTone(note.midi,Math.max(now,active.start+event.tick*spt),duration*spt*.95,.09));}
      }
      if(songSeconds>=0)setTick(Math.min(ex.totalTicks,songSeconds/spt));
      if(songSeconds>=ex.totalTicks*spt+(active.kind==='timed'?.3:0)){
        if(active.kind==='demo'){clearRun();setPhase('idle');setTick(-1);setNotice('示範結束。此曲已聆聽，可開始練習或產生新曲。');}
        else actions.current.complete(active);
      }
    },25);
    const visibility=()=>{if(document.hidden)actions.current.abort('分頁進入背景，本次評分已中止；回來後可重練原曲。');};document.addEventListener('visibilitychange',visibility);
    return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',visibility);token.current++;run.current?.cancel.forEach(cancel=>cancel());run.current=null;clearTimeout(pressedTimer.current);};
  },[]);
  useEffect(()=>{
    const keydown=(event:KeyboardEvent)=>{if(event.repeat||event.ctrlKey||event.metaKey||event.altKey||event.target instanceof HTMLElement&&event.target.matches('input,select,textarea'))return;if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();setOctave(o=>Math.max(0,Math.min(8,o+(event.key==='ArrowRight'?1:-1))));return;}const offset=shortcut[event.key.toLowerCase()];if(offset!==undefined){event.preventDefault();const midi=(octave+1)*12+offset;if(midi>=21&&midi<=108)actions.current.input(midi);}};
    window.addEventListener('keydown',keydown);return()=>window.removeEventListener('keydown',keydown);
  },[octave]);
  const expected=expectedNotes(exercise,settings.hands);const currentBar=tick>=0?Math.min(exercise.bars,Math.floor(tick/exercise.barTicks)+1):null;
  const pitches=Array.from({length:12},(_,i)=>(octave+1)*12+i).filter(n=>n>=21&&n<=108);const white=pitches.filter(n=>!isBlack(n));
  return <main className="sight-main">
    <section className="intro"><div><div className="eyebrow">SIGHT READING · KEEP THE MUSIC MOVING</div><h1>讀下一拍，奏下一句。</h1><p>原創鋼琴短曲 · 按 ABRSM 鋼琴視奏範圍循序練習</p></div><div className="range-badge"><span>本次樂曲</span><strong>Grade {exercise.grade}</strong><small>{exercise.bars} 小節 · {exercise.meter}</small></div></section>
    <section className="grade-panel"><div className="grade-heading"><strong>鋼琴視奏分級</strong><span>獨立的鋼琴演奏難度設定</span></div><div className="grade-buttons">{sightProfiles.map(p=><button key={p.grade} disabled={locked} className={settings.grade===p.grade?'active':''} onClick={()=>newExercise({grade:p.grade})}>Grade {p.grade}</button>)}</div><p>{sightProfiles[settings.grade-1].description} · {settings.grade===1?'雙手輪流演奏':'可雙手同奏，也可分手練習'}</p><small>參照 <a target="_blank" rel="noreferrer" href="https://www.abrsm.org/sites/default/files/2024-06/Piano%202025%20%26%202026%20Prac%20syllabus%2020240524_access.pdf">ABRSM 2025–2026 鋼琴視奏要求 ↗</a> 設計核心練習；不含弱起、延長記號、變速、八度記號、踏板、琶音或裝飾音。本站分數不等同官方考試評分。</small></section>
    <fieldset className="sight-settings" disabled={locked}><legend className="sr-only">視奏設定</legend>
      <label>練習方式<select value={settings.mode} onChange={e=>update({mode:e.target.value as SightReadingSettings['mode']})}><option value="timed">跟拍評分</option><option value="slow">慢練 · 等彈對</option></select></label>
      <label>聲部<select value={settings.hands} onChange={e=>update({hands:e.target.value as SightReadingSettings['hands']})}><option value="both">雙手</option><option value="right">只練右手</option><option value="left">只練左手</option></select></label>
      <label>樂曲長度<select value={settings.short?'short':'full'} onChange={e=>newExercise({short:e.target.value==='short'})}><option value="full">級別原長度</option><option value="short">4 小節 · 自訂短練</option></select></label>
      <label>速度<input aria-label="速度 BPM" type="number" min="30" max="160" value={settings.bpm} onChange={e=>update({bpm:+e.target.value})}/></label>
      <label>預覽時間<select value={settings.preview} onChange={e=>update({preview:+e.target.value})}>{[0,15,30,60].map(n=><option key={n} value={n}>{n===0?'不預覽':`${n} 秒`}</option>)}</select></label>
      <label>延遲校正（ms）<input aria-label="延遲校正" type="number" min="-200" max="200" step="10" value={settings.latency} onChange={e=>update({latency:+e.target.value})}/></label>
      <label className="sight-check"><input type="checkbox" checked={settings.metronome} onChange={e=>update({metronome:e.target.checked})}/>節拍器</label><label className="sight-check"><input type="checkbox" checked={settings.cursor} onChange={e=>update({cursor:e.target.checked})}/>游標</label>
    </fieldset>
    <p className="notation-help">速度單位：{beatLabel(exercise)} = {settings.bpm} BPM · 拍組 {exercise.groups.join('+')} · 正校正值會扣除輸入延遲。只評音高與起音，不扣放鍵、力度或踏板分數。</p>
    <MidiControl onNote={noNote} onInput={midi} onLost={()=>abort('MIDI 裝置中斷，本次評分已中止；接回後可重練原曲。')} locked={locked}/>
    <section className="sight-sheet">
      <div className="sight-toolbar"><div><strong>{exercise.key.replace('m',' 小調').replace('b','♭').replace('#','♯')}{!exercise.key.endsWith('m')?' 大調':''}</strong><span>{exercise.meter} · {exercise.bars} 小節{settings.short?'（自訂長度）':''}</span></div><span className={listened?'heard-badge':'fresh-badge'}>{listened?'已聆聽 · 非首次視奏':'未聆聽示範'}</span></div>
      <div className="sight-transport"><button className="primary-button" disabled={locked} onClick={()=>void begin(settings.mode)}>{phase==='complete'||phase==='aborted'?'重練原曲':'開始練習'} →</button><button disabled={locked} onClick={()=>void begin('demo',true)}>♫ 示範播放</button><button disabled={locked} onClick={()=>newExercise()}>產生新曲 ↻</button>{locked&&<button className="stop-button" onClick={()=>abort()}>停止</button>}{phase==='preview'&&<button onClick={()=>{const active=run.current;if(active)countIn(active,audioContext().currentTime+.1);}}>略過預覽 →</button>}</div>
      <div className="sight-status" role="status"><span>{phase==='preview'?`預覽 ${count} 秒`:phase==='countin'?`預備 ${count}`:currentBar?`第 ${currentBar} / ${exercise.bars} 小節`:phase==='complete'?'本輪完成':'準備就緒'}</span><p>{notice}</p><strong>{assessment.matches.length} / {expected.length} 音</strong></div>
      <Score exercise={exercise} hands={settings.hands} tick={tick} cursor={settings.cursor} assessment={assessment} result={phase==='complete'}/>
    </section>
    {result&&<section className="sight-results"><div className="eyebrow">PRACTICE RESULTS</div><h2>{settings.mode==='slow'?'慢練完成，音符都找到了。':'保持音樂流動，每一拍都在進步。'}</h2><div className="sight-result-grid"><div><strong>{result.pitchScore}%</strong><span>音高準確率</span></div><div><strong>{result.rhythmScore===null?'—':`${result.rhythmScore}%`}</strong><span>{result.rhythmScore===null?'慢練不評節奏':'起音準拍率'}</span></div><div><strong>{result.wrong}</strong><span>錯音輸入</span></div><div><strong>{result.missed}</strong><span>漏音</span></div><div><strong>{result.extras}</strong><span>額外音（含錯音）</span></div></div><p>音高：匹配音數 ÷（應奏音數＋額外音數） · 節奏：準拍音數 ÷ 應奏音數。綠色為全部匹配，金色為和弦部分匹配，紅色為漏音；和弦以各音分別評估。</p></section>}
    <section className="sight-keyboard"><div className="piano-heading"><div><span className="eyebrow">SLOW PRACTICE COMPANION</span><h2>單手慢練輔助鍵盤</h2></div><div className="sight-octave"><button disabled={octave<=0} aria-label="視奏降低八度" onClick={()=>setOctave(o=>o-1)}>←</button><strong>第 {octave} 八度</strong><button disabled={octave>=8} aria-label="視奏提高八度" onClick={()=>setOctave(o=>o+1)}>→</button></div></div><p>白鍵 1–7 · 黑鍵 Q/W/R/T/Y · 左右鍵切換八度。雙手跟拍請使用 MIDI 鍵盤。</p><div className="sight-keyboard-scroll"><div className="sight-keys" style={{width:Math.max(white.length*60,60)}}>{white.map((midi,i)=><button aria-label={pitchName(midi)} key={midi} className={`sight-key white ${pressed===midi?'pressed':''}`} style={{left:i*60}} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();input(midi);}} onClick={e=>{if(e.detail===0)input(midi);}}>{pitchName(midi)}</button>)}{pitches.filter(isBlack).map(midi=><button aria-label={pitchName(midi)} key={midi} className={`sight-key black ${pressed===midi?'pressed':''}`} style={{left:white.filter(n=>n<midi).length*60-18}} onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();input(midi);}} onClick={e=>{if(e.detail===0)input(midi);}}>{pitchName(midi)}</button>)}</div></div></section>
    <section className="sight-history"><h2>最近練習</h2>{history.length?<div className="history-scroll"><table><thead><tr><th>日期</th><th>級別</th><th>模式</th><th>音高</th><th>節奏</th><th>示範</th></tr></thead><tbody>{history.map(record=><tr key={record.id}><td>{new Date(record.completedAt).toLocaleString('zh-HK',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}</td><td>Grade {record.grade}</td><td>{record.mode==='slow'?'慢練':'跟拍'} · {record.hands==='both'?'雙手':record.hands==='right'?'右手':'左手'}</td><td>{record.pitchScore}%</td><td>{record.rhythmScore===null?'—':`${record.rhythmScore}%`}</td><td>{record.listened?'已聆聽':'未聆聽'}</td></tr>)}</tbody></table></div>:<p>完成一輪後會儲存在此瀏覽器，最多保留 20 次。</p>}</section>
    <footer>NOTE GARDEN <span>讀譜，聆聽，讓音樂繼續。</span></footer>
  </main>;
}
