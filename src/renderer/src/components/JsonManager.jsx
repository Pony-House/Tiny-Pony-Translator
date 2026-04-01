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
 * @param {Object} props
 * @param {string} props.value
 * @param {boolean} props.isString
 * @param {function} props.onChange
 * @param {function} props.onFocus
 * @param {function} props.onBlur
 * @param {function} props.onHeightChange
 */
const ResizableTextarea = ({ value, isString, onChange, onFocus, onBlur, onHeightChange }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        onHeightChange(entry.contentRect.height);
      }
    });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [onHeightChange]);

  return (
    <textarea
      ref={ref}
      className={`form-control form-control-sm text-body flex-grow-1 ${isString ? 'bg-body shadow-sm' : 'bg-body-tertiary'}`}
      rows={isString ? 2 : 1}
      style={{ resize: 'vertical', minHeight: isString ? '60px' : '35px', maxHeight: '500px' }}
      value={value}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={onChange}
    />
  );
};

let jsonHistory = [];
let jsonHistoryIndex = -1;
let jsonOriginalFlat = [];
let jsonExpandedGroups = new Set();
let jsonFilePath = null;
let jsonKeyFilter = 'ALL';

/**
 * @param {Object} options
 * @param {Function} options.executeSilentTranslation
 * @returns {JSX.Element}
 */
