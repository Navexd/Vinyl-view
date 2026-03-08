// main.js
const { app, BrowserWindow, shell, powerMonitor, Tray, Menu, nativeImage, ipcMain } = require('electron');
const { spawn } = require('child_process');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// --- Compat electron-is-dev robuste ---
const _isDevRaw = require('electron-is-dev');
const isDev = (_isDevRaw && typeof _isDevRaw === 'object' && 'default' in _isDevRaw)
    ? _isDevRaw.default
    : _isDevRaw;

// --- Variables globales ---
let backend;
let win;
let tray;
let idleCheckInterval;
let screensaverAutoEnabled = true;

const BACKEND_BASE_URL = 'http://127.0.0.1:3000';
const IDLE_TIMEOUT = 30; // secondes d'inactivité

//
// -------- LOG SYSTEM --------
//

const logDir = path.join(app.getPath("userData"), "log");

if (!fs.existsSync(logDir)) {
    try { fs.mkdirSync(logDir, { recursive: true }); }
    catch (e) { console.error("Erreur création logDir:", e); }
}

const logFile = path.join(logDir, "electron.log");

function log(...args) {
    const safe = args.map(a => {
        try { return typeof a === "string" ? a : JSON.stringify(a); }
        catch { return String(a); }
    }).join(" ");

    try { fs.appendFileSync(logFile, safe + "\n"); }
    catch (e) { console.error("LOG ERROR:", e); }

    console.log(safe);
}

log("=== Electron démarré ===");
log("isDev:", isDev);
log("__dirname:", __dirname);
log("process.resourcesPath:", process.resourcesPath);

//
// -------- PATHS --------
//

function getBackendPath() {
    const exeName = process.platform === "win32" ? "backend.exe" : "backend";
    return isDev
        ? path.join(__dirname, "backend", exeName)
        : path.join(process.resourcesPath, "backend", exeName);
}

function getRendererPath() {
    return isDev
        ? path.join(__dirname, "renderer", "index.html")
        : path.join(process.resourcesPath, "renderer", "index.html");
}

function getPreloadPath() {
    return isDev
        ? path.join(__dirname, "renderer", "preload.js")
        : path.join(process.resourcesPath, "renderer", "preload.js");
}

function getIconPath() {
    return isDev
        ? path.join(__dirname, "assets", "vinyl.png")
        : path.join(process.resourcesPath, "assets", "vinyl.png");
}

function getTrayIconPath() {
    return isDev
        ? path.join(__dirname, "assets", "4.png")
        : path.join(process.resourcesPath, "assets", "4.png");
}

function isAllowedUrl(targetUrl) {
    try {
        const url = new URL(targetUrl);
        return (
            url.origin === 'https://accounts.spotify.com' ||
            targetUrl.startsWith(`${BACKEND_BASE_URL}/login`) ||
            targetUrl.startsWith(`${BACKEND_BASE_URL}/callback`) ||
            targetUrl.startsWith(`${BACKEND_BASE_URL}/done`)
        );
    } catch {
        return false;
    }
}

//
// -------- SCREENSAVER HELPERS --------
//

function showWindow() {
    if (!win) return;
    win.setFullScreen(false);
    win.show();
    win.setSkipTaskbar(false);
    win.focus();
}

function activateScreensaver() {
    if (!win) return;
    log("🌙 Tentative activation screensaver...");

    win.setSkipTaskbar(false);
    win.show();
    win.restore();          // au cas où elle est minimisée
    win.setFullScreen(true);
    win.setAlwaysOnTop(true, 'screen-saver');  // passe au-dessus de tout
    win.focus();
    win.moveTop();

    // Retire le alwaysOnTop après 1s (pour pas bloquer l'utilisateur)
    setTimeout(() => {
        if (win) win.setAlwaysOnTop('normal');
    }, 1000);

    win.webContents.send('screensaver-activate');
    log("🌙 Screensaver activé");
}

function deactivateScreensaver() {
    if (!win) return;
    log("☀️ Screensaver désactivé");
    win.setFullScreen(false);
    win.webContents.send('screensaver-deactivate');
}

//
// -------- IDLE WATCHER (SCREENSAVER AUTO) --------
//

function getIdleTime() {
    return powerMonitor.getSystemIdleTime();
}

let lastInputTime = Date.now();

function startIdleWatcher() {
    // Écouter les événements d'entrée utilisateur sur la fenêtre
    const resetIdle = () => { lastInputTime = Date.now(); };

    win.on('move', resetIdle);
    win.on('resize', resetIdle);
    win.on('focus', resetIdle);

    // Écouter depuis le renderer (souris/clavier)
    ipcMain.on('user-activity', resetIdle);

    idleCheckInterval = setInterval(() => {
        const idleSeconds = Math.floor((Date.now() - lastInputTime) / 1000);
        log(`🕐 Idle: ${idleSeconds}s | auto=${screensaverAutoEnabled}`);

        if (!screensaverAutoEnabled) return;

        if (idleSeconds >= IDLE_TIMEOUT && win && !win.isFullScreen()) {
            log("💤 Activation screensaver");
            activateScreensaver();
        }
    }, 10000);
}


