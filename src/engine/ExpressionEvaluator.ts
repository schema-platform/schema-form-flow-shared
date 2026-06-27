/**
 * ExpressionEvaluator — 安全的表达式求值引擎
 *
 * 使用递归下降解析器（recursive-descent parser）替代 new Function()。
 * 只允许安全的 AST 节点：字面量、标识符、成员访问、二元/一元/三元/逻辑运算、
 * 以及对基础类型的受控方法调用。
 *
 * 支持的语法：
 * - 字面量：数字、字符串、布尔、null、undefined、数组、对象
 * - 标识符：变量引用（仅允许 letters/digits/underscore/dollar）
 * - 成员访问：a.b.c、a['b']
 * - 二元运算：+ - * / % **  === !== > < >= <=  && ||  instanceof in
 * - 一元运算：! - + typeof void
 * - 三元运算：condition ? a : b
 * - 方法调用：str.toUpperCase()、arr.includes(x) 等安全方法
 * - 数组/对象字面量：[1,2,3]、{a: 1}
 * - 可选链：a?.b、a?.()
 * - 空值合并：a ?? b
 * - 展开运算不支持、new 不支持、赋值不支持
 */

const MAX_EXPRESSION_LENGTH = 500
const MAX_SCRIPT_LENGTH = 10000

export class ExpressionEvaluationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExpressionEvaluationError'
  }
}

// ---- Tokenizer ----

type TokenType =
  | 'number' | 'string' | 'boolean' | 'null' | 'undefined'
  | 'identifier'
  | 'plus' | 'minus' | 'star' | 'slash' | 'percent' | 'starstar'
  | 'eq' | 'neq' | 'seq' | 'sneq' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'and' | 'or' | 'not' | 'bitand' | 'bitor' | 'bitxor' | 'bitnot'
  | 'question' | 'colon' | 'comma' | 'dot'
  | 'lparen' | 'rparen' | 'lbracket' | 'rbracket' | 'lbrace' | 'rbrace'
  | 'optional_chain' | 'nullish' | 'question_dot'
  | 'typeof' | 'void' | 'instanceof' | 'in'
  | 'eof'

interface Token {
  type: TokenType
  value: string
  pos: number
}

