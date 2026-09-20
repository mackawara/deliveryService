import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import type { DeliveryStatus } from '@/api/dto/booking';
import { RESTRICTION_REASONS } from '@/api/dto/restriction';
import {
  useCancelBookingMutation,
  useCorrectBookingMutation,
  useCreateQuoteMutation,
  useRecordCashArrangementMutation,
  useRecordDeliveryEventMutation,
  useReleaseHoldMutation,
  useRequestLocationPinMutation,
} from '@/api/endpoints/bookings';
import { useRecordCashReceiptMutation } from '@/api/endpoints/finance';
import { useListDriversQuery } from '@/api/endpoints/fleet';
import { useReportFraudMutation } from '@/api/endpoints/restrictions';
import type { BookingDetail } from '@/api/types';
import { FormDialog } from '@/components/FormDialog';
import { MoneyField, moneyFieldError } from '@/components/MoneyField';
import { PermissionGate } from '@/components/PermissionGate';
import { ReasonField, isReasonValid } from '@/components/ReasonField';
import {
  describeStatus,
  deliveryStatusMeta,
  holdCodeMeta,
  restrictionReasonMeta,
} from '@/components/statusMeta';
import { activeHolds, isReleasable, suggestedNextStates } from '@/features/bookings/bookingHelpers';
import { CAPABILITY } from '@/lib/permissions';
import { parseUsdToCents } from '@/lib/money';
import { useGuardedAction } from '@/lib/useGuardedAction';

type DialogName =
  | 'correct'
  | 'quote'
  | 'pin'
  | 'cashArrangement'
  | 'hold'
  | 'event'
  | 'cancel'
  | 'cashReceipt'
  | 'fraud'
  | null;

export interface BookingActionsProps {
  detail: BookingDetail;
  onRefresh: () => void;
}

/**
 * Contextual booking commands (specification section 4.2).
 *
 * Suggested actions are derived from the current state, but every command can still be
 * rejected by the server. There is no editable status dropdown that bypasses capacity,
 * payment, restriction or custody rules, and nothing is applied optimistically.
 */
