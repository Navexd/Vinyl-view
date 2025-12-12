mod auth;
mod routes;
mod models;
mod token;
mod logger;

use routes::{login_route, callback_route, now_playing_route, done_route, status_route};
use token::load_token_from_file;
use logger::log_to_file;
use warp::Filter;
use std::path::PathBuf;

#[tokio::main]
async fn main() {
    // Construire spotify (auth.rs charge .env depuis exe_dir déjà)
    let spotify = auth::build_spotify().await;

    // Résoudre le dossier du binaire et uniformiser les chemins
    let exe_path = std::env::current_exe().expect("Impossible d'obtenir current_exe");
    let exe_dir = exe_path.parent().expect("Impossible d'obtenir dossier du binaire").to_path_buf();

    // token.json dans le dossier du binaire
    let token_path_buf: PathBuf = exe_dir.join("token.json");
    let token_path_str = token_path_buf.to_str().expect("token_path non UTF-8").to_string();
    let token_path_static = Box::leak(token_path_str.clone().into_boxed_str());

    // Charger le token si présent (utilise le même token_path)
    if let Some(token) = load_token_from_file(&token_path_str).await {
        if let Ok(mut guard) = spotify.token.lock().await {
            *guard = Some(token);
        }
    }

    let routes = login_route(spotify.clone())
        .or(callback_route(spotify.clone(), token_path_static.to_string()))
        .or(now_playing_route(spotify.clone()))
        .or(status_route(spotify.clone()))
        .or(done_route());

    // PORT configurable via env, fallback 3000
    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3000);

    // Log cohérent avec l'adresse réelle
    let msg = format!("✅ Backend lancé, en attente sur http://127.0.0.1:{}", port);
    log_to_file(&msg);
    println!("{}", msg);

    warp::serve(routes).run(([127, 0, 0, 1], port)).await;
}
