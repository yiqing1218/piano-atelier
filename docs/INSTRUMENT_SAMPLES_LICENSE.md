# 多乐器音源及授权

本版新增贝斯、吉他、小提琴、弦乐和鼓组，使用 **MuseScore General 0.2（2020-05-13）**，不是 MuseSounds。

- 官方介绍及下载入口：https://musescore.org/en/handbook/3/soundfonts-and-sfz-files
- 文件：https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3
- 授权：https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General_License.md
- 本地原始文件：`assets/soundfonts/MuseScore_General.sf3`，39,900,972 字节。
- SHA-256：`5b85b6c2c61d10b2b91cddd41efcce7b25cd31c8271d511c73afafbef20b6fa3`。
- 未改动音源内容。构建脚本核验哈希并将音源及完整许可复制到 `public/instruments/`，随 `dist/` 离线分发。构建脚本和应用运行均不下载此文件。

采用上游明确给出的 MIT 授权，并保留完整声明于 `assets/soundfonts/LICENSE.md` 和打包后的 `instruments/LICENSE.md`。上游署名包括 Frank Wen（FluidR3）、Michael Cowgill（单声道转换）、S. Christian Collins（MuseScore General 改编）、Ethan Winer（Temple Blocks）、Michael Schorsch（Drumline Cymbals）。上游提供的公开版权声明按原文保留。

检索时也检查了 GeneralUser GS；其许可说明对部分早期采样来源无法完全确认，因此本工程没有打包它。

钢琴仍优先使用独立的 Salamander Yamaha C5 四档力度立体声录音，详见 `PIANO_SAMPLES_LICENSE.md`；用户导入的钢琴 SoundFont 仅替换钢琴路径，不覆盖内置多乐器音源。
