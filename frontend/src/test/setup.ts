import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

const isDom = typeof document !== "undefined";

if (isDom) {
  // Node 25의 실험적 전역 localStorage가 jsdom 것을 가린다. 테스트마다 비우는 메모리 저장소로 교체한다.
  class MemoryStorage implements Storage {
    private map = new Map<string, string>();
    get length() {
      return this.map.size;
    }
    clear() {
      this.map.clear();
    }
    getItem(key: string) {
      return this.map.has(key) ? this.map.get(key)! : null;
    }
    key(i: number) {
      return [...this.map.keys()][i] ?? null;
    }
    removeItem(key: string) {
      this.map.delete(key);
    }
    setItem(key: string, value: string) {
      this.map.set(key, String(value));
    }
  }
  Object.defineProperty(globalThis, "localStorage", { value: new MemoryStorage(), configurable: true });

  // jsdom에는 IntersectionObserver가 없다. 컴포넌트는 "더 보기" 버튼으로도 동작하므로 no-op으로 둔다.
  class NoopIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds: number[] = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  Object.defineProperty(globalThis, "IntersectionObserver", { value: NoopIntersectionObserver, configurable: true });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });
}
