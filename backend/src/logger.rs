use chrono::Local;
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::{PathBuf};

/// Retourne le dossier utilisateur pour l'application (userData)
fn app_dir() -> PathBuf {
    let base = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from(".")); // fallback
    base.join("VinylView")
}

/// Retourne le dossier "log/" dans userData
fn log_path(filename: &str) -> PathBuf {
    let mut p = app_dir();
    p.push("log");
    create_dir_all(&p).ok(); // créer ~/.config/VinylView/log
    p.push(filename);
    p
}

/// Écrit un message dans backend.log
pub fn log_to_file(msg: &str) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let path = log_path("backend.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] {}", timestamp, msg);
    }
}

/// Écrit un message dans play.log
pub fn log_play(msg: &str) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let path = log_path("play.log");
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "[{}] {}", timestamp, msg);
    }
}
