import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AuthGuard } from '../../modules/auth/auth.guard';
import { RecomendarJogoPage } from './recomendar-jogo.page';

const routes: Routes = [
  { path: '', component: RecomendarJogoPage, canActivate: [AuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RecomendarJogoPageRoutingModule {}
