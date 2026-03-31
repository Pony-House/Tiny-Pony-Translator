import { DEFAULT_LM_INSTRUCTION, DEFAULT_LM_AUTO_INSTRUCTION } from '../../utils/defaultValues';

/**
 * @param {Object} options
 * @param {string} options.lmInstruction
 * @param {(ops: string) => void} options.setLmInstruction
 * @param {string} options.lmAutoInstruction
 * @param {(ops: string) => void} options.setLmAutoInstruction
 * @param {string} options.lmHeader
 * @param {(ops: string) => void} options.setLmHeader
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
      <div className="card-body bg-white rounded">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label fw-bold small text-uppercase">System Prompt</label>
            <textarea
              className="form-control form-control-sm mb-2"
              rows="3"
              value={lmInstruction}
              onChange={(e) => setLmInstruction(e.target.value)}
            />
            <button
              className="btn btn-link btn-sm p-0 text-decoration-none"
              onClick={() => setLmInstruction(DEFAULT_LM_INSTRUCTION)}
            >
              ↺ Reset Standard
            </button>
          </div>
          <div className="col-md-4">
            <label className="form-label fw-bold small text-uppercase">Auto-Detect Prompt</label>
            <textarea
              className="form-control form-control-sm mb-2"
              rows="3"
              value={lmAutoInstruction}
              onChange={(e) => setLmAutoInstruction(e.target.value)}
            />
            <button
              className="btn btn-link btn-sm p-0 text-decoration-none"
              onClick={() => setLmAutoInstruction(DEFAULT_LM_AUTO_INSTRUCTION)}
            >
              ↺ Reset Auto
            </button>
          </div>
          <div className="col-md-4">
            <label className="form-label fw-bold small text-uppercase">
              Custom Headers / Instructions
            </label>
            <textarea
              className="form-control form-control-sm"
              rows="3"
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
