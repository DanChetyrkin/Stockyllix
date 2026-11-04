import { Link, type Href } from 'expo-router';
import { View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { Button, CardTitle, Copy, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useGame } from '@/context/GameContext';

export default function HelpScreen() {
  const ui = useThemedStyles();
  const { isAdmin } = useGame();
  return <AppShell>
    <PageTitle title="How to play" subtitle="Your account, orders, game clock and weekly league." />
    <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}><GuideLink href="/">Portfolio</GuideLink><GuideLink href={'/current-market' as Href}>Current market</GuideLink><GuideLink href="/market">Demo trading</GuideLink><GuideLink href={'/news' as Href}>News & daily question</GuideLink><GuideLink href="/orders">Orders</GuideLink><GuideLink href="/leaderboard">The league</GuideLink></View>
    <GuideCard title="Current prices and the historical game">
      <Copy>Current market shows the real-world source’s latest quotes. Prices can be delayed; when a market is closed, the last session quote may remain visible. News also follows real publication time.</Copy>
      <Copy>Demo trading follows the shared game date shown above. Its price source is labelled as historical or simulated. Only those game prices and the game’s FX rate execute your orders. A current quote never changes a historical fill.</Copy>
      <Copy>The header separates Israel time now from game time. Historical playback advances at one game second per server second, starting from the original price date. Your phone clock does not decide transaction time.</Copy>
      <Copy muted>When the price period ends, the clock stops. An administrator can create a new world; previous worlds and their transactions remain preserved.</Copy>
    </GuideCard>
    <GuideCard title="1. Join the league">
      <Copy>Choose a display name with 2–40 characters. Enter an email address with a name, @ and a domain, such as you@example.com.</Copy>
      <Copy>Use a password with at least 8 characters, including a letter and a number. Enter it again in Confirm password; both entries must match. Sign in later with the same email and password.</Copy>
      <Copy muted>Your account starts with ₪1,000,000 in virtual cash once per game world. Signing in again does not add more money.</Copy>
    </GuideCard>
    <GuideCard title="2. Know what your portfolio shows">
      <Copy>Portfolio value is total cash plus holdings value, expressed in shekels. Total cash includes available cash and cash reserved for pending buys.</Copy>
      <Copy>Available cash can fund new orders. Reserved cash is waiting for a pending buy: it is still yours and remains part of your portfolio value.</Copy>
      <Copy>For example, a new account with ₪1,000,000 and a pending ₪50,000 buy has ₪950,000 available and ₪50,000 reserved. After execution, cash pays for the new holding. The purchase itself does not remove ₪50,000 from total portfolio value.</Copy>
      <Copy muted>You can own fractional units. A pending sell reserves the existing units of that asset so they cannot be sold twice.</Copy>
      <GuideLink href="/">Open your portfolio  →</GuideLink>
    </GuideCard>
    <GuideCard title="3. Place your first order">
      <Copy>Open Demo trading, choose an asset and select Buy or Sell. Enter the amount in shekels, using digits and an optional decimal point with up to two decimal places.</Copy>
      <Copy>Choose Review, check the asset, amount and scheduled execution time, then Confirm & send. You can go back before sending. Once accepted, an order cannot be cancelled.</Copy>
      <Copy>Received and pending means the order was accepted, not filled yet. Executed means it was filled; Orders then shows units, price and the exchange rate when applicable.</Copy>
      <Copy muted>There is no borrowing or short selling. A buy must keep the total position within 20% of the portfolio at execution. Earlier holdings and pending buys also count when you submit.</Copy>
      <GuideLink href="/market">Choose an asset  →</GuideLink>
    </GuideCard>
    <GuideCard title="4. Let the game clock reach execution">
      <Copy>An order sent while its market is open executes at that session’s close. When the market is closed, it waits for the next opening.</Copy>
      <Copy>When historical playback is running, the server advances shared game time automatically at normal speed. When the scheduled event is reached, the order can execute. A paused clock waits for an administrator to resume it. Follow Orders for Pending, Executed or Rejected status.</Copy>
      <Copy>If the server restarts or has been inactive, it catches up from its saved clock. Trading briefly pauses while reached events are processed in order; accepted orders and their reservations stay saved.</Copy>
      <Copy>US assets use the dollar–shekel rate available at execution. The final units and price can differ from the last quote you saw. An order that breaks a rule at execution is rejected with a reason and releases its reservation.</Copy>
      <Copy muted>If two orders compete for the same cash, the server accepts only those it can reserve safely. An insufficient-cash request is rejected before it becomes an accepted order.</Copy>
      <GuideLink href="/orders">Follow your order  →</GuideLink>
      {isAdmin && <GuideLink href="/admin">Open world controls  →</GuideLink>}
    </GuideCard>
    {isAdmin && <GuideCard title="Administrator clock controls">
      <Copy>World controls identifies the shared league or your isolated test world. Open the isolated test world before experimenting with time or trades; its balances and clock are separate from other players.</Copy>
      <Copy>Pause clock freezes the game target. Resume continues at normal speed from that point. Set custom time moves forward, processes intermediate events and pauses. Next trading event does the same for the next opening or closing.</Copy>
      <Copy>Use an ISO date with a time zone, for example 2026-10-26T17:30:00+02:00. The server refuses a backward move or a target outside the covered period. For an earlier date, create a new test world instead; old worlds and their orders remain saved.</Copy>
      <Copy>Real-time trading remains unavailable until current execution prices and FX are verified. Selecting controls does not relabel historical data as today. At the end of history the clock stops, without inventing prices or automatically resetting accounts.</Copy>
      <Copy muted>Synchronization is saved on the server. Resume synchronization retries unfinished processing; it does not submit the orders again. Recent clock changes shows the administrator action history.</Copy>
    </GuideCard>}
    <GuideCard title="5. Understand the weekly score">
      <Copy>The competition runs Monday through Friday. Returns measure the percentage change in your portfolio during that week. Your score combines 85% return ranking and 15% stability ranking among eligible players.</Copy>
      <Copy>Maximum Drawdown (MDD) measures the largest fall from a portfolio peak to a later low during the week. For example, 100 → 120 → 90 gives a 25% drawdown from 120, even if the value later recovers.</Copy>
      <Copy muted>Higher returns and smaller drawdowns rank better. A score of 100 is a ranking score, not a 100% investment return. Late joiners are provisional until the next full week.</Copy>
      <GuideLink href="/leaderboard">See the league  →</GuideLink>
    </GuideCard>
    <GuideCard title="6. Learn, watch and make it yours">
      <Copy>Your portfolio includes a personal daily insight. Open News for current headlines and the compact daily question. The quiz changes at midnight in the shared game’s Israel time: advancing to a new day brings the next question.</Copy>
      <Copy muted>News filters follow TradingView’s asset classes or one selected company. They do not filter by the game date. A company with no source coverage can show an empty feed.</Copy>
      <Copy>Asset charts show known opening and closing observations through game time. Daily price change compares the latest quote with the prior trading session’s close, in the asset’s currency.</Copy>
      <Copy>Save a personal price target in the watchlist. A target is a reminder inside the app; it does not submit an order or send a notification.</Copy>
      <Copy muted>Use the circle in the header to edit your name and profile photo. Choose Auto, Light or Dark for appearance; Auto follows the real Israel clock, with dark mode from 20:00 to 07:00.</Copy>
      <GuideLink href="/news">Try today’s question  →</GuideLink>
    </GuideCard>
    <Copy muted style={{ fontSize: 12 }}>The status button beside the game clock explains the price source and shows the latest Bank of Israel reference rate. All money is virtual.</Copy>
  </AppShell>;
}

function GuideCard({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return <View style={{ gap: 13, paddingVertical: 8, maxWidth: 820 }}><CardTitle>{title}</CardTitle>{children}</View>;
}

function GuideLink({ href, children }: React.PropsWithChildren<{ href: Href }>) {
  return <View style={{ alignSelf: 'flex-start' }}><Link href={href} asChild><Button compact variant="secondary" onPress={() => undefined}>{children}</Button></Link></View>;
}
