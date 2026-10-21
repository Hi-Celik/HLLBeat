import { Injectable, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import {
  SYNTH_SOUND_ID,
  SynthPatch,
  TrackEffects,
  createDefaultSynthPatch,
  midiToFreq,
} from '../models/beat.model';

interface SharedDelayBus {
  input: GainNode;
  delayNode: DelayNode;
  feedbackGain: GainNode;
}

interface ActiveSynthVoice {
  startTime: number;
  stopTime: number;
  vcaNode: GainNode;
}

@Injectable({
  providedIn: 'root',
})
export class AudioService {
  private readonly http = inject(HttpClient);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly isBrowser = isPlatformBrowser(this.platformId);

  private audioContext: AudioContext | null = null;
  private masterGainNode: GainNode | null = null;
  private compressorNode: DynamicsCompressorNode | null = null;

  // Pre-decoded AudioBuffers for zero-latency playback
  private readonly bufferCache = new Map<string, AudioBuffer>();
  private readonly pendingLoads = new Map<string, Promise<AudioBuffer | null>>();

  // Persistent shared ConvolverNodes keyed by quantized decay (prevents per-hit FFT CPU spikes)
  private readonly sharedConvolverNodes = new Map<string, ConvolverNode>();

  // Persistent shared Delay feedback buses (prevents circular feedback node leaks)
  private readonly sharedDelayBuses = new Map<string, SharedDelayBus>();

  // Active synth voices per track for clean rhythmic retriggering without tail smear
  private readonly activeSynthVoices = new Map<string, ActiveSynthVoice[]>();

  // Shared free-running LFO oscillator for Chorus modulation
  private sharedChorusLfo: OscillatorNode | null = null;

  // Reactive state using Angular Signals
  readonly availableSounds = signal<string[]>([]);
  readonly loadedCount = signal<number>(0);
  readonly totalCount = signal<number>(0);
  readonly isPreloading = signal<boolean>(false);
  readonly masterVolume = signal<number>(0.85);
  readonly peakLevel = signal<number>(0);

  readonly loadingProgress = computed(() => {
    const total = this.totalCount();
    if (total === 0) return 0;
    return Math.round((this.loadedCount() / total) * 100);
  });

  readonly soundCategories = computed(() => {
    const categories = new Set<string>(['All']);
    for (const sound of this.availableSounds()) {
      const category = this.extractCategory(sound);
      categories.add(category);
    }
    return Array.from(categories);
  });

  private meterTimeout: ReturnType<typeof setTimeout> | null = null;

  /**
   * Initializes the Web Audio API context and master effects chain.
   */
  private ensureAudioContext(): AudioContext | null {
    if (!this.isBrowser) return null;

    if (!this.audioContext) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.audioContext = new AudioCtx({ latencyHint: 'interactive' });

      // Master compressor for punchy drum & synth output without clipping
      this.compressorNode = this.audioContext.createDynamicsCompressor();
      this.compressorNode.threshold.setValueAtTime(
        -12,
        this.audioContext.currentTime
      );
      this.compressorNode.knee.setValueAtTime(18, this.audioContext.currentTime);
      this.compressorNode.ratio.setValueAtTime(4, this.audioContext.currentTime);
      this.compressorNode.attack.setValueAtTime(
        0.003,
        this.audioContext.currentTime
      );
      this.compressorNode.release.setValueAtTime(
        0.15,
        this.audioContext.currentTime
      );

      // Master volume gain node
      this.masterGainNode = this.audioContext.createGain();
      this.masterGainNode.gain.setValueAtTime(
        this.masterVolume(),
        this.audioContext.currentTime
      );

      this.compressorNode.connect(this.masterGainNode);
      this.masterGainNode.connect(this.audioContext.destination);

      // Shared Chorus LFO (single oscillator reused across all voices)
      this.sharedChorusLfo = this.audioContext.createOscillator();
      this.sharedChorusLfo.type = 'sine';
      this.sharedChorusLfo.frequency.setValueAtTime(1.8, this.audioContext.currentTime);
      this.sharedChorusLfo.start();
    }

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }

    return this.audioContext;
  }

  /**
   * Loads the sound list JSON and pre-buffers all audio files into memory using Web Audio API.
   */
  async initAndPreloadSounds(prioritySounds: string[] = []): Promise<void> {
    if (!this.isBrowser) return;

    try {
      this.isPreloading.set(true);
      const data = await firstValueFrom(
        this.http.get<{ sounds: string[] }>('assets/sounds/soundList.json')
      );

      const sounds = (data?.sounds ?? []).slice().sort((a, b) => a.localeCompare(b));
      this.availableSounds.set(sounds);
      this.totalCount.set(sounds.length);

      this.ensureAudioContext();

      // Load priority (active track) sounds first so immediate playback is ready
      const uniquePriority = prioritySounds.filter(
        (s) => s !== SYNTH_SOUND_ID && sounds.includes(s)
      );
      await Promise.all(uniquePriority.map((sound) => this.preloadSound(sound)));

      // Load remaining sounds in small parallel batches
      const remaining = sounds.filter((s) => !uniquePriority.includes(s));
      const batchSize = 6;
      for (let i = 0; i < remaining.length; i += batchSize) {
        const batch = remaining.slice(i, i + batchSize);
        await Promise.all(batch.map((sound) => this.preloadSound(sound)));
      }
    } catch (err) {
      console.error('Error loading sound list:', err);
    } finally {
      this.isPreloading.set(false);
    }
  }

  /**
   * Fetches and decodes a single sound file into an AudioBuffer.
   */
  async preloadSound(soundName: string): Promise<AudioBuffer | null> {
    if (!this.isBrowser || !soundName || soundName === SYNTH_SOUND_ID) return null;

    if (this.bufferCache.has(soundName)) {
      return this.bufferCache.get(soundName)!;
    }

    if (this.pendingLoads.has(soundName)) {
      return this.pendingLoads.get(soundName)!;
    }

    const loadPromise = (async () => {
      try {
        const ctx = this.ensureAudioContext();
        if (!ctx) return null;

        const encodedPath = `assets/sounds/${encodeURIComponent(soundName)}`;
        const response = await fetch(encodedPath);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${soundName}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        this.bufferCache.set(soundName, audioBuffer);
        this.loadedCount.set(this.bufferCache.size);
        return audioBuffer;
      } catch (error) {
        console.warn(`Failed to load sound (${soundName}):`, error);
        return null;
      } finally {
        this.pendingLoads.delete(soundName);
      }
    })();

    this.pendingLoads.set(soundName, loadPromise);
    return loadPromise;
  }

  /**
   * Returns current hardware Web Audio clock timestamp in seconds for sample-accurate scheduling.
   */
  getAudioTime(): number {
    const ctx = this.ensureAudioContext();
    return ctx ? ctx.currentTime : 0;
  }

  /**
   * Plays a pre-buffered sample sound with zero latency via Web Audio API,
   * or triggers a default 4-OSC synth note if SYNTH_SOUND_ID is passed.
   */
  playSound(
    soundName: string,
    volume = 1.0,
    effects?: TrackEffects,
    when = 0,
    synthPatch?: SynthPatch
  ): void {
    if (!this.isBrowser || !soundName) return;

    if (soundName === SYNTH_SOUND_ID) {
      this.playSynthNote(60, 0.28, volume, synthPatch, effects, when);
      return;
    }

    const ctx = this.ensureAudioContext();
    if (!ctx || !this.compressorNode) return;

    const cachedBuffer = this.bufferCache.get(soundName);
    if (cachedBuffer) {
      this.triggerBuffer(ctx, cachedBuffer, volume, effects, when);
    } else {
      this.preloadSound(soundName).then((buffer) => {
        if (buffer) {
          this.triggerBuffer(ctx, buffer, volume, effects, 0);
        }
      });
    }
  }

  /**
   * 4-OSC Professional Subtractive Polyphonic Synthesizer Engine.
   * Sample-accurate scheduling with chronological ADSR/VCF envelopes and clean step retriggering.
   */
  playSynthNote(
    midiNote: number,
    gateDurationSec = 0.25,
    volume = 0.9,
    patch?: SynthPatch,
    effects?: TrackEffects,
    when = 0,
    voiceGroupId = 'default-synth'
  ): void {
    if (!this.isBrowser) return;

    const ctx = this.ensureAudioContext();
    if (!ctx || !this.compressorNode) return;

    const synth = patch ?? createDefaultSynthPatch();
    const now = ctx.currentTime;
    const startTime = when > now ? when : now;

    const baseFreq = midiToFreq(midiNote);
    const activeOscs = synth.oscillators.filter((o) => o.enabled && o.level > 0.001);
    if (activeOscs.length === 0) return;

    // Cleanly choke any lingering release tails from PREVIOUS steps on the same synth track
    // while allowing simultaneous chord notes (same startTime) to play in full polyphony.
    const existingVoices = this.activeSynthVoices.get(voiceGroupId) ?? [];
    const remainingVoices: ActiveSynthVoice[] = [];
    for (const v of existingVoices) {
      if (v.stopTime <= startTime) continue;
      if (v.startTime < startTime - 0.003) {
        try {
          v.vcaNode.gain.cancelScheduledValues(startTime);
          v.vcaNode.gain.setTargetAtTime(0.0001, startTime, 0.003);
        } catch {
          // Ignore already completed envelopes
        }
      } else {
        remainingVoices.push(v);
      }
    }

    // ADSR Envelope Parameters (strictly chronological so decay never exceeds noteOffTime)
    const rawAttack = Math.max(0.002, Math.min(2.0, synth.attack || 0.004));
    const rawDecay = Math.max(0.015, Math.min(2.5, synth.decay || 0.2));
    const sustain = Math.max(0.0, Math.min(1.0, synth.sustain ?? 0.55));
    const release = Math.max(0.015, Math.min(3.5, synth.release || 0.14));
    const gate = Math.max(0.045, gateDurationSec);

    const effectiveAttack = Math.min(rawAttack, Math.max(0.002, gate * 0.55));
    const attackEnd = startTime + effectiveAttack;
    const noteOffTime = startTime + Math.max(gate, effectiveAttack + 0.012);
    const availableDecayTime = Math.max(0.005, noteOffTime - attackEnd);
    const effectiveDecay = Math.min(rawDecay, availableDecayTime);
    const decayEnd = attackEnd + effectiveDecay;
    const stopTime = noteOffTime + release + 0.04;

    // Normalize per-voice gain so 4 simultaneous oscillators don't clip
    const oscNormalization = 1 / Math.max(1, Math.sqrt(activeOscs.length));
    const peakGain =
      Math.max(0, Math.min(1.5, volume)) *
      Math.max(0.1, Math.min(1.3, synth.masterGain ?? 0.85)) *
      oscNormalization *
      0.55;

    // VCA ADSR Envelope Node (strictly ordered timestamps: startTime < attackEnd <= decayEnd <= noteOffTime < stopTime)
    const vcaNode = ctx.createGain();
    const safePeak = Math.max(0.001, peakGain);
    const sustainLevel = Math.max(0.0005, safePeak * sustain);

    // For fast rhythmic attacks (<= 15ms), start with a punchy initial floor so transient aligns at t=0 with drums
    const initialFloor = effectiveAttack <= 0.015 ? Math.max(0.0002, safePeak * 0.18) : 0.0001;
    vcaNode.gain.setValueAtTime(initialFloor, startTime);
    vcaNode.gain.linearRampToValueAtTime(safePeak, attackEnd);
    vcaNode.gain.exponentialRampToValueAtTime(sustainLevel, decayEnd);
    if (noteOffTime > decayEnd + 0.001) {
      vcaNode.gain.setValueAtTime(sustainLevel, noteOffTime);
    }
    vcaNode.gain.exponentialRampToValueAtTime(0.0001, noteOffTime + release);

    remainingVoices.push({ startTime, stopTime, vcaNode });
    this.activeSynthVoices.set(voiceGroupId, remainingVoices);

    // VCF Resonant Filter + Filter Envelope Modulation
    const vcfNode = ctx.createBiquadFilter();
    vcfNode.type = synth.filterType || 'lowpass';
    const baseCutoff = Math.max(30, Math.min(19000, synth.filterCutoff || 3800));
    const envMod = synth.filterEnvAmount ?? 2000;
    const peakCutoff = Math.max(30, Math.min(19500, baseCutoff + envMod));
    const sustainCutoff = Math.max(
      30,
      Math.min(19500, baseCutoff + envMod * sustain * 0.5)
    );

    if (effectiveAttack <= 0.015) {
      // Fast attack: snap filter open immediately at startTime so bright transient hits with the drums
      vcfNode.frequency.setValueAtTime(peakCutoff, startTime);
    } else {
      vcfNode.frequency.setValueAtTime(baseCutoff, startTime);
      vcfNode.frequency.linearRampToValueAtTime(peakCutoff, attackEnd);
    }
    vcfNode.frequency.exponentialRampToValueAtTime(sustainCutoff, decayEnd);
    if (noteOffTime > decayEnd + 0.001) {
      vcfNode.frequency.setValueAtTime(sustainCutoff, noteOffTime);
    }
    vcfNode.frequency.exponentialRampToValueAtTime(
      baseCutoff,
      noteOffTime + release
    );
    vcfNode.Q.setValueAtTime(
      Math.max(0.5, Math.min(20, synth.filterResonance || 2.0)),
      startTime
    );

    vcfNode.connect(vcaNode);

    // Spawn each enabled Oscillator (OSC 1 .. OSC 4)
    for (const oscCfg of activeOscs) {
      const osc = ctx.createOscillator();
      osc.type = oscCfg.waveform || 'sawtooth';

      const totalSemitones =
        (oscCfg.octave || 0) * 12 + (oscCfg.semitone || 0);
      const oscFreq = Math.max(
        20,
        Math.min(19500, baseFreq * Math.pow(2, totalSemitones / 12))
      );
      osc.frequency.setValueAtTime(oscFreq, startTime);
      osc.detune.setValueAtTime(oscCfg.detune || 0, startTime);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(
        Math.max(0, Math.min(1, oscCfg.level)),
        startTime
      );

      osc.connect(oscGain);

      if (typeof ctx.createStereoPanner === 'function' && oscCfg.pan) {
        const panner = ctx.createStereoPanner();
        panner.pan.setValueAtTime(
          Math.max(-1, Math.min(1, oscCfg.pan)),
          startTime
        );
        oscGain.connect(panner);
        panner.connect(vcfNode);
      } else {
        oscGain.connect(vcfNode);
      }

      osc.start(startTime);
      osc.stop(stopTime);
    }

    // Route synth voice output through the channel's 5-unit FX chain
    this.routeThroughTrackEffects(
      ctx,
      vcaNode,
      effects,
      startTime,
      stopTime - startTime,
      volume
    );
  }

  private triggerBuffer(
    ctx: AudioContext,
    buffer: AudioBuffer,
    volume: number,
    effects: TrackEffects | undefined,
    when: number
  ): void {
    const now = ctx.currentTime;
    const startTime = when > now ? when : now;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const trackGain = ctx.createGain();
    const clampedVol = Math.max(0, Math.min(1.5, volume));
    trackGain.gain.setValueAtTime(clampedVol, startTime);

    source.connect(trackGain);

    this.routeThroughTrackEffects(
      ctx,
      trackGain,
      effects,
      startTime,
      buffer.duration,
      clampedVol
    );

    source.start(startTime);
  }

  /**
   * High-performance per-channel DSP FX Chain using persistent Send Buses for Delay & Reverb:
   * - Low Cut & High Cut use ultra-lightweight BiquadFilters per voice
   * - Chorus uses a single shared LFO oscillator
   * - Delay & Reverb feed into persistent shared Aux Send Buses (zero per-hit FFT Convolver creation or feedback loop leaks!)
   */
  private routeThroughTrackEffects(
    ctx: AudioContext,
    inputNode: AudioNode,
    effects: TrackEffects | undefined,
    startTime: number,
    signalDuration: number,
    volumeForMeter: number
  ): void {
    let currentNode: AudioNode = inputNode;
    const nodesToCleanup: AudioNode[] = [inputNode];

    // 1. LOW CUT (High-Pass Filter)
    if (effects?.lowCutEnabled) {
      const lowCutFilter = ctx.createBiquadFilter();
      lowCutFilter.type = 'highpass';
      const freq = Math.max(20, Math.min(2000, effects.lowCutFreq || 120));
      lowCutFilter.frequency.setValueAtTime(freq, startTime);
      lowCutFilter.Q.setValueAtTime(0.707, startTime);
      currentNode.connect(lowCutFilter);
      currentNode = lowCutFilter;
      nodesToCleanup.push(lowCutFilter);
    }

    // 2. HIGH CUT (Low-Pass Filter)
    if (effects?.highCutEnabled) {
      const highCutFilter = ctx.createBiquadFilter();
      highCutFilter.type = 'lowpass';
      const freq = Math.max(200, Math.min(20000, effects.highCutFreq || 8000));
      highCutFilter.frequency.setValueAtTime(freq, startTime);
      highCutFilter.Q.setValueAtTime(0.707, startTime);
      currentNode.connect(highCutFilter);
      currentNode = highCutFilter;
      nodesToCleanup.push(highCutFilter);
    }

    // 3. CHORUS (Uses persistent shared LFO oscillator)
    if (effects?.chorusEnabled && effects.chorusMix > 0) {
      const chorusOut = ctx.createGain();
      const dryGain = ctx.createGain();
      const wetGain = ctx.createGain();

      const mix = Math.max(0, Math.min(1, effects.chorusMix));
      dryGain.gain.setValueAtTime(1 - mix * 0.35, startTime);
      wetGain.gain.setValueAtTime(mix, startTime);

      const chorusDelay = ctx.createDelay(0.08);
      chorusDelay.delayTime.setValueAtTime(0.016, startTime);

      const lfoDepthGain = ctx.createGain();
      const depthSec =
        (Math.max(0, Math.min(100, effects.chorusDepth ?? 45)) / 100) * 0.006;
      lfoDepthGain.gain.setValueAtTime(depthSec, startTime);

      if (this.sharedChorusLfo) {
        this.sharedChorusLfo.frequency.setValueAtTime(
          Math.max(0.1, Math.min(8, effects.chorusRate || 1.8)),
          startTime
        );
        this.sharedChorusLfo.connect(lfoDepthGain);
      }
      lfoDepthGain.connect(chorusDelay.delayTime);

      currentNode.connect(dryGain);
      dryGain.connect(chorusOut);

      currentNode.connect(chorusDelay);
      chorusDelay.connect(wetGain);
      wetGain.connect(chorusOut);

      currentNode = chorusOut;
      nodesToCleanup.push(chorusOut, dryGain, wetGain, chorusDelay, lfoDepthGain);
    }

    // Connect core dry/filtered/chorused signal to Master Compressor
    currentNode.connect(this.compressorNode!);

    // 4. DELAY (Routes into Persistent Shared Delay Bus — zero feedback loop leak)
    if (effects?.delayEnabled && effects.delayMix > 0) {
      const delayTime = Math.max(0.04, Math.min(1.5, effects.delayTime || 0.25));
      const feedback = Math.max(0, Math.min(0.85, effects.delayFeedback ?? 0.35));
      const sharedDelay = this.getOrCreateSharedDelayBus(ctx, delayTime, feedback, startTime);

      const delaySendGain = ctx.createGain();
      delaySendGain.gain.setValueAtTime(
        Math.max(0, Math.min(1, effects.delayMix)),
        startTime
      );

      currentNode.connect(delaySendGain);
      delaySendGain.connect(sharedDelay.input);
      nodesToCleanup.push(delaySendGain);
    }

    // 5. REVERB (Routes into Persistent Shared Convolver Bus — 1 FFT engine total instead of 1 per hit!)
    if (effects?.reverbEnabled && effects.reverbMix > 0) {
      const decay = Math.max(0.2, Math.min(4.5, effects.reverbDecay || 1.6));
      const sharedConvolver = this.getOrCreateSharedConvolver(ctx, decay);

      const reverbSendGain = ctx.createGain();
      reverbSendGain.gain.setValueAtTime(
        Math.max(0, Math.min(1, effects.reverbMix)),
        startTime
      );

      currentNode.connect(reverbSendGain);
      reverbSendGain.connect(sharedConvolver);
      nodesToCleanup.push(reverbSendGain);
    }

    // Automatically disconnect temporary per-voice nodes after playback completes to free Web Audio graph
    const lookaheadOffsetSec = Math.max(0, startTime - ctx.currentTime);
    const cleanupMs = Math.max(
      250,
      Math.ceil((lookaheadOffsetSec + signalDuration + 0.15) * 1000)
    );
    setTimeout(() => {
      for (const node of nodesToCleanup) {
        try {
          node.disconnect();
        } catch {
          // Ignore already disconnected nodes
        }
      }
    }, cleanupMs);

    // Update visual peak meter signal
    const effectivePeak = Math.min(
      100,
      Math.round(volumeForMeter * this.masterVolume() * 100)
    );
    this.peakLevel.set(effectivePeak);
    if (this.meterTimeout) clearTimeout(this.meterTimeout);
    this.meterTimeout = setTimeout(() => {
      this.peakLevel.set(0);
    }, 140);
  }

  /**
   * Returns a persistent shared Delay feedback bus so circular feedback nodes are never leaked per hit.
   */
  private getOrCreateSharedDelayBus(
    ctx: AudioContext,
    delayTime: number,
    feedback: number,
    startTime: number
  ): SharedDelayBus {
    const key = 'shared-delay-main';
    let bus = this.sharedDelayBuses.get(key);

    if (!bus) {
      const input = ctx.createGain();
      const delayNode = ctx.createDelay(2.0);
      const feedbackGain = ctx.createGain();
      const dampingFilter = ctx.createBiquadFilter();
      dampingFilter.type = 'lowpass';
      dampingFilter.frequency.setValueAtTime(3600, startTime);

      input.connect(delayNode);
      delayNode.connect(dampingFilter);
      dampingFilter.connect(feedbackGain);
      feedbackGain.connect(delayNode);

      delayNode.connect(this.compressorNode!);

      bus = { input, delayNode, feedbackGain };
      this.sharedDelayBuses.set(key, bus);
    }

    bus.delayNode.delayTime.setTargetAtTime(delayTime, startTime, 0.015);
    bus.feedbackGain.gain.setTargetAtTime(feedback, startTime, 0.015);
    return bus;
  }

  /**
   * Returns a persistent shared ConvolverNode for the requested decay duration.
   * All hits with the same decay share a single FFT ConvolverNode in the audio graph!
   */
  private getOrCreateSharedConvolver(
    ctx: AudioContext,
    decaySeconds: number
  ): ConvolverNode {
    const quantizedDecay = Math.round(decaySeconds * 4) / 4; // 0.25s steps
    const cacheKey = `${ctx.sampleRate}-${quantizedDecay.toFixed(2)}`;

    const existingNode = this.sharedConvolverNodes.get(cacheKey);
    if (existingNode) return existingNode;

    const sampleRate = ctx.sampleRate;
    // Cap effective convolution tail to keep FFT partitions fast while preserving lush decay
    const effectiveDecay = Math.min(2.8, quantizedDecay);
    const length = Math.max(1, Math.floor(sampleRate * effectiveDecay));
    const impulse = ctx.createBuffer(2, length, sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        const norm = i / length;
        const envelope = Math.pow(1 - norm, 2.6);
        channelData[i] = (Math.random() * 2 - 1) * envelope * 0.55;
      }
    }

    const convolver = ctx.createConvolver();
    convolver.buffer = impulse;
    convolver.connect(this.compressorNode!);

    this.sharedConvolverNodes.set(cacheKey, convolver);
    return convolver;
  }

  setMasterVolume(volume: number): void {
    const clamped = Math.max(0, Math.min(1, volume));
    this.masterVolume.set(clamped);

    if (this.masterGainNode && this.audioContext) {
      this.masterGainNode.gain.setTargetAtTime(
        clamped,
        this.audioContext.currentTime,
        0.015
      );
    }
  }

  isSoundBuffered(soundName: string): boolean {
    if (soundName === SYNTH_SOUND_ID) return true;
    return this.bufferCache.has(soundName);
  }

  extractCategory(soundName: string): string {
    if (soundName === SYNTH_SOUND_ID) return 'Synthesizer';
    return soundName.replace(/\s*\d+\.wav$/i, '').trim();
  }
}
