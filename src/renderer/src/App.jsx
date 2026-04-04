import { useState, useEffect, useRef } from 'react';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef(null);

  // Settings State
  const [config, setConfig] = useState(getInitialConfig);

  useEffect(() => {
    localStorage.setItem('appConfig', JSON.stringify(config));
  }, [config]);

  // Handle outside clicks to close the mobile dropdown menu
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        className="d-flex justify-content-between align-items-center p-3 border-bottom bg-body flex-shrink-0 shadow-sm position-relative"
        style={{ zIndex: 10 }}
      >
        <div className="d-flex align-items-center gap-2 gap-md-4">
          <h3 className="text-primary fw-bold mb-0">PonyTranslate</h3>

          {/* Desktop Navigation Buttons */}
          <div className="btn-group shadow-sm d-none d-md-flex">
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

        {/* Desktop API Mode Switch */}
        {view === 'translator' && (
          <div className="btn-group d-none d-md-flex" role="group">
            <input
              type="radio"
              className="btn-check"
              name="apiModeDesktop"
              id="libreModeDesktop"
              checked={apiMode === 'libre'}
              onChange={() => setApiMode('libre')}
            />
            <label className="btn btn-sm btn-outline-secondary" htmlFor="libreModeDesktop">
              LibreTranslate
            </label>

            <input
              type="radio"
              className="btn-check"
              name="apiModeDesktop"
              id="lmModeDesktop"
              checked={apiMode === 'openaic'}
              onChange={() => setApiMode('openaic')}
            />
            <label className="btn btn-sm btn-outline-secondary" htmlFor="lmModeDesktop">
              OpenAi Compatible
            </label>
          </div>
        )}

        {/* Mobile Dropdown Menu Toggle */}
        <div className="d-md-none" ref={mobileMenuRef}>
          <button
            className="btn btn-outline-primary"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
          >
            <i className="bi bi-list fs-4"></i>
          </button>

          {isMobileMenuOpen && (
            <div
              className="dropdown-menu dropdown-menu-end show p-2 shadow-lg"
              style={{
                position: 'absolute',
                top: '100%',
                right: '10px',
                zIndex: 1050,
                minWidth: '220px',
              }}
            >
              <button
                className={`dropdown-item rounded mb-1 ${view === 'translator' ? 'active bg-primary text-white' : ''}`}
                onClick={() => {
                  setView('translator');
                  setIsMobileMenuOpen(false);
                }}
              >
                <i className="bi bi-translate me-2"></i>Translator
              </button>
              <button
                className={`dropdown-item rounded ${view === 'settings' ? 'active bg-primary text-white' : ''}`}
                onClick={() => {
                  setView('settings');
                  setIsMobileMenuOpen(false);
                }}
              >
                <i className="bi bi-gear-fill me-2"></i>Settings
              </button>

              {view === 'translator' && (
                <>
                  <hr className="dropdown-divider my-2" />
                  <div className="px-2 pb-1 small text-muted fw-bold">API Mode</div>
                  <div className="d-flex flex-column gap-1">
                    <input
                      type="radio"
                      className="btn-check"
                      name="apiModeMobile"
                      id="libreModeMobile"
                      checked={apiMode === 'libre'}
                      onChange={() => {
                        setApiMode('libre');
                        setIsMobileMenuOpen(false);
                      }}
                    />
                    <label
                      className={`btn btn-sm w-100 text-start ${apiMode === 'libre' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                      htmlFor="libreModeMobile"
                    >
                      <i className="bi bi-cloud-check me-2"></i>LibreTranslate
                    </label>

                    <input
                      type="radio"
                      className="btn-check"
                      name="apiModeMobile"
                      id="lmModeMobile"
                      checked={apiMode === 'openaic'}
                      onChange={() => {
                        setApiMode('openaic');
                        setIsMobileMenuOpen(false);
                      }}
                    />
                    <label
                      className={`btn btn-sm w-100 text-start ${apiMode === 'openaic' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                      htmlFor="lmModeMobile"
                    >
                      <i className="bi bi-robot me-2"></i>OpenAi Compatible
                    </label>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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
