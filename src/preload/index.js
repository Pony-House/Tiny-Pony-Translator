import { contextBridge, ipcRenderer } from 'electron';

// Custom APIs for renderer
const api = {
  openJson: () => ipcRenderer.invoke('dialog:openJson'),
  saveJson: (filePath, content) => ipcRenderer.invoke('fs:saveJson', filePath, content),

  /**
   * @param {string} action
   * @param {string} script
   * @param {string} sessionId
   * @param {string} osType
   * @returns {Promise<void>}
   */
  runLibreCommand: (action, script, sessionId, osType) =>
    ipcRenderer.invoke('run-libre-command', action, script, sessionId, osType),

  /**
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  stopLibreCommand: (sessionId) => ipcRenderer.invoke('stop-libre-command', sessionId),

  /**
   * @param {function} callback
   * @returns {function}
   */
  onLibreTranslateLog: (callback) => {
    const listener = (event, message) => callback(message);
    ipcRenderer.on('libre-log', listener);

    // Returns a cleanup function to remove the listener when the component unmounts
    return () => ipcRenderer.removeListener('libre-log', listener);
  },
  /**
   * @param {string} sessionId
   * @returns {Promise<{isRunning: boolean}>}
   */
  getLibreServerStatus: (sessionId) => ipcRenderer.invoke('get-libre-server-status', sessionId),
  /**
   * Restarts the Electron application.
   * @returns {Promise<void>}
   */
  restartApp: () => ipcRenderer.invoke('restart-app'),
  /**
   * @param {string} url
   * @returns {Promise<void>}
   */
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.api = api;
}
