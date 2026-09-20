import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { useGetRestrictionQuery, useRevokeRestrictionMutation } from '@/api/endpoints/restrictions';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { PageHeader } from '@/components/PageHeader';
import { ReasonField, isReasonValid } from '@/components/ReasonField';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import {
  describeStatus,
  fraudReportStatusMeta,
  restrictionReasonMeta,
  restrictionStatusMeta,
} from '@/components/statusMeta';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { useGuardedAction } from '@/lib/useGuardedAction';

/** Restriction detail with evidence, affected bookings and history (section 4.7). */
export function RestrictionDetailPage() {
  const { id = '' } = useParams();
  const query = useGetRestrictionQuery(id, { skip: id === '' });
  const [revokeRestriction] = useRevokeRestrictionMutation();
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState('');

  const revoke = useGuardedAction({
    run: (_args: void, idempotencyKey: string) =>
      revokeRestriction({
        id,
        reason: reason.trim(),
        reviewOutcome: outcome.trim() || undefined,
        expectedVersion: query.data?.restriction.version,
        idempotencyKey,
      }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'Restriction revoked. Existing jobs are not restarted and nothing is debited.',
    onSuccess: () => setRevokeOpen(false),
  });

  if (query.isLoading) return <Skeleton height={320} />;

  if (!query.data) {
    return (
      <>
        <PageHeader
          title="Restriction"
          crumbs={[{ label: 'Restrictions', to: '/restrictions' }, { label: 'Detail' }]}
        />
        <ApiError
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
        />
      </>
    );
  }

  const { restriction, fraudReports } = query.data;

  return (
    <>
      <PageHeader
        title={describeStatus(restrictionReasonMeta, restriction.reasonCode).label}
        description={`Customer ${restriction.customerId}`}
        crumbs={[
          { label: 'Restrictions', to: '/restrictions' },
          { label: restriction.id.slice(-6) },
        ]}
        meta={
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <StatusChip
              descriptor={describeStatus(restrictionStatusMeta, restriction.status)}
              size="medium"
            />
          </Stack>
        }
        actions={
          restriction.status === 'ACTIVE' ? (
            <Button variant="contained" onClick={() => setRevokeOpen(true)}>
              Revoke restriction
            </Button>
          ) : undefined
        }
      />

      <Stack spacing={2}>
        <Alert severity="info">
          While this restriction is active, new chargeable work is refused. Parcels already in
          custody and payments already taken still need to be resolved, and unblocking does not
          restart jobs or debit the customer.
        </Alert>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Section title="Decision">
              <KeyValue
                entries={[
                  { label: 'Explanation', value: restriction.explanation, wide: true },
                  {
                    label: 'Scope',
                    value:
                      restriction.scope.type === 'PLATFORM'
                        ? 'Platform-wide'
                        : `Town ${restriction.scope.townId}`,
                  },
                  { label: 'Effective from', value: formatDate(restriction.effectiveFrom) },
                  {
                    label: 'Review on',
                    value: restriction.reviewAt ? formatDate(restriction.reviewAt) : undefined,
                  },
                  {
                    label: 'Expires',
                    value: restriction.expiresAt ? formatDate(restriction.expiresAt) : 'No expiry',
                  },
                  {
                    label: 'Created by',
                    value: restriction.createdBy.label ?? restriction.createdBy.type,
                  },
                  {
                    label: 'Revoked',
                    value: restriction.revokedAt
                      ? `${formatDateTime(restriction.revokedAt)} — ${restriction.revocationReason ?? 'no reason recorded'}`
                      : undefined,
                    wide: true,
                  },
                ]}
              />
            </Section>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Section title="Evidence and affected bookings">
              {restriction.evidence.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No evidence references recorded.
                </Typography>
              ) : (
                <Stack spacing={1} divider={<Divider flexItem />}>
                  {restriction.evidence.map((entry) => (
                    <Stack key={`${entry.kind}-${entry.reference}`} spacing={0.25}>
                      <Typography variant="body2">
                        {entry.kind.toLowerCase()} · {entry.reference}
                      </Typography>
                      {entry.note ? (
                        <Typography variant="caption" color="text.secondary">
                          {entry.note}
                        </Typography>
                      ) : null}
                      <Typography variant="caption" color="text.secondary">
                        Recorded {formatDateTime(entry.recordedAt)} by{' '}
                        {entry.recordedBy.label ?? entry.recordedBy.type}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}

              {restriction.relatedBookingIds.length > 0 ? (
                <Stack direction="row" spacing={1} sx={{ mt: 2, flexWrap: 'wrap', gap: 1 }}>
                  {restriction.relatedBookingIds.map((bookingId) => (
                    <Button
                      key={bookingId}
                      component={RouterLink}
                      to={`/bookings/${bookingId}`}
                      size="small"
                    >
                      {bookingId.slice(-6)}
                    </Button>
                  ))}
                </Stack>
              ) : null}
            </Section>
          </Grid>

          <Grid size={12}>
            <Section title="Fraud reports for this customer">
              {fraudReports.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No fraud reports recorded.
                </Typography>
              ) : (
                <Stack spacing={1.5} divider={<Divider flexItem />}>
                  {fraudReports.map((report) => (
                    <Stack key={report.id} spacing={0.5}>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <StatusChip
                          descriptor={describeStatus(fraudReportStatusMeta, report.status)}
                        />
                        <StatusChip
                          descriptor={describeStatus(restrictionReasonMeta, report.reasonCode)}
                        />
                      </Stack>
                      <Typography variant="body2">{report.allegation}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        Reported {formatDateTime(report.createdAt)} by{' '}
                        {report.reportedBy.label ?? report.reportedBy.type}
                        {report.reviewOutcome ? ` · outcome: ${report.reviewOutcome}` : ''}
                      </Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Section>
          </Grid>
        </Grid>
      </Stack>

      <FormDialog
        open={revokeOpen}
        title="Revoke this restriction"
        description="Revocation keeps the history. It does not restart jobs and does not debit the customer."
        submitLabel="Revoke restriction"
        pending={revoke.pending}
        error={revoke.error}
        unconfirmed={revoke.unconfirmed}
        onRetryUnconfirmed={() => void revoke.retryUnconfirmed()}
        disabled={!isReasonValid(reason)}
        onClose={() => setRevokeOpen(false)}
        onSubmit={() => void revoke.submit()}
      >
        <ReasonField value={reason} onChange={setReason} label="Review reason" />
        <ReasonField
          value={outcome}
          onChange={setOutcome}
          label="Review outcome"
          required={false}
          helperText="Optional summary recorded against the linked reports."
        />
      </FormDialog>
    </>
  );
}
