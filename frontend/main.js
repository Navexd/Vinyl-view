const { app, BrowserWindow, shell, powerMonitor, Tray, Menu, nativeImage, ipcMain, screen } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { loadSettings, getSetting, setSetting, getAllSettings } = require('./settings');
const settingsLog = (...args) => logSettings('info', ...args);

// --- Compat electron-is-dev robuste ---

const _isDevRaw = require('electron-is-dev');
const isDev = (_isDevRaw && typeof _isDevRaw === 'object' && 'default' in _isDevRaw)
    ? _isDevRaw.default
    : _isDevRaw;

// --- Variables globales ---
let backend;
let win;
let tray;
let idleCheckInterval = null;
let isScreensaverActive = false;
let savedBounds = null;
let fullscreenActivationTimer = null;
let screensaverActivatedAt = 0;

const BACKEND_BASE_URL = 'http://127.0.0.1:3000';
const SCREENSAVER_EXIT_GRACE_MS = 1000;

//
// -------- LOG SYSTEM --------
//

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const LOG_LEVEL = isDev ? 'debug' : 'info';

const logDir = path.join(app.getPath("userData"), "log");
if (!fs.existsSync(logDir)) {
    try { fs.mkdirSync(logDir, { recursive: true }); } catch {}
}

const logFile = path.join(logDir, "electron.log");

// Rotation simple au démarrage (> 2 Mo → .old)
try {
    if (fs.existsSync(logFile) && fs.statSync(logFile).size > 2 * 1024 * 1024) {
        const old = logFile + '.old';
        if (fs.existsSync(old)) fs.unlinkSync(old);
        fs.renameSync(logFile, old);
    }
} catch {}

function log(category, level, ...args) {
    if (LOG_LEVELS[level] == null) { args.unshift(level); level = 'info'; }
    if (LOG_LEVELS[level] < LOG_LEVELS[LOG_LEVEL]) return;

    const ts = new Date().toLocaleString('sv-SE', { hour12: false }).replace('T', ' ');
    const tag = `[${ts}] [${category}] [${level.toUpperCase()}]`;
    const msg = args.map(a => {
        try { return typeof a === 'string' ? a : JSON.stringify(a); }
        catch { return String(a); }
    }).join(' ');

    const line = `${tag} ${msg}`;
    console.log(line);
    try { fs.appendFileSync(logFile, line + '\n'); } catch {}
}

// Raccourcis par catégorie
const logMain        = (...a) => log('main',        ...a);
const logBackend     = (...a) => log('backend',     ...a);
const logScreensaver = (...a) => log('screensaver', ...a);
const logIdle        = (...a) => log('idle',        ...a);
const logRenderer    = (...a) => log('renderer',    ...a);
const logTray        = (...a) => log('tray',        ...a);
const logSettings    = (...a) => log('settings',    ...a);
const logSecurity    = (...a) => log('security',    ...a);
const logWindow      = (...a) => log('window',      ...a);

// IPC log depuis le renderer
ipcMain.on('renderer-log', (_, category, level, msg) => {
    log(category || 'renderer', level || 'info', msg);
});

logMain('info', '=== Electron démarré ===');
logMain('info', 'isDev:', isDev);
logMain('debug', '__dirname:', __dirname);
logMain('debug', 'process.resourcesPath:', process.resourcesPath);

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
    const ext = process.platform === 'win32' ? 'ico' : 'png';
    // On cherche album.ico sur Windows et album.png sur Linux
    const iconName = `album.${ext}`;

    if (isDev) {
        return path.join(__dirname, "assets", iconName);
    }

    return path.join(process.resourcesPath, "assets", iconName);
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
            targetUrl.startsWith(`${BACKEND_BASE_URL}/status`) ||
            targetUrl.startsWith(`${BACKEND_BASE_URL}/done`)
        );
    } catch {
        return false;
    }
}

function canExitScreensaverNow() {
    return Date.now() - screensaverActivatedAt >= SCREENSAVER_EXIT_GRACE_MS;
}

