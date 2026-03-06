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
let currentCoverURL = "";                                   // URL de la pochette affichée
let currentBoosted  = { c1: null, c2: null, c3: null };    // Couleurs actuellement appliquées (après boost)
let animFrame       = null;                                 // ID de l'animation en cours
let animStart       = null;                                 // Timestamp début animation

const TRANSITION_DURATION = 1200; // Durée transition couleurs (ms)

// ========================================
// UTILITAIRES COULEUR
// ========================================

/** Luminance perçue (0–255) */
function getLuminance([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Saturation brute (0–255) */
function getSaturation([r, g, b]) {
    return Math.max(r, g, b) - Math.min(r, g, b);
}

/**
 * Booste une couleur selon la luminosité moyenne de la pochette.
 * @param {number[]} color   - [r, g, b]
 * @param {number}   avgLum  - Luminance moyenne de la palette
 * @param {string}   role    - "light" | "mid" | "dark"
 * @returns {number[]} couleur boostée [r, g, b]
 */
function boostColor(color, avgLum, role = "light") {
    let factor;

    // Facteur de boost adaptatif selon la luminosité globale
    if      (avgLum < 30)  factor = role === "light" ? 3.2 : role === "mid" ? 2.4 : 1.6;
    else if (avgLum < 60)  factor = role === "light" ? 2.4 : role === "mid" ? 1.7 : 1.1;
    else if (avgLum < 100) factor = role === "light" ? 1.5 : role === "mid" ? 1.1 : 0.75;
    else if (avgLum < 150) factor = role === "light" ? 1.2 : role === "mid" ? 0.9 : 0.65;
    else                   factor = role === "light" ? 0.95 : role === "mid" ? 0.75 : 0.55;

    let [r, g, b] = color.map(v => Math.min(255, Math.round(v * factor)));

    // Relève les couleurs trop sombres (sauf rôle "dark")
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

/** Courbe d'accélération/décélération */
function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

/** Interpolation linéaire entre deux couleurs */
function lerpColor(a, b, t) {
    if (!a || !b) return b || a;
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}

/**
 * Lance une animation de transition entre deux jeux de couleurs.
 * @param {Object} from - { c1, c2, c3 } couleurs de départ
 * @param {Object} to   - { c1, c2, c3 } couleurs d'arrivée
 */
function animateColors(from, to) {
    if (animFrame) cancelAnimationFrame(animFrame);
    animStart = null;

    function step(timestamp) {
        if (!animStart) animStart = timestamp;
        const elapsed = timestamp - animStart;
        const t = easeInOut(Math.min(elapsed / TRANSITION_DURATION, 1));

        // Applique les couleurs interpolées
        applyColorsRaw(
            lerpColor(from.c1, to.c1, t),
            lerpColor(from.c2, to.c2, t),
            lerpColor(from.c3, to.c3, t)
        );

        if (t < 1) {
            animFrame = requestAnimationFrame(step);
        } else {
            // Animation terminée — on sauvegarde les couleurs finales
            currentBoosted = { c1: to.c1, c2: to.c2, c3: to.c3 };
            animFrame = null;
        }
    }

    animFrame = requestAnimationFrame(step);
}

/** Applique directement 3 couleurs aux variables CSS */
function applyColorsRaw(c1, c2, c3) {
    document.documentElement.style.setProperty("--c1", `rgb(${c1.join(",")})`);
    document.documentElement.style.setProperty("--c2", `rgb(${c2.join(",")})`);
    document.documentElement.style.setProperty("--c3", `rgb(${c3.join(",")})`);
}

/**
 * Prépare et lance la transition de couleurs.
 * Premier appel = application immédiate, ensuite = animation douce.
 */
function startColorTransition(c1, c2, c3, avgLum) {
    const boosted = {
        c1: boostColor(c1, avgLum, "light"),
        c2: boostColor(c2, avgLum, "mid"),
        c3: boostColor(c3, avgLum, "dark")
    };

    // Premier affichage : pas d'animation
    if (!currentBoosted.c1) {
        applyColorsRaw(boosted.c1, boosted.c2, boosted.c3);
        currentBoosted = boosted;
        return;
    }

    // Transition animée depuis les couleurs actuelles
    animateColors({ ...currentBoosted }, { ...boosted });
}

// ========================================
// EXTRACTION DES COULEURS DE LA POCHETTE
// ========================================

/**
 * Analyse une image pour en extraire 3 couleurs clés
 * et lancer la transition de fond.
 * @param {HTMLImageElement} imgElement
 */
function updateBackgroundFromCover(imgElement) {
    const colorThief = new ColorThief();

    // --- Palette brute (8 couleurs) pour mesurer la dispersion ---
    let rawPalette;
    try {
        rawPalette = colorThief.getPalette(imgElement, 8);
    } catch (e) {
        console.warn("Extraction couleurs échouée");
        return;
    }

    // --- Calcul de la dispersion colorimétrique ---
    // Plus les couleurs sont éloignées, plus on demande une palette fine
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

    // Taille de palette adaptative
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

    // --- Scoring : on note chaque couleur ---
    // Critères : dominance (position dans la palette), saturation, luminosité
    const scored = palette.map((c, i) => {
        const dominance  = 1 - (i / palette.length);
        const sat        = getSaturation(c) / 255;
        const lum        = getLuminance(c);
        const lumPenalty  = (lum < 15 || lum > 230) ? 0.3 : 1.0;
        const score      = (dominance * 0.6 + sat * 0.4) * lumPenalty;
        return { c, score };
    }).sort((a, b) => b.score - a.score);

    // C1 = meilleur score global
    const newC1 = scored[0].c;

    // C2 = couleur suffisamment différente de C1 et saturée
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

    // C3 = couleur la plus sombre de la palette
    const newC3 = [...palette]
        .sort((a, b) => getLuminance(a) - getLuminance(b))[0];

    // Luminance moyenne (pour calibrer le boost)
    const avgLum = palette.reduce((sum, c) => sum + getLuminance(c), 0) / palette.length;

    // Lancer la transition
    startColorTransition(newC1, newC2, newC3, avgLum);
}

// ========================================
// MISE À JOUR DE L'INTERFACE
// ========================================

/**
 * Met à jour le titre, artiste, album, pochette
 * et l'état lecture/pause du tourne-disque.
 * @param {Object} data - Données de l'API /now-playing
 */
function updateUI(data) {
    if (!data) return;

    // Textes
    document.getElementById("title").textContent  = data.title  || "–";
    document.getElementById("artist").textContent = data.artist || "–";
    document.getElementById("album").textContent  = data.album  || "–";

    // Pochette (on ne recharge que si l'URL change)
    const newURL = data.cover_url;
    if (newURL && newURL !== currentCoverURL) {
        currentCoverURL = newURL;
        hiddenColorSource.crossOrigin = "anonymous";
        hiddenColorSource.onload = () => updateBackgroundFromCover(hiddenColorSource);
        hiddenColorSource.src = newURL;
        RecordPlayer.setCover(newURL);
    }

    // État lecture/pause (compatibilité avec plusieurs formats d'API)
    const isPlaying = (data.is_playing === true || data.isPlaying === true || data.status === "playing");
    if (isPlaying) {
        RecordPlayer.play();
    } else {
        RecordPlayer.pause();
    }
}

// ========================================
// EFFETS DE FOND (cycle au clic)
// ========================================
const effects = ["float", "wave", "pulse"];
let effectIndex = 0;

/** Applique un effet de fond et met à jour le bouton */
function applyEffect(name) {
    container.classList.remove("effect-float", "effect-wave", "effect-pulse");
    container.classList.add("effect-" + name);
    styleBtn.textContent = name.charAt(0).toUpperCase() + name.slice(1);

    // Réapplique les couleurs pour le nouvel effet
    if (currentBoosted.c1) {
        applyColorsRaw(currentBoosted.c1, currentBoosted.c2, currentBoosted.c3);
    }
}

// Cycle des effets au clic
styleBtn.onclick = () => {
    effectIndex = (effectIndex + 1) % effects.length;
    applyEffect(effects[effectIndex]);
};

// Effet par défaut
applyEffect("float");

// ========================================
// INITIALISATION & BOUCLE PRINCIPALE
// ========================================
document.addEventListener("DOMContentLoaded", () => {
    // Initialise le composant tourne-disque
    RecordPlayer.init("record-player-container");

    /** Interroge l'API toutes les 2 secondes */
    let authPopupOpened = false;

    async function fetchNowPlaying() {
        try {
            const res = await fetch(`${BACKEND_BASE_URL}/now-playing`, {
                method: "GET",
                cache: "no-store"
            });

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

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
        }
    }

    setInterval(fetchNowPlaying, 2000);
    fetchNowPlaying();
});
