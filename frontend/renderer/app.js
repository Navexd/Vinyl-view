//  VARIABLES
// ================================
const cover = document.getElementById("cover");
const title = document.getElementById("title");
const artist = document.getElementById("artist");
const album = document.getElementById("album");
const backgroundDiv = document.getElementById("background");
const backgroundFade = document.getElementById("background-fade"); // ← AJOUT

// ================================
//  UTILS
// ================================
function getLuminance([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function softenColor(color, factor = 0.7) {
    return color.map(v => Math.round(v * factor));
}

function pickSolidColors(palette) {
    if (!palette || palette.length === 0) {
        return {
            softVibrant: [80, 80, 80],
            softDark: [20, 20, 20]
        };
    }

    const sorted = palette.sort((a, b) => {
        const satA = Math.max(...a) - Math.min(...a);
        const satB = Math.max(...b) - Math.min(...b);
        return satB - satA;
    });

    const vibrant = sorted[0];
    const darkCandidate = sorted[sorted.length - 1];

    return {
        softVibrant: softenColor(vibrant, 0.75),
        softDark: softenColor(darkCandidate, 0.55)
    };
}

// ================================
//  BACKGROUND avec FONDU (NOUVEAUTÉS)
// ================================
function updateBackgroundFromCover() {
    const colorThief = new ColorThief();

    try {
        const palette = colorThief.getPalette(cover, 8);
        if (!palette) return;

        // ---- 1. Couleurs utiles ----
        const vibrant = palette[0];
        const soft = palette[1] || palette[0];
        const dark = palette.reduce((a,b)=> {
            const la = getLuminance(a);
            const lb = getLuminance(b);
            return la < lb ? a : b;
        });

        // ---- 2. Luminosité et saturation ----
        const luminances = palette.map(c => getLuminance(c));
        const avgLum = luminances.reduce((a,b)=>a+b) / luminances.length;

        const sat = (c) => Math.max(...c) - Math.min(...c);
        const avgSat = palette.map(sat).reduce((a,b)=>a+b) / palette.length;

        const isDark = avgLum < 45;
        const isVivid = avgSat > 60;
        const isMulticolor = avgSat > 40 && palette.length >= 3;

        // ---- 3. Décision automatique ----
        let useRadial = false;

        if (isVivid && !isDark) useRadial = true;
        if (isDark) useRadial = false;
        if (isMulticolor) useRadial = false;

        // ---- 4. Ajustement luminosité ----
        const boost = (c, f) => c.map(v => Math.min(255, v * f));

        let c1, c2, c3;

        if (avgLum < 50) {
            c1 = boost(vibrant, 0.8);
            c2 = boost(soft, 0.6);
            c3 = boost(dark, 0.4);
        } else if (avgLum < 120) {
            c1 = boost(vibrant, 1.0);
            c2 = boost(soft, 0.8);
            c3 = boost(dark, 0.6);
        } else {
            c1 = boost(vibrant, 1.2);
            c2 = boost(soft, 1.0);
            c3 = boost(dark, 0.8);
        }

        const color1 = `rgb(${c1.join(",")})`;
        const color2 = `rgb(${c2.join(",")})`;
        const color3 = `rgb(${c3.join(",")})`;

        // ---- 5. Calcul du nouveau gradient ----
        let newBackground;

        if (useRadial) {
            newBackground = `
                radial-gradient(circle at center,
                    ${color1} 0%,
                    ${color2} 40%,
                    ${color3} 100%
                )
            `;
        } else {
            newBackground = `
                linear-gradient(135deg,
                    ${color1} 0%,
                    ${color2} 50%,
                    ${color3} 100%
                )
            `;
        }

        // ================================
        //  FONDU DOUX ENTRE ANCIEN ET NOUVEAU FOND
        // ================================
        backgroundFade.style.background = newBackground;
        backgroundFade.style.opacity = 1;

        // Après le fondu, remplacer le fond principal
        setTimeout(() => {
            backgroundDiv.style.background = newBackground;
            backgroundFade.style.opacity = 0;
        }, 800); // durée du fade

    } catch (err) {
        console.error("Erreur ColorThief:", err);
    }
}

// ================================
//  MET À JOUR L'UI
// ================================
function updateUI(data) {
    if (!data) return;

    title.textContent = data.title || "";
    artist.textContent = data.artist || "";
    album.textContent = data.album || "";

    if (data.cover) {
        cover.classList.add("fade");
        cover.src = data.cover;

        cover.onload = () => {
            cover.classList.remove("fade");
            updateBackgroundFromCover();
        };
    }
}

// ================================
//  FETCH BACKEND
// ================================
async function fetchNowPlaying() {
    try {
        const response = await fetch("http://127.0.0.1:3000/now-playing");
        const data = await response.json();

        title.innerText = data.title || "Titre inconnu";
        artist.innerText = data.artist || "Artiste inconnu";
        album.innerText = data.album || "Album inconnu";

        const coverUrl = data.cover_url || "placeholder.jpg";

        cover.classList.add("fade");
        setTimeout(() => {
            cover.src = coverUrl;
        }, 300);

        cover.onload = () => {
            cover.classList.remove("fade");
            updateBackgroundFromCover();
        };

    } catch (err) {
        console.error("Erreur API:", err);
    }
}

// ================================
//  LOOP
// ================================
setInterval(fetchNowPlaying, 2500);
fetchNowPlaying();
