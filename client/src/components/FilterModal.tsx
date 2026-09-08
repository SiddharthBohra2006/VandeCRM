import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Filter, X, RotateCcw } from 'lucide-react';
import CustomSelect, { SelectOption } from './CustomSelect';
import DatePicker from './DatePicker';

export interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  recordType?: string; // 'leads' | 'clients'
  // Initial values
  labelValue: string;
  campaignValue: string;
  sortByValue: string;
  dateFromValue: string;
  dateToValue: string;
  // Options
  labelOptions: (SelectOption | string)[];
  campaignOptions: (SelectOption | string)[];
  sortOptions?: (SelectOption | string)[];
  // Callbacks
  onApply: (filters: {
    label: string;
    campaign: string;
    sortBy: string;
    dateFrom: string;
    dateTo: string;
  }) => void;
  onClear: () => void;
}

export default function FilterModal({
  isOpen,
  onClose,
  title = 'Filter leads',
  subtitle = 'Narrow this workspace to find the right leads',
  recordType = 'leads',
  labelValue,
  campaignValue,
  sortByValue,
  dateFromValue,
  dateToValue,
  labelOptions,
  campaignOptions,
  sortOptions = [
    { value: 'recent', label: 'Recently Updated' },
    { value: 'old', label: `Oldest ${recordType}` },
    { value: 'highest-value', label: 'Highest Value' },
    { value: 'lowest-value', label: 'Lowest Value' },
    { value: 'name', label: `${recordType === 'clients' ? 'Client' : 'Lead'} name` },
  ],
  onApply,
  onClear,
}: FilterModalProps) {
  const [draftLabel, setDraftLabel] = useState(labelValue);
  const [draftCampaign, setDraftCampaign] = useState(campaignValue);
  const [draftSortBy, setDraftSortBy] = useState(sortByValue || 'recent');
  const [draftDateFrom, setDraftDateFrom] = useState(dateFromValue);
  const [draftDateTo, setDraftDateTo] = useState(dateToValue);

  // Sync draft state when modal opens
  useEffect(() => {
    if (isOpen) {
      setDraftLabel(labelValue || '');
      setDraftCampaign(campaignValue || '');
      setDraftSortBy(sortByValue || 'recent');
      setDraftDateFrom(dateFromValue || '');
      setDraftDateTo(dateToValue || '');
    }
  }, [isOpen, labelValue, campaignValue, sortByValue, dateFromValue, dateToValue]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleApply = () => {
    onApply({
      label: draftLabel,
      campaign: draftCampaign,
      sortBy: draftSortBy,
      dateFrom: draftDateFrom,
      dateTo: draftDateTo,
    });
    onClose();
  };

  const handleClearAll = () => {
    setDraftLabel('');
    setDraftCampaign('');
    setDraftSortBy('recent');
    setDraftDateFrom('');
    setDraftDateTo('');
    onClear();
    onClose();
  };

  return createPortal(
    <div
      className="filter-modal-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="filter-modal-title"
    >
      <div className="filter-modal-card">
        {/* Header */}
        <div className="filter-modal-header">
          <div className="filter-modal-header-left">
            <div className="filter-modal-icon-badge">
              <Filter size={20} />
            </div>
            <div className="filter-modal-titles">
              <h2 id="filter-modal-title" className="filter-modal-title">{title}</h2>
              <p className="filter-modal-subtitle">{subtitle}</p>
            </div>
          </div>
          <button
            type="button"
            className="filter-modal-close-btn"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body Fields (2 Column Grid) */}
        <div className="filter-modal-body">
          <div className="filter-modal-grid">
            {/* Field: Label */}
            <div className="filter-modal-field">
              <label className="filter-modal-label">Label</label>
              <CustomSelect
                value={draftLabel}
                onChange={setDraftLabel}
                placeholder="All labels"
                options={labelOptions}
                searchable={labelOptions.length > 6}
              />
            </div>

            {/* Field: Campaign */}
            <div className="filter-modal-field">
              <label className="filter-modal-label">Campaign</label>
              <CustomSelect
                value={draftCampaign}
                onChange={setDraftCampaign}
                placeholder="All Campaigns"
                options={campaignOptions}
                searchable={campaignOptions.length > 6}
              />
            </div>

            {/* Field: Sort by */}
            <div className="filter-modal-field">
              <label className="filter-modal-label">Sort by</label>
              <CustomSelect
                value={draftSortBy}
                onChange={setDraftSortBy}
                options={sortOptions}
              />
            </div>

            {/* Field: Date range */}
            <div className="filter-modal-field">
              <label className="filter-modal-label">Date range</label>
              <div className="filter-modal-date-range">
                <DatePicker
                  aria-label="From date"
                  placeholder="From date"
                  value={draftDateFrom}
                  onChange={setDraftDateFrom}
                />
                <span className="filter-modal-date-separator">—</span>
                <DatePicker
                  aria-label="To date"
                  placeholder="To date"
                  value={draftDateTo}
                  onChange={setDraftDateTo}
                />
              </div>
              <span className="filter-modal-help-text">
                Select a date range to filter {recordType}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="filter-modal-footer">
          <button
            type="button"
            className="btn secondary outline filter-modal-clear-btn"
            onClick={handleClearAll}
          >
            <RotateCcw size={14} />
            <span>Clear all</span>
          </button>

          <div className="filter-modal-actions">
            <button
              type="button"
              className="btn secondary outline"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn primary filter-modal-apply-btn"
              onClick={handleApply}
            >
              Apply filters
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
