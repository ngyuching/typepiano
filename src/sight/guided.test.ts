import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyAssessment, expectedNotes, generateExercise, sanitizeSight, sightDefaults, slowInput, summarize, type Exercise, type ScoreEvent } from './engine';
import { nextGuidedGroup, writtenName } from './guided';
import type { Note } from '../music';

const note=(midi:number,letter:string,octave:number,alteration=0):Note=>({midi,letter,octave,alteration,clef:'treble',accidental:''});
function fixture():Exercise {
  const ex=generateExercise({...sightDefaults,short:true},11);
  const event=(id:string,tick:number,notes:Note[],hand:'right'|'left'='right',extra:Partial<ScoreEvent>={}):ScoreEvent=>({id,tick,notes,hand,bar:Math.floor(tick/1920),duration:480,clef:hand==='right'?'treble':'bass',...extra});
  return {...ex,barTicks:1920,events:[event('rest',0,[]),event('chord',480,[note(65,'E',4,1),note(59,'C',4,-1)]),event('bass',480,[note(48,'C',3)],'left'),event('attack',960,[note(72,'C',5)],'right',{tieTo:'continuation'}),event('continuation',1440,[note(72,'C',5)],'right',{tieFrom:'attack'}),event('repeat',1920,[note(72,'C',5)])]};
}
test('new defaults use guided slow practice and existing modes remain intact',()=>{
  assert.equal(sanitizeSight({}).mode,'slow');assert.equal(sanitizeSight({mode:'timed'}).mode,'timed');assert.equal(sanitizeSight({mode:'slow',preview:60}).preview,60);
});
test('guided groups preserve spelling, exact octaves, partial chords and selected hands',()=>{
  const ex=fixture(),expected=expectedNotes(ex,'both');let state=emptyAssessment();let group=nextGuidedGroup(ex,'both',state)!;
  assert.equal(group.tick,480);assert.equal(group.handLabel,'雙手');assert.equal(group.remaining.length,3);
  assert.equal(writtenName(group.notes[0].note),'E♯4');assert.equal(writtenName(group.notes[1].note),'C♭4');assert.equal(group.notes[1].midi,59);
  assert.equal(writtenName({...note(65,'F',4),key:1}),'F♮4');
  state=slowInput(expected,state,53);assert.equal(state.wrong,1);assert.equal(nextGuidedGroup(ex,'both',state)!.remaining.length,3);
  state=slowInput(expected,state,65);group=nextGuidedGroup(ex,'both',state)!;assert.equal(group.remaining.length,2);assert.ok(!group.remaining.some(n=>n.midi===65));
  const matched=state.matches.length;state=slowInput(expected,state,65);assert.equal(state.matches.length,matched);assert.equal(state.wrong,2);
  state=slowInput(expected,state,59);state=slowInput(expected,state,48);assert.equal(nextGuidedGroup(ex,'both',state)!.tick,960);
  state=slowInput(expected,state,72);assert.equal(nextGuidedGroup(ex,'both',state)!.tick,1920,'rest and tied continuation require no extra attack');
  state=slowInput(expected,state,72);assert.equal(nextGuidedGroup(ex,'both',state),null);
  assert.equal(nextGuidedGroup(ex,'left',emptyAssessment())!.handLabel,'左手');assert.equal(nextGuidedGroup(ex,'left',emptyAssessment())!.remaining.length,1);
  assert.equal(nextGuidedGroup(ex,'right',emptyAssessment())!.remaining.length,2);
});
test('new guided results record hint use independently of listening without rewriting old results',()=>{
  const ex=fixture(),state=emptyAssessment();
  const legacy=summarize(ex,sightDefaults,state,false);assert.ok(!Object.hasOwn(legacy,'hintedGroups'));
  const assisted=summarize(ex,sightDefaults,state,false,2);assert.equal(assisted.hintedGroups,2);assert.equal(assisted.listened,false);assert.equal(assisted.rhythmScore,null);
  const heard=summarize(ex,sightDefaults,state,true,0);assert.equal(heard.hintedGroups,0);assert.equal(heard.listened,true);
  const timed=summarize(ex,{...sightDefaults,mode:'timed'},state,false,3);assert.ok(!Object.hasOwn(timed,'hintedGroups'));assert.notEqual(timed.rhythmScore,null);
});
