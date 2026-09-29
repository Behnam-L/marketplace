import type { ButtonHTMLAttributes, ReactNode } from 'react';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'filled' | 'tonal' | 'outline' | 'text' | 'danger';
  size?: 'md' | 'sm';
  block?: boolean;
  pending?: boolean;
  children: ReactNode;
}

/** Bon button recipe (§4.1). `pending` disables repeat activation and announces progress. */
export function Button({ variant = 'filled', size = 'md', block, pending, disabled, children, className, type = 'button', ...rest }: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, size === 'sm' ? 'btn--sm' : '', block ? 'btn--block' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled || pending} aria-busy={pending || undefined} {...rest}>
      {pending && <span className="spinner" aria-hidden="true" />}
      <span>{children}</span>
    </button>
  );
}
