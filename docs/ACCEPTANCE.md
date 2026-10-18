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
