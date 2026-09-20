import InputAdornment from '@mui/material/InputAdornment';
import TextField from '@mui/material/TextField';

import { parseUsdToCents } from '@/lib/money';

export interface MoneyFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string;
}

const PARSE_MESSAGES: Record<string, string> = {
  empty: 'Enter an amount.',
  format: 'Enter an amount such as 12.50.',
  precision: 'Amounts have at most two decimal places.',
  range: 'That amount is out of range.',
};

/** Validation message for the current text, or null when it parses cleanly. */
export function moneyFieldError(value: string, required: boolean): string | null {
  if (!required && value.trim() === '') return null;
  const parsed = parseUsdToCents(value);
  return parsed.ok ? null : PARSE_MESSAGES[parsed.reason];
}

/**
 * Decimal USD entry parsed into integer cents without floating-point accumulation
 * (specification section 8).
 */
export function MoneyField({
  label,
  value,
  onChange,
  helperText = 'USD, two decimal places.',
  required = false,
  disabled = false,
  error,
}: MoneyFieldProps) {
  const message = error ?? (value.trim() === '' ? null : moneyFieldError(value, required));

  return (
    <TextField
      fullWidth
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      disabled={disabled}
      error={Boolean(message)}
      helperText={message ?? helperText}
      inputMode="decimal"
      slotProps={{
        input: { startAdornment: <InputAdornment position="start">$</InputAdornment> },
      }}
    />
  );
}
