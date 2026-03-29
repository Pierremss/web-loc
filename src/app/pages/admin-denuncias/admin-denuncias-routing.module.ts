import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AdminGuard } from '../../modules/auth/admin.guard';
import { AdminDenunciasPage } from './admin-denuncias.page';

const routes: Routes = [
  { path: '', component: AdminDenunciasPage, canActivate: [AdminGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class AdminDenunciasPageRoutingModule {}
