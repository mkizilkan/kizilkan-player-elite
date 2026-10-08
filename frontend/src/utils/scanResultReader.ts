export type ScanResultPage = { runId: string; matches: any[]; nextCursor: number; total: number; hasMore: boolean };

/** One reader per consumer; the cursor advances only after the UI accepted a page. */
export function createScanResultReader(read: (runId: string, cursor: number, limit: number) => Promise<ScanResultPage>) {
  const cursors = new Map<string, number>();
  let queue: Promise<void> = Promise.resolve();
  const deliver = (runId: string, drain: boolean, accept: (rows: any[]) => void | Promise<void>, alive = () => true): Promise<void> => {
    const task = queue.catch(() => {}).then(async () => {
      if (!runId || !alive()) return;
      do {
        const cursor = cursors.get(runId) || 0;
        const page = await read(runId, cursor, 100);
        if (!alive()) return;
        if (page.runId !== runId || page.nextCursor < cursor || (page.hasMore && page.nextCursor === cursor)) throw new Error('Kalıcı tarama cursor doğrulanamadı.');
        await accept(page.matches);
        cursors.set(runId, page.nextCursor);
        if (!drain || !page.hasMore) break;
        // Give React/abort callbacks time to run between bounded bridge pages.
        await new Promise<void>(resolve => setTimeout(resolve, 0));
      } while (alive());
    });
    queue = task;
    return task;
  };
  return Object.assign(deliver, { reset: (runId?: string) => { if (runId) cursors.delete(runId); else cursors.clear(); } });
}
