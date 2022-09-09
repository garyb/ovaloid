/* eslint-env jest */
/* eslint @typescript-eslint/no-var-requires: off */

const V = require("./index.js");

// ------------------------------------------------------------------------------------------------

describe("compilation", () => {
  test("should succeed when given a basic validator name", () => {
    expect(() => V.compile("string")).toEqual(expect.any(Function));
    expect(() => V.compile("number")).toEqual(expect.any(Function));
    expect(() => V.compile("boolean")).toEqual(expect.any(Function));
  });
  test("should fail when given an unexpected string value", () => {
    const err = "Unknown basic validator, found: ";
    expect(() => V.compile("strung")).toThrow(err + "\"strung\"");
    expect(() => V.compile("")).toThrow(err + "\"\"");
  });
  test("should fail when given an empty chain", () => {
    expect(() => V.compile([])).toThrow("Cannot compile an empty chain");
  });
  test("should fail when given an unexpected value", () => {
    const err = "Could not compile unrecognised validator step, found: ";
    expect(() => V.compile(V.ok("eh?"))).toThrow(err + "[object Result]");
    expect(() => V.compile(new Date())).toThrow(err + "[object Date]");
    expect(() => V.compile(7)).toThrow(err + "7");
    expect(() => V.compile({})).toThrow(err + "{}");
    expect(() => V.compile(null)).toThrow(err + "null");
    expect(() => V.compile()).toThrow(err + "undefined");
    expect(() => V.compile(V)).toThrow(err);
  });
  test("should include the path to the point that compilation failed", () => {
    expect(() => V.compile(V.object({ p: V.indexed(["string", V.ok("eh?")]) })))
      .toThrow("At `p`: At `1`: Could not compile unrecognised validator step");
  });

});

// ------------------------------------------------------------------------------------------------

describe("basic validators", () => {
  describe("boolean", () => {
    const v = V.compile("boolean");
    test("should accept a boolean", () => {
      expect(v(true)).toEqual(V.ok(true));
      expect(v(false)).toEqual(V.ok(false));
    });
    test("should reject non-booleans", () => {
      const err = "Not a boolean";
      expect(v(0)).toEqual(V.fail(err));
      expect(v("hello")).toEqual(V.fail(err));
      expect(v([])).toEqual(V.fail(err));
      expect(v({})).toEqual(V.fail(err));
      expect(v(null)).toEqual(V.fail(err));
      expect(v(undefined)).toEqual(V.fail(err));
    });
  });
  describe("number", () => {
    const v = V.compile("number");
    test("should accept a number", () => {
      expect(v(0)).toEqual(V.ok(0));
      expect(v(42)).toEqual(V.ok(42));
      expect(v(Infinity)).toEqual(V.ok(Infinity));
    });
    test("should reject non-numbers", () => {
      const err = "Not a number";
      expect(v(NaN)).toEqual(V.fail(err));
      expect(v(false)).toEqual(V.fail(err));
      expect(v("hello")).toEqual(V.fail(err));
      expect(v([])).toEqual(V.fail(err));
      expect(v({})).toEqual(V.fail(err));
      expect(v(null)).toEqual(V.fail(err));
      expect(v(undefined)).toEqual(V.fail(err));
    });
  });
  describe("string", () => {
    const v = V.compile("string");
    test("should accept a string", () => {
      expect(v("hello")).toEqual(V.ok("hello"));
    });
    test("should reject non-strings", () => {
      const err = "Not a string";
      expect(v(0)).toEqual(V.fail(err));
      expect(v(false)).toEqual(V.fail(err));
      expect(v([])).toEqual(V.fail(err));
      expect(v({})).toEqual(V.fail(err));
      expect(v(null)).toEqual(V.fail(err));
      expect(v(undefined)).toEqual(V.fail(err));
    });
  });
  describe("array", () => {
    const v = V.compile("array");
    test("should accept an array", () => {
      expect(v([])).toEqual(V.ok([]));
    });
    test("should reject non-arrays", () => {
      const err = "Not an array";
      expect(v("hello")).toEqual(V.fail(err));
      expect(v(0)).toEqual(V.fail(err));
      expect(v(false)).toEqual(V.fail(err));
      expect(v({})).toEqual(V.fail(err));
      expect(v(null)).toEqual(V.fail(err));
      expect(v(undefined)).toEqual(V.fail(err));
    });
  });
});

