mod auth;
mod routes;
mod models;
mod token;
mod logger;


use routes::{login_route, callback_route, now_playing_route, done_route, status_route};
use token::load_token_from_file;
use logger::log_to_file;
use warp::Filter;



#[tokio::main]
async fn main() {
    let spotify =auth::build_spotify().await;
    let token_path = "token.json";

    // Charger le token si présent
    if let Some(token) = load_token_from_file(token_path).await {
        if let Ok(mut guard) = spotify.token.lock().await {
            *guard = Some(token);
        }
    }
    let routes = login_route(spotify.clone())
        .or(callback_route(spotify.clone(), "token.json"))
        .or(now_playing_route(spotify.clone()))
        .or(status_route(spotify.clone()))
        .or(done_route());


    log_to_file("✅ Backend lancé, en attente sur http://127.0.0.1:3000");
    println!("✅ Backend lancé, en attente sur http://127.0.0.1:3000");
    warp::serve(routes).run(([127, 0, 0, 1], 3000)).await;
}
