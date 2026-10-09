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
export type ScoreEvent = { id: string; hand: Hand; bar: number; tick: number; duration: number; notes: Note[]; clef: 'treble' | 'bass'; tuplet?: string; tieFrom?: string; tieTo?: string };
export type Exercise = { id: string; grade: number; key: string; keyCount: number; meter: string; bars: number; barTicks: number; totalTicks: number; beatTicks: number; groups: number[]; events: ScoreEvent[] };
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

function rhythms(grade: number, meter: string, bar: number, rng:()=>number): { duration:number; triplet?: boolean }[] {
  const {barTicks} = meterInfo(meter);
  // Whole-bar alternatives allow minims and dotted minims in the earliest grade.
  if (grade >= 2 && barTicks === 1920 && bar % 4 === 3) return [{duration:1920}];
  if (barTicks === 1440 && bar % 4 === 3) return [{duration:1440}];
  if (barTicks === 960 && bar % 4 === 3) return [{duration:960}];
  const result: {duration:number;triplet?:boolean}[] = [];
  let remaining = barTicks;
  while (remaining > 0) {
    let pattern: number[];
    let triplet = false;
    if (grade >= 6 && meter.endsWith('/4') && remaining >= 480 && bar % 3 === 1 && result.length === 0) { pattern = [160,160,160]; triplet = true; }
    else if (grade >= 5 && remaining >= 960 && bar % 4 === 1 && result.length === 0) pattern = [240,480,240];
    else if (meter.endsWith('/8') && ['6/8','9/8','12/8'].includes(meter) && remaining >= 720) pattern = pick([[720],[480,240],[240,240,240],[240,480]],rng);
    else if (grade >= 2 && remaining >= 960 && rng() < .16) pattern = [720,240];
    else if (remaining >= 960 && rng() < .18) pattern = [960];
    else {
      const unit = meter.endsWith('/8') ? 240 : 480;
      const size = Math.min(unit,remaining);
      pattern = size === 480 ? pick(grade >= 3 ? [[480],[240,240],[120,120,120,120],[360,120]] : [[480],[240,240]],rng) : grade >= 3 ? pick([[240],[120,120]],rng) : [240];
    }
    pattern.forEach(duration => result.push({duration,triplet})); remaining -= pattern.reduce((a,b)=>a+b,0);
  }
  return result;
}
function closingRhythm(ticks:number,grade:number):{duration:number;triplet?:boolean}[] { if(grade===1&&ticks===1920)return [{duration:960},{duration:960}];const values:number[]=[];for(const value of [1920,1440,960,720,480,240])while(ticks>=value){values.push(value);ticks-=value;}return values.map(duration=>({duration})); }

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
    const absolute = (hand === 'right' ? 4 : 2) * 7 + tonicIndex + degree;
    const letter = 'CDEFGAB'[((absolute % 7)+7)%7]; const octave = Math.floor(absolute/7);
    let alteration = keyAlteration(keyCount,letter);
    if (minor && harmonic && ((degree % 7)+7)%7 === 6) alteration++;
    const midi = writtenPitch(letter,octave,alteration);
    return { midi,letter,octave,alteration,accidental:'',clef:hand === 'right' ? 'treble' : 'bass',key:keyCount };
  }
  const motive = [0,1,2,1,3,2,1,0];
  for (let bar=0;bar<bars;bar++) {
    const final = bar === bars-1; const dominant = bar === bars-2 || bar%4 === 2;
    const progression = final ? 0 : dominant ? 4 : bar%4 === 1 ? 3 : 0;
    for (const hand of ['right','left'] as const) {
      const shift = settings.grade>=6 ? (bar%6===4 ? 12 : bar%6===5 ? -12 : 0) : 0;
      const clef = hand==='left' && shift===12 ? 'treble' : hand==='right' && shift===-12 ? 'bass' : hand==='right'?'treble':'bass';
      const pattern = final ? closingRhythm(barTicks,settings.grade) : rhythms(settings.grade,meter,hand === 'left' && settings.grade>=4 ? bar+1 : bar,rng);
      let offset=0;
      for (let i=0;i<pattern.length;i++) {
        const {duration,triplet} = pattern[i];
        const inactive = settings.grade === 1 && (bar%2 === 0 ? hand === 'left' : hand === 'right');
        const rest = inactive || (!final && !triplet && i>0 && rng()<.08);
        let degree = settings.grade < 3 ? motive[(i+bar%2)%motive.length] : hand === 'left' ? progression + [0,2,4,2][i%4] : progression + motive[(i+bar)%motive.length];
        if (final) degree=0;
        if (dominant && hand === 'right' && settings.grade>=2 && i===pattern.length-1) degree = 6;
        // Grade 1 keeps every written note within its fixed five-finger position.
        if (settings.grade===1) degree = Math.min(degree,4);
        const maxChord = settings.grade === 3 || settings.grade === 4 ? (bar%2===0 ? hand==='right' ? 2 : 1 : hand==='left' ? 2 : 1) : p.chordSize;
        const chord = !rest && settings.grade>=3 && (final || (i===0 && bar%2===0)) ? maxChord : 1;
        const notes:Note[] = [];
        if (!rest) for(let j=0;j<chord;j++) {
          const note = scaleNote(degree+j*2,hand,dominant);
          if (settings.grade>=4 && !final && i===1 && j===0 && bar%4===2) {
            note.alteration = Math.max(-1,Math.min(1,(note.alteration ?? 0)+(minor ? 1 : -1)));
            note.midi = writtenPitch(note.letter,note.octave,note.alteration);
          }
          note.midi+=shift;note.octave+=shift/12;note.clef = clef; notes.push(note);
        }
        const id = `${hand}-${bar}-${i}`;
        events.push({id,hand,bar,tick:bar*barTicks+offset,duration,notes,clef,tuplet:triplet?`${hand}-${bar}-triplet`:undefined});
        offset+=duration;
      }
    }
  }
  // Split a repeated pitch across a barline: notation and playback share the same tie.
  if(settings.grade>=2) for(const hand of ['right','left'] as const) {
    for(let bar=1;bar<bars-1;bar+=4) {
      const previous = events.filter(e=>e.hand===hand && e.bar===bar-1).at(-1)!;
      const next = events.find(e=>e.hand===hand && e.bar===bar)!;
      if(previous.notes.length===1 && next.notes.length===1 && !previous.tuplet && !next.tuplet && previous.clef===next.clef) {
        next.notes=previous.notes.map(n=>({...n})); previous.tieTo=next.id; next.tieFrom=previous.id;
      }
    }
  }
  return {id:`sr-${seed}-${settings.grade}-${key}-${meter}`,grade:settings.grade,key,keyCount,meter,bars,barTicks,totalTicks:bars*barTicks,beatTicks,groups,events};
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
