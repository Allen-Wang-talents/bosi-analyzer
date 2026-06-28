// =====================================================
// 基础 UI 组件
// =====================================================
import { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode, HTMLAttributes, ButtonHTMLAttributes, TextareaHTMLAttributes, InputHTMLAttributes } from 'react';

export function cn(...inputs: Array<string | undefined | null | false>): string {
  return twMerge(clsx(inputs));
}

// =====================================================
// Card
// =====================================================
type CardProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'glass';
};

export function Card({ children, className, variant = 'default', ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border shadow-card transition-all duration-200',
        variant === 'default' && 'bg-bg-card border-border',
        variant === 'elevated' && 'bg-bg-elevated border-border-strong shadow-glow',
        variant === 'glass' && 'glass border-border',
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

type CardHeaderProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function CardHeader({ title, subtitle, icon, badge, actions, className }: CardHeaderProps) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-6 pt-5 pb-3', className)}>
      <div className="flex items-start gap-3 min-w-0 flex-1">
        {icon && (
          <div className="shrink-0 w-9 h-9 rounded-lg bg-accent-goldGlow flex items-center justify-center text-accent-gold">
            {icon}
          </div>
        )}
        <div className="min-w-0 flex-1">
          {title && (
            <h3 className="text-base font-semibold text-fg leading-tight">{title}</h3>
          )}
          {subtitle && (
            <p className="text-xs text-fg-muted mt-1 leading-relaxed">{subtitle}</p>
          )}
        </div>
      </div>
      {(badge || actions) && (
        <div className="flex items-center gap-2 shrink-0">
          {badge}
          {actions}
        </div>
      )}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-6 pb-6', className)}>{children}</div>;
}

// =====================================================
// Button
// =====================================================
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading,
  leftIcon,
  rightIcon,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-gold/50';

  const variants = {
    primary: 'bg-gold-gradient text-bg-base shadow-glow hover:shadow-lg active:scale-[0.98]',
    secondary: 'bg-bg-elevated text-fg border border-border hover:border-border-strong hover:bg-bg-card',
    ghost: 'text-fg-muted hover:text-fg hover:bg-bg-elevated',
    danger: 'bg-status-red/20 text-status-red border border-status-red/30 hover:bg-status-red/30',
  };

  const sizes = {
    sm: 'h-8 px-3 text-xs',
    md: 'h-10 px-4 text-sm',
    lg: 'h-12 px-6 text-base',
  };

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? (
        <span className="inline-block w-4 h-4 border-2 border-current border-r-transparent rounded-full animate-spin" />
      ) : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

// =====================================================
// Input
// =====================================================
type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  error?: string;
  hint?: string;
};

export function Input({ label, error, hint, className, ...rest }: InputProps) {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-fg-muted mb-1.5">{label}</label>
      )}
      <input
        className={cn(
          'w-full h-10 px-3 text-sm bg-bg-input text-fg border border-border rounded-lg',
          'placeholder:text-fg-subtle',
          'focus:outline-none focus:border-accent-gold/50 focus:ring-1 focus:ring-accent-gold/30',
          'transition-all duration-150',
          error && 'border-status-red/50 focus:border-status-red',
          className
        )}
        {...rest}
      />
      {hint && !error && <p className="text-xs text-fg-subtle mt-1">{hint}</p>}
      {error && <p className="text-xs text-status-red mt-1">{error}</p>}
    </div>
  );
}

// =====================================================
// TextArea
// =====================================================
type TextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  error?: string;
  hint?: string;
  showCharCount?: boolean;
};

export function TextArea({ label, error, hint, showCharCount, className, value, maxLength, ...rest }: TextAreaProps) {
  const charCount = typeof value === 'string' ? value.length : 0;

  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-fg-muted mb-1.5">{label}</label>
      )}
      <textarea
        className={cn(
          'w-full px-3 py-2.5 text-sm bg-bg-input text-fg border border-border rounded-lg resize-y',
          'placeholder:text-fg-subtle',
          'focus:outline-none focus:border-accent-gold/50 focus:ring-1 focus:ring-accent-gold/30',
          'transition-all duration-150 leading-relaxed',
          error && 'border-status-red/50 focus:border-status-red',
          className
        )}
        value={value}
        maxLength={maxLength}
        {...rest}
      />
      <div className="flex items-center justify-between mt-1">
        <div className="flex-1">
          {hint && !error && <p className="text-xs text-fg-subtle">{hint}</p>}
          {error && <p className="text-xs text-status-red">{error}</p>}
        </div>
        {showCharCount && (
          <p className={cn('text-xs text-fg-subtle tabular-nums', charCount > (maxLength ?? Infinity) * 0.9 && 'text-status-yellow')}>
            {charCount}{maxLength ? `/${maxLength}` : ''}
          </p>
        )}
      </div>
    </div>
  );
}

