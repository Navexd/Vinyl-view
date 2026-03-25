// ========================================
// record_player.js — Composant tourne-disque
// Version final 25/03/2026
// ========================================

const RecordPlayer = (() => {

    // ── Éléments DOM ──
    let coverImg;
    let vinyl;
    let tonearmContainer;
    let floatWrapper;

    // ── État interne ──
    let rotation     = 0;
    let currentSpeed = 0;
    let targetSpeed  = 0;
    let lastTime     = 0;
    let rafId        = null;
    let freezeTimer  = null;

    // ── Mode éco ──
    let ecoModeActive   = false;
    let ecoLastFrame    = 0;
    const ECO_TARGET_FPS = 30;
    const ECO_INTERVAL   = 1000 / ECO_TARGET_FPS; // ~33.3ms entre frames

    // ── Vitesses par contexte (degrés/seconde = RPM × 360 / 60) ──
    const SPEEDS = {
        playlist: 155,  // 33 RPM — playlists longues, rotation posée
        album:    235,  // 38 RPM — album, légèrement plus rapide
        single:   295,  // 45 RPM — single, perceptible sans excès
        unknown:  190,  // fallback → 33 RPM
    };

    // ========================================
    // INIT
    // ========================================
    function init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div id="turntable-wrapper">
                <div id="turntable-front"></div>
                <div id="turntable-surface">
                    <div id="turntable">

                        <div class="platter">
                            <div class="vinyl">

                                <div class="groove groove-4"></div>
                                <div class="groove groove-1"></div>
                                <div class="groove groove-5"></div>
                                <div class="groove groove-2"></div>
                                <div class="groove groove-3"></div>
                                <div class="vinyl-reflection"></div>

                                <div id="vinyl-label">
                                    <img id="record-cover" src="" alt="" />
                                </div>
                                <div id="vinyl-hole"></div>
                            </div>
                        </div>

                        <div id="tonearm-container">
                            <div id="tonearm-base"></div>
                            <div id="tonearm-pivot"></div>
                            <div id="tonearm">
                                <div id="tonearm-head"></div>
                            </div>
                        </div>

                    </div>

                    <div id="knob-3"></div>
                    <div id="knob-2"></div>
                    <div id="speed-knob"></div>
                    <div id="power-indicator"></div>
                </div>
            </div>
        `;

        coverImg         = container.querySelector("#record-cover");
        vinyl            = container.querySelector(".vinyl");
        tonearmContainer = container.querySelector("#tonearm-container");
        floatWrapper     = container.querySelector("#turntable-wrapper");

        lastTime = performance.now();
        rafId = requestAnimationFrame(animate);
    }

    // ========================================
    // POCHETTE
    // ========================================
    function setCover(url) {
        if (!url || !coverImg) return;
        coverImg.src = url;
    }

    // ========================================
    // BOUCLE D'ANIMATION
    // ========================================
    function animate(now) {
        if (document.hidden) {
            lastTime = now;
            rafId = requestAnimationFrame(animate);
            return;
        }

        // Mode éco : throttle à 30fps
        if (ecoModeActive) {
            if (now - ecoLastFrame < ECO_INTERVAL) {
                rafId = requestAnimationFrame(animate);
                return;
            }
            ecoLastFrame = now;
        }

        const deltaSeconds = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const smoothing = 1 - Math.pow(0.3, deltaSeconds * 60);
        currentSpeed += (targetSpeed - currentSpeed) * smoothing;

        if (currentSpeed > 0.01) {
            rotation += currentSpeed * deltaSeconds;
            if (vinyl) {
                vinyl.style.transform = `rotate(${rotation}deg)`;
            }
        }

        rafId = requestAnimationFrame(animate);
    }

    // ========================================
    // FREEZE FLOAT
    // ========================================
    function freezeFloat() {
        if (!floatWrapper) return;
        floatWrapper.classList.add('transition-freeze');
        clearTimeout(freezeTimer);
        freezeTimer = setTimeout(() => {
            if (floatWrapper) floatWrapper.classList.remove('transition-freeze');
        }, 900);
    }

    // ========================================
    // SET ECO MODE — active/désactive le throttle 30fps
    // Appelé par app.js quand l'IPC eco-mode-changed est reçu.
    // ========================================
    function setEcoMode(enabled) {
        ecoModeActive = enabled;
        if (!enabled) {
            ecoLastFrame = 0;
        }
    }

    // ========================================
    // PLAY / PAUSE
    // ========================================
    function play(context = 'unknown') {
        targetSpeed = SPEEDS[context] ?? SPEEDS.unknown;
        if (tonearmContainer) {
            tonearmContainer.style.transform = "rotate(22deg)";
        }
        const led = document.querySelector("#power-indicator");
        if (led) led.classList.add("active");
    }

    function pause() {
        targetSpeed = 0;
        if (tonearmContainer) {
            tonearmContainer.style.transform = "rotate(0deg)";
        }
        const led = document.querySelector("#power-indicator");
        if (led) led.classList.remove("active");
    }

    return { init, setCover, play, pause, freezeFloat, setEcoMode };
})();