async function fetchNowPlaying() {
    try {
        const response = await fetch("http://127.0.0.1:3000/now-playing");
        const data = await response.json();

        document.getElementById("title").innerText = data.title || "Titre inconnu";
        document.getElementById("artist").innerText = data.artist || "Artiste inconnu";
        document.getElementById("album").innerText = data.album || "Album inconnu";

        const cover = document.getElementById("cover");
        if (data.cover_url) {
            cover.src = data.cover_url;
        } else {
            cover.src = "placeholder.jpg"; // image par défaut si pas de pochette
        }
    } catch (err) {
        console.error("Erreur API:", err);
    }
}

fetchNowPlaying();
setInterval(fetchNowPlaying, 5000);