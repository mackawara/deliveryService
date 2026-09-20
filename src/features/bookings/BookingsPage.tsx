import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { BOOKING_PAYMENT_STATES, DELIVERY_STATUSES, PAYMENT_METHODS } from '@/api/dto/booking';
import { useListBookingsQuery } from '@/api/endpoints/bookings';
import { useListDriversQuery } from '@/api/endpoints/fleet';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import type { Booking } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import {
  bookingPaymentStateMeta,
  deliveryStatusMeta,
  describeStatus,
  paymentMethodMeta,
} from '@/components/statusMeta';
import { formatAge, formatDateTime } from '@/lib/datetime';
import { useNumberQueryParam, useQueryParam, useResetQueryParams } from '@/lib/useUrlState';
import {
  bookingPrice,
  bookingReference,
  isActiveBooking,
} from '@/features/bookings/bookingHelpers';

const PAGE_SIZE = 25;
const FILTER_KEYS = ['status', 'paymentState', 'paymentMethod', 'skip', 'active'];

/**
 * Booking queue (specification section 4.2).
 *
 * Delivery status and payment status stay in separate chips, the accepted price is
 * distinguished from a draft quote, and filters live in the URL so a queue link
 * reloads into the same view.
 */
export function BookingsPage() {
  const navigate = useNavigate();
  const { townId, towns, allTowns } = useTownScope();

  const [status, setStatus] = useQueryParam('status');
  const [paymentState, setPaymentState] = useQueryParam('paymentState');
  const [paymentMethod, setPaymentMethod] = useQueryParam('paymentMethod');
  const [skip, setSkip] = useNumberQueryParam('skip', 0);
  const [activeOnlyParam, setActiveOnly] = useQueryParam('active');
  const resetFilters = useResetQueryParams(FILTER_KEYS);

  // Default view is active work; the switch is explicit about what it filters.
  const activeOnly = activeOnlyParam !== 'off';

  const query = useListBookingsQuery(
    {
      townId,
      status: status as never,
      paymentState: paymentState as never,
      paymentMethod: paymentMethod as never,
      limit: PAGE_SIZE,
      skip,
    },
    polled(POLLING.queue),
  );

  // Driver names for the assigned column; the booking list carries only identifiers.
  const driversQuery = useListDriversQuery({ townId, limit: 100 }, { skip: !townId });
  const driverNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of driversQuery.data?.items ?? []) map.set(row.driver.id, row.driver.name);
    return map;
  }, [driversQuery.data]);

  const loaded = query.data?.items ?? [];
  const rows = activeOnly ? loaded.filter(isActiveBooking) : loaded;
  const hiddenCount = loaded.length - rows.length;

  const columns: Array<Column<Booking>> = [
    {
      id: 'reference',
      header: 'Waybill',
      minWidth: 140,
      render: (booking) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {bookingReference(booking)}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatDateTime(booking.createdAt)}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'sender',
      header: 'Sender',
      minWidth: 140,
      render: (booking) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">{booking.sender.name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {booking.sender.phone}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'route',
      header: 'Pickup → Drop-off',
      minWidth: 160,
      render: (booking) => (
        <Typography variant="body2">
          {booking.pickup.zoneCode ?? 'Zone unknown'} → {booking.dropoff.zoneCode ?? 'Zone unknown'}
        </Typography>
      ),
    },
    {
      id: 'parcel',
      header: 'Parcel class',
      render: (booking) => (
        <Stack spacing={0.25}>
          <Typography variant="body2">
            {booking.currentQuote?.parcelClass ?? booking.parcel.categoryCode}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {booking.parcel.quantity} item{booking.parcel.quantity === 1 ? '' : 's'}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'delivery',
      header: 'Delivery state',
      render: (booking) => (
        <StatusChip descriptor={describeStatus(deliveryStatusMeta, booking.status)} />
      ),
    },
    {
      id: 'payment',
      header: 'Payment',
      minWidth: 170,
      render: (booking) => (
        <Stack spacing={0.5}>
          <StatusChip descriptor={describeStatus(paymentMethodMeta, booking.payment.method)} />
          <StatusChip descriptor={describeStatus(bookingPaymentStateMeta, booking.payment.state)} />
        </Stack>
      ),
    },
    {
      id: 'fee',
      header: 'Fee',
      align: 'right',
      render: (booking) => {
        const price = bookingPrice(booking);
        return (
          <Stack spacing={0.25} sx={{ alignItems: 'flex-end' }}>
            <Money cents={price.cents} emphasis={price.accepted} srLabel="Delivery fee" />
            <Typography
              variant="caption"
              color={price.accepted ? 'text.secondary' : 'warning.main'}
            >
              {price.cents === null ? 'No quote' : price.accepted ? 'Accepted' : 'Draft quote'}
            </Typography>
          </Stack>
        );
      },
    },
    {
      id: 'driver',
      header: 'Driver',
      render: (booking) =>
        booking.assignment ? (
          <Typography variant="body2">
            {driverNames.get(booking.assignment.driverId) ??
              `Driver ${booking.assignment.driverId.slice(-6)}`}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Unassigned
          </Typography>
        ),
    },
    {
      id: 'updated',
      header: 'Last update',
      render: (booking) => <Typography variant="body2">{formatAge(booking.updatedAt)}</Typography>,
    },
  ];

  const townLabel = townId
    ? (towns.find((town) => town.id === townId)?.name ?? 'Selected town')
    : allTowns
      ? 'All towns in your scope'
      : 'Your assigned towns';

  return (
    <>
      <PageHeader
        title="Bookings"
        description={`Queue for ${townLabel}.`}
        crumbs={[{ label: 'Operations' }, { label: 'Bookings' }]}
        actions={
          <Button variant="outlined" onClick={resetFilters}>
            Reset filters
          </Button>
        }
      />

      <Stack spacing={2}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ flexWrap: 'wrap', gap: 2 }}
        >
          <TextField
            select
            size="small"
            label="Delivery state"
            value={status ?? ''}
            onChange={(event) => {
              setStatus(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Any state</MenuItem>
            {DELIVERY_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(deliveryStatusMeta, value).label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Payment state"
            value={paymentState ?? ''}
            onChange={(event) => {
              setPaymentState(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Any payment state</MenuItem>
            {BOOKING_PAYMENT_STATES.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(bookingPaymentStateMeta, value).label}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            select
            size="small"
            label="Payment method"
            value={paymentMethod ?? ''}
            onChange={(event) => {
              setPaymentMethod(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 190 }}
          >
            <MenuItem value="">Any method</MenuItem>
            {PAYMENT_METHODS.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(paymentMethodMeta, value).label}
              </MenuItem>
            ))}
          </TextField>

          <FormControlLabel
            control={
              <Switch
                checked={activeOnly}
                onChange={(event) => setActiveOnly(event.target.checked ? null : 'off')}
              />
            }
            label="Active work only"
          />
        </Stack>

        {activeOnly && hiddenCount > 0 ? (
          <Alert severity="info">
            {hiddenCount} delivered, returned or cancelled booking{hiddenCount === 1 ? '' : 's'} on
            this loaded page {hiddenCount === 1 ? 'is' : 'are'} hidden. This narrows the loaded page
            only — choose a delivery state above to filter on the server.
          </Alert>
        ) : null}

        <Alert severity="info">
          Waybill and date search are not accepted list filters yet; they are backend additions
          (specification section 11). This list has no server total, so paging shows the loaded
          range.
        </Alert>

        <ResourceTable
          caption="Booking queue"
          columns={columns}
          rows={rows}
          getRowId={(booking) => booking.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No bookings match this view"
          emptyDescription="Adjust the filters, switch town, or turn off the active-work view to see completed work."
          onRowClick={(booking) => navigate(`/bookings/${booking.id}`)}
          page={{
            limit: PAGE_SIZE,
            skip,
            hasProbableNextPage: query.data?.hasProbableNextPage ?? false,
            onSkipChange: setSkip,
          }}
        />
      </Stack>
    </>
  );
}
