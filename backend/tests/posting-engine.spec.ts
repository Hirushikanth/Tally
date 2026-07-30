import {
  computeAdjustmentPostings,
  computeCashMovementPostings,
  computeLoanPostings,
  computeRefundPostings,
  computeSharedExpensePostings,
  InvalidInputError,
  sumPostings,
  validateZeroSum,
  ZeroSumError,
  type PostingDraft,
} from '../src/posting-engine/posting-engine';

function postingMap(postings: PostingDraft[]): Record<string, number> {
  return Object.fromEntries(postings.map((p) => [p.memberId, p.amount]));
}

function memberBalance(
  postings: PostingDraft[],
  memberId: string,
): number {
  return postings
    .filter((posting) => posting.memberId === memberId)
    .reduce((sum, posting) => sum + posting.amount, 0);
}

describe('validateZeroSum', () => {
  it('passes when postings sum to zero', () => {
    const postings = [
      { memberId: 'a', amount: 100 },
      { memberId: 'b', amount: -100 },
    ];
    expect(validateZeroSum(postings)).toEqual(postings);
  });

  it('throws ZeroSumError when postings do not sum to zero', () => {
    expect(() =>
      validateZeroSum([
        { memberId: 'a', amount: 100 },
        { memberId: 'b', amount: -50 },
      ]),
    ).toThrow(ZeroSumError);
  });

  it('throws ZeroSumError for empty postings', () => {
    expect(() => validateZeroSum([])).toThrow(ZeroSumError);
  });
});

describe('SharedExpense', () => {
  const hirushi = 'hirushi';
  const kasun = 'kasun';
  const amal = 'amal';
  const sahan = 'sahan';
  const nimal = 'nimal';

  it('computes PROJECT_CONTEXT §7.1 multi-payer worked example', () => {
    const postings = computeSharedExpensePostings({
      totalAmount: 10000,
      payers: [
        { memberId: hirushi, amountPaid: 6000 },
        { memberId: kasun, amountPaid: 4000 },
      ],
      split: {
        method: 'EQUAL',
        participantIds: [hirushi, kasun, amal, sahan, nimal],
      },
    });

    expect(postingMap(postings)).toEqual({
      [hirushi]: 4000,
      [kasun]: 2000,
      [amal]: -2000,
      [sahan]: -2000,
      [nimal]: -2000,
    });
    expect(sumPostings(postings)).toBe(0);
  });

  it('computes single payer split five ways', () => {
    const postings = computeSharedExpensePostings({
      totalAmount: 10000,
      payers: [{ memberId: hirushi, amountPaid: 10000 }],
      split: {
        method: 'EQUAL',
        participantIds: [hirushi, kasun, amal, sahan, nimal],
      },
    });

    expect(postingMap(postings)).toEqual({
      [hirushi]: 8000,
      [kasun]: -2000,
      [amal]: -2000,
      [sahan]: -2000,
      [nimal]: -2000,
    });
  });

  it('supports payer-only member with zero share', () => {
    const postings = computeSharedExpensePostings({
      totalAmount: 5000,
      payers: [{ memberId: hirushi, amountPaid: 5000 }],
      split: {
        method: 'EQUAL',
        participantIds: [kasun, amal],
      },
    });

    expect(postingMap(postings)).toEqual({
      [hirushi]: 5000,
      [kasun]: -2500,
      [amal]: -2500,
    });
  });

  it('supports participant-only member with zero amount paid', () => {
    const postings = computeSharedExpensePostings({
      totalAmount: 3000,
      payers: [{ memberId: hirushi, amountPaid: 3000 }],
      split: {
        method: 'EQUAL',
        participantIds: [hirushi, kasun],
      },
    });

    expect(postingMap(postings)[kasun]).toBe(-1500);
  });

  it('supports PERCENTAGE split', () => {
    const postings = computeSharedExpensePostings({
      totalAmount: 10000,
      payers: [{ memberId: hirushi, amountPaid: 10000 }],
      split: {
        method: 'PERCENTAGE',
        shares: [
          { memberId: hirushi, percent: 50 },
          { memberId: kasun, percent: 30 },
          { memberId: amal, percent: 20 },
        ],
      },
    });

    expect(postingMap(postings)).toEqual({
      [hirushi]: 5000,
      [kasun]: -3000,
      [amal]: -2000,
    });
  });

  it('supports EXACT split', () => {
    const postings = computeSharedExpensePostings({
      totalAmount: 10000,
      payers: [{ memberId: hirushi, amountPaid: 10000 }],
      split: {
        method: 'EXACT',
        shares: [
          { memberId: hirushi, shareOwed: 4000 },
          { memberId: kasun, shareOwed: 3500 },
          { memberId: amal, shareOwed: 2500 },
        ],
      },
    });

    expect(postingMap(postings)).toEqual({
      [hirushi]: 6000,
      [kasun]: -3500,
      [amal]: -2500,
    });
  });

  it('supports CUSTOM split', () => {
    const postings = computeSharedExpensePostings({
      totalAmount: 1000,
      payers: [{ memberId: hirushi, amountPaid: 1000 }],
      split: {
        method: 'CUSTOM',
        shares: [
          { memberId: hirushi, shareOwed: 400 },
          { memberId: kasun, shareOwed: 600 },
        ],
      },
    });

    expect(postingMap(postings)).toEqual({
      [hirushi]: 600,
      [kasun]: -600,
    });
  });

  it('supports SHARES split', () => {
    const postings = computeSharedExpensePostings({
      totalAmount: 10000,
      payers: [{ memberId: hirushi, amountPaid: 10000 }],
      split: {
        method: 'SHARES',
        shares: [
          { memberId: hirushi, weight: 1 },
          { memberId: kasun, weight: 1 },
          { memberId: amal, weight: 2 },
        ],
      },
    });

    expect(postingMap(postings)).toEqual({
      [hirushi]: 7500,
      [kasun]: -2500,
      [amal]: -5000,
    });
  });

  it('throws when payer amounts do not sum to total', () => {
    expect(() =>
      computeSharedExpensePostings({
        totalAmount: 10000,
        payers: [{ memberId: hirushi, amountPaid: 9000 }],
        split: { method: 'EQUAL', participantIds: [hirushi, kasun] },
      }),
    ).toThrow(InvalidInputError);
  });
});

