import { useState, useEffect } from 'react';
import 'bootstrap/dist/css/bootstrap.min.css';
import Settings from './components/Settings';
import Translator from './components/Translator';

export default function App() {
  /**
   * @returns {import('./components/Settings').SettingsParams}
   */
  const getInitialConfig = () => {
    /** @type {string | null} */
    const savedConfig = localStorage.getItem('appConfig');
    if (savedConfig) {
      try {
        return JSON.parse(savedConfig);
      } catch {
        // Fallback to default if JSON is corrupted
      }
    }
    return {
      libre: { protocol: 'http', ip: '127.0.0.1:5000' },
      lmstudio: { protocol: 'http', ip: '127.0.0.1:1234' },
    };
  };

  // UI State
  const [view, setView] = useState('translator'); // 'translator' or 'settings'
  const [apiMode, setApiMode] = useState('libre');

  // Settings State
  const [config, setConfig] = useState(getInitialConfig);

  useEffect(() => {
    localStorage.setItem('appConfig', JSON.stringify(config));
  }, [config]);

  return (
    <div className="container-xxl py-4 bg-light min-vh-100">
      {/* Navigation Header */}
      <nav className="d-flex justify-content-between align-items-center mb-4 border-bottom pb-3">
        <div className="d-flex align-items-center gap-4">
          <h3 className="text-primary fw-bold mb-0">PonyTranslate</h3>
          <div className="btn-group shadow-sm">
            <button
              className={`btn ${view === 'translator' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setView('translator')}
            >
              Translator
            </button>
            <button
              className={`btn ${view === 'settings' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setView('settings')}
            >
              Settings
            </button>
          </div>
        </div>

        {view === 'translator' && (
          <div className="btn-group" role="group">
            <input
              type="radio"
              className="btn-check"
              name="apiMode"
              id="libreMode"
              checked={apiMode === 'libre'}
              onChange={() => setApiMode('libre')}
            />
            <label className="btn btn-sm btn-outline-secondary" htmlFor="libreMode">
              LibreTranslate
            </label>

            <input
              type="radio"
              className="btn-check"
              name="apiMode"
              id="lmMode"
              checked={apiMode === 'lmstudio'}
              onChange={() => setApiMode('lmstudio')}
            />
            <label className="btn btn-sm btn-outline-secondary" htmlFor="lmMode">
              LM Studio
            </label>
          </div>
        )}
      </nav>

      {view === 'settings' ? (
        <Settings setConfig={setConfig} config={config} />
      ) : (
        <Translator apiMode={apiMode} config={config} />
      )}
    </div>
  );
}
