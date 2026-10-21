import {
  Component,
  ElementRef,
  HostListener,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterOutlet } from '@angular/router';
import { AudioService } from './services/audio.service';
import {
  PianoRollNote,
  PlaylistClip,
  PlaylistRow,
  PresetPattern,
  SYNTH_SOUND_ID,
  SynthPatch,
  Track,
  TrackEffects,
  cloneSynthPatch,
  createDefaultPianoRollNotes,
  createDefaultSynthPatch,
  createDefaultTrackEffects,
  isBlackKeyMidi,
  midiToNoteName,
} from './models/beat.model';
import { SoundSelectorModalComponent } from './components/sound-selector-modal/sound-selector-modal.component';
import { TrackFxModalComponent } from './components/track-fx-modal/track-fx-modal.component';
import { SynthEditorModalComponent } from './components/synth-editor-modal/synth-editor-modal.component';

const ACCENT_PALETTE: Track['accentColor'][] = [
  'cyan',
  'rose',
  'amber',
  'purple',
  'emerald',
  'blue',
];

const DEFAULT_SOUNDS: string[] = [
  'Kick 1.wav',
  'Snare 1.wav',
  'Closed Hat 1.wav',
  'Clap 1.wav',
  'Open Hat 1.wav',
  'Percussion Hit 1.wav',
  'Shaker 1.wav',
  'Ride 1.wav',
  'Reverse Cymbal 1.wav',
  'Kick 2.wav',
];

interface ClipDragState {
  rowId: string;
  clipId: string;
  mode: 'move' | 'resize';
  startX: number;
  initialStartBeat: number;
  initialDurationBeats: number;
  beatWidthPx: number;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    RouterOutlet,
    CommonModule,
    FormsModule,
    SoundSelectorModalComponent,
    TrackFxModalComponent,
    SynthEditorModalComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  @ViewChild('timelineViewport') timelineViewport?: ElementRef<HTMLDivElement>;

  readonly title = 'HLLBeat';
  readonly audioService = inject(AudioService);
  readonly synthSoundId = SYNTH_SOUND_ID;

  // Core Sequencer Signals (Active Beatmaker Instance)
  readonly tracks = signal<Track[]>([]);
  readonly isPlaying = signal<boolean>(false);
  readonly playbackMode = signal<'pattern' | 'song'>('pattern');
  readonly bpm = signal<number>(120);
  readonly currentStep = signal<number>(-1);
  readonly swing = signal<number>(0);
  readonly activePresetName = signal<string>('Studio Groove');

  // DAW Playlist / Song Arrangement Signals
  readonly playlistRows = signal<PlaylistRow[]>([]);
  readonly activePlaylistRowId = signal<string>('');
  readonly selectedClipId = signal<string | null>(null);
  readonly totalTimelineBeats = signal<number>(32); // No upper cap (supports 480+ beats / 4+ minutes)
  readonly beatWidthPx = signal<number>(48); // Fixed pixel width per beat column
  readonly songStep = signal<number>(-1); // 1 beat = 4 sixteenth-note steps
  readonly isDraggingClip = signal<boolean>(false);
  readonly timelineScrollPercent = signal<number>(0);

  // Timeline Ruler Seek & Loop Region Selection Signals
  readonly isLoopSelectMode = signal<boolean>(false);
  readonly isLoopEnabled = signal<boolean>(false);
  readonly loopStartBeat = signal<number | null>(null); // 0-indexed inclusive
  readonly loopEndBeat = signal<number | null>(null); // 0-indexed exclusive
  private isSelectingLoopOnRuler = false;
  private loopAnchorBeat: number | null = null;

  // Sound Selector Modal Signals
  readonly isSoundSelectorOpen = signal<boolean>(false);
  readonly selectedRowIndex = signal<number | null>(null);

  // Channel FX Modal Signals
  readonly isFxModalOpen = signal<boolean>(false);
  readonly fxModalTrackIndex = signal<number | null>(null);

  // 4-OSC Synthesizer & Piano Roll Studio Modal Signals
  readonly isSynthModalOpen = signal<boolean>(false);
  readonly synthModalTrackIndex = signal<number | null>(null);
  readonly synthModalInitialTab = signal<'osc' | 'pianoroll'>('osc');
  readonly inlineNoteDuration = signal<number>(2);

  // Step indices array (0..15) for Beatmaker
  readonly stepIndices = Array.from({ length: 16 }, (_, i) => i);

  // Computed values for Timeline
  readonly timelineBeats = computed(() =>
    Array.from({ length: this.totalTimelineBeats() }, (_, i) => i)
  );

  readonly totalTimelineWidthPx = computed(
    () => this.totalTimelineBeats() * this.beatWidthPx()
  );

  readonly hasValidLoopRange = computed(() => {
    const start = this.loopStartBeat();
    const end = this.loopEndBeat();
    return start !== null && end !== null && end > start;
  });

  readonly loopLeftPx = computed(() => {
    const start = this.loopStartBeat();
    return start !== null ? start * this.beatWidthPx() : 0;
  });

  readonly loopWidthPx = computed(() => {
    const start = this.loopStartBeat();
    const end = this.loopEndBeat();
    if (start === null || end === null || end <= start) return 0;
    return (end - start) * this.beatWidthPx();
  });

  readonly songDurationFormatted = computed(() => {
    const totalSeconds = Math.round(
      (this.totalTimelineBeats() / this.bpm()) * 60
    );
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  });

  readonly currentSongBeat = computed(() => {
    const step = this.songStep();
    return step >= 0 ? Math.floor(step / 4) : -1;
  });

  readonly songPlayheadPx = computed(() => {
    const step = this.songStep();
    if (step < 0) return 0;
    return (step / 4) * this.beatWidthPx();
  });

  readonly activePlaylistRow = computed(() => {
    const id = this.activePlaylistRowId();
    return this.playlistRows().find((r) => r.id === id) ?? null;
  });

  readonly selectedClip = computed(() => {
    const clipId = this.selectedClipId();
    if (!clipId) return null;
    for (const row of this.playlistRows()) {
      const found = row.clips.find((c) => c.id === clipId);
      if (found) return found;
    }
    return null;
  });

  readonly hasSoloPlaylistRow = computed(() =>
    this.playlistRows().some((r) => r.solo)
  );

  // Computed values from Beatmaker Signals
  readonly stepDurationMs = computed(() => 15000 / this.bpm());
  readonly hasSoloTrack = computed(() => this.tracks().some((t) => t.solo));
  readonly activeNotesCount = computed(() =>
    this.tracks().reduce(
      (sum, track) =>
        sum +
        (this.isSynthTrack(track)
          ? (track.pianoRollNotes?.length ?? 0)
          : track.steps.filter(Boolean).length),
      0
    )
  );

  readonly selectedTrack = computed(() => {
    const idx = this.selectedRowIndex();
    const list = this.tracks();
    return idx !== null && list[idx] ? list[idx] : null;
  });

  readonly activeFxTrack = computed(() => {
    const idx = this.fxModalTrackIndex();
    const list = this.tracks();
    return idx !== null && list[idx] ? list[idx] : null;
  });

  readonly activeSynthTrack = computed(() => {
    const idx = this.synthModalTrackIndex();
    const list = this.tracks();
    return idx !== null && list[idx] ? list[idx] : null;
  });

