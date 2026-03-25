// window.js Version final 25/03/2026
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const fs = require('fs');
const { logWindow, logSecurity } = require('./logger');
const { getSetting } = require('../settings');
const { getIconPath, getPreloadPath, getRendererPath, isAllowedUrl } = require('./utils');
const { isDev } = require('./logger');

let win = null;

let onUpdateTrayMenu = () => {};
let onGetIsScreensaverActive = () => false;
let onDeactivateScreensaver = () => {};

function init({ updateTrayMenu, getIsScreensaverActive, deactivateScreensaver }) {
    onUpdateTrayMenu = updateTrayMenu;
    onGetIsScreensaverActive = getIsScreensaverActive;
    onDeactivateScreensaver = deactivateScreensaver;
}

function syncEcoModeToRenderer() {
    if (!win || win.isDestroyed()) return;
    win.webContents.send('eco-mode-changed', getSetting('ecoMode'));
}

function showWindow() {
    if (!win) return;
    win.show();
    win.setSkipTaskbar(false);
    win.focus();
}

function createWindow() {
    if (process.platform === 'linux') {
        app.setDesktopName('vinyl-view');
    }

    win = new BrowserWindow({
        icon: getIconPath(),
        width: 1200,
        height: 800,
        show: false,
        skipTaskbar: false,
        fullscreenable: true,
        autoHideMenuBar: true,
        backgroundThrottling: false,
        paintWhenInitiallyHidden: true,
        backgroundColor: '#1a1a1a',

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
        onUpdateTrayMenu();
        if (win && !win.isDestroyed()) {
            win.webContents.send('fullscreen-transition-start');
        }
    });

    win.on('leave-full-screen', () => {
        logWindow('debug', 'leave-full-screen');
        onUpdateTrayMenu();
        if (win && !win.isDestroyed()) {
            win.webContents.send('fullscreen-transition-start');
        }
    });

    // F11 fullscreen
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'F11' && input.type === 'keyDown') {
            event.preventDefault();
            win.setFullScreen(!win.isFullScreen());
        }
    });

    // Escape → quitte fullscreen / désactive screensaver
    win.webContents.on('before-input-event', (event, input) => {
        if (input.key === 'Escape' && input.type === 'keyDown' && win.isFullScreen()) {
            event.preventDefault();
            if (onGetIsScreensaverActive()) {
                onDeactivateScreensaver();
            } else {
                win.setFullScreen(false);
                win.hide();
                win.setSkipTaskbar(true);
            }
        }
    });
    win.webContents.on('before-input-event', (event, input) => {
        if (input.type !== 'keyDown') return;
        if (input.key !== '1' && input.key !== '2' && input.key !== '3') return;
        if (!onGetIsScreensaverActive()) return;

        event.preventDefault(); // La touche n'arrive JAMAIS dans app.js

        const themeIndex = parseInt(input.key, 10) - 1;
        if (win && !win.isDestroyed()) {
            win.webContents.send('screensaver-theme-change', themeIndex);
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
                    backgroundColor: '#000000',
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
        const rendererFilePath = getRendererPath();
        const fileUrl = new URL(`file://${rendererFilePath}`);
        if (url !== fileUrl.href) {
            event.preventDefault();
            if (isAllowedUrl(url)) {
                shell.openExternal(url).catch((err) => logWindow('error', 'Erreur shell.openExternal:', err));
            } else {
                logSecurity('warn', 'Navigation bloquée:', url);
            }
        }
    });

    win.on('close', (event) => {
        if (!app.isQuitting) {
            event.preventDefault();
            if (onGetIsScreensaverActive()) {
                onDeactivateScreensaver();
            }
            win.hide();
            win.setSkipTaskbar(true);
        } else {
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
            rendererPath + "</p>"
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

    return win;
}

function getWin() {
    return win;
}

module.exports = {
    init,
    createWindow,
    showWindow,
    syncEcoModeToRenderer,
    getWin
};