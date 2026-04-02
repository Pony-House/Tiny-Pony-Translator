import { useState, useEffect, useRef } from 'react';
import Ansi from 'ansi-to-react';

/**
 * Component to manage the local installation and execution of LibreTranslate.
 * @param {Object} props - Component properties.
 * @param {boolean} props.isOpen - Determines if the manager modal is visible.
 * @param {() => void} props.onClose - Callback function triggered to close the modal.
 * @returns {JSX.Element|null} The modal element or null if closed.
 */
export default function LibreTranslateManager({ isOpen, onClose }) {
  // Server and Environment Configuration
  const [installPath, setInstallPath] = useState(
    () => localStorage.getItem('lt_installPath') || `~/libretranslate-env`,
  );
  const [pythonPath, setPythonPath] = useState(
    () => localStorage.getItem('lt_pythonPath') || 'python3',
  );
  const [languages, setLanguages] = useState(() => localStorage.getItem('lt_languages') || '');
  const [port, setPort] = useState(() => localStorage.getItem('lt_port') || '5000');
  const [isPublic, setIsPublic] = useState(() => localStorage.getItem('lt_isPublic') === 'true');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('lt_apiKey') || '');

  // Process State and Logs
  const [isRunning, setIsRunning] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState([]);
  const logsEndRef = useRef(null);

  // Constants for Session IDs to prevent ghost instances
  const SERVER_SESSION_ID = 'libre-server';
  const TASK_SESSION_ID = 'libre-task';

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
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Check backend server status when the modal is opened
  useEffect(() => {
    const checkStatus = async () => {
      if (isOpen && window.api && window.api.getLibreServerStatus) {
        const status = await window.api.getLibreServerStatus(SERVER_SESSION_ID);
        setIsRunning(status.isRunning);

        // Also checks if there is any installation running in background
        const taskStatus = await window.api.getLibreServerStatus(TASK_SESSION_ID);
        setIsProcessing(taskStatus.isRunning);
      }
    };
    checkStatus();
  }, [isOpen]);

  // Listener to capture logs from the backend (Main Process)
  useEffect(() => {
    if (window.api && window.api.onLibreTranslateLog) {
      const removeListener = window.api.onLibreTranslateLog((message) => {
        setLogs((prev) => {
          // Handles carriage return (\r) characters used by Python progress bars
          const lines = message.split('\n');
          let newLogs = [...prev];

          lines.forEach((line) => {
            if (line.includes('\r')) {
              // Replaces the last line if \r is present (typical of download progress bars)
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

          // Strictly limits to 500 logs to prevent React memory issues
          return newLogs.length > 500 ? newLogs.slice(newLogs.length - 500) : newLogs;
        });
      });
      return () => removeListener();
    }
  }, []);

  if (!isOpen) return null;

  /**
   * Sends formatted commands for the Electron backend to execute in the shell.
   * @param {string} action - The action to perform ('install', 'update', 'start', 'stop', 'cancel').
   * @returns {Promise<void>}
   */
  const handleCommand = async (action) => {
    if (!window.api || !window.api.runLibreCommand) {
      addLocalLog(
        '\x1b[31mERROR: Electron API not found. Implement window.api.runLibreCommand in main.js\x1b[0m',
      );
      return;
    }

    if (action === 'cancel') {
      addLocalLog('\x1b[33mCanceling current operation...\x1b[0m');
      await window.api.stopLibreCommand(TASK_SESSION_ID);
      setIsProcessing(false);
      return;
    }

    if (action === 'stop') {
      addLocalLog('\x1b[33mSending stop signal to the server...\x1b[0m');
      await window.api.stopLibreCommand(SERVER_SESSION_ID);
      setIsRunning(false);
      return;
    }

    const loadOnlyEnv = languages.trim() ? ` --load-only ${languages.trim()}` : '';
    let script = '';

    // Link creator script (Part 1)
    let linkCreator = `
      # Forces Python to output logs in real-time (disables buffering)
      export PYTHONUNBUFFERED=1

      # Define source and target paths
      SOURCE="${installPath}/argos-translate"
      TARGET="$HOME/.local/share/argos-translate"

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

    // Determine which session ID to use for process tracking
    const sessionId = action === 'start' ? SERVER_SESSION_ID : TASK_SESSION_ID;

    if (action === 'install') {
      setIsProcessing(true);
      addLocalLog('\x1b[36mStarting installation process...\x1b[0m');

      // Link creator (Part 2)
      linkCreator += `
      else
          ln -s "$SOURCE" "$TARGET"
          echo -e "\\e[32mSuccess: Symbolic link created successfully.\\e[0m"
      fi`;

      // Command
      script = `
        mkdir -p "${installPath}/argos-translate"
        ${linkCreator}
        "${pythonPath}" -m venv "${installPath}"
        source "${installPath}/bin/activate"
        pip install --upgrade pip
        pip install libretranslate
        libretranslate ${loadOnlyEnv}
      `;
    } else if (action === 'update') {
      setIsProcessing(true);
      addLocalLog('\x1b[36mStarting update process...\x1b[0m');

      // Link creator (Part 2)
      linkCreator += `
      fi`;

      // Command
      script = `
        ${linkCreator}
        source "${installPath}/bin/activate"
        pip install --upgrade pip
        pip install --upgrade libretranslate
        libretranslate --update-models ${loadOnlyEnv}
      `;
    } else if (action === 'start') {
      addLocalLog('\x1b[36mStarting LibreTranslate instance...\x1b[0m');
      const host = isPublic ? '0.0.0.0' : '127.0.0.1';
      const apiArg = apiKey.trim() ? `--api-keys ${apiKey.trim()}` : '';

      // Link creator (Part 2)
      linkCreator += `
      fi`;

      // Command
      script = `
        ${linkCreator}
        source "${installPath}/bin/activate"
        libretranslate --host ${host} --port ${port} ${apiArg}
      `;
    }

    try {
      // The backend should return when the script finishes (for install/update)
      // For 'start', it runs in the background and resolves immediately.
      await window.api.runLibreCommand(action, script, sessionId);

      if (action === 'start') {
        setIsRunning(true);
      }
    } catch (err) {
      addLocalLog(`\x1b[31mFATAL ERROR: ${err.message}\x1b[0m`);
    } finally {
      if (action !== 'start') setIsProcessing(false);
    }
  };

  /**
   * Appends a local message to the logs.
   * @param {string} msg - The message to add.
   * @returns {void}
   */
  const addLocalLog = (msg) => {
    setLogs((prev) => {
      const next = [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`];
      return next.length > 500 ? next.slice(next.length - 500) : next;
    });
  };

  /**
   * Clears all current logs.
   * @returns {void}
   */
  const clearLogs = () => setLogs([]);

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
          <div className="modal-header bg-body-tertiary border-bottom-0 flex-shrink-0">
            <h5 className="modal-title fw-bold text-primary">
              <i className="bi bi-translate me-2"></i>Local LibreTranslate Manager
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
              disabled={isProcessing && !isRunning}
            ></button>
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
                        placeholder="e.g., python3 or /usr/bin/python3"
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

                  {/* If you are processing (installing/updating), display Cancel */}
                  {isProcessing && !isRunning && (
                    <button
                      className="btn btn-warning fw-bold w-100 shadow-sm mt-2 text-dark"
                      onClick={() => handleCommand('cancel')}
                    >
                      <i className="bi bi-x-circle me-1"></i>Cancel Process
                    </button>
                  )}

                  {/* If the server is running, show Stop */}
                  {isRunning && (
                    <button
                      className="btn btn-danger fw-bold w-100 shadow-sm mt-2"
                      onClick={() => handleCommand('stop')}
                    >
                      <i className="bi bi-stop-circle me-1"></i>Stop Server
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
                    <button className="btn btn-sm btn-outline-danger py-0 px-2" onClick={clearLogs}>
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
