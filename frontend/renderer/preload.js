const { contextBridge } = require('electron');

const BACKEND_BASE_URL = 'http://127.0.0.1:3000';

contextBridge.exposeInMainWorld('vinylView', {
    backendBaseUrl: BACKEND_BASE_URL,
    openLogin() {
        window.open(`${BACKEND_BASE_URL}/login`, '_blank', 'width=500,height=700');
    }
});