function stopIdleWatcher() {
    if (idleCheckInterval) {
        clearInterval(idleCheckInterval);
        idleCheckInterval = null;
    }
}

//
// -------- IPC SCREENSAVER --------
//

ipcMain.on('deactivate-screensaver', () => {
    log("🖱 Activité détectée — désactivation screensaver");
    deactivateScreensaver();
});

//
// -------- SYSTEM TRAY --------
//

function createTray() {
    const iconPath = getTrayIconPath();

    let icon;
    if (fs.existsSync(iconPath)) {
        icon = nativeImage.createFromPath(iconPath);
    } else {
        log("⚠ Icône tray introuvable:", iconPath);
        icon = nativeImage.createEmpty();
    }

    tray = new Tray(icon);
    tray.setToolTip('Vinyl View');

    updateTrayMenu();

    tray.on('double-click', () => {
        showWindow();
    });
}

function updateTrayMenu() {
    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Afficher',
            click: () => showWindow()
        },
        {
            label: 'Activer screensaver',
            click: () => activateScreensaver()
        },
        { type: 'separator' },
        {
            label: `Screensaver auto : ${screensaverAutoEnabled ? 'ON' : 'OFF'}`,
            click: () => {
                screensaverAutoEnabled = !screensaverAutoEnabled;
                updateTrayMenu();
                log(`Screensaver auto: ${screensaverAutoEnabled ? 'ON' : 'OFF'}`);

                if (screensaverAutoEnabled) {
                    startIdleWatcher();
                } else {
                    stopIdleWatcher();
                }
            }
        },
        { type: 'separator' },
        {
            label: 'Quitter',
            click: () => {
                app.isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setContextMenu(contextMenu);
}

//
// -------- ELECTRON WINDOW --------
//

function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        skipTaskbar: true,
        webPreferences: {
            preload: getPreloadPath(),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: true
        }
    });

    if (!isDev) {
        win.setMenuBarVisibility(true);
        win.removeMenu();
    }

    // F11 fullscreen support
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11' && input.type === 'keyDown') {
            event.preventDefault();
            win.setFullScreen(!win.isFullScreen());
        }
    });

    // Escape quitte le fullscreen et cache la fenêtre
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape' && input.type === 'keyDown' && win.isFullScreen()) {
            event.preventDefault();
            win.setFullScreen(false);
            win.hide();
            win.setSkipTaskbar(true);
        }
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedUrl(url)) {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    width: 500,
                    height: 700,
                    autoHideMenuBar: true,
                    webPreferences: {
                        nodeIntegration: false,
                        contextIsolation: true,
                        sandbox: true,
                        webSecurity: true
                    }
                }
            };
        }

        log("⛔ Popup bloquée:", url);
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        const rendererPath = getRendererPath();
        const fileUrl = new URL(`file://${rendererPath}`);

        if (url !== fileUrl.href) {
            event.preventDefault();
            if (isAllowedUrl(url)) {
                shell.openExternal(url).catch((err) => log("Erreur shell.openExternal:", err));
            } else {
                log("⛔ Navigation bloquée:", url);
            }
        }
    });

    // Empêcher la fermeture — juste cacher
    win.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            win.hide();
            win.setSkipTaskbar(true);
        }
    });

    const rendererPath = getRendererPath();
    log("Renderer path:", rendererPath);

    if (!fs.existsSync(rendererPath)) {
        log("❌ Renderer introuvable");
        win.loadURL(
            "data:text/html,<h1>Erreur: renderer introuvable</h1><p>" +
            rendererPath +
            "</p>"
        );
        return;
    }

    try {
        win.loadFile(rendererPath);
    } catch (e) {
        log("Erreur loadFile:", e);
        win.loadURL("data:text/html,<h1>Erreur lors du chargement du renderer</h1><pre>" + String(e) + "</pre>");
    }
}

//
// -------- BACKEND LAUNCH --------
//

function startBackend() {
    const backendPath = getBackendPath();
    log("Backend path:", backendPath);

    if (!fs.existsSync(backendPath)) {
        log("❌ Backend introuvable !");
        return;
    }

    if (process.platform !== "win32") {
        try {
            fs.chmodSync(backendPath, 0o755);
            log("✔ Permissions OK pour le backend");
        } catch (e) {
            log("⚠ Impossible de mettre +x :", e);
        }
    }

    backend = spawn(backendPath, [], {
        cwd: path.dirname(backendPath),
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    backend.stdout.on("data", (d) => log("[backend]", d.toString()));
    backend.stderr.on("data", (d) => log("[backend ERR]", d.toString()));
    backend.on("close", (code, signal) => log("Backend arrêté, code:", code, "signal:", signal));
    backend.on("error", (err) => log("Erreur lancement backend:", err));
}

//
// -------- APP EVENTS --------
//

app.isQuitting = false;

app.on('before-quit', () => {
    app.isQuitting = true;
});

app.whenReady().then(() => {
    startBackend();
    createWindow();
    createTray();
    startIdleWatcher()
    // Le idle watcher ne démarre que quand "Screensaver auto" est activé

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
    stopIdleWatcher();
    if (backend) backend.kill();
});
