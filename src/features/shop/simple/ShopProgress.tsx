import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CelebrationIcon from '@mui/icons-material/Celebration';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { Link as RouterLink } from 'react-router-dom';

import type { WireShop } from '@/api/dto/shop';
import { useGetShopOverviewQuery } from '@/api/endpoints/shop';
import { shopProgress } from './progress';

/** "How far along am I, and what next?", in the shop shell (issue 34). */
export function ShopProgress({ shop }: { shop: WireShop }) {
  const overview = useGetShopOverviewQuery(shop._id, { pollingInterval: 15_000 });
  if (shop.approvalState === 'APPROVED')
    return (
      <Alert severity="success" icon={<CelebrationIcon />} sx={{ mb: 2 }}>
        <AlertTitle>Your shop is live</AlertTitle>
        Customers can order your items that have a photo and are in stock.
      </Alert>
    );
  if (!overview.data) return null;
  if (shop.approvalState === 'REJECTED' || shop.approvalState === 'SUSPENDED')
    return (
      <Alert severity="warning" sx={{ mb: 2 }}>
        <AlertTitle>
          {shop.approvalState === 'REJECTED'
            ? 'Your shop was not approved yet'
            : 'Your shop is paused'}
        </AlertTitle>
        {shop.approvalReason ?? 'The delivery team will contact you on WhatsApp.'}
      </Alert>
    );
  const { steps, next } = shopProgress(shop, overview.data.readiness);
  const position = steps.findIndex((step) => step === next) + 1;
  return (
    <Card variant="outlined" sx={{ mb: 2 }} component="section" aria-label="Your progress">
      <CardContent sx={{ '&:last-child': { pb: 2 } }}>
        <Stack spacing={1.5}>
          <Box
            component="ol"
            sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, listStyle: 'none', p: 0, m: 0 }}
          >
            {steps.map((step, index) => (
              <Box
                component="li"
                key={step.key}
                aria-current={step === next ? 'step' : undefined}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  color: step.done
                    ? 'success.main'
                    : step === next
                      ? 'text.primary'
                      : 'text.secondary',
                  fontWeight: step === next ? 700 : 400,
                }}
              >
                {step.done ? (
                  <CheckCircleIcon fontSize="small" aria-hidden />
                ) : (
                  <RadioButtonUncheckedIcon fontSize="small" aria-hidden />
                )}
                <Typography variant="body2" component="span" sx={{ fontWeight: 'inherit' }}>
                  {index + 1}. {step.label}
                  <Box component="span" sx={visuallyHidden}>
                    {step.done ? ' (done)' : ' (to do)'}
                  </Box>
                </Typography>
              </Box>
            ))}
          </Box>
          {next?.key === 'APPROVAL' ? (
            <Typography>
              Everything is in. The delivery team is checking your shop, and we will tell you on
              WhatsApp when it is approved. Meanwhile you can add more items and photos.
            </Typography>
          ) : next ? (
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={1}
              sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between' }}
            >
              <Typography>
                <strong>
                  Next, step {position}: {next.label}.
                </strong>{' '}
                {next.reason}
              </Typography>
              {next.to ? (
                <Button
                  variant="contained"
                  component={RouterLink}
                  to={next.to}
                  sx={{ minHeight: 44, flexShrink: 0 }}
                >
                  {next.label}
                </Button>
              ) : null}
            </Stack>
          ) : null}
        </Stack>
      </CardContent>
    </Card>
  );
}

const visuallyHidden = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
} as const;
