import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE } from '../constants';

export class PaginationQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = DEFAULT_PAGE;

  // pageSize is NOT capped here — resolvePagination() silently caps it at
  // PAGE_SIZE_MAX so `?pageSize=300` yields 200 items instead of a 400.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number = DEFAULT_PAGE_SIZE;
}