// ------------------------------------------------------------------------------------------------

describe("function validator", () => {
  test("should succeed when the function succeeds", () => {
    const v = V.compile(V.ok);
    expect(v("a")).toEqual(V.ok("a"));
    expect(v(1)).toEqual(V.ok(1));
    expect(v(true)).toEqual(V.ok(true));
  });
  test("should be able to transform a value", () => {
    const v = V.compile(x => V.ok(x * 2));
    expect(v(1)).toEqual(V.ok(2));
    expect(v(28)).toEqual(V.ok(56));
  });
  test("should fail when the function returns a non-Result", () => {
    const err = "Validation function did not return a `Result`";
    expect(V.compile(() => true)("a")).toEqual(V.fail(err, [], { found: true }));
    expect(V.compile(() => void 0)(1)).toEqual(V.fail(err, [], { found: undefined }));
    const fn = () => V.ok("effect");
    expect(V.compile(() => fn)(true)).toEqual(V.fail(err, [], { found: fn }));
  });
  test("should catch errors from the inner function", () => {
    const v = V.compile(() => { throw new Error("oops"); });
    const failure = V.fail("Validation function threw an error", [], { caught: new Error("oops") });
    expect(v("a")).toEqual(failure);
    expect(v(1)).toEqual(failure);
    expect(v(true)).toEqual(failure);
  });
  test("should report at the correct path errors from the inner function", () => {
    const v = V.compile(V.object({ a: () => V.fail("!", ["fakeprop"]) }));
    expect(v({ a: false })).toEqual(V.fail("!", ["a", "fakeprop"]));
  });
});

// ------------------------------------------------------------------------------------------------

describe("predicate validator", () => {
  test("should fail to compile if the error message is omitted", () => {
    expect(() => V.compile(V.predicate(x => x % 2 == 0)))
      .toThrow("Predicate validator requires an error message");
  });
  test("should fail or succeed based on the predicate result", () => {
    const v = V.compile(V.predicate(x => x % 2 == 0, "Is odd"));
    expect(v(0)).toEqual(V.ok(0));
    expect(v(1)).toEqual(V.fail("Is odd"));
    expect(v(2)).toEqual(V.ok(2));
    expect(v(3)).toEqual(V.fail("Is odd"));
  });
  test("should fail if the predicate throws an error", () => {
    const v = V.compile(V.predicate(() => { throw new Error("oops"); }, "Unreachable"));
    expect(v(2)).toEqual(V.fail("Predicate function threw an error", [], { caught: new Error("oops") }));
  });
});

// ------------------------------------------------------------------------------------------------

describe("optional validator", () => {
  test("should fail to compile if default value violates the rule", () => {
    expect(() => V.compile(V.optional("boolean", 0)))
      .toThrow("Fallback for optional value does not meet its own requirements:\n  Not a boolean");
    expect(() => V.compile(V.optional(V.enum([1, 2, 3]), 0)))
      .toThrow("Fallback for optional value does not meet its own requirements:\n  Unexpected value, expected: 1, 2, 3");
    expect(() => V.compile(V.optional(() => { throw new Error("oops"); }, 0)))
      .toThrow("Fallback for optional value does not meet its own requirements:\n  Validation function threw an error, inner error: Error: oops");
  });
  const v = V.compile(V.optional("boolean", false));
  test("should return the fallback value in the presence of null", () => {
    expect(v(null)).toEqual(V.ok(false));
  });
  test("should return the fallback value in the presence of undefined", () => {
    expect(v(undefined)).toEqual(V.ok(false));
  });
  test("should use the inner validator on all other values", () => {
    expect(v(true)).toEqual(V.ok(true));
    expect(v(7)).toEqual(V.fail("Not a boolean"));
    expect(v("test")).toEqual(V.fail("Not a boolean"));
    expect(v([])).toEqual(V.fail("Not a boolean"));
    expect(v({})).toEqual(V.fail("Not a boolean"));
  });
});

// ------------------------------------------------------------------------------------------------

