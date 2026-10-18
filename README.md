# Piano Atelier

一个面向 Windows 的离线钢琴与乐谱自动演奏桌面应用原型。

本版专注钢琴：直接导入 MIDI、MusicXML、MXL，所有有音高声部统一使用钢琴演奏；跳过 MIDI 打击乐。PDF/图片识谱保留为可选旧接口，不是本版使用前提。没有混响或合唱效果。

2026-10-18：核心修复已完成，47 项自动化测试与浏览器冒烟检查通过。**尚未生成 Windows 安装包**：当前环境缺 Rust/Cargo、MSVC/Windows SDK。完整检查记录见 [docs/VERIFICATION.md](docs/VERIFICATION.md)，验收清单见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。

## 当前原型已经包含

- 完整 88 键屏幕钢琴（A0–C8）。
- 鼠标/触控按下发声，释放、取消、捕获丢失或窗口失焦时释放对应音符；支持多音演奏。
- 电脑键盘多行键位映射；通过八度按钮移动映射范围。
- MIDI (`.mid/.midi`) 导入与自动播放。
- MusicXML (`.xml/.musicxml`) 与压缩 MusicXML (`.mxl`) 解析，包括和弦、休止、多声部、弱起、速度变化及匹配的延音线。
- 播放/暂停、停止、进度拖动、速度调整、播放头与音符时间轴。
- 本地 SoundFont (`.sf2/.sf3/.dls`) 导入；音源会保存在浏览器 IndexedDB 中。
- 没有加载 SoundFont 时，使用合成音色作为可用的后备音色。
- Windows 桌面端保留 Audiveris 本地 OMR 调用接口；只有实际输出存在且解析通过才显示完成。本次未运行真实 Audiveris 识谱。
- 浏览器开发模式可导入 MIDI/MusicXML；图片/PDF 只显示本地预览和识谱提示。完整 OMR 调用需要桌面版。

## 尚未达到生产级的部分

- 这是一份可继续开发的 MVP 工程，不是已完成的正式安装包。
- 项目不捆绑第三方钢琴 SoundFont。请导入自己有权使用的 `.sf2/.sf3/.dls` 音源；声音质量由所用音源决定。
- 图片/PDF 识谱依赖本地安装的 Audiveris；当前识别结果还没有完整的可视化校谱编辑器。
- MusicXML 反复/跳转、装饰音、力度、踏板、移调及八度移位等尚未应用，会在界面显示提示；微分音及非法时值报错。支持范围和夹具见架构文档。
- 已用自行生成的测试音源验证 SF2、DLS 的真实输出与本地保存；SF3 尚未使用实际文件验证。最终钢琴音质需要用你自己的采样钢琴音源试听。
- 当前同步视图是音符时间轴，不是完整的出版级五线谱排版。
- WAV 导出、MIDI 导出、踏板/力度曲线编辑和实体 MIDI 键盘支持列入后续阶段。

## 开发环境

建议使用 Windows 10/11、Node.js 20 LTS 或更新的 LTS、Rust stable，以及 Microsoft C++ Build Tools。Tauri Windows 构建通常还需要 WebView2 Runtime。

### 1. 安装前端依赖

在项目根目录执行：

```powershell
npm install
```

启动开发服务或构建时，会把 `spessasynth_lib` 的 AudioWorklet 处理器复制到 `public/`，再随应用本地打包。处理器缺失时，SoundFont 加载会报错，合成预览音色仍可工作。仓库已有锁文件，后续可用 `npm ci` 安装相同依赖。

### 2. 先运行浏览器开发模式

```powershell
npm run dev
```

打开终端显示的本地地址。开发模式不需要联网访问外部 CDN，但首次 `npm install` 需要从 npm 下载依赖。

### 3. 运行 Windows 桌面版

```powershell
npm run tauri dev
```

### 4. 构建前端

```powershell
npm run build
npm test
```

### 5. 构建 Windows 安装包

```powershell
npm run tauri build
```

安装包目标为 NSIS。第一次打包需要完成 Rust 与 Tauri 构建工具的配置。

配置使用离线 WebView2 安装器：打包阶段可能下载该安装器并增大包体积，最终用户安装时不需要在线下载 WebView2。当前尚未完成真实安装验证。

## 导入高品质钢琴音源

点击左侧“加载 SoundFont”，选择自己有权使用的 `.sf2`、`.sf3` 或 `.dls` 文件。应用将音源保存在本地 IndexedDB，后续启动时会尝试重新加载。高质量多层采样钢琴音源可能占用几十到数百 MB 内存。

## 配置图片/PDF 识谱

1. 安装 Audiveris，并确认其可在本机独立运行。
2. 在左侧“本地识谱引擎”中填入 Audiveris 启动器路径，例如 `C:\...\Audiveris.bat` 或可执行文件路径。
3. 在 Windows 桌面版中导入 PDF 或清晰的乐谱图片。
4. 识别结果将导出为 MusicXML，再进入本应用的解析与播放流程。

Audiveris 命令行调用采用 `-batch -export -output ... -- input` 形式。不同版本安装方式可能不同；若启动器路径或 Java 环境不正确，应用会显示错误信息。

## 离线原则

- 正式运行时不调用云端识谱 API。
- 不使用远程 CDN 加载 JS、字体、音源或模型。
- 第三方依赖和 SoundFont 资源必须在构建/配置阶段放入本地。
- 若要发布给他人，必须逐项检查依赖、音源和识别引擎的许可证。
