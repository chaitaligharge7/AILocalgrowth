import { Component, ElementRef, HostListener, computed, inject, input, output, signal } from '@angular/core';
import { ToastService } from '../../core/feedback/toast.service';

export interface TableExportColumn {
  key: string;
  label: string;
  visible?: boolean;
}

/**
 * Modern SaaS Table Export dropdown & refresh action group.
 * Matches design specification:
 * - Outline 'Export ▾' button with tray download icon
 * - Dropdown menu:
 *   1. Export CSV
 *   2. Export PDF
 *   3. Print
 *   4. Copy to Clipboard
 *   5. Column Visibility
 * - Rounded circular Refresh button
 */
@Component({
  selector: 'ui-table-export',
  standalone: true,
  template: `
    <div class="table-export-group">
      <div class="dropdown-wrap">
        <button
          type="button"
          class="export-btn"
          [attr.aria-expanded]="menuOpen()"
          aria-haspopup="menu"
          (click)="toggleMenu($event)"
          title="Export options"
        >
          <svg class="icon-download" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="7 10 12 15 17 10"></polyline>
            <line x1="12" y1="15" x2="12" y2="3"></line>
          </svg>
          <span class="label">Export</span>
          <svg class="icon-caret" viewBox="0 0 10 6" width="10" height="6" fill="currentColor">
            <path d="M0 0.5L5 5.5L10 0.5H0Z" />
          </svg>
        </button>

        @if (menuOpen()) {
          <div class="export-menu" role="menu">
            <button type="button" class="menu-item" (click)="triggerExportCsv()" role="menuitem">
              <svg class="menu-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
                <polyline points="10 9 9 9 8 9"></polyline>
              </svg>
              <span>Export CSV</span>
            </button>

            <button type="button" class="menu-item" (click)="triggerExportPdf()" role="menuitem">
              <svg class="menu-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <text x="8" y="17" font-size="8" font-family="sans-serif" font-weight="700" fill="currentColor" stroke="none">P</text>
              </svg>
              <span>Export PDF</span>
            </button>

            <button type="button" class="menu-item" (click)="triggerPrint()" role="menuitem">
              <svg class="menu-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"></polyline>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                <rect x="6" y="14" width="12" height="8"></rect>
              </svg>
              <span>Print</span>
            </button>

            <button type="button" class="menu-item" (click)="triggerCopyClipboard()" role="menuitem">
              <svg class="menu-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
              </svg>
              <span>Copy to Clipboard</span>
            </button>

            @if (columns().length > 0) {
              <div class="menu-divider"></div>
              <button
                type="button"
                class="menu-item menu-item--visibility"
                (click)="toggleColumnVisibilityPanel($event)"
                role="menuitem"
              >
                <svg class="menu-icon icon-eye" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                  <circle cx="12" cy="12" r="3"></circle>
                </svg>
                <span>Column Visibility</span>
              </button>

              @if (showColVisibility()) {
                <div class="col-visibility-panel" (click)="$event.stopPropagation()">
                  <div class="col-visibility-title">Toggle columns:</div>
                  @for (col of columns(); track col.key) {
                    <label class="col-checkbox-label">
                      <input
                        type="checkbox"
                        [checked]="isColumnVisible(col)"
                        (change)="toggleColumn(col, $event)"
                      />
                      <span>{{ col.label }}</span>
                    </label>
                  }
                </div>
              }
            }
          </div>
        }
      </div>

      @if (showRefresh()) {
        <button
          type="button"
          class="refresh-btn"
          (click)="onRefresh()"
          [disabled]="loading()"
          title="Refresh data"
          aria-label="Refresh data"
        >
          <svg
            class="icon-refresh"
            [class.spinning]="loading() || refreshing()"
            viewBox="0 0 24 24"
            width="15"
            height="15"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M23 4v6h-6"></path>
            <path d="M1 20v-6h6"></path>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          <span>Refresh</span>
        </button>
      }

      @if (copiedToast()) {
        <div class="copy-toast" role="status">Copied to clipboard!</div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
      }
      .table-export-group {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 8px;
      }
      .dropdown-wrap {
        position: relative;
        display: inline-block;
      }
      .export-btn {
        display: inline-flex;
        align-items: center;
        gap: 7px;
        height: 36px;
        padding: 0 14px;
        background: var(--color-surface, #ffffff);
        color: var(--color-text, #0f172a);
        border: 1px solid var(--color-border-strong, #cbd5e1);
        border-radius: var(--radius-sm, 8px);
        font-size: 0.825rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .export-btn:hover {
        background: var(--color-surface-alt, #f8fafc);
        border-color: var(--color-border-hover, #94a3b8);
        color: var(--color-text, #0f172a);
      }
      .export-btn:active {
        background: var(--color-neutral-bg, #f1f5f9);
      }
      .icon-caret {
        margin-left: 2px;
        opacity: 0.7;
        transition: transform 0.2s ease;
      }
      .refresh-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        height: 36px;
        padding: 0 12px;
        background: var(--color-surface, #ffffff);
        color: var(--color-text, #0f172a);
        border: 1px solid var(--color-border-strong, #cbd5e1);
        border-radius: var(--radius-sm, 8px);
        font-size: 0.825rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
      }
      .refresh-btn:hover:not(:disabled) {
        background: var(--color-surface-alt, #f8fafc);
        border-color: var(--color-border-hover, #94a3b8);
        color: var(--color-text, #0f172a);
      }
      .refresh-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }
      .icon-refresh.spinning {
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .export-menu {
        position: absolute;
        top: calc(100% + 6px);
        left: 0;
        z-index: 100;
        min-width: 190px;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.1), 0 8px 10px -6px rgba(15, 23, 42, 0.06);
        padding: 6px;
        display: flex;
        flex-direction: column;
        animation: dropdownIn 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes dropdownIn {
        from {
          opacity: 0;
          transform: translateY(-4px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .menu-item {
        display: flex;
        align-items: center;
        justify-content: flex-start;
        gap: 10px;
        width: 100%;
        padding: 8px 12px;
        background: none;
        border: none;
        border-radius: 6px;
        color: #334155;
        font-size: 0.825rem;
        font-weight: 500;
        text-align: left;
        white-space: nowrap;
        cursor: pointer;
        transition: background 0.12s ease, color 0.12s ease;
      }
      .menu-item:hover {
        background: #f8fafc;
        color: #0f172a;
      }
      .menu-icon {
        color: #64748b;
        flex-shrink: 0;
      }
      .menu-item--visibility {
        color: var(--color-text, #0f172a);
        font-weight: 600;
      }
      .menu-item--visibility:hover {
        background: var(--color-surface-alt, #f8fafc);
        color: var(--color-text, #0f172a);
      }
      .menu-item--visibility .icon-eye {
        color: var(--color-text-muted, #475569);
      }
      .menu-divider {
        height: 1px;
        background: #f1f5f9;
        margin: 4px 6px;
      }
      .col-visibility-panel {
        padding: 8px 10px;
        margin-top: 4px;
        background: #f8fafc;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        max-height: 200px;
        overflow-y: auto;
      }
      .col-visibility-title {
        font-size: 0.725rem;
        font-weight: 600;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        margin-bottom: 6px;
      }
      .col-checkbox-label {
        display: flex;
        align-items: center;
        gap: 7px;
        padding: 3px 0;
        font-size: 0.8rem;
        color: #1e293b;
        cursor: pointer;
      }
      .copy-toast {
        position: absolute;
        bottom: -32px;
        left: 50%;
        transform: translateX(-50%);
        background: #0f172a;
        color: #ffffff;
        font-size: 0.725rem;
        font-weight: 600;
        padding: 4px 10px;
        border-radius: 6px;
        white-space: nowrap;
        pointer-events: none;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
        animation: fadeInOut 2s ease forwards;
        z-index: 101;
      }
      @keyframes fadeInOut {
        0% {
          opacity: 0;
          transform: translate(-50%, 4px);
        }
        15% {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        85% {
          opacity: 1;
          transform: translate(-50%, 0);
        }
        100% {
          opacity: 0;
          transform: translate(-50%, -4px);
        }
      }
    `,
  ],
})
export class TableExportComponent {
  readonly data = input<any[]>([]);
  readonly columns = input<TableExportColumn[]>([]);
  readonly filename = input<string>('export');
  readonly loading = input<boolean>(false);
  readonly showRefresh = input<boolean>(true);

