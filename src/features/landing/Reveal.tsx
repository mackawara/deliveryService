import Box, { type BoxProps } from '@mui/material/Box';
import { useEffect, useRef, useState } from 'react';

import { REDUCED_MOTION_QUERY } from '@/features/landing/motion';

export interface RevealProps extends BoxProps {
  /** Delay before this element appears, so neighbours arrive one after another. */
  delayMs?: number;
}

/**
 * Fades its content up the first time it scrolls into view. Where the browser cannot
 * report visibility, or the visitor asked for reduced motion, the content is simply
 * there: nothing on the page depends on the animation having run.
 */
export function Reveal({ delayMs = 0, sx, children, ...rest }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(() => typeof IntersectionObserver === 'undefined');

  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <Box
      ref={ref}
      {...rest}
      sx={[
        {
          opacity: shown ? 1 : 0,
          transform: shown ? 'none' : 'translateY(24px)',
          transition: `opacity 600ms ease ${delayMs}ms, transform 600ms cubic-bezier(0.2, 0.7, 0.2, 1) ${delayMs}ms`,
          [`@media ${REDUCED_MOTION_QUERY}`]: { opacity: 1, transform: 'none' },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  );
}
