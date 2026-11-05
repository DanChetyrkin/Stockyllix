import { Link, type Href } from 'expo-router';
import { View } from 'react-native';
import { AppShell } from '@/components/AppShell';
import { Button, CardTitle, Copy, PageTitle, useThemedStyles } from '@/components/ui/kit';
import { useGame } from '@/context/GameContext';

export default function HelpScreen() {
  const ui = useThemedStyles();
  const { isAdmin } = useGame();
  return (
    <AppShell>
      <PageTitle title="How to play" subtitle="Your account, orders, game clock and weekly league." />
      <View style={[ui.row, { flexWrap: 'wrap', gap: 8 }]}>
        <GuideLink href="/">Portfolio</GuideLink>
        <GuideLink href={'/current-market' as Href}>Current market</GuideLink>
        <GuideLink href="/market">Demo trading</GuideLink>
        <GuideLink href={'/news' as Href}>News & daily question</GuideLink>
        <GuideLink href="/orders">Orders</GuideLink>
        <GuideLink href="/leaderboard">The league</GuideLink>
      </View>
      <GuideCard title="Current prices and the historical game">
        <Copy>
          Current market displays TradingView’s source-owned market panel. Quotes can be delayed; when a market is
          closed, the last session quote may remain visible. News follows real publication time. These panels do not
          send prices to the game’s order engine.
        </Copy>
        <Copy>
          Demo trading uses the price source and game date shown above. The shared league replays real historical prices
          with their original dates and historical exchange rates. Only those game prices execute its orders; a current
          quote never changes a historical fill.
        </Copy>
        <Copy muted>
          An administrator can also open a separate test game with clearly labelled simulated prices and exchange rates.
          Generated test data never replaces the shared historical game.
        </Copy>
        <Copy>
          The header separates Israel time now from game time. Historical playback advances at one game second per
          server second, starting from the original price date. Your phone clock does not decide transaction time.
        </Copy>
        <Copy muted>
          When the price period ends, the clock stops. An administrator can start a new game; previous games and their
          transactions remain preserved.
        </Copy>
      </GuideCard>
      <GuideCard title="1. Join the league">
        <Copy>
          Choose a display name with 2–40 characters. Enter an email address with a name, @ and a domain, such as
          you@example.com.
        </Copy>
        <Copy>
          Use a password with at least 8 characters, including a letter and a number. Enter it again in Confirm
          password; both entries must match. Sign in later with the same email and password.
        </Copy>
        <Copy muted>
          Your account starts with ₪1,000,000 in virtual cash once per game world. Signing in again does not add more
          money.
        </Copy>
      </GuideCard>
      <GuideCard title="2. Know what your portfolio shows">
        <Copy>
          Portfolio value is total cash plus holdings value, expressed in shekels. Total cash includes available cash
          and cash reserved for pending buys.
        </Copy>
        <Copy>
          Available cash can fund new orders. Reserved cash is waiting for a pending buy: it is still yours and remains
          part of your portfolio value.
        </Copy>
        <Copy>
          For example, a new account with ₪1,000,000 and a pending ₪50,000 buy has ₪950,000 available and ₪50,000
          reserved. After execution, cash pays for the new holding. The purchase itself does not remove ₪50,000 from
          total portfolio value.
        </Copy>
        <Copy muted>
          You can own fractional units. A pending sell reserves the existing units of that asset so they cannot be sold
          twice.
        </Copy>
        <GuideLink href="/">Open your portfolio →</GuideLink>
      </GuideCard>
      <GuideCard title="3. Place your first order">
        <Copy>
          Open Demo trading, choose an asset and select Buy or Sell. Enter the amount in shekels, using digits and an
          optional decimal point with up to two decimal places.
        </Copy>
        <Copy>
          Choose Review, check the asset, amount and scheduled execution time, then Confirm & send. You can go back
          before sending. Once accepted, an order cannot be cancelled.
        </Copy>
        <Copy>
          Received and pending means the order was accepted, not filled yet. Executed means it was filled; Orders then
          shows units, price and the exchange rate when applicable.
        </Copy>
        <Copy muted>
          There is no borrowing or short selling. A buy must keep the total position within 20% of the portfolio at
          execution. Earlier holdings and pending buys also count when you submit.
        </Copy>
        <GuideLink href="/market">Choose an asset →</GuideLink>
      </GuideCard>
      <GuideCard title="4. Let the game clock reach execution">
        <Copy>
          An order sent while its market is open executes at that session’s close. When the market is closed, it waits
          for the next opening.
        </Copy>
        <Copy>
          When historical playback is running, the server advances shared game time automatically at normal speed. When
          the scheduled event is reached, the order can execute. A paused clock waits for an administrator to resume it.
          Follow Orders for Pending, Executed or Rejected status.
        </Copy>
        <Copy>
          If the server restarts or has been inactive, it catches up from its saved clock. Trading briefly pauses while
          reached events are processed in order; accepted orders and their reservations stay saved.
        </Copy>
        <Copy>
          US assets use the dollar–shekel rate available at execution. The final units and price can differ from the
          last quote you saw. An order that breaks a rule at execution is rejected with a reason and releases its
          reservation.
        </Copy>
        <Copy muted>
          If two orders compete for the same cash, the server accepts only those it can reserve safely. An
          insufficient-cash request is rejected before it becomes an accepted order.
        </Copy>
        <GuideLink href="/orders">Follow your order →</GuideLink>
        {isAdmin && <GuideLink href="/admin">Open world controls →</GuideLink>}
      </GuideCard>
      {isAdmin && (
        <GuideCard title="Administrator clock controls">
          <Copy>
            World controls identifies the Shared league game or Isolated test game. Choose Open isolated test game
            before experimenting with time or trades; its balances and clock are separate from other players. Return to
            shared league switches back without moving its clock.
          </Copy>
          <Copy>
            Pause game clock freezes the target. Resume game clock continues at one game second per server second.
            Advance to market event jumps to the next market opening or closing, which is where every pending order
            executes; a US order can need two jumps when Tel Aviv opens first.
          </Copy>
          <Copy>
            Click or tap Date to open the calendar and select a day, then choose Time · Israel and Apply time and pause.
            Use 24-hour time. The server checks Israel daylight saving and accepts only forward times inside the
            available period; no ISO string or timezone calculation is needed.
          </Copy>
          <Copy>
            For an earlier date or another run, open Start a new game, review the source and type NEW GAME to confirm. A
            new game has its own fresh portfolio; previous positions and transactions remain saved and are not
            transferred.
          </Copy>
          <Copy>
            In the isolated test game, Simulated test prices lets you choose a starting date, such as 1 March 2027, for
            28 calendar days of generated stock prices and FX. This is for testing, not real historical or current
            market data. The shared league keeps its real historical source.
          </Copy>
          <Copy>
            Real-time trading remains unavailable until suitable current execution prices and FX are verified. The game
            never relabels history as today, invents another real price after the period ends or automatically resets
            accounts.
          </Copy>
          <Copy muted>
            Advanced · history and recovery contains saved-request receipts, recent clock changes and synchronization
            recovery. If interrupted work needs help, Resume synchronization continues the same saved job; it does not
            submit orders again. A saved request can be checked and retried with the same request id.
          </Copy>
        </GuideCard>
      )}
      <GuideCard title="5. Understand the weekly score">
        <Copy>
          The competition runs Monday through Friday. Returns measure the percentage change in your portfolio during
          that week. Your score combines 85% return ranking and 15% stability ranking among eligible players.
        </Copy>
        <Copy>
          Maximum Drawdown (MDD) measures the largest fall from a portfolio peak to a later low during the week. For
          example, 100 → 120 → 90 gives a 25% drawdown from 120, even if the value later recovers.
        </Copy>
        <Copy muted>
          Higher returns and smaller drawdowns rank better. A score of 100 is a ranking score, not a 100% investment
          return. Late joiners are provisional until the next full week.
        </Copy>
        <GuideLink href="/leaderboard">See the league →</GuideLink>
      </GuideCard>
      <GuideCard title="6. Learn, watch and make it yours">
        <Copy>
          Your portfolio includes a personal daily insight. Open News for current headlines and the compact daily
          question. The quiz changes at midnight in the shared game’s Israel time: advancing to a new day brings the
          next question.
        </Copy>
        <Copy muted>
          News filters follow TradingView’s asset classes or one selected company. They do not filter by the game date.
          A company with no source coverage can show an empty feed.
        </Copy>
        <Copy>
          Asset charts show known opening and closing observations through game time. Daily price change compares the
          latest quote with the prior trading session’s close, in the asset’s currency.
        </Copy>
        <Copy>
          Save a personal price target in the watchlist. A target is a reminder inside the app; it does not submit an
          order or send a notification.
        </Copy>
        <Copy muted>
          Use the circle in the header to edit your name and profile photo. Choose Auto, Light or Dark for appearance;
          Auto follows the real Israel clock, with dark mode from 20:00 to 07:00.
        </Copy>
        <GuideLink href="/news">Try today’s question →</GuideLink>
      </GuideCard>
      <Copy muted style={{ fontSize: 12 }}>
        The status button beside the game clock explains the price source and shows the latest Bank of Israel reference
        rate. All money is virtual.
      </Copy>
    </AppShell>
  );
}

function GuideCard({ title, children }: React.PropsWithChildren<{ title: string }>) {
  return (
    <View style={{ gap: 13, paddingVertical: 8, maxWidth: 820 }}>
      <CardTitle>{title}</CardTitle>
      {children}
    </View>
  );
}

function GuideLink({ href, children }: React.PropsWithChildren<{ href: Href }>) {
  return (
    <View style={{ alignSelf: 'flex-start' }}>
      <Link href={href} asChild>
        <Button compact variant="secondary" onPress={() => undefined}>
          {children}
        </Button>
      </Link>
    </View>
  );
}
