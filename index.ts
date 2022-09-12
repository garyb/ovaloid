const group = <A>(items: A[], f: (x: A, y: A) => boolean): A[][] => {
  const result: A[][] = [];
  const n = items.length;
  let next = 0;
  for (let i = 0; i < n; i = next) {
    next = i + 1;
    while (next < n && f(items[next - 1], items[next])) next++;
    result.push(items.slice(i, next));
  }
  return result;
};

// ------------------------------------------------------------------------------------------------

type ErrorDetails
  = { found: unknown }
  | { expected: unknown[] }
  | { unexpected: unknown[] }
  | { caught: Error };

export class VError {

  constructor (public path: Path, public message: string, public details?: ErrorDetails) {}

  under (path: Path): VError {
    return new VError(path.concat(this.path), this.message, this.details);
  }

  toString (): string {
    return printError(this.path, this.message, this.details);
  }
}

// ------------------------------------------------------------------------------------------------

export class Result {

  ok: boolean;
  value: unknown;
  errors: VError[];

  constructor (ok: true, value: unknown);
  constructor (ok: false, errors: VError[]);
  constructor (ok: boolean, value: unknown | VError[]) {
    this.ok = ok;
    if (ok == true) this.value = value;
    else this.errors = value as VError[];
  }

  map (f: (value: unknown) => unknown): Result {
    return this.ok ? new Result(true, f(this.value)) : this;
  }

  at (path: Path | string | number): Result {
    const p = parsePath(path);
    if (p.length == 0) return this;
    return this.ok ? this : new Result(false, this.errors.map(e => e.under(p)));
  }
}

export const ok = (value: unknown): Result =>
  new Result(true, value);

export const fail = (error: string | string[], path: Path | string | number, details?: ErrorDetails): Result => {
  const p = parsePath(path);
  const errors = Array.isArray(error)
    ? error.map(e => new VError(p, e, details))
    : [new VError(p, error, details)];
  return new Result(false, errors);
};

export const gather = (results: Result[]): Result => {
  const errors: Result[] = results.filter(r => !r.ok);
  return errors.length > 0
    ? new Result(false, errors.flatMap(f => f.errors))
    : new Result(true, results.map(r => r.value));
};

// ------------------------------------------------------------------------------------------------

type FnV = (value: unknown) => Result;

// ------------------------------------------------------------------------------------------------

type Path = (string | number)[];

const parsePath = (input: Path | string | number): Path => {
  if (Array.isArray(input)) return input;
  if (typeof input == "string") return input.split(".");
  if (typeof input == "number") return [input];
  return [];
};

const extendPath = (path: Path, prop: string | number): Path =>
  path.concat([prop]) as Path;

const printError = (path: Path, err: string, details?: ErrorDetails | VError[]): string => {
  const msg = printPath(path as unknown as Path) + err;
  if (Array.isArray(details)) {
    if (details.length > 0) return msg + ":\n  " + details.join("\n  ");
  } else if (details != null) {
    if ("found" in details) return msg + ", found: " + printValue(details.found);
    if ("expected" in details) return msg + ", expected: " + printMultipleValues(details.expected);
    if ("unexpected" in details) return msg + ", unexpected: " + printMultipleValues(details.unexpected);
    if ("caught" in details) return msg + ", inner error: " + details.caught;
  }
  return msg;
};

const printPath = (path: Path): string =>
  path.length > 0 ? path.map(step => `At ${printCode(step)}: `).join("") : "";

const printCode = (name: string | number): string =>
  "`" + name + "`";

const printMultipleValues = (vs: unknown[] | unknown): string =>
  Array.isArray(vs) ? vs.map(printValue).join(", ") : printValue(vs);

