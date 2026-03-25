// logger.rs Version final 25/03/2026
use chrono::Local;
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

fn app_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("vinyl-view")
}


fn log_path(filename: &str) -> PathBuf {
    let mut p = app_dir();
    p.push("log");
    create_dir_all(&p).ok();
    p.push(filename);
    p
}

/// Rotation simple au démarrage (> 2 Mo → .old)
pub fn rotate_log() {
    let path = log_path("backend.log");
    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() > 2 * 1024 * 1024 {
            let old = path.with_extension("log.old");
            let _ = std::fs::remove_file(&old);
            let _ = std::fs::rename(&path, &old);
        }
    }
}

pub fn log_to_file(category: &str, msg: &str) {
    let ts = Local::now().format("%Y-%m-%d %H:%M:%S");
    let path = log_path("backend.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] [{}] {}", ts, category, msg);
    }
}
