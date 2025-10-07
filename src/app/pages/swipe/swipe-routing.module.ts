import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SwipePage } from './swipe.page';
import { AuthGuard } from '../../modules/auth/auth.guard';

const routes: Routes = [
  { path: '', component: SwipePage, canActivate: [AuthGuard] }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class SwipeRoutingModule {}
