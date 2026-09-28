import type { JSX } from 'preact';
import { useRef } from 'preact/hooks';
import { cx } from '../utils';

export interface OptionItem {
  label: string;
  value: string | number;
  disabled?: boolean;
}

interface BaseControlProps<V> {
  id?: string;
  value: V;
  onChange: (value: V) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  placeholder?: string;
  class?: string;
}

/**
 * 输入法（IME）组合输入期间不触发 onChange，避免拼音中间态进入状态与撤销栈。
 */
function useComposition<V>(onChange: (value: V) => void, read: (el: HTMLInputElement | HTMLTextAreaElement) => V) {
  const composing = useRef(false);
  return {
    onCompositionStart: () => {
      composing.current = true;
    },
    onCompositionEnd: (event: JSX.TargetedCompositionEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      composing.current = false;
      onChange(read(event.currentTarget));
    },
    onInput: (event: JSX.TargetedEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!composing.current) onChange(read(event.currentTarget));
    },
  };
}

export interface InputProps extends BaseControlProps<string> {
  type?: 'text' | 'date' | 'search';
  maxLength?: number;
}

export function Input({ id, value, onChange, onFocus, onBlur, disabled, readOnly, invalid, placeholder, type = 'text', maxLength, class: className }: InputProps) {
  const handlers = useComposition(onChange, (el) => el.value);
  return (
    <input
      id={id}
      type={type}
      class={cx('kb-input', invalid && 'is-invalid', className)}
      value={value ?? ''}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-invalid={invalid || undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      {...handlers}
    />
  );
}

export interface TextareaProps extends BaseControlProps<string> {
  rows?: number;
  maxLength?: number;
}

export function Textarea({ id, value, onChange, onFocus, onBlur, disabled, readOnly, invalid, placeholder, rows = 3, maxLength, class: className }: TextareaProps) {
  const handlers = useComposition(onChange, (el) => el.value);
  return (
    <textarea
      id={id}
      class={cx('kb-input', 'kb-textarea', invalid && 'is-invalid', className)}
      value={value ?? ''}
      rows={rows}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-invalid={invalid || undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      {...handlers}
    />
  );
}

export interface NumberInputProps extends BaseControlProps<number | null> {
  min?: number;
  max?: number;
  step?: number;
}

export function NumberInput({ id, value, onChange, onFocus, onBlur, disabled, readOnly, invalid, placeholder, min, max, step, class: className }: NumberInputProps) {
  return (
    <input
      id={id}
      type="number"
      class={cx('kb-input', 'kb-input--number', invalid && 'is-invalid', className)}
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      readOnly={readOnly}
      placeholder={placeholder}
      aria-invalid={invalid || undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      onInput={(event) => {
        const raw = event.currentTarget.value;
        onChange(raw === '' ? null : Number(raw));
      }}
    />
  );
}

export interface SelectProps extends BaseControlProps<string | number | null> {
  options: readonly OptionItem[];
}

export function Select({ id, value, onChange, onFocus, onBlur, disabled, readOnly, invalid, placeholder = '请选择', options, class: className }: SelectProps) {
  return (
    <select
      id={id}
      class={cx('kb-input', 'kb-select', invalid && 'is-invalid', (value == null || value === '') && 'is-empty', className)}
      value={value == null ? '' : String(value)}
      disabled={disabled || readOnly}
      aria-invalid={invalid || undefined}
      onFocus={onFocus}
      onBlur={onBlur}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        const option = options.find((o) => String(o.value) === raw);
        onChange(option ? option.value : null);
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export interface RadioGroupProps extends BaseControlProps<string | number | null> {
  options: readonly OptionItem[];
  name: string;
}

export function RadioGroup({ id, value, onChange, onFocus, onBlur, disabled, readOnly, invalid, options, name, class: className }: RadioGroupProps) {
  return (
    <div id={id} class={cx('kb-choice-group', invalid && 'is-invalid', className)} role="radiogroup" onFocusIn={onFocus} onFocusOut={onBlur}>
      {options.map((option) => (
        <label key={String(option.value)} class="kb-choice">
          <input
            type="radio"
            name={name}
            checked={value === option.value}
            disabled={disabled || readOnly || option.disabled}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export interface CheckboxGroupProps extends BaseControlProps<(string | number)[]> {
  options: readonly OptionItem[];
}

export function CheckboxGroup({ id, value, onChange, onFocus, onBlur, disabled, readOnly, invalid, options, class: className }: CheckboxGroupProps) {
  const current = Array.isArray(value) ? value : [];
  return (
    <div id={id} class={cx('kb-choice-group', invalid && 'is-invalid', className)} role="group" onFocusIn={onFocus} onFocusOut={onBlur}>
      {options.map((option) => (
        <label key={String(option.value)} class="kb-choice">
          <input
            type="checkbox"
            checked={current.includes(option.value)}
            disabled={disabled || readOnly || option.disabled}
            onChange={(event) => {
              const checked = event.currentTarget.checked;
              onChange(checked ? [...current, option.value] : current.filter((v) => v !== option.value));
            }}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}
