mod auth;
mod routes;
mod models;
mod token;
mod logger;

use routes::{login_route, callback_route, now_playing_route, done_route, status_route};
use token::{load_token_from_file, get_token_path};
use logger::log_to_file;
use warp::Filter;
use std::sync::Arc;
use tokio::sync::Mutex;

#[tokio::main]
async fn main() {
    let _ = dotenv::dotenv();

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(3000);

    let spotify = match auth::build_spotify(port).await {
        Ok(spotify) => spotify,
        Err(err) => {
            let msg = format!("❌ Configuration Spotify invalide: {}", err);
            log_to_file(&msg);
            eprintln!("{}", msg);
            return;
        }
    };

    let auth_spotify = Arc::new(Mutex::new(spotify.clone()));

    let token_path = get_token_path();
    let token_path_str = token_path.to_str().expect("token_path non UTF-8").to_string();

    if let Some(token) = load_token_from_file(&token_path_str).await {
        if let Ok(mut guard) = spotify.token.lock().await {
            *guard = Some(token);
        }
    }

    let routes = login_route(auth_spotify.clone())
        .or(callback_route(auth_spotify.clone(), token_path_str.clone()))
        .or(now_playing_route(spotify.clone()))
        .or(status_route(spotify.clone()))
        .or(done_route());

    let msg = format!("✅ Backend lancé, en attente sur http://127.0.0.1:{}", port);
    log_to_file(&msg);
    println!("{}", msg);

    warp::serve(routes).run(([127, 0, 0, 1], port)).await;
}
/* ok */