import { useRef, useState } from 'react';
import {
  DEFAULT_LM_INSTRUCTION,
  DEFAULT_LM_AUTO_INSTRUCTION,
  DEFAULT_LM_INSTRUCTION_WITH_CHARACTER,
  DEFAULT_LM_AUTO_INSTRUCTION_WITH_CHARACTER,
  DEFAULT_LM_INSTRUCTION_ORTH,
  DEFAULT_LM_AUTO_INSTRUCTION_ORTH,
} from '../utils/defaultValues';
import LibreTranslateManager from './LibreTranslateManager';
import { isElectron } from '../utils/values';

/**
 * @typedef {Object} LibreConfig
 * @property {string} protocol
 * @property {string} ip
 * @property {string} apiKey
 */

/**
 * @typedef {Object} OpenAicConfig
 * @property {string} protocol
 * @property {string} ip
 * @property {string} apiKey
 */

/**
 * @typedef {Object} LanguageEntry
 * @property {string} code
 * @property {string} name
 */

/**
 * @typedef {Object} SettingsParams
 * @property {LibreConfig} libre
 * @property {OpenAicConfig} openaic
 * @property {number} typingDelay
 * @property {LanguageEntry[]} lmLanguages
 * @property {string} theme
 */

/**
 * Component to manage the application's global settings.
 * @param {Object} options
 * @param {SettingsParams} options.config
 * @param {(ops: SettingsParams) => void} options.setConfig
 * @returns {JSX.Element}
 */
