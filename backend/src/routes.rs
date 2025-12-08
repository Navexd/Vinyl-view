use warp::Filter;
use rspotify::prelude::*;
use rspotify::model::{AdditionalType, PlayableItem};
use crate::models::TrackInfo;
use crate::token::save_token_to_file;
use rspotify::AuthCodeSpotify;

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
pub fn status_route(spotify: AuthCodeSpotify) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let status_spotify = spotify.clone();
    warp::path("status").and_then(move || {
        let status_spotify = status_spotify.clone();
        async move {
            let token_guard = status_spotify.token.lock().await;
            let status = match token_guard {
                Ok(guard) => match guard.as_ref() {
                    Some(token) if !token.is_expired() => "ready",
                    _ => "auth required",
                },
                Err(_) => "auth required",
            };
            Ok::<_, warp::reject::Rejection>(warp::reply::json(&status))
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

pub fn now_playing_route(spotify: AuthCodeSpotify) -> impl Filter<Extract = impl warp::Reply, Error = warp::Rejection> + Clone {
    let np_spotify = spotify.clone();
    warp::path("now-playing").and_then(move || {
        let np_spotify = np_spotify.clone();
        async move {
            if let Ok(token_guard) = np_spotify.token.lock().await {
                if let Some(token) = token_guard.as_ref() {
                    if token.is_expired() {
                        np_spotify.refresh_token().await.ok();
                    }
                }
            }

            let current = np_spotify.current_playing(None, Option::<Vec<&AdditionalType>>::None).await;
            let track_info = match current {
                Ok(Some(ctx)) => {
                    if let Some(PlayableItem::Track(track)) = ctx.item {
                        TrackInfo {
                            title: track.name.clone(),
                            artist: track.artists.get(0).map(|a| a.name.clone()).unwrap_or_else(|| "Unknown".into()),
                            album: track.album.name.clone(),
                            cover_url: track.album.images.get(0).map(|img| img.url.clone()),
                        }
                    } else {
                        TrackInfo { title: "No track".into(), artist: "".into(), album: "".into(), cover_url: None }
                    }
                }
                Ok(None) => TrackInfo { title: "Not playing".into(), artist: "".into(), album: "".into(), cover_url: None },
                Err(_) => TrackInfo { title: "Error".into(), artist: "".into(), album: "".into(), cover_url: None },
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