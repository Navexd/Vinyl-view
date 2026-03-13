// ========================================
// app.js — Vinyl View
// Gère l'UI, l'extraction de couleurs,
// les transitions de fond et le polling API
// ========================================

// ========================================
// ÉLÉMENTS DOM
// ========================================
const container         = document.getElementById("bg-container");
const styleBtn          = document.getElementById("styleBtn");
const hiddenColorSource = document.getElementById("hidden-color-source");

const BACKEND_BASE_URL = window.vinylView?.backendBaseUrl || "http://127.0.0.1:3000";

// ========================================
// ÉTAT GLOBAL
// ========================================
let currentCoverURL = "";
let currentBoosted  = { c1: null, c2: null, c3: null };
let animFrame       = null;
let animStart       = null;

const TRANSITION_DURATION = 1200;

// ========================================
// UTILITAIRES COULEUR
// ========================================

function getLuminance([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getSaturation([r, g, b]) {
    return Math.max(r, g, b) - Math.min(r, g, b);
}

function boostColor(color, avgLum, role = "light") {
    let factor;

    if      (avgLum < 30)  factor = role === "light" ? 3.2 : role === "mid" ? 2.4 : 1.6;
    else if (avgLum < 60)  factor = role === "light" ? 2.4 : role === "mid" ? 1.7 : 1.1;
    else if (avgLum < 100) factor = role === "light" ? 1.5 : role === "mid" ? 1.1 : 0.75;
    else if (avgLum < 150) factor = role === "light" ? 1.2 : role === "mid" ? 0.9 : 0.65;
    else                   factor = role === "light" ? 0.95 : role === "mid" ? 0.75 : 0.55;

    let [r, g, b] = color.map(v => Math.min(255, Math.round(v * factor)));

    if (role !== "dark") {
        const lum = getLuminance([r, g, b]);
        if (lum < 35) {
            const lift = 45 - lum;
            r = Math.min(255, r + Math.round(lift));
            g = Math.min(255, g + Math.round(lift * 0.8));
            b = Math.min(255, b + Math.round(lift * 0.6));
        }
    }

    return [r, g, b];
}

// ========================================
// TRANSITION ANIMÉE DES COULEURS
// ========================================

function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

function lerpColor(a, b, t) {
    if (!a || !b) return b || a;
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}

function animateColors(from, to) {
    if (animFrame) cancelAnimationFrame(animFrame);
    animStart = null;

    function step(timestamp) {
        if (!animStart) animStart = timestamp;
        const elapsed = timestamp - animStart;
        const t = easeInOut(Math.min(elapsed / TRANSITION_DURATION, 1));

        const c1 = lerpColor(from.c1, to.c1, t);
        const c2 = lerpColor(from.c2, to.c2, t);
        const c3 = lerpColor(from.c3, to.c3, t);
        applyColorsRaw(c1, c2, c3);

        if (t < 1) {
            animFrame = requestAnimationFrame(step);
        } else {
            currentBoosted = to;
            animFrame = null;
        }
    }

    animFrame = requestAnimationFrame(step);
}

function applyColorsRaw(c1, c2, c3) {
    document.documentElement.style.setProperty("--c1", `rgb(${c1.join(",")})`);
    document.documentElement.style.setProperty("--c2", `rgb(${c2.join(",")})`);
    document.documentElement.style.setProperty("--c3", `rgb(${c3.join(",")})`);
}

function startColorTransition(c1, c2, c3, avgLum) {
    const boosted = {
        c1: boostColor(c1, avgLum, "light"),
        c2: boostColor(c2, avgLum, "mid"),
        c3: boostColor(c3, avgLum, "dark")
    };

    if (!currentBoosted.c1) {
        applyColorsRaw(boosted.c1, boosted.c2, boosted.c3);
        currentBoosted = boosted;
        return;
    }

    animateColors({ ...currentBoosted }, { ...boosted });
}

// ========================================
// EXTRACTION DES COULEURS DE LA POCHETTE
// ========================================

function updateBackgroundFromCover(imgElement) {
    const colorThief = new ColorThief();

    let rawPalette;
    try {
        rawPalette = colorThief.getPalette(imgElement, 8);
    } catch (e) {
        console.warn("Extraction couleurs échouée");
        return;
    }

    const pairs = [];
    for (let i = 0; i < rawPalette.length; i++) {
        for (let j = i + 1; j < rawPalette.length; j++) {
            const dr = rawPalette[i][0] - rawPalette[j][0];
            const dg = rawPalette[i][1] - rawPalette[j][1];
            const db = rawPalette[i][2] - rawPalette[j][2];
            pairs.push(Math.sqrt(dr * dr + dg * dg + db * db));
        }
    }
    const avgDispersion = pairs.reduce((a, b) => a + b, 0) / pairs.length;

    let paletteSize;
    if      (avgDispersion < 50)  paletteSize = 4;
    else if (avgDispersion < 90)  paletteSize = 6;
    else if (avgDispersion < 140) paletteSize = 10;
    else                          paletteSize = 14;

    let palette;
    try {
        palette = colorThief.getPalette(imgElement, paletteSize);
    } catch {
        palette = rawPalette;
    }

    const scored = palette.map((c, i) => {
        const dominance  = 1 - (i / palette.length);
        const sat        = getSaturation(c) / 255;
        const lum        = getLuminance(c);
        const lumPenalty  = (lum < 15 || lum > 230) ? 0.3 : 1.0;
        const score      = (dominance * 0.6 + sat * 0.4) * lumPenalty;
        return { c, score };
    }).sort((a, b) => b.score - a.score);

    const newC1 = scored[0].c;

    const newC2 =
        scored.find(({ c }, i) => {
            if (i === 0) return false;
            const d = Math.sqrt(
                (c[0] - newC1[0]) ** 2 +
                (c[1] - newC1[1]) ** 2 +
                (c[2] - newC1[2]) ** 2
            );
            return d > 80 && getSaturation(c) > 40;
        })?.c ||
        scored[1]?.c ||
        newC1;

    const newC3 = [...palette]
        .sort((a, b) => getLuminance(a) - getLuminance(b))[0];

    const avgLum = palette.reduce((sum, c) => sum + getLuminance(c), 0) / palette.length;

    startColorTransition(newC1, newC2, newC3, avgLum);
}

// ========================================
// MISE À JOUR DE L'INTERFACE
// ========================================

function updateUI(data) {
    if (!data) return;

    const newTitle = data.title || "–";
    const newArtist = data.artist || "–";

    // --- Transition douce si le morceau change ---
    const titleEl  = document.getElementById("title");
    const artistEl = document.getElementById("artist");
    const albumEl  = document.getElementById("album");

    const trackChanged = titleEl.textContent !== newTitle
        || artistEl.textContent !== newArtist;

    if (trackChanged) {
        document.body.classList.add("track-changing");
        setTimeout(() => {
            titleEl.textContent  = newTitle;
            artistEl.textContent = newArtist;
            albumEl.textContent  = data.album || "–";
            document.body.classList.remove("track-changing");
        }, 400);
    }

    // --- Pochette ---
    const newURL = data.cover_url;
    if (newURL && newURL !== currentCoverURL) {
        currentCoverURL = newURL;
        hiddenColorSource.crossOrigin = "anonymous";
        hiddenColorSource.onload = () => updateBackgroundFromCover(hiddenColorSource);
        hiddenColorSource.src = newURL;
        RecordPlayer.setCover(newURL);
    }

    // --- État lecture/pause (visuel + polling) ---
    const isPlaying = (data.is_playing === true || data.isPlaying === true || data.status === "playing");

    if (isPlaying) {
        document.body.classList.remove("is-paused");
        RecordPlayer.play();
        if      (screensaverActive) setPollRate(POLL_SCREENSAVER);
        else if (document.hidden)   setPollRate(POLL_HIDDEN);
        else if (ecoMode)           setPollRate(POLL_ECO);
        else                        setPollRate(POLL_NORMAL);
    } else {
        document.body.classList.add("is-paused");
        RecordPlayer.pause();
        if (screensaverActive)      setPollRate(POLL_SCREENSAVER);
        else                        setPollRate(POLL_PAUSED);
    }
}



// ========================================
// EFFETS DE FOND (cycle au clic)
// ========================================
const effects = ["float", "wave", "pulse"];
let effectIndex = 0;

function applyEffect(name) {
    container.classList.remove("effect-float", "effect-wave", "effect-pulse");
    container.classList.add("effect-" + name);
    styleBtn.textContent = name.charAt(0).toUpperCase() + name.slice(1);

    if (currentBoosted.c1) {
        applyColorsRaw(currentBoosted.c1, currentBoosted.c2, currentBoosted.c3);
    }
}

styleBtn.onclick = () => {
    effectIndex = (effectIndex + 1) % effects.length;
    applyEffect(effects[effectIndex]);
};

applyEffect("float");

// ========================================
// POLLING INTELLIGENT
// ========================================
const POLL_NORMAL      = 2000;   // Musique en cours, app visible
const POLL_ECO         = 4000;   // Mode éco activé
const POLL_PAUSED      = 8000;   // Rien ne joue
const POLL_SCREENSAVER = 10000;  // Screensaver actif
const POLL_HIDDEN      = 15000;  // App minimisée / onglet caché

let ecoMode         = false;
let pollInterval    = null;
let currentPollRate = POLL_NORMAL;
let ecoHideTimer    = null;

function setPollRate(rate) {
    if (rate === currentPollRate && pollInterval) return;
    currentPollRate = rate;
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(fetchNowPlaying, rate);
    console.log(`⏱️ Polling → ${rate}ms`);
}

// App minimisée / restaurée
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        setPollRate(POLL_HIDDEN);
        console.log('👁️ App masquée → polling 15s');
    } else {
        fetchNowPlaying(); // Refresh immédiat au retour
        setPollRate(ecoMode ? POLL_ECO : POLL_NORMAL);
        console.log('👁️ App visible → polling repris');
    }
});