export function BookingActions({ detail, onRefresh }: BookingActionsProps) {
  const booking = detail.booking;
  const [dialog, setDialog] = useState<DialogName>(null);
  const close = () => setDialog(null);

  const [correctBooking] = useCorrectBookingMutation();
  const [createQuote] = useCreateQuoteMutation();
  const [requestPin] = useRequestLocationPinMutation();
  const [recordCashArrangement] = useRecordCashArrangementMutation();
  const [releaseHold] = useReleaseHoldMutation();
  const [recordEvent] = useRecordDeliveryEventMutation();
  const [cancelBooking] = useCancelBookingMutation();
  const [recordCashReceipt] = useRecordCashReceiptMutation();
  const [reportFraud] = useReportFraudMutation();

  // -- correction ----------------------------------------------------------
  const [pickupAddress, setPickupAddress] = useState(booking.pickup.addressLine);
  const [dropoffAddress, setDropoffAddress] = useState(booking.dropoff.addressLine);
  const [dropoffContact, setDropoffContact] = useState(booking.dropoff.contactName);
  const [dropoffPhone, setDropoffPhone] = useState(booking.dropoff.contactPhone);
  const [operatorNotes, setOperatorNotes] = useState(booking.operatorNotes ?? '');
  const [correctionReason, setCorrectionReason] = useState('');

  const correction = useGuardedAction({
    run: () =>
      correctBooking({
        id: booking.id,
        reason: correctionReason.trim(),
        expectedVersion: booking.version,
        pickup: { addressLine: pickupAddress },
        dropoff: {
          addressLine: dropoffAddress,
          contactName: dropoffContact,
          contactPhone: dropoffPhone,
        },
        operatorNotes,
      }).unwrap(),
    refresh: onRefresh,
    successMessage: 'Booking details corrected.',
    onSuccess: close,
  });

  // -- revised quote -------------------------------------------------------
  const [quoteReason, setQuoteReason] = useState('');
  const quote = useGuardedAction({
    run: () =>
      createQuote({
        id: booking.id,
        adjustmentReason: quoteReason.trim(),
        expectedVersion: booking.version,
      }).unwrap(),
    refresh: onRefresh,
    successMessage: 'Revised quote created. It is a draft price until the customer accepts it.',
    onSuccess: close,
  });

  // -- location pin --------------------------------------------------------
  const [pinEndpoint, setPinEndpoint] = useState<'PICKUP' | 'DROPOFF'>('DROPOFF');
  const [pinReason, setPinReason] = useState('');
  const pin = useGuardedAction({
    run: () =>
      requestPin({ id: booking.id, endpoint: pinEndpoint, reason: pinReason.trim() }).unwrap(),
    refresh: onRefresh,
    successMessage: 'Location pin requested from the sender on WhatsApp.',
    onSuccess: close,
  });

  // -- cash handover contact ----------------------------------------------
  const [handoverName, setHandoverName] = useState(booking.payment.cashHandoverContact?.name ?? '');
  const [handoverPhone, setHandoverPhone] = useState(
    booking.payment.cashHandoverContact?.phone ?? '',
  );
  const [handoverRelationship, setHandoverRelationship] = useState<
    'SENDER' | 'RECIPIENT' | 'OTHER'
  >(booking.payment.cashHandoverContact?.relationship ?? 'RECIPIENT');
  const [agreementRecord, setAgreementRecord] = useState('');
  const arrangement = useGuardedAction({
    run: () =>
      recordCashArrangement({
        id: booking.id,
        contact: {
          name: handoverName.trim(),
          phone: handoverPhone.trim(),
          relationship: handoverRelationship,
        },
        agreementRecord: agreementRecord.trim(),
        expectedVersion: booking.version,
      }).unwrap(),
    refresh: onRefresh,
    successMessage: 'Cash handover contact recorded.',
    onSuccess: close,
  });

  // -- hold release --------------------------------------------------------
  const releasable = activeHolds(booking).filter((hold) => isReleasable(hold.code));
  const [holdCode, setHoldCode] = useState(releasable[0]?.code ?? 'OPERATOR_REVIEW');
  const [holdReason, setHoldReason] = useState('');
  const hold = useGuardedAction({
    run: () =>
      releaseHold({
        id: booking.id,
        code: holdCode as 'OPERATOR_REVIEW' | 'CAPACITY' | 'CASH_ARRANGEMENT',
        reason: holdReason.trim(),
        expectedVersion: booking.version,
      }).unwrap(),
    refresh: onRefresh,
    successMessage: (result) =>
      result.releasedForDispatch
        ? 'Hold released. The booking is ready for dispatch.'
        : 'Hold released. Other holds still apply.',
    onSuccess: close,
  });

  // -- delivery event ------------------------------------------------------
  const nextStates = suggestedNextStates(booking);
  const [eventState, setEventState] = useState<DeliveryStatus | ''>(nextStates[0] ?? '');
  const [eventReason, setEventReason] = useState('');
  const [proofReference, setProofReference] = useState('');
  const event = useGuardedAction({
    run: () =>
      recordEvent({
        id: booking.id,
        newState: eventState as never,
        reason: eventReason.trim() || undefined,
        proofReference: proofReference.trim() || undefined,
        expectedVersion: booking.version,
      }).unwrap(),
    refresh: onRefresh,
    successMessage: 'Delivery event recorded.',
    onSuccess: close,
  });

  // -- cancellation --------------------------------------------------------
  const [cancelReason, setCancelReason] = useState('');
  const cancel = useGuardedAction({
    run: () =>
      cancelBooking({
        id: booking.id,
        reason: cancelReason.trim(),
        operationalConfirmation: true,
        expectedVersion: booking.version,
      }).unwrap(),
    refresh: onRefresh,
    successMessage: 'Booking cancelled.',
    onSuccess: close,
  });

  // -- cash receipt --------------------------------------------------------
  const driversQuery = useListDriversQuery({ townId: booking.townId, limit: 100 });
  const [receiptDriverId, setReceiptDriverId] = useState(booking.assignment?.driverId ?? '');
  const [amountReceived, setAmountReceived] = useState('');
  const [changeGiven, setChangeGiven] = useState('');
  const [receiptEvidence, setReceiptEvidence] = useState('');
  const receipt = useGuardedAction({
    run: (_args: void, idempotencyKey: string) => {
      const received = parseUsdToCents(amountReceived);
      const change =
        changeGiven.trim() === '' ? { ok: true as const, cents: 0 } : parseUsdToCents(changeGiven);
      if (!received.ok || !change.ok) throw new Error('unreachable: validated before submit');
      return recordCashReceipt({
        bookingId: booking.id,
        amountReceivedCents: received.cents,
        changeGivenCents: change.cents,
        driverId: receiptDriverId,
        evidence: receiptEvidence.trim() || undefined,
        idempotencyKey,
      }).unwrap();
    },
    refresh: onRefresh,
    successMessage: (result) =>
      result.shortfallCents > 0
        ? 'Cash receipt recorded with a shortfall. Finance will see the discrepancy.'
        : 'Cash receipt recorded.',
    onSuccess: close,
  });

  // -- fraud report --------------------------------------------------------
  const [fraudReason, setFraudReason] =
    useState<(typeof RESTRICTION_REASONS)[number]>('FRAUDULENT_SHIPMENT');
  const [allegation, setAllegation] = useState('');
  const fraud = useGuardedAction({
    run: () =>
      reportFraud({
        bookingId: booking.id,
        reasonCode: fraudReason,
        allegation: allegation.trim(),
        evidence: [
          {
            kind: 'BOOKING',
            reference: booking.id,
            note: 'Reported from the booking detail screen.',
          },
        ],
      }).unwrap(),
    refresh: onRefresh,
    successMessage: 'Report submitted for administrator review. No restriction has been applied.',
    onSuccess: close,
  });

  const cashDue = booking.payment.method === 'CASH_ON_DELIVERY';
  const amountError = moneyFieldError(amountReceived, true);
  const changeError = changeGiven.trim() === '' ? null : moneyFieldError(changeGiven, false);

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
        <PermissionGate requirement={{ anyRole: ['operator'] }}>
          <Button variant="outlined" onClick={() => setDialog('correct')}>
            Correct details
          </Button>
          <Button variant="outlined" onClick={() => setDialog('quote')}>
            Revised quote
          </Button>
          <Button variant="outlined" onClick={() => setDialog('pin')}>
            Request location pin
          </Button>
          {cashDue ? (
            <Button variant="outlined" onClick={() => setDialog('cashArrangement')}>
              Cash handover contact
            </Button>
          ) : null}
          {releasable.length > 0 ? (
            <Button variant="outlined" onClick={() => setDialog('hold')}>
              Release hold
            </Button>
          ) : null}
          <Button component={RouterLink} to={`/dispatch?booking=${booking.id}`} variant="contained">
            Open dispatch
          </Button>
          {nextStates.length > 0 ? (
            <Button variant="outlined" onClick={() => setDialog('event')}>
              Record delivery event
            </Button>
          ) : null}
          {cashDue ? (
            <PermissionGate requirement={{ anyCapability: [CAPABILITY.cashCollect] }}>
              <Button variant="outlined" onClick={() => setDialog('cashReceipt')}>
                Record cash collected
              </Button>
            </PermissionGate>
          ) : null}
          <Button variant="outlined" color="error" onClick={() => setDialog('cancel')}>
            Cancel booking
          </Button>
          <Button variant="text" color="error" onClick={() => setDialog('fraud')}>
            Report suspected fraud
          </Button>
        </PermissionGate>
      </Stack>

      <FormDialog
        open={dialog === 'correct'}
        title="Correct booking details"
        description="Only details an operator may change are editable. The reason is recorded in the audit trail."
        submitLabel="Save corrections"
        pending={correction.pending}
        error={correction.error}
        unconfirmed={correction.unconfirmed}
        onRetryUnconfirmed={() => void correction.retryUnconfirmed()}
        disabled={!isReasonValid(correctionReason)}
        onClose={close}
        onSubmit={() => void correction.submit()}
      >
        <TextField
          label="Pickup address"
          value={pickupAddress}
          onChange={(event) => setPickupAddress(event.target.value)}
          fullWidth
        />
        <TextField
          label="Drop-off address"
          value={dropoffAddress}
          onChange={(event) => setDropoffAddress(event.target.value)}
          fullWidth
        />
        <TextField
          label="Drop-off contact name"
          value={dropoffContact}
          onChange={(event) => setDropoffContact(event.target.value)}
          fullWidth
        />
        <TextField
          label="Drop-off contact phone"
          value={dropoffPhone}
          onChange={(event) => setDropoffPhone(event.target.value)}
          fullWidth
        />
        <TextField
          label="Operator notes"
          value={operatorNotes}
          onChange={(event) => setOperatorNotes(event.target.value)}
          fullWidth
          multiline
          minRows={2}
        />
        <ReasonField value={correctionReason} onChange={setCorrectionReason} />
      </FormDialog>

      <FormDialog
        open={dialog === 'quote'}
        title="Create a revised quote"
        description="A revised quote is a draft price. It becomes the accepted price only when the customer approves it."
        submitLabel="Create quote"
        pending={quote.pending}
        error={quote.error}
        unconfirmed={quote.unconfirmed}
        onRetryUnconfirmed={() => void quote.retryUnconfirmed()}
        disabled={!isReasonValid(quoteReason)}
        onClose={close}
        onSubmit={() => void quote.submit()}
      >
        <ReasonField
          value={quoteReason}
          onChange={setQuoteReason}
          label="Adjustment reason"
          helperText="Why the price is being recalculated. Recorded with the quote."
        />
      </FormDialog>

      <FormDialog
        open={dialog === 'pin'}
        title="Request a location pin"
        description="The sender is asked on WhatsApp to share the exact location for this endpoint."
        submitLabel="Send request"
        pending={pin.pending}
        error={pin.error}
        unconfirmed={pin.unconfirmed}
        onRetryUnconfirmed={() => void pin.retryUnconfirmed()}
        disabled={!isReasonValid(pinReason)}
        onClose={close}
        onSubmit={() => void pin.submit()}
      >
        <TextField
          select
          label="Endpoint"
          value={pinEndpoint}
          onChange={(event) => setPinEndpoint(event.target.value as 'PICKUP' | 'DROPOFF')}
          fullWidth
        >
          <MenuItem value="PICKUP">Pickup</MenuItem>
          <MenuItem value="DROPOFF">Drop-off</MenuItem>
        </TextField>
        <ReasonField value={pinReason} onChange={setPinReason} />
      </FormDialog>

      <FormDialog
        open={dialog === 'cashArrangement'}
        title="Record the cash handover contact"
        description="The sender remains responsible for the fee. Cash is collected at drop-off by the agreed contact."
        submitLabel="Record arrangement"
        pending={arrangement.pending}
        error={arrangement.error}
        unconfirmed={arrangement.unconfirmed}
        onRetryUnconfirmed={() => void arrangement.retryUnconfirmed()}
        disabled={
          handoverName.trim().length < 2 ||
          handoverPhone.trim().length < 6 ||
          !isReasonValid(agreementRecord)
        }
        onClose={close}
        onSubmit={() => void arrangement.submit()}
      >
        <TextField
          label="Contact name"
          value={handoverName}
          onChange={(event) => setHandoverName(event.target.value)}
          fullWidth
          required
        />
        <TextField
          label="Contact phone"
          value={handoverPhone}
          onChange={(event) => setHandoverPhone(event.target.value)}
          fullWidth
          required
        />
        <TextField
          select
          label="Relationship"
          value={handoverRelationship}
          onChange={(event) =>
            setHandoverRelationship(event.target.value as 'SENDER' | 'RECIPIENT' | 'OTHER')
          }
          fullWidth
        >
          <MenuItem value="SENDER">Sender</MenuItem>
          <MenuItem value="RECIPIENT">Recipient</MenuItem>
          <MenuItem value="OTHER">Other</MenuItem>
        </TextField>
        <ReasonField
          value={agreementRecord}
          onChange={setAgreementRecord}
          label="Agreement record"
          helperText="How and when the sender agreed to this arrangement."
        />
      </FormDialog>

      <FormDialog
        open={dialog === 'hold'}
        title="Release a hold"
        description="Only operator review, capacity and cash-arrangement holds can be released here."
        submitLabel="Release hold"
        pending={hold.pending}
        error={hold.error}
        unconfirmed={hold.unconfirmed}
        onRetryUnconfirmed={() => void hold.retryUnconfirmed()}
        disabled={!isReasonValid(holdReason) || releasable.length === 0}
        onClose={close}
        onSubmit={() => void hold.submit()}
      >
        <TextField
          select
          label="Hold"
          value={holdCode}
          onChange={(event) => setHoldCode(event.target.value as typeof holdCode)}
          fullWidth
        >
          {releasable.map((entry) => (
            <MenuItem key={entry.code} value={entry.code}>
              {describeStatus(holdCodeMeta, entry.code).label} — {entry.reason}
            </MenuItem>
          ))}
        </TextField>
        <ReasonField value={holdReason} onChange={setHoldReason} />
      </FormDialog>

      <FormDialog
        open={dialog === 'event'}
        title="Record a delivery event"
        description="Only transitions the backend allows from the current state are offered, and it still validates the request."
        submitLabel="Record event"
        pending={event.pending}
        error={event.error}
        unconfirmed={event.unconfirmed}
        onRetryUnconfirmed={() => void event.retryUnconfirmed()}
        disabled={eventState === ''}
        onClose={close}
        onSubmit={() => void event.submit()}
      >
        <TextField
          select
          label="New state"
          value={eventState}
          onChange={(element) => setEventState(element.target.value as typeof eventState)}
          fullWidth
          required
        >
          {nextStates.map((state) => (
            <MenuItem key={state} value={state}>
              {describeStatus(deliveryStatusMeta, state).label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="Proof reference"
          value={proofReference}
          onChange={(element) => setProofReference(element.target.value)}
          fullWidth
          helperText="Handover code reference or other proof the backend expects, when applicable."
        />
        <ReasonField value={eventReason} onChange={setEventReason} required={false} />
      </FormDialog>

      <FormDialog
        open={dialog === 'cancel'}
        title="Cancel this booking"
        description="Cancelling does not refund a payment or release a parcel already in custody; those are handled separately."
        submitLabel="Cancel booking"
        pending={cancel.pending}
        error={cancel.error}
        unconfirmed={cancel.unconfirmed}
        onRetryUnconfirmed={() => void cancel.retryUnconfirmed()}
        disabled={!isReasonValid(cancelReason)}
        onClose={close}
        onSubmit={() => void cancel.submit()}
      >
        <ReasonField value={cancelReason} onChange={setCancelReason} />
      </FormDialog>

      <FormDialog
        open={dialog === 'cashReceipt'}
        title="Record cash collected"
        description="Amount received, change given and any shortfall are recorded separately."
        submitLabel="Record receipt"
        pending={receipt.pending}
        error={receipt.error}
        unconfirmed={receipt.unconfirmed}
        onRetryUnconfirmed={() => void receipt.retryUnconfirmed()}
        disabled={Boolean(amountError) || Boolean(changeError) || receiptDriverId === ''}
        onClose={close}
        onSubmit={() => void receipt.submit()}
      >
        <Typography variant="body2">
          Amount due: <strong>{(booking.payment.amountDueCents / 100).toFixed(2)} USD</strong>
        </Typography>
        <TextField
          select
          label="Driver who collected"
          value={receiptDriverId}
          onChange={(element) => setReceiptDriverId(element.target.value)}
          fullWidth
          required
        >
          {(driversQuery.data?.items ?? []).map((row) => (
            <MenuItem key={row.driver.id} value={row.driver.id}>
              {row.driver.name}
            </MenuItem>
          ))}
        </TextField>
        <MoneyField
          label="Amount received"
          value={amountReceived}
          onChange={setAmountReceived}
          required
        />
        <MoneyField
          label="Change given"
          value={changeGiven}
          onChange={setChangeGiven}
          helperText="Leave blank when no change was given."
        />
        <TextField
          label="Evidence reference"
          value={receiptEvidence}
          onChange={(element) => setReceiptEvidence(element.target.value)}
          fullWidth
        />
      </FormDialog>

      <FormDialog
        open={dialog === 'fraud'}
        title="Report suspected fraud"
        description="This records an allegation for administrator review. It does not restrict the customer, and a missing parcel photo is not evidence of fraud."
        submitLabel="Submit report"
        pending={fraud.pending}
        error={fraud.error}
        unconfirmed={fraud.unconfirmed}
        onRetryUnconfirmed={() => void fraud.retryUnconfirmed()}
        disabled={allegation.trim().length < 5}
        onClose={close}
        onSubmit={() => void fraud.submit()}
      >
        <TextField
          select
          label="Reason"
          value={fraudReason}
          onChange={(element) => setFraudReason(element.target.value as typeof fraudReason)}
          fullWidth
        >
          {RESTRICTION_REASONS.map((reason) => (
            <MenuItem key={reason} value={reason}>
              {describeStatus(restrictionReasonMeta, reason).label}
            </MenuItem>
          ))}
        </TextField>
        <TextField
          label="What was observed"
          value={allegation}
          onChange={(element) => setAllegation(element.target.value)}
          fullWidth
          multiline
          minRows={3}
          required
          helperText="Describe the facts. At least five characters."
        />
      </FormDialog>
    </>
  );
}
