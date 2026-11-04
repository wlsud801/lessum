import * as cheerio from 'cheerio'
import type { CheerioAPI } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'

import { StatementFormatError } from './errors.js'
import { clean } from './text.js'

export type { CheerioAPI, Element }

export function loadDocument(text: string): CheerioAPI {
  return cheerio.load(text)
}

export function textContent(node: AnyNode): string {
  if (node.type === 'text') {
    return node.data
  }
  if ('children' in node) {
    return node.children.map(textContent).join('')
  }
  return ''
}

export function visibleText(text: string): string {
  const $ = loadDocument(text)
  $('script, style').remove()
  return clean(textContent($.root().get(0)!))
}

export function tableRows($: CheerioAPI, table: Element): Element[] {
  return $(table)
    .children('thead, tbody, tfoot, tr')
    .toArray()
    .flatMap((child) =>
      child.name === 'tr' ? [child] : $(child).children('tr').toArray(),
    )
}

export function cells($: CheerioAPI, row: Element): string[] {
  return $(row)
    .children('td, th')
    .toArray()
    .map((cell) => clean(textContent(cell)))
}

export function findTable($: CheerioAPI, ...headers: string[]): Element {
  const found = $('table')
    .toArray()
    .filter((table) => {
      const head = tableRows($, table)
        .slice(0, 2)
        .map((row) => clean(textContent(row)))
        .join(' ')
      return headers.every((header) => head.includes(header))
    })

  if (found.length !== 1) {
    throw new StatementFormatError(
      'Transaction table missing or ambiguous; template review required',
    )
  }
  return found[0]
}
