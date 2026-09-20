import SearchIcon from '@mui/icons-material/Search';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import InputAdornment from '@mui/material/InputAdornment';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import type { WireCustomerRow } from '@/api/dto/customer';
import { useSearchCustomersQuery } from '@/api/endpoints/customers';
import type { NormalizedApiError } from '@/api/errors';
import { useTownScope } from '@/app/useTownScope';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { describeStatus, restrictionStatusMeta } from '@/components/statusMeta';
import { useNumberQueryParam } from '@/lib/useUrlState';

const PAGE_SIZE = 25;

/**
 * Customer search (specification section 4.5).
 *
 * The backend requires a phone or a town filter. The phone term stays in page state so
 * a personal number never appears in a shareable URL.
 */
export function CustomersPage() {
  const navigate = useNavigate();
  const { townId, towns } = useTownScope();
  const [phoneInput, setPhoneInput] = useState('');
  const [submittedPhone, setSubmittedPhone] = useState('');
  const [skip, setSkip] = useNumberQueryParam('skip', 0);

  const canSearch = submittedPhone.trim().length > 0 || Boolean(townId);
  const query = useSearchCustomersQuery(
    { phone: submittedPhone.trim() || null, townId, limit: PAGE_SIZE, skip },
    { skip: !canSearch },
  );

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmittedPhone(phoneInput);
    setSkip(0);
  }

  const columns: Array<Column<WireCustomerRow>> = [
    {
      id: 'name',
      header: 'Customer',
      render: (row) => (
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {row.name ?? 'Name not confirmed'}
        </Typography>
      ),
    },
    { id: 'phone', header: 'Phone', render: (row) => row.phone },
    {
      id: 'town',
      header: 'Town',
      render: (row) =>
        towns.find((town) => town.id === row.townId)?.name ?? row.townId ?? 'No town recorded',
    },
    {
      id: 'restriction',
      header: 'Restriction status',
      render: (row) =>
        row.restrictionStatus === 'RESTRICTED' ? (
          <StatusChip descriptor={describeStatus(restrictionStatusMeta, 'ACTIVE')} />
        ) : (
          <Typography variant="body2" color="text.secondary">
            No active restriction
          </Typography>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Customers"
        description="Search by phone number, or browse the selected town."
        crumbs={[{ label: 'Operations' }, { label: 'Customers' }]}
      />

      <Stack spacing={2}>
        <form onSubmit={onSubmit}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              label="Phone number"
              value={phoneInput}
              onChange={(event) => setPhoneInput(event.target.value)}
              size="small"
              sx={{ minWidth: 260 }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              helperText="Kept in page state, never placed in the URL."
            />
            <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-start' }}>
              Search
            </Button>
          </Stack>
        </form>

        {!canSearch ? (
          <Alert severity="info">
            Enter a phone number or choose a town. The backend requires at least one of these
            filters.
          </Alert>
        ) : null}

        <ResourceTable
          caption="Customer search results"
          columns={columns}
          rows={query.data?.items ?? []}
          getRowId={(row) => row.id}
          isLoading={query.isLoading && canSearch}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle={canSearch ? 'No customers matched' : 'Search to begin'}
          emptyDescription={
            canSearch
              ? 'Check the number, or switch town. Search covers the filters the backend accepts.'
              : undefined
          }
          onRowClick={(row) => navigate(`/customers/${row.id}`)}
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
