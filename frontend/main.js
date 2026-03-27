// main.js
const { app, BrowserWindow, screen, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { loadSettings, getSetting, setSetting } = require('./settings');
const { logMain, logBackend, logSettings } = require('./src/logger');
const { getBackendPath, getIconPath, getRendererPath, getSetupPath, getSetupPreloadPath } = require('./src/utils');
const windowModule = require('./src/window');
const screensaver = require('./src/screensaver');
const trayModule = require('./src/tray');
const { getAboutInfo } = require('./src/ipc');

if (process.platform === 'win32') {
    app.setAppUserModelId('Vinyl View');
}

// --- GPU flags ---
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-features', 'CanvasOopRasterization');
app.commandLine.appendSwitch('num-raster-threads', '4');
app.commandLine.appendSwitch('enable-accelerated-2d-canvas');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

if (process.platform === 'win32') {
    app.commandLine.appendSwitch('use-angle', 'd3d11');
    app.commandLine.appendSwitch('enable-hardware-overlays', 'single-fullscreen');
    app.commandLine.appendSwitch('disable-background-timer-throttling');
}

if (process.platform === 'linux') {
    app.commandLine.appendSwitch('enable-features', 'VaapiVideoDecoder');
}

const settingsLog = (...args) => logSettings('info', ...args);

let backend = null;

// ──────────────────────────────────────
// AUTOLAUNCH
// ──────────────────────────────────────

function setAutoLaunch(enable) {
    if (process.platform === 'linux') {
        const autostartDir = path.join(app.getPath('home'), '.config', 'autostart');
        const desktopFile = path.join(autostartDir, 'vinylview.desktop');
        const appPath = process.env.APPIMAGE || app.getPath('exe');

        if (enable) {
            if (!fs.existsSync(autostartDir)) fs.mkdirSync(autostartDir, { recursive: true });
            const content = `[Desktop Entry]
Type=Application
Name=VinylView
Exec="${appPath}"
X-GNOME-Autostart-enabled=true
Terminal=false
`;
            fs.writeFileSync(desktopFile, content);
            logMain('info', 'Autostart créé:', desktopFile);
        } else {
            if (fs.existsSync(desktopFile)) fs.unlinkSync(desktopFile);
            logMain('info', 'Autostart supprimé');
        }
    } else {
        app.setLoginItemSettings({
            openAtLogin: enable,
            path: app.getPath('exe')
        });
    }
}

// ──────────────────────────────────────
// BACKEND LAUNCH
// ──────────────────────────────────────

function startBackend() {
    const originalPath = getBackendPath();
    logBackend('info', 'Backend path:', originalPath);

    if (!fs.existsSync(originalPath)) {
        logBackend('error', 'Backend introuvable !');
        return;
    }

    let backendPath = originalPath;
    if (process.platform !== "win32") {
        try {
            fs.chmodSync(backendPath, 0o755);
            logBackend('debug', 'Permissions OK');
        } catch (e) {
            logBackend('warn', 'chmod échoué, copie vers dossier writable...');
            const tmpDir = path.join(app.getPath('temp'), 'vinyl-view-backend');
            if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
            const tmpBackend = path.join(tmpDir, 'backend');
            fs.copyFileSync(originalPath, tmpBackend);
            fs.chmodSync(tmpBackend, 0o755);
            backendPath = tmpBackend;
            logBackend('info', 'Backend copié vers:', backendPath);
        }
    }

    backend = spawn(backendPath, [], {
        cwd: path.dirname(backendPath),
        detached: false,
        stdio: ['ignore', 'pipe', 'pipe']
    });

    backend.stdout.on("data", (d) => logBackend('info', d.toString().trim()));
    backend.stderr.on("data", (d) => logBackend('error', d.toString().trim()));
    backend.on("close", (code, signal) => logBackend('info', `Arrêté, code: ${code}, signal: ${signal}`));
    backend.on("error", (err) => logBackend('error', 'Erreur lancement:', err));
}

// ──────────────────────────────────────
// IPC SETUP
// ──────────────────────────────────────

ipcMain.handle('setup-save-client-id', async (_event, clientId) => {
    try {
        const configDir = path.join(
            process.platform === 'win32'
                ? process.env.APPDATA || os.homedir()
                : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')),
            'vinyl-view'
        );
        fs.mkdirSync(configDir, { recursive: true });
        const configPath = path.join(configDir, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify({ client_id: clientId }, null, 2));
        logMain('info', 'Client ID sauvegardé');
        return true;
    } catch (e) {
        logMain('error', 'Erreur sauvegarde Client ID:', e.message);
        return false;
    }
});

ipcMain.handle('setup-launch-app', async () => {
    if (backend && !backend.killed) {
        backend.kill('SIGTERM');
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    backend = null;
    startBackend();
    setTimeout(() => {
        const currentWin = windowModule.getWin();
        if (currentWin && !currentWin.isDestroyed()) {
            currentWin.loadFile(getRendererPath());
        }
    }, 1500);
    return true;
});

ipcMain.on('setup-open-external', (_event, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
});

// ──────────────────────────────────────
// HELPERS
// ──────────────────────────────────────

function isClientIdConfigured() {
    try {
        const configDir = path.join(
            process.platform === 'win32'
                ? process.env.APPDATA || os.homedir()
                : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')),
            'vinyl-view'
        );
        const configPath = path.join(configDir, 'config.json');
        if (!fs.existsSync(configPath)) return false;
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        return typeof config.client_id === 'string' && config.client_id.trim().length === 32;
    } catch {
        return false;
    }
}

// ──────────────────────────────────────
// APP EVENTS
// ──────────────────────────────────────

app.isQuitting = false;

app.on('before-quit', () => {
    app.isQuitting = true;
});

app.whenReady().then(() => {
    // Sécurité globale
    app.on('web-contents-created', (_event, contents) => {
        contents.on('will-attach-webview', (event) => {
            event.preventDefault();
            logMain('warn', 'Tentative webview bloquée');
        });
    });

    loadSettings(settingsLog);
    startBackend();

    windowModule.init({
        updateTrayMenu: () => trayModule.updateTrayMenu(),
        getIsScreensaverActive: () => screensaver.getIsScreensaverActive(),
        deactivateScreensaver: () => screensaver.deactivateScreensaver()
    });

    const win = windowModule.createWindow();

    screensaver.init(win, {
        syncEco: () => windowModule.syncEcoModeToRenderer(),
        updateTray: () => trayModule.updateTrayMenu()
    });

    trayModule.init(win, {
        showWindow: () => windowModule.showWindow(),
        syncEcoModeToRenderer: () => windowModule.syncEcoModeToRenderer(),
        getAboutInfo,
        screensaver
    });

    trayModule.createTray();

    screen.on('display-added', (_event, newDisplay) => {
        logMain('info', `Écran branché: ${newDisplay.id}`);
        trayModule.updateTrayMenu();
    });

    screen.on('display-removed', (_event, oldDisplay) => {
        logMain('info', `Écran débranché: ${oldDisplay.id}`);
        const choice = getSetting('screenChoice');
        const index = parseInt(choice, 10);
        if (!isNaN(index) && !screen.getAllDisplays()[index]) {
            setSetting('screenChoice', 'primary', settingsLog);
            logMain('warn', 'Écran choisi disparu → retour écran principal');
        }
        trayModule.updateTrayMenu();
    });

    if (getSetting('screensaverAutoEnabled')) {
        screensaver.startIdleWatcher();
    }

    setAutoLaunch(getSetting('launchAtStartup'));

    if (!isClientIdConfigured()) {
        logMain('info', 'Aucun Client ID — affichage écran setup');
        const setupPath = getSetupPath();
        const setupPreloadPath = getSetupPreloadPath();
        if (fs.existsSync(setupPath)) {
            win.webContents.session.setPreloads([setupPreloadPath]);
            win.loadFile(setupPath);
        } else {
            logMain('error', 'setup.html introuvable:', setupPath);
        }
        win.show();
    } else if (!getSetting('startMinimized')) {
        windowModule.showWindow();
    } else {
        logMain('info', 'Démarrage minimisé — app en tray');
        setTimeout(() => {
            const { Notification } = require('electron');
            if (!Notification.isSupported()) return;
            const iconPath = getIconPath().replace(/\.ico$/, '.png');
            try {
                new Notification({
                    title: 'Vinyl View',
                    body: "L'application tourne en arrière-plan. Clic droit sur l'icône pour ouvrir.",
                    icon: iconPath,
                    silent: true
                }).show();
            } catch (e) {
                logMain('warn', 'Notification impossible:', e.message);
            }
        }, 1500);
    }

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            windowModule.createWindow();
        }
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
    logMain('info', '=== Electron arrêté ===');
    screensaver.stopIdleWatcher();
    screensaver.clearFullscreenActivationTimer();
    if (backend && !backend.killed) {
        backend.kill('SIGTERM');
        setTimeout(() => {
            if (backend && !backend.killed) {
                backend.kill('SIGKILL');
            }
        }, 2000);
    }
});

process.on('SIGINT', () => {
    app.quit();
});

process.on('SIGTERM', () => {
    app.quit();
});
