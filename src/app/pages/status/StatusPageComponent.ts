import { NgIf } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { HealthUiService } from '../../services/health-ui/HealthUiService';
import { SeoService } from '../../services/seo/SeoService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import { AuthUiService } from '../../services/auth-ui/AuthUiService';
import { apiErrorMessage } from '../presentation';

@Component({
  standalone: true,
  selector: 'kpb-status-page',
  imports: [NgIf],
  template: `
    <section class="page-heading"><p class="eyebrow">{{ i18n.t('statusPage.eyebrow') }}</p><h1>{{ i18n.t('statusPage.title') }}</h1></section>
    <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
    <section class="content-grid">
      <article class="panel"><h2>/health</h2><pre>{{ health() }}</pre></article>
      <article class="panel"><h2>/ready</h2><pre>{{ ready() }}</pre></article>
      <article class="panel"><h2>/seo</h2><pre>{{ seoData() }}</pre></article>
    </section>
  `,
})
export class StatusPageComponent implements OnInit {
  public readonly version = '1.0.0';
  private readonly healthApi = inject(HealthUiService);
  private readonly seoApi = inject(SeoService);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly auth = inject(AuthUiService);
  protected readonly i18n = inject(I18nLoader);
  protected readonly health = signal('');
  protected readonly ready = signal('');
  protected readonly seoData = signal('');
  protected readonly error = signal('');

  async ngOnInit(): Promise<void> {
    // Defense-in-depth: enforce noindex even if SeoService.setPage is skipped
    this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
    this.title.setTitle(`${this.i18n.t('statusPage.eyebrow')} | KhunPhorBaan`);

    // Defense-in-depth: gate sensitive status data behind admin role
    const isAdmin = this.auth.isAdmin();
    this.seoApi.setPage({ title: this.i18n.t('statusPage.eyebrow'), description: this.i18n.t('statusPage.description'), path: `/${this.i18n.currentLocale()}/status`, noindex: true });
    try {
      // Only load sensitive status data for admins; guests and non-admin users get minimal info
      const tasks = isAdmin
        ? [
            this.healthApi.health(),
            this.healthApi.ready(),
            this.seoApi.robots(),
            this.seoApi.sitemap(),
            this.seoApi.productFeed(),
          ]
        : [];
      const [health, ready, robots, sitemap, feed] = isAdmin ? await Promise.allSettled(tasks) : [undefined, undefined, undefined, undefined, undefined];
      this.health.set(isAdmin && health && health.status === 'fulfilled' ? JSON.stringify(health.value, null, 2) : 'requires admin');
      this.ready.set(isAdmin && ready && ready.status === 'fulfilled' ? JSON.stringify(ready.value, null, 2) : 'requires admin');
      this.seoData.set(isAdmin && robots && sitemap && feed
        ? JSON.stringify({ robots, sitemap, feed }, null, 2)
        : 'requires admin');
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    }
  }
}
