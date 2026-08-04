import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { normalizeEmail } from './auth.service';

export const PASSWORD_RULES_MESSAGE =
  'Password must be at least 8 characters and contain at least one letter and one number';

export const PASSWORD_REGEX = /(?=.*[A-Za-z])(?=.*\d).*/;

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class SecurityQuestionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(trim)
  question: string;

  @IsString()
  @MinLength(3, { message: 'Answer must be at least 3 characters' })
  @MaxLength(200)
  @Transform(trim)
  answer: string;
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2, { message: 'Name must be at least 2 characters' })
  @MaxLength(100)
  @Transform(trim)
  name: string;

  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  email: string;

  @IsString()
  @MinLength(8, { message: PASSWORD_RULES_MESSAGE })
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULES_MESSAGE })
  password: string;

  @IsArray()
  @ArrayMinSize(2, { message: 'Provide at least 2 security questions' })
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SecurityQuestionDto)
  securityQuestions: SecurityQuestionDto[];
}

export class LoginDto {
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  email: string;
}

export class SecurityAnswerDto {
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @IsString()
  @IsNotEmpty()
  @Transform(trim)
  answer: string;
}

export class VerifyAnswersDto {
  @IsEmail()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  email: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => SecurityAnswerDto)
  answers: SecurityAnswerDto[];
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @MinLength(8, { message: PASSWORD_RULES_MESSAGE })
  @MaxLength(128)
  @Matches(PASSWORD_REGEX, { message: PASSWORD_RULES_MESSAGE })
  password: string;
}

export class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class LogoutDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}
