interface SavedOrderRequest {
  key: string;
  input: { worldId: string; instrumentId: string; side: 'buy' | 'sell'; amountILS: string };
}

// the server applies the same rule; this check only gives a faster message.
export function isOrderAmount(value: string) {
  return /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(value) && Number(value) > 0;
}

export function parseOrderDraft(value: string | null): SavedOrderRequest | null {
  if (!value) return null;
  const draft = JSON.parse(value) as SavedOrderRequest;
  if (
    !draft ||
    !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(draft.key) ||
    typeof draft.input?.worldId !== 'string' ||
    !draft.input.worldId ||
    typeof draft.input.instrumentId !== 'string' ||
    !draft.input.instrumentId ||
    !['buy', 'sell'].includes(draft.input.side) ||
    typeof draft.input.amountILS !== 'string' ||
    !isOrderAmount(draft.input.amountILS)
  ) {
    throw new Error('Unreadable saved request. Check Orders before clearing this local draft.');
  }
  return draft;
}

export function orderBlockReason(input: {
  ready: boolean;
  storageProblem: boolean;
  savedWorldId?: string;
  worldId?: string;
  advancing: boolean;
  finished: boolean;
  hasExecution: boolean;
  pendingSell: boolean;
  side: 'buy' | 'sell';
  availableCash: number | undefined;
  amount: number;
  units: number;
}): string | null {
  if (input.storageProblem)
    return 'A saved request cannot be read. Check Orders, then clear the unreadable local draft below.';
  if (!input.ready) return 'Restoring your saved request. Trading will be available when this finishes.';
  if (input.savedWorldId && input.savedWorldId !== input.worldId)
    return 'This saved request belongs to an older world. Its accepted orders remain there; clear only the local draft to trade in this world.';
  if (input.advancing)
    return 'The server is synchronizing market events. Trading resumes automatically when it finishes. Refresh status, or ask an administrator to resume a stopped job.';
  if (input.savedWorldId) return null;
  if (input.finished)
    return 'This historical price period has ended. An administrator can create a separate world; existing accounts and results stay saved.';
  if (!input.hasExecution)
    return 'No later execution event remains for this asset. Choose another asset, or ask an administrator to start a separate historical world.';
  if (input.pendingSell)
    return 'Units are reserved for a pending sell. Follow that order before submitting another sell for this asset.';
  if (input.side === 'sell' && input.units <= 0)
    return 'You do not own units of this asset. Choose an existing holding to sell.';
  if (input.side === 'buy' && input.availableCash !== undefined && input.amount > input.availableCash)
    return 'The amount exceeds available cash. Lower it; money reserved for pending buys cannot be spent twice.';
  return null;
}
