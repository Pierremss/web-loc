import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminGuard } from '../../modules/auth/admin.guard';
import { AdminRecomendacoesPage } from './admin-recomendacoes.page';

const routes: Routes = [
  { path: '', component: AdminRecomendacoesPage, canActivate: [AdminGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminRecomendacoesPageRoutingModule {}
