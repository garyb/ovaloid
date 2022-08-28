/* eslint-env jest */

import * as V from "./index.js";

// ------------------------------------------------------------------------------------------------

describe("compilation", () => {
  test("should succeed when given a basic validator name", () => {
    expect(() => V.compile("string")).toEqual(expect.any(Function));
    expect(() => V.compile("number")).toEqual(expect.any(Function));
    expect(() => V.compile("boolean")).toEqual(expect.any(Function));
  });
  test("should fail when given an unexpected string value", () => {
    expect(() => V.compile("strung")).toThrow();
    expect(() => V.compile("")).toThrow();
  });
  test("should fail when given an unexpected value", () => {
    expect(() => V.compile(V.ok("eh?"))).toThrow();
    expect(() => V.compile(7)).toThrow();
    expect(() => V.compile({})).toThrow();
    expect(() => V.compile(null)).toThrow();
    expect(() => V.compile()).toThrow();
    expect(() => V.compile(V)).toThrow();
    expect(() => V.compile(V.compile)).toThrow();
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
      const failure = "Not a boolean";
      expect(v(0)).toEqual(V.fail(failure));
      expect(v("hello")).toEqual(V.fail(failure));
      expect(v([])).toEqual(V.fail(failure));
      expect(v({})).toEqual(V.fail(failure));
      expect(v(null)).toEqual(V.fail(failure));
      expect(v(undefined)).toEqual(V.fail(failure));
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
      const failure = "Not a number";
      expect(v(NaN)).toEqual(V.fail(failure));
      expect(v(false)).toEqual(V.fail(failure));
      expect(v("hello")).toEqual(V.fail(failure));
      expect(v([])).toEqual(V.fail(failure));
      expect(v({})).toEqual(V.fail(failure));
      expect(v(null)).toEqual(V.fail(failure));
      expect(v(undefined)).toEqual(V.fail(failure));
    });
  });
  describe("string", () => {
    const v = V.compile("string");
    test("should accept a string", () => {
      expect(v("hello")).toEqual(V.ok("hello"));
    });
    test("should reject non-strings", () => {
      const failure = "Not a string";
      expect(v(0)).toEqual(V.fail(failure));
      expect(v(false)).toEqual(V.fail(failure));
      expect(v([])).toEqual(V.fail(failure));
      expect(v({})).toEqual(V.fail(failure));
      expect(v(null)).toEqual(V.fail(failure));
      expect(v(undefined)).toEqual(V.fail(failure));
    });
  });
});

// ------------------------------------------------------------------------------------------------

describe("function validator", () => {
  test("should succeed when the function succeeds", () => {
    const v = V.compile(V.from(V.ok));
    expect(v("a")).toEqual(V.ok("a"));
    expect(v(1)).toEqual(V.ok(1));
    expect(v(true)).toEqual(V.ok(true));
  });
  test("should be able to transform a value", () => {
    const v = V.compile(V.from(x => V.ok(x * 2)));
    expect(v(1)).toEqual(V.ok(2));
    expect(v(28)).toEqual(V.ok(56));
  });
  test("should fail when the function returns a non-Result", () => {
    const v = V.compile(V.from(() => true));
    const failure = "Function passed to `V.from` did not return a Result: true";
    expect(v("a")).toEqual(V.fail(failure));
    expect(v(1)).toEqual(V.fail(failure));
    expect(v(true)).toEqual(V.fail(failure));
  });
  test("should catch errors from the inner function", () => {
    const v = V.compile(V.from(() => { throw new Error("oops") }));
    const failure = "Function passed to `V.from` threw an error: oops";
    expect(v("a")).toEqual(V.fail(failure));
    expect(v(1)).toEqual(V.fail(failure));
    expect(v(true)).toEqual(V.fail(failure));
  });
});

// ------------------------------------------------------------------------------------------------

