import { spawn } from 'child_process';

import { app, shell, BrowserWindow, Tray, Menu, ipcMain, dialog } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';

const activeProcesses = new Map();

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Checks if the process exists and is not killed
ipcMain.handle('get-libre-server-status', (event, sessionId) => {
  const cp = activeProcesses.get(sessionId);
  return {
    isRunning: cp !== undefined && !cp.killed,
  };
});

ipcMain.handle('run-libre-command', async (event, action, scriptString, sessionId) => {
  return new Promise((resolve) => {
    const cp = spawn('bash', ['-c', scriptString], { detached: true });

    activeProcesses.set(sessionId, cp);

    cp.stdout.on('data', (data) => {
      event.sender.send('libre-log', data.toString().trim());
    });

    cp.stderr.on('data', (data) => {
      event.sender.send('libre-log', data.toString().trim());
    });

    cp.on('close', (code) => {
      event.sender.send('libre-log', `Process [${sessionId}] finished with code ${code}`);
      activeProcesses.delete(sessionId);
      if (action !== 'start') {
        resolve();
      }
    });

    // Resolve immediately for the interface to know it is running
    if (action === 'start') {
      resolve();
    }
  });
});

ipcMain.handle('stop-libre-command', (event, sessionId) => {
  const cp = activeProcesses.get(sessionId);
  if (cp) {
    try {
      process.kill(-cp.pid);
    } catch (err) {
      console.error(err);
      // Fallback safe in case the group is already dead or something strange happens
      try {
        cp.kill('SIGKILL');
      } catch (e) {
        console.error(e);
      }
    }
    activeProcesses.delete(sessionId);
  }
});

ipcMain.handle('dialog:openJson', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
  });
  if (canceled || filePaths.length === 0) return null;
  const content = await readFile(filePaths[0], 'utf-8');
  return { filePath: filePaths[0], content };
});

ipcMain.handle('fs:saveJson', async (_, filePath, content) => {
  try {
    await writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
});

/**
 * @returns {void}
 */
const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  // Intercept the close event to hide the window instead of killing the app
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
};

app.whenReady().then(() => {
  app.setAppUserModelId('com.jasmindreasond.iny-pony-translator');

  createWindow();

  // Tray Integration
  try {
    tray = new Tray(icon);
  } catch {
    // Fallback if the build icon is not found during dev
    tray = new Tray(join(__dirname, '../../resources/icon.png'));
  }

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Translator', click: () => mainWindow.show() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('PonyTranslate');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  for (const [sessionId, cp] of activeProcesses.entries()) {
    if (cp && !cp.killed) {
      try {
        // Kill the entire process group just like we do in the stop command
        process.kill(-cp.pid);
        console.log(`[CleanUp] Killed process group for session: ${sessionId}`);
      } catch (err) {
        console.error(err);
        // Safe fallback in case the process group is already dead
        try {
          cp.kill('SIGKILL');
        } catch (e) {
          console.error(e);
        }
      }
    }
  }
  activeProcesses.clear();
});
