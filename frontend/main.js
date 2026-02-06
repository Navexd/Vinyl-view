// main.js
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
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

//
// -------- LOG SYSTEM --------
//

// ✔ Enregistre les logs DANS appData, persistant en release
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

//
// -------- ELECTRON WINDOW --------
//
function createWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // ✔ Supprimer la barre de menu en version release
    if (!isDev) {
        win.setMenuBarVisibility(true);
        win.removeMenu();
    }

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
        detached: false
    });

    backend.stdout.on("data", (d) => log("[backend]", d.toString()));
    backend.stderr.on("data", (d) => log("[backend ERR]", d.toString()));
    backend.on("close", (code) => log("Backend arrêté, code:", code));
}

//
// -------- APP EVENTS --------
//
app.whenReady().then(() => {
    startBackend();
    createWindow();

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
    if (backend) backend.kill();
});
