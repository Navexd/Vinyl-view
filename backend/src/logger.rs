use chrono::Local; // ajoute chrono = "0.4" dans Cargo.toml
use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;

/// Écrit un message dans backend.log avec un timestamp
pub fn log_to_file(msg: &str) {
    // créer le dossier log si absent
    create_dir_all("log").unwrap();

    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open("log/backend.log") // ✅ dans le dossier log
        .unwrap();
    writeln!(file, "[{}] {}", timestamp, msg).unwrap();
}


pub fn log_play(msg: &str) {
    create_dir_all("log").unwrap();

    let timestamp = Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open("log/play.log") // ✅ dans le dossier log
        .unwrap();
    writeln!(file, "[{}] {}", timestamp, msg).unwrap();
}