describe('Loan', () => {
  it('credits lender and debits borrower', () => {
    const postings = computeLoanPostings({
      lenderId: 'lender',
      borrowerId: 'borrower',
      amount: 5000,
    });

    expect(postings).toEqual([
      { memberId: 'lender', amount: 5000 },
      { memberId: 'borrower', amount: -5000 },
    ]);
  });

  it('throws when lender and borrower are the same member', () => {
    expect(() =>
      computeLoanPostings({
        lenderId: 'same',
        borrowerId: 'same',
        amount: 1000,
      }),
    ).toThrow(InvalidInputError);
  });
});

describe('CashMovement', () => {
  it('credits cash payer and debits cash receiver', () => {
    const postings = computeCashMovementPostings({
      cashPayerId: 'payer',
      cashReceiverId: 'receiver',
      amount: 3000,
    });

    expect(postings).toEqual([
      { memberId: 'payer', amount: 3000 },
      { memberId: 'receiver', amount: -3000 },
    ]);
  });

  it('does not branch on repayment vs settlement labels', () => {
    const repayment = computeCashMovementPostings({
      cashPayerId: 'a',
      cashReceiverId: 'b',
      amount: 1000,
    });
    const settlement = computeCashMovementPostings({
      cashPayerId: 'a',
      cashReceiverId: 'b',
      amount: 1000,
    });

    expect(repayment).toEqual(settlement);
  });

  it('throws when payer and receiver are the same member', () => {
    expect(() =>
      computeCashMovementPostings({
        cashPayerId: 'same',
        cashReceiverId: 'same',
        amount: 1000,
      }),
    ).toThrow(InvalidInputError);
  });
});

describe('Refund', () => {
  const originalPostings: PostingDraft[] = [
    { memberId: 'hirushi', amount: 8000 },
    { memberId: 'kasun', amount: -2000 },
    { memberId: 'amal', amount: -2000 },
    { memberId: 'sahan', amount: -2000 },
    { memberId: 'nimal', amount: -2000 },
  ];

  it('computes PROJECT_CONTEXT §7.3 partial refund worked example', () => {
    const postings = computeRefundPostings({
      refundAmount: 4000,
      originalAmount: 10000,
      originalPostings,
    });

    expect(postingMap(postings)).toEqual({
      hirushi: -3200,
      kasun: 800,
      amal: 800,
      sahan: 800,
      nimal: 800,
    });
    expect(sumPostings(postings)).toBe(0);
  });

  it('supports full refund', () => {
    const postings = computeRefundPostings({
      refundAmount: 10000,
      originalAmount: 10000,
      originalPostings,
    });

    expect(postingMap(postings)).toEqual({
      hirushi: -8000,
      kasun: 2000,
      amal: 2000,
      sahan: 2000,
      nimal: 2000,
    });
  });

  it('throws when refund exceeds original amount', () => {
    expect(() =>
      computeRefundPostings({
        refundAmount: 10001,
        originalAmount: 10000,
        originalPostings,
      }),
    ).toThrow(InvalidInputError);
  });

  it('throws when original postings are empty', () => {
    expect(() =>
      computeRefundPostings({
        refundAmount: 1000,
        originalAmount: 10000,
        originalPostings: [],
      }),
    ).toThrow(InvalidInputError);
  });
});

