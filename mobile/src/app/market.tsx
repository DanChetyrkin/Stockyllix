import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { api, ApiError, errorMessage } from '@/api/client';
import { Instrument, MarketResponse, Order, OrderInput, PortfolioResponse, Side } from '@/api/types';
import { AppShell } from '@/components/AppShell';
import { InstrumentInsights } from '@/components/market/InstrumentInsights';
import { WatchlistPanel } from '@/components/market/WatchlistPanel';
import { MarketModes } from '@/components/market/MarketModes';
import { ExecutionTiming } from '@/components/market/ExecutionTiming';
import { Badge, Button, Card, CardTitle, Copy, DataState, Empty, Eyebrow, Field, Notice, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useAuth } from '@/context/AuthContext';
import { useGame } from '@/context/GameContext';
import { useTheme } from '@/context/ThemeContext';
import { useApi } from '@/hooks/use-api';
import { assetPrice, dateTime, money, number, observationDate, percent } from '@/utils/format';
import { dailyChangeValue, sortMarketAssets, type MarketSort, type SortDirection } from '@/utils/market-sort';
import { isOrderAmount, orderBlockReason, parseOrderDraft } from '@/utils/order-draft';

interface SavedRequest { key: string; input: OrderInput }

export default function MarketScreen() {
  const { palette } = useTheme();
  const ui = useThemedStyles();
  const market = useApi<MarketResponse>('/market');
  const portfolio = useApi<PortfolioResponse>('/portfolio');
  const recentOrders = useApi<{ orders: Order[] }>('/orders');
  const { world, refreshWorld, isAdmin, testRealm } = useGame();
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [sortBy, setSortBy] = useState<MarketSort>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [side, setSide] = useState<Side>('buy');
  const [amount, setAmount] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<Order | null>(null);
  const [saved, setSaved] = useState<SavedRequest | null>(null);
  const [storageProblem, setStorageProblem] = useState(false);
  const [loadedStorageKey, setLoadedStorageKey] = useState<string | null>(null);
  const inFlight = useRef(false);
  const wide = useWindowDimensions().width >= 1200;
  const storageKey = `stockyllix.pending-order.${user?.uid || 'signed-out'}${testRealm ? '.test' : ''}`;
  const storageReady = loadedStorageKey === storageKey;
  const assets = market.data?.instruments || [];
  const selected = assets.find(item => item.id === (saved?.input.instrumentId || selectedId)) || assets[0];
  const filtered = sortMarketAssets(assets.filter(item => (filter === 'all' || item.market === filter) && `${item.name} ${item.symbol} ${item.sector}`.toLowerCase().includes(query.toLowerCase())), sortBy, sortDirection);
  const directionLabel = sortBy === 'name' ? sortDirection === 'asc' ? 'A → Z' : 'Z → A' : sortDirection === 'asc' ? 'Low → high' : 'High → low';
  const holding = portfolio.data?.summary.holdings.find(item => item.instrumentId === selected?.id);
  const hasPendingSell = side === 'sell' && Number(holding?.reservedUnits || '0') > 0;
  const outcome = success ? recentOrders.data?.orders.find(order => order.id === success.id) || success : null;
  const availableCash = portfolio.data ? Number(portfolio.data.summary.availableCashILS) : undefined;
  const blocked = !portfolio.data ? portfolio.error || 'Loading account balances. Refresh status if this does not finish.' : orderBlockReason({ ready: storageReady, storageProblem, savedWorldId: saved?.input.worldId, worldId: world?.id, advancing: world?.status === 'advancing' || !!world?.clock?.syncing, finished: !!world?.finished, hasExecution: !!selected?.nextExecutionAt, pendingSell: hasPendingSell && !saved, side, availableCash, amount: Number(amount), units: Number(holding?.units || '0') });

  useEffect(() => {
    let active = true;
    if (!user) return;
    AsyncStorage.getItem(storageKey).then(value => {
      if (!active) return;
      if (value) {
        const draft = parseOrderDraft(value)!;
        setSaved(draft);
        setSelectedId(draft.input.instrumentId);
        setAmount(draft.input.amountILS);
        setSide(draft.input.side);
      } else setSaved(null);
      setStorageProblem(false);
      setLoadedStorageKey(storageKey);
    }).catch(() => { if (active) { setStorageProblem(true); setLoadedStorageKey(storageKey); setError('Could not read a saved request. Check Orders before clearing the local draft.'); } });
    return () => { active = false; };
  }, [storageKey, user]);

  async function clearLocalDraft() {
    try {
      await AsyncStorage.removeItem(storageKey);
      setSaved(null); setStorageProblem(false); setLoadedStorageKey(storageKey); setReviewing(false); setError(null);
      await refreshWorld();
    } catch { setError('The local draft could not be cleared. Free device storage, then try again.'); }
  }

  async function sendOrder() {
    if (inFlight.current || !selected || !world || !storageReady) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);
    let request = saved;
    try {
      if (!request) {
        request = { key: randomUUID(), input: { worldId: world.id, instrumentId: selected.id, side, amountILS: amount } };
        // save the request before sending so a restart can retry the same order.
        await AsyncStorage.setItem(storageKey, JSON.stringify(request));
        setSaved(request);
      }
      const result = await api<{ order: Order }>('/orders', { method: 'POST', body: request.input, requestKey: request.key });
      setSuccess(result.order);
      setReviewing(false);
      setAmount('');
      await AsyncStorage.removeItem(storageKey);
      setSaved(null);
      await refreshWorld();
    } catch (cause) {
      setError(errorMessage(cause));
      await refreshWorld();
      // a definite client rejection has no unknown network outcome.
      if (cause instanceof ApiError && cause.status >= 400 && cause.status < 500 && !['WORLD_ADVANCING', 'CLOCK_SYNCING'].includes(cause.code)) {
        try { await AsyncStorage.removeItem(storageKey); setSaved(null); setReviewing(false); }
        catch { setError('The request was rejected, but its saved state could not be cleared. Reload and retry the same request.'); }
      }
    } finally { inFlight.current = false; setBusy(false); }
  }

  function reviewOrder() {
    setError(null);
    setSuccess(null);
    if (!isOrderAmount(amount)) { setError('Enter a positive shekel amount with up to two decimal places.'); return; }
    setReviewing(true);
  }

  return <AppShell>
    <MarketModes />
    <PageTitle title="Market" subtitle={world?.source === 'simulated' ? 'Test game · simulated prices and currency rates, separate from the shared game.' : 'Game trading · real historical prices and currency rates from the covered period.'} />
    {world && <Badge>{world.source === 'historical' ? 'Real historical prices' : 'Simulated prices'} · {dateTime(world.clock?.targetNow || world.now)} · Israel time</Badge>}
    {world && !world.nextEvent && <Notice>The demo has reached the end of its price period. New orders need a future execution event. An administrator can start a new world from World controls.</Notice>}
    {market.data && <View style={[ui.row, { flexWrap: 'wrap', justifyContent: 'space-between' }]}><Copy muted style={{ fontSize: 12 }}>Prices as of {dateTime(market.data.asOf)} · Israel time</Copy><Copy muted style={{ fontSize: 11 }}>USD / ILS {number(market.data.fx, 6)} · Rate date: {observationDate(market.data.fxAsOf)}</Copy></View>}
    <DataState loading={market.loading} error={market.error} hasData={!!market.data} retry={() => void market.refresh()}>
      <View style={[ui.split, !wide && { flexDirection: 'column' }]}>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', gap: 18, minWidth: 0 }}>
          <Field label="Find an asset" placeholder="Search by name, symbol or sector" value={query} onChangeText={setQuery} autoCapitalize="none" autoCorrect={false} />
          <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}>{[{ key: 'all', label: 'All assets' }, { key: 'TA', label: 'Tel Aviv' }, { key: 'US', label: 'United States' }].map(item => <Button compact key={item.key} variant={filter === item.key ? 'primary' : 'secondary'} onPress={() => setFilter(item.key)}>{item.label}</Button>)}</View>
          {selected && <InstrumentInsights key={selected.id} instrument={selected} />}
          <View style={{ gap: 7 }}>
            <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}>
              <Copy muted style={{ fontSize: 11 }}>Sort by</Copy>
              {([{ key: 'name', label: 'Name' }, { key: 'dailyChange', label: 'Daily change' }] as const).map(item => <Button compact key={item.key} label={`Sort by ${item.label.toLowerCase()}${sortBy === item.key ? ', selected' : ''}`} variant={sortBy === item.key ? 'primary' : 'secondary'} onPress={() => { setSortBy(item.key); setSortDirection(item.key === 'name' ? 'asc' : 'desc'); }}>{item.label}</Button>)}
              <Button compact variant="secondary" label={`Sort direction: ${directionLabel}. Reverse direction`} onPress={() => setSortDirection(value => value === 'asc' ? 'desc' : 'asc')}>{directionLabel}</Button>
            </View>
            <Copy muted style={{ fontSize: 10 }}>Daily change · asset currency · versus prior session close. — means unavailable.</Copy>
          </View>
          <View style={{ gap: 10 }}>
            {!filtered.length && <Card><Empty title="No matching assets." detail="Try another name or switch markets." /></Card>}
            {filtered.map(asset => <AssetRow key={asset.id} asset={asset} selected={selected?.id === asset.id} disabled={!!saved || busy} onPress={() => { setSelectedId(asset.id); setReviewing(false); setSuccess(null); setError(null); }} />)}
          </View>
        </View>
        <View style={{ width: wide ? 360 : '100%', gap: 16 }}>
          <Card style={{ gap: 20 }}>
            <Eyebrow>Order</Eyebrow>
            {selected ? <>
              <View style={{ gap: 6 }}><Text style={{ fontSize: 27, fontWeight: '700', color: palette.ink }}>{selected.symbol}</Text><Copy muted>{selected.name}</Copy><Badge tone={selected.marketOpen ? 'positive' : 'neutral'}>{selected.marketOpen ? 'Market open' : 'Market closed'} · {selected.market === 'TA' ? 'Tel Aviv' : 'US'}</Badge></View>
              <View style={ui.divider} />
              <View style={{ flexDirection: 'row', gap: 8 }}>{(['buy', 'sell'] as Side[]).map(option => <View key={option} style={{ flex: 1 }}><Button compact variant={side === option ? 'primary' : 'secondary'} disabled={!!saved || busy || reviewing} onPress={() => setSide(option)}>{option === 'buy' ? 'Buy' : 'Sell'}</Button></View>)}</View>
              <Field label="Amount in shekels (ILS)" placeholder="e.g. 25000" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" editable={!saved && !busy && !reviewing} hint="Enter digits and a decimal point; do not use commas." />
              <ExecutionTiming at={outcome?.status === 'pending' ? outcome.executeAt : selected.nextExecutionAt} kind={outcome?.status === 'pending' ? null : selected.nextExecutionKind} market={selected.market} pending={outcome?.status === 'pending'} />
              <View style={{ gap: 9 }}><Detail label="Available cash" value={money(portfolio.data?.summary.availableCashILS)} /><Detail label="Your units" value={number(holding?.units || '0', 6)} />{side === 'sell' && <Detail label="Maximum at last price" value={money(holding?.maxSellAmountILS)} />}<Detail label="Last known price in ILS" value={money(selected.priceILS)} /></View>
              <Copy muted style={{ fontSize: 11, lineHeight: 18 }}>The final price is set at execution, including the available USD/ILS rate for US assets. Fractional units are supported. {side === 'buy' ? 'A buy may be rejected if the total position exceeds 20% at execution.' : 'The quoted maximum is an estimate. A lower execution price can reject the sell. Your existing units are reserved while it waits.'}</Copy>
              {error && <Notice tone="error">{error}</Notice>}
              {saved && !busy && <Notice>Check the outcome of your previous order request. Retrying is safe and will not create a duplicate.</Notice>}
              {outcome && <Notice tone={outcome.status === 'rejected' ? 'error' : 'success'}>
                {orderOutcomeText(outcome)} <Link href="/orders" style={{ color: palette.green, fontWeight: '700' }}>View orders →</Link>
              </Notice>}
              {reviewing && !saved && <View style={{ gap: 9, paddingVertical: 10 }}>
                <Copy>Confirm {side} of {money(amount)} in {selected.symbol}. Once accepted, the order cannot be cancelled.</Copy>
                {side === 'buy' && <Detail label="Available after reservation" value={money(availableCash === undefined ? undefined : Math.max(0, availableCash - Number(amount)))} />}
                <Detail label="Expected execution (Israel)" value={dateTime(selected.nextExecutionAt)} />
                <Copy muted style={{ fontSize: 12 }}>{side === 'buy' ? 'A pending buy moves available cash into reserved cash. Total portfolio value does not fall by the order amount.' : 'A pending sell reserves your existing units. Cash is added only when the sale executes.'}</Copy>
              </View>}
              {blocked && <View style={{ gap: 8 }}>
                <Copy style={{ color: palette.amber, fontSize: 12 }}>{blocked}</Copy>
                <View style={[ui.row, { flexWrap: 'wrap' }]}>
                  <Button compact variant="quiet" onPress={() => void refreshWorld()}>Refresh status</Button>
                  {isAdmin && <Link href="/admin" asChild><Button compact variant="quiet" onPress={() => undefined}>World controls</Button></Link>}
                </View>
              </View>}
              {(storageProblem || (saved && saved.input.worldId !== world?.id)) && <View style={{ gap: 9 }}>
                <Link href="/orders" style={{ color: palette.green }}>Check accepted orders first →</Link>
                <Button compact variant="secondary" disabled={busy} onPress={() => void clearLocalDraft()}>Clear local draft only</Button>
                <Copy muted style={{ fontSize: 11 }}>This does not cancel or remove an accepted server order.</Copy>
              </View>}
              {saved ? <>
                <Copy muted style={{ fontSize: 12 }}>{busy ? 'Waiting for server confirmation…' : 'A previous response is unknown. Retry this same request safely; do not create a second order.'}</Copy>
                <Button loading={busy} disabled={!!blocked} onPress={() => void sendOrder()}>{busy ? 'Sending order…' : 'Retry saved request safely'}</Button>
              </> : reviewing ? <>
                <Button loading={busy} disabled={!!blocked} onPress={() => void sendOrder()}>Confirm & send order</Button>
                <Button variant="quiet" disabled={busy} compact onPress={() => setReviewing(false)}>Back to editing</Button>
              </> : <Button disabled={!!blocked} onPress={reviewOrder}>Review {side} order  →</Button>}
            </> : <Copy muted>Select an asset to explore your next investment.</Copy>}
          </Card>
          {selected && <WatchlistPanel key={selected.id} instrument={selected} selectionDisabled={!!saved || busy} onSelect={id => { setSelectedId(id); setReviewing(false); setSuccess(null); setError(null); }} />}
          <View style={{ gap: 9 }}><CardTitle>Execution rules</CardTitle><Copy muted style={{ fontSize: 12 }}>Orders sent while open execute at the close; closed-market orders wait for the next opening. {world?.finished ? 'This price period is complete. A separate world is required for new orders.' : world?.clock?.running ? 'Historical time advances automatically at 1×. The server catches up after sleep.' : 'The game clock is paused. An administrator can resume it or advance to an event.'}</Copy></View>
        </View>
      </View>
    </DataState>
  </AppShell>;
}

