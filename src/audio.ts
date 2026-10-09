import { frequency } from './music';
let context:AudioContext|undefined;
export function audioContext(){return context??=(new AudioContext());}
export async function resumeAudio(){const ctx=audioContext();await ctx.resume();return ctx;}
export function scheduleTone(midi:number,at:number,duration=.65,volume=.15):()=>void {
  const ctx=audioContext(); const voices:OscillatorNode[]=[]; const envelope=ctx.createGain();
  const start=Math.max(ctx.currentTime,at); const end=start+Math.max(.05,duration);
  envelope.gain.setValueAtTime(0,start); envelope.gain.linearRampToValueAtTime(volume,start+.008); envelope.gain.exponentialRampToValueAtTime(.001,end);
  envelope.connect(ctx.destination);
  [1,2,3].forEach((harmonic,i)=>{const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.value=frequency(midi)*harmonic;gain.gain.value=[.8,.16,.04][i];osc.connect(gain);gain.connect(envelope);osc.start(start);osc.stop(end+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();if(i===2)envelope.disconnect();};voices.push(osc);});
  return ()=>{voices.forEach(osc=>{try{osc.stop();}catch{/* Already stopped. */}});};
}
export function scheduleClick(at:number,accent:boolean){const ctx=audioContext();const osc=ctx.createOscillator();const gain=ctx.createGain();osc.frequency.value=accent?1200:800;gain.gain.setValueAtTime(.055,at);gain.gain.exponentialRampToValueAtTime(.001,at+.045);osc.connect(gain);gain.connect(ctx.destination);osc.start(at);osc.stop(at+.05);osc.onended=()=>{osc.disconnect();gain.disconnect();};return ()=>{try{osc.stop();}catch{/* Already stopped. */}};}
export async function playNote(midi:number){const ctx=await resumeAudio();scheduleTone(midi,ctx.currentTime);}
