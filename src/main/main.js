const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, clipboard, nativeImage, shell, nativeTheme } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// ============================================
// File-based Logger
// ============================================
const MAX_LOG_SIZE = 5 * 1024 * 1024; // 5MB
let logFilePath = null;

function initLogger() {
  logFilePath = path.join(app.getPath('userData'), 'dictaloom.log');
}

function writeLog(level, context, message, stack) {
  if (!logFilePath) return;
  try {
    // Rotate if too large
    if (fs.existsSync(logFilePath)) {
      const stat = fs.statSync(logFilePath);
      if (stat.size > MAX_LOG_SIZE) {
        const oldPath = logFilePath + '.old';
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        fs.renameSync(logFilePath, oldPath);
      }
    }
    const ts = new Date().toISOString();
    let entry = `[${ts}] [${level}] [${context}] ${message}\n`;
    if (stack) entry += `  Stack: ${stack}\n`;
    fs.appendFileSync(logFilePath, entry, 'utf-8');
  } catch (e) {
    console.error('Logger write failed:', e);
  }
}

// Catch main process errors
process.on('uncaughtException', (err) => {
  writeLog('FATAL', 'main:uncaughtException', err.message, err.stack);
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : '';
  writeLog('ERROR', 'main:unhandledRejection', msg, stack);
  console.error('Unhandled Rejection:', reason);
});

const store = new Store({
  defaults: {
    apiKey: '',
    onboarded: false,
    dictationShortcut: 'Ctrl+Shift+Space',
    commandShortcut: 'Ctrl+Shift+Alt+Space',
    aiFormatting: true,
    geminiModel: '',
    language: 'en',
    theme: 'system',
    autoLaunch: false,
    showOverlay: true,
    sounds: true,
    dictionary: [],
    snippets: [],
    history: [],
    stats: { wordsToday: 0, timeSaved: 0, sessions: 0, lastDate: '' },
    overlayPosition: { x: -1, y: -1 },
    activeStyle: 'normal',
    autoStyleSwitch: false,
    styleOverrides: {},
    keepSuccessRecordings: false
  }
});

let mainWindow = null;
let overlayWindow = null;
let tray = null;
let isRecording = false;
let updateState = {
  status: 'idle',
  message: 'Update checks are ready.',
  version: app.getVersion(),
  isPackaged: app.isPackaged
};

function getThemeState() {
  return {
    source: nativeTheme.themeSource,
    shouldUseDarkColors: nativeTheme.shouldUseDarkColors
  };
}

function broadcastThemeState() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-updated', getThemeState());
  }
}

function applyAppTheme(themeSource) {
  const nextSource = ['system', 'light', 'dark'].includes(themeSource) ? themeSource : 'system';
  nativeTheme.themeSource = nextSource;
  store.set('theme', nextSource);
  broadcastThemeState();
  return getThemeState();
}

function sanitizeUpdateInfo(info) {
  if (!info) return null;
  return {
    version: info.version || '',
    releaseName: info.releaseName || '',
    releaseDate: info.releaseDate || '',
    releaseNotes: typeof info.releaseNotes === 'string' ? info.releaseNotes : ''
  };
}

function sendUpdateStatus(status, extra = {}) {
  updateState = {
    ...updateState,
    ...extra,
    status,
    version: app.getVersion(),
    isPackaged: app.isPackaged
  };

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', updateState);
  }

  return updateState;
}

function serializeUpdateError(error) {
  return error instanceof Error ? error.message : String(error || 'Update check failed.');
}

function setupAutoUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = {
    info: (message) => writeLog('INFO', 'autoUpdater', String(message)),
    warn: (message) => writeLog('WARN', 'autoUpdater', String(message)),
    error: (message) => writeLog('ERROR', 'autoUpdater', String(message)),
    debug: (message) => writeLog('DEBUG', 'autoUpdater', String(message))
  };

  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('checking', {
      message: 'Checking GitHub Releases for updates.',
      progress: null
    });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus('available', {
      message: `Version ${info.version} is available.`,
      updateInfo: sanitizeUpdateInfo(info),
      progress: null
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendUpdateStatus('current', {
      message: 'Dictaloom is up to date.',
      updateInfo: sanitizeUpdateInfo(info),
      progress: null
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    const percent = Math.round(progress.percent || 0);
    sendUpdateStatus('downloading', {
      message: `Downloading update (${percent}%).`,
      progress: {
        percent,
        transferred: progress.transferred || 0,
        total: progress.total || 0,
        bytesPerSecond: progress.bytesPerSecond || 0
      }
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus('downloaded', {
      message: `Version ${info.version} is ready to install.`,
      updateInfo: sanitizeUpdateInfo(info),
      progress: { percent: 100 }
    });
  });

  autoUpdater.on('error', (error) => {
    const message = serializeUpdateError(error);
    writeLog('ERROR', 'autoUpdater', message, error?.stack);
    sendUpdateStatus('error', {
      message,
      progress: null
    });
  });

  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((error) => {
        const message = serializeUpdateError(error);
        writeLog('ERROR', 'autoUpdater:autoCheck', message, error?.stack);
        sendUpdateStatus('error', { message, progress: null });
      });
    }, 10000);
  } else {
    sendUpdateStatus('disabled', {
      message: 'Updates are enabled in installed builds.',
      progress: null
    });
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 800,
    minHeight: 550,
    frame: false,
    transparent: false,
    backgroundColor: '#060a14',
    show: false,
    icon: path.join(__dirname, '..', '..', 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createOverlayWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenW, height: screenH } = primaryDisplay.workAreaSize;
  const overlayW = 280;
  const overlayH = 70;
  const defaultX = Math.round((screenW - overlayW) / 2);
  const defaultY = screenH - overlayH - 60;

  const pos = store.get('overlayPosition');
  overlayWindow = new BrowserWindow({
    width: overlayW,
    height: overlayH,
    x: pos.x >= 0 ? pos.x : defaultX,
    y: pos.y >= 0 ? pos.y : defaultY,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    focusable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html'));
  overlayWindow.setIgnoreMouseEvents(true, { forward: true });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icon.png');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } catch (e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Dictaloom', click: () => mainWindow && mainWindow.show() },
    { type: 'separator' },
    { label: 'Start Dictation', click: () => startDictation() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Dictaloom - AI Voice Dictation');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => mainWindow && mainWindow.show());
}

function registerShortcuts() {
  globalShortcut.unregisterAll();

  const dictShortcut = store.get('dictationShortcut') || 'Ctrl+Shift+Space';
  const cmdShortcut = store.get('commandShortcut') || 'Ctrl+Shift+Alt+Space';

  try {
    const electronDictShortcut = dictShortcut.replace('Ctrl', 'CommandOrControl');
    globalShortcut.register(electronDictShortcut, () => {
      handleShortcut('dictate');
    });
  } catch (e) {
    console.error('Failed to register dictation shortcut:', e);
  }

  try {
    const electronCmdShortcut = cmdShortcut.replace('Ctrl', 'CommandOrControl');
    globalShortcut.register(electronCmdShortcut, () => {
      handleShortcut('command');
    });
  } catch (e) {
    console.error('Failed to register command shortcut:', e);
  }
}

// Debounce and state machine for shortcut handling
let lastShortcutTime = 0;
let isProcessing = false;
const SHORTCUT_COOLDOWN_MS = 500;

function handleShortcut(mode) {
  const now = Date.now();
  // Ignore rapid-fire from key repeat
  if (now - lastShortcutTime < SHORTCUT_COOLDOWN_MS) return;
  lastShortcutTime = now;

  // Don't allow new recording while processing a previous one
  if (isProcessing) return;

  if (isRecording) {
    stopDictation(mode);
  } else {
    if (mode === 'command') {
      startCommandMode();
    } else {
      startDictation();
    }
  }
}

function startDictation() {
  isRecording = true;
  globalShortcut.register('Escape', cancelDictation);
  if (mainWindow) mainWindow.webContents.send('dictation-start');
  if (overlayWindow && store.get('showOverlay')) {
    overlayWindow.show();
    overlayWindow.webContents.send('overlay-state', 'listening');
  }
}

function stopDictation(mode = 'dictate') {
  if (!isRecording) return; // Guard against double-stop
  isRecording = false;
  isProcessing = true;
  globalShortcut.unregister('Escape');
  if (mainWindow) mainWindow.webContents.send('dictation-stop', mode);
  if (overlayWindow) {
    overlayWindow.webContents.send('overlay-state', 'processing');
  }
  // Safety timeout: reset processing state after 30s if renderer never responds
  setTimeout(() => {
    if (isProcessing) {
      isProcessing = false;
      if (overlayWindow) overlayWindow.hide();
    }
  }, 30000);
}

function startCommandMode() {
  isRecording = true;
  globalShortcut.register('Escape', cancelDictation);
  if (mainWindow) mainWindow.webContents.send('command-start');
  if (overlayWindow && store.get('showOverlay')) {
    overlayWindow.show();
    overlayWindow.webContents.send('overlay-state', 'listening');
  }
}

function cancelDictation() {
  if (!isRecording) return;
  isRecording = false;
  isProcessing = false;
  globalShortcut.unregister('Escape');
  if (mainWindow) mainWindow.webContents.send('dictation-cancel');
  if (overlayWindow) overlayWindow.hide();
}

async function injectText(text) {
  const savedClipboard = clipboard.readText();
  clipboard.writeText(text);

  // Simulate Ctrl+V using PowerShell
  try {
    const { exec } = require('child_process');
    await new Promise((resolve, reject) => {
      exec('powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait(\'^v\')"',
        { windowsHide: true },
        (err) => { if (err) reject(err); else resolve(); }
      );
    });
  } catch (e) {
    console.error('Failed to inject text:', e);
  }

  // Restore clipboard after a short delay
  setTimeout(() => {
    clipboard.writeText(savedClipboard || '');
  }, 500);
}

// IPC Handlers
ipcMain.handle('get-settings', () => store.store);
ipcMain.handle('set-setting', (_, key, value) => {
  if (value === undefined || value === null) {
    store.delete(key);
  } else {
    store.set(key, value);
  }
  return true;
});
ipcMain.handle('get-setting', (_, key) => store.get(key));

ipcMain.handle('get-foreground-app', async () => {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    const psCmd = `(Get-Process | Where-Object { $_.MainWindowHandle -eq (Add-Type -MemberDefinition '[DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow();' -Name 'Win32' -Namespace Win32 -PassThru)::GetForegroundWindow() }).Name`;
    exec(`powershell -NoProfile -Command "${psCmd}"`, { windowsHide: true, timeout: 3000 }, (err, stdout) => {
      if (err) { resolve(''); return; }
      resolve((stdout || '').trim().toLowerCase());
    });
  });
});

ipcMain.handle('inject-text', async (_, text) => {
  await injectText(text);
  return true;
});

ipcMain.handle('copy-text', (_, text) => {
  clipboard.writeText(String(text || ''));
  return true;
});

ipcMain.handle('minimize-window', () => mainWindow && mainWindow.minimize());
ipcMain.handle('close-window', () => mainWindow && mainWindow.hide());

ipcMain.handle('overlay-done', () => {
  isProcessing = false;
  if (overlayWindow) {
    overlayWindow.webContents.send('overlay-state', 'done');
    setTimeout(() => { if (overlayWindow) overlayWindow.hide(); }, 1500);
  }
});

ipcMain.handle('overlay-error', () => {
  isProcessing = false;
  if (overlayWindow) {
    overlayWindow.webContents.send('overlay-state', 'error');
    setTimeout(() => { if (overlayWindow) overlayWindow.hide(); }, 2000);
  }
});

ipcMain.handle('overlay-hide', () => {
  isProcessing = false;
  if (overlayWindow) overlayWindow.hide();
});

ipcMain.handle('overlay-timer', (_, timeStr) => {
  if (overlayWindow) {
    overlayWindow.webContents.send('overlay-timer', timeStr);
  }
});

ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

ipcMain.handle('register-shortcuts', () => registerShortcuts());

ipcMain.handle('get-theme-info', () => getThemeState());
ipcMain.handle('set-app-theme', (_, themeSource) => applyAppTheme(themeSource));

ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-update-status', () => updateState);

ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) {
    return sendUpdateStatus('disabled', {
      message: 'Install a packaged build to check GitHub Releases for updates.',
      progress: null
    });
  }

  try {
    await autoUpdater.checkForUpdates();
    return updateState;
  } catch (error) {
    const message = serializeUpdateError(error);
    writeLog('ERROR', 'autoUpdater:manualCheck', message, error?.stack);
    return sendUpdateStatus('error', { message, progress: null });
  }
});

