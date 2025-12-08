use rspotify::Token;
use tokio::fs;
use chrono::Utc;

pub async fn load_token_from_file(path: &str) -> Option<Token> {
    match fs::read_to_string(path).await {
        Ok(content) => serde_json::from_str(&content).ok(),
        Err(_) => None,
    }
}

pub async fn save_token_to_file(path: &str, token: &Token) {
    if let Ok(json) = serde_json::to_string(token) {
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