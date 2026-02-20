// ========================================
// ELEMENTS
// ========================================
const coverFront = document.getElementById("cover-front");
const coverBack  = document.getElementById("cover-back");

const container = document.getElementById("bg-container");
const styleBtn  = document.getElementById("styleBtn");
const shapeBtn  = document.getElementById("shapeBtn");

// ========================================
// COLOR STATE
// ========================================
let currentCoverURL = "";
let currentColors  = { c1: null, c2: null, c3: null };
let currentBoosted = { c1: null, c2: null, c3: null };
let animFrame = null;
let animStart = null;
const TRANSITION_DURATION = 1200;

// ========================================
// COLOR UTILS
// ========================================
function getLuminance([r, g, b]) {
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function getSaturation([r, g, b]) {
    return Math.max(r, g, b) - Math.min(r, g, b);
}

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
// COLOR INTERPOLATION
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

function animateColors(from, to, avgLum) {
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
            currentBoosted = { c1: to.c1, c2: to.c2, c3: to.c3 };
            animFrame = null;
        }
    }

    animFrame = requestAnimationFrame(step);
}

// ========================================
// APPLY COLORS (RAW → CSS VARS)
// ========================================
function applyColorsRaw(c1, c2, c3) {
    document.documentElement.style.setProperty("--c1", `rgb(${c1.join(",")})`);
    document.documentElement.style.setProperty("--c2", `rgb(${c2.join(",")})`);
    document.documentElement.style.setProperty("--c3", `rgb(${c3.join(",")})`);

    if (currentEffect === "float") {
        updateShapeGradient(currentSubEffect());
    }
}

// ========================================
// TRANSITION ENTRY POINT
// ========================================
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
    animateColors(from, to, avgLum);
}

// ========================================
// COLOR EXTRACTION
// ========================================
function updateBackgroundFromCover_from(imgElement) {
    const colorThief = new ColorThief();

    let rawPalette;
    try {
        rawPalette = colorThief.getPalette(imgElement, 5);
    } catch (e) {
        console.warn("ColorThief erreur:", e);
        return;
    }

    // Calcul dispersion
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

    let paletteSize;
    if (avgDispersion < 50)       paletteSize = 4;
    else if (avgDispersion < 90)  paletteSize = 6;
    else if (avgDispersion < 140) paletteSize = 10;
    else                          paletteSize = 14;

    let palette;
    try {
        palette = colorThief.getPalette(imgElement, paletteSize);
    } catch (e) {
        palette = rawPalette;
    }

    const scored = palette.map((c, i) => {
        const dominance = 1 - (i / palette.length);
        const sat = getSaturation(c) / 255;
        const lum = getLuminance(c);
        const lumPenalty = (lum < 15 || lum > 220) ? 0.3 : 1.0;
        const score = (dominance * 0.6 + sat * 0.4) * lumPenalty;
        return { c, score, dominance, sat, lum };
    });

    scored.sort((a, b) => b.score - a.score);

    const newC1 = scored[0].c;

    const newC2 = scored.find(({ c }, i) => {
        if (i === 0) return false;
        const dr = c[0] - scored[0].c[0];
        const dg = c[1] - scored[0].c[1];
        const db = c[2] - scored[0].c[2];
        const dist = Math.sqrt(dr*dr + dg*dg + db*db);
        return dist > 80 && getSaturation(c) > 40;
    })?.c || scored.find(({ c }, i) => {
        if (i === 0) return false;
        const dr = c[0] - scored[0].c[0];
        const dg = c[1] - scored[0].c[1];
        const db = c[2] - scored[0].c[2];
        return Math.sqrt(dr*dr + dg*dg + db*db) > 50;
    })?.c || scored[1]?.c || scored[0].c;

    const newC3 = [...palette]
        .sort((a, b) => getLuminance(a) - getLuminance(b))[0];

    const avgLum = palette.reduce((sum, c) => sum + getLuminance(c), 0) / palette.length;

    console.log(`Dispersion: ${avgDispersion.toFixed(1)} → paletteSize: ${paletteSize}`);

    startColorTransition(newC1, newC2, newC3, avgLum);
}
function applyMarqueeIfNeeded(el) {
    // Récupère le texte brut stocké en data
    const text = el.dataset.text || el.textContent;
    el.dataset.text = text; // sauvegarde le texte original

    // Reset
    el.classList.remove("scrolling");
    el.textContent = text;

    // Vérifie si le texte dépasse (après reset)
    requestAnimationFrame(() => {
        if (el.scrollWidth > el.clientWidth) {
            el.classList.add("scrolling");
            const span = document.createElement("span");
            span.textContent = text + "          " + text;
            el.innerHTML = "";
            el.appendChild(span);
        }
    });
}