ipcMain.handle('download-update', async () => {
  if (!app.isPackaged) {
    return sendUpdateStatus('disabled', {
      message: 'Updates are only downloaded by installed builds.',
      progress: null
    });
  }

  try {
    await autoUpdater.downloadUpdate();
    return updateState;
  } catch (error) {
    const message = serializeUpdateError(error);
    writeLog('ERROR', 'autoUpdater:download', message, error?.stack);
    return sendUpdateStatus('error', { message, progress: null });
  }
});

ipcMain.handle('install-update', () => {
  if (!app.isPackaged) {
    return sendUpdateStatus('disabled', {
      message: 'Updates can only be installed from packaged builds.',
      progress: null
    });
  }

  autoUpdater.quitAndInstall(false, true);
  return true;
});

ipcMain.handle('set-auto-launch', (_, enabled) => {
  app.setLoginItemSettings({ openAtLogin: enabled });
  store.set('autoLaunch', enabled);
});

ipcMain.handle('save-and-open-log', async (_, logContent) => {
  // Open the persistent log file instead of writing a temp one
  const persistentLog = path.join(app.getPath('userData'), 'dictaloom.log');
  // Also append the renderer error log for completeness
  if (logContent && logContent !== 'No errors recorded.') {
    fs.appendFileSync(persistentLog, '\n--- Renderer Error Log Snapshot ---\n' + logContent + '\n', 'utf-8');
  }
  shell.openPath(persistentLog);
  return persistentLog;
});

