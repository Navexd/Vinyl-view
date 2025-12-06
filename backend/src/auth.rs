use dotenv::dotenv;
use rspotify::{scopes, AuthCodeSpotify, Credentials, OAuth};

pub fn build_spotify() -> AuthCodeSpotify {
    dotenv().ok();

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

    AuthCodeSpotify::new(creds, oauth)
}