import { DatePipe } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges, signal } from '@angular/core';
import { AuditTask, TASK_STATUSES, TaskBoard, TaskStatus } from '../../core/audit/audit-insights.models';
import { AuditInsightsService } from '../../core/audit/audit-insights.service';
import { apiErrorMessage } from '../../core/http/error.util';
import { MemberService } from '../../core/members/member.service';
import { TenantMember } from '../../core/members/member.models';
import { EmptyStateComponent } from '../../shared/premium/empty-state.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  open: 'To do',
  in_progress: 'In progress',
  done: 'Done',
  dismissed: 'Dismissed',
};

/**
 * Improvement task board (BW-048): one card per audit rule that ever failed
 * for this location, grouped by status. Tasks come from the stored audit
 * checklist (`audit_actions`); a still-failing rule keeps its progress
 * across re-audits and a rule that now passes is auto-resolved to Done.
 * Moves go through `PATCH .../audit-actions/{id}` (needs `content.create`;
 * the server refuses anyone else, the select is simply disabled for them).
 */
@Component({
  selector: 'app-audit-tasks',
  standalone: true,
  imports: [DatePipe, SkeletonLoaderComponent, EmptyStateComponent],
  template: `
    <section>
      @if (loading()) {
        <app-skeleton-loader [rows]="4" />
      } @else if (error()) {
        <p class="form-error" role="alert">{{ error() }}</p>
      } @else if (!board() || board()!.items.length === 0) {
        <app-empty-state
          icon="audit"
          title="No improvement tasks yet"
          message="Run a readiness audit — every check that needs attention or evidence becomes a task here."
        />
      } @else {
        <p class="meta">
          From the latest audit
          @if (board()!.latest_audit) {
            ({{ board()!.latest_audit!.completed_at | date: 'medium' }}, readiness {{ board()!.latest_audit!.readiness_score }}/100).
          }
          Re-running the audit keeps your progress on tasks that still fail and marks fixed ones Done.
        </p>
        @if (actionError()) {
          <p class="form-error" role="alert">{{ actionError() }}</p>
        }
        <div class="columns" data-testid="task-board">
          @for (status of statuses; track status) {
            <section class="column" [attr.data-status]="status">
              <h3>{{ label(status) }} <span class="count">{{ board()!.counts[status] }}</span></h3>
              @for (task of tasksFor(status); track task.id) {
                <article class="task card">
                  <p class="task-title">{{ task.label }}</p>
                  <p class="task-remediation">{{ task.remediation }}</p>
                  <p class="task-meta">
                    @if (task.severity === 'needs_evidence') {
                      <span class="badge badge--dot badge--warning">Evidence missing</span>
                    } @else if (task.severity === 'action_needed') {
                      <span class="badge badge--dot badge--danger">Needs attention</span>
                    }
                    @if (task.weight !== null) {
                      <span class="weight">weight {{ task.weight }}</span>
                    }
                  </p>
                  <div class="controls">
                    <label>
                      Status
                      <select [value]="task.status" [disabled]="!canEdit || busyId() === task.id" (change)="move(task, $any($event.target).value)">
                        @for (s of statuses; track s) {
                          <option [value]="s" [selected]="s === task.status">{{ label(s) }}</option>
                        }
                      </select>
                    </label>
                    <label>
                      Owner
                      <select [disabled]="!canEdit || busyId() === task.id" (change)="assign(task, $any($event.target).value)">
                        <option value="" [selected]="!task.owner_id">Unassigned</option>
                        @for (m of members(); track m.user_id) {
                          <option [value]="m.user_id" [selected]="m.user_id === task.owner_id">{{ m.name }}</option>
                        }
                      </select>
                    </label>
                  </div>
                  @if (task.resolved_at) {
                    <p class="task-meta">Resolved {{ task.resolved_at | date: 'mediumDate' }}</p>
                  }
                </article>
              } @empty {
                <p class="meta">Nothing here.</p>
              }
            </section>
          }
        </div>
        @if (!canEdit) {
          <p class="meta">Only owner, admin and editor roles can move tasks (enforced by the server).</p>
        }
      }
    </section>
  `,
  styles: [
    `
      .meta { font-size: 0.85rem; color: var(--color-text-muted); }
      .form-error { color: #b00020; }
      .columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 1rem; align-items: start; }
      .column { background: var(--color-bg); border-radius: var(--radius-lg); padding: 0.75rem; }
      .column h3 { margin: 0 0 0.5rem; font-size: 0.95rem; display: flex; justify-content: space-between; }
      .count { color: var(--color-text-muted); font-weight: 600; }
      .task { padding: 0.75rem; margin-bottom: 0.6rem; }
      .task-title { margin: 0 0 0.25rem; font-weight: 600; }
      .task-remediation { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--color-text-muted); }
      .task-meta { margin: 0.25rem 0; font-size: 0.8rem; display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
      .weight { color: var(--color-text-muted); }
      .controls { display: grid; gap: 0.4rem; margin-top: 0.5rem; }
      label { display: flex; flex-direction: column; gap: 0.15rem; font-size: 0.75rem; font-weight: 600; }
      select { padding: 0.35rem; font: inherit; font-weight: 400; }
    `,
  ],
})
export class AuditTasksComponent implements OnChanges {
  @Input({ required: true }) tenantId = '';
  @Input({ required: true }) locationId = '';
  /** Owner/admin/editor — mirrors the server's `content.create` rule; the server stays the real gate. */
  @Input() canEdit = false;

  readonly statuses = TASK_STATUSES;
  readonly board = signal<TaskBoard | null>(null);
  readonly members = signal<TenantMember[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly busyId = signal<string | null>(null);

  constructor(
    private readonly insights: AuditInsightsService,
    private readonly memberService: MemberService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['tenantId'] || changes['locationId']) {
      this.load();
    }
  }

  label(status: TaskStatus): string {
    return TASK_STATUS_LABEL[status];
  }

  tasksFor(status: TaskStatus): AuditTask[] {
    return (this.board()?.items ?? []).filter((t) => t.status === status);
  }

  move(task: AuditTask, status: string): void {
    this.patch(task, { status: status as TaskStatus });
  }

  assign(task: AuditTask, ownerId: string): void {
    this.patch(task, { owner_id: ownerId === '' ? null : ownerId });
  }

  private patch(task: AuditTask, payload: { status?: TaskStatus; owner_id?: string | null }): void {
    this.busyId.set(task.id);
    this.actionError.set(null);
    this.insights.updateTask(this.tenantId, task.id, payload).subscribe({
      next: () => {
        this.busyId.set(null);
        this.reload();
      },
      error: (err: unknown) => {
        this.busyId.set(null);
        this.actionError.set(apiErrorMessage(err));
        this.reload();
      },
    });
  }

  private load(): void {
    if (!this.tenantId || !this.locationId) {
      return;
    }
    this.loading.set(true);
    this.error.set(null);
    this.reload(true);
    // Owner names are only an assignment convenience; a failure here must not break the board.
    this.memberService.list(this.tenantId).subscribe({
      next: (members) => this.members.set(members.filter((m) => m.status === 'active')),
      error: () => this.members.set([]),
    });
  }

  private reload(initial = false): void {
    this.insights.board(this.tenantId, this.locationId).subscribe({
      next: (board) => {
        this.board.set(board);
        this.loading.set(false);
      },
      error: (err: unknown) => {
        if (initial) {
          this.error.set(apiErrorMessage(err));
        }
        this.loading.set(false);
      },
    });
  }
}
