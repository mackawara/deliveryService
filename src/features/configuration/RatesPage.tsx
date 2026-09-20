import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useMemo, useState } from 'react';

import type { ZonePairRate } from '@/api/dto/configuration';
import {
  useListParcelPresetsQuery,
  useListRateCardsQuery,
  useListZonesQuery,
  usePublishRateCardMutation,
  useUpdateRateCardMutation,
} from '@/api/endpoints/configuration';
import type { NormalizedApiError } from '@/api/errors';
import { useTownScope } from '@/app/useTownScope';
import { ApiError } from '@/components/ApiError';
import { EmptyState } from '@/components/EmptyState';
import { FormDialog } from '@/components/FormDialog';
import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { PermissionGate } from '@/components/PermissionGate';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import { UnsavedChangesGuard } from '@/components/UnsavedChangesGuard';
import { describeStatus, rateCardStatusMeta } from '@/components/statusMeta';
import { dateInputToIso, formatDateTime } from '@/lib/datetime';
import { centsToInput, parseUsdToCents } from '@/lib/money';
import { useGuardedAction } from '@/lib/useGuardedAction';

function rateKey(from: string, to: string, parcelClass: string): string {
  return `${from}|${to}|${parcelClass}`;
}

/**
 * Rate cards (specification section 4.8).
 *
 * A readable pickup-zone × drop-off-zone matrix by parcel class, with missing
 * combinations shown. Draft changes are saved before publishing, and publishing
 * confirms the effective date and reports coverage gaps. Accepted bookings keep the
 * quote snapshot they were given.
 */
