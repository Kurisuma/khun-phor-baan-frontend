import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthUiService } from './services/auth-ui/AuthUiService';
import { CartUiService } from './services/cart-ui/CartUiService';

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthUiService,
          useValue: {
            hydrate: () => Promise.resolve(),
            initialized: () => true,
            authenticated: () => false,
            user: () => null,
            roles: () => [],
            isAdmin: () => false,
            logout: () => Promise.resolve(),
          },
        },
        {
          provide: CartUiService,
          useValue: {
            cart: () => null,
            load: () => Promise.resolve(),
          },
        },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render the shell brand', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand')?.textContent).toContain('KhunPhorBaan');
  });
});
