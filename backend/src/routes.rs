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
        format!("Open this URL in your browser:\n\n{}", url)
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
                    Ok::<_, warp::reject::Rejection>(warp::reply::html("Auth success. You can close this tab."))
                } else {
                    Ok::<_, warp::reject::Rejection>(warp::reply::html("Missing code"))
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