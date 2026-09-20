import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useNavigate } from 'react-router-dom';

import { ENQUIRY_CATEGORIES, ENQUIRY_STATUSES } from '@/api/dto/enquiry';
import { useListEnquiriesQuery } from '@/api/endpoints/enquiries';
import type { NormalizedApiError } from '@/api/errors';
import { POLLING, polled } from '@/api/polling';
import type { Enquiry } from '@/api/types';
import { useTownScope } from '@/app/useTownScope';
import { PageHeader } from '@/components/PageHeader';
import { ResourceTable, type Column } from '@/components/ResourceTable';
import { StatusChip } from '@/components/StatusChip';
import { describeStatus, enquiryCategoryMeta, enquiryStatusMeta } from '@/components/statusMeta';
import { formatAge } from '@/lib/datetime';
import { useNumberQueryParam, useQueryParam } from '@/lib/useUrlState';

const PAGE_SIZE = 25;

/** Support queue (specification section 4.5). */
export function EnquiriesPage() {
  const navigate = useNavigate();
  const { townId } = useTownScope();
  const [status, setStatus] = useQueryParam('status');
  const [category, setCategory] = useQueryParam('category');
  const [skip, setSkip] = useNumberQueryParam('skip', 0);

  const query = useListEnquiriesQuery(
    { townId, status: status as never, category: category as never, limit: PAGE_SIZE, skip },
    polled(POLLING.finance),
  );

  const columns: Array<Column<Enquiry>> = [
    {
      id: 'reference',
      header: 'Ticket',
      render: (enquiry) => (
        <Stack spacing={0.25}>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {enquiry.ticketReference}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {formatAge(enquiry.createdAt)}
          </Typography>
        </Stack>
      ),
    },
    {
      id: 'category',
      header: 'Category',
      render: (enquiry) => (
        <StatusChip descriptor={describeStatus(enquiryCategoryMeta, enquiry.category)} />
      ),
    },
    { id: 'name', header: 'Customer name', render: (enquiry) => enquiry.name },
    {
      id: 'message',
      header: 'Message',
      minWidth: 260,
      render: (enquiry) => (
        <Typography
          variant="body2"
          sx={{
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {enquiry.message}
        </Typography>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      render: (enquiry) => (
        <StatusChip descriptor={describeStatus(enquiryStatusMeta, enquiry.status)} />
      ),
    },
    {
      id: 'owner',
      header: 'Owner',
      render: (enquiry) =>
        enquiry.owner ? (
          <Typography variant="body2">
            {enquiry.owner.label ?? enquiry.owner.type.toLowerCase()}
          </Typography>
        ) : (
          <Typography variant="body2" color="text.secondary">
            Unassigned
          </Typography>
        ),
    },
    {
      id: 'replies',
      header: 'Replies',
      align: 'right',
      render: (enquiry) => enquiry.replies.length,
    },
  ];

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Customer support requests submitted from WhatsApp."
        crumbs={[{ label: 'Operations' }, { label: 'Enquiries' }]}
      />

      <Stack spacing={2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            select
            size="small"
            label="Status"
            value={status ?? ''}
            onChange={(event) => {
              setStatus(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 200 }}
          >
            <MenuItem value="">Any status</MenuItem>
            {ENQUIRY_STATUSES.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(enquiryStatusMeta, value).label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Category"
            value={category ?? ''}
            onChange={(event) => {
              setCategory(event.target.value || null);
              setSkip(0);
            }}
            sx={{ minWidth: 220 }}
          >
            <MenuItem value="">Any category</MenuItem>
            {ENQUIRY_CATEGORIES.map((value) => (
              <MenuItem key={value} value={value}>
                {describeStatus(enquiryCategoryMeta, value).label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>

        <ResourceTable
          caption="Enquiry queue"
          columns={columns}
          rows={query.data?.items ?? []}
          getRowId={(enquiry) => enquiry.id}
          isLoading={query.isLoading}
          isFetching={query.isFetching}
          error={query.error as NormalizedApiError | undefined}
          onRetry={() => void query.refetch()}
          emptyTitle="No enquiries in this view"
          emptyDescription="Adjust the filters or switch town."
          onRowClick={(enquiry) => navigate(`/enquiries/${enquiry.id}`)}
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
