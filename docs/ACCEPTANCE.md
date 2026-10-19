# Acceptance criteria

## Verification record — 2026-10-18, phase 1
- `npm install`: passed; lockfile generated. Initial audit reported 3 development-tool advisories; resolved by the Vitest upgrade, final audit: 0 vulnerabilities.
- Baseline `npm test`: passed (4 tests).
- Baseline `npm run build`: passed; local SoundFont AudioWorklet copied into `dist/`.
- Tauri 2 configuration inspected: matching `main` window/capability, dialog permission, local dev URL, `../dist`, NSIS target.
- Windows WebView2 is installed. Rust/Cargo are unavailable on PATH and the default Cargo installation is absent; desktop compilation/launch/installer are **not verified**.
- This version focuses on piano-only MIDI/MusicXML/MXL playback. PDF/image recognition is optional legacy functionality; no real Audiveris result has been verified.

## P0 — MVP

### Keyboard
- [x] Exactly 88 visual keys from A0 through C8, with 52 white and 36 black keys.
- [x] Mouse press starts a note; mouse release ends it.
- [x] At least 8 simultaneous distinct notes can sound without blocking the UI.
- [x] Computer keyboard mapping is visible/documented and supports octave shifts to reach the full 88-note range.
- [x] Ctrl/Alt/Meta shortcuts are not hijacked; inputs remain editable.

### MIDI
- [x] Import `.mid` and `.midi`.
- [x] Note pitch, start, duration, velocity, and track are preserved.
- [x] Play/pause/stop/seek work.
- [x] Tempo scaling changes playback speed without changing pitch.
- [x] Playback head and active-note indicators follow playback.

### MusicXML
- [x] Import `.xml`, `.musicxml`, and `.mxl`.
- [x] Common pitched notes, rests, chords, basic divisions, key signature, time signature, and a single tempo can be parsed.
- [x] Invalid/unsupported XML gives an actionable error.
- [x] The parser must not silently pretend unsupported advanced notation is exact.

### Audio
- [x] SoundFont file can be imported from local disk and remembered locally.
- [x] No external URL is required for sound playback.
- [x] Missing SoundFont/AudioWorklet asset falls back to preview synthesis and reports the degraded mode.
- [x] Stop/pause clears scheduled timers and active notes.

### Image/PDF
- [ ] Windows desktop build can select PDF or image files.
- [ ] When Audiveris is configured, the app invokes its local CLI and only proceeds if MusicXML/MXL output exists.
- [x] When Audiveris is not configured or fails, the UI reports the exact failure and does not claim recognition succeeded.
- [x] Browser development mode clearly explains that local executable invocation requires the desktop build.

### Build
- [x] `npm test` passes.
- [x] `npm run build` passes.
- [ ] `npm run tauri dev` launches when Rust/Tauri prerequisites are installed.
- [x] Runtime network access is not needed after all app assets and dependencies have been installed/bundled.

## Manual smoke test
1. Hold C4 with the mouse and add E4/G4 using the mapped computer keys; release each input independently. A multitouch screen can use several pointers.
2. Hold several mapped computer keys and verify polyphony.
3. Shift keyboard mapping down two octaves and play low notes; shift up and play high notes.
4. Import a known MIDI file; compare note count and duration with a trusted MIDI viewer.
5. Import a small MusicXML file with both treble and bass parts.
6. Import a local SF2 soundfont and restart the app; verify it attempts to reload.
7. Optional/deferred: after installing the desktop prerequisites and Audiveris, run one clean scanned page through real OMR. A mocked bridge test does not complete this step.
8. Disconnect networking after installation and repeat the playback tests.

## Verification record — 2026-10-18, phase 2

