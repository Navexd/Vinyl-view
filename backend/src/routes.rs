// routes.rs Version final 25/03/2026
use warp::Filter;
use rspotify::prelude::*;
use rspotify::model::{AdditionalType, PlayableItem};
use rspotify::AuthCodePkceSpotify;
use crate::models::TrackInfo;
use crate::token::save_token_to_file;
use crate::logger::log_to_file;
use std::sync::Arc;
use tokio::sync::Mutex;
use serde::Deserialize;
use tokio::time::{timeout, Duration};

#[derive(Deserialize)]
struct CallbackQuery {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
}

lazy_static::lazy_static! {
    static ref OAUTH_STATE: Arc<Mutex<Option<String>>> = Arc::new(Mutex::new(None));
}

fn extract_query_param(url: &str, key: &str) -> Option<String> {
    let (_, query) = url.split_once('?')?;
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=')?;
        if k == key {
            return Some(v.to_string());
        }
    }
    None
}

fn auth_required_reply() -> TrackInfo {
    TrackInfo {
        title: "Auth required".into(),
        artist: "".into(),
        album: "".into(),
        cover_url: None,
        is_playing: false,
        play_context: "unknown".into(),
    }
}

pub fn login_route(
    spotify: Arc<Mutex<AuthCodePkceSpotify>>
) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let login_spotify = spotify.clone();
    warp::path("login").and_then(move || {
        let login_spotify = login_spotify.clone();
        async move {
            let mut spotify = login_spotify.lock().await;

            match spotify.get_authorize_url(None) {
                Ok(url) => {
                    let Some(state) = extract_query_param(&url, "state") else {
                        log_to_file("auth", "Impossible de récupérer le state OAuth PKCE");
                        return Ok::<_, warp::reject::Rejection>(warp::reply::html(
                            "<h1>Erreur OAuth</h1><p>Impossible de démarrer l'authentification.</p>".to_string()
                        ));
                    };

                    {
                        let mut state_guard = OAUTH_STATE.lock().await;
                        *state_guard = Some(state);
                    }

                    log_to_file("auth", "URL OAuth PKCE générée");
                    Ok::<_, warp::reject::Rejection>(warp::reply::html(format!(
                        r#"<html>
                          <head><meta charset="utf-8"><title>Redirection Spotify</title>
                            <script>window.location.href = "{url}";</script>
                          </head>
                          <body><p>Redirection vers Spotify...</p></body>
                        </html>"#,
                        url = url
                    )))
                }
                Err(e) => {
                    log_to_file("auth", &format!("Impossible de générer l'URL OAuth PKCE: {}", e));
                    Ok::<_, warp::reject::Rejection>(warp::reply::html(
                        "<h1>Erreur OAuth</h1><p>Impossible de démarrer l'authentification.</p>".to_string()
                    ))
                }
            }
        }
    })
}

pub fn status_route(spotify: AuthCodePkceSpotify) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
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
                            log_to_file("token", "Token expiré, tentative de refresh");
                        }
                    } else {
                        log_to_file("status", "Aucun token → auth required");
                        return Ok::<_, warp::reject::Rejection>(warp::reply::json(&"auth required"));
                    }
                } else {
                    log_to_file("status", "Erreur d'accès au token → auth required");
                    return Ok::<_, warp::reject::Rejection>(warp::reply::json(&"auth required"));
                }
            }

            if needs_refresh {
                match timeout(Duration::from_secs(3), status_spotify.refresh_token()).await {
                    Ok(Ok(_)) => {
                        log_to_file("token", "Refresh réussi");
                        Ok::<_, warp::reject::Rejection>(warp::reply::json(&"ready"))
                    }
                    Ok(Err(e)) => {
                        log_to_file("token", &format!("Refresh échoué: {}", e));
                        Ok::<_, warp::reject::Rejection>(warp::reply::json(&"auth required"))
                    }
                    Err(_) => {
                        log_to_file("token", "Timeout du refresh → auth required");
                        Ok::<_, warp::reject::Rejection>(warp::reply::json(&"auth required"))
                    }
                }
            } else {
                log_to_file("status", "Token valide → ready");
                Ok::<_, warp::reject::Rejection>(warp::reply::json(&"ready"))
            }
        }
    })
}