//
// -------- SHOW WINDOW --------
//

function showWindow() {
    if (!win) return;
    win.show();
    win.setSkipTaskbar(false);
    win.focus();
}

//
// -------- SCREENSAVER --------
//

function getTargetDisplay() {
    const choice = getSetting('screenChoice');
    const displays = screen.getAllDisplays();
    const primary = screen.getPrimaryDisplay();

    if (choice === 'cursor') {
        const cursor = screen.getCursorScreenPoint();
        return screen.getDisplayNearestPoint(cursor);
    }
    if (choice === 'window' && win) {
        const winBounds = win.getBounds();
        const center = {
            x: winBounds.x + winBounds.width / 2,
            y: winBounds.y + winBounds.height / 2
        };
        return screen.getDisplayNearestPoint(center);
    }
    const index = parseInt(choice, 10);
    if (!isNaN(index) && displays[index]) {
        return displays[index];
    }
    return primary;
}

function clearFullscreenActivationTimer() {
    if (fullscreenActivationTimer) {
        clearTimeout(fullscreenActivationTimer);
        fullscreenActivationTimer = null;
    }
}

function activateScreensaver() {
    if (!win || isScreensaverActive) return;

    logScreensaver('info', 'Activation screensaver');
    savedBounds = win.getBounds();
    isScreensaverActive = true;
    screensaverActivatedAt = Date.now();

    const targetDisplay = getTargetDisplay();
    const { x, y, width, height } = targetDisplay.bounds;
    logScreensaver('debug', `Écran cible: ${width}x${height} @ ${x},${y}`);

    win.show();
    win.setSkipTaskbar(true);
    win.setBounds({ x, y, width, height }, false);

    clearFullscreenActivationTimer();
    fullscreenActivationTimer = setTimeout(() => {
        if (win && isScreensaverActive) {
            win.setFullScreen(true);
            win.setAlwaysOnTop(true, 'screen-saver');
            win.focus();
            win.webContents.send('screensaver-activate');
            logScreensaver('info', 'Fullscreen activé');
        }
    }, 300);

    syncEcoModeToRenderer();
    updateTrayMenu();
}

function deactivateScreensaver() {
    if (!win || !isScreensaverActive) return;

    if (!canExitScreensaverNow()) {
        logScreensaver('debug', 'Désactivation ignorée (grace period)');
        return;
    }

    logScreensaver('info', 'Désactivation screensaver');
    clearFullscreenActivationTimer();

    isScreensaverActive = false;
    screensaverActivatedAt = 0;

    win.setFullScreen(false);
    win.setAlwaysOnTop(false);

    if (savedBounds) {
        win.setBounds(savedBounds, false);
    }

    win.show();
    win.setSkipTaskbar(false);
    win.focus();
    win.webContents.send('screensaver-deactivate');

    syncEcoModeToRenderer();
    updateTrayMenu();
}

//
// -------- IDLE WATCHER (SCREENSAVER AUTO) --------
//

function getIdleTime() {
    try {
        return powerMonitor.getSystemIdleTime();
    } catch (e) {
        logIdle('error', 'getSystemIdleTime indisponible:', e);
        return 0;
    }
}

let notificationSent = false;

function startIdleWatcher() {
    if (idleCheckInterval) return;

    logIdle('info', 'Idle watcher démarré');
    notificationSent = false;

    idleCheckInterval = setInterval(() => {
        if (!getSetting('screensaverAutoEnabled') || !win) return;

        const idleSeconds = getIdleTime();
        const timeout = getSetting('idleTimeoutSeconds');
        const notifyEnabled = getSetting('notifyBeforeScreensaver');
        const notifyDelay = 15;

        // Notification 15s avant
        if (notifyEnabled && !notificationSent && !isScreensaverActive && idleSeconds >= (timeout - notifyDelay) && idleSeconds < timeout) {
            const { Notification } = require('electron');
            new Notification({
                title: 'Vinyl View',
                body: `Le screensaver s'active dans ${notifyDelay} secondes...`,
                silent: true
            }).show();
            notificationSent = true;
            logIdle('info', `Notification: screensaver dans ${notifyDelay}s`);
        }

        // Activation screensaver
        if (!isScreensaverActive && idleSeconds >= timeout) {
            logIdle('info', `Idle ${idleSeconds}s >= ${timeout}s → activation screensaver`);
            activateScreensaver();
            syncEcoModeToRenderer();
            return;
        }

        if (isScreensaverActive && idleSeconds < 1) {
            logIdle('info', 'Reprise activité → désactivation screensaver');
            deactivateScreensaver();
            notificationSent = false;
            syncEcoModeToRenderer();
        }

        if (idleSeconds < (timeout - notifyDelay)) {
            notificationSent = false;
        }
    }, 1000);
}

