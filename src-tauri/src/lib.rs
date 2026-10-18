use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[tauri::command]
fn read_local_file(path: String) -> Result<Vec<u8>, String> {
    fs::read(&path).map_err(|error| format!("读取本地文件失败：{error}"))
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
        .invoke_handler(tauri::generate_handler![read_local_file, recognize_score])
        .run(tauri::generate_context!())
        .expect("error while running Piano Atelier");
}
