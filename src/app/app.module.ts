import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { RouteReuseStrategy } from '@angular/router';

import { IonicModule, IonicRouteStrategy } from '@ionic/angular';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';

import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';
import { AuthInterceptor } from './interceptors/auth.interceptor';

import { LoginPage } from './modules/auth/login.page';
import { RegisterPage } from './modules/auth/register.page';
import { UsersListPage } from './modules/users/users-list.page';
import { GamesListPage } from './modules/games/games-list.page';
import { HomePage } from './home.page';
import { GameAdminShellComponent } from './modules/games/components/game-admin-shell/game-admin-shell.component';
import { GameFormComponent } from './modules/games/components/game-form/game-form.component';
import { GameListComponent } from './modules/games/components/game-list/game-list.component';
import { TaxonomyManagerComponent } from './modules/games/components/taxonomy-manager/taxonomy-manager.component';

@NgModule({
  declarations: [
    AppComponent,
    LoginPage,
    RegisterPage,
    UsersListPage,
    GamesListPage,
    HomePage,
    GameAdminShellComponent,
    GameFormComponent,
    GameListComponent,
    TaxonomyManagerComponent,
  ],
  imports: [BrowserModule, IonicModule.forRoot(), AppRoutingModule, FormsModule, ReactiveFormsModule, HttpClientModule],
  providers: [
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptor, multi: true }
  ],
  bootstrap: [AppComponent],
})
export class AppModule {}