export default function JsonManager({ executeSilentTranslation }) {
  const [filePath, setFilePath] = useState(jsonFilePath);

  const [history, setHistory] = useState(jsonHistory);
  const [historyIndex, setHistoryIndex] = useState(jsonHistoryIndex);
  const [originalFlat, setOriginalFlat] = useState(jsonOriginalFlat);
  const [expandedGroups, setExpandedGroups] = useState(jsonExpandedGroups);
  const [keyFilter, setKeyFilter] = useState(jsonKeyFilter);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const containerRef = useRef(null);

  const [isBulkTranslating, setIsBulkTranslating] = useState(false);
  const [translatingIndex, setTranslatingIndex] = useState(-1);
  const [activeRowIndex, setActiveRowIndex] = useState(-1);
  const [rowHeights, setRowHeights] = useState({});

  const [compareItem, setCompareItem] = useState(null);
  const [addingKeyToGroup, setAddingKeyToGroup] = useState(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState('string');

  /**
   * @type {Array<{path: string, value: any, original: any, isString: boolean, isEdited: boolean, selected: boolean, alts: string[]}>}
   */
  const currentFlatData = history[historyIndex] || [];
  const isDirty = historyIndex > 0;

  // Lock safety variable
  const isTranslatingAny = isBulkTranslating || translatingIndex !== -1;

  useEffect(() => {
    if (filePath) sessionStorage.setItem('json_filePath', filePath);
    else sessionStorage.removeItem('json_filePath');

    jsonFilePath = filePath;
    jsonHistory = history;
    jsonHistoryIndex = historyIndex;
    jsonOriginalFlat = originalFlat;
    jsonExpandedGroups = expandedGroups;
    jsonKeyFilter = keyFilter;
  }, [filePath, history, historyIndex, originalFlat, expandedGroups, keyFilter]);

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
          setRowHeights({});
          setKeyFilter('ALL');
        } catch {
          alert('Invalid JSON file.');
        }
      }
    }
  };

  const handleSave = useCallback(async () => {
    if (!window.api || !filePath || isTranslatingAny) return;
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
  }, [filePath, currentFlatData, isTranslatingAny]);

  const handleReset = () => {
    if (
      window.confirm(
        'Are you sure you want to close this file and reset the editor? Unsaved changes will be lost.',
      )
    ) {
      setFilePath(null);
      setHistory([]);
      setHistoryIndex(-1);
      setOriginalFlat([]);
      setExpandedGroups(new Set());
      setRowHeights({});
      setKeyFilter('ALL');
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
    const newData = currentFlatData.map((item) => {
      const lastDot = item.path.lastIndexOf('.');
      const keyName = lastDot > 0 ? item.path.substring(lastDot + 1) : item.path;
      const matchesFilter = keyFilter === 'ALL' || keyName === keyFilter;

      if (item.isString && matchesFilter) {
        return { ...item, selected: true };
      }
      return item;
    });
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

  /**
   * @param {number} index
   * @returns {void}
   */
  const removeKey = (index) => {
    if (
      window.confirm(`Are you sure you want to remove this key? (${currentFlatData[index].path})`)
    ) {
      const newData = [...currentFlatData];
      newData.splice(index, 1);
      pushHistory(newData);
    }
  };

  const undo = useCallback(() => {
    if (historyIndex > 0 && !isTranslatingAny) setHistoryIndex(historyIndex - 1);
  }, [historyIndex, isTranslatingAny]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1 && !isTranslatingAny) setHistoryIndex(historyIndex + 1);
  }, [historyIndex, history.length, isTranslatingAny]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (isDirty && !isTranslatingAny) handleSave();
      } else if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, handleSave, isDirty, isTranslatingAny]);

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
   * @param {number} height
   * @returns {void}
   */
  const updateRowHeight = useCallback((index, height) => {
    setRowHeights((prev) => {
      if (Math.abs((prev[index] || 0) - height) < 5) return prev;
      return { ...prev, [index]: height };
    });
  }, []);

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

  /**
   * @param {string} targetGroup
   * @returns {Array<{name: string, type: string}>}
   */
  const getSuggestedKeys = (targetGroup) => {
    const match = targetGroup.match(/^(.*)\.(\d+)$/);
    if (!match) return [];

    const parentArray = match[1];
    const allArrayItems = currentFlatData.filter((i) => i.path.startsWith(parentArray + '.'));

    /** @type {Map<string, string>} */
    const knownKeys = new Map();

    allArrayItems.forEach((i) => {
      const subMatch = i.path.substring(parentArray.length + 1).match(/^\d+\.(.+)$/);
      if (subMatch) knownKeys.set(subMatch[1], i.isString ? 'string' : typeof i.value);
    });

    const existingKeys = currentFlatData
      .filter((i) => i.path.startsWith(targetGroup + '.'))
      .map((i) => i.path.substring(targetGroup.length + 1));

    existingKeys.forEach((k) => knownKeys.delete(k));

    return Array.from(knownKeys.entries()).map(([name, type]) => ({ name, type }));
  };

  const handleAddCustomKey = () => {
    if (!newKeyName.trim() || !addingKeyToGroup) return;

    const fullPath = addingKeyToGroup === 'Root' ? newKeyName : `${addingKeyToGroup}.${newKeyName}`;

    if (currentFlatData.some((i) => i.path === fullPath)) {
      alert('This key already exists in this group!');
      return;
    }

    /** @type {any} */
    let defaultValue = '';
    if (newKeyType === 'number') defaultValue = 0;
    if (newKeyType === 'boolean') defaultValue = false;
    if (newKeyType === 'null') defaultValue = null;

    const newItem = {
      path: fullPath,
      value: defaultValue,
      original: defaultValue,
      isString: newKeyType === 'string',
      isEdited: true,
      selected: false,
      alts: [],
    };

    let insertIndex = currentFlatData.length;
    if (addingKeyToGroup !== 'Root') {
      for (let i = currentFlatData.length - 1; i >= 0; i--) {
        if (currentFlatData[i].path.startsWith(addingKeyToGroup + '.')) {
          insertIndex = i + 1;
          break;
        }
      }
    }

    const newData = [...currentFlatData];
    newData.splice(insertIndex, 0, newItem);
    pushHistory(newData);
    setAddingKeyToGroup(null);
    setNewKeyName('');
    setExpandedGroups((prev) => new Set(prev).add(addingKeyToGroup));
  };

  // Generate a list of unique keys for the filter dropdown
  const uniqueKeys = useMemo(() => {
    const keys = new Set();
    currentFlatData.forEach((item) => {
      const lastDot = item.path.lastIndexOf('.');
      const keyName = lastDot > 0 ? item.path.substring(lastDot + 1) : item.path;
      keys.add(keyName);
    });
    return Array.from(keys).sort();
  }, [currentFlatData]);

  // Pre-calculate visual layout, heights, and apply filter
  const { visibleRows, totalHeight } = useMemo(() => {
    const rows = [];
    let currentGroup = null;
    let currentTop = 0;

    // Fast mapping to keep original indices safely attached before filtering
    const mappedData = currentFlatData.map((item, originalIndex) => ({
      ...item,
      originalIndex,
    }));

    // Apply Key Filter
    const targetData =
      keyFilter === 'ALL'
        ? mappedData
        : mappedData.filter((item) => {
            const lastDot = item.path.lastIndexOf('.');
            const keyName = lastDot > 0 ? item.path.substring(lastDot + 1) : item.path;
            return keyName === keyFilter;
          });

    // Optimize grouped counting using a map to prevent O(N^2) lag
    const groupCounts = {};
    targetData.forEach((item) => {
      const lastDot = item.path.lastIndexOf('.');
      const pPath = lastDot > 0 ? item.path.substring(0, lastDot) : 'Root';
      groupCounts[pPath] = (groupCounts[pPath] || 0) + 1;
    });

    targetData.forEach((item) => {
      const lastDot = item.path.lastIndexOf('.');
      const parentPath = lastDot > 0 ? item.path.substring(0, lastDot) : 'Root';
      const keyName = lastDot > 0 ? item.path.substring(lastDot + 1) : item.path;

      if (parentPath !== currentGroup) {
        currentGroup = parentPath;
        rows.push({
          isHeader: true,
          id: `header-${parentPath}`,
          groupPath: parentPath,
          itemCount: groupCounts[parentPath],
          top: currentTop,
          height: 50,
        });
        currentTop += 50;
      }

      if (expandedGroups.has(parentPath)) {
        const hasAlts = item.alts && item.alts.length > 1;
        const textAreaHeight = rowHeights[item.originalIndex] || (item.isString ? 60 : 35);

        let itemHeight = textAreaHeight + 40;
        if (hasAlts) itemHeight += 45;

        rows.push({
          ...item,
          isHeader: false,
          id: `item-${item.path}`,
          keyName,
          top: currentTop,
          height: itemHeight,
        });
        currentTop += itemHeight;
      }
    });

    return { visibleRows: rows, totalHeight: currentTop };
  }, [currentFlatData, expandedGroups, rowHeights, keyFilter]);

  // Derive visible items based on scroll
  let startIndex = 0;
  for (let i = 0; i < visibleRows.length; i++) {
    if (visibleRows[i].top + visibleRows[i].height >= scrollTop) {
      startIndex = Math.max(0, i - 2);
      break;
    }
  }

  const visibleCount = Math.ceil(viewportHeight / 50) + 10;
  const visibleItems = visibleRows.slice(startIndex, startIndex + visibleCount);

  useEffect(() => {
    if (containerRef.current) setViewportHeight(containerRef.current.clientHeight);
    const handleResize = () => {
      if (containerRef.current) setViewportHeight(containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!filePath) {
    return (
      <div className="d-flex flex-column align-items-center justify-content-center h-100 bg-body py-5">
        <h4 className="text-secondary mb-3">No JSON File Loaded</h4>
        <button className="btn btn-primary px-4 fw-bold shadow-sm" onClick={handleOpen}>
          Open JSON File
        </button>
      </div>
    );
  }

  return (
    <div className="d-flex flex-column h-100 bg-body p-3 w-100 overflow-hidden">
      {/* Editor Toolbar */}
      <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 bg-body-tertiary p-2 rounded border gap-2 flex-shrink-0">
        <div className="d-flex flex-wrap gap-2 align-items-center">
          <button
            className="btn btn-sm btn-outline-danger fw-bold"
            onClick={handleReset}
            disabled={isTranslatingAny}
            title="Reset Editor and Close File"
          >
            ✕ Reset
          </button>
          <button
            className="btn btn-sm btn-success fw-bold"
            onClick={handleSave}
            disabled={!isDirty || isTranslatingAny}
            title="CTRL + S"
          >
            Save Changes
          </button>
          <div className="vr mx-1"></div>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={undo}
            disabled={historyIndex <= 0 || isTranslatingAny}
            title="CTRL + Z"
          >
            Undo
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={redo}
            disabled={historyIndex >= history.length - 1 || isTranslatingAny}
            title="CTRL + SHIFT + Z"
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
          <div className="d-flex align-items-center ms-2 gap-2">
            <span className="small text-muted fw-bold">Filter:</span>
            <select
              className="form-select form-select-sm border-secondary fw-bold"
              style={{ maxWidth: '160px' }}
              value={keyFilter}
              onChange={(e) => setKeyFilter(e.target.value)}
            >
              <option value="ALL">All Keys</option>
              {uniqueKeys.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
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
            disabled={isTranslatingAny}
          >
            {isBulkTranslating ? 'Translating...' : 'Bulk Translate'}
          </button>
        </div>
      </div>

      {/* Virtualized Container */}
      <div
        ref={containerRef}
        className="overflow-auto border rounded bg-body position-relative"
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        style={{ height: '70vh' }}
      >
        <div style={{ height: `${totalHeight}px`, position: 'relative', width: '100%' }}>
          {visibleItems.map((item) => {
            if (item.isHeader) {
              const isExpanded = expandedGroups.has(item.groupPath);
              return (
                <div
                  key={item.id}
                  className="position-absolute w-100 px-3 bg-body-secondary border-bottom d-flex align-items-center justify-content-between"
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
                  <div className="d-flex align-items-center gap-3">
                    <span className="badge bg-secondary">{item.itemCount} items</span>
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddingKeyToGroup(item.groupPath);
                      }}
                    >
                      + Add Key
                    </button>
                  </div>
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
                  overflow: 'hidden',
                }}
              >
                <div className="d-flex align-items-start w-100">
                  <div className="form-check me-3 mt-1">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleSelection(item.originalIndex)}
                      disabled={!item.isString || isTranslatingAny}
                    />
                  </div>
                  <div className="flex-grow-1 d-flex flex-column" style={{ minWidth: 0 }}>
                    <div className="d-flex align-items-center justify-content-between mb-1">
                      <span className="small text-muted fw-bold text-truncate" title={item.path}>
                        {item.keyName}
                      </span>
                      {item.isEdited && (
                        <button
                          className="btn btn-link btn-sm p-0 text-decoration-none"
                          onClick={() => setCompareItem(item)}
                        >
                          Compare Original
                        </button>
                      )}
                    </div>

                    <div className="d-flex gap-2">
                      <ResizableTextarea
                        value={item.isString ? item.value : String(item.value)}
                        isString={item.isString}
                        onFocus={() => setActiveRowIndex(item.originalIndex)}
                        onBlur={() => setActiveRowIndex(-1)}
                        onHeightChange={(h) => updateRowHeight(item.originalIndex, h)}
                        onChange={(e) => {
                          let val = e.target.value;
                          if (!item.isString) {
                            if (val === 'true') val = true;
                            if (val === 'false') val = false;
                            if (val === 'null') val = null;
                            if (!isNaN(val) && val !== '') val = Number(val);
                          }
                          handleValueChange(item.originalIndex, val);
                        }}
                      />
                      {item.isString && (
                        <button
                          className="btn btn-sm btn-primary text-nowrap align-self-start mt-1"
                          onClick={() => handleTranslateSingle(item.originalIndex)}
                          disabled={isTranslatingAny}
                        >
                          {translatingIndex === item.originalIndex ? '...' : 'Translate'}
                        </button>
                      )}
                    </div>

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
                  <div
                    className="ms-3 text-end d-flex flex-column gap-1"
                    style={{ minWidth: '80px' }}
                  >
                    <button
                      className="btn btn-sm btn-outline-secondary mt-1"
                      onClick={() => restoreOriginal(item.originalIndex)}
                      disabled={!item.isEdited || isTranslatingAny}
                    >
                      Restore
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => removeKey(item.originalIndex)}
                      disabled={isTranslatingAny}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add Key Modal */}
      {addingKeyToGroup && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content bg-body text-body shadow-lg border-0">
              <div className="modal-header bg-body-tertiary">
                <h5 className="modal-title fw-bold">Add Property to [{addingKeyToGroup}]</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setAddingKeyToGroup(null)}
                ></button>
              </div>
              <div className="modal-body">
                {getSuggestedKeys(addingKeyToGroup).length > 0 && (
                  <div className="mb-4">
                    <label className="form-label fw-bold text-success small text-uppercase">
                      Recognized missing keys
                    </label>
                    <div className="d-flex flex-wrap gap-2">
                      {getSuggestedKeys(addingKeyToGroup).map((sg) => (
                        <button
                          key={sg.name}
                          className="btn btn-sm btn-outline-success"
                          onClick={() => {
                            setNewKeyName(sg.name);
                            setNewKeyType(sg.type);
                          }}
                        >
                          {sg.name} <span className="badge bg-success ms-1">{sg.type}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <hr />

                <label className="form-label fw-bold small text-uppercase">Custom Key</label>
                <div className="input-group mb-3">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Key name..."
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                  />
                  <select
                    className="form-select"
                    style={{ maxWidth: '120px' }}
                    value={newKeyType}
                    onChange={(e) => setNewKeyType(e.target.value)}
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="null">Null</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer border-0">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setAddingKeyToGroup(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary fw-bold"
                  onClick={handleAddCustomKey}
                  disabled={!newKeyName.trim()}
                >
                  Add Key
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Diff Modal */}
      {compareItem && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content bg-body text-body shadow-lg border-0">
              <div className="modal-header bg-body-tertiary">
                <h5 className="modal-title fw-bold">Comparing: {compareItem.path}</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setCompareItem(null)}
                ></button>
              </div>
              <div className="modal-body row g-3">
                <div className="col-6">
                  <label className="form-label fw-bold text-danger">Original Version</label>
                  <textarea
                    className="form-control bg-danger-subtle text-danger"
                    rows="5"
                    readOnly
                    value={String(compareItem.original)}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label fw-bold text-success">Edited Version</label>
                  <textarea
                    className="form-control bg-success-subtle text-success"
                    rows="5"
                    readOnly
                    value={String(compareItem.value)}
                  />
                </div>
              </div>
              <div className="modal-footer border-0">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setCompareItem(null)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
