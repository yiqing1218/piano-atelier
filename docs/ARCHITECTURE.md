# Architecture

## Layers

- **UI (`src/App.tsx`, `src/components`)**: import, transport, timeline, keyboard and status.
- **Music normalization (`src/lib/music`)**: MIDI/MusicXML/MXL inputs become `NoteEvent[]`.
- **Audio (`src/lib/audio`)**: `PianoEngine` abstracts SoundFont playback and the fallback synthesizer; `PlaybackScheduler` schedules events and exposes position callbacks.
- **Local OMR (`src-tauri/src/lib.rs`)**: runs an explicitly configured Audiveris executable in batch/export mode and returns a local MusicXML/MXL path.
- **Persistence (`src/lib/storage`)**: IndexedDB stores the user-selected soundfont locally.

## Canonical event model

Each note is represented by:
- `midi`: integer MIDI note number, 21=A0 through 108=C8 for the physical piano.
- `start`: start time in seconds.
- `duration`: duration in seconds.
- `velocity`: normalized 0..1.
- `track`: optional source track/part index.
- `id`: stable per-import identifier.

All file formats must normalize to this model before playback. Rendering must not be the source of truth for timing.

## Offline audio

`spessasynth_lib` is used as the SoundFont/DLS synthesis adapter. The AudioWorklet processor is copied into the local public assets during setup/build. The user supplies a legally usable soundfont; no soundfont is fetched at runtime. When the processor or soundfont is unavailable, the fallback oscillator engine keeps keyboard interaction usable, but the UI must label it as a preview sound rather than realistic piano audio.

### Piano-only core (2026-10-18)
- All pitched source parts use a single piano preset (Program 0), preserving source part/track metadata. MIDI percussion tracks and notes outside A0–C8 are skipped with visible warnings.
- The synth connects to the master gain and audio destination. Reverb and chorus processing are disabled. A replacement bank is committed only after loading succeeds; failure keeps the previous bank usable.
- The caller retains its SoundFont buffer: only a copy is transferred into the worklet, allowing IndexedDB persistence after loading.
- Each keyboard, pointer and playback voice has its own source identifier. Pending note-ons are cancelled on release/stop. Matching SoundFont pitches share MIDI note-off until their last input instance releases; independent release envelopes for overlapping unison notes are not implemented.
- Playback follows `AudioContext.currentTime`, using one cancellable event timer and a separate display timer. Pause captures the exact transport position. Seek/speed changes restart only scheduled playback voices; manual held notes remain separate. Timer-driven event dispatch is not a sample-accurate sequencer and still needs profiling under heavy load.
- Keyboard mapping remembers the pitch at key-down. Pointer up/cancel/capture loss, focus loss and document hiding release the corresponding held inputs. All 88 keys scale to the available window width.

### Parser coverage
- MIDI tempo-map conversion is provided by `@tonejs/midi`; nonzero durations and velocities are preserved without a minimum-duration clamp.
- MusicXML `score-partwise`: explicit `pitch/alter`, chords, rests, multiple parts/voices/staves, divisions, time signatures, implicit pickup bars, tempo changes, dotted metronome units and matching ties. Tuplet/dotted durations use the encoded `duration/divisions` rather than inferring display notation.
- Repeats/jumps, grace notes, dynamics, pedal, transposition, octave shifts, glissandi and tremolos are not expanded/applied and generate visible warnings. Microtones and invalid rhythmic numbers are rejected. Score-timewise is not supported.
- MXL follows its declared container root and rejects a missing declared main file. Files without a container retain the legacy XML-entry fallback.
- Fixtures live in `tests/fixtures/`; `synthetic-test.sf2` and `.dls` are original mathematical test tones, not realistic piano samples, and are not copied into `dist/`.

### Windows distribution
- Tauri 2 / NSIS, with local icon assets and `webviewInstallMode=offlineInstaller`. The WebView2 offline installer may be downloaded during packaging; the resulting installer is intended to install without networking.
- Release CSP allows local app resources and Tauri IPC, and denies external CDN/service connections. Embedded Vorbis WASM is allowed with `wasm-unsafe-eval`. Vite preview uses the same release CSP so it can be checked in a browser.
- Desktop compilation and installer validation remain blocked by missing Rust/Cargo and MSVC/Windows SDK in this environment.

## OMR

Audiveris is an optional local dependency. Tauri passes explicit input/output paths to its CLI. The app does not upload files. OMR output must be verified to exist before parsing it. The current UI exposes a path setting; future work should improve discovery, installation guidance, progress, cancellation, logs, and a correction UI.

## Security and reliability

- The Rust OMR command accepts only supported file extensions.
- Never interpolate user-provided paths into a shell command unless necessary for a `.bat` launcher; quote all paths and avoid accepting arbitrary extra CLI arguments.
- Limit error messages to actionable details; do not swallow parsing failures.
- Avoid large base64 strings for soundfonts; use IndexedDB structured-clone storage.
