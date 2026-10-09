import test from 'node:test';
import assert from 'node:assert/strict';
import { assessInput, emptyAssessment, expectedNotes, generateExercise, meterInfo, mergeRests, sanitizeSight, secondsPerTick, sightDefaults, sightProfiles, slowInput, summarize } from './engine';
import { writtenPitch } from '../grades';
import { decodeMidi } from '../midi';
import { exerciseMusicXML } from './musicxml';
import { displayAccidentals } from './notation';
import type { ScoreEvent } from './engine';
test('all grade/key/meter combinations have valid bars, ranges, hands, chords and rhythms',()=>{
  let generated=0;
  for(const profile of sightProfiles)for(const key of profile.keys)for(const meter of profile.meters){
    const ex=generateExercise({...sightDefaults,grade:profile.grade},generated+1,{key,meter});generated++;
    assert.equal(ex.bars,profile.bars);assert.equal(ex.totalTicks,ex.barTicks*ex.bars);
    for(let bar=0;bar<ex.bars;bar++)for(const hand of ['right','left'] as const){
      const events=ex.events.filter(e=>e.bar===bar&&e.hand===hand);
      assert.equal(events.reduce((sum,e)=>sum+e.duration,0),ex.barTicks);
      let tick=bar*ex.barTicks;
      for(const e of events){assert.equal(e.tick,tick);tick+=e.duration;assert.ok(e.notes.length<=profile.chordSize);const midis=e.notes.map(n=>n.midi);if(midis.length)assert.ok(Math.max(...midis)-Math.min(...midis)<=12);
        for(const note of e.notes){assert.ok(note.midi>=21&&note.midi<=108);assert.equal(note.midi,writtenPitch(note.letter,note.octave,note.alteration!));}
        if(profile.grade<3)assert.ok(e.duration>=240);
        if(profile.grade===1&&!e.wholeBarRest)assert.ok([1440,960,480,240].includes(e.duration),'Grade 1 excludes whole notes and advanced rhythms');
        if(profile.grade<6){assert.equal(e.tuplet,undefined);assert.equal(e.clef,hand==='right'?'treble':'bass');}
        if(e.tieFrom){const before=ex.events.find(p=>p.id===e.tieFrom)!;assert.equal(before.tieTo,e.id);assert.deepEqual(before.notes.map(n=>n.midi),e.notes.map(n=>n.midi));assert.equal(before.tick+before.duration,e.tick);}
      }
    }
    const rh=ex.events.filter(e=>e.hand==='right').flatMap(e=>e.notes.map(n=>({midi:n.midi,tick:e.tick,end:e.tick+e.duration})));
    const lh=ex.events.filter(e=>e.hand==='left').flatMap(e=>e.notes.map(n=>({midi:n.midi,tick:e.tick,end:e.tick+e.duration})));
    for(const r of rh)for(const l of lh)if(r.tick<l.end&&l.tick<r.end)assert.ok(l.midi<r.midi,'no crossing hands');
    if(profile.grade===1){for(let bar=0;bar<ex.bars;bar++){const notes=ex.events.filter(e=>e.bar===bar&&e.notes.length);assert.ok(notes.every(e=>e.hand===(bar%2===0?'right':'left')));}for(const hand of ['right','left'] as const){const positions=ex.events.filter(e=>e.hand===hand).flatMap(e=>e.notes.map(n=>n.octave*7+'CDEFGAB'.indexOf(n.letter)));assert.ok(Math.max(...positions)-Math.min(...positions)<=4);}}
  }
  assert.ok(generated>500);
});
test('generation is deterministic, short practice is four bars, and unsupported keys fail',()=>{
  assert.deepEqual(generateExercise(sightDefaults,12),generateExercise(sightDefaults,12));
  assert.equal(generateExercise({...sightDefaults,short:true},12).bars,4);
  assert.throws(()=>generateExercise(sightDefaults,12,{key:'B'}));
  assert.equal(sanitizeSight({grade:99,bpm:1000,latency:-999}).grade,1);
  assert.equal(sanitizeSight({grade:99,bpm:1000,latency:-999}).bpm,160);
  assert.equal(sanitizeSight({grade:99,bpm:1000,latency:-999}).latency,-200);
});
test('meter grouping and tempo units remain consistent',()=>{
  assert.deepEqual(meterInfo('6/8'),{barTicks:1440,beatTicks:720,groups:[3,3]});
  assert.deepEqual(meterInfo('7/8'),{barTicks:1680,beatTicks:240,groups:[2,2,3]});
  const ex=generateExercise({...sightDefaults,grade:4},1,{meter:'6/8'});
  assert.equal(secondsPerTick(ex,60)*ex.barTicks,2);
});
test('exact performance matches once, tied continuations require no new onset',()=>{
  const s={...sightDefaults,mode:'timed' as const,grade:5,short:true};const ex=generateExercise(s,12,{meter:'4/4'});const expected=expectedNotes(ex,'both');let state=emptyAssessment();
  for(const n of expected)state=assessInput(expected,state,n.midi,n.tick*secondsPerTick(ex,s.bpm),ex,s.bpm);
  const result=summarize(ex,s,state,false);assert.equal(result.pitchScore,100);assert.equal(result.rhythmScore,100);assert.equal(result.missed,0);
  for(const event of ex.events.filter(e=>e.tieFrom))assert.ok(!expected.some(n=>n.eventId===event.id));
  const first=expected[0];state=assessInput(expected,state,first.midi,first.tick*secondsPerTick(ex,s.bpm),ex,s.bpm);assert.equal(state.matches.length,expected.length);assert.equal(state.extras,1);
});
test('timing windows, wrong notes, misses and extra notes are independent',()=>{
  const ex=generateExercise(sightDefaults,1);const expected=[{id:'a',eventId:'a',midi:60,tick:0,hand:'right' as const},{id:'b',eventId:'b',midi:60,tick:480,hand:'right' as const}];
  let state=assessInput(expected,emptyAssessment(),60,-.1,ex,60);assert.equal(state.matches[0].onTime,true);
  state=assessInput(expected,state,60,1.25,ex,60);assert.equal(state.matches[1].onTime,false);
  const wrong=assessInput(expected,emptyAssessment(),61,0,ex,60);assert.equal(wrong.wrong,1);assert.equal(wrong.extras,1);assert.equal(wrong.matches.length,0);
  const late=assessInput(expected,emptyAssessment(),60,.5,ex,60);assert.equal(late.matches.length,0);
  const fast=assessInput(expected,emptyAssessment(),60,.14,ex,160);assert.equal(fast.matches.length,1);assert.equal(fast.matches[0].onTime,false);
});
test('chord notes match individually, repeated notes need separate input, slow practice waits for the entire onset',()=>{
  const ex=generateExercise(sightDefaults,1);const expected=[{id:'a',eventId:'chord',midi:60,tick:0,hand:'right' as const},{id:'b',eventId:'chord',midi:64,tick:0,hand:'right' as const},{id:'c',eventId:'next',midi:60,tick:480,hand:'right' as const}];
  let state=slowInput(expected,emptyAssessment(),60);state=slowInput(expected,state,60);assert.equal(state.matches.length,1);assert.equal(state.extras,1);state=slowInput(expected,state,64);assert.equal(state.matches.length,2);state=slowInput(expected,state,60);assert.equal(state.matches.length,3);
  let timed=assessInput(expected,emptyAssessment(),60,0,ex,60);timed=assessInput(expected,timed,64,.09,ex,60);assert.equal(timed.matches.length,2);
  const right=expectedNotes(generateExercise({...sightDefaults,grade:3},5),'right');assert.ok(right.every(n=>n.hand==='right'));
});
test('MIDI shared events include release, channel, velocity, device and monotonic timestamp',()=>{
  assert.deepEqual(decodeMidi([0x92,60,90],'piano',123),{kind:'on',midi:60,channel:3,velocity:90,deviceId:'piano',timestamp:123});
  assert.equal(decodeMidi([0x90,60,0],'piano',124)?.kind,'off');assert.equal(decodeMidi([0x80,60,30],'piano',125)?.kind,'off');assert.equal(decodeMidi([0xb0,64,127],'piano',126),null);
});
test('notation accidentals carry within a bar, distinguish octaves, cancel, and reset after a tied continuation',()=>{
  const event=(id:string,letter:string,octave:number,alteration:number,tieFrom?:string):ScoreEvent=>({id,hand:'right',bar:0,tick:0,duration:480,clef:'treble',notes:[{midi:writtenPitch(letter,octave,alteration),letter,octave,alteration,clef:'treble',accidental:''}],tieFrom});
  const signs=displayAccidentals([event('a','C',4,1),event('b','C',4,1),event('c','C',4,0),event('d','C',5,1),event('e','C',4,1)],0);
  assert.deepEqual([...signs.values()],[['#'],[null],['n'],['#'],['#']]);
  assert.deepEqual([...displayAccidentals([event('a','F',4,1),event('b','F',4,0),event('c','F',4,1)],1).values()],[[null],['n'],['#']]);
  assert.deepEqual([...displayAccidentals([event('a','C',4,1,'previous-bar'),event('b','C',4,0),event('c','C',4,1)],0).values()],[[null],[null],['#']]);
});


