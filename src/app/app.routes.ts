import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';
import { adminGuard } from './guards/admin.guard';
import { localeGuard } from './guards/locale.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'th' },
  {
    path: ':locale',
    canActivate: [localeGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/home/HomePageComponent').then((m) => m.HomePageComponent) },
      { path: 'catalog', loadComponent: () => import('./pages/catalog/CatalogPageComponent').then((m) => m.CatalogPageComponent) },
      { path: 'catalog/:slug/:skuSlug', loadComponent: () => import('./pages/product/ProductPageComponent').then((m) => m.ProductPageComponent) },
      { path: 'catalog/:slug', loadComponent: () => import('./pages/product/ProductPageComponent').then((m) => m.ProductPageComponent) },
      { path: 'login', data: { mode: 'login' }, loadComponent: () => import('./pages/auth/AuthPageComponent').then((m) => m.AuthPageComponent) },
      { path: 'register', data: { mode: 'register' }, loadComponent: () => import('./pages/auth/AuthPageComponent').then((m) => m.AuthPageComponent) },
      { path: 'verify-email', data: { mode: 'verify' }, loadComponent: () => import('./pages/auth/AuthPageComponent').then((m) => m.AuthPageComponent) },
      { path: 'forgot-password', data: { mode: 'forgot' }, loadComponent: () => import('./pages/auth/AuthPageComponent').then((m) => m.AuthPageComponent) },
      { path: 'reset-password', data: { mode: 'reset' }, loadComponent: () => import('./pages/auth/AuthPageComponent').then((m) => m.AuthPageComponent) },
      { path: 'cart', loadComponent: () => import('./pages/cart/CartPageComponent').then((m) => m.CartPageComponent) },
      { path: 'checkout', canActivate: [authGuard], loadComponent: () => import('./pages/checkout/CheckoutPageComponent').then((m) => m.CheckoutPageComponent) },
      { path: 'orders', canActivate: [authGuard], loadComponent: () => import('./pages/orders/OrdersPageComponent').then((m) => m.OrdersPageComponent) },
      { path: 'bills', canActivate: [authGuard], loadComponent: () => import('./pages/bills/BillsPageComponent').then((m) => m.BillsPageComponent) },
      { path: 'bills/:id', canActivate: [authGuard], loadComponent: () => import('./pages/bills/BillDetailPageComponent').then((m) => m.BillDetailPageComponent) },
      { path: 'orders/:id/payment', canActivate: [authGuard], loadComponent: () => import('./pages/payment/PaymentMethodPageComponent').then((m) => m.PaymentMethodPageComponent) },
      { path: 'orders/:id', canActivate: [authGuard], loadComponent: () => import('./pages/orders/OrderDetailPageComponent').then((m) => m.OrderDetailPageComponent) },
      { path: 'account', canActivate: [authGuard], loadComponent: () => import('./pages/account/AccountPageComponent').then((m) => m.AccountPageComponent) },
      { path: 'subscriptions', canActivate: [authGuard], loadComponent: () => import('./pages/subscriptions/SubscriptionsPageComponent').then((m) => m.SubscriptionsPageComponent) },
      { path: 'admin', pathMatch: 'full', redirectTo: 'privilege' },
      { path: 'privilege', canActivate: [adminGuard], loadComponent: () => import('./pages/admin/AdminPageComponent').then((m) => m.AdminPageComponent) },
      { path: 'status', canActivate: [adminGuard], loadComponent: () => import('./pages/status/StatusPageComponent').then((m) => m.StatusPageComponent) },
    ],
  },
  { path: '**', redirectTo: 'th' },
];
