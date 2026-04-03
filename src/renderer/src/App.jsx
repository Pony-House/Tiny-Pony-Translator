import { useState, useEffect } from 'react';
import Settings from './components/Settings';
import Translator from './components/Translator';
import { LM_HARDCODED_LANGUAGES } from './utils/defaultValues';
import { isElectron } from './utils/values';

/**
 * Validates and sanitizes the parsed configuration object to prevent injection or corruption.
 * @param {any} parsed
 * @returns {import('./components/Settings').SettingsParams}
 */
const sanitizeConfig = (parsed) => {
  // Set default LibreTranslate based on environment
  const defaultLibre = isElectron
    ? { protocol: 'http', ip: '127.0.0.1:5000', apiKey: '' }
    : { protocol: 'https', ip: 'libretranslate.com', apiKey: '' };

  const safeConfig = {
    libre: defaultLibre,
    openaic: { protocol: 'http', ip: '127.0.0.1:1234', apiKey: '' },
    typingDelay: 1000,
    lmLanguages: LM_HARDCODED_LANGUAGES,
    theme: 'auto',
  };

  if (!parsed || typeof parsed !== 'object') return safeConfig;

  // Libre Config Validation
  if (parsed.libre && typeof parsed.libre === 'object') {
    safeConfig.libre.protocol = parsed.libre.protocol === 'https' ? 'https' : 'http';
    safeConfig.libre.ip =
      typeof parsed.libre.ip === 'string'
        ? parsed.libre.ip.replace(/[^a-zA-Z0-9.:-]/g, '').substring(0, 100)
        : safeConfig.libre.ip;
    safeConfig.libre.apiKey =
      typeof parsed.libre.apiKey === 'string' ? parsed.libre.apiKey.substring(0, 200) : '';
  }

  // OpenAic Config Validation
  if (parsed.openaic && typeof parsed.openaic === 'object') {
    safeConfig.openaic.protocol = parsed.openaic.protocol === 'https' ? 'https' : 'http';
    safeConfig.openaic.ip =
      typeof parsed.openaic.ip === 'string'
        ? parsed.openaic.ip.replace(/[^a-zA-Z0-9.:-]/g, '').substring(0, 100)
        : safeConfig.openaic.ip;
    safeConfig.openaic.apiKey =
      typeof parsed.openaic.apiKey === 'string' ? parsed.openaic.apiKey.substring(0, 200) : '';
  }

  // Primitives Validation
  if (
    typeof parsed.typingDelay === 'number' &&
    parsed.typingDelay >= 0 &&
    parsed.typingDelay <= 10000
  ) {
    safeConfig.typingDelay = parsed.typingDelay;
  }

  if (['auto', 'light', 'dark'].includes(parsed.theme)) {
    safeConfig.theme = parsed.theme;
  }

  // Array Validation
  if (Array.isArray(parsed.lmLanguages)) {
    safeConfig.lmLanguages = parsed.lmLanguages
      .filter(
        (lang) =>
          lang &&
          typeof lang === 'object' &&
          typeof lang.code === 'string' &&
          typeof lang.name === 'string',
      )
      .map((lang) => ({
        code: lang.code.substring(0, 20),
        name: lang.name.substring(0, 50),
      }));
  }

  return safeConfig;
};

export default function App() {
  /**
   * @returns {import('./components/Settings').SettingsParams}
   */
  /** @type {string | null} */
  const getInitialConfig = () => {
    const savedConfig = localStorage.getItem('appConfig');
    if (savedConfig) {
      try {
        /** @type {import('./components/Settings').SettingsParams} */
        const parsed = JSON.parse(savedConfig);
        return sanitizeConfig(parsed);
      } catch {
        // Fallback to default if JSON is corrupted
      }
    }
    return sanitizeConfig({});
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
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      /** @type {string} */
      const resolvedTheme =
        config.theme === 'auto' ? (mediaQuery.matches ? 'dark' : 'light') : config.theme;
      document.documentElement.setAttribute('data-bs-theme', resolvedTheme);
    };

    applyTheme();

    const handleChange = () => {
      if (config.theme === 'auto') applyTheme();
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [config.theme]);

  return (
    <div className="w-100 vh-100 bg-body-tertiary d-flex flex-column overflow-hidden transition-theme">
      {/* Navigation Header */}
      <nav
        className="d-flex justify-content-between align-items-center p-3 border-bottom bg-body flex-shrink-0 shadow-sm"
        style={{ zIndex: 10 }}
      >
        <div className="d-flex align-items-center gap-4">
          <h3 className="text-primary fw-bold mb-0">PonyTranslate</h3>
          <div className="btn-group shadow-sm">
            <button
              className={`btn ${view === 'translator' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setView('translator')}
            >
              <i className="bi bi-translate me-2"></i>Translator
            </button>
            <button
              className={`btn ${view === 'settings' ? 'btn-primary' : 'btn-outline-primary'}`}
              onClick={() => setView('settings')}
            >
              <i className="bi bi-gear-fill me-2"></i>Settings
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

      <main className="flex-grow-1 d-flex flex-column overflow-hidden p-3 p-md-4">
        {view === 'settings' ? (
          <Settings setConfig={setConfig} config={config} />
        ) : (
          <Translator key={apiMode} apiMode={apiMode} config={config} />
        )}
      </main>
    </div>
  );
}
