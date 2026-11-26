import { Component } from '@angular/core';

/**
 * S0 landing/health-check page. Real feature routes (owner dashboard,
 * audit, content studio, etc.) land starting S1+ per
 * docs/requirements-traceability.md. This page intentionally shows no
 * fabricated metrics or fake buttons, per CLAUDE.md.
 */
@Component({
  selector: 'app-health',
  standalone: true,
  template: `
    <main class="health">
      <h1>Scriptlet LocalGrowth — Angular shell booted</h1>
      <p>Sprint S0 foundations shell. No business features are implemented yet.</p>
      <ul>
        <li>Stack: Angular standalone components</li>
        <li>API contract: <code>openapi/openapi.yaml</code></li>
        <li>Status: see <code>docs/SPRINT_S0_REPORT.md</code></li>
      </ul>
    </main>
  `,
  styles: [
    `
      .health {
        font-family: system-ui, sans-serif;
        max-width: 640px;
        margin: 4rem auto;
        padding: 0 1rem;
      }
    `,
  ],
})
export class HealthComponent {}