const KEYWORDS: Record<string, TokenType> = {
  'true': 'boolean', 'false': 'boolean', 'null': 'null', 'undefined': 'undefined',
  'typeof': 'typeof', 'void': 'void', 'instanceof': 'instanceof', 'in': 'in',
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < input.length) {
    // skip whitespace
    if (/\s/.test(input[i])) { i++; continue }

    const pos = i

    // numbers
    if (/[0-9]/.test(input[i]) || (input[i] === '.' && i + 1 < input.length && /[0-9]/.test(input[i + 1]))) {
      let num = ''
      if (input[i] === '0' && (input[i + 1] === 'x' || input[i + 1] === 'X')) {
        num = input.slice(i, i + 2); i += 2
        while (i < input.length && /[0-9a-fA-F_]/.test(input[i])) { num += input[i]; i++ }
      } else if (input[i] === '0' && (input[i + 1] === 'b' || input[i + 1] === 'B')) {
        num = input.slice(i, i + 2); i += 2
        while (i < input.length && /[01_]/.test(input[i])) { num += input[i]; i++ }
      } else {
        while (i < input.length && /[0-9_]/.test(input[i])) { num += input[i]; i++ }
        if (i < input.length && input[i] === '.') {
          num += '.'; i++
          while (i < input.length && /[0-9_]/.test(input[i])) { num += input[i]; i++ }
        }
        if (i < input.length && (input[i] === 'e' || input[i] === 'E')) {
          num += input[i]; i++
          if (i < input.length && (input[i] === '+' || input[i] === '-')) { num += input[i]; i++ }
          while (i < input.length && /[0-9_]/.test(input[i])) { num += input[i]; i++ }
        }
      }
      tokens.push({ type: 'number', value: num.replace(/_/g, ''), pos })
      continue
    }

    // strings
    if (input[i] === '"' || input[i] === "'" || input[i] === '`') {
      const quote = input[i]
      let str = ''
      i++
      while (i < input.length && input[i] !== quote) {
        if (input[i] === '\\') {
          str += input[i]; i++
          if (i < input.length) { str += input[i]; i++ }
        } else {
          str += input[i]; i++
        }
      }
      if (i >= input.length) throw new ExpressionEvaluationError(`未终止的字符串 (pos ${pos})`)
      i++ // closing quote
      tokens.push({ type: 'string', value: str, pos })
      continue
    }

    // identifiers / keywords
    if (/[a-zA-Z_$]/.test(input[i])) {
      let id = ''
      while (i < input.length && /[a-zA-Z0-9_$]/.test(input[i])) { id += input[i]; i++ }
      const kwType = KEYWORDS[id]
      if (kwType) {
        tokens.push({ type: kwType, value: id, pos })
      } else {
        tokens.push({ type: 'identifier', value: id, pos })
      }
      continue
    }

    // operators
    const ch = input[i]
    const next = i + 1 < input.length ? input[i + 1] : ''
    const next2 = i + 2 < input.length ? input[i + 2] : ''

    if (ch === '?' && next === '.') {
      tokens.push({ type: 'question_dot', value: '?.', pos }); i += 2; continue
    }
    if (ch === '?' && next === '?') {
      tokens.push({ type: 'nullish', value: '??', pos }); i += 2; continue
    }
    if (ch === '?') {
      tokens.push({ type: 'question', value: '?', pos }); i++; continue
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':', pos }); i++; continue
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',', pos }); i++; continue
    }
    if (ch === '.') {
      tokens.push({ type: 'dot', value: '.', pos }); i++; continue
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(', pos }); i++; continue
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')', pos }); i++; continue
    }
    if (ch === '[') {
      tokens.push({ type: 'lbracket', value: '[', pos }); i++; continue
    }
    if (ch === ']') {
      tokens.push({ type: 'rbracket', value: ']', pos }); i++; continue
    }
    if (ch === '{') {
      tokens.push({ type: 'lbrace', value: '{', pos }); i++; continue
    }
    if (ch === '}') {
      tokens.push({ type: 'rbrace', value: '}', pos }); i++; continue
    }
    if (ch === '*' && next === '*') {
      tokens.push({ type: 'starstar', value: '**', pos }); i += 2; continue
    }
    if (ch === '*') {
      tokens.push({ type: 'star', value: '*', pos }); i++; continue
    }
    if (ch === '/') {
      tokens.push({ type: 'slash', value: '/', pos }); i++; continue
    }
    if (ch === '%') {
      tokens.push({ type: 'percent', value: '%', pos }); i++; continue
    }
    if (ch === '+' && next === '+') {
      throw new ExpressionEvaluationError('不允许自增/自减运算')
    }
    if (ch === '+') {
      tokens.push({ type: 'plus', value: '+', pos }); i++; continue
    }
    if (ch === '-' && next === '-') {
      throw new ExpressionEvaluationError('不允许自增/自减运算')
    }
    if (ch === '-') {
      tokens.push({ type: 'minus', value: '-', pos }); i++; continue
    }
    if (ch === '=' && next === '=' && next2 === '=') {
      tokens.push({ type: 'seq', value: '===', pos }); i += 3; continue
    }
    if (ch === '!' && next === '=' && next2 === '=') {
      tokens.push({ type: 'sneq', value: '!==', pos }); i += 3; continue
    }
    if (ch === '=' && next === '=') {
      tokens.push({ type: 'eq', value: '==', pos }); i += 2; continue
    }
    if (ch === '!' && next === '=') {
      tokens.push({ type: 'neq', value: '!=', pos }); i += 2; continue
    }
    if (ch === '=' || ch === '+=' || ch === '-=') {
      throw new ExpressionEvaluationError('不允许赋值运算')
    }
    if (ch === '>' && next === '=') {
      tokens.push({ type: 'gte', value: '>=', pos }); i += 2; continue
    }
    if (ch === '>') {
      tokens.push({ type: 'gt', value: '>', pos }); i++; continue
    }
    if (ch === '<' && next === '=') {
      tokens.push({ type: 'lte', value: '<=', pos }); i += 2; continue
    }
    if (ch === '<') {
      tokens.push({ type: 'lt', value: '<', pos }); i++; continue
    }
    if (ch === '&' && next === '&') {
      tokens.push({ type: 'and', value: '&&', pos }); i += 2; continue
    }
    if (ch === '|') {
      if (next === '|') {
        tokens.push({ type: 'or', value: '||', pos }); i += 2; continue
      }
      // single | not supported
      throw new ExpressionEvaluationError(`不支持的运算符 '|' (pos ${pos})`)
    }
    if (ch === '!') {
      tokens.push({ type: 'not', value: '!', pos }); i++; continue
    }

    throw new ExpressionEvaluationError(`不支持的字符 '${ch}' (pos ${pos})`)
  }

  tokens.push({ type: 'eof', value: '', pos: i })
  return tokens
}

