import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';
import { IonicModule, ToastController } from '@ionic/angular';
import { ReactiveFormsModule } from '@angular/forms';
import { of } from 'rxjs';
import { Router } from '@angular/router';
import { RecuperarSenhaPage } from './recuperar-senha.page';
import { AuthService } from '../../modules/auth/auth.service';

class AuthServiceStub {
  requestPasswordReset() {
    return of({ success: true, message: '' });
  }

  resetPassword() {
    return of({ success: true, message: '' });
  }
}

describe('RecuperarSenhaPage', () => {
  let component: RecuperarSenhaPage;
  let fixture: ComponentFixture<RecuperarSenhaPage>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      declarations: [RecuperarSenhaPage],
      imports: [IonicModule.forRoot(), ReactiveFormsModule],
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
        {
          provide: ToastController,
          useValue: {
            create: jasmine.createSpy('create').and.resolveTo({ present: jasmine.createSpy('present') })
          }
        },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } }
      ]
    }).compileComponents().then(() => {
      fixture = TestBed.createComponent(RecuperarSenhaPage);
      component = fixture.componentInstance;
      fixture.detectChanges();
    });
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
