import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';

import { RecomendarJogoPageRoutingModule } from './recomendar-jogo-routing.module';
import { RecomendarJogoPage } from './recomendar-jogo.page';

@NgModule({
  imports: [CommonModule, ReactiveFormsModule, IonicModule, RecomendarJogoPageRoutingModule],
  declarations: [RecomendarJogoPage]
})
export class RecomendarJogoPageModule {}