// ========================================
// UPDATE UI
// ========================================
function updateUI(data) {
    if (!data) return;

    // Texte — toujours mis à jour
    document.getElementById("title").textContent  = data.title  || "–";
    document.getElementById("artist").textContent = data.artist || "–";
    document.getElementById("album").textContent  = data.album  || "–";

    // Cover — seulement si changée
    const newURL = data.cover_url;
    if (!newURL || newURL === currentCoverURL) return;
    currentCoverURL = newURL;

    coverFront.crossOrigin  = "anonymous";
    coverFront.style.transition = "none";
    coverFront.style.opacity    = "0";

    coverFront.onload = () => {
        updateBackgroundFromCover_from(coverFront);

        requestAnimationFrame(() => {
            coverFront.style.transition = "opacity 0.8s ease";
            coverFront.style.opacity    = "1";
            coverBack.style.transition  = "opacity 0.8s ease";
            coverBack.style.opacity     = "0";

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
// SHAPES & SUB-EFFECTS
// ========================================
const floatSubEffects = ["radial", "aurora", "blobs", "noise", "vignette"];
let currentEffect = "float";
let subIndex = 0;

function currentSubEffect() {
    return floatSubEffects[subIndex % floatSubEffects.length];
}

function updateShapeButton() {
    const name = currentSubEffect();
    shapeBtn.textContent = name.charAt(0).toUpperCase() + name.slice(1);
}

shapeBtn.onclick = () => {
    subIndex = (subIndex + 1) % floatSubEffects.length;
    updateShapeButton();
    updateShapeGradient(currentSubEffect());
};

function updateShapeGradient(shape) {
    let gradient = "";

    switch (shape) {
        case "radial":
            gradient = `
                radial-gradient(ellipse at 50% 40%, var(--c1) 0%, transparent 55%),
                radial-gradient(ellipse at 30% 70%, var(--c2) 0%, transparent 50%),
                radial-gradient(ellipse at 70% 70%, var(--c3) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 100%, #000 0%, transparent 70%)
            `;
            break;

        case "aurora":
            gradient = `
                radial-gradient(ellipse at 20% 60%, var(--c1) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 40%, var(--c2) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 80%, var(--c3) 0%, transparent 45%),
                radial-gradient(ellipse at 50% 100%, #000 0%, transparent 70%)
            `;
            break;

        case "blobs":
            gradient = `
                radial-gradient(circle at 30% 40%, var(--c1) 0%, transparent 45%),
                radial-gradient(circle at 70% 60%, var(--c2) 0%, transparent 45%),
                radial-gradient(circle at 50% 80%, var(--c3) 0%, transparent 50%),
                radial-gradient(circle at 50% 50%, transparent 40%, #000 100%)
            `;
            break;

        case "noise":
            gradient = `
                radial-gradient(circle at 40% 40%, var(--c1) 0%, transparent 55%),
                radial-gradient(circle at 65% 55%, var(--c2) 0%, transparent 50%),
                radial-gradient(circle at 75% 20%, var(--c3) 0%, transparent 60%),
                radial-gradient(ellipse at 50% 50%, transparent 30%, #000 90%)
            `;
            break;

        case "vignette":
            gradient = `
                radial-gradient(circle at 50% 50%,
                    var(--c1) 0%,
                    var(--c1) 10%,
                    var(--c2) 40%,
                    var(--c3) 65%,
                    #000 100%)
            `;
            break;
    }

    document.documentElement.style.setProperty("--shape-gradient", gradient);
}

// ========================================
// EFFECT SWITCH (STYLE BTN)
// ========================================
const effects = ["float", "wave"];
let effectIndex = 0;

function applyEffect(name) {
    currentEffect = name;
    container.classList.remove("effect-float", "effect-wave");
    container.classList.add("effect-" + name);
    styleBtn.textContent = name.charAt(0).toUpperCase() + name.slice(1);
    subIndex = 0;
    updateShapeButton();

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
// LOOP
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
