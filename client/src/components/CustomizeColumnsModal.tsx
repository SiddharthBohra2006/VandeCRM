import React, { useState, useEffect } from 'react';
import Icon from './Icons';

export interface ColumnDefinition {
  key: string;
  label: string;
  icon?: string;
  defaultVisible?: boolean;
}

interface CustomizeColumnsModalProps {
  isOpen: boolean;
  onClose: () => void;
  columns: ColumnDefinition[];
  columnOrder: string[];
  visibleColumns: Record<string, boolean>;
  onSave: (order: string[], visible: Record<string, boolean>) => void;
  entityName?: string;
  sampleRows?: Array<Record<string, string>>;
}

const DEFAULT_SAMPLE_ROWS: Array<Record<string, string>> = [
  {
    name: 'Rohan Das',
    phone: '+91 98765 56789',
    email: 'rohan.das@example.com',
    course: 'My Daam cool company',
    source: 'Website',
    stage: 'Qualified',
    priority: 'High',
    value: '₹ 45,000',
    followup: 'Tomorrow, 10:00 AM',
    lastActivity: '10m ago',
    labels: 'Hot · VIP',
    actions: '⋮'
  },
  {
    name: 'Ananya Iyer',
    phone: '+91 98765 99001',
    email: 'ananya.iyer@example.com',
    course: 'My Daam cool company',
    source: 'Instagram Ad',
    stage: 'Contacted',
    priority: 'Medium',
    value: '₹ 30,000',
    followup: 'In 3 days',
    lastActivity: '2h ago',
    labels: 'Prospect',
    actions: '⋮'
  }
];

