import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { Announcement } from '../../core/admin/platform-ops.models';
import { AnnouncementService } from '../../core/announcements/announcement.service';

const DISMISSED_KEY = 'lg_dismissed_announcements';

/**
 * Platform notices (SA-057/058, read side) shown at the top of the business and
 * agency workspaces. Text written by platform admins for everyone; nothing
 * tenant-specific. Dismissal is a per-browser convenience (sessionStorage) —
 * a dismissed notice reappears in a new browser session while it is still live.
 * A failed fetch shows nothing: a banner must never block the page.
 */
@Component({
  selector: 'app-announcement-banner',
  standalone: true,
  imports: [DatePipe],
  template: `
    @for (a of visible(); track a.id) {
      <div class="banner" [class]="'banner banner--' + a.severity" role="status" data-testid="announcement">
        <div class="text">
          <strong>{{ a.kind === 'maintenance' ? 'Maintenance: ' : '' }}{{ a.title }}</strong>
          @if (a.body) { <span> — {{ a.body }}</span> }
          @if (a.kind === 'maintenance' && a.ends_at) { <span class="when"> ({{ a.starts_at | date: 'd MMM, HH:mm' }} – {{ a.ends_at | date: 'd MMM, HH:mm' }})</span> }
        </div>
        <button type="button" class="close" aria-label="Dismiss notice" (click)="dismiss(a.id)">×</button>
      </div>
    }
  `,
  styles: [
    `
      .banner { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 0.6rem 1rem; margin-bottom: 0.5rem; border-radius: var(--radius-md); font-size: var(--text-sm); border: 1px solid var(--color-border); }
      .banner--info { background: #e8f4f2; border-color: #b7dcd6; color: #0e3b46; }
      .banner--warning { background: #fbf1dc; border-color: #ecd49a; color: #6b4a07; }
      .banner--critical { background: #fbe4e4; border-color: #e6a7a7; color: #7a1414; }
      .when { opacity: 0.8; }
      .close { background: none; border: 0; font-size: 1.2rem; line-height: 1; cursor: pointer; color: inherit; }
    `,
  ],
})
export class AnnouncementBannerComponent implements OnInit {
  private readonly items = signal<Announcement[]>([]);
  private readonly dismissed = signal<string[]>(readDismissed());

  readonly visible = () => this.items().filter((a) => !this.dismissed().includes(a.id));

  constructor(private readonly announcements: AnnouncementService) {}

  ngOnInit(): void {
    this.announcements.live().subscribe({
      next: (rows) => this.items.set(rows),
      error: () => this.items.set([]),
    });
  }

  dismiss(id: string): void {
    const next = [...this.dismissed(), id];
    this.dismissed.set(next);
    try {
      sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable: dismissal lasts for this page view only */
    }
  }
}

function readDismissed(): string[] {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}
