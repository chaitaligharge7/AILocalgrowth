import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../core/auth/auth.service';
import { LocationSummary } from '../../core/locations/location.models';
import { LocationApiService } from '../../core/locations/location.service';
import { CurrentTenantService } from '../../core/tenancy/current-tenant.service';
import { RoleCode } from '../../core/tenancy/tenant.models';
import { TenantService } from '../../core/tenancy/tenant.service';
import { confirmDelete } from '../../core/feedback/confirm.util';
import { apiErrorFields, apiErrorMessage } from '../../core/http/error.util';
import { RoleMatrix, TenantInvite, TenantMember } from '../../core/members/member.models';
import { MemberService } from '../../core/members/member.service';
import { PageHeaderComponent } from '../../shared/dashboard-pattern/page-header.component';
import { SkeletonLoaderComponent } from '../../shared/premium/skeleton-loader.component';
import { IconComponent } from '../../shared/icons/icon.component';
import { PaginationComponent, paginateItems } from '../../shared/pagination/pagination.component';
import { SortDirection, SortHeaderComponent, sortTableRows } from '../../shared/table/sort-header.component';
import { TableExportColumn } from '../../shared/table/table-export.component';
import { TableToolbarComponent } from '../../shared/table/table-toolbar.component';

const ALL_ROLES: RoleCode[] = ['owner', 'admin', 'editor', 'analyst', 'viewer'];
const INVITABLE_ROLES: RoleCode[] = ['admin', 'editor', 'analyst', 'viewer'];

/**
 * `/app/:tenantId/members` — team management (blueprint §10.4 AC-03).
 *
 * Everything shown is real: the roster (`GET .../members`), the invite form
 * (`POST .../invites`), pending invites with revoke (`GET|DELETE .../invites`),
 * per-member role change / removal (`PATCH|DELETE .../members/{userId}`) and
 * the read-only role/permission matrix (`GET .../roles`).
 *
 * The buttons shown here are UX polish only. The server enforces every rule
 * independently (`member.manage` permission, owner-only changes to owners,
 * no self-modification, never leaving a tenant without an owner) and its
 * message is shown when it refuses.
 */
