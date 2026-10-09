import { expectedNotes } from './engine';
import type { Assessment, Exercise, ExpectedNote, SightReadingSettings } from './engine';
import type { Note } from '../music';
import { keyAlteration } from '../grades';

export type GuidedNote=ExpectedNote&{note:Note};
export type GuidedGroup={tick:number;bar:number;notes:GuidedNote[];remaining:GuidedNote[];handLabel:string};
export function nextGuidedGroup(ex:Exercise,hands:SightReadingSettings['hands'],state:Assessment):GuidedGroup|null {
  const expected=expectedNotes(ex,hands),used=new Set(state.matches.map(m=>m.id));
  const first=expected.find(n=>!used.has(n.id));if(!first)return null;
  const notes=expected.filter(n=>n.tick===first.tick).map(n=>{
    const event=ex.events.find(e=>e.id===n.eventId)!;
    return {...n,note:event.notes[Number(n.id.slice(n.eventId.length+1))]};
  });
  const handLabel=new Set(notes.map(n=>n.hand)).size===2?'雙手':notes[0].hand==='right'?'右手':'左手';
  return {tick:first.tick,bar:Math.floor(first.tick/ex.barTicks)+1,notes,remaining:notes.filter(n=>!used.has(n.id)),handLabel};
}
export function writtenName(note:Note):string {
  const signs:Record<number,string>={'-2':'𝄫','-1':'♭',0:'',1:'♯',2:'𝄪'};
  const alteration=note.alteration??0;
  const sign=alteration===0&&keyAlteration(note.key??0,note.letter)!==0?'♮':signs[alteration]??note.accidental;
  return `${note.letter}${sign}${note.octave}`;
}
