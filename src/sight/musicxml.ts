import type { Exercise, ScoreEvent } from './engine';
import { displayAccidentals } from './notation';

const types:Record<number,string>={1920:'whole',1440:'half',960:'half',720:'quarter',480:'quarter',360:'eighth',240:'eighth',160:'eighth',120:'16th',80:'16th'};
const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));

/** Standard MusicXML is the boundary between exercise generation and engraving. */
export function exerciseMusicXML(ex:Exercise):string {
  const clef=(staff:number,name:string)=>`<clef number="${staff}"><sign>${name==='treble'?'G':'F'}</sign><line>${name==='treble'?2:4}</line></clef>`;
  const bars=Array.from({length:ex.bars},(_,bar)=>{
    const [beats,beatType]=ex.meter.split('/');
    let xml=`<measure number="${bar+1}">`;
    if(bar===0)xml+=`<attributes><divisions>480</divisions><key><fifths>${ex.keyCount}</fifths><mode>${ex.key.endsWith('m')?'minor':'major'}</mode></key><time><beats>${beats}</beats><beat-type>${beatType}</beat-type></time><staves>2</staves>${clef(1,ex.events.find(e=>e.hand==='right'&&e.bar===0)!.clef)}${clef(2,ex.events.find(e=>e.hand==='left'&&e.bar===0)!.clef)}</attributes><direction placement="above"><direction-type><words font-weight="bold">${escape(ex.tempoText)}</words></direction-type><staff>1</staff></direction>`;
    for(const [hand,staff] of [['right',1],['left',2]] as const){
      if(staff===2)xml+=`<backup><duration>${ex.barTicks}</duration></backup>`;
      const events=ex.events.filter(e=>e.hand===hand&&e.bar===bar);
      const before=ex.events.find(e=>e.hand===hand&&e.bar===bar-1);
      if(before&&before.clef!==events[0].clef)xml+=`<attributes>${clef(staff,events[0].clef)}</attributes>`;
      const signs=displayAccidentals(events,ex.keyCount);
      const groupEnds:number[]=[];let t=bar*ex.barTicks;for(const group of ex.groups){t+=group*1920/+beatType;groupEnds.push(t);}
      const beam=(event:ScoreEvent,index:number,level:number)=>{
        const short=(e:ScoreEvent|undefined)=>!!e&&!!e.notes.length&&!e.wholeBarRest&&e.duration<=(level===1?240:120);
        if(!short(event))return '';
        const start=groupEnds.filter(v=>v<=event.tick).at(-1)??bar*ex.barTicks;
        const end=groupEnds.find(v=>v>event.tick)!;
        const prev=events[index-1],next=events[index+1];
        const hasPrev=short(prev)&&prev.tick>=start;
        const hasNext=short(next)&&next.tick<end;
        return hasPrev||hasNext?`<beam number="${level}">${!hasPrev?'begin':!hasNext?'end':'continue'}</beam>`:'';
      };
      events.forEach((event,index)=>{
        const dynamic=ex.dynamics.find(d=>d.eventId===event.id);
        if(dynamic)xml+=`<direction placement="below"><direction-type><dynamics><${dynamic.value}/></dynamics></direction-type><staff>${staff}</staff></direction>`;
        const pitches=event.notes.length?event.notes:[null];
        pitches.forEach((pitch,i)=>{
          xml+=`<note id="${event.id}-${i}">${i?'<chord/>':''}`;
          xml+=pitch?`<pitch><step>${pitch.letter}</step><alter>${pitch.alteration??0}</alter><octave>${pitch.octave}</octave></pitch>`:`<rest${event.wholeBarRest?' measure="yes"':''}/>`;
          xml+=`<duration>${event.duration}</duration>`;
          if(event.tieFrom)xml+='<tie type="stop"/>';
          if(event.tieTo)xml+='<tie type="start"/>';
          xml+=`<voice>${staff}</voice>`;
          if(!event.wholeBarRest)xml+=`<type>${types[event.duration]}</type>${[1440,720,360].includes(event.duration)?'<dot/>':''}`;
          const sign=signs.get(event.id)?.[i];
          if(pitch&&sign)xml+=`<accidental>${({'#':'sharp','b':'flat','n':'natural'} as Record<string,string>)[sign]}</accidental>`;
          if(event.tuplet)xml+=`<time-modification><actual-notes>3</actual-notes><normal-notes>2</normal-notes><normal-type>${event.duration===80?'16th':'eighth'}</normal-type></time-modification>`;
          xml+=`<staff>${staff}</staff>`;
          if(!i)xml+=beam(event,index,1)+beam(event,index,2);
          let notation='';
          if(event.tieFrom)notation+='<tied type="stop"/>';
          if(event.tieTo)notation+='<tied type="start"/>';
          if(!i){
            for(const phrase of ex.phrases){
              if(phrase.to===event.id)notation+=`<slur type="stop" number="${staff}"/>`;
              if(phrase.from===event.id)notation+=`<slur type="start" number="${staff}" placement="${staff===1?'above':'below'}"/>`;
            }
            if(event.tuplet&&events[index-1]?.tuplet!==event.tuplet)notation+='<tuplet type="start" bracket="yes"/>';
            if(event.tuplet&&events[index+1]?.tuplet!==event.tuplet)notation+='<tuplet type="stop"/>';
          }
          if(notation)xml+=`<notations>${notation}</notations>`;
          xml+='</note>';
        });
      });
    }
    if(bar===ex.bars-1)xml+='<barline location="right"><bar-style>light-heavy</bar-style></barline>';
    return xml+'</measure>';
  });
  return `<?xml version="1.0" encoding="utf-8"?><score-partwise version="4.0"><work><work-title>鋼琴視奏 · Grade ${ex.grade}</work-title></work><part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list><part id="P1">${bars.join('')}</part></score-partwise>`;
}
