import { describe, it, expect } from 'vitest'
import {
  extractCrossNodeRefs,
  resolveSingleRef,
  resolveCrossNodeTemplate,
  resolveCrossNodeValues,
  collectReferencedNodeIds,
} from '../CrossNodeResolver.js'
import type { NodeFormDataMap } from '../../types/instance.js'

describe('CrossNodeResolver', () => {
  const sampleData: NodeFormDataMap = {
    'task-approve': {
      amount: 5000,
      approver: '张三',
      detail: { category: 'travel', items: ['flight', 'hotel'] },
    },
    'task-review': {
      score: 85,
      comment: '符合要求',
      approved: true,
    },
  }

  describe('extractCrossNodeRefs', () => {
    it('extracts simple field references', () => {
      const refs = extractCrossNodeRefs('{{task-approve.amount}}')
      expect(refs).toHaveLength(1)
      expect(refs[0].nodeId).toBe('task-approve')
      expect(refs[0].fieldPath).toEqual(['amount'])
    })

    it('extracts nested field references', () => {
      const refs = extractCrossNodeRefs('{{task-approve.detail.category}}')
      expect(refs).toHaveLength(1)
      expect(refs[0].nodeId).toBe('task-approve')
      expect(refs[0].fieldPath).toEqual(['detail', 'category'])
    })

    it('extracts multiple references in one string', () => {
      const refs = extractCrossNodeRefs(
        '金额: {{task-approve.amount}}, 评分: {{task-review.score}}',
      )
      expect(refs).toHaveLength(2)
      expect(refs[0].nodeId).toBe('task-approve')
      expect(refs[1].nodeId).toBe('task-review')
    })

    it('returns empty array for no references', () => {
      expect(extractCrossNodeRefs('plain text')).toHaveLength(0)
      expect(extractCrossNodeRefs('')).toHaveLength(0)
    })

    it('handles node IDs with hyphens and underscores', () => {
      const refs = extractCrossNodeRefs('{{my_task-node.field}}')
      expect(refs).toHaveLength(1)
      expect(refs[0].nodeId).toBe('my_task-node')
    })

    it('rejects path depth > 10', () => {
      const deepPath = 'a.b.c.d.e.f.g.h.i.j.k' // 11 segments
      const refs = extractCrossNodeRefs(`{{node.${deepPath}}}`)
      expect(refs).toHaveLength(0)
    })
  })

  describe('resolveSingleRef', () => {
    it('resolves simple field', () => {
      expect(resolveSingleRef('task-approve', ['amount'], sampleData)).toBe(5000)
    })

    it('resolves nested field', () => {
      expect(resolveSingleRef('task-approve', ['detail', 'category'], sampleData)).toBe('travel')
    })

    it('returns empty string for missing node', () => {
      expect(resolveSingleRef('nonexistent', ['amount'], sampleData)).toBe('')
    })

    it('returns empty string for missing field', () => {
      expect(resolveSingleRef('task-approve', ['nonexistent'], sampleData)).toBe('')
    })

    it('returns empty string for null/undefined value', () => {
      const dataWithNull: NodeFormDataMap = { node: { field: null } }
      expect(resolveSingleRef('node', ['field'], dataWithNull)).toBe('')
    })

    it('returns 0 for zero value (not treated as empty)', () => {
      const dataWithZero: NodeFormDataMap = { node: { amount: 0 } }
      expect(resolveSingleRef('node', ['amount'], dataWithZero)).toBe(0)
    })

    it('returns false for false value (not treated as empty)', () => {
      const dataWithFalse: NodeFormDataMap = { node: { flag: false } }
      expect(resolveSingleRef('node', ['flag'], dataWithFalse)).toBe(false)
    })
  })

  describe('resolveCrossNodeTemplate', () => {
    it('resolves single reference in template', () => {
      const result = resolveCrossNodeTemplate(
        '审批金额: {{task-approve.amount}}',
        sampleData,
      )
      expect(result).toBe('审批金额: 5000')
    })

    it('resolves multiple references', () => {
      const result = resolveCrossNodeTemplate(
        '金额{{task-approve.amount}}/评分{{task-review.score}}',
        sampleData,
      )
      expect(result).toBe('金额5000/评分85')
    })

    it('resolves missing data to empty string', () => {
      const result = resolveCrossNodeTemplate(
        '{{nonexistent.field}}',
        sampleData,
      )
      expect(result).toBe('')
    })

    it('returns original string when no references', () => {
      expect(resolveCrossNodeTemplate('plain text', sampleData)).toBe('plain text')
    })

    it('returns empty string for empty input', () => {
      expect(resolveCrossNodeTemplate('', sampleData)).toBe('')
    })

    it('resolves boolean values as string', () => {
      const result = resolveCrossNodeTemplate(
        '{{task-review.approved}}',
        sampleData,
      )
      expect(result).toBe('true')
    })

    it('resolves nested object to [object Object] string', () => {
      const result = resolveCrossNodeTemplate(
        '{{task-approve.detail}}',
        sampleData,
      )
      // Object values are coerced via String(), yielding [object Object]
      expect(result).toBe('[object Object]')
    })
  })

  describe('resolveCrossNodeValues', () => {
    it('resolves string values with cross-node references', () => {
      const values = {
        title: '报销单 - {{task-approve.approver}}',
        amount: '{{task-approve.amount}}',
        static: 'no ref',
      }
      const result = resolveCrossNodeValues(values, sampleData)
      expect(result.title).toBe('报销单 - 张三')
      expect(result.amount).toBe('5000')
      expect(result.static).toBe('no ref')
    })

    it('passes through non-string values unchanged', () => {
      const values = {
        num: 42,
        bool: true,
        nil: null,
        undef: undefined,
      }
      const result = resolveCrossNodeValues(values, sampleData)
      expect(result.num).toBe(42)
      expect(result.bool).toBe(true)
      expect(result.nil).toBe(null)
      expect(result.undef).toBe(undefined)
    })

    it('resolves nested objects recursively', () => {
      const values = {
        level1: {
          level2: {
            ref: '{{task-review.comment}}',
          },
        },
      }
      const result = resolveCrossNodeValues(values, sampleData) as Record<string, unknown>
      expect((result.level1 as Record<string, unknown>).level2).toEqual({ ref: '符合要求' })
    })

    it('resolves arrays with string elements', () => {
      const values = {
        items: ['{{task-approve.approver}}', 'static', '{{task-review.score}}'],
      }
      const result = resolveCrossNodeValues(values, sampleData) as Record<string, unknown>
      expect(result.items).toEqual(['张三', 'static', '85'])
    })

    it('resolves arrays with object elements', () => {
      const values = {
        items: [
          { name: '{{task-approve.approver}}' },
          { name: 'static' },
        ],
      }
      const result = resolveCrossNodeValues(values, sampleData) as Record<string, unknown>
      expect((result.items as unknown[])[0]).toEqual({ name: '张三' })
    })

    it('returns empty record for empty input', () => {
      expect(resolveCrossNodeValues({}, sampleData)).toEqual({})
    })
  })

  describe('collectReferencedNodeIds', () => {
    it('collects node IDs from string values', () => {
      const values = {
        a: '{{node-1.field}}',
        b: '{{node-2.field}}',
        c: 'no ref',
      }
      const ids = collectReferencedNodeIds(values)
      expect(ids.has('node-1')).toBe(true)
      expect(ids.has('node-2')).toBe(true)
      expect(ids.size).toBe(2)
    })

    it('collects from nested objects', () => {
      const values = {
        nested: { ref: '{{deep-node.field}}' },
      }
      const ids = collectReferencedNodeIds(values)
      expect(ids.has('deep-node')).toBe(true)
    })

    it('collects from arrays', () => {
      const values = {
        arr: ['{{arr-node.field}}', 'plain'],
      }
      const ids = collectReferencedNodeIds(values)
      expect(ids.has('arr-node')).toBe(true)
    })

    it('deduplicates node IDs', () => {
      const values = {
        a: '{{dup-node.x}}',
        b: '{{dup-node.y}}',
      }
      const ids = collectReferencedNodeIds(values)
      expect(ids.size).toBe(1)
      expect(ids.has('dup-node')).toBe(true)
    })

    it('returns empty set for no references', () => {
      expect(collectReferencedNodeIds({ a: 'plain', b: 42 }).size).toBe(0)
    })
  })
})
