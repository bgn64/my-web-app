type SaveResult = {
	ok: true;
} | {
	ok: false;
	error: string;
};
type SaveScore = (hole: number, strokes: number | null) => Promise<SaveResult>;
export type StatMutation = {
	statId: number;
	hole: number;
	kind: "number";
	value: number | null;
	revision: number;
} | {
	statId: number;
	hole: number;
	kind: "boolean";
	value: boolean | null;
	revision: number;
};
type SaveStat = (mutation: StatMutation) => Promise<SaveResult>;
type Mutation = {
	type: "score";
	hole: number;
	strokes: number | null;
} | {
	type: "stat";
	stat: StatMutation;
};
type Snapshot = {
	hasUnsavedChanges: boolean;
	error: string | null;
};

/** Serializes round writes and retains failed or superseded edits for retry. */
export class ScoreSaveQueue
{
	private readonly saveScore: SaveScore;
	private readonly saveStat?: SaveStat;
	private readonly mutations = new Map<string, Mutation>();
	private readonly listeners = new Set<() => void>();
	private snapshot: Snapshot = {
		hasUnsavedChanges: false,
		error: null,
	};
	private worker: Promise<void> | null = null;
	private paused = false;

	constructor(saveScore: SaveScore, saveStat?: SaveStat)
	{
		this.saveScore = saveScore;
		this.saveStat = saveStat;
	}

	getSnapshot = () => this.snapshot;

	subscribe = (listener: () => void) =>
	{
		this.listeners.add(listener);

		return () =>
		{
			this.listeners.delete(listener);
		};
	};

	enqueue(hole: number, strokes: number | null)
	{
		this.put(`score:${hole}`, {
			type: "score",
			hole,
			strokes,
		});
	}

	enqueueStat(stat: StatMutation)
	{
		if (!this.saveStat)
		{
			throw new Error("Stat saving is not configured.");
		}

		this.put(`stat:${stat.statId}:${stat.hole}`, {
			type: "stat",
			stat: { ...stat },
		});
	}

	private put(key: string, mutation: Mutation)
	{
		this.mutations.delete(key);
		this.mutations.set(key, mutation);
		this.publish();
		this.start();
	}

	retry()
	{
		this.publish(null);
		this.start();
	}

	async flush()
	{
		this.start();

		while (this.worker)
		{
			await this.worker;
		}

		return this.mutations.size === 0;
	}

	async pause()
	{
		this.paused = true;

		while (this.worker)
		{
			await this.worker;
		}
	}

	resume()
	{
		this.paused = false;
		this.start();
	}

	discardPending()
	{
		if (!this.paused || this.worker)
		{
			throw new Error("Pause score saving before discarding pending changes.");
		}

		this.mutations.clear();
		this.publish(null);
	}

	private publish(error = this.snapshot.error)
	{
		const hasUnsavedChanges = this.mutations.size > 0;

		if (hasUnsavedChanges === this.snapshot.hasUnsavedChanges && error === this.snapshot.error)
		{
			return;
		}

		this.snapshot = {
			hasUnsavedChanges,
			error,
		};

		for (const listener of this.listeners)
		{
			listener();
		}
	}

	private start()
	{
		if (this.worker || this.paused || this.snapshot.error || !this.mutations.size)
		{
			return;
		}

		this.worker = this.drain().finally(() =>
		{
			this.worker = null;
			this.start();
		});
	}

	private async drain()
	{
		while (!this.paused && !this.snapshot.error)
		{
			const next = this.mutations.entries().next().value;

			if (!next)
			{
				return;
			}

			const [key, mutation] = next;

			try
			{
				if (mutation.type === "stat" && !this.saveStat)
				{
					throw new Error("Stat saving is not configured.");
				}

				const result = mutation.type === "score"
					? await this.saveScore(mutation.hole, mutation.strokes)
					: await this.saveStat?.(mutation.stat);

				if (!result || !result.ok)
				{
					this.publish(result?.error ?? "Stat saving is not configured.");
					return;
				}
			}
			catch (error)
			{
				const label = mutation.type === "score" ? "score" : "stat";
				console.error(`Could not save ${label}:`, error);
				this.publish(`${label === "score" ? "Score" : "Stat"} not saved. Check your connection and try again.`);
				return;
			}

			const current = this.mutations.get(key);

			// An acknowledgment may only clear an equivalent pending value.
			if (current && equivalentMutation(current, mutation))
			{
				this.mutations.delete(key);
			}

			this.publish();
		}
	}
}

function equivalentMutation(left: Mutation, right: Mutation)
{
	if (left.type === "score" && right.type === "score")
	{
		return left.hole === right.hole && left.strokes === right.strokes;
	}

	if (left.type === "stat" && right.type === "stat")
	{
		return left.stat.statId === right.stat.statId &&
			left.stat.hole === right.stat.hole &&
			left.stat.kind === right.stat.kind &&
			left.stat.value === right.stat.value &&
			left.stat.revision === right.stat.revision;
	}

	return false;
}