// Log from renderer
ipcMain.handle('log-to-file', async (_, level, context, message, stack) => {
  writeLog(level, context, message, stack);
  return true;
});

// Failed recordings management
function getFailedDir() {
  const dir = path.join(app.getPath('userData'), 'failed-recordings');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

ipcMain.handle('save-failed-audio', async (_, base64Data, metadata) => {
  const dir = getFailedDir();
  const ts = Date.now();
  const audioPath = path.join(dir, `recording-${ts}.webm`);
  const metaPath = path.join(dir, `recording-${ts}.json`);
  const buffer = Buffer.from(base64Data, 'base64');
  fs.writeFileSync(audioPath, buffer);
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2), 'utf-8');
  writeLog('WARN', 'failedRecording', `Saved failed recording: recording-${ts}.webm (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);
  return `recording-${ts}`;
});

ipcMain.handle('get-failed-recordings', async () => {
  const dir = getFailedDir();
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.webm'));
  return files.map(f => {
    const base = f.replace('.webm', '');
    const metaPath = path.join(dir, base + '.json');
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch (e) { /* ignore */ }
    const stat = fs.statSync(path.join(dir, f));
    return { filename: f, baseName: base, sizeMB: (stat.size / 1024 / 1024).toFixed(1), ...meta };
  }).sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
});

ipcMain.handle('get-failed-recording-data', async (_, filename) => {
  const filePath = path.join(getFailedDir(), filename);
  if (!fs.existsSync(filePath)) return null;
  const buffer = fs.readFileSync(filePath);
  return buffer.toString('base64');
});

ipcMain.handle('delete-failed-recording', async (_, baseName) => {
  const dir = getFailedDir();
  const audioPath = path.join(dir, baseName + '.webm');
  const metaPath = path.join(dir, baseName + '.json');
  if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
  if (fs.existsSync(metaPath)) fs.unlinkSync(metaPath);
  return true;
});

// App lifecycle
app.whenReady().then(() => {
  initLogger();
  writeLog('INFO', 'app', 'Dictaloom starting up');
  applyAppTheme(store.get('theme'));
  createMainWindow();
  createOverlayWindow();
  createTray();
  registerShortcuts();
  setupAutoUpdater();

  if (store.get('autoLaunch')) {
    app.setLoginItemSettings({ openAtLogin: true });
  }
});

nativeTheme.on('updated', broadcastThemeState);

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Don't quit, stay in tray
  }
});

app.on('activate', () => {
  if (mainWindow === null) createMainWindow();
});
