# 核心验证记录（2026-10-18）

## 范围

已阅读原有 `AGENTS.md`、全部 `docs/`、`README.md`、前端源码、脚本、Tauri/Rust 源码和配置；在原工程上修复，没有替换工程。`node_modules`、锁文件、构建产物属于生成内容，不作为手写源码逐行审阅。核心验证时目录尚未初始化 Git，因此当时未进行提交。

本版仅钢琴，不扩展其他乐器、音轨编辑、混响、PDF/图片识别。源文件的 part/track 信息保留，所有可演奏音符统一使用钢琴。后续音色修订已加入默认 Yamaha C5 实录采样；用户也可导入本地 SoundFont，合成音仅作异常备用。以下核心稳定性记录保留当时状态，最新音色检查见文末。

## 命令结果

| 检查 | 结果 |
| --- | --- |
| `npm install` | 完成并生成 `package-lock.json` |
| 首次 `npm test` | 原有 4 项通过 |
| 首次 `npm run build` | 通过，本地 worklet 正确复制 |
| 最终 `npm test` | 7 个测试文件、47 项通过 |
| 最终 `npm run build` | TypeScript 检查与 Vite 生产构建通过 |
| `npm audit` | 0 项漏洞；初始 3 项开发依赖漏洞已通过更新 Vitest 解决 |
| `npm run tauri info` | Tauri 2、WebView2 已识别；Rust/Cargo/rustup、MSVC/Windows SDK 缺失 |
| Tauri CLI 本地 JSON Schema 校验 | 通过，图标文件存在 |
| `cargo check`（`src-tauri` 下） | 无法执行，找不到 `cargo` |
| `npm run tauri build -- --no-bundle` | 失败：`cargo metadata ... program not found` |
| 本地 Audiveris/Java 探测 | 未找到可用安装；未进行真实识谱 |

未生成或验证 Windows EXE/NSIS 安装包，也未完成干净 Windows 机器的断网安装验收。Tauri 配置现在使用本地图标、离线 WebView2 安装器和限制外部连接的 CSP。

## 已修复并覆盖的行为

- 88 键：52 白键、36 黑键、A0–C8；1080、1280、1500 px 宽窗口中两个端点均可见。
- 电脑键盘按下时记录实际音高，切八度后松键仍释放原音；保留 Ctrl/Alt/Meta 和可编辑控件行为。
- 指针按下/释放/取消/捕获丢失和窗口失焦成对处理；同音高的鼠标、键盘、自动演奏分别计数。
- 音频初始化尚未完成时松键或停止，不再留下迟到的长音。
- 音频时钟驱动播放，显示刷新单独进行；暂停准确保存位置，播放中跳转和变速保持播放。
- 重复/重叠音符按实例释放；时间轴只高亮当前时间内的音符，不高亮整首曲目的全部同音高事件。
- 时间轴横向滚动后跳转不再重复加上滚动偏移。
- SoundFont 合成器连接到输出，关闭效果；加载失败保留原可用音源，超时明确报错。
- 传给 worklet 的是音源副本，原始数据仍可存入 IndexedDB；保存失败和加载失败分别提示。
- 修复 MusicXML 误把调号再次套用到 `pitch/alter` 的音高错误，以及弱起小节填充导致的额外停顿。
- MIDI 保留速度图转换后的秒数、原始非零时值和力度；MusicXML 支持速度图、匹配延音线、带点节拍器和显式编码的连音时值。
- MXL 声明的主文件缺失时明确报错，不选取无关 XML 冒充主谱。
- 未支持的复杂记谱在界面显示提示；非法 XML、节拍、时间偏移和微分音给出错误。
- Audiveris 返回失败、没有输出、输出无法解析时，界面不会显示识谱完成。该项为桥接失败路径测试，不能等同于真实 OMR 运行验证。

## 真实浏览器检查

通过 Playwright CLI 驱动本机 Edge，无需云端服务：

1. 8 个按键同时按下，显示 8 个活跃音；全部松开后归零。
2. 鼠标与键盘同时按住 C4，先释放键盘时鼠标音继续，松开鼠标后归零。
3. 导入真实文件夹具：`piano-tempo.mid`（4 音符）、`piano-basic.musicxml`（6 音符）、`piano-basic.mxl`（6 音符），逐一执行播放/暂停/停止。
4. 加载 `synthetic-test.sf2` 和 `.dls`，刷新后从 IndexedDB 恢复；断网后仍可播放。
5. 实际音频图中 SF2 发声 RMS 约 0.0294，停止后 RMS 为 0。仅验证信号链路，不代表音色质量或实测延迟。
6. 生产预览使用与 Tauri 相同的 release CSP，SF2 实际输出 RMS 约 0.0279；浏览器断网后导入 MXL 并播放，页面错误 0、外部请求 0。

截图：`output/playwright/piano-workbench.png`、`output/playwright/production-offline.png`。
重放脚本：同目录下 `ui-smoke.cjs`、`audio-offline.cjs`、`production-smoke.cjs`；由 `playwright-cli run-code --filename ...` 执行，开发地址 1420，生产预览地址 1421。它们属于本次检查记录，不是应用运行依赖。

