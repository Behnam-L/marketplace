import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

interface Common {
  label: ReactNode;
  help?: ReactNode;
  error?: string | null;
}

function describedBy(id: string, help?: ReactNode, error?: string | null): string | undefined {
  const ids = [help ? `${id}-help` : '', error ? `${id}-err` : ''].filter(Boolean);
  return ids.length ? ids.join(' ') : undefined;
}

function Tail({ id, help, error }: { id: string; help?: ReactNode; error?: string | null }) {
  return (
    <>
      {help && (
        <span id={`${id}-help`} className="field__help">
          {help}
        </span>
      )}
      {error && (
        <span id={`${id}-err`} className="field__error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}

export function TextField({ label, help, error, dir, ...rest }: Common & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <input id={id} className="field__control" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, help, error)} dir={dir} {...rest} />
      <Tail id={id} help={help} error={error} />
    </div>
  );
}

export function TextArea({ label, help, error, ...rest }: Common & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <textarea id={id} className="field__control" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, help, error)} {...rest} />
      <Tail id={id} help={help} error={error} />
    </div>
  );
}

export function SelectField({ label, help, error, options, placeholder, ...rest }: Common & SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[]; placeholder?: string }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <select id={id} className="field__control" aria-invalid={error ? true : undefined} aria-describedby={describedBy(id, help, error)} {...rest}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Tail id={id} help={help} error={error} />
    </div>
  );
}

export function Checkbox({ label, error, ...rest }: { label: ReactNode; error?: string | null } & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  return (
    <div className="field">
      <label className="check" htmlFor={id}>
        <input id={id} type="checkbox" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} {...rest} />
        <span>{label}</span>
      </label>
      {error && (
        <span id={`${id}-err`} className="field__error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
