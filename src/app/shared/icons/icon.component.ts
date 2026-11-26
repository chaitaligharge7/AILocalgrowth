import { Component, Input } from '@angular/core';

/**
 * Crisp 24x24 outline SVG icon set used across workspace shells, sidebars,
 * KPI stat tiles, action cards, and data tables.
 */
const PATHS: Record<string, string> = {
  grid: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  trending: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  business: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-5h6v5M9 10h.01M15 10h.01M9 13h.01M15 13h.01',
  marketing: 'M3 11v2a2 2 0 002 2h2l4 4V5L7 9H5a2 2 0 00-2 2zM15.5 8.5a4 4 0 010 7M18.5 5.5a8 8 0 010 13',
  content: 'M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9zM14 3v6h6M8 13h8M8 17h5',
  reviews: 'M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6-5.4-2.8-5.4 2.8 1-6L3.2 9.4l6.1-.9z',
  leads: 'M16 11a4 4 0 10-8 0 4 4 0 008 0zM4 20a8 8 0 0116 0',
  analytics: 'M4 20V11M9.5 20V5M15 20v-8M20.5 20V8M2 20h20',
  subscription: 'M3 6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2zM3 10h18M7 15h4',
  integrations: 'M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3M4 7h16v4a6 6 0 01-6 6h-4a6 6 0 01-6-6zM12 17v4',
  team: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  overview: 'M12 2l9 4.5-9 4.5-9-4.5zM3 11.5l9 4.5 9-4.5M3 16.5l9 4.5 9-4.5',
  users: 'M16 11a4 4 0 10-4-4M8 11a4 4 0 100-8 4 4 0 000 8zM2 21a6 6 0 0112 0M14 15a6 6 0 016 6',
  ai: 'M12 3l1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9zM19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z',
  security: 'M12 2l8 3.5v6c0 5.2-3.4 8.8-8 10.5-4.6-1.7-8-5.3-8-10.5v-6zM9 12l2 2 4-4',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.6V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.6-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3h0a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.6 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9v0a1.7 1.7 0 001.6 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.6 1z',
  support: 'M21 11.5a8.4 8.4 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.4 8.4 0 013.8-.9h.5a8.5 8.5 0 018 8z',
  jobs: 'M20 7h-9l-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z',
  audit: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  calendar: 'M8 2v3M16 2v3M3 9h18M5 4h14a2 2 0 012 2v13a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  clients: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  campaigns: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  approvals: 'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  performance: 'M3 3v18h18M7 14l4-4 3 3 5-6',
  reports: 'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M8 13h8M8 17h6M8 9h2',
  bell: 'M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9zM13.73 21a2 2 0 01-3.46 0',
  flag: 'M4 22V3M4 4h13l-2.5 4.5L17 13H4',
  link: 'M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  plus: 'M12 5v14M5 12h14',
  sliders: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
  chevronRight: 'M9 18l6-6-6-6',
  arrowUpRight: 'M7 17L17 7M8 7h9v9',
  logout: 'M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9',
  sidebarToggle: 'M3 4h18a1 1 0 011 1v14a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1zM9 4v16',
  palette: 'M12 2a10 10 0 000 20 2 2 0 002-2v-.5a2 2 0 012-2h1.5a4.5 4.5 0 004.5-4.5C22 6.5 17.5 2 12 2zM7.5 11.5a1 1 0 100-2 1 1 0 000 2zM11 8a1 1 0 100-2 1 1 0 000 2zM15.5 9.5a1 1 0 100-2 1 1 0 000 2z',
  image: 'M5 3h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5L5 21',
  zap: 'M13 2L3 14h9l-1 8 10-12h-9z',
  help: 'M12 22a10 10 0 100-20 10 10 0 000 20zM9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01',
  target: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 18a6 6 0 100-12 6 6 0 000 12zM12 14a2 2 0 100-4 2 2 0 000 4z',
  edit: 'M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z',
  trash: 'M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6',
  dot: 'M12 12m-4 0a4 4 0 108 0 4 4 0 10-8 0',
};

@Component({
  selector: 'ui-icon',
  standalone: true,
  template: `
    <svg
      [attr.width]="size"
      [attr.height]="size"
      viewBox="0 0 24 24"
      fill="none"
      [attr.stroke]="color || 'currentColor'"
      stroke-width="1.85"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path [attr.d]="path" />
    </svg>
  `,
  styles: [
    `
      :host {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        line-height: 0;
      }
    `,
  ],
})
export class IconComponent {
  @Input() name = 'dot';
  @Input() size = 18;
  @Input() color?: string;

  get path(): string {
    return PATHS[this.name] ?? PATHS['dot'];
  }
}
