import { Component, Input } from '@angular/core';

/**
 * Split-screen auth layout matching the premium redesign reference
 * (designsnew/BW01/png/BW-001..BW-004.png): a dark
 * navy/teal gradient hero panel with static marketing copy on the left,
 * and a white card with the actual form content (projected) on the right.
 * Every BW-001..BW-004 reference image uses this identical shell with
 * only the right-panel title/subtitle differing — see docs/UI_REDESIGN_MASTER_PLAN.md.
 */
@Component({
  selector: 'app-auth-shell',
  standalone: true,
  template: `
    <main class="auth-shell">
      <section class="auth-hero">
        <div class="auth-hero__badge">✦</div>
        <p class="auth-hero__brand">LocalGrowth AI</p>
        <h2 class="auth-hero__headline">Grow locally.<br />Manage brilliantly.</h2>
        <p class="auth-hero__sub">
          Connect your business, automate marketing, and get insights that help you grow.
        </p>
        <ul class="auth-hero__checklist">
          <li>Secure account and access management</li>
          <li>Business insights in one beautiful workspace</li>
          <li>AI-powered recommendations and content</li>
        </ul>
      </section>
      <section class="auth-panel">
        <div class="auth-panel__inner">
          <div class="auth-panel__wordmark">
            <span class="auth-panel__logo">▦</span>
            LocalGrowth <em>AI</em>
          </div>
          <h1 class="auth-panel__title">{{ title }}</h1>
          @if (subtitle) {
            <p class="auth-panel__subtitle">{{ subtitle }}</p>
          }
          <ng-content></ng-content>
          <p class="auth-panel__footer">Protected by encrypted sessions and account-level permissions.</p>
        </div>
      </section>
    </main>
  `,
  styles: [
    `
      .auth-shell {
        min-height: 100vh;
        display: flex;
        flex-wrap: wrap;
        background: var(--color-bg);
        font-family: var(--font-sans);
      }
      .auth-hero {
        flex: 1 1 440px;
        min-height: 320px;
        background: radial-gradient(circle at 18% 18%, rgba(63, 183, 163, 0.18), transparent 45%),
          linear-gradient(160deg, var(--shell-sidebar-bg) 0%, var(--shell-sidebar-active-bg) 100%);
        color: #fff;
        padding: clamp(2.25rem, 5vw, 4.5rem);
        display: flex;
        flex-direction: column;
        justify-content: center;
      }
      .auth-hero__badge {
        width: 48px;
        height: 48px;
        border-radius: 14px;
        background: var(--color-primary);
        box-shadow: 0 8px 20px rgba(7, 141, 126, 0.35);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.25rem;
        margin-bottom: var(--space-5, 1.5rem);
      }
      .auth-hero__brand {
        font-weight: 600;
        font-size: var(--text-sm);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--color-accent-light-teal, #3fb7a3);
        margin: 0 0 var(--space-2, 0.75rem);
      }
      .auth-hero__headline {
        font-family: var(--font-display);
        font-size: clamp(2rem, 3.2vw, 2.75rem);
        line-height: 1.14;
        margin: 0 0 var(--space-4, 1rem);
        color: #fff;
      }
      .auth-hero__sub {
        color: rgba(238, 243, 246, 0.84);
        max-width: 38ch;
        line-height: 1.6;
        margin: 0 0 var(--space-5, 1.5rem);
      }
      .auth-hero__checklist {
        list-style: none;
        padding: 0;
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.85rem;
      }
      .auth-hero__checklist li {
        padding-left: 1.75rem;
        position: relative;
        color: rgba(238, 243, 246, 0.92);
        font-size: var(--text-sm);
      }
      .auth-hero__checklist li::before {
        content: '✓';
        position: absolute;
        left: 0;
        top: 0;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: rgba(63, 183, 163, 0.18);
        color: var(--color-accent-light-teal, #3fb7a3);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.72rem;
        font-weight: 700;
      }
      .auth-panel {
        flex: 1 1 460px;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: var(--space-6, 2.5rem) var(--space-4, 1.5rem);
      }
      .auth-panel__inner {
        width: 100%;
        max-width: 448px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-md);
        padding: clamp(1.75rem, 3.5vw, 2.5rem);
      }
      .auth-panel__wordmark {
        display: flex;
        align-items: center;
        gap: var(--space-2, 0.5rem);
        font-weight: 700;
        font-size: var(--text-base);
        color: var(--color-text);
        margin-bottom: var(--space-5, 1.5rem);
      }
      .auth-panel__logo {
        width: 28px;
        height: 28px;
        border-radius: var(--radius-sm);
        background: var(--color-primary-light);
        color: var(--color-primary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        font-size: 0.9rem;
      }
      .auth-panel__wordmark em {
        color: var(--color-primary);
        font-style: normal;
      }
      .auth-panel__title {
        margin: 0 0 var(--space-1, 0.25rem);
        font-size: 1.5rem;
        line-height: 1.25;
        color: var(--color-text);
      }
      .auth-panel__subtitle {
        margin: 0 0 var(--space-5, 1.5rem);
        font-size: var(--text-sm);
        color: var(--color-text-muted);
      }
      .auth-panel__footer {
        margin: var(--space-5, 1.5rem) 0 0;
        padding-top: var(--space-4, 1rem);
        border-top: 1px solid var(--color-border);
        font-size: var(--text-xs);
        color: var(--color-text-subtle);
        text-align: center;
      }
      @media (max-width: 899px) {
        .auth-hero {
          min-height: auto;
          padding: var(--space-5) var(--space-4);
        }
        .auth-hero__checklist {
          display: none;
        }
      }
    `,
  ],
})
export class AuthShellComponent {
  @Input() title = '';
  @Input() subtitle = 'Access your business growth workspace securely.';
}
