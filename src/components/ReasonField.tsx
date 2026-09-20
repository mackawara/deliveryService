import TextField from '@mui/material/TextField';

export interface ReasonFieldProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helperText?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

/** The backend requires at least three characters for any override reason. */
export const MIN_REASON_LENGTH = 3;

export function isReasonValid(value: string): boolean {
  return value.trim().length >= MIN_REASON_LENGTH;
}

/**
 * Reason capture for overrides and guarded commands. Every such command records why it
 * was performed, so the field is part of the shared component set
 * (specification section 8).
 */
export function ReasonField({
  value,
  onChange,
  label = 'Reason',
  helperText = 'Recorded in the audit trail. At least three characters.',
  error,
  required = true,
  disabled = false,
}: ReasonFieldProps) {
  return (
    <TextField
      fullWidth
      multiline
      minRows={2}
      label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      disabled={disabled}
      error={Boolean(error)}
      helperText={error ?? helperText}
    />
  );
}
