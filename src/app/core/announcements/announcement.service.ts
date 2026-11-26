import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Announcement } from '../admin/platform-ops.models';
import { API_BASE_URL } from '../http/api-base-url.token';
import { ApiSuccess } from '../http/api-envelope.model';

/** `GET /announcements` — platform notices currently in their window (any signed-in user). */
@Injectable({ providedIn: 'root' })
export class AnnouncementService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL);

  live(): Observable<Announcement[]> {
    return this.http.get<ApiSuccess<{ announcements: Announcement[] }>>(`${this.base}/announcements`).pipe(map((r) => r.data.announcements));
  }
}
