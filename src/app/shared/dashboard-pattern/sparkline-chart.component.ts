import { Component, Input } from '@angular/core';

let nextGradientId = 0;

/**
 * Lightweight inline-SVG area + line chart with gradient fill and real
 * min/max/latest reference pills.
 */
@Component({
  selector: 'app-sparkline-chart',
  standalone: true,
  template: `
    <section class="chart-card">
      <div class="chart-head">
        <h2>{{ title }}</h2>
        @if (points.length >= 2) {
          <div class="chart-stats">
            <span class="stat-chip">Min <strong>{{ minValue() }}</strong></span>
            <span class="stat-chip">Max <strong>{{ maxValue() }}</strong></span>
            <span class="stat-chip stat-chip--latest">Latest <strong>{{ latestValue() }}</strong></span>
          </div>
        }
      </div>
      @if (points.length < 2) {
        <p class="empty">Not enough data points yet to chart.</p>
      } @else {
        <svg [attr.viewBox]="'0 0 ' + width + ' ' + height" preserveAspectRatio="none" class="chart">
          <defs>
            <linearGradient [attr.id]="gradId" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#078d7e" stop-opacity="0.22" />
              <stop offset="100%" stop-color="#078d7e" stop-opacity="0.0" />
            </linearGradient>
          </defs>
          @for (y of gridY(); track y) {
            <line x1="0" [attr.x2]="width" [attr.y1]="y" [attr.y2]="y" class="grid" />
          }
          <polygon [attr.points]="areaPoints()" [attr.fill]="'url(#' + gradId + ')'" />
          <polyline [attr.points]="linePoints()" class="line" />
          @for (p of dotPositions(); track $index) {
            <circle [attr.cx]="p.x" [attr.cy]="p.y" r="3.2" class="dot" />
          }
        </svg>
      }
    </section>
  `,
  styles: [
    `
      .chart-card {
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-xs);
        padding: 12px 14px;
      }
      .chart-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
        flex-wrap: wrap;
      }
      h2 {
        margin: 0;
        font-size: 0.85rem;
        font-weight: var(--font-bold);
      }
      .chart-stats {
        display: flex;
        align-items: center;
        gap: 6px;
        font-variant-numeric: tabular-nums;
      }
      .stat-chip {
        font-size: 0.68rem;
        color: var(--color-text-muted);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        padding: 1px 7px;
      }
      .stat-chip strong {
        color: var(--color-text);
      }
      .stat-chip--latest {
        background: var(--color-primary-light);
        border-color: #99f6e4;
        color: var(--color-primary);
      }
      .stat-chip--latest strong {
        color: var(--color-primary);
      }
      .chart {
        width: 100%;
        height: 130px;
        display: block;
      }
      .grid {
        stroke: var(--color-border);
        stroke-width: 1;
        stroke-dasharray: 3 3;
      }
      .line {
        fill: none;
        stroke: var(--color-primary);
        stroke-width: 2.25;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .dot {
        fill: var(--color-surface);
        stroke: var(--color-primary);
        stroke-width: 2;
      }
      .empty {
        margin: 0;
        color: var(--color-text-muted);
        font-size: var(--text-xs);
      }
    `,
  ],
})
export class SparklineChartComponent {
  @Input() title = 'Performance over time';
  @Input({ required: true }) points: number[] = [];

  readonly gradId = `lg-spark-${++nextGradientId}`;
  readonly width = 600;
  readonly height = 130;

  minValue(): number {
    return this.points.length ? Math.min(...this.points) : 0;
  }

  maxValue(): number {
    return this.points.length ? Math.max(...this.points) : 0;
  }

  latestValue(): number {
    return this.points.length ? this.points[this.points.length - 1] : 0;
  }

  gridY(): number[] {
    const n = 4;
    return Array.from({ length: n }, (_, i) => (this.height / (n - 1)) * i);
  }

  private scaled(): { x: number; y: number }[] {
    const pts = this.points;
    if (pts.length < 2) {
      return [];
    }
    const min = Math.min(...pts);
    const max = Math.max(...pts);
    const range = max - min || 1;
    const padY = 12;
    return pts.map((v, i) => ({
      x: (i / (pts.length - 1)) * this.width,
      y: this.height - padY - ((v - min) / range) * (this.height - padY * 2),
    }));
  }

  linePoints(): string {
    return this.scaled()
      .map((p) => `${p.x},${p.y}`)
      .join(' ');
  }

  areaPoints(): string {
    const pts = this.scaled();
    if (pts.length < 2) {
      return '';
    }
    const first = pts[0];
    const last = pts[pts.length - 1];
    return `${first.x},${this.height} ${pts.map((p) => `${p.x},${p.y}`).join(' ')} ${last.x},${this.height}`;
  }

  dotPositions(): { x: number; y: number }[] {
    return this.scaled();
  }
}
