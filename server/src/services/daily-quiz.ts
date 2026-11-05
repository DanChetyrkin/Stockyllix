import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { playerPath, readIdleWorld } from '../data/current-world.js';
import type { DocumentStore, Transaction } from '../data/store.js';
import { GameError } from '../domain/errors.js';
import type { World } from '../domain/model.js';

interface Question {
  id: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

interface SavedAnswer {
  date: string;
  questionId: string;
  answerIndex: number;
  answeredAt: string;
}

export interface QuizView {
  worldId: string;
  revision: number;
  date: string;
  question: Pick<Question, 'id' | 'prompt' | 'options'>;
  answer: null | {
    answerIndex: number;
    correct: boolean;
    correctIndex: number;
    explanation: string;
    answeredAt: string;
  };
}

const QUESTIONS: Question[] = [
  {
    id: 'diversification-v1',
    prompt: 'What is the main purpose of diversification?',
    options: [
      'Guarantee a profit',
      'Spread exposure across investments',
      'Remove every type of risk',
      'Make all investments move together',
    ],
    correctIndex: 1,
    explanation:
      'Diversification spreads exposure so one investment has less influence on the whole portfolio. It does not eliminate market risk.',
  },
  {
    id: 'market-cap-v1',
    prompt: 'How is a company’s market capitalization calculated?',
    options: [
      'Revenue minus expenses',
      'Cash divided by debt',
      'Share price × shares outstanding',
      'Dividend × trading volume',
    ],
    correctIndex: 2,
    explanation:
      'Market capitalization is the current share price multiplied by the number of outstanding shares. It is not the company’s cash balance.',
  },
  {
    id: 'pe-ratio-v1',
    prompt: 'For a company with positive earnings, what does the P/E ratio compare?',
    options: [
      'Share price with earnings per share',
      'Debt with cash',
      'Revenue with market volume',
      'Dividends with inflation',
    ],
    correctIndex: 0,
    explanation:
      'P/E means price-to-earnings: share price divided by earnings per share. A low or high P/E alone does not determine whether a stock is a good investment.',
  },
  {
    id: 'dividend-v1',
    prompt: 'Which statement about dividends is correct?',
    options: [
      'They are guaranteed forever',
      'Every company must pay them',
      'They prevent the share price from falling',
      'A company can reduce or stop them',
    ],
    correctIndex: 3,
    explanation:
      'A dividend is a distribution to shareholders. Future dividends depend on the company’s decisions and circumstances; past payments are not a guarantee.',
  },
  {
    id: 'drawdown-v1',
    prompt: 'A portfolio falls from a peak of ₪100,000 to ₪90,000. What is its drawdown?',
    options: ['5%', '10%', '11.1%', '90%'],
    correctIndex: 1,
    explanation: 'Drawdown is measured from the earlier peak: (100,000 − 90,000) ÷ 100,000 = 10%.',
  },
  {
    id: 'fx-exposure-v1',
    prompt: 'A US share price stays unchanged. What can still change its value in shekels?',
    options: [
      'Only its ticker symbol',
      'The number of market holidays',
      'The USD/ILS exchange rate',
      'Nothing can change it',
    ],
    correctIndex: 2,
    explanation:
      'A dollar-denominated holding is converted into shekels. A change in USD/ILS therefore changes its shekel value even when the share’s dollar price is unchanged.',
  },
  {
    id: 'unrealized-v1',
    prompt: 'What is an unrealized gain?',
    options: [
      'A gain already received from a sale',
      'A guaranteed future dividend',
      'An account deposit',
      'A gain on an investment that is still held',
    ],
    correctIndex: 3,
    explanation:
      'A gain is unrealized while the position is still held. Selling can realize the gain, and the market value can change before a sale.',
  },
  {
    id: 'fractional-v1',
    prompt: 'What does owning 0.25 units of an investment mean?',
    options: [
      'Owning one quarter of a unit',
      'Borrowing four units',
      'Owning 25 whole units',
      'Receiving a fixed 25% return',
    ],
    correctIndex: 0,
    explanation:
      'A fractional holding is part of a whole unit. Its market value is calculated using the same unit price multiplied by the fraction held.',
  },
  {
    id: 'etf-v1',
    prompt: 'What does an exchange-traded fund (ETF) typically provide?',
    options: [
      'A guaranteed return',
      'Exposure to a basket of assets through one traded fund',
      'Ownership of only one company in every case',
      'Protection against all losses',
    ],
    correctIndex: 1,
    explanation:
      'An ETF holds or tracks a group of assets or an investment strategy and trades on an exchange. Its price can fall, and different ETFs have different risks.',
  },
  {
    id: 'spread-v1',
    prompt: 'What is the bid–ask spread?',
    options: [
      'The company’s annual profit',
      'The difference between this year and last year',
      'The difference between quoted buying and selling prices',
      'The interest rate on cash',
    ],
    correctIndex: 2,
    explanation:
      'The bid is a quoted price a buyer is willing to pay; the ask is a quoted selling price. The difference between them is the spread.',
  },
  {
    id: 'inflation-v1',
    prompt: 'If prices rise while your cash balance stays the same, what usually happens to its purchasing power?',
    options: ['It decreases', 'It doubles automatically', 'It is unaffected in every case', 'It becomes a dividend'],
    correctIndex: 0,
    explanation:
      'Inflation means an increase in the general price level. The same amount of cash then buys fewer goods and services on average.',
  },
  {
    id: 'compound-v1',
    prompt: 'What is compounding?',
    options: [
      'Splitting one order into several orders',
      'Trading only once a year',
      'Keeping every return in cash forever',
      'Earning returns on earlier returns as well as the original amount',
    ],
    correctIndex: 3,
    explanation:
      'Compounding occurs when returns remain invested and can generate further returns. The result also depends on losses, costs and the time involved.',
  },
  {
    id: 'cash-reservation-v1',
    prompt: 'In this game, does reserving cash for a pending buy reduce total portfolio value?',
    options: [
      'Yes, it is immediately lost',
      'No, it is still owned but unavailable for another buy',
      'Yes, it becomes a fee',
      'Only when the app is closed',
    ],
    correctIndex: 1,
    explanation:
      'Reserved cash remains part of the portfolio until execution. Reserving it prevents two pending purchases from spending the same money.',
  },
  {
    id: 'purchase-limit-v1',
    prompt: 'Does a 20% purchase limit make a portfolio risk-free?',
    options: [
      'Yes, all losses become impossible',
      'Yes, if five stocks are held',
      'No, investments can still fall together',
      'Yes, when no dividends are paid',
    ],
    correctIndex: 2,
    explanation:
      'The limit reduces concentration in one security at purchase time. Investments can still share risks and fall together.',
  },
  {
    id: 'bond-v1',
    prompt: 'What does buying a conventional bond generally represent?',
    options: [
      'Lending money to an issuer',
      'Owning all of the issuer’s shares',
      'Buying a guaranteed stock return',
      'Opening a foreign-currency account',
    ],
    correctIndex: 0,
    explanation:
      'A conventional bond represents a loan to an issuer under specified terms. The issuer can still face credit risk, and a bond’s market price can change.',
  },
  {
    id: 'liquidity-v1',
    prompt: 'What does market liquidity describe?',
    options: [
      'How much cash a company keeps',
      'The size of its dividend',
      'How many sectors it operates in',
      'How easily an asset can trade without a large price impact',
    ],
    correctIndex: 3,
    explanation:
      'A liquid market generally makes it easier to trade without greatly moving the price. Liquidity can change, especially during stressed conditions.',
  },
  {
    id: 'dividend-yield-v1',
    prompt: 'A stock costs ₪100 and its annual dividend is ₪4. What is the simple dividend yield?',
    options: ['25%', '4%', '40%', '0.4%'],
    correctIndex: 1,
    explanation:
      'The simple dividend yield is annual dividend per share divided by the share price: 4 ÷ 100 = 4%. It does not include share-price changes.',
  },
  {
    id: 'benchmark-v1',
    prompt: 'What makes a portfolio–benchmark comparison more meaningful?',
    options: [
      'Using different time periods',
      'Ignoring the currencies',
      'Using the same period and consistent currency and dividend treatment',
      'Comparing only the best day',
    ],
    correctIndex: 2,
    explanation:
      'A fair comparison needs consistent dates, currency conversion and treatment of dividends and costs. Otherwise the return figures can describe different things.',
  },
  {
    id: 'recovery-v1',
    prompt: 'After a 50% fall, what gain is needed to return to the original value?',
    options: ['25%', '50%', '75%', '100%'],
    correctIndex: 3,
    explanation: 'A fall from 100 to 50 halves the value. Returning from 50 to 100 requires a gain of 50 ÷ 50 = 100%.',
  },
  {
    id: 'pending-price-v1',
    prompt: 'Why can this game’s execution price differ from the price shown when you submit an order?',
    options: [
      'The order executes at a scheduled future opening or closing event',
      'The app always chooses a random fee',
      'A pending order has already been sold',
      'The displayed currency stops having value',
    ],
    correctIndex: 0,
    explanation:
      'The shown price is the latest known price. The game executes a submitted order at its scheduled market event using that event’s price and exchange rate.',
  },
];

function questionFor(worldId: string, date: string) {
  const serial = Math.floor(Date.parse(`${date}T00:00:00Z`) / 86_400_000);
  const cycle = Math.floor(serial / QUESTIONS.length);
  const shuffled = (seed: number) =>
    QUESTIONS.map(question => ({
      question,
      key: createHash('sha256').update(`stockyllix-quiz-v1:${worldId}:${seed}:${question.id}`).digest('hex'),
    }))
      .sort((a, b) => a.key.localeCompare(b.key))
      .map(row => row.question);
  const questions = shuffled(cycle);
  // each shuffled cycle covers the bank, with no repeat at the cycle boundary.
  if (questions[0]!.id === shuffled(cycle - 1).at(-1)!.id) {
    [questions[0], questions[1]] = [questions[1]!, questions[0]!];
  }
  return questions[serial % QUESTIONS.length]!;
}

export class DailyQuizService {
  private readonly now: () => Date;
  private readonly gameTime: (world: World, tx: Transaction) => string | Promise<string>;

