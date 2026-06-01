// Mock server-only for script execution outside Next.js runtime
require.cache[require.resolve('server-only')] = { id: 'server-only', filename: 'server-only', loaded: true, exports: {} };