const printValue = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(printValue).join(", ")}]`;
  if (typeof v == "function") return v.toString();
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  const objName = Object.prototype.toString.call(v);
  const className = `[object ${Object.getPrototypeOf(v).constructor.name}]`;
  if (objName == className && !(v instanceof Date)) return JSON.stringify(v);
  return `${className} ${JSON.stringify(v)}`;
};

// ------------------------------------------------------------------------------------------------

type BasicValidator = "array" | "boolean" | "number" | "integer" | "string" | "non-empty";

const basic = (f: (value: unknown) => boolean, err: string, path: Path, details?: ErrorDetails): FnV =>
  x => f(x) ? ok(x) : fail(err, path, details);

const compileBasic = (name: BasicValidator, path: Path): FnV => {
  if (name == "array") return basic(Array.isArray, "Not an array", path);
  if (name == "boolean") return basic(x => typeof x == "boolean", "Not a boolean", path);
  if (name == "number") return basic(x => typeof x == "number" && !isNaN(x), "Not a number", path);
  if (name == "integer") return basic((x: number) => x >= Number.MIN_SAFE_INTEGER && x <= Number.MAX_SAFE_INTEGER && Number.isInteger(x), "Not an integer", path);
  if (name == "string") return basic(x => typeof x == "string", "Not a string", path);
  if (name == "non-empty") return basic((x: { length: number }) => x.length > 0, "Is empty", path);
  throw new Error(printError(path, "Unknown basic validator", { found: name }));
};

// ------------------------------------------------------------------------------------------------

const predType = "pred";
type PredicateValidator = { type: typeof predType, fn: (value: unknown) => boolean, err: string, details?: ErrorDetails };

export const predicate = (fn: (value: unknown) => boolean, err: string, details?: ErrorDetails): PredicateValidator => {
  return { type: predType, fn, err, details };
};

const compilePredicate = (fn: (value: unknown) => boolean, err: string, details: ErrorDetails | undefined, path: Path): FnV => {
  if (!err || err.length == 0) {
    throw new Error(printError(path, "Predicate validator requires an error message"));
  }
  return x => {
    try {
      return fn(x) === true ? ok(x) : fail(err, path, details);
    } catch (e) {
      return fail("Predicate function threw an error", path, { caught: e });
    }
  };
};

// ------------------------------------------------------------------------------------------------

const functionType = "fn";
type FunctionValidator = (value: unknown) => unknown;

const compileFunction = (fn: FunctionValidator, path: Path): FnV =>
  x => {
    try {
      const result = fn(x);
      if (result instanceof Result) return result.at(path);
      return fail("Validation function did not return a `Result`", path, { found: result });
    } catch (e) {
      return fail("Validation function threw an error", path, { caught: e });
    }
  };

// ------------------------------------------------------------------------------------------------

const optionalType = "optional";
type OptionalValidator = { type: typeof optionalType, inner: Validator, fallback: unknown };

export const optional = (inner: Validator, fallback: unknown) => {
  return { type: optionalType, inner, fallback };
};

const compileOptional = (inner: Validator, fallback: unknown, path: Path): FnV => {
  const v = compile(inner, path);
  const validatedFallback = v(fallback);
  if (!validatedFallback.ok) {
    const msg = "Fallback for optional value does not meet its own requirements";
    throw new Error(printError(path, msg, validatedFallback.errors));
  }
  return x => x == null ? ok(validatedFallback.value) : v(x);
};

const isOptional = (v: Validator, path: Path): boolean =>
  Array.isArray(v) ? isOptional(v[0], path): stepType(v, path) == optionalType;

// ------------------------------------------------------------------------------------------------

const enumType = "enum";
type EnumValidator = { type: typeof enumType, options: unknown[] };

export const mkEnum = (options: unknown[]): EnumValidator => {
  return { type: enumType, options };
};

export { mkEnum as enum };

const isLiteral = (v: unknown): boolean => {
  const ty = typeof v;
  return ty == "string" || ty == "number" || ty == "boolean";
};

const compileEnum = (options: unknown[], path: Path): FnV => {
  if (!Array.isArray(options)) {
    const msg = "`V.enum` expects an array of options as an argument";
    throw new Error(printError(path, msg, { unexpected: options }));
  }
  const badOptions = options.filter(v => !isLiteral(v));
  if (badOptions.length > 0) {
    const err = "`V.enum` can only accept literal values as options";
    throw new Error(printError(path, err, { unexpected: badOptions }));
  }
  return basic(x => options.includes(x), "Unexpected value", path, { expected: options });
};

// ------------------------------------------------------------------------------------------------

const objectType = "obj";
type ObjectValidator = { type: typeof objectType, fields: [string, Validator][] };

export const object = (struct: Record<string,Validator>): ObjectValidator => {
  return { type: objectType, fields: Object.entries(struct) };
};

const compileObject = (fields: [string, Validator][], path: Path): FnV => {
  const expectedKeys = fields.map(([k]) => k);
  const requiredKeys = fields.filter(([, v]) => !isOptional(v, path)).map(([k]) => k);
  const propValidators: [string, FnV][] = fields.map(([k, v]) => [k, compile(v, extendPath(path, k))]);
  return (x: Record<string, unknown>) => {
    const keys = Object.keys(x);
    const missingKeys = requiredKeys.filter(k => !keys.includes(k));
    if (missingKeys.length > 0) return fail("Missing expected properties", path, { expected: missingKeys });
    const unexpectedKeys = keys.filter(k => !expectedKeys.includes(k));
    if (unexpectedKeys.length > 0) return fail("Found unexpected properties", path, { unexpected: unexpectedKeys });
    return gather(propValidators.map(([k, v]) => v(x[k]).map(y => [k, y])))
      .map(entries => Object.fromEntries(entries as [string, unknown][]));
  };
};

// ------------------------------------------------------------------------------------------------

const indexedType = "indexed";
type IndexedValidator = { type: typeof indexedType, entries: Validator[] };

export const indexed = (entries: Validator[]): IndexedValidator => {
  return { type: indexedType, entries };
};

const compileIndexed = (entries: Validator[], path: Path): FnV => {
  const expectedLength = entries.length;
  const indexedValidators = entries.map((v, ix) => compile(v, extendPath(path, ix)));
  const err = expectedLength == 1
    ? "Expected array with one entry"
    : `Expected array with ${expectedLength} entries`;
  return (x: unknown[]) =>
    x.length !== expectedLength
      ? fail(err, path, { found: x.length })
      : gather(indexedValidators.map((v, ix) => v(x[ix])));
};

// ------------------------------------------------------------------------------------------------

const oneOfType = "oneOf";
type OneOfValidator = { type: typeof oneOfType, branches: Validator[] };

export const oneOf = (branches: Validator[]): OneOfValidator => {
  return { type: oneOfType, branches };
};

const compileOneOf = (branches: Validator[], path: Path): FnV => {
  const vs = branches.map((v, ix) => compile(v, extendPath(path, `Branch ${ix}`)));
  return (x) => {
    const errors = [];
    for (const v of vs) {
      const result = v(x);
      if (result.ok) return result;
      errors.push(...result.errors);
    }
    return new Result(false, errors);
  };
};

// ------------------------------------------------------------------------------------------------

type ValidatorType
  = BasicValidator
  | typeof optionalType
  | typeof enumType
  | typeof predType
  | typeof functionType
  | typeof objectType
  | typeof indexedType
  | typeof oneOfType;

const stepType = (v: ValidatorStep, path: Path): ValidatorType => {
  if (typeof v == "string") return v;
  if (typeof v == "function") return functionType;
  const vty = v?.type;
  if (!vty) throw new Error(printError(path, "Cannot determine type of validator step", { found: v }));
  return vty;
};

const isCompatible = (x: ValidatorType, y: ValidatorType): boolean => {
  if (x == predType || y == predType) return true;
  if (x == functionType || y == functionType) return true;
  if (x == enumType) return y == enumType;
  if (x == objectType) return y == objectType;
  if (x == "array" && y == indexedType) return true;
  if ((x == "string" || x == "array") && y == "non-empty") return true;
  if (x == "number" || y == "integer") return true;
  return false;
};

// ------------------------------------------------------------------------------------------------

type Validator = ValidatorStep | ValidatorStep[];

type ValidatorStep
  = BasicValidator
  | OptionalValidator
  | EnumValidator
  | PredicateValidator
  | FunctionValidator
  | ObjectValidator
  | IndexedValidator
  | OneOfValidator;

type Merger = (vs: ValidatorStep[]) => ValidatorStep;

const objectMerger = (vs: ObjectValidator[]): ObjectValidator => {
  // TODO: make property overwrites work
  return { type: objectType, fields: vs.flatMap(v => v.fields) };
};

const enumMerger = (vs: EnumValidator[]): EnumValidator => {
  // TODO: de-duplicate
  return { type: enumType, options: vs.flatMap(v => v.options) };
};

const mergers: Record<string, Merger> = {
  [objectType]: objectMerger,
  [enumType]: enumMerger,
};

const isRefinement = (v: ValidatorStep): boolean => {
  if (v == "non-empty") return true;
  if (v == "integer") return true;
  return false;
};

const checkStart = (v: ValidatorStep, path: Path): void => {
  if (!isRefinement(v)) return;
  const msg = `Validator type ${printCode(stepType(v, path))} cannot appear at the start of a chain`;
  throw new Error(printError(path, msg));
};

const compileStep = (v: ValidatorStep, path: Path): FnV => {
  if (typeof v == "string") return compileBasic(v, path);
  if (typeof v == "function") return compileFunction(v, path);
  const type = v?.type;
  if (type == predType) return compilePredicate(v.fn, v.err, v.details, path);
  if (type == optionalType) return compileOptional(v.inner, v.fallback, path);
  if (type == enumType) return compileEnum(v.options, path);
  if (type == objectType) return compileObject(v.fields, path);
  if (type == indexedType) return compileIndexed(v.entries, path);
  if (type == oneOfType) return compileOneOf(v.branches, path);
  throw new Error(printError(path, "Could not compile unrecognised validator step", { found: v }));
};

const compileChain = (vs: ValidatorStep[], path: Path): FnV => {

  if (vs.length == 0) throw new Error(printError(path, "Cannot compile an empty chain"));
  checkStart(vs[0], path);
  if (vs.length == 1) return compileStep(vs[0], path);

  const typed = vs.map(v => { return { type: stepType(v, path), step: v }; });

  const groups = group(typed, (x, y) => x.type == y.type).map(group => {
    return { type: group[0].type, steps: group.map(g => g.step) };
  });

  const mergedSteps = groups.flatMap(group =>
    group.type in mergers ? mergers[group.type](group.steps) : group.steps);

  mergedSteps.reduce((prev, curr) => {
    const prevType = stepType(prev, path);
    const currType = stepType(curr, path);
    if (isCompatible(prevType, currType)) return curr;
    const msg = `Validator type ${printCode(currType)} cannot follow ${printCode(prevType)}`;
    throw new Error(printError(path, msg));
  });

  const compiledSteps = mergedSteps.map(v => compileStep(v, path));
  return x => compiledSteps.reduce((result, v) => result.ok ? v(result.value) : result, ok(x));
};

const compile = (input: Validator, path: Path): FnV => {
  if (Array.isArray(input)) return compileChain(input.flat(), path);
  checkStart(input, path);
  return compileStep(input, path);
};

const publicCompile = (input: Validator): FnV =>
  compile(input, []);

export { publicCompile as compile };
