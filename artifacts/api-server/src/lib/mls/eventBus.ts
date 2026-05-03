import { EventEmitter } from "events";

/**
 * Internal in-process event bus for MLS-derived events.
 *
 * Downstream subscribers (Task #3 site renderer, Task #4 billing lifecycle)
 * import this singleton and `.on("listing.status_changed", handler)`.
 *
 * For Phase 2 horizontal scaling this can be swapped for a pub/sub backend
 * (Redis Streams, NATS, etc.) without changing emitter call sites.
 */
export type ListingStatusChangedEvent = {
  listingId: string;
  mlsListingId: string | null;
  fromStatus: string | null;
  toStatus: string;
  source: "mls" | "manual" | "stripe";
  occurredAt: Date;
};

export type ListingUpsertedEvent = {
  listingId: string;
  mlsListingId: string | null;
  isNew: boolean;
  changedFields: string[];
};

export type EventMap = {
  "listing.status_changed": (e: ListingStatusChangedEvent) => void;
  "listing.upserted": (e: ListingUpsertedEvent) => void;
};

class TypedEventBus extends EventEmitter {
  override on<K extends keyof EventMap>(event: K, listener: EventMap[K]): this {
    return super.on(event, listener);
  }
  override emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>): boolean {
    return super.emit(event, ...args);
  }
  override off<K extends keyof EventMap>(event: K, listener: EventMap[K]): this {
    return super.off(event, listener);
  }
}

export const mlsEventBus = new TypedEventBus();
mlsEventBus.setMaxListeners(50);
