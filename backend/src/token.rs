use rspotify::Token;
use tokio::fs;
use chrono::Utc;
use std::path::PathBuf;

pub async fn load_token_from_file(path: &str) -> Option<Token> {
    match fs::read_to_string(path).await {
        Ok(content) => serde_json::from_str(&content).ok(),
        Err(_) => None,
    }
}

pub async fn save_token_to_file(path: &str, token: &Token) {
    if let Ok(json) = serde_json::to_string(token) {
        #[cfg(unix)]
        {
            use std::io::Write;
            use std::os::unix::fs::OpenOptionsExt;

            if let Ok(mut file) = std::fs::OpenOptions::new()
                .create(true)
                .write(true)
                .truncate(true)
                .mode(0o600)
                .open(path)
            {
                let _ = file.write_all(json.as_bytes());
                let _ = file.sync_all();
                return;
            }
        }

        let _ = fs::write(path, json).await;
    }
}

pub fn is_token_valid(token: &Token) -> bool {
    if let Some(expiry) = token.expires_at {
        Utc::now() < expiry
    } else {
        true
    }
}

pub fn get_token_path() -> PathBuf {
    let config_dir = dirs::config_dir()
        .expect("Impossible de trouver le dossier config")
        .join("vinyl-view");
    std::fs::create_dir_all(&config_dir).ok();
    config_dir.join("token.json")
}
/* ok */