export default function Settings({ config, setConfig }) {
  const fileInputRef = useRef(null);

  const [isLibreManagerOpen, setIsLibreManagerOpen] = useState(false);
  const [isHttpsWeb] = useState(
    !isElectron && typeof window !== 'undefined' && window.location.protocol === 'https:',
  );

  /**
   * Exports the current settings, all prompt configurations, and local instance setups to a JSON file.
   * @returns {void}
   */
  const handleExport = () => {
    /** @type {object} */
    const exportData = {
      servers: config,
      localInstance: {
        installPath: localStorage.getItem('lt_installPath') || '~/libretranslate-env',
        pythonPath: localStorage.getItem('lt_pythonPath') || 'python3',
        languages: localStorage.getItem('lt_languages') || '',
        port: localStorage.getItem('lt_port') || '5000',
        isPublic: localStorage.getItem('lt_isPublic') === 'true',
        apiKey: localStorage.getItem('lt_apiKey') || '',
      },
      prompts: {
        promptMode: localStorage.getItem('promptMode') || 'standard',
        standard: {
          lmInstruction: localStorage.getItem('lmInstruction_standard') || DEFAULT_LM_INSTRUCTION,
          lmAutoInstruction:
            localStorage.getItem('lmAutoInstruction_standard') || DEFAULT_LM_AUTO_INSTRUCTION,
          lmHeader: localStorage.getItem('lmHeader_standard') || '',
        },
        character: {
          lmInstruction:
            localStorage.getItem('lmInstruction_character') ||
            DEFAULT_LM_INSTRUCTION_WITH_CHARACTER,
          lmAutoInstruction:
            localStorage.getItem('lmAutoInstruction_character') ||
            DEFAULT_LM_AUTO_INSTRUCTION_WITH_CHARACTER,
          lmHeader: localStorage.getItem('lmHeader_character') || '',
        },
        orthographic: {
          lmInstruction:
            localStorage.getItem('lmInstruction_orthographic') || DEFAULT_LM_INSTRUCTION_ORTH,
          lmAutoInstruction:
            localStorage.getItem('lmAutoInstruction_orthographic') ||
            DEFAULT_LM_AUTO_INSTRUCTION_ORTH,
          lmHeader: localStorage.getItem('lmHeader_orthographic') || '',
        },
      },
    };

    /** @type {string} */
    const dataStr =
      'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute('href', dataStr);
    downloadAnchorNode.setAttribute('download', 'ponytranslate_settings.json');
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
  };

  /**
   * Imports settings, local instance configurations, and prompts from a selected JSON file.
   * @param {import('react').ChangeEvent<HTMLInputElement>} e
   * @returns {void}
   */
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileReader = new FileReader();
    fileReader.readAsText(file, 'UTF-8');
    fileReader.onload = (event) => {
      try {
        const parsedData = JSON.parse(event.target.result);

        // Handle server config
        if (parsedData.servers && parsedData.servers.libre) {
          setConfig(parsedData.servers);
        }

        // Handle local instance config
        if (parsedData.localInstance) {
          if (parsedData.localInstance.installPath !== undefined)
            localStorage.setItem('lt_installPath', parsedData.localInstance.installPath);
          if (parsedData.localInstance.pythonPath !== undefined)
            localStorage.setItem('lt_pythonPath', parsedData.localInstance.pythonPath);
          if (parsedData.localInstance.languages !== undefined)
            localStorage.setItem('lt_languages', parsedData.localInstance.languages);
          if (parsedData.localInstance.port !== undefined)
            localStorage.setItem('lt_port', parsedData.localInstance.port);
          if (parsedData.localInstance.isPublic !== undefined)
            localStorage.setItem('lt_isPublic', parsedData.localInstance.isPublic.toString());
          if (parsedData.localInstance.apiKey !== undefined)
            localStorage.setItem('lt_apiKey', parsedData.localInstance.apiKey);
        }

        // Handle prompt caches
        if (parsedData.prompts) {
          // Restore the active mode
          if (parsedData.prompts.promptMode) {
            localStorage.setItem('promptMode', parsedData.prompts.promptMode);
          }

          // Restore the new multi-profile structure
          const modes = ['standard', 'character', 'orthographic'];
          modes.forEach((mode) => {
            if (parsedData.prompts[mode]) {
              if (parsedData.prompts[mode].lmInstruction)
                localStorage.setItem(
                  `lmInstruction_${mode}`,
                  parsedData.prompts[mode].lmInstruction,
                );
              if (parsedData.prompts[mode].lmAutoInstruction)
                localStorage.setItem(
                  `lmAutoInstruction_${mode}`,
                  parsedData.prompts[mode].lmAutoInstruction,
                );
              if (parsedData.prompts[mode].lmHeader !== undefined)
                localStorage.setItem(`lmHeader_${mode}`, parsedData.prompts[mode].lmHeader);
            }
          });

          // Backward compatibility for older backup files that used the flat structure
          if (parsedData.prompts.lmInstruction) {
            localStorage.setItem('lmInstruction_standard', parsedData.prompts.lmInstruction);
          }
          if (parsedData.prompts.lmAutoInstruction) {
            localStorage.setItem(
              'lmAutoInstruction_standard',
              parsedData.prompts.lmAutoInstruction,
            );
          }
          if (
            parsedData.prompts.lmHeader !== undefined &&
            typeof parsedData.prompts.lmHeader === 'string'
          ) {
            localStorage.setItem('lmHeader_standard', parsedData.prompts.lmHeader);
          }
        }

        // Triggers the app restart to apply all settings properly
        setTimeout(() => {
          if (isElectron && window.api.restartApp) {
            window.api.restartApp();
          } else {
            window.location.reload();
          }
        }, 500);
      } catch (err) {
        console.error('Invalid JSON file', err);
      }
    };

    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
   * Updates a specific field of a language entry.
   * @param {number} index
   * @param {'code' | 'name'} field
   * @param {string} value
   * @returns {void}
   */
  const handleLanguageChange = (index, field, value) => {
    const newLangs = [...config.lmLanguages];
    newLangs[index][field] = value;
    setConfig({ ...config, lmLanguages: newLangs });
  };

  /**
   * Adds a new empty language entry to the configuration.
   * @returns {void}
   */
  const addLanguage = () => {
    setConfig({ ...config, lmLanguages: [...config.lmLanguages, { code: '', name: '' }] });
  };

  /**
   * Removes a language entry from the configuration.
   * @param {number} index
   * @returns {void}
   */
  const removeLanguage = (index) => {
    const newLangs = config.lmLanguages.filter((_, i) => i !== index);
    setConfig({ ...config, lmLanguages: newLangs });
  };

  /**
   * Opens the GitHub repository link.
   * @returns {void}
   */
  const handleOpenGitHub = () => {
    const githubUrl = 'https://github.com/Pony-House/Tiny-Pony-Translator';
    if (isElectron && window.api.openExternal) {
      window.api.openExternal(githubUrl);
    } else {
      window.open(githubUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="h-100 overflow-auto w-100 pe-2 pb-3">
      {isHttpsWeb && (
        <div className="alert alert-warning py-2 mb-3 mx-2 small fw-bold d-flex align-items-center shadow-sm">
          <i className="bi bi-exclamation-triangle-fill fs-4 me-3 text-warning-emphasis"></i>
          <div>
            You are using the web version over HTTPS. Browsers may block connections to HTTP APIs
            (Mixed Content). If you experience connection errors, ensure your API uses HTTPS or host
            this web version over HTTP.
          </div>
        </div>
      )}
      <div className="row g-4 m-0">
        <div className="col-md-6 px-2">
          <div className="card shadow-sm border-0 d-flex flex-column h-100">
            <div className="card-header bg-body-secondary text-body d-flex justify-content-between align-items-center flex-shrink-0">
              <span className="fw-bold">
                <i className="bi bi-sliders me-2"></i>Global Settings
              </span>
              <div>
                <input
                  type="file"
                  accept=".json"
                  style={{ display: 'none' }}
                  ref={fileInputRef}
                  onChange={handleImport}
                />
                <button
                  className="btn btn-sm btn-outline-secondary me-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <i className="bi bi-upload me-1"></i>Import
                </button>
                <button className="btn btn-sm btn-secondary" onClick={handleExport}>
                  <i className="bi bi-download me-1"></i>Export
                </button>
              </div>
            </div>
            <div className="card-body bg-body flex-grow-1">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="m-0">LibreTranslate API</h5>
              </div>
              <div className="input-group mb-2">
                <select
                  className="form-select flex-grow-0"
                  style={{ width: '100px' }}
                  value={config.libre.protocol}
                  onChange={(e) =>
                    setConfig({ ...config, libre: { ...config.libre, protocol: e.target.value } })
                  }
                >
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                </select>
                <input
                  type="text"
                  className="form-control"
                  placeholder="127.0.0.1:5000"
                  value={config.libre.ip}
                  onChange={(e) =>
                    setConfig({ ...config, libre: { ...config.libre, ip: e.target.value } })
                  }
                />
              </div>
              <div className="mb-3">
                <input
                  type="password"
                  className="form-control"
                  placeholder="API Key (Optional)"
                  value={config.libre.apiKey || ''}
                  onChange={(e) =>
                    setConfig({ ...config, libre: { ...config.libre, apiKey: e.target.value } })
                  }
                />
              </div>

              {/* Show Local Manager ONLY in Electron */}
              {isElectron && (
                <div className="mb-4">
                  <button
                    className="btn btn-sm btn-primary fw-bold w-100"
                    onClick={() => setIsLibreManagerOpen(true)}
                  >
                    <i className="bi bi-hdd-network me-2"></i>Manage Local Instance
                  </button>
                </div>
              )}

              <h5 className="mb-3 mt-4">OpenAi Compatible API</h5>
              <div className="input-group mb-2">
                <select
                  className="form-select flex-grow-0"
                  style={{ width: '100px' }}
                  value={config.openaic.protocol}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      openaic: { ...config.openaic, protocol: e.target.value },
                    })
                  }
                >
                  <option value="http">HTTP</option>
                  <option value="https">HTTPS</option>
                </select>
                <input
                  type="text"
                  className="form-control"
                  placeholder="127.0.0.1:1234"
                  value={config.openaic.ip}
                  onChange={(e) =>
                    setConfig({ ...config, openaic: { ...config.openaic, ip: e.target.value } })
                  }
                />
              </div>
              <div className="mb-4">
                <input
                  type="password"
                  className="form-control"
                  placeholder="API Key (Optional)"
                  value={config.openaic.apiKey || ''}
                  onChange={(e) =>
                    setConfig({ ...config, openaic: { ...config.openaic, apiKey: e.target.value } })
                  }
                />
              </div>

              <h5 className="mb-3 border-top pt-3">Preferences & Appearance</h5>
              <div className="mb-3">
                <label className="form-label">Theme</label>
                <select
                  className="form-select w-50"
                  value={config.theme}
                  onChange={(e) => setConfig({ ...config, theme: e.target.value })}
                >
                  <option value="auto">System Auto</option>
                  <option value="light">Light Mode</option>
                  <option value="dark">Dark Mode</option>
                </select>
              </div>

              <div className="mb-4">
                <label className="form-label">Typing Delay (milliseconds)</label>
                <input
                  type="number"
                  className="form-control w-50"
                  value={config.typingDelay}
                  onChange={(e) =>
                    setConfig({ ...config, typingDelay: parseInt(e.target.value) || 1000 })
                  }
                />
              </div>

              <h5 className="mb-3 border-top pt-3">About & Support</h5>
              <div className="d-flex flex-column gap-2 mb-2">
                <button
                  className="btn btn-outline-dark text-body fw-bold w-100 shadow-sm d-flex justify-content-center align-items-center"
                  style={{
                    borderColor: 'var(--bs-border-color)',
                  }}
                  onClick={handleOpenGitHub}
                >
                  <i className="bi bi-github fs-5 me-2"></i>
                  <span>Contribute or Donate on GitHub</span>
                </button>
                <small className="text-muted text-center" style={{ fontSize: '0.75rem' }}>
                  Your support helps keep this project alive and growing!
                </small>
              </div>
            </div>
          </div>
        </div>

        <div className="col-md-6 px-2">
          <div className="card shadow-sm border-0 d-flex flex-column h-100">
            <div className="card-header bg-body-secondary text-body d-flex justify-content-between align-items-center flex-shrink-0">
              <span className="fw-bold">
                <i className="bi bi-globe me-2"></i>OpenAi Compatible Languages
              </span>
              <button className="btn btn-sm btn-secondary fw-bold" onClick={addLanguage}>
                <i className="bi bi-plus-lg me-1"></i>Add
              </button>
            </div>
            <div
              className="card-body bg-body flex-grow-1"
              style={{ maxHeight: '65vh', overflowY: 'auto' }}
            >
              {config.lmLanguages.map((lang, index) => (
                <div key={index} className="row g-2 mb-2 align-items-center">
                  <div className="col-3">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Code"
                      value={lang.code}
                      onChange={(e) => handleLanguageChange(index, 'code', e.target.value)}
                      disabled={lang.code === 'auto'}
                    />
                  </div>
                  <div className="col-7">
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Name"
                      value={lang.name}
                      onChange={(e) => handleLanguageChange(index, 'name', e.target.value)}
                    />
                  </div>
                  <div className="col-2 text-end">
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => removeLanguage(index)}
                      disabled={lang.code === 'auto'}
                    >
                      <i className="bi bi-x-lg"></i>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isElectron && (
        <LibreTranslateManager
          isOpen={isLibreManagerOpen}
          onClose={() => setIsLibreManagerOpen(false)}
        />
      )}
    </div>
  );
}
