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
  return (
    <div className="row justify-content-center">
      <div className="col-md-8">
        <div className="card shadow-sm mb-4">
          <div className="card-header bg-dark text-white">Server Configuration</div>
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
