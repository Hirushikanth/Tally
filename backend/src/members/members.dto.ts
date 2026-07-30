import { IsEmail, IsEnum, IsOptional } from 'class-validator';
import { MemberRole } from '@prisma/client';

export class AddMemberDto {
  @IsEmail()
  email: string;

  @IsEnum(MemberRole)
  @IsOptional()
  role?: MemberRole;
}