// ---- AST ----

type ASTNode =
  | { type: 'Literal'; value: unknown }
  | { type: 'Identifier'; name: string }
  | { type: 'BinaryExpression'; operator: string; left: ASTNode; right: ASTNode }
  | { type: 'UnaryExpression'; operator: string; operand: ASTNode }
  | { type: 'LogicalExpression'; operator: '&&' | '||' | '??'; left: ASTNode; right: ASTNode }
  | { type: 'ConditionalExpression'; test: ASTNode; consequent: ASTNode; alternate: ASTNode }
  | { type: 'MemberExpression'; object: ASTNode; property: ASTNode; computed: boolean; optional: boolean }
  | { type: 'CallExpression'; callee: ASTNode; args: ASTNode[]; optional: boolean }
  | { type: 'ArrayExpression'; elements: ASTNode[] }
  | { type: 'ObjectExpression'; properties: Array<{ key: string; value: ASTNode }> }

// ---- Parser (recursive descent) ----

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private peek(): Token { return this.tokens[this.pos] }
  private advance(): Token { const t = this.tokens[this.pos]; this.pos++; return t }
  private expect(type: TokenType): Token {
    const t = this.advance()
    if (t.type !== type) {
      throw new ExpressionEvaluationError(
        `期望 ${type}，得到 ${t.type} '${t.value}' (pos ${t.pos})`,
      )
    }
    return t
  }

  parse(): ASTNode {
    const node = this.parseExpression()
    if (this.peek().type !== 'eof') {
      throw new ExpressionEvaluationError(
        `表达式未完全解析 (pos ${this.peek().pos})`,
      )
    }
    return node
  }

  // expression → conditional
  private parseExpression(): ASTNode {
    return this.parseNullish()
  }

  // nullish coalescing
  private parseNullish(): ASTNode {
    let left = this.parseOr()
    while (this.peek().type === 'nullish') {
      this.advance()
      const right = this.parseOr()
      left = { type: 'LogicalExpression', operator: '??', left, right }
    }
    return left
  }

  // logical OR
  private parseOr(): ASTNode {
    let left = this.parseAnd()
    while (this.peek().type === 'or') {
      this.advance()
      const right = this.parseAnd()
      left = { type: 'LogicalExpression', operator: '||', left, right }
    }
    return left
  }

  // logical AND
  private parseAnd(): ASTNode {
    let left = this.parseBitOr()
    while (this.peek().type === 'and') {
      this.advance()
      const right = this.parseBitOr()
      left = { type: 'LogicalExpression', operator: '&&', left, right }
    }
    return left
  }

  // bitwise OR (single |) — not supported, skip to bitwise XOR
  private parseBitOr(): ASTNode {
    return this.parseBitXor()
  }

  // bitwise XOR
  private parseBitXor(): ASTNode {
    return this.parseBitAnd()
  }

  // bitwise AND
  private parseBitAnd(): ASTNode {
    return this.parseEquality()
  }

  // equality
  private parseEquality(): ASTNode {
    let left = this.parseComparison()
    while (this.peek().type === 'eq' || this.peek().type === 'neq' ||
           this.peek().type === 'seq' || this.peek().type === 'sneq') {
      const op = this.advance().value
      const right = this.parseComparison()
      left = { type: 'BinaryExpression', operator: op, left, right }
    }
    return left
  }

  // comparison + instanceof + in
  private parseComparison(): ASTNode {
    let left = this.parseAdditive()
    while (this.peek().type === 'gt' || this.peek().type === 'gte' ||
           this.peek().type === 'lt' || this.peek().type === 'lte' ||
           this.peek().type === 'instanceof' || this.peek().type === 'in') {
      const op = this.advance().value
      const right = this.parseAdditive()
      left = { type: 'BinaryExpression', operator: op, left, right }
    }
    return left
  }

  // additive
  private parseAdditive(): ASTNode {
    let left = this.parseMultiplicative()
    while (this.peek().type === 'plus' || this.peek().type === 'minus') {
      const op = this.advance().value
      const right = this.parseMultiplicative()
      left = { type: 'BinaryExpression', operator: op, left, right }
    }
    return left
  }

  // multiplicative
  private parseMultiplicative(): ASTNode {
    let left = this.parseExponentiation()
    while (this.peek().type === 'star' || this.peek().type === 'slash' || this.peek().type === 'percent') {
      const op = this.advance().value
      const right = this.parseExponentiation()
      left = { type: 'BinaryExpression', operator: op, left, right }
    }
    return left
  }

  // exponentiation (right-associative)
  private parseExponentiation(): ASTNode {
    const left = this.parseUnary()
    if (this.peek().type === 'starstar') {
      this.advance()
      const right = this.parseExponentiation() // right-associative
      return { type: 'BinaryExpression', operator: '**', left, right }
    }
    return left
  }

  // unary
  private parseUnary(): ASTNode {
    const t = this.peek()
    if (t.type === 'not') {
      this.advance()
      return { type: 'UnaryExpression', operator: '!', operand: this.parseUnary() }
    }
    if (t.type === 'minus') {
      this.advance()
      return { type: 'UnaryExpression', operator: '-', operand: this.parseUnary() }
    }
    if (t.type === 'plus') {
      this.advance()
      return { type: 'UnaryExpression', operator: '+', operand: this.parseUnary() }
    }
    if (t.type === 'typeof') {
      this.advance()
      return { type: 'UnaryExpression', operator: 'typeof', operand: this.parseUnary() }
    }
    if (t.type === 'void') {
      this.advance()
      return { type: 'UnaryExpression', operator: 'void', operand: this.parseUnary() }
    }
    return this.parsePostfix()
  }

  // postfix: member access, calls, indexing, ternary
  private parsePostfix(): ASTNode {
    let node = this.parsePrimary()

    while (true) {
      const t = this.peek()

      if (t.type === 'dot' || t.type === 'question_dot') {
        const optional = t.type === 'question_dot'
        this.advance()
        const prop = this.advance()
        if (prop.type !== 'identifier') {
          throw new ExpressionEvaluationError(
            `期望属性名 (pos ${prop.pos})`,
          )
        }
        node = {
          type: 'MemberExpression',
          object: node,
          property: { type: 'Identifier', name: prop.value },
          computed: false,
          optional,
        }
      } else if (t.type === 'lbracket') {
        this.advance()
        const prop = this.parseExpression()
        this.expect('rbracket')
        node = {
          type: 'MemberExpression',
          object: node,
          property: prop,
          computed: true,
          optional: false,
        }
      } else if (t.type === 'lparen') {
        this.advance()
        const args: ASTNode[] = []
        if (this.peek().type !== 'rparen') {
          args.push(this.parseExpression())
          while (this.peek().type === 'comma') {
            this.advance()
            args.push(this.parseExpression())
          }
        }
        this.expect('rparen')
        node = { type: 'CallExpression', callee: node, args, optional: false }
      } else if (t.type === 'question') {
        // ternary: check if this is `?.` already handled, or `?` for ternary
        // Lookahead: if next after ? is `:` or a valid expression start, it's ternary
        // But we need to distinguish ?. (already handled above) from ternary
        // If we got here, it's ternary
        this.advance()
        const consequent = this.parseExpression()
        this.expect('colon')
        const alternate = this.parseExpression()
        node = { type: 'ConditionalExpression', test: node, consequent, alternate }
        break // ternary is lowest precedence, no more postfix
      } else {
        break
      }
    }

    return node
  }

  // primary: literals, identifiers, grouped expressions, arrays, objects
  private parsePrimary(): ASTNode {
    const t = this.peek()

    switch (t.type) {
      case 'number': {
        this.advance()
        const val = Number(t.value)
        if (Number.isNaN(val)) {
          throw new ExpressionEvaluationError(`无效的数字: ${t.value} (pos ${t.pos})`)
        }
        return { type: 'Literal', value: val }
      }
      case 'string': {
        this.advance()
        return { type: 'Literal', value: t.value }
      }
      case 'boolean': {
        this.advance()
        return { type: 'Literal', value: t.value === 'true' }
      }
      case 'null': {
        this.advance()
        return { type: 'Literal', value: null }
      }
      case 'undefined': {
        this.advance()
        return { type: 'Literal', value: undefined }
      }
      case 'identifier': {
        this.advance()
        return { type: 'Identifier', name: t.value }
      }
      case 'lparen': {
        this.advance()
        const expr = this.parseExpression()
        this.expect('rparen')
        return expr
      }
      case 'lbracket': {
        this.advance()
        const elements: ASTNode[] = []
        if (this.peek().type !== 'rbracket') {
          elements.push(this.parseExpression())
          while (this.peek().type === 'comma') {
            this.advance()
            if (this.peek().type === 'rbracket') break // trailing comma
            elements.push(this.parseExpression())
          }
        }
        this.expect('rbracket')
        return { type: 'ArrayExpression', elements }
      }
      case 'lbrace': {
        this.advance()
        const properties: Array<{ key: string; value: ASTNode }> = []
        if (this.peek().type !== 'rbrace') {
          // key can be identifier or string
          const keyToken = this.advance()
          let key: string
          if (keyToken.type === 'identifier') {
            key = keyToken.value
          } else if (keyToken.type === 'string') {
            key = keyToken.value
          } else {
            throw new ExpressionEvaluationError(`期望属性名 (pos ${keyToken.pos})`)
          }
          this.expect('colon')
          const value = this.parseExpression()
          properties.push({ key, value })
          while (this.peek().type === 'comma') {
            this.advance()
            if (this.peek().type === 'rbrace') break
            const kt = this.advance()
            let k: string
            if (kt.type === 'identifier') {
              k = kt.value
            } else if (kt.type === 'string') {
              k = kt.value
            } else {
              throw new ExpressionEvaluationError(`期望属性名 (pos ${kt.pos})`)
            }
            this.expect('colon')
            const v = this.parseExpression()
            properties.push({ key: k, value: v })
          }
        }
        this.expect('rbrace')
        return { type: 'ObjectExpression', properties }
      }
      default:
        throw new ExpressionEvaluationError(
          `意外的 token '${t.value}' (${t.type}) (pos ${t.pos})`,
        )
    }
  }
}

