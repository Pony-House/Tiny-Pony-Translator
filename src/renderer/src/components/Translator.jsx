import { useState, useEffect, useRef } from 'react';
import Prompts from '../components/ai/Prompts';
import JsonManager from './JsonManager';
import {
  DEFAULT_LM_INSTRUCTION,
  DEFAULT_LM_AUTO_INSTRUCTION,
  DEFAULT_LM_INSTRUCTION_WITH_CHARACTER,
  DEFAULT_LM_AUTO_INSTRUCTION_WITH_CHARACTER,
  DEFAULT_LM_INSTRUCTION_ORTH,
  DEFAULT_LM_AUTO_INSTRUCTION_ORTH,
} from '../utils/defaultValues';

/**
 * @typedef {Object} QueueItem
 * @property {string} id
 * @property {string} name
 * @property {string} status
 */

/**
 * @param {Object} options
 * @param {string} options.apiMode
 * @param {import('./Settings').SettingsParams} options.config
 * @returns {JSX.Element}
 */
export default function Translator({ apiMode, config }) {
  /**
   * @returns {string}
   */
  const getDefaultTargetLang = () => {
    /** @type {string | null} */
    const saved = localStorage.getItem(`${apiMode}_targetLang`);
    if (saved) return saved;

    if (navigator && navigator.language) {
      return navigator.language.split('-')[0];
    }
    return 'en';
  };

  const [inputMode, setInputMode] = useState('text'); // 'text', 'file', 'json'

  /** @type {[QueueItem[], import('react').Dispatch<import('react').SetStateAction<QueueItem[]>>]} */
  const [fileQueue, setFileQueue] = useState([]);

  // Translation State
  const [sourceText, setSourceText] = useState(
    () => sessionStorage.getItem(`${apiMode}_sourceText`) || '',
  );
  const [translatedText, setTranslatedText] = useState(
    () => sessionStorage.getItem(`${apiMode}_translatedText`) || '',
  );
  const [sourceLang, setSourceLang] = useState(
    () => localStorage.getItem(`${apiMode}_sourceLang`) || 'auto',
  );
  const [targetLang, setTargetLang] = useState(getDefaultTargetLang);
  const [libreLanguages, setLibreLanguages] = useState([]);

  // Alternatives State
  const [translationOptions, setTranslationOptions] = useState(() => {
    /** @type {string | null} */
    const saved = sessionStorage.getItem(`${apiMode}_translationOptions`);
    return saved ? JSON.parse(saved) : [];
  });
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(() => {
    /** @type {string | null} */
    const saved = sessionStorage.getItem(`${apiMode}_selectedOptionIndex`);
    return saved ? parseInt(saved, 10) : 0;
  });

  // Mode and Cached Prompts Management
  const [promptMode, setPromptModeState] = useState(
    () => localStorage.getItem('promptMode') || 'standard',
  );

  /**
   * @param {string} mode
   * @returns {string}
   */
  const getDefaultInst = (mode) => {
    if (mode === 'character') return DEFAULT_LM_INSTRUCTION_WITH_CHARACTER;
    if (mode === 'orthographic') return DEFAULT_LM_INSTRUCTION_ORTH;
    return DEFAULT_LM_INSTRUCTION;
  };

  /**
   * @param {string} mode
   * @returns {string}
   */
  const getDefaultAutoInst = (mode) => {
    if (mode === 'character') return DEFAULT_LM_AUTO_INSTRUCTION_WITH_CHARACTER;
    if (mode === 'orthographic') return DEFAULT_LM_AUTO_INSTRUCTION_ORTH;
    return DEFAULT_LM_AUTO_INSTRUCTION;
  };

  // OpenAi Compatible Specifics
  const [lmInstruction, setLmInstruction] = useState(
    () => localStorage.getItem(`lmInstruction_${promptMode}`) || getDefaultInst(promptMode),
  );
  const [lmAutoInstruction, setLmAutoInstruction] = useState(
    () => localStorage.getItem(`lmAutoInstruction_${promptMode}`) || getDefaultAutoInst(promptMode),
  );
  const [lmHeader, setLmHeader] = useState(
    () => localStorage.getItem(`lmHeader_${promptMode}`) || '',
  );

  /**
   * Handles switching modes and seamlessly caching the values
   * @param {string} newMode
   */
  const handleSetPromptMode = (newMode) => {
    // Save current values to local storage before switching
    localStorage.setItem(`lmInstruction_${promptMode}`, lmInstruction);
    localStorage.setItem(`lmAutoInstruction_${promptMode}`, lmAutoInstruction);
    localStorage.setItem(`lmHeader_${promptMode}`, lmHeader);
    localStorage.setItem('promptMode', newMode);

    // Update state to the new mode and load its cached values
    setPromptModeState(newMode);
    setLmInstruction(localStorage.getItem(`lmInstruction_${newMode}`) || getDefaultInst(newMode));
    setLmAutoInstruction(
      localStorage.getItem(`lmAutoInstruction_${newMode}`) || getDefaultAutoInst(newMode),
    );
    setLmHeader(localStorage.getItem(`lmHeader_${newMode}`) || '');
  };

  const [isTranslating, setIsTranslating] = useState(false);

  // State for AI Prompts Modal
  const [showPromptsModal, setShowPromptsModal] = useState(false);

  const typingTimeoutRef = useRef(null);

  const isOrthographic = apiMode === 'openaic' && promptMode === 'orthographic';

  // Session storage sync
  useEffect(() => {
    sessionStorage.setItem(`${apiMode}_sourceText`, sourceText);
  }, [sourceText, apiMode]);

  useEffect(() => {
    sessionStorage.setItem(`${apiMode}_translatedText`, translatedText);
  }, [translatedText, apiMode]);

  useEffect(() => {
    sessionStorage.setItem(`${apiMode}_translationOptions`, JSON.stringify(translationOptions));
    sessionStorage.setItem(`${apiMode}_selectedOptionIndex`, selectedOptionIndex.toString());
  }, [translationOptions, selectedOptionIndex, apiMode]);

  // Local storage config sync
  useEffect(() => {
    localStorage.setItem(`${apiMode}_sourceLang`, sourceLang);
    localStorage.setItem(`${apiMode}_targetLang`, targetLang);
  }, [sourceLang, targetLang, apiMode]);

  // Sync prompts to active mode cache whenever they change
  useEffect(() => {
    localStorage.setItem(`lmInstruction_${promptMode}`, lmInstruction);
    localStorage.setItem(`lmAutoInstruction_${promptMode}`, lmAutoInstruction);
    localStorage.setItem(`lmHeader_${promptMode}`, lmHeader);
  }, [lmInstruction, lmAutoInstruction, lmHeader, promptMode]);

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
      const hasAuto = data.some((l) => l.code === 'auto');
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
   * @returns {void}
   */
  const handleRefreshLanguages = () => {
    if (apiMode === 'libre') fetchLibreLanguages();
  };

  /**
   * @param {string} textToTranslate
   * @param {AbortSignal} signal
   * @returns {Promise<{text: string, alts: string[]}|null>}
   */
  const executeSilentTranslation = async (textToTranslate, signal) => {
    if (!textToTranslate.trim()) return null;
    try {
      if (apiMode === 'libre') {
        const bodyData = {
          q: textToTranslate,
          source: sourceLang,
          target: targetLang,
          format: 'text',
          alternatives: 3,
        };

        if (config.libre.apiKey) bodyData.api_key = config.libre.apiKey;

        const res = await fetch(`${getBaseUrl('libre')}/translate`, {
          method: 'POST',
          body: JSON.stringify(bodyData),
          headers: { 'Content-Type': 'application/json' },
          signal,
        });
        const data = await res.json();
        const mainText = data.translatedText || '';
        const alts = data.alternatives || [];
        return {
          text: mainText,
          alts: mainText ? [mainText, ...alts] : [],
        };
      } else {
        let systemPrompt = '';

        if (isOrthographic) {
          systemPrompt =
            sourceLang === 'auto'
              ? `${lmAutoInstruction}\n\n${lmHeader}`.trim()
              : `${lmInstruction}\n\n${lmHeader}\n\nLanguage: ${sourceLang}.`.trim();
        } else {
          systemPrompt =
            sourceLang === 'auto'
              ? `${lmAutoInstruction}\n\n${lmHeader}\n\nTarget Language: ${targetLang}.`.trim()
              : `${lmInstruction}\n\n${lmHeader}\n\nTranslate from ${sourceLang} to ${targetLang}.`.trim();
        }

        const headers = { 'Content-Type': 'application/json' };
        if (config.openaic.apiKey) {
          headers['Authorization'] = `Bearer ${config.openaic.apiKey}`;
        }

        const res = await fetch(`${getBaseUrl('openaic')}/v1/chat/completions`, {
          method: 'POST',
          body: JSON.stringify({
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: textToTranslate },
            ],
            temperature: 0.3,
            max_tokens: 1000,
          }),
          headers: headers,
          signal,
        });
        const data = await res.json();
        return {
          text: data.choices[0]?.message?.content || '',
          alts: [],
        };
      }
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      console.error(err);
      return null;
    }
  };

  /**
   * @param {string} text
   * @returns {Promise<void>}
   */
  const executeTranslation = async (text) => {
    if (!text.trim()) {
      setTranslatedText('');
      setTranslationOptions([]);
      return;
    }

    setIsTranslating(true);

    try {
      const result = await executeSilentTranslation(text, null);
      setTranslatedText(result?.text || '');
      setTranslationOptions(result?.alts || []);
      setSelectedOptionIndex(0);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error('Translation error:', err);
      setTranslatedText('Error: Connection failed. Check your server settings.');
      setTranslationOptions([]);
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

    if (value.trim() === '') {
      setTranslationOptions([]);
      setTranslatedText('');
    }

    if (apiMode === 'libre' && libreLanguages.length > 0) {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(
        () => executeTranslation(value),
        config.typingDelay || 1000,
      );
    }
  };

  /**
   * @param {import('react').ChangeEvent<HTMLInputElement>} e
   * @returns {Promise<void>}
   */
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    /** @type {string} */
    const id = Date.now().toString() + Math.random().toString(36).substring(7);
    setFileQueue((prev) => [...prev, { id, name: file.name, status: 'Processing...' }]);

    // Reset input
    e.target.value = '';

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('source', sourceLang);
      formData.append('target', targetLang);

      if (config.libre.apiKey) formData.append('api_key', config.libre.apiKey);

      const translateRes = await fetch(`${getBaseUrl('libre')}/translate_file`, {
        method: 'POST',
        body: formData,
      });

      if (!translateRes.ok) throw new Error('Failed to translate file');

      /** @type {{translatedFileUrl: string}} */
      const data = await translateRes.json();

      if (!data.translatedFileUrl) throw new Error('No translation URL returned from API');

      /** @type {string} */
      const downloadUrl =
        data.translatedFileUrl.startsWith('http://') ||
        data.translatedFileUrl.startsWith('https://')
          ? data.translatedFileUrl
          : `${getBaseUrl('libre')}${data.translatedFileUrl}`;

      const fileRes = await fetch(downloadUrl);
      if (!fileRes.ok) throw new Error('Failed to fetch the translated blob data');
      const blob = await fileRes.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = blobUrl;
      a.download = `translated_${targetLang}_${file.name}`;

      document.body.appendChild(a);
      a.click();

      window.URL.revokeObjectURL(blobUrl);
      a.remove();

      setFileQueue((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'Done' } : item)),
      );

      setTimeout(() => {
        setFileQueue((prev) => prev.filter((item) => item.id !== id));
      }, 5000);
    } catch (err) {
      console.error(err);
      setFileQueue((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'Error' } : item)),
      );
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
    setTranslationOptions([]);
    setSelectedOptionIndex(0);
  };

  /**
   * @param {number} index
   * @returns {void}
   */
  const handleSelectAlternative = (index) => {
    setSelectedOptionIndex(index);
    setTranslatedText(translationOptions[index]);
  };

  /**
   * @returns {void}
   */
  const handleCopyText = () => {
    if (translatedText) {
      navigator.clipboard.writeText(translatedText);
    }
  };

  /**
   * @returns {void}
   */
  const handleClear = () => {
    setSourceText('');
    setTranslatedText('');
    setTranslationOptions([]);
    setSelectedOptionIndex(0);
  };

  /** @type {boolean} */
  const isLibreEmpty = apiMode === 'libre' && libreLanguages.length === 0;
  /** @type {Array} */
  const currentLanguages = apiMode === 'libre' ? libreLanguages : config.lmLanguages;
  /** @type {Array} */
  const targetLanguagesList = currentLanguages.filter((l) => l.code !== 'auto');

  return (
    <>
      <div className="mb-3 position-relative d-flex justify-content-center align-items-center">
        <div className="btn-group bg-body shadow-sm rounded">
          <button
            className={`btn btn-sm px-4 fw-bold ${inputMode === 'text' ? 'btn-primary' : 'btn-outline-primary border-0'}`}
            onClick={() => setInputMode('text')}
          >
            Translate Text
          </button>
          {apiMode === 'libre' && (
            <button
              className={`btn btn-sm px-4 fw-bold ${inputMode === 'file' ? 'btn-primary' : 'btn-outline-primary border-0'}`}
              onClick={() => setInputMode('file')}
            >
              Translate File
            </button>
          )}
          <button
            className={`btn btn-sm px-4 fw-bold ${inputMode === 'json' ? 'btn-primary' : 'btn-outline-primary border-0'}`}
            onClick={() => setInputMode('json')}
          >
            Translate JSON (BETA)
          </button>
        </div>

        {/* Prompt modal open button available only in OpenAiC */}
        {apiMode === 'openaic' && (
          <button
            className="btn btn-sm btn-outline-primary fw-bold position-absolute end-0 shadow-sm"
            onClick={() => setShowPromptsModal(true)}
            title="Edit AI Prompts"
          >
            <i className="bi bi-robot me-1"></i> AI Prompts
          </button>
        )}
      </div>

      <div className="row g-3 position-relative flex-grow-1 h-100" style={{ minHeight: 0 }}>
        {/* If JSON mode, render full width column, otherwise 50% split */}
        {inputMode === 'json' ? (
          <div className="col-12 d-flex flex-column h-100">
            <div className="card shadow-sm border-0 flex-grow-1 bg-body">
              <div className="card-header bg-body border-0 pt-3 d-flex align-items-center gap-3 flex-wrap">
                <select
                  className="form-select border-0 fw-bold text-primary w-auto bg-body text-body"
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

                <span className="text-muted fw-bold">
                  {isOrthographic ? (
                    <i className="bi bi-arrow-right"></i>
                  ) : (
                    <i className="bi bi-arrow-left-right"></i>
                  )}
                </span>

                {!isOrthographic ? (
                  <select
                    className="form-select border-0 fw-bold text-primary w-auto bg-body text-body"
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
                ) : (
                  <span className="badge bg-warning-subtle border border-warning-subtle text-warning-emphasis rounded-pill shadow-sm py-2 px-3">
                    <i className="bi bi-spellcheck me-1"></i>Spell Checker Mode
                  </span>
                )}

                <button
                  className="btn btn-sm btn-outline-secondary ms-auto"
                  onClick={handleRefreshLanguages}
                  title="Refresh Languages"
                >
                  <i className="bi bi-arrow-clockwise"></i>
                </button>
              </div>
              <div className="card-body d-flex flex-column p-0 border-top">
                <JsonManager executeSilentTranslation={executeSilentTranslation} />
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="col-md-6 d-flex flex-column">
              <div className="card shadow-sm border-0 flex-grow-1 bg-body">
                <div className="card-header bg-body border-0 pt-3 d-flex align-items-center justify-content-between">
                  <select
                    className="form-select border-0 fw-bold text-primary w-100 bg-body text-body"
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
                  <button
                    className="btn btn-sm btn-outline-secondary ms-2"
                    onClick={handleRefreshLanguages}
                    title="Refresh Languages"
                  >
                    <i className="bi bi-arrow-clockwise"></i>
                  </button>
                </div>
                <div className="card-body d-flex flex-column position-relative">
                  {inputMode === 'text' ? (
                    <>
                      <textarea
                        className="form-control border-0 fs-4 flex-grow-1 bg-body text-body pb-4"
                        style={{ resize: 'none', boxShadow: 'none' }}
                        placeholder={
                          isOrthographic ? 'Type text to check spelling...' : 'Type to translate...'
                        }
                        disabled={isLibreEmpty}
                        value={sourceText}
                        onChange={(e) => handleSourceChange(e.target.value)}
                      />
                      {sourceText && (
                        <button
                          className="btn btn-sm btn-outline-danger position-absolute bottom-0 end-0 m-3"
                          onClick={handleClear}
                          title="Clear text"
                        >
                          <i className="bi bi-trash me-1"></i>Clear
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center">
                      <h5 className="text-secondary mb-3">Upload a document to translate</h5>
                      <input
                        type="file"
                        className="form-control w-75 mb-2 bg-body text-body"
                        accept=".txt,.odt,.odp,.docx,.pptx,.epub,.html,.srt,.pdf"
                        onChange={handleFileUpload}
                        disabled={isLibreEmpty}
                      />
                      <small className="text-muted">
                        Supports: .txt, .odt, .odp, .docx, .pptx, .epub, .html, .srt, .pdf
                      </small>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {inputMode === 'text' && !isOrthographic && (
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
                  <i className="bi bi-arrow-left-right"></i>
                </button>
              </div>
            )}

            <div className="col-md-6 d-flex flex-column">
              <div className="card shadow-sm border-0 flex-grow-1 bg-body">
                <div className="card-header bg-body border-0 pt-3 d-flex justify-content-between align-items-center">
                  {!isOrthographic ? (
                    <select
                      className="form-select border-0 fw-bold text-primary w-100 bg-body text-body"
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
                  ) : (
                    <span className="fw-bold text-warning fs-5 w-100 d-flex align-items-center">
                      <i className="bi bi-spellcheck me-2"></i>Corrected Text
                    </span>
                  )}

                  {apiMode === 'openaic' && inputMode === 'text' && (
                    <button
                      className={`btn ${isOrthographic ? 'btn-warning text-dark' : 'btn-primary'} fw-bold px-4 ms-2 text-nowrap`}
                      disabled={isTranslating || isLibreEmpty}
                      onClick={() => executeTranslation(sourceText)}
                    >
                      {isTranslating ? '...' : isOrthographic ? 'Check Spelling' : 'Translate'}
                    </button>
                  )}
                </div>
                <div className="card-body d-flex flex-column position-relative">
                  {inputMode === 'text' ? (
                    <>
                      <textarea
                        className={`form-control border-0 fs-4 bg-body text-body flex-grow-1 pb-4 ${isOrthographic && translatedText ? 'text-warning-emphasis' : ''}`}
                        style={{ resize: 'none', boxShadow: 'none' }}
                        readOnly
                        value={translatedText}
                      />
                      {translatedText && (
                        <button
                          className="btn btn-sm btn-outline-secondary position-absolute bottom-0 end-0 m-3"
                          onClick={handleCopyText}
                          title="Copy translated text"
                        >
                          <i className="bi bi-clipboard me-1"></i>Copy
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="d-flex align-items-center justify-content-center h-100">
                      <span className="text-muted fs-5">
                        Your translated file will automatically download here.
                      </span>
                    </div>
                  )}
                </div>

                {apiMode === 'libre' && inputMode === 'text' && translationOptions.length > 1 && (
                  <div className="card-footer bg-body border-top-0 pb-3">
                    <div className="d-flex flex-wrap gap-2 align-items-center">
                      <span className="small text-muted fw-bold text-uppercase">Versions:</span>
                      {translationOptions.map((_, index) => (
                        <button
                          key={index}
                          className={`btn btn-sm ${selectedOptionIndex === index ? 'btn-primary' : 'btn-outline-primary'}`}
                          onClick={() => handleSelectAlternative(index)}
                        >
                          {index === 0 ? 'Original' : index}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div
        className="position-fixed bottom-0 start-0 w-100 p-3 bg-body-tertiary border-top shadow-lg"
        style={{
          zIndex: 1050,
          transform: fileQueue.length > 0 ? 'translateY(0)' : 'translateY(100%)',
          opacity: fileQueue.length > 0 ? 1 : 0,
          visibility: fileQueue.length > 0 ? 'visible' : 'hidden',
          transition: 'all 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        <h6 className="mb-3 text-body border-bottom pb-2">File Translation Queue</h6>
        <div className="d-flex flex-column gap-2" style={{ maxHeight: '150px', overflowY: 'auto' }}>
          {fileQueue.map((item) => (
            <div
              key={item.id}
              className="d-flex justify-content-between align-items-center bg-body border p-2 rounded"
            >
              <span className="text-truncate fw-bold text-body" style={{ maxWidth: '70%' }}>
                {item.name}
              </span>
              <span
                className={`badge ${item.status === 'Processing...' ? 'bg-warning text-dark' : item.status === 'Done' ? 'bg-success' : 'bg-danger'}`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Prompts Modal */}
      {showPromptsModal && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1060 }}
        >
          <div className="modal-dialog modal-dialog-centered modal-xl">
            <div className="modal-content bg-body text-body shadow-lg border-0">
              <div className="modal-header bg-body-tertiary">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-robot me-2"></i>AI Prompts Settings
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowPromptsModal(false)}
                ></button>
              </div>
              <div className="modal-body p-0">
                <Prompts
                  lmHeader={lmHeader}
                  setLmHeader={setLmHeader}
                  lmInstruction={lmInstruction}
                  setLmInstruction={setLmInstruction}
                  lmAutoInstruction={lmAutoInstruction}
                  setLmAutoInstruction={setLmAutoInstruction}
                  promptMode={promptMode}
                  setPromptMode={handleSetPromptMode}
                />
              </div>
              <div className="modal-footer border-0">
                <button
                  type="button"
                  className="btn btn-primary fw-bold px-4"
                  onClick={() => setShowPromptsModal(false)}
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
