const ADULT_WORDS = [
  "+18", "18+", "xxx", "adult", "adults", "erotik", "erotic",
  "porno", "porn", "playboy", "mature", "sex", "seks",
];

type AdultCandidate = {
  name?: unknown; group?: unknown; category?: unknown; genre?: unknown;
  isAdult?: boolean;
};

/**
 * GPT ELITE v12.6.0
 * Önceki sürüm 50-100 bin öğeyi açılış/kayıt sırasında tek senkron döngüde
 * tarıyordu. Bu JS thread'i kilitleyebiliyordu. Buradaki hızlı normalizasyon
 * yalnızca öğe gerçekten kontrol edilirken çalışır; arka plan ön-ısıtması ise
 * scheduleAdultFlags ile küçük batch'ler halinde event-loop'a yield eder.
 */
function fastNorm(v: unknown): string {
  return String(v ?? "")
    .toLocaleLowerCase("tr")
    .replace(/[._\-|/\\()[\]{}:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectAdult(item: AdultCandidate): boolean {
  const hay = ` ${fastNorm(item.name)} ${fastNorm(item.group)} ${fastNorm(item.category)} ${fastNorm(item.genre)} `;
  for (let i = 0; i < ADULT_WORDS.length; i += 1) {
    const word = ADULT_WORDS[i];
    if (word === "+18" || word === "18+") {
      if (hay.includes(word)) return true;
    } else if (hay.includes(` ${word} `)) {
      return true;
    }
  }
  return false;
}

/** İlk okumada hesaplar ve nesne üzerinde cache'ler. Sonraki toggle O(1). */
export function isAdultContent(item: AdultCandidate): boolean {
  if (typeof item?.isAdult === "boolean") return item.isAdult;
  const value = detectAdult(item || {});
  if (item && typeof item === "object") item.isAdult = value;
  return value;
}

/**
 * Senkron API geriye dönük uyumluluk için korunur; kritik açılış/kayıt yolları
 * v12.6.0'dan itibaren bunu çağırmaz.
 */
export function prepareAdultFlags<T extends AdultCandidate>(items: T[] | undefined | null): T[] {
  const list = items || [];
  for (let i = 0; i < list.length; i += 1) {
    if (typeof list[i]?.isAdult !== "boolean") list[i].isAdult = detectAdult(list[i]);
  }
  return list;
}

export type AdultIndexProgress = { done: number; total: number };


/**
 * UI thread'i uzun süre bloke etmeden +18 cache'ini önceden hazırlar.
 * Varsayılan 300 öğe/batch; her batch sonrasında event-loop'a bırakır.
 * Fire-and-forget kullanılmak üzere tasarlanmıştır; playlist açılışı/kaydı bunu
 * ASLA await etmez.
 */
export async function prepareAdultFlagsAsync<T extends AdultCandidate>(
  items: T[] | undefined | null,
  opts?: { batchSize?: number; onProgress?: (p: AdultIndexProgress) => void },
): Promise<T[]> {
  const list = items || [];
  const batchSize = Math.max(50, Math.min(Number(opts?.batchSize) || 300, 2000));
  let index = 0;
  while (index < list.length) {
    const end = Math.min(index + batchSize, list.length);
    for (; index < end; index += 1) {
      if (typeof list[index]?.isAdult !== "boolean") list[index].isAdult = detectAdult(list[index]);
    }
    opts?.onProgress?.({ done: index, total: list.length });
    if (index < list.length) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return list;
}

/** Üç IPTV koleksiyonunu arka planda sırayla ön-ısıtır. */
export function scheduleAdultFlags(
  channels?: AdultCandidate[] | null,
  vod?: AdultCandidate[] | null,
  series?: AdultCandidate[] | null,
): void {
  const run = async () => {
    await prepareAdultFlagsAsync(channels, { batchSize: 300 });
    await prepareAdultFlagsAsync(vod, { batchSize: 300 });
    await prepareAdultFlagsAsync(series, { batchSize: 300 });
  };
  setTimeout(() => { void run(); }, 750);
}
