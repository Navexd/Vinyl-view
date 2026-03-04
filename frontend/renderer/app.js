// ========================================
// ELEMENTS
// ========================================
const coverFront = document.getElementById("cover-front");
const coverBack  = document.getElementById("cover-back");
const container  = document.getElementById("bg-container");
const styleBtn   = document.getElementById("styleBtn");
const shapeBtn   = document.getElementById("shapeBtn");

// ========================================
// STATE
// ========================================
let currentCoverURL = "";
let currentColors   = { c1: null, c2: null, c3: null };
let currentBoosted  = { c1: null, c2: null, c3: null };
let animFrame       = null;
let animStart       = null;
const TRANSITION_DURATION = 1200;

// ========================================
// COLOR UTILS
// ========================================

// Luminance perceptuelle d'une couleur RGB
function getLuminance([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Saturation simple (écart max-min)
function getSaturation([r, g, b]) {
    return Math.max(r, g, b) - Math.min(r, g, b);
}

// Booste une couleur selon son rôle (light / mid / dark) et la luminance moyenne
function boostColor(color, avgLum, role = "light") {
    let factor;
    if      (avgLum < 30)  factor = role === "light" ? 3.2 : role === "mid" ? 2.4 : 1.6;
    else if (avgLum < 60)  factor = role === "light" ? 2.4 : role === "mid" ? 1.7 : 1.1;
    else if (avgLum < 100) factor = role === "light" ? 1.5 : role === "mid" ? 1.1 : 0.75;
    else if (avgLum < 150) factor = role === "light" ? 1.2 : role === "mid" ? 0.9 : 0.65;
    else                   factor = role === "light" ? 0.95 : role === "mid" ? 0.75 : 0.55;

    let [r, g, b] = color.map(v => Math.min(255, Math.round(v * factor)));

    // Empêche les couleurs light/mid de rester trop sombres
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
// COLOR TRANSITION (interpolation animée)
// ========================================

// Courbe ease-in-out pour les transitions
function easeInOut(t) {
    return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
}

// Interpolation linéaire entre deux couleurs RGB
function lerpColor(a, b, t) {
    if (!a || !b) return b || a;
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
    ];
}

// Anime la transition entre les anciennes et nouvelles couleurs
function animateColors(from, to) {
    if (animFrame) cancelAnimationFrame(animFrame);
    animStart = null;

    function step(timestamp) {
        if (!animStart) animStart = timestamp;
        const elapsed = timestamp - animStart;
        const t = easeInOut(Math.min(elapsed / TRANSITION_DURATION, 1));

        applyColorsRaw(
            lerpColor(from.c1, to.c1, t),
            lerpColor(from.c2, to.c2, t),
            lerpColor(from.c3, to.c3, t)
        );

        if (t < 1) {
            animFrame = requestAnimationFrame(step);
        } else {
            currentBoosted = { c1: to.c1, c2: to.c2, c3: to.c3 };
            animFrame = null;
        }
    }

    animFrame = requestAnimationFrame(step);
}

// ========================================
// APPLY COLORS → CSS VARIABLES
// ========================================

// Injecte les couleurs dans les variables CSS --c1 / --c2 / --c3
function applyColorsRaw(c1, c2, c3) {
    document.documentElement.style.setProperty("--c1", `rgb(${c1.join(",")})`);
    document.documentElement.style.setProperty("--c2", `rgb(${c2.join(",")})`);
    document.documentElement.style.setProperty("--c3", `rgb(${c3.join(",")})`);

    if (currentEffect === "float") {
        updateShapeGradient(currentSubEffect());
    }
}

// ========================================
// COLOR TRANSITION — POINT D'ENTRÉE
// ========================================

// Reçoit les 3 couleurs brutes + avgLum, booste et lance l'animation
function startColorTransition(newC1, newC2, newC3, avgLum) {
    const to = {
        c1: boostColor(newC1, avgLum, "light"),
        c2: boostColor(newC2, avgLum, "mid"),
        c3: boostColor(newC3, avgLum, "dark"),
    };
    const from = {
        c1: currentBoosted.c1 || to.c1,
        c2: currentBoosted.c2 || to.c2,
        c3: currentBoosted.c3 || to.c3,
    };

    currentColors = { c1: newC1, c2: newC2, c3: newC3 };
    animateColors(from, to);
}

// ========================================
// COLOR EXTRACTION (ColorThief)
// ========================================

// Extrait la palette de la pochette et sélectionne c1 / c2 / c3
function updateBackgroundFromCover(imgElement) {
    const colorThief = new ColorThief();

    // — Palette rapide pour mesurer la dispersion des couleurs
    let rawPalette;
    try {
        rawPalette = colorThief.getPalette(imgElement, 5);
    } catch (e) {
        console.warn("ColorThief erreur:", e);
        return;
    }

    // Calcule la dispersion moyenne entre toutes les paires de couleurs
    const pairs = [];
    for (let i = 0; i < rawPalette.length; i++) {
        for (let j = i + 1; j < rawPalette.length; j++) {
            const dr = rawPalette[i][0] - rawPalette[j][0];
            const dg = rawPalette[i][1] - rawPalette[j][1];
            const db = rawPalette[i][2] - rawPalette[j][2];
            pairs.push(Math.sqrt(dr*dr + dg*dg + db*db));
        }
    }
    const avgDispersion = pairs.reduce((a, b) => a + b, 0) / pairs.length;

    // Plus la palette est diverse, plus on demande de couleurs à ColorThief
    let paletteSize;
    if      (avgDispersion < 50)  paletteSize = 4;
    else if (avgDispersion < 90)  paletteSize = 6;
    else if (avgDispersion < 140) paletteSize = 10;
    else                          paletteSize = 14;

    let palette;
    try {
        palette = colorThief.getPalette(imgElement, paletteSize);
    } catch (e) {
        palette = rawPalette;
    }

    // Score chaque couleur (dominance + saturation, pénalité si trop noir/blanc)
    const scored = palette.map((c, i) => {
        const dominance  = 1 - (i / palette.length);
        const sat        = getSaturation(c) / 255;
        const lum        = getLuminance(c);
        const lumPenalty = (lum < 15 || lum > 220) ? 0.3 : 1.0;
        const score      = (dominance * 0.6 + sat * 0.4) * lumPenalty;
        return { c, score, lum };
    }).sort((a, b) => b.score - a.score);

    // c1 = couleur la mieux scorée
    const newC1 = scored[0].c;

    // c2 = couleur suffisamment différente de c1 (distance > 80) et saturée
    const newC2 =
        scored.find(({ c }, i) => {
            if (i === 0) return false;
            const d = Math.sqrt(
                (c[0]-newC1[0])**2 + (c[1]-newC1[1])**2 + (c[2]-newC1[2])**2
            );
            return d > 80 && getSaturation(c) > 40;
        })?.c ||
        scored.find(({ c }, i) => {
            if (i === 0) return false;
            const d = Math.sqrt(
                (c[0]-newC1[0])**2 + (c[1]-newC1[1])**2 + (c[2]-newC1[2])**2
            );
            return d > 50;
        })?.c ||
        scored[1]?.c || newC1;

    // c3 = couleur la plus sombre de la palette (pour les ombres/fond)
    const newC3 = [...palette].sort((a, b) => getLuminance(a) - getLuminance(b))[0];

    // Luminance moyenne de toute la palette
    const avgLum = palette.reduce((sum, c) => sum + getLuminance(c), 0) / palette.length;

    console.log(`Dispersion: ${avgDispersion.toFixed(1)} → paletteSize: ${paletteSize}`);

    startColorTransition(newC1, newC2, newC3, avgLum);
}
// ========================================
// UPDATE UI — met à jour texte + pochette
// ========================================
function updateUI(data) {
    if (!data) return;

    // Mise à jour du texte à chaque poll
    document.getElementById("title").textContent  = data.title  || "–";
    document.getElementById("artist").textContent = data.artist || "–";
    document.getElementById("album").textContent  = data.album  || "–";

    // Pochette — ignorée si URL identique à la précédente
    const newURL = data.cover_url;
    if (!newURL || newURL === currentCoverURL) return;
    currentCoverURL = newURL;

    // Charge la nouvelle pochette dans cover-front (invisible)
    coverFront.crossOrigin      = "anonymous";
    coverFront.style.transition = "none";
    coverFront.style.opacity    = "0";

    coverFront.onload = () => {
        // Extraction des couleurs dès que l'image est chargée
        updateBackgroundFromCover(coverFront);

        requestAnimationFrame(() => {
            // Fondu : front apparaît, back disparaît
            coverFront.style.transition = "opacity 0.8s ease";
            coverFront.style.opacity    = "1";
            coverBack.style.transition  = "opacity 0.8s ease";
            coverBack.style.opacity     = "0";

            // Après le fondu : back prend l'image, front redevient invisible
            setTimeout(() => {
                coverBack.crossOrigin       = "anonymous";
                coverBack.src               = newURL;
                coverBack.style.transition  = "none";
                coverBack.style.opacity     = "1";
                coverFront.style.transition = "none";
                coverFront.style.opacity    = "0";
            }, 850);
        });
    };

    coverFront.src = newURL;
}

// ========================================
// EFFETS PRINCIPAUX (bouton styleBtn)
// ========================================
const effects = ["float", "wave", "pulse"];
let effectIndex  = 0;
let currentEffect = "float";

// Applique un effet principal (float, wave ou flame)
function applyEffect(name) {
    currentEffect = name;
    container.classList.remove("effect-float", "effect-wave", "effect-pulse");
    container.classList.add("effect-" + name);
    styleBtn.textContent = name.charAt(0).toUpperCase() + name.slice(1);

    // Réapplique les couleurs si déjà extraites
    if (currentBoosted.c1) {
        applyColorsRaw(currentBoosted.c1, currentBoosted.c2, currentBoosted.c3);
    }
}

// Cycle au clic
styleBtn.onclick = () => {
    effectIndex = (effectIndex + 1) % effects.length;
    applyEffect(effects[effectIndex]);
};

// Effet par défaut au démarrage
applyEffect("float");

// ========================================
// LOOP — poll API toutes les 2 secondes
// ========================================
async function fetchNowPlaying() {
    try {
        const res  = await fetch("http://127.0.0.1:3000/now-playing");
        const data = await res.json();
        updateUI(data);
    } catch (e) {
        console.error("Erreur API:", e);
    }
}

setInterval(fetchNowPlaying, 2000);
fetchNowPlaying();
