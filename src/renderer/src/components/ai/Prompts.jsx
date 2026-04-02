import { useEffect, useRef } from 'react';
import { DEFAULT_LM_INSTRUCTION, DEFAULT_LM_AUTO_INSTRUCTION } from '../../utils/defaultValues';

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
 * @returns {JSX.Element}
 */
export default function Prompts({
  lmInstruction,
  setLmInstruction,
  lmAutoInstruction,
  setLmAutoInstruction,
  lmHeader,
  setLmHeader,
}) {
  return (
    <div className="card mb-4 shadow-sm border-0">
      <div className="card-body bg-body rounded">
        <div className="row g-3">
          <div className="col-md-4 d-flex flex-column">
            <label className="form-label fw-bold small text-uppercase">System Prompt</label>
            <AutoResizeTextarea
              value={lmInstruction}
              onChange={(e) => setLmInstruction(e.target.value)}
            />
            <button
              className="btn btn-link btn-sm p-0 text-decoration-none align-self-start mt-auto"
              onClick={() => setLmInstruction(DEFAULT_LM_INSTRUCTION)}
            >
              ↺ Reset Standard
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
              onClick={() => setLmAutoInstruction(DEFAULT_LM_AUTO_INSTRUCTION)}
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
