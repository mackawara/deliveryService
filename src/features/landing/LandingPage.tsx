import LoginIcon from '@mui/icons-material/Login';
import StorefrontIcon from '@mui/icons-material/Storefront';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Card from '@mui/material/Card';
import CardContent from '@mui/material/CardContent';
import Container from '@mui/material/Container';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { alpha, type SxProps, type Theme } from '@mui/material/styles';
import { Link as RouterLink } from 'react-router-dom';

import { ADMIN_HOME, LOGIN_PATH, SHOP_HOME } from '@/auth/returnPath';
import { appConfig } from '@/config';
import {
  DeliveryRouteGraphic,
  StepGraphic,
  type StepGraphicKind,
} from '@/features/landing/LandingGraphics';
import { REDUCED_MOTION, fadeUp, float, shimmer } from '@/features/landing/motion';
import { Reveal } from '@/features/landing/Reveal';

/** The one login, opened for someone who wants to register a shop. */
const SHOP_SIGNUP_PATH = `${LOGIN_PATH}?intent=shop`;

const STEPS: { kind: StepGraphicKind; title: string; body: string }[] = [
  {
    kind: 'order',
    title: 'A customer orders',
    body: 'They pick items from the shop’s menu on WhatsApp, or book a parcel pickup, and confirm the price.',
  },
  {
    kind: 'prepare',
    title: 'The shop accepts',
    body: 'The order lands in the shop’s inbox. The shop accepts it, sets a preparation time and marks it ready.',
  },
  {
    kind: 'dispatch',
    title: 'A rider is dispatched',
    body: 'Operations match the order to a nearby rider, who collects it and is tracked along the way.',
  },
  {
    kind: 'deliver',
    title: 'Delivered and settled',
    body: 'The rider hands over the order and takes payment. Shop earnings and rider cash are reconciled.',
  },
];

/** Hero content arrives one piece after another. */
const enter = (order: number) => ({
  animation: `${fadeUp} 700ms cubic-bezier(0.2, 0.7, 0.2, 1) ${order * 110}ms both`,
});

/** Buttons and cards rise slightly under the pointer. */
const LIFT = {
  transition: 'transform 200ms ease, box-shadow 200ms ease',
  '&:hover': { transform: 'translateY(-2px)' },
} as const;

/** The two ways in rise and gain a coloured edge under the pointer. */
const CARD: SxProps<Theme> = (theme) => ({
  height: '100%',
  transition: 'transform 250ms ease, box-shadow 250ms ease, border-color 250ms ease',
  '&:hover': {
    transform: 'translateY(-4px)',
    borderColor: theme.palette.primary.main,
    boxShadow: `0 18px 40px -24px ${alpha(theme.palette.primary.main, 0.55)}`,
  },
});

/**
 * Public introduction to the service: what it does, how an order moves through it, and
 * where shop owners and staff go next. It needs no session; the shop and dashboard
 * links pass through their usual guards, which send a signed-out visitor to the login.
 */