  constructor(
    private readonly store: DocumentStore,
    options: {
      now?: () => Date;
      gameTime?: (world: World, tx: Transaction) => string | Promise<string>;
    } = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.gameTime = options.gameTime ?? (world => world.now);
  }

  private async day(world: World, tx: Transaction) {
    const date = DateTime.fromISO(await this.gameTime(world, tx))
      .setZone('Asia/Jerusalem')
      .toISODate()!;
    return { date, question: questionFor(world.id, date) };
  }

  private view(world: World, day: { date: string; question: Question }, saved?: SavedAnswer): QuizView {
    const { id, prompt, options, correctIndex, explanation } = day.question;
    const current = saved?.date === day.date && saved.questionId === id ? saved : undefined;
    return {
      worldId: world.id,
      revision: world.revision,
      date: day.date,
      question: { id, prompt, options },
      answer: current
        ? {
            answerIndex: current.answerIndex,
            correct: current.answerIndex === correctIndex,
            correctIndex,
            explanation,
            answeredAt: current.answeredAt,
          }
        : null,
    };
  }

  async get(uid: string): Promise<QuizView> {
    return this.store.transaction(async tx => {
      const world = await readIdleWorld(tx);
      const day = await this.day(world, tx);
      const saved = await tx.get<SavedAnswer>(`${playerPath(world.id, uid)}/quiz/current`);
      return this.view(world, day, saved);
    });
  }

  async answer(
    uid: string,
    input: { worldId: string; date: string; questionId: string; answerIndex: number },
  ): Promise<QuizView> {
    return this.store.transaction(async tx => {
      const world = await readIdleWorld(tx);
      const day = await this.day(world, tx);
      if (input.worldId !== world.id || input.date !== day.date || input.questionId !== day.question.id) {
        throw new GameError('QUIZ_EXPIRED', 'The game day changed. Refresh to answer the current question.', 409, true);
      }
      if (
        !Number.isInteger(input.answerIndex) ||
        input.answerIndex < 0 ||
        input.answerIndex >= day.question.options.length
      ) {
        throw new GameError('INVALID_QUIZ_ANSWER', 'Choose one of the available answers.', 400);
      }
      const path = `${playerPath(world.id, uid)}/quiz/current`;
      const existing = await tx.get<SavedAnswer>(path);
      if (existing?.date === day.date && existing.questionId === day.question.id)
        return this.view(world, day, existing);
      // the next game day replaces this one document; there is no question history.
      const saved = {
        date: day.date,
        questionId: day.question.id,
        answerIndex: input.answerIndex,
        answeredAt: this.now().toISOString(),
      };
      tx.set(path, saved);
      return this.view(world, day, saved);
    });
  }
}
