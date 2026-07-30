export type PostingDraft = {
  memberId: string;
  amount: number;
};

export type PayerInput = {
  memberId: string;
  amountPaid: number;
};

export type SharedExpenseInput = {
  totalAmount: number;
  payers: PayerInput[];
} & (
  | { split: { method: 'EQUAL'; participantIds: string[] } }
  | {
      split: {
        method: 'PERCENTAGE';
        shares: { memberId: string; percent: number }[];
      };
    }
  | {
      split: {
        method: 'EXACT' | 'CUSTOM';
        shares: { memberId: string; shareOwed: number }[];
      };
    }
  | {
      split: {
        method: 'SHARES';
        shares: { memberId: string; weight: number }[];
      };
    }
);

export type LoanInput = {
  lenderId: string;
  borrowerId: string;
  amount: number;
};

export type CashMovementInput = {
  cashPayerId: string;
  cashReceiverId: string;
  amount: number;
};

export type RefundInput = {
  refundAmount: number;
  originalAmount: number;
  originalPostings: PostingDraft[];
};

export type AdjustmentInput = {
  postings: PostingDraft[];
};
