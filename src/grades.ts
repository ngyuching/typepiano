import type { Clef, Note, Settings } from './music';
export const gradeProfiles = [
  { grade: 1, low: 43, high: 77, maxKey: 2, description: 'C、G、D、F 大調；高低音譜號、中央 C 與單升降還原。', traps: false },
  { grade: 2, low: 36, high: 84, maxKey: 3, description: '加入 A、B♭、E♭ 大調及 a、e、d 小調；上下兩條加線。', traps: false },
  { grade: 3, low: 36, high: 84, maxKey: 4, description: '四升四降內大小調；更寬加線音域、E♯／B♯／C♭／F♭辨讀。', traps: true },
  { grade: 4, low: 36, high: 84, maxKey: 5, description: '五升五降內大小調；鋼琴高低音譜號、重升重降、等音異名。', traps: true },
  { grade: 5, low: 36, high: 84, maxKey: 6, description: '六升六降內大小調；綜合鋼琴高低音譜號。', traps: true },
  { grade: 6, low: 36, high: 84, maxKey: 7, description: '識譜加強：全調號、高低音譜號，約 30% 易混淆變音題。', traps: true },
  { grade: 7, low: 36, high: 84, maxKey: 7, description: '識譜加強：約 50% 易混淆題，交替重升、重降與跨八度等音。', traps: true },
  { grade: 8, low: 36, high: 84, maxKey: 7, description: '識譜加強：約 70% 易混淆題，密集調號、變音及高低音譜號切換。', traps: true },
];
export const sourceUrl = 'https://www.abrsm.org/sites/default/files/2023-09/music-theory-syllabus-outline-grades-1-5-from-2020.pdf';
const majors = ['C♭','G♭','D♭','A♭','E♭','B♭','F','C','G','D','A','E','B','F♯','C♯'];
const minors = ['a♭','e♭','b♭','f','c','g','d','a','e','b','f♯','c♯','g♯','d♯','a♯'];
export function keyLabel(key: number, minor = false) { return `${(minor ? minors : majors)[key + 7]} ${minor ? '小調' : '大調'}`; }
export function keyAlteration(key: number, letter: string): number {
  return key > 0 && 'FCGDAEB'.slice(0, key).includes(letter) ? 1 : key < 0 && 'BEADGCF'.slice(0, -key).includes(letter) ? -1 : 0;
}
export function symbolFor(alteration: number): Note['accidental'] { return ({ '-2': '𝄫', '-1': '♭', '0': '♮', '1': '♯', '2': '𝄪' } as const)[String(alteration) as '-2' | '-1' | '0' | '1' | '2']; }
export function writtenPitch(letter: string, octave: number, alteration: number) { return (octave + 1) * 12 + [0,2,4,5,7,9,11]['CDEFGAB'.indexOf(letter)] + alteration; }
export function noteExplanation(n: Note) {
  const written = `${n.letter}${n.alteration === undefined ? n.accidental : n.alteration === 0 ? '' : symbolFor(n.alteration)}${n.octave}`;
  const names = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
  return `${written} → ${names[n.midi % 12]}${Math.floor(n.midi / 12) - 1}${n.accidental === '' && n.key && keyAlteration(n.key, n.letter) ? '（套用本行調號）' : n.accidental === '♮' ? '（還原本位音）' : ''}`;
}
const bases: Record<Clef, number> = { treble: 30, bass: 18, alto: 24, tenor: 22 };
function rowPool(s: Settings, clef: Clef, key: number): Note[] {
  const grade = s.grade || 8;
  const result: Note[] = [];
  for (let octave = 1; octave <= 6; octave++) for (const letter of 'CDEFGAB') {
    const step = octave * 7 + 'CDEFGAB'.indexOf(letter) - bases[clef];
    if (grade === 1 && (step < (clef === 'treble' ? -2 : 0) || step > (clef === 'bass' ? 10 : 8))) continue;
    if (grade === 2 && (step < -4 || step > 12)) continue;
    const base = keyAlteration(key, letter);
    const alterations = s.accidentals ? (s.traps && grade >= 4 ? [-2,-1,0,1,2] : [-1,0,1]) : [base];
    for (const alteration of alterations) {
      const midi = writtenPitch(letter, octave, alteration);
      if (midi < s.low || midi > s.high) continue;
      const unusual = (alteration === 1 && 'EB'.includes(letter)) || (alteration === -1 && 'CF'.includes(letter));
      if (unusual && grade < 3) continue;
      const trap = Math.abs(alteration) === 2 || unusual;
      // Without traps, still retain notes implied by the key signature.
      if (trap && !s.traps && alteration !== base) continue;
      result.push({ midi, letter, octave, alteration, accidental: alteration === base ? '' : symbolFor(alteration), clef, key, trap });
    }
  }
  return result;
}
export function generateGraded(s: Settings, count: number, previous?: number, state = new Map<number, number>()): Note[] {
  const grade = s.grade || 8;
  const max = gradeProfiles[grade - 1].maxKey;
  const allowedKeys = grade === 1 ? [0,1,2,-1] : Array.from({length: max * 2 + 1}, (_, i) => i - max);
  const allowedClefs: Clef[] = ['treble','bass'];
  const notes: Note[] = [];
  let lastKey = state.get(-1);
  for (let row = 0; row < Math.ceil(count / 10); row++) {
    const preferred: Clef[] = s.clef === 'mixed' || (s.grade && !allowedClefs.includes(s.clef)) ? allowedClefs : [s.clef];
    const options = (s.rowKeys ? allowedKeys : [0]).map(key => {
      const preferredPools = preferred.map(clef => rowPool(s, clef, key)).filter(p => p.length);
      const pools = preferredPools.length ? preferredPools : allowedClefs.map(clef => rowPool(s, clef, key)).filter(p => p.length);
      return { key, pools };
    }).filter(option => option.pools.length);
    const different = options.filter(option => option.key !== lastKey);
    const choices = different.length ? different : options;
    if (!choices.length) throw new Error('此音域不適合目前級別，請重新選擇級別音域。');
    const chosen = choices[Math.floor(Math.random() * choices.length)];
    const key = chosen.key;
    const minor = grade >= 3 ? Math.random() < .4 : grade === 2 && [0,1,-1].includes(key) && Math.random() < .35;
    const pool = chosen.pools[Math.floor(Math.random() * chosen.pools.length)];
    const trapSlots = new Set<number>([2,7]);
    const targetTraps = grade >= 6 ? (grade - 6) * 2 + 3 : 2;
    while (trapSlots.size < targetTraps) trapSlots.add(Math.floor(Math.random() * 10));
    let previousTrap = state.get(-2) ?? 0;
    for (let i = 0; i < Math.min(10, count - row * 10); i++) {
      const nonRepeating = pool.filter(n => n.midi !== previous);
      const candidates = nonRepeating.length ? nonRepeating : pool;
      const wantTrap = s.traps && grade >= 3 && s.accidentals && trapSlots.has(i);
      let targeted = candidates.filter(n => !!n.trap === wantTrap);
      if (wantTrap && grade >= 4) {
        const kind = previousTrap % 3; // Guarantee variety when each spelling is available.
        const group = targeted.filter(n => kind === 0 ? n.alteration === 2 : kind === 1 ? n.alteration === -2 : Math.abs(n.alteration ?? 0) === 1);
        if (group.length) targeted = group;
        previousTrap++;
      }
      const selection = targeted.length ? targeted : candidates;
      const note = { ...selection[Math.floor(Math.random() * selection.length)], keyName: keyLabel(key, minor) };
      notes.push(note); previous = note.midi;
    }
    state.set(-2, previousTrap); state.set(-1, key); lastKey = key;
  }
  return notes;
}
