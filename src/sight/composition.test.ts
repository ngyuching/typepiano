import test from 'node:test';
import assert from 'node:assert/strict';
import { generateExercise, sightDefaults, sightProfiles } from './engine';
import { compositionPlan, motifs, rhythmCatalogue, rhythmForGroup } from './composition';
import { generateFreshExercise, parseGeneratedHistory, rememberGenerated, similarity, summarizeComposition, type GeneratedSummary } from './diversity';

test('phrase structures, motif transformations and complete rhythm groups',()=>{
  assert.ok(motifs.length>=12);
  for(const [ticks,catalogue] of Object.entries(rhythmCatalogue)){
    assert.ok(catalogue.length>=6);
    for(const template of catalogue)assert.equal(template.values.reduce((a,b)=>a+Math.abs(b),0),+ticks);
    for(let v=0;v<20;v++)for(const grade of [6,8])for(const breath of [false,true]){
      const rhythm=rhythmForGroup(+ticks,grade,v,breath);assert.equal(rhythm.reduce((a,b)=>a+b.duration,0),+ticks);
    }
  }
  for(let grade=1;grade<=8;grade++)for(const short of [false,true]){
    const ex=generateExercise({...sightDefaults,grade,short},54,{key:'C',meter:'4/4'}),plan=ex.composition;
    assert.equal(plan.phrases.reduce((n,p)=>n+p.length,0),ex.bars);
    assert.ok(plan.phrases.slice(1).every(p=>p.transform!=='original'));
    assert.equal(plan.harmony.at(-1),0);assert.equal(plan.harmony.at(-2),4);
    if(short)assert.deepEqual(plan.phrases.map(p=>[p.length,p.role]),[[2,'question'],[2,'answer']]);
    else if(grade<=2)assert.deepEqual(plan.phrases.map(p=>p.length),[4,2]);
    for(const p of plan.phrases){assert.ok(p.climax>=p.start&&p.climax<p.start+p.length);if(p.role==='question')assert.equal(plan.harmony[p.start+p.length-1],4);}
    assert.equal(ex.seed,54);assert.equal(ex.generatorVersion,2);
  }
  assert.equal(compositionPlan(1,6,()=>.1).phrases.length,2);
});

test('weak non-chord melody tones resolve by step; simultaneous notes use the planned harmony',()=>{
  for(let grade=1;grade<=8;grade++)for(let seed=0;seed<40;seed++)for(const key of ['C','Am']){
    const ex=generateExercise({...sightDefaults,grade},seed,{key,meter:'4/4'});
    const rhs=ex.events.filter(e=>e.hand==='right'&&e.notes.length);
    for(let i=0;i<rhs.length;i++){
      const event=rhs[i],root=ex.composition.harmony[event.bar];
      for(const n of event.notes){const degree=n.octave*7+'CDEFGAB'.indexOf(n.letter)-28-(key==='C'?0:5);
        const chordTone=[0,2,4].includes((degree-root+28)%7);
        if(event.notes.length>1)assert.ok(chordTone,'every chord pitch belongs to the harmony');
        else if(!chordTone){const next=rhs[i+1];assert.ok(next&&next.bar===event.bar);assert.ok(Math.abs(next.notes[0].midi-n.midi)<=2,'neighbour resolves by step');}
      }
    }
  }
});

test('moving bars develop, apart from sustained accompaniment and cadences',()=>{
  const signature=(es:ReturnType<typeof generateExercise>['events'])=>JSON.stringify(es.map(e=>[e.duration,e.notes.map(n=>n.midi)]));
  for(let grade=2;grade<=8;grade++)for(let seed=0;seed<40;seed++){
    const ex=generateExercise({...sightDefaults,grade},seed,{key:'C',meter:'4/4'});
    for(const hand of ['right','left'] as const)for(let bar=1;bar<ex.bars-2;bar++){
      const p=ex.composition.phrases.find(p=>bar>=p.start&&bar<p.start+p.length)!;
      if(hand==='left'&&p.accompaniment==='sustain')continue;
      const current=ex.events.filter(e=>e.hand===hand&&e.bar===bar);
      if(current.filter(e=>e.notes.length).length<2)continue;
      assert.notEqual(signature(current),signature(ex.events.filter(e=>e.hand===hand&&e.bar===bar-1)),`grade ${grade}, seed ${seed}, ${hand}, bar ${bar}`);
    }
  }
});