test('inactive Grade 1 hands use exactly one silent bar of the real meter duration',()=>{
  for(const meter of sightProfiles[0].meters)for(let seed=0;seed<20;seed++){
    const ex=generateExercise(sightDefaults,seed,{meter});
    for(let bar=0;bar<ex.bars;bar++){
      const inactive=ex.events.filter(e=>e.bar===bar&&e.hand===(bar%2===0?'left':'right'));
      assert.equal(inactive.length,1);assert.equal(inactive[0].wholeBarRest,true);
      assert.equal(inactive[0].duration,ex.barTicks);assert.equal(inactive[0].notes.length,0);
      assert.ok(!expectedNotes(ex,'both').some(n=>n.eventId===inactive[0].id));
    }
  }
});

test('partial rests merge within beat groups and preserve simple/compound/irregular boundaries',()=>{
  const rest=(tick:number,duration:number):ScoreEvent=>({id:String(tick),hand:'right',bar:0,tick,duration,notes:[],clef:'treble'});
  const sound={...rest(0,480),notes:[{midi:60,letter:'C',octave:4,accidental:'' as const,clef:'treble' as const}]};
  assert.deepEqual(mergeRests([sound,rest(480,240),rest(720,240),rest(960,480),rest(1440,480)],'4/4').map(e=>e.duration),[480,480,960]);
  assert.deepEqual(mergeRests([{...sound,duration:240},rest(240,240),rest(480,240),rest(720,240),rest(960,240),rest(1200,240)],'6/8').map(e=>e.duration),[240,480,720]);
  assert.deepEqual(mergeRests([{...sound,duration:240},rest(240,240),rest(480,240),rest(720,240),rest(960,240),rest(1200,240),rest(1440,240)],'7/8').map(e=>e.duration),[240,240,480,720]);
  const full=mergeRests([rest(0,480),rest(480,480),rest(960,480)],'3/4');assert.equal(full.length,1);assert.equal(full[0].duration,1440);assert.equal(full[0].wholeBarRest,true);
});

