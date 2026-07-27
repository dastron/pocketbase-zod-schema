/**
 * Condition expressions — one evaluator for PocketBase filters and SQL WHERE
 *
 * Data migrations select records two ways: PocketBase's filter syntax
 * (`status = "draft" && views > 10`) and raw SQL through `$dbx`/`app.db()`
 * (`WHERE status = {:status}`). The two dialects overlap almost completely —
 * the same comparison operators over the same field/literal operands — so the
 * simulation parses both with one grammar and evaluates the result against a
 * record.
 *
 * Deliberately small: comparisons, `LIKE`/`~`, `IN`, `IS NULL`, `AND`/`OR`/
 * `NOT`, parentheses, and `{:name}` bindings. Anything outside that raises
 * `ExpressionError`, which the caller reports as an unsupported query rather
 * than silently matching the wrong rows.
 */

export class ExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExpressionError";
    Object.setPrototypeOf(this, ExpressionError.prototype);
  }
}

/** Resolves a field reference to the value stored on the row being tested */
export interface EvaluationContext {
  field: (name: string) => unknown;
  params?: Record<string, unknown>;
}

export type Condition =
  | { kind: "and"; operands: Condition[] }
  | { kind: "or"; operands: Condition[] }
  | { kind: "not"; operand: Condition }
  | { kind: "compare"; operator: CompareOperator; left: Operand; right: Operand }
  | { kind: "in"; negated: boolean; left: Operand; values: Operand[] }
  | { kind: "like"; negated: boolean; left: Operand; pattern: Operand; implicitWildcards: boolean }
  | { kind: "null"; negated: boolean; operand: Operand }
  | { kind: "between"; negated: boolean; operand: Operand; from: Operand; to: Operand }
  | { kind: "literal"; value: boolean };

export type CompareOperator = "=" | "!=" | ">" | ">=" | "<" | "<=";

export type Operand =
  | { kind: "field"; name: string }
  | { kind: "value"; value: unknown }
  | { kind: "param"; name: string };

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type TokenType = "identifier" | "number" | "string" | "param" | "operator" | "punct";

interface Token {
  type: TokenType;
  value: string;
  position: number;
}

const OPERATORS = ["?!=", "!~", "?=", "?~", "!=", "<>", ">=", "<=", "==", "&&", "||", "=", ">", "<", "~"];

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];

    if (/\s/.test(char)) {
      index++;
      continue;
    }

    // {:name} — dbx/PocketBase parameter binding
    if (char === "{" && input[index + 1] === ":") {
      const end = input.indexOf("}", index);
      if (end === -1) {
        throw new ExpressionError(`Unterminated parameter placeholder at position ${index}`);
      }
      tokens.push({ type: "param", value: input.slice(index + 2, end).trim(), position: index });
      index = end + 1;
      continue;
    }

    if (char === "'" || char === '"') {
      const { value, next } = readString(input, index);
      tokens.push({ type: "string", value, position: index });
      index = next;
      continue;
    }

    if (/[0-9]/.test(char) || (char === "." && /[0-9]/.test(input[index + 1] ?? ""))) {
      const match = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(input.slice(index));
      if (!match) {
        throw new ExpressionError(`Invalid number at position ${index}`);
      }
      tokens.push({ type: "number", value: match[0], position: index });
      index += match[0].length;
      continue;
    }

    // Identifiers may be qualified (table.column) or backtick/bracket quoted
    if (/[A-Za-z_`[]/.test(char)) {
      const { value, next } = readIdentifier(input, index);
      tokens.push({ type: "identifier", value, position: index });
      index = next;
      continue;
    }

    const operator = OPERATORS.find((candidate) => input.startsWith(candidate, index));
    if (operator) {
      tokens.push({ type: "operator", value: operator, position: index });
      index += operator.length;
      continue;
    }

    if (char === "(" || char === ")" || char === ",") {
      tokens.push({ type: "punct", value: char, position: index });
      index++;
      continue;
    }

    throw new ExpressionError(`Unexpected character ${JSON.stringify(char)} at position ${index}`);
  }

  return tokens;
}

function readString(input: string, start: number): { value: string; next: number } {
  const quote = input[start];
  let index = start + 1;
  let value = "";

  while (index < input.length) {
    const char = input[index];
    if (char === "\\" && index + 1 < input.length) {
      value += unescapeChar(input[index + 1]);
      index += 2;
      continue;
    }
    // SQL doubles the quote to escape it: 'it''s'
    if (char === quote && input[index + 1] === quote) {
      value += quote;
      index += 2;
      continue;
    }
    if (char === quote) {
      return { value, next: index + 1 };
    }
    value += char;
    index++;
  }

  throw new ExpressionError(`Unterminated string starting at position ${start}`);
}

function unescapeChar(char: string): string {
  switch (char) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "r":
      return "\r";
    default:
      return char;
  }
}

function readIdentifier(input: string, start: number): { value: string; next: number } {
  let index = start;
  let value = "";

  while (index < input.length) {
    const char = input[index];
    if (char === "`" || char === "[" || char === "]" || char === '"') {
      // Quoted identifier segment: `my table`.`col`
      if (char === "`" || char === "[") {
        const closing = char === "`" ? "`" : "]";
        const end = input.indexOf(closing, index + 1);
        if (end === -1) {
          throw new ExpressionError(`Unterminated quoted identifier at position ${index}`);
        }
        value += input.slice(index + 1, end);
        index = end + 1;
        continue;
      }
      break;
    }
    if (/[A-Za-z0-9_.$]/.test(char)) {
      value += char;
      index++;
      continue;
    }
    break;
  }

  if (value === "") {
    throw new ExpressionError(`Invalid identifier at position ${start}`);
  }
  return { value, next: index };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const KEYWORDS = new Set(["and", "or", "not", "in", "is", "null", "like", "true", "false", "between"]);

