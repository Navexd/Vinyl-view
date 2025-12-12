use chrono::Local; // ajoute chrono = "0.4" dans Cargo.toml
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;

/// Retourne le dossier du binaire (exe_dir)
fn exe_dir() -> PathBuf {
    let exe_path = std::env::current_exe().unwrap_or_else(|_| PathBuf::from("."));
    exe_path.parent().map(|p| p.to_path_buf()).unwrap_or_else(|| PathBuf::from("."))
}

/// Construire le chemin vers log/<filename> dans le dossier du binaire
fn log_path(filename: &str) -> PathBuf {
    let mut p = exe_dir();
    p.push("log");
    create_dir_all(&p).ok(); // ignorer l'erreur ici (on essaye quand même)
    p.push(filename);
    p
}

/// Écrit un message dans backend.log avec un timestamp (dans exe_dir/log/backend.log)
pub fn log_to_file(msg: &str) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let path = log_path("backend.log");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .unwrap();
    writeln!(file, "[{}] {}", timestamp, msg).unwrap();
}

pub fn log_play(msg: &str) {
    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let path = log_path("play.log");
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .unwrap();
    writeln!(file, "[{}] {}", timestamp, msg).unwrap();
}
