import {
  IsString,
  IsInt,
  IsPositive,
  IsOptional,
  IsArray,
  ValidateNested,
  IsEnum,
  IsNotEmpty,
  ArrayMinSize,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BusinessEventType } from '@prisma/client';

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

export class PercentageSplitDto {
  @IsEnum(SplitMethod)
  method: SplitMethod.PERCENTAGE;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PercentageShareDto)
  @ArrayMinSize(1)
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

export class CreateSharedExpenseDto {
  @IsInt()
  @IsPositive()
  amount: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayerDto)
  @ArrayMinSize(1)
  payers: PayerDto[];

  @IsNotEmpty()
  split: any; // Checked at runtime / service layer based on method

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
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
  category?: string;

  @IsOptional()
  @IsString()
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

  @IsEnum(BusinessEventType)
  type: BusinessEventType;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
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
  category?: string;

  @IsOptional()
  @IsString()
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
  category?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
