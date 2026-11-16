import { keyframes } from '@mui/material/styles';

/**
 * Motion for the landing page. Everything here is decoration: the page reads the same
 * with it switched off, and it is switched off for anyone who asks their device for
 * reduced motion (`REDUCED_MOTION` below, applied once at the page root).
 */

export const fadeUp = keyframes({
  from: { opacity: 0, transform: 'translateY(18px)' },
  to: { opacity: 1, transform: 'none' },
});

/** Moves a dashed stroke along its own line; pair with `strokeDasharray="2 12"`. */
export const dashFlow = keyframes({ to: { strokeDashoffset: -28 } });

export const spin = keyframes({ to: { transform: 'rotate(360deg)' } });

export const bob = keyframes({
  '0%, 100%': { transform: 'translateY(0)' },
  '50%': { transform: 'translateY(-7px)' },
});

export const pulse = keyframes({
  '0%, 100%': { transform: 'scale(1)' },
  '50%': { transform: 'scale(1.12)' },
});

export const drift = keyframes({
  from: { transform: 'translateX(-90px)' },
  to: { transform: 'translateX(560px)' },
});

export const shimmer = keyframes({ to: { backgroundPosition: '200% center' } });

export const float = keyframes({
  '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
  '50%': { transform: 'translate(24px, -18px) scale(1.08)' },
});

/** Draws a stroke in, holds it, then starts again; pair with `pathLength={1}`. */
export const drawLoop = keyframes({
  '0%, 15%': { strokeDashoffset: 1 },
  '45%, 100%': { strokeDashoffset: 0 },
});

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

/** Stops every animation and transition below the element it is applied to. */
export const REDUCED_MOTION = {
  [`@media ${REDUCED_MOTION_QUERY}`]: {
    '&, & *, & *::before, & *::after': {
      animation: 'none !important',
      transition: 'none !important',
    },
  },
} as const;

/** Makes an SVG shape rotate or scale about its own centre rather than the canvas origin. */
export const OWN_CENTRE = { transformBox: 'fill-box', transformOrigin: 'center' } as const;
