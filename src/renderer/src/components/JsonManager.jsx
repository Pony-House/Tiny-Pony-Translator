import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * @param {Object} obj
 * @param {string} prefix
 * @returns {Array<{path: string, value: any, isString: boolean}>}
 */
const flattenJson = (obj, prefix = '') => {
  let result = [];
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const newKey = prefix ? `${prefix}.${key}` : key;
      if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
        result = result.concat(flattenJson(obj[key], newKey));
      } else if (Array.isArray(obj[key])) {
        obj[key].forEach((item, index) => {
          if (typeof item === 'object' && item !== null) {
            result = result.concat(flattenJson(item, `${newKey}.${index}`));
          } else {
            result.push({
              path: `${newKey}.${index}`,
              value: item,
              isString: typeof item === 'string',
            });
          }
        });
      } else {
        result.push({ path: newKey, value: obj[key], isString: typeof obj[key] === 'string' });
      }
    }
  }
  return result;
};

/**
 * @param {Array<{path: string, value: any}>} flatArray
 * @returns {Object}
 */
const unflattenJson = (flatArray) => {
  const result = {};
  flatArray.forEach(({ path, value }) => {
    const keys = path.split('.');
    let current = result;
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        current[key] = value;
      } else {
        if (!current[key]) current[key] = isNaN(keys[index + 1]) ? {} : [];
        current = current[key];
      }
    });
  });
  return result;
};

const ROW_HEIGHT = 110;

/**
 * @param {Object} options
 * @param {Function} options.executeSilentTranslation
 * @returns {JSX.Element}
 */
