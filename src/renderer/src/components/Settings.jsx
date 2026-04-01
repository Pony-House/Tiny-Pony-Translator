import { useRef } from 'react';
import { DEFAULT_LM_INSTRUCTION, DEFAULT_LM_AUTO_INSTRUCTION } from '../utils/defaultValues';

/**
 * @typedef {Object} LibreConfig
 * @property {string} protocol
 * @property {string} ip
 */

/**
 * @typedef {Object} OpenAicConfig
 * @property {string} protocol
 * @property {string} ip
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
 * @param {Object} options
 * @param {SettingsParams} options.config
 * @param {(ops: SettingsParams) => void} options.setConfig
 */
export default function Settings({ config, setConfig }) {
  const fileInputRef = useRef(null);

  /**
   * @returns {void}
   */
  const handleExport = () => {
    /** @type {object} */
    const exportData = {
      servers: config,
      prompts: {
        lmInstruction: localStorage.getItem('lmInstruction') || DEFAULT_LM_INSTRUCTION,
        lmAutoInstruction: localStorage.getItem('lmAutoInstruction') || DEFAULT_LM_AUTO_INSTRUCTION,
        lmHeader: localStorage.getItem('lmHeader') || '',
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

        // Handle prompts directly to localStorage
        if (parsedData.prompts) {
          if (parsedData.prompts.lmInstruction)
            localStorage.setItem('lmInstruction', parsedData.prompts.lmInstruction);
          if (parsedData.prompts.lmAutoInstruction)
            localStorage.setItem('lmAutoInstruction', parsedData.prompts.lmAutoInstruction);
          if (parsedData.prompts.lmHeader !== undefined)
            localStorage.setItem('lmHeader', parsedData.prompts.lmHeader);
        }
      } catch (err) {
        console.error('Invalid JSON file', err);
      }
    };

    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  /**
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
   * @returns {void}
   */
  const addLanguage = () => {
    setConfig({ ...config, lmLanguages: [...config.lmLanguages, { code: '', name: '' }] });
  };

  /**
   * @param {number} index
   * @returns {void}
   */
  const removeLanguage = (index) => {
    const newLangs = config.lmLanguages.filter((_, i) => i !== index);
    setConfig({ ...config, lmLanguages: newLangs });
  };

  return (
    <div className="row g-4">
      <div className="col-md-6">
        <div className="card shadow-sm h-100 border-0">
          <div className="card-header bg-body-secondary text-body d-flex justify-content-between align-items-center">
            <span className="fw-bold">Global Settings</span>
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
                Import
              </button>
              <button className="btn btn-sm btn-secondary" onClick={handleExport}>
                Export
              </button>
            </div>
          </div>
          <div className="card-body bg-body">
            <h5 className="mb-3">LibreTranslate API</h5>
            <div className="input-group mb-4">
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

            <h5 className="mb-3">OpenAi Compatible API</h5>
            <div className="input-group mb-4">
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

            <div>
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
          </div>
        </div>
      </div>

      <div className="col-md-6">
        <div className="card shadow-sm h-100 border-0">
          <div className="card-header bg-body-secondary text-body d-flex justify-content-between align-items-center">
            <span className="fw-bold">OpenAi Compatible Languages</span>
            <button className="btn btn-sm btn-secondary fw-bold" onClick={addLanguage}>
              + Add
            </button>
          </div>
          <div className="card-body bg-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
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
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
