/**
 * CrossNodeResolver — resolves {{nodeId.fieldName}} template expressions
 * in form default values and computed fields.
 *
 * Template syntax:
 *   {{nodeId.fieldName}}          — simple field reference
 *   {{nodeId.fieldName.subField}} — nested field reference (dot path)
 *
 * Rules:
 * - If the referenced nodeId or field does not exist in the data map,
 *   the expression resolves to empty string (not an error).
 * - Supports arbitrary nesting via dot-path traversal.
 * - Maximum template expression length is 2000 characters.
 * - Maximum nesting depth is 10 levels.
 */

import type { NodeFormDataMap } from '../types/instance.js'

const MAX_TEMPLATE_LENGTH = 2000
const MAX_PATH_DEPTH = 10

/**
 * Resolve a dot-path against an object, returning undefined if any segment is missing.
 */
function resolvePath(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const seg of path) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[seg]
  }
  return current
}

/**
 * Extract all {{nodeId.fieldName[.subField...]}} references from a template string.
 * Returns an array of { fullMatch, nodeId, fieldPath } objects.
 */
export function extractCrossNodeRefs(template: string): Array<{
  fullMatch: string
  nodeId: string
  fieldPath: string[]
}> {
  if (!template || template.length > MAX_TEMPLATE_LENGTH) return []

  const pattern = /\{\{([a-zA-Z_][a-zA-Z0-9_-]*)\.((?:[a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}\}/g
  const refs: Array<{ fullMatch: string; nodeId: string; fieldPath: string[] }> = []

  let match: RegExpExecArray | null
  while ((match = pattern.exec(template)) !== null) {
    const fullMatch = match[0]
    const nodeId = match[1]
    const fieldPathStr = match[2]
    const fieldPath = fieldPathStr.split('.')

    if (fieldPath.length > MAX_PATH_DEPTH) continue

    refs.push({ fullMatch, nodeId, fieldPath })
  }

  return refs
}

/**
 * Resolve a single {{nodeId.fieldPath}} reference against the data map.
 * Returns the resolved value, or empty string if not found.
 */
export function resolveSingleRef(
  nodeId: string,
  fieldPath: string[],
  nodeData: NodeFormDataMap,
): unknown {
  const nodeFormData = nodeData[nodeId]
  if (nodeFormData == null) return ''

  const value = resolvePath(nodeFormData, fieldPath)
  return value === undefined || value === null ? '' : value
}

/**
 * Resolve all {{nodeId.fieldName}} references in a template string,
 * replacing them with actual values from the node data map.
 *
 * @param template - Template string containing {{nodeId.field}} expressions
 * @param nodeData - Map of nodeId -> form field values from upstream nodes
 * @returns Resolved string with all cross-node references replaced
 */
export function resolveCrossNodeTemplate(
  template: string,
  nodeData: NodeFormDataMap,
): string {
  if (!template) return template

  return template.replace(
    /\{\{([a-zA-Z_][a-zA-Z0-9_-]*)\.((?:[a-zA-Z_][a-zA-Z0-9_]*)(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)\}\}/g,
    (_match: string, nodeId: string, fieldPathStr: string) => {
      const fieldPath = fieldPathStr.split('.')
      if (fieldPath.length > MAX_PATH_DEPTH) return ''
      const value = resolveSingleRef(nodeId, fieldPath, nodeData)
      return String(value)
    },
  )
}

/**
 * Resolve all cross-node references in a record of values.
 * For string values, resolves {{nodeId.field}} templates.
 * For non-string values, returns them unchanged.
 *
 * @param values - Record of field values that may contain cross-node references
 * @param nodeData - Map of nodeId -> form field values from upstream nodes
 * @returns New record with all cross-node references resolved
 */
export function resolveCrossNodeValues(
  values: Record<string, unknown>,
  nodeData: NodeFormDataMap,
): Record<string, unknown> {
  const resolved: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') {
      resolved[key] = resolveCrossNodeTemplate(value, nodeData)
    } else if (Array.isArray(value)) {
      resolved[key] = value.map((item) => {
        if (typeof item === 'string') return resolveCrossNodeTemplate(item, nodeData)
        if (item != null && typeof item === 'object' && !Array.isArray(item)) {
          return resolveCrossNodeValues(item as Record<string, unknown>, nodeData)
        }
        return item
      })
    } else if (value != null && typeof value === 'object') {
      resolved[key] = resolveCrossNodeValues(value as Record<string, unknown>, nodeData)
    } else {
      resolved[key] = value
    }
  }

  return resolved
}

/**
 * Collect all nodeIds referenced in cross-node expressions within a values record.
 * Useful for pre-fetching only the needed upstream data.
 */
export function collectReferencedNodeIds(values: Record<string, unknown>): Set<string> {
  const nodeIds = new Set<string>()

  function scan(obj: unknown): void {
    if (typeof obj === 'string') {
      const refs = extractCrossNodeRefs(obj)
      for (const ref of refs) {
        nodeIds.add(ref.nodeId)
      }
    } else if (Array.isArray(obj)) {
      for (const item of obj) scan(item)
    } else if (obj != null && typeof obj === 'object') {
      for (const val of Object.values(obj as Record<string, unknown>)) {
        scan(val)
      }
    }
  }

  scan(values)
  return nodeIds
}
