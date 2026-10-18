import { NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase, SlicePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AdminUiService } from '../../services/admin-ui/AdminUiService';
import { AdminDashboardMetric, AdminDashboardSeries, AdminDashboardSeriesPoint, AdminDashboardUiService } from '../../services/admin-dashboard-ui/AdminDashboardUiService';
import { AuthUiService } from '../../services/auth-ui/AuthUiService';
import { MediaUiService } from '../../services/media-ui/MediaUiService';
import { MoneyScarpAdminUiService } from '../../services/money-scarp-admin-ui/MoneyScarpAdminUiService';
import { PaypalAdminUiService } from '../../services/paypal-admin-ui/PaypalAdminUiService';
import { SeoService } from '../../services/seo/SeoService';
import { TrueMoneyAdminUiService } from '../../services/truemoney-admin-ui/TrueMoneyAdminUiService';
import { I18nLoader } from '../../modules/i18n-loader/I18nLoader';
import { apiErrorMessage, formatMoney, parseJsonObject, setGlobalBaseCurrency, getGlobalBaseCurrency, cacheFxRates, setGlobalMinFeeMicrocredits } from '../presentation';
import type { PaymentModuleRegisterInfo, SystemBootInfo, PaymentModuleDbConfig } from '../../contracts/api-contract';

type AdminRow = Record<string, unknown>;
type UploadedProductMedia = { media_id: string; url: string };
type UploadedCategoryMedia = { media_id: string; url: string };
type UploadedSkuMedia = { media_id: string; url: string };
type AdminTabId = 'overview' | 'catalog' | 'inventory' | 'orders' | 'payments' | 'subscriptions' | 'settings' | 'privilege' | 'reviews' | 'media' | 'audit';
type InventoryStockView = 'ALL' | 'RISK' | 'OUT' | 'LOW' | 'DIGITAL' | 'PHYSICAL';
type PaymentGatewayId = 'MONEY_SCARP' | 'PAYPAL' | 'TRUEMONEY';
type PaymentGatewayDetail = 'ROOT' | 'MONEY_SCARP_BANK_ACCOUNTS' | 'PROMPTPAY_SETTINGS';
type WebhookMismatchFilter = 'ALL' | 'MATCHED' | 'MISMATCH' | 'PENDING';
type AdminSkuDraft = {
  id: string;
  sku_code: string;
  name_th: string;
  name_en: string;
  price_cents: string;
  currency: string;
  fulfillment_type: 'PHYSICAL' | 'DIGITAL' | 'SHARED';
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  stock_on_hand: string;
  low_stock_threshold: string;
  sku_media?: AdminRow[];
};
type ProductCompatibility = {
  kind: 'PRIVATE' | 'SHARED';
  subkind: 'PHYSICAL' | 'DIGITAL' | null;
};
const adminTabIds: AdminTabId[] = ['overview', 'catalog', 'inventory', 'orders', 'payments', 'subscriptions', 'settings', 'privilege', 'reviews', 'media', 'audit'];

interface AdminTab {
  id: AdminTabId;
  label: string;
  hint: string;
}

interface PaymentGatewayTab {
  id: PaymentGatewayId;
  labelKey: string;
  hintKey: string;
}

function loadingToTabId(value: string): AdminTabId | null {
  return adminTabIds.includes(value as AdminTabId) ? value as AdminTabId : null;
}

