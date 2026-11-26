import { Component, EventEmitter, Input, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { IconComponent } from '../icons/icon.component';

export interface WorkspaceNavItem {
  label: string;
  icon: string;
  link: string | unknown[];
  exact?: boolean;
  group?: string;
}

/**
 * Shared SaaS workspace chrome for all three shells (Business `/app`,
 * Agency `/agency`, Platform Admin `/admin`). Supports grouped sidebar
 * navigation, collapsible rail mode, instant module search, sticky topbar
 * breadcrumbs, and compact content framing.
 */
@Component({
  selector: 'app-workspace-shell',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, IconComponent],
  template: `
    <div class="workspace" [class.workspace--collapsed]="collapsed()">
      <aside class="sidebar">
        <div class="brand-row">
          <div class="brand">
            <span class="logo-badge">L</span>
            <div class="brand-copy">
              <span class="wordmark">LocalGrowth</span>
              <span class="brand-tag">{{ sectionLabel }}</span>
            </div>
          </div>
          <button
            type="button"
            class="collapse-btn"
            [title]="collapsed() ? 'Expand sidebar' : 'Collapse sidebar'"
            aria-label="Toggle sidebar"
            (click)="toggleSidebar()"
          >
            <ui-icon name="sidebarToggle" [size]="15" />
          </button>
        </div>

        @if (!hasGroups()) {
          <div class="workspace-label">Workspace</div>
        }

        <nav class="nav" aria-label="Workspace navigation">
          @for (item of navItems; track item.label; let i = $index) {
            @if (item.group && (i === 0 || navItems[i - 1].group !== item.group)) {
              <div class="nav-group-label">{{ item.group }}</div>
            }
            <a
              [routerLink]="item.link"
              routerLinkActive="active"
              [routerLinkActiveOptions]="{ exact: item.exact ?? false }"
              [title]="collapsed() ? item.label : ''"
            >
              <ui-icon [name]="item.icon" [size]="16" />
              <span class="nav-text">{{ item.label }}</span>
            </a>
          }
        </nav>

        <ng-content select="[sidebarExtra]" />

        <div class="sidebar-footer">
          <button type="button" class="sidebar-logout" title="Log out" (click)="logout.emit()">
            <ui-icon name="logout" [size]="15" />
            <span>Log out</span>
          </button>
          <div class="sidebar-status">
            <span class="dot"></span>
            <span>Scriptlet AI Cloud</span>
          </div>
        </div>
      </aside>

      <div class="main">
        <header class="topbar">
          <div class="breadcrumb">
            <span class="crumb-brand">LocalGrowth</span>
            <span class="sep">/</span>
            <span class="crumb-section">{{ sectionLabel }}</span>
            @if (pageTitle()) {
              <span class="sep">/</span>
              <span class="crumb-page">{{ pageTitle() }}</span>
            }
          </div>

          <div class="topbar-right">
            <ng-content select="[shellExtra]" />

            <div class="search">
              <span class="search-icon" aria-hidden="true">
                <ui-icon name="search" [size]="14" />
              </span>
              <input
                type="search"
                placeholder="Jump to module…"
                [value]="searchTerm()"
                (input)="onSearch($event)"
                (keydown.enter)="onSearchSubmit()"
              />
              @if (matches().length > 0) {
                <ul class="search-results">
                  @for (match of matches(); track match.label) {
                    <li>
                      <a [routerLink]="match.link" (click)="clearSearch()">
                        <ui-icon [name]="match.icon" [size]="14" />
                        <span>{{ match.label }}</span>
                        @if (match.group) {
                          <small class="match-group">{{ match.group }}</small>
                        }
                      </a>
                    </li>
                  }
                </ul>
              }
            </div>

            <div class="user-pill" [title]="avatarTitle">
              <span class="avatar" [title]="avatarTitle">
                {{ avatarInitial }}
              </span>
              @if (userName) {
                <span class="user-name">{{ userName }}</span>
              }
            </div>
            <button type="button" class="logout-btn" title="Log out" (click)="logout.emit()">
              <ui-icon name="logout" [size]="14" />
              <span>Log out</span>
            </button>
          </div>
        </header>

        <main class="content">
          <ng-content />
        </main>

        <footer class="page-footer">
          <span>© Scriptlet LocalGrowth AI · {{ sectionLabel }} Workspace</span>
        </footer>
      </div>
    </div>
  `,
  styles: [
    `
      .workspace {
        display: flex;
        min-height: 100vh;
        background: var(--color-bg);
        font-family: var(--font-sans);
      }

      /* --- Sidebar --- */
      .sidebar {
        width: 228px;
        flex-shrink: 0;
        background: linear-gradient(180deg, #0b1626 0%, #091320 100%);
        border-right: 1px solid var(--shell-sidebar-border);
        color: var(--shell-sidebar-text);
        display: flex;
        flex-direction: column;
        padding: 12px 10px;
        position: sticky;
        top: 0;
        height: 100vh;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.25) transparent;
        transition: width 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      }
      .sidebar::-webkit-scrollbar {
        width: 5px;
      }
      .sidebar::-webkit-scrollbar-thumb {
        background: rgba(148, 163, 184, 0.22);
        border-radius: 999px;
      }

      .brand-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 4px 6px 12px;
        border-bottom: 1px solid var(--shell-sidebar-border);
        margin-bottom: 8px;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 9px;
        min-width: 0;
      }
      .logo-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 8px;
        background: linear-gradient(135deg, #14b8a6 0%, #078d7e 100%);
        box-shadow: 0 2px 8px rgba(20, 184, 166, 0.35);
        color: #fff;
        font-size: 0.85rem;
        font-weight: var(--font-bold);
        flex-shrink: 0;
      }
      .brand-copy {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.15;
      }
      .wordmark {
        font-weight: var(--font-bold);
        font-size: 0.92rem;
        letter-spacing: -0.02em;
        color: #f8fafc;
        white-space: nowrap;
      }
      .brand-tag {
        font-size: 0.65rem;
        font-weight: var(--font-medium);
        color: var(--shell-sidebar-accent);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        white-space: nowrap;
      }

      .collapse-btn {
        width: 26px;
        height: 26px;
        padding: 0;
        border-radius: 6px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--shell-sidebar-text-muted);
        flex-shrink: 0;
      }
      .collapse-btn:hover:not(:disabled) {
        background: var(--shell-sidebar-hover-bg);
        border-color: var(--shell-sidebar-border);
        color: #fff;
      }

      .workspace-label,
      .nav-group-label {
        font-size: 0.64rem;
        font-weight: var(--font-bold);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--shell-sidebar-text-muted);
        padding: 10px 10px 4px;
        user-select: none;
      }
      .nav-group-label:first-child {
        padding-top: 2px;
      }

      .nav {
        display: flex;
        flex-direction: column;
        gap: 1px;
        flex: 1;
      }
      .nav a {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0.42rem 10px;
        border-radius: 7px;
        color: #cbd5e1;
        text-decoration: none;
        font-size: 0.8rem;
        font-weight: var(--font-medium);
        position: relative;
        transition: background-color 0.14s ease, color 0.14s ease;
      }
      .nav a:hover {
        background: var(--shell-sidebar-hover-bg);
        color: #ffffff;
      }
      .nav a.active {
        background: var(--shell-sidebar-active-bg);
        color: #5eead4;
        font-weight: var(--font-semibold);
      }
      .nav a.active::before {
        content: '';
        position: absolute;
        left: 0;
        top: 6px;
        bottom: 6px;
        width: 3px;
        border-radius: 0 3px 3px 0;
        background: var(--shell-sidebar-accent);
      }
      .nav-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .sidebar-footer {
        margin-top: 12px;
        padding: 10px 2px 2px;
        border-top: 1px solid var(--shell-sidebar-border);
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .sidebar-logout {
        width: 100%;
        justify-content: flex-start;
        gap: 9px;
        padding: 0.42rem 10px;
        border-radius: 7px;
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid var(--shell-sidebar-border);
        color: #cbd5e1;
        font-size: 0.78rem;
        font-weight: var(--font-medium);
      }
      .sidebar-logout:hover:not(:disabled) {
        background: rgba(220, 38, 38, 0.16);
        border-color: rgba(252, 165, 165, 0.35);
        color: #fecaca;
      }
      .sidebar-status {
        padding: 0 8px;
        font-size: 0.68rem;
        color: var(--shell-sidebar-text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .sidebar-status .dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #10b981;
        box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
      }

      /* Desktop Collapsed Rail Mode */
      .workspace--collapsed .sidebar {
        width: 64px;
        padding: 12px 8px;
      }
      .workspace--collapsed .brand-copy,
      .workspace--collapsed .workspace-label,
      .workspace--collapsed .nav-group-label,
      .workspace--collapsed .nav-text,
      .workspace--collapsed .sidebar-logout span,
      .workspace--collapsed .sidebar-status span {
        display: none;
      }
      .workspace--collapsed .brand-row {
        flex-direction: column;
        gap: 8px;
        padding-bottom: 10px;
      }
      .workspace--collapsed .nav a,
      .workspace--collapsed .sidebar-logout,
      .workspace--collapsed .sidebar-status {
        justify-content: center;
        padding-left: 0;
        padding-right: 0;
      }

      /* --- Main & Sticky Topbar --- */
      .main {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .topbar {
        position: sticky;
        top: 0;
        z-index: 15;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 20px;
        min-height: 50px;
        background: rgba(255, 255, 255, 0.9);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid var(--color-border);
        flex-wrap: wrap;
      }
      .breadcrumb {
        font-size: var(--text-xs);
        color: var(--color-text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
      }
      .breadcrumb .crumb-brand {
        color: var(--color-primary);
        font-weight: var(--font-semibold);
      }
      .breadcrumb .crumb-page {
        color: var(--color-text);
        font-weight: var(--font-semibold);
      }
      .breadcrumb .sep {
        color: var(--color-border-strong);
      }

      .topbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .search {
        position: relative;
        display: flex;
        align-items: center;
      }
      .search-icon {
        position: absolute;
        left: 9px;
        color: var(--color-text-subtle);
        pointer-events: none;
        display: inline-flex;
      }
      .search input {
        width: 196px;
        padding: 0.34rem 0.65rem 0.34rem 28px;
        font-size: var(--text-xs);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-sm);
        transition: width 0.2s ease, background-color 0.15s ease, border-color 0.15s ease;
      }
      .search input:focus {
        width: 236px;
        background: var(--color-surface);
        border-color: var(--color-primary);
      }
      .search-results {
        position: absolute;
        z-index: 30;
        top: calc(100% + 6px);
        right: 0;
        width: 260px;
        margin: 0;
        padding: 4px;
        list-style: none;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        max-height: 280px;
        overflow-y: auto;
      }
      .search-results a {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 7px 9px;
        border-radius: var(--radius-sm);
        color: var(--color-text);
        text-decoration: none;
        font-size: var(--text-xs);
        font-weight: var(--font-medium);
      }
      .search-results a:hover {
        background: var(--color-surface-alt);
        color: var(--color-primary);
      }
      .match-group {
        margin-left: auto;
        font-size: 0.65rem;
        color: var(--color-text-subtle);
      }

      .user-pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 3px 10px 3px 4px;
        border-radius: var(--radius-pill);
        background: var(--color-surface-alt);
        border: 1px solid var(--color-border);
        user-select: none;
      }
      .user-pill:has(.avatar:only-child) {
        padding: 0;
        border: none;
        background: transparent;
      }
      .avatar {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--color-primary) 0%, #0d9488 100%);
        color: #fff;
        border: 2px solid var(--color-surface);
        box-shadow: 0 1px 3px rgba(15, 23, 42, 0.12);
        font-size: var(--text-xs);
        font-weight: var(--font-bold);
        padding: 0;
        flex-shrink: 0;
      }
      .user-name {
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        color: var(--color-text);
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      @media (max-width: 720px) {
        .user-name {
          display: none;
        }
        .user-pill {
          padding: 0;
          border: none;
          background: transparent;
        }
      }

      .logout-btn {
        padding: 0.34rem 0.68rem;
        border-radius: var(--radius-sm);
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        color: var(--color-text-muted);
        font-size: var(--text-xs);
        font-weight: var(--font-semibold);
        white-space: nowrap;
      }
      .logout-btn:hover:not(:disabled) {
        background: var(--color-danger-bg);
        border-color: var(--color-danger-border);
        color: var(--color-danger);
      }

      .content {
        flex: 1;
        padding: 16px 20px 24px;
        width: 100%;
        max-width: 100%;
        margin: 0;
      }

      .page-footer {
        padding: 10px 20px;
        border-top: 1px solid var(--color-border);
        font-size: 0.7rem;
        color: var(--color-text-subtle);
        text-align: right;
        background: var(--color-surface);
      }

      @media (max-width: 960px) {
        .sidebar {
          width: 64px;
          padding: 12px 8px;
        }
        .brand-copy,
        .collapse-btn,
        .workspace-label,
        .nav-group-label,
        .nav-text,
        .sidebar-footer {
          display: none;
        }
        .brand-row {
          justify-content: center;
        }
        .nav a {
          justify-content: center;
          padding-left: 0;
          padding-right: 0;
        }
        .search input {
          width: 145px;
        }
        .search input:focus {
          width: 180px;
        }
      }

      @media (max-width: 640px) {
        .workspace {
          flex-direction: column;
        }
        .sidebar {
          width: 100%;
          height: auto;
          position: static;
          flex-direction: row;
          align-items: center;
          padding: 8px 12px;
          overflow-x: auto;
          border-right: none;
          border-bottom: 1px solid var(--shell-sidebar-border);
        }
        .brand-row {
          border-bottom: none;
          margin-bottom: 0;
          padding: 0 10px 0 0;
        }
        .nav {
          flex-direction: row;
          gap: 4px;
        }
        .nav a {
          padding: 6px 8px;
        }
        .nav a.active::before {
          display: none;
        }
        .topbar,
        .content {
          padding: 12px;
        }
      }
    `,
  ],
})
export class WorkspaceShellComponent implements OnInit, OnDestroy {
  @Input({ required: true }) navItems: WorkspaceNavItem[] = [];
  @Input({ required: true }) sectionLabel = '';
  @Input() avatarInitial = '?';
  @Input() userName = '';
  @Input() avatarTitle = 'Signed in user';
  @Output() logout = new EventEmitter<void>();