@Component({
  selector: 'app-members',
  standalone: true,
  imports: [ReactiveFormsModule, PageHeaderComponent, SkeletonLoaderComponent, IconComponent, PaginationComponent, SortHeaderComponent, TableToolbarComponent],
  template: `
    <section class="members">
      <app-page-header eyebrow="Settings" eyebrowLabel="Team" title="Members" subtitle="Invite teammates, assign their role and manage access." />

      @if (!tenant()) {
        <p class="alert alert--error form-error" role="alert">No business selected. Go back to "Choose a business".</p>
      } @else {
        <div class="card roster" data-testid="member-roster">
          <div class="section-head">
            <div>
              <h2>Team roster</h2>
              <p class="meta">Manage member roles and assign branch/location access for staff.</p>
            </div>
            <div class="section-head__actions">
              <span class="badge badge--info">{{ members().length }} member{{ members().length === 1 ? '' : 's' }}</span>
              @if (canManage()) {
                <button type="button" class="btn-primary btn-sm" (click)="openInviteModal()" data-testid="invite-teammate-btn">
                  + Invite teammate
                </button>
              }
            </div>
          </div>

          <ui-table-toolbar
            placeholder="Search members…"
            [searchTerm]="memberSearch()"
            (searchChange)="memberSearch.set($event); membersPage.set(1)"
            [data]="filteredMembers()"
            [columns]="memberExportColumns"
            filename="team_members"
            [loading]="membersLoading()"
            (refresh)="loadMembers()"
          />

          @if (membersLoading()) {
            <app-skeleton-loader [rows]="3" />
          } @else if (membersError()) {
            <p class="alert alert--error form-error" role="alert">{{ membersError() }}</p>
          } @else if (filteredMembers().length === 0) {
            <p class="meta">No team members match "{{ memberSearch() }}".</p>
          } @else {
            <div class="table-wrap">
              <table class="data-table roster-table">
                <thead>
                  <tr>
                    <th>Member</th>
                    <th>Branch scope</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  @for (member of pagedMembers(); track member.user_id) {
                    <tr [attr.data-testid]="'member-' + member.user_id">
                      <td>
                        <div class="member-cell">
                          <span class="avatar-initial">{{ member.name.charAt(0).toUpperCase() }}</span>
                          <div class="member-cell__info">
                            <span class="roster-name">{{ member.name }} @if (isSelf(member)) { <span class="you">(you)</span> }</span>
                            <span class="roster-email">{{ member.email }}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span class="badge badge--neutral">{{ locationScopeLabel(member) }}</span>
                      </td>
                      <td>
                        @if (canEdit(member)) {
                          <select
                            class="role-select"
                            [attr.aria-label]="'Role for ' + member.name"
                            [value]="member.role"
                            [disabled]="busyUserId() === member.user_id"
                            (change)="onRoleChange(member, $event)"
                          >
                            @for (role of assignableRoles(); track role) {
                              <option [value]="role" [selected]="role === member.role">{{ role }}</option>
                            }
                          </select>
                        } @else {
                          <span class="badge badge--dot badge--info">{{ member.role }}</span>
                        }
                      </td>
                      <td>
                        <span class="badge badge--dot" [class]="member.status === 'active' ? 'badge--success' : 'badge--neutral'">{{ member.status }}</span>
                      </td>
                      <td>
                        @if (canEdit(member)) {
                          <div class="roster-controls">
                            @if (!isTenantWideRole(member) && locations().length > 0) {
                              <button
                                type="button"
                                class="btn-secondary btn-sm"
                                [attr.data-testid]="'edit-locations-' + member.user_id"
                                [disabled]="busyUserId() === member.user_id"
                                (click)="toggleLocationEditor(member)"
                              >
                                {{ editingLocationsUserId() === member.user_id ? 'Close' : 'Locations' }}
                              </button>
                            }
                            <button type="button" class="btn-danger action-icon-btn" [disabled]="busyUserId() === member.user_id" (click)="remove(member)" title="Remove member" aria-label="Remove member">
                              <ui-icon name="trash" [size]="14" />
                              <span class="sr-only">Remove</span>
                            </button>
                          </div>
                        } @else {
                          <span class="meta">—</span>
                        }
                      </td>
                    </tr>
                    @if (editingLocationsUserId() === member.user_id) {
                      <tr>
                        <td colspan="5" class="scope-editor-cell">
                          <div class="scope-editor" [attr.data-testid]="'location-editor-' + member.user_id">
                            <p class="scope-editor__title">Location access for {{ member.name }}</p>
                            <p class="meta">Select which locations this staff member can access. Leave all unchecked to clear location restrictions.</p>
                            <div class="scope-checks">
                              @for (loc of locations(); track loc.id) {
                                <label class="scope-check">
                                  <input
                                    type="checkbox"
                                    [checked]="locationDraft().includes(loc.id)"
                                    (change)="toggleLocationSelection(loc.id)"
                                  />
                                  <span>{{ loc.name }} @if (loc.address?.city) { <em class="meta">({{ loc.address?.city }})</em> }</span>
                                </label>
                              }
                            </div>
                            <div class="scope-actions">
                              <button
                                type="button"
                                class="btn-primary btn-sm"
                                [disabled]="busyUserId() === member.user_id"
                                (click)="saveLocations(member)"
                              >
                                {{ busyUserId() === member.user_id ? 'Saving…' : 'Save locations' }}
                              </button>
                              <button type="button" class="btn-secondary btn-sm" (click)="cancelLocationEditor()">Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            <app-pagination
              [totalItems]="filteredMembers().length"
              [currentPage]="membersPage()"
              [pageSize]="membersPageSize()"
              (pageChange)="membersPage.set($event)"
              (pageSizeChange)="membersPageSize.set($event)"
            />
          }
          @if (actionError()) {
            <p class="alert alert--error form-error" role="alert">{{ actionError() }}</p>
          }
          @if (actionNotice()) {
            <p class="alert alert--success success" role="status">{{ actionNotice() }}</p>
          }
        </div>

        @if (canManage()) {
          <div class="members-grid">
            <div class="card">
              <h2>Invites</h2>
              <p class="meta">Pending, expired, and accepted team invitations.</p>
              @if (invitesLoading()) {
                <app-skeleton-loader [rows]="2" />
              } @else if (invitesError()) {
                <p class="alert alert--error form-error" role="alert">{{ invitesError() }}</p>
              } @else if (invites().length === 0) {
                <p class="meta">No invites have been sent yet.</p>
              } @else {
                <table class="data-table" data-testid="invite-list">
                  <thead>
                    <tr>
                      <th><ui-sort-header label="Email" [active]="inviteSortCol() === 'email'" [direction]="inviteSortDir()" (sort)="toggleInviteSort('email')" /></th>
                      <th><ui-sort-header label="Role" [active]="inviteSortCol() === 'role'" [direction]="inviteSortDir()" (sort)="toggleInviteSort('role')" /></th>
                      <th><ui-sort-header label="Status" [active]="inviteSortCol() === 'status'" [direction]="inviteSortDir()" (sort)="toggleInviteSort('status')" /></th>
                      <th><ui-sort-header label="Expires" [active]="inviteSortCol() === 'expires_at'" [direction]="inviteSortDir()" (sort)="toggleInviteSort('expires_at')" /></th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (invite of pagedInvites(); track invite.id) {
                      <tr>
                        <td>{{ invite.email }}</td>
                        <td>{{ invite.role }}</td>
                        <td>
                          <span class="badge badge--dot" [class]="inviteBadge(invite)">{{ invite.status }}</span>
                        </td>
                        <td class="meta">{{ invite.expires_at }}</td>
                        <td>
                          @if (invite.status !== 'accepted') {
                            <div class="invite-actions">
                              <button
                                type="button"
                                class="btn-secondary"
                                data-testid="resend-invite"
                                [disabled]="busyInviteId() === invite.id"
                                (click)="resend(invite)"
                              >
                                {{ busyInviteId() === invite.id ? 'Working…' : 'Resend' }}
                              </button>
                              <button
                                type="button"
                                class="btn-danger"
                                [disabled]="busyInviteId() === invite.id"
                                (click)="revoke(invite)"
                              >
                                Revoke
                              </button>
                            </div>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                <app-pagination
                  [totalItems]="invites().length"
                  [currentPage]="invitesPage()"
                  [pageSize]="invitesPageSize()"
                  (pageChange)="invitesPage.set($event)"
                  (pageSizeChange)="invitesPageSize.set($event)"
                />
              }
            </div>
          </div>
        } @else {
          <p class="owner-only-note">
            Only the tenant owner or an admin may invite members or change roles (enforced server-side regardless of this message).
          </p>
        }

        <div class="card matrix-card">
          <h2>What each role can do</h2>
          <p class="meta">Permissions enforced server-side for every role in this business.</p>
          @if (matrixError()) {
            <p class="alert alert--error form-error" role="alert">{{ matrixError() }}</p>
          }
          @if (matrix(); as m) {
            <ui-table-toolbar
              placeholder="Search permissions…"
              [searchTerm]="matrixSearch()"
              (searchChange)="matrixSearch.set($event); matrixPage.set(1)"
              [data]="filteredPermissions()"
              [columns]="matrixExportColumns"
              filename="role_permissions"
              (refresh)="loadMatrix()"
            />
            <div class="matrix-wrap">
              <table class="data-table matrix" data-testid="role-matrix">
                <thead>
                  <tr>
                    <th><ui-sort-header label="Permission" [active]="matrixSortCol() === 'code'" [direction]="matrixSortDir()" (sort)="toggleMatrixSort('code')" /></th>
                    @for (role of m.roles; track role.code) {
                      <th>{{ role.name }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (permission of pagedPermissions(); track permission.code) {
                    <tr>
                      <td>
                        <span class="perm-code">{{ permission.code }}</span>
                        @if (permission.description) {
                          <span class="meta">{{ permission.description }}</span>
                        }
                      </td>
                      @for (role of m.roles; track role.code) {
                        <td class="matrix-cell">
                          @if (role.permissions.includes(permission.code)) {
                            <span class="yes" aria-label="Allowed">&#10003;</span>
                          } @else {
                            <span class="no" aria-label="Not allowed">&ndash;</span>
                          }
                        </td>
                      }
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <app-pagination
              [totalItems]="filteredPermissions().length"
              [currentPage]="matrixPage()"
              [pageSize]="matrixPageSize()"
              (pageChange)="matrixPage.set($event)"
              (pageSizeChange)="matrixPageSize.set($event); matrixPage.set(1)"
            />
          }
        </div>
        @if (showInviteModal() && canManage()) {
          <div class="modal-backdrop" (click)="closeInviteModal()">
            <div
              class="modal-dialog card"
              role="dialog"
              aria-modal="true"
              aria-labelledby="invite-teammate-title"
              (click)="$event.stopPropagation()"
            >
              <div class="modal-head">
                <div>
                  <h2 id="invite-teammate-title">Invite a teammate</h2>
                  <p class="meta">Send an email invite with a role preset.</p>
                </div>
                <button type="button" class="modal-close" (click)="closeInviteModal()" aria-label="Close">✕</button>
              </div>
              <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
                <label>
                  Email
                  <input type="email" formControlName="email" autocomplete="email" placeholder="teammate@company.com" />
                </label>
                @if (fieldError('email')) {
                  <p class="field-error">{{ fieldError('email') }}</p>
                }

                <label>
                  Role
                  <select formControlName="roleCode">
                    @for (role of inviteRoles(); track role) {
                      <option [value]="role">{{ role }}</option>
                    }
                  </select>
                </label>
                @if (fieldError('role_code')) {
                  <p class="field-error">{{ fieldError('role_code') }}</p>
                }

                @if (errorMessage() && !hasFieldErrors()) {
                  <p class="alert alert--error form-error" role="alert">{{ errorMessage() }}</p>
                }

                <div class="modal-actions">
                  <button type="button" class="btn-secondary btn-sm" (click)="closeInviteModal()" [disabled]="submitting()">
                    Cancel
                  </button>
                  <button type="submit" class="btn-primary btn-sm" [disabled]="form.invalid || submitting()">
                    {{ submitting() ? 'Sending invite…' : 'Send invite' }}
                  </button>
                </div>
              </form>
            </div>
          </div>
        }
      }
    </section>
  `,
  styles: [
    `
      .members {
        width: 100%;
        font-family: var(--font-sans);
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
      }
      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
        margin-bottom: var(--space-3);
        flex-wrap: wrap;
      }
      .section-head__actions {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .card {
        padding: 16px 20px;
      }
      h2 {
        margin: 0 0 var(--space-1);
        font-size: var(--text-lg);
      }
      .table-wrap {
        width: 100%;
        overflow-x: auto;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .member-cell {
        display: inline-flex;
        align-items: center;
        gap: var(--space-2);
        text-align: left;
      }
      .member-cell__info {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .roster-controls {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: var(--space-2);
      }
      .role-select {
        width: auto;
        min-width: 110px;
        height: 32px;
        padding: 0 8px;
        font-size: var(--text-xs);
        border-radius: var(--radius-sm);
        border: 1px solid var(--color-border-strong);
        background: var(--color-surface);
      }
      .scope-editor-cell {
        background: var(--color-surface-alt);
        padding: 12px 16px;
        text-align: left;
      }
      .roster-entry:last-of-type {
        border-bottom: none;
      }
      .roster-row {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        padding: var(--space-3) 0;
        flex-wrap: wrap;
      }
      .roster-main {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 180px;
      }
      .roster-name {
        font-weight: var(--font-semibold);
      }
      .you {
        font-weight: 400;
        color: var(--color-text-muted);
      }
      .roster-email {
        font-size: var(--text-sm);
        color: var(--color-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .roster-scope {
        margin-top: 2px;
      }
      .roster-controls,
      .roster-badges {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        flex-wrap: wrap;
      }
      .role-select {
        padding: 0.4rem 0.6rem;
        font: inherit;
        text-transform: capitalize;
      }
      .scope-editor {
        margin: 0 0 var(--space-3) 46px;
        padding: var(--space-4);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
      }
      .scope-editor__title {
        margin: 0 0 2px;
        font-weight: var(--font-semibold);
        font-size: var(--text-sm);
      }
      .scope-checks {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-3);
        margin: var(--space-3) 0;
      }
      .scope-check {
        display: inline-flex;
        flex-direction: row;
        align-items: center;
        gap: 0.45rem;
        padding: 0.4rem 0.7rem;
        background: var(--color-surface);
        border: 1px solid var(--color-border-strong);
        border-radius: var(--radius-sm);
        font-weight: var(--font-medium);
        cursor: pointer;
      }
      .scope-check em {
        font-style: normal;
      }
      .scope-actions {
        display: flex;
        gap: var(--space-2);
      }
      .members-grid {
        display: grid;
        grid-template-columns: 1fr;
        gap: var(--space-3);
        align-items: start;
      }
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.45);
        backdrop-filter: blur(2px);
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
        z-index: 60;
      }
      .modal-dialog {
        width: 100%;
        max-width: 460px;
        padding: 20px;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        box-shadow: var(--shadow-lg);
      }
      .modal-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .modal-close {
        background: transparent;
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        color: var(--color-text-muted);
        width: 28px;
        height: 28px;
        padding: 0;
        cursor: pointer;
      }
      .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 4px;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin-top: var(--space-3);
      }
      label {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        font-weight: var(--font-semibold);
      }
      input[type='email'],
      select {
        width: 100%;
        padding: 0.55rem 0.7rem;
        font: inherit;
      }
      .alert {
        margin: var(--space-3) 0 0;
        padding: 0.65rem 0.85rem;
        border-radius: var(--radius-sm);
        font-size: var(--text-sm);
      }
      .alert--error {
        background: var(--color-danger-bg);
        border: 1px solid var(--color-danger-border);
        color: var(--color-danger);
      }
      .alert--success {
        background: var(--color-success-bg);
        border: 1px solid var(--color-success-border);
        color: var(--color-success);
      }
      .field-error {
        color: var(--color-danger);
        margin: -0.25rem 0 0;
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
      }
      .form-error,
      .success {
        margin: 0;
      }
      .owner-only-note,
      .meta {
        color: var(--color-text-muted);
        font-size: var(--text-sm);
        margin: 0;
      }
      .data-table {
        width: 100%;
        border-collapse: collapse;
        font-size: var(--text-sm);
        margin-top: var(--space-3);
      }
      .data-table th,
      .data-table td {
        text-align: center;
        padding: 0.6rem 0.5rem;
        border-bottom: 1px solid var(--color-border);
      }
      .matrix-wrap {
        overflow-x: auto;
      }
      .matrix td.matrix-cell,
      .matrix th:not(:first-child) {
        text-align: center;
      }
      .perm-code {
        display: block;
        font-family: var(--font-mono);
        font-size: 0.82rem;
      }
      .yes {
        color: var(--color-primary);
        font-weight: 700;
      }
      .no {
        color: var(--color-text-muted);
      }
      @media (max-width: 860px) {
        .members-grid {
          grid-template-columns: 1fr;
        }
        .scope-editor {
          margin-left: 0;
        }
      }
    `,
  ],
})
export class MembersComponent implements OnInit {
  private readonly fb = new FormBuilder();
  private readonly http = inject(HttpClient, { optional: true });
  private readonly locationApi = this.http ? inject(LocationApiService) : null;

