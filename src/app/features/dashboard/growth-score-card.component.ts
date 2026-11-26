import { Component, Input, computed, signal } from '@angular/core';
import { GrowthScore } from '../../core/growth/growth.models';
import { SparklineChartComponent } from '../../shared/dashboard-pattern/sparkline-chart.component';

/**
 * Compact horizontal Business Growth Score card (BW-012):
 * Left column holds the 84px radial SVG gauge + band summary; right column
 * packs the 5 formula components into a dense multi-column grid with zero
 * wasted vertical space.
 */
@Component({
  selector: 'app-growth-score-card',
  standalone: true,
  imports: [SparklineChartComponent],
  template: `
    <section class="card growth-card" aria-labelledby="growth-title">
      <header class="growth-header">
        <div class="growth-header-title">
          <h2 id="growth-title">Business growth score</h2>
          <span class="badge badge--neutral" title="A fixed weighted formula over your own data. It is not AI.">Transparent formula</span>
        </div>
        @if (score(); as s) {
          <div class="header-right">
            @if (s.band) {
              <span
                class="badge badge--dot"
                [class.badge--success]="s.band === 'strong'"
                [class.badge--warning]="s.band === 'fair'"
                [class.badge--danger]="s.band === 'needs_attention'"
              >
                {{ bandLabel(s.band) }}
              </span>
            } @else {
              <span class="badge badge--neutral">Not enough data yet</span>
            }
            <span class="coverage-chip">Coverage {{ s.coverage_pct }}% · min {{ s.min_coverage_pct }}%</span>
          </div>
        }
      </header>

      @if (score(); as s) {
        <div class="split-body">
          <div class="gauge-panel">
            <div class="gauge-wrap">
              <svg viewBox="0 0 84 84" class="gauge" aria-hidden="true">
                <circle cx="42" cy="42" r="35" class="gauge-track" />
                @if (s.score !== null) {
                  <circle
                    cx="42"
                    cy="42"
                    r="35"
                    class="gauge-fill"
                    [class.gauge-fill--warn]="s.band === 'fair'"
                    [class.gauge-fill--danger]="s.band === 'needs_attention'"
                    [attr.stroke-dasharray]="dashArray(s.score)"
                  />
                }
              </svg>
              <div class="big" [class.muted]="s.score === null" data-test="growth-score-value">
                <span class="big-num">{{ s.score === null ? '—' : s.score }}</span>
                @if (s.score !== null) {
                  <small class="big-denom">/100</small>
                }
              </div>
            </div>
            <p class="explain">{{ s.explanation }}</p>
          </div>

          <ul class="components">
            @for (c of s.components; track c.code) {
              <li class="component-item">
                <div class="row">
                  <strong class="comp-label">{{ c.label }}</strong>
                  <span class="comp-val">
                    @if (c.status === 'scored') {
                      <span class="score-value">{{ c.value }}<small>/100</small></span>
                    } @else {
                      <span class="insufficient-pill" data-test="insufficient">Insufficient data</span>
                    }
                  </span>
                </div>
                <div class="bar" aria-hidden="true">
                  <i [style.width.%]="c.value ?? 0" [class.off]="c.status !== 'scored'"></i>
                </div>
                <div class="component-footer">
                  <span class="muted small">
                    {{ c.detail }} · weight {{ c.weight }}{{ c.effective_weight_pct !== null ? ' (' + c.effective_weight_pct + '%)' : ' (left out)' }}
                  </span>
                  <button type="button" class="link" (click)="toggle(c.code)">
                    {{ open() === c.code ? 'Hide' : 'Source' }}
                  </button>
                </div>
                @if (open() === c.code) {
                  <p class="small source-box">Source: {{ c.source }}</p>
                }
              </li>
            }
          </ul>
        </div>

        @if (points().length >= 2) {
          <div class="sparkline-wrapper">
            <app-sparkline-chart title="Score history" [points]="points()" />
          </div>
        }
        <p class="muted small history-note">{{ s.history_note }}</p>
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else {
        <p class="muted small">Loading growth score…</p>
      }
    </section>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .growth-card {
        padding: 12px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .growth-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .growth-header-title,
      .header-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      h2 {
        margin: 0;
        font-size: 0.92rem;
        font-weight: var(--font-bold);
      }
      .coverage-chip {
        font-size: 0.68rem;
        font-weight: var(--font-medium);
        color: var(--color-text-muted);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        padding: 1px 8px;
        font-variant-numeric: tabular-nums;
      }

      /* Horizontal Split Body: Gauge Left + Dense Metric Grid Right */
      .split-body {
        display: grid;
        grid-template-columns: 230px minmax(0, 1fr);
        gap: 12px;
        align-items: stretch;
      }
      .gauge-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .gauge-wrap {
        position: relative;
        width: 84px;
        height: 84px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .gauge {
        position: absolute;
        inset: 0;
        width: 84px;
        height: 84px;
        transform: rotate(-90deg);
      }
      .gauge-track {
        fill: none;
        stroke: var(--color-border);
        stroke-width: 6.5;
      }
      .gauge-fill {
        fill: none;
        stroke: var(--color-primary);
        stroke-width: 6.5;
        stroke-linecap: round;
        transition: stroke-dasharray 0.35s ease;
      }
      .gauge-fill--warn {
        stroke: #d97706;
      }
      .gauge-fill--danger {
        stroke: var(--color-danger);
      }
      .big {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        line-height: 1;
        color: var(--color-text);
        font-variant-numeric: tabular-nums;
      }
      .big-num {
        font-size: 1.2rem;
        font-weight: var(--font-bold);
        letter-spacing: -0.02em;
      }
      .big-denom {
        font-size: 0.64rem;
        color: var(--color-text-subtle);
        font-weight: var(--font-medium);
        margin-top: 2px;
      }
      .big.muted .big-num {
        color: var(--color-text-muted);
      }
      .explain {
        margin: 0;
        color: var(--color-text-muted);
        font-size: 0.7rem;
        line-height: 1.35;
      }

      /* Compact Multi-Column Metrics Grid */
      .components {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
        gap: 6px;
        align-content: start;
      }
      .component-item {
        padding: 7px 10px;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        background: var(--color-surface);
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
      }
      .comp-label {
        font-size: 0.74rem;
        font-weight: var(--font-semibold);
        color: var(--color-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .comp-val {
        flex-shrink: 0;
      }
      .score-value {
        font-size: 0.74rem;
        font-weight: var(--font-bold);
        color: var(--color-primary);
        font-variant-numeric: tabular-nums;
      }
      .score-value small {
        color: var(--color-text-subtle);
        font-weight: normal;
      }
      .insufficient-pill {
        display: inline-block;
        font-size: 0.64rem;
        font-weight: var(--font-medium);
        color: var(--color-text-subtle);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-pill);
        padding: 0 6px;
      }
      .bar {
        background: var(--color-neutral-bg);
        height: 4px;
        border-radius: 999px;
        overflow: hidden;
      }
      .bar i {
        display: block;
        height: 100%;
        border-radius: 999px;
        background: linear-gradient(90deg, var(--color-primary), #14b8a6);
        transition: width 0.3s ease;
      }
      .bar i.off {
        background: transparent;
      }
      .component-footer {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 6px;
      }
      .source-box {
        margin: 2px 0 0;
        padding: 4px 7px;
        background: var(--color-surface-alt);
        border-radius: 4px;
        color: var(--color-text-muted);
        border-left: 2px solid var(--color-primary);
      }
      .muted {
        color: var(--color-text-muted);
      }
      .small {
        font-size: 0.68rem;
        line-height: 1.3;
        margin: 0;
      }
      .link {
        background: none;
        border: 0;
        padding: 0;
        color: var(--color-primary);
        cursor: pointer;
        font-size: 0.66rem;
        font-weight: var(--font-semibold);
        flex-shrink: 0;
      }
      .link:hover:not(:disabled) {
        background: none;
        text-decoration: underline;
      }
      .sparkline-wrapper {
        margin-top: 2px;
      }
      .history-note {
        margin: 0;
      }
      .form-error {
        margin: 0;
        font-size: var(--text-xs);
        color: var(--color-danger);
      }

      @media (max-width: 820px) {
        .split-body {
          grid-template-columns: 1fr;
        }
        .gauge-panel {
          flex-direction: row;
          text-align: left;
        }
      }
    `,
  ],
})
export class GrowthScoreCardComponent {
  private readonly _score = signal<GrowthScore | null>(null);
  private readonly _error = signal<string | null>(null);
  readonly score = this._score.asReadonly();
  readonly error = this._error.asReadonly();
  readonly open = signal<string | null>(null);
  readonly points = computed(() => (this._score()?.history ?? []).filter((h) => h.score !== null).map((h) => h.score as number));

  @Input() set value(v: GrowthScore | null) {
    this._score.set(v);
  }
  @Input() set errorMessage(v: string | null) {
    this._error.set(v);
  }

  dashArray(val: number): string {
    const circumference = 2 * Math.PI * 35;
    const clamped = Math.max(0, Math.min(100, val));
    return `${(clamped / 100) * circumference} ${circumference}`;
  }

  toggle(code: string): void {
    this.open.set(this.open() === code ? null : code);
  }

  bandLabel(band: string): string {
    return band === 'strong' ? 'Strong' : band === 'fair' ? 'Fair' : 'Needs attention';
  }
}