function stopIdleWatcher() {
    if (idleCheckInterval) {
        clearInterval(idleCheckInterval);
        idleCheckInterval = null;
        logIdle('info', 'Idle watcher arrêté');
    }
}

//
// -------- IPC SCREENSAVER --------
//

ipcMain.on('deactivate-screensaver', () => {
    logScreensaver('info', 'Désactivation demandée via IPC');
    deactivateScreensaver();
});

ipcMain.on('user-activity', () => {
    if (isScreensaverActive && canExitScreensaverNow()) {
        logScreensaver('info', 'Activité renderer détectée pendant screensaver');
        deactivateScreensaver();
    }
});

//
// -------- IPC SETTINGS --------
//

ipcMain.handle('get-settings', () => {
    return getAllSettings();
});

ipcMain.handle('set-setting', (event, key, value) => {
    setSetting(key, value, log);
    logSettings('info', `${key} = ${JSON.stringify(value)}`);

    if (key === 'screensaverAutoEnabled') {
        if (value) {
            startIdleWatcher();
        } else {
            stopIdleWatcher();
            if (isScreensaverActive) {
                deactivateScreensaver();
            }
        }
    }

    if (key === 'launchAtStartup') {
        app.setLoginItemSettings({
            openAtLogin: value,
            path: app.getPath('exe')
        });
        logSettings('info', `Lancement au démarrage: ${value ? 'ON' : 'OFF'}`);
    }

    return getAllSettings();
});