  readonly tenant = computed(() => this.currentTenant.tenant());
  readonly callerRole = computed(() => this.tenant()?.caller_role ?? null);
  readonly canManage = computed(() => {
    const role = this.callerRole();
    return role === 'owner' || role === 'admin';
  });
  /** Only an owner can grant the owner role (server rule); an admin never sees it as an option. */
  readonly assignableRoles = computed<RoleCode[]>(() => (this.callerRole() === 'owner' ? ALL_ROLES : INVITABLE_ROLES));
  readonly inviteRoles = computed<RoleCode[]>(() => INVITABLE_ROLES);

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    roleCode: ['editor' as RoleCode, [Validators.required]],
  });

  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string> | null>(null);
  readonly invited = signal<string | null>(null);

  readonly inviteSearch = signal('');
  readonly inviteExportColumns: TableExportColumn[] = [
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
    { key: 'expires_at', label: 'Expires' },
  ];
  readonly memberSearch = signal('');
  readonly memberExportColumns: TableExportColumn[] = [
    { key: 'name', label: 'Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'status', label: 'Status' },
  ];
  readonly members = signal<TenantMember[]>([]);
  readonly membersPage = signal(1);
  readonly membersPageSize = signal(10);
  readonly filteredMembers = computed(() => {
    const q = this.memberSearch().trim().toLowerCase();
    const list = this.members();
    if (!q) return list;
    return list.filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
  });
  readonly pagedMembers = computed(() => paginateItems(this.filteredMembers(), this.membersPage(), this.membersPageSize()));
  readonly membersLoading = signal(false);
  readonly membersError = signal<string | null>(null);

  readonly invites = signal<TenantInvite[]>([]);
  readonly invitesPage = signal(1);
  readonly invitesPageSize = signal(10);
  readonly inviteSortCol = signal<string>('');
  readonly inviteSortDir = signal<SortDirection>('asc');

  toggleInviteSort(col: string): void {
    if (this.inviteSortCol() === col) {
      this.inviteSortDir.set(this.inviteSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.inviteSortCol.set(col);
      this.inviteSortDir.set('asc');
    }
  }

  readonly sortedInvites = computed(() =>
    sortTableRows(this.invites(), this.inviteSortCol(), this.inviteSortDir(), (inv, col) => {
      switch (col) {
        case 'email':
          return inv.email;
        case 'role':
          return inv.role;
        case 'status':
          return inv.status;
        case 'expires_at':
          return inv.expires_at;
        default:
          return '';
      }
    }),
  );

  readonly filteredInvites = computed(() => {
    const q = this.inviteSearch().trim().toLowerCase();
    const list = this.sortedInvites();
    if (!q) return list;
    return list.filter((i) => i.email.toLowerCase().includes(q) || i.role.toLowerCase().includes(q) || i.status.toLowerCase().includes(q));
  });

  readonly pagedInvites = computed(() => paginateItems(this.filteredInvites(), this.invitesPage(), this.invitesPageSize()));
  readonly invitesLoading = signal(false);
  readonly invitesError = signal<string | null>(null);

  readonly matrix = signal<RoleMatrix | null>(null);
  readonly matrixError = signal<string | null>(null);
  readonly matrixSearch = signal('');
  readonly matrixPage = signal(1);
  readonly matrixPageSize = signal(10);
  readonly matrixSortCol = signal('');
  readonly matrixSortDir = signal<SortDirection>('asc');
  readonly matrixExportColumns: TableExportColumn[] = [
    { key: 'code', label: 'Permission' },
    { key: 'description', label: 'Description' },
  ];

  toggleMatrixSort(col: string): void {
    if (this.matrixSortCol() === col) {
      this.matrixSortDir.set(this.matrixSortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.matrixSortCol.set(col);
      this.matrixSortDir.set('asc');
    }
  }

  readonly filteredPermissions = computed(() => {
    const perms = this.matrix()?.permissions ?? [];
    const q = this.matrixSearch().trim().toLowerCase();
    const sorted = sortTableRows(perms, this.matrixSortCol(), this.matrixSortDir(), (p, col) => (col === 'code' ? p.code : ''));
    if (!q) return sorted;
    return sorted.filter((p) => p.code.toLowerCase().includes(q) || (p.description ?? '').toLowerCase().includes(q));
  });

  readonly pagedPermissions = computed(() => paginateItems(this.filteredPermissions(), this.matrixPage(), this.matrixPageSize()));

  readonly busyUserId = signal<string | null>(null);
  readonly busyInviteId = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly actionNotice = signal<string | null>(null);

  readonly locations = signal<LocationSummary[]>([]);
  readonly editingLocationsUserId = signal<string | null>(null);
  readonly locationDraft = signal<string[]>([]);

  constructor(
    private readonly currentTenant: CurrentTenantService,
    private readonly tenantService: TenantService,
    private readonly memberService: MemberService,
    private readonly auth: AuthService,
  ) {}

  ngOnInit(): void {
    this.loadMembers();
    this.loadMatrix();
    this.loadLocations();
    if (this.canManage()) {
      this.loadInvites();
    }
  }

  isTenantWideRole(member: TenantMember): boolean {
    return member.role === 'owner' || member.role === 'admin';
  }

  locationScopeLabel(member: TenantMember): string {
    if (this.isTenantWideRole(member)) {
      return 'All locations (tenant-wide)';
    }
    const ids = member.location_ids ?? [];
    if (ids.length === 0) {
      return 'No locations assigned';
    }
    const names = ids
      .map((id) => this.locations().find((l) => l.id === id)?.name)
      .filter((n): n is string => Boolean(n));
    if (names.length > 0) {
      return `Scoped: ${names.join(', ')}`;
    }
    return `${ids.length} location${ids.length === 1 ? '' : 's'} assigned`;
  }

  toggleLocationEditor(member: TenantMember): void {
    if (this.editingLocationsUserId() === member.user_id) {
      this.cancelLocationEditor();
      return;
    }
    this.editingLocationsUserId.set(member.user_id);
    this.locationDraft.set([...(member.location_ids ?? [])]);
    this.actionError.set(null);
    this.actionNotice.set(null);
  }

  cancelLocationEditor(): void {
    this.editingLocationsUserId.set(null);
    this.locationDraft.set([]);
  }

  toggleLocationSelection(locationId: string): void {
    this.locationDraft.update((current) =>
      current.includes(locationId) ? current.filter((id) => id !== locationId) : [...current, locationId],
    );
  }

  saveLocations(member: TenantMember): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.busyUserId.set(member.user_id);
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.memberService.setLocations(tenantId, member.user_id, this.locationDraft()).subscribe({
      next: () => {
        this.busyUserId.set(null);
        this.cancelLocationEditor();
        this.actionNotice.set(`Location access updated for ${member.name}.`);
        this.loadMembers();
      },
      error: (err: unknown) => {
        this.busyUserId.set(null);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  private loadLocations(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || !this.locationApi) {
      return;
    }
    this.locationApi.list(tenantId).subscribe({
      next: (locs) => this.locations.set(locs),
      error: () => this.locations.set([]),
    });
  }

  isSelf(member: TenantMember): boolean {
    return member.user_id === this.auth.currentUser()?.id;
  }

  /** Mirrors the server rules so the UI does not offer actions that will always be refused. */
  canEdit(member: TenantMember): boolean {
    if (!this.canManage() || this.isSelf(member) || member.status !== 'active') {
      return false;
    }

    return member.role !== 'owner' || this.callerRole() === 'owner';
  }

  inviteBadge(invite: TenantInvite): string {
    return invite.status === 'pending' ? 'badge--info' : invite.status === 'accepted' ? 'badge--success' : 'badge--neutral';
  }

  onRoleChange(member: TenantMember, event: Event): void {
    const tenantId = this.tenant()?.id;
    const select = event.target as HTMLSelectElement;
    const role = select.value as RoleCode;
    if (!tenantId || role === member.role) {
      return;
    }
    this.busyUserId.set(member.user_id);
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.memberService.changeRole(tenantId, member.user_id, role).subscribe({
      next: () => {
        this.busyUserId.set(null);
        this.actionNotice.set(`${member.name} is now ${role}.`);
        this.loadMembers();
      },
      error: (err: unknown) => {
        this.busyUserId.set(null);
        select.value = member.role;
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  remove(member: TenantMember): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId || !confirmDelete(member.name || 'this team member')) {
      return;
    }
    this.busyUserId.set(member.user_id);
    this.actionError.set(null);
    this.actionNotice.set(null);
    this.memberService.remove(tenantId, member.user_id).subscribe({
      next: () => {
        this.busyUserId.set(null);
        this.actionNotice.set(`${member.name} was removed from this business.`);
        this.loadMembers();
      },
      error: (err: unknown) => {
        this.busyUserId.set(null);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  revoke(invite: TenantInvite): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.busyInviteId.set(invite.id);
    this.actionError.set(null);
    this.memberService.revokeInvite(tenantId, invite.id).subscribe({
      next: () => {
        this.busyInviteId.set(null);
        this.loadInvites();
      },
      error: (err: unknown) => {
        this.busyInviteId.set(null);
        this.actionError.set(apiErrorMessage(err));
      },
    });
  }

  loadMembers(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.membersLoading.set(true);
    this.membersError.set(null);
    this.memberService.list(tenantId).subscribe({
      next: (members) => {
        this.membersLoading.set(false);
        this.members.set(members);
      },
      error: (err: unknown) => {
        this.membersLoading.set(false);
        this.membersError.set(apiErrorMessage(err));
      },
    });
  }

  resend(invite: TenantInvite): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.busyInviteId.set(invite.id);
    this.invitesError.set(null);
    this.memberService.resendInvite(tenantId, invite.id).subscribe({
      next: () => {
        this.busyInviteId.set(null);
        this.invited.set(invite.email);
        this.loadInvites();
      },
      error: (err: unknown) => {
        this.busyInviteId.set(null);
        this.invitesError.set(apiErrorMessage(err));
      },
    });
  }

  loadInvites(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.invitesLoading.set(true);
    this.invitesError.set(null);
    this.memberService.listInvites(tenantId).subscribe({
      next: (invites) => {
        this.invitesLoading.set(false);
        this.invites.set(invites);
      },
      error: (err: unknown) => {
        this.invitesLoading.set(false);
        this.invitesError.set(apiErrorMessage(err));
      },
    });
  }

  loadMatrix(): void {
    const tenantId = this.tenant()?.id;
    if (!tenantId) {
      return;
    }
    this.memberService.roleMatrix(tenantId).subscribe({
      next: (matrix) => this.matrix.set(matrix),
      error: (err: unknown) => this.matrixError.set(apiErrorMessage(err)),
    });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()?.[field] ?? null;
  }

  hasFieldErrors(): boolean {
    return this.fieldErrors() !== null;
  }

  readonly showInviteModal = signal(false);

  openInviteModal(): void {
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.invited.set(null);
    this.showInviteModal.set(true);
  }

  closeInviteModal(): void {
    if (!this.submitting()) {
      this.showInviteModal.set(false);
    }
  }

  submit(): void {
    const tenantId = this.tenant()?.id;
    if (this.form.invalid || this.submitting() || !tenantId) {
      return;
    }
    this.submitting.set(true);
    this.errorMessage.set(null);
    this.fieldErrors.set(null);
    this.invited.set(null);

    const { email, roleCode } = this.form.getRawValue();
    this.tenantService.invite(tenantId, { email, role_code: roleCode }).subscribe({
      next: (invite) => {
        this.submitting.set(false);
        this.showInviteModal.set(false);
        this.invited.set(invite.email);
        this.actionNotice.set(`Invite sent to ${invite.email}.`);
        this.form.patchValue({ email: '' });
        this.loadInvites();
      },
      error: (err: unknown) => {
        this.submitting.set(false);
        this.errorMessage.set(apiErrorMessage(err));
        this.fieldErrors.set(apiErrorFields(err));
      },
    });
  }
}
