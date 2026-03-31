import { useRef } from 'react';
import { DEFAULT_LM_INSTRUCTION, DEFAULT_LM_AUTO_INSTRUCTION } from '../utils/defaultValues';

/**
 * @typedef {Object} LibreConfig
 * @property {string} protocol
 * @property {string} ip
 */

/**
 * @typedef {Object} LmStudioConfig
 * @property {string} protocol
 * @property {string} ip
 */

/**
 * @typedef {{ libre: LibreConfig; lmstudio: LmStudioConfig }} SettingsParams
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
        if (parsedData.servers && parsedData.servers.libre && parsedData.servers.lmstudio) {
          setConfig(parsedData.servers);
        } else if (parsedData.libre && parsedData.lmstudio) {
          // Fallback for the older structure just in case
          setConfig({ libre: parsedData.libre, lmstudio: parsedData.lmstudio });
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

  return (
    <div className="row justify-content-center">
      <div className="col-md-8">
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-dark text-white d-flex justify-content-between align-items-center">
            <span>Server Configuration</span>
            <div>
              <input
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                ref={fileInputRef}
                onChange={handleImport}
              />
              <button
                className="btn btn-sm btn-outline-light me-2"
                onClick={() => fileInputRef.current?.click()}
              >
                Import
              </button>
              <button className="btn btn-sm btn-light" onClick={handleExport}>
                Export
              </button>
            </div>
          </div>
          <div className="card-body">
            <h5 className="mb-3">LibreTranslate API</h5>
            <div className="input-group mb-4">
              <select
                className="form-select flex-grow-0"
                style={{ width: '120px' }}
                value={config.libre.protocol}
                onChange={(e) =>
                  setConfig({ ...config, libre: { ...config.libre, protocol: e.target.value } })
                }
              >
                <option value="http">HTTP://</option>
                <option value="https">HTTPS://</option>
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

            <h5 className="mb-3">LM Studio API</h5>
            <div className="input-group">
              <select
                className="form-select flex-grow-0"
                style={{ width: '120px' }}
                value={config.lmstudio.protocol}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    lmstudio: { ...config.lmstudio, protocol: e.target.value },
                  })
                }
              >
                <option value="http">HTTP://</option>
                <option value="https">HTTPS://</option>
              </select>
              <input
                type="text"
                className="form-control"
                placeholder="127.0.0.1:1234"
                value={config.lmstudio.ip}
                onChange={(e) =>
                  setConfig({ ...config, lmstudio: { ...config.lmstudio, ip: e.target.value } })
                }
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
