import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { RouterModule, Routes } from '@angular/router';
import { UserProfilePage } from './user-profile.page';
import { AuthGuard } from '../../modules/auth/auth.guard';

const routes: Routes = [
  { path: '', component: UserProfilePage, canActivate: [AuthGuard] }
];

@NgModule({
  declarations: [UserProfilePage],
  imports: [CommonModule, FormsModule, IonicModule, RouterModule.forChild(routes)]
})
export class UserProfilePageModule {}
