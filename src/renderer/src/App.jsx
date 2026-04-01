import { useState, useEffect } from 'react';
import Settings from './components/Settings';
import Translator from './components/Translator';
import { LM_HARDCODED_LANGUAGES } from './utils/defaultValues';

export default function App() {
  /**
   * @returns {import('./components/Settings').SettingsParams}
   */
  const getInitialConfig = () => {
    /** @type {string | null} */
    const savedConfig = localStorage.getItem('appConfig');
    if (savedConfig) {
      try {
        /** @type {import('./components/Settings').SettingsParams} */
        const parsed = JSON.parse(savedConfig);
        if (!parsed.typingDelay) parsed.typingDelay = 1000;
        if (!parsed.lmLanguages) parsed.lmLanguages = LM_HARDCODED_LANGUAGES;
        if (!parsed.theme) parsed.theme = 'auto';
        return parsed;
      } catch {
        // Fallback to default if JSON is corrupted
      }
    }
    return {
      libre: { protocol: 'http', ip: '127.0.0.1:5000' },
      openaic: { protocol: 'http', ip: '127.0.0.1:1234' },
      typingDelay: 1000,
      lmLanguages: LM_HARDCODED_LANGUAGES,
      theme: 'auto',
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

  // Theme Controller
  useEffect(() => {
    /** @type {MediaQueryList} */
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    /**
     * @returns {void}
     */
    const applyTheme = () => {
      /** @type {string} */
      const resolvedTheme =
        config.theme === 'auto' ? (mediaQuery.matches ? 'dark' : 'light') : config.theme;

      document.documentElement.setAttribute('data-bs-theme', resolvedTheme);
    };

    applyTheme();

    /**
     * @returns {void}
     */
    const handleChange = () => {
      if (config.theme === 'auto') applyTheme();
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [config.theme]);

  return (
    <div className="w-100 vh-100 bg-body-tertiary d-flex flex-column overflow-hidden transition-theme">
      {/* Navigation Header */}
      <nav className="d-flex justify-content-between align-items-center p-3 border-bottom bg-body flex-shrink-0">
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
              checked={apiMode === 'openaic'}
              onChange={() => setApiMode('openaic')}
            />
            <label className="btn btn-sm btn-outline-secondary" htmlFor="lmMode">
              OpenAi Compatible
            </label>
          </div>
        )}
      </nav>

      <main className="flex-grow-1 overflow-auto p-3 p-md-4">
        {view === 'settings' ? (
          <Settings setConfig={setConfig} config={config} />
        ) : (
          /* Added key={apiMode} here to force full re-rendering of the component when switching API */
          <Translator key={apiMode} apiMode={apiMode} config={config} />
        )}
      </main>
    </div>
  );
}
