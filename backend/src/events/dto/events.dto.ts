import {
  IsString,
  IsInt,
  IsPositive,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsNotEmpty,
  IsObject,
  ArrayMinSize,
  IsIn,
  IsNumber,
  Min,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { BusinessEventType } from '@prisma/client';

/** Trim a string value if present; non-strings are left for IsString to reject. */
function trimIfString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class PayerDto {
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsInt()
  @Min(0)
  amountPaid: number;
}

export class PercentageShareDto {
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsNumber()
  @IsPositive()
  percent: number;
}

export class ExactShareDto {
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsInt()
  @Min(0)
  shareOwed: number;
}

export class WeightShareDto {
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsNumber()
  @IsPositive()
  weight: number;
}

export enum SplitMethod {
  EQUAL = 'EQUAL',
  PERCENTAGE = 'PERCENTAGE',
  EXACT = 'EXACT',
  CUSTOM = 'CUSTOM',
  SHARES = 'SHARES',
}

export class EqualSplitDto {
  @IsEnum(SplitMethod)
  method: SplitMethod.EQUAL;

  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  participantIds: string[];
}

@ValidatorConstraint({ name: 'percentageSharesSumTo100', async: false })
class PercentageSharesSumTo100Constraint implements ValidatorConstraintInterface {
  validate(shares: PercentageShareDto[]): boolean {
    if (!Array.isArray(shares)) {
      return false;
    }
    const total = shares.reduce((sum, s) => sum + s.percent, 0);
    return Math.abs(total - 100) <= 1e-9;
  }

  defaultMessage(): string {
    return 'percentage shares must sum to 100';
  }
}

export class PercentageSplitDto {
  @IsEnum(SplitMethod)
  method: SplitMethod.PERCENTAGE;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PercentageShareDto)
  @ArrayMinSize(1)
  @Validate(PercentageSharesSumTo100Constraint)
  shares: PercentageShareDto[];
}

export class ExactSplitDto {
  @IsEnum(SplitMethod)
  method: SplitMethod; // EXACT or CUSTOM

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExactShareDto)
  @ArrayMinSize(1)
  shares: ExactShareDto[];
}

export class WeightSplitDto {
  @IsEnum(SplitMethod)
  method: SplitMethod.SHARES;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeightShareDto)
  @ArrayMinSize(1)
  shares: WeightShareDto[];
}

export type SplitDto =
  EqualSplitDto | PercentageSplitDto | ExactSplitDto | WeightSplitDto;

@ValidatorConstraint({ name: 'splitMethodKnown', async: false })
class SplitMethodKnownConstraint implements ValidatorConstraintInterface {
  validate(split: { method?: unknown }): boolean {
    return (
      typeof split === 'object' &&
      split !== null &&
      typeof split.method === 'string' &&
      Object.values(SplitMethod).includes(split.method as SplitMethod)
    );
  }

  defaultMessage(): string {
    return 'split must declare a known method (EQUAL, PERCENTAGE, EXACT, CUSTOM, SHARES)';
  }
}

export class CreateSharedExpenseDto {
  @IsInt()
  @IsPositive()
  amount: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayerDto)
  @ArrayMinSize(1)
  payers: PayerDto[];

  @IsObject()
  @IsNotEmpty()
  @Validate(SplitMethodKnownConstraint)
  @ValidateNested()
  @Type(() => Object, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: 'method',
      subTypes: [
        { value: EqualSplitDto, name: SplitMethod.EQUAL },
        { value: PercentageSplitDto, name: SplitMethod.PERCENTAGE },
        { value: ExactSplitDto, name: SplitMethod.EXACT },
        { value: ExactSplitDto, name: SplitMethod.CUSTOM },
        { value: WeightSplitDto, name: SplitMethod.SHARES },
      ],
    },
  })
  split: SplitDto;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  category?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  notes?: string;
}

export class CreateLoanDto {
  @IsString()
  @IsNotEmpty()
  lenderMemberId: string;

  @IsString()
  @IsNotEmpty()
  borrowerMemberId: string;

  @IsInt()
  @IsPositive()
  amount: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  category?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  notes?: string;
}

export class CreateCashMovementDto {
  @IsString()
  @IsNotEmpty()
  cashPayerMemberId: string;

  @IsString()
  @IsNotEmpty()
  cashReceiverMemberId: string;

  @IsInt()
  @IsPositive()
  amount: number;

  // Only REPAYMENT and SETTLEMENT are valid labels for a cash movement —
  // other event types must go through their own endpoints (ACCOUNTING.md §3.5.1).
  @IsEnum(BusinessEventType)
  @IsIn([BusinessEventType.REPAYMENT, BusinessEventType.SETTLEMENT])
  type: BusinessEventType;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  category?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  notes?: string;
}

export class CreateRefundDto {
  @IsString()
  @IsNotEmpty()
  refundOfId: string;

  @IsInt()
  @IsPositive()
  refundAmount: number;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  category?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  notes?: string;
}

export class PostingDraftDto {
  @IsString()
  @IsNotEmpty()
  memberId: string;

  @IsInt()
  amount: number;
}

export class CreateAdjustmentDto {
  @IsInt()
  amount: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PostingDraftDto)
  @ArrayMinSize(1)
  postings: PostingDraftDto[];

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  category?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => trimIfString(value))
  notes?: string;
}
