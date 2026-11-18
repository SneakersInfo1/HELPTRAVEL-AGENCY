import type { ExistingContent } from "@/lib/content-quality/gate";

import type { FactClaim } from "./schema";
import { RENDERED_CONTENT_TYPES } from "./site-content";
import type { ContentStore } from "./store";

export interface SiteInventory {
  existing(): ExistingContent[];
  isKnownRoute(path: string): boolean;
  hasEnrichment(canonicalUrl: string): boolean;
  enrichmentVerifiedAt(canonicalUrl: string): string | null;
  /** Opcjonalny szczegół pozwala selektorowi stosować TTL właściwy dla klasy danych. */
  enrichmentClaims?(canonicalUrl: string): readonly FactClaim[];
}

export interface FixtureEnrichment {
  canonicalUrl: string;
  verifiedAt: string;
  claims?: readonly FactClaim[];
}

export interface FixtureInventoryOptions {
  existing?: readonly ExistingContent[];
  knownRoutes?: readonly string[];
  enrichments?: readonly FixtureEnrichment[];
}

export class FixtureInventory implements SiteInventory {
  private readonly content: ExistingContent[];
  private readonly routes: Set<string>;
  private readonly enrichments: Map<string, FixtureEnrichment>;

  constructor(options?: FixtureInventoryOptions | readonly ExistingContent[], knownRoutes: readonly string[] = [], enrichments: readonly FixtureEnrichment[] = []) {
    const resolved: FixtureInventoryOptions = Array.isArray(options)
      ? { existing: options, knownRoutes, enrichments }
      : ((options as FixtureInventoryOptions | undefined) ?? {});
    this.content = [...(resolved.existing ?? [])];
    this.routes = new Set([...(resolved.knownRoutes ?? []), ...this.content.map((item) => item.canonicalUrl)]);
    this.enrichments = new Map((resolved.enrichments ?? []).map((entry) => [entry.canonicalUrl, entry]));
  }

  existing(): ExistingContent[] {
    return this.content.map((item) => ({ ...item }));
  }

  isKnownRoute(route: string): boolean {
    return this.routes.has(route);
  }

  hasEnrichment(canonicalUrl: string): boolean {
    return this.enrichments.has(canonicalUrl);
  }

  enrichmentVerifiedAt(canonicalUrl: string): string | null {
    return this.enrichments.get(canonicalUrl)?.verifiedAt ?? null;
  }

  enrichmentClaims(canonicalUrl: string): readonly FactClaim[] {
    return this.enrichments.get(canonicalUrl)?.claims ?? [];
  }
}

export class StoreBackedInventory implements SiteInventory {
  private stored = [] as Awaited<ReturnType<ContentStore["listDocuments"]>>;

  constructor(
    private readonly base: SiteInventory,
    private readonly store: ContentStore,
  ) {}

  static async create(base: SiteInventory, store: ContentStore): Promise<StoreBackedInventory> {
    const inventory = new StoreBackedInventory(base, store);
    await inventory.refresh();
    return inventory;
  }

  async refresh(): Promise<void> {
    this.stored = await this.store.listDocuments();
  }

  private renderedStored() {
    return this.stored.filter((document) => RENDERED_CONTENT_TYPES.has(document.contentType));
  }

  existing(): ExistingContent[] {
    const merged = new Map(this.base.existing().map((item) => [item.canonicalUrl, { ...item }]));
    for (const document of this.renderedStored()) {
      const previous = merged.get(document.canonicalUrl);
      merged.set(document.canonicalUrl, {
        canonicalUrl: document.canonicalUrl,
        title: previous?.title ?? document.title,
        h1: previous?.h1,
        lead: previous?.lead ?? document.lead,
      });
    }
    return [...merged.values()];
  }

  isKnownRoute(route: string): boolean {
    return this.base.isKnownRoute(route) || this.renderedStored().some((document) => document.canonicalUrl === route);
  }

  hasEnrichment(canonicalUrl: string): boolean {
    return this.base.hasEnrichment(canonicalUrl) || this.renderedStored().some((document) => document.canonicalUrl === canonicalUrl);
  }

  enrichmentVerifiedAt(canonicalUrl: string): string | null {
    const storedDates = this.renderedStored().filter((document) => document.canonicalUrl === canonicalUrl).map((document) => document.verifiedAt);
    const baseDate = this.base.enrichmentVerifiedAt(canonicalUrl);
    const dates = [...storedDates, ...(baseDate ? [baseDate] : [])].sort();
    return dates.at(-1) ?? null;
  }

  enrichmentClaims(canonicalUrl: string): readonly FactClaim[] {
    const claims = this.renderedStored().filter((document) => document.canonicalUrl === canonicalUrl).flatMap((document) => document.factClaims);
    return claims.length > 0 ? claims : (this.base.enrichmentClaims?.(canonicalUrl) ?? []);
  }
}

