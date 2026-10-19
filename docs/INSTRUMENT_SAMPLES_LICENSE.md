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


## 2026-10-18：独立实录补充库（CC0）

`assets/orchestra/Recorded-Orchestra.sf2` 包含 76 段录音的转换结果，83,690,460 字节。SHA-256 为 `6cc469de391c9230b6f357e61dd14bc683972cc7a67e20b9dfcc2882cfb59c8c`。构建时验证 `manifest.json` 中的哈希并复制音源、溯源清单和三份完整许可；运行时不联网。

| 选项 | 上游及版本 | 授权 / 使用范围 |
| --- | --- | --- |
| 二胡 | https://github.com/sfzinstruments/aliexpress-erhu ，提交 `6615047b2fd06126877483e97b8bb4af9d00b080` | CC0；20 个长音录音、每半音一个、取 rr1。上游为价格低廉二胡的近距离立体声录音，并非专业连奏库。 |
| 小号、大号 | https://github.com/sgossner/VSCO-2-CE ，音频提交 `440300901dfe9275fd84e0b7763af1f8443ae62e`；映射提交 `6dd651d55dde97fd4028699be9d4481f26917891` | CC0；Sam Gossner、Simon Dalzell 录音，Elan Hickler/Soundemote 切样。小号 20、大号 23 个区域，保留上游音高/力度层映射。 |
| 尤克里里 | https://github.com/freepats/ukulele1 ，提交 `86d345f6f7b79a106ace98eca0da19b087786dba` | CC0；Mateusz Dąbrowski 录制的 Flight Fireball tenor ukulele，13 个有音高录音，保留音高/调音信息。未采用另两个敲击奏法。 |

上游许可原文保存在 `assets/orchestra/erhu-LICENSE.txt`、`vsco-LICENSE.txt`、`ukulele-LICENSE.txt`，随应用分发。详细原文件 URL、文件大小、各自 SHA-256 均在 `manifest.json` 中。

转换：读取 PCM WAV / 无损 FLAC，保留单/双声道，输出 SF2 的 PCM16；未添加混响、合唱或合成替身。依照上游 SFZ 记录的 MIDI 音高设置根音，而不从文件名推断八度。保留适用的力度区域和微调；重新设置包络释放、声像及音量以预留混音余量。超出原录音音域时使用边界样本变调。录音长度有限，不自行制作延音循环，不还原 SFZ 的轮换、颤音、滑音或连奏。

可选开发脚本 `node scripts/acquire-orchestra.mjs` 从固定提交获取源文件并生成 SF2，需要联网；它不在 `npm run build` 或应用启动链路中。下载缓存 `assets/orchestra/sources/` 被 Git 忽略，生成后的 SF2 和许可文件随源码提供，普通构建全程只读本地资产。FLAC 解码工具仅为开发依赖。

这版另开放 MuseScore General 的全部 128 个 GM 预置和标准鼓组，加上以上 4 个独立录音选项，总计 133 个可选项；不表示 133 套独立高端录音库。钢琴仍使用独立 Yamaha C5 或用户自选钢琴音源。

参考清单中的古琴、古筝、琵琶、笙、葫芦丝、中国笛子/箫等，尚未完成可再分发采样的集成；不把日本筝、民族提琴或长笛改名冒充这些乐器。GM 的扬琴、唢呐类管乐只是 GM 标准名称/类别，不宣称为专门录制的中国民乐音源。
