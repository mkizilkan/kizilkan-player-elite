// Abstract base for the storage wrapper — shared types + helpers.
// Concrete implementations live in index.ts (native) and index.web.ts (web).

export type StorageItemKey = string;
export type StorageItemValue = string | number | boolean | null;

// Helper for subclasses to enforce that they don't declare methods beyond
// StorageBase. Use as: type _ = AssertNoExtras<Exclude<keyof Storage, keyof StorageBase>>;
export type AssertNoExtras<T extends never> = T;

export abstract class StorageBase {
  protected warn(op: string, key: StorageItemKey, e: unknown) {
    console.warn(`[storage] ${op}(${key}) failed`, e);
  }

  // raw is whatever AsyncStorage / SecureStore returned: a JSON-encoded string
  // (because setItem always JSON.stringifies) or null if the key was missing.
  // We always JSON.parse so values round-trip correctly across types.
  protected retrieve<Fallback extends StorageItemValue>(
    raw: string | null,
    fallback: Fallback,
  ): Fallback | null {
    if (raw === null) return fallback;
    try {
      return JSON.parse(raw) as Fallback;
    } catch (e) {
      this.warn("retrieve", "parse error", e);
      return fallback;
    }
  }

  /** Critical metadata reads distinguish an absent key from corrupt/unreadable data. */
  protected retrieveStrict<Fallback extends StorageItemValue>(raw: string | null, fallback: Fallback): Fallback | null {
    if (raw === null) return fallback;
    if (typeof raw !== "string") throw new Error("Yerel kayıt veri tipi geçersiz.");
    let value: unknown;
    try { value = JSON.parse(raw); }
    catch { throw new Error("Yerel kayıt biçimi bozuk."); }
    const primitive = value === null || typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value));
    if (!primitive || (fallback !== null && typeof value !== typeof fallback) || (fallback !== null && value === null)) throw new Error("Yerel kayıt veri tipi geçersiz.");
    return value as Fallback | null;
  }

  abstract getItem<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null>;
  abstract getItemStrict<Fallback extends StorageItemValue>(key: string, fallback: Fallback): Promise<Fallback | null>;
  abstract setItem<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean>;
  abstract removeItem(key: string): Promise<boolean>;
  abstract secureGet<Fallback extends StorageItemValue>(
    key: string,
    fallback: Fallback,
  ): Promise<Fallback | null>;
  abstract secureSet<Value extends StorageItemValue>(
    key: string,
    value: Value,
  ): Promise<boolean>;
  abstract secureRemove(key: string): Promise<boolean>;
}
