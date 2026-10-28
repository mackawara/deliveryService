import { Button, Stack, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import type { OwnerFoodScope } from '@/api/dto/foodFinance';
import {
  useGetShopFoodSettlementQuery,
  useLazyExportShopFoodSettlementQuery,
} from '@/api/endpoints/foodFinance';
import type { NormalizedApiError } from '@/api/errors';
import { ApiError } from '@/components/ApiError';
import { PageHeader } from '@/components/PageHeader';
import { downloadFinanceCsv, FoodStatementContent, OwnerFinanceBoundary } from './foodFinanceView';

export function ShopSettlementPage() {
  const { id = '' } = useParams();
  return (
    <OwnerFinanceBoundary>
      {(scope) => (
        <ShopStatement key={`${scope.ownerId}:${scope.shopId}:${id}`} scope={scope} id={id} />
      )}
    </OwnerFinanceBoundary>
  );
}

function ShopStatement({ scope, id }: { scope: OwnerFoodScope; id: string }) {
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const query = useGetShopFoodSettlementQuery(
    { ...scope, id },
    { skip: !id, refetchOnFocus: true, refetchOnReconnect: true },
  );
  const [exportStatement, exportState] = useLazyExportShopFoodSettlementQuery();
  const [exportError, setExportError] = useState<NormalizedApiError>();
  const forbidden = ['forbidden', 'unauthenticated', 'notFound'].includes(
    (query.error as NormalizedApiError | undefined)?.kind ?? '',
  );
  const statement =
    forbidden || query.currentData?.shopId !== scope.shopId ? undefined : query.currentData;
  async function exportCsv() {
    setExportError(undefined);
    try {
      const result = await exportStatement({ ...scope, id }).unwrap();
      if (active.current) downloadFinanceCsv(result.csv, `${scope.shopId}-statement-${id}.csv`);
    } catch (caught) {
      if (active.current) setExportError(caught as NormalizedApiError);
    }
  }
  return (
    <Stack spacing={2}>
      <PageHeader
        title="Settlement statement"
        description="Amounts, included orders and payout destination are recorded by the delivery service for this branch."
        actions={
          <>
            <Button component={RouterLink} to={`/shop/${scope.shopId}/earnings`}>
              Back to earnings
            </Button>
            <Button onClick={() => void query.refetch()} disabled={!id || query.isFetching}>
              Refresh
            </Button>
            {statement ? (
              <>
                <Button onClick={() => window.print()} sx={{ displayPrint: 'none' }}>
                  Print statement
                </Button>
                <Button
                  onClick={() => void exportCsv()}
                  disabled={exportState.isFetching}
                  sx={{ displayPrint: 'none' }}
                >
                  Export statement
                </Button>
              </>
            ) : null}
          </>
        }
      />
      <ApiError
        error={query.error as NormalizedApiError | undefined}
        onRetry={id ? () => void query.refetch() : undefined}
      />
      <ApiError error={exportError} />
      {!id ? (
        <Typography>No statement was selected.</Typography>
      ) : query.isFetching && !statement ? (
        <Typography role="status">Loading settlement statement…</Typography>
      ) : statement ? (
        <FoodStatementContent statement={statement} />
      ) : null}
    </Stack>
  );
}