@Component({
  standalone: true,
  selector: 'kpb-admin-page',
  imports: [NgClass, NgFor, NgIf, NgSwitch, NgSwitchCase, ReactiveFormsModule, SlicePipe],
  template: `
    <section class="page-heading">
      <p class="eyebrow">{{ i18n.t('admin.eyebrow') }}</p>
      <h1>{{ i18n.t('admin.title') }}</h1>
      <p class="hero-lead admin-lead">{{ i18n.t('admin.lead') }}</p>
    </section>

    <nav class="privilege-menu" [attr.aria-label]="i18n.t('admin.sections')">
      <button
        *ngFor="let tab of tabs"
        class="privilege-tab"
        type="button"
        [ngClass]="{ active: activeTab() === tab.id }"
        (click)="openTab(tab.id)"
      >
        <strong>{{ tabLabel(tab.id) }}</strong>
        <span>{{ tabHint(tab.id) }}</span>
      </button>
    </nav>

    <div class="admin-status-row">
      <p class="alert alert-error" *ngIf="error()">{{ error() }}</p>
      <p class="alert alert-success" *ngIf="message()">{{ message() }}</p>
      <p class="alert alert-warning" *ngIf="loading()">{{ i18n.t('admin.loading', { name: loadingLabel() }) }}</p>
    </div>

    <section [ngSwitch]="activeTab()" class="admin-section">
      <div *ngSwitchCase="'overview'" class="stack dashboard-overview">
        <section class="panel dashboard-command-center">
          <div>
            <p class="eyebrow">{{ adminText('dashboardEyebrow') }}</p>
            <h2>{{ adminText('businessDashboard') }}</h2>
            <p class="muted">{{ adminText('dashboardOperationalSnapshotHint') }}</p>
          </div>
          <button class="btn btn-secondary" type="button" (click)="refreshOverview()">{{ i18n.t('common.refresh') }}</button>
        </section>

        <div class="executive-grid">
          <article class="executive-card" *ngFor="let metric of dashboard().executive" [ngClass]="'tone-' + metric.tone">
            <span>{{ adminText(metric.labelKey) }}</span>
            <strong>{{ dashboardMetricValue(metric) }}</strong>
            <small>{{ adminText(metric.detailKey) }}</small>
          </article>
          <article class="executive-card tone-good" *ngIf="paymentBootInfo() as boot" (click)="openTab('payments')" style="cursor: pointer;">
            <span>{{ i18n.currentLocale() === 'th' ? 'ระบบการชำระเงิน (SPI Engine)' : 'Payment SPI Engine' }}</span>
            <strong>{{ boot.status }} · {{ boot.total_modules }} Drivers</strong>
            <small>{{ boot.uptime_formatted }} ({{ boot.kernel }})</small>
          </article>
        </div>

        <section class="dashboard-layout">
          <article class="panel dashboard-wide-panel">
            <div class="panel-heading">
              <div>
                <h2>{{ adminText('departmentHealth') }}</h2>
                <p class="muted">{{ adminText('departmentHealthHint') }}</p>
              </div>
            </div>
            <div class="department-health-grid">
              <button
                class="department-card"
                type="button"
                *ngFor="let department of dashboard().departments"
                [ngClass]="'status-' + department.status"
                (click)="openTab(department.tab)"
              >
                <span class="department-status">{{ dashboardStatusLabel(department.status) }}</span>
                <strong>{{ adminText(department.labelKey) }}</strong>
                <span>{{ adminText(department.primaryKey, { count: department.primaryValue }) }}</span>
                <small>{{ adminText(department.detailKey, { count: department.actionCount }) }}</small>
              </button>
            </div>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2>{{ adminText('actionCenter') }}</h2>
                <p class="muted">{{ adminText('actionCenterHint') }}</p>
              </div>
            </div>
            <div class="dashboard-action-list" *ngIf="dashboard().actions.length; else noDashboardActions">
              <button
                class="dashboard-action"
                type="button"
                *ngFor="let action of dashboard().actions"
                [ngClass]="'severity-' + action.severity"
                (click)="openTab(action.tab)"
              >
                <span>{{ dashboardSeverityLabel(action.severity) }} · {{ adminText(action.departmentKey) }}</span>
                <strong>{{ adminText(action.titleKey, { count: action.count }) }}</strong>
                <small>{{ adminText(action.detailKey, { count: action.count }) }}</small>
              </button>
            </div>
            <ng-template #noDashboardActions><p class="muted">{{ adminText('noDashboardActions') }}</p></ng-template>
          </article>
        </section>

        <section class="dashboard-series-grid">
          <article class="panel" *ngFor="let series of dashboard().series">
            <h3>{{ adminText(series.titleKey) }}</h3>
            <div class="dashboard-bar-row" *ngFor="let point of series.points">
              <span>{{ adminText(point.labelKey) }}</span>
              <div class="dashboard-bar-track"><i [ngClass]="'tone-' + point.tone" [style.width.%]="dashboardBarWidth(point, series)"></i></div>
              <strong>{{ dashboardNumber(point.value) }}</strong>
            </div>
          </article>
        </section>
      </div>

      <div *ngSwitchCase="'catalog'" class="stack">
        <section class="content-grid">
          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2>{{ adminText('products') }}</h2>
                <p class="muted">{{ adminText('productFinderHint') }}</p>
              </div>
              <button class="btn btn-secondary" type="button" (click)="loadProducts()">{{ i18n.t('common.refresh') }}</button>
            </div>
            <div class="catalog-toolbar" *ngIf="products().length">
              <label>
                <span>{{ adminText('productFinder') }}</span>
                <input
                  type="search"
                  [value]="productSearch()"
                  (input)="updateProductSearch(inputValue($event))"
                  [placeholder]="adminText('productFinderPlaceholder')"
                >
              </label>
              <label>
                <span>{{ adminText('rowsPerPage') }}</span>
                <select [value]="productPageSize()" (change)="updateProductPageSize(inputValue($event))">
                  <option value="10">10</option>
                  <option value="20">20</option>
                  <option value="50">50</option>
                </select>
              </label>
              <button class="btn btn-secondary" type="button" (click)="clearProductFilters()">{{ adminText('clear') }}</button>
            </div>
            <div class="catalog-result-strip" *ngIf="products().length">
              <strong>{{ adminText('productShowingRows', { start: productPageStart(), end: productPageEnd(), total: filteredProducts().length }) }}</strong>
              <span>{{ adminText('productLoadedRows', { total: products().length }) }}</span>
            </div>
            <div class="table-wrap catalog-product-table-wrap" *ngIf="products().length && filteredProducts().length; else productEmptyState">
              <table class="data-table catalog-product-table">
                <colgroup>
                  <col class="catalog-col-product">
                  <col class="catalog-col-price">
                  <col class="catalog-col-status">
                  <col class="catalog-col-action">
                </colgroup>
                <thead><tr><th>{{ adminText('product') }}</th><th>{{ adminText('price') }}</th><th>{{ adminText('status') }}</th><th></th></tr></thead>
                <tbody>
                  <tr *ngFor="let product of pagedProducts()">
                    <td class="catalog-product-main">
                      <div class="admin-product-cell">
                        <img *ngIf="productImage(product)" class="admin-product-thumb" [src]="productImage(product)" [alt]="cell(product, 'name,name_th,name_en,slug')">
                        <span class="admin-product-thumb placeholder" *ngIf="!productImage(product)"></span>
                        <span class="catalog-product-copy">
                          <strong [attr.title]="cell(product, 'name,name_th,name_en,slug')">{{ cell(product, 'name,name_th,name_en,slug') }}</strong>
                          <span [attr.title]="cell(product, 'slug,product_id,id')">{{ cell(product, 'slug,product_id,id') }}</span>
                          <small>{{ adminText('sku') }} {{ productSkuCount(product) }} · #{{ rowId(product, 'id,product_id') }}</small>
                        </span>
                      </div>
                    </td>
                    <td class="catalog-product-money">{{ moneyCell(product, 'price_cents,total_cents') }}</td>
                    <td><span class="pill">{{ statusLabel(cell(product, 'status,kind', 'ACTIVE')) }}</span></td>
                    <td class="table-actions">
                      <button class="btn btn-secondary" type="button" (click)="selectProduct(product)">{{ adminText('edit') }}</button>
                      <button class="btn btn-danger" type="button" (click)="deleteProduct(product)">{{ adminText('delete') }}</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ng-template #productEmptyState><p class="muted">{{ products().length ? adminText('noProductMatches') : adminText('noProductsLoaded') }}</p></ng-template>
            <div class="pagination-bar catalog-pagination" *ngIf="filteredProducts().length > productPageSize()">
              <button class="btn btn-secondary" type="button" [disabled]="productSafePage() <= 1" (click)="previousProductPage()">{{ adminText('previousPage') }}</button>
              <span>{{ adminText('paginationPage', { page: productSafePage(), pages: productTotalPages() }) }}</span>
              <button class="btn btn-secondary" type="button" [disabled]="productSafePage() >= productTotalPages()" (click)="nextProductPage()">{{ adminText('nextPage') }}</button>
            </div>
          </article>

          <article class="panel">
            <h2>{{ productForm.getRawValue().id ? adminText('updateProduct') : adminText('createProduct') }}</h2>
            <form class="stack" [formGroup]="productForm" (ngSubmit)="saveProduct()">
              <div class="form-grid">
                <div class="system-field">
                  <span>{{ adminText('productId') }}</span>
                  <strong>{{ productForm.getRawValue().id || adminText('generatedAfterSave') }}</strong>
                </div>
                <div class="system-field">
                  <span>{{ adminText('urlSlug') }}</span>
                  <strong>{{ productForm.getRawValue().slug || adminText('generatedAfterSave') }}</strong>
                </div>
                <label><span>{{ adminText('catalogBinding') }}</span><select formControlName="product_type" [attr.title]="adminText('catalogBindingHint')"><option value="PHYSICAL">{{ adminText('privateInventoryItem') }}</option><option value="SHARED">{{ adminText('sharedSubscriptionPool') }}</option></select></label>
                <label><span>{{ adminText('categoryBinding') }}</span><select formControlName="category_id"><option value="">{{ adminText('uncategorized') }}</option><option *ngFor="let category of editableCategories()" [value]="rowId(category, 'id,category_id')">{{ cell(category, 'name,name_th,name_en,slug') }}</option></select></label>
                <label><span>{{ adminText('locale') }}</span><select formControlName="locale"><option value="th">TH</option><option value="en">EN</option></select></label>
                <label><span>{{ adminText('currency') }}</span><input formControlName="currency" [placeholder]="adminText('currencyPlaceholder')"></label>
              </div>
              <div class="form-grid">
                <label><span>{{ adminText('nameTh') }}</span><input formControlName="name_th" [placeholder]="adminText('nameThPlaceholder')"></label>
                <label><span>{{ adminText('nameEn') }}</span><input formControlName="name_en" [placeholder]="adminText('nameEnPlaceholder')"></label>
              </div>
              <label><span>{{ adminText('descriptionTh') }}</span><textarea rows="2" formControlName="description_th" [placeholder]="adminText('descriptionThPlaceholder')"></textarea></label>
              <label><span>{{ adminText('descriptionEn') }}</span><textarea rows="2" formControlName="description_en" [placeholder]="adminText('descriptionEnPlaceholder')"></textarea></label>
              <div class="sku-manager">
                <div class="panel-heading compact-heading">
                  <h3>{{ adminText('boundSellableSkus') }}</h3>
                </div>
                <div class="sku-search-box" *ngIf="!isSharedProductForm()">
                  <label>
                    <span>{{ adminText('bindInventorySku') }}</span>
                    <input
                      type="search"
                      autocomplete="off"
                      [value]="skuSearchTerm()"
                      [placeholder]="adminText('searchInventorySkuPlaceholder')"
                      (input)="searchSkus(inputValue($event))"
                    >
                  </label>
                  <div class="sku-search-results" *ngIf="skuSearchResults().length">
                    <button class="sku-search-result" type="button" *ngFor="let result of skuSearchResults()" (click)="useSkuSearchResult(result)">
                      <strong>{{ cell(result, 'sku_code') }} · {{ cell(result, 'sku_name,name_th,name_en') }}</strong>
                      <span>{{ cell(result, 'product_name,product_slug') }} · {{ cell(result, 'fulfillment_type') }} · {{ moneyCell(result, 'price_cents') }}</span>
                      <small>{{ skuSearchAvailability(result) }} · {{ skuSearchAction(result) }}</small>
                    </button>
                  </div>
                  <p class="muted" *ngIf="skuSearchTerm() && !skuSearchBusy() && !skuSearchResults().length">{{ adminText('noMatchingSku') }}</p>
                  <p class="muted" *ngIf="skuSearchBusy()">{{ adminText('searchingSkus') }}</p>
                </div>
                <div class="shared-sku-bind-panel" *ngIf="isSharedProductForm(); else privateSkuEditor">
                  <label>
                    <span>{{ adminText('bindSubscriptionSkuPool') }}</span>
                    <select (change)="bindSharedPoolToProduct(inputValue($event))">
                      <option value="">{{ adminText('chooseExistingPool') }}</option>
                      <option *ngFor="let pool of unboundOrSelectedSharedPools()" [value]="rowId(pool, 'sku_id,id')">{{ cell(pool, 'sku_code') }} - {{ cell(pool, 'sku_name') }} / {{ sharedSkuStatusLabel(pool) }}</option>
                    </select>
                  </label>
                  <div class="shared-bound-list" *ngIf="sharedSkuDrafts().length; else noBoundSharedPools">
                    <div class="shared-bound-card" *ngFor="let sku of sharedSkuDrafts(); let index = index">
                      <strong>{{ sku.sku_code }} · {{ sku.name_th || sku.name_en }}</strong>
                      <span>{{ sku.price_cents }} {{ sku.currency }} · {{ adminText('boundSubscriptionSkuPool') }}</span>
                      <div class="media-preview-strip" *ngIf="sku.sku_media?.length">
                        <img *ngFor="let media of sku.sku_media" [src]="mediaUrl(media)" [alt]="adminText('boundSkuMediaAlt')">
                      </div>
                      <div class="inline-actions">
                        <button class="btn btn-secondary" type="button" *ngIf="productForm.getRawValue().id && sku.id" (click)="mergeBoundSkuMedia(sku, 'APPEND')">{{ adminText('mergeMedia') }}</button>
                        <button class="btn btn-danger" type="button" (click)="removeSkuDraft(index)">{{ adminText('removeBinding') }}</button>
                      </div>
                    </div>
                  </div>
                  <ng-template #noBoundSharedPools><p class="muted">{{ adminText('noBoundSharedPools') }}</p></ng-template>
                </div>
                <ng-template #privateSkuEditor>
                <p class="muted">{{ adminText('catalogOnlyBindsExistingSkus') }}</p>
                <div class="sku-editor-grid" *ngIf="skuDrafts().length; else noSkuDrafts">
                  <div class="sku-editor-card" *ngFor="let sku of skuDrafts(); let index = index">
                    <div class="form-grid">
                      <div class="system-field">
                        <span>{{ adminText('skuId') }}</span>
                        <strong>{{ sku.id || adminText('new') }}</strong>
                      </div>
                      <div class="system-field"><span>{{ adminText('skuCode') }}</span><strong>{{ sku.sku_code }}</strong></div>
                      <div class="system-field"><span>{{ adminText('fulfillment') }}</span><strong>{{ sku.fulfillment_type }}</strong></div>
                      <div class="system-field"><span>{{ adminText('status') }}</span><strong>{{ statusLabel(sku.status) }}</strong></div>
                    </div>
                    <div class="form-grid">
                      <div class="system-field"><span>{{ adminText('nameTh') }}</span><strong>{{ sku.name_th || '-' }}</strong></div>
                      <div class="system-field"><span>{{ adminText('nameEn') }}</span><strong>{{ sku.name_en || '-' }}</strong></div>
                    </div>
                    <div class="form-grid">
                      <div class="system-field"><span>{{ adminText('price') }}</span><strong>{{ sku.price_cents }} {{ sku.currency }}</strong></div>
                      <div class="system-field"><span>{{ adminText('onHand') }}</span><strong>{{ sku.stock_on_hand || '0' }}</strong></div>
                      <div class="system-field"><span>{{ adminText('lowStock') }}</span><strong>{{ sku.low_stock_threshold || '0' }}</strong></div>
                    </div>
                    <div class="inline-actions">
                      <button class="btn btn-secondary" type="button" *ngIf="productForm.getRawValue().id && sku.id" (click)="mergeBoundSkuMedia(sku, 'APPEND')">{{ adminText('mergeMedia') }}</button>
                      <button class="btn btn-danger" type="button" (click)="removeSkuDraft(index)">{{ adminText('removeBinding') }}</button>
                    </div>
                    <div class="media-preview-strip" *ngIf="sku.sku_media?.length">
                      <img *ngFor="let media of sku.sku_media" [src]="mediaUrl(media)" [alt]="adminText('boundSkuMediaAlt')">
                    </div>
                  </div>
                </div>
                </ng-template>
                <ng-template #noSkuDrafts><p class="muted">{{ adminText('noInventorySkuBound') }}</p></ng-template>
              </div>
              <div class="media-upload-box">
                <div>
                  <span>{{ adminText('addImages') }}</span>
                  <strong>{{ selectedProductFileNames() || adminText('noNewFilesSelected') }}</strong>
                  <small *ngIf="selectedProductImageUrls().length">{{ adminText('productImageUploadHint') }}</small>
                </div>
                <img *ngIf="selectedProductImageUrls()[0]" [src]="selectedProductImageUrls()[0]" [alt]="adminText('productImagePreviewAlt')">
                <div class="media-preview-strip" *ngIf="selectedProductImageUrls().length > 1">
                  <img *ngFor="let url of selectedProductImageUrls()" [src]="url" [alt]="adminText('selectedProductImagePreviewAlt')">
                </div>
                <div class="inline-actions">
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple (change)="selectProductImages($event)">
                  <button class="btn btn-primary" type="button" *ngIf="selectedProductImageUrls().length" (click)="uploadProductImages()">{{ adminText('uploadImages') }}</button>
                  <button class="btn btn-secondary" type="button" *ngIf="selectedProductImageUrls().length" (click)="clearPendingProductImages()">{{ adminText('clear') }}</button>
                </div>
              </div>
              <div class="linked-media-manager">
                <div class="panel-heading compact-heading">
                  <h3>{{ adminText('linkedMedia') }}</h3>
                  <span class="muted">{{ adminText('imagesCount', { count: currentProductMediaIds().length }) }}</span>
                </div>
                <div class="linked-media-grid" *ngIf="linkedProductMediaItems().length; else linkedMediaIdsOnly">
                  <div class="linked-media-card" *ngFor="let media of linkedProductMediaItems(); let index = index">
                    <img *ngIf="mediaUrl(media)" [src]="mediaUrl(media)" [alt]="adminText('linkedProductMediaAlt')">
                    <strong>#{{ mediaId(media) }}</strong>
                    <div class="inline-actions">
                      <button class="btn btn-secondary" type="button" [disabled]="index === 0" (click)="moveLinkedProductMedia(index, -1)">{{ adminText('up') }}</button>
                      <button class="btn btn-secondary" type="button" [disabled]="index === linkedProductMediaItems().length - 1" (click)="moveLinkedProductMedia(index, 1)">{{ adminText('down') }}</button>
                      <button class="btn btn-danger" type="button" (click)="removeLinkedProductMedia(index)">{{ adminText('remove') }}</button>
                    </div>
                  </div>
                </div>
                <ng-template #linkedMediaIdsOnly>
                  <p class="muted" *ngIf="productForm.getRawValue().media_ids">{{ adminText('linkedIds', { ids: productForm.getRawValue().media_ids || '' }) }}</p>
                  <p class="muted" *ngIf="!productForm.getRawValue().media_ids">{{ adminText('noLinkedMediaYet') }}</p>
                </ng-template>
              </div>
              <div class="inline-actions">
                <button class="btn btn-primary" type="submit">{{ i18n.t('common.save') }}</button>
                <button class="btn btn-secondary" type="button" (click)="resetProductForm()">{{ adminText('newProduct') }}</button>
              </div>
            </form>
          </article>
        </section>

        <section class="content-grid">
          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2>{{ adminText('categories') }}</h2>
                <p class="muted">{{ adminText('categoryManagementHint') }}</p>
              </div>
              <button class="btn btn-secondary" type="button" (click)="loadCategories()">{{ i18n.t('common.refresh') }}</button>
            </div>
            <div class="table-wrap" *ngIf="editableCategories().length; else noCategories">
              <table class="data-table">
                <thead><tr><th>{{ adminText('category') }}</th><th>{{ adminText('products') }}</th><th>{{ adminText('status') }}</th><th></th></tr></thead>
                <tbody>
                  <tr *ngFor="let category of editableCategories()">
                    <td>
                      <div class="admin-product-cell">
                        <img *ngIf="categoryImage(category)" class="admin-product-thumb" [src]="categoryImage(category)" [alt]="cell(category, 'name,name_th,name_en,slug')">
                        <span class="admin-product-thumb placeholder" *ngIf="!categoryImage(category)"></span>
                        <span class="catalog-product-copy">
                          <strong>{{ cell(category, 'name,name_th,name_en,slug') }}</strong>
                          <span>{{ cell(category, 'slug') }}</span>
                          <small>#{{ rowId(category, 'id,category_id') }}</small>
                        </span>
                      </div>
                    </td>
                    <td>{{ cell(category, 'product_count', '0') }}</td>
                    <td><span class="pill">{{ statusLabel(cell(category, 'status', 'ACTIVE')) }}</span></td>
                    <td class="table-actions">
                      <button class="btn btn-secondary" type="button" (click)="selectCategory(category)">{{ adminText('edit') }}</button>
                      <button class="btn btn-danger" type="button" (click)="deleteCategory(category)">{{ adminText('delete') }}</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ng-template #noCategories><p class="muted">{{ adminText('noCategoriesLoaded') }}</p></ng-template>
          </article>

          <article class="panel">
            <h2>{{ categoryForm.getRawValue().id ? adminText('updateCategory') : adminText('createCategory') }}</h2>
            <p class="muted">{{ adminText('categoryIndependentHint') }}</p>
            <form class="stack" [formGroup]="categoryForm" (ngSubmit)="saveCategory()">
              <div class="form-grid">
                <div class="system-field"><span>{{ adminText('categoryId') }}</span><strong>{{ categoryForm.getRawValue().id || adminText('generatedAfterSave') }}</strong></div>
                <div class="system-field"><span>{{ adminText('urlSlug') }}</span><strong>{{ categoryForm.getRawValue().slug || adminText('generatedAfterSave') }}</strong></div>
                <label><span>{{ adminText('locale') }}</span><select formControlName="locale"><option value="th">TH</option><option value="en">EN</option></select></label>
                <label><span>{{ adminText('status') }}</span><select formControlName="status"><option value="ACTIVE">{{ adminText('active') }}</option><option value="DRAFT">{{ adminText('draft') }}</option><option value="ARCHIVED">{{ adminText('archived') }}</option></select></label>
              </div>
              <div class="form-grid">
                <label><span>{{ adminText('nameTh') }}</span><input formControlName="name_th" [placeholder]="adminText('categoryNameThPlaceholder')"></label>
                <label><span>{{ adminText('nameEn') }}</span><input formControlName="name_en" [placeholder]="adminText('categoryNameEnPlaceholder')"></label>
              </div>
              <label><span>{{ adminText('descriptionTh') }}</span><textarea rows="3" formControlName="description_th" [placeholder]="adminText('categoryDescriptionThPlaceholder')"></textarea></label>
              <label><span>{{ adminText('descriptionEn') }}</span><textarea rows="3" formControlName="description_en" [placeholder]="adminText('categoryDescriptionEnPlaceholder')"></textarea></label>
              <div class="media-upload-box">
                <div>
                  <span>{{ adminText('categoryImage') }}</span>
                  <strong>{{ selectedCategoryFileNames() || adminText('noNewFilesSelected') }}</strong>
                  <small>{{ adminText('categoryImageHint') }}</small>
                </div>
                <img *ngIf="selectedCategoryImageUrls()[0]" [src]="selectedCategoryImageUrls()[0]" [alt]="adminText('categoryImagePreviewAlt')">
                <div class="inline-actions">
                  <input type="file" accept="image/png,image/jpeg,image/webp" (change)="selectCategoryImage($event)">
                  <button class="btn btn-primary" type="button" *ngIf="selectedCategoryImageUrls().length" (click)="uploadCategoryImage()">{{ adminText('uploadImages') }}</button>
                  <button class="btn btn-secondary" type="button" *ngIf="selectedCategoryImageUrls().length" (click)="clearPendingCategoryImage()">{{ adminText('clear') }}</button>
                </div>
              </div>
              <div class="linked-media-manager">
                <div class="panel-heading compact-heading">
                  <h3>{{ adminText('linkedMedia') }}</h3>
                  <span class="muted">{{ categoryForm.getRawValue().image_media_id || adminText('noLinkedMediaYet') }}</span>
                </div>
                <div class="linked-media-grid" *ngIf="linkedCategoryMediaItem() as media">
                  <div class="linked-media-card">
                    <img *ngIf="mediaUrl(media)" [src]="mediaUrl(media)" [alt]="adminText('linkedCategoryMediaAlt')">
                    <strong>#{{ mediaId(media) }}</strong>
                    <div class="inline-actions">
                      <button class="btn btn-danger" type="button" (click)="removeCategoryImage()">{{ adminText('remove') }}</button>
                    </div>
                  </div>
                </div>
              </div>
              <label><span>{{ adminText('payloadJson') }}</span><textarea rows="3" formControlName="payload"></textarea></label>
              <div class="inline-actions">
                <button class="btn btn-primary" type="submit">{{ i18n.t('common.save') }}</button>
                <button class="btn btn-secondary" type="button" (click)="resetCategoryForm()">{{ adminText('newCategory') }}</button>
              </div>
            </form>
          </article>
        </section>
      </div>

      <div *ngSwitchCase="'inventory'" class="content-grid">
        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>{{ adminText('skuStock') }}</h2>
              <p class="muted">{{ adminText('inventorySkuFinderHint') }}</p>
            </div>
            <button class="btn btn-secondary" type="button" (click)="loadInventory()">{{ i18n.t('common.refresh') }}</button>
          </div>
          <div class="inventory-toolbar" *ngIf="inventory().length">
            <label>
              <span>{{ adminText('skuFinder') }}</span>
              <input
                type="search"
                [value]="inventorySearch()"
                (input)="updateInventorySearch(inputValue($event))"
                [placeholder]="adminText('inventorySkuFinderPlaceholder')"
              >
            </label>
            <label>
              <span>{{ adminText('stockView') }}</span>
              <select [value]="inventoryStockView()" (change)="updateInventoryStockView(inputValue($event))">
                <option value="ALL">{{ adminText('allInventorySkus') }}</option>
                <option value="RISK">{{ adminText('stockRiskOnly') }}</option>
                <option value="OUT">{{ adminText('outOfStockOnly') }}</option>
                <option value="LOW">{{ adminText('lowStockOnly') }}</option>
                <option value="DIGITAL">{{ adminText('digitalOnly') }}</option>
                <option value="PHYSICAL">{{ adminText('physicalOnly') }}</option>
              </select>
            </label>
            <label>
              <span>{{ adminText('rowsPerPage') }}</span>
              <select [value]="inventoryPageSize()" (change)="updateInventoryPageSize(inputValue($event))">
                <option value="10">10</option>
                <option value="20">20</option>
                <option value="50">50</option>
              </select>
            </label>
            <button class="btn btn-secondary" type="button" (click)="clearInventoryFilters()">{{ adminText('clear') }}</button>
          </div>
          <div class="inventory-result-strip" *ngIf="inventory().length">
            <strong>{{ adminText('inventoryShowingRows', { start: inventoryPageStart(), end: inventoryPageEnd(), total: filteredInventory().length }) }}</strong>
            <span>{{ adminText('inventoryLoadedRows', { total: inventory().length }) }}</span>
          </div>
          <div class="table-wrap inventory-table-wrap" *ngIf="inventory().length && filteredInventory().length; else inventoryEmptyState">
            <table class="data-table inventory-table">
              <colgroup>
                <col class="inventory-col-sku">
                <col class="inventory-col-product">
                <col class="inventory-col-money">
                <col class="inventory-col-count">
                <col class="inventory-col-count">
                <col class="inventory-col-count">
                <col class="inventory-col-action">
              </colgroup>
              <thead><tr><th>{{ adminText('sku') }}</th><th>{{ adminText('product') }}</th><th>{{ adminText('price') }}</th><th>{{ adminText('onHand') }}</th><th>{{ adminText('reserved') }}</th><th>{{ adminText('available') }}</th><th></th></tr></thead>
              <tbody>
                <tr *ngFor="let item of pagedInventory()" [ngClass]="inventoryStateClass(item)">
                  <td class="inventory-sku-cell">
                    <strong [attr.title]="cell(item, 'sku_code,sku,sku_id,id')">{{ cell(item, 'sku_code,sku,sku_id,id') }}</strong>
                    <span [attr.title]="cell(item, 'sku_name,name_th,name_en')">{{ cell(item, 'sku_name,name_th,name_en') }}</span>
                    <small>#{{ rowId(item, 'sku_id,id') }} · {{ cell(item, 'brand,fulfillment_type') }}</small>
                  </td>
                  <td class="inventory-product-cell">
                    <strong [attr.title]="cell(item, 'product_name,name,slug')">{{ cell(item, 'product_name,name,slug') }}</strong>
                    <span>{{ cell(item, 'fulfillment_type') }}</span>
                    <div class="inventory-chip-row">
                      <i>{{ adminText('digital') }} {{ cell(item, 'digital_available', '0') }}</i>
                      <i>{{ adminText('physical') }} {{ cell(item, 'physical_available', '0') }}</i>
                      <i>{{ adminText('lowStock') }} {{ cell(item, 'low_stock_threshold', '0') }}</i>
                    </div>
                  </td>
                  <td class="inventory-number-cell">{{ moneyCell(item, 'price_cents') }}</td>
                  <td class="inventory-number-cell">{{ cell(item, 'on_hand,qty') }}</td>
                  <td class="inventory-number-cell">{{ cell(item, 'reserved,reserved_qty') }}</td>
                  <td class="inventory-number-cell"><strong>{{ inventoryAvailableValue(item) }}</strong></td>
                  <td class="table-actions"><button class="btn btn-secondary" type="button" (click)="selectInventoryItem(item)">{{ adminText('editStockMedia') }}</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <ng-template #inventoryEmptyState><p class="muted">{{ inventory().length ? adminText('noInventoryMatches') : adminText('noInventoryRows') }}</p></ng-template>
          <div class="pagination-bar inventory-pagination" *ngIf="filteredInventory().length > inventoryPageSize()">
            <button class="btn btn-secondary" type="button" [disabled]="inventorySafePage() <= 1" (click)="previousInventoryPage()">{{ adminText('previousPage') }}</button>
            <span>{{ adminText('paginationPage', { page: inventorySafePage(), pages: inventoryTotalPages() }) }}</span>
            <button class="btn btn-secondary" type="button" [disabled]="inventorySafePage() >= inventoryTotalPages()" (click)="nextInventoryPage()">{{ adminText('nextPage') }}</button>
          </div>
        </article>

        <article class="panel" *ngIf="selectedInventoryItem() as selected">
          <div *ngIf="isDigitalInventoryItem(selected)">
            <div class="panel-heading">
              <div>
                <h2>{{ adminText('digitalPoolItems') }}</h2>
                <p class="muted">{{ cell(selected, 'sku_code,sku_id,id') }} · {{ cell(selected, 'sku_name') }}</p>
              </div>
              <button class="btn btn-secondary" type="button" (click)="loadDigitalPoolUnits()">{{ adminText('refreshPool') }}</button>
            </div>
            <p class="muted">{{ adminText('digitalPoolItemsHint') }}</p>
            <div class="table-wrap" *ngIf="digitalPoolUnits().length; else noDigitalPoolUnits">
              <table class="data-table">
                <thead><tr><th>{{ adminText('pool') }}</th><th>{{ adminText('unit') }}</th><th>{{ adminText('status') }}</th><th>{{ adminText('trace') }}</th><th>{{ adminText('updated') }}</th></tr></thead>
                <tbody>
                  <tr *ngFor="let unit of digitalPoolUnits()">
                    <td><strong>{{ cell(unit, 'pool_name') }}</strong><span>#{{ cell(unit, 'digital_pool_id,pool_id') }} · {{ cell(unit, 'pool_status') }}</span></td>
                    <td><strong>#{{ cell(unit, 'digital_unit_id,id') }}</strong><span>{{ cell(unit, 'unit_type') }} · {{ adminText('hash') }} {{ cell(unit, 'delivery_hash_prefix') }}</span></td>
                    <td>{{ statusLabel(cell(unit, 'status')) }}</td>
                    <td>
                      <span>{{ adminText('reservedTrace', { id: cell(unit, 'reserved_order_line_id', '-') }) }}</span>
                      <span>{{ adminText('deliveredTrace', { id: cell(unit, 'delivered_order_line_id', '-') }) }}</span>
                    </td>
                    <td>{{ cell(unit, 'updated_at,created_at') }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ng-template #noDigitalPoolUnits><p class="muted">{{ adminText('noDigitalPoolItems') }}</p></ng-template>
          </div>
        </article>

        <article class="panel">
          <h2>{{ privateSkuForm.getRawValue().sku_id ? adminText('editPrivateSku') : adminText('createPrivateSku') }}</h2>
          <p class="muted">{{ adminText('privateSkuHint') }}</p>
          <form class="stack" [formGroup]="privateSkuForm" (ngSubmit)="savePrivateSku()">
            <div class="form-grid">
              <label><span>{{ adminText('skuId') }}</span><input formControlName="sku_id" inputmode="numeric" [placeholder]="adminText('autoForNew')"></label>
              <label><span>{{ adminText('productBinding') }}</span><input formControlName="product_id" inputmode="numeric" [placeholder]="adminText('optionalCatalogProductId')"></label>
              <label><span>{{ adminText('fulfillment') }}</span><select formControlName="fulfillment_type" (change)="updatePrivateFulfillment(inputValue($event))"><option value="PHYSICAL">{{ adminText('physicalSerializedItem') }}</option><option value="DIGITAL">{{ adminText('digitalPoolItem') }}</option></select></label>
            </div>
            <div class="form-grid">
              <label><span>{{ adminText('brand') }}</span><input formControlName="brand" [placeholder]="adminText('privateBrandPlaceholder')" [attr.title]="adminText('generatedSkuPrefixHint')" (input)="updatePrivateBrand(inputValue($event))"></label>
              <label><span>{{ adminText('skuSuffix') }}</span><input formControlName="sku_suffix" [placeholder]="adminText('privateSkuSuffixPlaceholder')" [attr.title]="adminText('skuSuffixHint')" (input)="updatePrivateSkuSuffix(inputValue($event))"></label>
              <label *ngIf="privateSkuForm.getRawValue().fulfillment_type === 'DIGITAL'"><span>{{ adminText('digitalKind') }}</span><select formControlName="digital_sku_kind" [attr.title]="adminText('digitalKindHint')" (change)="updatePrivateDigitalKind(inputValue($event))"><option value="CDKEY">{{ adminText('cdKeyRedeemCode') }}</option><option value="ACTIVATION_LINK">{{ adminText('activationLink') }}</option></select></label>
            </div>
            <div class="form-grid">
              <label><span>{{ adminText('skuCode') }}</span><input formControlName="sku_code" [placeholder]="adminText('privateSkuCodePlaceholder')" [attr.title]="generatedPrivateSkuCode() ? adminText('generatedValue', { value: generatedPrivateSkuCode() }) : adminText('privateSkuPrefixes')" (input)="updatePrivateSkuCode(inputValue($event))"></label>
              <label><span>{{ adminText('status') }}</span><select formControlName="status"><option value="ACTIVE">{{ adminText('active') }}</option><option value="DRAFT">{{ adminText('draft') }}</option><option value="ARCHIVED">{{ adminText('archived') }}</option></select></label>
              <label><span>{{ adminText('lowStock') }}</span><input formControlName="low_stock_threshold" inputmode="numeric"></label>
            </div>
            <div class="form-grid">
              <label><span>{{ adminText('nameTh') }}</span><input formControlName="name_th" [placeholder]="adminText('nameThPlaceholder')"></label>
              <label><span>{{ adminText('nameEn') }}</span><input formControlName="name_en" [placeholder]="adminText('nameEnPlaceholder')"></label>
            </div>
            <div class="form-grid">
              <label><span>{{ adminText('priceCents') }}</span><input formControlName="price_cents" inputmode="numeric" [placeholder]="adminText('priceCentsPlaceholder')"></label>
              <label><span>{{ adminText('currency') }}</span><input formControlName="currency" [placeholder]="adminText('currencyPlaceholder')"></label>
            </div>
            <button class="btn btn-primary" type="submit">{{ adminText('savePrivateItem') }}</button>
          </form>

          <section class="sku-media-editor" [ngClass]="{ 'is-disabled': !hasSkuDetailTarget() }">
            <div class="panel-heading compact-heading">
              <h3>{{ adminText('itemMedia') }}</h3>
              <span class="muted">{{ skuDetailTargetLabel() }}</span>
            </div>
            <p class="muted" *ngIf="!hasSkuDetailTarget()">{{ adminText('selectSkuBeforeMedia') }}</p>
            <form class="stack" [formGroup]="skuDetailForm" (ngSubmit)="saveSkuDetail()">
              <div class="form-grid">
                <label><span>{{ adminText('skuId') }}</span><input formControlName="sku_id" inputmode="numeric" required></label>
                <label><span>{{ adminText('summaryTh') }}</span><input formControlName="summary_th" [placeholder]="adminText('summaryThPlaceholder')"></label>
                <label><span>{{ adminText('summaryEn') }}</span><input formControlName="summary_en" [placeholder]="adminText('summaryEnPlaceholder')"></label>
              </div>
            <div class="media-upload-box">
              <div>
                <span>{{ adminText('addSkuImages') }}</span>
                <strong>{{ selectedSkuFileNames() || adminText('noNewFilesSelected') }}</strong>
              </div>
              <img *ngIf="selectedSkuImageUrls()[0]" [src]="selectedSkuImageUrls()[0]" [alt]="adminText('skuImagePreviewAlt')">
              <div class="media-preview-strip" *ngIf="selectedSkuImageUrls().length > 1">
                <img *ngFor="let url of selectedSkuImageUrls()" [src]="url" [alt]="adminText('selectedSkuImagePreviewAlt')">
              </div>
              <div class="inline-actions">
                <input type="file" accept="image/png,image/jpeg,image/webp" multiple [disabled]="!hasSkuDetailTarget()" (change)="selectSkuImages($event)">
                <button class="btn btn-primary" type="button" *ngIf="selectedSkuImageUrls().length" [disabled]="!hasSkuDetailTarget()" (click)="uploadSkuImages()">{{ adminText('uploadImages') }}</button>
                <button class="btn btn-secondary" type="button" *ngIf="selectedSkuImageUrls().length" (click)="clearPendingSkuImages()">{{ adminText('clear') }}</button>
              </div>
            </div>
            <div class="linked-media-manager">
              <div class="panel-heading compact-heading">
                <h3>{{ adminText('skuMedia') }}</h3>
                <span class="muted">{{ adminText('imagesCount', { count: linkedSkuMediaItems().length }) }}</span>
              </div>
              <div class="linked-media-grid" *ngIf="linkedSkuMediaItems().length; else noSkuMedia">
                <div class="linked-media-card" *ngFor="let media of linkedSkuMediaItems(); let index = index">
                  <img *ngIf="mediaUrl(media)" [src]="mediaUrl(media)" [alt]="adminText('linkedSkuMediaAlt')">
                  <strong>#{{ mediaId(media) }}</strong>
                  <div class="inline-actions">
                    <button class="btn btn-secondary" type="button" [disabled]="index === 0" (click)="moveLinkedSkuMedia(index, -1)">{{ adminText('up') }}</button>
                    <button class="btn btn-secondary" type="button" [disabled]="index === linkedSkuMediaItems().length - 1" (click)="moveLinkedSkuMedia(index, 1)">{{ adminText('down') }}</button>
                    <button class="btn btn-danger" type="button" (click)="removeLinkedSkuMedia(index)">{{ adminText('remove') }}</button>
                  </div>
                </div>
              </div>
              <ng-template #noSkuMedia><p class="muted">{{ adminText('noSkuMediaLinked') }}</p></ng-template>
            </div>
              <details class="detail-drawer">
                <summary>{{ adminText('itemTextAndSpecs') }}</summary>
                <div class="stack">
                  <div class="form-grid">
                    <label><span>{{ adminText('descriptionTh') }}</span><textarea rows="3" formControlName="description_th" [placeholder]="adminText('descriptionThPlaceholder')"></textarea></label>
                    <label><span>{{ adminText('descriptionEn') }}</span><textarea rows="3" formControlName="description_en" [placeholder]="adminText('descriptionEnPlaceholder')"></textarea></label>
                  </div>
                  <div class="form-grid">
                    <label><span>{{ adminText('usageTh') }}</span><textarea rows="3" formControlName="usage_th" [placeholder]="adminText('usageThPlaceholder')"></textarea></label>
                    <label><span>{{ adminText('usageEn') }}</span><textarea rows="3" formControlName="usage_en" [placeholder]="adminText('usageEnPlaceholder')"></textarea></label>
                  </div>
                  <div class="form-grid">
                    <label><span>{{ adminText('warrantyTh') }}</span><input formControlName="warranty_th" [placeholder]="adminText('warrantyThPlaceholder')"></label>
                    <label><span>{{ adminText('warrantyEn') }}</span><input formControlName="warranty_en" [placeholder]="adminText('warrantyEnPlaceholder')"></label>
                  </div>
                  <label><span>{{ adminText('specsJson') }}</span><textarea rows="4" formControlName="specs_json" [placeholder]="adminText('specsJsonPlaceholder')"></textarea></label>
                  <label><span>{{ adminText('operatorNotes') }}</span><textarea rows="3" formControlName="operator_notes" [placeholder]="adminText('operatorNotesPlaceholder')"></textarea></label>
                </div>
              </details>
              <button class="btn btn-primary" type="submit" [disabled]="!hasSkuDetailTarget()">{{ adminText('saveItemMediaDetail') }}</button>
            </form>
          </section>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <div>
              <h2>{{ adminText('adjustSelectedSku') }}</h2>
              <p class="muted">{{ adminText('adjustSelectedSkuHint') }}</p>
            </div>
          </div>
          <div class="inventory-adjust-card" *ngIf="selectedInventoryItem() as selected">
            <div>
              <strong>{{ cell(selected, 'sku_code,sku_id,id') }}</strong>
              <span>{{ cell(selected, 'product_name,slug') }} · {{ cell(selected, 'fulfillment_type') }}</span>
            </div>
            <div class="inventory-adjust-stats">
              <span>{{ adminText('onHand') }} <strong>{{ cell(selected, 'on_hand,qty') }}</strong></span>
              <span>{{ adminText('reserved') }} <strong>{{ cell(selected, 'reserved,reserved_qty') }}</strong></span>
              <span>{{ adminText('available') }} <strong>{{ inventoryAvailableValue(selected) }}</strong></span>
            </div>
          </div>
          <form class="stack" [formGroup]="inventoryForm" (ngSubmit)="adjustInventory()">
            <label><span>{{ adminText('skuId') }}</span><input formControlName="sku_id" inputmode="numeric" required></label>
            <label><span>{{ adminText('delta') }}</span><input formControlName="delta" inputmode="numeric" required></label>
            <div class="quick-delta-row">
              <button class="btn btn-secondary" type="button" (click)="setInventoryDelta(-10)">-10</button>
              <button class="btn btn-secondary" type="button" (click)="setInventoryDelta(-1)">-1</button>
              <button class="btn btn-secondary" type="button" (click)="setInventoryDelta(1)">+1</button>
              <button class="btn btn-secondary" type="button" (click)="setInventoryDelta(10)">+10</button>
            </div>
            <label><span>{{ adminText('reason') }}</span><textarea rows="3" formControlName="reason" [placeholder]="adminText('stockReasonPlaceholder')" required></textarea></label>
            <button class="btn btn-primary" type="submit">{{ adminText('adjustStock') }}</button>
          </form>
        </article>

        <article class="panel">
          <h2>{{ adminText('digitalPoolUnits') }}</h2>
          <p class="muted">{{ adminText('digitalStockHint') }}</p>
          <form class="stack" [formGroup]="digitalUnitsForm" (ngSubmit)="addDigitalUnits()">
            <div class="form-grid">
              <label><span>{{ adminText('digitalSkuId') }}</span><input formControlName="sku_id" inputmode="numeric" required></label>
              <label><span>{{ adminText('poolName') }}</span><input formControlName="pool_name" [placeholder]="adminText('poolNamePlaceholder')"></label>
              <label><span>{{ adminText('unitType') }}</span><select formControlName="unit_type"><option value="CODE">{{ adminText('redeemCode') }}</option><option value="CDKEY">{{ adminText('cdKey') }}</option><option value="ACTIVATION_LINK">{{ adminText('activationLink') }}</option><option value="TOKEN">{{ adminText('token') }}</option><option value="FILE_ACCESS">{{ adminText('fileAccess') }}</option></select></label>
            </div>
            <label><span>{{ adminText('oneValuePerLine') }}</span><textarea rows="6" formControlName="unit_values" [placeholder]="adminText('digitalValuesPlaceholder')"></textarea></label>
            <button class="btn btn-primary" type="submit">{{ adminText('addDigitalUnits') }}</button>
          </form>
        </article>

        <article class="panel">
          <h2>{{ adminText('physicalSerials') }}</h2>
          <p class="muted">{{ adminText('physicalSerialsHint') }}</p>
          <form class="stack" [formGroup]="physicalUnitsForm" (ngSubmit)="generatePhysicalUnits()">
            <div class="form-grid">
              <label><span>{{ adminText('physicalSkuId') }}</span><input formControlName="sku_id" inputmode="numeric" required></label>
              <label><span>{{ adminText('count') }}</span><input formControlName="count" inputmode="numeric" required></label>
              <label><span>{{ adminText('serialPrefix') }}</span><input formControlName="prefix" [placeholder]="adminText('serialPrefixPlaceholder')"></label>
            </div>
            <button class="btn btn-primary" type="submit">{{ adminText('generateSerials') }}</button>
          </form>
        </article>
      </div>

      <div *ngSwitchCase="'orders'" class="content-grid">
        <article class="panel">
          <div class="panel-heading">
            <h2>{{ adminText('orders') }}</h2>
            <button class="btn btn-secondary" type="button" (click)="loadOrders()">{{ i18n.t('common.refresh') }}</button>
          </div>
          <form class="filter-bar compact-filter" [formGroup]="orderFilterForm" (ngSubmit)="loadOrders()">
            <label><span>{{ adminText('search') }}</span><input formControlName="search" [placeholder]="adminText('orderSearchPlaceholder')"></label>
            <label><span>{{ adminText('status') }}</span><input formControlName="status" [placeholder]="adminText('statusPlaceholder')"></label>
            <button class="btn btn-secondary" type="submit">{{ adminText('filter') }}</button>
          </form>
          <div class="list">
            <div class="list-row" *ngFor="let order of orders()">
              <strong>{{ cell(order, 'code,order_id,id') }}</strong>
              <span>{{ cell(order, 'user_email,email,user_id') }} - {{ statusLabel(cell(order, 'status,state')) }} - {{ moneyCell(order, 'total_cents') }}</span>
              <div class="inline-actions">
                <button class="btn btn-secondary" type="button" (click)="selectOrder(order)">{{ adminText('refund') }}</button>
                <button class="btn btn-primary" type="button" (click)="fulfillOrder(order)">{{ adminText('fulfill') }}</button>
              </div>
            </div>
            <p class="muted" *ngIf="!orders().length">{{ adminText('noOrdersLoaded') }}</p>
          </div>
        </article>

        <article class="panel">
          <h2>{{ adminText('refundOrder') }}</h2>
          <form class="stack" [formGroup]="refundForm" (ngSubmit)="refundOrder()">
            <label><span>{{ adminText('orderId') }}</span><input formControlName="order_id" inputmode="numeric" required></label>
            <label><span>{{ adminText('amountCents') }}</span><input formControlName="amount_cents" inputmode="numeric" [placeholder]="adminText('amountCentsPlaceholder')"></label>
            <label><span>{{ adminText('reason') }}</span><textarea rows="3" formControlName="reason" [placeholder]="adminText('refundReasonPlaceholder')" required></textarea></label>
            <label><span>{{ adminText('adminPassword') }}</span><input type="password" formControlName="password" [placeholder]="adminText('adminPasswordPlaceholder')" autocomplete="off"></label>
            <button class="btn btn-danger" type="submit">{{ adminText('issueRefund') }}</button>
          </form>
        </article>
      </div>

      <div *ngSwitchCase="'payments'" class="content-grid">
        <!-- System Boot & Payment SPI Module Registry Panel -->
        <article class="panel payment-spi-system-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">{{ i18n.currentLocale() === 'th' ? 'สถาปัตยกรรมระบบการชำระเงิน' : 'Payment Engine Architecture' }}</p>
              <h2>{{ i18n.currentLocale() === 'th' ? 'ข้อมูลการบูตระบบและทะเบียนโมดูลการชำระเงิน (SPI Registry)' : 'System Boot Diagnostics & Payment SPI Registry' }}</h2>
              <p class="muted">
                {{ i18n.currentLocale() === 'th'
                  ? 'ตรวจสอบสถานะการทำงาน Singleton Registry, ข้อมูล System Kernel, โมดูลชำระเงินที่ลงทะเบียน และสิทธิ์การเข้าถึงระดับประเทศ'
                  : 'Real-time inspection of process-wide Singleton Registry, system boot kernel, registered payment SPI drivers, and jurisdiction matrices.' }}
              </p>
            </div>
            <div class="inline-actions">
              <button class="btn btn-secondary" type="button" (click)="loadPaymentModules(true)">{{ i18n.t('common.refresh') }}</button>
              <button class="btn btn-primary" type="button" (click)="openAssignCountryModal()">
                + {{ i18n.currentLocale() === 'th' ? 'กำหนดสิทธิ์ประเทศใหม่' : 'Assign Country Route' }}
              </button>
            </div>
          </div>

          <!-- System Boot Info Diagnostics Banner -->
          <div class="system-boot-banner" *ngIf="paymentBootInfo() as boot">
            <div class="boot-header-status">
              <div class="boot-status-pill" [ngClass]="boot.status === 'OPERATIONAL' ? 'status-pill-ok' : 'status-pill-warn'">
                <span class="status-pulse-dot"></span>
                <strong>{{ boot.status }}</strong>
              </div>
              <span class="boot-engine-title">
                <strong>{{ boot.engine }}</strong> (v{{ boot.engine_version }})
              </span>
              <span class="boot-kernel-badge">{{ boot.kernel }} · {{ boot.os }}/{{ boot.arch }}</span>
            </div>

            <div class="boot-metrics-grid">
              <div class="boot-metric-card">
                <span class="boot-label">{{ i18n.currentLocale() === 'th' ? 'เวลาบูตระบบ' : 'Boot Timestamp' }}</span>
                <strong>{{ boot.boot_time | slice:0:19 }}Z</strong>
                <small class="muted">{{ boot.uptime_formatted }} ({{ boot.uptime_seconds }}s)</small>
              </div>

              <div class="boot-metric-card">
                <span class="boot-label">{{ i18n.currentLocale() === 'th' ? 'ฐานข้อมูลและ ORM' : 'Storage Engine' }}</span>
                <strong>{{ boot.orm_storage_engine }}</strong>
                <small class="text-accent">{{ boot.mac_sealing }}</small>
              </div>

              <div class="boot-metric-card">
                <span class="boot-label">{{ i18n.currentLocale() === 'th' ? 'Singleton Registry' : 'Singleton ID' }}</span>
                <code>{{ boot.singleton_id }}</code>
                <small class="muted">{{ boot.runtime }}</small>
              </div>

              <div class="boot-metric-card">
                <span class="boot-label">{{ i18n.currentLocale() === 'th' ? 'โมดูลชำระเงิน' : 'Registered Drivers' }}</span>
                <strong class="highlight-number">{{ boot.total_modules }} {{ i18n.currentLocale() === 'th' ? 'โมดูล' : 'Modules' }}</strong>
                <small class="text-success">{{ boot.healthy_modules }} Healthy · {{ boot.degraded_modules }} Degraded</small>
              </div>
            </div>

            <div class="boot-security-pipeline">
              <span class="security-pipeline-label">🛡️ {{ i18n.currentLocale() === 'th' ? 'ไปป์ไลน์ความปลอดภัย 6 ชั้น' : '6-Stage Security Pipeline' }}:</span>
              <code>{{ boot.security_pipeline }}</code>
            </div>
          </div>

          <!-- Registered Payment Modules Cards Grid -->
          <div class="payment-modules-list-container">
            <h3 class="modules-section-title">
              {{ i18n.currentLocale() === 'th' ? 'โมดูลการชำระเงินที่ลงทะเบียนในระบบ (Booted Drivers)' : 'Registered Payment SPI Drivers (Booted)' }}
              <span class="modules-counter-pill">{{ paymentModules().length }}</span>
            </h3>

            <div class="payment-modules-grid" *ngIf="paymentModules().length; else noPaymentModules">
              <article class="payment-module-card" *ngFor="let mod of paymentModules()">
                <div class="module-card-header">
                  <div class="module-title-group">
                    <span class="module-provider-badge">{{ mod.provider_code }}</span>
                    <h4>{{ mod.module_name }}</h4>
                    <span class="module-version-badge">v{{ mod.module_version }}</span>
                  </div>
                  <div class="module-health-badge" [ngClass]="mod.health.is_healthy ? 'health-ok' : 'health-warn'">
                    <span class="health-dot"></span>
                    <span>{{ mod.health.circuit_state || 'CLOSED' }} ({{ mod.health.latency_rtt_ms }}ms)</span>
                  </div>
                </div>

                <div class="module-meta-row">
                  <span class="module-vendor">🏢 {{ mod.vendor_name }}</span>
                  <span class="module-group">🏷️ {{ i18n.currentLocale() === 'th' ? mod.group_name_th : mod.group_name_en }}</span>
                  <span class="module-method-type">⚙️ {{ mod.method_type }}</span>
                </div>

                <p class="module-desc">
                  {{ i18n.currentLocale() === 'th' ? mod.description_th : mod.description_en }}
                </p>

                <!-- Jurisdiction & Currencies -->
                <div class="module-jurisdiction-box">
                  <div class="jurisdiction-item">
                    <span class="sub-label">{{ i18n.currentLocale() === 'th' ? 'กฎเกณฑ์ขอบเขต' : 'Jurisdiction' }}:</span>
                    <code>{{ mod.jurisdiction_rule }}</code>
                  </div>
                  <div class="jurisdiction-tags">
                    <div class="tag-group">
                      <span class="sub-label">{{ i18n.currentLocale() === 'th' ? 'ประเทศที่รองรับ' : 'Countries' }}:</span>
                      <span class="country-pill" *ngFor="let c of mod.supported_countries">{{ c }}</span>
                    </div>
                    <div class="tag-group">
                      <span class="sub-label">{{ i18n.currentLocale() === 'th' ? 'สกุลเงิน' : 'Currencies' }}:</span>
                      <span class="currency-pill" *ngFor="let cur of mod.supported_currencies">{{ cur }}</span>
                    </div>
                  </div>
                </div>

                <!-- Capabilities Matrix -->
                <div class="module-capabilities-bar">
                  <span class="sub-label">{{ i18n.currentLocale() === 'th' ? 'ความสามารถ' : 'Capabilities' }}:</span>
                  <span class="capability-tag" *ngIf="mod.capabilities.supports_dynamic_qr">Dynamic QR</span>
                  <span class="capability-tag" *ngIf="mod.capabilities.supports_webhook_reconciliation">Webhook Reconciliation</span>
                  <span class="capability-tag" *ngIf="mod.capabilities.supports_refunds">Refunds</span>
                  <span class="capability-tag" *ngIf="mod.capabilities.requires_unique_decimal_shift">Deterministic Satangs</span>
                  <span class="capability-tag zero-satang" *ngIf="!mod.capabilities.requires_unique_decimal_shift">Zero-Satang Crypto</span>
                </div>

                <!-- Database Assigned Country Routing -->
                <div class="module-db-configs">
                  <div class="db-configs-header">
                    <strong>{{ i18n.currentLocale() === 'th' ? 'การตั้งค่าเส้นทางในฐานข้อมูล (Active Country Mappings)' : 'Database Country Mappings' }}</strong>
                    <span class="config-count">({{ mod.active_configs.length }})</span>
                  </div>

                  <div class="db-configs-list" *ngIf="mod.active_configs.length; else noActiveConfigs">
                    <div class="db-config-row" *ngFor="let cfg of mod.active_configs">
                      <div class="config-country-info">
                        <strong class="config-country-code">{{ cfg.country_code }}</strong>
                        <span class="config-currency">{{ cfg.currency_code }}</span>
                        <span class="config-fee">Fee: {{ cfg.fee_basis_points / 100 }}%</span>
                      </div>
                      <div class="config-actions">
                        <span class="config-status-badge" [ngClass]="cfg.is_enabled ? 'enabled' : 'disabled'">
                          {{ cfg.is_enabled ? (i18n.currentLocale() === 'th' ? 'เปิดใช้งาน' : 'ENABLED') : (i18n.currentLocale() === 'th' ? 'ปิดใช้งาน' : 'DISABLED') }}
                        </span>
                        <button
                          class="btn btn-sm"
                          [ngClass]="cfg.is_enabled ? 'btn-secondary' : 'btn-primary'"
                          type="button"
                          (click)="togglePaymentModule(mod, cfg)"
                        >
                          {{ cfg.is_enabled ? (i18n.currentLocale() === 'th' ? 'ปิด' : 'Disable') : (i18n.currentLocale() === 'th' ? 'เปิด' : 'Enable') }}
                        </button>
                      </div>
                    </div>
                  </div>
                  <ng-template #noActiveConfigs>
                    <p class="muted small-text">{{ i18n.currentLocale() === 'th' ? 'ยังไม่ได้กำหนดประเทศในฐานข้อมูล (ใช้ค่าดีฟอลต์ของโมดูล)' : 'No specific country mappings seeded in DB.' }}</p>
                  </ng-template>
                </div>
              </article>
            </div>
            <ng-template #noPaymentModules>
              <div class="empty-state-card">
                <p class="muted">{{ i18n.currentLocale() === 'th' ? 'กำลังโหลดข้อมูลโมดูลการชำระเงิน...' : 'Loading registered payment modules...' }}</p>
              </div>
            </ng-template>
          </div>

          <!-- Assign Country Modal / Subform -->
          <div class="admin-modal-backdrop" *ngIf="showAssignCountryModal()">
            <div class="admin-modal-card">
              <div class="panel-heading">
                <h3>{{ i18n.currentLocale() === 'th' ? 'กำหนดสิทธิ์โมดูลชำระเงินระดับประเทศ' : 'Assign Payment Module to Country' }}</h3>
                <button class="btn btn-secondary" type="button" (click)="closeAssignCountryModal()">✕</button>
              </div>
              <p class="muted">
                {{ i18n.currentLocale() === 'th'
                  ? 'กำหนดโมดูล SPI ให้กับประเทศ สกุลเงิน และอัตราค่าธรรมเนียม พร้อมลงลายมือชื่อ BLAKE3 Row-MAC อัตโนมัติ'
                  : 'Map an SPI driver to a specific jurisdiction and currency with cryptographic BLAKE3 Row-MAC sealing.' }}
              </p>
              <form class="stack" [formGroup]="assignCountryForm" (ngSubmit)="submitAssignCountry()">
                <div class="form-grid">
                  <label>
                    <span>{{ i18n.currentLocale() === 'th' ? 'เลือกโมดูลชำระเงิน' : 'Payment Module' }}</span>
                    <select formControlName="provider_code" required>
                      <option value="">-- {{ i18n.currentLocale() === 'th' ? 'เลือกโมดูล' : 'Select Module' }} --</option>
                      <option *ngFor="let m of paymentModules()" [value]="m.provider_code">
                        {{ m.provider_code }} ({{ m.module_name }})
                      </option>
                    </select>
                  </label>
                  <label>
                    <span>{{ i18n.currentLocale() === 'th' ? 'รหัสประเทศ (ISO 2 หลัก เช่น TH, MY, IN, US หรือ * ทั่วโลก)' : 'Country Code (e.g. TH, MY, IN, US, *)' }}</span>
                    <input formControlName="country_code" placeholder="TH" required maxlength="10">
                  </label>
                  <label>
                    <span>{{ i18n.currentLocale() === 'th' ? 'รหัสสกุลเงิน (เช่น THB, MYR, INR, USDT, USD)' : 'Currency Code (e.g. THB, MYR, INR, USDT)' }}</span>
                    <input formControlName="currency_code" placeholder="THB" required maxlength="10">
                  </label>
                  <label>
                    <span>{{ i18n.currentLocale() === 'th' ? 'ค่าธรรมเนียม Basis Points (200 = 2%)' : 'Fee (Basis Points: 200 = 2%)' }}</span>
                    <input type="number" formControlName="fee_bps" min="0" max="5000" required>
                  </label>
                </div>
                <div class="inline-actions">
                  <button class="btn btn-primary" type="submit">{{ i18n.currentLocale() === 'th' ? 'บันทึกการกำหนดประเทศ' : 'Save Country Assignment' }}</button>
                  <button class="btn btn-secondary" type="button" (click)="closeAssignCountryModal()">{{ i18n.currentLocale() === 'th' ? 'ยกเลิก' : 'Cancel' }}</button>
                </div>
              </form>
            </div>
          </div>
        </article>

        <article class="panel">
          <div class="panel-heading">
            <h2>{{ adminText('deposits') }}</h2>
            <button class="btn btn-secondary" type="button" (click)="loadDeposits()">{{ i18n.t('common.refresh') }}</button>
          </div>
          <div class="list">
            <div class="list-row" *ngFor="let deposit of deposits()">
              <strong>{{ adminText('depositWithId', { id: rowId(deposit, 'id,deposit_id') }) }}</strong>
              <span>{{ adminText('orderWithId', { id: cell(deposit, 'order_id') }) }} - {{ statusLabel(cell(deposit, 'status,deposit_status')) }} - {{ moneyCell(deposit, 'unique_amount_cents,total_amount_cents,amount_cents') }}</span>
              <div class="inline-actions">
                <button class="btn btn-secondary" type="button" (click)="selectDeposit(deposit)">{{ adminText('review') }}</button>
              </div>
            </div>
            <p class="muted" *ngIf="!deposits().length">{{ adminText('noDepositsLoaded') }}</p>
          </div>
        </article>

        <article class="panel">
          <h2>{{ adminText('paymentResolution') }}</h2>
          <form class="stack" [formGroup]="depositForm" (ngSubmit)="matchDeposit()">
            <div class="form-grid">
              <label><span>{{ adminText('depositId') }}</span><input formControlName="deposit_id" inputmode="numeric" required></label>
              <label><span>{{ adminText('orderId') }}</span><input formControlName="order_id" inputmode="numeric" required></label>
            </div>
            <label><span>{{ adminText('matchNote') }}</span><textarea rows="3" formControlName="note" [placeholder]="adminText('matchNotePlaceholder')"></textarea></label>
            <label><span>{{ adminText('adminPassword') }}</span><input type="password" formControlName="password" [placeholder]="adminText('adminPasswordPlaceholder')" autocomplete="off"></label>
            <button class="btn btn-primary" type="submit">{{ adminText('manualMatch') }}</button>
          </form>
          <form class="stack admin-subform" [formGroup]="depositRejectForm" (ngSubmit)="rejectDeposit()">
            <label><span>{{ adminText('depositId') }}</span><input formControlName="deposit_id" inputmode="numeric" required></label>
            <label><span>{{ adminText('rejectReason') }}</span><textarea rows="3" formControlName="reason" [placeholder]="adminText('rejectReasonPlaceholder')" required></textarea></label>
            <button class="btn btn-danger" type="submit">{{ adminText('rejectDeposit') }}</button>
          </form>
        </article>

        <article class="panel webhook-audit-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">{{ adminText('webhookAuditEyebrow') }}</p>
              <h2>{{ adminText('webhookAuditLog') }}</h2>
              <p class="muted">{{ adminText('webhookAuditHint') }}</p>
            </div>
            <button class="btn btn-secondary" type="button" (click)="loadWebhookEvents()">{{ i18n.t('common.refresh') }}</button>
          </div>

          <div class="webhook-reconcile-summary">
            <div><span>{{ adminText('webhookTotal') }}</span><strong>{{ webhookEvents().length }}</strong></div>
            <div><span>{{ adminText('webhookMatched') }}</span><strong>{{ webhookMatchedCount() }}</strong></div>
            <div class="summary-danger"><span>{{ adminText('amountMismatch') }}</span><strong>{{ webhookMismatchCount() }}</strong></div>
            <div><span>{{ adminText('webhookPending') }}</span><strong>{{ webhookPendingCount() }}</strong></div>
          </div>

          <div class="webhook-filter-bar">
            <label>
              <span>{{ adminText('transactionSearch') }}</span>
              <input type="search" [value]="webhookSearch()" (input)="updateWebhookSearch(inputValue($event))" [placeholder]="adminText('transactionSearchPlaceholder')">
            </label>
            <label>
              <span>{{ adminText('fromDate') }}</span>
              <input type="date" [value]="webhookFromDate()" (input)="updateWebhookFromDate(inputValue($event))">
            </label>
            <label>
              <span>{{ adminText('toDate') }}</span>
              <input type="date" [value]="webhookToDate()" (input)="updateWebhookToDate(inputValue($event))">
            </label>
            <label>
              <span>{{ adminText('status') }}</span>
              <select [value]="webhookStatusFilter()" (change)="updateWebhookStatusFilter(inputValue($event))">
                <option value="ALL">{{ adminText('allStatuses') }}</option>
                <option value="MATCHED">{{ adminText('webhookStatusSuccess') }}</option>
                <option value="FAILED">{{ adminText('webhookStatusFailed') }}</option>
                <option value="PENDING">{{ adminText('webhookStatusPending') }}</option>
              </select>
            </label>
            <label>
              <span>{{ adminText('reconciliation') }}</span>
              <select [value]="webhookMismatchFilter()" (change)="updateWebhookMismatchFilter(inputValue($event))">
                <option value="ALL">{{ adminText('allReconciliation') }}</option>
                <option value="MATCHED">{{ adminText('matched') }}</option>
                <option value="MISMATCH">{{ adminText('amountMismatch') }}</option>
                <option value="PENDING">{{ adminText('pendingReview') }}</option>
              </select>
            </label>
            <button class="btn btn-secondary" type="button" (click)="clearWebhookFilters()">{{ adminText('clear') }}</button>
          </div>

          <div class="catalog-result-strip" *ngIf="webhookEvents().length">
            <strong>{{ adminText('webhookShowingRows', { shown: filteredWebhookEvents().length, total: webhookEvents().length }) }}</strong>
            <span>{{ adminText('webhookAmountHint') }}</span>
          </div>

          <div class="table-wrap webhook-table-wrap" *ngIf="filteredWebhookEvents().length; else noWebhookEvents">
            <table class="data-table webhook-table">
              <thead>
                <tr>
                  <th>{{ adminText('transactionId') }}</th>
                  <th>{{ adminText('provider') }}</th>
                  <th>{{ adminText('timestamp') }}</th>
                  <th>{{ adminText('status') }}</th>
                  <th>{{ adminText('amountReceived') }}</th>
                  <th>{{ adminText('expectedAmount') }}</th>
                  <th>{{ adminText('reconciliation') }}</th>
                  <th>{{ adminText('rawJson') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let event of filteredWebhookEvents()" [ngClass]="webhookRowClass(event)">
                  <td><strong>{{ cell(event, 'provider_event_id,provider_transaction_id,id') }}</strong><small>{{ cell(event, 'payload_hash', '') }}</small></td>
                  <td>{{ cell(event, 'provider,source') }}</td>
                  <td>{{ dateTimeCell(event, 'received_at,occurred_at,processed_at,updated_at') }}</td>
                  <td><span class="status-badge" [ngClass]="webhookStatusClass(event)">{{ webhookStatusLabel(event) }}</span></td>
                  <td>{{ moneyCell(event, 'amount_cents') }}</td>
                  <td>{{ webhookExpectedAmountLabel(event) }}</td>
                  <td><span class="reconcile-badge" [ngClass]="webhookReconciliationClass(event)">{{ webhookReconciliationLabel(event) }}</span></td>
                  <td><button class="btn btn-secondary" type="button" (click)="openWebhookDetail(event)">{{ adminText('inspectPayload') }}</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <ng-template #noWebhookEvents><p class="muted">{{ webhookEvents().length ? adminText('noWebhookMatches') : adminText('noWebhookEventsLoaded') }}</p></ng-template>

          <section class="webhook-allowlist-panel admin-subform">
            <div class="panel-heading">
              <div>
                <p class="eyebrow">{{ adminText('webhookIpAllowlistEyebrow') }}</p>
                <h2>{{ adminText('webhookIpAllowlist') }}</h2>
                <p class="muted">{{ adminText('webhookIpAllowlistHint') }}</p>
              </div>
              <button class="btn btn-secondary" type="button" (click)="loadWebhookIpAllowlist()">{{ i18n.t('common.refresh') }}</button>
            </div>
            <div class="table-wrap webhook-table-wrap" *ngIf="webhookIpAllowlist().length; else noWebhookAllowlist">
              <table class="data-table webhook-table">
                <thead><tr><th>{{ adminText('provider') }}</th><th>{{ adminText('label') }}</th><th>{{ adminText('cidr') }}</th><th>{{ adminText('status') }}</th><th>{{ adminText('note') }}</th><th></th></tr></thead>
                <tbody>
                  <tr *ngFor="let entry of webhookIpAllowlist()">
                    <td><strong>{{ cell(entry, 'provider') }}</strong></td>
                    <td>{{ cell(entry, 'label') }}</td>
                    <td><code>{{ cell(entry, 'cidr') }}</code></td>
                    <td><span class="status-badge" [ngClass]="statusClass(cell(entry, 'status'))">{{ statusLabel(cell(entry, 'status')) }}</span></td>
                    <td>{{ cell(entry, 'note', '') }}</td>
                    <td class="inline-actions">
                      <button class="btn btn-secondary" type="button" (click)="editWebhookIpAllowlist(entry)">{{ adminText('edit') }}</button>
                      <button class="btn btn-danger" type="button" (click)="deleteWebhookIpAllowlist(entry)">{{ adminText('delete') }}</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <ng-template #noWebhookAllowlist><p class="muted">{{ adminText('noWebhookIpAllowlist') }}</p></ng-template>

            <form class="stack admin-subform" [formGroup]="webhookIpAllowlistForm" (ngSubmit)="saveWebhookIpAllowlist()">
              <h3>{{ editingWebhookIpAllowlistId() ? adminText('editWebhookIpRule') : adminText('addWebhookIpRule') }}</h3>
              <div class="form-grid">
                <label><span>{{ adminText('provider') }}</span><input formControlName="provider" placeholder="proxy-bank"></label>
                <label><span>{{ adminText('label') }}</span><input formControlName="label" [placeholder]="adminText('webhookIpLabelPlaceholder')"></label>
                <label><span>{{ adminText('cidr') }}</span><input formControlName="cidr" placeholder="203.0.113.10/32"></label>
                <label><span>{{ adminText('status') }}</span><select formControlName="status"><option value="ACTIVE">{{ adminText('activeStatus') }}</option><option value="INACTIVE">{{ adminText('inactiveStatus') }}</option></select></label>
              </div>
              <label><span>{{ adminText('note') }}</span><textarea rows="2" formControlName="note" [placeholder]="adminText('webhookIpNotePlaceholder')"></textarea></label>
              <div class="inline-actions">
                <button class="btn btn-primary" type="submit">{{ adminText('saveWebhookIpRule') }}</button>
                <button class="btn btn-secondary" type="button" (click)="resetWebhookIpAllowlistForm()">{{ adminText('clear') }}</button>
              </div>
            </form>
          </section>
        </article>

        <aside class="webhook-detail-panel" *ngIf="selectedWebhookEvent() as selected">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">{{ adminText('webhookPayloadDetail') }}</p>
              <h2>{{ cell(selected, 'provider_event_id,provider_transaction_id,id') }}</h2>
            </div>
            <button class="btn btn-secondary" type="button" (click)="closeWebhookDetail()">{{ adminText('close') }}</button>
          </div>
          <div class="webhook-detail-grid">
            <div class="system-field"><span>{{ adminText('provider') }}</span><strong>{{ cell(selected, 'provider,source') }}</strong></div>
            <div class="system-field"><span>{{ adminText('status') }}</span><strong>{{ webhookStatusLabel(selected) }}</strong></div>
            <div class="system-field"><span>{{ adminText('amountReceived') }}</span><strong>{{ moneyCell(selected, 'amount_cents') }}</strong></div>
            <div class="system-field"><span>{{ adminText('expectedAmount') }}</span><strong>{{ webhookExpectedAmountLabel(selected) }}</strong></div>
            <div class="system-field"><span>{{ adminText('reconciliation') }}</span><strong>{{ webhookReconciliationLabel(selected) }}</strong></div>
            <div class="system-field"><span>{{ adminText('matchedOrder') }}</span><strong>{{ cell(selected, 'matched_order_id') }}</strong></div>
          </div>
          <h3>{{ adminText('rawJson') }}</h3>
          <pre class="raw-json-viewer">{{ webhookRawJson(selected) }}</pre>
        </aside>

        <article class="panel">
          <div class="panel-heading">
            <h2>{{ adminText('depositGateways') }}</h2>
            <div class="inline-actions">
              <button class="btn btn-secondary" type="button" (click)="refreshActivePaymentGateway()">{{ i18n.t('common.refresh') }}</button>
            </div>
          </div>
          <p class="muted">{{ adminText('depositGatewaysHint') }}</p>
          <nav class="gateway-tabs" [attr.aria-label]="adminText('depositGateways')">
            <button
              *ngFor="let gateway of paymentGatewayTabs"
              class="gateway-tab"
              type="button"
              [ngClass]="{ active: activePaymentGateway() === gateway.id }"
              (click)="selectPaymentGateway(gateway.id)"
            >
              <strong>{{ adminText(gateway.labelKey) }}</strong>
              <span>{{ adminText(gateway.hintKey) }}</span>
            </button>
          </nav>

          <div class="gateway-drill-grid" *ngIf="activePaymentGateway() === 'MONEY_SCARP' && activeGatewayDetail() === 'ROOT'">
            <button class="gateway-tab" type="button" (click)="openGatewayDetail('MONEY_SCARP_BANK_ACCOUNTS')">
              <strong>{{ adminText('moneyScarpBankAccounts') }}</strong>
              <span>{{ adminText('moneyScarpBankAccountsHint') }}</span>
              <small>{{ bankDestinationAccounts().length }} {{ adminText('accounts') }}</small>
            </button>
            <button class="gateway-tab" type="button" (click)="openGatewayDetail('PROMPTPAY_SETTINGS')">
              <strong>{{ adminText('promptPaySettings') }}</strong>
              <span>{{ adminText('promptPaySettingsHint') }}</span>
              <small>{{ promptPayDestinationAccounts().length }} {{ adminText('accounts') }}</small>
            </button>
          </div>

          <section class="admin-subform" *ngIf="activePaymentGateway() === 'MONEY_SCARP' && activeGatewayDetail() === 'MONEY_SCARP_BANK_ACCOUNTS'">
            <div class="panel-heading compact-heading">
              <div>
                <h2>{{ adminText('moneyScarpBankAccounts') }}</h2>
                <p class="muted">{{ adminText('moneyScarpBankAccountsHint') }}</p>
              </div>
              <div class="inline-actions">
                <button class="btn btn-secondary" type="button" (click)="backToDepositGateways()">{{ adminText('back') }}</button>
                <button class="btn btn-secondary" type="button" (click)="loadDestinationAccounts()">{{ i18n.t('common.refresh') }}</button>
                <button class="btn btn-primary" type="button" (click)="startAddBankAccount()">{{ adminText('addBankAccount') }}</button>
              </div>
            </div>
            <div class="list" *ngIf="bankDestinationAccounts().length; else noDestAccounts">
              <div class="list-row" *ngFor="let acct of bankDestinationAccounts()" [ngClass]="{ 'row-muted': !isDestAccountActive(acct) }">
                <div>
                  <strong>{{ destAccountLabel(acct) }}</strong>
                  <span class="pill" [ngClass]="{ 'pill-muted': !isDestAccountActive(acct) }">{{ isDestAccountActive(acct) ? adminText('activeStatus') : adminText('inactiveStatus') }}</span>
                </div>
                <span>{{ destAccountDetail(acct) }}</span>
                <small class="muted">{{ adminText('priority') }}: {{ cell(acct, 'priority') }}</small>
                <div class="inline-actions">
                  <button class="btn btn-secondary" type="button" (click)="editDestinationAccount(acct)">{{ adminText('editAccount') }}</button>
                  <button class="btn btn-secondary" type="button" (click)="toggleDestinationAccount(acct)">{{ adminText('toggleActive') }}</button>
                  <button class="btn btn-danger" type="button" (click)="deleteDestinationAccount(acct)">{{ adminText('deleteAccount') }}</button>
                </div>
              </div>
            </div>
            <ng-template #noDestAccounts>
              <div class="empty-state-card">
                <p class="muted">{{ adminText('noDestinationAccounts') }}</p>
                <button class="btn btn-primary" type="button" (click)="startAddBankAccount()">{{ adminText('addBankAccount') }}</button>
              </div>
            </ng-template>
          </section>

          <section class="admin-subform" *ngIf="activePaymentGateway() === 'MONEY_SCARP' && activeGatewayDetail() === 'PROMPTPAY_SETTINGS'">
            <div class="panel-heading compact-heading">
              <div>
                <h2>{{ adminText('promptPaySettings') }}</h2>
                <p class="muted">{{ adminText('promptPaySettingsHint') }}</p>
              </div>
              <div class="inline-actions">
                <button class="btn btn-secondary" type="button" (click)="backToDepositGateways()">{{ adminText('back') }}</button>
                <button class="btn btn-secondary" type="button" (click)="loadDestinationAccounts()">{{ i18n.t('common.refresh') }}</button>
                <button class="btn btn-primary" type="button" (click)="startAddPromptPay()">{{ adminText('addPromptPay') }}</button>
              </div>
            </div>
            <p class="muted">{{ adminText('promptPayMoneyScarpPoolHint') }}</p>
            <div class="system-field"><span>{{ adminText('qrGenerator') }}</span><strong>EMVCo PromptPay</strong></div>
            <div class="list" *ngIf="promptPayDestinationAccounts().length; else noPromptPayAccounts">
              <div class="list-row" *ngFor="let acct of promptPayDestinationAccounts()" [ngClass]="{ 'row-muted': !isDestAccountActive(acct) }">
                <div>
                  <strong>{{ destAccountLabel(acct) }}</strong>
                  <span class="pill" [ngClass]="{ 'pill-muted': !isDestAccountActive(acct) }">{{ isDestAccountActive(acct) ? adminText('activeStatus') : adminText('inactiveStatus') }}</span>
                </div>
                <span>{{ destAccountDetail(acct) }}</span>
                <small class="muted">{{ adminText('priority') }}: {{ cell(acct, 'priority') }}</small>
                <div class="inline-actions">
                  <button class="btn btn-secondary" type="button" (click)="editDestinationAccount(acct)">{{ adminText('editAccount') }}</button>
                  <button class="btn btn-secondary" type="button" (click)="toggleDestinationAccount(acct)">{{ adminText('toggleActive') }}</button>
                  <button class="btn btn-danger" type="button" (click)="deleteDestinationAccount(acct)">{{ adminText('deleteAccount') }}</button>
                </div>
              </div>
            </div>
            <ng-template #noPromptPayAccounts>
              <div class="empty-state-card">
                <p class="muted">{{ adminText('noPromptPayAccounts') }}</p>
                <button class="btn btn-primary" type="button" (click)="startAddPromptPay()">{{ adminText('addPromptPay') }}</button>
              </div>
            </ng-template>
          </section>

          <section class="admin-subform" *ngIf="activePaymentGateway() === 'MONEY_SCARP' && activeGatewayDetail() !== 'ROOT' && showDestinationForm()">
            <h2>{{ editingDestinationAccountId() ? adminText('editAccount') : (destinationFormType() === 'PROMPTPAY' ? adminText('addPromptPay') : adminText('addBankAccount')) }}</h2>
            <form class="stack" [formGroup]="destinationAccountForm" (ngSubmit)="saveDestinationAccount()">
              <div class="form-grid" *ngIf="destinationFormType() === 'BANK_TRANSFER'">
                <label>
                  <span>{{ adminText('bankCode') }}</span>
                  <select formControlName="bank_code" (change)="onBankCodeChange()">
                    <option value="">—</option>
                    <option *ngFor="let bank of thaiBankCodes" [value]="bank.code">{{ bank.code }} — {{ adminText(bank.key) }}</option>
                  </select>
                </label>
                <label><span>{{ adminText('bankName') }}</span><input formControlName="bank_name"></label>
              </div>
              <div class="form-grid" *ngIf="destinationFormType() === 'PROMPTPAY'">
                <label>
                  <span>{{ adminText('promptPayType') }}</span>
                  <select formControlName="promptpay_type">
                    <option value="PHONE">{{ adminText('promptPayPhone') }}</option>
                    <option value="CITIZEN_ID">{{ adminText('promptPayCitizenId') }}</option>
                    <option value="TAX_ID">{{ adminText('promptPayTaxId') }}</option>
                  </select>
                </label>
              </div>
              <div class="form-grid">
                <label><span>{{ adminText('accountNumber') }}</span><input formControlName="account_number" required></label>
                <label><span>{{ adminText('accountName') }}</span><input formControlName="account_name" required></label>
              </div>
              <div class="form-grid">
                <label><span>{{ adminText('displayLabel') }}</span><input formControlName="display_label" [placeholder]="adminText('displayLabelPlaceholder')"></label>
                <label><span>{{ adminText('priority') }}</span><input formControlName="priority" type="number" min="0"></label>
              </div>
              <p class="muted">{{ adminText('priorityHint') }}</p>
              <div class="inline-actions">
                <button class="btn btn-primary" type="submit">{{ editingDestinationAccountId() ? i18n.t('common.save') : i18n.t('common.create') }}</button>
                <button class="btn btn-secondary" type="button" (click)="cancelDestinationForm()">{{ i18n.t('common.cancel') }}</button>
              </div>
            </form>
          </section>
        </article>

        <article class="panel gateway-placeholder" *ngIf="activePaymentGateway() === 'PAYPAL'">
          <h2>{{ adminText('paypalGateway') }}</h2>
          <p class="muted">{{ adminText('paypalGatewayPlaceholder') }}</p>
          <div class="system-field"><span>{{ adminText('gatewayModule') }}</span><strong>PaypalAdminUiService v{{ paypalGateway.version }}</strong></div>
          <button class="btn btn-secondary" type="button" disabled>{{ adminText('comingSoon') }}</button>
        </article>

        <article class="panel gateway-placeholder" *ngIf="activePaymentGateway() === 'TRUEMONEY'">
          <h2>{{ adminText('trueMoneyGateway') }}</h2>
          <p class="muted">{{ adminText('trueMoneyGatewayPlaceholder') }}</p>
          <div class="system-field"><span>{{ adminText('gatewayModule') }}</span><strong>TrueMoneyAdminUiService v{{ trueMoneyGateway.version }}</strong></div>
          <button class="btn btn-secondary" type="button" disabled>{{ adminText('comingSoon') }}</button>
        </article>

      </div>

      <div *ngSwitchCase="'subscriptions'" class="stack">
        <article class="panel subscription-guide-panel">
          <div class="panel-heading">
            <h2>{{ adminText('subscriptionOperatingFlow') }}</h2>
          </div>
          <p class="muted">{{ adminText('subscriptionFlowHint') }}</p>
          <div class="subscription-flow" [attr.aria-label]="adminText('subscriptionSetupSequence')">
            <span>{{ adminText('createPool') }}</span>
            <span>{{ adminText('addAccountInventory') }}</span>
            <span>{{ adminText('sealCredentials') }}</span>
            <span>{{ adminText('bindInCatalog') }}</span>
            <span>{{ adminText('monitorDeliveredSlots') }}</span>
          </div>
        </article>

        <article class="panel subscription-finder-panel">
          <div class="panel-heading">
            <h2>{{ adminText('findSharedSku') }}</h2>
            <button class="btn btn-secondary" type="button" (click)="refreshSubscriptionWorkspace()">{{ i18n.t('common.refresh') }}</button>
          </div>
          <p class="muted">{{ adminText('findSharedSkuHint') }}</p>
          <div class="subscription-sku-list" *ngIf="sharedSkuOptions().length; else noSharedSkuFinderOptions">
            <label>
              <span>{{ adminText('findSharedSku') }}</span>
              <input type="search" [value]="sharedSkuSearch()" [placeholder]="adminText('sharedSkuSearchPlaceholder')" [attr.title]="adminText('sharedSkuSearchHint')" (input)="updateSharedSkuSearch(inputValue($event))">
            </label>
            <div class="sku-picker" *ngIf="filteredSharedSkuOptions().length; else noSharedSkuFinderMatches">
              <button
                class="sku-option"
                type="button"
                *ngFor="let sku of filteredSharedSkuOptions()"
                [ngClass]="{ active: rowId(sku, 'sku_id,id') === selectedSharedSkuIdValue() }"
                (click)="selectSharedSku(sku)"
              >
                <span>{{ cell(sku, 'sku_code') }} · {{ cell(sku, 'name,name_th,name_en,sku_name') }}</span>
                <small>{{ cell(sku, 'product_name,product_slug') }} · {{ sharedSkuStatusLabel(sku) }}</small>
              </button>
            </div>
            <ng-template #noSharedSkuFinderMatches><p class="muted">{{ adminText('noSharedSkuMatches') }}</p></ng-template>
          </div>
          <ng-template #noSharedSkuFinderOptions><p class="muted">{{ adminText('createSharedSkuBeforeManaging') }}</p></ng-template>
        </article>

        <article class="panel subscription-workspace-panel">
          <div class="panel-heading">
            <h2>{{ adminText('sharedSkuWorkspace') }}</h2>
          </div>
          <p class="muted">{{ adminText('sharedSkuWorkspaceHint') }}</p>
          <div class="subscription-admin-shell" *ngIf="selectedSharedSku() as sku; else noSelectedSharedSku">
            <section class="subscription-sku-workspace">
              <div class="subscription-context">
                <div>
                  <p class="eyebrow">{{ adminText('sharedSku') }}</p>
                  <h3>{{ cell(sku, 'sku_code') }} · {{ cell(sku, 'name,name_th,name_en,sku_name') }}</h3>
                  <p class="muted">{{ cell(sku, 'product_name,product_slug') }}</p>
                  <p class="muted">{{ adminText('sharedSkuContextHint') }}</p>
                </div>
                <div class="inline-actions">
                  <span class="pill" [ngClass]="{ 'pill-muted': sharedPoolStatus() !== 'ACTIVE' }">{{ sharedPoolHealthLabel() }}</span>
                  <button class="btn btn-secondary" type="button" (click)="editSharedSubscriptionSku(sku)">{{ adminText('editSku') }}</button>
                </div>
              </div>

              <div class="metric-grid subscription-metrics">
                <article class="metric-tile"><span>{{ adminText('sellable') }}</span><strong>{{ sharedSellableSlotsAvailable() }}</strong><small>{{ adminText('sellableHint') }}</small></article>
                <article class="metric-tile"><span>{{ adminText('usedTotal') }}</span><strong>{{ sharedSlotsUsed() }} / {{ sharedSlotsTotal() }}</strong><small>{{ adminText('usedTotalHint') }}</small></article>
                <article class="metric-tile"><span>{{ adminText('activeAccounts') }}</span><strong>{{ sharedActiveAccountCount() }}</strong><small>{{ adminText('activeAccountsHint') }}</small></article>
                <article class="metric-tile"><span>{{ adminText('needsAttention') }}</span><strong>{{ sharedAttentionCount() }}</strong><small>{{ adminText('needsAttentionHint') }}</small></article>
              </div>

              <div class="subscription-admin-grid">
                <article class="subscription-operator-panel">
                  <div class="panel-heading">
                    <h3>{{ adminText('accountInventory') }}</h3>
                    <button class="btn btn-secondary" type="button" (click)="startNewSharedAccount()">{{ adminText('addAccount') }}</button>
                  </div>
                  <p class="muted">{{ adminText('accountInventoryHint') }}</p>
                  <div class="shared-account-list" *ngIf="selectedSharedAccountRows().length; else noAccountInventory">
                    <button
                      class="shared-account-card"
                      type="button"
                      *ngFor="let account of selectedSharedAccountRows()"
                      [ngClass]="{ active: rowId(account, 'shared_account_id,id') === selectedSharedAccountIdValue() }"
                      (click)="selectSharedAccount(account)"
                    >
                      <span><strong>{{ cell(account, 'vendor,provider') }}</strong><span class="pill" [ngClass]="{ 'pill-muted': cell(account, 'account_status,status') !== 'ACTIVE' }">{{ statusLabel(cell(account, 'account_status,status')) }}</span></span>
                      <small>{{ adminText('accountSlots', { id: rowId(account, 'shared_account_id,id'), used: cell(account, 'slots_used'), total: cell(account, 'slots_total') }) }}</small>
                      <small>{{ sharedAccountExpiryLabel(account) }} · {{ cell(account, 'credential_status', adminText('credentialUnknown')) }}</small>
                    </button>
                  </div>
                  <ng-template #noAccountInventory><p class="muted">{{ adminText('noAccountInventory') }}</p></ng-template>
                </article>

                <article class="subscription-operator-panel">
                  <h3>{{ sharedAccountForm.getRawValue().id ? adminText('selectedAccount') : adminText('newAccountInventory') }}</h3>
                  <p class="muted">{{ adminText('accountCapacityHint') }}</p>
                  <form class="stack" [formGroup]="sharedAccountForm" (ngSubmit)="saveSharedAccount()">
                    <div class="form-grid">
                      <label><span>{{ adminText('sharedAccountId') }}</span><input formControlName="id" inputmode="numeric" [placeholder]="adminText('autoForNew')" [attr.title]="adminText('newAccountInventoryPlaceholder')"></label>
                      <label><span>{{ adminText('sharedSku') }}</span><select formControlName="sku_id" [attr.title]="adminText('sharedAccountSkuHint')"><option value="">{{ adminText('chooseSharedSku') }}</option><option *ngFor="let option of sharedSkuOptions()" [value]="cell(option, 'sku_id,id')">{{ cell(option, 'sku_code') }} - {{ cell(option, 'name,name_th,name_en') }} / {{ cell(option, 'product_name,product_slug') }}</option></select></label>
                      <label><span>{{ adminText('vendor') }}</span><input formControlName="vendor" [placeholder]="adminText('vendorPlaceholder')" required></label>
                      <label *ngIf="!sharedAccountForm.getRawValue().id; else lockedCapacity"><span>{{ adminText('slotsTotal') }}</span><input formControlName="capacity" inputmode="numeric" [placeholder]="adminText('slotsTotalPlaceholder')" required></label>
                      <ng-template #lockedCapacity><label><span>{{ adminText('slotsTotal') }}</span><input disabled [value]="sharedAccountForm.getRawValue().capacity || '0'" [attr.title]="adminText('lockedCapacityHint')"></label></ng-template>
                      <label><span>{{ adminText('slotsUsed') }}</span><input disabled [value]="selectedSharedAccountSlotsUsed()" [attr.title]="adminText('slotsUsedHint')"></label>
                      <label><span>{{ adminText('status') }}</span><select formControlName="status" [attr.title]="adminText('accountStatusHint')"><option value="ACTIVE">{{ adminText('active') }}</option><option value="PAUSED">{{ adminText('paused') }}</option><option value="REVOKED">{{ adminText('revoked') }}</option></select></label>
                      <label><span>{{ adminText('expiresAt') }}</span><input type="datetime-local" formControlName="expires_at" [attr.title]="adminText('expiresAtHint')"></label>
                    </div>
                    <div class="inline-actions">
                      <button class="btn btn-primary" type="submit">{{ i18n.t('common.save') }}</button>
                      <button class="btn btn-secondary" type="button" (click)="startNewSharedAccount()">{{ adminText('newAccount') }}</button>
                    </div>
                  </form>
                </article>
              </div>

              <div class="subscription-admin-grid subscription-admin-grid-secondary">
                <article class="subscription-operator-panel">
                  <div class="panel-heading">
                    <h3>{{ adminText('deliveredSlots') }}</h3>
                    <button class="btn btn-secondary" type="button" (click)="loadSubscriptions()">{{ i18n.t('common.refresh') }}</button>
                  </div>
                  <p class="muted">{{ adminText('deliveredSlotsHint') }}</p>
                  <div class="table-wrap" *ngIf="filteredSubscriptionSlots().length; else noFilteredSubscriptions">
                    <table class="data-table">
                      <thead><tr><th>{{ adminText('slot') }}</th><th>{{ adminText('customer') }}</th><th>{{ adminText('order') }}</th><th>{{ adminText('status') }}</th></tr></thead>
                      <tbody>
                        <tr *ngFor="let slot of filteredSubscriptionSlots()">
                          <td><strong>{{ cell(slot, 'slot_id,id') }}</strong><span>{{ adminText('accountWithId', { id: cell(slot, 'shared_account_id') }) }}</span></td>
                          <td>{{ cell(slot, 'user_email,email,user_id') }}</td>
                          <td>{{ cell(slot, 'order_code,order_line_id') }}<span>{{ cell(slot, 'allocated_at') }}</span></td>
                          <td><span class="pill" [ngClass]="{ 'pill-muted': cell(slot, 'status') !== 'ACTIVE' }">{{ statusLabel(cell(slot, 'status')) }}</span></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  <ng-template #noFilteredSubscriptions><p class="muted">{{ adminText('noFilteredSubscriptions') }}</p></ng-template>
                </article>

                <article class="subscription-operator-panel credential-panel">
                  <h3>{{ adminText('credentials') }}</h3>
                  <p class="muted">{{ adminText('credentialsHint') }}</p>
                  <div class="form-grid" *ngIf="selectedSharedAccount() as account">
                    <div class="system-field"><span>{{ adminText('credentialState') }}</span><strong>{{ cell(account, 'credential_status', adminText('unknown')) }}</strong></div>
                    <div class="system-field"><span>{{ adminText('kekId') }}</span><strong>{{ cell(account, 'kek_id', '-') }}</strong></div>
                  </div>
                  <p class="muted" *ngIf="!selectedSharedAccount()">{{ adminText('selectAccountBeforeCredentials') }}</p>
                  <p class="alert alert-warning">{{ adminText('plaintextCredentialWarning') }}</p>
                  <form class="stack admin-subform" [formGroup]="credentialForm" (ngSubmit)="rotateCredential()">
                    <label><span>{{ adminText('sharedAccountId') }}</span><input formControlName="id" inputmode="numeric" [placeholder]="adminText('selectedAccountIdPlaceholder')" required></label>
                    <label><span>{{ adminText('providerLogin') }}</span><input formControlName="credential_username" [placeholder]="adminText('providerLoginPlaceholder')" autocomplete="off"></label>
                    <label><span>{{ adminText('providerSecret') }}</span><input type="password" formControlName="credential_secret" [placeholder]="adminText('providerSecretPlaceholder')" required autocomplete="off"></label>
                    <div class="form-grid">
                      <label><span>{{ adminText('rotationReason') }}</span><input formControlName="reason" [placeholder]="adminText('rotationReasonPlaceholder')" required></label>
                      <label><span>{{ adminText('adminPassword') }}</span><input type="password" formControlName="password" [placeholder]="adminText('adminPasswordPlaceholder')" autocomplete="current-password"></label>
                    </div>
                    <label><span>{{ adminText('credentialNotes') }}</span><textarea rows="2" formControlName="credential_notes" [placeholder]="adminText('credentialNotesPlaceholder')" autocomplete="off"></textarea></label>
                    <button class="btn btn-danger" type="submit" [disabled]="!selectedSharedAccount()">{{ adminText('sealCredential') }}</button>
                  </form>
                </article>
              </div>
            </section>
          </div>
          <ng-template #noSelectedSharedSku><p class="muted">{{ adminText('noSelectedSharedSku') }}</p></ng-template>
        </article>

        <article class="panel subscription-setup-panel">
          <div class="panel-heading">
            <h2>{{ adminText('subscriptionSkuPoolSetup') }}</h2>
          </div>
          <form class="stack" [formGroup]="sharedSkuForm" (ngSubmit)="saveSharedSubscriptionSku()">
            <div class="subscription-setup-grid">
              <section class="subscription-setup-section">
                <h3>{{ adminText('poolSellable') }}</h3>
                <p class="muted">{{ adminText('poolSellableHint') }}</p>
                <div class="form-grid">
                  <label><span>{{ adminText('skuId') }}</span><input formControlName="sku_id" inputmode="numeric" [placeholder]="adminText('autoForNew')" [attr.title]="adminText('sharedSkuIdHint')"></label>
                  <label><span>{{ adminText('brand') }}</span><input formControlName="brand" [placeholder]="adminText('sharedBrandPlaceholder')" [attr.title]="adminText('sharedBrandHint')" (input)="updateSharedBrand(inputValue($event))"></label>
                  <label><span>{{ adminText('skuSuffix') }}</span><input formControlName="sku_suffix" [placeholder]="adminText('sharedSkuSuffixPlaceholder')" [attr.title]="adminText('sharedSkuSuffixHint')" (input)="updateSharedSkuSuffix(inputValue($event))"></label>
                  <label><span>{{ adminText('skuCode') }}</span><input formControlName="sku_code" [placeholder]="adminText('sharedSkuCodePlaceholder')" [attr.title]="generatedSharedSkuCode() ? adminText('generatedValue', { value: generatedSharedSkuCode() }) : adminText('sharedSkuFormat')" (input)="updateSharedSkuCode(inputValue($event))"></label>
                  <label><span>{{ adminText('priceCents') }}</span><input formControlName="price_cents" inputmode="numeric" [placeholder]="adminText('priceCentsPlaceholder')" required></label>
                  <label><span>{{ adminText('currency') }}</span><input formControlName="currency" [placeholder]="adminText('currencyPlaceholder')"></label>
                  <label><span>{{ adminText('billingCadence') }}</span><select formControlName="billing_cadence" [attr.title]="adminText('billingCadenceHint')" (change)="updateSharedBillingCadence(inputValue($event))"><option *ngFor="let cadence of billingCadenceOptions" [value]="cadence">{{ cadence }}</option></select></label>
                  <label><span>{{ adminText('poolStatus') }}</span><select formControlName="pool_status" [attr.title]="adminText('poolStatusHint')"><option value="ACTIVE">{{ adminText('active') }}</option><option value="PAUSED">{{ adminText('paused') }}</option><option value="REVOKED">{{ adminText('revoked') }}</option></select></label>
                </div>
                <div class="form-grid">
                  <label><span>{{ adminText('skuNameTh') }}</span><input formControlName="sku_name_th" [placeholder]="adminText('skuNameThPlaceholder')"></label>
                  <label><span>{{ adminText('skuNameEn') }}</span><input formControlName="sku_name_en" [placeholder]="adminText('skuNameEnPlaceholder')"></label>
                  <label><span>{{ adminText('poolName') }}</span><input formControlName="pool_name" [placeholder]="adminText('sharedPoolNamePlaceholder')" required (input)="updateSharedPoolName(inputValue($event))"></label>
                </div>
              </section>

              <section class="subscription-setup-section">
                <h3>{{ adminText('productBinding') }}</h3>
                <p class="muted">{{ adminText('subscriptionProductBindingHint') }}</p>
                <div class="system-field">
                  <span>{{ adminText('ownershipRule') }}</span>
                  <strong>{{ adminText('ownershipRuleValue') }}</strong>
                </div>
                <p class="muted">{{ adminText('ownershipRuleHint') }}</p>
              </section>
            </div>
            <div class="inline-actions">
              <button class="btn btn-primary" type="submit">{{ adminText('saveSubscriptionSkuPool') }}</button>
              <button class="btn btn-secondary" type="button" (click)="resetSharedSkuForm()">{{ adminText('clearSetup') }}</button>
            </div>
          </form>

          <section class="sku-media-editor" [ngClass]="{ 'is-disabled': !hasSkuDetailTarget() }">
            <div class="panel-heading compact-heading">
              <h3>{{ adminText('sharedSkuMedia') }}</h3>
              <span class="muted">{{ skuDetailTargetLabel() }}</span>
            </div>
            <p class="muted" *ngIf="!hasSkuDetailTarget()">{{ adminText('selectSharedSkuBeforeMedia') }}</p>
            <form class="stack" [formGroup]="skuDetailForm" (ngSubmit)="saveSkuDetail()">
              <div class="form-grid">
                <label><span>{{ adminText('skuId') }}</span><input formControlName="sku_id" inputmode="numeric" required></label>
                <label><span>{{ adminText('summaryTh') }}</span><input formControlName="summary_th" [placeholder]="adminText('summaryThPlaceholder')"></label>
                <label><span>{{ adminText('summaryEn') }}</span><input formControlName="summary_en" [placeholder]="adminText('summaryEnPlaceholder')"></label>
              </div>
              <div class="media-upload-box">
                <div>
                  <span>{{ adminText('addSharedSkuImages') }}</span>
                  <strong>{{ selectedSkuFileNames() || adminText('noNewFilesSelected') }}</strong>
                </div>
                <div class="media-preview-strip" *ngIf="selectedSkuImageUrls().length">
                  <img *ngFor="let url of selectedSkuImageUrls()" [src]="url" [alt]="adminText('selectedSharedSkuImagePreviewAlt')">
                </div>
                <div class="inline-actions">
                  <input type="file" accept="image/png,image/jpeg,image/webp" multiple [disabled]="!hasSkuDetailTarget()" (change)="selectSkuImages($event)">
                  <button class="btn btn-primary" type="button" *ngIf="selectedSkuImageUrls().length" [disabled]="!hasSkuDetailTarget()" (click)="uploadSkuImages()">{{ adminText('uploadImages') }}</button>
                  <button class="btn btn-secondary" type="button" *ngIf="selectedSkuImageUrls().length" (click)="clearPendingSkuImages()">{{ adminText('clear') }}</button>
                </div>
              </div>
              <div class="linked-media-manager">
                <div class="panel-heading compact-heading">
                  <h3>{{ adminText('linkedMedia') }}</h3>
                  <span class="muted">{{ adminText('imagesCount', { count: linkedSkuMediaItems().length }) }}</span>
                </div>
                <div class="linked-media-grid" *ngIf="linkedSkuMediaItems().length; else noSharedSkuMedia">
                  <div class="linked-media-card" *ngFor="let media of linkedSkuMediaItems(); let index = index">
                    <img *ngIf="mediaUrl(media)" [src]="mediaUrl(media)" [alt]="adminText('linkedSharedSkuMediaAlt')">
                    <strong>#{{ mediaId(media) }}</strong>
                    <div class="inline-actions">
                      <button class="btn btn-secondary" type="button" [disabled]="index === 0" (click)="moveLinkedSkuMedia(index, -1)">{{ adminText('up') }}</button>
                      <button class="btn btn-secondary" type="button" [disabled]="index === linkedSkuMediaItems().length - 1" (click)="moveLinkedSkuMedia(index, 1)">{{ adminText('down') }}</button>
                      <button class="btn btn-danger" type="button" (click)="removeLinkedSkuMedia(index)">{{ adminText('remove') }}</button>
                    </div>
                  </div>
                </div>
                <ng-template #noSharedSkuMedia><p class="muted">{{ adminText('noSharedSkuMediaLinked') }}</p></ng-template>
              </div>
              <details class="detail-drawer">
                <summary>{{ adminText('sharedSkuTextAndSpecs') }}</summary>
                <div class="stack">
                  <div class="form-grid">
                    <label><span>{{ adminText('descriptionTh') }}</span><textarea rows="3" formControlName="description_th" [placeholder]="adminText('descriptionThPlaceholder')"></textarea></label>
                    <label><span>{{ adminText('descriptionEn') }}</span><textarea rows="3" formControlName="description_en" [placeholder]="adminText('descriptionEnPlaceholder')"></textarea></label>
                  </div>
                  <label><span>{{ adminText('specsJson') }}</span><textarea rows="3" formControlName="specs_json" [placeholder]="adminText('specsJsonPlaceholder')"></textarea></label>
                  <label><span>{{ adminText('operatorNotes') }}</span><textarea rows="3" formControlName="operator_notes" [placeholder]="adminText('operatorNotesPlaceholder')"></textarea></label>
                </div>
              </details>
              <button class="btn btn-primary" type="submit" [disabled]="!hasSkuDetailTarget()">{{ adminText('saveSharedSkuMediaDetail') }}</button>
            </form>
          </section>
        </article>
      </div>

      <div *ngSwitchCase="'privilege'" class="content-grid">
        <article class="panel">
          <div class="panel-heading">
            <h2>{{ adminText('accountManagement') }}</h2>
            <button class="btn btn-secondary" type="button" (click)="loadUsers()">{{ i18n.t('common.refresh') }}</button>
          </div>
          <form class="filter-bar compact-filter" [formGroup]="userFilterForm" (ngSubmit)="loadUsers()">
            <label><span>{{ adminText('searchAccounts') }}</span><input formControlName="search" [placeholder]="adminText('searchAccountsPlaceholder')"></label>
            <label><span>{{ adminText('status') }}</span><input formControlName="status" [placeholder]="adminText('accountStatusPlaceholder')"></label>
            <button class="btn btn-secondary" type="submit">{{ adminText('filter') }}</button>
          </form>
          <div class="table-wrap" *ngIf="users().length; else noUsers">
            <table class="data-table">
              <thead><tr><th>{{ adminText('account') }}</th><th>{{ adminText('roles') }}</th><th>{{ adminText('status') }}</th><th></th></tr></thead>
              <tbody>
                <tr *ngFor="let user of users()">
                  <td><strong>{{ cell(user, 'email') }}</strong><span>{{ cell(user, 'display_name,name,id,user_id') }}</span></td>
                  <td>{{ rolesCell(user) }}</td>
                  <td><span class="pill">{{ statusLabel(cell(user, 'status')) }}</span></td>
                  <td class="table-actions">
                    <button class="btn btn-secondary" type="button" (click)="selectUser(user)">{{ adminText('manage') }}</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ng-template #noUsers><p class="muted">{{ adminText('noAccountsLoaded') }}</p></ng-template>
        </article>

        <article class="panel">
          <h2>{{ adminText('privilegesAndLocks') }}</h2>
          <form class="stack" [formGroup]="roleForm" (ngSubmit)="saveUserRoles()">
            <label><span>{{ adminText('userId') }}</span><input formControlName="user_id" inputmode="numeric" required></label>
            <label><span>{{ adminText('roles') }}</span><input formControlName="roles" [placeholder]="adminText('rolesPlaceholder')"></label>
            <label><span>{{ adminText('adminPassword') }}</span><input type="password" formControlName="password" [placeholder]="adminText('adminPasswordPlaceholder')" autocomplete="off"></label>
            <button class="btn btn-primary" type="submit">{{ adminText('updateRoles') }}</button>
          </form>
          <form class="stack admin-subform" [formGroup]="lockForm" (ngSubmit)="lockUser()">
            <label><span>{{ adminText('userId') }}</span><input formControlName="user_id" inputmode="numeric" required></label>
            <label><span>{{ adminText('lockReason') }}</span><textarea rows="3" formControlName="reason" [placeholder]="adminText('lockReasonPlaceholder')" required></textarea></label>
            <label><span>{{ adminText('lockUntil') }}</span><input type="datetime-local" formControlName="until"></label>
            <button class="btn btn-danger" type="submit">{{ adminText('lockAccount') }}</button>
          </form>
        </article>
      </div>

      <div *ngSwitchCase="'reviews'" class="content-grid">
        <article class="panel">
          <div class="panel-heading">
            <h2>{{ adminText('reviewModeration') }}</h2>
            <button class="btn btn-secondary" type="button" (click)="loadReviews()">{{ i18n.t('common.refresh') }}</button>
          </div>
          <div class="list">
            <div class="list-row" *ngFor="let review of reviews()">
              <strong>{{ cell(review, 'title,review_id,id') }}</strong>
              <span>{{ cell(review, 'rating') }}/5 - {{ statusLabel(cell(review, 'status')) }} - {{ cell(review, 'body,comment') }}</span>
              <div class="inline-actions">
                <button class="btn btn-primary" type="button" (click)="approveReview(review)">{{ adminText('approve') }}</button>
                <button class="btn btn-secondary" type="button" (click)="selectReview(review)">{{ adminText('reject') }}</button>
              </div>
            </div>
            <p class="muted" *ngIf="!reviews().length">{{ adminText('noReviewsLoaded') }}</p>
          </div>
        </article>

        <article class="panel">
          <h2>{{ adminText('rejectReview') }}</h2>
          <form class="stack" [formGroup]="reviewRejectForm" (ngSubmit)="rejectReview()">
            <label><span>{{ adminText('reviewId') }}</span><input formControlName="review_id" inputmode="numeric" required></label>
            <label><span>{{ adminText('reason') }}</span><textarea rows="4" formControlName="reason" [placeholder]="adminText('reviewRejectReasonPlaceholder')" required></textarea></label>
            <button class="btn btn-danger" type="submit">{{ adminText('rejectReview') }}</button>
          </form>
        </article>
      </div>

      <div *ngSwitchCase="'settings'" class="content-grid general-settings-grid">
        <article class="panel general-settings-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">{{ adminText('generalSettingsEyebrow') }}</p>
              <h2>{{ adminText('generalSettings') }}</h2>
              <p class="muted">{{ adminText('generalSettingsHint') }}</p>
            </div>
            <button class="btn btn-secondary" type="button" (click)="loadSiteSettings()">{{ i18n.t('common.refresh') }}</button>
          </div>
          <form class="stack general-settings-form" [formGroup]="siteSettingsForm" (ngSubmit)="saveSiteSettings()">
            <div class="form-grid">
              <label><span>{{ adminText('siteName') }}</span><input formControlName="site_name" required></label>
              <label><span>{{ adminText('seoMetaTitle') }}</span><input formControlName="seo_meta_title" required></label>
              <label><span>{{ adminText('contactEmail') }}</span><input type="email" formControlName="contact_email" [placeholder]="adminText('contactEmailPlaceholder')"></label>
              <label><span>{{ adminText('baseCurrency') }}</span>
                <select formControlName="base_currency">
                  <option value="THB">THB - Thai Baht (฿)</option>
                  <option value="USD">USD - US Dollar ($)</option>
                  <option value="EUR">EUR - Euro (€)</option>
                  <option value="JPY">JPY - Japanese Yen (¥)</option>
                  <option value="GBP">GBP - British Pound (£)</option>
                  <option value="SGD">SGD - Singapore Dollar (S$)</option>
                  <option value="CNY">CNY - Chinese Yuan (¥)</option>
                </select>
              </label>
              <label><span>FX Exchange Fee Buffer (%)</span>
                <input type="number" step="0.1" min="0" max="10" formControlName="fx_exchange_fee_percent" placeholder="2.0" required>
              </label>
              <label><span>Min FX Fee Floor (microcredits)</span>
                <input type="number" step="100000" min="0" formControlName="fx_min_fee_microcredits" placeholder="2000000" required>
                <small class="muted" style="margin-top: 0.25rem; font-size: 0.8rem; display: block;">
                  = {{ minFeeUnitsDisplay() }} {{ siteSettingsForm.value.base_currency || 'THB' }} minimum margin protection
                </small>
              </label>
              <label><span>{{ adminText('defaultLocale') }}</span>
                <select formControlName="default_locale">
                  <option value="th">ภาษาไทย (TH)</option>
                  <option value="en">English (EN)</option>
                  <option value="ja">日本語 (JA)</option>
                  <option value="vi">Tiếng Việt (VI)</option>
                </select>
              </label>
              <label><span>{{ adminText('productDefaultPageSize') }}</span><input inputmode="numeric" formControlName="product_page_size"></label>
              <label><span>{{ adminText('allowedPageSizes') }}</span><input formControlName="allowed_page_sizes" [placeholder]="adminText('allowedPageSizesPlaceholder')"></label>
              <label><span>{{ adminText('faviconMediaId') }}</span><input inputmode="numeric" formControlName="favicon_media_id" [placeholder]="adminText('faviconMediaIdPlaceholder')"></label>
            </div>

            <section class="settings-card">
              <div class="panel-heading compact-heading">
                <div>
                  <h3>Multi-Currency Exchange Rates & Volatility Tiers</h3>
                  <p class="muted">Live rates relative to Base Currency (THB) with charm rounding and volatility risk buffers</p>
                </div>
                <button class="btn btn-secondary" type="button" (click)="refreshFxRates()" [disabled]="refreshingFxRates()">
                  {{ refreshingFxRates() ? 'Refreshing...' : 'Refresh Upstream Rates' }}
                </button>
              </div>
              <div class="table-wrap" *ngIf="fxRates().length; else noFxRates">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Currency</th>
                      <th>Mid-Market Rate</th>
                      <th>Customer Rate</th>
                      <th>Fee Buffer</th>
                      <th>Volatility Tier</th>
                      <th>Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr *ngFor="let r of fxRates()">
                      <td><strong>{{ r['currency'] }}</strong></td>
                      <td>{{ r['mid_market_rate'] }}</td>
                      <td><strong style="color: #2563eb;">{{ r['customer_rate'] }}</strong></td>
                      <td>{{ r['fee_percent'] }}%</td>
                      <td><span class="pill">{{ r['volatility_tier'] }}</span></td>
                      <td><small>{{ r['updated_at'] }}</small></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ng-template #noFxRates>
                <p class="muted" style="padding: 1rem;">No FX rates loaded. Click 'Refresh Upstream Rates' to fetch live rates.</p>
              </ng-template>
            </section>

            <section class="settings-card">
              <div class="panel-heading compact-heading"><h3>{{ adminText('announcementBanner') }}</h3><span class="pill">{{ siteSettingsForm.value.announcement_visible ? adminText('visible') : adminText('hidden') }}</span></div>
              <label class="toggle-row"><input type="checkbox" formControlName="announcement_visible"><span>{{ adminText('showAnnouncement') }}</span></label>
              <label><span>{{ adminText('announcementText') }}</span><textarea rows="3" formControlName="announcement_text" [placeholder]="adminText('announcementTextPlaceholder')"></textarea></label>
            </section>

            <section class="settings-card">
              <div class="panel-heading compact-heading"><h3>{{ adminText('socialLinks') }}</h3><span class="muted">{{ adminText('httpsOrHandle') }}</span></div>
              <div class="form-grid">
                <label><span>Facebook</span><input formControlName="social_facebook" placeholder="https://facebook.com/..." /></label>
                <label><span>Instagram</span><input formControlName="social_instagram" placeholder="https://instagram.com/..." /></label>
                <label><span>Line</span><input formControlName="social_line" placeholder="@linehandle" /></label>
                <label><span>X</span><input formControlName="social_x" placeholder="https://x.com/..." /></label>
                <label><span>YouTube</span><input formControlName="social_youtube" placeholder="https://youtube.com/..." /></label>
                <label><span>TikTok</span><input formControlName="social_tiktok" placeholder="https://tiktok.com/..." /></label>
              </div>
            </section>

            <div class="media-upload-box favicon-upload-box">
              <input type="file" accept="image/png,image/jpeg,image/webp,image/x-icon,image/svg+xml" (change)="selectFaviconFile($event)">
              <p><strong>{{ adminText('faviconUpload') }}</strong> {{ selectedFaviconFileName() || adminText('faviconUploadHint') }}</p>
              <img *ngIf="faviconPreviewUrl()" class="favicon-preview" [src]="faviconPreviewUrl()" alt="favicon preview">
              <button class="btn btn-secondary" type="button" (click)="uploadFavicon()" [disabled]="!pendingFaviconFile()">{{ adminText('uploadFavicon') }}</button>
            </div>

            <button class="btn btn-primary" type="submit">{{ adminText('saveGeneralSettings') }}</button>
          </form>
        </article>

        <article class="panel settings-preview-panel">
          <h2>{{ adminText('settingsPreview') }}</h2>
          <div class="announcement-preview" *ngIf="siteSettingsForm.value.announcement_visible">{{ siteSettingsForm.value.announcement_text || adminText('announcementPreviewFallback') }}</div>
          <div class="system-field"><span>{{ adminText('siteName') }}</span><strong>{{ siteSettingsForm.value.site_name }}</strong></div>
          <div class="system-field"><span>{{ adminText('seoMetaTitle') }}</span><strong>{{ siteSettingsForm.value.seo_meta_title }}</strong></div>
          <div class="system-field"><span>{{ adminText('baseCurrency') }}</span><strong>{{ siteSettingsForm.value.base_currency }}</strong></div>
          <div class="system-field"><span>FX Fee Buffer</span><strong>{{ siteSettingsForm.value.fx_exchange_fee_percent }}%</strong></div>
          <div class="system-field"><span>Min FX Fee</span><strong>{{ siteSettingsForm.value.fx_min_fee_microcredits || 2000000 }} microcredits ({{ minFeeUnitsDisplay() }} {{ siteSettingsForm.value.base_currency || 'THB' }})</strong></div>
          <div class="system-field"><span>{{ adminText('defaultLocale') }}</span><strong>{{ siteSettingsForm.value.default_locale }}</strong></div>
          <div class="system-field"><span>{{ adminText('productDefaultPageSize') }}</span><strong>{{ siteSettingsForm.value.product_page_size }}</strong></div>
        </article>
      </div>

      <div *ngSwitchCase="'media'" class="content-grid">
        <article class="panel output-panel">
          <div class="panel-heading">
            <h2>{{ adminText('mediaLibrary') }}</h2>
            <button class="btn btn-secondary" type="button" (click)="loadMedia()">{{ i18n.t('common.refresh') }}</button>
          </div>
          <div class="table-wrap" *ngIf="media().length; else noMedia">
            <table class="data-table">
              <thead><tr><th>{{ adminText('media') }}</th><th>{{ adminText('kind') }}</th><th>{{ adminText('size') }}</th><th></th></tr></thead>
              <tbody>
                <tr *ngFor="let item of media()">
                  <td><strong>{{ cell(item, 'filename,storage_key,id,media_id') }}</strong><span>{{ cell(item, 'public_url,sha256') }}</span></td>
                  <td>{{ cell(item, 'kind,mime') }}</td>
                  <td>{{ cell(item, 'size_bytes') }}</td>
                  <td class="table-actions"><button class="btn btn-danger" type="button" (click)="deleteMedia(item)">{{ adminText('delete') }}</button></td>
                </tr>
              </tbody>
            </table>
          </div>
          <ng-template #noMedia><p class="muted">{{ adminText('noMediaRowsLoaded') }}</p></ng-template>
        </article>

        <article class="panel">
          <h2>{{ adminText('webhookIngress') }}</h2>
          <p class="muted">{{ adminText('webhookIngressHint') }}</p>
          <code *ngFor="let route of webhookRoutes()">{{ route }}</code>
        </article>
      </div>

      <div *ngSwitchCase="'audit'" class="content-grid">
        <article class="panel">
          <div class="panel-heading">
            <h2>{{ adminText('auditLog') }}</h2>
            <button class="btn btn-secondary" type="button" (click)="loadAuditLog()">{{ i18n.t('common.refresh') }}</button>
          </div>
          <form class="filter-bar compact-filter" [formGroup]="auditFilterForm" (ngSubmit)="loadAuditLog()">
            <label><span>{{ adminText('since') }}</span><input type="datetime-local" formControlName="since"></label>
            <label><span>{{ adminText('limit') }}</span><input inputmode="numeric" formControlName="limit" [placeholder]="adminText('limitPlaceholder')"></label>
            <button class="btn btn-secondary" type="submit">{{ adminText('filter') }}</button>
          </form>
          <div class="list">
            <div class="list-row" *ngFor="let item of auditLog()">
              <strong>{{ cell(item, 'action') }}</strong>
              <span>{{ cell(item, 'target_type') }} {{ cell(item, 'target_id') }} - {{ cell(item, 'created_at') }}</span>
            </div>
            <p class="muted" *ngIf="!auditLog().length">{{ adminText('noAuditRowsLoaded') }}</p>
          </div>
        </article>

        <article class="panel danger-panel">
          <h2>{{ adminText('envelopeKeyRotation') }}</h2>
          <form class="stack" [formGroup]="kekForm" (ngSubmit)="rotateKek()">
            <label><span>{{ adminText('newKekId') }}</span><input formControlName="new_kek_id" [placeholder]="adminText('newKekIdPlaceholder')" required></label>
            <label><span>{{ adminText('rootPassword') }}</span><input type="password" formControlName="password" [placeholder]="adminText('adminPasswordPlaceholder')" autocomplete="off"></label>
            <button class="btn btn-danger" type="submit">{{ adminText('startRotation') }}</button>
          </form>
        </article>
      </div>
    </section>
  `,
})
export class AdminPageComponent implements OnInit {
  public readonly version = '2.25.1';

