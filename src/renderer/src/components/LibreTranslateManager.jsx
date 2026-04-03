import { useState, useEffect, useRef } from 'react';
import Ansi from 'ansi-to-react';

// ============================================================================
// Global Cache & Listeners
// These variables stay in memory across component mounts/unmounts, ensuring
// background logs are never lost while the app is open.
// ============================================================================
let globalLogsCache = [];
let logListeners = new Set();
let isGlobalListenerAttached = false;

/**
 * Initializes the global log listener to capture backend messages in the background.
 */
const setupGlobalListener = () => {
  if (isGlobalListenerAttached || !window.api || !window.api.onLibreTranslateLog) return;

  window.api.onLibreTranslateLog((message) => {
    const lines = message.split('\n');
    let newLogs = [...globalLogsCache];

    lines.forEach((line) => {
      if (line.includes('\r')) {
        const parts = line.split('\r');
        const finalPart = parts[parts.length - 1];
        if (finalPart.trim()) {
          if (newLogs.length > 0) {
            newLogs[newLogs.length - 1] = `[${new Date().toLocaleTimeString()}] ${finalPart}`;
          } else {
            newLogs.push(`[${new Date().toLocaleTimeString()}] ${finalPart}`);
          }
        }
      } else if (line.trim()) {
        newLogs.push(`[${new Date().toLocaleTimeString()}] ${line}`);
      }
    });

    if (newLogs.length > 500) newLogs = newLogs.slice(newLogs.length - 500);
    globalLogsCache = newLogs;

    // Notify all active React instances
    logListeners.forEach((listener) => listener(globalLogsCache));
  });

  isGlobalListenerAttached = true;
};

/**
 * Pushes a local log message to the global cache and updates listeners.
 * @param {string} msg - The message to append to the log.
 */
const pushLocalLog = (msg) => {
  let newLogs = [...globalLogsCache, `[${new Date().toLocaleTimeString()}] ${msg}`];
  if (newLogs.length > 500) newLogs = newLogs.slice(newLogs.length - 500);
  globalLogsCache = newLogs;
  logListeners.forEach((listener) => listener(globalLogsCache));
};

/**
 * Clears the global log cache.
 */
const clearGlobalLogs = () => {
  globalLogsCache = [];
  logListeners.forEach((listener) => listener(globalLogsCache));
};

/**
 * Detects the current Operating System.
 * @returns {'Windows' | 'Mac' | 'Linux'}
 */
const detectOS = () => {
  const userAgent = navigator.userAgent || navigator.vendor || window.opera;
  if (/windows phone/i.test(userAgent) || /win/i.test(userAgent)) return 'Windows';
  if (/mac/i.test(userAgent)) return 'Mac';
  return 'Linux';
};

/**
 * Component to manage the local installation and execution of LibreTranslate.
 * @param {Object} props - Component properties.
 * @param {boolean} props.isOpen - Determines if the manager modal is visible.
 * @param {() => void} props.onClose - Callback function triggered to close the modal.
 * @returns {JSX.Element|null} The modal element or null if closed.
 */
