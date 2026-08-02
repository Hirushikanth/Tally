import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { InvalidInputError } from '../src/posting-engine/errors';

/**
 * Phase H3 — global exception filter: standardized error shape, Prisma error
 * mapping, and production message masking.
 */
describe('AllExceptionsFilter (Phase H3 — global error handling)', () => {
  let json: jest.Mock;
  let status: jest.Mock;
  let filter: AllExceptionsFilter;

  const makeHost = () => {
    json = jest.fn();
    status = jest.fn().mockReturnValue({ json });
    const req = { url: '/trips/123', id: 'req-abc', headers: {} };
    const res = { status };
    return {
      host: {
        switchToHttp: () => ({
          getResponse: () => res,
          getRequest: () => req,
        }),
      },
      req,
    };
  };

  beforeEach(() => {
    filter = new AllExceptionsFilter();
  });

  const prismaError = (code: string) =>
    new Prisma.PrismaClientKnownRequestError('db error', {
      code,
      clientVersion: '6.0.0',
    });

  it('maps PostingEngineError to 422 with the domain shape', () => {
    const { host, req } = makeHost();
    filter.catch(new InvalidInputError('Bad share weights'), host);

    expect(status).toHaveBeenCalledWith(422);
    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(422);
    expect(body.error).toBe('Unprocessable Entity');
    expect(body.message).toBe('Bad share weights');
    expect(body.name).toBe('InvalidInputError');
    expect(body.path).toBe(req.url);
    expect(body.timestamp).toBeDefined();
    expect(body.requestId).toBe('req-abc');
  });

  it('keeps HttpException status and message, adds context', () => {
    const { host } = makeHost();
    filter.catch(new NotFoundException('Trip not found'), host);

    expect(status).toHaveBeenCalledWith(404);
    expect(json.mock.calls[0][0]).toMatchObject({
      statusCode: 404,
      message: 'Trip not found',
      error: 'Not Found',
      path: '/trips/123',
      timestamp: expect.any(String),
      requestId: 'req-abc',
    });
  });

  it('maps Prisma P2002 (unique violation) to 409', () => {
    const { host } = makeHost();
    filter.catch(prismaError('P2002'), host);
    expect(status).toHaveBeenCalledWith(409);
    expect(json.mock.calls[0][0].message).toBe(
      'A record with these details already exists',
    );
  });

  it('maps Prisma P2025 (record not found) to 404', () => {
    const { host } = makeHost();
    filter.catch(prismaError('P2025'), host);
    expect(status).toHaveBeenCalledWith(404);
    expect(json.mock.calls[0][0].message).toBe('Record not found');
  });

  it('maps Prisma P2003 (FK violation) to 400', () => {
    const { host } = makeHost();
    filter.catch(prismaError('P2003'), host);
    expect(status).toHaveBeenCalledWith(400);
  });

  it('masks unknown errors to a generic 500 in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { host } = makeHost();
      filter.catch(new Error('connection string contains secret'), host);
      expect(status).toHaveBeenCalledWith(500);
      expect(json.mock.calls[0][0].message).toBe('Internal server error');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });

  it('leaks the real message for unknown errors outside production', () => {
    const { host } = makeHost();
    filter.catch(new Error('debug detail for dev'), host);
    expect(status).toHaveBeenCalledWith(500);
    expect(json.mock.calls[0][0].message).toBe('debug detail for dev');
  });

  it('treats unknown Prisma codes as masked 500s', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      const { host } = makeHost();
      filter.catch(prismaError('P1001'), host);
      expect(status).toHaveBeenCalledWith(500);
      expect(json.mock.calls[0][0].message).toBe('Internal server error');
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