// =====================================================
// Badge
// =====================================================
type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  children: ReactNode;
  color?: 'gold' | 'red' | 'green' | 'yellow' | 'gray' | 'blue';
  variant?: 'solid' | 'soft' | 'outline';
};

export function Badge({ children, color = 'gold', variant = 'soft', className, ...rest }: BadgeProps) {
  const colors = {
    gold: { solid: 'bg-accent-gold text-bg-base', soft: 'bg-accent-gold/15 text-accent-gold', outline: 'border border-accent-gold/30 text-accent-gold' },
    red: { solid: 'bg-status-red text-white', soft: 'bg-status-red/15 text-status-red', outline: 'border border-status-red/30 text-status-red' },
    green: { solid: 'bg-status-green text-white', soft: 'bg-status-green/15 text-status-green', outline: 'border border-status-green/30 text-status-green' },
    yellow: { solid: 'bg-status-yellow text-bg-base', soft: 'bg-status-yellow/15 text-status-yellow', outline: 'border border-status-yellow/30 text-status-yellow' },
    gray: { solid: 'bg-status-gray text-white', soft: 'bg-status-gray/15 text-status-gray', outline: 'border border-status-gray/30 text-status-gray' },
    blue: { solid: 'bg-blue-500 text-white', soft: 'bg-blue-500/15 text-blue-400', outline: 'border border-blue-500/30 text-blue-400' },
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md whitespace-nowrap',
        colors[color][variant],
        className
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

// =====================================================
// EmptyState
// =====================================================
type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      {icon && (
        <div className="w-12 h-12 rounded-full bg-bg-elevated flex items-center justify-center text-fg-muted mb-3">
          {icon}
        </div>
      )}
      <h4 className="text-sm font-medium text-fg">{title}</h4>
      {description && <p className="text-xs text-fg-muted mt-1.5 max-w-xs">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// =====================================================
// Select - 自定义下拉 (避免 native select 在 dark theme 下点不开)
// =====================================================
export type SelectOption = { value: string; label: string };

type SelectProps = {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  className?: string;
};

export function Select({ label, value, onChange, options, placeholder = '请选择', error, className }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = options.find((o) => o.value === value);
  const display = selected?.label ?? '';

  return (
    <div className={cn('w-full', className)} ref={ref}>
      {label && (
        <label className="block text-xs font-medium text-fg-muted mb-1.5">{label}</label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            'w-full h-10 px-3 text-sm bg-bg-input text-left rounded-lg border transition-all duration-150',
            'flex items-center justify-between gap-2',
            'focus:outline-none focus:border-accent-gold/50 focus:ring-1 focus:ring-accent-gold/30',
            open ? 'border-accent-gold/50 ring-1 ring-accent-gold/30' : 'border-border hover:border-border-strong',
            !display && 'text-fg-subtle',
            error && 'border-status-red/50',
          )}
        >
          <span className="truncate">{display || placeholder}</span>
          <ChevronDown className={cn('w-4 h-4 shrink-0 text-fg-muted transition-transform', open && 'rotate-180 text-accent-gold')} />
        </button>

        {open && (
          <div
            role="listbox"
            className={cn(
              'absolute z-50 left-0 right-0 top-full mt-1.5',
              'max-h-72 overflow-y-auto rounded-lg',
              'bg-bg-elevated border border-border-strong shadow-2xl',
              'py-1',
            )}
          >
            {options.map((opt) => {
              const active = opt.value === value;
              return (
                <button
                  key={opt.value || '__empty__'}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-sm text-left flex items-center justify-between gap-2',
                    'transition-colors',
                    active
                      ? 'bg-accent-gold/15 text-accent-gold'
                      : 'text-fg hover:bg-bg-card',
                  )}
                >
                  <span className="truncate">{opt.label || placeholder}</span>
                  {active && <Check className="w-3.5 h-3.5 shrink-0 text-accent-gold" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {error && <p className="text-xs text-status-red mt-1">{error}</p>}
    </div>
  );
}