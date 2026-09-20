import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import SearchIcon from '@mui/icons-material/Search';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import ListSubheader from '@mui/material/ListSubheader';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import Toolbar from '@mui/material/Toolbar';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';

import { useAppDispatch, useAppSelector } from '@/app/hooks';
import {
  NAV_GROUP_LABELS,
  NAV_ITEMS,
  PRIMARY_ITEMS,
  SETTINGS_ITEMS,
  type NavGroup,
  type NavItem,
} from '@/app/navigation';
import { navigationToggled } from '@/app/uiSlice';
import { useActivitySignal } from '@/auth/useActivitySignal';
import { useAuth } from '@/auth/useAuth';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { NoticeHost } from '@/components/NoticeHost';
import { SessionExpiryNotice } from '@/components/SessionExpiryNotice';
import { ThemeSelector } from '@/components/ThemeSelector';
import { TownSelector } from '@/components/TownSelector';
import { appConfig } from '@/config';
import { describeRoles, meetsRequirement, type StaffSession } from '@/lib/permissions';

const DRAWER_WIDTH = 264;
const GROUP_ORDER: NavGroup[] = ['operations', 'finance', 'administration'];

function visibleItems(session: StaffSession | null, group: NavGroup): NavItem[] {
  return NAV_ITEMS.filter(
    (item) => item.group === group && meetsRequirement(session, item.requirement),
  );
}

