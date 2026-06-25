/**
 * Vitest setup for web React component tests (*.rtl.tsx, happy-dom env).
 * Only the vitest runner loads this — `bun test` (pure modules) never does.
 * Registers jest-dom matchers + RTL cleanup, and stubs the Next.js modules that
 * don't work outside the framework runtime (navigation/link/image/dynamic).
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import type { ReactNode } from "react";
import { createElement } from "react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

// happy-dom doesn't ship ResizeObserver, which @tanstack/react-virtual touches.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

type AnyProps = Record<string, unknown> & { children?: ReactNode };

// next/navigation — safe defaults; a test overrides via vi.mocked(useParams).mockReturnValue(...).
vi.mock("next/navigation", () => ({
  useParams: vi.fn(() => ({})),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => "/"),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// next/link → plain anchor (so href is assertable).
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: AnyProps) =>
    createElement("a", { href: typeof href === "string" ? href : "#", ...rest }, children),
}));

// next/image → plain img (drop Next-only props React would warn about on a DOM node).
vi.mock("next/image", () => ({
  default: ({
    src,
    alt = "",
    fill,
    priority,
    sizes,
    quality,
    placeholder,
    blurDataURL,
    loader,
    ...rest
  }: AnyProps) => createElement("img", { src: typeof src === "string" ? src : "", alt, ...rest }),
}));

// next/dynamic → a no-op component (QR canvas etc. aren't asserted in tests).
vi.mock("next/dynamic", () => ({ default: () => () => null }));