// ---- Safe Evaluator ----

/**
 * 安全的方法白名单 — 只允许调用这些基础类型的方法。
 * 每个方法名映射到一个验证函数，确保只在正确的类型上调用。
 */
const SAFE_METHODS: Record<string, (obj: unknown) => boolean> = {
  // String methods
  toString: () => true,
  valueOf: () => true,
  toLowerCase: (obj) => typeof obj === 'string',
  toUpperCase: (obj) => typeof obj === 'string',
  trim: (obj) => typeof obj === 'string',
  trimStart: (obj) => typeof obj === 'string',
  trimEnd: (obj) => typeof obj === 'string',
  startsWith: (obj) => typeof obj === 'string',
  endsWith: (obj) => typeof obj === 'string',
  includes: (obj) => typeof obj === 'string' || Array.isArray(obj),
  indexOf: (obj) => typeof obj === 'string' || Array.isArray(obj),
  lastIndexOf: (obj) => typeof obj === 'string' || Array.isArray(obj),
  slice: (obj) => typeof obj === 'string' || Array.isArray(obj),
  split: (obj) => typeof obj === 'string',
  replace: (obj) => typeof obj === 'string',
  charAt: (obj) => typeof obj === 'string',
  charCodeAt: (obj) => typeof obj === 'string',
  padStart: (obj) => typeof obj === 'string',
  padEnd: (obj) => typeof obj === 'string',
  repeat: (obj) => typeof obj === 'string',
  match: (obj) => typeof obj === 'string',
  search: (obj) => typeof obj === 'string',
  substring: (obj) => typeof obj === 'string',
  // Array methods
  push: (obj) => Array.isArray(obj),
  pop: (obj) => Array.isArray(obj),
  shift: (obj) => Array.isArray(obj),
  unshift: (obj) => Array.isArray(obj),
  map: (obj) => Array.isArray(obj),
  filter: (obj) => Array.isArray(obj),
  find: (obj) => Array.isArray(obj),
  findIndex: (obj) => Array.isArray(obj),
  every: (obj) => Array.isArray(obj),
  some: (obj) => Array.isArray(obj),
  forEach: (obj) => Array.isArray(obj),
  join: (obj) => Array.isArray(obj),
  flat: (obj) => Array.isArray(obj),
  flatMap: (obj) => Array.isArray(obj),
  concat: (obj) => Array.isArray(obj) || typeof obj === 'string',
  sort: (obj) => Array.isArray(obj),
  reverse: (obj) => Array.isArray(obj),
  reduce: (obj) => Array.isArray(obj),
  // Number methods
  toFixed: (obj) => typeof obj === 'number',
  toPrecision: (obj) => typeof obj === 'number',
  toExponential: (obj) => typeof obj === 'number',
  // Object methods
  hasOwnProperty: () => true,
  // Date methods (readonly)
  getTime: (obj) => obj instanceof Date,
  getFullYear: (obj) => obj instanceof Date,
  getMonth: (obj) => obj instanceof Date,
  getDate: (obj) => obj instanceof Date,
  getHours: (obj) => obj instanceof Date,
  getMinutes: (obj) => obj instanceof Date,
  getSeconds: (obj) => obj instanceof Date,
  toISOString: (obj) => obj instanceof Date,
  // JSON (as static)
}