- `npm test`: 47 tests across 7 files; `npm run build`: TypeScript + Vite build passed. `npm audit`: 0 vulnerabilities.
- Keyboard tests: exactly 88 keys / 52 white / 36 black; eight simultaneous software inputs; source-aware releases; pointer cancellation/capture loss; editable fields and Ctrl/Alt/Meta safety; original-pitch release after octave shift.
- Browser (Edge): actual keyboard/mouse interaction, overlapping mouse/keyboard pitch, MIDI/MusicXML/MXL upload + playback/pause/stop, and all keys visible at 1080 / 1280 / 1500 px widths.
- Parser fixtures: tempo-changing MIDI, short MIDI notes, multipart/voice/chord/rest/pickup MusicXML, explicit pitch/alter, tempo maps, matching ties, dotted metronome/tuplets, MXL root selection, unsupported notation warnings and invalid data errors.
- Audio: real local SF2 and DLS loading, IndexedDB restore after reload, no external requests. Original synthetic SF2 produced RMS 0.0294 in the real audio graph and RMS 0 after stop. These values prove signal routing, not acoustic piano quality.
- Production browser preview: release CSP active, SoundFont RMS 0.0279, MXL import/playback with the browser network disabled, zero page errors and zero remote requests.
- OMR negative-path UI tests: no output or invalid returned MusicXML never produces a success status. Actual Audiveris process/output remains unverified because the executable/Java installation is unavailable.
- Tauri config passes the installed CLI JSON schema; referenced icons exist; offline WebView2 installer selected. `cargo check` cannot run (`cargo` command absent); `npm run tauri build -- --no-bundle` fails at `cargo metadata` with `program not found`. Tauri info also reports missing MSVC/SDK.
- SF3 decoding is offered by the library but has not been exercised with an actual SF3 file. Clean offline Windows installation, hardware keyboard rollover and listening/latency profiling are still manual release checks.

Checked items above refer to frontend/source/browser verification only unless stated otherwise. No Windows executable or installer has been produced.

## Verification record — 2026-10-18, acoustic piano revision

- [x] Default startup uses real stereo Yamaha C5 recordings without manually importing a font.
- [x] Four recorded velocity layers choose different recordings; A0 and C8 use actual endpoint samples.
- [x] 120 audio streams (~20.2 MB) are packaged locally; generated sharp-note filenames avoid fragment/URL decoding problems. Sample/attribution bytes verified against installed upstream packages.
- [x] CC BY 3.0 author/title/source/license attribution is retained in `docs/PIANO_SAMPLES_LICENSE.md`, the UI and bundled assets. MIT packaging notices are preserved separately.
- [x] Saved user fonts remain available; invalid/known synthetic test selections revert to the real piano. “使用内置实录钢琴” clears the old default selection.
- [x] Note release during decoding cancels the pending start. Distinct same-pitch voices release independently. Stop/pause clears playback tails while preserving manually held notes.
- [x] `npm test`: 60 tests / 9 files. `npm run build`: passed. `npm audit`: 0 vulnerabilities.
- [x] Production Edge test: A0, C2, C4, C7, C8 each produced nonzero stereo output; eight concurrent keys; MIDI/MusicXML/MXL playback; warmed default-layer playback while browser networking was disabled. No remote requests or page errors.
- [x] Recorded an original test excerpt from the actual loaded buffers: `output/playwright/yamaha-c5-register-preview.wav` (9 seconds, A0 → C2 → C4 → C7 → C8). Screenshot: `output/playwright/real-piano.png`.
- [ ] Subjective listening approval by the user, physical speakers/headphones comparison, sustained heavy-load profiling and clean Windows installation remain outside the automated checks.

No additional effects were introduced. Native desktop/OMR checks remain blocked as recorded above.


## Multi-instrument revision — 2026-10-18
This user-requested scope supersedes the initial piano-only restrictions above.

