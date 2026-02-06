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
// COLOR UTILS
// ========================================
function softRGB([r, g, b]) {
    return [
        Math.round(r * 0.85),
        Math.round(g * 0.85),
        Math.round(b * 0.85)
    ];
}

// ========================================
// BACKGROUND UPDATE (ColorThief)
// ========================================
function updateBackgroundFromCover() {
    const colorThief = new ColorThief();

    let palette;
    try {
        palette = colorThief.getPalette(cover, 5);
    } catch (e) {
        console.error("ColorThief ERROR:", e);
    }

    if (!palette || palette.length === 0) {
        document.documentElement.style.setProperty("--c1", "rgb(40,40,40)");
        document.documentElement.style.setProperty("--c2", "rgb(20,20,20)");
        document.documentElement.style.setProperty("--c3", "rgb(5,5,5)");
        updateShapeGradient(currentSubEffect());
        return;
    }

    const light = `rgb(${palette[0].map(v => Math.min(255, v + 20)).join(",")})`;
    const mid   = `rgb(${palette[1].join(",")})`;
    const dark  = `rgb(${palette[2].map(v => Math.round(v * 0.7)).join(",")})`;

    document.documentElement.style.setProperty("--c1", light);
    document.documentElement.style.setProperty("--c2", mid);
    document.documentElement.style.setProperty("--c3", dark);

    updateShapeGradient(currentSubEffect());
}

// ========================================
// UPDATE UI
// ========================================
function updateUI(data) {
    if (!data) return;

    title.textContent = data.title || "";
    artist.textContent = data.artist || "";
    album.textContent = data.album || "";

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
// SHAPES & SUB‑EFFECTS
// ========================================

// float = shapes graphiques
const floatSubEffects = ["radial", "aurora", "blobs", "noise", "vignette"];

// wave = sous‑modes animés
const waveSubEffects = ["ripple", "shoreline", "ocean", "refraction", "mist"];

let currentEffect = "float";  // effet principal
let subIndex = 0;             // sous‑effet index

function currentSubEffect() {
    return currentEffect === "float"
        ? floatSubEffects[subIndex]
        : waveSubEffects[subIndex];
}

// ========================================
// UPDATE SHAPE BUTTON
// ========================================
function updateShapeButton() {
    const list = currentEffect === "float" ? floatSubEffects : waveSubEffects;
    const name = list[subIndex];

    shapeBtn.textContent = name.charAt(0).toUpperCase() + name.slice(1);

    // applique un type aux classes
    document.documentElement.style.setProperty("--shape-type", name);

    // met à jour le gradient
    updateShapeGradient(name);

    // ajoute une classe pour les sous-effets WAVE
    container.classList.remove(
        "sub-ripple", "sub-shoreline", "sub-ocean", "sub-refraction", "sub-mist"
    );

    if (currentEffect === "wave") {
        container.classList.add("sub-" + name);
    }
}

// ========================================
// BUTTON CLICK (SOUS-EFFET)
// ========================================
shapeBtn.onclick = () => {
    const list = currentEffect === "float" ? floatSubEffects : waveSubEffects;
    subIndex = (subIndex + 1) % list.length;
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

    // NE PLUS ÉCRASER TOUTES LES CLASSES
    container.classList.remove("effect-float", "effect-wave");
    container.classList.add("effect-" + name);

    styleBtn.textContent = name.charAt(0).toUpperCase() + name.slice(1);

    subIndex = 0;
    updateShapeButton();
}

styleBtn.onclick = () => {
    index = (index + 1) % effects.length;
    applyEffect(effects[index]);
};

// effet initial
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