export default function LibreTranslateManager({ isOpen, onClose }) {
  const osType = detectOS();

  // Determine default paths based on OS
  const defaultPython = osType === 'Windows' ? 'python' : 'python3';
  const defaultInstallPath =
    osType === 'Windows' ? '%USERPROFILE%\\libretranslate-env' : '~/libretranslate-env';

  // Server and Environment Configuration
  const [installPath, setInstallPath] = useState(
    () => localStorage.getItem('lt_installPath') || defaultInstallPath,
  );
  const [pythonPath, setPythonPath] = useState(
    () => localStorage.getItem('lt_pythonPath') || defaultPython,
  );
  const [languages, setLanguages] = useState(() => localStorage.getItem('lt_languages') || '');
  const [port, setPort] = useState(() => localStorage.getItem('lt_port') || '5000');
  const [isPublic, setIsPublic] = useState(() => localStorage.getItem('lt_isPublic') === 'true');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('lt_apiKey') || '');

  // Process State and Logs
  const [isRunning, setIsRunning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([...globalLogsCache]);
  const logsEndRef = useRef(null);

  // We unify the session ID so install/update/start all use the same tracking mechanism.
  const SERVER_SESSION_ID = 'libre-server';

  // Save configurations to local cache
  useEffect(() => {
    localStorage.setItem('lt_installPath', installPath);
    localStorage.setItem('lt_pythonPath', pythonPath);
    localStorage.setItem('lt_languages', languages);
    localStorage.setItem('lt_port', port);
    localStorage.setItem('lt_isPublic', isPublic.toString());
    localStorage.setItem('lt_apiKey', apiKey);
  }, [installPath, pythonPath, languages, port, isPublic, apiKey]);

  // Auto-scroll the logs container
  useEffect(() => {
    if (logsEndRef.current && isOpen) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);

  // Initialize Global Listener and Subscriptions
  useEffect(() => {
    setupGlobalListener();

    // Subscribe to background log updates
    const handleLogUpdate = (updatedLogs) => setLogs([...updatedLogs]);
    logListeners.add(handleLogUpdate);

    return () => logListeners.delete(handleLogUpdate);
  }, []);

  // Check backend server status when the modal is opened
  useEffect(() => {
    const checkStatus = async () => {
      if (isOpen && window.api && window.api.getLibreServerStatus) {
        const status = await window.api.getLibreServerStatus(SERVER_SESSION_ID);
        const activeAction = localStorage.getItem('lt_activeAction');

        if (status.isRunning) {
          // Determines if the running process is the server or an installation/update task
          if (activeAction === 'start') {
            setIsRunning(true);
            setIsProcessing(false);
          } else {
            setIsRunning(false);
            setIsProcessing(true);
          }
        } else {
          setIsRunning(false);
          setIsProcessing(false);
          localStorage.removeItem('lt_activeAction');
        }
      }
    };
    checkStatus();
  }, [isOpen]);

  if (!isOpen) return null;

  /**
   * Generates the OS-specific shell script to manage LibreTranslate.
   * @param {string} action
   * @returns {string} The formatted script string.
   */
  const generateScript = (action) => {
    // Config
    const loadOnlyEnv = languages.trim() ? ` --load-only ${languages.trim()}` : '';
    const host = isPublic ? '0.0.0.0' : '127.0.0.1';
    const apiArg = apiKey.trim() ? `--api-keys ${apiKey.trim()}` : '';
    const config = ` --host ${host} --port ${port} ${apiArg}`;

    if (osType === 'Windows') {
      // PowerShell Script for Windows
      const source = `${installPath}\\argos-translate`;
      const target = `$env:USERPROFILE\\.local\\share\\argos-translate`;

      let linkCreator = `
        $PYTHONUNBUFFERED=1
        $SOURCE = "${source}"
        $TARGET = "${target}"

        if (-not (Test-Path "$TARGET" -PathType Container)) {
          New-Item -ItemType Directory -Force -Path (Split-Path $TARGET) | Out-Null
        }

        if (Test-Path -Path $TARGET) {
            $link = Get-Item -Path $TARGET
            if ($link.LinkType) {
                if ($link.Target -eq $SOURCE) {
                    Write-Host "Skipping: The link already exists and points to the correct location."
                } else {
                    Write-Error "Error: A link already exists at '$TARGET' but points to '$($link.Target)' instead of '$SOURCE'."
                    exit 1
                }
            } else {
                Write-Error "Error: '$TARGET' exists and is a regular directory, not a link."
                exit 1
            }
        }
      `;

      if (action === 'install') {
        linkCreator += `
        else {
            New-Item -ItemType SymbolicLink -Path $TARGET -Target $SOURCE | Out-Null
            Write-Host "Success: Symbolic link created successfully."
        }
        `;
        return `
          New-Item -ItemType Directory -Force -Path "${installPath}\\argos-translate" | Out-Null
          ${linkCreator}
          & "${pythonPath}" -m venv "${installPath}"
          & "${installPath}\\Scripts\\activate.ps1"
          python -m pip install --upgrade pip
          pip install libretranslate
          libretranslate${config}${loadOnlyEnv}
        `;
      } else if (action === 'update') {
        return `
          ${linkCreator}
          & "${installPath}\\Scripts\\activate.ps1"
          python -m pip install --upgrade pip
          pip install --upgrade libretranslate
          libretranslate${config} --update-models ${loadOnlyEnv}
        `;
      } else if (action === 'start') {
        return `
          ${linkCreator}
          & "${installPath}\\Scripts\\activate.ps1"
          libretranslate${config}
        `;
      }
    } else {
      // Bash Script for Linux/Mac

      // Define source and target paths
      const source = `${installPath}/argos-translate`;
      const target = `$HOME/.local/share/argos-translate`;

      // Link creator script (Part 1)
      let linkCreator = `
        # Forces Python to output logs in real-time (disables buffering)
        export PYTHONUNBUFFERED=1

        # Define source and target paths
        SOURCE="${source}"
        TARGET="${target}"

        # Check if target exists (as a symlink, file, or directory)
        if [ -L "$TARGET" ]; then
            # It's a symbolic link. Let's check where it points to.
            # readlink -f gets the absolute path
            CURRENT_PATH=$(readlink -f "$TARGET")

            if [ "$CURRENT_PATH" == "$SOURCE" ]; then
                echo -e "\\e[32mSkipping: The link already exists and points to the correct location.\\e[0m"
            else
                echo -e "\\e[31mError: A link already exists at '$TARGET' but points to '$CURRENT_PATH' instead of '$SOURCE'.\\e[0m" >&2
                exit 1
            fi
        elif [ -e "$TARGET" ]; then
            # The path exists but is NOT a symbolic link (it's a real file or folder)
            echo -e "\\e[31mError: '$TARGET' exists and is a regular file/directory, not a link.\\e[0m" >&2
            exit 1
      `;

      if (action === 'install') {
        // Link creator (Part 2)
        linkCreator += `
        else
            ln -s "$SOURCE" "$TARGET"
            echo -e "\\e[32mSuccess: Symbolic link created successfully.\\e[0m"
        fi`;

        // Command
        return `
          mkdir -p "${installPath}/argos-translate"
          ${linkCreator}
          "${pythonPath}" -m venv "${installPath}"
          source "${installPath}/bin/activate"
          pip install --upgrade pip
          pip install libretranslate
          libretranslate${config}${loadOnlyEnv}
        `;
      } else if (action === 'update') {
        // Link creator (Part 2)
        linkCreator += `
          fi`;

        // Command
        return `
          ${linkCreator}
          source "${installPath}/bin/activate"
          pip install --upgrade pip
          pip install --upgrade libretranslate
          libretranslate${config} --update-models ${loadOnlyEnv}
        `;
      } else if (action === 'start') {
        // Link creator (Part 2)
        linkCreator += `
        fi`;

        // Command
        return `
          ${linkCreator}
          source "${installPath}/bin/activate"
          libretranslate${config}
        `;
      }
    }
    return '';
  };

  /**
   * Sends formatted commands for the Electron backend to execute in the shell.
   * @param {string} action - The action to perform ('install', 'update', 'start', 'stop', 'cancel').
   * @returns {Promise<void>}
   */
  const handleCommand = async (action) => {
    if (!window.api || !window.api.runLibreCommand) {
      pushLocalLog(
        '\x1b[31mERROR: Electron API not found. Implement window.api.runLibreCommand in main.js\x1b[0m',
      );
      return;
    }

    if (action === 'cancel' || action === 'stop') {
      pushLocalLog('\x1b[33mSending stop signal to the active process...\x1b[0m');
      await window.api.stopLibreCommand(SERVER_SESSION_ID);
      setIsRunning(false);
      setIsProcessing(false);
      localStorage.removeItem('lt_activeAction');
      return;
    }

    const script = generateScript(action);

    if (action === 'install') {
      setIsProcessing(true);
      pushLocalLog(`\x1b[36mStarting installation process on ${osType}...\x1b[0m`);
    } else if (action === 'update') {
      setIsProcessing(true);
      pushLocalLog(`\x1b[36mStarting update process on ${osType}...\x1b[0m`);
    } else if (action === 'start') {
      pushLocalLog(`\x1b[36mStarting LibreTranslate instance on ${osType}...\x1b[0m`);
    }

    try {
      // Stores the current active action in local storage so it persists if modal closes
      localStorage.setItem('lt_activeAction', action);

      // Execute using the unified session ID, passing the OS type
      await window.api.runLibreCommand(action, script, SERVER_SESSION_ID, osType);

      // If the backend resolved immediately (e.g. start background task), we mark as running.
      if (action === 'start') {
        setIsRunning(true);
      }
    } catch (err) {
      pushLocalLog(`\x1b[31mFATAL ERROR: ${err.message}\x1b[0m`);
    } finally {
      // If it was install or update, the promise resolves when it's done.
      // We can turn off processing state and clean up the active action safely.
      if (action !== 'start') {
        setIsProcessing(false);
        localStorage.removeItem('lt_activeAction');
      }
    }
  };

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1060 }}
    >
      <div className="modal-dialog modal-dialog-centered modal-xl h-100 my-0 py-4">
        {/* Responsive adjustments: h-100 and d-flex column on the modal content */}
        <div
          className="modal-content bg-body text-body shadow-lg border-0 d-flex flex-column"
          style={{ height: 'calc(100vh - 4rem)' }}
        >
          <div className="modal-header bg-body-tertiary border-bottom-0 flex-shrink-0 d-flex align-items-center">
            <h5 className="modal-title fw-bold text-primary m-0">
              <i className="bi bi-translate me-2"></i>Local LibreTranslate Manager{' '}
              <span className="badge bg-secondary ms-2" style={{ fontSize: '0.6em' }}>
                {osType}
              </span>
            </h5>
            <div className="ms-auto d-flex align-items-center gap-2">
              <button
                type="button"
                className="btn btn-sm btn-link text-secondary p-0"
                onClick={onClose}
                title="Minimize window"
              >
                <i className="bi bi-dash-lg fs-5"></i>
              </button>
              <button
                type="button"
                className="btn-close"
                onClick={onClose}
                title="Close window"
              ></button>
            </div>
          </div>

          <div className="modal-body p-4 pt-2 d-flex flex-column flex-grow-1 overflow-hidden">
            <div className="row g-4 h-100">
              {/* Left Column: Configurations */}
              <div className="col-md-5 d-flex flex-column gap-3 h-100 overflow-auto pe-2">
                <div className="card shadow-sm border-0 bg-body-tertiary flex-shrink-0">
                  <div className="card-body">
                    <h6 className="fw-bold mb-3 text-secondary border-bottom pb-2">
                      Environment Setup
                    </h6>

                    <div className="mb-2">
                      <label className="form-label small fw-bold">Python Executable</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder={
                          osType === 'Windows'
                            ? 'e.g., python or C:\\Python39\\python.exe'
                            : 'e.g., python3 or /usr/bin/python3'
                        }
                        value={pythonPath}
                        onChange={(e) => setPythonPath(e.target.value)}
                        disabled={isRunning || isProcessing}
                      />
                    </div>

                    <div className="mb-2">
                      <label className="form-label small fw-bold">
                        Installation Directory (venv)
                      </label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={installPath}
                        onChange={(e) => setInstallPath(e.target.value)}
                        disabled={isRunning || isProcessing}
                      />
                    </div>

                    <div className="mb-2">
                      <label className="form-label small fw-bold">Languages to Load/Update</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="en,pt,es,fr (comma separated)"
                        value={languages}
                        onChange={(e) => setLanguages(e.target.value)}
                        disabled={isRunning || isProcessing}
                      />
                      <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                        Leave empty to load all (requires lots of storage).
                      </small>
                    </div>
                  </div>
                </div>

                <div className="card shadow-sm border-0 bg-body-tertiary flex-shrink-0">
                  <div className="card-body">
                    <h6 className="fw-bold mb-3 text-secondary border-bottom pb-2">
                      Server Configuration
                    </h6>

                    <div className="row g-2 mb-2">
                      <div className="col-6">
                        <label className="form-label small fw-bold">Port</label>
                        <input
                          type="number"
                          className="form-control form-control-sm"
                          value={port}
                          onChange={(e) => setPort(e.target.value)}
                          disabled={isRunning || isProcessing}
                        />
                      </div>
                      <div className="col-6 d-flex align-items-end">
                        <div className="form-check form-switch mb-1">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="publicSwitch"
                            checked={isPublic}
                            onChange={(e) => setIsPublic(e.target.checked)}
                            disabled={isRunning || isProcessing}
                          />
                          <label className="form-check-label small fw-bold" htmlFor="publicSwitch">
                            Public Network
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="mb-2">
                      <label className="form-label small fw-bold">API Key (Optional)</label>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Define a key to restrict access"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        disabled={isRunning || isProcessing}
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="d-flex flex-wrap gap-2 mt-auto pb-2 flex-shrink-0">
                  <button
                    className="btn btn-primary fw-bold flex-grow-1 shadow-sm"
                    onClick={() => handleCommand('install')}
                    disabled={isRunning || isProcessing}
                  >
                    <i className="bi bi-download me-1"></i>Install
                  </button>
                  <button
                    className="btn btn-outline-primary fw-bold flex-grow-1 shadow-sm"
                    onClick={() => handleCommand('update')}
                    disabled={isRunning || isProcessing}
                  >
                    <i className="bi bi-arrow-clockwise me-1"></i>Update
                  </button>

                  {/* Shared button for both Canceling tasks and Stopping the server */}
                  {(isProcessing || isRunning) && (
                    <button
                      className="btn btn-danger fw-bold w-100 shadow-sm mt-2"
                      onClick={() => handleCommand('stop')}
                    >
                      <i className="bi bi-stop-circle me-1"></i>
                      {isRunning ? 'Stop Server' : 'Stop Process'}
                    </button>
                  )}

                  {/* If you are not running or processing, display Start */}
                  {!isRunning && !isProcessing && (
                    <button
                      className="btn btn-success fw-bold w-100 shadow-sm mt-2"
                      onClick={() => handleCommand('start')}
                    >
                      <i className="bi bi-play-circle me-1"></i>Start Server
                    </button>
                  )}
                </div>
              </div>

              {/* Right Column: Console / Logs */}
              <div className="col-md-7 d-flex flex-column h-100">
                <div className="d-flex justify-content-between align-items-center mb-2 flex-shrink-0">
                  <span className="fw-bold small text-uppercase text-secondary">
                    <i className="bi bi-terminal me-2"></i>System Logs
                  </span>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-secondary">{logs.length} / 500 lines</span>
                    <button
                      className="btn btn-sm btn-outline-danger py-0 px-2"
                      onClick={clearGlobalLogs}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {/* Responsive log container using flex-grow */}
                <div
                  className="form-control flex-grow-1 bg-dark text-light font-monospace small p-3 overflow-auto shadow-inner"
                  style={{
                    minHeight: 0,
                    resize: 'none',
                    lineHeight: '1.4',
                  }}
                >
                  {logs.length === 0 ? (
                    <span className="text-muted fst-italic">Awaiting commands...</span>
                  ) : (
                    logs.map((log, index) => (
                      <div
                        key={index}
                        style={{
                          wordWrap: 'break-word',
                          whiteSpace: 'pre-wrap', // Ensures that spaces and tabs are respected
                        }}
                      >
                        {/* Ansi converts terminal colors \x1b[31m to React native CSS */}
                        <Ansi>{log}</Ansi>
                      </div>
                    ))
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
