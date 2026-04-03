// Detects if the app is running inside Electron by checking the preload bridge
export const isElectron = typeof window !== 'undefined' && !!window.api;
