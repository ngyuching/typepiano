import { generateGraded } from './grades';
export type Clef = 'treble' | 'bass' | 'alto' | 'tenor';
export type Settings = { low: number; high: number; clef: Clef | 'mixed'; accidentals: boolean; mode: 'standard' | 'infinite'; hints: boolean; muted: boolean; grade: number; traps: boolean; rowKeys: boolean };
export type Note = { midi: number; letter: string; octave: number; accidental: '' | '♯' | '♭' | '♮' | '𝄪' | '𝄫'; clef: Clef; key?: number; keyName?: string; alteration?: number; trap?: boolean };
export const defaults: Settings = { low: 48, high: 72, clef: 'mixed', accidentals: false, mode: 'standard', hints: true, muted: false, grade: 0, traps: false, rowKeys: false };
const names = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
export const isBlack = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);
export const pitchName = (midi: number) => names[midi % 12] + (isBlack(midi) ? '♯' : '') + (Math.floor(midi / 12) - 1);
export const frequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export function normalizeSettings(value: Partial<Settings>): Settings {
  const s = { ...defaults, ...value };
  s.low = Number.isInteger(s.low) ? Math.max(36, Math.min(84, s.low)) : defaults.low;
  s.high = Number.isInteger(s.high) ? Math.max(s.low, Math.min(84, s.high)) : Math.max(s.low, defaults.high);
  if (!['treble', 'bass', 'alto', 'tenor', 'mixed'].includes(s.clef)) s.clef = defaults.clef;
  if (!Number.isInteger(s.grade) || s.grade < 0 || s.grade > 8) s.grade = 0;
  if (!['standard', 'infinite'].includes(s.mode)) s.mode = defaults.mode;
  for (const k of ['accidentals', 'hints', 'muted', 'traps', 'rowKeys'] as const) s[k] = typeof s[k] === 'boolean' ? s[k] : defaults[k];
  // A natural-only range must contain at least one playable natural note.
  if (!s.grade && !s.rowKeys && !s.traps && !s.accidentals && s.low === s.high && isBlack(s.low)) { if (s.high < 84) s.high++; else s.low--; }
  return s;
}
export function spell(midi: number, clef: Settings['clef'], flat = false): Note {
  const black = isBlack(midi);
  const letter = black && flat ? names[(midi + 1) % 12] : names[midi % 12];
  return { midi, letter, octave: Math.floor(midi / 12) - 1, accidental: black ? (flat ? '♭' : '♯') : '', clef: clef === 'mixed' ? (midi >= 60 ? 'treble' : 'bass') : clef };
}
export function generate(s: Settings, count: number, previous?: number, spellingCounts = new Map<number, number>()): Note[] {
  if (s.grade || s.rowKeys || s.traps) return generateGraded(s, count, previous, spellingCounts);
  const pool = Array.from({ length: s.high - s.low + 1 }, (_, i) => s.low + i).filter(n => s.accidentals || !isBlack(n));
  if (!pool.length) throw new Error('音域中沒有可練習的音符');
  const result: Note[] = [];
  for (let i = 0; i < count; i++) {
    const candidates = pool.length > 1 ? pool.filter(n => n !== previous) : pool;
    const midi = candidates[Math.floor(Math.random() * candidates.length)];
    const seen = spellingCounts.get(midi) ?? 0;
    result.push(spell(midi, s.clef, seen % 2 === 1));
    if (isBlack(midi)) spellingCounts.set(midi, seen + 1);
    previous = midi;
  }
  return result;
}
export function staffStep(note: Note) {
  const absolute = note.octave * 7 + 'CDEFGAB'.indexOf(note.letter);
  return absolute - ({ treble: 30, bass: 18, alto: 24, tenor: 22 }[note.clef]);
}
export function ledgerSteps(step: number): number[] {
  const lines: number[] = [];
  for (let i = -2; i >= step; i -= 2) lines.push(i);
  for (let i = 10; i <= step; i += 2) lines.push(i);
  return lines;
}
export type Session = { notes: Note[]; index: number; answered: number; errors: number; firstCorrect: number; missed: boolean; started: number | null; finished: number | null };
export function createSession(s: Settings, counts = new Map<number, number>()): Session {
  return { notes: generate(s, s.mode === 'standard' ? 30 : 10, undefined, counts), index: 0, answered: 0, errors: 0, firstCorrect: 0, missed: false, started: null, finished: null };
}
export function answer(session: Session, midi: number, s: Settings, now: number, counts: Map<number, number>): Session {
  if (session.finished !== null) return session;
  const started = session.started ?? now;
  if (midi !== session.notes[session.index].midi) return { ...session, started, errors: session.errors + 1, missed: true };
  const next = { ...session, started, answered: session.answered + 1, firstCorrect: session.firstCorrect + (session.missed ? 0 : 1), missed: false, index: session.index + 1 };
  if (next.index === session.notes.length) {
    if (s.mode === 'standard') next.finished = now;
    else { next.notes = generate(s, 10, midi, counts); next.index = 0; }
  }
  return next;
}
