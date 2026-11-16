import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';

import {
  OWN_CENTRE,
  REDUCED_MOTION_QUERY,
  bob,
  dashFlow,
  drawLoop,
  drift,
  pulse,
  spin,
} from '@/features/landing/motion';

/**
 * Illustrations for the landing page. They are drawn inline so they follow the active
 * brand preset (every colour comes from the theme tokens) and need no image request.
 * Their movement is decoration and stops under reduced motion.
 */

/** How long the rider takes from the shop to the home, including the pause at the end. */
const RIDE_SECONDS = 7;
/** The ground between the shop door and the home, which the rider follows. */
const RIDE_PATH = 'M150 243 C200 249 240 245 270 241 S340 233 372 239';

/** A town scene: the shop on the left, the customer's home on the right, a rider between. */
export function DeliveryRouteGraphic() {
  const { palette } = useTheme().appTokens;
  const still = useMediaQuery(REDUCED_MOTION_QUERY);
  const ink = palette.border.strong;
  const accent = palette.primary.main;
  const warm = palette.secondary.main;
  const paper = palette.background.surface;

  return (
    <svg
      viewBox="0 0 520 320"
      role="img"
      aria-label="A rider carrying an order along a route from a shop to a customer's home"
      style={{ width: '100%', height: 'auto', display: 'block' }}
    >
      <defs>
        <clipPath id="landing-scene">
          <rect width="520" height="320" rx="24" />
        </clipPath>
      </defs>
      <g clipPath="url(#landing-scene)">
        <rect width="520" height="320" fill={palette.primary.soft} />
        <Box
          component="circle"
          cx="430"
          cy="62"
          r="26"
          fill={palette.secondary.soft}
          sx={{ ...OWN_CENTRE, animation: `${pulse} 6s ease-in-out infinite` }}
        />

        {/* Clouds */}
        <Box component="g" sx={{ animation: `${drift} 38s linear infinite` }}>
          <path
            d="M0 70 a14 14 0 0 1 26 -6 a18 18 0 0 1 34 4 a11 11 0 0 1 4 21 H4 a10 10 0 0 1 -4 -19 Z"
            fill={paper}
            opacity="0.9"
          />
        </Box>
        <Box component="g" sx={{ animation: `${drift} 54s linear -20s infinite` }}>
          <path
            d="M0 122 a10 10 0 0 1 19 -4 a13 13 0 0 1 24 3 a8 8 0 0 1 3 15 H3 a7 7 0 0 1 -3 -14 Z"
            fill={paper}
            opacity="0.7"
          />
        </Box>

        <path
          d="M0 250 C90 222 170 262 260 240 S440 226 520 246 V320 H0 Z"
          fill={palette.background.surface}
        />

        {/* The planned route, from the shop to the destination pin */}
        <Box
          component="path"
          d="M104 122 C170 40 330 20 414 112"
          fill="none"
          stroke={accent}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray="2 12"
          sx={{ animation: `${dashFlow} 1.4s linear infinite` }}
        />

        {/* Shop */}
        <g>
          <rect
            x="46"
            y="158"
            width="104"
            height="80"
            rx="6"
            fill={paper}
            stroke={ink}
            strokeWidth="3"
          />
          <path
            d="M38 158 L50 126 H146 L158 158 Z"
            fill={warm}
            stroke={ink}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <path d="M74 126 L68 158 M98 126 V158 M122 126 L128 158" stroke={ink} strokeWidth="3" />
          <rect
            x="60"
            y="176"
            width="34"
            height="28"
            rx="3"
            fill={palette.primary.soft}
            stroke={ink}
            strokeWidth="3"
          />
          <rect
            x="108"
            y="180"
            width="28"
            height="58"
            rx="3"
            fill={palette.secondary.soft}
            stroke={ink}
            strokeWidth="3"
          />
        </g>

        {/* Home with a destination pin */}
        <g>
          <rect
            x="386"
            y="184"
            width="84"
            height="58"
            rx="4"
            fill={paper}
            stroke={ink}
            strokeWidth="3"
          />
          <path
            d="M376 188 L428 148 L480 188"
            fill={palette.primary.soft}
            stroke={ink}
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <rect
            x="418"
            y="208"
            width="22"
            height="34"
            rx="3"
            fill={accent}
            stroke={ink}
            strokeWidth="3"
          />
          <Box component="g" sx={{ animation: `${bob} 1.8s ease-in-out infinite` }}>
            <path
              d="M428 80 c-13 0 -22 10 -22 22 c0 16 22 34 22 34 s22 -18 22 -34 c0 -12 -9 -22 -22 -22 Z"
              fill={warm}
              stroke={ink}
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <circle cx="428" cy="102" r="7" fill={paper} />
          </Box>
        </g>

        {/* Rider: rides the ground from the shop to the home, then sets off again */}
        <g transform={still ? 'translate(266 241)' : undefined}>
          {still ? null : (
            <>
              <animateMotion
                dur={`${RIDE_SECONDS}s`}
                repeatCount="indefinite"
                path={RIDE_PATH}
                calcMode="spline"
                keyPoints="0;1;1"
                keyTimes="0;0.8;1"
                keySplines="0.4 0 0.6 1;0 0 1 1"
              />
              <animate
                attributeName="opacity"
                dur={`${RIDE_SECONDS}s`}
                repeatCount="indefinite"
                values="0;1;1;0;0"
                keyTimes="0;0.08;0.72;0.8;1"
              />
            </>
          )}
          <g transform="translate(-44 -75)">
            <path
              d="M-36 14 H-18 M-46 30 H-22 M-32 46 H-16"
              stroke={accent}
              strokeWidth="3"
              strokeLinecap="round"
            />
            <rect
              x="-6"
              y="2"
              width="30"
              height="26"
              rx="4"
              fill={accent}
              stroke={ink}
              strokeWidth="3"
            />
            <circle cx="48" cy="-4" r="10" fill={paper} stroke={ink} strokeWidth="3" />
            <path
              d="M26 30 L44 12 L62 30 M44 12 L40 44 M62 30 L74 30"
              fill="none"
              stroke={ink}
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M8 50 H78" stroke={ink} strokeWidth="4" strokeLinecap="round" />
            {[10, 78].map((cx) => (
              <Box
                component="g"
                key={cx}
                sx={{ ...OWN_CENTRE, animation: `${spin} 0.9s linear infinite` }}
              >
                <circle cx={cx} cy="58" r="15" fill={paper} stroke={ink} strokeWidth="4" />
                <path
                  d={`M${cx - 11} 58 H${cx + 11} M${cx} 47 V69`}
                  stroke={ink}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <circle cx={cx} cy="58" r="3" fill={ink} />
              </Box>
            ))}
          </g>
        </g>
      </g>
    </svg>
  );
}