//
// -------- SYSTEM INFO --------
//
async function getAboutInfo() {
    const os = require('os');
    const { screen } = require('electron');

    let backendStatus = 'inconnu';
    try {
        const res = await fetch(`${BACKEND_BASE_URL}/status`, { signal: AbortSignal.timeout(3000) });
        backendStatus = res.ok ? 'connecté' : 'erreur';
    } catch {
        backendStatus = 'déconnecté';
    }

    return {
        appVersion: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        os: `${os.type()} ${os.release()}`,
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0]?.model || 'inconnu',
        cores: os.cpus().length,
        ram: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} Go`,
        ramFree: `${Math.round(os.freemem() / 1024 / 1024 / 1024)} Go`,
        screens: screen.getAllDisplays().length,
        uptime: `${Math.round(os.uptime() / 3600)}h`,
        backend: backendStatus,
        ecoMode: getSetting('ecoMode') || false,
        autoMode: getSetting('screensaverAutoEnabled') || false,

        isDev
    };
}

//
// -------- SYSTEM TRAY --------
//

function createTray() {
    const iconPath = getTrayIconPath();

    let icon;
    if (fs.existsSync(iconPath)) {
        icon = nativeImage.createFromPath(iconPath);
    } else {
        logTray('warn', 'Icône tray introuvable:', iconPath);
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
    const autoEnabled = getSetting('screensaverAutoEnabled');
    const currentTimeout = getSetting('idleTimeoutSeconds');
    const timeoutChoices = [
        { label: '30 secondes', value: 30 },
        { label: '1 minute', value: 60 },
        { label: '2 minutes', value: 120 },
        { label: '5 minutes', value: 300 },
        { label: '10 minutes', value: 600 },
    ];

    const delayItems = autoEnabled ? [
        { type: 'separator' },
        { label: 'Délai inactivité', enabled: false },
        ...timeoutChoices.map(choice => ({
            label: `  ${choice.label}`,
            type: 'radio',
            checked: currentTimeout === choice.value,
            click: () => {
                setSetting('idleTimeoutSeconds', choice.value, log);
                logTray('info', `Délai inactivité changé: ${choice.value}s`);
                stopIdleWatcher();
                startIdleWatcher();
                updateTrayMenu();
            }
        }))
    ] : [];

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Afficher',
            click: () => {
                if (isScreensaverActive) {
                    deactivateScreensaver();
                }
                showWindow();
            }
        },
        {
            label: isScreensaverActive ? 'Désactiver screensaver' : 'Activer screensaver',
            click: () => {
                if (isScreensaverActive) {
                    deactivateScreensaver();
                } else {
                    activateScreensaver();
                }
                updateTrayMenu();
            }
        },
        { type: 'separator' },
        {
            label: '⚙ Paramètres',
            submenu: [
                {
                    label: 'Mode auto',
                    type: 'checkbox',
                    checked: autoEnabled,
                    click: (menuItem) => {
                        setSetting('screensaverAutoEnabled', menuItem.checked, log);
                        logTray('info', `Screensaver auto: ${menuItem.checked ? 'ON' : 'OFF'}`);
                        if (menuItem.checked) {
                            startIdleWatcher();
                        } else {
                            stopIdleWatcher();
                            if (isScreensaverActive) deactivateScreensaver();
                        }
                        updateTrayMenu();
                    }
                },
                ...delayItems,
                { type: 'separator' },
                {
                    label: 'Notification avant screensaver',
                    type: 'checkbox',
                    checked: getSetting('notifyBeforeScreensaver'),
                    click: (menuItem) => {
                        setSetting('notifyBeforeScreensaver', menuItem.checked, log);
                        logTray('info', `Notification: ${menuItem.checked ? 'ON' : 'OFF'}`);
                        updateTrayMenu();
                    }
                },
                {
                    label: 'Mode économie (30fps)',
                    type: 'checkbox',
                    checked: getSetting('ecoMode'),
                    click: (menuItem) => {
                        setSetting('ecoMode', menuItem.checked, log);
                        logTray('info', `Eco mode: ${menuItem.checked ? 'ON' : 'OFF'}`);
                        syncEcoModeToRenderer();
                        updateTrayMenu();
                    }
                },
                { type: 'separator' },
                {
                    label: 'Écran screensaver',
                    submenu: (() => {
                        const displays = screen.getAllDisplays();
                        const current = getSetting('screenChoice');
                        const items = [
                            {
                                label: 'Écran principal',
                                type: 'radio',
                                checked: current === 'primary',
                                click: () => {
                                    setSetting('screenChoice', 'primary', settingsLog);
                                    logTray('info', 'Écran: principal');
                                    updateTrayMenu();
                                }
                            },
                            {
                                label: 'Écran du curseur',
                                type: 'radio',
                                checked: current === 'cursor',
                                click: () => {
                                    setSetting('screenChoice', 'cursor', log);
                                    logTray('info', 'Écran: curseur');
                                    updateTrayMenu();
                                }
                            },
                            {
                                label: 'Écran de la fenêtre',
                                type: 'radio',
                                checked: current === 'window',
                                click: () => {
                                    setSetting('screenChoice', 'window', log);
                                    logTray('info', 'Écran: fenêtre');
                                    updateTrayMenu();
                                }
                            }
                        ];

                        if (displays.length > 1) {
                            items.push({ type: 'separator' });
                            displays.forEach((display, index) => {
                                const primary = display.id === screen.getPrimaryDisplay().id;
                                const label = `Écran ${index + 1} (${display.bounds.width}x${display.bounds.height})${primary ? ' ★' : ''}`;
                                items.push({
                                    label,
                                    type: 'radio',
                                    checked: current === String(index),
                                    click: () => {
                                        setSetting('screenChoice', String(index), log);
                                        logTray('info', `Écran: ${label}`);
                                        updateTrayMenu();
                                    }
                                });
                            });
                        }

                        return items;
                    })()
                },
                { type: 'separator' },
                {
                    label: 'Lancer au démarrage',
                    type: 'checkbox',
                    checked: getSetting('launchAtStartup'),
                    click: (menuItem) => {
                        setSetting('launchAtStartup', menuItem.checked, log);
                        app.setLoginItemSettings({
                            openAtLogin: menuItem.checked,
                            path: app.getPath('exe')
                        });
                        logTray('info', `Lancer au démarrage: ${menuItem.checked ? 'ON' : 'OFF'}`);
                        updateTrayMenu();
                    }
                },
                {
                    label: 'Démarrer minimisé',
                    type: 'checkbox',
                    checked: getSetting('startMinimized'),
                    click: (menuItem) => {
                        setSetting('startMinimized', menuItem.checked, log);
                        logTray('info', `Démarrer minimisé: ${menuItem.checked ? 'ON' : 'OFF'}`);
                        updateTrayMenu();
                    }
                }
            ]
        },
        { type: 'separator' },
        {
            label: `Vinyl View v${app.getVersion()}`,
            enabled: false
        },
        {
            label: 'ℹ À propos / Debug',
            click: async () => {
                const info = await getAboutInfo();
                const msg = [
                    `🎵 Vinyl View v${info.appVersion}`,
                    ``,
                    `Electron: ${info.electron}`,
                    `Chrome: ${info.chrome}`,
                    `Node: ${info.node}`,
                    `Mode: ${info.isDev ? 'Développement' : 'Production'}`,
                    ``,
                    `OS: ${info.os}`,
                    `Plateforme: ${info.platform} (${info.arch})`,
                    `CPU: ${info.cpu} (${info.cores} cœurs)`,
                    `RAM: ${info.ramFree} libre / ${info.ram}`,
                    `Écrans: ${info.screens}`,
                    `Uptime système: ${info.uptime}`,
                    ``,
                    `Backend: ${info.backend}`,
                    `Mode éco: ${info.ecoMode ? 'Actif' : 'Inactif'}`,
                    `Mode auto: ${info.autoMode ? 'Actif' : 'Inactif'}`
                ].join('\n');

                const { dialog, clipboard } = require('electron');
                const result = await dialog.showMessageBox({
                    type: 'info',
                    title: 'À propos — Vinyl View',
                    message: `Vinyl View v${info.appVersion}`,
                    detail: msg,
                    buttons: ['OK', '📋 Copier'],
                    defaultId: 0
                });

                if (result.response === 1) {
                    clipboard.writeText(msg);
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

function syncEcoModeToRenderer() {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('eco-mode-changed', getSetting('ecoMode'));
}

function createWindow() {
    // 1. Définition du nom de bureau pour Linux
    if (process.platform === 'linux') {
        app.setDesktopName('vinyl-view');
    }

    // 2. Création de la fenêtre
    win = new BrowserWindow({
        icon: getIconPath(),
        width: 1200,
        height: 800,
        show: false,
        skipTaskbar: false,
        fullscreenable: true,
        autoHideMenuBar: true,
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

    win.on('enter-full-screen', () => {
        logWindow('debug', 'enter-full-screen');
        updateTrayMenu();
    });

    win.on('leave-full-screen', () => {
        logWindow('debug', 'leave-full-screen');
        updateTrayMenu();
    });

    // F11 fullscreen support
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11' && input.type === 'keyDown') {
            event.preventDefault();
            win.setFullScreen(!win.isFullScreen());
        }
    });

    // Escape quitte le fullscreen et désactive le screensaver si actif
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape' && input.type === 'keyDown' && win.isFullScreen()) {
            event.preventDefault();
            if (isScreensaverActive) {
                deactivateScreensaver();
            } else {
                win.setFullScreen(false);
                win.hide();
                win.setSkipTaskbar(true);
            }
        }
    });

    win.webContents.setWindowOpenHandler(({ url }) => {
        if (isAllowedUrl(url)) {
            return {
                action: 'allow',
                overrideBrowserWindowOptions: {
                    icon: getIconPath(),
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
        logSecurity('warn', 'Popup bloquée:', url);
        return { action: 'deny' };
    });

    win.webContents.on('will-navigate', (event, url) => {
        const rendererPath = getRendererPath();
        const fileUrl = new URL(`file://${rendererPath}`);
        if (url !== fileUrl.href) {
            event.preventDefault();
            if (isAllowedUrl(url)) {
                shell.openExternal(url).catch((err) => logWindow('error', 'Erreur shell.openExternal:', err));
            } else {
                logSecurity('warn', 'Navigation bloquée:', url);
            }
        }
    });

    // Empêcher la fermeture — juste cacher + nettoyage IPC si quit
    win.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            if (isScreensaverActive) {
                deactivateScreensaver();
            }
            win.hide();
            win.setSkipTaskbar(true);
        } else {
            // Nettoyage IPC pour éviter les fuites
            ipcMain.removeAllListeners('user-activity');
            ipcMain.removeAllListeners('deactivate-screensaver');
        }
    });

    const rendererPath = getRendererPath();
    logWindow('info', 'Renderer path:', rendererPath);

    if (!fs.existsSync(rendererPath)) {
        logWindow('error', 'Renderer introuvable');
        win.loadURL(
            "data:text/html,<h1>Erreur: renderer introuvable</h1><p>" +
            rendererPath +
            "</p>"
        );
        return;
    }

    try {
        win.loadFile(rendererPath);

        win.webContents.on('did-finish-load', () => {
            logWindow('info', 'Renderer chargé');
            if (getSetting('ecoMode')) {
                win.webContents.send('eco-mode-changed', true);
            }
        });
    } catch (e) {
        logWindow('error', 'Erreur chargement renderer:', e);
    }
}

