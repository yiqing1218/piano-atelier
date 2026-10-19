use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[tauri::command]
fn read_local_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|error| format!("读取本地文件失败：{error}"))
}

fn decode_export_path(encoded: &str) -> Result<String, String> {
    let mut bytes = Vec::with_capacity(encoded.len());
    let mut chars = encoded.as_bytes().iter().copied();
    while let Some(byte) = chars.next() {
        if byte == b'%' {
            let high = chars.next().and_then(|c| (c as char).to_digit(16));
            let low = chars.next().and_then(|c| (c as char).to_digit(16));
            match (high, low) {
                (Some(h), Some(l)) => bytes.push((h * 16 + l) as u8),
                _ => return Err("导出路径编码无效。".into()),
            }
        } else { bytes.push(byte); }
    }
    String::from_utf8(bytes).map_err(|_| "导出路径不是有效的 UTF-8。".into())
}

#[tauri::command]
fn write_export_file(request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("导出内容必须是二进制数据。".into());
    };
    let encoded = request.headers().get("x-export-path")
        .and_then(|header| header.to_str().ok()).ok_or("缺少导出路径。")?;
    let path = PathBuf::from(decode_export_path(encoded)?);
    if !path.is_absolute() { return Err("请选择完整的导出文件路径。".into()); }
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    let valid = match extension.as_str() {
        "wav" => bytes.len() >= 44 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WAVE",
        "mid" | "midi" => bytes.len() >= 14 && bytes.starts_with(b"MThd"),
        _ => false,
    };
    if !valid || bytes.len() > 120_000_000 { return Err("仅支持有效的 WAV/MIDI，单文件不能超过 120 MB。".into()); }
    fs::write(&path, bytes).map_err(|error| format!("保存导出文件失败：{error}"))
}

fn collect_musicxml_files(directory: &Path, results: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(directory).map_err(|error| format!("无法读取识谱输出目录：{error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_musicxml_files(&path, results)?;
        } else if let Some(extension) = path.extension().and_then(|value| value.to_str()) {
            let ext = extension.to_ascii_lowercase();
            if ["mxl", "musicxml", "xml"].contains(&ext.as_str())
                && path.file_name().and_then(|name| name.to_str()) != Some("container.xml")
            {
                results.push(path);
            }
        }
    }
    Ok(())
}

#[tauri::command]
fn recognize_score(
    app: tauri::AppHandle,
    input_path: String,
    executable_path: String,
) -> Result<String, String> {
    let input = PathBuf::from(&input_path);
    let executable = PathBuf::from(&executable_path);

    if !input.exists() {
        return Err("输入文件不存在或已移动。".to_string());
    }
    let extension = input.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    if !["pdf", "png", "jpg", "jpeg", "tif", "tiff", "bmp"].contains(&extension.as_str()) {
        return Err("本地 OMR 仅接受 PDF 或常见乐谱图片。".to_string());
    }
    if !executable.exists() {
        return Err("Audiveris 启动器路径不存在。请检查设置中的路径。".to_string());
    }

    let cache_dir = app.path().app_cache_dir().map_err(|error| format!("无法定位应用缓存目录：{error}"))?;
    let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis();
    let output_dir = cache_dir.join("omr").join(format!("job-{stamp}"));
    fs::create_dir_all(&output_dir).map_err(|error| format!("无法创建识谱输出目录：{error}"))?;

    let executable_string = executable.to_string_lossy().to_string();
    let status = if ["bat", "cmd"].contains(&executable.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase().as_str()) {
        // Audiveris distributions often expose a .bat launcher. Keep arguments fixed and quote paths.
        let quote = |value: &str| format!("\"{}\"", value.replace('"', ""));
        let command_line = format!(
            "\"{} -batch -export -output {} -- {}\"",
            quote(&executable_string),
            quote(&output_dir.to_string_lossy()),
            quote(&input.to_string_lossy())
        );
        Command::new("cmd.exe")
            .args(["/D", "/S", "/C", &command_line])
            .status()
    } else {
        Command::new(&executable)
            .args(["-batch", "-export", "-output"])
            .arg(&output_dir)
            .arg("--")
            .arg(&input)
            .status()
    }.map_err(|error| format!("无法启动 Audiveris：{error}"))?;

    if !status.success() {
        return Err(format!("Audiveris 退出码为 {:?}。请检查 Java 环境、启动器路径和识谱日志。", status.code()));
    }

    let mut outputs = Vec::new();
    collect_musicxml_files(&output_dir, &mut outputs)?;
    outputs.sort();
    let result = outputs.into_iter().find(|path| {
        path.extension().and_then(|value| value.to_str()).map(|ext| {
            ["mxl", "musicxml", "xml"].contains(&ext.to_ascii_lowercase().as_str())
        }).unwrap_or(false)
    });

    result.map(|path| path.to_string_lossy().to_string())
        .ok_or_else(|| "Audiveris 运行结束，但输出目录中没有找到 MusicXML/MXL 文件。请检查识谱结果或 Audiveris 版本。".to_string())
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_local_file, recognize_score, write_export_file])
        .run(tauri::generate_context!())
        .expect("error while running Piano Atelier");
}
