# Codex project instructions

## Product goal
Build a reliable Windows-first offline piano and sheet-music playback application. The screen keyboard must always cover all 88 piano keys A0–C8. Mouse and computer-keyboard input must support simultaneous notes. The app accepts MIDI, MusicXML, compressed MusicXML, PDF, and image scores.

## Non-negotiable constraints
1. No runtime CDN dependencies, remote soundfonts, or cloud OMR services.
2. Do not claim PDF/image recognition succeeded unless a local OMR process actually returned a MusicXML/MXL output file.
3. Keep audio scheduling separate from UI rendering.
4. Keep music data normalized as absolute-time note events: MIDI pitch, start seconds, duration seconds, velocity, track/part metadata.
5. Preserve keyboard rollover and modifier-key safety. Do not intercept Ctrl/Alt/Meta shortcuts.
6. Do not bundle copyrighted soundfonts without a verified redistribution license. Support user-imported local SF2/SF3/DLS assets.
7. Keep parser limitations explicit and add fixtures for any new notation feature.
8. Do not replace the existing project with a mockup or static-only UI.

## Before making changes
- Read `docs/ARCHITECTURE.md`, `docs/ACCEPTANCE.md`, and `docs/CODEX_PLAN.md`.
- Inspect the existing code before editing.
- Prefer small, testable changes.
- Run `npm test` and `npm run build`; for Rust changes, run `cargo check` from `src-tauri` when the environment permits.
- If a check cannot run due missing network/toolchain, state the exact blocker instead of claiming success.

## Engineering priorities
P0: full 88-key keyboard, polyphonic input, accurate MIDI playback, basic MusicXML/MXL parsing, offline audio engine.
P1: OMR UX and MusicXML review/correction, notation rendering, tempo maps, ties, tuplets, repeats, dynamics.
P2: WAV/MIDI export, pedal/controller support, external MIDI input, installer polish and performance profiling.

## Definition of done
A feature is done only when it has code, an acceptance test or a documented manual test, clear error handling, and no runtime network dependency.
