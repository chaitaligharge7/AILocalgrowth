import { TestBed } from '@angular/core/testing';
import { HealthComponent } from './health.component';

describe('HealthComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HealthComponent],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(HealthComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the booted heading', () => {
    const fixture = TestBed.createComponent(HealthComponent);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Scriptlet LocalGrowth — Angular shell booted');
  });
});