## 夹具及音源边界

`tests/fixtures` 的 MusicXML/MIDI/MXL 都是小型人工构造乐谱；期望音高与时间由测试给定。`synthetic-test.sf2` 和 `.dls` 是项目自行通过正弦函数生成的测试音，不是录制钢琴采样，不进入 `public/` 或 `dist/`。可用 `node scripts/create-test-assets.mjs` 重新生成测试音源及 MXL。

SF3 实际文件、真实高品质钢琴音源试听、大型乐谱、重负载调度精度、不同物理键盘的硬件 rollover、Windows 桌面音频/文件对话框、干净机器离线安装、Audiveris 真实输出仍需后续检查。现有调度是基于音频时钟的可取消定时器，不宣称达到采样级精度。

## 运行

```powershell
cd D:\piano-atelier
npm run dev
```

打开终端显示的本地地址；内置演示使用 Yamaha C5 录音即可直接播放。点击“使用内置实录钢琴”可清除之前的自定义音源选择。合法授权的录音在安装/构建阶段准备并离线打包，运行时不下载远程音源。

## 后续音色修订：真实钢琴录音

默认音源已由三角波/正弦波预览换为 Salamander Grand Piano V3（Alexander Holm，CC BY 3.0）的四档力度立体声录音。120 个 Ogg 文件总计 20,166,059 字节；音频流保持原样，文件名将 `#` 改成 `s` 以避免 Vite 预览返回 HTML 代替升号采样的实际故障。具体来源与授权见 `PIANO_SAMPLES_LICENSE.md`。

新增 `SampledPiano`、采样配置、准备脚本、启动恢复策略和对应测试；原 SoundFont 工作流保留。启动预热常用层，播放前预热前四秒的实际音符，解码缓存上限 192 MiB（活跃声部额外持有的缓冲另计）。未缓存层的首次解码仍可能产生延迟，尚未进行重负载性能认证。

最终检查：`npm test` 60 项通过，`npm run build` 通过，`npm audit` 0 漏洞。生产预览启用原 CSP，在 Edge 中测得 A0/C2/C4/C7/C8 均输出双声道且非零 RMS；对应录音时长约 25.69/22.28/15.72/4.49/3.60 秒。八键并发、三个导入格式播放和已预热采样的断网播放通过，外部请求 0、页面错误 0。试听片段为 `output/playwright/yamaha-c5-register-preview.wav`，不等同于用户的主观音质验收。


## 多乐器与两种播放模式修订

本节更新前文钢琴阶段的边界：已实际验证内置 SF3，不再跳过 MIDI 鼓轨或钢琴音域外的 MIDI 音符。新增功能不代表已还原 MIDI 的全部表达控制器。

- 代码：`instruments.ts` 统一管理模式和乐器；`InstrumentBank.ts` 独立加载本地 GM 音源并按音轨/乐器分配通道。`PlaybackScheduler` 把完整音符元数据交给引擎，UI 不承担调度。
- 资产：MuseScore General 0.2 SF3 39,900,972 字节，MIT，完整许可随构建保留；构建脚本验证 SHA-256。来源见 `INSTRUMENT_SAMPLES_LICENSE.md`。钢琴保持原 Yamaha C5 路径。
- `npm test`：73 项通过；含格式 0 内乐器变化、六轨 GM/鼓组导入、全 MIDI 音域、统一配器、独立同音释放、超过 16 音轨、音源失败重试、切换失败及演示入口。
- `npm run build`：TypeScript 和生产构建通过。新演示 MIDI 以独立本地文件输出，避免 Vite 把小文件内嵌后被 `connect-src 'self'` 拦截的真实故障。
- `npm audit`：0 vulnerabilities。
- Edge / 生产预览 1421，使用正式 CSP：吉他、贝斯、小提琴、弦乐、鼓组在按下对应琴键后测得 RMS 约 0.0168、0.0462、0.0140、0.0124、0.0121，均有实际输出。RMS 只验证发声，不代表主观音质评分。
- 六轨 `band-demo.mid` / 内置“多轨演示”：24 个事件，6 个音轨，正确显示原始乐器与鼓组；播放、约 0.34 秒暂停后续播、停止均通过。已加载资产后屏蔽浏览器网络，切换试听乐器及播放通过。外部请求 0、页面异常 0、停止后高亮 0。
- 额外检查：多轨播放停止后 0.25 秒测得输出 RMS 0；导入自有合成测试 SF2 后多轨模式仍可播放，恢复 Yamaha C5 后钢琴模式正确恢复。此检查没有控制台错误。
- 记录：`output/playwright/multi-instrument-smoke.cjs`、`multi-instrument-demo-smoke.cjs`；截图 `multi-instrument-final.png`，均为本地检查记录，不是运行依赖。
- 仍未认证：大型复杂 MIDI 的负载/精度、GM 之外的 GS/XG 音色库、MIDI 控制器/弯音表达、MusicXML 配器、原生桌面/干净 Windows 离线安装和真实 Audiveris 识谱。Rust 源码未改动，当前缺 Rust/Cargo 与 MSVC/Windows SDK，无法补做桌面构建。
