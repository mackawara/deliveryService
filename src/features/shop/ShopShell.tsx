import AccountCircleIcon from '@mui/icons-material/AccountCircle';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import StorefrontIcon from '@mui/icons-material/Storefront';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemButton from '@mui/material/ListItemButton';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import MenuItem from '@mui/material/MenuItem';
import Select from '@mui/material/Select';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useTheme } from '@mui/material/styles';
import { useEffect, useState } from 'react';
import { Link as RouterLink, Outlet, useLocation, useNavigate, useParams } from 'react-router-dom';

import { useListShopsQuery } from '@/api/endpoints/shop';
import { baseApi } from '@/api/baseApi';
import { useAppDispatch } from '@/app/hooks';
import { useOwnerAuth } from '@/auth/useOwnerAuth';
import { ApiError } from '@/components/ApiError';
import { appConfig } from '@/config';

const DRAWER_WIDTH = 248;

function ShopNavigation({ shopId, close }: { shopId?: string; close?: () => void }) {
  const location = useLocation();
  const { session } = useOwnerAuth();
  const links = shopId
    ? [
        ...(session?.capabilities.includes('orders:manage')
          ? [
              {
                label: 'Orders',
                path: `/shop/${shopId}/orders`,
                icon: <StorefrontIcon fontSize="small" />,
              },
            ]
          : []),
        {
          label: 'Profile',
          path: `/shop/${shopId}/profile`,
          icon: <AccountCircleIcon fontSize="small" />,
        },
        {
          label: 'Catalogue',
          path: `/shop/${shopId}/catalogue`,
          icon: <StorefrontIcon fontSize="small" />,
        },
      ]
    : [
        {
          label: 'Set up a branch',
          path: '/shop/setup',
          icon: <StorefrontIcon fontSize="small" />,
        },
      ];
  return (
    <List dense sx={{ p: 1 }}>
      {links.map((link) => (
        <ListItem key={link.path} disablePadding>
          <ListItemButton
            component={RouterLink}
            to={link.path}
            selected={location.pathname === link.path}
            onClick={close}
          >
            <ListItemIcon sx={{ minWidth: 38 }}>{link.icon}</ListItemIcon>
            <ListItemText primary={link.label} />
          </ListItemButton>
        </ListItem>
      ))}
    </List>
  );
}

export function ShopShell() {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [drawerOpen, setDrawerOpen] = useState(false);
  const dispatch = useAppDispatch();
  const { shopId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { session, signOut, signingOut } = useOwnerAuth();
  const shops = useListShopsQuery(
    { limit: 100 },
    { skip: !session, pollingInterval: 5000, skipPollingIfUnfocused: true },
  );
  const current = shops.currentData?.items.find(
    (shop) =>
      shop._id === shopId &&
      session?.memberships.some((m) => m.shopId === shopId && m.status === 'ACTIVE'),
  );
  const activeShopId = shopId ?? shops.data?.items[0]?._id;

  useEffect(() => {
    if (!shopId || shops.isLoading || shops.error || !shops.data || current) return;
    dispatch(baseApi.util.invalidateTags(['Shop', 'ShopItem', 'ShopTerms']));
    const fallback = shops.data.items[0]?._id;
    navigate(
      fallback
        ? `/shop/${fallback}/${location.pathname.includes('/orders') ? 'orders' : 'catalogue'}`
        : '/shop/setup',
      { replace: true },
    );
  }, [
    current,
    dispatch,
    navigate,
    shopId,
    shops.data,
    shops.error,
    shops.isLoading,
    location.pathname,
  ]);

  function switchShop(nextShopId: string) {
    if (!session?.memberships.some((m) => m.shopId === nextShopId && m.status === 'ACTIVE')) return;
    localStorage.setItem(`shop-branch:${session.owner.id}`, nextShopId);
    navigate(
      `/shop/${nextShopId}/${location.pathname.includes('/orders') ? 'orders' : 'catalogue'}`,
    );
  }

  const drawer = (
    <>
      <Toolbar>
        <Typography variant="h6" noWrap>
          Shop owner
        </Typography>
      </Toolbar>
      <Divider />
      <ShopNavigation shopId={activeShopId} close={() => setDrawerOpen(false)} />
      <Box sx={{ flexGrow: 1 }} />
      <Divider />
      <List dense sx={{ p: 1 }}>
        <ListItem disablePadding>
          <ListItemButton onClick={() => void signOut()} disabled={signingOut}>
            <ListItemIcon sx={{ minWidth: 38 }}>
              <LogoutIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primary={signingOut ? 'Signing out…' : 'Sign out'} />
          </ListItemButton>
        </ListItem>
      </List>
    </>
  );

  return (
    <Box sx={{ minHeight: '100vh', display: 'flex', bgcolor: 'background.default' }}>
      <AppBar position="fixed" sx={{ zIndex: theme.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          {mobile ? (
            <IconButton
              color="inherit"
              edge="start"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open shop navigation"
            >
              <MenuIcon />
            </IconButton>
          ) : null}
          <Typography
            variant="subtitle1"
            sx={{ fontWeight: 700, display: { xs: 'none', sm: 'block' } }}
          >
            {appConfig.appLabel}
          </Typography>
          <Box sx={{ flexGrow: 1 }} />
          <Select
            size="small"
            value={shops.data?.items.some((s) => s._id === activeShopId) ? activeShopId : ''}
            displayEmpty
            onChange={(event) => switchShop(event.target.value)}
            sx={{ minWidth: { xs: 150, sm: 230 }, bgcolor: 'background.paper', borderRadius: 1 }}
            inputProps={{ 'aria-label': 'Current shop branch' }}
          >
            {!shops.data?.items.length ? <MenuItem value="">No branches yet</MenuItem> : null}
            {shops.data?.items.map((shop) => (
              <MenuItem key={shop._id} value={shop._id}>
                {shop.name}
                {shop.branchName ? ` · ${shop.branchName}` : ''}
              </MenuItem>
            ))}
          </Select>
          <Button
            color="inherit"
            component={RouterLink}
            to="/shop/setup"
            sx={{ display: { xs: 'none', sm: 'inline-flex' } }}
          >
            New branch
          </Button>
        </Toolbar>
      </AppBar>
      <Box component="nav" sx={{ width: { md: DRAWER_WIDTH }, flexShrink: { md: 0 } }}>
        <Drawer
          variant={mobile ? 'temporary' : 'permanent'}
          open={mobile ? drawerOpen : true}
          onClose={() => setDrawerOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{
            '& .MuiDrawer-paper': { width: DRAWER_WIDTH, boxSizing: 'border-box', display: 'flex' },
          }}
        >
          {drawer}
        </Drawer>
      </Box>
      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, px: { xs: 2, md: 3 }, py: 3, mt: 8 }}>
        {shops.error ? (
          <ApiError error={shops.error as never} onRetry={() => void shops.refetch()} />
        ) : null}
        {current && current.approvalState !== 'APPROVED' ? (
          <Box sx={{ mb: 2 }}>
            <Typography variant="body2" color="warning.main">
              This branch is awaiting approval. You can prepare its catalogue, but customers cannot
              see it yet.
            </Typography>
          </Box>
        ) : null}
        {!signingOut && (!shopId || !!current) ? (
          <Outlet />
        ) : (
          <Typography>Checking branch access…</Typography>
        )}
      </Box>
    </Box>
  );
}
