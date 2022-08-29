export class Result {

  ok: boolean;
  value: unknown;
  reasons: string[] | null;

  constructor (ok: true, value: unknown)
  constructor (ok: false, reasons: string[])
  constructor (ok: boolean, value: unknown | string[]) {
    this.ok = ok;
    if (ok == true) this.value = value;
    else this.reasons = value as string[];
  }

  bimap (f: (value: unknown) => unknown, g: (reasons: string[]) => string[]): Result {
    return this.ok ? new Result(true, f(this.value)) : new Result(false, g(this.reasons));
  }

  map (f: (value: unknown) => unknown): Result {
    return this.ok ? new Result(true, f(this.value)) : this;
  }

  rmap (f: (reasons: string[]) => string[]): Result {
    return this.ok ? this : new Result(false, f(this.reasons));
  }

  static gather = (results: Result[]): Result => {
    const failures: Result[] = results.filter(r => !r.ok);
    return failures.length > 0 ? fail(failures.flatMap(f => f.reasons)) : ok(results.map(r => r.value));
  }
}

export const ok = (value: unknown): Result =>
  new Result(true, value);

export const fail = (reasons: string[] | string): Result =>
  new Result(false, Array.isArray(reasons) ? reasons : [reasons]);

// ------------------------------------------------------------------------------------------------

type FnV = (value: unknown) => Result

const underKey = (prop: string, v: FnV): FnV =>
  x => v((x as Record<string, unknown>)[prop]).bimap(v => [prop, v], rs => rs.map(r => printPath([prop]) + r));

const underIndex = (prop: number, v: FnV): FnV =>
  x => v((x as Array<unknown>)[prop]).rmap(rs => rs.map(r => printPath([prop]) + r));

const predicate = (f: (value: unknown) => boolean, err: string): FnV =>
  x => f(x) ? ok(x) : fail(err);

const sequence = (vs: FnV[]): FnV =>
  x => vs.reduce((result, v) => result.ok ? v(result.value) : result, ok(x));

// ------------------------------------------------------------------------------------------------

type Path = (string | number)[]

type CompileError = (string | CompileError)[]

const indent = (text: string): string =>
  text.replaceAll("\n", "\n  ");

const printError = (path: Path, err: CompileError): string =>
  printPath(path) + (Array.isArray(err) ? err.flat().join("\n  ") : err);

const printPath = (path: Path): string =>
  path.length > 0 ? `At ${printCode(path.join("."))}: ` : "";

const printCode = (name: string): string =>
  "`" + name + "`";

const getClassName =
  Function.prototype.call.bind(Object.prototype.toString);

const printValue = (v: unknown): string => {
  if (typeof v == "function") return v.toString();
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  const objName = `[object ${Object.getPrototypeOf(v).constructor.name}]`;
  const className = getClassName(v);
  if (objName == className && !(v instanceof Date)) return JSON.stringify(v);
  return `${objName} ${JSON.stringify(v)}`;
}

const ensure = (b: boolean, path: Path, fn: () => CompileError) => {
  if (!b) throw new Error(printError(path, fn()))
};

// ------------------------------------------------------------------------------------------------

type BasicValidator = keyof typeof basicValidators

export const basicValidators = {
  "array": predicate(Array.isArray, "Not an array"),
  "boolean": predicate(x => typeof x == "boolean", "Not a boolean"),
  "number": predicate(x => typeof x == "number" && !isNaN(x), "Not a number"),
  "string": predicate(x => typeof x == "string", "Not a string"),
  "non-empty": predicate(x => (x as string)?.length > 0, "Is empty"),
};

const compileBasic = (name: BasicValidator, path: Path): FnV => {
  const v = basicValidators[name];
  ensure(v != null, path, () => [`Unknown basic validator: ${printValue(name)}`]);
  return v;
};

// ------------------------------------------------------------------------------------------------

const functionType = "fn";
type FunctionValidator = { type: typeof functionType, fn: FnV }

export const from = (f: (value: unknown) => Result): FunctionValidator => {
  const fn = (value: unknown): Result => {
    try {
      const result = f(value);
      if (result instanceof Result) return result;
      return fail(`Function passed to \`V.from\` did not return a Result: ${printValue(result)}`);
    } catch (e) {
      return fail(`Function passed to \`V.from\` threw an error: ${e?.message || e}`);
    }
  }
  return { type: functionType, fn };
};

// ------------------------------------------------------------------------------------------------

const optionalType = "optional";
type OptionalValidator = { type: typeof optionalType, inner: Validator, fallback: unknown }

export const optional = (inner: Validator, fallback: unknown) => {
  return { type: optionalType, inner, fallback };
};

const compileOptional = (inner: Validator, fallback: unknown, path: Path): FnV => {
  const v = compile(inner, path);
  const validatedFallback = v(fallback);
  ensure(validatedFallback.ok, path, () => [
    "Fallback for optional value does not meet its own requirements:",
    validatedFallback.reasons.map(indent),
    `(Provided value: ${printValue(fallback)})`
  ]);
  return (x) => x == null ? ok(validatedFallback.value) : v(x);
};

const isOptional = (v: Validator): boolean => {
  const step = Array.isArray(v) ? v[0] : v;
  return stepType(step) == optionalType;
}

// ------------------------------------------------------------------------------------------------

const enumType = "enum";
type EnumValidator = { type: typeof enumType, options: unknown[] }

export const mkEnum = (options: unknown[]): EnumValidator => {
  return { type: enumType, options };
};

export { mkEnum as enum };

