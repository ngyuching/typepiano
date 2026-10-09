import test from 'node:test';
import assert from 'node:assert/strict';
import { answer, createSession, defaults, frequency, generate, ledgerSteps, normalizeSettings, spell, staffStep } from './music';
import { gradeProfiles, keyAlteration, writtenPitch, noteExplanation } from './grades';
import { midiNote } from './midi';
test('boundary pitches, clefs and ledger lines', () => {
  assert.equal(staffStep(spell(36, 'mixed')), -4);
  assert.equal(staffStep(spell(60, 'mixed')), -2);
  assert.equal(staffStep(spell(84, 'mixed')), 12);
  assert.deepEqual(ledgerSteps(-5), [-2, -4]);
  assert.deepEqual(ledgerSteps(12), [10, 12]);
  assert.equal(frequency(69), 440);
  assert.equal(frequency(60), 261.6255653005986);
});
test('black-key spellings share pitch but have distinct staff positions', () => {
  const sharp = spell(61, 'treble'); const flat = spell(61, 'treble', true);
  assert.equal(sharp.midi, flat.midi); assert.equal(sharp.letter, 'C'); assert.equal(flat.letter, 'D');
  assert.equal(staffStep(flat) - staffStep(sharp), 1);
  const notes = generate({ ...defaults, low: 61, high: 61, accidentals: true }, 4);
  assert.deepEqual(notes.map(n => n.accidental), ['♯', '♭', '♯', '♭']);
});
test('generation respects ranges, naturals and consecutive repeat rules', () => {
  const notes = generate({ ...defaults, low: 36, high: 84 }, 500);
  for (let i = 0; i < notes.length; i++) {
    assert.ok(notes[i].midi >= 36 && notes[i].midi <= 84);
    assert.equal(notes[i].accidental, '');
    if (i) assert.notEqual(notes[i].midi, notes[i - 1].midi);
  }
  assert.equal(generate({ ...defaults, low: 60, high: 60 }, 30).length, 30);
  assert.deepEqual([normalizeSettings({ low: 61, high: 61 }).low, normalizeSettings({ low: 61, high: 61 }).high], [61, 62]);
  const sanitized = normalizeSettings({ low: -1, high: 200 });
  assert.equal(sanitized.low, 36); assert.equal(sanitized.high, 84);
});
test('wrong octave stays on question; completion and first-attempt scoring', () => {
  const s = { ...defaults, low: 60, high: 60 }; const counts = new Map<number, number>();
  let session = createSession(s, counts);
  session = answer(session, 72, s, 1000, counts);
  assert.equal(session.index, 0); assert.equal(session.errors, 1);
  session = answer(session, 60, s, 2000, counts);
  assert.equal(session.index, 1); assert.equal(session.firstCorrect, 0);
  for (let i = 1; i < 30; i++) session = answer(session, 60, s, 2000 + i * 100, counts);
  assert.equal(session.answered, 30); assert.equal(session.firstCorrect, 29); assert.equal(session.finished, 4900);
  assert.equal(answer(session, 60, s, 9000, counts), session);
});
test('infinite mode continues in batches and carries spelling alternation', () => {
  const s = { ...defaults, mode: 'infinite' as const, low: 61, high: 61, accidentals: true }; const counts = new Map<number, number>();
  let session = createSession(s, counts);
  for (let i = 0; i < 10; i++) session = answer(session, 61, s, i, counts);
  assert.equal(session.index, 0); assert.equal(session.answered, 10); assert.equal(session.finished, null);
  assert.equal(session.notes[0].accidental, '♯');
});
test('graded rows use allowed keys and consistent clefs; all spellings match sounding pitch', () => {
  for (const profile of gradeProfiles) {
    const settings = { ...defaults, grade: profile.grade, low: profile.low, high: profile.high, accidentals: true, traps: profile.traps, rowKeys: true };
    for (let round = 0; round < 12; round++) {
      const notes = generate(settings, 30);
      for (let i = 0; i < notes.length; i++) {
        const n = notes[i];
        assert.equal(n.midi, writtenPitch(n.letter, n.octave, n.alteration!));
        assert.ok(n.midi >= profile.low && n.midi <= profile.high);
        assert.ok(Math.abs(n.key!) <= profile.maxKey);
        if (i && i % 10) { assert.equal(n.key, notes[i - 1].key); assert.equal(n.clef, notes[i - 1].clef); }
        if (i && i % 10 === 0) assert.notEqual(n.key, notes[i - 1].key);
        if (i) assert.notEqual(n.midi, notes[i - 1].midi);
        if (profile.grade < 4) assert.ok(Math.abs(n.alteration!) < 2);
        if (profile.grade < 4) assert.ok(['treble','bass'].includes(n.clef));
        if (profile.grade === 4) assert.notEqual(n.clef, 'tenor');
        if (profile.grade === 1) assert.ok(staffStep(n) >= (n.clef === 'bass' ? 0 : -2) && staffStep(n) <= (n.clef === 'bass' ? 10 : 8));
        if (profile.grade === 2) assert.ok(staffStep(n) >= -4 && staffStep(n) <= 12);
        if (!n.accidental) assert.equal(n.alteration, keyAlteration(n.key!, n.letter));
      }
      if (profile.grade >= 4) { assert.ok(notes.some(n => n.alteration === 2)); assert.ok(notes.some(n => n.alteration === -2)); }
      if (profile.grade >= 6) assert.equal(notes.filter(n => n.trap).length, ((profile.grade - 6) * 2 + 3) * 3);
    }
  }
});
test('enharmonic traps retain written octaves and correct sounding octaves', () => {
  assert.equal(writtenPitch('E', 4, 1), 65);
  assert.equal(writtenPitch('B', 4, 1), 72);
  assert.equal(writtenPitch('C', 4, -1), 59);
  assert.equal(writtenPitch('B', 4, 2), 73);
  assert.equal(writtenPitch('C', 4, -2), 58);
  assert.equal(writtenPitch('F', 4, -1), 64);
  assert.ok(noteExplanation({ midi: 72, letter:'B', octave:4, alteration:1, accidental:'♯', clef:'treble' }).includes('C5'));
  assert.equal(staffStep({ midi:60, letter:'C', octave:4, accidental:'', clef:'alto' }), 4);
  assert.equal(staffStep({ midi:60, letter:'C', octave:4, accidental:'', clef:'tenor' }), 6);
});
test('MIDI accepts note-on on all channels and ignores release, pedals and malformed messages', () => {
  assert.equal(midiNote([0x90,60,100]), 60);
  assert.equal(midiNote([0x9f,72,1]), 72);
  assert.equal(midiNote([0x90,60,0]), null);
  assert.equal(midiNote([0x80,60,100]), null);
  assert.equal(midiNote([0xb0,64,127]), null);
  assert.equal(midiNote([0xf8]), null);
  assert.equal(midiNote([0x90,128,100]), null);
});