class Parser {
  private index = 0;

  constructor(private tokens: Token[]) {}

  parse(): Condition {
    if (this.tokens.length === 0) {
      return { kind: "literal", value: true };
    }
    const condition = this.parseOr();
    if (this.index < this.tokens.length) {
      const token = this.tokens[this.index];
      throw new ExpressionError(`Unexpected ${JSON.stringify(token.value)} at position ${token.position}`);
    }
    return condition;
  }

  private parseOr(): Condition {
    const operands = [this.parseAnd()];
    while (this.matchOperator("||") || this.matchKeyword("or")) {
      operands.push(this.parseAnd());
    }
    return operands.length === 1 ? operands[0] : { kind: "or", operands };
  }

  private parseAnd(): Condition {
    const operands = [this.parseNot()];
    while (this.matchOperator("&&") || this.matchKeyword("and")) {
      operands.push(this.parseNot());
    }
    return operands.length === 1 ? operands[0] : { kind: "and", operands };
  }

  private parseNot(): Condition {
    if (this.matchKeyword("not")) {
      return { kind: "not", operand: this.parseNot() };
    }
    return this.parseComparison();
  }

  private parseComparison(): Condition {
    if (this.peekPunct("(")) {
      // Only a parenthesized condition can start here; a parenthesized value
      // list is consumed by IN below
      this.index++;
      const condition = this.parseOr();
      this.expectPunct(")");
      return condition;
    }

    const left = this.parseOperand();

    if (this.matchKeyword("is")) {
      const negated = this.matchKeyword("not");
      this.expectKeyword("null");
      return { kind: "null", negated, operand: left };
    }

    if (this.matchKeyword("in")) {
      return { kind: "in", negated: false, left, values: this.parseValueList() };
    }

    if (this.matchKeyword("like")) {
      return { kind: "like", negated: false, left, pattern: this.parseOperand(), implicitWildcards: false };
    }

    if (this.matchKeyword("between")) {
      const from = this.parseOperand();
      this.expectKeyword("and");
      return { kind: "between", negated: false, operand: left, from, to: this.parseOperand() };
    }

    const operator = this.peekOperator();
    if (!operator) {
      const token = this.tokens[this.index];
      throw new ExpressionError(
        token
          ? `Expected a comparison operator at position ${token.position}`
          : "Expected a comparison operator at end of expression"
      );
    }
    this.index++;

    switch (operator) {
      case "~":
      case "?~":
        return { kind: "like", negated: false, left, pattern: this.parseOperand(), implicitWildcards: true };
      case "!~":
        return { kind: "like", negated: true, left, pattern: this.parseOperand(), implicitWildcards: true };
      default:
        return { kind: "compare", operator: normalizeOperator(operator), left, right: this.parseOperand() };
    }
  }

