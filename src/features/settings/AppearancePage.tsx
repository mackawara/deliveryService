import Card from '@mui/material/Card';
import CardActionArea from '@mui/material/CardActionArea';
import CardContent from '@mui/material/CardContent';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Radio from '@mui/material/Radio';
import RadioGroup from '@mui/material/RadioGroup';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';

import { Money } from '@/components/Money';
import { PageHeader } from '@/components/PageHeader';
import { Section } from '@/components/Section';
import { StatusChip } from '@/components/StatusChip';
import { STATUS_TONES } from '@/theme/tokens';
import { useThemeController } from '@/theme/useThemeController';

const TONE_LABELS: Record<string, string> = {
  neutral: 'Neutral',
  info: 'Information',
  progress: 'In progress',
  positive: 'Complete',
  caution: 'Needs attention',
  critical: 'Problem',
};

/**
 * Appearance settings (specification sections 3 and 7).
 *
 * Switching preset applies immediately without a reload, a sign-out or a lost form
 * draft. Only the preset identifier is stored in this browser.
 */
export function AppearancePage() {
  const { presetId, setPresetId, presets, density, setDensity } = useThemeController();

  return (
    <>
      <PageHeader
        title="Appearance"
        description="Brand preset and interface density for this browser."
        crumbs={[{ label: 'Settings' }, { label: 'Appearance' }]}
      />

      <Stack spacing={2}>
        <Section
          title="Brand theme"
          description="Applies immediately. Your choice is remembered in this browser only, and an unknown saved value falls back to the deployment default."
        >
          <Grid container spacing={2}>
            {presets.map((preset) => (
              <Grid key={preset.id} size={{ xs: 12, md: 6 }}>
                <Card
                  variant="outlined"
                  sx={{ borderColor: preset.id === presetId ? 'primary.main' : 'divider' }}
                >
                  <CardActionArea onClick={() => setPresetId(preset.id)}>
                    <CardContent>
                      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                        <Radio checked={preset.id === presetId} tabIndex={-1} />
                        <Stack>
                          <Typography variant="subtitle1">{preset.label}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            {preset.description}
                          </Typography>
                        </Stack>
                      </Stack>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Section>

        <Section
          title="Interface density"
          description="Comfortable keeps 44px touch targets for tablets; compact fits more rows on a desktop screen."
        >
          <RadioGroup
            value={density}
            onChange={(event) => setDensity(event.target.value as 'comfortable' | 'compact')}
          >
            <FormControlLabel value="comfortable" control={<Radio />} label="Comfortable" />
            <FormControlLabel value="compact" control={<Radio />} label="Compact" />
          </RadioGroup>
        </Section>

        <Section
          title="Preview"
          description="Status meaning is carried by label, icon and outline style as well as tone, so both presets stay readable."
        >
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
              {STATUS_TONES.map((tone) => (
                <StatusChip
                  key={tone}
                  size="medium"
                  descriptor={{ label: TONE_LABELS[tone] ?? tone, tone, icon: 'unknown' }}
                />
              ))}
            </Stack>
            <Typography variant="body2">
              Example amount: <Money cents={1250} emphasis /> · unavailable amount:{' '}
              <Money cents={null} />
            </Typography>
          </Stack>
        </Section>
      </Stack>
    </>
  );
}