  protected readonly i18n = inject(I18nLoader);
  protected readonly auth = inject(AuthUiService);
  private readonly admin = inject(AdminUiService);
  private readonly dashboardUi = inject(AdminDashboardUiService);
  private readonly mediaApi = inject(MediaUiService);
  protected readonly moneyScarpGateway = inject(MoneyScarpAdminUiService);
  protected readonly paypalGateway = inject(PaypalAdminUiService);
  protected readonly trueMoneyGateway = inject(TrueMoneyAdminUiService);
  private readonly seo = inject(SeoService);
  private readonly fb = inject(FormBuilder);

  protected readonly tabs: AdminTab[] = [
    { id: 'overview', label: 'Overview', hint: 'Live queues' },
    { id: 'catalog', label: 'Catalog', hint: 'Products and categories' },
    { id: 'inventory', label: 'Inventory', hint: 'Stock controls' },
    { id: 'orders', label: 'Orders', hint: 'Fulfillment and refunds' },
    { id: 'payments', label: 'Payments', hint: 'Deposits & accounts' },
    { id: 'subscriptions', label: 'Subscriptions', hint: 'Vaulted accounts' },
    { id: 'settings', label: 'Settings', hint: 'Global site config' },
    { id: 'privilege', label: 'Privilege', hint: 'Account management' },
    { id: 'reviews', label: 'Reviews', hint: 'Moderation' },
    { id: 'media', label: 'Media', hint: 'Uploads' },
    { id: 'audit', label: 'Audit', hint: 'Security log' },
  ];
  protected readonly paymentGatewayTabs: PaymentGatewayTab[] = [
    { id: 'MONEY_SCARP', labelKey: 'moneyScarpGateway', hintKey: 'moneyScarpGatewayHint' },
    { id: 'PAYPAL', labelKey: 'paypalGateway', hintKey: 'paypalGatewayHint' },
    { id: 'TRUEMONEY', labelKey: 'trueMoneyGateway', hintKey: 'trueMoneyGatewayHint' },
  ];