  readonly pageTitle = signal('');
  readonly searchTerm = signal('');
  readonly matches = signal<WorkspaceNavItem[]>([]);
  readonly collapsed = signal(false);

  private subscription?: Subscription;

  constructor(private readonly router: Router) {}

  hasGroups(): boolean {
    return this.navItems.some((item) => Boolean(item.group));
  }

  toggleSidebar(): void {
    this.collapsed.update((v) => !v);
  }

  ngOnInit(): void {
    this.updateTitleFromRoute();
    this.subscription = this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      this.updateTitleFromRoute();
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private updateTitleFromRoute(): void {
    let route = this.router.routerState.snapshot.root;
    let title: string | undefined;
    while (route.firstChild) {
      route = route.firstChild;
      if (route.title) {
        title = route.title;
      }
    }
    if (!title && route.title) {
      title = route.title;
    }
    this.pageTitle.set((title ?? '').split('—')[0].trim());
  }

  onSearch(event: Event): void {
    const term = (event.target as HTMLInputElement).value;
    this.searchTerm.set(term);
    const q = term.trim().toLowerCase();
    this.matches.set(q.length === 0 ? [] : this.navItems.filter((item) => item.label.toLowerCase().includes(q)));
  }

  onSearchSubmit(): void {
    const [first] = this.matches();
    if (first) {
      void this.router.navigate(Array.isArray(first.link) ? (first.link as unknown[]) : [first.link]);
      this.clearSearch();
    }
  }

  clearSearch(): void {
    this.searchTerm.set('');
    this.matches.set([]);
  }
}
