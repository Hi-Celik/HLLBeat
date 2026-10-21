# 🎹 HLLBeat — Browser-Based DAW & Beatmaker Studio

![Angular](https://img.shields.io/badge/Angular-19-DD0031?style=for-the-badge&logo=angular&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Web Audio API](https://img.shields.io/badge/Web_Audio_API-Native_DSP-00B4D8?style=for-the-badge)
![Reactive Signals](https://img.shields.io/badge/State-Angular_Signals-8B5CF6?style=for-the-badge)

**HLLBeat** is a zero-latency, browser-based **Digital Audio Workstation (DAW)**, **Step Sequencer**, and **4-Oscillator Polyphonic Synthesizer** built from scratch using the native **Web Audio API** and **Angular 19 (Reactive Signals)** — without relying on any third-party audio libraries.

---

## ✨ Key Features

### 🥁 1. Step Sequencer & Drum Machine
* **16+ Step Rhythm Grid:** Real-time playhead tracking, active note counter, and visual trigger-pulse feedback.
* **Curated Studio Presets:** Instant-load rhythm templates including *Studio Groove*, *Trap 808*, *Club House*, and *Boom Bap*.
* **Live Performance Controls:** Dynamic **BPM** (Tempo) and **Swing** (Groove) controls, per-channel **Mute / Solo** and volume sliders, plus keyboard shortcuts (`Space` to play/stop, `1–9` keys for live pad triggering).
* **Preloaded Sample Library:** Categorized `.wav` audio samples (`Kick`, `Snare`, `Hi-Hat`, `Clap`, `Percussion`, `Cymbal`, etc.) with `AudioBuffer` caching and instant sound preview.

### 🎛️ 2. 4-Oscillator Subtractive Synthesizer & MIDI Piano Roll
* **4 Independent Oscillators:** Customizable waveform (`Sawtooth`, `Square`, `Sine`, `Triangle`), octave (`-2` to `+2`), semitone (`-12` to `+12`), fine detune (`-100` to `+100` cents), stereo pan, and output level per oscillator.
* **ADSR Envelope & Filter Modulation:** Real-time `Lowpass`, `Highpass`, and `Bandpass` Biquad filtering with adjustable `Cutoff`, `Resonance (Q)`, `Filter Envelope Amount`, and full `Attack / Decay / Sustain / Release` envelope shaping.
* **Interactive MIDI Piano Roll Studio:** Multi-octave (`C3 – C6`) note sequencing, adjustable note durations (`1..16` steps), per-note `Velocity` control, and scalable pattern lengths from 16 up to 128 steps.

### 🎚️ 3. Real-Time DSP Channel Effects (FX Rack)
Per-channel digital signal processing chain powered directly by native Web Audio API nodes:
* **Reverb (`ConvolverNode`):** Algorithmic impulse-response generation for lush spatial acoustics.
* **Stereo Delay:** Tempo-friendly delay bus with adjustable delay time and feedback loop prevention.
* **Chorus:** Shared free-running LFO modulation for rich stereo widening.
* **Distortion (`WaveShaperNode`):** Warm analog-style saturation and overdrive transfer curve.
* **Filter, Pitch & Stereo Pan:** Per-track tone shaping (`BiquadFilterNode`), pitch shifting (`-12` to `+12` semitones), and stereo positioning (`StereoPannerNode`).
* **Master Compressor (`DynamicsCompressorNode`):** Master bus dynamics processing for punchy drum and synth output without digital clipping.

### 🎼 4. DAW Playlist & Song Arrangement Timeline
* **Dual Playback Modes:** Loop and craft individual patterns in **Pattern Mode**, or arrange multiple patterns across a multi-track timeline in **Song Mode**.
* **Drag-and-Drop Clip Editing:** Move, resize, and duplicate pattern clips across the timeline with click-to-seek ruler navigation.
* **Loop Region Selection:** Highlight custom beat ranges on the timeline ruler (`Shift + Drag` or Loop Select tool) for focused section looping.

---

## 🛠️ Tech Stack & Architecture

| Layer | Technology / Approach |
| :--- | :--- |
| **Framework** | Angular 19 (Standalone Components, SSR Ready) |
| **State Management** | Angular Reactive `signal()` and `computed()` architecture |
| **Language** | TypeScript 5.7 |
| **Audio Engine & DSP** | Native Web Audio API (`AudioContext`, `AudioBuffer`, `OscillatorNode`, `ConvolverNode`, `BiquadFilterNode`, `WaveShaperNode`, `DynamicsCompressorNode`) |
| **Styling & UI** | Custom Dark Studio UI, CSS3 Variables & Hardware-Accelerated Animations |

---

## 📂 Project Structure

```text
HLLBeat/
├── public/                        # Preloaded WAV audio samples and static assets
├── src/
│   ├── app/
│   │   ├── components/
│   │   │   ├── sound-selector-modal/  # Category-filtered sample browser & preview modal
│   │   │   ├── synth-editor-modal/    # 4-OSC Synthesizer & MIDI Piano Roll studio
│   │   │   └── track-fx-modal/        # Per-channel DSP FX rack (Reverb, Delay, Chorus, etc.)
│   │   ├── models/
│   │   │   └── beat.model.ts          # Sequencer, Playlist, SynthPatch, and FX data models
│   │   ├── services/
│   │   │   └── audio.service.ts       # Zero-latency Web Audio API synthesis & DSP engine
│   │   ├── app.component.ts           # Core DAW, Timeline, and Sequencer orchestration
│   │   ├── app.component.html         # Studio layout and interactive templates
│   │   └── app.component.css          # Custom DAW component styling and animations
│   └── styles.css                 # Global studio theme and typography definitions
└── package.json
```

---

## 🚀 Getting Started

Make sure you have **Node.js (v18+)** installed on your machine.

```bash
# 1. Clone the repository
git clone https://github.com/Hi-Celik/HLLBeat.git

# 2. Navigate to the project directory
cd HLLBeat

# 3. Install dependencies
npm install

# 4. Start the development server
npm start
```

Open your browser and navigate to `http://localhost:4200/` to launch the studio.

### Production Build

```bash
npm run build
```
The production build artifacts will be generated and optimized in the `dist/` directory.

---

## ⌨️ Keyboard Shortcuts

* **`Space`:** Play / Stop sequencer (Pattern or Song mode)
* **`1` – `9` Keys:** Live-trigger the corresponding track pad
* **`Left / Right Arrow` Keys:** Nudge the selected playlist clip left or right by 1 beat
* **`Shift + Ruler Drag`:** Select a custom loop region on the timeline ruler
