import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/feedback/toast.service';

/**
 * Global toast notification stack mounted once in `AppComponent`.
 * Displays consistent success and error feedback for all create, edit,
 * and delete actions across every module.
 */
@Component({
  selector: 'app-toast-container',
  standalone: true,
  template: `
    <div class="toast-viewport" aria-live="polite" aria-atomic="false" data-testid="global-toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="toast-card"
          [class.toast-card--success]="toast.type === 'success'"
          [class.toast-card--error]="toast.type === 'error'"
          [class.toast-card--warning]="toast.type === 'warning'"
          [class.toast-card--info]="toast.type === 'info'"
          [attr.role]="toast.type === 'error' ? 'alert' : 'status'"
          [attr.data-testid]="'toast-' + toast.type"
        >
          <span class="toast-icon" aria-hidden="true">
            @if (toast.type === 'success') {
              <svg viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="currentColor" fill-opacity="0.14" />
                <path d="M6.2 10.3 8.7 12.8 13.8 7.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            } @else if (toast.type === 'error') {
              <svg viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="currentColor" fill-opacity="0.14" />
                <path d="M10 6.2v4.6M10 13.8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            } @else {
              <svg viewBox="0 0 20 20" fill="none">
                <circle cx="10" cy="10" r="9" fill="currentColor" fill-opacity="0.14" />
                <path d="M10 9v4.5M10 6.5h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
              </svg>
            }
          </span>

          <div class="toast-body">
            <strong class="toast-title">{{ toast.title }}</strong>
            <p class="toast-msg">{{ toast.message }}</p>
          </div>

          <button
            type="button"
            class="toast-close"
            aria-label="Dismiss notification"
            (click)="toastService.dismiss(toast.id)"
          >
            <svg viewBox="0 0 16 16" fill="none">
              <path d="M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      }
    </div>
  `,
  styles: [
    `
      .toast-viewport {
        position: fixed;
        top: 1.25rem;
        right: 1.25rem;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        gap: 0.625rem;
        width: min(24rem, calc(100vw - 2rem));
        pointer-events: none;
      }

      .toast-card {
        pointer-events: auto;
        display: flex;
        align-items: flex-start;
        gap: 0.75rem;
        padding: 0.85rem 0.95rem;
        border-radius: 12px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-left: 4px solid #0d9488;
        box-shadow: 0 12px 28px -8px rgba(15, 23, 42, 0.16), 0 4px 10px -4px rgba(15, 23, 42, 0.08);
        animation: toastSlideIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
      }

      .toast-card--success {
        border-left-color: #059669;
      }
      .toast-card--success .toast-icon {
        color: #059669;
      }

      .toast-card--error {
        border-left-color: #dc2626;
      }
      .toast-card--error .toast-icon {
        color: #dc2626;
      }

      .toast-card--warning {
        border-left-color: #d97706;
      }
      .toast-card--warning .toast-icon {
        color: #d97706;
      }

      .toast-card--info {
        border-left-color: #0284c7;
      }
      .toast-card--info .toast-icon {
        color: #0284c7;
      }

      .toast-icon {
        flex-shrink: 0;
        width: 1.35rem;
        height: 1.35rem;
        margin-top: 0.05rem;
      }
      .toast-icon svg {
        width: 100%;
        height: 100%;
        display: block;
      }

      .toast-body {
        flex: 1;
        min-width: 0;
      }

      .toast-title {
        display: block;
        font-size: 0.85rem;
        font-weight: 600;
        color: #0f172a;
        line-height: 1.3;
      }

      .toast-msg {
        margin: 0.18rem 0 0;
        font-size: 0.82rem;
        color: #475569;
        line-height: 1.4;
        word-break: break-word;
      }

      .toast-close {
        flex-shrink: 0;
        width: 1.5rem;
        height: 1.5rem;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 6px;
        background: transparent;
        color: #94a3b8;
        cursor: pointer;
        padding: 0;
        transition: background-color 0.15s ease, color 0.15s ease;
      }
      .toast-close:hover {
        background: #f1f5f9;
        color: #334155;
      }
      .toast-close svg {
        width: 0.9rem;
        height: 0.9rem;
      }

      @keyframes toastSlideIn {
        from {
          opacity: 0;
          transform: translateY(-8px) translateX(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0) translateX(0);
        }
      }

      @media (max-width: 640px) {
        .toast-viewport {
          top: 0.75rem;
          right: 0.75rem;
          left: 0.75rem;
          width: auto;
        }
      }
    `,
  ],
})
export class ToastContainerComponent {
  readonly toastService = inject(ToastService);
}