export default function JsonManager({ executeSilentTranslation }) {
  const [filePath, setFilePath] = useState(null);

  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [originalFlat, setOriginalFlat] = useState([]);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(500);
  const containerRef = useRef(null);

  const [isBulkTranslating, setIsBulkTranslating] = useState(false);
  const [translatingIndex, setTranslatingIndex] = useState(-1);

  /**
   * @type {Array<{path: string, value: any, original: any, isString: boolean, isEdited: boolean, selected: boolean}>}
   */
  const currentFlatData = history[historyIndex] || [];
  const isDirty = historyIndex > 0;

  /**
   * @param {Array} newData
   * @returns {void}
   */
  const pushHistory = useCallback(
    (newData) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push(newData);
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history, historyIndex],
  );

  const handleOpen = async () => {
    if (window.api && window.api.openJson) {
      const result = await window.api.openJson();
      if (result) {
        try {
          const parsed = JSON.parse(result.content);
          const flat = flattenJson(parsed).map((item) => ({
            ...item,
            original: item.value,
            isEdited: false,
            selected: false,
          }));
          setFilePath(result.filePath);
          setOriginalFlat(flat);
          setHistory([flat]);
          setHistoryIndex(0);
        } catch {
          alert('Invalid JSON file.');
        }
      }
    }
  };

  const handleSave = async () => {
    if (!window.api || !filePath) return;
    try {
      const reconstructed = unflattenJson(currentFlatData);
      const success = await window.api.saveJson(filePath, JSON.stringify(reconstructed, null, 2));
      if (success) {
        const newFlat = currentFlatData.map((item) => ({
          ...item,
          original: item.value,
          isEdited: false,
        }));
        setOriginalFlat(newFlat);
        setHistory([newFlat]);
        setHistoryIndex(0);
      }
    } catch {
      alert('Failed to save JSON.');
    }
  };

  /**
   * @param {number} index
   * @param {any} newValue
   * @returns {void}
   */
  const handleValueChange = (index, newValue) => {
    const newData = [...currentFlatData];
    newData[index] = {
      ...newData[index],
      value: newValue,
      isEdited: newValue !== newData[index].original,
    };
    pushHistory(newData);
  };

  /**
   * @param {number} index
   * @returns {void}
   */
  const toggleSelection = (index) => {
    const newData = [...currentFlatData];
    newData[index] = { ...newData[index], selected: !newData[index].selected };
    pushHistory(newData);
  };

  const selectAll = () => {
    const newData = currentFlatData.map((item) =>
      item.isString ? { ...item, selected: true } : item,
    );
    pushHistory(newData);
  };

  const deselectAll = () => {
    const newData = currentFlatData.map((item) => ({ ...item, selected: false }));
    pushHistory(newData);
  };

  /**
   * @param {number} index
   * @returns {void}
   */
  const restoreOriginal = (index) => {
    const newData = [...currentFlatData];
    newData[index] = {
      ...newData[index],
      value: newData[index].original,
      isEdited: false,
    };
    pushHistory(newData);
  };

  const undo = useCallback(() => {
    if (historyIndex > 0) setHistoryIndex(historyIndex - 1);
  }, [historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) setHistoryIndex(historyIndex + 1);
  }, [historyIndex, history.length]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  /**
   * @param {number} index
   * @returns {Promise<void>}
   */
  const handleTranslateSingle = async (index) => {
    setTranslatingIndex(index);
    try {
      const translated = await executeSilentTranslation(currentFlatData[index].value);
      if (translated) {
        handleValueChange(index, translated);
      }
    } catch (e) {
      console.error(e);
    }
    setTranslatingIndex(-1);
  };

  const bulkTranslateSelected = async () => {
    const selectedIndexes = currentFlatData
      .map((item, i) => (item.selected && item.isString ? i : -1))
      .filter((i) => i !== -1);
    if (selectedIndexes.length === 0) return;

    setIsBulkTranslating(true);
    const newData = [...currentFlatData];

    for (const index of selectedIndexes) {
      try {
        const translated = await executeSilentTranslation(newData[index].value);
        if (translated) {
          newData[index] = {
            ...newData[index],
            value: translated,
            isEdited: translated !== newData[index].original,
            selected: false,
          };
        }
      } catch {
        console.error('Bulk translation failed for index', index);
      }
    }
    pushHistory(newData);
    setIsBulkTranslating(false);
  };

  // Virtualization calculations
  const totalHeight = currentFlatData.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - 2);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + 4;
  const visibleItems = currentFlatData
    .slice(startIndex, startIndex + visibleCount)
    .map((item, idx) => ({
      ...item,
      realIndex: startIndex + idx,
    }));

  if (!filePath) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 bg-body">
        <h4 className="text-secondary mb-3">No JSON File Loaded</h4>
        <button className="btn btn-primary px-4 fw-bold shadow-sm" onClick={handleOpen}>
          Open JSON File
        </button>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100 bg-body p-3">
      {/* Toolbar */}
      <div className="d-flex justify-content-between align-items-center mb-3 bg-body-tertiary p-2 rounded border">
        <div className="d-flex gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={handleOpen}>
            Open File
          </button>
          <button className="btn btn-sm btn-success" onClick={handleSave} disabled={!isDirty}>
            Save Changes
          </button>
          <div className="vr mx-1"></div>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={undo}
            disabled={historyIndex <= 0}
          >
            Undo
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={redo}
            disabled={historyIndex >= history.length - 1}
          >
            Redo
          </button>
        </div>
        <div className="d-flex gap-2 align-items-center">
          <span className="small text-muted me-2">Items: {currentFlatData.length}</span>
          <button className="btn btn-sm btn-outline-primary" onClick={selectAll}>
            Select All
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={deselectAll}>
            Deselect
          </button>
          <button
            className="btn btn-sm btn-primary fw-bold"
            onClick={bulkTranslateSelected}
            disabled={isBulkTranslating}
          >
            {isBulkTranslating ? 'Translating...' : 'Bulk Translate'}
          </button>
        </div>
      </div>

      {/* Virtualized Container */}
      <div
        ref={containerRef}
        className="flex-grow-1 overflow-auto border rounded bg-body position-relative"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{ height: '0px' }} // Flex-grow handles the real height
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative', width: '100%' }}>
          {visibleItems.map((item) => (
            <div
              key={item.realIndex}
              className={`position-absolute w-100 px-3 border-bottom d-flex align-items-center ${item.isEdited ? 'bg-warning-subtle' : 'bg-body'}`}
              style={{ top: `${item.realIndex * ROW_HEIGHT}px`, height: `${ROW_HEIGHT}px` }}
            >
              <div className="form-check me-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={item.selected}
                  onChange={() => toggleSelection(item.realIndex)}
                  disabled={!item.isString}
                />
              </div>
              <div
                className="flex-grow-1 d-flex flex-column justify-content-center"
                style={{ minWidth: 0 }}
              >
                <span className="small text-muted fw-bold text-truncate" title={item.path}>
                  {item.path}
                </span>
                {item.isString ? (
                  <div className="d-flex gap-2 mt-1">
                    <textarea
                      className="form-control form-control-sm text-body bg-body flex-grow-1"
                      rows="3"
                      style={{ resize: 'none' }}
                      value={item.value}
                      onChange={(e) => handleValueChange(item.realIndex, e.target.value)}
                    />
                    <button
                      className="btn btn-sm btn-primary text-nowrap align-self-center"
                      onClick={() => handleTranslateSingle(item.realIndex)}
                      disabled={translatingIndex === item.realIndex}
                    >
                      {translatingIndex === item.realIndex ? '...' : 'Translate'}
                    </button>
                  </div>
                ) : (
                  <div className="d-flex gap-2 mt-1">
                    <textarea
                      className="form-control form-control-sm text-body bg-body-secondary flex-grow-1"
                      rows="3"
                      style={{ resize: 'none' }}
                      value={String(item.value)}
                      onChange={(e) => {
                        let val = e.target.value;
                        if (val === 'true') val = true;
                        if (val === 'false') val = false;
                        if (val === 'null') val = null;
                        if (!isNaN(val) && val !== '') val = Number(val);
                        handleValueChange(item.realIndex, val);
                      }}
                    />
                  </div>
                )}
              </div>
              <div className="ms-3 text-end" style={{ minWidth: '80px' }}>
                <button
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => restoreOriginal(item.realIndex)}
                  disabled={!item.isEdited}
                >
                  Restore
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
