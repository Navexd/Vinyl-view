use rspotify::{scopes, AuthCodeSpotify, Credentials, OAuth};
use crate::token::{load_token_from_file, is_token_valid};
use std::path::PathBuf;

pub async fn build_spotify() -> AuthCodeSpotify {
    // 🔁 Charger le .env depuis le dossier du binaire
    let exe_path = std::env::current_exe().unwrap();
    let exe_dir = exe_path.parent().unwrap();
    let env_path = exe_dir.join(".env");
    dotenv::from_path(env_path).ok();

    // Charger les credentials depuis .env
    let creds = Credentials::from_env().expect("Missing CLIENT_ID/SECRET in .env");
    let oauth = OAuth {
        redirect_uri: std::env::var("RSPOTIFY_REDIRECT_URI")
            .expect("Missing RSPOTIFY_REDIRECT_URI"),
        scopes: scopes!(
            "user-read-currently-playing",
            "user-read-playback-state"
        ),
        ..Default::default()
    };

    let spotify = AuthCodeSpotify::new(creds, oauth);

    // 🔁 Charger le token.json depuis le même dossier que le binaire
    let token_path: PathBuf = exe_dir.join("token.json");
    if let Some(token) = load_token_from_file(token_path.to_str().unwrap()).await {
        if is_token_valid(&token) {
            if let Ok(mut guard) = spotify.token.lock().await {
                *guard = Some(token);
            }
            return spotify; // pas besoin d'afficher l’URL
        }
    }

    // Sinon, lancer l’OAuth
    match spotify.get_authorize_url(false) {
        Ok(auth_url) => {
            println!("Open {} to start OAuth", auth_url);
            
        }
        Err(e) => {
            eprintln!("Erreur lors de la génération de l’URL OAuth: {:?}", e);
        }
    }

    spotify
}