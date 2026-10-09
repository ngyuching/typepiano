import { composeExercise } from './composition';
import type { CompositionPlan } from './composition';
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
export type Exercise = { id: string; grade: number; key: string; keyCount: number; meter: string; bars: number; barTicks: number; totalTicks: number; beatTicks: number; groups: number[]; events: ScoreEvent[]; phrases: PhraseMark[]; dynamics: DynamicMark[]; tempoText: string; seed: number; generatorVersion: number; composition: CompositionPlan };
export const keyInfo: Record<string, [number, string, boolean]> = { C:[0,'C',false],G:[1,'G',false],F:[-1,'F',false],Dm:[-1,'D',true],Am:[0,'A',true],D:[2,'D',false],Em:[1,'E',true],Gm:[-2,'G',true],A:[3,'A',false],Bb:[-2,'B',false],Eb:[-3,'E',false],Bm:[2,'B',true],E:[4,'E',false],Ab:[-4,'A',false],'F#m':[3,'F',true],Cm:[-3,'C',true],'C#m':[4,'C',true],Fm:[-4,'F',true],B:[5,'B',false],Db:[-5,'D',false] };
export function meterInfo(meter: string) {
  const [n,d] = meter.split('/').map(Number);
  const groups = d === 8 && n >= 6 && n % 3 === 0 ? Array(n / 3).fill(3) as number[] : n === 5 ? [3,2] : n === 7 ? [2,2,3] : Array(n).fill(1) as number[];
  const beatTicks = d === 8 && n >= 6 && n % 3 === 0 ? 720 : 1920 / d;
  return { barTicks:n * 1920 / d, beatTicks, groups };
}
export function beatLabel(ex: Exercise) { return ex.beatTicks === 720 ? '附點四分音符' : ex.beatTicks === 240 ? '八分音符' : '四分音符'; }
export function seededRandom(seed: number) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15,1 | seed); t = t + Math.imul(t ^ t >>> 7,61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export type Rhythm = { duration: number; rest?: boolean; triplet?: boolean };
export function rhythmBlocks(meter:string):number[] {
  const {barTicks,groups}=meterInfo(meter);const [n,d]=meter.split('/').map(Number);
  if(d===8)return groups.length===n && n===3 ? [720] : groups.map(g=>g*240);
  if(n===4)return [960,960];
  if(n===3)return [960,480];
  return n===2 ? [960] : groups.map(g=>g*480);
}
export function closingRhythm(ticks:number,grade:number,meter?:string):Rhythm[] {
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
  return composeExercise(settings, seed, force);
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