/**
 * 验证标识符名是否安全（只允许字母、数字、下划线、$，且不是危险名称）
 */
const UNSAFE_IDENTIFIERS = new Set([
  'constructor', 'prototype', '__proto__', '__defineGetter__',
  '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
  'eval', 'Function', 'arguments', 'caller',
])

function isSafeIdentifier(name: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name) && !UNSAFE_IDENTIFIERS.has(name)
}

/**
 * 在变量上下文中查找值，支持点分路径。
 * 返回 [value, found] 以区分 "值为 undefined" 和 "未找到"。
 */
function resolveVariable(name: string, variables: Record<string, unknown>): [unknown, boolean] {
  if (name in variables) return [variables[name], true]
  return [undefined, false]
}

function resolvePath(obj: unknown, path: string[]): unknown {
  let current = obj
  for (const seg of path) {
    if (current == null) return undefined
    current = (current as Record<string, unknown>)[seg]
  }
  return current
}

/**
 * 安全地求值 AST 节点。
 * 所有变量引用都通过 variables 参数注入，不访问全局作用域。
 */
function evaluateNode(node: ASTNode, variables: Record<string, unknown>): unknown {
  switch (node.type) {
    case 'Literal':
      return node.value

    case 'Identifier': {
      if (!isSafeIdentifier(node.name)) {
        throw new ExpressionEvaluationError(`不允许的标识符: ${node.name}`)
      }
      const [val] = resolveVariable(node.name, variables)
      return val
    }

    case 'UnaryExpression': {
      const operand = evaluateNode(node.operand, variables)
      switch (node.operator) {
        case '!': return !operand
        case '-': return -(operand as number)
        case '+': return +(operand as number)
        case 'typeof': return typeof operand
        case 'void': return undefined
        default:
          throw new ExpressionEvaluationError(`不支持的一元运算符: ${node.operator}`)
      }
    }

    case 'BinaryExpression': {
      const left = evaluateNode(node.left, variables)
      const right = evaluateNode(node.right, variables)
      switch (node.operator) {
        case '+': return (left as number) + (right as number)
        case '-': return (left as number) - (right as number)
        case '*': return (left as number) * (right as number)
        case '/': return (left as number) / (right as number)
        case '%': return (left as number) % (right as number)
        case '**': return (left as number) ** (right as number)
        case '===': return left === right
        case '!==': return left !== right
        case '==': return left == right
        case '!=': return left != right
        case '>': return (left as number) > (right as number)
        case '>=': return (left as number) >= (right as number)
        case '<': return (left as number) < (right as number)
        case '<=': return (left as number) <= (right as number)
        case 'instanceof': return left instanceof (right as () => void)
        case 'in': return (left as string) in (right as Record<string, unknown>)
        default:
          throw new ExpressionEvaluationError(`不支持的二元运算符: ${node.operator}`)
      }
    }

    case 'LogicalExpression': {
      switch (node.operator) {
        case '&&': {
          const left = evaluateNode(node.left, variables)
          return left ? evaluateNode(node.right, variables) : left
        }
        case '||': {
          const left = evaluateNode(node.left, variables)
          return left ? left : evaluateNode(node.right, variables)
        }
        case '??': {
          const left = evaluateNode(node.left, variables)
          return left != null ? left : evaluateNode(node.right, variables)
        }
        default:
          throw new ExpressionEvaluationError('不支持的逻辑运算符')
      }
    }

    case 'ConditionalExpression': {
      const test = evaluateNode(node.test, variables)
      return test
        ? evaluateNode(node.consequent, variables)
        : evaluateNode(node.alternate, variables)
    }

    case 'MemberExpression': {
      const obj = evaluateNode(node.object, variables)
      if (node.optional && (obj == null)) return undefined

      let propName: string
      if (node.computed) {
        const prop = evaluateNode(node.property, variables)
        propName = String(prop)
      } else {
        propName = (node.property as { type: 'Identifier'; name: string }).name
      }

      if (obj == null || obj == undefined) {
        // 非可选链访问 null/undefined 应当抛出 TypeError（与 JS 行为一致）
        throw new TypeError(`Cannot read properties of ${obj} (reading '${propName}')`)
      }

      // 安全检查：阻止访问 constructor/prototype/__proto__
      if (UNSAFE_IDENTIFIERS.has(propName)) {
        throw new ExpressionEvaluationError(`不允许访问属性: ${propName}`)
      }

      return (obj as Record<string, unknown>)[propName]
    }

    case 'CallExpression': {
      const callee = node.callee
      if (callee.type !== 'MemberExpression') {
        throw new ExpressionEvaluationError('只允许调用对象的方法')
      }

      const obj = evaluateNode(callee.object, variables)
      if (node.optional && (obj == null)) return undefined
      if (obj == null || obj == undefined) {
        throw new TypeError(`Cannot read properties of ${obj} (calling method)`)
      }

      let methodName: string
      if (callee.computed) {
        methodName = String(evaluateNode(callee.property, variables))
      } else {
        methodName = (callee.property as { type: 'Identifier'; name: string }).name
      }

      // 白名单检查
      const validator = SAFE_METHODS[methodName]
      if (!validator) {
        throw new ExpressionEvaluationError(`不允许调用方法: ${methodName}`)
      }
      if (!validator(obj)) {
        throw new ExpressionEvaluationError(
          `方法 ${methodName} 不适用于类型 ${typeof obj}`,
        )
      }

      const method = (obj as Record<string, unknown>)[methodName]
      if (typeof method !== 'function') {
        throw new ExpressionEvaluationError(`${methodName} 不是一个函数`)
      }

      const args = node.args.map((arg) => evaluateNode(arg, variables))
      return method.apply(obj, args)
    }

    case 'ArrayExpression': {
      return node.elements.map((el) => evaluateNode(el, variables))
    }

    case 'ObjectExpression': {
      const result: Record<string, unknown> = {}
      for (const prop of node.properties) {
        result[prop.key] = evaluateNode(prop.value, variables)
      }
      return result
    }

    default:
      throw new ExpressionEvaluationError('未知的 AST 节点类型')
  }
}

