/**
 * Vitest global setup.
 * Runs before each test file.
 */

// Skip env validation in tests — individual tests set up what they need
process.env.SKIP_ENV_VALIDATION = "1"
