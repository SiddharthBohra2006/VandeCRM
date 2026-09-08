import { CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';

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
  buttonStyle?: CSSProperties;
  buttonClassName?: string;
  menuStyle?: CSSProperties;
  variant?: 'default' | 'pill' | 'compact';
  name?: string;
  id?: string;
  searchable?: boolean;
  'aria-label'?: string;
  buttonRenderer?: (selected: SelectOption | undefined) => React.ReactNode;
}

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  disabled = false,
  className = '',
  style,
  buttonStyle,
  buttonClassName = '',
  menuStyle,
  variant = 'default',
  name,
  id,
  searchable = false,
  'aria-label': ariaLabel,
  buttonRenderer,
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ top?: number; bottom?: number; left: number; width: number } | null>(null);
  const [search, setSearch] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

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

  const updateMenuPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom - 12;
    const roomAbove = rect.top - 12;
    const shouldOpenUp = roomBelow < 180 && roomAbove > roomBelow;
    
    const minWidth = variant === 'pill' ? 175 : Math.max(rect.width, 160);
    let left = rect.left;
    if (left + minWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - minWidth - 12);
    }
    if (left < 12) left = 12;

    if (shouldOpenUp) {
      setMenuCoords({
        bottom: window.innerHeight - rect.top + 4,
        left,
        width: minWidth,
      });
      setOpensUp(true);
    } else {
      setMenuCoords({
        top: rect.bottom + 4,
        left,
        width: minWidth,
      });
      setOpensUp(false);
    }
  };

  // Toggle & detect opening direction
  const handleToggle = () => {
    if (disabled) return;
    if (!isOpen) {
      updateMenuPosition();
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

  // Keep position updated on scroll and window resize
  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handleScrollOrResize = () => {
      updateMenuPosition();
    };
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current && !containerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
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

  // Scroll focused option into view
  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionRefs.current[focusedIndex]) {
      optionRefs.current[focusedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, isOpen]);

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

  const variantClass = variant === 'pill' ? 'app-select-pill' : variant === 'compact' ? 'app-select-compact' : '';

  return (
    <div
      ref={containerRef}
      className={`app-select ${variantClass} ${isOpen ? 'is-open' : ''} ${opensUp ? 'opens-up' : ''} ${className}`.trim()}
      style={style}
    >
      {/* Hidden native input for form compatibility */}
      {name && <input type="hidden" name={name} value={value} id={id} />}

      <button
        ref={buttonRef}
        type="button"
        className={`app-select-button ${buttonClassName}`.trim()}
        style={buttonStyle}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={handleToggle}
        onKeyDown={handleButtonKeyDown}
      >
        {buttonRenderer ? (
          buttonRenderer(selectedOption)
        ) : (
          <>
            <span className={`app-select-value ${!selectedOption ? 'is-placeholder' : ''}`}>
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <span className="app-select-caret" aria-hidden="true">
              <ChevronDown size={variant === 'pill' ? 11 : 14} className="caret-icon" />
            </span>
          </>
        )}
      </button>

      {isOpen && menuCoords && createPortal(
        <div
          ref={menuRef}
          className={`app-select-menu ${variantClass} ${opensUp ? 'opens-up' : ''}`.trim()}
          style={{
            position: 'fixed',
            top: menuCoords.top !== undefined ? `${menuCoords.top}px` : 'auto',
            bottom: menuCoords.bottom !== undefined ? `${menuCoords.bottom}px` : 'auto',
            left: `${menuCoords.left}px`,
            right: 'auto',
            minWidth: `${menuCoords.width}px`,
            zIndex: 100200,
            ...menuStyle,
          }}
          role="listbox"
          tabIndex={-1}
          onWheel={e => e.stopPropagation()}
        >
          {searchable && (
            <div className="app-select-search-wrap">
              <Search size={13} className="app-select-search-icon" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                placeholder="Search options..."
                className="app-select-search-input"
                onChange={e => {
                  setSearch(e.target.value);
                  setFocusedIndex(0);
                }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          )}

          <div className="app-select-options-list">
            {filteredOptions.length === 0 ? (
              <div className="app-select-empty">
                No options found
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = opt.value === value;
                const isFocused = idx === focusedIndex;
                return (
                  <button
                    key={opt.value}
                    ref={el => (optionRefs.current[idx] = el)}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    className={`app-select-option ${isSelected ? 'is-selected' : ''} ${isFocused ? 'is-focused' : ''}`.trim()}
                    onClick={() => handleSelect(opt.value, opt.disabled)}
                    onMouseEnter={() => setFocusedIndex(idx)}
                  >
                    <span className="app-select-option-label">{opt.label}</span>
                    {isSelected && (
                      <Check size={14} className="app-select-option-check" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