  private parseValueList(): Operand[] {
    this.expectPunct("(");
    const values: Operand[] = [];
    if (this.peekPunct(")")) {
      this.index++;
      return values;
    }
    values.push(this.parseOperand());
    while (this.peekPunct(",")) {
      this.index++;
      values.push(this.parseOperand());
    }
    this.expectPunct(")");
    return values;
  }

  parseOperand(): Operand {
    const token = this.tokens[this.index];
    if (!token) {
      throw new ExpressionError("Unexpected end of expression");
    }
    this.index++;

    switch (token.type) {
      case "string":
        return { kind: "value", value: token.value };
      case "number":
        return { kind: "value", value: Number(token.value) };
      case "param":
        return { kind: "param", name: token.value };
      case "identifier": {
        const lowered = token.value.toLowerCase();
        if (lowered === "true" || lowered === "false") {
          return { kind: "value", value: lowered === "true" };
        }
        if (lowered === "null") {
          return { kind: "value", value: null };
        }
        return { kind: "field", name: token.value };
      }
      default:
        throw new ExpressionError(`Unexpected ${JSON.stringify(token.value)} at position ${token.position}`);
    }
  }

  private peekOperator(): string | null {
    const token = this.tokens[this.index];
    return token?.type === "operator" ? token.value : null;
  }

  private matchOperator(value: string): boolean {
    if (this.peekOperator() === value) {
      this.index++;
      return true;
    }
    return false;
  }

  private matchKeyword(keyword: string): boolean {
    const token = this.tokens[this.index];
    if (token?.type === "identifier" && token.value.toLowerCase() === keyword && KEYWORDS.has(keyword)) {
      this.index++;
      return true;
    }
    return false;
  }

  private expectKeyword(keyword: string): void {
    if (!this.matchKeyword(keyword)) {
      const token = this.tokens[this.index];
      throw new ExpressionError(
        `Expected ${keyword.toUpperCase()}${token ? ` at position ${token.position}` : " at end of expression"}`
      );
    }
  }

  private peekPunct(value: string): boolean {
    const token = this.tokens[this.index];
    return token?.type === "punct" && token.value === value;
  }

  private expectPunct(value: string): void {
    if (!this.peekPunct(value)) {
      const token = this.tokens[this.index];
      throw new ExpressionError(
        `Expected ${JSON.stringify(value)}${token ? ` at position ${token.position}` : " at end of expression"}`
      );
    }
    this.index++;
  }
}

function normalizeOperator(operator: string): CompareOperator {
  switch (operator) {
    case "==":
    case "=":
    case "?=":
      return "=";
    case "!=":
    case "<>":
    case "?!=":
      return "!=";
    default:
      return operator as CompareOperator;
  }
}

/** Parses a filter or SQL condition into an evaluable tree */
export function parseCondition(source: string): Condition {
  return new Parser(tokenize(source)).parse();
}

