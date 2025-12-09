use warp::Filter;
use rspotify::prelude::*;
use rspotify::model::{AdditionalType, PlayableItem};
use crate::models::TrackInfo;
use crate::token::save_token_to_file;
use rspotify::AuthCodeSpotify;
use std::fs::OpenOptions;
use std::io::Write;
use crate::logger::log_play;
use std::sync::Arc;
use tokio::sync::Mutex;
use chrono::{Local, Duration as ChronoDuration, DateTime};


pub fn login_route(spotify: AuthCodeSpotify) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let login_spotify = spotify.clone();
    warp::path("login").map(move || {
        let url = login_spotify.get_authorize_url(false).unwrap();
        warp::reply::html(format!(
            r#"
            <html>
              <head>
                <meta charset="utf-8">
                <title>Redirection Spotify</title>
                <script>
                  window.location.href = "{url}";
                </script>
              </head>
              <body>
                <p>Redirection vers Spotify...</p>
              </body>
            </html>
            "#,
            url = url
        ))
    })
}
fn log_to_file(msg: &str) {
    let mut file = OpenOptions::new()
        .create(true)
        .append(true)
        .open("backend.log")
        .unwrap();
    writeln!(file, "{}", msg).unwrap();
}

use tokio::time::{timeout, Duration};

pub fn status_route(spotify: AuthCodeSpotify) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let status_spotify = spotify.clone();
    warp::path("status").and_then(move || {
        let status_spotify = status_spotify.clone();
        async move {
            let mut needs_refresh = false;

            {
                let token_guard = status_spotify.token.lock().await;
                if let Ok(guard) = token_guard.as_ref() {
                    if let Some(token) = guard.as_ref() {
                        if token.is_expired() {
                            needs_refresh = true;
                            log_to_file("⚠️ Token expiré → tentative de refresh...");
                        }
                    } else {
                        log_to_file("❌ Aucun token → auth required");
                        return Ok::<_, warp::reject::Rejection>(warp::reply::json(&"auth required"));
                    }
                } else {
                    log_to_file("❌ Erreur d'accès au token → auth required");
                    return Ok::<_, warp::reject::Rejection>(warp::reply::json(&"auth required"));
                }
            }

            if needs_refresh {
                match timeout(Duration::from_secs(3), status_spotify.refresh_token()).await {
                    Ok(Ok(_)) => {
                        log_to_file("✅ Refresh réussi → ready");
                        Ok::<_, warp::reject::Rejection>(warp::reply::json(&"ready"))
                    }
                    Ok(Err(err)) => {
                        log_to_file(&format!("❌ Refresh échoué : {:?}", err));
                        Ok::<_, warp::reject::Rejection>(warp::reply::json(&"auth required"))
                    }
                    Err(_) => {
                        log_to_file("⏱️ Timeout du refresh → auth required");
                        Ok::<_, warp::reject::Rejection>(warp::reply::json(&"auth required"))
                    }
                }
            } else {
                log_to_file("✅ Token valide → ready");
                Ok::<_, warp::reject::Rejection>(warp::reply::json(&"ready"))
            }
        }
    })
}


pub fn callback_route(spotify: AuthCodeSpotify, token_path: &'static str) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let callback_spotify = spotify.clone();
    warp::path("callback")
        .and(warp::query::query::<std::collections::HashMap<String, String>>())
        .and_then(move |params: std::collections::HashMap<String, String>| {
            let callback_spotify = callback_spotify.clone();
            async move {
                if let Some(code) = params.get("code") {
                    callback_spotify.request_token(code).await.unwrap();
                    if let Ok(guard) = callback_spotify.token.lock().await {
                        if let Some(token) = guard.as_ref() {
                            save_token_to_file(token_path, token).await;
                        }
                    }
                    let reply: Box<dyn warp::Reply> = Box::new(warp::redirect::temporary(
                        warp::http::Uri::from_static("/done"),
                    ));
                    Ok::<_, warp::reject::Rejection>(reply)
                } else {
                    let reply: Box<dyn warp::Reply> = Box::new(warp::reply::html("Missing code"));
                    Ok::<_, warp::reject::Rejection>(reply)
                }
            }
        })
}


lazy_static::lazy_static! {
    static ref LAST_TRACK_ID: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
    static ref LAST_TRACK_START: Arc<Mutex<Option<DateTime<Local>>>> = Arc::new(Mutex::new(None));
}

const CONFIRMATION_DELAY_SECS: i64 = 20;

