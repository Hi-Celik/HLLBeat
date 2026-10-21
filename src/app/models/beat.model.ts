export const SYNTH_SOUND_ID = '__SYNTH_4OSC__';

export type OscWaveform = 'sawtooth' | 'square' | 'sine' | 'triangle';

export interface SynthOscillatorConfig {
  id: 1 | 2 | 3 | 4;
  enabled: boolean;
  waveform: OscWaveform;
  octave: number; // -2 to +2
  semitone: number; // -12 to +12
  detune: number; // -100 to +100 cents
  pan: number; // -1 (L) to +1 (R)
  level: number; // 0 to 1
}

export interface SynthPatch {
  presetName: string;
  oscillators: [
    SynthOscillatorConfig,
    SynthOscillatorConfig,
    SynthOscillatorConfig,
    SynthOscillatorConfig
  ];
  filterType: 'lowpass' | 'highpass' | 'bandpass';
  filterCutoff: number; // 40 Hz - 18000 Hz
  filterResonance: number; // 0.5 - 18 Q
  filterEnvAmount: number; // -6000 Hz to +6000 Hz
  attack: number; // 0.002s - 1.5s
  decay: number; // 0.02s - 2.0s
  sustain: number; // 0.0 - 1.0
  release: number; // 0.02s - 2.5s
  masterGain: number; // 0.1 - 1.2
}

export interface PianoRollNote {
  id: string;
  midi: number; // e.g. 48 (C3) .. 84 (C6), 60 = C4
  startStep: number; // 0..15
  durationSteps: number; // 1..16
  velocity: number; // 0.1..1.0
}

export const NOTE_NAMES_SHARP = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

export function midiToNoteName(midi: number): string {
  const note = NOTE_NAMES_SHARP[midi % 12] || 'C';
  const octave = Math.floor(midi / 12) - 1;
  return `${note}${octave}`;
}

export function isBlackKeyMidi(midi: number): boolean {
  const mod = midi % 12;
  return mod === 1 || mod === 3 || mod === 6 || mod === 8 || mod === 10;
}

export function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function createDefaultSynthPatch(): SynthPatch {
  return {
    presetName: 'Cyber Supersaw Lead',
    oscillators: [
      {
        id: 1,
        enabled: true,
        waveform: 'sawtooth',
        octave: 0,
        semitone: 0,
        detune: -18,
        pan: -0.45,
        level: 0.85,
      },
      {
        id: 2,
        enabled: true,
        waveform: 'sawtooth',
        octave: 0,
        semitone: 0,
        detune: 18,
        pan: 0.45,
        level: 0.85,
      },
      {
        id: 3,
        enabled: true,
        waveform: 'square',
        octave: -1,
        semitone: 0,
        detune: -6,
        pan: 0,
        level: 0.55,
      },
      {
        id: 4,
        enabled: true,
        waveform: 'triangle',
        octave: 1,
        semitone: 7,
        detune: 12,
        pan: 0.15,
        level: 0.35,
      },
    ],
    filterType: 'lowpass',
    filterCutoff: 3800,
    filterResonance: 2.8,
    filterEnvAmount: 2600,
    attack: 0.004,
    decay: 0.2,
    sustain: 0.55,
    release: 0.14,
    masterGain: 0.85,
  };
}

export function cloneSynthPatch(patch?: SynthPatch): SynthPatch {
  const src = patch ?? createDefaultSynthPatch();
  return {
    ...src,
    oscillators: [
      { ...src.oscillators[0] },
      { ...src.oscillators[1] },
      { ...src.oscillators[2] },
      { ...src.oscillators[3] },
    ],
  };
}

