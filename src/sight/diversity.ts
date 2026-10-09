import { generateExercise, seededRandom } from './engine';
import type { Exercise, SightReadingSettings } from './engine';

export const generationHistoryKey='note-garden-sight-generated-v2';
export type GeneratedSummary={version:number;grade:number;meter:string;bars:number;fingerprint:string;features:string[]};

/** Intervals and normalized durations deliberately ignore absolute key/transposition. */
export function summarizeComposition(ex:Exercise):GeneratedSummary {
  const parts:string[]=[];const features:string[]=[];
  for(const hand of ['right','left'] as const){
    let previous:number|undefined;
    for(let bar=0;bar<ex.bars;bar++){
      const tokens=ex.events.filter(e=>e.hand===hand&&e.bar===bar).map(e=>{
        const pitch=e.notes[0];const degree=pitch?.midi;
        const interval=degree===undefined?'r':previous===undefined?'s':String(degree-previous);
        if(degree!==undefined)previous=degree;
        const token=`${interval}/${e.duration/ex.beatTicks}/${e.notes.length}/${e.tieFrom?'t':''}/${e.notes.map(n=>n.midi-pitch!.midi).join('.')}`;
        return token;
      });
      parts.push(`${hand}:${tokens.join(',')}`);
      for(let i=0;i<tokens.length-1;i++)features.push(`${hand}:${tokens.slice(i,i+2).join(',')}`);
      features.push(`${hand}:rhythm:${tokens.map(t=>t.split('/').slice(1,3).join('/')).join(',')}`);
    }
  }
  const structure=ex.composition.phrases.map(p=>`${p.role}:${p.length}`).join(',');
  features.push(...ex.composition.phrases.map(p=>`phrase:${p.role}:${p.transform}:${p.accompaniment}`));
  return {version:ex.generatorVersion,grade:ex.grade,meter:ex.meter,bars:ex.bars,fingerprint:parts.join('|')+'|'+structure,features:[...new Set(features)]};
}
export function similarity(a:GeneratedSummary,b:GeneratedSummary):number {
  const set=new Set(b.features);const intersection=a.features.filter(f=>set.has(f)).length;
  return intersection/Math.max(1,a.features.length+b.features.length-intersection);
}
export function parseGeneratedHistory(value:string|null):GeneratedSummary[]{
  try{const data:unknown=JSON.parse(value||'[]');return Array.isArray(data)?data.filter((v):v is GeneratedSummary=>v?.version===2&&Number.isInteger(v.grade)&&v.grade>=1&&v.grade<=8&&typeof v.meter==='string'&&Number.isInteger(v.bars)&&typeof v.fingerprint==='string'&&Array.isArray(v.features)&&v.features.every((f:unknown)=>typeof f==='string')).slice(0,20):[];}catch{return [];}
}
export function rememberGenerated(history:GeneratedSummary[],ex:Exercise):GeneratedSummary[]{
  const summary=summarizeComposition(ex);return [summary,...history.filter(v=>v.fingerprint!==summary.fingerprint)].slice(0,20);
}
export function generateFreshExercise(settings:SightReadingSettings,history:GeneratedSummary[],seed=Math.floor(Math.random()*0xffffffff),force?:{key?:string;meter?:string}):Exercise {
  const first=generateExercise(settings,seed,force);
  const recent=history.filter(h=>h.version===first.generatorVersion&&h.grade===first.grade&&h.meter===first.meter&&h.bars===first.bars);
  if(!recent.length)return first;
  const rng=seededRandom(seed^0x5a17d381);let best:Exercise|undefined,bestSimilarity=Infinity;
  for(let i=0;i<30;i++){
    const candidate=i===0?first:generateExercise(settings,Math.floor(rng()*0xffffffff),{key:first.key,meter:first.meter});
    const summary=summarizeComposition(candidate);
    if(recent.some(h=>h.fingerprint===summary.fingerprint))continue;
    const score=Math.max(...recent.map(h=>similarity(summary,h)));
    if(score<bestSimilarity){best=candidate;bestSimilarity=score;}
  }
  // Thirty candidates is a fixed work bound; grade constraints never change.
  if(!best)throw Error('暫時找不到不同的新曲，請再按一次產生新曲。');
  return best;
}
