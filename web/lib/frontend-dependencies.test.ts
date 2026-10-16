import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

const root = resolve('.')
function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(path) : /\.[jt]sx?$/.test(entry.name) ? [path] : []
  })
}
function localModule(from: string, specifier: string) {
  const target = specifier.startsWith('@/')
    ? join(root, specifier.slice(2))
    : specifier.startsWith('.')
      ? resolve(dirname(from), specifier)
      : ''
  if (!target) return
  return [
    target + '.tsx',
    target + '.ts',
    join(target, 'index.tsx'),
    join(target, 'index.ts'),
  ].find(existsSync)
}
const managementModules = new Set([
  'lib/admin.ts',
  'lib/admin-site-settings.ts',
  'components/site-settings-panel.tsx',
  'components/prompt-reverse-settings-panel.tsx',
  'components/inspiration-prompt-manager.tsx',
  'components/inspiration-category-manager.tsx',
])

it('keeps operator requests and management components out of every frontend route dependency graph', () => {
  const entries = sourceFiles(join(root, 'app')).filter(
    (file) => /\/(page|layout)\.tsx$/.test(file) && !relative(root, file).startsWith('app/admin/'),
  )
  const seen = new Set<string>()
  const violations: string[] = []
  function visit(file: string, chain: string[]) {
    if (seen.has(file)) return
    seen.add(file)
    const name = relative(root, file)
    if (managementModules.has(name) || name.startsWith('components/admin/')) {
      violations.push([...chain, name].join(' → '))
      return
    }
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const follow = (specifier: string) => {
      const target = localModule(file, specifier)
      if (target) visit(target, [...chain, name])
    }
    function inspect(node: ts.Node) {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const clause = node.importClause
        if (clause?.isTypeOnly) return
        const bindings = clause?.namedBindings
        if (
          !clause?.name &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.every((part) => part.isTypeOnly)
        )
          return
        if (
          name !== 'components/account-provider.tsx' &&
          bindings &&
          ts.isNamedImports(bindings) &&
          bindings.elements.some(
            (part) => (part.propertyName ?? part.name).text === 'getAdminAccessToken',
          )
        ) {
          violations.push(`${name}: frontend business component reads administrator credentials`)
        }
        follow(node.moduleSpecifier.text)
      }
      if (
        ts.isExportDeclaration(node) &&
        !node.isTypeOnly &&
        node.moduleSpecifier &&
        ts.isStringLiteral(node.moduleSpecifier)
      )
        follow(node.moduleSpecifier.text)
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments[0] &&
        ts.isStringLiteral(node.arguments[0])
      )
        follow(node.arguments[0].text)
      ts.forEachChild(node, inspect)
    }
    inspect(source)
  }
  for (const file of entries) visit(file, [])
  expect(entries.length).toBeGreaterThan(10)
  expect(seen.size).toBeGreaterThan(50)
  expect(violations).toEqual([])
})
