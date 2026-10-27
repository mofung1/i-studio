try {
  const responses = await Promise.all(
    ['/v1/health', '/'].map((path) =>
      fetch(`http://127.0.0.1:8080${path}`, {
        method: path === '/' ? 'HEAD' : 'GET',
        signal: AbortSignal.timeout(4000),
      }),
    ),
  )
  process.exit(responses.every((response) => response.ok) ? 0 : 1)
} catch {
  process.exit(1)
}
