// 全局测试环境补丁：Radix 原语（Checkbox / RadioGroup 等）依赖浏览器 API，
// jsdom 未实现，这里提供最小 mock，避免在组件测试中抛 ResizeObserver 未定义。

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

class IntersectionObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver =
    IntersectionObserverMock as unknown as typeof IntersectionObserver
}
