import {
  Component,
  ElementRef,
  HostListener,
  OnChanges,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  OscWaveform,
  PianoRollNote,
  SynthOscillatorConfig,
  SynthPatch,
  Track,
  cloneSynthPatch,
  createDefaultSynthPatch,
  isBlackKeyMidi,
  midiToNoteName,
} from '../../models/beat.model';
import { AudioService } from '../../services/audio.service';

@Component({
  selector: 'app-synth-editor-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="onCloseModal()">
      <div
        class="modal-panel synth-studio-modal"
        (click)="closeDropdowns(); $event.stopPropagation()"
      >
        <!-- Modal Header -->
        <div class="modal-header synth-modal-header">
          <div class="modal-title-group">
            <span class="modal-badge synth-badge-glow">
              <i class="fa-solid fa-wave-square"></i> HLL 4-OSC SYNTHESIZER & PIANO ROLL
            </span>
            <h3>
              <span>{{ track().name }}</span> • {{ patch.presetName }}
            </h3>
          </div>

          <!-- View Mode Switcher Tabs -->
          <div class="synth-modal-tabs">
            <button
              type="button"
              class="synth-tab-btn"
              [class.active]="activeTab() === 'osc'"
              (click)="activeTab.set('osc')"
            >
              <i class="fa-solid fa-sliders"></i> 4-OSC Synth Rack
            </button>
            <button
              type="button"
              class="synth-tab-btn"
              [class.active]="activeTab() === 'pianoroll'"
              (click)="activeTab.set('pianoroll')"
            >
              <i class="fa-solid fa-table-cells"></i> Wide Piano Roll ({{ (track().pianoRollNotes || []).length }} Notes)
            </button>
          </div>

          <div class="fx-header-actions">
            <button type="button" class="icon-close-btn" (click)="onCloseModal()" title="Close">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Factory Synth Presets Bar (Only shown in 4-OSC Synth Rack tab) -->
        @if (activeTab() === 'osc') {
          <div class="fx-presets-bar synth-presets-bar">
            <span class="fx-presets-label">
              <i class="fa-solid fa-bolt"></i> 4-OSC FACTORY PRESETS:
            </span>
            <button type="button" class="fx-preset-chip" (click)="applyFactoryPreset('supersaw')">
              <i class="fa-solid fa-wave-square"></i> Cyber Supersaw Lead
            </button>
            <button type="button" class="fx-preset-chip" (click)="applyFactoryPreset('sub808')">
              <i class="fa-solid fa-drum-steelpan"></i> Deep 808 Sub Bass
            </button>
            <button type="button" class="fx-preset-chip" (click)="applyFactoryPreset('analogpad')">
              <i class="fa-solid fa-cloud"></i> Warm Analog Pad
            </button>
            <button type="button" class="fx-preset-chip" (click)="applyFactoryPreset('pluck')">
              <i class="fa-solid fa-wand-sparkles"></i> Pluck Arpeggio
            </button>
            <button type="button" class="fx-preset-chip" (click)="applyFactoryPreset('reese')">
              <i class="fa-solid fa-fire"></i> Dark Reese Bass
            </button>
            <button type="button" class="fx-preset-chip" (click)="applyFactoryPreset('brass')">
              <i class="fa-solid fa-bullhorn"></i> Neon Synth Brass
            </button>
          </div>
        }

        <!-- ==================== TAB 1: 4-OSC SYNTHESIZER RACK ==================== -->
        @if (activeTab() === 'osc') {
          <div class="synth-rack-body">
            <!-- 4 Independent Oscillators Grid -->
            <div class="osc-cards-grid">
              @for (osc of patch.oscillators; track osc.id; let oscIdx = $index) {
                <div
                  class="osc-unit-card"
                  [class.osc-enabled]="osc.enabled"
                  [attr.data-osc]="osc.id"
                >
                  <div class="osc-card-header">
                    <div class="osc-title-wrap">
                      <span class="osc-num-badge">OSC {{ osc.id }}</span>
                      <span class="osc-wave-label">{{ osc.waveform | uppercase }}</span>
                    </div>
                    <button
                      type="button"
                      class="fx-power-btn"
                      [class.on]="osc.enabled"
                      (click)="toggleOsc(oscIdx)"
                    >
                      <i class="fa-solid fa-power-off"></i>
                      {{ osc.enabled ? 'ON' : 'OFF' }}
                    </button>
                  </div>

                  <!-- Waveform Selector -->
                  <div class="osc-waveforms-row">
                    @for (wf of waveforms; track wf.value) {
                      <button
                        type="button"
                        class="wave-select-btn"
                        [class.active]="osc.waveform === wf.value"
                        [disabled]="!osc.enabled"
                        (click)="setOscWaveform(oscIdx, wf.value)"
                      >
                        {{ wf.label }}
                      </button>
                    }
                  </div>

                  <!-- Oscillator Controls -->
                  <div class="osc-sliders-stack">
                    <!-- Octave -->
                    <div class="fx-param-row">
                      <div class="fx-param-label-row">
                        <span>Octave</span>
                        <span class="fx-param-val">{{ osc.octave > 0 ? '+' + osc.octave : osc.octave }} Oct</span>
                      </div>
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="1"
                        [disabled]="!osc.enabled"
                        [ngModel]="osc.octave"
                        (ngModelChange)="updateOscParam(oscIdx, 'octave', $event)"
                        class="fx-slider"
                      />
                    </div>

                    <!-- Semitone -->
                    <div class="fx-param-row">
                      <div class="fx-param-label-row">
                        <span>Semitone (Coarse)</span>
                        <span class="fx-param-val">{{ osc.semitone > 0 ? '+' + osc.semitone : osc.semitone }} st</span>
                      </div>
                      <input
                        type="range"
                        min="-12"
                        max="12"
                        step="1"
                        [disabled]="!osc.enabled"
                        [ngModel]="osc.semitone"
                        (ngModelChange)="updateOscParam(oscIdx, 'semitone', $event)"
                        class="fx-slider"
                      />
                    </div>

                    <!-- Fine Detune -->
                    <div class="fx-param-row">
                      <div class="fx-param-label-row">
                        <span>Detune (Unison)</span>
                        <span class="fx-param-val">{{ osc.detune > 0 ? '+' + osc.detune : osc.detune }} ct</span>
                      </div>
                      <input
                        type="range"
                        min="-100"
                        max="100"
                        step="1"
                        [disabled]="!osc.enabled"
                        [ngModel]="osc.detune"
                        (ngModelChange)="updateOscParam(oscIdx, 'detune', $event)"
                        class="fx-slider"
                      />
                    </div>

                    <!-- Stereo Pan -->
                    <div class="fx-param-row">
                      <div class="fx-param-label-row">
                        <span>Stereo Pan</span>
                        <span class="fx-param-val">{{ formatPan(osc.pan) }}</span>
                      </div>
                      <input
                        type="range"
                        min="-1"
                        max="1"
                        step="0.05"
                        [disabled]="!osc.enabled"
                        [ngModel]="osc.pan"
                        (ngModelChange)="updateOscParam(oscIdx, 'pan', $event)"
                        class="fx-slider"
                      />
                    </div>

                    <!-- Oscillator Level -->
                    <div class="fx-param-row">
                      <div class="fx-param-label-row">
                        <span>Level</span>
                        <span class="fx-param-val">{{ (osc.level * 100) | number:'1.0-0' }}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.02"
                        [disabled]="!osc.enabled"
                        [ngModel]="osc.level"
                        (ngModelChange)="updateOscParam(oscIdx, 'level', $event)"
                        class="fx-slider"
                      />
                    </div>
                  </div>
                </div>
              }
            </div>

            <!-- Lower Section: VCF Filter + VCA ADSR Envelope -->
            <div class="synth-global-modules">
              <!-- VCF Filter Module -->
              <div class="synth-module-card">
                <div class="synth-module-header">
                  <span class="module-title">
                    <i class="fa-solid fa-filter"></i> VCF RESONANT FILTER
                  </span>
                  <div class="filter-type-pills">
                    <button
                      type="button"
                      class="wave-select-btn"
                      [class.active]="patch.filterType === 'lowpass'"
                      (click)="setFilterType('lowpass')"
                    >
                      LP (Low-Pass)
                    </button>
                    <button
                      type="button"
                      class="wave-select-btn"
                      [class.active]="patch.filterType === 'bandpass'"
                      (click)="setFilterType('bandpass')"
                    >
                      BP (Band-Pass)
                    </button>
                    <button
                      type="button"
                      class="wave-select-btn"
                      [class.active]="patch.filterType === 'highpass'"
                      (click)="setFilterType('highpass')"
                    >
                      HP (High-Pass)
                    </button>
                  </div>
                </div>

                <div class="synth-module-grid-3">
                  <div class="fx-param-row">
                    <div class="fx-param-label-row">
                      <span>Cutoff Frequency</span>
                      <span class="fx-param-val">{{ patch.filterCutoff }} Hz</span>
                    </div>
                    <input
                      type="range"
                      min="40"
                      max="18000"
                      step="20"
                      [ngModel]="patch.filterCutoff"
                      (ngModelChange)="patch.filterCutoff = +$event; emitPatch()"
                      class="fx-slider"
                    />
                  </div>

                  <div class="fx-param-row">
                    <div class="fx-param-label-row">
                      <span>Resonance (Q)</span>
                      <span class="fx-param-val">{{ patch.filterResonance | number:'1.1-1' }}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="18"
                      step="0.2"
                      [ngModel]="patch.filterResonance"
                      (ngModelChange)="patch.filterResonance = +$event; emitPatch()"
                      class="fx-slider"
                    />
                  </div>

                  <div class="fx-param-row">
                    <div class="fx-param-label-row">
                      <span>Env Modulation</span>
                      <span class="fx-param-val">{{ patch.filterEnvAmount > 0 ? '+' + patch.filterEnvAmount : patch.filterEnvAmount }} Hz</span>
                    </div>
                    <input
                      type="range"
                      min="-5000"
                      max="6000"
                      step="100"
                      [ngModel]="patch.filterEnvAmount"
                      (ngModelChange)="patch.filterEnvAmount = +$event; emitPatch()"
                      class="fx-slider"
                    />
                  </div>
                </div>
              </div>

              <!-- ADSR Envelope Module -->
              <div class="synth-module-card">
                <div class="synth-module-header">
                  <span class="module-title">
                    <i class="fa-solid fa-chart-line"></i> VCA ADSR ENVELOPE & OUTPUT
                  </span>
                  <span class="module-sub">Attack • Decay • Sustain • Release</span>
                </div>

                <div class="synth-module-grid-5">
                  <div class="fx-param-row">
                    <div class="fx-param-label-row">
                      <span>Attack</span>
                      <span class="fx-param-val">{{ (patch.attack * 1000) | number:'1.0-0' }} ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.003"
                      max="1.2"
                      step="0.005"
                      [ngModel]="patch.attack"
                      (ngModelChange)="patch.attack = +$event; emitPatch()"
                      class="fx-slider"
                    />
                  </div>

                  <div class="fx-param-row">
                    <div class="fx-param-label-row">
                      <span>Decay</span>
                      <span class="fx-param-val">{{ (patch.decay * 1000) | number:'1.0-0' }} ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.02"
                      max="1.8"
                      step="0.01"
                      [ngModel]="patch.decay"
                      (ngModelChange)="patch.decay = +$event; emitPatch()"
                      class="fx-slider"
                    />
                  </div>

                  <div class="fx-param-row">
                    <div class="fx-param-label-row">
                      <span>Sustain</span>
                      <span class="fx-param-val">{{ (patch.sustain * 100) | number:'1.0-0' }}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.02"
                      [ngModel]="patch.sustain"
                      (ngModelChange)="patch.sustain = +$event; emitPatch()"
                      class="fx-slider"
                    />
                  </div>

                  <div class="fx-param-row">
                    <div class="fx-param-label-row">
                      <span>Release</span>
                      <span class="fx-param-val">{{ (patch.release * 1000) | number:'1.0-0' }} ms</span>
                    </div>
                    <input
                      type="range"
                      min="0.02"
                      max="2.5"
                      step="0.02"
                      [ngModel]="patch.release"
                      (ngModelChange)="patch.release = +$event; emitPatch()"
                      class="fx-slider"
                    />
                  </div>

                  <div class="fx-param-row">
                    <div class="fx-param-label-row">
                      <span>Synth Gain</span>
                      <span class="fx-param-val">{{ (patch.masterGain * 100) | number:'1.0-0' }}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="1.2"
                      step="0.05"
                      [ngModel]="patch.masterGain"
                      (ngModelChange)="patch.masterGain = +$event; emitPatch()"
                      class="fx-slider"
                    />
                  </div>
                </div>
              </div>
            </div>

            <!-- Live Audition Piano Strip -->
            <div class="synth-audition-keyboard">
              <span class="audition-label">
                <i class="fa-solid fa-keyboard"></i> LIVE AUDITION KEYBOARD:
              </span>
              <div class="audition-keys-row">
                @for (midi of auditionMidiKeys; track midi) {
                  <button
                    type="button"
                    class="audition-key-btn"
                    [class.black-key]="isBlackKey(midi)"
                    (mousedown)="auditionNote(midi)"
                  >
                    {{ getNoteName(midi) }}
                  </button>
                }
              </div>
            </div>
          </div>
        }

        <!-- ==================== TAB 2: FULL MULTI-OCTAVE PIANO ROLL (C1 - C7) ==================== -->
        @if (activeTab() === 'pianoroll') {
          <div class="full-pianoroll-body">
            <!-- Piano Roll Toolbar with Solo Play/Stop & Theme-Styled Dropdowns -->
            <div class="pianoroll-toolbar">
              <!-- 1. Solo Piano Roll Play / Stop Transport -->
              <div class="pr-tool-group pr-transport-group">
                <button
                  type="button"
                  class="pr-solo-play-btn"
                  [class.playing]="isPianoRollPlaying()"
                  (click)="togglePianoRollPlayback($event)"
                  title="Play / Stop only this Piano Roll melody (Shortcut: Space)"
                >
                  @if (isPianoRollPlaying()) {
                    <i class="fa-solid fa-stop"></i>
                    <span>Stop ({{ pianoRollStep() + 1 }}/{{ totalSteps() }})</span>
                  } @else {
                    <i class="fa-solid fa-play"></i>
                    <span>Play Melody</span>
                  }
                </button>
              </div>

              <!-- 2. Melody Length Custom Theme Dropdown -->
              <div class="pr-tool-group" (click)="$event.stopPropagation()">
                <span class="pr-tool-label">MELODY LENGTH:</span>
                <div class="pr-custom-dropdown">
                  <button
                    type="button"
                    class="pr-dropdown-trigger"
                    [class.open]="openDropdown() === 'length'"
                    (click)="toggleDropdown('length', $event)"
                  >
                    <i class="fa-solid fa-ruler-horizontal pr-dd-icon"></i>
                    <span>{{ totalSteps() }} Steps ({{ totalBeats() }} Beats)</span>
                    <i class="fa-solid fa-chevron-down pr-dd-caret"></i>
                  </button>

                  @if (openDropdown() === 'length') {
                    <div class="pr-dropdown-menu">
                      <div class="pr-dropdown-section-title">SELECT LENGTH (PLAYLIST SYNCED)</div>
                      @for (opt of lengthOptions; track opt.steps) {
                        <button
                          type="button"
                          class="pr-dropdown-item"
                          [class.selected]="totalSteps() === opt.steps"
                          (click)="selectPianoRollLength(opt.steps, $event)"
                        >
                          <span>{{ opt.label }}</span>
                          <span class="pr-dd-badge">{{ opt.sub }}</span>
                        </button>
                      }
                      <div class="pr-dropdown-divider"></div>
                      <div class="pr-dropdown-quick-stepper">
                        <button
                          type="button"
                          class="pr-dd-step-btn"
                          [disabled]="totalSteps() <= 4"
                          (click)="changePianoRollSteps(-4, $event)"
                        >
                          -4 Steps (-1 Beat)
                        </button>
                        <button
                          type="button"
                          class="pr-dd-step-btn"
                          (click)="changePianoRollSteps(4, $event)"
                        >
                          +4 Steps (+1 Beat)
                        </button>
                      </div>
                    </div>
                  }
                </div>
              </div>

              <!-- 3. Note Brush Custom Theme Dropdown (includes 1/4, 2/4, 3/4) -->
              <div class="pr-tool-group" (click)="$event.stopPropagation()">
                <span class="pr-tool-label">NOTE BRUSH:</span>
                <div class="pr-custom-dropdown">
                  <button
                    type="button"
                    class="pr-dropdown-trigger"
                    [class.open]="openDropdown() === 'brush'"
                    (click)="toggleDropdown('brush', $event)"
                  >
                    <i class="fa-solid fa-paintbrush pr-dd-icon"></i>
                    <span>{{ activeBrushOption().label }}</span>
                    <i class="fa-solid fa-chevron-down pr-dd-caret"></i>
                  </button>

                  @if (openDropdown() === 'brush') {
                    <div class="pr-dropdown-menu pr-brush-dropdown-menu">
                      <div class="pr-dropdown-section-title">NOTE DURATION / FRACTION</div>
                      @for (bOpt of brushOptions; track bOpt.steps) {
                        <button
                          type="button"
                          class="pr-dropdown-item"
                          [class.selected]="brushDurationSteps() === bOpt.steps"
                          (click)="selectBrushDuration(bOpt.steps, $event)"
                        >
                          <span>{{ bOpt.label }}</span>
                          <span class="pr-dd-badge">{{ bOpt.sub }}</span>
                        </button>
                      }
                    </div>
                  }
                </div>
              </div>

              <!-- 4. Melody Preset Custom Theme Dropdown -->
              <div class="pr-tool-group" (click)="$event.stopPropagation()">
                <span class="pr-tool-label">MELODY PRESET:</span>
                <div class="pr-custom-dropdown">
                  <button
                    type="button"
                    class="pr-dropdown-trigger"
                    [class.open]="openDropdown() === 'melody'"
                    (click)="toggleDropdown('melody', $event)"
                  >
                    <i class="fa-solid fa-wand-magic-sparkles pr-dd-icon"></i>
                    <span>{{ selectedMelodyLabel() }}</span>
                    <i class="fa-solid fa-chevron-down pr-dd-caret"></i>
                  </button>

                  @if (openDropdown() === 'melody') {
                    <div class="pr-dropdown-menu">
                      <div class="pr-dropdown-section-title">GENERATE MELODY</div>
                      <button
                        type="button"
                        class="pr-dropdown-item"
                        (click)="selectGeneratedMelody('arp', 'Minor Arpeggio', $event)"
                      >
                        <span><i class="fa-solid fa-wand-magic-sparkles"></i> Minor Arpeggio</span>
                        <span class="pr-dd-badge">Arp</span>
                      </button>
                      <button
                        type="button"
                        class="pr-dropdown-item"
                        (click)="selectGeneratedMelody('bass', 'Cyber Bassline', $event)"
                      >
                        <span><i class="fa-solid fa-wave-square"></i> Cyber Bassline</span>
                        <span class="pr-dd-badge">Bass</span>
                      </button>
                      <button
                        type="button"
                        class="pr-dropdown-item"
                        (click)="selectGeneratedMelody('chords', 'Synth Chords', $event)"
                      >
                        <span><i class="fa-solid fa-layer-group"></i> Synth Chords</span>
                        <span class="pr-dd-badge">Chord</span>
                      </button>
                      <div class="pr-dropdown-divider"></div>
                      <button
                        type="button"
                        class="pr-dropdown-item danger-item"
                        (click)="onClearMelodyFromMenu($event)"
                      >
                        <span><i class="fa-solid fa-trash-can"></i> Clear Melody</span>
                        <span class="pr-dd-badge">Reset</span>
                      </button>
                    </div>
                  }
                </div>
              </div>

              <!-- 5. Quick Octave Jump Pills (C1 – C7) -->
              <div class="pr-tool-group">
                <span class="pr-tool-label">OCTAVE:</span>
                @for (oct of [7, 6, 5, 4, 3, 2, 1]; track oct) {
                  <button
                    type="button"
                    class="pr-action-chip"
                    (click)="scrollToOctave(oct)"
                    title="Scroll to Octave C{{ oct }}"
                  >
                    C{{ oct }}
                  </button>
                }
              </div>
            </div>

            <!-- Unified Horizontally + Vertically Scrollable Piano Roll Viewport -->
            <div class="pr-editor-viewport" #pianoRollScroll>
              <div class="pr-matrix-canvas" [style.min-width.px]="74 + totalSteps() * 42">
                <!-- Sticky Step Numbers Header (Click any step to play from that step) -->
                <div class="pr-header-row">
                  <div class="pr-key-col-header">SEEK / PLAY</div>
                  <div
                    class="pr-steps-header-grid"
                    [style.grid-template-columns]="'repeat(' + totalSteps() + ', minmax(42px, 1fr))'"
                  >
                    @for (s of stepIndices(); track s) {
                      <div
                        class="pr-step-head-cell clickable-pr-step"
                        [class.bar-start]="s % 16 === 0"
                        [class.beat-start]="s % 4 === 0"
                        [class.playing-step]="displayStep() === s"
                        (click)="startPianoRollFromStep(s, $event)"
                        title="Play only this Piano Roll melody starting from Step {{ s + 1 }}"
                      >
                        @if (s % 4 === 0) {
                          <span class="pr-head-beat-tag">B{{ s / 4 + 1 }}</span>
                        }
                        <span>{{ s + 1 }}</span>
                      </div>
                    }
                  </div>
                </div>

                <!-- 73-Note Scrollable Piano Roll Matrix (C7 = 96 down to C1 = 24) -->
                <div class="pr-rows-list">
                  @for (midi of fullPianoRollMidiRows; track midi) {
                    <div
                      class="pr-pitch-row"
                      [attr.data-midi]="midi"
                      [class.black-pitch-row]="isBlackKey(midi)"
                      [class.octave-root-row]="midi % 12 === 0"
                    >
                      <!-- Sticky Left Piano Key -->
                      <button
                        type="button"
                        class="pr-piano-key"
                        [class.black-key]="isBlackKey(midi)"
                        [class.c-root-key]="midi % 12 === 0"
                        (mousedown)="auditionNote(midi)"
                        title="Audition Note: {{ getNoteName(midi) }}"
                      >
                        <span>{{ getNoteName(midi) }}</span>
                      </button>

                      <!-- Dynamic Step Cells + Note Bars -->
                      <div
                        class="pr-row-cells"
                        [style.grid-template-columns]="'repeat(' + totalSteps() + ', minmax(42px, 1fr))'"
                      >
                        @for (step of stepIndices(); track step) {
                          <div
                            class="pr-cell"
                            [class.bar-line]="step % 16 === 0"
                            [class.beat-line]="step % 4 === 0"
                            [class.playhead-col]="displayStep() === step"
                            (click)="onPianoCellClick(midi, step)"
                          ></div>
                        }

                        <!-- Active Note Blocks on this pitch row -->
                        @for (note of getNotesForMidi(midi); track note.id) {
                          <div
                            class="pr-note-block"
                            [style.left.%]="(note.startStep / totalSteps()) * 100"
                            [style.width.%]="(note.durationSteps / totalSteps()) * 100"
                            (click)="removeNote(note.id, $event)"
                            title="{{ getNoteName(note.midi) }} • Step {{ note.startStep + 1 }} ({{ note.durationSteps }} steps) - Click to delete"
                          >
                            <span class="pr-note-label">{{ getNoteName(note.midi) }}</span>
                            <div class="pr-note-duration-controls" (click)="$event.stopPropagation()">
                              <button
                                type="button"
                                class="pr-dur-mini-btn"
                                (click)="adjustNoteDuration(note.id, -1, $event)"
                                title="Shorten"
                              >
                                -
                              </button>
                              <button
                                type="button"
                                class="pr-dur-mini-btn"
                                (click)="adjustNoteDuration(note.id, 1, $event)"
                                title="Lengthen"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Modal Footer -->
        <div class="modal-footer">
          <div class="fx-chain-hint">
            <i class="fa-solid fa-circle-info"></i>
            Click any step number on the top ruler to start auditioning only this Piano Roll melody from that step.
          </div>
          <button type="button" class="close-modal-btn" (click)="onCloseModal()">
            Done
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SynthEditorModalComponent implements OnInit, OnChanges, OnDestroy {
  @ViewChild('pianoRollScroll') pianoRollScroll?: ElementRef<HTMLDivElement>;

  readonly audioService = inject(AudioService);

  readonly track = input.required<Track>();
  readonly currentStep = input<number>(-1);
  readonly bpm = input<number>(120);
  readonly swing = input<number>(0);
  readonly initialTab = input<'osc' | 'pianoroll'>('osc');

  readonly patchChanged = output<SynthPatch>();
  readonly notesChanged = output<PianoRollNote[]>();
  readonly stepsCountChanged = output<number>();
  readonly stopMainSequencer = output<void>();
  readonly close = output<void>();

  readonly activeTab = signal<'osc' | 'pianoroll'>('osc');
  readonly brushDurationSteps = signal<number>(2);
  readonly openDropdown = signal<'length' | 'brush' | 'melody' | null>(null);
  readonly selectedMelodyLabel = signal<string>('Select Melody');

  // Solo Piano Roll Playback State
  readonly isPianoRollPlaying = signal<boolean>(false);
  readonly pianoRollStep = signal<number>(-1);
  private prStepTimer: ReturnType<typeof setTimeout> | null = null;
  private expectedPrStepAudioTime = 0;

  readonly displayStep = computed(() =>
    this.isPianoRollPlaying() ? this.pianoRollStep() : this.currentStep()
  );

  readonly lengthOptions: { steps: number; label: string; sub: string }[] = [
    { steps: 8, label: '8 Steps (2 Beats)', sub: '1/2 Bar' },
    { steps: 12, label: '12 Steps (3 Beats)', sub: '3/4 Bar' },
    { steps: 16, label: '16 Steps (4 Beats)', sub: '1 Bar' },
    { steps: 24, label: '24 Steps (6 Beats)', sub: '1.5 Bars' },
    { steps: 32, label: '32 Steps (8 Beats)', sub: '2 Bars' },
    { steps: 48, label: '48 Steps (12 Beats)', sub: '3 Bars' },
    { steps: 64, label: '64 Steps (16 Beats)', sub: '4 Bars' },
    { steps: 96, label: '96 Steps (24 Beats)', sub: '6 Bars' },
    { steps: 128, label: '128 Steps (32 Beats)', sub: '8 Bars' },
  ];

  readonly brushOptions: { steps: number; label: string; sub: string }[] = [
    { steps: 0.25, label: '1/4 Step (Quarter)', sub: '1/64' },
    { steps: 0.5, label: '2/4 Step (Half)', sub: '1/32' },
    { steps: 0.75, label: '3/4 Step (Three-Quarter)', sub: '3/64' },
    { steps: 1, label: '1 Step (1/4 Beat)', sub: '1/16' },
    { steps: 2, label: '2 Steps (2/4 Beat)', sub: '1/8' },
    { steps: 3, label: '3 Steps (3/4 Beat)', sub: '3/16' },
    { steps: 4, label: '4 Steps (1 Beat • 1/4)', sub: '1/4 Bar' },
    { steps: 8, label: '8 Steps (2 Beats • 2/4)', sub: '2/4 Bar' },
    { steps: 12, label: '12 Steps (3 Beats • 3/4)', sub: '3/4 Bar' },
    { steps: 16, label: '16 Steps (4 Beats • 4/4)', sub: '1 Full Bar' },
  ];

  readonly activeBrushOption = computed(
    () =>
      this.brushOptions.find((o) => o.steps === this.brushDurationSteps()) ??
      this.brushOptions[4]
  );

  readonly totalSteps = computed(() => {
    const configured = this.track().pianoRollSteps || 16;
    const notes = this.track().pianoRollNotes || [];
    let maxNoteEnd = configured;
    for (const n of notes) {
      const end = n.startStep + n.durationSteps;
      if (end > maxNoteEnd) maxNoteEnd = end;
    }
    return Math.max(4, Math.ceil(maxNoteEnd / 4) * 4);
  });

  readonly totalBeats = computed(() => Math.ceil(this.totalSteps() / 4));

  readonly stepIndices = computed(() =>
    Array.from({ length: this.totalSteps() }, (_, i) => i)
  );

  // Full 6-Octave Range from C7 (MIDI 96) down to C1 (MIDI 24) -> 73 chromatic notes
  readonly fullPianoRollMidiRows = Array.from({ length: 73 }, (_, i) => 96 - i);

  // Audition keyboard keys (C3 = 48 .. C6 = 84)
  readonly auditionMidiKeys = Array.from({ length: 37 }, (_, i) => 48 + i);

  readonly waveforms: { label: string; value: OscWaveform }[] = [
    { label: 'SAW', value: 'sawtooth' },
    { label: 'SQR', value: 'square' },
    { label: 'SIN', value: 'sine' },
    { label: 'TRI', value: 'triangle' },
  ];

  patch: SynthPatch = createDefaultSynthPatch();

  ngOnInit(): void {
    this.activeTab.set(this.initialTab());
    this.patch = cloneSynthPatch(this.track().synthPatch);
    if (this.initialTab() === 'pianoroll') {
      setTimeout(() => this.scrollToOctave(5), 40);
    }
  }

  ngOnChanges(): void {
    this.patch = cloneSynthPatch(this.track().synthPatch);
  }

  ngOnDestroy(): void {
    this.stopPianoRollPlayback();
  }

  @HostListener('window:keydown', ['$event'])
  onModalKeyDown(event: KeyboardEvent): void {
    if (this.activeTab() !== 'pianoroll') return;
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
      event.preventDefault();
      event.stopPropagation();
      this.togglePianoRollPlayback();
    }
  }

  onCloseModal(): void {
    this.stopPianoRollPlayback();
    this.close.emit();
  }

  // ==================== CUSTOM THEME DROPDOWN OPERATIONS ====================

  toggleDropdown(
    menu: 'length' | 'brush' | 'melody',
    event?: Event
  ): void {
    event?.stopPropagation();
    this.openDropdown.set(this.openDropdown() === menu ? null : menu);
  }

  closeDropdowns(): void {
    if (this.openDropdown() !== null) {
      this.openDropdown.set(null);
    }
  }

  selectPianoRollLength(steps: number, event?: Event): void {
    event?.stopPropagation();
    this.setPianoRollSteps(steps);
    this.openDropdown.set(null);
  }

  selectBrushDuration(steps: number, event?: Event): void {
    event?.stopPropagation();
    this.brushDurationSteps.set(steps);
    this.openDropdown.set(null);
  }

  selectGeneratedMelody(
    type: 'arp' | 'bass' | 'chords',
    label: string,
    event?: Event
  ): void {
    event?.stopPropagation();
    this.selectedMelodyLabel.set(label);
    this.generateMelody(type);
    this.openDropdown.set(null);
  }

  onClearMelodyFromMenu(event?: Event): void {
    event?.stopPropagation();
    this.selectedMelodyLabel.set('Empty Melody');
    this.clearAllNotes();
    this.openDropdown.set(null);
  }

  // ==================== SOLO PIANO ROLL SEQUENCER (PLAYS ONLY THIS PIANO ROLL) ====================

  togglePianoRollPlayback(event?: Event): void {
    event?.stopPropagation();
    if (this.isPianoRollPlaying()) {
      this.stopPianoRollPlayback();
    } else {
      this.startPianoRollFromStep(0);
    }
  }

  startPianoRollFromStep(stepIndex: number, event?: Event): void {
    event?.stopPropagation();
    this.stopMainSequencer.emit();
    if (this.prStepTimer) {
      clearTimeout(this.prStepTimer);
      this.prStepTimer = null;
    }

    const total = this.totalSteps();
    const clampedStep = ((stepIndex % total) + total) % total;

    this.isPianoRollPlaying.set(true);
    const startAudioTime = this.audioService.getAudioTime() + 0.005;
    this.expectedPrStepAudioTime = startAudioTime;

    this.executePianoRollStep(clampedStep, startAudioTime);
    this.pianoRollStep.set(clampedStep);
    this.scheduleNextPianoRollStep();
  }

  stopPianoRollPlayback(): void {
    this.isPianoRollPlaying.set(false);
    this.pianoRollStep.set(-1);
    this.expectedPrStepAudioTime = 0;
    if (this.prStepTimer) {
      clearTimeout(this.prStepTimer);
      this.prStepTimer = null;
    }
  }

  private scheduleNextPianoRollStep(): void {
    if (!this.isPianoRollPlaying()) return;

    const current = this.pianoRollStep();
    const baseSec = 15 / Math.max(40, this.bpm());
    const swingRatio = (this.swing() / 100) * 0.35;
    const stepIntervalSec =
      current % 2 === 0 ? baseSec * (1 + swingRatio) : baseSec * (1 - swingRatio);

    const nowAudio = this.audioService.getAudioTime();
    if (
      !this.expectedPrStepAudioTime ||
      nowAudio - this.expectedPrStepAudioTime > stepIntervalSec * 4
    ) {
      this.expectedPrStepAudioTime = nowAudio + stepIntervalSec;
    } else {
      this.expectedPrStepAudioTime += stepIntervalSec;
    }

    const lookaheadLeadSec = 0.025;
    const delayMs = Math.max(
      4,
      (this.expectedPrStepAudioTime - nowAudio - lookaheadLeadSec) * 1000
    );

    this.prStepTimer = setTimeout(() => {
      if (!this.isPianoRollPlaying()) return;

      const scheduledAudioTime = Math.max(
        this.audioService.getAudioTime() + 0.004,
        this.expectedPrStepAudioTime
      );

      const total = this.totalSteps();
      const nextStep = (this.pianoRollStep() + 1) % total;

      this.executePianoRollStep(nextStep, scheduledAudioTime);
      this.pianoRollStep.set(nextStep);
      this.scheduleNextPianoRollStep();
    }, delayMs);
  }

  private executePianoRollStep(stepIndex: number, stepAudioTime: number): void {
    const t = this.track();
    const stepDurationSec = 15 / Math.max(40, this.bpm());
    const notesAtStep = (t.pianoRollNotes || []).filter(
      (n) => Math.floor(n.startStep) === stepIndex
    );

    for (const note of notesAtStep) {
      const gateSec = Math.max(
        0.04,
        note.durationSteps * stepDurationSec * 0.88
      );
      this.audioService.playSynthNote(
        note.midi,
        gateSec,
        t.volume * (note.velocity ?? 0.9),
        this.patch,
        t.effects,
        stepAudioTime,
        `pr-solo-${t.id}`
      );
    }
  }

  scrollToOctave(octave: number): void {
    const el = this.pianoRollScroll?.nativeElement;
    if (!el) return;
    // Target top note of that octave (e.g. C7=96, B5=83, B4=71)
    const targetMidi = octave === 7 ? 96 : Math.min(96, (octave + 1) * 12 + 11);
    const rowIndex = 96 - targetMidi;
    const rowHeightPx = 26;
    el.scrollTo({ top: Math.max(0, rowIndex * rowHeightPx - 26), behavior: 'smooth' });
  }

  setPianoRollSteps(steps: number): void {
    const clamped = Math.max(4, Math.ceil(steps / 4) * 4);
    this.stepsCountChanged.emit(clamped);
  }

  changePianoRollSteps(deltaSteps: number, event?: Event): void {
    event?.stopPropagation();
    const nextSteps = Math.max(4, this.totalSteps() + deltaSteps);
    this.stepsCountChanged.emit(nextSteps);
  }

  isBlackKey(midi: number): boolean {
    return isBlackKeyMidi(midi);
  }

  getNoteName(midi: number): string {
    return midiToNoteName(midi);
  }

  formatPan(pan: number): string {
    if (Math.abs(pan) < 0.03) return 'CENTER (C)';
    return pan < 0
      ? `L ${Math.round(Math.abs(pan) * 100)}%`
      : `R ${Math.round(pan * 100)}%`;
  }

  toggleOsc(oscIdx: number): void {
    const osc = this.patch.oscillators[oscIdx];
    if (!osc) return;
    osc.enabled = !osc.enabled;
    this.emitPatch();
  }

  setOscWaveform(oscIdx: number, waveform: OscWaveform): void {
    const osc = this.patch.oscillators[oscIdx];
    if (!osc) return;
    osc.waveform = waveform;
    this.emitPatch();
  }

  updateOscParam(
    oscIdx: number,
    key: keyof SynthOscillatorConfig,
    value: number
  ): void {
    const osc = this.patch.oscillators[oscIdx];
    if (!osc) return;
    (osc as unknown as Record<string, number>)[key] = Number(value);
    this.emitPatch();
  }

  setFilterType(type: 'lowpass' | 'highpass' | 'bandpass'): void {
    this.patch.filterType = type;
    this.emitPatch();
  }

  emitPatch(): void {
    this.patchChanged.emit(cloneSynthPatch(this.patch));
  }

  auditionNote(midi: number): void {
    const t = this.track();
    this.audioService.playSynthNote(
      midi,
      0.32,
      t.volume,
      this.patch,
      t.effects
    );
  }

  playChordPreview(): void {
    const t = this.track();
    this.audioService.playSynthNote(60, 0.4, t.volume * 0.85, this.patch, t.effects);
    this.audioService.playSynthNote(63, 0.4, t.volume * 0.75, this.patch, t.effects);
    this.audioService.playSynthNote(67, 0.4, t.volume * 0.8, this.patch, t.effects);
    this.audioService.playSynthNote(72, 0.4, t.volume * 0.75, this.patch, t.effects);
  }

  applyFactoryPreset(
    presetId: 'supersaw' | 'sub808' | 'analogpad' | 'pluck' | 'reese' | 'brass'
  ): void {
    if (presetId === 'supersaw') {
      this.patch = createDefaultSynthPatch();
    } else if (presetId === 'sub808') {
      this.patch = {
        presetName: 'Deep 808 Sub Bass',
        oscillators: [
          { id: 1, enabled: true, waveform: 'sine', octave: -1, semitone: 0, detune: 0, pan: 0, level: 1.0 },
          { id: 2, enabled: true, waveform: 'triangle', octave: -1, semitone: 0, detune: 4, pan: 0, level: 0.55 },
          { id: 3, enabled: true, waveform: 'sawtooth', octave: 0, semitone: 0, detune: -8, pan: 0, level: 0.22 },
          { id: 4, enabled: false, waveform: 'sine', octave: -2, semitone: 0, detune: 0, pan: 0, level: 0.4 },
        ],
        filterType: 'lowpass',
        filterCutoff: 420,
        filterResonance: 3.2,
        filterEnvAmount: 1400,
        attack: 0.005,
        decay: 0.45,
        sustain: 0.25,
        release: 0.35,
        masterGain: 1.0,
      };
    } else if (presetId === 'analogpad') {
      this.patch = {
        presetName: 'Warm Analog Pad',
        oscillators: [
          { id: 1, enabled: true, waveform: 'sawtooth', octave: 0, semitone: 0, detune: -22, pan: -0.6, level: 0.75 },
          { id: 2, enabled: true, waveform: 'sawtooth', octave: 0, semitone: 0, detune: 22, pan: 0.6, level: 0.75 },
          { id: 3, enabled: true, waveform: 'triangle', octave: -1, semitone: 0, detune: 5, pan: -0.2, level: 0.65 },
          { id: 4, enabled: true, waveform: 'sine', octave: 1, semitone: 7, detune: -10, pan: 0.2, level: 0.45 },
        ],
        filterType: 'lowpass',
        filterCutoff: 1650,
        filterResonance: 1.8,
        filterEnvAmount: 1800,
        attack: 0.18,
        decay: 0.65,
        sustain: 0.78,
        release: 0.85,
        masterGain: 0.85,
      };
    } else if (presetId === 'pluck') {
      this.patch = {
        presetName: 'Pluck Arpeggio',
        oscillators: [
          { id: 1, enabled: true, waveform: 'square', octave: 0, semitone: 0, detune: -10, pan: -0.35, level: 0.85 },
          { id: 2, enabled: true, waveform: 'sawtooth', octave: 0, semitone: 0, detune: 10, pan: 0.35, level: 0.85 },
          { id: 3, enabled: true, waveform: 'triangle', octave: 1, semitone: 0, detune: 4, pan: 0, level: 0.5 },
          { id: 4, enabled: false, waveform: 'sine', octave: 0, semitone: 7, detune: 0, pan: 0, level: 0.3 },
        ],
        filterType: 'lowpass',
        filterCutoff: 950,
        filterResonance: 4.5,
        filterEnvAmount: 4800,
        attack: 0.003,
        decay: 0.16,
        sustain: 0.12,
        release: 0.18,
        masterGain: 0.9,
      };
    } else if (presetId === 'reese') {
      this.patch = {
        presetName: 'Dark Reese Bass',
        oscillators: [
          { id: 1, enabled: true, waveform: 'sawtooth', octave: -1, semitone: 0, detune: -28, pan: -0.4, level: 0.9 },
          { id: 2, enabled: true, waveform: 'sawtooth', octave: -1, semitone: 0, detune: 28, pan: 0.4, level: 0.9 },
          { id: 3, enabled: true, waveform: 'square', octave: -1, semitone: 0, detune: -12, pan: 0, level: 0.6 },
          { id: 4, enabled: true, waveform: 'sine', octave: -2, semitone: 0, detune: 0, pan: 0, level: 0.8 },
        ],
        filterType: 'lowpass',
        filterCutoff: 680,
        filterResonance: 5.0,
        filterEnvAmount: 1600,
        attack: 0.015,
        decay: 0.35,
        sustain: 0.7,
        release: 0.3,
        masterGain: 0.95,
      };
    } else if (presetId === 'brass') {
      this.patch = {
        presetName: 'Neon Synth Brass',
        oscillators: [
          { id: 1, enabled: true, waveform: 'sawtooth', octave: 0, semitone: 0, detune: -14, pan: -0.5, level: 0.9 },
          { id: 2, enabled: true, waveform: 'sawtooth', octave: 0, semitone: 0, detune: 14, pan: 0.5, level: 0.9 },
          { id: 3, enabled: true, waveform: 'sawtooth', octave: -1, semitone: 0, detune: 6, pan: 0, level: 0.65 },
          { id: 4, enabled: true, waveform: 'square', octave: 0, semitone: 12, detune: -8, pan: 0.2, level: 0.4 },
        ],
        filterType: 'lowpass',
        filterCutoff: 1400,
        filterResonance: 2.6,
        filterEnvAmount: 3600,
        attack: 0.045,
        decay: 0.32,
        sustain: 0.68,
        release: 0.28,
        masterGain: 0.88,
      };
    }

    this.emitPatch();
    this.playChordPreview();
  }

  // ==================== PIANO ROLL EDITOR OPERATIONS ====================

  getNotesForMidi(midi: number): PianoRollNote[] {
    return (this.track().pianoRollNotes || []).filter((n) => n.midi === midi);
  }

  onPianoCellClick(midi: number, stepIndex: number): void {
    const currentNotes = [...(this.track().pianoRollNotes || [])];
    const existingIdx = currentNotes.findIndex(
      (n) =>
        n.midi === midi &&
        stepIndex >= n.startStep &&
        stepIndex < n.startStep + n.durationSteps
    );

    if (existingIdx >= 0) {
      currentNotes.splice(existingIdx, 1);
      this.notesChanged.emit(currentNotes);
      return;
    }

    const dur = Math.max(0.25, this.brushDurationSteps());
    const neededSteps = stepIndex + dur;
    if (neededSteps > this.totalSteps()) {
      const expandedSteps = Math.ceil(neededSteps / 4) * 4;
      this.stepsCountChanged.emit(expandedSteps);
    }

    const newNote: PianoRollNote = {
      id: `pr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      midi,
      startStep: stepIndex,
      durationSteps: dur,
      velocity: 0.92,
    };

    currentNotes.push(newNote);
    this.notesChanged.emit(currentNotes);
    this.auditionNote(midi);
  }

  removeNote(noteId: string, event: Event): void {
    event.stopPropagation();
    const updated = (this.track().pianoRollNotes || []).filter(
      (n) => n.id !== noteId
    );
    this.notesChanged.emit(updated);
  }

  adjustNoteDuration(noteId: string, delta: number, event: Event): void {
    event.stopPropagation();
    let maxEnd = this.totalSteps();
    const updated = (this.track().pianoRollNotes || []).map((n) => {
      if (n.id !== noteId) return n;
      const stepDelta =
        n.durationSteps < 1 || (n.durationSteps === 1 && delta < 0)
          ? delta * 0.25
          : delta;
      const nextDur = Math.max(
        0.25,
        Math.round((n.durationSteps + stepDelta) * 100) / 100
      );
      if (n.startStep + nextDur > maxEnd) {
        maxEnd = Math.ceil((n.startStep + nextDur) / 4) * 4;
      }
      return { ...n, durationSteps: nextDur };
    });
    if (maxEnd > this.totalSteps()) {
      this.stepsCountChanged.emit(maxEnd);
    }
    this.notesChanged.emit(updated);
  }

  clearAllNotes(): void {
    this.notesChanged.emit([]);
  }

  generateMelody(type: 'arp' | 'bass' | 'chords'): void {
    const steps = this.totalSteps();
    const cycles = Math.max(1, Math.ceil(steps / 16));
    const notes: PianoRollNote[] = [];

    for (let c = 0; c < cycles; c++) {
      const baseStep = c * 16;
      if (type === 'arp') {
        const pitches =
          c % 2 === 0
            ? [60, 63, 67, 72, 70, 67, 63, 60]
            : [60, 65, 68, 72, 75, 72, 67, 63];
        pitches.forEach((midi, i) => {
          const start = baseStep + i * 2;
          if (start < steps) {
            notes.push({
              id: `arp-${Date.now()}-${c}-${i}`,
              midi,
              startStep: start,
              durationSteps: Math.min(2, steps - start),
              velocity: 0.9,
            });
          }
        });
      } else if (type === 'bass') {
        const pattern = [
          { midi: 48, offset: 0, dur: 2, vel: 0.98 },
          { midi: 48, offset: 2, dur: 2, vel: 0.86 },
          { midi: 51, offset: 4, dur: 2, vel: 0.92 },
          { midi: 55, offset: 6, dur: 2, vel: 0.9 },
          { midi: 48, offset: 8, dur: 3, vel: 0.98 },
          { midi: 51, offset: 11, dur: 1, vel: 0.88 },
          { midi: 53, offset: 12, dur: 2, vel: 0.94 },
          { midi: 55, offset: 14, dur: 2, vel: 0.9 },
        ];
        pattern.forEach((p, idx) => {
          const start = baseStep + p.offset;
          if (start < steps) {
            notes.push({
              id: `bs-${Date.now()}-${c}-${idx}`,
              midi: p.midi,
              startStep: start,
              durationSteps: Math.min(p.dur, steps - start),
              velocity: p.vel,
            });
          }
        });
      } else if (type === 'chords') {
        const chordGroups = [
          { offset: 0, midis: [60, 63, 67] }, // Cm
          { offset: 4, midis: [56, 60, 63] }, // G#
          { offset: 8, midis: [53, 56, 60] }, // Fm
          { offset: 12, midis: [55, 59, 62] }, // G7
        ];
        chordGroups.forEach((cg, gIdx) => {
          const start = baseStep + cg.offset;
          if (start < steps) {
            cg.midis.forEach((midi, mIdx) => {
              notes.push({
                id: `ch-${Date.now()}-${c}-${gIdx}-${mIdx}`,
                midi,
                startStep: start,
                durationSteps: Math.min(4, steps - start),
                velocity: 0.85,
              });
            });
          }
        });
      }
    }

    this.notesChanged.emit(notes);
    this.playChordPreview();
  }
}
