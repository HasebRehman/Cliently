import '@testing-library/jest-dom';
import { beforeEach, afterEach, vi } from 'vitest';

// Global test setup and mocks
beforeEach(() => {
  // Clear mock history before each test
  vi.clearAllMocks();
});

afterEach(() => {
  // Clear any DOM modifications
  document.body.innerHTML = '';
});
