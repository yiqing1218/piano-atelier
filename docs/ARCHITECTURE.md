# Architecture

## Layers

- **UI (`src/App.tsx`, `src/components`)**: import, transport, timeline, keyboard and status.
- **Music normalization (`src/lib/music`)**: MIDI/MusicXML/MXL inputs become `NoteEvent[]`.
- **Audio (`src/lib/audio`)**: `PianoEngine` abstracts SoundFont playback and the fallback synthesizer; `PlaybackScheduler` schedules events and exposes position callbacks.
- **Local OMR (`src-tauri/src/lib.rs`)**: runs an explicitly configured Audiveris executable in batch/export mode and returns a local MusicXML/MXL path.
- **Persistence (`src/lib/storage`)**: IndexedDB stores the user-selected soundfont locally.

## Canonical event model

Each note is represented by:
- `midi`: integer MIDI note number 0–127; the physical screen keyboard remains 21=A0 through 108=C8.
- `start`: start time in seconds.
- `duration`: duration in seconds.
- `velocity`: normalized 0..1.
- `track`: optional source track/part index.
- `id`: stable per-import identifier.

All file formats must normalize to this model before playback. Rendering must not be the source of truth for timing.

## Offline audio

The default is `SampledPiano`: local stereo Salamander Yamaha C5 recordings, played using AudioBufferSourceNode. `spessasynth_lib` remains the optional user-imported SoundFont/DLS synthesis adapter, with a locally bundled worklet. If both the bundled samples and selected imported font are unavailable, the oscillator fallback is explicitly labelled as a degraded preview, not a realistic piano.