export function createDefaultPianoRollNotes(): PianoRollNote[] {
  return [
    { id: 'pr-1', midi: 60, startStep: 0, durationSteps: 2, velocity: 0.95 }, // C4 (Beat 1.1)
    { id: 'pr-2', midi: 63, startStep: 2, durationSteps: 2, velocity: 0.88 }, // D#4 (Beat 1.3)
    { id: 'pr-3', midi: 67, startStep: 4, durationSteps: 2, velocity: 0.92 }, // G4 (Beat 2.1)
    { id: 'pr-4', midi: 72, startStep: 6, durationSteps: 2, velocity: 0.94 }, // C5 (Beat 2.3)
    { id: 'pr-5', midi: 60, startStep: 8, durationSteps: 3, velocity: 0.95 }, // C4 (Beat 3.1)
    { id: 'pr-6', midi: 63, startStep: 11, durationSteps: 1, velocity: 0.86 }, // D#4 (Beat 3.4 Kick sync)
    { id: 'pr-7', midi: 67, startStep: 12, durationSteps: 2, velocity: 0.92 }, // G4 (Beat 4.1)
    { id: 'pr-8', midi: 70, startStep: 14, durationSteps: 2, velocity: 0.9 }, // A#4 (Beat 4.3)
  ];
}

export interface TrackEffects {
  lowCutEnabled: boolean;
  lowCutFreq: number; // 20 Hz - 1000 Hz

  highCutEnabled: boolean;
  highCutFreq: number; // 500 Hz - 20000 Hz

  chorusEnabled: boolean;
  chorusRate: number; // 0.2 Hz - 6.0 Hz
  chorusDepth: number; // 0 - 100 %
  chorusMix: number; // 0 - 1

  delayEnabled: boolean;
  delayTime: number; // 0.05s - 1.0s
  delayFeedback: number; // 0 - 0.85
  delayMix: number; // 0 - 1

  reverbEnabled: boolean;
  reverbDecay: number; // 0.3s - 4.0s
  reverbMix: number; // 0 - 1
}

export function createDefaultTrackEffects(): TrackEffects {
  return {
    lowCutEnabled: false,
    lowCutFreq: 120,
    highCutEnabled: false,
    highCutFreq: 8000,
    chorusEnabled: false,
    chorusRate: 1.8,
    chorusDepth: 45,
    chorusMix: 0.35,
    delayEnabled: false,
    delayTime: 0.25,
    delayFeedback: 0.35,
    delayMix: 0.3,
    reverbEnabled: false,
    reverbDecay: 1.6,
    reverbMix: 0.3,
  };
}

export interface Track {
  id: string;
  name: string;
  sound: string;
  instrumentType?: 'sampler' | 'synth';
  synthPatch?: SynthPatch;
  pianoRollNotes?: PianoRollNote[];
  pianoRollSteps?: number; // Total 16th-note steps in the Wide Piano Roll (default 16 = 4 beats; expandable to 32, 64, 128+)
  pianoBaseOctave?: number; // Base octave for inline piano roll view (default 4 -> C4..B4)
  steps: boolean[];
  volume: number;
  muted: boolean;
  solo: boolean;
  accentColor: 'cyan' | 'purple' | 'emerald' | 'amber' | 'rose' | 'blue';
  effects: TrackEffects;
  triggerPulse?: boolean;
}

export interface PresetPattern {
  name: string;
  bpm: number;
  tracks: {
    name: string;
    sound: string;
    instrumentType?: 'sampler' | 'synth';
    accentColor: Track['accentColor'];
    steps: number[];
    pianoRollNotes?: PianoRollNote[];
    pianoRollSteps?: number;
    synthPatch?: SynthPatch;
  }[];
}

export interface PlaylistClip {
  id: string;
  rowId: string;
  startBeat: number; // 0-indexed beat position (snaps in 1-beat steps)
  durationBeats: number; // Default 4 beats (16 sixteenth-note steps)
  label: string;
}

export interface PlaylistRow {
  id: string;
  name: string;
  accentColor: Track['accentColor'];
  muted: boolean;
  solo: boolean;
  /**
   * Each Playlist row is an instance of the Beatmaker (Channel Rack) above.
   */
  tracks: Track[];
  /**
   * Boxes / pads placed horizontally along this row's beat timeline.
   */
  clips: PlaylistClip[];
}