/** Parses a standalone value (a SET assignment or a VALUES entry) */
export function parseValueOperand(source: string): Operand {
  const tokens = tokenize(source);
  if (tokens.length === 0) {
    throw new ExpressionError("Expected a value");
  }
  return new Parser(tokens).parseOperand();
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export function evaluateCondition(condition: Condition, context: EvaluationContext): boolean {
  switch (condition.kind) {
    case "literal":
      return condition.value;
    case "and":
      return condition.operands.every((operand) => evaluateCondition(operand, context));
    case "or":
      return condition.operands.some((operand) => evaluateCondition(operand, context));
    case "not":
      return !evaluateCondition(condition.operand, context);
    case "null": {
      const value = resolveOperand(condition.operand, context);
      const isNull = value === null || value === undefined;
      return condition.negated ? !isNull : isNull;
    }
    case "in": {
      const value = resolveOperand(condition.left, context);
      const matches = condition.values.some((candidate) => looseEquals(value, resolveOperand(candidate, context)));
      return condition.negated ? !matches : matches;
    }
    case "like": {
      const value = resolveOperand(condition.left, context);
      const pattern = resolveOperand(condition.pattern, context);
      const matches = matchesLike(value, pattern, condition.implicitWildcards);
      return condition.negated ? !matches : matches;
    }
    case "between": {
      const value = resolveOperand(condition.operand, context);
      const from = resolveOperand(condition.from, context);
      const to = resolveOperand(condition.to, context);
      const inRange = compareValues(value, from) >= 0 && compareValues(value, to) <= 0;
      return condition.negated ? !inRange : inRange;
    }
    case "compare": {
      const left = resolveOperand(condition.left, context);
      const right = resolveOperand(condition.right, context);
      switch (condition.operator) {
        case "=":
          return looseEquals(left, right);
        case "!=":
          return !looseEquals(left, right);
        case ">":
          return compareValues(left, right) > 0;
        case ">=":
          return compareValues(left, right) >= 0;
        case "<":
          return compareValues(left, right) < 0;
        case "<=":
          return compareValues(left, right) <= 0;
      }
    }
  }
}

export function resolveOperand(operand: Operand, context: EvaluationContext): unknown {
  switch (operand.kind) {
    case "value":
      return operand.value;
    case "field":
      return context.field(operand.name);
    case "param": {
      const params = context.params ?? {};
      if (!(operand.name in params)) {
        throw new ExpressionError(`Missing bound parameter {:${operand.name}}`);
      }
      return params[operand.name];
    }
  }
}

/** Every field a condition reads, for callers that need to validate up front */
export function conditionFields(condition: Condition): string[] {
  const names = new Set<string>();
  const visitOperand = (operand: Operand) => {
    if (operand.kind === "field") {
      names.add(operand.name);
    }
  };

  const visit = (node: Condition) => {
    switch (node.kind) {
      case "and":
      case "or":
        node.operands.forEach(visit);
        break;
      case "not":
        visit(node.operand);
        break;
      case "compare":
        visitOperand(node.left);
        visitOperand(node.right);
        break;
      case "in":
        visitOperand(node.left);
        node.values.forEach(visitOperand);
        break;
      case "like":
        visitOperand(node.left);
        visitOperand(node.pattern);
        break;
      case "between":
        visitOperand(node.operand);
        visitOperand(node.from);
        visitOperand(node.to);
        break;
      case "null":
        visitOperand(node.operand);
        break;
      case "literal":
        break;
    }
  };

  visit(condition);
  return [...names];
}

/**
 * SQLite comparison semantics, narrowed to what migrations rely on: numbers
 * compare numerically even when one side arrived as a string, everything else
 * compares as text.
 */
export function looseEquals(left: unknown, right: unknown): boolean {
  if (left === null || left === undefined) {
    return right === null || right === undefined;
  }
  if (right === null || right === undefined) {
    return false;
  }
  if (typeof left === "boolean" || typeof right === "boolean") {
    return toBoolean(left) === toBoolean(right);
  }
  if (typeof left === "number" || typeof right === "number") {
    const leftNumber = Number(left);
    const rightNumber = Number(right);
    if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) {
      return leftNumber === rightNumber;
    }
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return String(left) === String(right);
}

export function compareValues(left: unknown, right: unknown): number {
  if (left === null || left === undefined) {
    return right === null || right === undefined ? 0 : -1;
  }
  if (right === null || right === undefined) {
    return 1;
  }
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && left !== "" && right !== "") {
    return leftNumber === rightNumber ? 0 : leftNumber < rightNumber ? -1 : 1;
  }
  const leftText = String(left);
  const rightText = String(right);
  return leftText === rightText ? 0 : leftText < rightText ? -1 : 1;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    return value !== "" && value !== "0" && value.toLowerCase() !== "false";
  }
  return Boolean(value);
}

/**
 * SQL LIKE. `implicitWildcards` is PocketBase's `~`, which wraps the term in
 * `%` unless the term already contains a wildcard.
 */
function matchesLike(value: unknown, pattern: unknown, implicitWildcards: boolean): boolean {
  if (value === null || value === undefined || pattern === null || pattern === undefined) {
    return false;
  }

  let text = String(pattern);
  if (implicitWildcards && !text.includes("%") && !text.includes("_")) {
    text = `%${text}%`;
  }

  const regex = new RegExp(`^${likeToRegexSource(text)}$`, "is");
  return regex.test(String(value));
}

function likeToRegexSource(pattern: string): string {
  let source = "";
  for (let index = 0; index < pattern.length; index++) {
    const char = pattern[index];
    if (char === "\\" && index + 1 < pattern.length) {
      source += escapeRegex(pattern[++index]);
      continue;
    }
    if (char === "%") {
      source += "[\\s\\S]*";
      continue;
    }
    if (char === "_") {
      source += "[\\s\\S]";
      continue;
    }
    source += escapeRegex(char);
  }
  return source;
}

function escapeRegex(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