pub fn callback_route(
    spotify: Arc<Mutex<AuthCodePkceSpotify>>,
    token_path: String
) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let callback_spotify = spotify.clone();
    warp::path("callback")
        .and(warp::query::query::<CallbackQuery>())
        .and_then(move |params: CallbackQuery| {
            let callback_spotify = callback_spotify.clone();
            let token_path = token_path.clone();
            async move {
                if let Some(error) = params.error {
                    log_to_file("auth", &format!("OAuth refusé: {}", error));
                    *OAUTH_STATE.lock().await = None;
                    let reply: Box<dyn warp::Reply> = Box::new(warp::reply::html("OAuth error"));
                    return Ok::<_, warp::reject::Rejection>(reply);
                }

                let expected_state = OAUTH_STATE.lock().await.clone();

                match (
                    params.code.as_deref(),
                    params.state.as_deref(),
                    expected_state.as_deref()
                ) {
                    (Some(code), Some(received_state), Some(expected)) if received_state == expected => {
                        let spotify = callback_spotify.lock().await;

                        match spotify.request_token(code).await {
                            Ok(_) => {
                                if let Ok(guard) = spotify.token.lock().await {
                                    if let Some(token) = guard.as_ref() {
                                        save_token_to_file(&token_path, token).await;
                                    }
                                }
                                *OAUTH_STATE.lock().await = None;
                                log_to_file("auth", "Callback réussi, token obtenu");

                                let reply: Box<dyn warp::Reply> = Box::new(warp::redirect::temporary(
                                    warp::http::Uri::from_static("/done"),
                                ));
                                Ok::<_, warp::reject::Rejection>(reply)
                            }
                            Err(e) => {
                                log_to_file("auth", &format!("Échec échange token: {}", e));
                                *OAUTH_STATE.lock().await = None;
                                let reply: Box<dyn warp::Reply> = Box::new(warp::reply::html("Token exchange failed"));
                                Ok::<_, warp::reject::Rejection>(reply)
                            }
                        }
                    }
                    _ => {
                        log_to_file("auth", "Callback invalide: state manquant ou incorrect");
                        *OAUTH_STATE.lock().await = None;
                        let reply: Box<dyn warp::Reply> = Box::new(warp::reply::html("Invalid callback"));
                        Ok::<_, warp::reject::Rejection>(reply)
                    }
                }
            }
        })
}

pub fn now_playing_route(spotify: AuthCodePkceSpotify) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
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
                        }
                    } else {
                        return Ok::<_, warp::reject::Rejection>(warp::reply::json(&auth_required_reply()));
                    }
                } else {
                    return Ok::<_, warp::reject::Rejection>(warp::reply::json(&auth_required_reply()));
                }
            }

            if needs_refresh {
                match timeout(Duration::from_secs(3), np_spotify.refresh_token()).await {
                    Ok(Ok(_)) => log_to_file("spotify", "Refresh réussi"),
                    Ok(Err(_)) => {
                        log_to_file("spotify", "Refresh échoué");
                        return Ok::<_, warp::reject::Rejection>(warp::reply::json(&auth_required_reply()));
                    }
                    Err(_) => {
                        log_to_file("spotify", "Timeout du refresh");
                        return Ok::<_, warp::reject::Rejection>(warp::reply::json(&auth_required_reply()));
                    }
                }
            }

            let current = np_spotify.current_playing(None, Option::<Vec<&AdditionalType>>::None).await;
            let track_info = match current {
                Ok(Some(ctx)) => {
                    let playing = ctx.is_playing;
                    if let Some(PlayableItem::Track(track)) = ctx.item {
                        let play_context = if ctx.context.as_ref().map(|c| c._type == rspotify::model::Type::Playlist).unwrap_or(false) {
                            "playlist"
                        } else {
                            match track.album.album_type.as_deref() {
                                Some("single") => "single",
                                Some("album") | Some("compilation") => "album",
                                _ => "unknown",
                            }
                        };

                        let info = TrackInfo {
                            title: track.name.clone(),
                            artist: track.artists.first().map(|a| a.name.clone()).unwrap_or_else(|| "Unknown".into()),
                            album: track.album.name.clone(),
                            cover_url: track.album.images.first().map(|img| img.url.clone()),
                            is_playing: playing,
                            play_context: play_context.into(),
                        };

                        info
                    } else {
                        TrackInfo { title: "No track".into(), artist: "".into(), album: "".into(), cover_url: None, is_playing: false, play_context: "unknown".into() }
                    }
                }
                Ok(None) => {
                    TrackInfo { title: "Not playing".into(), artist: "".into(), album: "".into(), cover_url: None, is_playing: false, play_context: "unknown".into() }
                }
                Err(e) => {
                    log_to_file("spotify", &format!("Erreur API: {}", e));
                    TrackInfo { title: "Error".into(), artist: "".into(), album: "".into(), cover_url: None, is_playing: false, play_context: "unknown".into() }
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
                <script>setTimeout(() => window.close(), 1500);</script>
              </body>
            </html>
        "#)
    })
}