function NavigationList({
  session,
  onNavigate,
}: {
  session: StaffSession | null;
  onNavigate?: () => void;
}) {
  const location = useLocation();

  function isActive(path: string): boolean {
    if (path === '/') return location.pathname === '/';
    return location.pathname === path || location.pathname.startsWith(`${path}/`);
  }

  return (
    <Box sx={{ overflowY: 'auto', py: 1 }}>
      <List dense>
        {PRIMARY_ITEMS.filter((item) => meetsRequirement(session, item.requirement)).map((item) => (
          <ListItem key={item.path} disablePadding sx={{ px: 1 }}>
            <ListItemButton
              component={RouterLink}
              to={item.path}
              selected={isActive(item.path)}
              onClick={onNavigate}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
                <item.icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>

      {GROUP_ORDER.map((group) => {
        const items = visibleItems(session, group);
        // Only sections the user can access are displayed.
        if (items.length === 0) return null;
        return (
          <List
            key={group}
            dense
            subheader={
              <ListSubheader disableSticky sx={{ bgcolor: 'transparent', fontWeight: 700 }}>
                {NAV_GROUP_LABELS[group]}
              </ListSubheader>
            }
          >
            {items.map((item) => (
              <ListItem key={item.path} disablePadding sx={{ px: 1 }}>
                <ListItemButton
                  component={RouterLink}
                  to={item.path}
                  selected={isActive(item.path)}
                  onClick={onNavigate}
                >
                  <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
                    <item.icon fontSize="small" />
                  </ListItemIcon>
                  <ListItemText primary={item.label} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        );
      })}

      <Divider sx={{ my: 1 }} />
      <List dense>
        {SETTINGS_ITEMS.map((item) => (
          <ListItem key={item.path} disablePadding sx={{ px: 1 }}>
            <ListItemButton
              component={RouterLink}
              to={item.path}
              selected={isActive(item.path)}
              onClick={onNavigate}
            >
              <ListItemIcon sx={{ minWidth: 40, color: 'inherit' }}>
                <item.icon fontSize="small" />
              </ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Box>
  );
}

function ProfileMenu() {
  const { session, signOut, signingOut } = useAuth();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  if (!session) return null;

  const scope = session.townAccess.allTowns
    ? 'All towns'
    : session.townAccess.towns.map((town) => town.name).join(', ') || 'No towns assigned';

  return (
    <>
      <Tooltip title="Account">
        <IconButton
          onClick={(event) => setAnchor(event.currentTarget)}
          color="inherit"
          aria-label="Account menu"
        >
          <Typography
            component="span"
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
              display: 'grid',
              placeItems: 'center',
              fontSize: '0.875rem',
              fontWeight: 700,
            }}
          >
            {session.user.name.slice(0, 1).toUpperCase()}
          </Typography>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <Box sx={{ px: 2, py: 1, maxWidth: 280 }}>
          <Typography variant="subtitle2">{session.user.name}</Typography>
          <Typography variant="caption" color="text.secondary" component="p">
            {session.user.maskedPhone}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p">
            {describeRoles(session.roles)}
          </Typography>
          <Typography variant="caption" color="text.secondary" component="p">
            Town access: {scope}
          </Typography>
        </Box>
        <Divider />
        <MenuItem component={RouterLink} to="/settings/access" onClick={() => setAnchor(null)}>
          My access
        </MenuItem>
        <MenuItem component={RouterLink} to="/settings/appearance" onClick={() => setAnchor(null)}>
          Appearance
        </MenuItem>
        <Divider />
        <MenuItem
          onClick={() => {
            setAnchor(null);
            void signOut();
          }}
          disabled={signingOut}
        >
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          {signingOut ? 'Signing out…' : 'Sign out'}
        </MenuItem>
      </Menu>
    </>
  );
}

/**
 * Application shell (specification sections 3 and 8).
 *
 * A persistent sidebar at desktop widths, a collapsible drawer from 768px, and a top
 * bar carrying town, waybill lookup, refresh state, theme and profile.
 */
export function AppShell() {
  const theme = useTheme();
  const dispatch = useAppDispatch();
  const { session } = useAuth();
  const navigationOpen = useAppSelector((state) => state.ui.navigationOpen);
  const expanded = useMediaQuery(theme.breakpoints.up('lg'));

  // Session inactivity is extended by real interaction only, never by polling.
  useActivitySignal(Boolean(session));

  const drawerContent = (
    <>
      <Toolbar sx={{ px: 2 }}>
        <Typography variant="h6" component="span" noWrap>
          {appConfig.appLabel}
        </Typography>
      </Toolbar>
      <Divider />
      <NavigationList
        session={session}
        onNavigate={expanded ? undefined : () => dispatch(navigationToggled(false))}
      />
    </>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          {!expanded ? (
            <IconButton
              edge="start"
              color="inherit"
              aria-label="Open navigation"
              onClick={() => dispatch(navigationToggled())}
            >
              <MenuIcon />
            </IconButton>
          ) : null}

          <Typography
            variant="subtitle1"
            component="span"
            sx={{ fontWeight: 700, display: { xs: 'none', md: 'block' } }}
          >
            {appConfig.appLabel}
          </Typography>

          <Box sx={{ flexGrow: 1 }} />

          <TownSelector />

          {/*
            Exact waybill lookup is a backend addition (specification section 11, P1).
            The control stays visible but disabled rather than pretending to search.
          */}
          <Tooltip title="Waybill lookup needs the extended booking search endpoint (specification section 11).">
            <TextField
              size="small"
              placeholder="Waybill lookup"
              disabled
              sx={{ minWidth: 180, display: { xs: 'none', lg: 'block' } }}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
                htmlInput: { 'aria-label': 'Waybill lookup (not yet supported)' },
              }}
            />
          </Tooltip>

          <ConnectionStatus />
          <ThemeSelector />
          <ProfileMenu />
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { lg: DRAWER_WIDTH }, flexShrink: { lg: 0 } }}>
        <Drawer
          variant={expanded ? 'permanent' : 'temporary'}
          open={expanded ? true : navigationOpen}
          onClose={() => dispatch(navigationToggled(false))}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box' },
          }}
        >
          {drawerContent}
        </Drawer>
      </Box>

      <Box
        component="main"
        sx={{
          flexGrow: 1,
          // Avoids page-level horizontal scrolling; wide tables scroll inside their own container.
          minWidth: 0,
          px: { xs: 2, md: 3 },
          py: 3,
          mt: 8,
        }}
      >
        <SessionExpiryNotice />
        <Stack spacing={0}>
          <Outlet />
        </Stack>
      </Box>

      <NoticeHost />
    </Box>
  );
}
