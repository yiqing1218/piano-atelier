# Codex implementation plan

## Current code state
The repository is a starter implementation, not a finished release. The current target is to get a functioning local prototype running before expanding notation coverage.

### 2026-10-18 core stabilization result
- Phase 1 frontend work is implemented and covered by automated tests and real Edge browser smoke checks; see `ACCEPTANCE.md` and `VERIFICATION.md` for exact results and boundaries.
- Added dependency lockfile, resolved initial npm audit advisories by updating Vitest to 4.1.12, verified frontend build and local AudioWorklet packaging.
- Fixed input source ownership, pointer cancellation, octave shifts, repeated notes, pause/resume, seek, immediate speed changes, timeline coordinates/highlighting, SoundFont audio routing and persistence.
- Extended MusicXML coverage for pickup bars, tempo maps, ties and explicit pitch semantics. Added visible unsupported-notation warnings. This completes only those items from phase 2, not full engraving or full notation support.
- This release remains piano-only. PDF/image recognition is optional existing functionality; do not expand it as part of this version. Native OMR success is not certified without a real Audiveris output.
- Windows configuration and local assets pass schema/existence validation. Actual Tauri compilation, launch and NSIS installation are blocked by missing Rust/Cargo and C++ build prerequisites; a production Windows release is not complete.

## Phase 1 — make the core stable
1. Install dependencies and run `npm test` and `npm run build`.
2. Fix all TypeScript/build errors before adding features.
3. Verify the 88-key range, white/black key geometry, keyboard mapping and octave shift.
4. Verify MIDI and MusicXML/MXL imports with small fixtures.
5. Verify scheduler cancellation, pause/resume, repeated notes, and active-note cleanup.
6. Verify SoundFont processor discovery; add a clear settings diagnostic if the processor is missing.

## Phase 2 — make it musically useful
1. Add a proper VexFlow score engraving view for MusicXML, preserving measure/voice/staff structure.
2. Improve MusicXML handling: tempo maps, ties, tuplets, grace notes, dynamics, repeats, pedal marks, transposition and multiple staves.
3. Add MIDI export and WAV rendering.
4. Add an OMR result review step and per-measure correction workflow.
5. Add MIDI device input and controller mappings.

## Phase 3 — package for offline Windows use
1. Pin dependencies and produce a reproducible lockfile.
2. Decide how to distribute the selected SoundFont; verify license and size before bundling.
3. Decide whether Audiveris is installed separately or bundled as a sidecar; verify Java/runtime redistribution obligations.
4. Add signed installer, app icon, crash logs and upgrade strategy.
5. Test on a clean Windows VM without network access.

## Codex task prompt
You are continuing Piano Atelier. Read `AGENTS.md` and all files in `docs/` first. Work in small increments. Do not create a static mockup in place of functional code. Start by installing dependencies and fixing the current project until `npm test` and `npm run build` pass. Then verify and improve the full 88-key keyboard, MIDI import/playback, MusicXML/MXL parser, SoundFont local loading and Audiveris bridge. Add tests for each behavior and update the acceptance checklist. Do not use external APIs or runtime CDNs. Never bundle an audio bank without a verified license. Report exact commands run and their results.