export type StepGraphicKind = 'order' | 'prepare' | 'dispatch' | 'deliver';

/** One picture per stage of an order. Decorative: the step's text carries the meaning. */
export function StepGraphic({ kind }: { kind: StepGraphicKind }) {
  const { palette } = useTheme().appTokens;
  const ink = palette.border.strong;
  const accent = palette.primary.main;
  const warm = palette.secondary.main;
  const paper = palette.background.surface;
  const line = {
    fill: 'none',
    stroke: ink,
    strokeWidth: 3,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  /** A tick that draws itself, holds, and starts again. */
  const tick = {
    strokeDasharray: 1,
    animation: `${drawLoop} 3s ease-in-out infinite`,
  } as const;

  return (
    <svg viewBox="0 0 120 96" aria-hidden="true" style={{ width: 120, height: 96 }}>
      <rect width="120" height="96" rx="16" fill={palette.primary.soft} />
      {kind === 'order' ? (
        <>
          <rect
            x="40"
            y="12"
            width="40"
            height="72"
            rx="8"
            fill={paper}
            stroke={ink}
            strokeWidth="3"
          />
          <rect x="47" y="24" width="26" height="14" rx="4" fill={palette.secondary.soft} />
          <Box
            component="rect"
            x="47"
            y="43"
            width="26"
            height="14"
            rx="4"
            fill={accent}
            sx={{ ...OWN_CENTRE, animation: `${pulse} 3s ease-in-out infinite` }}
          />
          <Box
            component="path"
            d="M52 50 l4 4 l8 -8"
            pathLength={1}
            {...line}
            stroke={palette.primary.contrastText}
            sx={tick}
          />
          <path d="M55 74 H65" {...line} />
        </>
      ) : null}
      {kind === 'prepare' ? (
        <>
          <path
            d="M30 40 L36 24 H84 L90 40 Z"
            fill={warm}
            stroke={ink}
            strokeWidth="3"
            strokeLinejoin="round"
          />
          <rect
            x="34"
            y="40"
            width="52"
            height="40"
            rx="4"
            fill={paper}
            stroke={ink}
            strokeWidth="3"
          />
          <circle cx="60" cy="60" r="13" fill={palette.primary.soft} stroke={ink} strokeWidth="3" />
          <circle cx="60" cy="60" r="2.5" fill={ink} />
          <Box
            component="path"
            d="M60 52 V60"
            {...line}
            sx={{ transformOrigin: '60px 60px', animation: `${spin} 4s linear infinite` }}
          />
        </>
      ) : null}
      {kind === 'dispatch' ? (
        <>
          <Box
            component="path"
            d="M26 66 C40 30 60 74 92 34"
            {...line}
            stroke={accent}
            strokeDasharray="2 9"
            sx={{ animation: `${dashFlow} 1.6s linear infinite` }}
          />
          <circle cx="26" cy="68" r="8" fill={warm} stroke={ink} strokeWidth="3" />
          <Box component="g" sx={{ animation: `${bob} 1.8s ease-in-out infinite` }}>
            <path
              d="M92 18 c-9 0 -15 7 -15 15 c0 11 15 23 15 23 s15 -12 15 -23 c0 -8 -6 -15 -15 -15 Z"
              fill={accent}
              stroke={ink}
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <circle cx="92" cy="33" r="5" fill={paper} />
          </Box>
        </>
      ) : null}
      {kind === 'deliver' ? (
        <>
          <rect
            x="28"
            y="34"
            width="44"
            height="40"
            rx="4"
            fill={paper}
            stroke={ink}
            strokeWidth="3"
          />
          <path d="M28 46 H72 M50 34 V46" {...line} />
          <Box
            component="circle"
            cx="82"
            cy="34"
            r="16"
            fill={accent}
            stroke={ink}
            strokeWidth="3"
            sx={{ ...OWN_CENTRE, animation: `${pulse} 3s ease-in-out infinite` }}
          />
          <Box
            component="path"
            d="M74 34 l6 6 l11 -12"
            pathLength={1}
            {...line}
            stroke={palette.primary.contrastText}
            sx={tick}
          />
        </>
      ) : null}
    </svg>
  );
}
