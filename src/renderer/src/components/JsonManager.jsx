import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

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
  const [viewportHeight, setViewportHeight] = useState(600);
  const containerRef = useRef(null);

  const [isBulkTranslating, setIsBulkTranslating] = useState(false);
  const [translatingIndex, setTranslatingIndex] = useState(-1);

  const [expandedGroups, setExpandedGroups] = useState(new Set());
  const [activeRowIndex, setActiveRowIndex] = useState(-1);

  /**
   * @type {Array<{path: string, value: any, original: any, isString: boolean, isEdited: boolean, selected: boolean, alts: string[]}>}
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
            alts: [],
          }));
          setFilePath(result.filePath);
          setOriginalFlat(flat);
          setHistory([flat]);
          setHistoryIndex(0);
          setExpandedGroups(new Set());
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
      alts: [],
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
   * @param {string} groupPath
   * @returns {void}
   */
  const toggleGroup = (groupPath) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupPath)) next.delete(groupPath);
      else next.add(groupPath);
      return next;
    });
  };

  const expandAll = () => {
    const allGroups = new Set();
    currentFlatData.forEach((item) => {
      const lastDot = item.path.lastIndexOf('.');
      const parent = lastDot > 0 ? item.path.substring(0, lastDot) : 'Root';
      allGroups.add(parent);
    });
    setExpandedGroups(allGroups);
  };

  const collapseAll = () => setExpandedGroups(new Set());

  /**
   * @param {number} index
   * @returns {Promise<void>}
   */
  const handleTranslateSingle = async (index) => {
    setTranslatingIndex(index);
    try {
      const result = await executeSilentTranslation(currentFlatData[index].value);
      if (result && result.text) {
        const newData = [...currentFlatData];
        newData[index] = {
          ...newData[index],
          value: result.text,
          isEdited: result.text !== newData[index].original,
          alts: result.alts || [],
        };
        pushHistory(newData);
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
        const result = await executeSilentTranslation(newData[index].value);
        if (result && result.text) {
          newData[index] = {
            ...newData[index],
            value: result.text,
            isEdited: result.text !== newData[index].original,
            selected: false,
            alts: result.alts || [],
          };
        }
      } catch {
        console.error('Bulk translation failed for index', index);
      }
    }
    pushHistory(newData);
    setIsBulkTranslating(false);
  };

  // Pre-calculate visual layout and heights based on expanded states
  const { visibleRows, totalHeight } = useMemo(() => {
    const rows = [];
    let currentGroup = null;
    let currentTop = 0;
    let groupItemCount = 0;

    currentFlatData.forEach((item, originalIndex) => {
      const lastDot = item.path.lastIndexOf('.');
      const parentPath = lastDot > 0 ? item.path.substring(0, lastDot) : 'Root';
      const keyName = lastDot > 0 ? item.path.substring(lastDot + 1) : item.path;

      if (parentPath !== currentGroup) {
        currentGroup = parentPath;
        groupItemCount = currentFlatData.filter((i) => {
          const lDot = i.path.lastIndexOf('.');
          const pPath = lDot > 0 ? i.path.substring(0, lDot) : 'Root';
          return pPath === parentPath;
        }).length;

        rows.push({
          isHeader: true,
          id: `header-${parentPath}`,
          groupPath: parentPath,
          itemCount: groupItemCount,
          top: currentTop,
          height: 50,
        });
        currentTop += 50;
      }

      if (expandedGroups.has(parentPath)) {
        const hasAlts = item.alts && item.alts.length > 1;
        const baseHeight = 110;
        const itemHeight = hasAlts ? baseHeight + 45 : baseHeight;

        rows.push({
          ...item,
          isHeader: false,
          id: `item-${item.path}`,
          originalIndex,
          keyName,
          top: currentTop,
          height: itemHeight,
        });
        currentTop += itemHeight;
      }
    });

    return { visibleRows: rows, totalHeight: currentTop };
  }, [currentFlatData, expandedGroups]);

  // Derive visible items based on scroll
  let startIndex = 0;
  for (let i = 0; i < visibleRows.length; i++) {
    if (visibleRows[i].top + visibleRows[i].height >= scrollTop) {
      startIndex = Math.max(0, i - 2);
      break;
    }
  }

  const visibleCount = Math.ceil(viewportHeight / 50) + 5;
  const visibleItems = visibleRows.slice(startIndex, startIndex + visibleCount);

  useEffect(() => {
    if (containerRef.current) {
      setViewportHeight(containerRef.current.clientHeight);
    }

    const handleResize = () => {
      if (containerRef.current) setViewportHeight(containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 bg-body-tertiary p-2 rounded border gap-2">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <button className="btn btn-sm btn-outline-secondary fw-bold" onClick={handleOpen}>
            Open File
          </button>
          <button
            className="btn btn-sm btn-success fw-bold"
            onClick={handleSave}
            disabled={!isDirty}
          >
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
          <div className="vr mx-1"></div>
          <button className="btn btn-sm btn-outline-primary" onClick={expandAll}>
            Expand All
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={collapseAll}>
            Collapse All
          </button>
        </div>
        <div className="d-flex flex-wrap gap-2 align-items-center">
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
        style={{ height: '0px' }}
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative', width: '100%' }}>
          {visibleItems.map((item) => {
            if (item.isHeader) {
              const isExpanded = expandedGroups.has(item.groupPath);
              return (
                <div
                  key={item.id}
                  className="position-absolute w-100 px-3 bg-body-secondary border-bottom d-flex align-items-center justify-content-between cursor-pointer"
                  style={{
                    top: `${item.top}px`,
                    height: `${item.height}px`,
                    zIndex: 2,
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleGroup(item.groupPath)}
                >
                  <span className="fw-bold text-primary">
                    <span className="me-2">{isExpanded ? '▼' : '▶'}</span>[{item.groupPath}]
                  </span>
                  <span className="badge bg-secondary">{item.itemCount} items</span>
                </div>
              );
            }

            const isFocused = activeRowIndex === item.originalIndex;

            return (
              <div
                key={item.id}
                className={`position-absolute w-100 px-3 border-bottom d-flex flex-column justify-content-center ${item.isEdited ? 'bg-warning-subtle' : 'bg-body'}`}
                style={{
                  top: `${item.top}px`,
                  height: `${item.height}px`,
                  zIndex: isFocused ? 10 : 1,
                  overflow: 'visible',
                }}
              >
                <div className="d-flex align-items-start w-100">
                  <div className="form-check me-3 mt-1">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleSelection(item.originalIndex)}
                      disabled={!item.isString}
                    />
                  </div>
                  <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
                    <span className="small text-muted fw-bold text-truncate mb-1" title={item.path}>
                      {item.keyName}
                    </span>

                    {item.isString ? (
                      <div className="d-flex gap-2">
                        <textarea
                          className="form-control form-control-sm text-body bg-body flex-grow-1 shadow-sm"
                          rows="2"
                          style={{ resize: 'vertical', minHeight: '60px', maxHeight: '300px' }}
                          value={item.value}
                          onFocus={() => setActiveRowIndex(item.originalIndex)}
                          onBlur={() => setActiveRowIndex(-1)}
                          onChange={(e) => handleValueChange(item.originalIndex, e.target.value)}
                        />
                        <button
                          className="btn btn-sm btn-primary text-nowrap align-self-start mt-1"
                          onClick={() => handleTranslateSingle(item.originalIndex)}
                          disabled={translatingIndex === item.originalIndex}
                        >
                          {translatingIndex === item.originalIndex ? '...' : 'Translate'}
                        </button>
                      </div>
                    ) : (
                      <div className="d-flex gap-2">
                        <textarea
                          className="form-control form-control-sm text-body bg-body-tertiary flex-grow-1"
                          rows="1"
                          style={{ resize: 'vertical', minHeight: '35px' }}
                          value={String(item.value)}
                          onFocus={() => setActiveRowIndex(item.originalIndex)}
                          onBlur={() => setActiveRowIndex(-1)}
                          onChange={(e) => {
                            let val = e.target.value;
                            if (val === 'true') val = true;
                            if (val === 'false') val = false;
                            if (val === 'null') val = null;
                            if (!isNaN(val) && val !== '') val = Number(val);
                            handleValueChange(item.originalIndex, val);
                          }}
                        />
                      </div>
                    )}

                    {item.alts && item.alts.length > 1 && (
                      <div className="d-flex flex-wrap gap-2 align-items-center mt-2">
                        <span className="small text-muted fw-bold text-uppercase">Versions:</span>
                        {item.alts.map((altText, idx) => (
                          <button
                            key={idx}
                            className={`btn btn-sm ${item.value === altText ? 'btn-primary' : 'btn-outline-primary'}`}
                            onClick={() => handleValueChange(item.originalIndex, altText)}
                          >
                            {idx === 0 ? 'Original' : idx}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="ms-3 text-end" style={{ minWidth: '80px' }}>
                    <button
                      className="btn btn-sm btn-outline-secondary mt-1"
                      onClick={() => restoreOriginal(item.originalIndex)}
                      disabled={!item.isEdited}
                    >
                      Restore
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
