import { Component, input, output } from '@angular/core';
import { TableExportColumn, TableExportComponent } from './table-export.component';

/**
 * Universal SaaS Table Toolbar with Search input, filter slots, and Export/Refresh action group.
 */
@Component({
  selector: 'ui-table-toolbar',
  standalone: true,
  imports: [TableExportComponent],
  template: `
    <div class="table-toolbar-container">
      <div class="toolbar-left">
        @if (showSearch()) {
          <div class="search-wrap">
            <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
            </svg>
            <input
              type="search"
              class="search-input"
              [placeholder]="placeholder()"
              [value]="searchTerm()"
              (input)="onSearchInput($event)"
            />
            @if (searchTerm()) {
              <button type="button" class="clear-btn" (click)="clearSearch()" title="Clear search">
                ✕
              </button>
            }
          </div>
        }
        <ng-content select="[filters]" />
      </div>

      <div class="toolbar-right">
        <ng-content select="[actions]" />
        <ui-table-export
          [data]="data()"
          [columns]="columns()"
          [filename]="filename()"
          [loading]="loading()"
          [showRefresh]="showRefresh()"
          (refresh)="searchChange.emit(''); refresh.emit()"
          (exportCsv)="exportCsv.emit()"
          (exportPdf)="exportPdf.emit()"
          (print)="print.emit()"
          (copyClipboard)="copyClipboard.emit()"
          (columnVisibilityChange)="columnVisibilityChange.emit($event)"
        />
      </div>
    </div>
  `,
  styles: [
    `
      .table-toolbar-container {
        display: flex;
        align-items: flex-end;
        justify-content: flex-start;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 14px;
        width: 100%;
      }
      .toolbar-left {
        display: flex;
        align-items: flex-end;
        gap: 10px;
        flex-wrap: wrap;
        flex: 0 1 auto;
      }
      .toolbar-right {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-shrink: 0;
      }
      .search-wrap {
        position: relative;
        display: flex;
        align-items: center;
        width: 240px;
        min-width: 180px;
        max-width: 260px;
        flex: 0 1 240px;
      }
      .search-icon {
        position: absolute;
        left: 10px;
        width: 15px;
        height: 15px;
        color: #94a3b8;
        pointer-events: none;
        z-index: 1;
      }
      .search-wrap input.search-input {
        width: 100%;
        height: 36px;
        padding: 0 32px 0 34px;
        background: #ffffff;
        border: 1px solid #cbd5e1;
        border-radius: 8px;
        font-size: 0.84rem;
        color: #0f172a;
        outline: none;
        transition: all 0.15s ease;
      }
      .search-wrap input.search-input:focus {
        border-color: var(--color-primary, #078d7e);
        box-shadow: 0 0 0 3px var(--color-primary-ring, rgba(7, 141, 126, 0.16));
      }
      .search-input::placeholder {
        color: #94a3b8;
      }
      .clear-btn {
        position: absolute;
        right: 8px;
        width: 20px;
        height: 20px;
        padding: 0;
        background: #f1f5f9;
        border: none;
        border-radius: 50%;
        color: #64748b;
        font-size: 11px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
      }
      .clear-btn:hover {
        background: #e2e8f0;
        color: #1e293b;
      }
    `,
  ],
})
export class TableToolbarComponent {
  readonly searchTerm = input<string>('');
  readonly placeholder = input<string>('Search records…');
  readonly showSearch = input<boolean>(true);
  readonly showRefresh = input<boolean>(true);
  readonly loading = input<boolean>(false);
  readonly data = input<any[]>([]);
  readonly columns = input<TableExportColumn[]>([]);
  readonly filename = input<string>('export');

  readonly searchChange = output<string>();
  readonly refresh = output<void>();
  readonly exportCsv = output<void>();
  readonly exportPdf = output<void>();
  readonly print = output<void>();
  readonly copyClipboard = output<void>();
  readonly columnVisibilityChange = output<{ key: string; visible: boolean }>();

  onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.searchChange.emit(val);
  }

  clearSearch(): void {
    this.searchChange.emit('');
  }
}