  protected readonly activeTab = signal<AdminTabId>('overview');
  protected readonly activePaymentGateway = signal<PaymentGatewayId>('MONEY_SCARP');
  protected readonly activeGatewayDetail = signal<PaymentGatewayDetail>('ROOT');
  protected readonly loading = signal('');
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly webhookRoutes = signal<string[]>([]);
  protected readonly selectedProductFileNames = signal('');
  protected readonly selectedProductImageUrls = signal<string[]>([]);
  protected readonly linkedProductMediaItems = signal<AdminRow[]>([]);
  protected readonly selectedCategoryFileNames = signal('');
  protected readonly selectedCategoryImageUrls = signal<string[]>([]);
  protected readonly linkedCategoryMediaItem = signal<AdminRow | null>(null);
  protected readonly selectedSkuFileNames = signal('');
  protected readonly selectedSkuImageUrls = signal<string[]>([]);
  protected readonly linkedSkuMediaItems = signal<AdminRow[]>([]);
  protected readonly skuDrafts = signal<AdminSkuDraft[]>([]);
  protected readonly skuSearchTerm = signal('');
  protected readonly skuSearchResults = signal<AdminRow[]>([]);
  protected readonly skuSearchBusy = signal(false);
  protected readonly productSearch = signal('');
  protected readonly productPage = signal(1);
  protected readonly productPageSize = signal(10);
  protected readonly selectedInventoryItem = signal<AdminRow | null>(null);
  protected readonly inventorySearch = signal('');
  protected readonly inventoryStockView = signal<InventoryStockView>('ALL');
  protected readonly inventoryPage = signal(1);
  protected readonly inventoryPageSize = signal(10);
  protected readonly digitalPoolUnits = signal<AdminRow[]>([]);
  protected readonly sharedSkuSearch = signal('');
  protected readonly selectedSharedSkuId = signal('');
  protected readonly selectedSharedAccountId = signal('');
  protected readonly generatedPrivateSkuCode = signal('');
  protected readonly generatedSharedSkuCode = signal('');
  protected readonly billingCadenceOptions = Array.from({ length: 24 }, (_, index) => `${index + 1}M`);
  protected readonly thaiBankCodes = [
    { code: 'KBANK', key: 'bankKBANK' },
    { code: 'SCB', key: 'bankSCB' },
    { code: 'BBL', key: 'bankBBL' },
    { code: 'KTB', key: 'bankKTB' },
    { code: 'TMBTHANACHART', key: 'bankTMBTHANA' },
    { code: 'BAY', key: 'bankBAY' },
    { code: 'TBANK', key: 'bankTBANK' },
    { code: 'GSB', key: 'bankGSB' },
    { code: 'BAAC', key: 'bankBAAC' },
    { code: 'CIMB', key: 'bankCIMB' },
    { code: 'UOB', key: 'bankUOB' },
    { code: 'LHBANK', key: 'bankLHBANK' },
  ];
  private readonly pendingProductImageFiles = signal<File[]>([]);
  private readonly pendingCategoryImageFiles = signal<File[]>([]);
  private readonly pendingSkuImageFiles = signal<File[]>([]);

