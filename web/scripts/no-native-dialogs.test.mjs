import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { expect, it } from 'vitest'

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name)
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.[jt]sx?$/.test(file) && !file.includes('.test.') && !file.endsWith('.d.ts')
        ? [file]
        : []
  })
}
it('keeps native alert/confirm/prompt and unload interception out of product flows', () => {
  const failures = []
  for (const file of ['app', 'components', 'lib', 'hooks'].flatMap(sourceFiles)) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    )
    const locals = new Set()
    function declared(node) {
      if (
        (ts.isFunctionDeclaration(node) ||
          ts.isVariableDeclaration(node) ||
          ts.isParameter(node) ||
          ts.isImportSpecifier(node)) &&
        node.name &&
        ts.isIdentifier(node.name)
      )
        locals.add(node.name.text)
      ts.forEachChild(node, declared)
    }
    declared(source)
    function scan(node) {
      if (ts.isCallExpression(node)) {
        const target = node.expression
        const native = ['alert', 'confirm', 'prompt']
        const member = ts.isPropertyAccessExpression(target)
          ? target.name.text
          : ts.isElementAccessExpression(target) && ts.isStringLiteral(target.argumentExpression)
            ? target.argumentExpression.text
            : ''
        const owner =
          ts.isPropertyAccessExpression(target) || ts.isElementAccessExpression(target)
            ? target.expression.getText(source)
            : ''
        if (
          (['window', 'globalThis'].includes(owner) && native.includes(member)) ||
          (ts.isIdentifier(target) && native.includes(target.text) && !locals.has(target.text))
        )
          failures.push(`${file}: native dialog`)
        if (
          member === 'addEventListener' &&
          node.arguments[0] &&
          ts.isStringLiteral(node.arguments[0]) &&
          node.arguments[0].text === 'beforeunload'
        )
          failures.push(`${file}: unload interception`)
      }
      ts.forEachChild(node, scan)
    }
    scan(source)
  }
  expect(failures).toEqual([])
})