//
// -------- BACKEND LAUNCH --------
//

function startBackend() {
    const backendPath = getBackendPath();
    logBackend('info', 'Backend path:', backendPath);

    if (!fs.existsSync(backendPath)) {
        logBackend('error', 'Backend introuvable !');
        return;
    }

    if (process.platform !== "win32") {
        try {
            fs.chmodSync(backendPath, 0o755);
            logBackend('debug', 'Permissions OK');
        } catch (e) {
            logBackend('warn', 'Impossible de mettre +x:', e);
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

//
// -------- APP EVENTS --------
//

app.isQuitting = false;

app.on('before-quit', () => {
    app.isQuitting = true;
});

app.whenReady().then(() => {
    // --- Sécurité globale ---
    app.on('web-contents-created', (_event, contents) => {
        contents.on('will-attach-webview', (event) => {
            event.preventDefault();
            logSecurity('warn', 'Tentative webview bloquée');
        });
    });

    loadSettings(settingsLog);
    startBackend();
    createWindow();
    createTray();

    screen.on('display-added', (event, newDisplay) => {
        logMain('info', `Écran branché: ${newDisplay.id}`);
        updateTrayMenu();
    });

    screen.on('display-removed', (event, oldDisplay) => {
        logMain('info', `Écran débranché: ${oldDisplay.id}`);
        const choice = getSetting('screenChoice');
        const index = parseInt(choice, 10);
        if (!isNaN(index) && !screen.getAllDisplays()[index]) {
            setSetting('screenChoice', 'primary', settingsLog);
            logMain('warn', 'Écran choisi disparu → retour écran principal');
        }
        updateTrayMenu();
    });

    if (getSetting('screensaverAutoEnabled')) {
        startIdleWatcher();
    }

    app.setLoginItemSettings({
        openAtLogin: getSetting('launchAtStartup'),
        path: app.getPath('exe')
    });

    if (!getSetting('startMinimized')) {
        logMain('info', 'Démarrage minimisé');
    } else {
        showWindow();
    }

    app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
});

app.on("quit", () => {
    logMain('info', '=== Electron arrêté ===');
    stopIdleWatcher();
    clearFullscreenActivationTimer();
    if (backend) backend.kill();
});
