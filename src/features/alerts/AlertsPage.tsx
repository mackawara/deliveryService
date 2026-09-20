import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

import { useGetAlertsQuery } from '@/api/endpoints/operations';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import type { OutboxEvent, PaymentAttempt } from '@/api/types';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import { describeStatus, paymentAttemptMeta } from '@/components/statusMeta';
import { formatDateTime } from '@/lib/datetime';

/**
 * Operational exceptions (specification section 4.8).
 *
 * Only the alert types the current endpoint serves are shown: notification failures and
 * payments with an unknown outcome. Other alert types need server support.
 */
export function AlertsPage() {
  const query = useGetAlertsQuery(undefined, polled(POLLING.queue));

  const failureColumns: Array<Column<OutboxEvent>> = [
    {
      id: 'type',
      header: 'Message type',
      render: (event) => event.type.replaceAll('_', ' ').toLowerCase(),
    },
    {
      id: 'status',
      header: 'Status',
      render: (event) => (
        <StatusChip
          descriptor={{
            label: event.status === 'DEAD' ? 'Gave up' : 'Failed',
            tone: event.status === 'DEAD' ? 'critical' : 'caution',
            icon: 'failed',
          }}
        />
      ),
    },
    { id: 'attempts', header: 'Attempts', align: 'right', render: (event) => event.attempts },
    {
      id: 'booking',
      header: 'Booking',
      render: (event) =>
        event.bookingId ? (
          <Button component={RouterLink} to={`/bookings/${event.bookingId}`} size="small">
            {event.bookingId.slice(-6)}
          </Button>
        ) : (
          '—'
        ),
    },
    { id: 'created', header: 'Created', render: (event) => formatDateTime(event.createdAt) },
    {
      id: 'error',
      header: 'Last error',
      minWidth: 220,
      render: (event) => (
        <Typography variant="body2" color="text.secondary">
          {event.lastError ?? 'No detail recorded'}
        </Typography>
      ),
    },
    {
      id: 'correlation',
      header: 'Reference',
      render: (event) =>
        event.correlationId ? (
          <code>{event.correlationId}</code>
        ) : (
          <Typography variant="caption">—</Typography>
        ),
    },
  ];

  const paymentColumns: Array<Column<PaymentAttempt>> = [
    {
      id: 'reference',
      header: 'Reference',
      render: (payment) => payment.providerReference ?? payment.reference,
    },
    {
      id: 'booking',
      header: 'Booking',
      render: (payment) => (
        <Button component={RouterLink} to={`/bookings/${payment.bookingId}`} size="small">
          {payment.bookingId.slice(-6)}
        </Button>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      align: 'right',
      render: (payment) => <Money cents={payment.amountCents} />,
    },
    {
      id: 'status',
      header: 'Status',
      render: (payment) => (
        <StatusChip descriptor={describeStatus(paymentAttemptMeta, payment.status)} />
      ),
    },
    { id: 'created', header: 'Created', render: (payment) => formatDateTime(payment.createdAt) },
    {
      id: 'action',
      header: 'Next step',
      render: () => (
        <Button component={RouterLink} to="/finance/payments?status=UNKNOWN" size="small">
          Reconcile in finance
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Alerts"
        description="Notification failures and payments the provider has not resolved."
        crumbs={[{ label: 'Operations' }, { label: 'Alerts' }]}
        actions={
          <Button variant="outlined" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        }
      />

      <Stack spacing={2}>
        <Alert severity="info">
          This page shows exactly what the alerts endpoint returns. Additional alert types — stale
          driver locations, capacity queues, expiring offers — need server support before they can
          be listed here.
        </Alert>

        <Grid container spacing={2}>
          <Grid size={12}>
            <Section
              title="Notification failures"
              description="Messages the delivery service could not send."
            >
              <ResourceTable
                caption="Notification failures"
                columns={failureColumns}
                rows={query.data?.notificationFailures ?? []}
                getRowId={(event) => event.id}
                isLoading={query.isLoading}
                isFetching={query.isFetching}
                error={query.error as NormalizedApiError | undefined}
                onRetry={() => void query.refetch()}
                emptyTitle="No notification failures"
                emptyDescription="Outbound WhatsApp messages are being delivered."
              />
            </Section>
          </Grid>

          <Grid size={12}>
            <Section
              title="Payments with an unknown outcome"
              description="Check the original attempt with the provider; never create a second payment."
            >
              <ResourceTable
                caption="Payments with an unknown outcome"
                columns={paymentColumns}
                rows={query.data?.stuckPayments ?? []}
                getRowId={(payment) => payment.id}
                isLoading={query.isLoading}
                isFetching={query.isFetching}
                error={query.error as NormalizedApiError | undefined}
                onRetry={() => void query.refetch()}
                emptyTitle="No unresolved payments"
                emptyDescription="Every recent attempt resolved to a definite outcome."
              />
            </Section>
          </Grid>
        </Grid>
      </Stack>
    </>
  );
}