// ---- Public API ----

/**
 * 对条件表达式求值，返回布尔结果。
 *
 * @param expression - 条件表达式字符串
 * @param variables - 变量上下文（流程变量等）
 * @returns 表达式布尔结果
 */
export function evaluateExpression(
  expression: string,
  variables: Record<string, unknown>,
): boolean {
  if (!expression || expression.trim().length === 0) return true

  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new ExpressionEvaluationError(`条件表达式超过最大长度限制 (${MAX_EXPRESSION_LENGTH} 字符)`)
  }

  try {
    const tokens = tokenize(expression)
    const parser = new Parser(tokens)
    const ast = parser.parse()
    const result = evaluateNode(ast, variables)
    return Boolean(result)
  } catch (err) {
    if (err instanceof ExpressionEvaluationError) throw err
    throw new ExpressionEvaluationError(
      `条件表达式求值失败: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * 对脚本表达式求值，返回计算结果（不限于布尔）。
 *
 * @param script - 脚本表达式字符串
 * @param variables - 变量上下文
 * @returns 计算结果
 */
export function evaluateScript(
  script: string,
  variables: Record<string, unknown>,
): unknown {
  if (!script || script.trim().length === 0) return undefined

  if (script.length > MAX_SCRIPT_LENGTH) {
    throw new ExpressionEvaluationError(`脚本内容超过最大长度限制 (${MAX_SCRIPT_LENGTH} 字符)`)
  }

  try {
    const tokens = tokenize(script)
    const parser = new Parser(tokens)
    const ast = parser.parse()
    return evaluateNode(ast, variables)
  } catch (err) {
    if (err instanceof ExpressionEvaluationError) throw err
    throw new ExpressionEvaluationError(
      `脚本执行失败: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}
