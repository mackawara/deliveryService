import CloudOffIcon from '@mui/icons-material/CloudOff';
import RefreshIcon from '@mui/icons-material/Refresh';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';

import { baseApi } from '@/api/baseApi';
import { TAG_TYPES } from '@/api/tags';
import { useAppDispatch } from '@/app/hooks';
import { formatAge } from '@/lib/datetime';

/**
 * Connection and refresh control for the top bar (specification section 3).
 *
 * Refreshing invalidates the tags of whatever is currently on screen; it is a refetch,
 * not a claim of live data.
 */
export function ConnectionStatus() {
  const dispatch = useAppDispatch();
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [lastRefresh, setLastRefresh] = useState(() => new Date().toISOString());
  const [, setTick] = useState(0);

  useEffect(() => {
    function goOnline() {
      setOnline(true);
    }
    function goOffline() {
      setOnline(false);
    }
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // Keeps the "refreshed" age readable without polling the server.
    const timer = window.setInterval(() => setTick((value) => value + 1), 30_000);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      window.clearInterval(timer);
    };
  }, []);

  function refreshAll() {
    dispatch(baseApi.util.invalidateTags([...TAG_TYPES]));
    setLastRefresh(new Date().toISOString());
  }

  if (!online) {
    return (
      <Stack direction="row" spacing={0.5} sx={{ alignItems: 'center', color: 'warning.main' }}>
        <CloudOffIcon fontSize="small" aria-hidden />
        <Typography variant="body2">Offline</Typography>
      </Stack>
    );
  }

  return (
    <Tooltip title="Refetch the data on this page">
      <Button size="small" onClick={refreshAll} startIcon={<RefreshIcon />} color="inherit">
        <Typography variant="body2" component="span">
          Refreshed {formatAge(lastRefresh)}
        </Typography>
      </Button>
    </Tooltip>
  );
}
