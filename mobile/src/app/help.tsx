import { Link, type Href } from 'expo-router';
import { View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { Button, Card, CardTitle, Copy, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useGame } from '@/context/GameContext';

export default function HelpScreen() {
  const ui = useThemedStyles();
  const { isAdmin } = useGame();
  return <AppShell>
    <PageTitle title="Make your first move." subtitle="A friendly guide to your account, your portfolio and the weekly league." />
    <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}><GuideLink href="/">Portfolio</GuideLink><GuideLink href={'/current-market' as Href}>Current market</GuideLink><GuideLink href="/market">Demo trading</GuideLink><GuideLink href={'/news' as Href}>News & daily question</GuideLink><GuideLink href="/orders">Orders</GuideLink><GuideLink href="/leaderboard">The league</GuideLink></View>
    <GuideCard title="Two market views, two different clocks">
      <Copy>Current market shows the real-world source’s latest quotes. Prices can be delayed; when a market is closed, the last session quote may remain visible. News also follows real publication time.</Copy>
      <Copy>Demo trading follows the shared game date shown above. Its price source is labelled as historical or simulated. Only those game prices and the game’s FX rate execute your orders. A current quote never changes a historical fill.</Copy>
      <Copy muted>When the price period ends, the clock stops. An administrator can create a new world; previous worlds and their transactions remain preserved.</Copy>
    </GuideCard>
    <GuideCard title="1. Join the league">
      <Copy>Choose a display name with 2–40 characters. Enter an email address with a name, @ and a domain, such as you@example.com.</Copy>
      <Copy>Use a password with at least 8 characters, including a letter and a number. Enter it again in Confirm password; both entries must match. Sign in later with the same email and password.</Copy>
      <Copy muted>Your account starts with ₪1,000,000 in virtual cash once per game world. Signing in again does not add more money.</Copy>
    </GuideCard>
    <GuideCard title="2. Know what your portfolio shows">
      <Copy>Portfolio value is cash plus the current value of your holdings, expressed in shekels. Cash % shows how much of the portfolio is held as cash.</Copy>
      <Copy>Available cash can fund new orders. Reserved cash is waiting for a pending buy: it is still yours and remains part of your portfolio value.</Copy>
      <Copy muted>You can own fractional units. A pending sell reserves the existing units of that asset so they cannot be sold twice.</Copy>
      <GuideLink href="/">Open your portfolio  →</GuideLink>
    </GuideCard>
    <GuideCard title="3. Place your first order">
      <Copy>Open Demo trading, choose an asset and select Buy or Sell. Enter the amount in shekels, using digits and an optional decimal point with up to two decimal places.</Copy>
      <Copy>Choose Review, check the asset, amount and scheduled execution time, then Confirm & send. You can go back before sending. Once accepted, an order cannot be cancelled.</Copy>
      <Copy muted>There is no borrowing or short selling. A buy must keep the total position within 20% of the portfolio at execution. Earlier holdings and pending buys also count when you submit.</Copy>
      <GuideLink href="/market">Choose an asset  →</GuideLink>
    </GuideCard>
    <GuideCard title="4. Let the game clock reach execution">
      <Copy>An order sent while its market is open executes at that session’s close. When the market is closed, it waits for the next opening.</Copy>
      <Copy>The shared game clock moves when an administrator advances it. Waiting in real time does not execute an order. Follow its status on Orders: Pending, Executed or Rejected.</Copy>
      <Copy>US assets use the dollar–shekel rate available at execution. The final units and price can differ from the last quote you saw. An order that breaks a rule at execution is rejected with a reason and releases its reservation.</Copy>
      <Copy muted>If two orders compete for the same cash, the server accepts only those it can reserve safely. An insufficient-cash request is rejected before it becomes an accepted order.</Copy>
      <GuideLink href="/orders">Follow your order  →</GuideLink>
      {isAdmin && <GuideLink href="/admin">Open world controls  →</GuideLink>}
    </GuideCard>
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
  return <Card style={{ gap: 13 }}><CardTitle>{title}</CardTitle>{children}</Card>;
}

function GuideLink({ href, children }: React.PropsWithChildren<{ href: Href }>) {
  return <View style={{ alignSelf: 'flex-start' }}><Link href={href} asChild><Button compact variant="secondary" onPress={() => undefined}>{children}</Button></Link></View>;
}
