# Salamander Grand Piano V3 — bundled sample attribution

- Original instrument and recordings: **Salamander Grand Piano V3**, Yamaha C5 grand piano.
- Recording author / copyright holder: **Alexander Holm**.
- Audio recordings license: **Creative Commons Attribution 3.0 Unported (CC BY 3.0)**.
- License and redistribution conditions: https://creativecommons.org/licenses/by/3.0/ and https://creativecommons.org/licenses/by/3.0/legalcode
- Original source: https://archive.org/details/SalamanderGrandPianoV3
- Instrument documentation: https://sfzinstruments.github.io/pianos/salamander/
- Ogg distribution and packaging: https://github.com/darosh/samples-piano by Jan Forst.
- Exact npm packages: `@audio-samples/piano-velocity4`, `piano-velocity8`, `piano-velocity12`, `piano-velocity16`, each version **1.0.5**.

Piano Atelier distributes 120 unchanged Ogg audio streams from these four recorded velocity layers, with 30 sample pitches per layer. Filenames replace the sharp symbol `#` with `s` for local URL compatibility; the audio bytes are unchanged. The original instrument has 16 layers; this application uses four of them. Original stereo channels and recorded attacks/tails are retained. Runtime pitch interpolation fills the remaining keys A0–C8; gain scaling and release envelopes are applied during playback. No reverb or chorus is added. No audio file is transcoded, trimmed or re-recorded by this project.

The npm packaging license is MIT (Jan Forst, 2019); it does **not** replace the audio recordings' CC BY 3.0 license. The upstream package README files and MIT text are copied beside the audio files. Credit is also visible in the application. No endorsement by the recording author or Yamaha is implied.

The sample files are copied from installed, lockfile-pinned packages during development/build. The distributed app contains them locally and does not fetch audio from a CDN or Internet service. Keep this attribution with redistributed copies.
