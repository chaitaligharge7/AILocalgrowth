import { Component, input, output } from '@angular/core';

export type SortDirection = 'asc' | 'desc';

/**
 * Pure helper to sort an array of table rows by a column key without mutating the input.
 */
export function sortTableRows<T>(
  rows: readonly T[],
  column: string,
  direction: SortDirection,
  getter: (row: T, col: string) => string | number | boolean | null | undefined,
): T[] {
  if (!column) {
    return [...rows];
  }
  const copy = [...rows];
  copy.sort((a, b) => {
    const va = getter(a, column);
    const vb = getter(b, column);
    if (va === vb) return 0;
    if (va === null || va === undefined || va === '') return 1;
    if (vb === null || vb === undefined || vb === '') return -1;
    let cmp = 0;
    if (typeof va === 'number' && typeof vb === 'number') {
      cmp = va - vb;
    } else if (typeof va === 'boolean' && typeof vb === 'boolean') {
      cmp = Number(va) - Number(vb);
    } else {
      cmp = String(va).localeCompare(String(vb), undefined, { numeric: true, sensitivity: 'base' });
    }
    return direction === 'desc' ? -cmp : cmp;
  });
  return copy;
}

/**
 * Reusable centered table column header with crisp upward & downward sort arrows.
 */
@Component({
  selector: 'ui-sort-header',
  standalone: true,
  template: `
    <span
      role="button"
      tabindex="0"
      class="sortable-th"
      [attr.aria-sort]="active() ? (direction() === 'asc' ? 'ascending' : 'descending') : 'none'"
      (click)="sort.emit()"
      (keydown.enter)="sort.emit()"
      (keydown.space)="$event.preventDefault(); sort.emit()"
    >
      <span>{{ label() }}</span>
      <svg
        class="sort-arrows"
        viewBox="0 0 12 16"
        width="10"
        height="13"
        aria-hidden="true"
      >
        <path
          d="M6 1L10 6H2L6 1Z"
          [attr.fill]="active() && direction() === 'asc' ? 'var(--color-primary, #078d7e)' : 'currentColor'"
          [attr.opacity]="active() && direction() === 'asc' ? 1 : 0.35"
        />
        <path
          d="M6 15L2 10H10L6 15Z"
          [attr.fill]="active() && direction() === 'desc' ? 'var(--color-primary, #078d7e)' : 'currentColor'"
          [attr.opacity]="active() && direction() === 'desc' ? 1 : 0.35"
        />
      </svg>
    </span>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
      }
      .sortable-th {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        background: none;
        border: none;
        padding: 2px 4px;
        font: inherit;
        font-size: inherit;
        font-weight: inherit;
        text-transform: inherit;
        letter-spacing: inherit;
        color: inherit;
        cursor: pointer;
        white-space: nowrap;
      }
      .sortable-th:hover {
        color: var(--color-text, #0f172a);
      }
      .sort-arrows {
        flex-shrink: 0;
        transition: opacity 0.15s ease;
      }
    `,
  ],
})
export class SortHeaderComponent {
  readonly label = input.required<string>();
  readonly active = input<boolean>(false);
  readonly direction = input<SortDirection>('asc');
  readonly sort = output<void>();
}
