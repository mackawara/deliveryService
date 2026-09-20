import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { useGetCustomerQuery, useGetCustomerRiskQuery } from '@/api/endpoints/customers';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { KeyValue } from '@/components/KeyValue';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { PermissionGate } from '@/components/PermissionGate';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import {
  bookingPaymentStateMeta,
  deliveryStatusMeta,
  describeStatus,
  restrictionStatusMeta,
} from '@/components/statusMeta';
import { formatDate, formatDateTime } from '@/lib/datetime';

/**
 * Customer detail (specification section 4.5).
 *
 * Saved addresses, contact details and permitted restriction status are shown here;
 * sensitive blacklist evidence stays in the admin-only restrictions module.
 */
export function CustomerDetailPage() {
  const { id = '' } = useParams();
  const query = useGetCustomerQuery(id, { skip: id === '' });
  const risk = useGetCustomerRiskQuery({ id }, { skip: id === '' });

  if (query.isLoading) return <Skeleton height={320} />;

  if (!query.data) {
    return (
      <>
        <PageHeader
          title="Customer"
          crumbs={[{ label: 'Customers', to: '/customers' }, { label: 'Detail' }]}
        />
        <ApiError
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
        />
      </>
    );
  }

  const { customer, restrictionStatus, activeRestrictions } = query.data;

  return (
    <>
      <PageHeader
        title={customer.name ?? 'Customer'}
        description={customer.phone}
        crumbs={[
          { label: 'Customers', to: '/customers' },
          { label: customer.name ?? customer.phone },
        ]}
        meta={
          restrictionStatus === 'RESTRICTED' ? (
            <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
              <StatusChip
                descriptor={describeStatus(restrictionStatusMeta, 'ACTIVE')}
                size="medium"
              />
            </Stack>
          ) : undefined
        }
        actions={
          <Button component={RouterLink} to="/enquiries" variant="outlined">
            Open enquiries
          </Button>
        }
      />

      <Stack spacing={2}>
        {restrictionStatus === 'RESTRICTED' ? (
          <Alert severity="warning">
            This customer has an active restriction. New chargeable work is restricted; parcels and
            payments already in progress still need to be resolved.
            <PermissionGate requirement={{ anyRole: ['admin'] }}>
              {activeRestrictions.map((entry) => (
                <Button
                  key={entry.id}
                  component={RouterLink}
                  to={`/restrictions/${entry.id}`}
                  size="small"
                >
                  Review restriction
                </Button>
              ))}
            </PermissionGate>
          </Alert>
        ) : null}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Section title="Contact and consents">
              <KeyValue
                entries={[
                  { label: 'Confirmed name', value: customer.name },
                  { label: 'Phone', value: customer.phone },
                  { label: 'Town', value: customer.townId },
                  {
                    label: 'Service updates',
                    value: customer.consents.serviceUpdates.granted
                      ? `Granted ${formatDate(customer.consents.serviceUpdates.grantedAt)}`
                      : 'Not granted',
                  },
                  {
                    label: 'Marketing',
                    value: customer.consents.marketing.granted
                      ? `Granted ${formatDate(customer.consents.marketing.grantedAt)}`
                      : 'Not granted',
                  },
                ]}
              />
            </Section>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }}>
            <Section title="Saved addresses">
              {customer.savedAddresses.length === 0 ? (
                <Typography variant="body2" color="text.secondary">
                  No saved addresses.
                </Typography>
              ) : (
                <List dense disablePadding>
                  {customer.savedAddresses.map((address) => (
                    <ListItem key={address.id} disableGutters>
                      <ListItemText
                        primary={`${address.label} — ${address.addressLine}`}
                        secondary={`${address.zoneCode ?? 'Zone unknown'} · ${address.verified ? 'verified coordinates' : 'unverified, needs operator confirmation'}`}
                      />
                    </ListItem>
                  ))}
                </List>
              )}
            </Section>
          </Grid>

          <Grid size={12}>
            <Section
              title="Recent bookings and exposure"
              description="Operator evidence only. Nothing here restricts a customer; that is an explicit administrator decision."
            >
              {risk.isLoading ? (
                <Skeleton height={120} />
              ) : risk.error ? (
                <ApiError
                  error={risk.error as NormalizedApiError}
                  onRetry={() => void risk.refetch()}
                />
              ) : risk.data ? (
                <Stack spacing={2}>
                  <KeyValue
                    columns={3}
                    entries={[
                      { label: 'Window', value: `${risk.data.profile.windowDays} days` },
                      { label: 'Bookings', value: risk.data.profile.bookings.total },
                      { label: 'Delivered', value: risk.data.profile.bookings.delivered },
                      { label: 'Cancelled', value: risk.data.profile.bookings.cancelled },
                      { label: 'Returned', value: risk.data.profile.bookings.returned },
                      {
                        label: 'Failed attempts',
                        value: risk.data.profile.bookings.failedAttempts,
                      },
                      { label: 'Open cash bookings', value: risk.data.profile.cash.openBookings },
                      {
                        label: 'Open cash value',
                        value: <Money cents={risk.data.profile.cash.openValueCents} />,
                      },
                      { label: 'Cash discrepancies', value: risk.data.profile.cash.discrepancies },
                      { label: 'Failed payments', value: risk.data.profile.payments.failed },
                      {
                        label: 'Unresolved payments',
                        value: risk.data.profile.payments.unresolved,
                      },
                    ]}
                  />

                  <List dense disablePadding>
                    {risk.data.recentBookings.map((booking) => (
                      <ListItem
                        key={booking.id}
                        disableGutters
                        secondaryAction={<Money cents={booking.amountDueCents} />}
                      >
                        <ListItemText
                          primary={
                            <Button
                              component={RouterLink}
                              to={`/bookings/${booking.id}`}
                              size="small"
                            >
                              {booking.waybill ?? `Draft ${booking.id.slice(-6)}`}
                            </Button>
                          }
                          secondary={formatDateTime(booking.createdAt)}
                        />
                        <Stack direction="row" spacing={1} sx={{ mr: 2 }}>
                          <StatusChip
                            descriptor={describeStatus(deliveryStatusMeta, booking.status)}
                          />
                          <StatusChip
                            descriptor={describeStatus(
                              bookingPaymentStateMeta,
                              booking.paymentState,
                            )}
                          />
                        </Stack>
                      </ListItem>
                    ))}
                  </List>
                </Stack>
              ) : null}
            </Section>
          </Grid>
        </Grid>
      </Stack>
    </>
  );
}
