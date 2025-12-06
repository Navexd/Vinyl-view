use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct TrackInfo {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover_url: Option<String>,
}