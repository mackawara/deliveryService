import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardActions from '@mui/material/CardActions';
import CardContent from '@mui/material/CardContent';
import Grid from '@mui/material/Grid';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useListBookingsQuery } from '@/api/endpoints/bookings';
import { useListEnquiriesQuery } from '@/api/endpoints/enquiries';
import { useGetAlertsQuery, useGetOverviewQuery } from '@/api/endpoints/operations';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import { useTownScope } from '@/app/useTownScope';
import { useStaffSession } from '@/auth/useAuth';
import { ApiError } from '@/components/ApiError';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Section } from '@/components/Section';
import { formatDateTime } from '@/lib/datetime';
import { hasAnyRole } from '@/lib/permissions';

interface MetricProps {
  label: string;
  value: ReactNode;
  caption: string;
  to?: string;
  actionLabel?: string;
}

function Metric({ label, value, caption, to, actionLabel = 'Open queue' }: MetricProps) {
  return (
    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase' }}>
          {label}
        </Typography>
        <Typography variant="h2" component="p" sx={{ my: 0.5 }}>
          {value}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {caption}
        </Typography>
      </CardContent>
      {to ? (
        <CardActions>
          <Button component={RouterLink} to={to} size="small">
            {actionLabel}
          </Button>
        </CardActions>
      ) : null}
    </Card>
  );
}

/**
 * Overview (specification section 4.1).
 *
 * Aggregates come from the server summary contract. Until that endpoint exists the page
 * shows links and clearly labelled loaded-page counts, and never computes a town-wide
 * total from the first page of records.
 */
