import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { LoginPage } from './modules/auth/login.page';
import { RegisterPage } from './modules/auth/register.page';
import { UsersListPage } from './modules/users/users-list.page';
import { GamesListPage } from './modules/games/games-list.page';
import { AuthGuard } from './modules/auth/auth.guard';
import { AdminGuard } from './modules/auth/admin.guard';
import { HomePage } from './home.page';
import { JogadorPerfilPage } from './pages/jogador-perfil/jogador-perfil.page';

const routes: Routes = [
  { path: '', redirectTo: 'home', pathMatch: 'full' },
  { path: 'login', component: LoginPage },
  { path: 'register', component: RegisterPage },
  { path: 'users', component: UsersListPage, canActivate: [AuthGuard] },
  { path: 'games', component: GamesListPage, canActivate: [AdminGuard] },
  { path: 'home', component: HomePage },
  { path: 'menu-admin', loadChildren: () => import('./pages/menu-admin/menu-admin.module').then(m => m.MenuAdminPageModule), canActivate: [AdminGuard] },
  { path: 'admin/recomendacoes', loadChildren: () => import('./pages/admin-recomendacoes/admin-recomendacoes.module').then(m => m.AdminRecomendacoesPageModule), canActivate: [AdminGuard] },
  { path: 'friends', loadChildren: () => import('./pages/friends/friends.module').then(m => m.FriendsPageModule) },
  { path: 'rooms', loadChildren: () => import('./pages/rooms/rooms.module').then(m => m.RoomsListPageModule) },
  { path: 'chat/:id', loadChildren: () => import('./pages/chat/chat.module').then(m => m.ChatPageModule) },
  { path: 'conversations', loadChildren: () => import('./pages/conversations/conversations.module').then(m => m.ConversationsModule) },
  { path: 'user-profile/:id', loadChildren: () => import('./pages/user-profile/user-profile.module').then(m => m.UserProfilePageModule) },
  { path: 'jogador-perfil', loadChildren: () => import('./pages/jogador-perfil/jogador-perfil.module').then(m => m.JogadorPerfilPageModule) },
  { path: 'editar-perfil', loadChildren: () => import('./pages/editar-perfil/editar-perfil.module').then(m => m.EditarPerfilPageModule) },
  { path: 'swipe', loadChildren: () => import('./pages/swipe/swipe.module').then(m => m.SwipePageModule) },
  { path: 'recomendar-jogo', loadChildren: () => import('./pages/recomendar-jogo/recomendar-jogo.module').then(m => m.RecomendarJogoPageModule) },
  { path: 'recuperarsenha', loadChildren: () => import('./pages/recuperar-senha/recuperar-senha.module').then(m => m.RecuperarSenhaPageModule) }
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })],
  exports: [RouterModule],
})
export class AppRoutingModule {}