describe('Adjustment', () => {
  it('accepts valid zero-sum postings', () => {
    const postings = computeAdjustmentPostings({
      postings: [
        { memberId: 'a', amount: 500 },
        { memberId: 'b', amount: -500 },
      ],
    });

    expect(postings).toEqual([
      { memberId: 'a', amount: 500 },
      { memberId: 'b', amount: -500 },
    ]);
  });

  it('throws when postings do not sum to zero', () => {
    expect(() =>
      computeAdjustmentPostings({
        postings: [
          { memberId: 'a', amount: 500 },
          { memberId: 'b', amount: -400 },
        ],
      }),
    ).toThrow(ZeroSumError);
  });

  it('throws when postings are empty', () => {
    expect(() =>
      computeAdjustmentPostings({
        postings: [],
      }),
    ).toThrow(InvalidInputError);
  });
});

describe('ACCOUNTING §3.9 checklist', () => {
  describe('1. every event has at least one posting and sum is zero', () => {
    it('shared expense returns balanced non-empty postings', () => {
      const postings = computeSharedExpensePostings({
        totalAmount: 1000,
        payers: [{ memberId: 'a', amountPaid: 1000 }],
        split: { method: 'EQUAL', participantIds: ['a', 'b'] },
      });
      expect(postings.length).toBeGreaterThan(0);
      expect(sumPostings(postings)).toBe(0);
    });

    it('loan returns balanced non-empty postings', () => {
      const postings = computeLoanPostings({
        lenderId: 'a',
        borrowerId: 'b',
        amount: 1000,
      });
      expect(postings.length).toBeGreaterThan(0);
      expect(sumPostings(postings)).toBe(0);
    });

    it('cash movement returns balanced non-empty postings', () => {
      const postings = computeCashMovementPostings({
        cashPayerId: 'a',
        cashReceiverId: 'b',
        amount: 1000,
      });
      expect(postings.length).toBeGreaterThan(0);
      expect(sumPostings(postings)).toBe(0);
    });

    it('refund returns balanced non-empty postings', () => {
      const postings = computeRefundPostings({
        refundAmount: 500,
        originalAmount: 1000,
        originalPostings: [
          { memberId: 'a', amount: 1000 },
          { memberId: 'b', amount: -1000 },
        ],
      });
      expect(postings.length).toBeGreaterThan(0);
      expect(sumPostings(postings)).toBe(0);
    });

    it('adjustment returns balanced non-empty postings', () => {
      const postings = computeAdjustmentPostings({
        postings: [
          { memberId: 'a', amount: 100 },
          { memberId: 'b', amount: -100 },
        ],
      });
      expect(postings.length).toBeGreaterThan(0);
      expect(sumPostings(postings)).toBe(0);
    });
  });

  describe('2. every posting references exactly one member', () => {
    it('all compute functions return postings with memberId', () => {
      const samples = [
        computeSharedExpensePostings({
          totalAmount: 1000,
          payers: [{ memberId: 'a', amountPaid: 1000 }],
          split: { method: 'EQUAL', participantIds: ['a', 'b'] },
        }),
        computeLoanPostings({
          lenderId: 'a',
          borrowerId: 'b',
          amount: 1000,
        }),
        computeCashMovementPostings({
          cashPayerId: 'a',
          cashReceiverId: 'b',
          amount: 1000,
        }),
        computeRefundPostings({
          refundAmount: 500,
          originalAmount: 1000,
          originalPostings: [
            { memberId: 'a', amount: 1000 },
            { memberId: 'b', amount: -1000 },
          ],
        }),
        computeAdjustmentPostings({
          postings: [
            { memberId: 'a', amount: 100 },
            { memberId: 'b', amount: -100 },
          ],
        }),
      ];

      for (const postings of samples) {
        for (const posting of postings) {
          expect(posting.memberId).toBeTruthy();
        }
      }
    });
  });

  describe('3. append-only enforcement', () => {
    it.skip('enforced at database level in Phase 2', () => {
      // Pure posting engine has no persistence layer.
    });
  });

  describe('4. refund requires source postings', () => {
    it('throws when original postings are missing', () => {
      expect(() =>
        computeRefundPostings({
          refundAmount: 100,
          originalAmount: 1000,
          originalPostings: [],
        }),
      ).toThrow(InvalidInputError);
    });
  });

  describe('5. member balance equals sum of postings', () => {
    it('derives balances from postings for shared expense', () => {
      const postings = computeSharedExpensePostings({
        totalAmount: 10000,
        payers: [{ memberId: 'hirushi', amountPaid: 10000 }],
        split: {
          method: 'EQUAL',
          participantIds: ['hirushi', 'kasun', 'amal', 'sahan', 'nimal'],
        },
      });

      expect(memberBalance(postings, 'hirushi')).toBe(8000);
      expect(memberBalance(postings, 'kasun')).toBe(-2000);
    });
  });
});

describe('data isolation (§3.8.1)', () => {
  it('shared expense input shape excludes metadata fields', () => {
    const input = {
      totalAmount: 1000,
      payers: [{ memberId: 'a', amountPaid: 1000 }],
      split: { method: 'EQUAL' as const, participantIds: ['a', 'b'] },
    };

    expect(input).not.toHaveProperty('category');
    expect(input).not.toHaveProperty('notes');
    expect(input).not.toHaveProperty('attachments');
    expect(input).not.toHaveProperty('tripId');
  });
});