export function LandingPage() {
  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        position: 'relative',
        overflow: 'hidden',
        ...REDUCED_MOTION,
      }}
    >
      {/* Soft colour behind the hero. Decoration only. */}
      <Box
        aria-hidden
        sx={(theme) => ({
          position: 'absolute',
          inset: 0,
          height: 720,
          pointerEvents: 'none',
          '&::before, &::after': {
            content: '""',
            position: 'absolute',
            borderRadius: '50%',
            filter: 'blur(70px)',
            animation: `${float} 14s ease-in-out infinite`,
          },
          '&::before': {
            width: 420,
            height: 420,
            top: -140,
            left: '-6%',
            bgcolor: alpha(theme.palette.primary.main, 0.16),
          },
          '&::after': {
            width: 360,
            height: 360,
            top: 220,
            right: '-4%',
            bgcolor: alpha(theme.palette.secondary.main, 0.14),
            animationDelay: '-7s',
          },
        })}
      />

      <Box
        component="header"
        sx={(theme) => ({
          position: 'sticky',
          top: 0,
          zIndex: theme.zIndex.appBar,
          bgcolor: alpha(theme.palette.background.default, 0.78),
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${alpha(theme.palette.divider, 0.6)}`,
          animation: `${fadeUp} 500ms ease both`,
        })}
      >
        <Container maxWidth="lg">
          <Stack
            direction="row"
            sx={{ alignItems: 'center', justifyContent: 'space-between', gap: 2, py: 1.5 }}
          >
            <Typography sx={{ fontWeight: 700, fontSize: '1.125rem' }}>
              {appConfig.appLabel}
            </Typography>
            <Stack direction="row" spacing={1} sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>
              <Button component={RouterLink} to={SHOP_HOME} startIcon={<StorefrontIcon />}>
                Shop
              </Button>
              {/* The login page is served outside this app, so this is a plain link. */}
              <Button component="a" href={LOGIN_PATH} variant="outlined" startIcon={<LoginIcon />}>
                Log in
              </Button>
            </Stack>
          </Stack>
        </Container>
      </Box>

      <Container maxWidth="lg" sx={{ position: 'relative' }}>
        <Box component="main">
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
              gap: { xs: 4, md: 6 },
              alignItems: 'center',
              py: { xs: 5, md: 9 },
            }}
          >
            <Stack spacing={3}>
              <Typography
                component="h1"
                sx={{
                  fontSize: { xs: '2.25rem', md: '3.25rem' },
                  fontWeight: 800,
                  lineHeight: 1.1,
                  ...enter(0),
                }}
              >
                From the shop counter to the{' '}
                <Box
                  component="span"
                  sx={(theme) => ({
                    backgroundImage: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.secondary.main}, ${theme.palette.primary.main})`,
                    backgroundSize: '200% auto',
                    backgroundClip: 'text',
                    WebkitBackgroundClip: 'text',
                    color: 'transparent',
                    animation: `${shimmer} 6s linear infinite`,
                  })}
                >
                  customer’s door
                </Box>
              </Typography>
              <Typography
                color="text.secondary"
                sx={{ fontSize: '1.125rem', maxWidth: 520, ...enter(1) }}
              >
                One place for shops to take orders, for riders to be dispatched, and for the
                delivery team to follow every order until it is delivered and paid.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={enter(2)}>
                <Button
                  component={RouterLink}
                  to={SHOP_HOME}
                  variant="contained"
                  size="large"
                  startIcon={<StorefrontIcon />}
                  sx={LIFT}
                >
                  Go to my shop
                </Button>
                <Button
                  component="a"
                  href={LOGIN_PATH}
                  variant="outlined"
                  size="large"
                  startIcon={<LoginIcon />}
                  sx={LIFT}
                >
                  Log in
                </Button>
              </Stack>
              <Typography variant="body2" color="text.secondary" sx={enter(3)}>
                You sign in with a code sent to your WhatsApp number. There is no password.
              </Typography>
            </Stack>
            <Box
              sx={(theme) => ({
                borderRadius: 6,
                boxShadow: `0 30px 60px -30px ${alpha(theme.palette.primary.main, 0.45)}`,
                ...enter(2),
              })}
            >
              <DeliveryRouteGraphic />
            </Box>
          </Box>

          <Box component="section" aria-labelledby="how-it-works" sx={{ py: { xs: 3, md: 5 } }}>
            <Reveal>
              <Typography
                id="how-it-works"
                component="h2"
                sx={{ fontSize: { xs: '1.5rem', md: '1.875rem' }, fontWeight: 700, mb: 1 }}
              >
                How it works
              </Typography>
              <Typography color="text.secondary" sx={{ mb: 4 }}>
                Every order follows the same four steps.
              </Typography>
            </Reveal>
            <Box
              component="ol"
              sx={{
                listStyle: 'none',
                m: 0,
                p: 0,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
                gap: 3,
              }}
            >
              {STEPS.map((step, index) => (
                <Reveal
                  component="li"
                  key={step.kind}
                  delayMs={index * 140}
                  sx={(theme) => ({
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1.5,
                    '& > svg': { transition: 'transform 250ms ease' },
                    '&:hover > svg': { transform: 'translateY(-4px) scale(1.04)' },
                    // A moving dotted line carries the eye from each step to the next.
                    '&:not(:last-of-type)::after': {
                      content: '""',
                      display: { xs: 'none', md: 'block' },
                      position: 'absolute',
                      top: 47,
                      left: 132,
                      right: -12,
                      height: 3,
                      backgroundImage: `radial-gradient(circle, ${theme.palette.primary.main} 1.5px, transparent 1.6px)`,
                      backgroundSize: '14px 3px',
                      animation: `${shimmer} 9s linear infinite reverse`,
                    },
                  })}
                >
                  <StepGraphic kind={step.kind} />
                  <Typography
                    variant="overline"
                    color="primary"
                    sx={{ fontWeight: 700, lineHeight: 1.4 }}
                  >
                    Step {index + 1}
                  </Typography>
                  <Typography component="h3" sx={{ fontSize: '1.125rem', fontWeight: 700 }}>
                    {step.title}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {step.body}
                  </Typography>
                </Reveal>
              ))}
            </Box>
          </Box>

          <Box component="section" aria-labelledby="get-started" sx={{ py: { xs: 3, md: 5 } }}>
            <Reveal>
              <Typography
                id="get-started"
                component="h2"
                sx={{ fontSize: { xs: '1.5rem', md: '1.875rem' }, fontWeight: 700, mb: 3 }}
              >
                Where to go next
              </Typography>
            </Reveal>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
                gap: 3,
              }}
            >
              <Reveal>
                <Card variant="outlined" sx={CARD}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
                      <Typography component="h3" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        Shop owners
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Manage your menu and branch details, accept incoming orders and see what you
                        have earned.
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                        <Button component={RouterLink} to={SHOP_HOME} variant="contained">
                          Open my shop
                        </Button>
                        <Button component="a" href={SHOP_SIGNUP_PATH}>
                          Register a shop
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Reveal>
              <Reveal delayMs={140}>
                <Card variant="outlined" sx={CARD}>
                  <CardContent sx={{ p: 3 }}>
                    <Stack spacing={2} sx={{ alignItems: 'flex-start' }}>
                      <Typography component="h3" sx={{ fontSize: '1.25rem', fontWeight: 700 }}>
                        Delivery team
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Follow bookings, dispatch riders, manage the fleet and reconcile payments
                        from the staff dashboard.
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', rowGap: 1 }}>
                        <Button component={RouterLink} to={ADMIN_HOME} variant="contained">
                          Open the dashboard
                        </Button>
                        <Button component="a" href={LOGIN_PATH}>
                          Log in
                        </Button>
                      </Stack>
                    </Stack>
                  </CardContent>
                </Card>
              </Reveal>
            </Box>
          </Box>
        </Box>
      </Container>
    </Box>
  );
}
