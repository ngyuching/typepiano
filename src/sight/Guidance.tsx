import { isBlack, pitchName } from '../music';
import { writtenName, type GuidedGroup } from './guided';

export function Guidance({group,showHint,onToggle,wrong}:{group:GuidedGroup;showHint:boolean;onToggle:()=>void;wrong:boolean}) {
  const targets=new Set(group.remaining.map(n=>n.midi));
  const low=Math.max(21,Math.floor(Math.min(...targets)/12)*12),high=Math.min(108,Math.floor(Math.max(...targets)/12)*12+11);
  const keys=Array.from({length:high-low+1},(_,i)=>low+i),white=keys.filter(n=>!isBlack(n));
  return <div className={`guided-panel ${wrong?'guided-wrong':''}`} data-tick={group.tick}>
    <div className="guided-heading"><div role="status"><strong>第 {group.bar} 小節 · {group.handLabel}</strong><span>還有 {group.remaining.length} 個音 · 彈對才前進</span></div><button type="button" onClick={onToggle} aria-expanded={showHint} aria-controls="guided-hint">{showHint?'收起提示':'顯示提示'}</button></div>
    <p className="guided-feedback" role="status">{wrong?'再試一次，已彈對的音會保留。':'按自己的速度讀譜；和弦可以逐音彈。右手用綠框，左手用藍框。'}</p>
    {showHint&&<div id="guided-hint" className="guided-hint">
      <ul>{group.remaining.map(n=><li key={n.id}><span>{n.hand==='right'?'右手':'左手'}</span><strong>{writtenName(n.note)}</strong><small>按 {pitchName(n.midi)} 琴鍵 · 第 {Math.floor(n.midi/12)-1} 八度{writtenName(n.note).replace('♮','')!==pitchName(n.midi)?'（等音異名）':''}</small></li>)}</ul>
      <p>綠色琴鍵是尚未彈對的音，可左右滑動查看完整音域。此鍵盤只作提示，不會發聲或改變作答八度。</p>
      <div className="hint-keyboard-scroll"><div className="hint-keyboard" role="img" aria-label={`提示琴鍵：${[...targets].map(pitchName).join('、')}`} style={{width:white.length*36}}>
        {white.map((midi,i)=><span key={midi} className={`hint-key hint-white ${targets.has(midi)?'hint-target':''}`} style={{left:i*36}}>{targets.has(midi)?pitchName(midi):midi%12===0?pitchName(midi):''}</span>)}
        {keys.filter(isBlack).map(midi=><span key={midi} className={`hint-key hint-black ${targets.has(midi)?'hint-target':''}`} style={{left:white.filter(n=>n<midi).length*36-11}}>{targets.has(midi)?pitchName(midi):''}</span>)}
      </div></div>
    </div>}
  </div>;
}
