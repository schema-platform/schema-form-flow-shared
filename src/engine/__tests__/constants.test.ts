import { describe, it, expect } from 'vitest'
import { DEFAULT_NODE_SIZES, DEFAULT_NODE_CONFIGS } from '../constants.js'
import { BpmnElementType } from '../../types/bpmn.js'

const ALL_ELEMENT_TYPES = Object.values(BpmnElementType)

describe('DEFAULT_NODE_SIZES', () => {
  it('has an entry for every BpmnElementType', () => {
    for (const type of ALL_ELEMENT_TYPES) {
      expect(DEFAULT_NODE_SIZES[type]).toBeDefined()
    }
  })

  it('all sizes have width > 0 and height > 0', () => {
    for (const type of ALL_ELEMENT_TYPES) {
      const size = DEFAULT_NODE_SIZES[type]
      expect(size.width).toBeGreaterThan(0)
      expect(size.height).toBeGreaterThan(0)
    }
  })
})

describe('DEFAULT_NODE_CONFIGS', () => {
  it('has an entry for every BpmnElementType', () => {
    for (const type of ALL_ELEMENT_TYPES) {
      expect(DEFAULT_NODE_CONFIGS[type]).toBeDefined()
    }
  })

  it('all configs have a label', () => {
    for (const type of ALL_ELEMENT_TYPES) {
      const config = DEFAULT_NODE_CONFIGS[type]
      expect(config.label).toBeDefined()
      expect(typeof config.label).toBe('string')
      expect(config.label!.length).toBeGreaterThan(0)
    }
  })
})
