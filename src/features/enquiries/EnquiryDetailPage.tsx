import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import MenuItem from '@mui/material/MenuItem';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { ENQUIRY_STATUSES } from '@/api/dto/enquiry';
import {
  useListEnquiriesQuery,
  useReplyToEnquiryMutation,
  useUpdateEnquiryMutation,
} from '@/api/endpoints/enquiries';
import type { NormalizedApiError } from '@/api/errors';
import { useTownScope } from '@/app/useTownScope';
import { ApiError } from '@/components/ApiError';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { KeyValue } from '@/components/KeyValue';
import { PageHeader } from '@/components/PageHeader';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import { describeStatus, enquiryCategoryMeta, enquiryStatusMeta } from '@/components/statusMeta';
import { formatDateTime } from '@/lib/datetime';
import { useGuardedAction } from '@/lib/useGuardedAction';

/**
 * Enquiry workspace (specification section 4.5).
 *
 * Reply text maps to the API field `body`. Success confirms submission, not WhatsApp
 * delivery, and the thread shows only the records the backend actually returns.
 */
export function EnquiryDetailPage() {
  const { id = '' } = useParams();
  const { townId } = useTownScope();
  const query = useListEnquiriesQuery({ townId, limit: 100 });
  const enquiry = query.data?.items.find((entry) => entry.id === id);

  const [updateEnquiry] = useUpdateEnquiryMutation();
  const [replyToEnquiry] = useReplyToEnquiryMutation();

  const [replyOpen, setReplyOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [replyBody, setReplyBody] = useState('');
  const [nextStatus, setNextStatus] = useState<(typeof ENQUIRY_STATUSES)[number]>('RESOLVED');
  const [bookingId, setBookingId] = useState('');

  const reply = useGuardedAction({
    run: () =>
      replyToEnquiry({ id, body: replyBody.trim(), expectedVersion: enquiry?.version }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'Reply submitted to the messaging queue.',
    onSuccess: () => {
      setReplyOpen(false);
      setReplyBody('');
    },
  });

  const ownership = useGuardedAction({
    run: () =>
      updateEnquiry({ id, takeOwnership: true, expectedVersion: enquiry?.version }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'You now own this enquiry.',
  });

  const statusChange = useGuardedAction({
    run: () =>
      updateEnquiry({ id, status: nextStatus, expectedVersion: enquiry?.version }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'Enquiry status updated.',
    onSuccess: () => setStatusOpen(false),
  });

  const linkBooking = useGuardedAction({
    run: () =>
      updateEnquiry({
        id,
        linkedBookingId: bookingId.trim(),
        expectedVersion: enquiry?.version,
      }).unwrap(),
    refresh: () => void query.refetch(),
    successMessage: 'Booking linked to this enquiry.',
    onSuccess: () => setLinkOpen(false),
  });

  if (query.isLoading) return <Skeleton height={320} />;

  if (!enquiry) {
    return (
      <>
        <PageHeader
          title="Enquiry"
          crumbs={[{ label: 'Enquiries', to: '/enquiries' }, { label: 'Detail' }]}
        />
        {query.error ? (
          <ApiError
            error={query.error as NormalizedApiError}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <EmptyState
            title="This enquiry is not on the loaded page"
            description="An enquiry read-by-ID endpoint is a backend addition (specification section 11, P1). Open it from the queue."
          />
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={enquiry.ticketReference}
        description={`From ${enquiry.name}`}
        crumbs={[{ label: 'Enquiries', to: '/enquiries' }, { label: enquiry.ticketReference }]}
        meta={
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <StatusChip
              descriptor={describeStatus(enquiryStatusMeta, enquiry.status)}
              size="medium"
            />
            <StatusChip
              descriptor={describeStatus(enquiryCategoryMeta, enquiry.category)}
              size="medium"
            />
          </Stack>
        }
        actions={
          <>
            <Button
              variant="outlined"
              onClick={() => void ownership.submit()}
              disabled={ownership.pending}
            >
              Take ownership
            </Button>
            <Button variant="outlined" onClick={() => setLinkOpen(true)}>
              Link a booking
            </Button>
            <Button variant="outlined" onClick={() => setStatusOpen(true)}>
              Change status
            </Button>
            <Button variant="contained" onClick={() => setReplyOpen(true)}>
              Reply
            </Button>
          </>
        }
      />

      <Stack spacing={2}>
        <ApiError error={ownership.error} />

        <Section
          title="Customer submission"
          description="Exactly what the customer sent: category, message and name."
        >
          <KeyValue
            entries={[
              {
                label: 'Category',
                value: describeStatus(enquiryCategoryMeta, enquiry.category).label,
              },
              { label: 'Name', value: enquiry.name },
              {
                label: 'Owner',
                value: enquiry.owner?.label ?? enquiry.owner?.type ?? 'Unassigned',
              },
              {
                label: 'Linked booking',
                value: enquiry.linkedBookingId ? (
                  <Button
                    component={RouterLink}
                    to={`/bookings/${enquiry.linkedBookingId}`}
                    size="small"
                  >
                    Open booking
                  </Button>
                ) : undefined,
              },
              { label: 'Message', value: enquiry.message, wide: true },
            ]}
          />
        </Section>

        <Section title="Replies" description="Replies recorded by the backend for this enquiry.">
          <Alert severity="info" sx={{ mb: 2 }}>
            This is the enquiry record, not a full conversation. A chronological chat timeline and
            sent/delivered/failed indicators need the conversation-history endpoint (specification
            section 11).
          </Alert>
          {enquiry.replies.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No replies recorded yet.
            </Typography>
          ) : (
            <Stack spacing={1.5} divider={<Divider flexItem />}>
              {enquiry.replies.map((entry) => (
                <Stack key={entry.id} spacing={0.5}>
                  <Typography variant="body2">{entry.body}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {entry.author.label ?? entry.author.type.toLowerCase()} ·{' '}
                    {formatDateTime(entry.sentAt)} ·{' '}
                    {entry.channel === 'WHATSAPP' ? 'WhatsApp' : 'Internal note'}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </Section>
      </Stack>

      <FormDialog
        open={replyOpen}
        title="Reply to this enquiry"
        description="The reply is queued for WhatsApp. Submission is confirmed here; delivery status is not available yet."
        submitLabel="Send reply"
        pending={reply.pending}
        error={reply.error}
        unconfirmed={reply.unconfirmed}
        onRetryUnconfirmed={() => void reply.retryUnconfirmed()}
        disabled={replyBody.trim().length === 0}
        onClose={() => setReplyOpen(false)}
        onSubmit={() => void reply.submit()}
      >
        <TextField
          label="Reply"
          value={replyBody}
          onChange={(event) => setReplyBody(event.target.value)}
          fullWidth
          multiline
          minRows={4}
          required
        />
      </FormDialog>

      <FormDialog
        open={statusOpen}
        title="Change enquiry status"
        submitLabel="Update status"
        pending={statusChange.pending}
        error={statusChange.error}
        unconfirmed={statusChange.unconfirmed}
        onRetryUnconfirmed={() => void statusChange.retryUnconfirmed()}
        onClose={() => setStatusOpen(false)}
        onSubmit={() => void statusChange.submit()}
      >
        <TextField
          select
          label="Status"
          value={nextStatus}
          onChange={(event) => setNextStatus(event.target.value as typeof nextStatus)}
          fullWidth
        >
          {ENQUIRY_STATUSES.map((value) => (
            <MenuItem key={value} value={value}>
              {describeStatus(enquiryStatusMeta, value).label}
            </MenuItem>
          ))}
        </TextField>
      </FormDialog>

      <FormDialog
        open={linkOpen}
        title="Link a booking"
        description="Link only a booking you have confirmed belongs to this enquiry; a link is never inferred."
        submitLabel="Link booking"
        pending={linkBooking.pending}
        error={linkBooking.error}
        unconfirmed={linkBooking.unconfirmed}
        onRetryUnconfirmed={() => void linkBooking.retryUnconfirmed()}
        disabled={bookingId.trim().length === 0}
        onClose={() => setLinkOpen(false)}
        onSubmit={() => void linkBooking.submit()}
      >
        <TextField
          label="Booking identifier"
          value={bookingId}
          onChange={(event) => setBookingId(event.target.value)}
          fullWidth
          required
        />
      </FormDialog>
    </>
  );
}
