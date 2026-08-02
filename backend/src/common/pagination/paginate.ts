import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, PAGE_SIZE_MAX } from '../constants';
import { PaginationQueryDto } from './pagination.dto';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** Resolve page/pageSize from a query DTO, silently capping pageSize at PAGE_SIZE_MAX. */
export function resolvePagination(
  query: PaginationQueryDto,
): { page: number; pageSize: number; skip: number } {
  const page = query.page ?? DEFAULT_PAGE;
  const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, PAGE_SIZE_MAX);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export function paginate<T>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
): Paginated<T> {
  return {
    items,
    page,
    pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
  };
}