  readonly presets: PresetPattern[] = [
    {
      name: 'Studio Groove',
      bpm: 120,
      tracks: [
        {
          name: 'Kick',
          sound: 'Kick 1.wav',
          accentColor: 'cyan',
          steps: [0, 4, 8, 11, 12],
        },
        {
          name: 'Snare',
          sound: 'Snare 1.wav',
          accentColor: 'rose',
          steps: [4, 12],
        },
        {
          name: 'Closed Hat',
          sound: 'Closed Hat 1.wav',
          accentColor: 'amber',
          steps: [0, 2, 4, 6, 8, 10, 12, 14, 15],
        },
        {
          name: 'Clap',
          sound: 'Clap 1.wav',
          accentColor: 'purple',
          steps: [4, 12, 14],
        },
      ],
    },
    {
      name: 'Trap 808',
      bpm: 140,
      tracks: [
        {
          name: 'Heavy Kick',
          sound: 'Kick 3.wav',
          accentColor: 'cyan',
          steps: [0, 7, 10],
        },
        {
          name: 'Crisp Snare',
          sound: 'Snare 2.wav',
          accentColor: 'rose',
          steps: [4, 12],
        },
        {
          name: 'Trap Hi-Hat',
          sound: 'Closed Hat 2.wav',
          accentColor: 'amber',
          steps: [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 12, 14, 15],
        },
        {
          name: 'Open Hat',
          sound: 'Open Hat 2.wav',
          accentColor: 'emerald',
          steps: [6, 14],
        },
        {
          name: 'Perc Hit',
          sound: 'Percussion Hit 2.wav',
          accentColor: 'purple',
          steps: [3, 11],
        },
      ],
    },
    {
      name: 'Club House',
      bpm: 126,
      tracks: [
        {
          name: 'House Kick',
          sound: 'Kick 2.wav',
          accentColor: 'cyan',
          steps: [0, 4, 8, 12],
        },
        {
          name: 'Club Clap',
          sound: 'Clap 2.wav',
          accentColor: 'purple',
          steps: [4, 12],
        },
        {
          name: 'Offbeat Hat',
          sound: 'Open Hat 1.wav',
          accentColor: 'emerald',
          steps: [2, 6, 10, 14],
        },
        {
          name: 'Shaker Groove',
          sound: 'Shaker 1.wav',
          accentColor: 'amber',
          steps: [1, 3, 5, 7, 9, 11, 13, 15],
        },
      ],
    },
    {
      name: 'Boom Bap',
      bpm: 92,
      tracks: [
        {
          name: 'Punch Kick',
          sound: 'Kick 4.wav',
          accentColor: 'cyan',
          steps: [0, 3, 8, 10],
        },
        {
          name: 'Tight Snare',
          sound: 'Snare 4.wav',
          accentColor: 'rose',
          steps: [4, 12, 15],
        },
        {
          name: 'Dusty Hat',
          sound: 'Closed Hat 4.wav',
          accentColor: 'amber',
          steps: [0, 2, 4, 6, 8, 10, 12, 14],
        },
        {
          name: 'Ride Bell',
          sound: 'Ride 1.wav',
          accentColor: 'blue',
          steps: [0, 6, 12],
        },
      ],
    },
  ];

  private stepTimer: ReturnType<typeof setTimeout> | null = null;
  private pulseTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private dragState: ClipDragState | null = null;

  constructor() {
    this.initializeDefaultPlaylist();
  }

  ngOnInit(): void {
    const prioritySounds = new Set<string>();
    this.playlistRows().forEach((row) =>
      row.tracks.forEach((t) => prioritySounds.add(t.sound))
    );
    this.audioService.initAndPreloadSounds(Array.from(prioritySounds));
  }

  ngOnDestroy(): void {
    this.stopSequencer();
    this.pulseTimers.forEach((timer) => clearTimeout(timer));
  }

  private initializeDefaultPlaylist(): void {
    const row1Tracks = this.buildTracksFromPreset(this.presets[0], 'r1');
    const row2Tracks = this.buildTracksFromPreset(this.presets[1], 'r2');
    const row3Tracks = this.buildTracksFromPreset(this.presets[2], 'r3');

    const initialRows: PlaylistRow[] = [
      {
        id: 'playlist-row-1',
        name: 'Pattern 1 • Main Groove',
        accentColor: 'cyan',
        muted: false,
        solo: false,
        tracks: row1Tracks,
        clips: [
          {
            id: 'clip-1a',
            rowId: 'playlist-row-1',
            startBeat: 0,
            durationBeats: 4,
            label: 'Pattern 1',
          },
          {
            id: 'clip-1b',
            rowId: 'playlist-row-1',
            startBeat: 4,
            durationBeats: 4,
            label: 'Pattern 1',
          },
        ],
      },
      {
        id: 'playlist-row-2',
        name: 'Pattern 2 • Trap Variation',
        accentColor: 'purple',
        muted: false,
        solo: false,
        tracks: row2Tracks,
        clips: [
          {
            id: 'clip-2a',
            rowId: 'playlist-row-2',
            startBeat: 8,
            durationBeats: 4,
            label: 'Pattern 2',
          },
        ],
      },
      {
        id: 'playlist-row-3',
        name: 'Pattern 3 • Club Groove',
        accentColor: 'emerald',
        muted: false,
        solo: false,
        tracks: row3Tracks,
        clips: [
          {
            id: 'clip-3a',
            rowId: 'playlist-row-3',
            startBeat: 12,
            durationBeats: 4,
            label: 'Pattern 3',
          },
        ],
      },
    ];

    this.playlistRows.set(initialRows);
    this.activePlaylistRowId.set(initialRows[0].id);
    this.selectedClipId.set(initialRows[0].clips[0].id);
    this.tracks.set(this.cloneTracks(initialRows[0].tracks));
  }

