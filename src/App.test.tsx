import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import App from './App';

// Mock matchMedia to prevent errors from tailwind or UI components
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock the API response
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ items: [], collections: [] }),
});

describe('App Component', () => {
  it('renders without crashing and displays the Zotero VS header', () => {
    render(<App />);
    
    // Check if the brand logo / header text is in the document
    expect(screen.getByText('Zotero VS')).toBeInTheDocument();
  });
});