- [x] Unified instrument mode: all MIDI/MusicXML/MXL events use one selected instrument, including revoicing source drum events.
- [x] Six choices: Yamaha C5 piano, acoustic steel guitar, fingered electric bass, violin, string ensemble, standard drum kit.
- [x] Multitrack mode preserves GM program/channel/percussion metadata; original MIDI channel 10 remains drums.
- [x] Preserve MIDI pitches 0–127 and format-0 channel/program changes; visual keyboard still exactly 88 keys.
- [x] Separate tracks and manual audition channels; same-pitch note-off does not release another track/instrument.
- [x] Pause/stop silences playback tails while preserving manual channels. Mode changes clear held voices and preserve transport position.
- [x] Keyboard audition in multitrack mode uses the selected audition instrument, without replacing score instrumentation.
- [x] Existing acoustic piano and custom local piano SoundFont workflow retained.
- [x] Verified MIT MuseScore General 0.2 source/license; 39,900,972 bytes bundled locally, SHA-256 checked at every build, effects disabled.
- [x] Six-track demo button works under production CSP; demo emitted as a local file, not an inlined data URL.
- [x] Source tests: `npm test` — 73 passed; `npm run build` passed; `npm audit` — 0 vulnerabilities.
- [x] Real Edge production preview: five new instrument choices produce nonzero audio RMS; six-track import/demo, pause/resume/stop, offline playback and custom-piano compatibility pass. No external requests or page errors in the instrument smoke; final demo check has no console errors and post-stop RMS 0.
- [ ] MIDI CC (volume/pan/pedal), pitch bend and GS/XG extended banks are not restored; parser warns when detected controller/pitch-bend events are omitted.
- [ ] MusicXML orchestration is not parsed; its parts default to piano in multitrack mode and can be globally revoiced in unified mode.
- [ ] Native Windows executable/installer and real Audiveris output remain unverified for the previously documented environment blockers. No Rust code changed.


## Expanded instruments, track mixer, library and exports — 2026-10-18
- [x] 133 grouped instrument options: 128 GM, four CC0 recorded variants, drums. Includes erhu, recorded trumpet/tuba/ukulele and the existing C5 piano.
- [x] Every track can independently select an instrument or restore Automatic, including converting a drum track to a pitched instrument or vice versa.
- [x] Master and per-track volume, including 0 mute, affect active notes and current export settings; changes to instruments pause and preserve position.
- [x] Imports enter a local IndexedDB song library automatically after successful parsing. SHA-256 content keys deduplicate identical/renamed files atomically. Parse failures are not stored. Quota/database errors report failure without claiming storage succeeded.
- [x] Song selection, deletion, saved track mixes and restoration across page reload. Deletion affects local records only.
- [x] Once, list loop, shuffle and single-song repeat. Real browser verified natural-end restart/switch for each loop mode.
- [x] MIDI export with timing/speed, per-track bank/program and volume; custom-bank metadata can be reimported. MIDI never claims to embed the sampled sound.
- [x] WAV export using actual local samples/fonts, current mix/speed, stereo 44.1 kHz PCM16; progress, cancellation, five-second tail and ten-minute duration guard.
- [x] Tauri save bridge and cancellation handling implemented; frontend bridge tests cover raw bytes and Chinese paths. Native execution is not certified.
- [x] `npm test`: 87 passed / 15 files. `npm run build`: passed. Runtime external requests: 0 in production Edge checks.
- [x] Production Edge: actual erhu/trumpet/tuba/ukulele output; six independent track selectors; different erhu/trumpet track assignments and 30% volume persisted across reload; duplicate import preserved row count; deletion succeeded.
- [x] Actual downloaded WAV: 7 seconds, 2 channels, 44.1 kHz, peak 6130, RMS ~0.0233. At master 0, the downloaded WAV peak/RMS are exactly zero. Cancelled rendering produced cancellation status, not success.
- [ ] `cargo check`: cannot execute, `cargo` command is absent. Windows desktop/native save dialog/installer and Audiveris remain unverified. This revision adds Rust export code; it has not been compiled here.
- [ ] Guqin/guzheng/pipa/sheng/hulusi/dizi/xiao-specific sample integration, complete expressive articulations and heavy-library performance certification remain outside this release. They are not replaced by misleading GM names.
