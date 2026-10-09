import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { generateExercise, sightDefaults, type Exercise } from '../src/sight/engine';
import { generateFreshExercise, rememberGenerated, type GeneratedSummary } from '../src/sight/diversity';
import { exerciseMusicXML } from '../src/sight/musicxml';

// Optional pre-change capture: 8 arrays of 100 C-major, 4/4 exercises, seeds 0..99.
const baselinePath=process.argv[2];
const baseline:Exercise[][]|undefined=baselinePath?JSON.parse(readFileSync(baselinePath,'utf8')):undefined;
mkdirSync('artifacts',{recursive:true});
type Features={melody:Set<string>;rhythm:Set<string>;accompaniment:Set<string>};
function features(ex:Exercise):Features {
  const result:Features={melody:new Set(),rhythm:new Set(),accompaniment:new Set()};
  for(const hand of ['right','left'] as const){
    let last:number|undefined;
    const tokens=ex.events.filter(e=>e.hand===hand).map(e=>{
      const n=e.notes[0],interval=n&&last!==undefined?n.midi-last:n?'s':'r';if(n)last=n.midi;
      return `${interval}:${e.duration/ex.beatTicks}:${e.notes.length}`;
    });
    for(let i=0;i<tokens.length-2;i++)result[hand==='right'?'melody':'accompaniment'].add(tokens.slice(i,i+3).join(','));
    for(let bar=0;bar<ex.bars;bar++)result.rhythm.add(hand+':'+ex.events.filter(e=>e.hand===hand&&e.bar===bar).map(e=>`${e.duration/ex.beatTicks}:${e.notes.length?'n':'r'}`).join(','));
  }return result;
}
function nearestMean(exercises:Exercise[],part:keyof Features){
  const all=exercises.map(features);let total=0;
  for(let i=1;i<all.length;i++){
    let nearest=0;for(let j=Math.max(0,i-20);j<i;j++){
      const a=all[i][part],b=all[j][part],intersection=[...a].filter(x=>b.has(x)).length;
      nearest=Math.max(nearest,intersection/Math.max(1,a.size+b.size-intersection));
    }total+=nearest;
  }return total/(all.length-1);
}
const report=[];
for(let grade=1;grade<=8;grade++){
  let history:GeneratedSummary[]=[];const exercises:Exercise[]=[];
  for(let seed=0;seed<100;seed++){
    const ex=generateFreshExercise({...sightDefaults,grade},history,seed,{key:'C',meter:'4/4'});
    history=rememberGenerated(history,ex);exercises.push(ex);
  }
  const current=Object.fromEntries((['melody','rhythm','accompaniment'] as const).map(part=>[part,nearestMean(exercises,part)]));
  const old=baseline?Object.fromEntries((['melody','rhythm','accompaniment'] as const).map(part=>[part,nearestMean(baseline[grade-1],part)])):undefined;
  report.push({grade,current,baseline:old});
  const fixture=generateExercise({...sightDefaults,grade,short:true},20261009,{key:grade>=2?'Em':'C',meter:'4/4'});
  writeFileSync(`artifacts/composition-grade${grade}.json`,JSON.stringify(fixture,null,2));
  writeFileSync(`artifacts/composition-grade${grade}.musicxml`,exerciseMusicXML(fixture));
  console.log(JSON.stringify(report.at(-1)));
}
if(baseline)for(const part of ['melody','rhythm','accompaniment']){
  const old=report.reduce((n,r)=>n+r.baseline![part],0)/8,current=report.reduce((n,r)=>n+r.current[part],0)/8;
  assert.ok(current<old,`${part} mean nearest similarity must decrease: ${current} >= ${old}`);
}
writeFileSync('artifacts/generation-quality.json',JSON.stringify(report,null,2));
