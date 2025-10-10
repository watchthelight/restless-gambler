// Mock process.exit to prevent tests from exiting
const originalExit = process.exit;
process.exit = jest.fn();

// Restore after all tests
afterAll(() => {
    process.exit = originalExit;
});