export const CustomizeColumnsModal: React.FC<CustomizeColumnsModalProps> = ({
  isOpen,
  onClose,
  columns,
  columnOrder,
  visibleColumns,
  onSave,
  entityName = 'customers',
  sampleRows = DEFAULT_SAMPLE_ROWS
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [editOrder, setEditOrder] = useState<string[]>(columnOrder);
  const [editVisible, setEditVisible] = useState<Record<string, boolean>>(visibleColumns);
  const [draggedKey, setDraggedKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEditOrder(columnOrder);
      setEditVisible(visibleColumns);
      setSearchTerm('');
    }
  }, [isOpen, columnOrder, visibleColumns]);

  if (!isOpen) return null;

  // Compute available and selected columns
  const filteredColumns = columns.filter(col =>
    col.label.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedKeys = editOrder.filter(key => editVisible[key]);

  const toggleColumn = (key: string) => {
    setEditVisible(prev => {
      const next = { ...prev, [key]: !prev[key] };
      // If toggled ON and not in order list, append it
      if (next[key] && !editOrder.includes(key)) {
        setEditOrder(o => [...o, key]);
      }
      return next;
    });
  };

  const handleResetToDefault = () => {
    const defaultVisible: Record<string, boolean> = {};
    const defaultOrd: string[] = [];
    columns.forEach(col => {
      const isVis = col.defaultVisible !== false;
      defaultVisible[col.key] = isVis;
      defaultOrd.push(col.key);
    });
    setEditVisible(defaultVisible);
    setEditOrder(defaultOrd);
  };

  const handleSave = () => {
    onSave(editOrder, editVisible);
    onClose();
  };

  // Drag and drop for selected columns
  const handleDragStart = (key: string) => (e: React.DragEvent) => {
    if (window.getSelection) {
      window.getSelection()?.removeAllRanges();
    }
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', key);
    setDraggedKey(key);
  };

  const handleDragOver = (key: string) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverKey !== key) {
      setDragOverKey(key);
    }
  };

  const handleDrop = (targetKey: string) => (e: React.DragEvent) => {
    e.preventDefault();
    const sourceKey = draggedKey || e.dataTransfer.getData('text/plain');
    if (!sourceKey || sourceKey === targetKey) {
      setDraggedKey(null);
      setDragOverKey(null);
      return;
    }

    const currentSelected = [...selectedKeys];
    const fromIndex = currentSelected.indexOf(sourceKey);
    const toIndex = currentSelected.indexOf(targetKey);

    if (fromIndex !== -1 && toIndex !== -1) {
      currentSelected.splice(fromIndex, 1);
      currentSelected.splice(toIndex, 0, sourceKey);

      // Reconstruct total editOrder preserving unselected relative positions
      const unselected = editOrder.filter(k => !editVisible[k]);
      setEditOrder([...currentSelected, ...unselected]);
    }

    setDraggedKey(null);
    setDragOverKey(null);
  };

  return (
    <div
      id="colsModalOverlay"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100050
      }}
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="cols-modal-box">
        {/* Header */}
        <div className="cols-modal-header">
          <div className="cols-modal-header-left">
            <div className="cols-modal-header-icon">
              <Icon name="layout-grid" size={20} />
            </div>
            <div className="cols-modal-header-text">
              <h3>Customize Columns</h3>
              <p>Drag columns to reorder them. Toggle the switches to show or hide columns in the table.</p>
            </div>
          </div>
          <button type="button" className="cols-modal-close-btn" aria-label="Close modal" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>

        {/* Body: 2 Columns */}
        <div className="cols-modal-body">
          {/* Left Panel: Available Columns */}
          <div className="cols-available-panel">
            <div className="cols-panel-title-row">
              <span>Available columns</span>
              <span className="cols-badge-count">{columns.length}</span>
            </div>
            <div className="cols-search-wrap">
              <Icon name="search" size={14} className="cols-search-icon" />
              <input
                type="text"
                className="cols-search-input"
                placeholder="Search columns..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="cols-available-list">
              {filteredColumns.map(col => {
                const isChecked = Boolean(editVisible[col.key]);
                return (
                  <div className="cols-available-item" key={col.key}>
                    <div className="cols-available-item-info">
                      <Icon name={col.icon || 'columns-3'} size={14} />
                      <span>{col.label}</span>
                    </div>
                    <label className="cols-switch">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleColumn(col.key)}
                      />
                      <span className="cols-switch-slider"></span>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Panel: Selected & Live Table Preview */}
          <div className="cols-main-panel">
            {/* Tip Banner */}
            <div className="cols-tip-banner">
              <Icon name="lightbulb" size={15} />
              <span>
                <strong>Tip:</strong> Drag the columns below to reorder them. The order you set here will be used in the {entityName} table.
              </span>
            </div>

            {/* Selected Columns Row */}
            <div>
              <div className="cols-selected-header">
                <div className="cols-panel-title-row" style={{ marginBottom: '0.4rem' }}>
                  <span>Selected columns</span>
                  <span className="cols-badge-count">{selectedKeys.length}</span>
                </div>
                <button type="button" className="cols-reset-default-btn" onClick={handleResetToDefault}>
                  <Icon name="rotate-ccw" size={11} />
                  <span>Reset to default</span>
                </button>
              </div>

              <div className="cols-selected-cards-row">
                {selectedKeys.map(key => {
                  const col = columns.find(c => c.key === key);
                  if (!col) return null;
                  return (
                    <div
                      key={key}
                      className={`cols-selected-card${draggedKey === key ? ' is-dragging' : ''}${dragOverKey === key ? ' is-drag-over' : ''}`}
                      draggable
                      onDragStart={handleDragStart(key)}
                      onDragOver={handleDragOver(key)}
                      onDrop={handleDrop(key)}
                      onDragEnd={() => {
                        setDraggedKey(null);
                        setDragOverKey(null);
                      }}
                    >
                      <span className="cols-selected-card-handle" style={{ cursor: 'grab' }}>
                        ⠿
                      </span>
                      <Icon name={col.icon || 'columns-3'} size={13} />
                      <span>{col.label}</span>
                      <span className="cols-selected-card-eye">
                        <Icon name="eye" size={12} />
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live Table Preview */}
            <div className="cols-preview-section">
              <div className="cols-preview-title">
                <Icon name="eye" size={14} />
                <span>LIVE TABLE PREVIEW</span>
              </div>
              <div className="cols-preview-table-card">
                <table className="cols-preview-table">
                  <thead>
                    <tr>
                      {selectedKeys.map(key => {
                        const col = columns.find(c => c.key === key);
                        return (
                          <th key={key} style={{ textTransform: 'uppercase', fontSize: '0.68rem', fontWeight: 750, color: 'var(--muted)' }}>
                            {col?.label || key}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((row, idx) => (
                      <tr key={idx}>
                        {selectedKeys.map(key => {
                          const val = row[key] || (key === 'name' ? 'Sample Lead' : '—');
                          const isName = key === 'name';
                          return (
                            <td key={key} style={{ fontSize: '0.78rem', padding: '8px 12px' }}>
                              {isName ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                                  <span style={{ width: 22, height: 22, borderRadius: 4, background: '#e0f2fe', color: '#0369a1', fontSize: '0.65rem', display: 'grid', placeItems: 'center' }}>
                                    {val.slice(0, 2).toUpperCase()}
                                  </span>
                                  <span>{val}</span>
                                </div>
                              ) : (
                                <span>{val}</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="cols-modal-footer">
          <button type="button" className="cols-footer-btn-reset" onClick={handleResetToDefault}>
            <Icon name="rotate-ccw" size={13} />
            <span>Reset</span>
          </button>
          <div className="cols-footer-right-actions">
            <button type="button" className="cols-footer-btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="cols-footer-btn-save" onClick={handleSave}>
              <Icon name="check" size={14} />
              <span>Save Layout</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomizeColumnsModal;