test('fingerprints ignore transposition, preserve audible changes and tolerate invalid storage',()=>{
  const ex=generateExercise(sightDefaults,7,{key:'C',meter:'4/4'});
  const transposed=structuredClone(ex);transposed.events.forEach(e=>e.notes.forEach(n=>n.midi+=2));
  assert.equal(summarizeComposition(ex).fingerprint,summarizeComposition(transposed).fingerprint);
  transposed.events[0].notes[0].midi++;
  assert.notEqual(summarizeComposition(ex).fingerprint,summarizeComposition(transposed).fingerprint);
  assert.deepEqual(parseGeneratedHistory('{oops'),[]);assert.deepEqual(parseGeneratedHistory('{}'),[]);
  assert.deepEqual(parseGeneratedHistory('[null,{"version":2}]'),[]);
  const history=rememberGenerated([],ex);assert.deepEqual(parseGeneratedHistory(JSON.stringify(history)),history);
  assert.equal(rememberGenerated(history,ex).length,1);assert.equal(similarity(history[0],history[0]),1);
  assert.deepEqual(generateFreshExercise(sightDefaults,[],7,{key:'C',meter:'4/4'}),ex);
  const random=generateExercise(sightDefaults,44);
  assert.deepEqual(generateExercise(sightDefaults,44,{key:random.key,meter:random.meter}),random);
});

test('one hundred successive exercises per grade avoid the last twenty musical fingerprints',()=>{
  for(const p of sightProfiles){
    let history:GeneratedSummary[]=[];
    for(let seed=0;seed<100;seed++){
      const ex=generateFreshExercise({...sightDefaults,grade:p.grade},history,seed,{key:'C',meter:'4/4'});
      const summary=summarizeComposition(ex);
      assert.ok(!history.some(h=>h.fingerprint===summary.fingerprint));
      history=rememberGenerated(history,ex);assert.ok(history.length<=20);
    }
    assert.equal(history.length,20);
  }
});

test('multiple seeds across every allowed key and meter preserve timing, triplets and hand separation',()=>{
  for(const profile of sightProfiles)for(const key of profile.keys)for(const meter of profile.meters)for(const seed of [0,7,29]){
    const ex=generateExercise({...sightDefaults,grade:profile.grade},seed,{key,meter});
    const tuplets=new Map<string,number>();
    for(const e of ex.events){if(e.tuplet)tuplets.set(e.tuplet,(tuplets.get(e.tuplet)||0)+1);assert.ok([1920,1440,960,720,480,360,240,160,120,80].includes(e.duration)||e.wholeBarRest);if(e.notes.length>1)assert.ok(e.notes.at(-1)!.midi-e.notes[0].midi<=12);}
    for(const count of tuplets.values())assert.equal(count,3);
    for(let bar=0;bar<ex.bars;bar++){
      const right=ex.events.filter(e=>e.bar===bar&&e.hand==='right'),left=ex.events.filter(e=>e.bar===bar&&e.hand==='left');
      assert.equal(right.reduce((n,e)=>n+e.duration,0),ex.barTicks);assert.equal(left.reduce((n,e)=>n+e.duration,0),ex.barTicks);
      for(const r of right)for(const l of left)if(r.tick<l.tick+l.duration&&l.tick<r.tick+r.duration)for(const rn of r.notes)for(const ln of l.notes)assert.ok(ln.midi<rn.midi);
    }
  }
});
