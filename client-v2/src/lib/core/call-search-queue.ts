import type { LclFilters } from './types.ts';

interface SearchRequest {
	filters: LclFilters;
	generation: number;
	replace: boolean;
}

//* LCL has no request IDs, so drain a superseded response before sending the latest search.
export class CallSearchQueue {
	private generation = 0;
	private snapshot: LclFilters | null = null;
	private outstanding: SearchRequest | null = null;
	private pending: SearchRequest | null = null;

	search(filters: LclFilters): LclFilters | null {
		this.snapshot = structuredClone(filters);
		this.pending = { filters: { ...this.snapshot, offset: 0 }, generation: ++this.generation, replace: true };
		return this.outstanding ? null : this.sendPending();
	}

	page(offset: number): LclFilters | null {
		if (!this.snapshot || this.outstanding || this.pending) return null;
		this.outstanding = { filters: { ...this.snapshot, offset }, generation: this.generation, replace: false };
		return structuredClone(this.outstanding.filters);
	}

	complete(): { accepted: boolean; replace: boolean; next: LclFilters | null } {
		const completed = this.outstanding;
		if (!completed) return { accepted: false, replace: false, next: null };
		this.outstanding = null;
		return { accepted: completed.generation === this.generation, replace: completed.replace, next: this.sendPending() };
	}

	reset() {
		this.outstanding = null;
		this.pending = null;
		this.snapshot = null;
		this.generation++;
	}

	private sendPending(): LclFilters | null {
		if (!this.pending) return null;
		this.outstanding = this.pending;
		this.pending = null;
		return structuredClone(this.outstanding.filters);
	}
}
