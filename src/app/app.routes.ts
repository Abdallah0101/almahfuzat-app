import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/library.page').then((page) => page.LibraryPage) },
  { path: 'poem/:id', loadComponent: () => import('./pages/poem.page').then((page) => page.PoemPage) },
  { path: 'review', loadComponent: () => import('./pages/review.page').then((page) => page.ReviewPage) },
  { path: 'playlists', loadComponent: () => import('./pages/playlists.page').then((page) => page.PlaylistsPage) },
  { path: 'settings', loadComponent: () => import('./pages/settings.page').then((page) => page.SettingsPage) },
  { path: '**', redirectTo: '' }
];
