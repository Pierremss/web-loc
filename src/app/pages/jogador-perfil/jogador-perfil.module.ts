import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonicModule } from '@ionic/angular';
import { JogadorPerfilPage } from './jogador-perfil.page';
import { JogadorPerfilPageRoutingModule } from './jogador-perfil-routing.module';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    IonicModule,
    JogadorPerfilPageRoutingModule
  ],
  declarations: [JogadorPerfilPage],
  exports: [JogadorPerfilPage]
})
export class JogadorPerfilPageModule {}
