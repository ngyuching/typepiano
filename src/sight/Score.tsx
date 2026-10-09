import { useLayoutEffect, useRef, useState } from 'react';
import { Accidental, Beam, Dot, Formatter, Fraction, Renderer, Stave, StaveConnector, StaveNote, StaveTie, Tuplet, Voice } from 'vexflow';
import { staffStep } from '../music';
import type { Assessment, Exercise, ScoreEvent, SightReadingSettings } from './engine';
import { displayAccidentals } from './notation';
const durationCode:Record<number,string>={1920:'w',1440:'h',960:'h',720:'q',480:'q',360:'8',240:'8',160:'8',120:'16'};
const keyNames=['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#'];
type Position={id:string;tick:number;system:number;x:number;y:number};
export function Score({exercise,hands,tick,cursor,assessment,result}: {exercise:Exercise;hands:SightReadingSettings['hands'];tick:number;cursor:boolean;assessment:Assessment;result:boolean}) {
  const root=useRef<HTMLDivElement>(null);const container=useRef<HTMLDivElement>(null);const [width,setWidth]=useState(1000);const positions=useRef<Position[]>([]);const [layoutVersion,setLayoutVersion]=useState(0);const [error,setError]=useState('');
  const lastSystem=useRef(-1);
  useLayoutEffect(()=>{if(!container.current)return;const resize=new ResizeObserver(entries=>setWidth(entries[0].contentRect.width));resize.observe(container.current);return()=>resize.disconnect();},[]);
  useLayoutEffect(()=>{
    const host=root.current;if(!host)return;host.innerHTML='';positions.current=[];setError('');
    try{
      const perSystem=width<600?1:width<1000?2:4;
      const eventNotes=new Map<string,{note:StaveNote;ctx:ReturnType<Renderer['getContext']>;system:number}>();
      for(let first=0;first<exercise.bars;first+=perSystem){
        const count=Math.min(perSystem,exercise.bars-first);const system=Math.floor(first/perSystem);
        const div=document.createElement('div');div.className='score-system';div.dataset.system=String(system);host.appendChild(div);
        const scroll=document.createElement('div');scroll.className='score-system-scroll';div.appendChild(scroll);
        const canvas=document.createElement('div');canvas.className='score-system-canvas';scroll.appendChild(canvas);
        const cursorLine=document.createElement('div');cursorLine.className='score-cursor';cursorLine.style.display='none';canvas.appendChild(cursorLine);
        const rows=exercise.events.filter(e=>e.bar>=first&&e.bar<first+count);
        const upper=rows.filter(e=>e.hand==='right').flatMap(e=>e.notes.map(staffStep));
        const lower=rows.filter(e=>e.hand==='left').flatMap(e=>e.notes.map(staffStep));
        const topExtra=Math.max(0,(Math.max(8,...upper)-8)*5);
        const gapExtra=Math.max(0,-Math.min(0,...upper)*5)+Math.max(0,(Math.max(8,...lower)-8)*5);
        const bottomExtra=Math.max(0,-Math.min(0,...lower)*5);
        const topY=35+topExtra;const lowerY=topY+140+gapExtra;const height=lowerY+115+bottomExtra;
        const barWidths=Array.from({length:count},(_,i)=>{
          const events=rows.filter(e=>e.bar===first+i);const onsets=new Set(events.map(e=>e.tick)).size;
          return Math.max((width-30)/count,110+onsets*24+(i===0?95:25));
        });
        const fullWidth=barWidths.reduce((a,b)=>a+b,0)+24;
        const renderer=new Renderer(canvas,Renderer.Backends.SVG);renderer.resize(fullWidth,height);
        const ctx=renderer.getContext();ctx.setFillStyle('#243c32');ctx.setStrokeStyle('#243c32');
        let x=12;
        for(let index=0;index<count;index++){
          const bar=first+index;const barWidth=barWidths[index];const rightEvents=exercise.events.filter(e=>e.bar===bar&&e.hand==='right');const leftEvents=exercise.events.filter(e=>e.bar===bar&&e.hand==='left');
          const right=new Stave(x,topY,barWidth);const left=new Stave(x,lowerY,barWidth);
          for(const [stave,events] of [[right,rightEvents],[left,leftEvents]] as const){
            const previous=exercise.events.find(e=>e.bar===bar-1&&e.hand===events[0].hand);
            if(index===0){stave.addClef(events[0].clef).addKeySignature(keyNames[exercise.keyCount+7]);if(bar===0)stave.addTimeSignature(exercise.meter);}
            else if(previous?.clef!==events[0].clef)stave.addClef(events[0].clef);
            stave.setContext(ctx);
          }
          const noteStart=Math.max(right.getNoteStartX(),left.getNoteStartX());right.setNoteStartX(noteStart);left.setNoteStartX(noteStart);right.draw();left.draw();
          new StaveConnector(right,left).setType(StaveConnector.type.SINGLE_LEFT).setContext(ctx).draw();
          if(index===0)new StaveConnector(right,left).setType(StaveConnector.type.BRACE).setContext(ctx).draw();
          ctx.save();ctx.setFont('sans-serif',10,'');ctx.fillText(String(bar+1),x+5,topY+14);ctx.restore();
          const tuplets:Tuplet[]=[];const beams:Beam[]=[];
          const build=(events:ScoreEvent[])=>{
            const accidentalMap=displayAccidentals(events,exercise.keyCount);
            const notes=events.map(event=>{
              const dotted=[1440,720,360].includes(event.duration);
              const duration=durationCode[event.duration];if(!duration)throw new Error(`Unsupported duration: ${event.duration}`);
              const note=new StaveNote({clef:event.clef,keys:event.notes.length?event.notes.map(n=>`${n.letter.toLowerCase()}/${n.octave}`):[event.clef==='treble'?'b/4':'d/3'],duration:duration+(event.notes.length?'':'r'),auto_stem:true,dots:dotted?1:0});
              if(dotted)Dot.buildAndAttach([note],{all:true});
              accidentalMap.get(event.id)?.forEach((sign,i)=>{if(sign)note.addModifier(new Accidental(sign),i);});
              if(hands!=='both'&&hands!==event.hand)note.setStyle({fillStyle:'#bdc8bf',strokeStyle:'#bdc8bf'});
              eventNotes.set(event.id,{note,ctx,system});return note;
            });
            const tupletIds=[...new Set(events.map(e=>e.tuplet).filter(Boolean))];
            tupletIds.forEach(id=>{const group=notes.filter((_,i)=>events[i].tuplet===id);tuplets.push(new Tuplet(group,{num_notes:3,notes_occupied:2,bracketed:true}));});
            beams.push(...Beam.generateBeams(notes,{groups:exercise.groups.map(g=>new Fraction(g,Number(exercise.meter.split('/')[1]))),beam_rests:false}));
            const [num_beats,beat_value]=exercise.meter.split('/').map(Number);
            return new Voice({num_beats,beat_value}).addTickables(notes);
          };
          const rv=build(rightEvents);const lv=build(leftEvents);
          new Formatter().joinVoices([rv]).joinVoices([lv]).format([rv,lv],Math.max(80,x+barWidth-noteStart-20));
          rv.draw(ctx,right);lv.draw(ctx,left);beams.forEach(b=>b.setContext(ctx).draw());tuplets.forEach(t=>t.setContext(ctx).draw());
          for(const event of [...rightEvents,...leftEvents]){const n=eventNotes.get(event.id)!.note;positions.current.push({id:event.id,tick:event.tick,system,x:n.getAbsoluteX(),y:topY+30});}
          x+=barWidth;
        }
      }
      for(const event of exercise.events){if(!event.tieTo)continue;const first=eventNotes.get(event.id);const last=eventNotes.get(event.tieTo);if(!first||!last)continue;
        if(first.system===last.system)new StaveTie({first_note:first.note,last_note:last.note,first_indices:[0],last_indices:[0]}).setContext(first.ctx).draw();
        else {new StaveTie({first_note:first.note,first_indices:[0]}).setContext(first.ctx).draw();new StaveTie({last_note:last.note,last_indices:[0]}).setContext(last.ctx).draw();}
      }
      // Use SVG groups to make individual outcomes inspectable without rerendering notation.
      for(const [id,{note}] of eventNotes){const node=document.getElementById(`vf-${note.getAttribute('id')}`);if(node){node.setAttribute('data-event-id',id);node.classList.add('score-note');}}
      lastSystem.current=-1;setLayoutVersion(v=>v+1);
    }catch(err){setError(err instanceof Error?err.message:'無法繪製樂譜');}
  },[exercise,width,hands]);
  useLayoutEffect(()=>{
    if(!root.current)return;
    const matched=new Set(assessment.matches.map(m=>m.id));
    root.current.querySelectorAll<SVGGElement>('[data-event-id]').forEach(node=>{const id=node.dataset.eventId!;const event=exercise.events.find(e=>e.id===id)!;const assessed=event.notes.length>0&&!event.tieFrom&&(hands==='both'||hands===event.hand);const hits=event.notes.filter((_,i)=>matched.has(`${id}:${i}`)).length;node.classList.toggle('matched',assessed&&hits===event.notes.length);node.classList.toggle('partial',assessed&&hits>0&&hits<event.notes.length);node.classList.toggle('missed',result&&assessed&&hits===0);});
    root.current.querySelectorAll<HTMLDivElement>('.score-cursor').forEach(node=>{node.style.display='none';});
    if(tick<0||!cursor)return;
    const current=positions.current.filter(p=>p.tick<=tick).sort((a,b)=>b.tick-a.tick)[0];if(!current)return;
    const target=root.current.querySelector<HTMLDivElement>(`[data-system="${current.system}"] .score-system-canvas`);if(!target)return;
    const cursorLine=target.querySelector<HTMLDivElement>('.score-cursor');if(!cursorLine)return;cursorLine.style.display='block';cursorLine.style.left=`${current.x-4}px`;
    if(lastSystem.current!==current.system){lastSystem.current=current.system;target.closest('.score-system')?.scrollIntoView({block:'nearest',behavior:'smooth'});}
    const scroller=target.parentElement!;if(current.x<scroller.scrollLeft||current.x>scroller.scrollLeft+scroller.clientWidth-40)scroller.scrollLeft=Math.max(0,current.x-60);
  },[tick,cursor,assessment,result,layoutVersion,exercise,hands]);
  return <div className="sight-score" ref={container} aria-label="鋼琴視奏大譜表">{error&&<p role="alert">樂譜繪製失敗：{error}</p>}<div ref={root}/></div>;
}
