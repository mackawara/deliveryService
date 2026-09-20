import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Grid from '@mui/material/Grid';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemText from '@mui/material/ListItemText';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { useGetBookingQuery } from '@/api/endpoints/bookings';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import { DETAIL_HISTORY_CAPS } from '@/api/types';
import { ApiError } from '@/components/ApiError';
import { KeyValue } from '@/components/KeyValue';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { PhotoViewer } from '@/components/PhotoViewer';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import {
  assignmentStateMeta,
  bookingPaymentStateMeta,
  cashStateMeta,
  deliveryStatusMeta,
  describeStatus,
  holdCodeMeta,
  paymentAttemptMeta,
  paymentMethodMeta,
} from '@/components/statusMeta';
import { BookingActions } from '@/features/bookings/BookingActions';
import { activeHolds, bookingReference } from '@/features/bookings/bookingHelpers';
import { formatDateTime } from '@/lib/datetime';

function RecentRecordsNote({ cap, kind }: { cap: number; kind: string }) {
  return (
    <Typography variant="caption" color="text.secondary">
      Most recent {kind} only (up to {cap}). A complete, paginated history is a backend addition
      (specification section 11), so this is not an exhaustive audit.
    </Typography>
  );
}

/**
 * Booking detail (specification section 4.2).
 *
 * The accepted price is shown prominently and separately from a draft quote, histories
 * are labelled as recent rather than exhaustive, and every command is contextual.
 */