export function RatesPage() {
  const { townId, towns } = useTownScope();
  const cardsQuery = useListRateCardsQuery({ townId: townId ?? '' }, { skip: !townId });
  const zonesQuery = useListZonesQuery({ townId: townId ?? '' }, { skip: !townId });
  const presetsQuery = useListParcelPresetsQuery({ townId: townId ?? '' }, { skip: !townId });
  const [updateRateCard] = useUpdateRateCardMutation();
  const [publishRateCard] = usePublishRateCardMutation();

  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [parcelClass, setParcelClass] = useState<string>('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [coverageGaps, setCoverageGaps] = useState<string[] | null>(null);

  const cards = cardsQuery.data ?? [];
  const card = cards.find((entry) => entry.id === selectedCardId) ?? cards[0] ?? null;
  const zones = useMemo(
    () => (zonesQuery.data ?? []).filter((zone) => zone.status === 'ACTIVE'),
    [zonesQuery.data],
  );

  const parcelClasses = useMemo(() => {
    const fromPresets = new Set((presetsQuery.data ?? []).map((preset) => preset.parcelClass));
    for (const rate of card?.zonePairRates ?? []) fromPresets.add(rate.parcelClass);
    return [...fromPresets].sort();
  }, [presetsQuery.data, card]);

  const activeClass = parcelClass || parcelClasses[0] || '';

  const existing = useMemo(() => {
    const map = new Map<string, number>();
    for (const rate of card?.zonePairRates ?? []) {
      map.set(rateKey(rate.fromZoneCode, rate.toZoneCode, rate.parcelClass), rate.priceCents);
    }
    return map;
  }, [card]);

  const dirty = Object.keys(draft).length > 0;

  const save = useGuardedAction({
    run: () => {
      if (!card) throw new Error('unreachable: guarded by the dialog');
      const merged = new Map(existing);
      for (const [key, value] of Object.entries(draft)) {
        const parsed = parseUsdToCents(value);
        if (parsed.ok) merged.set(key, parsed.cents);
      }
      const zonePairRates: ZonePairRate[] = [...merged.entries()].map(([key, priceCents]) => {
        const [fromZoneCode, toZoneCode, rateClass] = key.split('|');
        return {
          fromZoneCode: fromZoneCode!,
          toZoneCode: toZoneCode!,
          parcelClass: rateClass!,
          priceCents,
        };
      });
      return updateRateCard({ id: card.id, zonePairRates, expectedVersion: card.version }).unwrap();
    },
    refresh: () => void cardsQuery.refetch(),
    successMessage: 'Draft rates saved. They are not charged until the card is published.',
    onSuccess: () => setDraft({}),
  });

  const publish = useGuardedAction({
    run: () => {
      if (!card) throw new Error('unreachable: guarded by the dialog');
      const iso = dateInputToIso(effectiveFrom);
      if (!iso) throw new Error('unreachable: guarded by the dialog');
      return publishRateCard({
        id: card.id,
        effectiveFrom: iso,
        expectedVersion: card.version,
      }).unwrap();
    },
    refresh: () => void cardsQuery.refetch(),
    successMessage: 'Rate card published. Accepted bookings keep their original quote snapshot.',
    onSuccess: (result) => {
      setCoverageGaps(result.coverageGaps);
      setPublishOpen(false);
    },
  });

  if (!townId) {
    return (
      <>
        <PageHeader
          title="Rate cards"
          crumbs={[{ label: 'Administration' }, { label: 'Rate cards' }]}
        />
        <EmptyState
          title="Choose a town"
          description="Rate cards belong to one town. Select a town in the top bar."
        />
      </>
    );
  }

  return (
    <>
      <UnsavedChangesGuard when={dirty} />
      <PageHeader
        title="Rate cards"
        description={`Pricing for ${towns.find((town) => town.id === townId)?.name ?? 'the selected town'}.`}
        crumbs={[{ label: 'Administration' }, { label: 'Rate cards' }]}
        actions={
          <PermissionGate requirement={{ anyRole: ['admin'] }}>
            <Button
              variant="outlined"
              disabled={!dirty || save.pending}
              onClick={() => void save.submit()}
            >
              Save draft
            </Button>
            <Button
              variant="contained"
              disabled={!card || card.status !== 'DRAFT' || dirty}
              onClick={() => setPublishOpen(true)}
            >
              Publish
            </Button>
          </PermissionGate>
        }
      />

      <Stack spacing={2}>
        {cardsQuery.error ? (
          <ApiError
            error={cardsQuery.error as NormalizedApiError}
            onRetry={() => void cardsQuery.refetch()}
          />
        ) : null}

        {coverageGaps ? (
          <Alert
            severity={coverageGaps.length > 0 ? 'warning' : 'success'}
            onClose={() => setCoverageGaps(null)}
          >
            {coverageGaps.length > 0
              ? `Published with ${coverageGaps.length} coverage gap(s): ${coverageGaps.join(', ')}`
              : 'Published with complete coverage.'}
          </Alert>
        ) : null}

        {dirty ? (
          <Alert severity="info">
            Draft changes are held locally until you save them. Publishing is a separate, confirmed
            step.
          </Alert>
        ) : null}

        <Section title="Rate cards for this town">
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              select
              size="small"
              label="Rate card"
              value={card?.id ?? ''}
              onChange={(event) => {
                setSelectedCardId(event.target.value);
                setDraft({});
              }}
              sx={{ minWidth: 260 }}
            >
              {cards.map((entry) => (
                <MenuItem key={entry.id} value={entry.id}>
                  v{entry.version} · {describeStatus(rateCardStatusMeta, entry.status).label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              label="Parcel class"
              value={activeClass}
              onChange={(event) => setParcelClass(event.target.value)}
              sx={{ minWidth: 220 }}
            >
              {parcelClasses.map((value) => (
                <MenuItem key={value} value={value}>
                  {value}
                </MenuItem>
              ))}
            </TextField>
            {card ? (
              <StatusChip
                descriptor={describeStatus(rateCardStatusMeta, card.status)}
                size="medium"
              />
            ) : null}
          </Stack>

          {card ? (
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mt: 1 }}>
              {card.publishedAt
                ? `Published ${formatDateTime(card.publishedAt)}${card.effectiveFrom ? `, effective ${formatDateTime(card.effectiveFrom)}` : ''}`
                : 'Not published yet.'}
            </Typography>
          ) : null}
        </Section>

        {!card ? (
          <EmptyState
            title="No rate card for this town"
            description="An administrator creates the first rate card before quotes can be produced."
          />
        ) : zones.length === 0 ? (
          <EmptyState title="No active zones" description="Add zones before pricing zone pairs." />
        ) : (
          <Section
            title={`Pickup zone × drop-off zone — ${activeClass || 'no parcel class'}`}
            description="Empty cells are combinations the card does not price. They are shown, never assumed."
          >
            <TableContainer sx={{ overflowX: 'auto' }}>
              <Table size="small" aria-label={`Rates for parcel class ${activeClass}`}>
                <TableHead>
                  <TableRow>
                    <TableCell>Pickup ↓ / Drop-off →</TableCell>
                    {zones.map((zone) => (
                      <TableCell key={zone.id} align="right">
                        {zone.code}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {zones.map((fromZone) => (
                    <TableRow key={fromZone.id}>
                      <TableCell component="th" scope="row">
                        {fromZone.code}
                      </TableCell>
                      {zones.map((toZone) => {
                        const key = rateKey(fromZone.code, toZone.code, activeClass);
                        const saved = existing.get(key);
                        const value =
                          draft[key] ?? (saved === undefined ? '' : centsToInput(saved));
                        return (
                          <TableCell key={toZone.id} align="right">
                            <PermissionGate
                              requirement={{ anyRole: ['admin'] }}
                              fallback={
                                saved === undefined ? (
                                  <Typography variant="caption" color="warning.main">
                                    Not priced
                                  </Typography>
                                ) : (
                                  <Money cents={saved} />
                                )
                              }
                            >
                              <TextField
                                size="small"
                                value={value}
                                onChange={(event) =>
                                  setDraft((current) => ({ ...current, [key]: event.target.value }))
                                }
                                placeholder="—"
                                inputMode="decimal"
                                sx={{ width: 96 }}
                                slotProps={{
                                  htmlInput: {
                                    'aria-label': `Price ${fromZone.code} to ${toZone.code}`,
                                  },
                                }}
                                error={value !== '' && !parseUsdToCents(value).ok}
                              />
                            </PermissionGate>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Section>
        )}
      </Stack>

      <FormDialog
        open={publishOpen}
        title="Publish this rate card"
        description="Confirm the effective date. Bookings that already accepted a quote keep the price they were given."
        submitLabel="Publish rate card"
        pending={publish.pending}
        error={publish.error}
        unconfirmed={publish.unconfirmed}
        onRetryUnconfirmed={() => void publish.retryUnconfirmed()}
        disabled={dateInputToIso(effectiveFrom) === null}
        onClose={() => setPublishOpen(false)}
        onSubmit={() => void publish.submit()}
      >
        <TextField
          label="Effective from"
          type="date"
          value={effectiveFrom}
          onChange={(event) => setEffectiveFrom(event.target.value)}
          fullWidth
          required
          slotProps={{ inputLabel: { shrink: true } }}
        />
        <Typography variant="body2" color="text.secondary">
          The server reports any zone pair or parcel class this card does not cover.
        </Typography>
      </FormDialog>
    </>
  );
}
