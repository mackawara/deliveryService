import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, Navigate, useParams } from 'react-router-dom';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  useListShopOrdersQuery,
  useGetShopOrderQuery,
  useCommandShopOrderMutation,
} from '@/api/endpoints/shopOrders';
import type {
  ShopOrder,
  ShopOrderAction,
  ShopOrderCommand,
  ShopOrderFilter,
} from '@/api/dto/shopOrder';
import type { NormalizedApiError } from '@/api/errors';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { ApiError } from '@/components/ApiError';
import { formatCents } from '@/lib/money';
import { newIdempotencyKey } from '@/lib/idempotency';
import { countdown, useOrderClock, useOrderPolling, useOrderRefresh } from './orderTime';

const labels: Record<string, string> = {
  AWAITING_SHOP: 'Awaiting acceptance',
  PREPARING: 'Preparing',
  READY: 'Ready for pickup',
  FINDING_RIDER: 'Finding a rider',
  HELD: 'Waiting on a delivery hold',
  OFFERED: 'Offer awaiting rider acceptance',
  ASSIGNED: 'Rider assigned',
  PICKED_UP: 'Picked up',
  DELIVERED: 'Delivered',
  CLOSED: 'Delivery closed',
  NEEDS_HELP: 'Delivery operations assistance needed',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};
const localTime = (value: string) => new Date(value).toLocaleString();
const protectedFailure = (error: unknown) =>
  ['unauthenticated', 'forbidden', 'notFound'].includes(
    (error as NormalizedApiError | undefined)?.kind ?? '',
  );
