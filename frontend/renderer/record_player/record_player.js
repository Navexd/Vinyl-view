// ========================================
// record_player.js — Composant tourne-disque
// Module IIFE exposant : init, setCover, play, pause
// ========================================

const RecordPlayer = (() => {

    // ── Éléments DOM ──
    let coverImg;
    let vinyl;
    let tonearmContainer;

    // ── État interne ──
    let rotation     = 0;      // Angle courant du vinyle (degrés)
    let currentSpeed = 0;      // Vitesse instantanée (degrés/frame)
    let targetSpeed  = 0;      // Vitesse cible (0 = arrêt, 2.5 = lecture)
    // let isPlaying    = false;

    // ========================================
    // INIT — Injecte le HTML et lance la boucle
    // ========================================
    function init(containerId) {
        const container = document.getElementById(containerId);
        if (!container) return;

        container.innerHTML = `
            <div id="turntable-wrapper">
                <div id="turntable-surface">
                    <div id="turntable">

                        <!-- Plateau + vinyle -->
                        <div class="platter">
                            <div class="vinyl">
                                <div class="groove groove-4"></div>
                                <div class="groove groove-1"></div>
                                <div class="groove groove-5"></div>
                                <div class="groove groove-2"></div>
                                <div class="groove groove-3"></div>
                                <div id="vinyl-label">
                                    <img id="record-cover" src="" alt="" />
                                </div>
                                <div id="vinyl-hole"></div>
                            </div>
                            <div class="vinyl-reflection"></div>
                        </div>

                        <!-- Bras de lecture -->
                        <div id="tonearm-container">
                            <div id="tonearm-base"></div>
                            <div id="tonearm-pivot"></div>
                            <div id="tonearm">
                                <div id="tonearm-head"></div>
                            </div>
                        </div>

                    </div>

                    <!-- Boutons & indicateurs décoratifs -->
                    <div id="knob-3"></div>
                    <div id="knob-2"></div>
                    <div id="speed-knob"></div>
                    <div id="power-indicator"></div>
                </div>
            </div>
        `;

        // Références DOM
        coverImg         = container.querySelector("#record-cover");
        vinyl            = container.querySelector(".vinyl");
        tonearmContainer = container.querySelector("#tonearm-container");

        // Démarre la boucle d'animation
        animate();
    }

    // ========================================
    // POCHETTE — Change l'image du label central
    // ========================================
    function setCover(url) {
        if (!url || !coverImg) return;
        coverImg.src = url;
    }

    // ========================================
    // BOUCLE D'ANIMATION
    // Interpole currentSpeed → targetSpeed pour
    // une accélération / décélération progressive
    // ========================================
    function animate() {
        // Lissage exponentiel (facteur 0.05 = inertie réaliste)
        currentSpeed += (targetSpeed - currentSpeed) * 0.05;

        // On ne touche au DOM que si le disque tourne encore
        if (currentSpeed > 0.01) {
            rotation += currentSpeed;
            if (vinyl) {
                vinyl.style.transform = `rotate(${rotation}deg)`;
            }
        }

        requestAnimationFrame(animate);
    }

    // ========================================
    // PLAY — Lance la rotation + pose le bras
    // ========================================
    function play() {
        targetSpeed = 2.5;

        // Bras sur le disque
        if (tonearmContainer) {
            tonearmContainer.style.transform = "rotate(22deg)";
        }

        // LED verte allumée
        const led = document.querySelector("#power-indicator");
        if (led) led.classList.add("active");
    }

    // ========================================
    // PAUSE — Décélère + relève le bras
    // ========================================
    function pause() {
        targetSpeed = 0;

        // Bras au repos
        if (tonearmContainer) {
            tonearmContainer.style.transform = "rotate(0deg)";
        }

        // LED éteinte
        const led = document.querySelector("#power-indicator");
        if (led) led.classList.remove("active");
    }

    // ── API publique ──
    return { init, setCover, play, pause };
})();
