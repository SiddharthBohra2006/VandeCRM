import React, { CSSProperties, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface DatePickerProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  name?: string;
  id?: string;
  min?: string;
  max?: string;
  mode?: 'date' | 'month';
  'aria-label'?: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toISOMonth = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const parseISODate = (val?: string): Date | null => {
  const match = String(val || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const parseISOMonth = (val?: string): Date | null => {
  const match = String(val || '').match(/^(\d{4})-(\d{2})/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, 1);
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export default function DatePicker({
  value = '',
  onChange,
  placeholder,
  disabled = false,
  className = '',
  style,
  name,
  id,
  min,
  max,
  mode = 'date',
  'aria-label': ariaLabel,
}: DatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'day' | 'month' | 'year'>(mode === 'month' ? 'month' : 'day');
  const [viewDate, setViewDate] = useState<Date>(() => {
    const parsed = mode === 'month' ? parseISOMonth(value) : parseISODate(value);
    return parsed || new Date();
  });

  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  const selectedDate = mode === 'month' ? parseISOMonth(value) : parseISODate(value);

  // Reposition picker relative to trigger
  const updatePosition = () => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    const gap = 8;
    const pickerWidth = 290;
    const pickerHeight = 330;

    let top = rect.bottom + gap;
    if (top + pickerHeight > window.innerHeight - gap) {
      top = Math.max(gap, rect.top - pickerHeight - gap);
    }

    let left = rect.left;
    if (left + pickerWidth > window.innerWidth - gap) {
      left = Math.max(gap, window.innerWidth - pickerWidth - gap);
    }

    setPosition({ top, left });
  };

  const handleOpen = () => {
    if (disabled) return;
    const initial = mode === 'month' ? (parseISOMonth(value) || new Date()) : (parseISODate(value) || new Date());
    setViewDate(initial);
    setPickerMode(mode === 'month' ? 'month' : 'day');
    setIsOpen(true);
  };

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const onScrollOrResize = () => updatePosition();
      window.addEventListener('resize', onScrollOrResize);
      window.addEventListener('scroll', onScrollOrResize, true);
      return () => {
        window.removeEventListener('resize', onScrollOrResize);
        window.removeEventListener('scroll', onScrollOrResize, true);
      };
    }
  }, [isOpen]);

  // Click outside and escape key handling
  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (
        wrapperRef.current?.contains(e.target as Node) ||
        pickerRef.current?.contains(e.target as Node)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const selectDate = (date: Date) => {
    const formatted = mode === 'month' ? toISOMonth(date) : toISODate(date);
    onChange?.(formatted);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange?.('');
    setIsOpen(false);
  };

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const changeMonth = (offset: number) => {
    setViewDate(new Date(year, month + offset, 1));
  };

  const changeYear = (offset: number) => {
    setViewDate(new Date(year + offset, month, 1));
  };

  // 42-day calendar generation
  const renderDaysGrid = () => {
    const firstDayOfMonth = new Date(year, month, 1);
    const startOffset = firstDayOfMonth.getDay();
    const startDate = new Date(year, month, 1 - startOffset);

    const todayStr = toISODate(new Date());
    const selectedStr = selectedDate ? toISODate(selectedDate) : '';

    const dayButtons = [];
    for (let i = 0; i < 42; i++) {
      const day = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i);
      const isCurrentMonth = day.getMonth() === month;
      const dayStr = toISODate(day);
      const isToday = dayStr === todayStr;
      const isSelected = selectedStr === dayStr;

      dayButtons.push(
        <button
          key={dayStr + i}
          type="button"
          className={`app-date-picker-day ${isCurrentMonth ? '' : 'is-muted'} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}`.trim()}
          onClick={() => selectDate(day)}
        >
          {day.getDate()}
        </button>
      );
    }

    return (
      <>
        <div className="app-date-picker-grid">
          {WEEKDAYS.map(w => (
            <div key={w} className="app-date-picker-weekday">{w}</div>
          ))}
          {dayButtons}
        </div>
        <div className="app-date-picker-foot">
          <button type="button" onClick={handleClear}>Clear</button>
          <button type="button" onClick={() => selectDate(new Date())}>Today</button>
        </div>
      </>
    );
  };

  // 12-month grid
  const renderMonthGrid = () => {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().getMonth();

    return (
      <>
        <div className="app-date-picker-month-grid">
          {MONTH_NAMES.map((name, i) => {
            const isSelected = selectedDate && selectedDate.getFullYear() === year && selectedDate.getMonth() === i;
            const isCurrent = currentYear === year && currentMonth === i;
            return (
              <button
                key={name}
                type="button"
                className={`app-date-picker-month ${isSelected ? 'is-selected' : ''} ${isCurrent && !isSelected ? 'is-today' : ''}`.trim()}
                onClick={() => {
                  const newDate = new Date(year, i, 1);
                  setViewDate(newDate);
                  if (mode === 'month') {
                    selectDate(newDate);
                  } else {
                    setPickerMode('day');
                  }
                }}
              >
                {name.slice(0, 3)}
              </button>
            );
          })}
        </div>
        <div className="app-date-picker-foot">
          <button type="button" onClick={handleClear}>Clear</button>
          <button type="button" onClick={() => selectDate(new Date())}>
            {mode === 'month' ? 'This month' : 'Today'}
          </button>
        </div>
      </>
    );
  };

  // 12-year grid
  const renderYearGrid = () => {
    const startYear = Math.floor(year / 12) * 12;
    const currentYear = new Date().getFullYear();
    const selectedYear = selectedDate?.getFullYear();

    const years = [];
    for (let i = 0; i < 12; i++) {
      const y = startYear + i;
      const isSelected = selectedYear === y;
      const isCurrent = currentYear === y;
      years.push(
        <button
          key={y}
          type="button"
          className={`app-date-picker-year ${isSelected ? 'is-selected' : ''} ${isCurrent && !isSelected ? 'is-today' : ''}`.trim()}
          onClick={() => {
            setViewDate(new Date(y, month, 1));
            setPickerMode('month');
          }}
        >
          {y}
        </button>
      );
    }

    return (
      <div className="app-date-picker-year-grid">
        {years}
      </div>
    );
  };

  return (
    <>
      <span
        ref={wrapperRef}
        className={`date-input-wrap ${className}`.trim()}
        style={style}
        onClick={handleOpen}
      >
        <input
          ref={inputRef}
          type="text"
          readOnly
          disabled={disabled}
          value={value}
          placeholder={placeholder || (mode === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD')}
          className={isOpen ? 'is-date-picker-open' : ''}
          name={name}
          id={id}
          aria-label={ariaLabel}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpen();
            }
          }}
        />
      </span>

      {isOpen &&
        createPortal(
          <div
            ref={pickerRef}
            className="app-date-picker"
            style={{
              top: `${position.top}px`,
              left: `${position.left}px`,
            }}
            onClick={e => e.stopPropagation()}
            onMouseDown={e => e.stopPropagation()}
          >
            {pickerMode === 'day' && (
              <>
                <div className="app-date-picker-head">
                  <button
                    type="button"
                    className="app-date-picker-title is-clickable"
                    onClick={() => setPickerMode('month')}
                  >
                    {MONTH_NAMES[month]} {year}
                  </button>
                  <div className="app-date-picker-nav">
                    <button type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">
                      &lsaquo;
                    </button>
                    <button type="button" onClick={() => changeMonth(1)} aria-label="Next month">
                      &rsaquo;
                    </button>
                  </div>
                </div>
                {renderDaysGrid()}
              </>
            )}

            {pickerMode === 'month' && (
              <>
                <div className="app-date-picker-head">
                  <button
                    type="button"
                    className="app-date-picker-title is-clickable"
                    onClick={() => setPickerMode('year')}
                  >
                    {year}
                  </button>
                  <div className="app-date-picker-nav">
                    <button type="button" onClick={() => changeYear(-1)} aria-label="Previous year">
                      &lsaquo;
                    </button>
                    <button type="button" onClick={() => changeYear(1)} aria-label="Next year">
                      &rsaquo;
                    </button>
                  </div>
                </div>
                {renderMonthGrid()}
              </>
            )}

            {pickerMode === 'year' && (
              <>
                <div className="app-date-picker-head">
                  <div className="app-date-picker-title">
                    {Math.floor(year / 12) * 12} – {Math.floor(year / 12) * 12 + 11}
                  </div>
                  <div className="app-date-picker-nav">
                    <button type="button" onClick={() => changeYear(-12)} aria-label="Previous years">
                      &lsaquo;
                    </button>
                    <button type="button" onClick={() => changeYear(12)} aria-label="Next years">
                      &rsaquo;
                    </button>
                  </div>
                </div>
                {renderYearGrid()}
              </>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
