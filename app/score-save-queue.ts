type SaveResult = { ok: true } | { ok: false; error: string };
type SaveScore = (hole: number, strokes: number | null) => Promise<SaveResult>;
type Snapshot = { hasUnsavedChanges: boolean; error: string | null };

export class ScoreSaveQueue {
  private readonly saveScore: SaveScore;
  private readonly scores = new Map<number, number | null>();
  private readonly listeners = new Set<() => void>();
  private snapshot: Snapshot = { hasUnsavedChanges: false, error: null };
  private worker: Promise<void> | null = null;
  private paused = false;

  constructor(saveScore: SaveScore) {
    this.saveScore = saveScore;
  }

  getSnapshot = () => this.snapshot;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  enqueue(hole: number, strokes: number | null) {
    this.scores.delete(hole);
    this.scores.set(hole, strokes);
    this.publish();
    this.start();
  }

  retry() {
    this.publish(null);
    this.start();
  }

  async flush() {
    this.start();
    while (this.worker) await this.worker;
    return this.scores.size === 0;
  }

  async pause() {
    this.paused = true;
    while (this.worker) await this.worker;
  }

  resume() {
    this.paused = false;
    this.start();
  }

  discardPending() {
    if (!this.paused || this.worker) {
      throw new Error("Pause score saving before discarding pending changes.");
    }
    this.scores.clear();
    this.publish(null);
  }

  private publish(error = this.snapshot.error) {
    const hasUnsavedChanges = this.scores.size > 0;
    if (hasUnsavedChanges === this.snapshot.hasUnsavedChanges && error === this.snapshot.error) return;
    this.snapshot = { hasUnsavedChanges, error };
    for (const listener of this.listeners) listener();
  }

  private start() {
    if (this.worker || this.paused || this.snapshot.error || !this.scores.size) return;
    this.worker = this.drain().finally(() => {
      this.worker = null;
      this.start();
    });
  }

  private async drain() {
    while (!this.paused && !this.snapshot.error) {
      const next = this.scores.entries().next().value;
      if (!next) return;
      const [hole, strokes] = next;
      try {
        const result = await this.saveScore(hole, strokes);
        if (!result.ok) {
          this.publish(result.error);
          return;
        }
      } catch (error) {
        console.error("Could not save score:", error);
        this.publish("Score not saved. Check your connection and try again.");
        return;
      }
      // An older acknowledgment must not clear a newer score for this hole.
      if (this.scores.get(hole) === strokes) this.scores.delete(hole);
      this.publish();
    }
  }
}