### Built-in acoustic piano (2026-10-18 audio revision)
- `pianoSamples.json` defines 30 recorded root pitches A0–C8 and four original velocity layers (4/8/12/16, out of the source's 16). Nearest recorded roots fill the 88-key range with at most one semitone of interpolation.
- Source: Salamander Grand Piano V3 / Alexander Holm, CC BY 3.0. Exact npm packages are pinned to 1.0.5. `scripts/prepare-piano-samples.mjs` copies 120 unchanged Ogg streams (~20.2 MB) from installed dependencies into local build assets. Sharp filenames use `s` to avoid local static-server URL-fragment problems.
- Native Web Audio decoding retains stereo and recorded attack/decay. No oscillator partials, EQ, reverb or chorus are added in sampled mode. Velocity selects real recording layers as well as level scaling.
- Warm the default velocity layer on startup and notes in the first four seconds before transport starts. Other samples decode on demand. A 192 MiB LRU bounds cached decoded buffers; active/releasing voices can temporarily retain additional buffers. First use of an uncached layer can add decode latency; this is not a sample-accurate streaming instrument.
- Each sampled voice owns its independent source and release. High treble keys can retain their natural tails; transport cancellation stops all playback-owned tails without cutting manually held notes. Panic/stop stops every sampled voice.
- Startup uses a saved user font if valid, otherwise the built-in recordings. This project's synthetic test fixture names are excluded from automatic restoration. “使用内置实录钢琴” also clears the old saved selection. User import remains available.
- `docs/PIANO_SAMPLES_LICENSE.md` and upstream packaging notices are copied alongside distributed samples; author/license credit is visible in the UI. Generated `public/piano-samples/` is ignored by Git and rebuilt from the lockfile, so the repository does not duplicate npm audio binaries.

### Multi-instrument routing (2026-10-18)
- The new user-requested scope supersedes piano-only playback. MIDI retains GM program, original channel, percussion flag, instrument name and full 0–127 pitch range. @tonejs/midi splits mixed channels/program changes into instrument tracks; seconds and tempo maps remain unchanged.
- `instruments.ts` resolves unified versus multitrack patches. `PlaybackScheduler` passes full note metadata to `PianoEngine`; UI rendering does not schedule audio. Unified mode revoices every source track including drums. Manual input always uses the selected audition instrument.
- `InstrumentBank` lazily loads the bundled MIT MuseScore General SF3 with local AudioWorklet; effects are disabled. It gives each playback track/patch and manual audition separate channels, explicitly configures drums, and matches GM presets. Missing presets/load failures report errors instead of silently claiming the right instrument.
- Piano Program 0 keeps the existing Yamaha C5/user SoundFont path. Non-piano programs use the independent GM synth, so replacing a custom piano does not erase the other instruments. Channel-aware note ownership prevents one track releasing another. Pause sends CC120 only to playback GM channels; panic/mode changes clear every voice.
- Mode/instrument switches prepare the bank before committing settings, stop playback at its current position and cancel held voices. The six-track fixture provides a runnable in-app demo.
- `scripts/prepare-instruments.mjs` checks the tracked SF3 SHA-256 and copies it plus the full license into the build. No network access occurs during preparation or playback. See `INSTRUMENT_SAMPLES_LICENSE.md`.
- Matching covers GM programs and drums, not MIDI CC/pitch bend or GS/XG banks. MusicXML instrumentation remains default piano; unified revoicing works for all supported inputs.
- The synth connects to the master gain and audio destination. Reverb and chorus processing are disabled. A replacement bank is committed only after loading succeeds; failure keeps the previous bank usable.
- The caller retains its SoundFont buffer: only a copy is transferred into the worklet, allowing IndexedDB persistence after loading.
- Each keyboard, pointer and playback voice has its own source identifier. Pending note-ons are cancelled on release/stop. Matching imported SoundFont pitches share MIDI note-off until their last input instance releases; built-in sample voices have independent release envelopes even for overlapping unisons.
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


## Track mixer, local library and export — 2026-10-18

- `instruments.ts`: 128 GM melodic options, 4 separately recorded options and standard drums. Custom recorded presets are Bank MSB 1: ukulele 24, trumpet 56, tuba 58, erhu 110. MIDI bank metadata is retained for these presets. Automatic GM trumpet/tuba use their recorded versions; explicit GM options remain available.
- `TrackMixer` / `InstrumentSelect`: grouped selectors per track, source instrumentation labels and per-track volume. Track summaries and constant option elements are cached so display-clock updates do not rebuild hundreds of options/count every note repeatedly.
- `PianoEngine`: immutable per-track overrides; manual audition remains independent. Master gain is linear (base 0.72), sampled piano tracks have separate GainNodes; synth tracks use independent channels and CC11 expression. User-imported piano channels are separated too. Live volume changes affect held sounds; instrument changes stop and preserve transport position. Source CC curves/pedals/bend are still not a complete MIDI controller sequencer.
- `songStore.ts`: separate IndexedDB `piano-atelier-library` / `songs`, without migrating or invalidating the existing soundfont store. Records contain source bytes, normalized score, import date, SHA-256 primary key and optional mode/instrument/track mix. A readwrite transaction checks the key and inserts atomically; renamed identical bytes do not create a new song. UI lists import order, supports load and deletion, and immediately persists mix updates. Removing a song does not delete the original file.
- `playlist.ts`: once/list/shuffle/one, with no immediate same-song shuffle when alternatives exist. `PlaybackScheduler` only reports natural end; the latest UI callback chooses and activates the next normalized score, avoiding stale settings. Explicit pause/stop does not advance.
- `musicExport.ts`: renderer-independent current mix resolution, standard format-1 MIDI writing with normalized absolute seconds/speed and MIDI Port metadata when needed, PCM16 stereo RIFF encoding and file save. MIDI uses bank/program/CC7/CC11 but contains no samples. Own recorded-bank metadata can be reimported; imported source controllers are still explicitly warned as unsupported.
- `renderWav.ts` / `renderWorker.ts` / `synthRender.ts`: a dedicated local Web Worker renders the same SoundFont banks with effects disabled; C5 uses the same recorded roots/layers in OfflineAudioContext. Custom piano bytes are copied to a separate bank for rendering. Events are processed at sample-frame boundaries; output is mixed with current master/track levels. Output is 44.1 kHz stereo PCM16 with five seconds of tail, and only attenuated globally if the sum would clip. A ten-minute duration guard bounds output allocations, not total sample memory. Worker termination cancels export; an aborted job never downloads a file.
- Browser saves use a Blob download; Tauri uses `dialog.save` plus raw `invoke` bytes to `write_export_file`. Path headers use URI encoding to preserve Chinese names. Rust decodes UTF-8, restricts export extensions/signatures/size to valid WAV/MIDI <=120 MB, and surfaces write errors. The capability now includes `dialog:allow-save`.
- Recorded assets are tracked source inputs, generated only by the explicitly invoked acquisition script. Ordinary build validates their manifest hash, copies local bytes/licenses, and never downloads instruments. Source revisions and individual hashes are in `assets/orchestra/manifest.json`; source caches are ignored.
- Browser downloads/rendering and source tests are verified. Actual Rust compilation/native save behavior remain unverified because Cargo and Windows build prerequisites are absent; mock IPC tests do not certify native execution.