pub fn now_playing_route(spotify: AuthCodeSpotify) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let np_spotify = spotify.clone();
    warp::path("now-playing").and_then(move || {
        let np_spotify = np_spotify.clone();
        async move {
            let mut needs_refresh = false;

            {
                let token_guard = np_spotify.token.lock().await;
                if let Ok(guard) = token_guard.as_ref() {
                    if let Some(token) = guard.as_ref() {
                        if token.is_expired() {
                            needs_refresh = true;
                            log_play("⚠️ Token expiré → tentative de refresh...");
                        }
                    } else {
                        log_play("❌ Aucun token → auth required");
                        return Ok::<_, warp::reject::Rejection>(warp::reply::json(&TrackInfo {
                            title: "Auth required".into(),
                            artist: "".into(),
                            album: "".into(),
                            cover_url: None,
                        }));
                    }
                } else {
                    log_play("❌ Erreur d'accès au token → auth required");
                    return Ok::<_, warp::reject::Rejection>(warp::reply::json(&TrackInfo {
                        title: "Auth required".into(),
                        artist: "".into(),
                        album: "".into(),
                        cover_url: None,
                    }));
                }
            }

            if needs_refresh {
                match timeout(Duration::from_secs(3), np_spotify.refresh_token()).await {
                    Ok(Ok(_)) => log_play("✅ Refresh réussi"),
                    Ok(Err(err)) => {
                        log_play(&format!("❌ Refresh échoué : {:?}", err));
                        return Ok::<_, warp::reject::Rejection>(warp::reply::json(&TrackInfo {
                            title: "Auth required".into(),
                            artist: "".into(),
                            album: "".into(),
                            cover_url: None,
                        }));
                    }
                    Err(_) => {
                        log_play("⏱️ Timeout du refresh → auth required");
                        return Ok::<_, warp::reject::Rejection>(warp::reply::json(&TrackInfo {
                            title: "Auth required".into(),
                            artist: "".into(),
                            album: "".into(),
                            cover_url: None,
                        }));
                    }
                }
            }

            let current = np_spotify.current_playing(None, Option::<Vec<&AdditionalType>>::None).await;
            let track_info = match current {
                Ok(Some(ctx)) => {
                    if let Some(PlayableItem::Track(track)) = ctx.item {
                        let info = TrackInfo {
                            title: track.name.clone(),
                            artist: track.artists.get(0).map(|a| a.name.clone()).unwrap_or_else(|| "Unknown".into()),
                            album: track.album.name.clone(),
                            cover_url: track.album.images.get(0).map(|img| img.url.clone()),
                        };

                        let current_id = format!("{} - {} ({})", info.title, info.artist, info.album);
                        let now = Local::now();

                        let mut last_id = LAST_TRACK_ID.lock().await;
                        let mut last_start = LAST_TRACK_START.lock().await;

                        if last_id.as_ref() != Some(&current_id) {
                            log_play(&format!("🎵 Nouveau morceau : {}", current_id));
                            *last_id = Some(current_id.clone());
                            *last_start = Some(now);
                        } else if let Some(start_time) = *last_start {
                            let elapsed = now.signed_duration_since(start_time);
                            if elapsed >= ChronoDuration::seconds(CONFIRMATION_DELAY_SECS) {
                                log_play(&format!("🎵 Lecture en cours : {}", current_id));
                                *last_start = Some(now + ChronoDuration::seconds(9999)); // empêche de reloguer
                            }
                        }

                        info
                    } else {
                        log_play("ℹ️ Aucun morceau en cours");
                        TrackInfo { title: "No track".into(), artist: "".into(), album: "".into(), cover_url: None }
                    }
                }
                Ok(None) => {
                    log_play("ℹ️ Rien n’est en cours de lecture");
                    TrackInfo { title: "Not playing".into(), artist: "".into(), album: "".into(), cover_url: None }
                }
                Err(err) => {
                    log_play(&format!("❌ Erreur Spotify : {:?}", err));
                    TrackInfo { title: "Error".into(), artist: "".into(), album: "".into(), cover_url: None }
                }
            };

            Ok::<_, warp::reject::Rejection>(warp::reply::json(&track_info))
        }
    })
}





pub fn done_route() -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    warp::path("done").map(|| {
        warp::reply::html(r#"
            <html>
              <head><title>Connexion réussie</title></head>
              <body>
                <h2>Connexion réussie à Spotify</h2>
                <p>Vous pouvez fermer cette fenêtre.</p>
              </body>
            </html>
        "#)
    })
}