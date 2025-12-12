// main.js
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// --- Compat electron-is-dev robuste (gère CommonJS et ESModule interop) ---
const _isDevRaw = require('electron-is-dev');
const isDev = (_isDevRaw && typeof _isDevRaw === 'object' && 'default' in _isDevRaw)
    ? _isDevRaw.default
    : _isDevRaw;

// --- Variables globals ---
let backend;
let win;

//
// -------- LOG SYSTEM --------
//

// On crée le dossier log dans process.cwd() (pas dans app.asar)
const logDir = path.join(process.cwd(), "log");
if (!fs.existsSync(logDir)) {
    try {
        fs.mkdirSync(logDir);
    } catch (e) {
        console.error("Erreur création logDir:", e);
    }
}

const logFile = path.join(logDir, "electron.log");

// Fonction log sécurisée
function log(...args) {
    const safe = args.map(a => {
        try {
            if (typeof a === "string") return a;
            return JSON.stringify(a);
        } catch {
            return String(a);
        }
    }).join(" ");

    try {
        fs.appendFileSync(logFile, safe + "\n");
    } catch (e) {
        console.error("LOG ERROR:", e);
    }

    console.log(safe);
}

log("=== Electron démarré ===");
log("isDev (raw):", _isDevRaw);
log("isDev (bool):", !!isDev);
log("__dirname:", __dirname);
log("process.resourcesPath:", process.resourcesPath);

//
// -------- PATHS --------
//
function getRendererPath() {
    return isDev
        ? path.join(__dirname, "renderer", "index.html")
        : path.join(process.resourcesPath, "renderer", "index.html");
}

function getBackendPath() {
    return isDev
        ? path.join(__dirname, "backend", "backend.exe")
        : path.join(process.resourcesPath, "backend", "backend.exe");
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

    // Utilise loadFile pour un fichier local
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

    backend = spawn(backendPath, [], {
        cwd: path.dirname(backendPath),
        detached: false
    });

    backend.stdout.on("data", (data) => log("[backend]", data.toString()));
    backend.stderr.on("data", (data) => log("[backend ERR]", data.toString()));
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
    if (process.platform !== "darwin") {
        app.quit();
    }
});

app.on("quit", () => {
    if (backend) backend.kill();
});
