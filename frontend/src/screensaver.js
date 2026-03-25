// screensaver.js
const { screen, powerMonitor, Notification, ipcMain } = require('electron');
const { logScreensaver, logIdle } = require('./logger');
const { getSetting } = require('../settings');
const { canExitScreensaverNow, setScreensaverActivatedAt, getTrayIconPath } = require('./utils');

let win = null;
let isScreensaverActive = false;
let savedBounds = null;
let fullscreenActivationTimer = null;
let idleCheckInterval = null;
let notificationSent = false;

let syncEcoModeToRenderer = () => {};
let updateTrayMenu = () => {};

function init(mainWin, { syncEco, updateTray }) {
    win = mainWin;
    syncEcoModeToRenderer = syncEco;
    updateTrayMenu = updateTray;
}

function setWin(w) {
    win = w;
}

function getIsScreensaverActive() {
    return isScreensaverActive;
}

// -------- DISPLAY TARGETING --------

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

// -------- ACTIVATION / DEACTIVATION --------

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
    setScreensaverActivatedAt(Date.now());

    const targetDisplay = getTargetDisplay();
    const { x, y, width, height } = targetDisplay.bounds;
    logScreensaver('debug', `Écran cible: ${width}x${height} @ ${x},${y}`);

    win.show();
    win.setSkipTaskbar(true);
    if (win && !win.isDestroyed()) {
        win.webContents.send('fullscreen-transition-start');
    }

    // Étape 2 : repositionner sur le bon écran SANS redimensionner
    // On déplace juste le centre de la fenêtre sur l'écran cible.
    // setFullScreen gérera lui-même l'expansion à la bonne résolution.
    const currentBounds = win.getBounds();
    const targetX = x + Math.floor(width / 2) - Math.floor(currentBounds.width / 2);
    const targetY = y + Math.floor(height / 2) - Math.floor(currentBounds.height / 2);
    win.setPosition(targetX, targetY, false); // false = sans animation

    clearFullscreenActivationTimer();


    fullscreenActivationTimer = setTimeout(() => {
        if (win && isScreensaverActive) {
            win.setFullScreen(true);
            win.setAlwaysOnTop(true, 'screen-saver');
            win.focus();
            win.webContents.send('screensaver-activate');
            logScreensaver('info', 'Fullscreen activé');
        }
    }, 150);

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

    // Signal freeze pendant la sortie fullscreen également
    if (win && !win.isDestroyed()) {
        win.webContents.send('fullscreen-transition-start');
    }

    isScreensaverActive = false;
    setScreensaverActivatedAt(0);

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

// -------- IDLE WATCHER --------

function getIdleTime() {
    try {
        return powerMonitor.getSystemIdleTime();
    } catch (e) {
        logIdle('error', 'getSystemIdleTime indisponible:', e);
        return 0;
    }
}

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

        if (notifyEnabled && !notificationSent && !isScreensaverActive && idleSeconds >= (timeout - notifyDelay) && idleSeconds < timeout) {
            if (process.platform === 'win32') {
                // Windows : toastXml pour avoir l'icône app dans la notification.
                // IMPORTANT : les backslashes Windows doivent être convertis en
                // forward slashes pour être valides dans l'attribut src du XML.
                const iconPath = getTrayIconPath().replace(/\\/g, '/');
                const xml = [
                    '<toast>',
                    '  <visual>',
                    '    <binding template="ToastGeneric">',
                    `      <text>Vinyl View</text>`,
                    `      <text>Le screensaver s'active dans ${notifyDelay} secondes...</text>`,
                    `      <image placement="appLogoOverride" hint-crop="circle" src="${iconPath}"/>`,
                    '    </binding>',
                    '  </visual>',
                    '  <audio silent="true"/>',
                    '</toast>'
                ].join('\n');
                new Notification({ toastXml: xml }).show();
            } else {
                new Notification({
                    title: 'Vinyl View',
                    body: `Le screensaver s'active dans ${notifyDelay} secondes...`,
                    icon: getTrayIconPath(),
                    silent: true
                }).show();
            }
            notificationSent = true;
            logIdle('info', `Notification: screensaver dans ${notifyDelay}s`);
        }

        if (!isScreensaverActive && idleSeconds >= timeout) {
            logIdle('info', `Idle ${idleSeconds}s >= ${timeout}s → activation screensaver`);
            activateScreensaver();
            syncEcoModeToRenderer();
            return;
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

// -------- IPC SCREENSAVER --------

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

module.exports = {
    init,
    setWin,
    getIsScreensaverActive,
    activateScreensaver,
    deactivateScreensaver,
    startIdleWatcher,
    stopIdleWatcher,
    clearFullscreenActivationTimer
};