describe("optional validator", () => {
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
  const v = V.compile(V.enum([false, 1, "two"]));
  test("should accept expected values", () => {
    expect(v(false)).toEqual(V.ok(false));
    expect(v(1)).toEqual(V.ok(1));
    expect(v("two")).toEqual(V.ok("two"));
  });
  test("should reject unexpected values", () => {
    const failure = "Expected one of: false, 1, \"two\"";
    expect(v("false")).toEqual(V.fail(failure));
    expect(v("1")).toEqual(V.fail(failure));
    expect(v(0)).toEqual(V.fail(failure));
    expect(v("hello")).toEqual(V.fail(failure));
    expect(v([])).toEqual(V.fail(failure));
    expect(v({})).toEqual(V.fail(failure));
    expect(v(null)).toEqual(V.fail(failure));
    expect(v(undefined)).toEqual(V.fail(failure));
  });
});

// ------------------------------------------------------------------------------------------------

describe("object validator", () => {
  const v = V.compile(V.object({
    x: "number",
    y: "number",
    polar: V.optional("boolean", false)
  }));
  test("should accept valid objects", () => {
    expect(v({ x: 0, y: 0, polar: false })).toEqual(V.ok({ x: 0, y: 0, polar: false }));
    expect(v({ x: 6.6, y: 18, polar: true })).toEqual(V.ok({ x: 6.6, y: 18, polar: true }));
  });
  test("should reject objects with invalid fields", () => {
    expect(v({ x: 0, y: 0, polar: "maybe" })).toEqual(V.fail("At `polar`: Not a boolean"));
  });
  test("should reject objects with missing fields", () => {
    expect(v({ x: 0, polar: false })).toEqual(V.fail("Missing expected properties: `y`"));
  });
  test("should accept objects with missing fields that are optional", () => {
    expect(v({ x: 0 })).toEqual(V.fail("Missing expected properties: `y`"));
  });
  test("should reject objects with extra fields", () => {
    expect(v({ x: 0, y: 0, polar: false, extra: "extra" })).toEqual(V.fail("Found unexpected properties: `extra`"));
    expect(v({ x: 0, y: 0, polar: false, extra: "extra", evenMore: true })).toEqual(V.fail("Found unexpected properties: `extra`, `evenMore`"));
  });
});

// ------------------------------------------------------------------------------------------------

describe("indexed validator", () => {
  const v = V.compile(V.array(["number", "boolean"]));
  test("should accept valid arrays", () => {
    expect(v([1, true])).toEqual(V.ok([1, true]));
    expect(v([99, false])).toEqual(V.ok([99, false]));
  });
  test("should reject arrays with invalid values", () => {
    expect(v(["0", true])).toEqual(V.fail("At `0`: Not a number"));
    expect(v(["0", 5])).toEqual(V.fail(["At `0`: Not a number", "At `1`: Not a boolean"]));
  });
  test("should reject arrays with too few entries", () => {
    expect(v([0])).toEqual(V.fail("Expected array with 2 entries"));
  });
  test("should reject arrays with too many entries", () => {
    expect(v([0, true, "extra"])).toEqual(V.fail("Expected array with 2 entries"));
  });
});

// ------------------------------------------------------------------------------------------------

describe("chained rules", () => {
  describe("compilation", () => {
    test("should fail when incompatible validators are combined", () => {
      expect(() => V.compile(["array", "string"])).toThrow();
      expect(() => V.compile(["array", "array"])).toThrow();
    });
    test("should merge enums", () => {
      const e1 = V.enum(["a", "b"]);
      const e2 = V.enum([1, 2]);
      const v = V.compile([e1, e2]);
      expect(v("a")).toEqual(V.ok("a"));
      expect(v("b")).toEqual(V.ok("b"));
      expect(v(1)).toEqual(V.ok(1));
      expect(v(2)).toEqual(V.ok(2));
      expect(v(3)).toEqual(V.fail("Expected one of: \"a\", \"b\", 1, 2"));
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
    const v = V.compile(["string", "non-empty", V.from((s) => V.ok({ n: parseInt(s, 10) * 3 }))]);
    test("should stop on the first failure", () => {
      expect(v(2)).toEqual(V.fail(["Not a string"]));
      expect(v("")).toEqual(V.fail(["Is empty"]));
    });
    test("should run all steps in sequence on the passed value", () => {
      expect(v("14")).toEqual(V.ok({ n: 42 }));
    });
  });
})