describe("enum validator", () => {
  const goodValues = [false, 1, "two"];
  const v = V.compile(V.enum(goodValues));
  test("should fail to compile if given a bad argument", () => {
    const err = "`V.enum` expects an array of options as an argument, unexpected: ";
    expect(() => V.compile(V.enum(true))).toThrow(err + "true");
    expect(() => V.compile(V.enum({}))).toThrow(err + "{}");
  });
  test("should fail to compile if given non-literal options", () => {
    const err = "`V.enum` can only accept literal values as options, unexpected: ";
    expect(() => V.compile(V.enum([{}]))).toThrow(err + "{}");
    expect(() => V.compile(V.enum([[]]))).toThrow(err + "[]");
    expect(() => V.compile(V.enum([new Date()]))).toThrow(err + "[object Date]");
  });
  test("should accept expected values", () => {
    expect(v(false)).toEqual(V.ok(false));
    expect(v(1)).toEqual(V.ok(1));
    expect(v("two")).toEqual(V.ok("two"));
  });
  test("should reject unexpected values", () => {
    const failure = V.fail("Unexpected value", [], { expected: goodValues });
    expect(v("false")).toEqual(failure);
    expect(v("1")).toEqual(failure);
    expect(v(0)).toEqual(failure);
    expect(v("hello")).toEqual(failure);
    expect(v([])).toEqual(failure);
    expect(v({})).toEqual(failure);
    expect(v(null)).toEqual(failure);
    expect(v(undefined)).toEqual(failure);
  });
});

// ------------------------------------------------------------------------------------------------

describe("object validator", () => {
  const v = V.compile(V.object({
    x: "number",
    y: "number",
    polar: V.optional("boolean", false),
  }));
  test("should accept valid objects", () => {
    expect(v({ x: 0, y: 0, polar: false }))
      .toEqual(V.ok({ x: 0, y: 0, polar: false }));
    expect(v({ x: 6.6, y: 18, polar: true }))
      .toEqual(V.ok({ x: 6.6, y: 18, polar: true }));
  });
  test("should reject objects with invalid fields", () => {
    expect(v({ x: 0, y: 0, polar: "maybe" }))
      .toEqual(V.fail("Not a boolean", ["polar"]));
  });
  test("should reject objects with missing fields", () => {
    expect(v({ x: 0, polar: false }))
      .toEqual(V.fail("Missing expected properties", [], { expected: ["y"] }));
  });
  test("should accept objects with missing fields that are optional", () => {
    expect(v({ x: 0, y: 1 })).toEqual(V.ok({ x: 0, y: 1, polar: false }));
  });
  test("shouldn't complain about optional missing fields when listing required missing fields", () => {
    expect(v({ x: 0 })).toEqual(V.fail("Missing expected properties", [], { expected: ["y"] }));
  });
  test("should reject objects with extra fields", () => {
    expect(v({ x: 0, y: 0, polar: false, extra: "extra" }))
      .toEqual(V.fail("Found unexpected properties", [], { unexpected: ["extra"] }));
    expect(v({ x: 0, y: 0, polar: false, extra: "extra", evenMore: true }))
      .toEqual(V.fail("Found unexpected properties", [], { unexpected: ["extra", "evenMore"] }));
  });
});


// ------------------------------------------------------------------------------------------------

describe("indexed validator", () => {
  const v = V.compile(V.indexed(["number", "boolean"]));
  test("should accept valid arrays", () => {
    expect(v([1, true])).toEqual(V.ok([1, true]));
    expect(v([99, false])).toEqual(V.ok([99, false]));
  });
  test("should reject arrays with invalid values", () => {
    expect(v(["0", true])).toEqual(V.fail("Not a number", [0]));
    expect(v(["0", 5])).toEqual(V.gather([
      V.fail("Not a number", [0]),
      V.fail("Not a boolean", [1]),
    ]));
  });
  test("should reject arrays with too few entries", () => {
    expect(v([0])).toEqual(V.fail("Expected array with 2 entries", [], { found: 1 }));
  });
  test("should reject arrays with too many entries", () => {
    expect(v([0, true, "extra"])).toEqual(V.fail("Expected array with 2 entries", [], { found: 3 }));
  });
});

// ------------------------------------------------------------------------------------------------

describe("oneOf validator", () => {
  const v = V.compile(V.oneOf(["string", "number", V.indexed(["boolean", "boolean"])]));
  test("should accept the first valid branch", () => {
    expect(v("a")).toEqual(V.ok("a"));
    expect(v(3)).toEqual(V.ok(3));
  });
  test("should fail if no branch matches", () => {
    expect(v(["huh", true])).toEqual(V.gather([
      V.fail("Not a string", ["Branch 0"]),
      V.fail("Not a number", ["Branch 1"]),
      V.fail("Not a boolean", ["Branch 2", 0]),
    ]));
  });
});

