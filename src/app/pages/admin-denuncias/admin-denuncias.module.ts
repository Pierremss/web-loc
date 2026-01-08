import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IonicModule } from '@ionic/angular';

import { AdminDenunciasPageRoutingModule } from './admin-denuncias-routing.module';

import { AdminDenunciasPage } from './admin-denuncias.page';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    AdminDenunciasPageRoutingModule
  ],
  declarations: [AdminDenunciasPage]
})
export class AdminDenunciasPageModule {}
