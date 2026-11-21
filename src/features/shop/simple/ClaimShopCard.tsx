import Accordion from '@mui/material/Accordion';
import AccordionDetails from '@mui/material/AccordionDetails';
import AccordionSummary from '@mui/material/AccordionSummary';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useState } from 'react';

import { useSubmitShopClaimMutation } from '@/api/endpoints/shop';
import { ApiError } from '@/components/ApiError';
import { useGuardedAction } from '@/lib/useGuardedAction';

/** Claiming a pilot shop stays available, behind "Add another shop" (issue 34). */
export function ClaimShopCard() {
  const [shopId, setShopId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [submitClaim] = useSubmitShopClaimMutation();
  const claim = useGuardedAction({
    run: (_: undefined, key: string) =>
      submitClaim({
        shopId: shopId.trim(),
        evidence: evidence.trim(),
        idempotencyKey: key,
      }).unwrap(),
    successMessage: 'Request sent. The delivery team will check it and reply on WhatsApp.',
    onSuccess: () => {
      setShopId('');
      setEvidence('');
    },
  });
  return (
    <Accordion variant="outlined" disableGutters>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ minHeight: 48 }}>
        <Typography variant="subtitle1">The delivery team already set up my shop</Typography>
      </AccordionSummary>
      <AccordionDetails>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Enter the shop code the delivery team gave you. Your items and past orders stay with the
            shop.
          </Typography>
          <TextField label="Shop code" value={shopId} onChange={(e) => setShopId(e.target.value)} />
          <TextField
            label="How can we tell it is your shop?"
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            multiline
            minRows={3}
            helperText={`${evidence.length}/2000`}
            slotProps={{ htmlInput: { maxLength: 2000 } }}
          />
          {claim.error ? <ApiError error={claim.error} /> : null}
          <Button
            variant="outlined"
            onClick={() => void claim.submit()}
            disabled={claim.pending || !shopId.trim() || evidence.trim().length < 10}
            sx={{ minHeight: 44 }}
          >
            {claim.pending ? 'Sending…' : 'Send request'}
          </Button>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
}
