// Jest runs e2e suites in-process; mark them as test env so rate limits are
// skipped (see ThrottlerModule config in app.module.ts).
process.env.NODE_ENV = 'test';
