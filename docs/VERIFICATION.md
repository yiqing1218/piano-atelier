# 核心验证记录（2026-10-18）

## 范围

已阅读原有 `AGENTS.md`、全部 `docs/`、`README.md`、前端源码、脚本、Tauri/Rust 源码和配置；在原工程上修复，没有替换工程。`node_modules`、锁文件、构建产物属于生成内容，不作为手写源码逐行审阅。核心验证时目录尚未初始化 Git，因此当时未进行提交。

本版仅钢琴，不扩展其他乐器、音轨编辑、混响、PDF/图片识别。源文件的 part/track 信息保留，所有可演奏音符统一使用本地钢琴 Program 0。键盘无音源时可直接演奏预览合成音；真实钢琴音色需要自行导入合法的本地音源。

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

打开终端显示的本地地址；内置演示可直接播放。要改善钢琴音色，点击“加载 SoundFont”选择你有权使用的本地 SF2/SF3/DLS 文件。本版不下载或捆绑第三方音源。
