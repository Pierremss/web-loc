import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { MenuAdminPage } from './menu-admin.page';

describe('MenuAdminPage', () => {
  let component: MenuAdminPage;
  let fixture: ComponentFixture<MenuAdminPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [MenuAdminPage],
      imports: [HttpClientTestingModule]
    }).compileComponents();

    fixture = TestBed.createComponent(MenuAdminPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
