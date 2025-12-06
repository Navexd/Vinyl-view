mod auth;
mod routes;
mod models;
mod token;

use auth::build_spotify;
use routes::{login_route, callback_route, now_playing_route};
use token::load_token_from_file;
use warp::Filter;

#[tokio::main]
async fn main() {
    let spotify = build_spotify();
    let token_path = "token.json";

    // Charger le token si présent
    if let Some(token) = load_token_from_file(token_path).await {
        if let Ok(mut guard) = spotify.token.lock().await {
            *guard = Some(token);
        }
    }

    let routes = login_route(spotify.clone())
        .or(callback_route(spotify.clone(), token_path))
        .or(now_playing_route(spotify.clone()));

    println!("Open http://127.0.0.1:3000/login to start OAuth");
    warp::serve(routes).run(([127, 0, 0, 1], 3000)).await;
}