// auth.rs Version final 25/03/2026
use rspotify::{scopes, AuthCodePkceSpotify, Credentials, OAuth};
use crate::token::{load_token_from_file, is_token_valid, get_token_path};
use std::path::PathBuf;
use dirs::config_dir;

const SPOTIFY_CLIENT_ID: &str = env!("SPOTIFY_CLIENT_ID",
"SPOTIFY_CLIENT_ID doit être défini au build : \
    SPOTIFY_CLIENT_ID=ton_id cargo build --release");

pub async fn build_spotify(port: u16) -> Result<AuthCodePkceSpotify, String> {
    let client_id = SPOTIFY_CLIENT_ID.to_string();

    if client_id.trim().is_empty() {
        return Err("SPOTIFY_CLIENT_ID vide".to_string());
    }

    let creds = Credentials {
        id: client_id,
        secret: None,
    };

    let oauth = OAuth {
        redirect_uri: format!("http://127.0.0.1:{}/callback", port),
        scopes: scopes!(
            "user-read-currently-playing",
            "user-read-playback-state"
        ),
        ..Default::default()
    };

    let spotify = AuthCodePkceSpotify::new(creds, oauth);

    let token_dir = config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("vinyl-view");
    let _: Option<()> = tokio::fs::create_dir_all(&token_dir).await.ok();

    let token_path = get_token_path();

    if let Some(token) = load_token_from_file(token_path.to_str().unwrap_or("token.json")).await {
        if is_token_valid(&token) {
            if let Ok(mut guard) = spotify.token.lock().await {
                *guard = Some(token);
            }
        }
    }

    Ok(spotify)
}