export function BookingDetailPage() {
  const { id = '' } = useParams();
  const query = useGetBookingQuery(id, { skip: id === '', ...polled(POLLING.dispatch) });
  const [photoId, setPhotoId] = useState<string | null>(null);

  if (query.isLoading) {
    return (
      <Stack spacing={2}>
        <Skeleton height={64} />
        <Skeleton height={220} />
        <Skeleton height={220} />
      </Stack>
    );
  }

  if (!query.data) {
    return (
      <Stack spacing={2}>
        <PageHeader
          title="Booking"
          crumbs={[{ label: 'Bookings', to: '/bookings' }, { label: 'Detail' }]}
        />
        <ApiError
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
        />
      </Stack>
    );
  }

  const { booking, custodyHistory, assignments, payments, cash, quotes } = query.data;
  const holds = activeHolds(booking);
  const accepted = booking.acceptedQuote;
  const current = booking.currentQuote;

  return (
    <>
      <PageHeader
        title={bookingReference(booking)}
        description={`Created ${formatDateTime(booking.createdAt)} · updated ${formatDateTime(booking.updatedAt)}`}
        crumbs={[{ label: 'Bookings', to: '/bookings' }, { label: bookingReference(booking) }]}
        meta={
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: 'wrap', gap: 1 }}>
            <StatusChip
              descriptor={describeStatus(deliveryStatusMeta, booking.status)}
              size="medium"
            />
            <StatusChip
              descriptor={describeStatus(paymentMethodMeta, booking.payment.method)}
              size="medium"
            />
            <StatusChip
              descriptor={describeStatus(bookingPaymentStateMeta, booking.payment.state)}
              size="medium"
            />
          </Stack>
        }
        actions={
          <Button variant="text" onClick={() => void query.refetch()}>
            Refresh
          </Button>
        }
      />

      <Stack spacing={2}>
        {query.error ? (
          <ApiError
            error={query.error as NormalizedApiError}
            onRetry={() => void query.refetch()}
            retryLabel="Refresh"
          />
        ) : null}

        {booking.review.required ? (
          <Alert severity="warning">
            <AlertTitle>Review required</AlertTitle>
            {booking.review.reasons.join(', ') ||
              'The backend flagged this booking for operator review.'}
          </Alert>
        ) : null}

        {holds.length > 0 ? (
          <Alert severity="warning">
            <AlertTitle>
              {holds.length} active hold{holds.length === 1 ? '' : 's'}
            </AlertTitle>
            <Stack spacing={0.5} sx={{ mt: 1 }}>
              {holds.map((hold) => (
                <Stack
                  key={`${hold.code}-${hold.placedAt}`}
                  direction="row"
                  spacing={1}
                  sx={{ alignItems: 'center' }}
                >
                  <StatusChip descriptor={describeStatus(holdCodeMeta, hold.code)} />
                  <Typography variant="body2">{hold.reason}</Typography>
                </Stack>
              ))}
            </Stack>
          </Alert>
        ) : null}

        <Section
          title="Actions"
          description="Available commands follow the current state; the server validates every one."
        >
          <BookingActions detail={query.data} onRefresh={() => void query.refetch()} />
        </Section>

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, lg: 7 }}>
            <Stack spacing={2}>
              <Section title="Endpoints and contacts">
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Pickup
                    </Typography>
                    <KeyValue
                      columns={1}
                      entries={[
                        { label: 'Zone', value: booking.pickup.zoneCode },
                        { label: 'Address', value: booking.pickup.addressLine, wide: true },
                        { label: 'Landmark', value: booking.pickup.landmark },
                        {
                          label: 'Contact',
                          value: `${booking.pickup.contactName} · ${booking.pickup.contactPhone}`,
                        },
                        {
                          label: 'Location',
                          value: booking.pickup.point
                            ? `${booking.pickup.pointSource.replaceAll('_', ' ').toLowerCase()}${booking.pickup.verified ? ' (verified)' : ' (unverified)'}`
                            : 'No location pin',
                        },
                      ]}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Drop-off
                    </Typography>
                    <KeyValue
                      columns={1}
                      entries={[
                        { label: 'Zone', value: booking.dropoff.zoneCode },
                        { label: 'Address', value: booking.dropoff.addressLine, wide: true },
                        { label: 'Landmark', value: booking.dropoff.landmark },
                        {
                          label: 'Contact',
                          value: `${booking.dropoff.contactName} · ${booking.dropoff.contactPhone}`,
                        },
                        {
                          label: 'Location',
                          value: booking.dropoff.point
                            ? `${booking.dropoff.pointSource.replaceAll('_', ' ').toLowerCase()}${booking.dropoff.verified ? ' (verified)' : ' (unverified)'}`
                            : 'No location pin',
                        },
                      ]}
                    />
                  </Grid>
                </Grid>
              </Section>

              <Section
                title="Parcel declaration"
                description="Declared by the customer. A photo records condition only; it is never proof of weight, size or delivery."
                actions={
                  booking.photos.length > 0 ? (
                    <Button
                      variant="outlined"
                      onClick={() => setPhotoId(booking.photos[0]!.mediaObjectId)}
                    >
                      View photo
                    </Button>
                  ) : undefined
                }
              >
                <KeyValue
                  entries={[
                    { label: 'Mode', value: booking.parcel.mode },
                    {
                      label: 'Category',
                      value: booking.parcel.categoryOther ?? booking.parcel.categoryCode,
                    },
                    { label: 'Quantity', value: booking.parcel.quantity },
                    { label: 'Preset', value: booking.parcel.presetCode },
                    {
                      label: 'Declared limits',
                      value: booking.parcel.declaredUpperBounds
                        ? `${booking.parcel.declaredUpperBounds.weightKg} kg, ${booking.parcel.declaredUpperBounds.dimensionsCm.lengthCm}×${booking.parcel.declaredUpperBounds.dimensionsCm.widthCm}×${booking.parcel.declaredUpperBounds.dimensionsCm.heightCm} cm`
                        : undefined,
                    },
                    {
                      label: 'Measured',
                      value: booking.parcel.customMeasurements
                        ? `${booking.parcel.customMeasurements.weightKg} kg, ${booking.parcel.customMeasurements.dimensionsCm.lengthCm}×${booking.parcel.customMeasurements.dimensionsCm.widthCm}×${booking.parcel.customMeasurements.dimensionsCm.heightCm} cm`
                        : undefined,
                    },
                    {
                      label: 'Special handling',
                      value: booking.parcel.specialHandling.join(', ') || 'None declared',
                    },
                    { label: 'Description', value: booking.parcel.description, wide: true },
                    {
                      label: 'Vehicle requirement',
                      value: booking.vehicleRequirement.unresolved
                        ? `Unresolved: ${booking.vehicleRequirement.reasons.join(', ')}`
                        : booking.vehicleRequirement.allowedClasses.join(', '),
                      wide: true,
                    },
                  ]}
                />
              </Section>

              <Section title="Pricing">
                <Stack spacing={2}>
                  <Box>
                    <Typography
                      variant="caption"
                      color="text.secondary"
                      sx={{ textTransform: 'uppercase' }}
                    >
                      Accepted price
                    </Typography>
                    <Typography variant="h2" component="p">
                      <Money
                        cents={accepted?.totalCents ?? null}
                        emphasis
                        srLabel="Accepted price"
                      />
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {accepted
                        ? `Accepted ${formatDateTime(accepted.acceptedAt ?? accepted.createdAt)} · rate card v${accepted.rateCardVersion}`
                        : 'No customer-approved price yet.'}
                    </Typography>
                  </Box>

                  {current && current.quoteId !== accepted?.quoteId ? (
                    <Alert severity="info">
                      Current draft quote <Money cents={current.totalCents} /> expires{' '}
                      {formatDateTime(current.expiresAt)}. A draft quote is not a customer-approved
                      price.
                    </Alert>
                  ) : null}

                  {(accepted ?? current) ? (
                    <List dense disablePadding>
                      {(accepted ?? current)!.lineItems.map((item) => (
                        <ListItem key={`${item.code}-${item.label}`} disableGutters>
                          <ListItemText
                            primary={item.label}
                            secondary={`${item.kind.replaceAll('_', ' ').toLowerCase()}${item.acceptedByCustomer === false ? ' · not accepted by customer' : ''}`}
                          />
                          <Money cents={item.amountCents} />
                        </ListItem>
                      ))}
                    </List>
                  ) : null}

                  <Divider />
                  <RecentRecordsNote cap={DETAIL_HISTORY_CAPS.quotes} kind="quotes" />
                  <Typography variant="body2" color="text.secondary">
                    {quotes.length} quote version{quotes.length === 1 ? '' : 's'} loaded.
                  </Typography>
                </Stack>
              </Section>

              <Section title="Cash arrangement">
                {booking.payment.cashHandoverContact ? (
                  <KeyValue
                    entries={[
                      { label: 'Contact', value: booking.payment.cashHandoverContact.name },
                      { label: 'Phone', value: booking.payment.cashHandoverContact.phone },
                      {
                        label: 'Relationship',
                        value: booking.payment.cashHandoverContact.relationship,
                      },
                      {
                        label: 'Agreed',
                        value: formatDateTime(booking.payment.cashHandoverContact.agreedAt),
                      },
                    ]}
                  />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No cash handover contact recorded. The sender remains responsible for the fee;
                    cash is collected at drop-off by the agreed contact.
                  </Typography>
                )}

                {cash.length > 0 ? (
                  <Stack spacing={1} sx={{ mt: 2 }}>
                    {cash.map((entry) => (
                      <Stack
                        key={entry.id}
                        direction="row"
                        spacing={1}
                        sx={{ alignItems: 'center' }}
                      >
                        <StatusChip descriptor={describeStatus(cashStateMeta, entry.state)} />
                        <Typography variant="body2">
                          {entry.entryType.toLowerCase()} · due{' '}
                          <Money cents={entry.amountDueCents} /> · received{' '}
                          <Money cents={entry.amountReceivedCents ?? null} />
                        </Typography>
                      </Stack>
                    ))}
                    <RecentRecordsNote cap={DETAIL_HISTORY_CAPS.cash} kind="cash entries" />
                  </Stack>
                ) : null}
              </Section>

              <Section title="Operator notes">
                <Typography
                  variant="body2"
                  color={booking.operatorNotes ? 'text.primary' : 'text.secondary'}
                >
                  {booking.operatorNotes ?? 'No operator notes recorded.'}
                </Typography>
              </Section>
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, lg: 5 }}>
            <Stack spacing={2}>
              <Section title="Payment attempts">
                {payments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No electronic payment attempts recorded.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {payments.map((payment) => (
                      <Stack key={payment.id} spacing={0.5}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <StatusChip
                            descriptor={describeStatus(paymentAttemptMeta, payment.status)}
                          />
                          <Money cents={payment.amountCents} />
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {payment.reference}
                          {payment.providerReference
                            ? ` · provider ${payment.providerReference}`
                            : ''}{' '}
                          · {formatDateTime(payment.createdAt)}
                        </Typography>
                        {payment.financeExceptionReason ? (
                          <Typography variant="caption" color="error.main">
                            Finance exception: {payment.financeExceptionReason}
                          </Typography>
                        ) : null}
                      </Stack>
                    ))}
                    <RecentRecordsNote cap={DETAIL_HISTORY_CAPS.payments} kind="payment attempts" />
                  </Stack>
                )}
              </Section>

              <Section title="Assignments">
                {assignments.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No driver has been offered this booking yet.
                  </Typography>
                ) : (
                  <Stack spacing={1.5}>
                    {assignments.map((assignment) => (
                      <Stack key={assignment.id} spacing={0.5}>
                        <StatusChip
                          descriptor={describeStatus(assignmentStateMeta, assignment.state)}
                        />
                        <Typography variant="caption" color="text.secondary">
                          Driver {assignment.driverId.slice(-6)} · vehicle{' '}
                          {assignment.vehicleId.slice(-6)} · offered{' '}
                          {formatDateTime(assignment.offeredAt)}
                          {assignment.state === 'OFFERED'
                            ? ` · expires ${formatDateTime(assignment.offerExpiresAt)}`
                            : ''}
                        </Typography>
                        {assignment.custodyHandover ? (
                          <Typography variant="caption" color="text.secondary">
                            Custody handover recorded{' '}
                            {formatDateTime(assignment.custodyHandover.at)}
                          </Typography>
                        ) : null}
                      </Stack>
                    ))}
                    <RecentRecordsNote cap={DETAIL_HISTORY_CAPS.assignments} kind="assignments" />
                  </Stack>
                )}
              </Section>

              <Section title="Custody timeline">
                <KeyValue
                  columns={1}
                  entries={[
                    {
                      label: 'Current custody',
                      value: `${booking.custody.holder.toLowerCase()} since ${formatDateTime(booking.custody.since)}`,
                    },
                    { label: 'Delivery attempts', value: booking.deliveryAttempts },
                  ]}
                />
                <Divider sx={{ my: 2 }} />
                {custodyHistory.length === 0 ? (
                  <Typography variant="body2" color="text.secondary">
                    No delivery events recorded yet.
                  </Typography>
                ) : (
                  <Stack spacing={1}>
                    {custodyHistory.map((event) => (
                      <Stack key={event.id} spacing={0.25}>
                        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                          <StatusChip
                            descriptor={describeStatus(deliveryStatusMeta, event.newState)}
                          />
                          <Typography variant="caption" color="text.secondary">
                            {formatDateTime(event.occurredAt)}
                          </Typography>
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {event.actor.type.toLowerCase()}
                          {event.reason ? ` · ${event.reason}` : ''}
                        </Typography>
                      </Stack>
                    ))}
                    <RecentRecordsNote
                      cap={DETAIL_HISTORY_CAPS.custodyHistory}
                      kind="custody events"
                    />
                  </Stack>
                )}
              </Section>
            </Stack>
          </Grid>
        </Grid>
      </Stack>

      <PhotoViewer
        open={photoId !== null}
        mediaObjectId={photoId}
        onClose={() => setPhotoId(null)}
      />
    </>
  );
}
