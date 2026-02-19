
// ========================================
// ELEMENTS
// ========================================
const cover = document.getElementById("cover");
const title = document.getElementById("title");
const artist = document.getElementById("artist");
const album = document.getElementById("album");

const container = document.getElementById("bg-container");
const styleBtn = document.getElementById("styleBtn");
const shapeBtn = document.getElementById("shapeBtn");

// ========================================
// COLOR STATE
// ========================================
let currentColors = { c1: null, c2: null, c3: null };

// ========================================
// COLOR UTILS
// ========================================
function getLuminance([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getSaturation([r, g, b]) {
    return Math.max(r, g, b) - Math.min(r, g, b);
}

/**
 * Booste une couleur avec un facteur adaptatif.
 * Le 'role' différencie les couleurs :
 *   - "light" (c1) : boostée au max
 *   - "mid" (c2) : boost modéré
 *   - "dark" (c3) : assombrie pour créer du contraste
 */
function boostColor(color, avgLum, role = "light") {
    let factor;

    if (avgLum < 30) {
        factor = role === "light" ? 3.2 : role === "mid" ? 2.4 : 1.6;
    } else if (avgLum < 60) {
        factor = role === "light" ? 2.4 : role === "mid" ? 1.7 : 1.1;
    } else if (avgLum < 100) {
        factor = role === "light" ? 1.5 : role === "mid" ? 1.1 : 0.75;
    } else if (avgLum < 150) {
        factor = role === "light" ? 1.2 : role === "mid" ? 0.9 : 0.65;
    } else {
        factor = role === "light" ? 0.95 : role === "mid" ? 0.75 : 0.55;
    }

    let [r, g, b] = color.map(v => Math.min(255, Math.round(v * factor)));

    // Garantie minimum pour les couleurs light et mid
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
// BACKGROUND UPDATE (ColorThief)
// ========================================
function updateBackgroundFromCover() {
    const colorThief = new ColorThief();

    let rawPalette;
    try {
        rawPalette = colorThief.getPalette(cover, 16);
    } catch (e) {
        console.error("ColorThief ERROR:", e);
        return;
    }

    if (!rawPalette || rawPalette.length === 0) {
        applyColors([60,60,60], [40,40,40], [20,20,20], 30);
        return;
    }

    // Mesurer la dispersion pour adapter la palette
    let totalDistance = 0;
    let pairs = 0;
    for (let i = 0; i < rawPalette.length; i++) {
        for (let j = i + 1; j < rawPalette.length; j++) {
            const dr = rawPalette[i][0] - rawPalette[j][0];
            const dg = rawPalette[i][1] - rawPalette[j][1];
            const db = rawPalette[i][2] - rawPalette[j][2];
            totalDistance += Math.sqrt(dr*dr + dg*dg + db*db);
            pairs++;
        }
    }
    const avgDispersion = totalDistance / pairs;

    let paletteSize;
    if (avgDispersion < 50)       paletteSize = 4;
    else if (avgDispersion < 90)  paletteSize = 6;
    else if (avgDispersion < 140) paletteSize = 10;
    else                          paletteSize = 14;

    let palette;
    try {
        palette = colorThief.getPalette(cover, paletteSize);
    } catch (e) {
        palette = rawPalette;
    }

    // ColorThief retourne les couleurs dans l'ordre de dominance (index 0 = plus présente)
    // On crée un score qui combine dominance + saturation
    // La dominance est inversement proportionnelle à l'index
    const scored = palette.map((c, i) => {
        const dominance = 1 - (i / palette.length); // 1.0 → 0.0
        const sat = getSaturation(c) / 255;         // 0.0 → 1.0
        const lum = getLuminance(c);

        // Pénaliser les couleurs trop sombres ou trop claires pour c1/c2
        const lumPenalty = (lum < 15 || lum > 220) ? 0.3 : 1.0;

        // Score = 60% dominance + 40% saturation, avec pénalité luminosité
        const score = (dominance * 0.6 + sat * 0.4) * lumPenalty;

        return { c, score, dominance, sat, lum };
    });

    scored.sort((a, b) => b.score - a.score);

    // c1 = meilleur score (dominante + vivante)
    currentColors.c1 = scored[0].c;

    // c2 = suffisamment différente de c1 ET bon score
    currentColors.c2 = scored.find(({ c }, i) => {
        if (i === 0) return false;
        const dr = c[0] - scored[0].c[0];
        const dg = c[1] - scored[0].c[1];
        const db = c[2] - scored[0].c[2];
        return Math.sqrt(dr*dr + dg*dg + db*db) > 50;
    })?.c || scored[1]?.c || scored[0].c;

    // c3 = la plus sombre de toute la palette pour la profondeur
    currentColors.c3 = [...palette]
        .sort((a, b) => getLuminance(a) - getLuminance(b))[0];

    const avgLum = palette.reduce((sum, c) => sum + getLuminance(c), 0) / palette.length;

    // Log détaillé
    console.log(`Dispersion: ${avgDispersion.toFixed(1)} → paletteSize: ${paletteSize}`);
    scored.forEach(({ c, score, dominance, sat }, i) => {
        const hex = '#' + c.map(v => v.toString(16).padStart(2,'0')).join('');
        console.log(`  [${i}] ${hex} | score: ${score.toFixed(2)} | dom: ${dominance.toFixed(2)} | sat: ${(sat*255).toFixed(0)}`);
    });
    console.log(`c1: rgb(${currentColors.c1}) | c2: rgb(${currentColors.c2}) | c3: rgb(${currentColors.c3})`);

    applyColors(currentColors.c1, currentColors.c2, currentColors.c3, avgLum);
}



function applyColors(c1, c2, c3, avgLum) {
    const boosted1 = boostColor(c1, avgLum, "light");
    const boosted2 = boostColor(c2, avgLum, "mid");
    const boosted3 = boostColor(c3, avgLum, "dark");

    document.documentElement.style.setProperty("--c1", `rgb(${boosted1.join(",")})`);
    document.documentElement.style.setProperty("--c2", `rgb(${boosted2.join(",")})`);
    document.documentElement.style.setProperty("--c3", `rgb(${boosted3.join(",")})`);

    // Float : applique le sous-effet choisi
    // Wave : le CSS gère directement les gradients par layer
    if (currentEffect === "float") {
        updateShapeGradient(currentSubEffect());
    }
}

// ========================================
// UPDATE UI
// ========================================
let lastCoverUrl = "";

function updateUI(data) {
    if (!data) return;

    title.textContent = data.title || "";
    artist.textContent = data.artist || "";
    album.textContent = data.album || "";

    if (data.cover_url === lastCoverUrl) return;
    lastCoverUrl = data.cover_url;

    cover.classList.add("fade");

    fetch(data.cover_url)
        .then(res => res.blob())
        .then(blob => {
            const localURL = URL.createObjectURL(blob);
            cover.src = localURL;

            cover.onload = () => {
                cover.classList.remove("fade");
                updateBackgroundFromCover();
            };
        })
        .catch(err => {
            console.error("Erreur chargement cover :", err);
        });
}

// ========================================
// SHAPES & SUB-EFFECTS
// ========================================
const floatSubEffects = ["radial", "aurora", "blobs", "noise", "vignette"];

let currentEffect = "float";
let subIndex = 0;

function currentSubEffect() {
    return floatSubEffects[subIndex];
}

// ========================================
// UPDATE SHAPE BUTTON
// ========================================
function updateShapeButton() {
    const name = floatSubEffects[subIndex];
    shapeBtn.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    shapeBtn.style.display = currentEffect === "float" ? "" : "none";

    if (currentEffect === "float") {
        updateShapeGradient(name);
    }
}

// ========================================
// BUTTON CLICK (SOUS-EFFET)
// ========================================
shapeBtn.onclick = () => {
    subIndex = (subIndex + 1) % floatSubEffects.length;
    updateShapeButton();
};

// ========================================
// SHAPE GRADIENT (FLOAT)
// ========================================
function updateShapeGradient(type) {
    let gradient = "";

    switch (type) {
        case "radial":
            gradient = `radial-gradient(circle, var(--c1), var(--c2), var(--c3))`;
            break;

        case "aurora":
            gradient = `
                radial-gradient(ellipse at 20% 30%, var(--c1), transparent 60%),
                radial-gradient(ellipse at 80% 70%, var(--c2), transparent 65%),
                radial-gradient(circle at 50% 50%, var(--c3), transparent 70%)
            `;
            break;

        case "blobs":
            gradient = `
                radial-gradient(circle at 30% 40%, var(--c1), transparent 55%),
                radial-gradient(circle at 70% 60%, var(--c2), transparent 55%),
                radial-gradient(circle at 50% 80%, var(--c3), transparent 60%)
            `;
            break;

        case "noise":
            gradient = `
                radial-gradient(circle at 40% 40%, var(--c1), transparent 70%),
                radial-gradient(circle at 60% 60%, var(--c2), transparent 65%),
                radial-gradient(circle at 80% 20%, var(--c3), transparent 80%)
            `;
            break;

        case "vignette":
            gradient = `
                radial-gradient(circle at 50% 50%,
                var(--c1) 0%,
                var(--c2) 35%,
                var(--c3) 100%)
            `;
            break;
    }

    document.documentElement.style.setProperty("--shape-gradient", gradient);
}

// ========================================
// EFFECT SWITCH (STYLE BTN)
// ========================================
const effects = ["float", "wave"];
let index = 0;

function applyEffect(name) {
    currentEffect = name;

    container.classList.remove("effect-float", "effect-wave");
    container.classList.add("effect-" + name);

    styleBtn.textContent = name.charAt(0).toUpperCase() + name.slice(1);

    subIndex = 0;
    updateShapeButton();

    if (currentColors.c1) {
        const avgLum = [currentColors.c1, currentColors.c2, currentColors.c3]
            .reduce((sum, c) => sum + getLuminance(c), 0) / 3;
        applyColors(currentColors.c1, currentColors.c2, currentColors.c3, avgLum);
    }
}

styleBtn.onclick = () => {
    index = (index + 1) % effects.length;
    applyEffect(effects[index]);
};

// Effet initial
applyEffect("float");

// ========================================
// LOOP
// ========================================
async function fetchNowPlaying() {
    try {
        const res = await fetch("http://127.0.0.1:3000/now-playing");
        const data = await res.json();
        updateUI(data);
    } catch (e) {
        console.error("Erreur API:", e);
    }
}

setInterval(fetchNowPlaying, 2500);
fetchNowPlaying();