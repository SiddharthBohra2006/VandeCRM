import { CSSProperties, useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface CustomSelectProps {
  options: (SelectOption | string)[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  name?: string;
  id?: string;
  searchable?: boolean;
  'aria-label'?: string;
}

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  style,
  name,
  id,
  searchable = false,
  'aria-label': ariaLabel,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const normalizedOptions: SelectOption[] = options.map(opt =>
    typeof opt === 'string' ? { value: opt, label: opt } : opt
  );

  const selectedOption = normalizedOptions.find(opt => opt.value === value);

  const filteredOptions = searchable && search.trim()
    ? normalizedOptions.filter(opt =>
        opt.label.toLowerCase().includes(search.toLowerCase()) ||
        opt.value.toLowerCase().includes(search.toLowerCase())
      )
    : normalizedOptions;

  // Toggle & detect opening direction
  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const roomBelow = window.innerHeight - rect.bottom - 12;
        const roomAbove = rect.top - 12;
        setOpensUp(roomBelow < 220 && roomAbove > roomBelow);
      }
      setIsOpen(true);
      setSearch('');
      const currentIdx = normalizedOptions.findIndex(opt => opt.value === value);
      setFocusedIndex(currentIdx >= 0 ? currentIdx : 0);
      if (searchable) {
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    } else {
      setIsOpen(false);
    }
  };

  const handleSelect = (optionValue: string, optionDisabled?: boolean) => {
    if (optionDisabled) return;
    onChange(optionValue);
    setIsOpen(false);
    setSearch('');
  };

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Keyboard navigation
  const handleButtonKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        handleToggle();
      } else if (e.key === 'ArrowDown') {
        setFocusedIndex(prev => (prev + 1 < filteredOptions.length ? prev + 1 : 0));
      } else if (e.key === 'ArrowUp') {
        setFocusedIndex(prev => (prev - 1 >= 0 ? prev - 1 : filteredOptions.length - 1));
      } else if (e.key === 'Enter' && focusedIndex >= 0 && filteredOptions[focusedIndex]) {
        handleSelect(filteredOptions[focusedIndex].value, filteredOptions[focusedIndex].disabled);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`app-select ${isOpen ? 'is-open' : ''} ${opensUp ? 'opens-up' : ''} ${className}`.trim()}
      style={style}
    >
      {/* Hidden native input for form compatibility */}
      {name && <input type="hidden" name={name} value={value} id={id} />}

      <button
        type="button"
        className="app-select-button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleButtonKeyDown}
      >
        <span className="app-select-value">
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="app-select-caret" aria-hidden="true" />
      </button>

      {isOpen && (
        <div
          ref={menuRef}
          className="app-select-menu"
          role="listbox"
          tabIndex={-1}
          onWheel={e => e.stopPropagation()}
        >
          {searchable && (
            <div style={{ padding: '4px 6px', borderBottom: '1px solid var(--border)', marginBottom: '4px' }}>
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                placeholder="Search..."
                onChange={e => {
                  setSearch(e.target.value);
                  setFocusedIndex(0);
                }}
                onClick={e => e.stopPropagation()}
                style={{
                  width: '100%',
                  height: '30px',
                  padding: '0 8px',
                  fontSize: '0.78rem',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                  background: 'var(--bg)',
                  color: 'var(--text)',
                }}
              />
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: '0.78rem', color: 'var(--muted)', textAlign: 'center' }}>
              No options found
            </div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isFocused = idx === focusedIndex;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  disabled={opt.disabled}
                  className={`app-select-option ${isSelected ? 'is-selected' : ''} ${isFocused ? 'is-focused' : ''}`.trim()}
                  onClick={() => handleSelect(opt.value, opt.disabled)}
                  onMouseEnter={() => setFocusedIndex(idx)}
                >
                  {opt.label}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