  readonly refresh = output<void>();
  readonly exportCsv = output<void>();
  readonly exportPdf = output<void>();
  readonly print = output<void>();
  readonly copyClipboard = output<void>();
  readonly columnVisibilityChange = output<{ key: string; visible: boolean }>();

  readonly menuOpen = signal(false);
  readonly showColVisibility = signal(false);
  readonly copiedToast = signal(false);
  readonly refreshing = signal(false);

  // Hidden column keys tracker
  readonly hiddenColumns = signal<Set<string>>(new Set<string>());

  private readonly toast = inject(ToastService);

  constructor(private readonly elementRef: ElementRef) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.menuOpen.set(false);
      this.showColVisibility.set(false);
    }
  }

  toggleMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.menuOpen.update((open) => !open);
  }

  onRefresh(): void {
    this.refreshing.set(true);
    setTimeout(() => this.refreshing.set(false), 600);
    this.refresh.emit();
    this.toast.info('Refreshing data…', 'Refresh', 1800);
  }

  toggleColumnVisibilityPanel(event: MouseEvent): void {
    event.stopPropagation();
    this.showColVisibility.update((show) => !show);
  }

  isColumnVisible(col: TableExportColumn): boolean {
    return !this.hiddenColumns().has(col.key);
  }

  toggleColumn(col: TableExportColumn, event: Event): void {
    const isChecked = (event.target as HTMLInputElement).checked;
    this.hiddenColumns.update((set) => {
      const next = new Set(set);
      if (isChecked) {
        next.delete(col.key);
      } else {
        next.add(col.key);
      }
      return next;
    });
    this.columnVisibilityChange.emit({ key: col.key, visible: isChecked });
  }

  triggerExportCsv(): void {
    this.menuOpen.set(false);
    this.exportCsv.emit();
    // Default automated CSV export if parent didn't intercept or if data exists
    const rows = this.data();
    if (!rows || rows.length === 0) return;

    const cols = this.getActiveColumns();
    const headers = cols.map((c) => this.escapeCsv(c.label)).join(',');
    const csvRows = rows.map((row) =>
      cols
        .map((c) => {
          const val = this.resolveRowValue(row, c.key);
          return this.escapeCsv(val);
        })
        .join(','),
    );

    const csvContent = [headers, ...csvRows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${this.filename() || 'data'}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  triggerExportPdf(): void {
    this.menuOpen.set(false);
    this.exportPdf.emit();
    // Open clean printable document formatted as PDF
    this.openPrintWindow(true);
  }

  triggerPrint(): void {
    this.menuOpen.set(false);
    this.print.emit();
    this.openPrintWindow(false);
  }

  triggerCopyClipboard(): void {
    this.menuOpen.set(false);
    this.copyClipboard.emit();

    const rows = this.data();
    if (!rows || rows.length === 0) return;

    const cols = this.getActiveColumns();
    const headers = cols.map((c) => c.label).join('\t');
    const body = rows
      .map((row) => cols.map((c) => this.resolveRowValue(row, c.key)).join('\t'))
      .join('\n');
    const tsv = `${headers}\n${body}`;

    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(tsv).then(() => {
        this.showToast();
      });
    }
  }

  private showToast(): void {
    this.copiedToast.set(true);
    setTimeout(() => {
      this.copiedToast.set(false);
    }, 2000);
  }

  private getActiveColumns(): TableExportColumn[] {
    const cols = this.columns();
    if (cols.length > 0) {
      return cols.filter((c) => !this.hiddenColumns().has(c.key));
    }
    const sample = this.data()[0];
    if (sample && typeof sample === 'object') {
      return Object.keys(sample).map((k) => ({
        key: k,
        label: k.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
      }));
    }
    return [];
  }

  private resolveRowValue(row: any, key: string): string {
    if (row == null) return '';
    const val = row[key];
    if (val == null) return '';
    if (typeof val === 'object') {
      return JSON.stringify(val);
    }
    return String(val);
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  private openPrintWindow(isPdfTitle: boolean): void {
    const rows = this.data();
    if (!rows || rows.length === 0) {
      window.print();
      return;
    }
    const cols = this.getActiveColumns();
    const title = `${this.filename() || 'Data Export'} - ${new Date().toLocaleDateString()}`;

    const printWin = window.open('', '_blank');
    if (!printWin) {
      window.print();
      return;
    }

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; color: #0f172a; margin: 0; }
            h1 { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
            .date { font-size: 12px; color: #64748b; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { text-align: center; padding: 8px 10px; background: #f8fafc; border-bottom: 2px solid #cbd5e1; font-weight: 600; text-transform: uppercase; font-size: 11px; color: #475569; }
            td { text-align: center; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; color: #1e293b; }
            tr:nth-child(even) td { background: #fdfdfd; }
            @media print {
              body { padding: 0; }
              @page { margin: 1cm; size: auto; }
            }
          </style>
        </head>
        <body>
          <h1>${this.filename() || 'Export Data'}</h1>
          <div class="date">Generated: ${new Date().toLocaleString()} · ${rows.length} records</div>
          <table>
            <thead>
              <tr>${cols.map((c) => `<th>${c.label}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${rows.map((r) => `<tr>${cols.map((c) => `<td>${this.resolveRowValue(r, c.key)}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  }
}
