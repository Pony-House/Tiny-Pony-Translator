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
 * @returns {Object|Array}
 */
const unflattenJson = (flatArray) => {
  if (!flatArray || flatArray.length === 0) return {};

  // Detects if the root of the file is an Array (e.g., [ { ... } ])
  const isRootArray = !isNaN(flatArray[0].path.split('.')[0]);
  const result = isRootArray ? [] : {};

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
 * @param {number} props.defaultHeight
 * @param {function} props.onChange
 * @param {function} props.onFocus
 * @param {function} props.onBlur
 * @param {function} props.onHeightChange
 */
const ResizableTextarea = ({
  value,
  isString,
  defaultHeight,
  onChange,
  onFocus,
  onBlur,
  onHeightChange,
}) => {
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
      style={{
        resize: 'vertical',
        minHeight: isString ? `${defaultHeight}px` : '35px',
        height: isString ? `${defaultHeight}px` : '35px',
        maxHeight: '800px',
      }}
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
let jsonExcludedKeys = new Set();
let jsonFilePath = null;

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
  const [excludedKeys, setExcludedKeys] = useState(jsonExcludedKeys);
  const [filterOpen, setFilterOpen] = useState(false);
  const [heightsMenuOpen, setHeightsMenuOpen] = useState(false);

  // Load custom heights from localStorage
  const [defaultTextareaHeight, setDefaultTextareaHeight] = useState(
    () => parseInt(localStorage.getItem('jsonManager_globalHeight'), 10) || 30,
  );

  const [customKeyHeights, setCustomKeyHeights] = useState(() => {
    const saved = localStorage.getItem('jsonManager_customHeights');
    return saved ? JSON.parse(saved) : {};
  });

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const containerRef = useRef(null);
  const filterDropdownRef = useRef(null);
  const heightsDropdownRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [isBulkTranslating, setIsBulkTranslating] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0 });
  const [translatingIndex, setTranslatingIndex] = useState(-1);
  const [activeRowIndex, setActiveRowIndex] = useState(-1);
  const [rowHeights, setRowHeights] = useState({});

  const [compareItemIndex, setCompareItemIndex] = useState(-1);
  const [addingKeyToGroup, setAddingKeyToGroup] = useState(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyType, setNewKeyType] = useState('string');

  // Heights menu state
  const [newCustomKey, setNewCustomKey] = useState('');
  const [newCustomHeight, setNewCustomHeight] = useState(100);

  /**
   * @type {Array<{path: string, value: any, original: any, isString: boolean, isEdited: boolean, selected: boolean, alts: string[]}>}
   */
  const currentFlatData = history[historyIndex] || [];
  const isDirty = historyIndex > 0;

  // Lock safety variable
  const isTranslatingAny = isBulkTranslating || translatingIndex !== -1;
  const selectedCount = currentFlatData.filter((i) => i.selected).length;
  const compareItemData = compareItemIndex >= 0 ? currentFlatData[compareItemIndex] : null;

  // Smart Array Items counter
  const arrayItemsCount = useMemo(() => {
    const arrayGroups = new Set();
    currentFlatData.forEach((item) => {
      const lastDot = item.path.lastIndexOf('.');
      const parentPath = lastDot > 0 ? item.path.substring(0, lastDot) : 'Root';
      if (parentPath !== 'Root' && /(?:^|\.)\d+$/.test(parentPath)) {
        arrayGroups.add(parentPath);
      }
    });
    return arrayGroups.size;
  }, [currentFlatData]);

  // Persist heights settings
  useEffect(() => {
    localStorage.setItem('jsonManager_globalHeight', defaultTextareaHeight.toString());
  }, [defaultTextareaHeight]);

  useEffect(() => {
    localStorage.setItem('jsonManager_customHeights', JSON.stringify(customKeyHeights));
  }, [customKeyHeights]);

  useEffect(() => {
    if (filePath) sessionStorage.setItem('json_filePath', filePath);
    else sessionStorage.removeItem('json_filePath');

    jsonFilePath = filePath;
    jsonHistory = history;
    jsonHistoryIndex = historyIndex;
    jsonOriginalFlat = originalFlat;
    jsonExpandedGroups = expandedGroups;
    jsonExcludedKeys = excludedKeys;
  }, [filePath, history, historyIndex, originalFlat, expandedGroups, excludedKeys]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        setFilterOpen(false);
      }
      if (heightsDropdownRef.current && !heightsDropdownRef.current.contains(event.target)) {
        setHeightsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
          setExcludedKeys(new Set());
          setRowHeights({});
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

  /**
   * Smart Single Save - Save only the edits of one item and ignore those pending for others
   * @param {number} index
   * @returns {Promise<void>}
   */
  const handleSaveSingle = async (index) => {
    if (!window.api || !filePath || isTranslatingAny) return;

    // Build a hybrid array: Keep the new value only for the current item, and restore the 'original' to others.
    const partialData = currentFlatData.map((item, i) => {
      if (i === index) return item;
      return { ...item, value: item.original };
    });

    try {
      const reconstructed = unflattenJson(partialData);
      const success = await window.api.saveJson(filePath, JSON.stringify(reconstructed, null, 2));

      if (success) {
        // Update the original baseline to exactly mirror what was saved on the disk
        setOriginalFlat(partialData.map((item) => ({ ...item, original: item.value })));

        // Update live data on the screen: The clicked item becomes as "saved" (not edited).
        // The others keep the pending state compared with the new baseline of the file.
        const newData = currentFlatData.map((item, i) => {
          const newOriginal = partialData[i].value;
          return {
            ...item,
            original: newOriginal,
            isEdited: item.value !== newOriginal,
          };
        });

        pushHistory(newData);
      }
    } catch {
      alert('Failed to save individual item.');
    }
  };

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
      setExcludedKeys(new Set());
      setRowHeights({});
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
      const isVisible = !excludedKeys.has(keyName);

      if (item.isString && isVisible) {
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

  const selectGroup = (groupPath) => {
    const newData = currentFlatData.map((item) => {
      if (item.isString && (item.path === groupPath || item.path.startsWith(groupPath + '.'))) {
        return { ...item, selected: true };
      }
      return item;
    });
    pushHistory(newData);
  };

  const deselectGroup = (groupPath) => {
    const newData = currentFlatData.map((item) => {
      if (item.path === groupPath || item.path.startsWith(groupPath + '.')) {
        return { ...item, selected: false };
      }
      return item;
    });
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

  // Global Keydown
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setCompareItemIndex(-1);
        setAddingKeyToGroup(null);
        setFilterOpen(false);
        setHeightsMenuOpen(false);
      } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
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

  // Robust delete that supports Array Items both in objects and directly at the root
  const handleDeleteGroup = (groupPath) => {
    if (!window.confirm(`Are you sure you want to delete the entire array item [${groupPath}]?`))
      return;

    let newData = currentFlatData.filter(
      (i) => i.path !== groupPath && !i.path.startsWith(groupPath + '.'),
    );

    const match = groupPath.match(/^(?:(.*)\.)?(\d+)$/);
    if (match) {
      const parentPrefix = match[1] ? `${match[1]}.` : '';
      const deletedIdx = parseInt(match[2], 10);

      newData = newData.map((item) => {
        if (item.path.startsWith(parentPrefix)) {
          const remainder = item.path.substring(parentPrefix.length);
          const subMatch = remainder.match(/^(\d+)(.*)$/);
          if (subMatch) {
            const idx = parseInt(subMatch[1], 10);
            if (idx > deletedIdx) {
              const newPath = `${parentPrefix}${idx - 1}${subMatch[2]}`;
              return { ...item, path: newPath };
            }
          }
        }
        return item;
      });
    }
    pushHistory(newData);
  };

  // Robust clone that shifts subsequent elements and inserts the clone right after the original
  const handleCloneGroup = (groupPath) => {
    const match = groupPath.match(/^(?:(.*)\.)?(\d+)$/);
    if (!match) return;

    const parentPrefix = match[1] ? `${match[1]}.` : '';
    const targetIdx = parseInt(match[2], 10);
    const newIdx = targetIdx + 1;

    // Shift elements >= newIdx forward by 1
    let newData = currentFlatData.map((item) => {
      if (item.path.startsWith(parentPrefix)) {
        const remainder = item.path.substring(parentPrefix.length);
        const subMatch = remainder.match(/^(\d+)(.*)$/);
        if (subMatch) {
          const idx = parseInt(subMatch[1], 10);
          if (idx >= newIdx) {
            const newPath = `${parentPrefix}${idx + 1}${subMatch[2]}`;
            return { ...item, path: newPath };
          }
        }
      }
      return item;
    });

    const itemsToClone = currentFlatData.filter(
      (i) => i.path === groupPath || i.path.startsWith(groupPath + '.'),
    );

    const clonedItems = itemsToClone.map((item) => {
      const suffix = item.path.substring(groupPath.length);
      return {
        ...item,
        path: `${parentPrefix}${newIdx}${suffix}`,
        isEdited: true,
        selected: false,
        alts: [],
      };
    });

    // Find insertion position immediately after the original target group
    let insertPos = 0;
    for (let i = 0; i < newData.length; i++) {
      const isTarget = newData[i].path === groupPath || newData[i].path.startsWith(groupPath + '.');
      if (isTarget) {
        insertPos = i + 1;
      }
    }

    newData.splice(insertPos, 0, ...clonedItems);
    pushHistory(newData);
    setExpandedGroups((prev) => new Set(prev).add(`${parentPrefix}${newIdx}`));
  };

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

  const cancelTranslation = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsBulkTranslating(false);
    setTranslatingIndex(-1);
    setBulkProgress({ current: 0, total: 0 });
  };

  /**
   * @param {number} index
   * @returns {Promise<void>}
   */
  const handleTranslateSingle = async (index) => {
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;
    setTranslatingIndex(index);
    try {
      const result = await executeSilentTranslation(currentFlatData[index].value, signal);
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
      if (e.name === 'AbortError') console.log('Translation aborted');
      else console.error(e);
    }
    setTranslatingIndex(-1);
    abortControllerRef.current = null;
  };

  const bulkTranslateSelected = async () => {
    const selectedIndexes = currentFlatData
      .map((item, i) => (item.selected && item.isString ? i : -1))
      .filter((i) => i !== -1);
    if (selectedIndexes.length === 0) return;

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsBulkTranslating(true);
    setBulkProgress({ current: 0, total: selectedIndexes.length });

    let newData = [...currentFlatData];

    for (let i = 0; i < selectedIndexes.length; i++) {
      if (signal.aborted) break;
      const index = selectedIndexes[i];
      setBulkProgress({ current: i + 1, total: selectedIndexes.length });

      try {
        const result = await executeSilentTranslation(newData[index].value, signal);
        if (result && result.text) {
          newData[index] = {
            ...newData[index],
            value: result.text,
            isEdited: result.text !== newData[index].original,
            selected: false,
            alts: result.alts || [],
          };
          pushHistory([...newData]);
        }
      } catch (e) {
        if (e.name === 'AbortError') {
          console.log('Bulk translation aborted');
          break;
        }
        console.error('Bulk translation failed for index', index);
      }
    }

    setIsBulkTranslating(false);
    setBulkProgress({ current: 0, total: 0 });
    abortControllerRef.current = null;
  };

  /**
   * @param {string} targetGroup
   * @returns {Array<{name: string, type: string}>}
   */
  const getSuggestedKeys = (targetGroup) => {
    const match = targetGroup.match(/^(?:(.*)\.)?(\d+)$/);
    if (!match) return [];

    const parentPrefix = match[1] ? `${match[1]}.` : '';
    const allArrayItems = currentFlatData.filter((i) => i.path.startsWith(parentPrefix));

    /** @type {Map<string, string>} */
    const knownKeys = new Map();

    allArrayItems.forEach((i) => {
      const remainder = i.path.substring(parentPrefix.length);
      const subMatch = remainder.match(/^\d+\.(.+)$/);
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

  const addCustomKeyHeight = () => {
    if (!newCustomKey.trim()) return;
    setCustomKeyHeights({ ...customKeyHeights, [newCustomKey.trim()]: newCustomHeight });
    setNewCustomKey('');
    setNewCustomHeight(100);
  };

  /**
   * @param {string} key
   * @returns {void}
   */
  const removeCustomKeyHeight = (key) => {
    const updated = { ...customKeyHeights };
    delete updated[key];
    setCustomKeyHeights(updated);
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

  const toggleFilterKey = (key) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Pre-calculate visual layout, heights, and apply filter
  const { visibleRows, totalHeight } = useMemo(() => {
    const rows = [];
    let currentGroup = null;
    let currentTop = 0;

    // Fast mapping to keep original indices
    const mappedData = currentFlatData.map((item, originalIndex) => ({
      ...item,
      originalIndex,
    }));

    // Count total items per group (ignores filter)
    const totalGroupCounts = {};
    mappedData.forEach((item) => {
      const lastDot = item.path.lastIndexOf('.');
      const pPath = lastDot > 0 ? item.path.substring(0, lastDot) : 'Root';
      totalGroupCounts[pPath] = (totalGroupCounts[pPath] || 0) + 1;
    });

    // Apply Filters
    const targetData = mappedData.filter((item) => {
      const lastDot = item.path.lastIndexOf('.');
      const keyName = lastDot > 0 ? item.path.substring(lastDot + 1) : item.path;
      return !excludedKeys.has(keyName);
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
          itemCount: totalGroupCounts[parentPath],
          top: currentTop,
          height: 50,
        });
        currentTop += 50;
      }

      if (expandedGroups.has(parentPath)) {
        const hasAlts = item.alts && item.alts.length > 1;

        // Determine the target height: custom logic first, then fallback to global default
        let resolvedDefaultHeight = defaultTextareaHeight;
        if (item.isString && customKeyHeights[keyName]) {
          resolvedDefaultHeight = customKeyHeights[keyName];
        }

        const textAreaHeight =
          rowHeights[item.originalIndex] || (item.isString ? resolvedDefaultHeight : 35);

        // Increased padding base logic to accommodate buttons vertically better
        let calculatedHeight = textAreaHeight + 50;

        // Ensure a minimum width of 135px for the three buttons on the right not to be cropped.
        let itemHeight = Math.max(calculatedHeight, 135);

        if (hasAlts) itemHeight += 45;

        rows.push({
          ...item,
          isHeader: false,
          id: `item-${item.path}`,
          keyName,
          top: currentTop,
          height: itemHeight,
          resolvedDefaultHeight,
        });
        currentTop += itemHeight;
      }
    });

    return { visibleRows: rows, totalHeight: currentTop };
  }, [
    currentFlatData,
    expandedGroups,
    rowHeights,
    excludedKeys,
    defaultTextareaHeight,
    customKeyHeights,
  ]);

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
            <i className="bi bi-x-lg me-1"></i>Reset
          </button>
          <button
            className="btn btn-sm btn-success fw-bold"
            onClick={handleSave}
            disabled={!isDirty || isTranslatingAny}
            title="CTRL + S"
          >
            <i className="bi bi-floppy me-1"></i>Save All
          </button>
          <div className="vr mx-1"></div>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={undo}
            disabled={historyIndex <= 0 || isTranslatingAny}
            title="CTRL + Z"
          >
            <i className="bi bi-arrow-counterclockwise"></i>
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={redo}
            disabled={historyIndex >= history.length - 1 || isTranslatingAny}
            title="CTRL + SHIFT + Z"
          >
            <i className="bi bi-arrow-clockwise"></i>
          </button>
          <div className="vr mx-1"></div>
          <button className="btn btn-sm btn-outline-primary" onClick={expandAll}>
            <i className="bi bi-arrows-expand me-1"></i>Expand All
          </button>
          <button className="btn btn-sm btn-outline-secondary" onClick={collapseAll}>
            <i className="bi bi-arrows-collapse me-1"></i>Collapse All
          </button>

          {/* Custom Multiple Selection Filter */}
          <div className="ms-2 position-relative" ref={filterDropdownRef}>
            <button
              className="btn btn-sm btn-outline-secondary dropdown-toggle"
              onClick={() => setFilterOpen(!filterOpen)}
            >
              <i className="bi bi-funnel me-1"></i>
              Filter Keys{' '}
              {excludedKeys.size === 0
                ? '(All)'
                : `(${uniqueKeys.length - excludedKeys.size}/${uniqueKeys.length})`}
            </button>
            {filterOpen && (
              <div
                className="dropdown-menu show p-2 shadow"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 1050,
                  maxHeight: '300px',
                  overflowY: 'auto',
                  minWidth: '200px',
                }}
              >
                <div className="d-flex gap-2 mb-2">
                  <button
                    className="btn btn-sm btn-primary flex-grow-1"
                    onClick={() => setExcludedKeys(new Set())}
                  >
                    Select All
                  </button>
                  <button
                    className="btn btn-sm btn-outline-secondary flex-grow-1"
                    onClick={() => setExcludedKeys(new Set(uniqueKeys))}
                  >
                    Clear All
                  </button>
                </div>
                {uniqueKeys.map((k) => (
                  <div className="form-check" key={k}>
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`filter-${k}`}
                      checked={!excludedKeys.has(k)}
                      onChange={() => toggleFilterKey(k)}
                    />
                    <label className="form-check-label small" htmlFor={`filter-${k}`}>
                      {k}
                    </label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Enhanced Height Control System */}
          <div
            className="d-flex align-items-center ms-2 gap-1 position-relative"
            ref={heightsDropdownRef}
          >
            <i className="bi bi-textarea-resize text-secondary" title="Global Default Height"></i>
            <input
              type="number"
              className="form-control form-control-sm border-secondary text-center"
              style={{ width: '60px' }}
              value={defaultTextareaHeight}
              onChange={(e) => setDefaultTextareaHeight(Number(e.target.value) || 30)}
            />
            <button
              className="btn btn-sm btn-outline-secondary p-1 ms-1"
              title="Specific Key Heights"
              onClick={() => setHeightsMenuOpen(!heightsMenuOpen)}
            >
              <i className="bi bi-gear"></i>
            </button>

            {heightsMenuOpen && (
              <div
                className="dropdown-menu show p-3 shadow-lg"
                style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  zIndex: 1050,
                  minWidth: '280px',
                }}
              >
                <h6 className="dropdown-header px-0 text-primary fw-bold">Custom Key Heights</h6>
                <div className="d-flex gap-2 mb-3">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Key name..."
                    value={newCustomKey}
                    onChange={(e) => setNewCustomKey(e.target.value)}
                  />
                  <input
                    type="number"
                    className="form-control form-control-sm"
                    style={{ width: '70px' }}
                    value={newCustomHeight}
                    onChange={(e) => setNewCustomHeight(Number(e.target.value) || 100)}
                  />
                  <button className="btn btn-sm btn-success fw-bold" onClick={addCustomKeyHeight}>
                    +
                  </button>
                </div>
                <div
                  className="d-flex flex-column gap-2"
                  style={{ maxHeight: '200px', overflowY: 'auto' }}
                >
                  {Object.keys(customKeyHeights).length === 0 ? (
                    <span className="small text-muted fst-italic">No custom heights active.</span>
                  ) : (
                    Object.entries(customKeyHeights).map(([k, h]) => (
                      <div
                        key={k}
                        className="d-flex justify-content-between align-items-center bg-body-secondary p-1 rounded px-2"
                      >
                        <span className="small fw-bold text-truncate" style={{ maxWidth: '120px' }}>
                          {k}
                        </span>
                        <div className="d-flex align-items-center gap-2">
                          <span className="small text-muted">{h}px</span>
                          <button
                            className="btn btn-sm btn-link text-danger p-0 m-0"
                            onClick={() => removeCustomKeyHeight(k)}
                          >
                            <i className="bi bi-x-circle-fill"></i>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="d-flex flex-wrap gap-2 align-items-center">
          <span className="small text-muted me-2 border-end pe-2">
            Items: {currentFlatData.length}
          </span>
          <span className="small text-muted me-2 border-end pe-2">
            Array Items: {arrayItemsCount}
          </span>

          <button className="btn btn-sm btn-outline-primary ms-1" onClick={selectAll}>
            Select All
          </button>
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={deselectAll}>
              Deselect
            </button>
            {selectedCount > 0 && (
              <span className="small text-primary fw-bold badge bg-primary-subtle border border-primary-subtle text-primary rounded-pill">
                {selectedCount} selected
              </span>
            )}
          </div>

          {isTranslatingAny ? (
            <div className="d-flex align-items-center">
              <span className="btn btn-sm btn-warning fw-bold pe-none ms-2">
                {isBulkTranslating
                  ? `Translating ${bulkProgress.current}/${bulkProgress.total}...`
                  : 'Translating...'}
              </span>
              <button
                className="btn btn-sm btn-danger fw-bold ms-1"
                onClick={cancelTranslation}
                title="Cancel Translation"
              >
                <i className="bi bi-x-circle"></i>
              </button>
            </div>
          ) : (
            <button className="btn btn-sm btn-primary fw-bold ms-2" onClick={bulkTranslateSelected}>
              <i className="bi bi-translate me-1"></i>Bulk Translate
            </button>
          )}
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
              // Fixed Regex to recognize pure arrays or embedded array items
              const isArrayGroup = /(?:^|\.)\d+$/.test(item.groupPath);

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
                    <span className="me-2">
                      <i className={`bi bi-caret-${isExpanded ? 'down' : 'right'}-fill`}></i>
                    </span>
                    [{item.groupPath}]
                  </span>
                  <div className="d-flex align-items-center gap-2">
                    <span className="badge bg-secondary">{item.itemCount} items</span>

                    <button
                      className="btn btn-sm btn-outline-primary py-0 px-2 fs-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectGroup(item.groupPath);
                      }}
                      title="Select all in this index"
                    >
                      <i className="bi bi-check-all"></i>
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary py-0 px-2 fs-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        deselectGroup(item.groupPath);
                      }}
                      title="Deselect all in this index"
                    >
                      <i className="bi bi-square"></i>
                    </button>

                    {isArrayGroup && (
                      <>
                        <button
                          className="btn btn-sm btn-outline-success border-0 fw-bold fs-6 py-0 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCloneGroup(item.groupPath);
                          }}
                          title="Duplicate Array Item (Create New)"
                        >
                          <i className="bi bi-copy"></i>
                        </button>
                        <button
                          className="btn btn-sm btn-outline-danger border-0 fw-bold fs-6 py-0 px-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteGroup(item.groupPath);
                          }}
                          title="Delete Array Item"
                        >
                          <i className="bi bi-trash"></i>
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddingKeyToGroup(item.groupPath);
                      }}
                    >
                      <i className="bi bi-plus-lg me-1"></i>Add Key
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
                <div className="d-flex align-items-start w-100 py-2">
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
                          onClick={() => setCompareItemIndex(item.originalIndex)}
                        >
                          Compare Original
                        </button>
                      )}
                    </div>

                    <div className="d-flex gap-2">
                      <ResizableTextarea
                        value={item.isString ? item.value : String(item.value)}
                        isString={item.isString}
                        defaultHeight={item.resolvedDefaultHeight}
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
                    className="ms-3 text-end d-flex flex-column gap-2"
                    style={{ minWidth: '85px' }}
                  >
                    <button
                      className="btn btn-sm btn-outline-success mt-1"
                      onClick={() => handleSaveSingle(item.originalIndex)}
                      disabled={!item.isEdited || isTranslatingAny}
                      title="Save ONLY this change to file"
                    >
                      <i className="bi bi-floppy me-1"></i>Save
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
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

      {/* Diff Modal with Live Edit */}
      {compareItemData && (
        <div
          className="modal show d-block"
          tabIndex="-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1050 }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg">
            <div className="modal-content bg-body text-body shadow-lg border-0">
              <div className="modal-header bg-body-tertiary">
                <h5 className="modal-title fw-bold">Comparing: {compareItemData.path}</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setCompareItemIndex(-1)}
                ></button>
              </div>
              <div className="modal-body row g-3">
                <div className="col-6">
                  <label className="form-label fw-bold text-danger">Original Version</label>
                  <textarea
                    className="form-control bg-danger-subtle text-danger"
                    rows="5"
                    readOnly
                    value={String(compareItemData.original)}
                  />
                </div>
                <div className="col-6">
                  <label className="form-label fw-bold text-success">Edited Version (Live)</label>
                  <textarea
                    className="form-control bg-success-subtle text-success border-success"
                    rows="5"
                    value={
                      compareItemData.isString
                        ? compareItemData.value
                        : String(compareItemData.value)
                    }
                    onChange={(e) => {
                      let val = e.target.value;
                      if (!compareItemData.isString) {
                        if (val === 'true') val = true;
                        if (val === 'false') val = false;
                        if (val === 'null') val = null;
                        if (!isNaN(val) && val !== '') val = Number(val);
                      }
                      handleValueChange(compareItemIndex, val);
                    }}
                  />
                </div>
              </div>
              <div className="modal-footer border-0">
                <button
                  type="button"
                  className="btn btn-success fw-bold me-auto"
                  onClick={() => {
                    handleSaveSingle(compareItemIndex);
                    setCompareItemIndex(-1);
                  }}
                  disabled={!compareItemData.isEdited}
                  title="Save ONLY this change to file"
                >
                  <i className="bi bi-floppy me-1"></i>Save Value
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => setCompareItemIndex(-1)}
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