test('musical phrases, accompaniment, leading tones and cadences remain coherent across seeds',()=>{
  let triplets=0,ties=0,changes=0;
  for(let grade=1;grade<=8;grade++)for(let seed=0;seed<30;seed++){
    const ex=generateExercise({...sightDefaults,grade},seed,{key:grade>=2?'Em':'C',meter:'4/4'});
    assert.ok(ex.phrases.length);assert.ok(ex.dynamics.length);assert.ok(ex.tempoText);
    for(const phrase of ex.phrases){const first=ex.events.find(e=>e.id===phrase.from)!;const last=ex.events.find(e=>e.id===phrase.to)!;assert.equal(first.hand,last.hand);assert.ok(first.tick<last.tick);}
    for(const hand of ['right','left'] as const){
      const final=ex.events.filter(e=>e.hand===hand&&e.bar===ex.bars-1&&e.notes.length);
      if(final.length)assert.equal(final[0].notes[0].letter,grade===1?'C':'E');
      if(grade===2){const notes=ex.events.filter(e=>e.hand===hand).flatMap(e=>e.notes);const positions=notes.map(n=>n.octave*7+'CDEFGAB'.indexOf(n.letter));assert.ok(Math.max(...positions)-Math.min(...positions)<=4);}
    }
    if(grade>=2){const lh=ex.events.filter(e=>e.hand==='left');const rh=ex.events.filter(e=>e.hand==='right');assert.ok(lh.filter(e=>e.notes.length).length<=rh.filter(e=>e.notes.length).length);}
    if(grade>=3){const leading=ex.events.filter(e=>e.hand==='right'&&e.bar===ex.bars-2).at(-1)!;assert.equal(leading.notes[0].letter,'D');assert.equal(leading.notes[0].alteration,1);const tonic=ex.events.find(e=>e.hand==='right'&&e.bar===ex.bars-1)!;assert.equal(tonic.notes[0].midi-leading.notes[0].midi,1,'leading tone resolves up a semitone');}
    triplets+=ex.events.filter(e=>e.tuplet).length;ties+=ex.events.filter(e=>e.tieFrom).length;
    changes+=ex.events.filter(e=>e.hand==='left'&&e.clef==='treble').length;
  }
  assert.ok(triplets>0,'triplets');assert.ok(ties>0,'ties');
  changes+=generateExercise({...sightDefaults,grade:8},4,{key:'B',meter:'4/4'}).events.filter(e=>e.hand==='left'&&e.clef==='treble').length;
  assert.ok(changes>0,'clef changes');
});


test('MusicXML preserves real durations, whole-bar silence, chords and independent phrase/tie notation',()=>{
  for(let grade=1;grade<=8;grade++)for(const meter of sightProfiles[grade-1].meters){
    const ex=generateExercise({...sightDefaults,grade,short:true},44,{meter});const xml=exerciseMusicXML(ex);
    assert.equal((xml.match(/<measure number=/g)||[]).length,4);
    assert.equal((xml.match(/<backup>/g)||[]).length,4);
    assert.equal((xml.match(/<note id=/g)||[]).length,ex.events.reduce((n,e)=>n+Math.max(1,e.notes.length),0));
    assert.equal((xml.match(/<rest measure="yes"/g)||[]).length,ex.events.filter(e=>e.wholeBarRest).length);
    for(const event of ex.events){const match=xml.match(new RegExp(`<note id="${event.id}-0">([\\s\\S]*?)</note>`));assert.ok(match);assert.ok(match[1].includes(`<duration>${event.duration}</duration>`));if(event.wholeBarRest)assert.ok(!match[1].includes('<type>'));}
    assert.ok(xml.includes('<bar-style>light-heavy</bar-style>'));
    assert.equal((xml.match(/<slur type="start"/g)||[]).length,ex.phrases.length);
    assert.equal((xml.match(/<slur type="stop"/g)||[]).length,ex.phrases.length);
  }
});
