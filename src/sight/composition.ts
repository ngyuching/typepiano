import { keyAlteration, writtenPitch } from '../grades';
import type { Note } from '../music';
import { closingRhythm, keyInfo, mergeRests, meterInfo, rhythmBlocks, seededRandom, sightProfiles } from './engine';
import type { Exercise, Hand, Rhythm, ScoreEvent, SightReadingSettings } from './engine';

export const GENERATOR_VERSION = 2;
export const motifs = [
  [0,1,2,1,0], [0,2,1,2,0], [2,1,0,1,2], [0,1,0,2,1],
  [0,2,3,2,1], [2,0,1,2,0], [0,-1,0,1,2], [1,2,1,0,-1],
  [0,1,3,2,1], [2,3,2,0,1], [0,0,1,2,1], [1,0,2,1,0],
  [0,2,1,-1,0], [2,1,3,2,0], [0,1,2,0,1], [1,3,2,1,0],
];
type Template = { values:number[]; minGrade:number };
const t=(minGrade:number,...values:number[]):Template=>({values,minGrade});
// Complete groups; silence is deliberately placed at phrase breaths, not per-note random.
export const rhythmCatalogue:Record<number,Template[]> = {
  240:[t(3,240),t(3,120,120),t(3,120,-120),t(3,-120,120),t(3,-240),t(6,80,80,80)],
  480:[t(1,480),t(1,240,240),t(1,240,-240),t(1,-240,240),t(3,120,120,240),t(3,240,120,120),t(3,120,120,120,120),t(3,360,120),t(5,120,240,120),t(6,160,160,160)],
  720:[t(3,720),t(3,480,240),t(3,240,480),t(3,240,240,240),t(3,480,-240),t(3,240,240,-240),t(3,-240,240,240),t(3,240,120,120,240),t(3,120,120,240,240)],
  960:[t(1,960),t(1,480,480),t(1,480,240,240),t(1,240,240,480),t(1,240,240,240,240),t(1,480,-480),t(1,240,240,-480),t(2,720,240),t(3,480,120,120,120,120),t(3,240,120,120,480),t(5,240,480,240),t(6,160,160,160,480),t(6,480,160,160,160)],
  1440:[t(6,1440),t(6,960,480),t(6,480,960),t(6,480,480,480),t(6,720,240,480),t(6,480,240,240,480),t(6,960,-480),t(6,480,480,-480),t(6,240,240,480,480)],
};
export type Accompaniment = 'sustain'|'pulse'|'broken'|'bass-chord';
export type PhrasePlan = { start:number; length:number; role:'question'|'answer'|'contrast'|'coda'; motif:number; transform:'original'|'reverse'|'invert'|'sequence'; rhythmSeed:number; climax:number; accompaniment:Accompaniment };
export type CompositionPlan = { phrases:PhrasePlan[]; harmony:number[]; motifIds:number[]; accompaniment:Accompaniment };
const choose=<T,>(xs:readonly T[],rng:()=>number):T=>xs[Math.floor(rng()*xs.length)];
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const near=(xs:number[],value:number)=>xs.reduce((a,b)=>Math.abs(a-value)<=Math.abs(b-value)?a:b);

export function compositionPlan(grade:number,bars:number,rng:()=>number):CompositionPlan {
  const first=Math.floor(rng()*motifs.length);const second=(first+1+Math.floor(rng()*(motifs.length-1)))%motifs.length;
  const accompaniment=choose<Accompaniment>(grade<3?['sustain','pulse']:['sustain','pulse','broken','bass-chord'],rng);
  const lengths=bars===4?[2,2]:bars===6?[4,2]:Array(bars/4).fill(4);
  const phrases:PhrasePlan[]=[];const harmony:number[]=[];let start=0;
  for(let index=0;index<lengths.length;index++){
    const length=lengths[index];const last=index===lengths.length-1;
    const role:PhrasePlan['role']=last?(bars===6?'coda':'answer'):index%3===2?'contrast':index%2===0?'question':'answer';
    const isContrast=role==='contrast';
    const transform=index===0?'original':choose<PhrasePlan['transform']>(['reverse','invert','sequence'],rng);
    phrases.push({start,length,role,motif:isContrast?second:first,transform,rhythmSeed:Math.floor(rng()*65536),climax:start+Math.floor(rng()*Math.max(1,length-1)),accompaniment:isContrast?choose<Accompaniment>(grade<3?['pulse','sustain']:['broken','bass-chord','sustain'],rng):accompaniment});
    const options=length===2?[[0,4],[3,4],[0,0]]:[[0,3,4,4],[0,0,3,4],[0,4,0,4],[0,3,0,4],[0,0,4,4]];
    const progression=[...choose(options,rng)];
    if(role==='answer'||role==='coda'){progression[length-2]=4;progression[length-1]=0;}
    else progression[length-1]=4;
    harmony.push(...progression);start+=length;
  }
  return {phrases,harmony,motifIds:[first,second],accompaniment};
}

