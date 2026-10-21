import { Component, computed, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AudioService } from '../../services/audio.service';
import { SYNTH_SOUND_ID, createDefaultSynthPatch } from '../../models/beat.model';

@Component({
  selector: 'app-sound-selector-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="modal-backdrop" (click)="close.emit()">
      <div class="modal-panel" (click)="$event.stopPropagation()">
        <!-- Modal Header -->
        <div class="modal-header">
          <div class="modal-title-group">
            <span class="modal-badge">SOUND & INSTRUMENT LIBRARY</span>
            <h3>
              @if (trackName()) {
                Select Sound or Synthesizer for <span>{{ trackName() }}</span>
              } @else {
                Select Channel Sound or Synthesizer
              }
            </h3>
          </div>
          <button type="button" class="icon-close-btn" (click)="close.emit()" title="Close">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>

        <!-- Featured 4-OSC Synthesizer Instrument Banner -->
        <div class="synth-instrument-banner" [class.active-synth]="currentSound() === synthSoundId">
          <div class="synth-banner-left">
            <div class="synth-banner-icon">
              <i class="fa-solid fa-wave-square"></i>
              <span class="osc-tag">4x OSC</span>
            </div>
            <div class="synth-banner-info">
              <div class="synth-banner-title-row">
                <h4>HLL 4-OSC Pro Synthesizer</h4>
                <span class="piano-roll-pill">
                  <i class="fa-solid fa-music"></i> CONVERTS CHANNEL TO PIANO ROLL
                </span>
              </div>
              <p>
                4 independent oscillators (Saw, Square, Sine, Triangle), Unison Detune, Stereo Pan,
                Resonant VCF Filter & ADSR Envelope. Selecting this switches the channel to Piano Roll mode.
              </p>
            </div>
          </div>

          <div class="synth-banner-actions">
            <button
              type="button"
              class="synth-preview-btn"
              (click)="onPreviewSynth($event)"
              title="Preview 4-OSC Synthesizer Sound"
            >
              <i class="fa-solid fa-volume-high"></i> Preview
            </button>
            <button
              type="button"
              class="synth-select-cta-btn"
              (click)="soundSelected.emit(synthSoundId)"
            >
              <i class="fa-solid fa-sliders"></i>
              @if (currentSound() === synthSoundId) {
                Selected (4-OSC Synth)
              } @else {
                Select 4-OSC Synthesizer
              }
            </button>
          </div>
        </div>

        <!-- Search & Category Filter Bar -->
        <div class="modal-filters">
          <div class="search-box">
            <i class="fa-solid fa-magnifying-glass search-icon"></i>
            <input
              type="text"
              placeholder="Search WAV samples (e.g. Kick, Snare, Hat)..."
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event)"
              class="search-input"
            />
            @if (searchQuery()) {
              <button type="button" class="clear-search-btn" (click)="searchQuery.set('')">
                <i class="fa-solid fa-circle-xmark"></i>
              </button>
            }
          </div>

          <div class="category-pills">
            @for (category of audioService.soundCategories(); track category) {
              <button
                type="button"
                class="category-pill"
                [class.active]="selectedCategory() === category"
                (click)="selectedCategory.set(category)"
              >
                {{ category }}
              </button>
            }
          </div>
        </div>

        <!-- Sound Grid List -->
        <div class="sound-list-container">
          @if (filteredSounds().length === 0) {
            <div class="empty-sounds">
              <i class="fa-solid fa-wave-square"></i>
              <p>No sounds found matching your search.</p>
            </div>
          } @else {
            <ul class="sound-grid">
              @for (sound of filteredSounds(); track sound) {
                <li
                  class="sound-item"
                  [class.active-sound]="currentSound() === sound"
                  [class.previewing]="previewingSound() === sound"
                >
                  <button
                    type="button"
                    class="select-sound-btn"
                    (click)="soundSelected.emit(sound)"
                  >
                    <span class="sound-icon-wrap">
                      <i class="fa-solid fa-drum"></i>
                    </span>
                    <span class="sound-info">
                      <span class="sound-name">{{ formatSoundName(sound) }}</span>
                      <span class="sound-meta">
                        {{ audioService.extractCategory(sound) }} • WAV
                        @if (audioService.isSoundBuffered(sound)) {
                          <span class="buffered-dot" title="Buffered in Memory (Zero-Latency)">● READY</span>
                        }
                      </span>
                    </span>
                  </button>

                  <button
                    type="button"
                    class="preview-sound-btn"
                    (click)="onPreview(sound, $event)"
                    title="Preview Sound"
                  >
                    <i
                      class="fa-solid"
                      [class.fa-volume-high]="previewingSound() === sound"
                      [class.fa-play]="previewingSound() !== sound"
                    ></i>
                  </button>
                </li>
              }
            </ul>
          }
        </div>

        <!-- Modal Footer -->
        <div class="modal-footer">
          <div class="buffer-info">
            <span class="status-led"></span>
            Web Audio API Buffer: {{ audioService.loadedCount() }} / {{ audioService.totalCount() }} samples ready + 4-OSC Synth Engine Active
          </div>
          <button type="button" class="close-modal-btn" (click)="close.emit()">
            Close
          </button>
        </div>
      </div>
    </div>
  `,
})
export class SoundSelectorModalComponent {
  readonly audioService = inject(AudioService);
  readonly synthSoundId = SYNTH_SOUND_ID;

  readonly currentSound = input<string>('');
  readonly trackName = input<string>('');
  readonly soundSelected = output<string>();
  readonly close = output<void>();

  readonly searchQuery = signal<string>('');
  readonly selectedCategory = signal<string>('All');
  readonly previewingSound = signal<string | null>(null);

  private previewTimeout: ReturnType<typeof setTimeout> | null = null;

  readonly filteredSounds = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const category = this.selectedCategory();
    return this.audioService.availableSounds().filter((sound) => {
      const matchesCategory =
        category === 'All' || this.audioService.extractCategory(sound) === category;
      const matchesQuery = !query || sound.toLowerCase().includes(query);
      return matchesCategory && matchesQuery;
    });
  });

  onPreview(sound: string, event: Event): void {
    event.stopPropagation();
    this.previewingSound.set(sound);
    this.audioService.playSound(sound, 0.95);

    if (this.previewTimeout) clearTimeout(this.previewTimeout);
    this.previewTimeout = setTimeout(() => {
      this.previewingSound.set(null);
    }, 300);
  }

  onPreviewSynth(event: Event): void {
    event.stopPropagation();
    const defaultPatch = createDefaultSynthPatch();
    // Play a rich minor triad preview (C4 - D#4 - G4)
    this.audioService.playSynthNote(60, 0.35, 0.75, defaultPatch);
    this.audioService.playSynthNote(63, 0.35, 0.65, defaultPatch);
    this.audioService.playSynthNote(67, 0.35, 0.7, defaultPatch);
  }

  formatSoundName(sound: string): string {
    return sound.replace(/\.wav$/i, '');
  }
}
