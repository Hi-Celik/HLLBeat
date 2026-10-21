import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  Track,
  TrackEffects,
  createDefaultTrackEffects,
} from '../../models/beat.model';

@Component({
  selector: 'app-track-fx-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div class="fx-modal-panel" (click)="$event.stopPropagation()">
        <!-- FX Modal Header -->
        <div class="fx-modal-header">
          <div class="fx-title-group">
            <span class="fx-rack-badge">
              <i class="fa-solid fa-sliders"></i> CHANNEL FX RACK (WEB AUDIO DSP)
            </span>
            <h3>
              <span>{{ track().name }}</span> Effects Chain
            </h3>
          </div>

          <div class="fx-header-actions">
            <button
              type="button"
              class="fx-test-btn"
              (click)="previewSound.emit()"
              title="Audition Channel Sound with Active Effects"
            >
              <i class="fa-solid fa-volume-high"></i>
              <span>Test with FX</span>
            </button>

            <button
              type="button"
              class="fx-reset-btn"
              (click)="resetAll()"
              title="Reset All Effects"
            >
              <i class="fa-solid fa-rotate-left"></i>
              <span>Reset</span>
            </button>

            <button
              type="button"
              class="icon-close-btn"
              (click)="close.emit()"
              title="Close"
            >
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        </div>

        <!-- Quick FX Chain Presets -->
        <div class="fx-presets-bar">
          <span class="fx-preset-label">FX PRESETS:</span>
          <button type="button" class="fx-preset-pill" (click)="applyFxPreset('reverb')">
            Wide Room (Reverb)
          </button>
          <button type="button" class="fx-preset-pill" (click)="applyFxPreset('delay')">
            Dub Echo (Delay)
          </button>
          <button type="button" class="fx-preset-pill" (click)="applyFxPreset('chorus')">
            Stereo Chorus
          </button>
          <button type="button" class="fx-preset-pill" (click)="applyFxPreset('lofi')">
            Lo-Fi Radio (Low+High Cut)
          </button>
          <button type="button" class="fx-preset-pill" (click)="applyFxPreset('space')">
            Space Atmosphere (Full Chain)
          </button>
        </div>

        <!-- 5 Studio FX Modules Grid -->
        <div class="fx-modules-grid">
          <!-- 1. LOW CUT (HIGH-PASS FILTER) -->
          <div
            class="fx-unit-card"
            [class.unit-enabled]="track().effects.lowCutEnabled"
            data-fx-color="cyan"
          >
            <div class="fx-unit-top">
              <div class="fx-unit-title">
                <span class="fx-led"></span>
                <div>
                  <h4>LOW CUT</h4>
                  <small>High-Pass Filter (Sub-Bass Roll-Off)</small>
                </div>
              </div>
              <button
                type="button"
                class="fx-power-btn"
                [class.on]="track().effects.lowCutEnabled"
                (click)="toggleEffect('lowCutEnabled')"
              >
                {{ track().effects.lowCutEnabled ? 'ON' : 'OFF' }}
              </button>
            </div>

            <div class="fx-params-list">
              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Cutoff Frequency</span>
                  <strong>{{ track().effects.lowCutFreq }} Hz</strong>
                </div>
                <input
                  type="range"
                  min="20"
                  max="1000"
                  step="5"
                  [ngModel]="track().effects.lowCutFreq"
                  (ngModelChange)="updateParam('lowCutFreq', +$event, true)"
                  class="fx-slider"
                />
              </div>
            </div>
          </div>

          <!-- 2. HIGH CUT (LOW-PASS FILTER) -->
          <div
            class="fx-unit-card"
            [class.unit-enabled]="track().effects.highCutEnabled"
            data-fx-color="amber"
          >
            <div class="fx-unit-top">
              <div class="fx-unit-title">
                <span class="fx-led"></span>
                <div>
                  <h4>HIGH CUT</h4>
                  <small>Low-Pass Filter (High-End Roll-Off)</small>
                </div>
              </div>
              <button
                type="button"
                class="fx-power-btn"
                [class.on]="track().effects.highCutEnabled"
                (click)="toggleEffect('highCutEnabled')"
              >
                {{ track().effects.highCutEnabled ? 'ON' : 'OFF' }}
              </button>
            </div>

            <div class="fx-params-list">
              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Cutoff Frequency</span>
                  <strong>{{ track().effects.highCutFreq }} Hz</strong>
                </div>
                <input
                  type="range"
                  min="400"
                  max="20000"
                  step="100"
                  [ngModel]="track().effects.highCutFreq"
                  (ngModelChange)="updateParam('highCutFreq', +$event, true)"
                  class="fx-slider"
                />
              </div>
            </div>
          </div>

          <!-- 3. CHORUS -->
          <div
            class="fx-unit-card"
            [class.unit-enabled]="track().effects.chorusEnabled"
            data-fx-color="purple"
          >
            <div class="fx-unit-top">
              <div class="fx-unit-title">
                <span class="fx-led"></span>
                <div>
                  <h4>CHORUS</h4>
                  <small>Stereo Modulation & Width</small>
                </div>
              </div>
              <button
                type="button"
                class="fx-power-btn"
                [class.on]="track().effects.chorusEnabled"
                (click)="toggleEffect('chorusEnabled')"
              >
                {{ track().effects.chorusEnabled ? 'ON' : 'OFF' }}
              </button>
            </div>

            <div class="fx-params-list">
              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Modulation Rate</span>
                  <strong>{{ track().effects.chorusRate | number:'1.1-1' }} Hz</strong>
                </div>
                <input
                  type="range"
                  min="0.2"
                  max="6"
                  step="0.1"
                  [ngModel]="track().effects.chorusRate"
                  (ngModelChange)="updateParam('chorusRate', +$event, true)"
                  class="fx-slider"
                />
              </div>

              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Modulation Depth</span>
                  <strong>{{ track().effects.chorusDepth }}%</strong>
                </div>
                <input
                  type="range"
                  min="5"
                  max="100"
                  step="5"
                  [ngModel]="track().effects.chorusDepth"
                  (ngModelChange)="updateParam('chorusDepth', +$event, true)"
                  class="fx-slider"
                />
              </div>

              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Dry / Wet Mix</span>
                  <strong>{{ (track().effects.chorusMix * 100) | number:'1.0-0' }}%</strong>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  [ngModel]="track().effects.chorusMix"
                  (ngModelChange)="updateParam('chorusMix', +$event, true)"
                  class="fx-slider"
                />
              </div>
            </div>
          </div>

          <!-- 4. DELAY -->
          <div
            class="fx-unit-card"
            [class.unit-enabled]="track().effects.delayEnabled"
            data-fx-color="emerald"
          >
            <div class="fx-unit-top">
              <div class="fx-unit-title">
                <span class="fx-led"></span>
                <div>
                  <h4>DELAY</h4>
                  <small>Rhythmic Echo & Feedback</small>
                </div>
              </div>
              <button
                type="button"
                class="fx-power-btn"
                [class.on]="track().effects.delayEnabled"
                (click)="toggleEffect('delayEnabled')"
              >
                {{ track().effects.delayEnabled ? 'ON' : 'OFF' }}
              </button>
            </div>

            <div class="fx-params-list">
              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Delay Time</span>
                  <strong>{{ (track().effects.delayTime * 1000) | number:'1.0-0' }} ms</strong>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1.0"
                  step="0.025"
                  [ngModel]="track().effects.delayTime"
                  (ngModelChange)="updateParam('delayTime', +$event, true)"
                  class="fx-slider"
                />
              </div>

              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Feedback</span>
                  <strong>{{ (track().effects.delayFeedback * 100) | number:'1.0-0' }}%</strong>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.85"
                  step="0.05"
                  [ngModel]="track().effects.delayFeedback"
                  (ngModelChange)="updateParam('delayFeedback', +$event, true)"
                  class="fx-slider"
                />
              </div>

              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Dry / Wet Mix</span>
                  <strong>{{ (track().effects.delayMix * 100) | number:'1.0-0' }}%</strong>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  [ngModel]="track().effects.delayMix"
                  (ngModelChange)="updateParam('delayMix', +$event, true)"
                  class="fx-slider"
                />
              </div>
            </div>
          </div>

          <!-- 5. REVERB -->
          <div
            class="fx-unit-card fx-unit-wide"
            [class.unit-enabled]="track().effects.reverbEnabled"
            data-fx-color="rose"
          >
            <div class="fx-unit-top">
              <div class="fx-unit-title">
                <span class="fx-led"></span>
                <div>
                  <h4>REVERB</h4>
                  <small>Studio Acoustic Hall & Room Ambience (Convolver)</small>
                </div>
              </div>
              <button
                type="button"
                class="fx-power-btn"
                [class.on]="track().effects.reverbEnabled"
                (click)="toggleEffect('reverbEnabled')"
              >
                {{ track().effects.reverbEnabled ? 'ON' : 'OFF' }}
              </button>
            </div>

            <div class="fx-params-list fx-params-two-col">
              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Decay Time</span>
                  <strong>{{ track().effects.reverbDecay | number:'1.1-1' }} s</strong>
                </div>
                <input
                  type="range"
                  min="0.3"
                  max="4.0"
                  step="0.1"
                  [ngModel]="track().effects.reverbDecay"
                  (ngModelChange)="updateParam('reverbDecay', +$event, true)"
                  class="fx-slider"
                />
              </div>

              <div class="fx-param-row">
                <div class="fx-param-label">
                  <span>Dry / Wet Mix</span>
                  <strong>{{ (track().effects.reverbMix * 100) | number:'1.0-0' }}%</strong>
                </div>
                <input
                  type="range"
                  min="0.05"
                  max="1"
                  step="0.05"
                  [ngModel]="track().effects.reverbMix"
                  (ngModelChange)="updateParam('reverbMix', +$event, true)"
                  class="fx-slider"
                />
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <div class="buffer-info">
            <span class="status-led"></span>
            Signal Flow: Low Cut → High Cut → Chorus → Delay → Reverb
          </div>
          <button type="button" class="close-modal-btn" (click)="close.emit()">
            Done
          </button>
        </div>
      </div>
    </div>
  `,
})
export class TrackFxModalComponent {
  readonly track = input.required<Track>();
  readonly effectsChanged = output<TrackEffects>();
  readonly previewSound = output<void>();
  readonly close = output<void>();

  toggleEffect(
    key:
      | 'lowCutEnabled'
      | 'highCutEnabled'
      | 'chorusEnabled'
      | 'delayEnabled'
      | 'reverbEnabled'
  ): void {
    const current = this.track().effects;
    const updated: TrackEffects = {
      ...current,
      [key]: !current[key],
    };
    this.effectsChanged.emit(updated);
  }

  updateParam<K extends keyof TrackEffects>(
    key: K,
    value: TrackEffects[K],
    autoEnable = false
  ): void {
    const current = this.track().effects;
    const updated: TrackEffects = {
      ...current,
      [key]: value,
    };

    if (autoEnable) {
      if (key === 'lowCutFreq') updated.lowCutEnabled = true;
      if (key === 'highCutFreq') updated.highCutEnabled = true;
      if (
        key === 'chorusRate' ||
        key === 'chorusDepth' ||
        key === 'chorusMix'
      ) {
        updated.chorusEnabled = true;
      }
      if (
        key === 'delayTime' ||
        key === 'delayFeedback' ||
        key === 'delayMix'
      ) {
        updated.delayEnabled = true;
      }
      if (key === 'reverbDecay' || key === 'reverbMix') {
        updated.reverbEnabled = true;
      }
    }

    this.effectsChanged.emit(updated);
  }

  resetAll(): void {
    this.effectsChanged.emit(createDefaultTrackEffects());
  }

  applyFxPreset(
    preset: 'reverb' | 'delay' | 'chorus' | 'lofi' | 'space'
  ): void {
    const base = createDefaultTrackEffects();
    switch (preset) {
      case 'reverb':
        base.reverbEnabled = true;
        base.reverbDecay = 2.2;
        base.reverbMix = 0.4;
        break;
      case 'delay':
        base.delayEnabled = true;
        base.delayTime = 0.25;
        base.delayFeedback = 0.45;
        base.delayMix = 0.35;
        break;
      case 'chorus':
        base.chorusEnabled = true;
        base.chorusRate = 2.2;
        base.chorusDepth = 65;
        base.chorusMix = 0.5;
        break;
      case 'lofi':
        base.lowCutEnabled = true;
        base.lowCutFreq = 380;
        base.highCutEnabled = true;
        base.highCutFreq = 2600;
        break;
      case 'space':
        base.lowCutEnabled = true;
        base.lowCutFreq = 140;
        base.chorusEnabled = true;
        base.chorusMix = 0.35;
        base.delayEnabled = true;
        base.delayTime = 0.3;
        base.delayFeedback = 0.4;
        base.delayMix = 0.3;
        base.reverbEnabled = true;
        base.reverbDecay = 2.8;
        base.reverbMix = 0.45;
        break;
    }
    this.effectsChanged.emit(base);
    this.previewSound.emit();
  }
}