function orderOutcomeText(order: Order) {
  if (order.status === 'pending') {
    return `Order accepted and waiting. Expected execution: ${dateTime(order.executeAt)} (game time, Israel). ${order.side === 'buy' ? 'Cash is reserved, not spent.' : 'Your existing units are reserved.'}`;
  }
  if (order.status === 'executed') return `${order.side === 'buy' ? 'Purchase' : 'Sale'} executed on ${dateTime(order.fill?.executedAt || order.executeAt)} (game time, Israel).`;
  return `Order rejected: ${order.rejection?.message || 'A trading rule prevented execution.'}`;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'space-between' }}><Copy muted style={{ fontSize: 11, flex: 1 }}>{label}</Copy><Copy style={{ fontSize: 11, fontWeight: '600', textAlign: 'right', flex: 1 }}>{value}</Copy></View>;
}

function AssetRow({ asset, selected, disabled, onPress }: { asset: Instrument; selected: boolean; disabled: boolean; onPress(): void }) {
  const { palette } = useTheme();
  const dailyChange = dailyChangeValue(asset.dailyChangePct);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Trade ${asset.name}`} accessibilityState={{ selected, disabled }} disabled={disabled} onPress={onPress} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 15, backgroundColor: selected ? palette.mint : palette.paper, borderRadius: 12, padding: 18, borderWidth: 1, borderColor: selected ? palette.green : palette.line }, pressed && { opacity: 0.8 }]}>
    <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: selected ? palette.mint : palette.background, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 16, color: palette.green, fontWeight: '700' }}>{asset.symbol.slice(0, 1)}</Text></View>
    <View style={{ flex: 1, gap: 4 }}><Text style={{ fontSize: 14, color: palette.ink, fontWeight: '700' }}>{asset.symbol}</Text><Copy muted style={{ fontSize: 11 }}>{asset.name}</Copy><Copy muted style={{ fontSize: 9 }}>{asset.market === 'TA' ? 'TEL AVIV' : 'UNITED STATES'} · {asset.sector.toUpperCase()}</Copy></View>
    <View style={{ alignItems: 'flex-end', gap: 7 }}><Text style={{ fontSize: 16, fontWeight: '700', color: palette.ink }}>{assetPrice(asset.price, asset.currency)}</Text><Text style={{ fontSize: 11, fontWeight: '600', color: dailyChange === null ? palette.muted : dailyChange < 0 ? palette.red : palette.green }}>Daily {dailyChange === null ? '—' : percent(dailyChange, true)}</Text><Badge tone={asset.marketOpen ? 'positive' : 'neutral'}>{asset.marketOpen ? 'Open' : 'Closed'}</Badge></View>
  </Pressable>;
}