function RefreshState({
  serverNow,
  failed,
  online,
  retry,
}: {
  serverNow?: string;
  failed: boolean;
  online: boolean;
  retry: () => void;
}) {
  const clock = useOrderClock(serverNow);
  return (
    <Stack spacing={1}>
      <Typography variant="body2">
        {serverNow
          ? `Last refresh (server): ${localTime(serverNow)}`
          : 'Waiting for the first refresh…'}
      </Typography>
      {(!online || failed || clock.stale) && (
        <Alert severity="warning" action={<Button onClick={retry}>Retry refresh</Button>}>
          {!online
            ? 'Offline. Orders may have changed.'
            : 'Order information is stale. Refresh before acting.'}{' '}
          WhatsApp remains the notification route while this browser is asleep.
        </Alert>
      )}
    </Stack>
  );
}
export function ShopOrdersEntry() {
  const { session } = useOwnerAuth();
  const memberships = session?.memberships.filter((m) => m.status === 'ACTIVE') ?? [];
  const saved = session ? localStorage.getItem(`shop-branch:${session.owner.id}`) : null;
  const shopId = memberships.find((m) => m.shopId === saved)?.shopId ?? memberships[0]?.shopId;
  return <Navigate replace to={shopId ? `/shop/${shopId}/orders` : '/shop/setup'} />;
}
export function ShopOrdersPage() {
  const { shopId = '', orderId } = useParams();
  const { session } = useOwnerAuth();
  const allowed =
    !!session?.memberships.some((m) => m.shopId === shopId && m.status === 'ACTIVE') &&
    session.capabilities.includes('orders:manage');
  if (!allowed || !session)
    return <Alert severity="info">Orders are unavailable for this branch.</Alert>;
  return orderId ? (
    <ShopOrderDetail
      key={`${session.owner.id}:${shopId}:${orderId}`}
      ownerId={session.owner.id}
      shopId={shopId}
      id={orderId}
    />
  ) : (
    <ShopInbox key={`${session.owner.id}:${shopId}`} ownerId={session.owner.id} shopId={shopId} />
  );
}
function ShopInbox({ ownerId, shopId }: { ownerId: string; shopId: string }) {
  const [status, setStatus] = useState<ShopOrderFilter>('ACTIVE');
  const [pages, setPages] = useState<string[]>([]);
  const cursor = pages.at(-1);
  const polling = useOrderPolling();
  const query = useListShopOrdersQuery(
    { ownerId, shopId, status, cursor },
    { ...polling.options, skip: !polling.visible },
  );
  useOrderRefresh(
    query.refetch,
    polling.visible && polling.online && !query.isUninitialized,
    query.currentData?.pollingIntervalMs,
  );
  const data = query.currentData;
  const known = useRef<Set<string> | null>(null);
  const [announcement, setAnnouncement] = useState('');
  useEffect(() => {
    if (!data || cursor) return;
    const ids = new Set(data.items.map((order) => order.id));
    const count = known.current ? [...ids].filter((id) => !known.current!.has(id)).length : 0;
    known.current = ids;
    if (count) setAnnouncement(`${count} new order${count === 1 ? '' : 's'} arrived.`);
  }, [cursor, data]);
  const clock = useOrderClock(data?.serverNow);
  const retry = () => {
    if (!query.isUninitialized) void query.refetch();
  };
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Orders
      </Typography>
      <TextField
        select
        label="Order state"
        value={status}
        onChange={(event) => {
          setStatus(event.target.value as ShopOrderFilter);
          setPages([]);
          known.current = null;
        }}
      >
        {(
          [
            'ACTIVE',
            'AWAITING_SHOP',
            'PREPARING',
            'READY',
            'COMPLETED',
            'REJECTED',
            'CANCELLED',
            'ALL',
          ] as ShopOrderFilter[]
        ).map((value) => (
          <MenuItem key={value} value={value}>
            {labels[value] ?? value.toLowerCase()}
          </MenuItem>
        ))}
      </TextField>
      <RefreshState
        serverNow={data?.serverNow}
        failed={query.isError}
        online={polling.online}
        retry={retry}
      />
      <Box role="status" aria-live="polite">
        {announcement}
      </Box>
      {query.error && <ApiError error={query.error as NormalizedApiError} onRetry={retry} />}
      {query.isLoading && <CircularProgress aria-label="Loading orders" />}
      {!protectedFailure(query.error) && data && (
        <>
          {!data.items.length && <Alert severity="info">No orders match this filter.</Alert>}
          {data.items.map((order) => (
            <Card key={order.id} variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <Typography variant="h6">{order.reference}</Typography>
                  <Typography>
                    {labels[order.status] ?? order.status} · {order.itemCount} items · USD{' '}
                    {formatCents(order.amounts.totalCents)}
                  </Typography>
                  <Typography>
                    {labels[order.delivery.progress] ?? order.delivery.progress}
                  </Typography>
                  <Typography variant="body2">
                    Placed {localTime(order.placedAt)}
                    {order.status === 'AWAITING_SHOP'
                      ? ` · ${countdown(order.acceptanceDeadlineAt, clock.now)}`
                      : ''}
                  </Typography>
                  <Button
                    component={RouterLink}
                    to={`/shop/${shopId}/orders/${order.id}`}
                    sx={{ alignSelf: 'flex-start' }}
                  >
                    Review {order.reference}
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          ))}
          <Stack direction="row" spacing={1}>
            <Button disabled={!pages.length} onClick={() => setPages(pages.slice(0, -1))}>
              Previous page
            </Button>
            <Button
              disabled={!data.nextCursor}
              onClick={() => setPages([...pages, data.nextCursor!])}
            >
              Next page
            </Button>
            {!!pages.length && <Button onClick={() => setPages([])}>Newest orders</Button>}
          </Stack>
        </>
      )}
    </Stack>
  );
}
function ShopOrderDetail({ ownerId, shopId, id }: { ownerId: string; shopId: string; id: string }) {
  const polling = useOrderPolling();
  const query = useGetShopOrderQuery(
    { ownerId, shopId, id },
    { ...polling.options, skip: !polling.visible },
  );
  useOrderRefresh(
    query.refetch,
    polling.visible && polling.online && !query.isUninitialized,
    query.currentData?.order.pollingIntervalMs,
  );
  const order = query.currentData?.order;
  const retry = () => {
    if (!query.isUninitialized) void query.refetch();
  };
  return (
    <Stack spacing={2}>
      <Button component={RouterLink} to={`/shop/${shopId}/orders`} sx={{ alignSelf: 'flex-start' }}>
        Back to orders
      </Button>
      <RefreshState
        serverNow={query.currentData?.serverNow}
        failed={query.isError}
        online={polling.online}
        retry={retry}
      />
      {query.isLoading && <CircularProgress aria-label="Loading order" />}
      {query.error && <ApiError error={query.error as NormalizedApiError} onRetry={retry} />}
      {!protectedFailure(query.error) && order && order.shopId === shopId && (
        <OrderContent
          order={order}
          ownerId={ownerId}
          refresh={retry}
          disabled={query.isError || !polling.online || !polling.visible}
        />
      )}
    </Stack>
  );
}
function OrderContent({
  order,
  ownerId,
  refresh,
  disabled,
}: {
  order: ShopOrder;
  ownerId: string;
  refresh: () => void;
  disabled: boolean;
}) {
  const [dialog, setDialog] = useState<{ action: ShopOrderAction; version: number } | null>(null);
  const [prep, setPrep] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<NormalizedApiError>();
  const [pending, setPending] = useState<ShopOrderCommand | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const lock = useRef(false);
  const prepInput = useRef<HTMLInputElement>(null);
  const [command, state] = useCommandShopOrderMutation();
  const clock = useOrderClock(order.serverNow);
  const invalidPrep =
    !/^\d+$/.test(prep) || Number(prep) < 1 || Number(prep) > order.prepMaxMinutes;
  const dialogStale = !!dialog && dialog.version !== order.version;
  const expired =
    order.status === 'AWAITING_SHOP' && clock.now >= Date.parse(order.acceptanceDeadlineAt);
  const blocked = disabled || clock.stale || state.isLoading || !!pending || expired;
  async function send(input: ShopOrderCommand) {
    if (lock.current) return;
    lock.current = true;
    setPending(input);
    setError(undefined);
    setUncertain(false);
    try {
      await command(input).unwrap();
      setMessage('Action confirmed by the server. Refreshing current status.');
      setPending(null);
      setDialog(null);
    } catch (failure) {
      const issue = failure as NormalizedApiError;
      setError(issue);
      if (['timeout', 'offline', 'server', 'unknown'].includes(issue.kind)) {
        setUncertain(true);
        setDialog(null);
        setMessage(
          'Outcome unconfirmed. The action may have completed. Checking current status; retry sends the original details and key.',
        );
      } else {
        setPending(null);
        setDialog(null);
        setMessage(
          issue.kind === 'conflict'
            ? 'The order changed in another tab or WhatsApp. Review its current status before acting again.'
            : 'The action was rejected. Review the current order.',
        );
      }
    } finally {
      lock.current = false;
      refresh();
    }
  }
  function submit() {
    if (
      !dialog ||
      dialogStale ||
      blocked ||
      (dialog.action === 'ACCEPT' && invalidPrep) ||
      (dialog.action === 'REJECT' && !reason)
    )
      return;
    const input: ShopOrderCommand = {
      ownerId,
      shopId: order.shopId,
      id: order.id,
      action: dialog.action.toLowerCase() as ShopOrderCommand['action'],
      idempotencyKey: newIdempotencyKey(),
      payload: {
        expectedVersion: dialog.version,
        ...(dialog.action === 'ACCEPT' ? { prepMinutes: Number(prep) } : {}),
        ...(dialog.action === 'REJECT' ? { reasonCode: reason } : {}),
      },
    };
    void send(input);
  }
  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        {order.reference}
      </Typography>
      <Typography>
        {labels[order.status] ?? order.status} ·{' '}
        {labels[order.delivery.progress] ?? order.delivery.progress}
      </Typography>
      {message && (
        <Alert severity={uncertain ? 'warning' : 'info'} role="status">
          {message}
        </Alert>
      )}
      {error && <ApiError error={error} />}
      {uncertain && pending && (
        <Button disabled={state.isLoading || disabled} onClick={() => void send(pending)}>
          Retry original action
        </Button>
      )}
      {order.status === 'AWAITING_SHOP' && (
        <Typography>
          Acceptance: {countdown(order.acceptanceDeadlineAt, clock.now)} ·{' '}
          {localTime(order.acceptanceDeadlineAt)}
        </Typography>
      )}
      {order.estimatedReadyAt && (
        <Alert
          severity={
            order.status === 'PREPARING' && clock.now >= Date.parse(order.estimatedReadyAt)
              ? 'warning'
              : 'info'
          }
        >
          Estimated ready: {localTime(order.estimatedReadyAt)}.{' '}
          {order.status === 'PREPARING'
            ? clock.now >= Date.parse(order.estimatedReadyAt)
              ? 'Preparation overdue. Mark ready only when the food is ready.'
              : countdown(order.estimatedReadyAt, clock.now)
            : ''}{' '}
          Dispatch starts only after Ready is pressed and other delivery checks pass.
        </Alert>
      )}
      <Typography>
        Payment:{' '}
        {order.payment.method === 'CASH_ON_DELIVERY'
          ? 'Cash on delivery (COD)'
          : order.payment.method === 'ECOCASH'
            ? 'EcoCash'
            : order.payment.method}{' '}
        · {order.payment.state}
      </Typography>
      <Stack spacing={1}>
        {order.items?.map((item) => (
          <Box key={item.itemId}>
            <Typography>
              {item.quantity} × {item.name} · USD {formatCents(item.lineTotalCents)}
            </Typography>
            <Typography variant="body2">
              USD {formatCents(item.unitPriceCents)} each · Packaged unit:{' '}
              {item.deliverySize.weightGrams} g, {item.deliverySize.dimensionsCm.length} ×{' '}
              {item.deliverySize.dimensionsCm.width} × {item.deliverySize.dimensionsCm.height} cm
            </Typography>
          </Box>
        ))}
      </Stack>
      <Typography>
        Food: USD {formatCents(order.amounts.foodSubtotalCents)} · Delivery: USD{' '}
        {formatCents(order.amounts.deliveryFeeCents)} · Total: USD{' '}
        {formatCents(order.amounts.totalCents)}
      </Typography>
      {order.dropoff && (
        <Typography>
          Delivery area: {order.dropoff.zoneCode} · {order.dropoff.addressLine}
        </Typography>
      )}
      {order.customer && <Typography>Customer: {order.customer.name}</Typography>}
      {order.notifications?.needsHelp && (
        <Alert severity="warning">Some notifications are delayed. {order.help}</Alert>
      )}
      {order.delivery.holdCode && (
        <Alert severity="warning">
          Waiting on delivery checks: {order.delivery.holdCode.replaceAll('_', ' ').toLowerCase()}.{' '}
          {order.help}
        </Alert>
      )}
      {order.delivery.estimate && (
        <Typography variant="body2">
          Delivery estimate:{' '}
          {order.delivery.estimate.deliveryWindowStart && order.delivery.estimate.deliveryWindowEnd
            ? `${localTime(order.delivery.estimate.deliveryWindowStart)} – ${localTime(order.delivery.estimate.deliveryWindowEnd)}`
            : 'Not available yet'}
          . Confidence: {order.delivery.estimate.confidence.toLowerCase()}. Calculated{' '}
          {localTime(order.delivery.estimate.calculatedAt)}
          {clock.now - Date.parse(order.delivery.estimate.calculatedAt) > 300_000 ? ' (stale)' : ''}
          .
        </Typography>
      )}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        {order.availableActions.map((action) => (
          <Button
            key={action}
            variant={action === 'REJECT' ? 'outlined' : 'contained'}
            disabled={blocked}
            onClick={() => {
              setDialog({ action, version: order.version });
              setPrep('');
              setReason('');
            }}
          >
            {action === 'ACCEPT'
              ? 'Accept order'
              : action === 'REJECT'
                ? 'Reject order'
                : 'Ready for pickup'}
          </Button>
        ))}
      </Stack>
      <Typography variant="body2">
        {order.help} Quote {order.reference}.{' '}
        {order.acceptedAt
          ? 'Customer cancellation and shop rejection are unavailable after acceptance.'
          : ''}
      </Typography>
      <Button
        component={RouterLink}
        to={`/shop/help?reference=${encodeURIComponent(order.reference)}`}
      >
        Get operational help
      </Button>
      <Typography variant="h6">Order timeline</Typography>
      {order.history?.map((event, index) => (
        <Typography key={index} variant="body2">
          {localTime(event.at)} · {event.type.replaceAll('_', ' ').toLowerCase()} · {event.channel}{' '}
          · {event.actor.type}
        </Typography>
      ))}
      <Dialog
        open={!!dialog}
        onClose={() => {
          if (!state.isLoading && !pending) setDialog(null);
        }}
        fullWidth
        maxWidth="sm"
        slotProps={{
          transition: {
            onEntered: () => {
              if (dialog?.action === 'ACCEPT') prepInput.current?.focus();
            },
          },
        }}
        aria-labelledby="order-command-title"
      >
        <DialogTitle id="order-command-title">
          {dialog?.action === 'ACCEPT'
            ? 'Accept with preparation estimate'
            : dialog?.action === 'REJECT'
              ? 'Reject pending order'
              : 'Confirm food is ready'}
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {dialogStale && (
              <Alert severity="warning">
                This order changed. Close this dialog and review the current status.
              </Alert>
            )}
            {dialog?.action === 'ACCEPT' && (
              <>
                <TextField
                  autoFocus
                  inputRef={prepInput}
                  required
                  label="Preparation minutes"
                  type="number"
                  value={prep}
                  onChange={(event) => setPrep(event.target.value)}
                  disabled={!!pending}
                  slotProps={{ htmlInput: { min: 1, max: order.prepMaxMinutes, step: 1 } }}
                  helperText={`Enter 1–${order.prepMaxMinutes} whole minutes.`}
                />
                {!invalidPrep && (
                  <Typography>
                    Proposed ready time:{' '}
                    {new Date(clock.now + Number(prep) * 60_000).toLocaleString()}
                  </Typography>
                )}
                <Typography>
                  Dispatch starts only after you press Ready for pickup. The estimate alone does not
                  call a rider.
                </Typography>
              </>
            )}
            {dialog?.action === 'REJECT' && (
              <TextField
                select
                required
                autoFocus
                label="Rejection reason"
                value={reason}
                disabled={!!pending}
                onChange={(event) => setReason(event.target.value)}
              >
                {[
                  ['TOO_BUSY', 'Too busy'],
                  ['OUT_OF_STOCK', 'Items unavailable'],
                  ['CLOSING', 'Closing'],
                  ['CANNOT_FULFILL', 'Cannot fulfill this order'],
                ].map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </TextField>
            )}
            {dialog?.action === 'READY' && (
              <Typography>
                The complete order is packed and ready for rider pickup. Dispatch still depends on
                payment, service and capacity checks.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={state.isLoading || !!pending} onClick={() => setDialog(null)}>
            Close
          </Button>
          <Button
            variant="contained"
            disabled={
              blocked ||
              dialogStale ||
              (dialog?.action === 'ACCEPT' && invalidPrep) ||
              (dialog?.action === 'REJECT' && !reason)
            }
            onClick={submit}
          >
            {state.isLoading ? 'Confirming…' : 'Confirm action'}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