  private buildTracksFromPreset(preset: PresetPattern, prefix: string): Track[] {
    return preset.tracks.map((t, i) => {
      const isSynth = t.instrumentType === 'synth' || t.sound === SYNTH_SOUND_ID;
      const pianoRollNotes = isSynth
        ? (t.pianoRollNotes ? t.pianoRollNotes.map((n) => ({ ...n })) : createDefaultPianoRollNotes())
        : undefined;
      const steps = Array(16).fill(false);
      if (isSynth && pianoRollNotes) {
        pianoRollNotes.forEach((n) => {
          if (n.startStep >= 0 && n.startStep < 16) steps[n.startStep] = true;
        });
      } else {
        t.steps.forEach((s) => {
          if (s >= 0 && s < 16) steps[s] = true;
        });
      }
      return {
        id: `track-${prefix}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        name: t.name,
        sound: t.sound,
        instrumentType: isSynth ? 'synth' : 'sampler',
        synthPatch: isSynth ? cloneSynthPatch(t.synthPatch) : undefined,
        pianoRollNotes,
        pianoRollSteps: isSynth ? (t.pianoRollSteps || 16) : undefined,
        pianoBaseOctave: 4,
        steps,
        volume: 0.9,
        muted: false,
        solo: false,
        accentColor: t.accentColor,
        effects: createDefaultTrackEffects(),
        triggerPulse: false,
      };
    });
  }

  private cloneTracks(tracks: Track[]): Track[] {
    return tracks.map((t) => ({
      ...t,
      steps: [...t.steps],
      synthPatch: t.synthPatch ? cloneSynthPatch(t.synthPatch) : undefined,
      pianoRollNotes: t.pianoRollNotes
        ? t.pianoRollNotes.map((n) => ({ ...n }))
        : undefined,
      pianoRollSteps: t.pianoRollSteps,
      effects: { ...(t.effects || createDefaultTrackEffects()) },
      triggerPulse: false,
    }));
  }

  private syncTracksToActiveRow(syncClipDuration = false): void {
    const activeRowId = this.activePlaylistRowId();
    if (!activeRowId) return;
    const currentTracks = this.cloneTracks(this.tracks());
    let requiredTimelineBeats = this.totalTimelineBeats();

    this.playlistRows.update((rows) =>
      rows.map((row) => {
        if (row.id !== activeRowId) return row;

        const oldPatternBeats = this.getRowPatternBeats(row);
        const updatedRow: PlaylistRow = { ...row, tracks: currentTracks };
        const newPatternBeats = this.getRowPatternBeats(updatedRow);

        if (syncClipDuration || newPatternBeats !== oldPatternBeats) {
          let runningEnd = 0;
          const sortedClips = [...row.clips].sort((a, b) => a.startBeat - b.startBeat);
          const adjustedClips = sortedClips.map((clip) => {
            const nextStart = Math.max(clip.startBeat, runningEnd);
            const nextDuration =
              syncClipDuration || clip.durationBeats === oldPatternBeats || clip.durationBeats < newPatternBeats
                ? newPatternBeats
                : clip.durationBeats;
            runningEnd = nextStart + nextDuration;
            if (runningEnd > requiredTimelineBeats) {
              requiredTimelineBeats = Math.ceil((runningEnd + 4) / 4) * 4;
            }
            return {
              ...clip,
              startBeat: nextStart,
              durationBeats: nextDuration,
            };
          });
          updatedRow.clips = adjustedClips;
        }

        return updatedRow;
      })
    );

    if (requiredTimelineBeats > this.totalTimelineBeats()) {
      this.totalTimelineBeats.set(requiredTimelineBeats);
    }
  }

  // ==================== KEYBOARD & MOUSE DRAG LISTENERS ====================

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (event.code === 'Space') {
      if (this.isSynthModalOpen()) {
        return;
      }
      event.preventDefault();
      this.toggleGlowEffect();
      return;
    }

    if (event.code === 'ArrowLeft' && this.selectedClipId()) {
      event.preventDefault();
      this.nudgeSelectedClip(-1);
      return;
    }
    if (event.code === 'ArrowRight' && this.selectedClipId()) {
      event.preventDefault();
      this.nudgeSelectedClip(1);
      return;
    }

    if (event.key >= '1' && event.key <= '9') {
      const idx = parseInt(event.key, 10) - 1;
      const track = this.tracks()[idx];
      if (track) {
        this.triggerTrackPad(idx);
      }
    }
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    if (!this.dragState) return;

    const deltaX = event.clientX - this.dragState.startX;
    const deltaBeats = Math.round(deltaX / this.dragState.beatWidthPx);
    const { rowId, clipId, mode, initialStartBeat, initialDurationBeats } =
      this.dragState;

    let requiredBeats = this.totalTimelineBeats();

    this.playlistRows.update((rows) =>
      rows.map((row) => {
        if (row.id !== rowId) return row;

        const updatedClips = row.clips.map((clip) => {
          if (clip.id !== clipId) return clip;

          if (mode === 'resize') {
            const nextDuration = Math.max(1, initialDurationBeats + deltaBeats);
            if (clip.startBeat + nextDuration > requiredBeats) {
              requiredBeats =
                Math.ceil((clip.startBeat + nextDuration + 4) / 4) * 4;
            }
            return { ...clip, durationBeats: nextDuration };
          } else {
            const nextStart = Math.max(0, initialStartBeat + deltaBeats);
            if (nextStart + initialDurationBeats > requiredBeats) {
              requiredBeats =
                Math.ceil((nextStart + initialDurationBeats + 4) / 4) * 4;
            }
            return {
              ...clip,
              startBeat: nextStart,
              durationBeats: initialDurationBeats,
            };
          }
        });

        return { ...row, clips: updatedClips };
      })
    );

    if (requiredBeats > this.totalTimelineBeats()) {
      this.totalTimelineBeats.set(requiredBeats);
    }
  }

  @HostListener('window:mouseup')
  onWindowMouseUp(): void {
    if (this.dragState) {
      this.dragState = null;
      this.isDraggingClip.set(false);
    }

    if (this.isSelectingLoopOnRuler) {
      this.isSelectingLoopOnRuler = false;
      if (this.hasValidLoopRange() && this.isLoopEnabled()) {
        const startBeat = this.loopStartBeat()!;
        this.startSongFromBeat(startBeat);
      }
    }
  }

  // ==================== RULER SEEK & LOOP SELECTION ====================

  toggleLoopSelectMode(): void {
    this.isLoopSelectMode.set(!this.isLoopSelectMode());
  }

  toggleLoopEnabled(): void {
    if (!this.hasValidLoopRange()) {
      this.loopStartBeat.set(0);
      this.loopEndBeat.set(Math.min(8, this.totalTimelineBeats()));
      this.isLoopEnabled.set(true);
      return;
    }
    this.isLoopEnabled.set(!this.isLoopEnabled());
  }

  clearLoopSelection(): void {
    this.isLoopEnabled.set(false);
    this.loopStartBeat.set(null);
    this.loopEndBeat.set(null);
    this.loopAnchorBeat = null;
  }

  onRulerBeatMouseDown(beatIndex: number, event: MouseEvent): void {
    event.stopPropagation();
    if (event.button !== 0) return;

    if (this.isLoopSelectMode() || event.shiftKey) {
      this.isSelectingLoopOnRuler = true;
      this.loopAnchorBeat = beatIndex;
      this.loopStartBeat.set(beatIndex);
      this.loopEndBeat.set(beatIndex + 1);
      this.isLoopEnabled.set(true);
    } else {
      this.startSongFromBeat(beatIndex);
    }
  }

  onRulerBeatMouseEnter(beatIndex: number): void {
    if (!this.isSelectingLoopOnRuler || this.loopAnchorBeat === null) return;

    const minBeat = Math.min(this.loopAnchorBeat, beatIndex);
    const maxBeat = Math.max(this.loopAnchorBeat, beatIndex) + 1;
    this.loopStartBeat.set(minBeat);
    this.loopEndBeat.set(maxBeat);
    this.isLoopEnabled.set(true);
  }

  isBeatInLoopRange(beatIndex: number): boolean {
    if (!this.hasValidLoopRange()) return false;
    const start = this.loopStartBeat()!;
    const end = this.loopEndBeat()!;
    return beatIndex >= start && beatIndex < end;
  }

  private expectedStepAudioTime = 0;

  startPatternFromStep(stepIndex: number, event?: Event): void {
    event?.stopPropagation();
    if (this.stepTimer) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
    this.playbackMode.set('pattern');
    this.isPlaying.set(true);
    const startAudioTime = this.audioService.getAudioTime() + 0.006;
    this.expectedStepAudioTime = startAudioTime;
    this.executePatternStep(stepIndex, startAudioTime);
    this.currentStep.set(stepIndex);
    this.scheduleNextStep();
  }

  startSongFromBeat(beatIndex: number): void {
    if (this.stepTimer) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }

    const targetStep = beatIndex * 4;
    this.playbackMode.set('song');
    this.isPlaying.set(true);
    const startAudioTime = this.audioService.getAudioTime() + 0.006;
    this.expectedStepAudioTime = startAudioTime;
    this.executeSongStep(targetStep, startAudioTime);
    this.songStep.set(targetStep);
    this.currentStep.set(this.computeActivePatternStepFromSongStep(targetStep));
    this.scheduleNextStep();
  }

  // ==================== PLAYBACK ENGINE (PATTERN & SONG MODES) ====================

  setPlaybackMode(mode: 'pattern' | 'song'): void {
    if (this.playbackMode() === mode) return;
    const wasPlaying = this.isPlaying();
    if (wasPlaying) {
      this.stopSequencer();
    }
    this.playbackMode.set(mode);
    if (wasPlaying) {
      this.startSequencer();
    }
  }

  playFullSong(): void {
    if (this.isPlaying() && this.playbackMode() === 'song') {
      this.stopSequencer();
      return;
    }
    this.stopSequencer();
    this.playbackMode.set('song');
    this.startSequencer();
  }

  toggleGlowEffect(): void {
    if (this.isPlaying()) {
      this.stopSequencer();
    } else {
      this.startSequencer();
    }
  }

  startSequencer(): void {
    if (this.isPlaying()) return;
    this.isPlaying.set(true);
    const startAudioTime = this.audioService.getAudioTime() + 0.006;
    this.expectedStepAudioTime = startAudioTime;

    if (this.playbackMode() === 'song') {
      const initialBeat =
        this.isLoopEnabled() && this.hasValidLoopRange()
          ? this.loopStartBeat()!
          : 0;
      const initialStep = initialBeat * 4;
      this.executeSongStep(initialStep, startAudioTime);
      this.songStep.set(initialStep);
      this.currentStep.set(this.computeActivePatternStepFromSongStep(initialStep));
    } else {
      this.executePatternStep(0, startAudioTime);
      this.currentStep.set(0);
    }

    this.scheduleNextStep();
  }

  stopSequencer(): void {
    this.isPlaying.set(false);
    this.currentStep.set(-1);
    this.songStep.set(-1);
    this.expectedStepAudioTime = 0;
    if (this.stepTimer) {
      clearTimeout(this.stepTimer);
      this.stepTimer = null;
    }
  }

  private computeActivePatternStepFromSongStep(globalStepIndex: number): number {
    const activeSteps = this.getActivePatternTotalSteps();
    const activeRow = this.activePlaylistRow();
    if (activeRow) {
      const clip = activeRow.clips.find((c) => {
        const start = c.startBeat * 4;
        const end = (c.startBeat + c.durationBeats) * 4;
        return globalStepIndex >= start && globalStepIndex < end;
      });
      if (clip) {
        return (globalStepIndex - clip.startBeat * 4) % activeSteps;
      }
    }
    return globalStepIndex % activeSteps;
  }

  /**
   * Web Audio Hardware Clock Lookahead Scheduler:
   * Schedules both Drum samples and 4-OSC Synthesizer notes ahead of time using AudioContext.currentTime
   * so all instruments on a step fire on the exact same audio sample with zero main-thread jitter.
   */
  private scheduleNextStep(): void {
    if (!this.isPlaying()) return;

    const current =
      this.playbackMode() === 'song' ? this.songStep() : this.currentStep();
    const baseSec = 15 / this.bpm();
    const swingRatio = (this.swing() / 100) * 0.35;
    const stepIntervalSec =
      current % 2 === 0 ? baseSec * (1 + swingRatio) : baseSec * (1 - swingRatio);

    const nowAudio = this.audioService.getAudioTime();
    if (
      !this.expectedStepAudioTime ||
      nowAudio - this.expectedStepAudioTime > stepIntervalSec * 4
    ) {
      this.expectedStepAudioTime = nowAudio + stepIntervalSec;
    } else {
      this.expectedStepAudioTime += stepIntervalSec;
    }

    // Wake up 25ms ahead of the hardware audio timestamp to pre-schedule all voices in Web Audio
    const lookaheadLeadSec = 0.025;
    const delayMs = Math.max(
      4,
      (this.expectedStepAudioTime - nowAudio - lookaheadLeadSec) * 1000
    );

    this.stepTimer = setTimeout(() => {
      if (!this.isPlaying()) return;

      const scheduledAudioTime = Math.max(
        this.audioService.getAudioTime() + 0.004,
        this.expectedStepAudioTime
      );

      if (this.playbackMode() === 'song') {
        const totalSteps = this.totalTimelineBeats() * 4;
        let nextSongStep = this.songStep() + 1;

        if (this.isLoopEnabled() && this.hasValidLoopRange()) {
          const loopStartStep = this.loopStartBeat()! * 4;
          const loopEndStep = this.loopEndBeat()! * 4;
          if (nextSongStep >= loopEndStep || nextSongStep < loopStartStep) {
            nextSongStep = loopStartStep;
          }
        } else {
          nextSongStep = nextSongStep % totalSteps;
        }

        // Schedule audio first before triggering Angular signal updates
        this.executeSongStep(nextSongStep, scheduledAudioTime);
        this.songStep.set(nextSongStep);
        this.currentStep.set(
          this.computeActivePatternStepFromSongStep(nextSongStep)
        );
      } else {
        const patternSteps = this.getActivePatternTotalSteps();
        const nextStep = (this.currentStep() + 1) % patternSteps;
        // Schedule audio first before triggering Angular signal updates
        this.executePatternStep(nextStep, scheduledAudioTime);
        this.currentStep.set(nextStep);
      }

      this.scheduleNextStep();
    }, delayMs);
  }

  private executePatternStep(stepIndex: number, stepAudioTime: number): void {
    const currentTracks = this.tracks();
    const anySolo = this.hasSoloTrack();
    const stepDurationSec = 15 / this.bpm();

    for (let rowIndex = 0; rowIndex < currentTracks.length; rowIndex++) {
      const track = currentTracks[rowIndex];
      const isAudible = anySolo ? track.solo : !track.muted;
      if (!isAudible) continue;

      if (this.isSynthTrack(track)) {
        const trackTotalSteps = this.getTrackPianoRollSteps(track);
        const synthLocalStep = stepIndex % trackTotalSteps;
        const notesAtStep = (track.pianoRollNotes || []).filter(
          (n) => Math.floor(n.startStep) === synthLocalStep
        );
        for (const note of notesAtStep) {
          const gateSec = Math.max(
            0.035,
            note.durationSteps * stepDurationSec * 0.88
          );
          this.audioService.playSynthNote(
            note.midi,
            gateSec,
            track.volume * (note.velocity ?? 0.9),
            track.synthPatch,
            track.effects,
            stepAudioTime,
            track.id
          );
        }
        continue;
      }

      const drumStep = stepIndex % 16;
      if (track.steps[drumStep] && track.sound) {
        this.audioService.playSound(
          track.sound,
          track.volume,
          track.effects,
          stepAudioTime
        );
      }
    }
  }

  private executeSongStep(globalStepIndex: number, stepAudioTime: number): void {
    const rows = this.playlistRows();
    const anyRowSolo = this.hasSoloPlaylistRow();
    const stepDurationSec = 15 / this.bpm();

    for (const row of rows) {
      const isRowAudible = anyRowSolo ? row.solo : !row.muted;
      if (!isRowAudible) continue;

      const activeClip = row.clips.find((clip) => {
        const clipStartStep = clip.startBeat * 4;
        const clipEndStep = (clip.startBeat + clip.durationBeats) * 4;
        return globalStepIndex >= clipStartStep && globalStepIndex < clipEndStep;
      });

      if (!activeClip) continue;

      const relClipStep = globalStepIndex - activeClip.startBeat * 4;
      const drumLocalStep = relClipStep % 16;
      const anyTrackSolo = row.tracks.some((t) => t.solo);

      for (const track of row.tracks) {
        const isTrackAudible = anyTrackSolo ? track.solo : !track.muted;
        if (!isTrackAudible) continue;

        if (this.isSynthTrack(track)) {
          const trackTotalSteps = this.getTrackPianoRollSteps(track);
          const synthLocalStep = relClipStep % trackTotalSteps;
          const notesAtStep = (track.pianoRollNotes || []).filter(
            (n) => Math.floor(n.startStep) === synthLocalStep
          );
          for (const note of notesAtStep) {
            const gateSec = Math.max(
              0.035,
              note.durationSteps * stepDurationSec * 0.88
            );
            this.audioService.playSynthNote(
              note.midi,
              gateSec,
              track.volume * (note.velocity ?? 0.9),
              track.synthPatch,
              track.effects,
              stepAudioTime,
              `${row.id}-${track.id}`
            );
          }
          continue;
        }

        if (track.steps[drumLocalStep] && track.sound) {
          this.audioService.playSound(
            track.sound,
            track.volume,
            track.effects,
            stepAudioTime
          );
        }
      }
    }
  }

  private flashTrackPulse(rowIndex: number): void {
    const track = this.tracks()[rowIndex];
    if (!track) return;

    this.tracks.update((list) =>
      list.map((t, i) => (i === rowIndex ? { ...t, triggerPulse: true } : t))
    );

    const existingTimer = this.pulseTimers.get(track.id);
    if (existingTimer) clearTimeout(existingTimer);

    const timer = setTimeout(() => {
      this.tracks.update((list) =>
        list.map((t) => (t.id === track.id ? { ...t, triggerPulse: false } : t))
      );
    }, 140);

    this.pulseTimers.set(track.id, timer);
  }

  // ==================== PLAYLIST / TIMELINE OPERATIONS ====================

  selectPlaylistClip(row: PlaylistRow, clip: PlaylistClip, event?: Event): void {
    event?.stopPropagation();
    this.selectedClipId.set(clip.id);
    this.switchActivePlaylistRow(row);
  }

  selectPlaylistRow(row: PlaylistRow): void {
    this.switchActivePlaylistRow(row);
    if (row.clips.length > 0) {
      this.selectedClipId.set(row.clips[0].id);
    } else {
      this.selectedClipId.set(null);
    }
  }

  private switchActivePlaylistRow(row: PlaylistRow): void {
    if (this.activePlaylistRowId() === row.id) return;
    this.activePlaylistRowId.set(row.id);
    this.tracks.set(this.cloneTracks(row.tracks));
    this.activePresetName.set(row.name);
    row.tracks.forEach((t) => this.audioService.preloadSound(t.sound));
  }

  addPlaylistRow(): void {
    const rows = this.playlistRows();
    const nextNum = rows.length + 1;
    const accentColor = ACCENT_PALETTE[(nextNum - 1) % ACCENT_PALETTE.length];
    const rowId = `playlist-row-${Date.now()}`;
    const clipId = `clip-${Date.now()}`;

    const starterTracks: Track[] = [
      {
        id: `t-${Date.now()}-1`,
        name: 'Kick 1',
        sound: 'Kick 1.wav',
        steps: [true, false, false, false, true, false, false, false, true, false, false, false, true, false, false, false],
        volume: 0.9,
        muted: false,
        solo: false,
        accentColor: 'cyan',
        effects: createDefaultTrackEffects(),
      },
      {
        id: `t-${Date.now()}-2`,
        name: 'Snare 1',
        sound: 'Snare 1.wav',
        steps: [false, false, false, false, true, false, false, false, false, false, false, false, true, false, false, false],
        volume: 0.9,
        muted: false,
        solo: false,
        accentColor: 'rose',
        effects: createDefaultTrackEffects(),
      },
      {
        id: `t-${Date.now()}-3`,
        name: 'Closed Hat 1',
        sound: 'Closed Hat 1.wav',
        steps: [true, false, true, false, true, false, true, false, true, false, true, false, true, false, true, false],
        volume: 0.85,
        muted: false,
        solo: false,
        accentColor: 'amber',
        effects: createDefaultTrackEffects(),
      },
      {
        id: `t-${Date.now()}-4`,
        name: 'Clap 1',
        sound: 'Clap 1.wav',
        steps: Array(16).fill(false),
        volume: 0.85,
        muted: false,
        solo: false,
        accentColor: 'purple',
        effects: createDefaultTrackEffects(),
      },
    ];

    const newRow: PlaylistRow = {
      id: rowId,
      name: `Pattern ${nextNum}`,
      accentColor,
      muted: false,
      solo: false,
      tracks: starterTracks,
      clips: [
        {
          id: clipId,
          rowId,
          startBeat: 0,
          durationBeats: 4,
          label: `Pattern ${nextNum}`,
        },
      ],
    };

    this.playlistRows.update((list) => [...list, newRow]);
    this.selectPlaylistClip(newRow, newRow.clips[0]);
  }

  duplicatePlaylistRow(rowIndex: number, event?: Event): void {
    event?.stopPropagation();
    const rows = this.playlistRows();
    const source = rows[rowIndex];
    if (!source) return;

    const newRowId = `playlist-row-${Date.now()}`;
    const nextNum = rows.length + 1;
    const accentColor = ACCENT_PALETTE[(nextNum - 1) % ACCENT_PALETTE.length];

    const duplicatedClips: PlaylistClip[] = source.clips.map((c, idx) => ({
      ...c,
      id: `clip-${Date.now()}-${idx}`,
      rowId: newRowId,
      label: `Pattern ${nextNum}`,
    }));

    const duplicatedRow: PlaylistRow = {
      id: newRowId,
      name: `Pattern ${nextNum} (Copy)`,
      accentColor,
      muted: false,
      solo: false,
      tracks: this.cloneTracks(source.tracks),
      clips: duplicatedClips,
    };

    this.playlistRows.update((list) => [...list, duplicatedRow]);
    if (duplicatedRow.clips.length > 0) {
      this.selectPlaylistClip(duplicatedRow, duplicatedRow.clips[0]);
    } else {
      this.selectPlaylistRow(duplicatedRow);
    }
  }

  deletePlaylistRow(rowIndex: number, event?: Event): void {
    event?.stopPropagation();
    const rows = this.playlistRows();
    if (rows.length <= 1) return;

    const removedRow = rows[rowIndex];
    const updatedRows = rows.filter((_, idx) => idx !== rowIndex);
    this.playlistRows.set(updatedRows);

    if (this.activePlaylistRowId() === removedRow.id && updatedRows.length > 0) {
      const nextRow = updatedRows[Math.max(0, rowIndex - 1)];
      if (nextRow.clips.length > 0) {
        this.selectPlaylistClip(nextRow, nextRow.clips[0]);
      } else {
        this.selectPlaylistRow(nextRow);
      }
    }
  }

  togglePlaylistRowMute(rowIndex: number, event?: Event): void {
    event?.stopPropagation();
    this.playlistRows.update((rows) =>
      rows.map((r, idx) => (idx === rowIndex ? { ...r, muted: !r.muted } : r))
    );
  }

  togglePlaylistRowSolo(rowIndex: number, event?: Event): void {
    event?.stopPropagation();
    this.playlistRows.update((rows) =>
      rows.map((r, idx) => (idx === rowIndex ? { ...r, solo: !r.solo } : r))
    );
  }

  addClipToRow(row: PlaylistRow, preferredBeat?: number, event?: Event): void {
    event?.stopPropagation();

    let startBeat = preferredBeat ?? 0;
    if (preferredBeat === undefined) {
      const lastClipEnd = row.clips.reduce(
        (maxEnd, c) => Math.max(maxEnd, c.startBeat + c.durationBeats),
        0
      );
      startBeat = lastClipEnd;
    }

    const durationBeats = this.getRowPatternBeats(row);
    if (startBeat + durationBeats > this.totalTimelineBeats()) {
      const expanded = Math.ceil((startBeat + durationBeats + 4) / 4) * 4;
      this.totalTimelineBeats.set(expanded);
    }

    const newClip: PlaylistClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rowId: row.id,
      startBeat,
      durationBeats,
      label: row.name.split('•')[0].trim(),
    };

    this.playlistRows.update((rows) =>
      rows.map((r) =>
        r.id === row.id ? { ...r, clips: [...r.clips, newClip] } : r
      )
    );

    const updatedRow = this.playlistRows().find((r) => r.id === row.id);
    if (updatedRow) {
      this.selectPlaylistClip(updatedRow, newClip);
    }
  }

  deleteClip(rowId: string, clipId: string, event: Event): void {
    event.stopPropagation();
    this.playlistRows.update((rows) =>
      rows.map((r) =>
        r.id === rowId
          ? { ...r, clips: r.clips.filter((c) => c.id !== clipId) }
          : r
      )
    );

    if (this.selectedClipId() === clipId) {
      const row = this.playlistRows().find((r) => r.id === rowId);
      this.selectedClipId.set(row?.clips[0]?.id ?? null);
    }
  }

  onClipDragStart(
    event: MouseEvent,
    row: PlaylistRow,
    clip: PlaylistClip
  ): void {
    event.stopPropagation();
    if (event.button !== 0) return;

    this.selectPlaylistClip(row, clip);

    this.dragState = {
      rowId: row.id,
      clipId: clip.id,
      mode: 'move',
      startX: event.clientX,
      initialStartBeat: clip.startBeat,
      initialDurationBeats: clip.durationBeats,
      beatWidthPx: this.beatWidthPx(),
    };
    this.isDraggingClip.set(true);
  }

  onClipResizeStart(
    event: MouseEvent,
    row: PlaylistRow,
    clip: PlaylistClip
  ): void {
    event.stopPropagation();
    event.preventDefault();
    if (event.button !== 0) return;

    this.selectPlaylistClip(row, clip);

    this.dragState = {
      rowId: row.id,
      clipId: clip.id,
      mode: 'resize',
      startX: event.clientX,
      initialStartBeat: clip.startBeat,
      initialDurationBeats: clip.durationBeats,
      beatWidthPx: this.beatWidthPx(),
    };
    this.isDraggingClip.set(true);
  }

  nudgeSelectedClip(deltaBeats: number): void {
    const clipId = this.selectedClipId();
    if (!clipId) return;

    let requiredBeats = this.totalTimelineBeats();

    this.playlistRows.update((rows) =>
      rows.map((row) => ({
        ...row,
        clips: row.clips.map((clip) => {
          if (clip.id !== clipId) return clip;
          const nextBeat = Math.max(0, clip.startBeat + deltaBeats);
          if (nextBeat + clip.durationBeats > requiredBeats) {
            requiredBeats =
              Math.ceil((nextBeat + clip.durationBeats + 4) / 4) * 4;
          }
          return { ...clip, startBeat: nextBeat };
        }),
      }))
    );

    if (requiredBeats > this.totalTimelineBeats()) {
      this.totalTimelineBeats.set(requiredBeats);
    }
  }

  adjustTimelineBeats(delta: number): void {
    const next = Math.max(8, this.totalTimelineBeats() + delta);
    this.totalTimelineBeats.set(next);
  }

  setFourMinuteTimeline(): void {
    const beatsFor4Minutes = Math.ceil((this.bpm() * 4) / 4) * 4;
    this.totalTimelineBeats.set(
      Math.max(this.totalTimelineBeats(), beatsFor4Minutes)
    );
  }

  adjustBeatZoom(deltaPx: number): void {
    const next = Math.max(24, Math.min(72, this.beatWidthPx() + deltaPx));
    this.beatWidthPx.set(next);
  }

  // ==================== TIMELINE HORIZONTAL SCROLL SYNC ====================

  onTimelineNativeScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) {
      this.timelineScrollPercent.set(0);
    } else {
      this.timelineScrollPercent.set((el.scrollLeft / maxScroll) * 100);
    }
  }

  onScrollSliderChange(percent: number): void {
    const num = Number(percent);
    this.timelineScrollPercent.set(num);
    const el = this.timelineViewport?.nativeElement;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll > 0) {
      el.scrollLeft = (num / 100) * maxScroll;
    }
  }

  scrollTimelineBy(deltaPx: number): void {
    const el = this.timelineViewport?.nativeElement;
    if (!el) return;
    el.scrollBy({ left: deltaPx, behavior: 'smooth' });
  }

  isClipCurrentlyPlaying(row: PlaylistRow, clip: PlaylistClip): boolean {
    if (!this.isPlaying() || this.playbackMode() !== 'song') return false;
    const step = this.songStep();
    if (step < 0) return false;
    const startStep = clip.startBeat * 4;
    const endStep = (clip.startBeat + clip.durationBeats) * 4;
    return step >= startStep && step < endStep && !row.muted;
  }

  /**
   * Returns total 16th-note steps for a Synth track's Piano Roll (default 16 = 4 beats; expandable to 32, 48, 64, 128+).
   */
  getTrackPianoRollSteps(track: Track): number {
    if (!this.isSynthTrack(track)) return 16;
    let maxSteps = track.pianoRollSteps || 16;
    for (const note of track.pianoRollNotes || []) {
      const end = note.startStep + note.durationSteps;
      if (end > maxSteps) maxSteps = end;
    }
    return Math.max(4, Math.ceil(maxSteps / 4) * 4);
  }

  getTrackStepIndices(track: Track): number[] {
    return Array.from(
      { length: this.getTrackPianoRollSteps(track) },
      (_, i) => i
    );
  }

  getActivePatternTotalSteps(): number {
    let maxSteps = 16;
    for (const track of this.tracks()) {
      if (this.isSynthTrack(track)) {
        const s = this.getTrackPianoRollSteps(track);
        if (s > maxSteps) maxSteps = s;
      }
    }
    return maxSteps;
  }

  getRowPatternSteps(row: PlaylistRow): number {
    let maxSteps = 16;
    for (const track of row.tracks) {
      if (this.isSynthTrack(track)) {
        const s = this.getTrackPianoRollSteps(track);
        if (s > maxSteps) maxSteps = s;
      }
    }
    return maxSteps;
  }

  getRowPatternBeats(row: PlaylistRow): number {
    return Math.max(4, Math.ceil(this.getRowPatternSteps(row) / 4));
  }

  /**
   * Returns 0-indexed repeat cycle indices for a Playlist clip based on the row's pattern/melody beat length
   * so pattern/melody previews never stretch when a clip is resized, and instead repeat at exact beat scale.
   */
  getClipRepeatCycles(row: PlaylistRow, clip: PlaylistClip): number[] {
    const cycleBeats = this.getRowPatternBeats(row);
    const cycles = Math.max(1, Math.ceil(clip.durationBeats / cycleBeats));
    return Array.from({ length: cycles }, (_, i) => i);
  }

  hasSynthInRow(row: PlaylistRow): boolean {
    return row.tracks.some(
      (t) => this.isSynthTrack(t) && (t.pianoRollNotes?.length ?? 0) > 0
    );
  }

  getRowSynthNotes(
    row: PlaylistRow
  ): { note: PianoRollNote; topPercent: number }[] {
    const result: { note: PianoRollNote; topPercent: number }[] = [];
    for (const track of row.tracks) {
      if (this.isSynthTrack(track) && track.pianoRollNotes?.length) {
        for (const note of track.pianoRollNotes) {
          result.push({
            note,
            topPercent: this.getMiniPreviewNoteTopPercent(track, note),
          });
        }
      }
    }
    return result;
  }

  getRowDrumPreviewTracks(row: PlaylistRow): Track[] {
    const drumTracks = row.tracks.filter((t) => !this.isSynthTrack(t));
    if (this.hasSynthInRow(row)) {
      return drumTracks.slice(0, 2);
    }
    return drumTracks.slice(0, 4);
  }

  getRowDrumPreviewSteps(row: PlaylistRow, drumTrack: Track): boolean[] {
    const totalSteps = this.getRowPatternSteps(row);
    return Array.from(
      { length: totalSteps },
      (_, idx) => !!drumTrack.steps[idx % 16]
    );
  }

  // ==================== BEATMAKER TRACK & STEP OPERATIONS ====================

  isSynthTrack(track: Track): boolean {
    return track.instrumentType === 'synth' || track.sound === SYNTH_SOUND_ID;
  }

  triggerTrackPad(rowIndex: number): void {
    const track = this.tracks()[rowIndex];
    if (!track) return;
    if (this.isSynthTrack(track)) {
      const firstNoteMidi = track.pianoRollNotes?.[0]?.midi ?? 60;
      this.audioService.playSynthNote(
        firstNoteMidi,
        0.3,
        track.volume,
        track.synthPatch,
        track.effects
      );
    } else {
      this.audioService.playSound(track.sound, track.volume, track.effects);
    }
    this.flashTrackPulse(rowIndex);
  }

  onBoxClick(rowIndex: number, stepIndex: number): void {
    if (stepIndex < 0 || stepIndex >= 16) return;

    const currentTrack = this.tracks()[rowIndex];
    const willActivate = currentTrack && !currentTrack.steps[stepIndex];

    this.tracks.update((list) =>
      list.map((track, idx) => {
        if (idx !== rowIndex) return track;
        const updatedSteps = [...track.steps];
        updatedSteps[stepIndex] = !updatedSteps[stepIndex];
        return { ...track, steps: updatedSteps };
      })
    );

    this.syncTracksToActiveRow();

    if (willActivate && !this.isPlaying() && currentTrack?.sound) {
      this.audioService.playSound(
        currentTrack.sound,
        currentTrack.volume * 0.85,
        currentTrack.effects
      );
    }
  }

  addRow(): void {
    const currentLength = this.tracks().length;
    if (currentLength >= 10) return;

    const defaultSound =
      DEFAULT_SOUNDS[currentLength % DEFAULT_SOUNDS.length] || 'Kick 1.wav';
    const accentColor = ACCENT_PALETTE[currentLength % ACCENT_PALETTE.length];

    const newTrack: Track = {
      id: `track-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: this.formatSoundLabel(defaultSound),
      sound: defaultSound,
      instrumentType: 'sampler',
      steps: Array(16).fill(false),
      volume: 0.9,
      muted: false,
      solo: false,
      accentColor,
      effects: createDefaultTrackEffects(),
      triggerPulse: false,
    };

    this.tracks.update((list) => [...list, newTrack]);
    this.syncTracksToActiveRow();
    this.audioService.preloadSound(defaultSound);
  }

  addSynthRow(): void {
    const currentLength = this.tracks().length;
    if (currentLength >= 10) return;

    const defaultNotes = createDefaultPianoRollNotes();
    const steps = Array(16).fill(false);
    defaultNotes.forEach((n) => {
      if (n.startStep >= 0 && n.startStep < 16) steps[n.startStep] = true;
    });

    const newSynthTrack: Track = {
      id: `synth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: '4-OSC Synth',
      sound: SYNTH_SOUND_ID,
      instrumentType: 'synth',
      synthPatch: createDefaultSynthPatch(),
      pianoRollNotes: defaultNotes,
      pianoRollSteps: 16,
      pianoBaseOctave: 4,
      steps,
      volume: 0.9,
      muted: false,
      solo: false,
      accentColor: 'purple',
      effects: createDefaultTrackEffects(),
      triggerPulse: false,
    };

    this.tracks.update((list) => [...list, newSynthTrack]);
    this.syncTracksToActiveRow();
    this.audioService.playSynthNote(
      60,
      0.3,
      0.85,
      newSynthTrack.synthPatch,
      newSynthTrack.effects
    );
  }

  deleteRow(rowIndex: number, event?: Event): void {
    event?.stopPropagation();
    if (this.tracks().length <= 1) return;
    this.tracks.update((list) => list.filter((_, idx) => idx !== rowIndex));
    this.syncTracksToActiveRow();
  }

  toggleMute(rowIndex: number): void {
    this.tracks.update((list) =>
      list.map((track, idx) =>
        idx === rowIndex ? { ...track, muted: !track.muted } : track
      )
    );
    this.syncTracksToActiveRow();
  }

  toggleSolo(rowIndex: number): void {
    this.tracks.update((list) =>
      list.map((track, idx) =>
        idx === rowIndex ? { ...track, solo: !track.solo } : track
      )
    );
    this.syncTracksToActiveRow();
  }

  onTrackVolumeChange(rowIndex: number, volume: number): void {
    this.tracks.update((list) =>
      list.map((track, idx) =>
        idx === rowIndex ? { ...track, volume: Number(volume) } : track
      )
    );
    this.syncTracksToActiveRow();
  }

  // ==================== INLINE PIANO ROLL & 4-OSC SYNTH OPERATIONS ====================

  /**
   * Returns the 12 chromatic MIDI notes (B down to C) for the track's selected inline octave.
   */
  getInlineOctaveMidiRows(track: Track): number[] {
    const baseOct = track.pianoBaseOctave ?? 4;
    const cMidi = (baseOct + 1) * 12; // e.g., octave 4 -> C4 = 60 .. B4 = 71
    return Array.from({ length: 12 }, (_, i) => cMidi + 11 - i);
  }

  isBlackKey(midi: number): boolean {
    return isBlackKeyMidi(midi);
  }

  getNoteName(midi: number): string {
    return midiToNoteName(midi);
  }

  getInlineNotesForMidi(track: Track, midi: number): PianoRollNote[] {
    return (track.pianoRollNotes || []).filter((n) => n.midi === midi);
  }

  isNotePlayingAtCurrentStep(track: Track, note: PianoRollNote): boolean {
    if (!this.isPlaying() || this.currentStep() < 0) return false;
    const trackSteps = this.getTrackPianoRollSteps(track);
    const step = this.currentStep() % trackSteps;
    return step >= note.startStep && step < note.startStep + note.durationSteps;
  }

  /**
   * Computes vertical top % for a note inside the channel row's compact Melody Preview (Mini Piano Roll).
   */
  getMiniPreviewNoteTopPercent(track: Track, note: PianoRollNote): number {
    const notes = track.pianoRollNotes || [];
    if (notes.length === 0) return 40;
    let minMidi = notes[0].midi;
    let maxMidi = notes[0].midi;
    for (const n of notes) {
      if (n.midi < minMidi) minMidi = n.midi;
      if (n.midi > maxMidi) maxMidi = n.midi;
    }
    const span = Math.max(12, maxMidi - minMidi + 4);
    const center = (minMidi + maxMidi) / 2;
    const high = center + span / 2;
    const normalized = (high - note.midi) / span;
    return Math.max(8, Math.min(76, Math.round(normalized * 68 + 8)));
  }

  auditionTrackNote(rowIndex: number, midi: number, event?: Event): void {
    event?.stopPropagation();
    const track = this.tracks()[rowIndex];
    if (!track) return;
    this.audioService.playSynthNote(
      midi,
      0.28,
      track.volume,
      track.synthPatch,
      track.effects
    );
  }

  changeTrackPianoOctave(rowIndex: number, delta: number, event?: Event): void {
    event?.stopPropagation();
    this.tracks.update((list) =>
      list.map((track, idx) => {
        if (idx !== rowIndex) return track;
        const currentOct = track.pianoBaseOctave ?? 4;
        const nextOct = Math.max(2, Math.min(6, currentOct + delta));
        return { ...track, pianoBaseOctave: nextOct };
      })
    );
    this.syncTracksToActiveRow();
  }

  onInlinePianoRollCellClick(
    rowIndex: number,
    midi: number,
    stepIndex: number
  ): void {
    const track = this.tracks()[rowIndex];
    if (!track) return;

    const currentNotes = [...(track.pianoRollNotes || [])];
    const existingIdx = currentNotes.findIndex(
      (n) =>
        n.midi === midi &&
        stepIndex >= n.startStep &&
        stepIndex < n.startStep + n.durationSteps
    );

    let addedNote = false;
    if (existingIdx >= 0) {
      currentNotes.splice(existingIdx, 1);
    } else {
      const dur = Math.min(this.inlineNoteDuration(), 16 - stepIndex);
      currentNotes.push({
        id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        midi,
        startStep: stepIndex,
        durationSteps: Math.max(1, dur),
        velocity: 0.92,
      });
      addedNote = true;
    }

    this.updateTrackPianoRollNotes(rowIndex, currentNotes);

    if (addedNote && !this.isPlaying()) {
      this.audioService.playSynthNote(
        midi,
        0.28,
        track.volume,
        track.synthPatch,
        track.effects
      );
    }
  }

  removeInlineNote(rowIndex: number, noteId: string, event: Event): void {
    event.stopPropagation();
    const track = this.tracks()[rowIndex];
    if (!track) return;
    const updated = (track.pianoRollNotes || []).filter((n) => n.id !== noteId);
    this.updateTrackPianoRollNotes(rowIndex, updated);
  }

  adjustInlineNoteDuration(
    rowIndex: number,
    noteId: string,
    delta: number,
    event: Event
  ): void {
    event.stopPropagation();
    const track = this.tracks()[rowIndex];
    if (!track) return;
    const updated = (track.pianoRollNotes || []).map((n) => {
      if (n.id !== noteId) return n;
      const nextDur = Math.max(
        1,
        Math.min(16 - n.startStep, n.durationSteps + delta)
      );
      return { ...n, durationSteps: nextDur };
    });
    this.updateTrackPianoRollNotes(rowIndex, updated);
  }

  private updateTrackPianoRollNotes(
    rowIndex: number,
    notes: PianoRollNote[]
  ): void {
    const steps = Array(16).fill(false);
    let maxEndStep = 0;
    notes.forEach((n) => {
      if (n.startStep >= 0 && n.startStep < 16) steps[n.startStep] = true;
      const end = n.startStep + n.durationSteps;
      if (end > maxEndStep) maxEndStep = end;
    });

    this.tracks.update((list) =>
      list.map((track, idx) => {
        if (idx !== rowIndex) return track;
        const currentSteps = track.pianoRollSteps || 16;
        const nextSteps =
          maxEndStep > currentSteps
            ? Math.ceil(maxEndStep / 4) * 4
            : currentSteps;
        return {
          ...track,
          pianoRollNotes: notes,
          pianoRollSteps: nextSteps,
          steps,
        };
      })
    );
    this.syncTracksToActiveRow();
  }

  onTrackPianoRollStepsChange(newSteps: number): void {
    const rowIndex = this.synthModalTrackIndex();
    if (rowIndex === null) return;
    const clampedSteps = Math.max(4, Math.ceil(newSteps / 4) * 4);

    this.tracks.update((list) =>
      list.map((track, idx) => {
        if (idx !== rowIndex) return track;
        // Filter/trim notes if the user intentionally shortened the Piano Roll
        const trimmedNotes = (track.pianoRollNotes || [])
          .filter((n) => n.startStep < clampedSteps)
          .map((n) =>
            n.startStep + n.durationSteps > clampedSteps
              ? { ...n, durationSteps: Math.max(1, clampedSteps - n.startStep) }
              : n
          );
        return {
          ...track,
          pianoRollSteps: clampedSteps,
          pianoRollNotes: trimmedNotes,
        };
      })
    );
    this.syncTracksToActiveRow(true);
  }

  openSynthModal(
    rowIndex: number,
    tab: 'osc' | 'pianoroll' = 'osc',
    event?: Event
  ): void {
    event?.stopPropagation();
    this.synthModalTrackIndex.set(rowIndex);
    this.synthModalInitialTab.set(tab);
    this.isSynthModalOpen.set(true);
  }

  closeSynthModal(): void {
    this.isSynthModalOpen.set(false);
  }

  onTrackSynthPatchChange(updatedPatch: SynthPatch): void {
    const rowIndex = this.synthModalTrackIndex();
    if (rowIndex === null) return;

    this.tracks.update((list) =>
      list.map((track, idx) =>
        idx === rowIndex
          ? { ...track, synthPatch: cloneSynthPatch(updatedPatch) }
          : track
      )
    );
    this.syncTracksToActiveRow();
  }

  onTrackPianoRollNotesChange(updatedNotes: PianoRollNote[]): void {
    const rowIndex = this.synthModalTrackIndex();
    if (rowIndex === null) return;
    this.updateTrackPianoRollNotes(rowIndex, updatedNotes);
  }

  // ==================== CHANNEL FX MODAL OPERATIONS ====================

  openFxModal(rowIndex: number, event?: Event): void {
    event?.stopPropagation();
    this.fxModalTrackIndex.set(rowIndex);
    this.isFxModalOpen.set(true);
  }

  closeFxModal(): void {
    this.isFxModalOpen.set(false);
  }

  onTrackEffectsChange(updatedEffects: TrackEffects): void {
    const rowIndex = this.fxModalTrackIndex();
    if (rowIndex === null) return;

    this.tracks.update((list) =>
      list.map((track, idx) =>
        idx === rowIndex
          ? { ...track, effects: { ...updatedEffects } }
          : track
      )
    );
    this.syncTracksToActiveRow();
  }

  previewActiveFxTrack(): void {
    const track = this.activeFxTrack();
    if (!track) return;
    if (this.isSynthTrack(track)) {
      this.audioService.playSynthNote(
        60,
        0.35,
        track.volume,
        track.synthPatch,
        track.effects
      );
    } else {
      this.audioService.playSound(track.sound, track.volume, track.effects);
    }
  }

  hasActiveEffects(track: Track): boolean {
    const fx = track.effects;
    if (!fx) return false;
    return !!(
      fx.lowCutEnabled ||
      fx.highCutEnabled ||
      fx.chorusEnabled ||
      fx.delayEnabled ||
      fx.reverbEnabled
    );
  }

  getActiveEffectsCount(track: Track): number {
    const fx = track.effects;
    if (!fx) return 0;
    let count = 0;
    if (fx.lowCutEnabled) count++;
    if (fx.highCutEnabled) count++;
    if (fx.chorusEnabled) count++;
    if (fx.delayEnabled) count++;
    if (fx.reverbEnabled) count++;
    return count;
  }

  clearTrackSteps(rowIndex: number): void {
    this.tracks.update((list) =>
      list.map((track, idx) =>
        idx === rowIndex
          ? {
              ...track,
              steps: Array(16).fill(false),
              pianoRollNotes: this.isSynthTrack(track) ? [] : track.pianoRollNotes,
            }
          : track
      )
    );
    this.syncTracksToActiveRow();
  }

  clearAllPatterns(): void {
    this.tracks.update((list) =>
      list.map((track) => ({
        ...track,
        steps: Array(16).fill(false),
        pianoRollNotes: this.isSynthTrack(track) ? [] : track.pianoRollNotes,
      }))
    );
    this.syncTracksToActiveRow();
    this.activePresetName.set('Empty Pattern');
  }

  randomizePattern(): void {
    this.tracks.update((list) =>
      list.map((track, idx) => {
        if (this.isSynthTrack(track)) {
          const scaleOffsets = [0, 3, 5, 7, 10, 12]; // Minor pentatonic
          const baseMidi = ((track.pianoBaseOctave ?? 4) + 1) * 12;
          const totalSteps = this.getTrackPianoRollSteps(track);
          const randomNotes: PianoRollNote[] = [];
          const steps = Array(16).fill(false);

          for (let step = 0; step < totalSteps; step += 2) {
            if (Math.random() < 0.72) {
              const offset =
                scaleOffsets[Math.floor(Math.random() * scaleOffsets.length)];
              randomNotes.push({
                id: `rnd-${Date.now()}-${step}`,
                midi: baseMidi + offset,
                startStep: step,
                durationSteps: 2,
                velocity: 0.9,
              });
              if (step < 16) steps[step] = true;
            }
          }
          return { ...track, pianoRollNotes: randomNotes, steps };
        }

        const density = idx === 0 ? 0.28 : idx === 1 ? 0.2 : 0.35;
        const steps = Array.from({ length: 16 }, (_, stepIdx) => {
          if (idx === 0 && stepIdx === 0) return true;
          if (idx === 1 && (stepIdx === 4 || stepIdx === 12)) return true;
          return Math.random() < density;
        });
        return { ...track, steps };
      })
    );
    this.syncTracksToActiveRow();
    this.activePresetName.set('Random Groove');
  }

  loadPreset(preset: PresetPattern): void {
    this.bpm.set(preset.bpm);
    this.activePresetName.set(preset.name);

    const newTracks = this.buildTracksFromPreset(preset, `preset-${Date.now()}`);
    this.tracks.set(newTracks);
    this.syncTracksToActiveRow();
    newTracks.forEach((t) => this.audioService.preloadSound(t.sound));
  }

  onBpmChange(value: number): void {
    const numeric = Number(value);
    if (Number.isNaN(numeric)) return;
    const clamped = Math.max(40, Math.min(300, Math.round(numeric)));
    this.bpm.set(clamped);
  }

  adjustBpm(delta: number): void {
    this.onBpmChange(this.bpm() + delta);
  }

  openSoundSelector(rowIndex: number): void {
    this.selectedRowIndex.set(rowIndex);
    this.isSoundSelectorOpen.set(true);
  }

  closeSoundSelector(): void {
    this.isSoundSelectorOpen.set(false);
  }

  selectSound(sound: string): void {
    const rowIndex = this.selectedRowIndex();
    if (rowIndex === null) return;

    const isSynth = sound === SYNTH_SOUND_ID;

    this.tracks.update((list) =>
      list.map((track, idx) => {
        if (idx !== rowIndex) return track;

        if (isSynth) {
          const notes =
            track.pianoRollNotes && track.pianoRollNotes.length > 0
              ? track.pianoRollNotes
              : createDefaultPianoRollNotes();
          const steps = Array(16).fill(false);
          notes.forEach((n) => {
            if (n.startStep >= 0 && n.startStep < 16) steps[n.startStep] = true;
          });
          return {
            ...track,
            sound: SYNTH_SOUND_ID,
            instrumentType: 'synth',
            name: '4-OSC Synth',
            synthPatch: track.synthPatch
              ? cloneSynthPatch(track.synthPatch)
              : createDefaultSynthPatch(),
            pianoRollNotes: notes,
            pianoRollSteps: track.pianoRollSteps || 16,
            pianoBaseOctave: track.pianoBaseOctave ?? 4,
            steps,
          };
        }

        return {
          ...track,
          sound,
          instrumentType: 'sampler',
          name: this.formatSoundLabel(sound),
        };
      })
    );

    this.syncTracksToActiveRow();
    const updatedTrack = this.tracks()[rowIndex];

    if (isSynth) {
      this.audioService.playSynthNote(
        60,
        0.3,
        0.85,
        updatedTrack?.synthPatch,
        updatedTrack?.effects
      );
    } else {
      this.audioService.preloadSound(sound);
      this.audioService.playSound(sound, 0.9, updatedTrack?.effects);
    }
    this.isSoundSelectorOpen.set(false);
  }

  formatSoundLabel(sound: string): string {
    if (sound === SYNTH_SOUND_ID) return '4-OSC Pro Synth';
    return sound ? sound.replace(/\.wav$/i, '') : 'Select Sound';
  }

  isBeatGroupAlt(stepIndex: number): boolean {
    const modStep = stepIndex % 16;
    return (modStep >= 4 && modStep <= 7) || modStep >= 12;
  }
}