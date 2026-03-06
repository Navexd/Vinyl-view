use rspotify::{scopes, AuthCodePkceSpotify, Credentials, OAuth};
use crate::token::{load_token_from_file, is_token_valid, get_token_path};
use std::path::PathBuf;
use dirs::config_dir;
use std::env;

const DEFAULT_SPOTIFY_CLIENT_ID: &str = "7243cb3c0cf649538b3120601a818b7b";

pub async fn build_spotify(port: u16) -> Result<AuthCodePkceSpotify, String> {
    let client_id = env::var("SPOTIFY_CLIENT_ID")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_SPOTIFY_CLIENT_ID.to_string());

    if client_id == DEFAULT_SPOTIFY_CLIENT_ID && DEFAULT_SPOTIFY_CLIENT_ID == "TON_CLIENT_ID_PUBLIC" {
        return Err("SPOTIFY_CLIENT_ID non configuré".to_string());
    }

    // ... suite ...

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
/* ok */