// ========================================
// MODE ÉCO
// ========================================

if (window.vinylView?.ecoMode) {
    window.vinylView.ecoMode((enabled) => {
        ecoMode = enabled;
        if (enabled) {
            document.body.classList.add('eco-mode');
            setPollRate(POLL_ECO);
            console.log('🌿 Mode éco activé');
        } else {
            document.body.classList.remove('eco-mode');
            document.body.classList.remove('eco-hover');
            if (ecoHideTimer) clearTimeout(ecoHideTimer);
            // Revenir au polling approprié
            if      (screensaverActive) setPollRate(POLL_SCREENSAVER);
            else if (document.hidden)   setPollRate(POLL_HIDDEN);
            else                        setPollRate(POLL_NORMAL);
            console.log('⚡ Mode éco désactivé');
        }
    });
}

// Réafficher les éléments au survol en mode éco
document.addEventListener('mousemove', () => {
    if (!ecoMode) return;

    document.body.classList.add('eco-hover');

    if (ecoHideTimer) clearTimeout(ecoHideTimer);
    ecoHideTimer = setTimeout(() => {
        document.body.classList.remove('eco-hover');
    }, 3000);
});

// ========================================
// SCREENSAVER (piloté par Electron)
// ========================================
let screensaverActive = false;

if (window.vinylView?.onScreensaverActivate) {
    window.vinylView.onScreensaverActivate(() => {
        console.log("🌙 Screensaver activé");
        screensaverActive = true;
        document.body.classList.remove('eco-hover');
        setPollRate(POLL_SCREENSAVER);
    });
}

