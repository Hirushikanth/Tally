// ============================================================
// Shared TypeScript types mirrored from backend DTOs & Prisma
// Sign convention: positive balance = should RECEIVE money
//                  negative balance = OWES money
// Amounts are in minor units (LKR cents: 1 LKR = 100 minor units)
// ============================================================

// --- Auth ---

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface RegisterResponse {
  user: AuthUser;
}

export interface SecurityQuestionDto {
  question: string;
  answer: string;
}

export interface RegisterDto {
  name: string;
  email: string;
  password: string;
  securityQuestions: SecurityQuestionDto[];
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface ForgotPasswordDto {
  email: string;
}

export interface SecurityQuestion {
  id: string;
  question: string;
}

export interface ForgotPasswordResponse {
  found: boolean;
  questions: SecurityQuestion[];
}

export interface VerifyAnswersDto {
  email: string;
  answers: { questionId: string; answer: string }[];
}

export interface VerifyAnswersResponse {
  resetToken: string;
}

export interface ResetPasswordDto {
  token: string;
  password: string;
}

export interface ResetPasswordResponse {
  success: boolean;
}

// --- Trips ---

export type TripStatus = 'ACTIVE' | 'ARCHIVED' | 'SETTLED';
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type BusinessEventType =
  | 'SHARED_EXPENSE'
  | 'LOAN'
  | 'REPAYMENT'
  | 'SETTLEMENT'
  | 'REFUND'
  | 'ADJUSTMENT';

export interface TripUser {
  id: string;
  name: string;
  email: string;
}

export interface TripMember {
  id: string;
  tripId: string;
  userId: string;
  user: TripUser;
  role: MemberRole;
  joinedAt: string;
  leftAt: string | null;
}

export interface Trip {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  status: TripStatus;
  createdAt: string;
  createdById: string;
  members: TripMember[];
  _count?: { businessEvents: number };
}

export interface CreateTripDto {
  name: string;
  description?: string;
  currency?: string;
}

// --- Members ---

export interface AddMemberDto {
  email: string;
  role?: MemberRole;
}

// --- Events ---

export type SplitMethod = 'EQUAL' | 'PERCENTAGE' | 'EXACT' | 'CUSTOM' | 'SHARES';

export interface PayerDto {
  memberId: string;
  amountPaid: number;
}

export interface EqualSplitDto {
  method: 'EQUAL';
  participantIds: string[];
}

export interface PercentageSplitDto {
  method: 'PERCENTAGE';
  shares: { memberId: string; percent: number }[];
}

export interface ExactSplitDto {
  method: 'EXACT' | 'CUSTOM';
  shares: { memberId: string; shareOwed: number }[];
}

export interface WeightSplitDto {
  method: 'SHARES';
  shares: { memberId: string; weight: number }[];
}

export type SplitDto = EqualSplitDto | PercentageSplitDto | ExactSplitDto | WeightSplitDto;

export interface CreateSharedExpenseDto {
  amount: number;
  payers: PayerDto[];
  split: SplitDto;
  category?: string;
  notes?: string;
}

export interface CreateLoanDto {
  lenderMemberId: string;
  borrowerMemberId: string;
  amount: number;
  category?: string;
  notes?: string;
}

export interface CreateCashMovementDto {
  cashPayerMemberId: string;
  cashReceiverMemberId: string;
  amount: number;
  type: 'REPAYMENT' | 'SETTLEMENT';
  category?: string;
  notes?: string;
}

export interface CreateRefundDto {
  refundOfId: string;
  refundAmount: number;
  category?: string;
  notes?: string;
}

export interface CreateAdjustmentDto {
  amount: number;
  allocations: { memberId: string; amount: number }[];
  category?: string;
  notes?: string;
}

export interface EventAllocation {
  id: string;
  memberId: string;
  amount: number;
  createdAt: string;
  member?: {
    user: TripUser;
  };
}

export interface BusinessEvent {
  id: string;
  tripId: string;
  type: BusinessEventType;
  notes: string | null;
  category: string | null;
  amount: number;
  createdById: string;
  createdAt: string;
  refundOfId: string | null;
  createdBy?: TripUser;
  allocations?: EventAllocation[];
}

// --- Ledger ---

export interface MemberBalanceDto {
  memberId: string;
  userId: string;
  userName: string;
  userEmail: string;
  role: MemberRole;
  balance: number; // minor units, signed
}

export interface TripBalancesResponse {
  tripId: string;
  totalSum: number;
  balances: MemberBalanceDto[];
}

export interface MemberLedgerEntry {
  entryId: string;
  amount: number;
  createdAt: string;
  runningBalance: number;
  businessEvent: {
    id: string;
    type: BusinessEventType;
    notes: string | null;
    category: string | null;
    amount: number;
    createdAt: string;
    createdById: string;
    createdBy: TripUser;
    refundOfId: string | null;
  };
}

export interface MemberLedgerResponse extends Paginated<MemberLedgerEntry> {
  memberId: string;
  userName: string;
  currentBalance: number;
}

// --- Settlements ---

export interface SuggestedSettlement {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amount: number;
}

export interface SettlementSuggestionsResponse {
  tripId: string;
  suggestedSettlements: SuggestedSettlement[];
}

// --- API error ---

export interface ApiError {
  message: string;
  statusCode: number;
}

// --- Pagination ---

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
}
