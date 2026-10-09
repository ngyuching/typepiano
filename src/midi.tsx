import { useEffect, useRef, useState } from 'react';
type MidiInput = MIDIInput;
type MidiAccess = MIDIAccess;
export function midiNote(data: ArrayLike<number>): number | null {
  return data.length >= 3 && (data[0] & 0xf0) === 0x90 && data[2] > 0 && data[1] >= 0 && data[1] <= 127 ? data[1] : null;
}
export type MidiInputEvent={kind:'on'|'off';midi:number;channel:number;velocity:number;deviceId:string;timestamp:number};
export function decodeMidi(data:ArrayLike<number>,deviceId:string,timestamp:number):MidiInputEvent|null {
  if(data.length<3||data[1]<0||data[1]>127||data[2]<0||data[2]>127)return null;
  const command=data[0]&0xf0;if(command!==0x90&&command!==0x80)return null;
  return {kind:command===0x90&&data[2]>0?'on':'off',midi:data[1],channel:(data[0]&0x0f)+1,velocity:data[2],deviceId,timestamp};
}
export function MidiControl({ onNote, onInput, onLost, locked=false }: { onNote: (midi: number) => void; onInput?:(event:MidiInputEvent)=>void;onLost?:()=>void;locked?:boolean }) {
  const callback = useRef(onNote); callback.current = onNote;
  const inputCallback=useRef(onInput);inputCallback.current=onInput;const lostCallback=useRef(onLost);lostCallback.current=onLost;
  const access = useRef<MidiAccess | null>(null);
  const [devices, setDevices] = useState<MidiInput[]>([]);
  const [selected, setSelected] = useState('all');
  const selectedRef=useRef(selected);selectedRef.current=selected;const knownDevices=useRef<string[]>([]);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('連接 USB MIDI 鍵盤，直接用實體琴鍵作答。');
  const mounted = useRef(true);
  const supported = typeof navigator.requestMIDIAccess === 'function' && window.isSecureContext;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; if (access.current) { access.current.onstatechange = null; for (const input of access.current.inputs.values()) input.onmidimessage = null; } }; }, []);
  useEffect(() => {
    if (!connected || !access.current) return;
    const bound: MidiInput[] = [];
    for (const input of access.current.inputs.values()) {
      if (input.state !== 'connected' || (selected !== 'all' && selected !== input.id)) continue;
      input.onmidimessage = event => { const decoded=event.data?decodeMidi(event.data,input.id,event.timeStamp??performance.now()):null;if(decoded){inputCallback.current?.(decoded);if(decoded.kind==='on')callback.current(decoded.midi);} };
      bound.push(input);
    }
    return () => { bound.forEach(input => { input.onmidimessage = null; }); };
  }, [connected, devices, selected]);
  async function connect() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await navigator.requestMIDIAccess({ sysex: false });
      if (!mounted.current) return;
      access.current = result;
      const refresh = () => {
        const inputs = [...result.inputs.values()].filter(input => input.state === 'connected');
        if(knownDevices.current.some(id=>(selectedRef.current==='all'||selectedRef.current===id)&&!inputs.some(input=>input.id===id)))lostCallback.current?.();
        knownDevices.current=inputs.map(input=>input.id);
        setDevices(inputs);
        setSelected(current => current === 'all' || inputs.some(input => input.id === current) ? current : 'all');
        setStatus(inputs.length ? `已連接 ${inputs.length} 個輸入裝置 · 使用實際音高與八度作答` : '未偵測到 MIDI 輸入；請接上鍵盤，連接後會自動偵測。');
      };
      result.onstatechange = refresh; refresh(); setConnected(true);
    } catch (error) {
      if (mounted.current) setStatus(error instanceof Error && error.name === 'NotAllowedError' ? 'MIDI 權限被拒絕；請在瀏覽器網站設定允許 MIDI 後重試。' : '無法存取 MIDI，請確認瀏覽器支援、裝置連線與網站權限。');
    } finally { if (mounted.current) setBusy(false); }
  }
  function disconnect() {
    lostCallback.current?.();knownDevices.current=[];
    if (access.current) { access.current.onstatechange = null; for (const input of access.current.inputs.values()) input.onmidimessage = null; }
    access.current = null; setDevices([]); setConnected(false); setStatus('已中斷 MIDI 作答，可隨時重新連接。');
  }
  return <div className="midi-panel"><div><strong>♬ MIDI 鍵盤</strong><p role="status">{supported ? status : '此瀏覽器無法使用 Web MIDI；請用 Chrome／Edge，並透過 HTTPS 或 localhost 開啟。'}</p></div><div className="midi-actions">{connected && devices.length > 0 && <select disabled={locked} aria-label="MIDI 輸入裝置" value={selected} onChange={e => setSelected(e.target.value)}><option value="all">所有 MIDI 輸入</option>{devices.map(device => <option key={device.id} value={device.id}>{device.name || '未命名鍵盤'}</option>)}</select>}<button disabled={!supported || busy || (locked&&!connected)} onClick={connected ? disconnect : connect}>{busy ? '連接中…' : connected ? '中斷 MIDI' : '連接 MIDI'}</button></div></div>;
}