export function rhythmForGroup(ticks:number,grade:number,variant:number,breath=false,compound=false):Rhythm[] {
  let candidates=rhythmCatalogue[ticks].filter(v=>v.minGrade<=grade&&(!v.values.some(n=>n<0)||breath));
  if(compound)candidates=candidates.filter(v=>!v.values.some(n=>n===80||n===160));
  if(breath){const withRest=candidates.filter(v=>v.values.at(-1)!<0);if(withRest.length)candidates=withRest;}
  const values=candidates[variant%candidates.length].values;
  return values.map(v=>({duration:Math.abs(v),rest:v<0,triplet:Math.abs(v)===160||Math.abs(v)===80}));
}

/** Composition choices are made first; rendering, audio and assessment share the resulting events. */
export function composeExercise(settings:SightReadingSettings,seed:number,force?:{key?:string;meter?:string}):Exercise {
  const profile=sightProfiles[settings.grade-1],rng=seededRandom(seed);
  // Consume both draws even when forced, so seed + key + meter reproduces a selected candidate.
  const drawnKey=choose(profile.keys,rng),drawnMeter=choose(profile.meters,rng);
  const key=force?.key??drawnKey,meter=force?.meter??drawnMeter;
  if(!profile.keys.includes(key)||!profile.meters.includes(meter))throw Error('調性或拍子超出級別');
  const [keyCount,tonic,minor]=keyInfo[key];const tonicIndex='CDEFGAB'.indexOf(tonic);
  const {barTicks,beatTicks,groups}=meterInfo(meter),bars=settings.short?4:profile.bars;
  const composition=compositionPlan(settings.grade,bars,rng),events:ScoreEvent[]=[];
  const maxDegree=settings.grade<3?4:settings.grade<5?7:11;
  const note=(degree:number,hand:Hand,dominant:boolean):Note=>{
    const absolute=(hand==='right'?4:3)*7+tonicIndex+degree;
    const letter='CDEFGAB'[(absolute%7+7)%7],octave=Math.floor(absolute/7);
    const alteration=keyAlteration(keyCount,letter)+(minor&&dominant&&(degree%7+7)%7===6?1:0);
    return {midi:writtenPitch(letter,octave,alteration),letter,octave,alteration,accidental:'',clef:hand==='right'?'treble':'bass',key:keyCount};
  };
  let lastMelody=0,lastMotion=0;
  for(let bar=0;bar<bars;bar++){
    const phrase=composition.phrases.find(p=>bar>=p.start&&bar<p.start+p.length)!;
    const position=bar-phrase.start,phraseEnd=position===phrase.length-1,final=bar===bars-1,cadence=bar===bars-2;
    const root=composition.harmony[bar],dominant=root===4,blocks=rhythmBlocks(meter);
    for(const hand of ['right','left'] as const){
      const inactive=settings.grade===1&&(bar%2===0?hand==='left':hand==='right');
      let pattern:Rhythm[];
      if(inactive)pattern=[{duration:barTicks,rest:true}];
      else if(final||phraseEnd)pattern=closingRhythm(barTicks,settings.grade,meter);
      else if(hand==='left'&&settings.grade>=2){
        pattern=phrase.accompaniment==='sustain'?closingRhythm(barTicks,settings.grade,meter):blocks.flatMap((b,i)=>{
          const simple=closingRhythm(b,settings.grade);
          return phrase.accompaniment==='broken'&&settings.grade>=4&&b<=960?rhythmForGroup(b,b===720?3:2,phrase.rhythmSeed+position+i,false):simple;
        });
      }else pattern=blocks.flatMap((b,i)=>rhythmForGroup(b,settings.grade,phrase.rhythmSeed+position*7+i*3,position===phrase.length-2&&i===blocks.length-1&&!cadence,['6/8','9/8','12/8'].includes(meter)));
      if(hand==='left'&&settings.grade>=2&&pattern.filter(r=>!r.rest).length>events.filter(e=>e.bar===bar&&e.hand==='right'&&e.notes.length).length)pattern=closingRhythm(barTicks,settings.grade,meter);
      let offset=0;const degrees:number[]=[];
      const chordTones=Array.from({length:maxDegree+1},(_,i)=>i).filter(d=>[0,2,4].includes((d-root+14)%7));
      let contour=[...motifs[phrase.motif]];
      if(phrase.transform==='reverse')contour.reverse();
      if(phrase.transform==='invert')contour=contour.map(d=>-d);
      const inversion=settings.grade>=3?(phrase.rhythmSeed+position)%3:0;
      for(let i=0;i<pattern.length;i++){
        let degree:number;
        if(hand==='left'){
          if(settings.grade<3)degree=final?0:root===4?4:root===3?3:0;
          else {
            const bass=root===4?-3:root===3?-4:0;
            degree=bass+(phrase.accompaniment==='broken'?[0,2,4,2][(i+position)%4]:phrase.accompaniment==='bass-chord'&&i>0?2*inversion:0);
            if(final)degree=0;
          }
        }else{
          const high=bar===phrase.climax?2:0;
          const desired=clamp((settings.grade<3?1:2)+high+contour[(i+position)%contour.length]+(phrase.transform==='sequence'?position%2:0),0,maxDegree);
          degree=near(chordTones,desired);
          if(i===0&&bar===0)degree=0;
          if(settings.grade>=3&&Math.abs(degree-lastMelody)>3&&!cadence&&!final)degree=near(chordTones,clamp(lastMelody+Math.sign(degree-lastMelody)*2,0,maxDegree));
          if(Math.abs(lastMotion)>2&&!cadence&&!final){const returning=chordTones.filter(d=>Math.sign(d-lastMelody)===-Math.sign(lastMotion)&&Math.abs(d-lastMelody)<=2);if(returning.length)degree=near(returning,desired);}
          if(cadence&&settings.grade>=3)degree=i===pattern.length-1?6:near([2,4,6],clamp(4+Math.floor(i*2/Math.max(1,pattern.length-1)),2,6));
          if(phraseEnd&&phrase.role==='question'&&i===pattern.length-1)degree=4;
          if(phraseEnd&&(phrase.role==='answer'||phrase.role==='coda'))degree=settings.grade<3?0:7;
          if(final)degree=settings.grade<3?0:7;
        }
        degrees.push(degree);if(!pattern[i].rest&&hand==='right'){lastMotion=degree-lastMelody;lastMelody=degree;}
      }
      // Short weak-position neighbours return to the planned chord tone on the next attack.
      if(hand==='right'&&!final&&!cadence&&!phraseEnd)for(let i=1;i<pattern.length-1;i++){
        const at=pattern.slice(0,i).reduce((a,b)=>a+b.duration,0);
        if(!pattern[i].rest&&!pattern[i+1].rest&&pattern[i].duration<=240&&at%beatTicks!==0&&i%2===1){
          const next=degrees[i+1],candidate=next+(contour[i%contour.length]>=0?1:-1);
          if(candidate>=0&&candidate<=maxDegree&&Math.abs(candidate-degrees[i-1])<=2&&Math.abs(note(candidate,hand,dominant).midi-note(next,hand,dominant).midi)<=2)degrees[i]=candidate;
        }
      }
      const barEvents:ScoreEvent[]=[];let tripletRun=0,tripletStart=0;
      for(let i=0;i<pattern.length;i++){
        const r=pattern[i];const groupStart=offset===0||blocks.slice(0,-1).some((_,k)=>blocks.slice(0,k+1).reduce((a,b)=>a+b,0)===offset);
        if(r.triplet){if(tripletRun%3===0)tripletStart=i;tripletRun++;}else tripletRun=0;
        const chordAllowed=settings.grade>=3&&(final||(hand==='left'&&phrase.accompaniment==='bass-chord'&&i>0)||(groupStart&&bar%2===0));
        const chordSize=chordAllowed?(settings.grade<5?(hand==='right'&&bar%2===0?2:hand==='left'&&bar%2===1?2:1):profile.chordSize):1;
        let voicing=[degrees[i]];
        if(chordSize>1){
          const tones=Array.from({length:hand==='left'?14:22},(_,j)=>j+(hand==='left'?-7:0)).filter(d=>[0,2,4].includes((d-root+28)%7));
          // Consecutive tones of the current harmony give root position or an inversion.
          const starts=tones.slice(0,-chordSize+1);
          const base=near(starts,degrees[i]);const at=tones.indexOf(base);voicing=tones.slice(at,at+chordSize);
        }
        const notes=r.rest?[]:voicing.map(degree=>note(degree,hand,dominant));
        if(settings.grade>=4&&hand==='right'&&notes.length===1&&!final&&!cadence&&!phraseEnd&&i%2===1&&i+1<pattern.length&&!pattern[i+1].rest&&Math.abs(degrees[i]-degrees[i+1])===1&&offset%beatTicks!==0&&bar===phrase.start){
          const next=note(degrees[i+1],hand,dominant),n=notes[0];
          const desired=next.midi+Math.sign(degrees[i]-degrees[i+1]);const alteration=n.alteration!+desired-n.midi;
          if(Math.abs(alteration)<=1){n.alteration=alteration;n.midi=writtenPitch(n.letter,n.octave,alteration);}
        }
        barEvents.push({id:`${hand}-${bar}-${i}`,hand,bar,tick:bar*barTicks+offset,duration:r.duration,notes,clef:hand==='right'?'treble':'bass',wholeBarRest:inactive||undefined,tuplet:r.triplet?`${hand}-${bar}-${tripletStart}-triplet`:undefined});
        offset+=r.duration;
      }
      const highest=Math.max(...barEvents.flatMap(e=>e.notes.map(n=>n.midi)));
      const clef=settings.grade>=6&&hand==='left'&&highest>=64?'treble':hand==='right'?'treble':'bass';
      for(const event of barEvents){event.clef=clef;event.notes.forEach(n=>n.clef=clef);}
      events.push(...mergeRests(barEvents,meter));
    }
  }
  // Sustain may legitimately repeat; a moving melodic bar must develop instead.
  for(const hand of ['right','left'] as const)for(let bar=1;bar<bars-2;bar++){
    const before=events.filter(e=>e.hand===hand&&e.bar===bar-1),current=events.filter(e=>e.hand===hand&&e.bar===bar);
    const signature=(es:ScoreEvent[])=>JSON.stringify(es.map(e=>[e.duration,e.notes.map(n=>n.midi)]));
    if(signature(before)!==signature(current)||current.filter(e=>e.notes.length).length<2)continue;
    if(hand==='left'&&composition.phrases.find(p=>bar>=p.start&&bar<p.start+p.length)!.accompaniment==='sustain')continue;
    const target=current.find(e=>e.notes.length===1&&e.duration>=240);
    if(target){const root=composition.harmony[bar],n=target.notes[0],degree=n.octave*7+'CDEFGAB'.indexOf(n.letter)-(hand==='right'?4:3)*7-tonicIndex;
      const allowed=Array.from({length:hand==='right'?maxDegree+1:7},(_,i)=>i).filter(d=>[0,2,4].includes((d-root+14)%7)&&d!==degree);
      if(allowed.length)target.notes=[{...note(near(allowed,degree),hand,root===4),clef:target.clef}];
    }
  }
  // Genuine repeated pitches only: no synthetic attacks for tied continuations.
  if(settings.grade>=2)for(const hand of ['right','left'] as const)for(let bar=1;bar<bars-1;bar++){
    const previous=events.filter(e=>e.hand===hand&&e.bar===bar-1).at(-1)!,next=events.find(e=>e.hand===hand&&e.bar===bar)!;
    if(previous.notes.length===1&&next.notes.length===1&&!previous.tuplet&&!next.tuplet&&previous.clef===next.clef&&previous.notes[0].midi===next.notes[0].midi&&bar%2===1){previous.tieTo=next.id;next.tieFrom=previous.id;}
  }
  const phrases:Exercise['phrases']=[],dynamics:Exercise['dynamics']=[];
  for(const plan of composition.phrases){
    for(const hand of ['right','left'] as const){let segment:ScoreEvent[]=[];
      const flush=()=>{if(segment.length>1)phrases.push({from:segment[0].id,to:segment.at(-1)!.id,hand});segment=[];};
      for(const event of events.filter(e=>e.hand===hand&&e.bar>=plan.start&&e.bar<plan.start+plan.length)){
        if(!event.notes.length){flush();continue;}segment.push(event);
      }flush();
    }
    const entry=events.find(e=>e.bar>=plan.start&&e.bar<plan.start+plan.length&&e.notes.length);
    const peak=events.find(e=>e.bar===plan.climax&&e.notes.length&&e.hand==='right');
    if(entry)dynamics.push({eventId:entry.id,value:plan.role==='contrast'?'mf':'mp'});
    if(peak&&peak.id!==entry?.id)dynamics.push({eventId:peak.id,value:'mf'});
    if(plan.role==='answer'||plan.role==='coda'){const close=events.find(e=>e.bar===plan.start+plan.length-1&&e.notes.length);if(close)dynamics.push({eventId:close.id,value:'p'});}
  }
  return {id:`sr-v${GENERATOR_VERSION}-${seed}-${settings.grade}-${key}-${meter}`,seed,generatorVersion:GENERATOR_VERSION,composition,grade:settings.grade,key,keyCount,meter,bars,barTicks,totalTicks:barTicks*bars,beatTicks,groups,events,phrases,dynamics,tempoText:settings.grade<3?'Andante cantabile':'Moderato'};
}
