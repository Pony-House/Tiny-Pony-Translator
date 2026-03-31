import { useState, useEffect, useRef } from 'react';
import Prompts from '../components/ai/Prompts';
import { DEFAULT_LM_INSTRUCTION, LM_HARDCODED_LANGUAGES } from '../utils/defaultValues';

/**
 * @param {Object} options
 * @param {string} options.apiMode
 * @param {import('./Settings').SettingsParams} options.config
 */
export default function Translator({ apiMode, config }) {
  // Translation State
  const [sourceText, setSourceText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [sourceLang, setSourceLang] = useState('en');
  const [targetLang, setTargetLang] = useState('pt');
  const [libreLanguages, setLibreLanguages] = useState([]);

  // LM Studio Specifics
  const [lmInstruction, setLmInstruction] = useState(DEFAULT_LM_INSTRUCTION);
  const [lmHeader, setLmHeader] = useState('');
  const [isTranslating, setIsTranslating] = useState(false);

  const typingTimeoutRef = useRef(null);

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
      // Assuming local LibreTranslate server on port 5000
      const res = await fetch(`${getBaseUrl('libre')}/languages`);
      if (!res.ok) throw new Error();
      const data = await res.json();
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
        // LM Studio API local endpoint (port 1234 is standard)
        const systemPrompt = `${lmInstruction}\n\n${lmHeader}\n\nTranslate from ${sourceLang} to ${targetLang}.`;

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

  /** @type {boolean} */
  const isLibreEmpty = apiMode === 'libre' && libreLanguages.length === 0;
  /** @type {Array} */
  const currentLanguages = apiMode === 'libre' ? libreLanguages : LM_HARDCODED_LANGUAGES;

  return (
    <>
      {apiMode === 'lmstudio' && (
        <Prompts
          lmHeader={lmHeader}
          setLmHeader={setLmHeader}
          lmInstruction={lmInstruction}
          setLmInstruction={setLmInstruction}
        />
      )}

      <div className="row g-3">
        <div className="col-md-6">
          <div className="card shadow-sm border-0 h-100">
            <div className="card-header bg-white border-0 pt-3">
              <select
                className="form-select border-0 fw-bold text-primary"
                disabled={isLibreEmpty}
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
              >
                {isLibreEmpty ? (
                  <option>Language list empty (Check Settings)</option>
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

        <div className="col-md-6">
          <div className="card shadow-sm border-0 h-100 bg-white">
            <div className="card-header bg-white border-0 pt-3 d-flex justify-content-between">
              <select
                className="form-select border-0 fw-bold text-primary"
                disabled={isLibreEmpty}
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
              >
                {isLibreEmpty ? (
                  <option>Empty</option>
                ) : (
                  currentLanguages.map((l) => (
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
