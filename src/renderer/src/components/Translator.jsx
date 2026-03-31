import { useState, useEffect, useRef } from 'react';
import Prompts from '../components/ai/Prompts';
import {
  DEFAULT_LM_INSTRUCTION,
  DEFAULT_LM_AUTO_INSTRUCTION,
  LM_HARDCODED_LANGUAGES,
} from '../utils/defaultValues';

/**
 * @param {Object} options
 * @param {string} options.apiMode
 * @param {import('./Settings').SettingsParams} options.config
 */
export default function Translator({ apiMode, config }) {
  /**
   * @returns {string}
   */
  const getDefaultTargetLang = () => {
    /** @type {string | null} */
    const saved = localStorage.getItem('targetLang');
    if (saved) return saved;

    if (navigator && navigator.language) {
      return navigator.language.split('-')[0];
    }
    return 'en';
  };

  // Translation State
  const [sourceText, setSourceText] = useState(() => sessionStorage.getItem('sourceText') || '');
  const [translatedText, setTranslatedText] = useState(
    () => sessionStorage.getItem('translatedText') || '',
  );
  const [sourceLang, setSourceLang] = useState(() => localStorage.getItem('sourceLang') || 'auto');
  const [targetLang, setTargetLang] = useState(getDefaultTargetLang);
  const [libreLanguages, setLibreLanguages] = useState([]);

  // LM Studio Specifics
  const [lmInstruction, setLmInstruction] = useState(
    () => localStorage.getItem('lmInstruction') || DEFAULT_LM_INSTRUCTION,
  );
  const [lmAutoInstruction, setLmAutoInstruction] = useState(
    () => localStorage.getItem('lmAutoInstruction') || DEFAULT_LM_AUTO_INSTRUCTION,
  );
  const [lmHeader, setLmHeader] = useState(() => localStorage.getItem('lmHeader') || '');

  const [isTranslating, setIsTranslating] = useState(false);

  const typingTimeoutRef = useRef(null);

  useEffect(() => {
    sessionStorage.setItem('sourceText', sourceText);
  }, [sourceText]);

  useEffect(() => {
    sessionStorage.setItem('translatedText', translatedText);
  }, [translatedText]);

  useEffect(() => {
    localStorage.setItem('sourceLang', sourceLang);
    localStorage.setItem('targetLang', targetLang);
  }, [sourceLang, targetLang]);

  useEffect(() => {
    localStorage.setItem('lmInstruction', lmInstruction);
    localStorage.setItem('lmAutoInstruction', lmAutoInstruction);
    localStorage.setItem('lmHeader', lmHeader);
  }, [lmInstruction, lmAutoInstruction, lmHeader]);

  /**
   * @type {function}
   * @returns {string}
   */
  const getBaseUrl = (/** @type {string} */ mode) => {
    /** @type {object} */
    const settings = config[mode];
    return `${settings.protocol}://${settings.ip}`;
  };

  /**
   * @returns {Promise<void>}
   */
  const fetchLibreLanguages = async () => {
    try {
      // Assuming local LibreTranslate
      const res = await fetch(`${getBaseUrl('libre')}/languages`);
      if (!res.ok) throw new Error();
      const data = await res.json();

      /** @type {boolean} */
      const hasAuto = data.some((/** @type {{code: string}} */ l) => l.code === 'auto');
      if (!hasAuto) data.unshift({ code: 'auto', name: 'Auto Detect' });

      setLibreLanguages(data);
    } catch {
      setLibreLanguages([]);
    }
  };

  useEffect(() => {
    if (apiMode === 'libre') fetchLibreLanguages();
  }, [apiMode, config.libre]);

  /**
   * @param {string} text
   * @returns {Promise<void>}
   */
  const executeTranslation = async (text) => {
    if (!text.trim()) {
      setTranslatedText('');
      return;
    }

    setIsTranslating(true);

    try {
      if (apiMode === 'libre') {
        const res = await fetch(`${getBaseUrl('libre')}/translate`, {
          method: 'POST',
          body: JSON.stringify({
            q: text,
            source: sourceLang,
            target: targetLang,
            format: 'text',
          }),
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        setTranslatedText(data.translatedText || '');
      } else {
        // LM Studio API local endpoint
        /** @type {string} */
        const systemPrompt =
          sourceLang === 'auto'
            ? `${lmAutoInstruction}\n\n${lmHeader}\n\nTarget Language: ${targetLang}.`
            : `${lmInstruction}\n\n${lmHeader}\n\nTranslate from ${sourceLang} to ${targetLang}.`;

        const res = await fetch(`${getBaseUrl('lmstudio')}/api/v1/chat`, {
          method: 'POST',
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
            ],
            temperature: 0.3,
            max_tokens: 1000,
          }),
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        setTranslatedText(data.choices[0]?.message?.content || '');
      }
    } catch (err) {
      console.error('Translation error:', err);
      setTranslatedText('Error: Connection failed. Check your server settings.');
    } finally {
      setIsTranslating(false);
    }
  };

  /**
   * @param {string} value
   * @returns {void}
   */
  const handleSourceChange = (value) => {
    setSourceText(value);
    if (apiMode === 'libre' && libreLanguages.length > 0) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => executeTranslation(value), 1000);
    }
  };

  /**
   * @returns {void}
   */
  const handleSwap = () => {
    if (sourceLang === 'auto') return;

    setSourceLang(targetLang);
    setTargetLang(sourceLang);
    setSourceText(translatedText);
    setTranslatedText(sourceText);
    // Auto-translation call removed to prevent glitches
  };

  /** @type {boolean} */
  const isLibreEmpty = apiMode === 'libre' && libreLanguages.length === 0;
  /** @type {Array} */
  const currentLanguages = apiMode === 'libre' ? libreLanguages : LM_HARDCODED_LANGUAGES;
  /** @type {Array} */
  const targetLanguagesList = currentLanguages.filter((l) => l.code !== 'auto');

  return (
    <>
      {apiMode === 'lmstudio' && (
        <Prompts
          lmHeader={lmHeader}
          setLmHeader={setLmHeader}
          lmInstruction={lmInstruction}
          setLmInstruction={setLmInstruction}
          lmAutoInstruction={lmAutoInstruction}
          setLmAutoInstruction={setLmAutoInstruction}
        />
      )}

      <div className="row g-3 position-relative">
        <div className="col-md-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-0 pt-3">
              <select
                className="form-select border-0 fw-bold text-primary w-75"
                disabled={isLibreEmpty}
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
              >
                {isLibreEmpty ? (
                  <option>Language list empty</option>
                ) : (
                  currentLanguages.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="card-body">
              <textarea
                className="form-control border-0 fs-4"
                rows="10"
                style={{ resize: 'none', boxShadow: 'none' }}
                placeholder="Type to translate..."
                disabled={isLibreEmpty}
                value={sourceText}
                onChange={(e) => handleSourceChange(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Swap Button container positioned absolutely in the middle */}
        <div
          className="position-absolute top-50 start-50 translate-middle"
          style={{ width: 'auto', zIndex: 10 }}
        >
          <button
            className="btn btn-primary rounded-circle shadow d-flex align-items-center justify-content-center"
            style={{ width: '45px', height: '45px' }}
            onClick={handleSwap}
            disabled={sourceLang === 'auto' || isLibreEmpty}
            title={
              sourceLang === 'auto'
                ? "Cannot swap when 'Auto Detect' is selected"
                : 'Swap languages'
            }
          >
            ⇄
          </button>
        </div>

        <div className="col-md-6">
          <div className="card shadow-sm border-0 h-100 bg-white">
            <div className="card-header bg-white border-0 pt-3 d-flex justify-content-between">
              <select
                className="form-select border-0 fw-bold text-primary w-50"
                disabled={isLibreEmpty}
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
              >
                {isLibreEmpty ? (
                  <option>Empty</option>
                ) : (
                  targetLanguagesList.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))
                )}
              </select>
              {apiMode === 'lmstudio' && (
                <button
                  className="btn btn-primary fw-bold px-4"
                  disabled={isTranslating || isLibreEmpty}
                  onClick={() => executeTranslation(sourceText)}
                >
                  {isTranslating ? '...' : 'Translate'}
                </button>
              )}
            </div>
            <div className="card-body">
              <textarea
                className="form-control border-0 fs-4 bg-white"
                rows="10"
                style={{ resize: 'none', boxShadow: 'none' }}
                readOnly
                value={translatedText}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