const compileEnum = (options: unknown[], path: Path): FnV => {
  ensure(Array.isArray(options), path, () => [`\`V.enum\` expects an array of options as an argument, received: ${printValue(options)}`]);
  const err = `Expected one of: ${options.map(opt => printValue(opt)).join(", ")}`;
  return predicate(x => options.includes(x), err);
};

// ------------------------------------------------------------------------------------------------

const objectType = "obj";
type ObjectValidator = { type: typeof objectType, fields: [string, Validator][] }

export const object = (struct: Record<string,Validator>): ObjectValidator => {
  return { type: objectType, fields: Object.entries(struct) };
};

const compileObject = (fields: [string, Validator][], path: Path): FnV => {
  const expectedKeys = fields.map(([k]) => k);
  const requiredKeys = fields.filter(([, v]) => !isOptional(v)).map(([k]) => k);
  const propValidators = fields.map(([k, v]) => underKey(k, compile(v, path.concat([k]))));
  return (x) => {
    const keys = Object.keys(x);
    const missingKeys = requiredKeys.filter(k => !keys.includes(k));
    if (missingKeys.length > 0) return fail(`Missing expected properties: ${missingKeys.map(printCode).join(", ")}`);
    const unexpectedKeys = keys.filter(k => !expectedKeys.includes(k));
    if (unexpectedKeys.length > 0) return fail(`Found unexpected properties: ${unexpectedKeys.map(printCode).join(", ")}`);
    return Result.gather(propValidators.map(v => v(x))).map(entries => Object.fromEntries(entries as [string, unknown][]));
  };
};

// ------------------------------------------------------------------------------------------------

const indexedType = "indexed";
type IndexedValidator = { type: typeof indexedType, entries: Validator[] }

export const array = (entries: Validator[]): IndexedValidator => {
  return { type: indexedType, entries };
};

const compileIndexed = (entries: Validator[], path: Path): FnV => {
  const expectedLength = entries.length;
  const indexedValidators = entries.map((v, ix) => underIndex(ix, compile(v, path.concat([ix]))));
  const err = expectedLength == 1 ? "Expected array with one entry" : `Expected array with ${expectedLength} entries`;
  return (x: unknown[]) =>
    x.length !== expectedLength ? fail(err) : Result.gather(indexedValidators.map(v => v(x)));
};

// ------------------------------------------------------------------------------------------------

const oneOfType = "oneOf";
type OneOfValidator = { type: typeof oneOfType, branches: Validator[] }

export const oneOf = (branches: Validator[]): OneOfValidator => {
  return { type: oneOfType, branches };
};

const compileOneOf = (branches: Validator[], path: Path): FnV => {
  const vs = branches.map(v => compile(v, path));
  return (x) => {
    const failures = [];
    for (const v of vs) {
      const result = v(x);
      if (result.ok) return result;
      failures.push(result.reasons);
    }
    return fail(failures.flatMap((rs, ix) => rs.map(r => `At branch ${ix}: ${r}`)));
  };
};

// ------------------------------------------------------------------------------------------------

type ValidatorType
  = BasicValidator
  | typeof optionalType
  | typeof enumType
  | typeof functionType
  | typeof objectType
  | typeof indexedType
  | typeof oneOfType

const stepType = (v: ValidatorStep): ValidatorType =>
  typeof v == "string" ? v : v?.type;

const isCompatible = (x: ValidatorType, y: ValidatorType): boolean => {
  if (x == functionType || y == functionType) return true;
  if (x == enumType) return y == enumType;
  if (x == objectType) return y == objectType;
  if (x == "array" && y == indexedType) return true;
  if ((x == "string" || x == "array") && y == "non-empty") return true;
  return false;
}

type ValidatorStep
  = BasicValidator
  | OptionalValidator
  | EnumValidator
  | FunctionValidator
  | ObjectValidator
  | IndexedValidator
  | OneOfValidator

const compileStep = (v: ValidatorStep, path: Path): FnV => {
  if (typeof v == "string") return compileBasic(v, path);
  const type = v?.type;
  if (type == functionType) return v.fn;
  if (type == optionalType) return compileOptional(v.inner, v.fallback, path);
  if (type == enumType) return compileEnum(v.options, path);
  if (type == objectType) return compileObject(v.fields, path);
  if (type == indexedType) return compileIndexed(v.entries, path);
  if (type == oneOfType) return compileOneOf(v.branches, path);
  throw new Error(printError(path, [`Could not compile unrecognised validator definition: ${printValue(v)}`]));
};

type Validator = ValidatorStep | ValidatorStep[]

export const compile = (input: Validator, path: Path = []): FnV => {
  if (Array.isArray(input)) {
    const [start, ...rest] = input;
    const type = stepType(start);
    rest.reduce((prevType, curr) => {
      const currType = stepType(curr);
      if (isCompatible(prevType, currType)) return currType;
      throw new Error(printError(path, [`Validator type ${printCode(currType)} cannot follow ${printCode(prevType)}`]));
    }, type);
    if (type == objectType) return mergeValidators(input, objectType, (v => (v as ObjectValidator).fields), compileObject, path);
    if (type == enumType) return mergeValidators(input, enumType, (v => (v as EnumValidator).options), compileEnum, path);
    return sequence(input.map(v => compileStep(v, path)));
  }
  return compileStep(input, path);
};

const mergeValidators = <A>(
  steps: ValidatorStep[],
  mergeType: ValidatorType,
  extract: (validator: ValidatorStep) => A[],
  compile: (extracted: A[], path: Path) => FnV,
  path: Path) => {
    const objs = steps.filter(v => stepType(v) == mergeType);
    const extracted = objs.flatMap(extract);
    const v = compile(extracted, path);
    const rest = steps.slice(objs.length).map(v => compileStep(v, path));
    return sequence([v].concat(rest));
};
