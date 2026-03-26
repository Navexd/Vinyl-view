// tray.js
const { app, Tray, Menu, screen, nativeImage, dialog, clipboard } = require('electron');
const fs = require('fs');
const { log, logTray } = require('./logger');
const { getSetting, setSetting } = require('../settings');
const { getTrayIconPath } = require('./utils');

let tray = null;
let win = null;

// Callbacks injectés depuis main.js
let showWindowFn = () => {};
let syncEcoModeToRendererFn = () => {};
let getAboutInfoFn = async () => ({});

// Modules injectés
let screensaverModule = null;

function init(mainWin, { showWindow, syncEcoModeToRenderer, getAboutInfo, screensaver }) {
    win = mainWin;
    showWindowFn = showWindow;
    syncEcoModeToRendererFn = syncEcoModeToRenderer;
    getAboutInfoFn = getAboutInfo;
    screensaverModule = screensaver;
}

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
        showWindowFn();
    });

    return tray;
}

function updateTrayMenu() {
    if (!tray) return;

    const isScreensaverActive = screensaverModule.getIsScreensaverActive();
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
                screensaverModule.stopIdleWatcher();
                screensaverModule.startIdleWatcher();
                updateTrayMenu();
            }
        }))
    ] : [];

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Afficher',
            click: () => {
                if (isScreensaverActive) {
                    screensaverModule.deactivateScreensaver();
                }
                showWindowFn();
            }
        },
        {
            label: isScreensaverActive ? 'Désactiver screensaver' : 'Activer screensaver',
            click: () => {
                if (isScreensaverActive) {
                    screensaverModule.deactivateScreensaver();
                } else {
                    screensaverModule.activateScreensaver();
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
                            screensaverModule.startIdleWatcher();
                        } else {
                            screensaverModule.stopIdleWatcher();
                            if (screensaverModule.getIsScreensaverActive()) {
                                screensaverModule.deactivateScreensaver();
                            }
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
                        syncEcoModeToRendererFn();
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
                                    setSetting('screenChoice', 'primary', log);
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
            label: '⌨️ Raccourcis clavier',
            click: () => {
                const { dialog } = require('electron');
                dialog.showMessageBox({
                    type: 'info',
                    title: 'Raccourcis clavier — Vinyl View',
                    message: 'Raccourcis clavier',
                    detail: [
                        '1  →  Effet Float (fond animé)',
                        '2  →  Effet Wave (fond animé)',
                        '3  →  Effet Pulse (fond animé)',
                        '',
                        'F11      →  Plein écran',
                        'Escape  →  Quitter le plein écran / screensaver',
                        '',
                        '💡 Les touches 1 / 2 / 3 fonctionnent',
                        '    même en mode screensaver sans le désactiver.',
                    ].join('\n'),
                    buttons: ['OK'],
                    defaultId: 0
                });
            }
        },
        {
            label: 'ℹ À propos / Debug',
            click: async () => {
                const info = await getAboutInfoFn();
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

                const result = await dialog.showMessageBox({
                    type: 'info',
                    title: 'À propos — Vinyl View',
                    message: `Vinyl View v${info.appVersion}`,
                    detail: msg,
                    buttons: ['OK', '📋 Copier'],
                    defaultId: 0
                });

                if (result.response === 1) {
                    require('electron').clipboard.writeText(msg);
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

function getTray() {
    return tray;
}

module.exports = {
    init,
    createTray,
    updateTrayMenu,
    getTray
};