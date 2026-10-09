import { keyAlteration } from '../grades';
import type { ScoreEvent } from './engine';
// Call once per measure and staff: accidental state is scoped to letter AND octave.
export function displayAccidentals(events:ScoreEvent[],keyCount:number):Map<string,(string|null)[]> {
  const state=new Map<string,number>();const result=new Map<string,(string|null)[]>();
  for(const event of events){
    const signs=event.notes.map(n=>{const id=`${n.letter}${n.octave}`;const current=state.get(id)??keyAlteration(keyCount,n.letter);const alteration=n.alteration??0;
      // A carried accidental only affects the tied continuation, not later notes in this bar.
      if(event.tieFrom)return null;
      state.set(id,alteration);return alteration===current?null:({'-2':'bb','-1':'b','0':'n','1':'#','2':'##'} as Record<string,string>)[String(alteration)];});
    result.set(event.id,signs);
  }return result;
}