  protected readonly products = signal<AdminRow[]>([]);
  protected readonly categories = signal<AdminRow[]>([]);
  protected readonly inventory = signal<AdminRow[]>([]);
  protected readonly orders = signal<AdminRow[]>([]);
  protected readonly deposits = signal<AdminRow[]>([]);
  protected readonly webhookEvents = signal<AdminRow[]>([]);
  protected readonly webhookIpAllowlist = signal<AdminRow[]>([]);
  protected readonly editingWebhookIpAllowlistId = signal('');
  protected readonly selectedWebhookEvent = signal<AdminRow | null>(null);
  protected readonly webhookSearch = signal('');
  protected readonly webhookFromDate = signal('');
  protected readonly webhookToDate = signal('');
  protected readonly webhookStatusFilter = signal('ALL');
  protected readonly webhookMismatchFilter = signal<WebhookMismatchFilter>('ALL');
  protected readonly destinationAccounts = signal<AdminRow[]>([]);
  protected readonly editingDestinationAccountId = signal<string>('');
  protected readonly showDestinationForm = signal(false);
  protected readonly destinationFormType = signal<'BANK_TRANSFER' | 'PROMPTPAY'>('BANK_TRANSFER');
  protected readonly subscriptions = signal<AdminRow[]>([]);
  protected readonly sharedAccountPools = signal<AdminRow[]>([]);
  protected readonly users = signal<AdminRow[]>([]);
  protected readonly reviews = signal<AdminRow[]>([]);
  protected readonly media = signal<AdminRow[]>([]);
  protected readonly auditLog = signal<AdminRow[]>([]);
  protected readonly siteSettings = signal<AdminRow[]>([]);
  protected readonly paymentModules = signal<PaymentModuleRegisterInfo[]>([]);
  protected readonly paymentBootInfo = signal<SystemBootInfo | null>(null);
  protected readonly showAssignCountryModal = signal(false);
  protected readonly selectedPaymentModule = signal<PaymentModuleRegisterInfo | null>(null);
  protected readonly pendingFaviconFile = signal<File | null>(null);
  protected readonly selectedFaviconFileName = signal('');
  protected readonly faviconPreviewUrl = signal('');
  protected readonly filteredProducts = computed(() => this.products().filter((row) => this.productRowMatches(row)));
  protected readonly productTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredProducts().length / this.productPageSize())));
  protected readonly productSafePage = computed(() => Math.min(this.productPage(), this.productTotalPages()));
  protected readonly pagedProducts = computed(() => {
    const start = (this.productSafePage() - 1) * this.productPageSize();
    return this.filteredProducts().slice(start, start + this.productPageSize());
  });
  protected readonly productPageStart = computed(() => this.filteredProducts().length ? ((this.productSafePage() - 1) * this.productPageSize()) + 1 : 0);
  protected readonly productPageEnd = computed(() => Math.min(this.productSafePage() * this.productPageSize(), this.filteredProducts().length));
  protected readonly filteredWebhookEvents = computed(() => this.webhookEvents().filter((row) => this.webhookRowMatches(row)));
  protected readonly webhookMatchedCount = computed(() => this.webhookEvents().filter((row) => this.webhookReconciliationState(row) === 'MATCHED').length);
  protected readonly webhookMismatchCount = computed(() => this.webhookEvents().filter((row) => this.webhookReconciliationState(row) === 'MISMATCH').length);
  protected readonly webhookPendingCount = computed(() => this.webhookEvents().filter((row) => this.webhookReconciliationState(row) === 'PENDING').length);
  protected readonly filteredInventory = computed(() => this.inventory().filter((row) => this.inventoryRowMatches(row)));
  protected readonly inventoryTotalPages = computed(() => Math.max(1, Math.ceil(this.filteredInventory().length / this.inventoryPageSize())));
  protected readonly inventorySafePage = computed(() => Math.min(this.inventoryPage(), this.inventoryTotalPages()));
  protected readonly pagedInventory = computed(() => {
    const start = (this.inventorySafePage() - 1) * this.inventoryPageSize();
    return this.filteredInventory().slice(start, start + this.inventoryPageSize());
  });
  protected readonly inventoryPageStart = computed(() => this.filteredInventory().length ? ((this.inventorySafePage() - 1) * this.inventoryPageSize()) + 1 : 0);
  protected readonly inventoryPageEnd = computed(() => Math.min(this.inventorySafePage() * this.inventoryPageSize(), this.filteredInventory().length));
  private readonly dashboardSnapshot = signal<ReturnType<AdminDashboardUiService['build']> | null>(null);
  protected readonly dashboard = computed(() => this.dashboardSnapshot() ?? this.dashboardUi.build({
    products: this.products(),
    inventory: this.inventory(),
    orders: this.orders(),
    deposits: this.deposits(),
    subscriptions: this.subscriptions(),
    sharedAccountPools: this.sharedAccountPools(),
    users: this.users(),
    reviews: this.reviews(),
    media: this.media(),
    auditLog: this.auditLog(),
  }));

  protected readonly productForm = this.fb.group({
    id: [''],
    slug: [''],
    product_type: ['PHYSICAL'],
    category_id: [''],
    locale: [this.i18n.currentLocale(), Validators.required],
    price_cents: [''],
    currency: ['THB'],
    name_th: [''],
    name_en: [''],
    description_th: [''],
    description_en: [''],
    digital_delivery_type: ['CODE'],
    digital_activation_url_template: [''],
    digital_code_prefix: ['KPB'],
    digital_instructions_th: [''],
    digital_instructions_en: [''],
    media_ids: [''],
    payload: ['{}', Validators.required],
  });

  protected readonly categoryForm = this.fb.group({
    id: [''],
    slug: [''],
    locale: [this.i18n.currentLocale(), Validators.required],
    status: ['ACTIVE'],
    name_th: [''],
    name_en: [''],
    description_th: [''],
    description_en: [''],
    image_media_id: [''],
    payload: ['{}', Validators.required],
  });

  protected readonly siteSettingsForm = this.fb.group({
    site_name: ['Khun Phor Baan', Validators.required],
    seo_meta_title: ['Khun Phor Baan', Validators.required],
    contact_email: [''],
    base_currency: ['THB', Validators.required],
    default_locale: ['th', Validators.required],
    favicon_media_id: [''],
    product_page_size: ['12', Validators.required],
    allowed_page_sizes: ['12,24,48'],
    announcement_visible: [false],
    announcement_text: [''],
    social_facebook: [''],
    social_instagram: [''],
    social_line: [''],
    social_x: [''],
    social_youtube: [''],
    social_tiktok: [''],
    fx_exchange_fee_percent: ['2.0', [Validators.required, Validators.min(0), Validators.max(10)]],
    fx_min_fee_microcredits: ['2000000', [Validators.required, Validators.min(0)]],
  });

  protected readonly fxRates = signal<AdminRow[]>([]);
  protected readonly refreshingFxRates = signal(false);

  protected readonly inventoryForm = this.fb.group({
    sku_id: ['', Validators.required],
    delta: ['0', Validators.required],
    reason: ['', Validators.required],
  });

  protected readonly privateSkuForm = this.fb.group({
    sku_id: [''],
    product_id: [''],
    fulfillment_type: ['PHYSICAL', Validators.required],
    brand: [''],
    sku_suffix: [''],
    digital_sku_kind: ['CDKEY'],
    sku_code: [''],
    status: ['ACTIVE'],
    low_stock_threshold: ['0'],
    name_th: [''],
    name_en: [''],
    price_cents: ['0'],
    currency: ['THB'],
  });

  protected readonly skuDetailForm = this.fb.group({
    sku_id: ['', Validators.required],
    summary_th: [''],
    summary_en: [''],
    description_th: [''],
    description_en: [''],
    usage_th: [''],
    usage_en: [''],
    warranty_th: [''],
    warranty_en: [''],
    specs_json: ['{}'],
    operator_notes: [''],
    media_ids: [''],
  });

  protected readonly digitalUnitsForm = this.fb.group({
    sku_id: ['', Validators.required],
    pool_name: [''],
    unit_type: ['CODE'],
    unit_values: ['', Validators.required],
  });

  protected readonly physicalUnitsForm = this.fb.group({
    sku_id: ['', Validators.required],
    count: ['1', Validators.required],
    prefix: ['PHY'],
  });

  protected readonly orderFilterForm = this.fb.group({
    search: [''],
    status: [''],
  });

  protected readonly refundForm = this.fb.group({
    order_id: ['', Validators.required],
    amount_cents: [''],
    reason: ['', Validators.required],
    password: [''],
  });

  protected readonly depositForm = this.fb.group({
    deposit_id: ['', Validators.required],
    order_id: ['', Validators.required],
    note: [''],
    password: [''],
  });

  protected readonly depositRejectForm = this.fb.group({
    deposit_id: ['', Validators.required],
    reason: ['', Validators.required],
  });

  protected readonly webhookIpAllowlistForm = this.fb.group({
    id: [''],
    provider: ['proxy-bank', Validators.required],
    label: ['', Validators.required],
    cidr: ['', Validators.required],
    status: ['ACTIVE', Validators.required],
    note: [''],
  });

  protected readonly destinationAccountForm = this.fb.group({
    account_type: ['BANK_TRANSFER', Validators.required],
    bank_code: [''],
    bank_name: [''],
    account_number: ['', Validators.required],
    account_name: ['', Validators.required],
    promptpay_type: ['PHONE'],
    display_label: [''],
    priority: ['0'],
  });

  protected readonly sharedAccountForm = this.fb.group({
    id: [''],
    sku_id: ['', Validators.required],
    vendor: ['', Validators.required],
    capacity: ['1', Validators.required],
    status: ['ACTIVE'],
    expires_at: [''],
    metadata: ['{}'],
  });

  protected readonly sharedSkuForm = this.fb.group({
    sku_id: [''],
    brand: [''],
    sku_suffix: [''],
    sku_code: [''],
    sku_name_th: [''],
    sku_name_en: [''],
    price_cents: ['0', Validators.required],
    currency: ['THB'],
    billing_cadence: ['1M'],
    pool_name: ['', Validators.required],
    pool_status: ['ACTIVE'],
  });

  protected readonly credentialForm = this.fb.group({
    id: ['', Validators.required],
    credential_username: [''],
    credential_secret: ['', Validators.required],
    credential_notes: [''],
    reason: ['credential_rotation', Validators.required],
    password: [''],
  });

  protected readonly userFilterForm = this.fb.group({
    search: [''],
    status: [''],
  });

  protected readonly roleForm = this.fb.group({
    user_id: ['', Validators.required],
    roles: ['customer', Validators.required],
    password: [''],
  });

  protected readonly lockForm = this.fb.group({
    user_id: ['', Validators.required],
    reason: ['', Validators.required],
    until: [''],
  });

  protected readonly reviewRejectForm = this.fb.group({
    review_id: ['', Validators.required],
    reason: ['', Validators.required],
  });

  protected readonly auditFilterForm = this.fb.group({
    since: [''],
    limit: ['50'],
  });

  protected readonly kekForm = this.fb.group({
    new_kek_id: ['', Validators.required],
    password: [''],
  });

  protected readonly assignCountryForm = this.fb.group({
    provider_code: ['', Validators.required],
    country_code: ['', [Validators.required, Validators.maxLength(10)]],
    currency_code: ['', [Validators.required, Validators.maxLength(10)]],
    fee_bps: [200, [Validators.required, Validators.min(0)]],
    min_amount_microcredits: [1000000],
    max_amount_microcredits: [100000000000],
    fixed_fee_microcredits: [0],
  });

  async ngOnInit(): Promise<void> {
    if (!this.skuDrafts().length) this.skuDrafts.set([this.defaultSkuDraft()]);
    this.seo.setPage({
      title: this.i18n.t('admin.title'),
      description: this.i18n.t('admin.description'),
      path: `/${this.i18n.currentLocale()}/privilege`,
      noindex: true,
    });
    this.webhookRoutes.set(this.admin.webhookRoutesAreBackendOnly());
    await Promise.allSettled([this.refreshOverview(), this.loadPaymentModules(false)]);
  }

  protected async openTab(tab: AdminTabId): Promise<void> {
    this.activeTab.set(tab);
    if (tab === 'catalog' && (!this.products().length || !this.categories().length)) {
      await Promise.allSettled([this.loadProducts(), this.loadCategories(false), this.loadSharedAccountPools(false)]);
    }
    if (tab === 'inventory' && !this.inventory().length) await this.loadInventory();
    if (tab === 'orders' && !this.orders().length) await this.loadOrders();
    if (tab === 'payments') {
      await Promise.allSettled([
        this.loadDeposits(),
        this.loadWebhookEvents(false),
        this.loadWebhookIpAllowlist(false),
        this.loadDestinationAccounts(false),
        this.loadPaymentModules(false),
      ]);
    }
    if (tab === 'settings' && !this.siteSettings().length) await this.loadSiteSettings();
    if (tab === 'subscriptions' && (!this.sharedAccountPools().length || !this.subscriptions().length)) {
      await Promise.allSettled([
        this.loadProducts(false),
        this.loadSharedAccountPools(),
        this.loadSubscriptions(false),
      ]);
    }
    if (tab === 'privilege' && !this.users().length) await this.loadUsers();
    if (tab === 'reviews' && !this.reviews().length) await this.loadReviews();
    if (tab === 'media' && !this.media().length) await this.loadMedia();
    if (tab === 'audit' && !this.auditLog().length) await this.loadAuditLog();
  }

  protected tabLabel(tab: AdminTabId): string {
    return this.i18n.t(`admin.tabs.${tab}`);
  }

  protected tabHint(tab: AdminTabId): string {
    return this.i18n.t(`admin.hints.${tab}`);
  }

  protected loadingLabel(): string {
    const value = loadingToTabId(this.loading());
    return value ? this.tabLabel(value) : this.loading();
  }

  protected adminText(key: string, params: Record<string, string | number> = {}): string {
    return this.i18n.t(`admin.ui.${key}`, params);
  }

  protected statusLabel(value: string): string {
    const normalized = value.trim().toUpperCase();
    if (!normalized || normalized === '-') return value;
    const translated = this.i18n.t(`status.${normalized}`);
    return translated === `status.${normalized}` ? value : translated;
  }

  protected dashboardMetricValue(metric: AdminDashboardMetric): string {
    if (metric.kind === 'money') return formatMoney(metric.value, this.baseCurrency(), this.i18n.angularLocale());
    if (metric.kind === 'percent') return `${this.dashboardNumber(metric.value * 100)}%`;
    return this.dashboardNumber(metric.value);
  }

  protected dashboardNumber(value: number): string {
    return new Intl.NumberFormat(this.i18n.angularLocale(), { maximumFractionDigits: 1 }).format(value);
  }

  protected dashboardStatusLabel(status: string): string {
    return this.adminText(`dashboardStatus${status.charAt(0).toUpperCase()}${status.slice(1)}`);
  }

  protected dashboardSeverityLabel(severity: string): string {
    return this.adminText(`dashboardSeverity${severity.charAt(0).toUpperCase()}${severity.slice(1)}`);
  }

  protected dashboardBarWidth(point: AdminDashboardSeriesPoint, series: AdminDashboardSeries): number {
    const max = Math.max(1, ...series.points.map((candidate) => candidate.value));
    return Math.max(point.value > 0 ? 6 : 0, Math.round((point.value / max) * 100));
  }

  protected updateProductSearch(value: string): void {
    this.productSearch.set(value);
    this.productPage.set(1);
  }

  protected updateProductPageSize(value: string): void {
    const next = [10, 20, 50].includes(Number(value)) ? Number(value) : 10;
    this.productPageSize.set(next);
    this.productPage.set(1);
  }

  protected clearProductFilters(): void {
    this.productSearch.set('');
    this.productPage.set(1);
  }

  protected previousProductPage(): void {
    this.productPage.set(Math.max(1, this.productSafePage() - 1));
  }

  protected nextProductPage(): void {
    this.productPage.set(Math.min(this.productTotalPages(), this.productSafePage() + 1));
  }

  protected productSkuCount(row: AdminRow): number {
    return this.skusFromRow(row).length;
  }

  protected updateInventorySearch(value: string): void {
    this.inventorySearch.set(value);
    this.inventoryPage.set(1);
  }

  protected updateInventoryStockView(value: string): void {
    const next = ['ALL', 'RISK', 'OUT', 'LOW', 'DIGITAL', 'PHYSICAL'].includes(value) ? value as InventoryStockView : 'ALL';
    this.inventoryStockView.set(next);
    this.inventoryPage.set(1);
  }

  protected updateInventoryPageSize(value: string): void {
    const next = [10, 20, 50].includes(Number(value)) ? Number(value) : 10;
    this.inventoryPageSize.set(next);
    this.inventoryPage.set(1);
  }

  protected clearInventoryFilters(): void {
    this.inventorySearch.set('');
    this.inventoryStockView.set('ALL');
    this.inventoryPage.set(1);
  }

  protected previousInventoryPage(): void {
    this.inventoryPage.set(Math.max(1, this.inventorySafePage() - 1));
  }

  protected nextInventoryPage(): void {
    this.inventoryPage.set(Math.min(this.inventoryTotalPages(), this.inventorySafePage() + 1));
  }

  protected updateWebhookSearch(value: string): void {
    this.webhookSearch.set(value.trim());
  }

  protected updateWebhookFromDate(value: string): void {
    this.webhookFromDate.set(value);
  }

  protected updateWebhookToDate(value: string): void {
    this.webhookToDate.set(value);
  }

  protected updateWebhookStatusFilter(value: string): void {
    this.webhookStatusFilter.set(value || 'ALL');
  }

  protected updateWebhookMismatchFilter(value: string): void {
    this.webhookMismatchFilter.set(['ALL', 'MATCHED', 'MISMATCH', 'PENDING'].includes(value) ? value as WebhookMismatchFilter : 'ALL');
  }

  protected clearWebhookFilters(): void {
    this.webhookSearch.set('');
    this.webhookFromDate.set('');
    this.webhookToDate.set('');
    this.webhookStatusFilter.set('ALL');
    this.webhookMismatchFilter.set('ALL');
  }

  protected setInventoryDelta(delta: number): void {
    this.inventoryForm.patchValue({ delta: String(delta) });
  }

  protected inventoryAvailableValue(row: AdminRow): string {
    const explicit = this.firstValue(row, 'available,stock_available');
    if (explicit !== undefined && explicit !== null && explicit !== '') return String(explicit);
    const onHand = this.numberOrDefault(this.firstValue(row, 'on_hand,qty'), 0);
    const reserved = this.numberOrDefault(this.firstValue(row, 'reserved,reserved_qty'), 0);
    return String(onHand - reserved);
  }

  protected async refreshOverview(): Promise<void> {
    this.clearNotices();
    this.loading.set('overview');
    const results = await Promise.allSettled([
      this.loadDashboardSnapshot(false),
      this.loadProducts(false),
      this.loadCategories(false),
      this.loadInventory(false),
      this.loadOrders(false),
      this.loadDeposits(false),
      this.loadSharedAccountPools(false),
      this.loadSubscriptions(false),
      this.loadUsers(false),
      this.loadReviews(false),
      this.loadMedia(false),
      this.loadAuditLog(false),
    ]);
    this.loading.set('');
    if (results.every((result) => result.status === 'rejected')) {
      this.error.set(this.adminText('unableToLoadOverview'));
    }
  }

  protected loadProducts(report = true): Promise<void> {
    return this.loadRows(this.adminText('products'), () => this.admin.listProducts({ locale: this.i18n.currentLocale(), limit: 50 }), this.products, report);
  }

  protected async loadDashboardSnapshot(report = true): Promise<void> {
    if (report) {
      this.clearNotices();
      this.loading.set(this.adminText('businessDashboard'));
    }
    try {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      const snapshot = this.dashboardUi.fromBackendSnapshot(await this.admin.getDashboardSnapshot({
        from: from.toISOString(),
        to: to.toISOString(),
        granularity: 'day',
      }));
      this.dashboardSnapshot.set(snapshot);
      if (!snapshot && report) this.error.set(this.adminText('unableToLoadOverview'));
    } catch (error) {
      this.dashboardSnapshot.set(null);
      if (report) this.error.set(this.errorText(error));
      throw error;
    } finally {
      if (report) this.loading.set('');
    }
  }

  protected loadCategories(report = true): Promise<void> {
    return this.loadRows(this.adminText('categories'), () => this.admin.listCategories({ locale: this.i18n.currentLocale(), limit: 50 }), this.categories, report);
  }

  protected async loadSiteSettings(report = true): Promise<void> {
    await this.loadRows(this.adminText('generalSettings'), () => this.admin.getSiteSettings(), this.siteSettings, report);
    this.patchSiteSettingsForm(this.siteSettings());
    await this.loadFxRates();
  }

  protected async loadFxRates(): Promise<void> {
    try {
      const res = this.recordValue(await this.admin.getFxRates());
      const rates = Array.isArray(res['rates']) ? (res['rates'] as AdminRow[]) : [];
      this.fxRates.set(rates);
      const minFee = res['min_fee_microcredits'] !== undefined ? Number(res['min_fee_microcredits']) : undefined;
      cacheFxRates(rates as any, minFee);
    } catch {
      this.fxRates.set([]);
    }
  }

  protected async refreshFxRates(): Promise<void> {
    this.refreshingFxRates.set(true);
    try {
      await this.admin.refreshFxRates();
      await this.loadFxRates();
      this.message.set('FX exchange rates updated successfully.');
    } catch (e) {
      this.error.set(apiErrorMessage(e));
    } finally {
      this.refreshingFxRates.set(false);
    }
  }

  protected loadInventory(report = true): Promise<void> {
    return this.loadRows(this.adminText('inventory'), () => this.admin.listInventory({ limit: 100 }), this.inventory, report);
  }

  protected loadDigitalPoolUnits(report = true): Promise<void> {
    const selected = this.selectedInventoryItem();
    const skuId = selected ? this.rowId(selected, 'sku_id,id') : '';
    if (!skuId || !selected || !this.isDigitalInventoryItem(selected)) {
      this.digitalPoolUnits.set([]);
      return Promise.resolve();
    }
    return this.loadRows(this.adminText('digitalPoolItems'), () => this.admin.listDigitalPoolUnits({ sku_id: skuId, limit: 200 }), this.digitalPoolUnits, report);
  }

  protected loadOrders(report = true): Promise<void> {
    const raw = this.orderFilterForm.getRawValue();
    return this.loadRows(this.adminText('orders'), () => this.admin.listOrders({
      search: raw.search ?? '',
      status: raw.status ?? '',
      limit: 100,
    }), this.orders, report);
  }

  protected loadDeposits(report = true): Promise<void> {
    return this.loadRows(this.adminText('deposits'), () => this.admin.listDeposits({ limit: 100 }), this.deposits, report);
  }

  protected loadWebhookEvents(report = true): Promise<void> {
    return this.loadRows(this.adminText('webhookAuditLog'), () => this.admin.listWebhookEvents({ limit: 100 }), this.webhookEvents, report);
  }

  protected loadWebhookIpAllowlist(report = true): Promise<void> {
    return this.loadRows(this.adminText('webhookIpAllowlist'), () => this.admin.listWebhookIpAllowlist({ limit: 200 }), this.webhookIpAllowlist, report);
  }

  protected loadDestinationAccounts(report = true): Promise<void> {
    return this.loadRows(this.adminText('moneyScarpBankAccounts'), () => this.moneyScarpGateway.listBankAccounts({ limit: 100 }), this.destinationAccounts, report);
  }

  protected async loadPaymentModules(report = false): Promise<void> {
    try {
      const res = await this.admin.listPaymentModules();
      if (!res) return;
      const data = res as any;
      const boot = data.boot_info ?? data.data?.boot_info ?? null;
      const modules = Array.isArray(data)
        ? data
        : (data.modules ?? data.data?.modules ?? data.data ?? []);
      this.paymentBootInfo.set(boot);
      this.paymentModules.set(modules);
      if (report) {
        this.message.set(this.i18n.currentLocale() === 'th' ? 'อัปเดตข้อมูล Payment Module Registry และ System Boot สำเร็จ' : 'Payment module registry & boot diagnostics refreshed');
      }
    } catch (err) {
      console.error('Failed to load payment modules:', err);
    }
  }

  protected async togglePaymentModule(mod: PaymentModuleRegisterInfo, cfg: PaymentModuleDbConfig): Promise<void> {
    try {
      await this.admin.togglePaymentModule({
        provider_code: cfg.provider_code,
        country_code: cfg.country_code,
        is_enabled: !cfg.is_enabled,
      });
      this.message.set(
        this.i18n.currentLocale() === 'th'
          ? `เปลี่ยนสถานะ ${cfg.provider_code} (${cfg.country_code}) เป็น ${!cfg.is_enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'} แล้ว`
          : `Toggled ${cfg.provider_code} (${cfg.country_code}) to ${!cfg.is_enabled ? 'ACTIVE' : 'DISABLED'}`
      );
      await this.loadPaymentModules(false);
    } catch (err: any) {
      this.error.set(this.errorText(err));
    }
  }

  protected openAssignCountryModal(preselectProvider = ''): void {
    if (preselectProvider) {
      this.assignCountryForm.patchValue({ provider_code: preselectProvider });
    }
    this.showAssignCountryModal.set(true);
  }

  protected closeAssignCountryModal(): void {
    this.showAssignCountryModal.set(false);
  }

  protected async submitAssignCountry(): Promise<void> {
    if (this.assignCountryForm.invalid) {
      this.error.set(this.i18n.currentLocale() === 'th' ? 'กรุณากรอกข้อมูลการกำหนดประเทศให้ครบถ้วน' : 'Please complete all required country assignment fields');
      return;
    }
    const val = this.assignCountryForm.getRawValue();
    try {
      await this.admin.assignPaymentModuleCountry({
        provider_code: String(val.provider_code),
        country_code: String(val.country_code).toUpperCase(),
        currency_code: String(val.currency_code).toUpperCase(),
        min_amount_microcredits: Number(val.min_amount_microcredits) || 1000000,
        max_amount_microcredits: Number(val.max_amount_microcredits) || 100000000000,
        fee_bps: Number(val.fee_bps) || 200,
        fixed_fee_microcredits: Number(val.fixed_fee_microcredits) || 0,
        is_enabled: true,
      });
      this.message.set(
        this.i18n.currentLocale() === 'th'
          ? `กำหนดโมดูล ${val.provider_code} ให้ประเทศ ${val.country_code} (${val.currency_code}) สำเร็จ`
          : `Assigned module ${val.provider_code} to ${val.country_code} (${val.currency_code}) successfully`
      );
      this.showAssignCountryModal.set(false);
      this.assignCountryForm.reset({
        provider_code: '',
        country_code: '',
        currency_code: '',
        min_amount_microcredits: 1000000,
        max_amount_microcredits: 100000000000,
        fee_bps: 200,
        fixed_fee_microcredits: 0,
      });
      await this.loadPaymentModules(false);
    } catch (err: any) {
      this.error.set(this.errorText(err));
    }
  }

  protected async refreshActivePaymentGateway(): Promise<void> {
    if (this.activePaymentGateway() === 'MONEY_SCARP') {
      await this.loadDestinationAccounts();
      return;
    }
    this.message.set(this.adminText('gatewayScaffoldOnly'));
  }

  protected selectPaymentGateway(gateway: PaymentGatewayId): void {
    this.activePaymentGateway.set(gateway);
    this.activeGatewayDetail.set('ROOT');
    this.showDestinationForm.set(false);
    this.editingDestinationAccountId.set('');
    if (gateway === 'MONEY_SCARP' && !this.destinationAccounts().length) {
      void this.loadDestinationAccounts(false);
    }
  }

  protected openGatewayDetail(detail: PaymentGatewayDetail): void {
    this.activeGatewayDetail.set(detail);
    this.showDestinationForm.set(false);
    this.editingDestinationAccountId.set('');
    void this.loadDestinationAccounts(false);
  }

  protected backToDepositGateways(): void {
    this.activeGatewayDetail.set('ROOT');
    this.showDestinationForm.set(false);
    this.editingDestinationAccountId.set('');
  }

  protected loadSubscriptions(report = true): Promise<void> {
    return this.loadRows(this.adminText('subscriptions'), () => this.admin.listSubscriptions({ limit: 100 }), this.subscriptions, report);
  }

  protected loadSharedAccountPools(report = true): Promise<void> {
    return this.loadRows(this.adminText('sharedAccountPools'), () => this.admin.listSharedAccountPools({ limit: 100 }), this.sharedAccountPools, report)
      .then(() => this.ensureSharedWorkspaceSelection());
  }

  protected async refreshSubscriptionWorkspace(): Promise<void> {
    await Promise.allSettled([
      this.loadProducts(false),
      this.loadSharedAccountPools(false),
      this.loadSubscriptions(false),
    ]);
    this.ensureSharedWorkspaceSelection();
    this.message.set(this.adminText('subscriptionWorkspaceRefreshed'));
  }

  protected loadUsers(report = true): Promise<void> {
    const raw = this.userFilterForm.getRawValue();
    return this.loadRows(this.adminText('accounts'), () => this.admin.listUsers({
      search: raw.search ?? '',
      status: raw.status ?? '',
      limit: 100,
    }), this.users, report);
  }

  protected loadReviews(report = true): Promise<void> {
    return this.loadRows(this.adminText('reviews'), () => this.admin.listReviews({ limit: 100 }), this.reviews, report);
  }

  protected loadMedia(report = true): Promise<void> {
    return this.loadRows(this.adminText('media'), () => this.admin.listMedia({ limit: 100 }), this.media, report);
  }

  protected loadAuditLog(report = true): Promise<void> {
    const raw = this.auditFilterForm.getRawValue();
    return this.loadRows(this.adminText('auditLog'), () => this.admin.auditLog({
      since: raw.since ? new Date(raw.since).toISOString() : '',
      limit: this.numberOrDefault(raw.limit, 50),
    }), this.auditLog, report);
  }

  protected selectFaviconFile(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (!file) return;
    if (!file.type.startsWith('image/') && file.type !== 'image/x-icon') {
      this.error.set(this.adminText('faviconMustBeImage'));
      return;
    }
    this.pendingFaviconFile.set(file);
    this.selectedFaviconFileName.set(file.name);
    if (this.faviconPreviewUrl()) URL.revokeObjectURL(this.faviconPreviewUrl());
    this.faviconPreviewUrl.set(URL.createObjectURL(file));
  }

  protected async uploadFavicon(): Promise<void> {
    const file = this.pendingFaviconFile();
    if (!file) return;
    await this.run(this.adminText('faviconUpload'), async () => {
      const uploaded = await this.mediaApi.uploadFile(file, 'admin_upload');
      this.siteSettingsForm.patchValue({ favicon_media_id: uploaded.media_id });
      this.pendingFaviconFile.set(null);
      this.selectedFaviconFileName.set('');
      this.message.set(this.adminText('faviconUploaded'));
    });
  }

  protected async saveSiteSettings(): Promise<void> {
    await this.run(this.adminText('saveGeneralSettings'), async () => {
      const raw = this.siteSettingsForm.getRawValue();
      const body = this.cleanObject({
        site_name: raw.site_name,
        seo_meta_title: raw.seo_meta_title,
        contact_email: raw.contact_email,
        base_currency: (raw.base_currency || 'THB').trim().toUpperCase(),
        default_locale: (raw.default_locale || 'th').trim().toLowerCase(),
        favicon_media_id: this.numberOrUndefined(raw.favicon_media_id),
        announcement_text: raw.announcement_text,
        announcement_visible: raw.announcement_visible === true,
        product_page_size: this.numberOrDefault(raw.product_page_size, 12),
        allowed_page_sizes: this.mediaIds(raw.allowed_page_sizes).map((item) => Number(item)).filter((item) => Number.isFinite(item)),
        fx_exchange_fee_percent: this.numberOrDefault(raw.fx_exchange_fee_percent, 2.0),
        fx_min_fee_microcredits: this.numberOrDefault(raw.fx_min_fee_microcredits, 2000000),
        social_links: this.cleanObject({
          facebook: raw.social_facebook,
          instagram: raw.social_instagram,
          line: raw.social_line,
          x: raw.social_x,
          youtube: raw.social_youtube,
          tiktok: raw.social_tiktok,
        }),
      });
      const updated = this.rowsOf(await this.admin.updateSiteSettings(body));
      this.patchSiteSettingsForm(updated);
      setGlobalBaseCurrency(String(body['base_currency'] || 'THB'));
      setGlobalMinFeeMicrocredits(this.numberOrDefault(raw.fx_min_fee_microcredits, 2000000));
      this.siteSettings.set(this.rowsOf(await this.admin.getSiteSettings()));
      this.message.set(this.adminText('generalSettingsSaved'));
    });
  }

  protected async saveProduct(): Promise<void> {
    await this.run(this.adminText('productSave'), async () => {
      const raw = this.productForm.getRawValue();
      const id = this.numberOrUndefined(raw.id);
      const compatibility = this.productCompatibilityFromSkus();
      const hasDigitalSku = this.hasDigitalSku();
      const productPrice = this.productPriceFromSkus(raw.price_cents);
      const productCurrency = raw.currency || this.productCurrencyFromSkus();
      if (compatibility.kind === 'SHARED' && !this.sharedSkuDrafts().length) {
        throw new Error(this.adminText('sharedProductNeedsPool'));
      }
      if (compatibility.kind === 'PRIVATE' && !this.skuDrafts().filter((sku) => sku.fulfillment_type !== 'SHARED').length) {
        throw new Error(this.adminText('privateProductNeedsSku'));
      }
      this.addUploadedProductMedia(await this.uploadPendingProductImages());
      const mediaIds = this.currentProductMediaIds();
      const payload = this.cleanObject({
        ...parseJsonObject(raw.payload ?? '{}'),
        kind: compatibility.kind,
        subkind: compatibility.subkind ?? undefined,
        category_id: this.numberOrUndefined(raw.category_id) ?? undefined,
        price_cents: productPrice,
        currency: productCurrency,
        name_th: raw.name_th,
        name_en: raw.name_en,
        description_th: raw.description_th,
        description_en: raw.description_en,
        has_digital_inventory: hasDigitalSku || undefined,
        media_ids: mediaIds,
        skus: this.skuPayload(productPrice, productCurrency),
      });
      const body = this.cleanObject({ id, locale: raw.locale, payload });
      if (id) await this.admin.updateProduct(String(id), body);
      else await this.admin.createProduct(body);
      this.resetProductForm();
      await this.loadProducts(false);
      this.message.set(this.adminText('productSaved'));
    });
  }

  protected selectProduct(row: AdminRow): void {
    this.productForm.patchValue({
      id: this.rowId(row, 'id,product_id'),
      slug: this.cell(row, 'slug', ''),
      product_type: this.productTypeFromRow(row),
      category_id: this.cell(row, 'category_id', ''),
      locale: this.localeValue(this.cell(row, 'locale', this.i18n.currentLocale())),
      price_cents: this.cell(row, 'price_cents', ''),
      currency: this.cell(row, 'currency', 'THB'),
      name_th: this.cell(row, 'name_th,name', ''),
      name_en: this.cell(row, 'name_en,name', ''),
      description_th: this.cell(row, 'description_th,description', ''),
      description_en: this.cell(row, 'description_en,description', ''),
      digital_delivery_type: this.cell(row, 'digital_delivery_type', 'CODE'),
      digital_activation_url_template: this.cell(row, 'digital_activation_url_template', ''),
      digital_code_prefix: this.cell(row, 'digital_code_prefix', 'KPB'),
      digital_instructions_th: this.cell(row, 'digital_instructions_th', ''),
      digital_instructions_en: this.cell(row, 'digital_instructions_en', ''),
      media_ids: this.mediaIdsFromRow(row).join(', '),
      payload: '{}',
    });
    this.linkedProductMediaItems.set(this.mediaItems(row));
    this.skuDrafts.set(this.skuDraftsFromRow(row));
    this.selectedProductImageUrls.set([]);
    this.selectedProductFileNames.set('');
    this.pendingProductImageFiles.set([]);
  }

  protected resetProductForm(): void {
    this.productForm.reset({
      id: '',
      slug: '',
      product_type: 'PHYSICAL',
      category_id: '',
      locale: this.i18n.currentLocale(),
      price_cents: '',
      currency: 'THB',
      name_th: '',
      name_en: '',
      description_th: '',
      description_en: '',
      digital_delivery_type: 'CODE',
      digital_activation_url_template: '',
      digital_code_prefix: 'KPB',
      digital_instructions_th: '',
      digital_instructions_en: '',
      media_ids: '',
      payload: '{}',
    });
    this.selectedProductFileNames.set('');
    this.selectedProductImageUrls.set([]);
    this.linkedProductMediaItems.set([]);
    this.skuDrafts.set([]);
    this.pendingProductImageFiles.set([]);
  }

  protected isDigitalProductForm(): boolean {
    return this.hasDigitalSku();
  }

  protected isSharedProductForm(): boolean {
    return this.productForm.getRawValue().product_type === 'SHARED';
  }

  protected sharedSkuDrafts(): AdminSkuDraft[] {
    return this.skuDrafts().filter((sku) => sku.fulfillment_type === 'SHARED' && sku.status !== 'ARCHIVED');
  }

  protected unboundOrSelectedSharedPools(): AdminRow[] {
    const selectedIds = new Set(this.sharedSkuDrafts().map((sku) => sku.id).filter(Boolean));
    return this.sharedSkuOptions().filter((pool) => {
      const skuId = this.rowId(pool, 'sku_id,id');
      return !selectedIds.has(skuId) || selectedIds.has(skuId);
    });
  }

  protected bindSharedPoolToProduct(skuId: string): void {
    if (!skuId) return;
    const pool = this.sharedSkuOptions().find((row) => this.rowId(row, 'sku_id,id') === skuId);
    if (!pool || this.skuDrafts().some((sku) => sku.id === skuId)) return;
    this.skuDrafts.set([...this.sharedSkuDrafts(), this.sharedPoolDraft(pool)]);
    this.patchSkuDetailFormFromRow(pool);
  }

  protected addSkuDraft(): void {
    this.skuDrafts.set([...this.skuDrafts(), this.defaultSkuDraft()]);
  }

  protected removeSkuDraft(index: number): void {
    this.skuDrafts.set(this.skuDrafts().filter((_, candidateIndex) => candidateIndex !== index));
  }

  protected updateSkuDraft(index: number, key: keyof AdminSkuDraft, value: string): void {
    if (['stock_on_hand', 'low_stock_threshold'].includes(key)) return;
    const next = this.skuDrafts().slice();
    const current = next[index];
    if (!current) return;
    const updated = { ...current, [key]: value } as AdminSkuDraft;
    if (key === 'fulfillment_type' && !['PHYSICAL', 'DIGITAL', 'SHARED'].includes(value)) return;
    if (key === 'status' && !['DRAFT', 'ACTIVE', 'ARCHIVED'].includes(value)) return;
    next[index] = updated;
    this.skuDrafts.set(next);
  }

  protected inputValue(event: Event): string {
    const target = event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    return target?.value ?? '';
  }

  protected async searchSkus(term: string): Promise<void> {
    this.skuSearchTerm.set(term);
    const query = term.trim();
    if (query.length < 2) {
      this.skuSearchResults.set([]);
      this.skuSearchBusy.set(false);
      return;
    }
    this.skuSearchBusy.set(true);
    try {
      const rows = this.rowsOf(await this.admin.searchSkus({ q: query, limit: 12 }));
      if (this.skuSearchTerm().trim() === query) this.skuSearchResults.set(rows);
    } catch (error) {
      if (this.skuSearchTerm().trim() === query) {
        this.skuSearchResults.set([]);
        this.error.set(this.errorText(error));
      }
    } finally {
      if (this.skuSearchTerm().trim() === query) this.skuSearchBusy.set(false);
    }
  }

  protected useSkuSearchResult(row: AdminRow): void {
    const draft = this.skuDraftFromSearchResult(row, true);
    const drafts = this.skuDrafts().slice();
    const existingIndex = drafts.findIndex((sku) => sku.id && sku.id === draft.id);
    if (existingIndex >= 0) drafts[existingIndex] = draft;
    else drafts.unshift(draft);
    this.skuDrafts.set(drafts);
    this.patchSkuDetailFormFromRow(row);
    this.skuSearchTerm.set('');
    this.skuSearchResults.set([]);
    this.message.set(this.adminText('inventorySkuBound'));
  }

  protected skuSearchAvailability(row: AdminRow): string {
    const type = this.cell(row, 'fulfillment_type', '');
    if (type === 'SHARED') return this.adminText('slotsAvailable', { count: this.cell(row, 'slots_available', '0') });
    return this.adminText('stockAvailable', { count: this.cell(row, 'stock_available,available,on_hand', '0') });
  }

  protected skuSearchAction(row: AdminRow): string {
    return this.rowId(row, 'product_id') ? this.adminText('bindExistingItem') : this.adminText('bindUnboundItem');
  }

  protected selectProductImages(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.pendingProductImageFiles.set([]);
    this.selectedProductFileNames.set('');
    this.selectedProductImageUrls.set([]);
    if (!files.length) return;
    if (files.some((file) => !file.type.startsWith('image/'))) {
      this.error.set(this.adminText('productMediaMustBeImage'));
      input.value = '';
      return;
    }
    this.pendingProductImageFiles.set(files);
    this.selectedProductFileNames.set(files.map((file) => file.name).join(', '));
    this.selectedProductImageUrls.set(files.map((file) => URL.createObjectURL(file)));
  }

  protected clearPendingProductImages(): void {
    this.pendingProductImageFiles.set([]);
    this.selectedProductFileNames.set('');
    this.selectedProductImageUrls.set([]);
  }

  protected async uploadProductImages(): Promise<void> {
    await this.run(this.adminText('productMediaUpload'), async () => {
      const uploads = await this.uploadPendingProductImages();
      this.addUploadedProductMedia(uploads);
      await this.loadMedia(false);
      this.message.set(this.adminText(uploads.length === 1 ? 'productImageUploaded' : 'productImagesUploaded', { count: uploads.length }));
    });
  }

  protected selectCategoryImage(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    this.pendingCategoryImageFiles.set([]);
    this.selectedCategoryFileNames.set('');
    this.selectedCategoryImageUrls.set([]);
    if (!files.length) return;
    const file = files[0];
    if (!file.type.startsWith('image/')) {
      this.error.set(this.adminText('categoryMediaMustBeImage'));
      input.value = '';
      return;
    }
    this.pendingCategoryImageFiles.set([file]);
    this.selectedCategoryFileNames.set(file.name);
    this.selectedCategoryImageUrls.set([URL.createObjectURL(file)]);
  }

  protected clearPendingCategoryImage(): void {
    this.pendingCategoryImageFiles.set([]);
    this.selectedCategoryFileNames.set('');
    this.selectedCategoryImageUrls.set([]);
  }

  protected async uploadCategoryImage(): Promise<void> {
    await this.run(this.adminText('categoryMediaUpload'), async () => {
      const uploads = await this.uploadPendingCategoryImage();
      this.setLinkedCategoryMediaItem(uploads[0] ? {
        media_id: uploads[0].media_id,
        id: uploads[0].media_id,
        url: uploads[0].url,
        public_url: uploads[0].url,
        purpose: 'category_image',
      } : null);
      await this.loadMedia(false);
      this.message.set(this.adminText('categoryImageUploaded'));
    });
  }

  protected selectSkuImages(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!this.hasSkuDetailTarget()) {
      this.error.set(this.adminText('selectSkuBeforeChoosingMedia'));
      input.value = '';
      return;
    }
    const files = Array.from(input.files ?? []);
    this.pendingSkuImageFiles.set([]);
    this.selectedSkuFileNames.set('');
    this.selectedSkuImageUrls.set([]);
    if (!files.length) return;
    if (files.some((file) => !file.type.startsWith('image/'))) {
      this.error.set(this.adminText('skuMediaMustBeImage'));
      input.value = '';
      return;
    }
    this.pendingSkuImageFiles.set(files);
    this.selectedSkuFileNames.set(files.map((file) => file.name).join(', '));
    this.selectedSkuImageUrls.set(files.map((file) => URL.createObjectURL(file)));
  }

  protected clearPendingSkuImages(): void {
    this.pendingSkuImageFiles.set([]);
    this.selectedSkuFileNames.set('');
    this.selectedSkuImageUrls.set([]);
  }

  protected async uploadSkuImages(): Promise<void> {
    await this.run(this.adminText('skuMediaUpload'), async () => {
      if (!this.hasSkuDetailTarget()) throw new Error(this.adminText('selectSkuBeforeUploadingMedia'));
      const uploads = await this.uploadPendingSkuImages();
      this.addUploadedSkuMedia(uploads);
      await this.loadMedia(false);
      this.message.set(this.adminText(uploads.length === 1 ? 'skuImageUploaded' : 'skuImagesUploaded', { count: uploads.length }));
    });
  }

  protected async saveSkuDetail(): Promise<void> {
    await this.run(this.adminText('skuDetailSave'), async () => {
      if (!this.hasSkuDetailTarget()) throw new Error(this.adminText('selectSkuBeforeSavingMedia'));
      this.addUploadedSkuMedia(await this.uploadPendingSkuImages());
      const raw = this.skuDetailForm.getRawValue();
      const skuId = String(this.requireNumber(raw.sku_id, this.adminText('skuId')));
      await this.admin.upsertSkuDetail(skuId, this.cleanObject({
        sku_id: Number(skuId),
        summary_th: raw.summary_th,
        summary_en: raw.summary_en,
        description_th: raw.description_th,
        description_en: raw.description_en,
        usage_th: raw.usage_th,
        usage_en: raw.usage_en,
        warranty_th: raw.warranty_th,
        warranty_en: raw.warranty_en,
        specs_json: parseJsonObject(raw.specs_json ?? '{}'),
        operator_notes: raw.operator_notes,
        media_ids: this.currentSkuMediaIds(),
      }));
      await Promise.allSettled([
        this.loadInventory(false),
        this.loadProducts(false),
        this.loadSharedAccountPools(false),
        this.loadMedia(false),
      ]);
      this.message.set(this.adminText('skuDetailSaved'));
    });
  }

  protected async mergeBoundSkuMedia(sku: AdminSkuDraft, mode: 'APPEND' | 'PREPEND' | 'REPLACE'): Promise<void> {
    const productId = String(this.productForm.getRawValue().id ?? '');
    if (!productId || !sku.id) return;
    await this.run(this.adminText('skuMediaMerge'), async () => {
      await this.admin.mergeSkuMediaToProduct(productId, { sku_id: Number(sku.id), mode });
      await this.loadProducts(false);
      this.message.set(this.adminText('skuMediaMerged'));
    });
  }

  protected hasSkuDetailTarget(): boolean {
    return Boolean(this.skuDetailForm.getRawValue().sku_id);
  }

  protected skuDetailTargetLabel(): string {
    const skuId = String(this.skuDetailForm.getRawValue().sku_id ?? '').trim();
    if (!skuId) return this.adminText('noSkuSelected');
    const selectedInventory = this.selectedInventoryItem();
    const selectedShared = this.selectedSharedSku();
    const selected = this.rowId(selectedInventory ?? {}, 'sku_id,id') === skuId
      ? selectedInventory
      : this.rowId(selectedShared ?? {}, 'sku_id,id') === skuId
        ? selectedShared
        : null;
    const code = selected ? this.cell(selected, 'sku_code', '') : '';
    return code ? this.adminText('skuWithCode', { id: skuId, code }) : this.adminText('skuWithId', { id: skuId });
  }

  protected removeLinkedProductMedia(index: number): void {
    const items = this.linkedProductMediaItems().slice();
    items.splice(index, 1);
    this.setLinkedProductMediaItems(items);
  }

  protected moveLinkedProductMedia(index: number, delta: number): void {
    const items = this.linkedProductMediaItems().slice();
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const [item] = items.splice(index, 1);
    items.splice(target, 0, item);
    this.setLinkedProductMediaItems(items);
  }

  protected removeLinkedSkuMedia(index: number): void {
    const items = this.linkedSkuMediaItems().slice();
    items.splice(index, 1);
    this.setLinkedSkuMediaItems(items);
  }

  protected moveLinkedSkuMedia(index: number, delta: number): void {
    const items = this.linkedSkuMediaItems().slice();
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const [item] = items.splice(index, 1);
    items.splice(target, 0, item);
    this.setLinkedSkuMediaItems(items);
  }


  protected async deleteProduct(row: AdminRow): Promise<void> {
    const id = this.rowId(row, 'id,product_id');
    if (!id || !this.confirm(this.adminText('confirmDeleteProduct', { id }))) return;
    await this.run(this.adminText('productDelete'), async () => {
      await this.admin.deleteProduct(id);
      await this.loadProducts(false);
      this.message.set(this.adminText('productDeleted'));
    });
  }

  protected async saveCategory(): Promise<void> {
    await this.run(this.adminText('categorySave'), async () => {
      const raw = this.categoryForm.getRawValue();
      const id = this.numberOrUndefined(raw.id);
      const uploads = await this.uploadPendingCategoryImage();
      if (uploads[0]) {
        this.setLinkedCategoryMediaItem({
          media_id: uploads[0].media_id,
          id: uploads[0].media_id,
          url: uploads[0].url,
          public_url: uploads[0].url,
          purpose: 'category_image',
        });
      }
      const imageMediaId = this.categoryForm.getRawValue().image_media_id;
      const payload = this.cleanObject({
        ...parseJsonObject(raw.payload ?? '{}'),
        name_th: raw.name_th,
        name_en: raw.name_en,
        description_th: raw.description_th,
        description_en: raw.description_en,
        status: raw.status,
        image_media_id: this.numberOrUndefined(imageMediaId) ?? undefined,
      });
      const body = this.cleanObject({ id, slug: raw.slug, locale: raw.locale, payload });
      if (id) await this.admin.updateCategory(String(id), body);
      else await this.admin.createCategory(body);
      this.resetCategoryForm();
      await this.loadCategories(false);
      await this.loadProducts(false);
      this.message.set(this.adminText('categorySaved'));
    });
  }

  protected selectCategory(row: AdminRow): void {
    this.categoryForm.patchValue({
      id: this.rowId(row, 'id,category_id'),
      slug: this.cell(row, 'slug', ''),
      locale: this.localeValue(this.cell(row, 'locale', this.i18n.currentLocale())),
      status: this.cell(row, 'status', 'ACTIVE'),
      name_th: this.cell(row, 'name_th,name', ''),
      name_en: this.cell(row, 'name_en,name', ''),
      description_th: this.cell(row, 'description_th,description', ''),
      description_en: this.cell(row, 'description_en,description', ''),
      image_media_id: this.cell(row, 'image_media_id,media_id', ''),
      payload: '{}',
    });
    const imageUrl = this.categoryImage(row);
    this.linkedCategoryMediaItem.set(imageUrl ? {
      media_id: this.cell(row, 'image_media_id,media_id', ''),
      id: this.cell(row, 'image_media_id,media_id', ''),
      url: imageUrl,
      public_url: imageUrl,
      purpose: 'category_image',
    } : null);
    this.clearPendingCategoryImage();
  }

  protected resetCategoryForm(): void {
    this.categoryForm.reset({
      id: '',
      slug: '',
      locale: this.i18n.currentLocale(),
      status: 'ACTIVE',
      name_th: '',
      name_en: '',
      description_th: '',
      description_en: '',
      image_media_id: '',
      payload: '{}',
    });
    this.linkedCategoryMediaItem.set(null);
    this.clearPendingCategoryImage();
  }

  protected removeCategoryImage(): void {
    this.setLinkedCategoryMediaItem(null);
  }

  protected async deleteCategory(row: AdminRow): Promise<void> {
    const id = this.rowId(row, 'id,category_id');
    if (!id || !this.confirm(this.adminText('confirmDeleteCategory', { id }))) return;
    await this.run(this.adminText('categoryDelete'), async () => {
      await this.admin.deleteCategory(id);
      await this.loadCategories(false);
      await this.loadProducts(false);
      this.message.set(this.adminText('categoryDeleted'));
    });
  }

  protected async adjustInventory(): Promise<void> {
    await this.run(this.adminText('inventoryAdjustment'), async () => {
      const raw = this.inventoryForm.getRawValue();
      await this.admin.adjustInventory({
        sku_id: this.requireNumber(raw.sku_id, this.adminText('skuId')),
        delta: this.requireNumber(raw.delta, this.adminText('delta')),
        reason: raw.reason ?? '',
      });
      await this.loadInventory(false);
      this.message.set(this.adminText('inventoryAdjusted'));
    });
  }

  protected async savePrivateSku(): Promise<void> {
    await this.run(this.adminText('privateSkuSave'), async () => {
      const raw = this.privateSkuForm.getRawValue();
      const body = this.cleanObject({
        sku_id: this.numberOrUndefined(raw.sku_id),
        product_id: this.numberOrUndefined(raw.product_id),
        fulfillment_type: raw.fulfillment_type,
        brand: raw.brand,
        sku_suffix: raw.sku_suffix,
        digital_sku_kind: raw.fulfillment_type === 'DIGITAL' ? raw.digital_sku_kind : undefined,
        sku_code: raw.sku_code,
        status: raw.status,
        low_stock_threshold: this.numberOrDefault(raw.low_stock_threshold, 0),
        name_th: raw.name_th,
        name_en: raw.name_en,
        price_cents: this.numberOrDefault(raw.price_cents, 0),
        currency: raw.currency || 'THB',
      });
      const skuId = raw.sku_id ? String(raw.sku_id) : '';
      const rows = this.rowsOf(skuId ? await this.admin.updatePrivateSku(skuId, body) : await this.admin.upsertPrivateSku(body));
      const savedSkuId = this.rowId(rows[0] ?? {}, 'sku_id,id') || skuId;
      if (savedSkuId) {
        this.privateSkuForm.patchValue({ sku_id: savedSkuId });
        this.skuDetailForm.patchValue({ sku_id: savedSkuId });
      }
      await this.loadInventory(false);
      this.message.set(this.adminText('privateItemSaved'));
    });
  }

  protected async addDigitalUnits(): Promise<void> {
    await this.run(this.adminText('digitalUnitImport'), async () => {
      const raw = this.digitalUnitsForm.getRawValue();
      await this.admin.addDigitalUnits(this.cleanObject({
        sku_id: this.requireNumber(raw.sku_id, this.adminText('digitalSkuId')),
        pool_name: raw.pool_name,
        unit_type: raw.unit_type,
        unit_values: raw.unit_values,
      }));
      await this.loadInventory(false);
      await this.loadDigitalPoolUnits(false);
      this.digitalUnitsForm.patchValue({ unit_values: '' });
      this.message.set(this.adminText('digitalUnitsAdded'));
    });
  }

  protected async generatePhysicalUnits(): Promise<void> {
    await this.run(this.adminText('physicalSerialGeneration'), async () => {
      const raw = this.physicalUnitsForm.getRawValue();
      await this.admin.generatePhysicalUnits(this.cleanObject({
        sku_id: this.requireNumber(raw.sku_id, this.adminText('physicalSkuId')),
        count: this.requireNumber(raw.count, this.adminText('count')),
        prefix: raw.prefix,
      }));
      await this.loadInventory(false);
      this.message.set(this.adminText('physicalSerialsGenerated'));
    });
  }

  protected selectInventoryItem(row: AdminRow): void {
    this.selectedInventoryItem.set(row);
    this.digitalPoolUnits.set([]);
    this.patchSkuDetailFormFromRow(row);
    this.inventoryForm.patchValue({
      sku_id: this.rowId(row, 'sku_id,id'),
      delta: '0',
      reason: '',
    });
    const skuId = this.rowId(row, 'sku_id,id');
    this.privateSkuForm.patchValue({
      sku_id: skuId,
      product_id: this.rowId(row, 'product_id'),
      fulfillment_type: this.cell(row, 'fulfillment_type', 'PHYSICAL') === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL',
      brand: this.cell(row, 'brand', ''),
      sku_suffix: '',
      digital_sku_kind: this.cell(row, 'digital_sku_kind', 'CDKEY') === 'ACTIVATION_LINK' ? 'ACTIVATION_LINK' : 'CDKEY',
      sku_code: this.cell(row, 'sku_code', ''),
      status: this.cell(row, 'status', 'ACTIVE'),
      low_stock_threshold: this.cell(row, 'low_stock_threshold', '0'),
      name_th: this.cell(row, 'name_th,sku_name', ''),
      name_en: this.cell(row, 'name_en,sku_name', ''),
      price_cents: this.cell(row, 'price_cents', '0'),
      currency: this.cell(row, 'currency', 'THB'),
    });
    this.digitalUnitsForm.patchValue({
      sku_id: this.cell(row, 'fulfillment_type') === 'DIGITAL' ? skuId : '',
      pool_name: this.cell(row, 'sku_code', ''),
      unit_type: 'CODE',
    });
    this.physicalUnitsForm.patchValue({
      sku_id: this.cell(row, 'fulfillment_type') === 'PHYSICAL' ? skuId : '',
      prefix: this.cell(row, 'sku_code', 'PHY').replace(/[^a-zA-Z0-9]+/g, '_').slice(0, 24) || 'PHY',
    });
    if (this.isDigitalInventoryItem(row)) void this.loadDigitalPoolUnits(false);
  }

  protected isDigitalInventoryItem(row: AdminRow): boolean {
    return this.cell(row, 'fulfillment_type') === 'DIGITAL';
  }

  protected inventoryStateClass(row: AdminRow): Record<string, boolean> {
    const available = this.inventoryAvailableNumber(row);
    const threshold = this.numberOrDefault(this.firstValue(row, 'low_stock_threshold'), 0);
    return {
      'stock-zero': available <= 0,
      'stock-low': available > 0 && threshold > 0 && available <= threshold,
    };
  }

  private productRowMatches(row: AdminRow): boolean {
    const term = this.productSearch().trim().toLocaleLowerCase(this.i18n.currentLocale());
    if (!term) return true;
    const skuTerms = this.skusFromRow(row).flatMap((sku) => [
      this.rowId(sku, 'sku_id,id'),
      this.cell(sku, 'sku_code,code'),
      this.cell(sku, 'name,name_th,name_en'),
      this.cell(sku, 'fulfillment_type'),
      this.cell(sku, 'status'),
    ]);
    const haystack = [
      this.rowId(row, 'id,product_id'),
      this.cell(row, 'name,name_th,name_en'),
      this.cell(row, 'slug'),
      this.cell(row, 'status,kind'),
      this.cell(row, 'category_name,category_slug,category_id'),
      this.productTypeFromRow(row),
      ...skuTerms,
    ].join(' ').toLocaleLowerCase(this.i18n.currentLocale());
    return haystack.includes(term);
  }

  private inventoryRowMatches(row: AdminRow): boolean {
    const view = this.inventoryStockView();
    const available = this.inventoryAvailableNumber(row);
    const threshold = this.numberOrDefault(this.firstValue(row, 'low_stock_threshold'), 0);
    const isLow = available > 0 && threshold > 0 && available <= threshold;
    const fulfillment = this.cell(row, 'fulfillment_type').toUpperCase();
    const viewMatches =
      view === 'ALL'
      || (view === 'RISK' && (available <= 0 || isLow))
      || (view === 'OUT' && available <= 0)
      || (view === 'LOW' && isLow)
      || (view === 'DIGITAL' && fulfillment === 'DIGITAL')
      || (view === 'PHYSICAL' && fulfillment === 'PHYSICAL');
    if (!viewMatches) return false;

    const term = this.inventorySearch().trim().toLocaleLowerCase(this.i18n.currentLocale());
    if (!term) return true;
    const haystack = [
      this.rowId(row, 'sku_id,id'),
      this.cell(row, 'sku_code,sku'),
      this.cell(row, 'sku_name,name_th,name_en'),
      this.cell(row, 'product_name,name,slug'),
      this.cell(row, 'brand'),
      this.cell(row, 'fulfillment_type'),
      this.cell(row, 'status'),
    ].join(' ').toLocaleLowerCase(this.i18n.currentLocale());
    return haystack.includes(term);
  }

  private inventoryAvailableNumber(row: AdminRow): number {
    const explicit = this.firstValue(row, 'available,stock_available');
    if (explicit !== undefined && explicit !== null && explicit !== '') return this.numberOrDefault(explicit, 0);
    return this.numberOrDefault(this.firstValue(row, 'on_hand,qty'), 0) - this.numberOrDefault(this.firstValue(row, 'reserved,reserved_qty'), 0);
  }

  protected selectOrder(row: AdminRow): void {
    this.refundForm.patchValue({
      order_id: this.rowId(row, 'id,order_id'),
      amount_cents: this.cell(row, 'total_cents', ''),
      reason: '',
    });
  }

  protected async fulfillOrder(row: AdminRow): Promise<void> {
    const id = this.rowId(row, 'id,order_id');
    if (!id) return;
    await this.run(this.adminText('orderFulfill'), async () => {
      await this.admin.fulfillOrder(id, {});
      await this.loadOrders(false);
      this.message.set(this.adminText('orderMarkedFulfilled'));
    });
  }

  protected async refundOrder(): Promise<void> {
    await this.run(this.adminText('orderRefund'), async () => {
      const raw = this.refundForm.getRawValue();
      const stepUpToken = await this.stepUp(raw.password);
      await this.admin.refundOrder(String(this.requireNumber(raw.order_id, this.adminText('orderId'))), this.cleanObject({
        amount_cents: this.numberOrUndefined(raw.amount_cents),
        reason: raw.reason,
      }), stepUpToken);
      await this.loadOrders(false);
      this.message.set(this.adminText('refundSubmitted'));
    });
  }

  protected selectDeposit(row: AdminRow): void {
    const depositId = this.rowId(row, 'id,deposit_id');
    const orderId = this.cell(row, 'order_id', '');
    this.depositForm.patchValue({ deposit_id: depositId, order_id: orderId, note: '' });
    this.depositRejectForm.patchValue({ deposit_id: depositId });
  }

  protected async matchDeposit(): Promise<void> {
    await this.run(this.adminText('depositMatch'), async () => {
      const raw = this.depositForm.getRawValue();
      const stepUpToken = await this.stepUp(raw.password);
      await this.admin.matchDeposit(String(this.requireNumber(raw.deposit_id, this.adminText('depositId'))), {
        order_id: this.requireNumber(raw.order_id, this.adminText('orderId')),
        note: raw.note ?? '',
      }, stepUpToken);
      await this.loadDeposits(false);
      this.message.set(this.adminText('depositMatched'));
    });
  }

  protected async rejectDeposit(): Promise<void> {
    await this.run(this.adminText('depositReject'), async () => {
      const raw = this.depositRejectForm.getRawValue();
      await this.admin.rejectDeposit(String(this.requireNumber(raw.deposit_id, this.adminText('depositId'))), {
        reason: raw.reason ?? '',
      });
      await this.loadDeposits(false);
      this.message.set(this.adminText('depositRejected'));
    });
  }

  protected editWebhookIpAllowlist(row: AdminRow): void {
    const id = this.rowId(row, 'id');
    this.editingWebhookIpAllowlistId.set(id);
    this.webhookIpAllowlistForm.reset({
      id,
      provider: this.cell(row, 'provider', 'proxy-bank'),
      label: this.cell(row, 'label', ''),
      cidr: this.cell(row, 'cidr', ''),
      status: this.cell(row, 'status', 'ACTIVE'),
      note: this.cell(row, 'note', ''),
    });
  }

  protected resetWebhookIpAllowlistForm(): void {
    this.editingWebhookIpAllowlistId.set('');
    this.webhookIpAllowlistForm.reset({ id: '', provider: 'proxy-bank', label: '', cidr: '', status: 'ACTIVE', note: '' });
  }

  protected async saveWebhookIpAllowlist(): Promise<void> {
    await this.run(this.adminText('webhookIpAllowlistSave'), async () => {
      const raw = this.webhookIpAllowlistForm.getRawValue();
      await this.admin.upsertWebhookIpAllowlist({
        id: raw.id || undefined,
        provider: raw.provider || 'proxy-bank',
        label: raw.label || 'Webhook provider range',
        cidr: raw.cidr || '',
        status: raw.status || 'ACTIVE',
        note: raw.note || '',
      });
      await this.loadWebhookIpAllowlist(false);
      this.resetWebhookIpAllowlistForm();
      this.message.set(this.adminText('webhookIpAllowlistSaved'));
    });
  }

  protected async deleteWebhookIpAllowlist(row: AdminRow): Promise<void> {
    const id = this.rowId(row, 'id');
    if (!id) return;
    await this.run(this.adminText('webhookIpAllowlistDelete'), async () => {
      await this.admin.deleteWebhookIpAllowlist(id);
      await this.loadWebhookIpAllowlist(false);
      if (this.editingWebhookIpAllowlistId() === id) this.resetWebhookIpAllowlistForm();
      this.message.set(this.adminText('webhookIpAllowlistDeleted'));
    });
  }

  protected startAddBankAccount(): void {
    this.activeGatewayDetail.set('MONEY_SCARP_BANK_ACCOUNTS');
    this.editingDestinationAccountId.set('');
    this.destinationFormType.set('BANK_TRANSFER');
    this.destinationAccountForm.reset({ account_type: 'BANK_TRANSFER', bank_code: '', bank_name: '', account_number: '', account_name: '', promptpay_type: 'PHONE', display_label: '', priority: '0' });
    this.showDestinationForm.set(true);
  }

  protected startAddPromptPay(): void {
    this.activeGatewayDetail.set('PROMPTPAY_SETTINGS');
    this.editingDestinationAccountId.set('');
    this.destinationFormType.set('PROMPTPAY');
    this.destinationAccountForm.reset({ account_type: 'PROMPTPAY', bank_code: '', bank_name: '', account_number: '', account_name: '', promptpay_type: 'PHONE', display_label: '', priority: '0' });
    this.showDestinationForm.set(true);
  }

  protected editDestinationAccount(row: AdminRow): void {
    const id = this.rowId(row, 'id');
    this.editingDestinationAccountId.set(id);
    this.destinationFormType.set(String(row['account_type'] ?? 'BANK_TRANSFER') === 'PROMPTPAY' ? 'PROMPTPAY' : 'BANK_TRANSFER');
    this.activeGatewayDetail.set(this.destinationFormType() === 'PROMPTPAY' ? 'PROMPTPAY_SETTINGS' : 'MONEY_SCARP_BANK_ACCOUNTS');
    this.destinationAccountForm.patchValue({
      account_type: String(row['account_type'] ?? 'BANK_TRANSFER'),
      bank_code: String(row['bank_code'] ?? ''),
      bank_name: String(row['bank_name'] ?? ''),
      account_number: String(row['account_number'] ?? ''),
      account_name: String(row['account_name'] ?? ''),
      promptpay_type: String(row['promptpay_type'] ?? 'PHONE'),
      display_label: String(row['display_label'] ?? ''),
      priority: String(row['priority'] ?? '0'),
    });
    this.showDestinationForm.set(true);
  }

  protected cancelDestinationForm(): void {
    this.showDestinationForm.set(false);
    this.editingDestinationAccountId.set('');
  }

  protected async saveDestinationAccount(): Promise<void> {
    const editId = this.editingDestinationAccountId();
    const label = editId ? this.adminText('editAccount') : (this.destinationFormType() === 'PROMPTPAY' ? this.adminText('addPromptPay') : this.adminText('addBankAccount'));
    await this.run(label, async () => {
      const raw = this.destinationAccountForm.getRawValue();
      const body = this.cleanObject({
        account_type: this.destinationFormType(),
        account_number: raw.account_number ?? '',
        account_name: raw.account_name ?? '',
        display_label: raw.display_label ?? '',
        priority: Number(raw.priority) || 0,
      });
      if (this.destinationFormType() === 'BANK_TRANSFER') {
        body['bank_code'] = raw.bank_code ?? '';
        body['bank_name'] = raw.bank_name ?? '';
      } else {
        body['promptpay_type'] = raw.promptpay_type ?? 'PHONE';
      }
      if (editId) {
        await this.moneyScarpGateway.updateBankAccount(editId, body);
      } else {
        await this.moneyScarpGateway.createBankAccount(body);
      }
      await this.loadDestinationAccounts(false);
      this.showDestinationForm.set(false);
      this.editingDestinationAccountId.set('');
      this.message.set(this.i18n.t('common.saved'));
    });
  }

  protected async toggleDestinationAccount(row: AdminRow): Promise<void> {
    const id = this.rowId(row, 'id');
    const currentlyActive = row['is_active'] === true || row['is_active'] === 1 || String(row['is_active']) === '1';
    await this.run(this.adminText('toggleActive'), async () => {
      await this.moneyScarpGateway.toggleBankAccount(id, { is_active: !currentlyActive });
      await this.loadDestinationAccounts(false);
      this.message.set(this.i18n.t('common.saved'));
    });
  }

  protected async deleteDestinationAccount(row: AdminRow): Promise<void> {
    if (!confirm(this.adminText('confirmDelete'))) return;
    const id = this.rowId(row, 'id');
    await this.run(this.adminText('deleteAccount'), async () => {
      await this.moneyScarpGateway.deleteBankAccount(id);
      await this.loadDestinationAccounts(false);
      this.message.set(this.i18n.t('common.deleted'));
    });
  }

  protected isDestAccountActive(row: AdminRow): boolean {
    return row['is_active'] === true || row['is_active'] === 1 || String(row['is_active']) === '1';
  }

  protected bankDestinationAccounts(): AdminRow[] {
    return this.destinationAccounts().filter((row) => this.destinationAccountType(row) === 'BANK_TRANSFER');
  }

  protected promptPayDestinationAccounts(): AdminRow[] {
    return this.destinationAccounts().filter((row) => this.destinationAccountType(row) === 'PROMPTPAY');
  }

  private destinationAccountType(row: AdminRow): 'BANK_TRANSFER' | 'PROMPTPAY' {
    const raw = String(row['account_type'] ?? row['type'] ?? row['method'] ?? row['payment_method'] ?? '').toLocaleUpperCase('en-US');
    if (raw.includes('PROMPT')) return 'PROMPTPAY';
    if (row['promptpay_type'] || row['promptpay_id']) return 'PROMPTPAY';
    return 'BANK_TRANSFER';
  }

  protected destAccountLabel(row: AdminRow): string {
    const label = String(row['display_label'] ?? '').trim();
    if (label) return label;
    const accountType = this.destinationAccountType(row);
    if (accountType === 'PROMPTPAY') return this.adminText('promptPay') + ' — ' + this.cell(row, 'account_name');
    const bankName = String(row['bank_name'] ?? '').trim();
    return (bankName || this.adminText('bankTransfer')) + ' — ' + this.cell(row, 'account_name');
  }

  protected destAccountDetail(row: AdminRow): string {
    const accountType = this.destinationAccountType(row);
    const number = this.cell(row, 'account_number');
    if (accountType === 'PROMPTPAY') {
      const ppType = String(row['promptpay_type'] ?? 'PHONE');
      const typeLabel = ppType === 'CITIZEN_ID' ? this.adminText('promptPayCitizenId') : ppType === 'TAX_ID' ? this.adminText('promptPayTaxId') : this.adminText('promptPayPhone');
      return `${this.adminText('promptPay')} (${typeLabel}): ${number}`;
    }
    const bankCode = String(row['bank_code'] ?? '').trim();
    return bankCode ? `${bankCode}: ${number}` : number;
  }

  protected onBankCodeChange(): void {
    const code = this.destinationAccountForm.getRawValue().bank_code ?? '';
    const match = this.thaiBankCodes.find((b) => b.code === code);
    if (match) this.destinationAccountForm.patchValue({ bank_name: this.adminText(match.key) });
  }

  protected async saveSharedSubscriptionSku(): Promise<void> {
    await this.run(this.adminText('subscriptionSkuSave'), async () => {
      const raw = this.sharedSkuForm.getRawValue();
      const poolName = String(raw.pool_name ?? '').trim();
      const cadence = this.billingCadenceValue(raw.billing_cadence ?? '1M');
      const skuCode = String(raw.sku_code ?? '').trim() || this.sharedSkuCodeFromPool(String(raw.brand ?? ''), String(raw.sku_suffix ?? ''), poolName, cadence);
      const body = this.cleanObject({
        sku_id: this.numberOrUndefined(raw.sku_id),
        sku_code: skuCode,
        brand: raw.brand ?? '',
        sku_suffix: raw.sku_suffix ?? '',
        sku_name_th: raw.sku_name_th ?? '',
        sku_name_en: raw.sku_name_en ?? '',
        price_cents: this.requireNumber(raw.price_cents, this.adminText('priceCents')),
        currency: raw.currency || 'THB',
        billing_cadence: cadence,
        pool_name: poolName,
        pool_status: raw.pool_status || 'ACTIVE',
      });
      const rows = this.rowsOf(await this.admin.upsertSharedSubscriptionSku(body));
      const saved = rows[0] ?? {};
      const savedSkuId = this.rowId(saved, 'sku_id,id');
      if (savedSkuId) this.selectedSharedSkuId.set(savedSkuId);
      if (savedSkuId) this.skuDetailForm.patchValue({ sku_id: savedSkuId });
      await Promise.allSettled([
        this.loadProducts(false),
        this.loadSharedAccountPools(false),
        this.loadSubscriptions(false),
      ]);
      if (savedSkuId) this.selectedSharedSkuId.set(savedSkuId);
      this.startNewSharedAccount();
      this.message.set(this.adminText('subscriptionSkuPoolSaved'));
    });
  }

  protected resetSharedSkuForm(): void {
    this.sharedSkuForm.reset({
      sku_id: '',
      brand: '',
      sku_suffix: '',
      sku_code: '',
      sku_name_th: '',
      sku_name_en: '',
      price_cents: '0',
      currency: 'THB',
      billing_cadence: '1M',
      pool_name: '',
      pool_status: 'ACTIVE',
    });
    this.generatedSharedSkuCode.set('');
  }

  protected async saveSharedAccount(): Promise<void> {
    await this.run(this.adminText('sharedAccountSave'), async () => {
      const raw = this.sharedAccountForm.getRawValue();
      const id = this.numberOrUndefined(raw.id);
      const body = this.cleanObject({
        sku_id: this.requireNumber(raw.sku_id, this.adminText('sharedSku')),
        vendor: raw.vendor,
        capacity: id ? undefined : this.requireNumber(raw.capacity, this.adminText('capacity')),
        status: raw.status,
        expires_at: raw.expires_at ? new Date(raw.expires_at).toISOString().slice(0, 19).replace('T', ' ') : undefined,
        metadata: this.cleanObject({
          ...parseJsonObject(raw.metadata ?? '{}'),
          status: raw.status,
          expires_at: raw.expires_at ? new Date(raw.expires_at).toISOString().slice(0, 19).replace('T', ' ') : undefined,
        }),
      });
      if (id) await this.admin.updateSharedAccount(String(id), body);
      else await this.admin.createSharedAccount(body);
      this.selectedSharedSkuId.set(String(raw.sku_id ?? ''));
      this.selectedSharedAccountId.set(id ? String(id) : '');
      this.startNewSharedAccount();
      await Promise.allSettled([this.loadSharedAccountPools(false), this.loadSubscriptions(false)]);
      this.message.set(this.adminText('sharedAccountSaved'));
    });
  }

  protected resetSharedAccountForm(): void {
    this.startNewSharedAccount();
  }

  protected selectSharedAccountPool(row: AdminRow): void {
    const id = this.rowId(row, 'shared_account_id,id');
    if (this.rowId(row, 'sku_id')) this.selectedSharedSkuId.set(this.rowId(row, 'sku_id'));
    if (id) this.selectedSharedAccountId.set(id);
    this.sharedAccountForm.patchValue({
      id,
      sku_id: this.rowId(row, 'sku_id'),
      vendor: this.cell(row, 'vendor,provider', ''),
      capacity: this.cell(row, 'slots_total,capacity', '1'),
      status: this.cell(row, 'status', 'ACTIVE'),
      expires_at: this.toDateTimeLocal(this.cell(row, 'expires_at', '')),
      metadata: '{}',
    });
    this.credentialForm.patchValue({ id });
  }

  protected updateSharedSkuSearch(value: string): void {
    this.sharedSkuSearch.set(value);
  }

  protected updateSharedPoolName(value: string): void {
    this.sharedSkuForm.patchValue({ pool_name: value });
    this.generateSharedSkuCodeIfManaged();
  }

  protected updateSharedBrand(value: string): void {
    this.sharedSkuForm.patchValue({ brand: value });
    this.generateSharedSkuCodeIfManaged();
  }

  protected updateSharedSkuSuffix(value: string): void {
    this.sharedSkuForm.patchValue({ sku_suffix: value });
    this.generateSharedSkuCodeIfManaged();
  }

  protected updateSharedBillingCadence(value: string): void {
    const cadence = this.validBillingCadence(value) ? value : '1M';
    this.sharedSkuForm.patchValue({ billing_cadence: cadence });
    this.generateSharedSkuCodeIfManaged();
  }

  protected updateSharedSkuCode(value: string): void {
    this.sharedSkuForm.patchValue({ sku_code: value });
    if (value !== this.generatedSharedSkuCode()) this.generatedSharedSkuCode.set('');
  }

  protected updatePrivateFulfillment(value: string): void {
    this.privateSkuForm.patchValue({ fulfillment_type: value === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL' });
    this.generatePrivateSkuCodeIfManaged();
  }

  protected updatePrivateBrand(value: string): void {
    this.privateSkuForm.patchValue({ brand: value });
    this.generatePrivateSkuCodeIfManaged();
  }

  protected updatePrivateSkuSuffix(value: string): void {
    this.privateSkuForm.patchValue({ sku_suffix: value });
    this.generatePrivateSkuCodeIfManaged();
  }

  protected updatePrivateDigitalKind(value: string): void {
    this.privateSkuForm.patchValue({ digital_sku_kind: value === 'ACTIVATION_LINK' ? 'ACTIVATION_LINK' : 'CDKEY' });
    this.generatePrivateSkuCodeIfManaged();
  }

  protected updatePrivateSkuCode(value: string): void {
    this.privateSkuForm.patchValue({ sku_code: value });
    if (value !== this.generatedPrivateSkuCode()) this.generatedPrivateSkuCode.set('');
  }

  protected filteredSharedSkuOptions(): AdminRow[] {
    const term = this.sharedSkuSearch().trim().toLowerCase();
    const options = this.sharedSkuOptions();
    if (!term) return options;
    return options.filter((sku) => [
      this.cell(sku, 'sku_code'),
      this.cell(sku, 'name,name_th,name_en,sku_name'),
      this.cell(sku, 'product_name,product_slug'),
    ].join(' ').toLowerCase().includes(term));
  }

  protected selectSharedSku(sku: AdminRow): void {
    const skuId = this.rowId(sku, 'sku_id,id');
    this.selectedSharedSkuId.set(skuId);
    this.patchSkuDetailFormFromRow(sku);
    this.startNewSharedAccount();
  }

  protected editSharedSubscriptionSku(sku: AdminRow): void {
    this.patchSkuDetailFormFromRow(sku);
    this.sharedSkuForm.reset({
      sku_id: this.rowId(sku, 'sku_id,id'),
      brand: this.cell(sku, 'brand', ''),
      sku_suffix: '',
      sku_code: this.cell(sku, 'sku_code', ''),
      sku_name_th: this.cell(sku, 'sku_name_th,name_th,sku_name,name', ''),
      sku_name_en: this.cell(sku, 'sku_name_en,name_en,sku_name,name', ''),
      price_cents: this.cell(sku, 'price_cents', '0'),
      currency: this.cell(sku, 'currency', 'THB'),
      billing_cadence: this.billingCadenceValue(this.cell(sku, 'billing_cadence', '1M')),
      pool_name: this.cell(sku, 'pool_name', ''),
      pool_status: this.cell(sku, 'pool_status,status', 'ACTIVE'),
    });
    this.generatedSharedSkuCode.set('');
    this.message.set(this.adminText('subscriptionSkuLoadedForEditing'));
  }

  protected selectedSharedSkuIdValue(): string {
    const selected = this.selectedSharedSkuId();
    if (selected) return selected;
    return this.rowId(this.sharedSkuOptions()[0] ?? {}, 'sku_id,id');
  }

  protected selectedSharedSku(): AdminRow | null {
    const selectedId = this.selectedSharedSkuIdValue();
    return this.sharedSkuOptions().find((sku) => this.rowId(sku, 'sku_id,id') === selectedId) ?? null;
  }

  protected selectedSharedPoolRows(): AdminRow[] {
    const skuId = this.selectedSharedSkuIdValue();
    if (!skuId) return [];
    return this.sharedAccountPools().filter((row) => this.rowId(row, 'sku_id') === skuId);
  }

  protected selectedSharedAccountRows(): AdminRow[] {
    return this.selectedSharedPoolRows().filter((row) => this.rowId(row, 'shared_account_id,id'));
  }

  protected selectedSharedAccountIdValue(): string {
    const selected = this.selectedSharedAccountId();
    return this.selectedSharedAccountRows().some((row) => this.rowId(row, 'shared_account_id,id') === selected) ? selected : '';
  }

  protected selectedSharedAccount(): AdminRow | null {
    const selectedId = this.selectedSharedAccountIdValue();
    if (!selectedId) return null;
    return this.selectedSharedAccountRows().find((row) => this.rowId(row, 'shared_account_id,id') === selectedId) ?? null;
  }

  protected selectSharedAccount(row: AdminRow): void {
    this.selectSharedAccountPool(row);
  }

  protected startNewSharedAccount(): void {
    const skuId = this.selectedSharedSkuIdValue();
    this.selectedSharedAccountId.set('');
    this.sharedAccountForm.reset({ id: '', sku_id: skuId, vendor: '', capacity: '1', status: 'ACTIVE', expires_at: '', metadata: '{}' });
    this.credentialForm.reset({ id: '', credential_username: '', credential_secret: '', credential_notes: '', reason: 'credential_rotation', password: '' });
  }

  protected sharedPoolStatus(): string {
    return this.cell(this.selectedSharedPoolRows()[0] ?? {}, 'pool_status,status', 'MISSING');
  }

  protected sharedSkuStatusLabel(sku: AdminRow): string {
    const skuId = this.rowId(sku, 'sku_id,id');
    const rows = this.sharedAccountPools().filter((row) => this.rowId(row, 'sku_id') === skuId);
    if (!rows.length) return this.adminText('noPool');
    const poolStatus = this.cell(rows[0], 'pool_status,status', 'MISSING');
    const sellable = this.sumRows(rows.filter((row) => this.cell(row, 'account_status,status') === 'ACTIVE'), 'slots_available');
    return poolStatus === 'ACTIVE' && sellable > 0 ? this.adminText('sellableSlots', { count: sellable }) : this.statusLabel(poolStatus);
  }

  protected sharedPoolHealthLabel(): string {
    const poolStatus = this.sharedPoolStatus();
    if (poolStatus === 'MISSING') return this.adminText('createPool');
    if (poolStatus !== 'ACTIVE') return this.statusLabel(poolStatus);
    if (!this.selectedSharedAccountRows().length) return this.adminText('needsAccount');
    return this.sharedSellableSlotsAvailable() > 0 ? this.adminText('sellable') : this.adminText('needsCapacity');
  }

  protected sharedSlotsTotal(): number {
    return this.sumRows(this.selectedSharedAccountRows(), 'slots_total,capacity');
  }

  protected sharedSlotsUsed(): number {
    return this.sumRows(this.selectedSharedAccountRows(), 'slots_used');
  }

  protected sharedSellableSlotsAvailable(): number {
    if (this.sharedPoolStatus() !== 'ACTIVE') return 0;
    return this.sumRows(
      this.selectedSharedAccountRows().filter((row) => this.cell(row, 'account_status,status') === 'ACTIVE'),
      'slots_available',
    );
  }

  protected sharedActiveAccountCount(): number {
    return this.selectedSharedAccountRows().filter((row) => this.cell(row, 'account_status,status') === 'ACTIVE').length;
  }

  protected sharedAttentionCount(): number {
    return this.selectedSharedAccountRows().filter((row) => {
      const status = this.cell(row, 'account_status,status');
      const credential = this.cell(row, 'credential_status', 'UNKNOWN');
      return status !== 'ACTIVE' || credential === 'MISSING' || this.isExpiringSoon(this.cell(row, 'expires_at', ''));
    }).length;
  }

  protected selectedSharedAccountSlotsUsed(): string {
    return this.cell(this.selectedSharedAccount() ?? {}, 'slots_used', '0');
  }

  protected sharedAccountExpiryLabel(row: AdminRow): string {
    const expiresAt = this.cell(row, 'expires_at', '');
    if (!expiresAt) return this.adminText('noExpiry');
    return this.isExpiringSoon(expiresAt) ? this.adminText('expiringAt', { date: expiresAt }) : this.adminText('expiresAtValue', { date: expiresAt });
  }

  protected filteredSubscriptionSlots(): AdminRow[] {
    const skuId = this.selectedSharedSkuIdValue();
    const accountId = this.selectedSharedAccountIdValue();
    return this.subscriptions().filter((slot) => {
      if (accountId) return this.rowId(slot, 'shared_account_id') === accountId;
      return !skuId || this.rowId(slot, 'sku_id') === skuId;
    });
  }

  protected async rotateCredential(): Promise<void> {
    await this.run(this.adminText('credentialRotation'), async () => {
      const raw = this.credentialForm.getRawValue();
      const stepUpToken = await this.stepUp(raw.password);
      await this.admin.setSharedAccountCredentials(String(this.requireNumber(raw.id, this.adminText('sharedAccountId'))), {
        credential_username: raw.credential_username,
        credential_secret: raw.credential_secret,
        credential_notes: raw.credential_notes,
        reason: raw.reason,
      }, stepUpToken);
      this.credentialForm.reset({ id: '', credential_username: '', credential_secret: '', credential_notes: '', reason: 'credential_rotation', password: '' });
      this.message.set(this.adminText('credentialSealed'));
    });
  }

  protected selectUser(row: AdminRow): void {
    const id = this.rowId(row, 'id,user_id');
    this.roleForm.patchValue({ user_id: id, roles: this.rolesCell(row) });
    this.lockForm.patchValue({ user_id: id, reason: '' });
  }

  protected async saveUserRoles(): Promise<void> {
    await this.run(this.adminText('roleUpdate'), async () => {
      const raw = this.roleForm.getRawValue();
      const stepUpToken = await this.stepUp(raw.password);
      const roles = String(raw.roles ?? '')
        .split(',')
        .map((role) => role.trim())
        .filter(Boolean);
      await this.admin.changeUserRoles(String(this.requireNumber(raw.user_id, this.adminText('userId'))), { roles }, stepUpToken);
      await this.loadUsers(false);
      this.message.set(this.adminText('accountRolesUpdated'));
    });
  }

  protected async lockUser(): Promise<void> {
    await this.run(this.adminText('accountLock'), async () => {
      const raw = this.lockForm.getRawValue();
      await this.admin.lockUser(String(this.requireNumber(raw.user_id, this.adminText('userId'))), {
        reason: raw.reason ?? '',
        until: raw.until ? new Date(raw.until).toISOString() : null,
      });
      await this.loadUsers(false);
      this.message.set(this.adminText('accountLocked'));
    });
  }

  protected async approveReview(row: AdminRow): Promise<void> {
    const id = this.rowId(row, 'id,review_id');
    if (!id) return;
    await this.run(this.adminText('reviewApprove'), async () => {
      await this.admin.approveReview(id);
      await this.loadReviews(false);
      this.message.set(this.adminText('reviewApproved'));
    });
  }

  protected selectReview(row: AdminRow): void {
    this.reviewRejectForm.patchValue({
      review_id: this.rowId(row, 'id,review_id'),
      reason: '',
    });
  }

  protected async rejectReview(): Promise<void> {
    await this.run(this.adminText('reviewReject'), async () => {
      const raw = this.reviewRejectForm.getRawValue();
      await this.admin.rejectReview(String(this.requireNumber(raw.review_id, this.adminText('reviewId'))), { reason: raw.reason ?? '' });
      await this.loadReviews(false);
      this.message.set(this.adminText('reviewRejected'));
    });
  }

  protected async deleteMedia(row: AdminRow): Promise<void> {
    const id = this.rowId(row, 'id,media_id');
    if (!id || !this.confirm(this.adminText('confirmDeleteMedia', { id }))) return;
    await this.run(this.adminText('mediaDelete'), async () => {
      await this.admin.deleteMedia(id);
      await this.loadMedia(false);
      this.message.set(this.adminText('mediaDeleted'));
    });
  }

  protected async rotateKek(): Promise<void> {
    await this.run(this.adminText('kekRotation'), async () => {
      const raw = this.kekForm.getRawValue();
      const stepUpToken = await this.stepUp(raw.password);
      await this.admin.rotateKek({ new_kek_id: raw.new_kek_id }, stepUpToken);
      this.kekForm.reset({ new_kek_id: '', password: '' });
      this.message.set(this.adminText('kekRotationStarted'));
    });
  }

  protected cell(row: AdminRow, keys: string, fallback = '-'): string {
    const value = this.firstValue(row, keys);
    if (value === undefined || value === null || value === '') return fallback;
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  protected rowId(row: AdminRow, keys: string): string {
    return this.cell(row, keys, '');
  }

  protected moneyCell(row: AdminRow, amountKeys: string): string {
    const raw = this.firstValue(row, amountKeys);
    const cents = typeof raw === 'number' ? raw : Number(raw);
    if (!Number.isFinite(cents)) return '-';
    return formatMoney(cents, this.cell(row, 'currency', this.baseCurrency()), this.i18n.angularLocale());
  }

  protected dateTimeCell(row: AdminRow, keys: string): string {
    const raw = this.firstValue(row, keys);
    if (!raw) return '-';
    const date = new Date(String(raw));
    if (Number.isNaN(date.getTime())) return String(raw);
    return new Intl.DateTimeFormat(this.i18n.angularLocale(), { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  protected webhookStatusLabel(row: AdminRow): string {
    const status = this.webhookDisplayStatus(row);
    if (status === 'MATCHED') return this.adminText('webhookStatusSuccess');
    if (status === 'FAILED') return this.adminText('webhookStatusFailed');
    return this.adminText('webhookStatusPending');
  }

  protected webhookStatusClass(row: AdminRow): string {
    const status = this.webhookDisplayStatus(row);
    if (status === 'MATCHED') return 'status-matched';
    if (status === 'FAILED') return 'status-failed';
    return 'status-pending';
  }

  protected statusClass(value: string): string {
    return `status-${value.trim().toLocaleLowerCase('en-US').replace(/_/g, '-')}`;
  }

  protected webhookReconciliationLabel(row: AdminRow): string {
    const state = this.webhookReconciliationState(row);
    if (state === 'MATCHED') return this.adminText('matched');
    if (state === 'MISMATCH') return this.adminText('amountMismatch');
    return this.adminText('pendingReview');
  }

  protected webhookReconciliationClass(row: AdminRow): string {
    const state = this.webhookReconciliationState(row);
    if (state === 'MATCHED') return 'reconcile-matched';
    if (state === 'MISMATCH') return 'reconcile-mismatch';
    return 'reconcile-pending';
  }

  protected webhookRowClass(row: AdminRow): Record<string, boolean> {
    return { 'webhook-row-mismatch': this.webhookReconciliationState(row) === 'MISMATCH' };
  }

  protected webhookExpectedAmountLabel(row: AdminRow): string {
    const expected = this.webhookExpectedAmountCents(row);
    if (!Number.isFinite(expected)) return this.adminText('notAvailable');
    return formatMoney(expected, this.cell(row, 'currency', this.baseCurrency()), this.i18n.angularLocale());
  }

  protected webhookRawJson(row: AdminRow): string {
    const payload = this.firstValue(row, 'sanitized_payload_json,canonical_event_json,vendor_meta_json');
    const value = typeof payload === 'string' ? this.parseUnknownJson(payload) ?? payload : payload ?? row;
    return JSON.stringify(value, null, 2);
  }

  protected async openWebhookDetail(row: AdminRow): Promise<void> {
    const id = this.rowId(row, 'id');
    this.selectedWebhookEvent.set(row);
    if (!id) return;
    try {
      const detail = this.rowsOf(await this.admin.getWebhookEvent(id))[0];
      if (detail) this.selectedWebhookEvent.set(detail);
    } catch (error) {
      this.error.set(this.errorText(error));
    }
  }

  protected closeWebhookDetail(): void {
    this.selectedWebhookEvent.set(null);
  }

  protected productImage(row: AdminRow): string {
    const media = this.mediaItems(row);
    return media[0] ? this.mediaUrl(media[0]) : '';
  }

  protected editableCategories(): AdminRow[] {
    return this.categories().filter((row) => {
      const virtual = String(this.firstValue(row, 'is_virtual') ?? '').toLowerCase();
      return virtual !== '1' && virtual !== 'true' && this.cell(row, 'slug') !== 'uncategorized';
    });
  }

  protected categoryImage(row: AdminRow): string {
    return this.normalizeMediaUrl(this.cell(row, 'image_url,url,public_url', '')) || this.mediaFileUrl(this.cell(row, 'image_media_id,media_id', ''));
  }

  protected mediaId(row: AdminRow): string {
    return this.cell(row, 'media_id,id', '');
  }

  protected mediaUrl(row: AdminRow): string {
    return this.normalizeMediaUrl(this.cell(row, 'url,public_url', '')) || this.mediaFileUrl(this.mediaId(row));
  }

  protected rolesCell(row: AdminRow): string {
    const value = this.firstValue(row, 'roles,role_names,role');
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (Array.isArray(parsed)) return parsed.join(', ');
      } catch {
        return value;
      }
      return value;
    }
    return this.adminText('customerRole');
  }

  protected sharedSkuOptions(): AdminRow[] {
    const bySku = new Map<string, AdminRow>();
    this.sharedAccountPools().forEach((row) => {
      const skuId = this.rowId(row, 'sku_id,id');
      if (!skuId || bySku.has(skuId)) return;
      bySku.set(skuId, {
        ...row,
        id: skuId,
        sku_id: skuId,
        fulfillment_type: 'SHARED',
        status: this.cell(row, 'sku_status,status', 'ACTIVE'),
        name_th: this.cell(row, 'sku_name,name_th', ''),
        name_en: this.cell(row, 'sku_name,name_en', ''),
      });
    });
    return Array.from(bySku.values());
  }

  private async loadRows(
    label: string,
    request: () => Promise<unknown>,
    target: { set: (value: AdminRow[]) => void },
    report: boolean,
  ): Promise<void> {
    if (report) {
      this.clearNotices();
      this.loading.set(label);
    }
    try {
      target.set(this.rowsOf(await request()));
    } catch (error) {
      if (report) this.error.set(this.errorText(error));
      throw error;
    } finally {
      if (report) this.loading.set('');
    }
  }

  private async run(label: string, action: () => Promise<void>): Promise<void> {
    this.clearNotices();
    this.loading.set(label);
    try {
      await action();
    } catch (error) {
      this.error.set(this.errorText(error));
    } finally {
      this.loading.set('');
    }
  }

  private async stepUp(password: string | null | undefined): Promise<string> {
    if (!password) throw new Error(this.adminText('adminPasswordRequired'));
    return (await this.auth.stepUp(password)).step_up_token;
  }

  private async uploadPendingProductImages(): Promise<UploadedProductMedia[]> {
    const files = this.pendingProductImageFiles();
    if (!files.length) return [];
    const uploads: UploadedProductMedia[] = [];
    for (const file of files) {
      uploads.push(await this.mediaApi.uploadFile(file, 'product_image'));
    }
    this.pendingProductImageFiles.set([]);
    this.selectedProductImageUrls.set([]);
    this.selectedProductFileNames.set('');
    return uploads;
  }

  private async uploadPendingCategoryImage(): Promise<UploadedCategoryMedia[]> {
    const files = this.pendingCategoryImageFiles();
    if (!files.length) return [];
    const uploads: UploadedCategoryMedia[] = [];
    uploads.push(await this.mediaApi.uploadFile(files[0], 'category_image'));
    this.pendingCategoryImageFiles.set([]);
    this.selectedCategoryImageUrls.set([]);
    this.selectedCategoryFileNames.set('');
    return uploads;
  }

  private setLinkedCategoryMediaItem(item: AdminRow | null): void {
    this.linkedCategoryMediaItem.set(item);
    this.categoryForm.patchValue({
      image_media_id: item ? this.mediaId(item) : '',
    });
  }

  private addUploadedProductMedia(uploads: UploadedProductMedia[]): void {
    if (!uploads.length) return;
    const currentIds = this.mediaIds(this.productForm.getRawValue().media_ids);
    const existingItems = this.linkedProductMediaItems();
    const uploadedItems = uploads
      .filter((upload) => !currentIds.includes(upload.media_id))
      .map((upload) => ({
        media_id: upload.media_id,
        id: upload.media_id,
        url: upload.url,
        public_url: upload.url,
        purpose: 'product_image',
      }));
    const uploadedIds = uploadedItems.map((item) => String(item['media_id']));
    this.linkedProductMediaItems.set([
      ...uploadedItems,
      ...existingItems.filter((item) => !uploadedIds.includes(this.mediaId(item))),
    ]);
    this.productForm.patchValue({
      media_ids: [
        ...uploadedIds,
        ...currentIds.filter((mediaId) => !uploadedIds.includes(mediaId)),
      ].join(', '),
    });
  }

  private setLinkedProductMediaItems(items: AdminRow[]): void {
    this.linkedProductMediaItems.set(items);
    this.productForm.patchValue({
      media_ids: items
        .map((item) => this.mediaId(item))
        .filter(Boolean)
        .join(', '),
    });
  }

  private async uploadPendingSkuImages(): Promise<UploadedSkuMedia[]> {
    const files = this.pendingSkuImageFiles();
    if (!files.length) return [];
    const uploads: UploadedSkuMedia[] = [];
    for (const file of files) {
      uploads.push(await this.mediaApi.uploadFile(file, 'sku_item_image'));
    }
    this.pendingSkuImageFiles.set([]);
    this.selectedSkuImageUrls.set([]);
    this.selectedSkuFileNames.set('');
    return uploads;
  }

  private addUploadedSkuMedia(uploads: UploadedSkuMedia[]): void {
    if (!uploads.length) return;
    const currentIds = this.currentSkuMediaIds();
    const existingItems = this.linkedSkuMediaItems();
    const uploadedItems = uploads
      .filter((upload) => !currentIds.includes(upload.media_id))
      .map((upload) => ({
        media_id: upload.media_id,
        id: upload.media_id,
        url: upload.url,
        public_url: upload.url,
        purpose: 'sku_item_image',
      }));
    const uploadedIds = uploadedItems.map((item) => String(item['media_id']));
    this.setLinkedSkuMediaItems([
      ...existingItems,
      ...uploadedItems.filter((item) => !existingItems.some((existing) => this.mediaId(existing) === this.mediaId(item))),
    ]);
    this.skuDetailForm.patchValue({
      media_ids: [
        ...currentIds,
        ...uploadedIds.filter((mediaId) => !currentIds.includes(mediaId)),
      ].join(', '),
    });
  }

  private setLinkedSkuMediaItems(items: AdminRow[]): void {
    this.linkedSkuMediaItems.set(items);
    this.skuDetailForm.patchValue({
      media_ids: items
        .map((item) => this.mediaId(item))
        .filter(Boolean)
        .join(', '),
    });
  }

  private patchSiteSettingsForm(rows: AdminRow[]): void {
    const settings = new Map(rows.map((row) => [String(row['setting_key'] ?? row['key'] ?? ''), this.settingValue(row)]));
    const announcement = this.recordValue(settings.get('announcement_banner'));
    const pagination = this.recordValue(settings.get('product_pagination'));
    const social = this.recordValue(settings.get('social_links'));
    const baseCurrency = String(settings.get('base_currency') ?? settings.get('currency') ?? 'THB').toUpperCase();
    const defaultLocale = String(settings.get('default_locale') ?? settings.get('locale') ?? 'th').toLowerCase();
    setGlobalBaseCurrency(baseCurrency);
    this.siteSettingsForm.patchValue({
      site_name: String(settings.get('site_name') ?? 'Khun Phor Baan'),
      seo_meta_title: String(settings.get('seo_meta_title') ?? settings.get('site_name') ?? 'Khun Phor Baan'),
      contact_email: String(settings.get('contact_email') ?? ''),
      base_currency: baseCurrency,
      default_locale: defaultLocale,
      favicon_media_id: String(settings.get('favicon_media_id') ?? ''),
      product_page_size: String(pagination['default_page_size'] ?? '12'),
      allowed_page_sizes: Array.isArray(pagination['allowed_page_sizes']) ? pagination['allowed_page_sizes'].join(',') : '12,24,48',
      announcement_visible: announcement['visible'] === true,
      announcement_text: String(announcement['text'] ?? ''),
      social_facebook: String(social['facebook'] ?? ''),
      social_instagram: String(social['instagram'] ?? ''),
      social_line: String(social['line'] ?? ''),
      social_x: String(social['x'] ?? ''),
      social_youtube: String(social['youtube'] ?? ''),
      social_tiktok: String(social['tiktok'] ?? ''),
      fx_exchange_fee_percent: String(settings.get('fx_exchange_fee_percent') ?? '2.0'),
      fx_min_fee_microcredits: String(settings.get('fx_min_fee_microcredits') ?? '2000000'),
    });
  }

  protected baseCurrency(): string {
    return this.siteSettingsForm.value.base_currency || getGlobalBaseCurrency() || 'THB';
  }

  protected defaultLocale(): string {
    return this.siteSettingsForm.value.default_locale || 'th';
  }

  protected minFeeUnitsDisplay(): string {
    const raw = this.siteSettingsForm.value.fx_min_fee_microcredits;
    const micro = typeof raw === 'number' ? raw : (Number(raw) || 2000000);
    return (micro / 1000000).toFixed(2);
  }

  private settingValue(row: AdminRow): unknown {
    const raw = row['setting_value'] ?? row['value'];
    if (typeof raw !== 'string') return raw;
    const parsed = this.parseUnknownJson(raw);
    return parsed === null ? '' : parsed;
  }

  private recordValue(value: unknown): AdminRow {
    return this.isRow(value) ? value : {};
  }

  private rowsOf(value: unknown): AdminRow[] {
    if (Array.isArray(value)) return value.filter(this.isRow);
    if (!this.isRow(value)) return [];
    const candidates = ['data', 'items', 'rows', 'events', 'settings', 'site_settings', 'webhook_events', 'products', 'categories', 'orders', 'deposits', 'subscriptions', 'users', 'reviews', 'media', 'audit_log', 'payment_methods', 'destination_accounts'];
    for (const key of candidates) {
      const nested = value[key];
      if (Array.isArray(nested)) return nested.filter(this.isRow);
    }
    return [value];
  }

  private firstValue(row: AdminRow, keys: string): unknown {
    for (const key of keys.split(',').map((part) => part.trim())) {
      if (key && row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
    }
    return undefined;
  }

  protected mediaIds(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  protected currentProductMediaIds(): string[] {
    const linkedIds = this.linkedProductMediaItems()
      .map((item) => this.mediaId(item))
      .filter(Boolean);
    if (linkedIds.length) return linkedIds;
    return this.mediaIds(this.productForm.getRawValue().media_ids);
  }

  protected currentSkuMediaIds(): string[] {
    const linkedIds = this.linkedSkuMediaItems()
      .map((item) => this.mediaId(item))
      .filter(Boolean);
    if (linkedIds.length) return linkedIds;
    return this.mediaIds(this.skuDetailForm.getRawValue().media_ids);
  }

  private mediaIdsFromRow(row: AdminRow): string[] {
    const direct = this.firstValue(row, 'media_ids,media_id');
    if (direct !== undefined) return this.mediaIds(direct);
    return this.mediaItems(row)
      .map((item) => String(item['media_id'] ?? item['id'] ?? '').trim())
      .filter(Boolean);
  }

  private mediaItems(row: AdminRow): AdminRow[] {
    const raw = this.firstValue(row, 'media,images');
    const value = typeof raw === 'string' ? this.parseUnknownJson(raw) : raw;
    return Array.isArray(value) ? value.filter(this.isRow) : [];
  }

  private normalizeMediaUrl(value: string): string {
    if (!value || !/^https?:\/\//.test(value)) return value;
    try {
      const url = new URL(value);
      const isLoopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '::1';
      return isLoopback && url.pathname.startsWith('/api/v1/media/files/')
        ? `${url.pathname}${url.search}${url.hash}`
        : value;
    } catch {
      return value;
    }
  }

  private mediaFileUrl(mediaId: string): string {
    const id = String(mediaId ?? '').trim();
    return id ? `/api/v1/media/files/${encodeURIComponent(id)}` : '';
  }

  private skuMediaItems(row: AdminRow): AdminRow[] {
    const raw = this.firstValue(row, 'sku_media,item_media');
    const value = typeof raw === 'string' ? this.parseUnknownJson(raw) : raw;
    return Array.isArray(value) ? value.filter(this.isRow) : [];
  }

  private patchSkuDetailFormFromRow(row: AdminRow): void {
    const mediaItems = this.skuMediaItems(row);
    const specs = this.firstValue(row, 'specs_json,specs');
    this.skuDetailForm.patchValue({
      sku_id: this.rowId(row, 'sku_id,id'),
      summary_th: this.cell(row, 'summary_th', ''),
      summary_en: this.cell(row, 'summary_en', ''),
      description_th: this.cell(row, 'description_th', ''),
      description_en: this.cell(row, 'description_en', ''),
      usage_th: this.cell(row, 'usage_th', ''),
      usage_en: this.cell(row, 'usage_en', ''),
      warranty_th: this.cell(row, 'warranty_th', ''),
      warranty_en: this.cell(row, 'warranty_en', ''),
      specs_json: typeof specs === 'string' ? specs : JSON.stringify(specs ?? {}),
      operator_notes: this.cell(row, 'operator_notes', ''),
      media_ids: mediaItems.map((item) => this.mediaId(item)).filter(Boolean).join(', '),
    });
    this.setLinkedSkuMediaItems(mediaItems);
    this.clearPendingSkuImages();
  }

  private skusFromRow(row: AdminRow): AdminRow[] {
    const raw = this.firstValue(row, 'skus');
    const value = typeof raw === 'string' ? this.parseUnknownJson(raw) : raw;
    return Array.isArray(value) ? value.filter(this.isRow) : [];
  }

  private skuDraftsFromRow(row: AdminRow): AdminSkuDraft[] {
    const raw = this.firstValue(row, 'skus');
    const parsed = typeof raw === 'string' ? this.parseUnknownJson(raw) : raw;
    if (!Array.isArray(parsed)) return [this.defaultSkuDraft(row)];
    const drafts = parsed
      .filter(this.isRow)
      .map((sku) => {
        const fulfillment = String(sku['fulfillment_type'] ?? this.legacyFulfillmentFromProduct(row)).toUpperCase();
        const status = String(sku['status'] ?? 'ACTIVE').toUpperCase();
        return {
          id: String(sku['sku_id'] ?? sku['id'] ?? ''),
          sku_code: String(sku['sku_code'] ?? sku['code'] ?? ''),
          name_th: String(sku['name_th'] ?? sku['name'] ?? ''),
          name_en: String(sku['name_en'] ?? sku['name'] ?? ''),
          price_cents: String(sku['price_cents'] ?? this.cell(row, 'price_cents', '')),
          currency: String(sku['currency'] ?? this.cell(row, 'currency', 'THB')),
          fulfillment_type: fulfillment === 'SHARED' || fulfillment === 'DIGITAL' ? fulfillment : 'PHYSICAL',
          status: status === 'DRAFT' || status === 'ARCHIVED' ? status : 'ACTIVE',
          stock_on_hand: String(sku['stock_on_hand'] ?? sku['on_hand'] ?? ''),
          low_stock_threshold: String(sku['low_stock_threshold'] ?? '0'),
          sku_media: this.skuMediaItems(sku),
        } satisfies AdminSkuDraft;
      });
    return drafts.length ? drafts : [this.defaultSkuDraft(row)];
  }

  private skuDraftFromSearchResult(row: AdminRow, keepId: boolean): AdminSkuDraft {
    const fulfillment = String(this.cell(row, 'fulfillment_type', 'PHYSICAL')).toUpperCase();
    const status = String(this.cell(row, 'status', 'ACTIVE')).toUpperCase();
    return {
      id: keepId ? this.rowId(row, 'sku_id,id') : '',
      sku_code: this.uniqueSkuCode(this.cell(row, 'sku_code', 'SKU-COPY'), keepId ? this.rowId(row, 'sku_id,id') : ''),
      name_th: this.cell(row, 'name_th,sku_name', ''),
      name_en: this.cell(row, 'name_en,sku_name', ''),
      price_cents: this.cell(row, 'price_cents', ''),
      currency: this.cell(row, 'currency', 'THB'),
      fulfillment_type: fulfillment === 'SHARED' || fulfillment === 'DIGITAL' ? fulfillment : 'PHYSICAL',
      status: status === 'DRAFT' || status === 'ARCHIVED' ? status : 'ACTIVE',
      stock_on_hand: this.cell(row, 'on_hand,stock_on_hand', ''),
      low_stock_threshold: this.cell(row, 'low_stock_threshold', '0'),
      sku_media: this.skuMediaItems(row),
    };
  }

  private sharedPoolDraft(row: AdminRow): AdminSkuDraft {
    return {
      id: this.rowId(row, 'sku_id,id'),
      sku_code: this.cell(row, 'sku_code', ''),
      name_th: this.cell(row, 'sku_name,name_th,name', ''),
      name_en: this.cell(row, 'sku_name,name_en,name', ''),
      price_cents: this.cell(row, 'price_cents', '0'),
      currency: this.cell(row, 'currency', 'THB'),
      fulfillment_type: 'SHARED',
      status: this.cell(row, 'sku_status,status', 'ACTIVE') === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
      stock_on_hand: '',
      low_stock_threshold: '0',
      sku_media: this.skuMediaItems(row),
    };
  }

  private productTypeFromRow(row: AdminRow): 'PHYSICAL' | 'DIGITAL' | 'SHARED' {
    if (this.cell(row, 'kind') === 'SHARED') return 'SHARED';
    return 'PHYSICAL';
  }

  private uniqueSkuCode(code: string, existingId = ''): string {
    const normalized = code.trim() || 'SKU-COPY';
    const conflicts = this.skuDrafts().filter((sku) => sku.sku_code === normalized && (!existingId || sku.id !== existingId));
    if (!conflicts.length) return normalized;
    let index = 2;
    let candidate = `${normalized}-COPY`;
    while (this.skuDrafts().some((sku) => sku.sku_code === candidate && (!existingId || sku.id !== existingId))) {
      candidate = `${normalized}-COPY-${index}`;
      index += 1;
    }
    return candidate;
  }

  private defaultSkuDraft(row?: AdminRow): AdminSkuDraft {
    const codeBase = String(row ? this.cell(row, 'slug', '') : this.productForm.getRawValue().slug ?? '').replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
    return {
      id: '',
      sku_code: codeBase ? `${codeBase}-BASE` : '',
      name_th: row ? this.cell(row, 'name_th,name', '') : '',
      name_en: row ? this.cell(row, 'name_en,name', '') : '',
      price_cents: row ? this.cell(row, 'price_cents', '') : String(this.productForm.getRawValue().price_cents ?? ''),
      currency: row ? this.cell(row, 'currency', 'THB') : String(this.productForm.getRawValue().currency ?? 'THB'),
      fulfillment_type: row ? this.legacyFulfillmentFromProduct(row) : 'PHYSICAL',
      status: 'ACTIVE',
      stock_on_hand: row ? this.cell(row, 'stock_on_hand,on_hand', '') : '',
      low_stock_threshold: '0',
    };
  }

  private legacyFulfillmentFromProduct(row: AdminRow): 'PHYSICAL' | 'DIGITAL' | 'SHARED' {
    if (this.cell(row, 'kind') === 'SHARED') return 'SHARED';
    return this.cell(row, 'subkind') === 'DIGITAL' ? 'DIGITAL' : 'PHYSICAL';
  }

  private skuPayload(productPrice: unknown, productCurrency: unknown): Array<Record<string, unknown>> {
    const drafts = this.isSharedProductForm() ? this.sharedSkuDrafts() : this.skuDrafts().filter((sku) => sku.fulfillment_type !== 'SHARED');
    return drafts
      .map((sku, index) => this.cleanObject({
        id: this.numberOrUndefined(sku.id),
        sku_code: sku.sku_code || `SKU-${index + 1}`,
        name_th: sku.name_th,
        name_en: sku.name_en,
        price_cents: this.numberOrUndefined(sku.price_cents) ?? this.numberOrUndefined(productPrice) ?? 0,
        currency: sku.currency || productCurrency || 'THB',
        fulfillment_type: sku.fulfillment_type,
        status: sku.status || 'ACTIVE',
      }))
      .filter((sku) => sku['sku_code']);
  }

  private productCompatibilityFromSkus(): ProductCompatibility {
    const productType = this.productForm.getRawValue().product_type;
    if (productType === 'SHARED') return { kind: 'SHARED', subkind: null };
    const fulfillments = this.nonArchivedSkuDrafts().map((sku) => sku.fulfillment_type);
    if (fulfillments.includes('DIGITAL')) return { kind: 'PRIVATE', subkind: 'DIGITAL' };
    return { kind: 'PRIVATE', subkind: 'PHYSICAL' };
  }

  private hasDigitalSku(): boolean {
    return this.nonArchivedSkuDrafts().some((sku) => sku.fulfillment_type === 'DIGITAL');
  }

  private nonArchivedSkuDrafts(): AdminSkuDraft[] {
    return this.skuDrafts().filter((sku) => sku.status !== 'ARCHIVED');
  }

  private productPriceFromSkus(fallback: unknown): number {
    const firstPricedSku = this.nonArchivedSkuDrafts()
      .map((sku) => this.numberOrUndefined(sku.price_cents))
      .find((price) => price !== undefined);
    return firstPricedSku ?? this.numberOrUndefined(fallback) ?? 0;
  }

  private productCurrencyFromSkus(): string {
    return this.nonArchivedSkuDrafts().find((sku) => sku.currency)?.currency || this.baseCurrency();
  }

  private webhookRowMatches(row: AdminRow): boolean {
    const search = this.webhookSearch().toLowerCase();
    if (search) {
      const haystack = [
        this.cell(row, 'provider_event_id,provider_transaction_id,id', ''),
        this.cell(row, 'transaction_ref,payload_hash', ''),
        this.cell(row, 'matched_order_id,matched_deposit_id,matched_payment_bill_id', ''),
      ].join(' ').toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    const status = this.webhookStatusFilter();
    if (status !== 'ALL' && this.webhookDisplayStatus(row) !== status) return false;
    const reconciliation = this.webhookMismatchFilter();
    if (reconciliation !== 'ALL' && this.webhookReconciliationState(row) !== reconciliation) return false;
    const timestamp = this.webhookTimestamp(row);
    if (this.webhookFromDate()) {
      const from = new Date(`${this.webhookFromDate()}T00:00:00`);
      if (timestamp && timestamp < from) return false;
    }
    if (this.webhookToDate()) {
      const to = new Date(`${this.webhookToDate()}T23:59:59`);
      if (timestamp && timestamp > to) return false;
    }
    return true;
  }

  private webhookDisplayStatus(row: AdminRow): 'MATCHED' | 'FAILED' | 'PENDING' {
    const lifecycle = this.cell(row, 'lifecycle_status,status', '').toUpperCase();
    const signature = this.cell(row, 'signature_status', '').toUpperCase();
    const replay = this.cell(row, 'replay_window_status', '').toUpperCase();
    if (lifecycle === 'MATCHED') return 'MATCHED';
    if (['FAILED', 'REJECTED', 'UNMATCHED', 'AMBIGUOUS_MATCH', 'MANUAL_INTERVENTION_REQUIRED'].includes(lifecycle)) return 'FAILED';
    if (signature === 'INVALID' || replay === 'EXPIRED' || replay === 'FUTURE') return 'FAILED';
    return 'PENDING';
  }

  private webhookReconciliationState(row: AdminRow): WebhookMismatchFilter {
    const received = this.numberOrUndefined(this.firstValue(row, 'amount_cents,amount'));
    const expected = this.webhookExpectedAmountCents(row);
    if (!Number.isFinite(received) || !Number.isFinite(expected)) return 'PENDING';
    return received === expected ? 'MATCHED' : 'MISMATCH';
  }

  private webhookExpectedAmountCents(row: AdminRow): number {
    const direct = this.numberOrUndefined(this.firstValue(row, 'expected_amount_cents,expected_unique_amount_cents,unique_amount_cents'));
    if (direct !== undefined) return direct;
    const depositId = this.rowId(row, 'matched_deposit_id,deposit_id');
    if (!depositId) return Number.NaN;
    const deposit = this.deposits().find((candidate) => this.rowId(candidate, 'id,deposit_id') === depositId);
    return this.numberOrUndefined(this.firstValue(deposit ?? {}, 'unique_amount_cents,total_amount_cents,amount_cents')) ?? Number.NaN;
  }

  private webhookTimestamp(row: AdminRow): Date | null {
    const raw = this.firstValue(row, 'received_at,occurred_at,processed_at,updated_at');
    if (!raw) return null;
    const date = new Date(String(raw));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private parseUnknownJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }

  private cleanObject(value: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''),
    );
  }

  private numberOrUndefined(value: unknown): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : undefined;
  }

  private localeValue(value: string): 'th' | 'en' {
    return value === 'en' ? 'en' : 'th';
  }

  private numberOrDefault(value: unknown, fallback: number): number {
    return this.numberOrUndefined(value) ?? fallback;
  }

  private slugFromText(value: string): string {
    const slug = value
      .normalize('NFKC')
      .toLocaleLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .replace(/-{2,}/g, '-')
      .slice(0, 120);
    return slug || `subscription-${Date.now().toString(36)}`;
  }

  private sumRows(rows: AdminRow[], keys: string): number {
    return rows.reduce((total, row) => total + this.numberOrDefault(this.firstValue(row, keys), 0), 0);
  }

  private generateSharedSkuCodeIfManaged(): void {
    const raw = this.sharedSkuForm.getRawValue();
    const brand = String(raw.brand ?? '');
    const suffix = String(raw.sku_suffix ?? '');
    const poolName = String(raw.pool_name ?? '');
    const cadence = this.billingCadenceValue(raw.billing_cadence ?? '1M');
    const currentCode = String(raw.sku_code ?? '').trim();
    const nextCode = this.sharedSkuCodeFromPool(brand, suffix, poolName, cadence);
    if (!nextCode) return;
    const previousGeneratedCode = this.generatedSharedSkuCode();
    if (!currentCode || currentCode === previousGeneratedCode) {
      this.sharedSkuForm.patchValue({ sku_code: nextCode });
      this.generatedSharedSkuCode.set(nextCode);
    }
  }

  private generatePrivateSkuCodeIfManaged(): void {
    const raw = this.privateSkuForm.getRawValue();
    const currentCode = String(raw.sku_code ?? '').trim();
    const nextCode = this.privateSkuCodeFromForm();
    if (!nextCode) return;
    const previousGeneratedCode = this.generatedPrivateSkuCode();
    if (!currentCode || currentCode === previousGeneratedCode) {
      this.privateSkuForm.patchValue({ sku_code: nextCode });
      this.generatedPrivateSkuCode.set(nextCode);
    }
  }

  private sharedSkuCodeFromPool(brand: string, suffix: string, poolName: string, cadence: string): string {
    const brandToken = this.skuToken(brand || 'GEN');
    let suffixToken = this.skuToken(suffix || poolName || 'POOL');
    if (suffixToken.startsWith(`${brandToken}_`)) suffixToken = suffixToken.slice(brandToken.length + 1);
    if (!suffixToken || suffixToken === brandToken) suffixToken = 'POOL';
    return `SH_SUB_${brandToken}_${suffixToken}_${this.billingCadenceValue(cadence)}`;
  }

  private privateSkuCodeFromForm(): string {
    const raw = this.privateSkuForm.getRawValue();
    const fulfillment = String(raw.fulfillment_type ?? 'PHYSICAL');
    const digitalKind = String(raw.digital_sku_kind ?? 'CDKEY') === 'ACTIVATION_LINK' ? 'ACTIVATION_LINK' : 'CDKEY';
    const prefix = fulfillment === 'DIGITAL'
      ? digitalKind === 'ACTIVATION_LINK' ? 'PV_AVL' : 'PV_CDK'
      : 'PV_PHY';
    const brandToken = this.skuToken(String(raw.brand ?? '') || 'GEN');
    const suffixToken = this.skuToken(String(raw.sku_suffix ?? '') || String(raw.name_en ?? '') || String(raw.name_th ?? '') || 'ITEM');
    return `${prefix}_${brandToken}_${suffixToken}`;
  }

  private skuToken(value: string): string {
    const token = value
      .normalize('NFKC')
      .toLocaleUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(/_{2,}/g, '_');
    return token || 'GEN';
  }

  private billingCadenceValue(value: string | null | undefined): string {
    const cadence = String(value ?? '').toLocaleUpperCase();
    return this.validBillingCadence(cadence) ? cadence : '1M';
  }

  private validBillingCadence(value: string): boolean {
    return /^([1-9]|1[0-9]|2[0-4])M$/.test(value);
  }

  private isExpiringSoon(value: string): boolean {
    if (!value || value === '-') return false;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return false;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    return date.getTime() >= Date.now() && date.getTime() - Date.now() <= sevenDaysMs;
  }

  private ensureSharedWorkspaceSelection(): void {
    const options = this.sharedSkuOptions();
    if (!options.length) {
      this.selectedSharedSkuId.set('');
      this.selectedSharedAccountId.set('');
      return;
    }
    const currentSkuId = this.selectedSharedSkuId();
    const nextSkuId = options.some((sku) => this.rowId(sku, 'sku_id,id') === currentSkuId)
      ? currentSkuId
      : this.rowId(options[0], 'sku_id,id');
    this.selectedSharedSkuId.set(nextSkuId);
    if (!this.sharedAccountForm.getRawValue().sku_id) this.sharedAccountForm.patchValue({ sku_id: nextSkuId });
  }

  private toDateTimeLocal(value: string): string {
    if (!value || value === '-') return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (part: number) => String(part).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  private requireNumber(value: unknown, label: string): number {
    const number = this.numberOrUndefined(value);
    if (number === undefined) throw new Error(this.adminText('fieldRequired', { field: label }));
    return number;
  }

  private confirm(message: string): boolean {
    return typeof globalThis.confirm !== 'function' || globalThis.confirm(message);
  }

  private clearNotices(): void {
    this.error.set('');
    this.message.set('');
  }

  private errorText(error: unknown): string {
    return error instanceof Error ? error.message : apiErrorMessage(error);
  }

  private isRow(value: unknown): value is AdminRow {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
