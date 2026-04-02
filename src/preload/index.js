import { contextBridge, ipcRenderer } from 'electron';

// Custom APIs for renderer
const api = {
  openJson: () => ipcRenderer.invoke('dialog:openJson'),
  saveJson: (filePath, content) => ipcRenderer.invoke('fs:saveJson', filePath, content),

  /**
   * @param {string} action
   * @param {string} script
   * @returns {Promise<void>}
   */
  runLibreCommand: (action, script) => ipcRenderer.invoke('run-libre-command', action, script),

  /**
   * @returns {Promise<void>}
   */
  stopLibreCommand: () => ipcRenderer.invoke('stop-libre-command'),

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