if (window.vinylView?.onScreensaverDeactivate) {
    window.vinylView.onScreensaverDeactivate(() => {
        console.log("☀️ Screensaver désactivé");
        screensaverActive = false;
        document.body.classList.remove('eco-hover');
        fetchNowPlaying(); // Refresh immédiat au réveil
        setPollRate(ecoMode ? POLL_ECO : POLL_NORMAL);
    });
}

// Sortir du screensaver au moindre input
['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'].forEach(event => {
    document.addEventListener(event, () => {
        if (screensaverActive && window.vinylView?.deactivateScreensaver) {
            window.vinylView.deactivateScreensaver();
        } else if (window.vinylView?.sendUserActivity) {
            window.vinylView.sendUserActivity();
        }
    }, { passive: true });
});

// ========================================
// INITIALISATION & BOUCLE PRINCIPALE
// ========================================
let authPopupOpened = false;
let fetching = false;

async function fetchNowPlaying() {
    if (fetching) return;
    fetching = true;

    try {
        const res = await fetch(`${BACKEND_BASE_URL}/now-playing`, {
            method: "GET",
            cache: "no-store"
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (data.title === "Auth required") {
            if (!authPopupOpened) {
                authPopupOpened = true;
                if (window.vinylView?.openLogin) {
                    window.vinylView.openLogin();
                } else {
                    window.open(`${BACKEND_BASE_URL}/login`, "_blank", "width=500,height=700");
                }
            }
            return;
        }

        authPopupOpened = false;
        updateUI(data);
    } catch (e) {
        console.log("API hors ligne");
    } finally {
        fetching = false; // ← AJOUT
    }
}

document.addEventListener("DOMContentLoaded", () => {
    RecordPlayer.init("record-player-container");
    fetchNowPlaying();
    pollInterval = setInterval(fetchNowPlaying, POLL_NORMAL);
});