export function OverviewPage() {
  const session = useStaffSession();
  const { townId, towns, allTowns } = useTownScope();

  const isOperator = hasAnyRole(session, ['operator']);
  const isFinance = hasAnyRole(session, ['finance']);

  const overview = useGetOverviewQuery({ townId }, polled(POLLING.queue));
  const summaryUnavailable =
    overview.isError &&
    ['notFound', 'server', 'client'].includes((overview.error as NormalizedApiError).kind);

  // Fallbacks read one page and say so; they are never presented as town-wide totals.
  const reviewQueue = useListBookingsQuery(
    { townId, status: 'REVIEW_REQUIRED', limit: 100 },
    { skip: !isOperator, ...polled(POLLING.queue) },
  );
  const dispatchQueue = useListBookingsQuery(
    { townId, status: 'READY_FOR_DISPATCH', limit: 100 },
    { skip: !isOperator, ...polled(POLLING.queue) },
  );
  const enquiryQueue = useListEnquiriesQuery(
    { townId, status: 'OPEN', limit: 100 },
    { skip: !isOperator, ...polled(POLLING.finance) },
  );
  const alerts = useGetAlertsQuery(undefined, { skip: !isOperator, ...polled(POLLING.queue) });

  const townLabel = townId
    ? (towns.find((town) => town.id === townId)?.name ?? 'Selected town')
    : allTowns
      ? 'All towns in your scope'
      : 'Your assigned towns';

  function loadedCount(count: number | undefined, complete: boolean): ReactNode {
    if (count === undefined) return '—';
    return complete ? count : `${count}+`;
  }

  return (
    <>
      <PageHeader
        title="Overview"
        description={`Outstanding work for ${townLabel}.`}
        meta={
          <Typography variant="caption" color="text.secondary">
            {overview.data
              ? `Reporting period ${formatDateTime(overview.data.reportingWindow.from)} – ${formatDateTime(overview.data.reportingWindow.to)} · generated ${formatDateTime(overview.data.generatedAt)}`
              : 'No server summary loaded; the counts below describe loaded pages only.'}
          </Typography>
        }
        actions={
          <Button variant="outlined" onClick={() => void overview.refetch()}>
            Refresh
          </Button>
        }
      />

      <Stack spacing={2}>
        {summaryUnavailable ? (
          <Alert severity="info">
            <AlertTitle>Dashboard summary endpoint not available</AlertTitle>
            <code>GET /api/v1/admin/overview</code> is a backend addition (specification section 11,
            P1). Until it exists this page links to the real queues and shows counts for the records
            it loaded, rather than inventing town-wide totals.
          </Alert>
        ) : overview.isError ? (
          <ApiError
            error={overview.error as NormalizedApiError}
            onRetry={() => void overview.refetch()}
          />
        ) : null}

        {isOperator ? (
          <Section title="Operations" description="Work that needs an operator.">
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <Metric
                  label="Awaiting review"
                  value={
                    overview.data?.operations
                      ? overview.data.operations.awaitingReview
                      : loadedCount(
                          reviewQueue.data?.items.length,
                          !(reviewQueue.data?.hasProbableNextPage ?? false),
                        )
                  }
                  caption={overview.data?.operations ? 'Server total' : 'Loaded page only'}
                  to="/bookings?status=REVIEW_REQUIRED"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <Metric
                  label="Ready for dispatch"
                  value={
                    overview.data?.operations
                      ? overview.data.operations.readyForDispatch
                      : loadedCount(
                          dispatchQueue.data?.items.length,
                          !(dispatchQueue.data?.hasProbableNextPage ?? false),
                        )
                  }
                  caption={overview.data?.operations ? 'Server total' : 'Loaded page only'}
                  to="/dispatch"
                  actionLabel="Open dispatch"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <Metric
                  label="Open enquiries"
                  value={
                    overview.data?.operations
                      ? overview.data.operations.openEnquiries
                      : loadedCount(
                          enquiryQueue.data?.items.length,
                          !(enquiryQueue.data?.hasProbableNextPage ?? false),
                        )
                  }
                  caption={overview.data?.operations ? 'Server total' : 'Loaded page only'}
                  to="/enquiries?status=OPEN"
                />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, lg: 3 }}>
                <Metric
                  label="Operational alerts"
                  value={
                    (alerts.data?.notificationFailures.length ?? 0) +
                    (alerts.data?.stuckPayments.length ?? 0)
                  }
                  caption="Notification failures and payments with an unknown outcome"
                  to="/alerts"
                  actionLabel="Open alerts"
                />
              </Grid>
            </Grid>
          </Section>
        ) : null}

        {isFinance ? (
          <Section
            title="Finance"
            description="Delivery charges, electronic payments, cash collected, cash remitted and refunds are counted separately. Cash remittance moves money already collected; it is not additional revenue."
          >
            {overview.data?.finance ? (
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Metric
                    label="Delivery charges"
                    value={<Money cents={overview.data.finance.deliveryChargesCents} emphasis />}
                    caption="Charged for deliveries in the reporting period"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Metric
                    label="Electronic payments received"
                    value={
                      <Money
                        cents={overview.data.finance.electronicPaymentsReceivedCents}
                        emphasis
                      />
                    }
                    caption="Verified by the provider"
                    to="/finance/payments"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Metric
                    label="Cash collected"
                    value={<Money cents={overview.data.finance.cashCollectedCents} emphasis />}
                    caption="Collected by drivers at drop-off"
                    to="/finance/cash"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Metric
                    label="Cash remitted"
                    value={<Money cents={overview.data.finance.cashRemittedCents} emphasis />}
                    caption="Handed in by drivers — not additional revenue"
                    to="/finance/cash"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Metric
                    label="Cash outstanding"
                    value={<Money cents={overview.data.finance.cashOutstandingCents} emphasis />}
                    caption="Collected but not yet remitted or reconciled"
                    to="/finance/cash"
                  />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, lg: 4 }}>
                  <Metric
                    label="Refunds completed"
                    value={<Money cents={overview.data.finance.refundsCompletedCents} emphasis />}
                    caption="Settled against a finance record"
                    to="/finance/refunds"
                  />
                </Grid>
              </Grid>
            ) : (
              <Stack spacing={2}>
                <Alert severity="info">
                  Financial totals need the server summary contract. A town-wide figure is never
                  calculated from a page of records, so the links below open the underlying ledgers
                  instead.
                </Alert>
                <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
                  <Button component={RouterLink} to="/finance/payments" variant="outlined">
                    Payment attempts
                  </Button>
                  <Button component={RouterLink} to="/finance/cash" variant="outlined">
                    Cash ledger
                  </Button>
                  <Button component={RouterLink} to="/finance/refunds" variant="outlined">
                    Refunds
                  </Button>
                </Stack>
              </Stack>
            )}
          </Section>
        ) : null}

        {!isOperator && !isFinance ? (
          <Section
            title="Your access"
            description="Widgets are shown for the roles your account holds."
          >
            <Typography variant="body2" color="text.secondary">
              This account has no operations or finance widgets. Use the navigation for the sections
              your roles allow, or open Settings → Access to review your effective permissions.
            </Typography>
          </Section>
        ) : null}
      </Stack>
    </>
  );
}
