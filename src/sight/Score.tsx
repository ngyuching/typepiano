import { useLayoutEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay';
import type { Assessment, Exercise, SightReadingSettings } from './engine';
import { exerciseMusicXML } from './musicxml';

type Position={id:string;tick:number;system:number;x:number;top:number;height:number;sounding:boolean};
export function Score({exercise,hands,tick,cursor,assessment,result}: {exercise:Exercise;hands:SightReadingSettings['hands'];tick:number;cursor:boolean;assessment:Assessment;result:boolean}) {
  const root=useRef<HTMLDivElement>(null);const container=useRef<HTMLDivElement>(null);
  const hitHeads=useRef(new Map<string,Element[]>());const seenHits=useRef(new Set<string>());
  const positions=useRef<Position[]>([]);const lastSystem=useRef(-1);
  const [width,setWidth]=useState(1000);const [layoutVersion,setLayoutVersion]=useState(0);const [error,setError]=useState('');
  useLayoutEffect(()=>{if(!container.current)return;const resize=new ResizeObserver(entries=>setWidth(Math.round(entries[0].contentRect.width)));resize.observe(container.current);return()=>resize.disconnect();},[]);
  useLayoutEffect(()=>{
    const host=root.current;if(!host)return;
    let cancelled=false;positions.current=[];hitHeads.current.clear();seenHits.current.clear();setError('');delete host.dataset.renderedExercise;host.replaceChildren();
    const scroll=document.createElement('div');scroll.className='score-system-scroll';host.appendChild(scroll);
    const busiest=Math.max(...Array.from({length:exercise.bars},(_,bar)=>new Set(exercise.events.filter(e=>e.bar===bar).map(e=>e.tick)).size));
    const minimum=width<600?Math.max(380,130+Math.abs(exercise.keyCount)*12+busiest*24):380;
    const canvas=document.createElement('div');canvas.className='score-system-canvas';canvas.style.width=`${Math.max(minimum,width-24)}px`;scroll.appendChild(canvas);
    const engraving=document.createElement('div');canvas.appendChild(engraving);
    const marker=document.createElement('div');marker.className='score-cursor';marker.style.display='none';canvas.appendChild(marker);
    const osmd=new OpenSheetMusicDisplay(engraving,{backend:'svg',autoResize:false,drawTitle:false,drawSubtitle:false,drawComposer:false,drawPartNames:false,drawPartAbbreviations:false,drawCredits:false,drawMetronomeMarks:true,autoBeam:false});
    osmd.EngravingRules.RenderXMeasuresPerLineAkaSystem=width<600?1:width<1000?2:4;
    osmd.EngravingRules.StretchLastSystemLine=true;
    osmd.Zoom=.9;
    void osmd.load(exerciseMusicXML(exercise)).then(()=>{
      if(cancelled)return;osmd.render();osmd.cursor.hide();
      const systems=new Map<object,number>();const all:Position[]=[];const rectangles=new Map<number,{top:number;bottom:number}>();
      const bounds=canvas.getBoundingClientRect();
      osmd.GraphicSheet.MeasureList.forEach((staves,bar)=>staves.forEach((measure,staff)=>{
        const systemObject=measure.ParentMusicSystem;if(!systems.has(systemObject))systems.set(systemObject,systems.size);
        const system=systems.get(systemObject)!;
        for(const entry of measure.staffEntries){
          const at=Math.round(entry.getAbsoluteTimestamp().RealValue*1920);
          const event=exercise.events.find(e=>e.bar===bar&&e.hand===(staff===0?'right':'left')&&e.tick===at);
          if(!event)continue;
          const nodes=new Set<SVGGElement>();
          for(const voice of entry.graphicalVoiceEntries)for(const note of voice.notes){
            const graphical=note as typeof note & {getSVGGElement():SVGGElement;getNoteheadSVGs():HTMLElement[];vfnoteIndex:number};
            const node=graphical.getSVGGElement();if(node)nodes.add(node);
            const pitch=note.sourceNote.Pitch;
            if(pitch){const index=event.notes.findIndex(n=>n.midi===Math.round(69+12*Math.log2(pitch.Frequency/440)));
              if(index>=0){const heads=graphical.getNoteheadSVGs();const head=heads[graphical.vfnoteIndex]??heads[0];if(head)hitHeads.current.set(`${event.id}:${index}`,[head]);}
            }
          }
          for(const node of nodes){
            node.dataset.eventId=event.id;node.classList.add('score-note');
            if(hands!=='both'&&hands!==event.hand)node.style.opacity='.3';
            const box=node.getBoundingClientRect();const top=box.top-bounds.top;
            const existing=rectangles.get(system);rectangles.set(system,{top:Math.min(existing?.top??top,top),bottom:Math.max(existing?.bottom??0,top+box.height)});
            all.push({id:event.id,tick:event.tick,system,x:box.left-bounds.left,top,height:box.height,sounding:!!event.notes.length});
          }
        }
      }));
      positions.current=all.map(p=>{const r=rectangles.get(p.system)!;return {...p,top:Math.max(0,r.top-24),height:r.bottom-r.top+48};});
      host.dataset.renderedExercise=exercise.id;
      seenHits.current=new Set(assessment.matches.map(m=>m.id));
      lastSystem.current=-1;setLayoutVersion(v=>v+1);
    }).catch(err=>{if(!cancelled)setError(err instanceof Error?err.message:'無法繪製樂譜');});
    return()=>{cancelled=true;osmd.clear();};
  },[exercise,width,hands]);
  useLayoutEffect(()=>{
    if(!root.current)return;
    const matched=new Set(assessment.matches.map(m=>m.id));
    if(!matched.size)seenHits.current.clear();
    for(const [id,heads] of hitHeads.current){
      for(const head of heads){head.classList.toggle('note-head-hit',matched.has(id));
        if(matched.has(id)&&!seenHits.current.has(id)&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches)head.animate([{filter:'drop-shadow(0 0 1px #00ad7c)',opacity:.65},{filter:'drop-shadow(0 0 8px #00d99b)',opacity:1},{filter:'drop-shadow(0 0 0px #00ad7c)',opacity:1}],{duration:380,easing:'ease-out'});
      }
    }
    seenHits.current=matched;
    root.current.querySelectorAll<SVGGElement>('[data-event-id]').forEach(node=>{
      const id=node.dataset.eventId!;const event=exercise.events.find(e=>e.id===id)!;
      const assessed=event.notes.length>0&&!event.tieFrom&&(hands==='both'||hands===event.hand);
      const hits=event.notes.filter((_,i)=>matched.has(`${id}:${i}`)).length;
      node.classList.toggle('matched',assessed&&hits===event.notes.length);node.classList.toggle('partial',assessed&&hits>0&&hits<event.notes.length);node.classList.toggle('missed',result&&assessed&&hits===0);
    });
    const marker=root.current.querySelector<HTMLDivElement>('.score-cursor');if(!marker)return;
    marker.style.display='none';if(tick<0||!cursor)return;
    const current=positions.current.filter(p=>p.tick<=tick).sort((a,b)=>b.tick-a.tick||Number(b.sounding)-Number(a.sounding))[0];if(!current)return;
    marker.style.display='block';marker.style.left=`${current.x-4}px`;marker.style.top=`${current.top}px`;marker.style.bottom='auto';marker.style.height=`${current.height}px`;
    if(lastSystem.current!==current.system){lastSystem.current=current.system;marker.scrollIntoView({block:'nearest',behavior:'smooth'});}
    const scroller=marker.parentElement!.parentElement!;if(current.x<scroller.scrollLeft||current.x>scroller.scrollLeft+scroller.clientWidth-40)scroller.scrollLeft=Math.max(0,current.x-60);
  },[tick,cursor,assessment,result,layoutVersion,exercise,hands]);
  return <div className="sight-score" ref={container} aria-label="鋼琴視奏大譜表">{error&&<p role="alert">樂譜繪製失敗：{error}</p>}<div className="score-system" data-exercise-id={exercise.id} ref={root}/></div>;
}
