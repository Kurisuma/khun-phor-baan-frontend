import { inject, Injectable, SecurityContext } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/**
 * HtmlSanitizer v2.0.0 — SA3-F016: Angular DomSanitizer does not strip SVG
 * <script>, event handlers (onload, onerror), javascript: URLs, or external
 * <use> xlink:href. This class adds post-processing to handle those cases.
 */
@Injectable({ providedIn: 'root' })
export class HtmlSanitizer {
  public readonly version = '2.0.0';
  private readonly sanitizer = inject(DomSanitizer);

  private static readonly STRIP_PATTERNS = [
    /<script[\s\S]*?<\/script>/gi,
    /<style[\s\S]*?<\/style>/gi,
    /\son\w+\s*=/gi, // any event handler: onload=, onclick=, onerror=, etc.
    /javascript:/gi,
    /data:(?!image\/(png|jpg|jpeg|gif|webp|svg\+xml))/gi, // allow safe image data URIs
    /xlink:href\s*=\s*["'][^\"']*:/gi, // SVG external references
    /<svg[\s\S]*?>[\s\S]*?<use[\s\S]*?<\/svg>/gi, // entire SVG with <use>
  ];

  plainText(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Sanitizes HTML for safe insertion. Combines Angular's DomSanitizer with
   * post-processing to strip SVG-specific attack vectors that Angular misses.
   */
  html(value: string): string {
    const sanitized = this.sanitizer.sanitize(SecurityContext.HTML, value) ?? '';
    let result = sanitized;
    for (const pattern of HtmlSanitizer.STRIP_PATTERNS) {
      result = result.replace(pattern, '');
    }
    return result;
  }
}
