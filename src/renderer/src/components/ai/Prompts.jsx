import { useEffect, useRef } from 'react';
import {
  DEFAULT_LM_INSTRUCTION,
  DEFAULT_LM_AUTO_INSTRUCTION,
  DEFAULT_LM_INSTRUCTION_WITH_CHARACTER,
  DEFAULT_LM_AUTO_INSTRUCTION_WITH_CHARACTER,
  DEFAULT_LM_INSTRUCTION_ORTH,
  DEFAULT_LM_AUTO_INSTRUCTION_ORTH,
} from '../../utils/defaultValues';

/**
 * @param {Object} props
 * @param {string} props.value
 * @param {(e: import('react').ChangeEvent<HTMLTextAreaElement>) => void} props.onChange
 * @param {string} [props.placeholder]
 * @returns {JSX.Element}
 */
const AutoResizeTextarea = ({ value, onChange, placeholder }) => {
  const textareaRef = useRef(null);

  useEffect(() => {
    if (!textareaRef.current) return;
    textareaRef.current.style.height = 'auto';
    textareaRef.current.style.height = `${Math.max(textareaRef.current.scrollHeight, 150)}px`;
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      className="form-control form-control-sm mb-2 bg-body text-body"
      style={{ resize: 'vertical', overflowX: 'hidden', minHeight: '150px' }}
      placeholder={placeholder}
      value={value}
      onChange={onChange}
    />
  );
};

/**
 * @param {Object} options
 * @param {string} options.lmInstruction
 * @param {(ops: string) => void} options.setLmInstruction
 * @param {string} options.lmAutoInstruction
 * @param {(ops: string) => void} options.setLmAutoInstruction
 * @param {string} options.lmHeader
 * @param {(ops: string) => void} options.setLmHeader
 * @param {string} options.promptMode
 * @param {(mode: string) => void} options.setPromptMode
 * @returns {JSX.Element}
 */
export default function Prompts({
  lmInstruction,
  setLmInstruction,
  lmAutoInstruction,
  setLmAutoInstruction,
  lmHeader,
  setLmHeader,
  promptMode,
  setPromptMode,
}) {
  /**
   * @param {import('react').ChangeEvent<HTMLSelectElement>} e
   * @returns {void}
   */
  const handleModeChange = (e) => {
    const mode = e.target.value;
    setPromptMode(mode);

    if (mode === 'standard') {
      setLmInstruction(DEFAULT_LM_INSTRUCTION);
      setLmAutoInstruction(DEFAULT_LM_AUTO_INSTRUCTION);
    } else if (mode === 'character') {
      setLmInstruction(DEFAULT_LM_INSTRUCTION_WITH_CHARACTER);
      setLmAutoInstruction(DEFAULT_LM_AUTO_INSTRUCTION_WITH_CHARACTER);
    } else if (mode === 'orthographic') {
      setLmInstruction(DEFAULT_LM_INSTRUCTION_ORTH);
      setLmAutoInstruction(DEFAULT_LM_AUTO_INSTRUCTION_ORTH);
    }
  };

  /**
   * @returns {void}
   */
  const handleResetStandard = () => {
    if (promptMode === 'standard') setLmInstruction(DEFAULT_LM_INSTRUCTION);
    else if (promptMode === 'character') setLmInstruction(DEFAULT_LM_INSTRUCTION_WITH_CHARACTER);
    else if (promptMode === 'orthographic') setLmInstruction(DEFAULT_LM_INSTRUCTION_ORTH);
  };

  /**
   * @returns {void}
   */
  const handleResetAuto = () => {
    if (promptMode === 'standard') setLmAutoInstruction(DEFAULT_LM_AUTO_INSTRUCTION);
    else if (promptMode === 'character')
      setLmAutoInstruction(DEFAULT_LM_AUTO_INSTRUCTION_WITH_CHARACTER);
    else if (promptMode === 'orthographic') setLmAutoInstruction(DEFAULT_LM_AUTO_INSTRUCTION_ORTH);
  };

  return (
    <div className="card mb-4 shadow-sm border-0">
      <div className="card-header bg-body-tertiary d-flex justify-content-between align-items-center py-2">
        <span className="fw-bold small text-uppercase text-secondary">
          <i className="bi bi-robot me-2"></i>Prompt Template Configuration
        </span>
        <select
          className="form-select form-select-sm w-auto fw-bold text-primary shadow-sm"
          value={promptMode}
          onChange={handleModeChange}
        >
          <option value="standard">Standard Translation</option>
          <option value="character">Character & Personality Translator</option>
          <option value="orthographic">Orthographic Corrector</option>
        </select>
      </div>
      <div className="card-body bg-body rounded-bottom">
        <div className="row g-3">
          <div className="col-md-4 d-flex flex-column">
            <label className="form-label fw-bold small text-uppercase">System Prompt</label>
            <AutoResizeTextarea
              value={lmInstruction}
              onChange={(e) => setLmInstruction(e.target.value)}
            />
            <button
              className="btn btn-link btn-sm p-0 text-decoration-none align-self-start mt-auto"
              onClick={handleResetStandard}
            >
              ↺ Reset Template
            </button>
          </div>
          <div className="col-md-4 d-flex flex-column">
            <label className="form-label fw-bold small text-uppercase">Auto-Detect Prompt</label>
            <AutoResizeTextarea
              value={lmAutoInstruction}
              onChange={(e) => setLmAutoInstruction(e.target.value)}
            />
            <button
              className="btn btn-link btn-sm p-0 text-decoration-none align-self-start mt-auto"
              onClick={handleResetAuto}
            >
              ↺ Reset Auto
            </button>
          </div>
          <div className="col-md-4 d-flex flex-column">
            <label className="form-label fw-bold small text-uppercase">
              Custom Headers / Instructions
            </label>
            <AutoResizeTextarea
              placeholder="E.g. use technical terminology..."
              value={lmHeader}
              onChange={(e) => setLmHeader(e.target.value)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