// ------------------------------------------------------------------------------------------------

describe("chained rules", () => {
  describe("compilation", () => {
    test("should fail when incompatible validators are combined", () => {
      expect(() => V.compile(["array", "string"]))
        .toThrow("Validator type `string` cannot follow `array`");
      expect(() => V.compile(["array", "array"]))
        .toThrow("Validator type `array` cannot follow `array`");
    });
    test("should merge enums", () => {
      const e1 = V.enum(["a", "b"]);
      const e2 = V.enum([1, 2]);
      const v = V.compile([e1, e2]);
      expect(v("a")).toEqual(V.ok("a"));
      expect(v("b")).toEqual(V.ok("b"));
      expect(v(1)).toEqual(V.ok(1));
      expect(v(2)).toEqual(V.ok(2));
      expect(v(3)).toEqual(V.fail("Unexpected value", [], { expected: ["a", "b", 1, 2] }));
    });
    test("should merge objects", () => {
      const o1 = V.object({ a: "boolean" });
      const o2 = V.object({ b: "string" });
      const v = V.compile([o1, o2]);
      expect(v({ a: true, b: "test" })).toEqual(V.ok({ a: true, b: "test" }));
      expect(v({ a: false, b: "..." })).toEqual(V.ok({ a: false, b: "..." }));
    });
  });
  describe("validation", () => {
    const v = V.compile(["string", "non-empty", s => V.ok({ n: parseInt(s, 10) * 3 })]);
    test("should stop on the first failure", () => {
      expect(v(2)).toEqual(V.fail("Not a string"));
      expect(v("")).toEqual(V.fail("Is empty"));
    });
    test("should run all steps in sequence on the passed value", () => {
      expect(v("14")).toEqual(V.ok({ n: 42 }));
    });
    // TODO:
    // test("should accept objects with missing fields that are optional at the start of a chain", () => {
    //   const v = V.compile(V.object({
    //     a: "boolean",
    //     b: [V.optional("string", "test"), "non-empty"],
    //   }));
    //   expect(v({ a: true })).toEqual(V.ok({ a: true, b: "test" }));
    // });
  });
});

// ------------------------------------------------------------------------------------------------

describe("refinement validators", () => {
  describe("non-empty", () => {
    test("should fail to compile at the start of chain", () => {
      const err = "Validator type `non-empty` cannot appear at the start of a chain";
      expect(() => V.compile("non-empty")).toThrow(err);
      expect(() => V.compile(["non-empty"])).toThrow(err);
    });
    test("should reject an empty string", () => {
      const v = V.compile(["string", "non-empty"]);
      expect(v("")).toEqual(V.fail("Is empty"));
    });
    test("should accept a non-empty string", () => {
      const v = V.compile(["string", "non-empty"]);
      expect(v("test")).toEqual(V.ok("test"));
    });
    test("should reject an empty array", () => {
      const v = V.compile(["array", "non-empty"]);
      expect(v([])).toEqual(V.fail("Is empty"));
    });
    test("should accept a non-empty array", () => {
      const v = V.compile(["array", "non-empty"]);
      expect(v([1,2,3])).toEqual(V.ok([1,2,3]));
    });
  });
  describe("integer", () => {
    test("should fail to compile at the start of chain", () => {
      const err = "Validator type `integer` cannot appear at the start of a chain";
      expect(() => V.compile("integer")).toThrow(err);
      expect(() => V.compile(["integer"])).toThrow(err);
    });
    test("should reject a float", () => {
      const v = V.compile(["number", "integer"]);
      expect(v(5.6)).toEqual(V.fail("Not an integer"));
    });
    test("should reject infinities", () => {
      const v = V.compile(["number", "integer"]);
      expect(v(Infinity)).toEqual(V.fail("Not an integer"));
      expect(v(-Infinity)).toEqual(V.fail("Not an integer"));
    });
    test("should accept an integer", () => {
      const v = V.compile(["number", "integer"]);
      expect(v(3)).toEqual(V.ok(3));
    });
  });
});

// ------------------------------------------------------------------------------------------------

describe("error printing", () => {
  test("should prefix the error message with the relevant path", () => {
    const v = V.compile(V.object({ a: V.indexed(["string"]) }));
    const result = v({ a: [1] });
    expect(result.errors.map(e => e.toString())).toEqual(["At `a`: At `0`: Not a string"]);
  });
});
