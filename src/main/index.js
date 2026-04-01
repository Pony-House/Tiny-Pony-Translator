import { app, shell, BrowserWindow, Tray, Menu, ipcMain, dialog } from 'electron';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';

let mainWindow = null;
let tray = null;
let isQuitting = false;

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
