import { keyAlteration, writtenPitch } from '../grades';
import type { Note } from '../music';

export const TPQ = 480;
export type Hand = 'right' | 'left';
export type SightReadingSettings = { grade: number; mode: 'timed' | 'slow'; hands: 'both' | Hand; short: boolean; bpm: number; preview: number; metronome: boolean; cursor: boolean; latency: number };
export type SightReadingProfile = { grade: number; bars: number; keys: string[]; meters: string[]; chordSize: number; description: string };
const additions = [ ['C','G','F','Dm','Am'], ['D','Em','Gm'], ['A','Bb','Eb','Bm'], [], ['E','Ab','F#m','Cm'], ['C#m','Fm'], [], ['B','Db'] ];
const meterAdditions = [['2/4','3/4','4/4'],[],['3/8'],['6/8'],[],['9/8','5/8','5/4'],['7/8','7/4'],['12/8']];
const descriptions = ['五指位置、雙手輪流與基本節奏','雙手同奏、附點節奏與連結線','移位、雙音、十六分音符與 3/8','6/8、半音變化與獨立聲部','切分、四音同奏與更多調性','三連音、譜號切換與不規則拍','7/8、7/4 與更豐富聲部','12/8、每手三音和弦與完整樂句'];
export const sightProfiles: SightReadingProfile[] = Array.from({ length: 8 }, (_, i) => ({ grade:i+1, bars:[6,6,8,8,12,16,20,24][i], keys:additions.slice(0,i+1).flat(), meters:meterAdditions.slice(0,i+1).flat(), chordSize:i < 2 ? 1 : i < 7 ? 2 : 3, description:descriptions[i] }));
export const sightDefaults: SightReadingSettings = { grade:1, mode:'timed', hands:'both', short:false, bpm:60, preview:30, metronome:true, cursor:true, latency:0 };
export function sanitizeSight(value: Partial<SightReadingSettings>): SightReadingSettings {
  const s = { ...sightDefaults, ...value };
  if (!Number.isInteger(s.grade) || s.grade < 1 || s.grade > 8) s.grade = 1;
  s.bpm = Number.isFinite(s.bpm) ? Math.max(30, Math.min(160, Math.round(s.bpm))) : 60;
  s.preview = [0,15,30,60].includes(s.preview) ? s.preview : 30;
  s.latency = Number.isFinite(s.latency) ? Math.max(-200,Math.min(200,Math.round(s.latency))) : 0;
  if (!['timed','slow'].includes(s.mode)) s.mode = 'timed';
  if (!['both','left','right'].includes(s.hands)) s.hands = 'both';
  for (const k of ['short','metronome','cursor'] as const) if (typeof s[k] !== 'boolean') s[k] = sightDefaults[k];
  return s;
}
export type ScoreEvent = { id: string; hand: Hand; bar: number; tick: number; duration: number; notes: Note[]; clef: 'treble' | 'bass'; tuplet?: string; tieFrom?: string; tieTo?: string; wholeBarRest?: boolean };
export type PhraseMark = { from: string; to: string; hand: Hand };
export type DynamicMark = { eventId: string; value: 'p' | 'mp' | 'mf' };
export type Exercise = { id: string; grade: number; key: string; keyCount: number; meter: string; bars: number; barTicks: number; totalTicks: number; beatTicks: number; groups: number[]; events: ScoreEvent[]; phrases: PhraseMark[]; dynamics: DynamicMark[]; tempoText: string };
const keyInfo: Record<string, [number, string, boolean]> = { C:[0,'C',false],G:[1,'G',false],F:[-1,'F',false],Dm:[-1,'D',true],Am:[0,'A',true],D:[2,'D',false],Em:[1,'E',true],Gm:[-2,'G',true],A:[3,'A',false],Bb:[-2,'B',false],Eb:[-3,'E',false],Bm:[2,'B',true],E:[4,'E',false],Ab:[-4,'A',false],'F#m':[3,'F',true],Cm:[-3,'C',true],'C#m':[4,'C',true],Fm:[-4,'F',true],B:[5,'B',false],Db:[-5,'D',false] };
export function meterInfo(meter: string) {
  const [n,d] = meter.split('/').map(Number);
  const groups = d === 8 && n >= 6 && n % 3 === 0 ? Array(n / 3).fill(3) as number[] : n === 5 ? [3,2] : n === 7 ? [2,2,3] : Array(n).fill(1) as number[];
  const beatTicks = d === 8 && n >= 6 && n % 3 === 0 ? 720 : 1920 / d;
  return { barTicks:n * 1920 / d, beatTicks, groups };
}
export function beatLabel(ex: Exercise) { return ex.beatTicks === 720 ? '附點四分音符' : ex.beatTicks === 240 ? '八分音符' : '四分音符'; }
const pick = <T,>(values:T[], rng:()=>number) => values[Math.floor(rng() * values.length)];
export function seededRandom(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15,1 | seed); t = t + Math.imul(t ^ t >>> 7,61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

type Rhythm = { duration: number; rest?: boolean; triplet?: boolean };
// Templates are complete beat groups. Negative values denote a planned breath.
function rhythmGroup(ticks: number, grade: number, compound: boolean, variant: number, breath: boolean): Rhythm[] {
  let templates: number[][];
  if (ticks === 240) templates = grade >= 3 ? [[240],[120,120]] : [[240]];
  else if (ticks === 480) templates = grade >= 3 ? [[480],[240,240],[120,120,120,120],[360,120]] : [[480],[240,240]];
  else if (ticks === 720) templates = [[720],[480,240],[240,240,240],[240,480]];
  else if (ticks === 960) templates = grade >= 3 ? [[960],[480,480],[480,240,240],[240,240,480],[240,240,240,240],[480,120,120,120,120]] : [[960],[480,480],[480,240,240],[240,240,480]];
  else if (ticks === 1440) templates = [[1440],[960,480],[480,480,480],[480,480,240,240]];
  else templates = [[1920],[960,960]];
  if (grade >= 2 && ticks === 960) templates.push([720,240]);
  if (grade >= 5 && ticks === 960 && !compound) templates.push([240,480,240]);
  if (breath && ticks >= 480) templates = ticks === 720 ? [[480,-240],[240,240,-240]] : ticks === 960 ? [[480,-480],[240,240,-480]] : ticks === 1440 ? [[960,-480]] : [[240,-240]];
  const values = templates[variant % templates.length];
  if (grade >= 6 && !compound && !breath && ticks === 960 && variant % 5 === 0) return [160,160,160,480].map((duration,i)=>({duration,triplet:i<3}));
  return values.map(v=>({duration:Math.abs(v),rest:v<0}));
}
function rhythmBlocks(meter:string):number[] {
  const {barTicks,groups}=meterInfo(meter);const [n,d]=meter.split('/').map(Number);
  if(d===8)return groups.length===n && n===3 ? [720] : groups.map(g=>g*240);
  if(n===4)return [960,960];
  if(n===3)return [960,480];
  return n===2 ? [960] : groups.map(g=>g*480);
}
function closingRhythm(ticks:number,grade:number,meter?:string):Rhythm[] {
  if(grade===1&&ticks===1920)return [{duration:960},{duration:960}];
  if(meter&&['5/8','7/8','5/4','7/4','9/8','12/8'].includes(meter)){
    const values=meter==='9/8'?[1440,720]:meter==='12/8'?[1440,1440]:rhythmBlocks(meter);
    return values.map(duration=>({duration}));
  }
  const values:Rhythm[]=[];
  // Grade 1 has no whole-note attacks; whole-bar silence is a separate symbol.
  for(const value of grade===1?[1440,960,480,240]:[1920,1440,960,720,480,240])while(ticks>=value){values.push({duration:value});ticks-=value;}
  return values;
}
export function mergeRests(events:ScoreEvent[],meter:string):ScoreEvent[] {
  if(events.length && events.every(e=>!e.notes.length))return [{...events[0],duration:meterInfo(meter).barTicks,wholeBarRest:true,tuplet:undefined}];
  const boundaries=new Set<number>();let at=0;for(const block of rhythmBlocks(meter)){at+=block;boundaries.add(at);}
  const result:ScoreEvent[]=[];const start=events[0]?.tick??0;
  for(const event of events){const prev=result.at(-1);const total=(prev?.duration??0)+event.duration;
    if(prev&&!prev.notes.length&&!event.notes.length&&!prev.tuplet&&!event.tuplet&&!boundaries.has(event.tick-start)&&[240,360,480,720,960,1440,1920].includes(total))prev.duration=total;
    else result.push({...event});
  }return result;
}

export function generateExercise(settings: SightReadingSettings, seed = Math.floor(Math.random()*0xffffffff), force?: {key?:string;meter?:string}): Exercise {
  const p = sightProfiles[settings.grade-1]; const rng = seededRandom(seed);
  const key = force?.key ?? pick(p.keys,rng); const meter = force?.meter ?? pick(p.meters,rng);
  if (!p.keys.includes(key) || !p.meters.includes(meter)) throw new Error('調性或拍子超出級別');
  const [keyCount,tonic,minor] = keyInfo[key];
  const {barTicks,beatTicks,groups} = meterInfo(meter); const bars = settings.short ? 4 : p.bars;
  const events: ScoreEvent[] = [];
  const tonicIndex = 'CDEFGAB'.indexOf(tonic);
  // Registers remain disjoint, even with three-note chords and chromatic alterations.
  function scaleNote(degree: number, hand: Hand, harmonic = false): Note {
    const absolute = (hand === 'right' ? 4 : 3) * 7 + tonicIndex + degree;
    const letter = 'CDEFGAB'[((absolute % 7)+7)%7]; const octave = Math.floor(absolute/7);
    let alteration = keyAlteration(keyCount,letter);
    if (minor && harmonic && ((degree % 7)+7)%7 === 6) alteration++;
    const midi = writtenPitch(letter,octave,alteration);
    return { midi,letter,octave,alteration,accidental:'',clef:hand === 'right' ? 'treble' : 'bass',key:keyCount };
  }
  const contour=pick([[0,1,2,1,0,-1,0,1],[0,2,1,0,1,2,3,2],[0,-1,0,2,1,0,-1,0]],rng);
  const variant=Math.floor(rng()*100);
  const phrases:PhraseMark[]=[];const dynamics:DynamicMark[]=[];let melodyDegree=0;
  for (let bar=0;bar<bars;bar++) {
    const final=bar===bars-1;const cadence=bar===bars-2;
    const phraseEnd=(bar+1)%4===0;
    const dominant=cadence||(!final&&(bar%4===2||phraseEnd));
    const root=final?0:dominant?4:bar%4===1?3:0;
    for(const hand of ['right','left'] as const){
      const inactive=settings.grade===1&&(bar%2===0?hand==='left':hand==='right');
      const blocks=rhythmBlocks(meter);
      let pattern:Rhythm[];
      if(inactive)pattern=[{duration:barTicks,rest:true}];
      else if(final||phraseEnd)pattern=closingRhythm(barTicks,settings.grade,meter);
      else if(hand==='left'&&settings.grade>=2){
        // The accompaniment has its own slower harmonic rhythm.
        pattern=settings.grade===2?closingRhythm(barTicks,2,meter):blocks.flatMap((block,i)=>settings.grade>=4&&bar%2===1?rhythmGroup(block,2,meter.endsWith('/8'),variant+i,false):closingRhythm(block,2));
      }else pattern=blocks.flatMap((block,i)=>rhythmGroup(block,settings.grade,['6/8','9/8','12/8'].includes(meter),variant+bar%2*3+i,(bar%4===1)&&i===blocks.length-1));
      let offset=0;let lastDegree=hand==='right'?melodyDegree:root;
      const barEvents:ScoreEvent[]=[];
      for(let i=0;i<pattern.length;i++){
        const {duration,triplet,rest}=pattern[i];
        const groupStart=offset===0||blocks.slice(0,-1).some((_,k)=>blocks.slice(0,k+1).reduce((a,b)=>a+b,0)===offset);
        let degree:number;
        if(settings.grade<3){
          degree=final?0:dominant?4:Math.max(0,Math.min(4,contour[(i+bar%2*2)%contour.length]+2));
          if(settings.grade===2&&(hand==='left'||groupStart))degree=final?0:root;
        }else if(hand==='left'){
          const bass=root===4?-3:root===3?-4:0;
          degree=bass+(settings.grade>=4?[0,4,2,4][i%4]:0);
          if(final)degree=0;
        }else{
          const chordDegrees=[root,root+2,root+4,root+7,root+9,root+11].filter(d=>d<=11);
          const desired=Math.max(0,Math.min(11,lastDegree+contour[(i+bar%2)%contour.length]));
          degree=groupStart?chordDegrees.reduce((a,b)=>Math.abs(a-desired)<=Math.abs(b-desired)?a:b):desired;
          if((cadence||phraseEnd)&&i===pattern.length-1)degree=6;
          if(settings.grade>=4&&i===2&&bar%4===0&&!final&&!cadence)degree=lastDegree;
          if(final)degree=7;
        }
        lastDegree=degree;
        const maxChord=settings.grade<3?1:settings.grade<5?(bar%2===0?(hand==='right'?2:1):(hand==='left'?2:1)):p.chordSize;
        const chord=!rest&&(final||(groupStart&&bar%2===0&&(hand==='left'||bar%4===2)))?maxChord:1;
        const notes:Note[]=[];
        if(!rest)for(let j=0;j<chord;j++){
          const voicedDegree=hand==='left'?Math.min(degree,6-2*(chord-1)):degree;
          const note=scaleNote(voicedDegree+j*2,hand,dominant);
          // Occasional chromatic neighbour, resolving by step in the same bar.
          if(settings.grade>=4&&hand==='right'&&!groupStart&&!final&&!cadence&&i===1&&pattern.length>2&&bar%4===0){note.alteration=Math.max(-1,Math.min(1,(note.alteration??0)-1));note.midi=writtenPitch(note.letter,note.octave,note.alteration);}
          notes.push(note);
        }
        barEvents.push({id:`${hand}-${bar}-${i}`,hand,bar,tick:bar*barTicks+offset,duration,notes,clef:hand==='right'?'treble':'bass',wholeBarRest:inactive||undefined,tuplet:triplet?`${hand}-${bar}-${Math.floor(offset/480)}-triplet`:undefined});
        offset+=duration;
      }
      if(hand==='right'&&barEvents.some(e=>e.notes.length))melodyDegree=lastDegree;
      const highest=Math.max(...barEvents.flatMap(e=>e.notes.map(n=>n.midi)));
      const clef=settings.grade>=6&&hand==='left'&&highest>=64?'treble':hand==='right'?'treble':'bass';
      for(const event of barEvents){event.clef=clef;event.notes.forEach(n=>n.clef=clef);}
      events.push(...mergeRests(barEvents,meter));
    }
  }
  // Tie only genuine repeated pitches; never change harmony to manufacture a tie.
  if(settings.grade>=2)for(const hand of ['right','left'] as const)for(let bar=1;bar<bars-1;bar+=4){
    const before=events.filter(e=>e.hand===hand&&e.bar===bar-1).at(-1)!;const next=events.find(e=>e.hand===hand&&e.bar===bar)!;
    if(before.notes.length===1&&next.notes.length===1&&!before.tuplet&&!next.tuplet&&before.clef===next.clef&&before.notes[0].midi===next.notes[0].midi){before.tieTo=next.id;next.tieFrom=before.id;}
  }
  for(const hand of ['right','left'] as const){
    let segment:ScoreEvent[]=[];
    const flush=()=>{if(segment.length>1)phrases.push({from:segment[0].id,to:segment.at(-1)!.id,hand});segment=[];};
    for(const event of events.filter(e=>e.hand===hand)){
      if(!event.notes.length){flush();continue;}
      if(segment.length&&Math.floor(segment[0].bar/2)!==Math.floor(event.bar/2))flush();
      segment.push(event);
    }flush();
  }
  for(let bar=0;bar<bars;bar+=4){const event=events.find(e=>e.bar>=bar&&e.notes.length);if(event)dynamics.push({eventId:event.id,value:bar===0?'mp':bar+4>=bars?'p':'mf'});}

  return {id:`sr-${seed}-${settings.grade}-${key}-${meter}`,grade:settings.grade,key,keyCount,meter,bars,barTicks,totalTicks:bars*barTicks,beatTicks,groups,events,phrases,dynamics,tempoText:settings.grade<3?'Andante cantabile':'Moderato'};
}

export type ExpectedNote = { id: string; eventId: string; midi:number; tick:number; hand:Hand };
export function expectedNotes(ex:Exercise,hands:SightReadingSettings['hands']):ExpectedNote[] {
  return ex.events.filter(e=>!e.tieFrom && (hands==='both'||hands===e.hand)).flatMap(e=>e.notes.map((n,i)=>({id:`${e.id}:${i}`,eventId:e.id,midi:n.midi,tick:e.tick,hand:e.hand}))).sort((a,b)=>a.tick-b.tick);
}
export const secondsPerTick = (ex:Exercise,bpm:number) => 60/bpm/ex.beatTicks;
export type Match = { id:string; deltaMs:number; onTime:boolean };
export type Assessment = { matches:Match[]; extras:number; wrong:number };
export const emptyAssessment = ():Assessment => ({matches:[],extras:0,wrong:0});
export function assessInput(expected:ExpectedNote[],state:Assessment,midi:number,timeSeconds:number,ex:Exercise,bpm:number):Assessment {
  const beatMs = 60000/bpm; const broad=Math.max(120,Math.min(300,beatMs*.5)); const tight=Math.max(80,Math.min(180,beatMs*.2));
  const tickSeconds=secondsPerTick(ex,bpm); const used=new Set(state.matches.map(m=>m.id));
  const candidates = expected.filter(n=>n.midi===midi && !used.has(n.id)).map(n=>({n,deltaMs:(timeSeconds-n.tick*tickSeconds)*1000})).filter(n=>Math.abs(n.deltaMs)<=broad).sort((a,b)=>Math.abs(a.deltaMs)-Math.abs(b.deltaMs));
  if(candidates.length) { const {n,deltaMs}=candidates[0]; return {...state,matches:[...state.matches,{id:n.id,deltaMs,onTime:Math.abs(deltaMs)<=tight}]}; }
  const wrong=expected.some(n=>!used.has(n.id)&&Math.abs(timeSeconds-n.tick*tickSeconds)*1000<=broad);
  return {...state,extras:state.extras+1,wrong:state.wrong+(wrong?1:0)};
}
export type PerformanceResult = { id:string; exerciseId:string; grade:number; mode:'timed'|'slow'; hands:SightReadingSettings['hands']; bpm:number; completedAt:string; listened:boolean; expected:number; matched:number; missed:number; extras:number; wrong:number; pitchScore:number; rhythmScore:number|null };
export function summarize(ex:Exercise,s:SightReadingSettings,state:Assessment,listened:boolean):PerformanceResult {
  const total=expectedNotes(ex,s.hands).length; const matched=state.matches.length;
  return {id:crypto.randomUUID(),exerciseId:ex.id,grade:ex.grade,mode:s.mode,hands:s.hands,bpm:s.bpm,completedAt:new Date().toISOString(),listened,expected:total,matched,missed:Math.max(0,total-matched),extras:state.extras,wrong:state.wrong,pitchScore:Math.round(matched/Math.max(1,total+state.extras)*100),rhythmScore:s.mode==='slow'?null:Math.round(state.matches.filter(m=>m.onTime).length/Math.max(1,total)*100)};
}
export function slowInput(expected:ExpectedNote[],state:Assessment,midi:number):Assessment {
  const used=new Set(state.matches.map(m=>m.id)); const remaining=expected.filter(n=>!used.has(n.id));
  if(!remaining.length)return state;
  const group=remaining.filter(n=>n.tick===remaining[0].tick); const found=group.find(n=>n.midi===midi);
  return found?{...state,matches:[...state.matches,{id:found.id,deltaMs:0,onTime:false}]}:{...state,extras:state.extras+1,wrong:state.wrong+1};
}
