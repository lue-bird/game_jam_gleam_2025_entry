// build/dev/javascript/prelude.mjs
class CustomType {
  withFields(fields) {
    let properties = Object.keys(this).map((label) => (label in fields) ? fields[label] : this[label]);
    return new this.constructor(...properties);
  }
}

class List {
  static fromArray(array, tail) {
    let t = tail || new Empty;
    for (let i = array.length - 1;i >= 0; --i) {
      t = new NonEmpty(array[i], t);
    }
    return t;
  }
  [Symbol.iterator]() {
    return new ListIterator(this);
  }
  toArray() {
    return [...this];
  }
  atLeastLength(desired) {
    let current = this;
    while (desired-- > 0 && current)
      current = current.tail;
    return current !== undefined;
  }
  hasLength(desired) {
    let current = this;
    while (desired-- > 0 && current)
      current = current.tail;
    return desired === -1 && current instanceof Empty;
  }
  countLength() {
    let current = this;
    let length = 0;
    while (current) {
      current = current.tail;
      length++;
    }
    return length - 1;
  }
}
function prepend(element, tail) {
  return new NonEmpty(element, tail);
}
function toList(elements, tail) {
  return List.fromArray(elements, tail);
}

class ListIterator {
  #current;
  constructor(current) {
    this.#current = current;
  }
  next() {
    if (this.#current instanceof Empty) {
      return { done: true };
    } else {
      let { head, tail } = this.#current;
      this.#current = tail;
      return { value: head, done: false };
    }
  }
}

class Empty extends List {
}
class NonEmpty extends List {
  constructor(head, tail) {
    super();
    this.head = head;
    this.tail = tail;
  }
}
class BitArray {
  bitSize;
  byteSize;
  bitOffset;
  rawBuffer;
  constructor(buffer, bitSize, bitOffset) {
    if (!(buffer instanceof Uint8Array)) {
      throw globalThis.Error("BitArray can only be constructed from a Uint8Array");
    }
    this.bitSize = bitSize ?? buffer.length * 8;
    this.byteSize = Math.trunc((this.bitSize + 7) / 8);
    this.bitOffset = bitOffset ?? 0;
    if (this.bitSize < 0) {
      throw globalThis.Error(`BitArray bit size is invalid: ${this.bitSize}`);
    }
    if (this.bitOffset < 0 || this.bitOffset > 7) {
      throw globalThis.Error(`BitArray bit offset is invalid: ${this.bitOffset}`);
    }
    if (buffer.length !== Math.trunc((this.bitOffset + this.bitSize + 7) / 8)) {
      throw globalThis.Error("BitArray buffer length is invalid");
    }
    this.rawBuffer = buffer;
  }
  byteAt(index) {
    if (index < 0 || index >= this.byteSize) {
      return;
    }
    return bitArrayByteAt(this.rawBuffer, this.bitOffset, index);
  }
  equals(other) {
    if (this.bitSize !== other.bitSize) {
      return false;
    }
    const wholeByteCount = Math.trunc(this.bitSize / 8);
    if (this.bitOffset === 0 && other.bitOffset === 0) {
      for (let i = 0;i < wholeByteCount; i++) {
        if (this.rawBuffer[i] !== other.rawBuffer[i]) {
          return false;
        }
      }
      const trailingBitsCount = this.bitSize % 8;
      if (trailingBitsCount) {
        const unusedLowBitCount = 8 - trailingBitsCount;
        if (this.rawBuffer[wholeByteCount] >> unusedLowBitCount !== other.rawBuffer[wholeByteCount] >> unusedLowBitCount) {
          return false;
        }
      }
    } else {
      for (let i = 0;i < wholeByteCount; i++) {
        const a = bitArrayByteAt(this.rawBuffer, this.bitOffset, i);
        const b = bitArrayByteAt(other.rawBuffer, other.bitOffset, i);
        if (a !== b) {
          return false;
        }
      }
      const trailingBitsCount = this.bitSize % 8;
      if (trailingBitsCount) {
        const a = bitArrayByteAt(this.rawBuffer, this.bitOffset, wholeByteCount);
        const b = bitArrayByteAt(other.rawBuffer, other.bitOffset, wholeByteCount);
        const unusedLowBitCount = 8 - trailingBitsCount;
        if (a >> unusedLowBitCount !== b >> unusedLowBitCount) {
          return false;
        }
      }
    }
    return true;
  }
  get buffer() {
    bitArrayPrintDeprecationWarning("buffer", "Use BitArray.byteAt() or BitArray.rawBuffer instead");
    if (this.bitOffset !== 0 || this.bitSize % 8 !== 0) {
      throw new globalThis.Error("BitArray.buffer does not support unaligned bit arrays");
    }
    return this.rawBuffer;
  }
  get length() {
    bitArrayPrintDeprecationWarning("length", "Use BitArray.bitSize or BitArray.byteSize instead");
    if (this.bitOffset !== 0 || this.bitSize % 8 !== 0) {
      throw new globalThis.Error("BitArray.length does not support unaligned bit arrays");
    }
    return this.rawBuffer.length;
  }
}
function bitArrayByteAt(buffer, bitOffset, index) {
  if (bitOffset === 0) {
    return buffer[index] ?? 0;
  } else {
    const a = buffer[index] << bitOffset & 255;
    const b = buffer[index + 1] >> 8 - bitOffset;
    return a | b;
  }
}

class UtfCodepoint {
  constructor(value) {
    this.value = value;
  }
}
var isBitArrayDeprecationMessagePrinted = {};
function bitArrayPrintDeprecationWarning(name, message) {
  if (isBitArrayDeprecationMessagePrinted[name]) {
    return;
  }
  console.warn(`Deprecated BitArray.${name} property used in JavaScript FFI code. ${message}.`);
  isBitArrayDeprecationMessagePrinted[name] = true;
}
class Result extends CustomType {
  static isResult(data) {
    return data instanceof Result;
  }
}

class Ok extends Result {
  constructor(value) {
    super();
    this[0] = value;
  }
  isOk() {
    return true;
  }
}
var Result$Ok = (value) => new Ok(value);
class Error extends Result {
  constructor(detail) {
    super();
    this[0] = detail;
  }
  isOk() {
    return false;
  }
}
var Result$Error = (detail) => new Error(detail);
function isEqual(x, y) {
  let values = [x, y];
  while (values.length) {
    let a = values.pop();
    let b = values.pop();
    if (a === b)
      continue;
    if (!isObject(a) || !isObject(b))
      return false;
    let unequal = !structurallyCompatibleObjects(a, b) || unequalDates(a, b) || unequalBuffers(a, b) || unequalArrays(a, b) || unequalMaps(a, b) || unequalSets(a, b) || unequalRegExps(a, b);
    if (unequal)
      return false;
    const proto = Object.getPrototypeOf(a);
    if (proto !== null && typeof proto.equals === "function") {
      try {
        if (a.equals(b))
          continue;
        else
          return false;
      } catch {}
    }
    let [keys, get] = getters(a);
    const ka = keys(a);
    const kb = keys(b);
    if (ka.length !== kb.length)
      return false;
    for (let k of ka) {
      values.push(get(a, k), get(b, k));
    }
  }
  return true;
}
function getters(object) {
  if (object instanceof Map) {
    return [(x) => x.keys(), (x, y) => x.get(y)];
  } else {
    let extra = object instanceof globalThis.Error ? ["message"] : [];
    return [(x) => [...extra, ...Object.keys(x)], (x, y) => x[y]];
  }
}
function unequalDates(a, b) {
  return a instanceof Date && (a > b || a < b);
}
function unequalBuffers(a, b) {
  return !(a instanceof BitArray) && a.buffer instanceof ArrayBuffer && a.BYTES_PER_ELEMENT && !(a.byteLength === b.byteLength && a.every((n, i) => n === b[i]));
}
function unequalArrays(a, b) {
  return Array.isArray(a) && a.length !== b.length;
}
function unequalMaps(a, b) {
  return a instanceof Map && a.size !== b.size;
}
function unequalSets(a, b) {
  return a instanceof Set && (a.size != b.size || [...a].some((e) => !b.has(e)));
}
function unequalRegExps(a, b) {
  return a instanceof RegExp && (a.source !== b.source || a.flags !== b.flags);
}
function isObject(a) {
  return typeof a === "object" && a !== null;
}
function structurallyCompatibleObjects(a, b) {
  if (typeof a !== "object" && typeof b !== "object" && (!a || !b))
    return false;
  let nonstructural = [Promise, WeakSet, WeakMap, Function];
  if (nonstructural.some((c) => a instanceof c))
    return false;
  return a.constructor === b.constructor;
}
function divideFloat(a, b) {
  if (b === 0) {
    return 0;
  } else {
    return a / b;
  }
}
function makeError(variant, file, module, line, fn, message, extra) {
  let error = new globalThis.Error(message);
  error.gleam_error = variant;
  error.file = file;
  error.module = module;
  error.line = line;
  error.function = fn;
  error.fn = fn;
  for (let k in extra)
    error[k] = extra[k];
  return error;
}
// build/dev/javascript/gleam_stdlib/gleam/order.mjs
class Lt extends CustomType {
}
class Eq extends CustomType {
}
class Gt extends CustomType {
}

// build/dev/javascript/gleam_stdlib/gleam/option.mjs
class Some extends CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}
class None extends CustomType {
}
function from_result(result) {
  if (result instanceof Ok) {
    let a = result[0];
    return new Some(a);
  } else {
    return new None;
  }
}
function unwrap(option, default$) {
  if (option instanceof Some) {
    let x = option[0];
    return x;
  } else {
    return default$;
  }
}

// build/dev/javascript/gleam_stdlib/dict.mjs
var referenceMap = /* @__PURE__ */ new WeakMap;
var tempDataView = /* @__PURE__ */ new DataView(/* @__PURE__ */ new ArrayBuffer(8));
var referenceUID = 0;
function hashByReference(o) {
  const known = referenceMap.get(o);
  if (known !== undefined) {
    return known;
  }
  const hash = referenceUID++;
  if (referenceUID === 2147483647) {
    referenceUID = 0;
  }
  referenceMap.set(o, hash);
  return hash;
}
function hashMerge(a, b) {
  return a ^ b + 2654435769 + (a << 6) + (a >> 2) | 0;
}
function hashString(s) {
  let hash = 0;
  const len = s.length;
  for (let i = 0;i < len; i++) {
    hash = Math.imul(31, hash) + s.charCodeAt(i) | 0;
  }
  return hash;
}
function hashNumber(n) {
  tempDataView.setFloat64(0, n);
  const i = tempDataView.getInt32(0);
  const j = tempDataView.getInt32(4);
  return Math.imul(73244475, i >> 16 ^ i) ^ j;
}
function hashBigInt(n) {
  return hashString(n.toString());
}
function hashObject(o) {
  const proto = Object.getPrototypeOf(o);
  if (proto !== null && typeof proto.hashCode === "function") {
    try {
      const code = o.hashCode(o);
      if (typeof code === "number") {
        return code;
      }
    } catch {}
  }
  if (o instanceof Promise || o instanceof WeakSet || o instanceof WeakMap) {
    return hashByReference(o);
  }
  if (o instanceof Date) {
    return hashNumber(o.getTime());
  }
  let h = 0;
  if (o instanceof ArrayBuffer) {
    o = new Uint8Array(o);
  }
  if (Array.isArray(o) || o instanceof Uint8Array) {
    for (let i = 0;i < o.length; i++) {
      h = Math.imul(31, h) + getHash(o[i]) | 0;
    }
  } else if (o instanceof Set) {
    o.forEach((v) => {
      h = h + getHash(v) | 0;
    });
  } else if (o instanceof Map) {
    o.forEach((v, k) => {
      h = h + hashMerge(getHash(v), getHash(k)) | 0;
    });
  } else {
    const keys = Object.keys(o);
    for (let i = 0;i < keys.length; i++) {
      const k = keys[i];
      const v = o[k];
      h = h + hashMerge(getHash(v), hashString(k)) | 0;
    }
  }
  return h;
}
function getHash(u) {
  if (u === null)
    return 1108378658;
  if (u === undefined)
    return 1108378659;
  if (u === true)
    return 1108378657;
  if (u === false)
    return 1108378656;
  switch (typeof u) {
    case "number":
      return hashNumber(u);
    case "string":
      return hashString(u);
    case "bigint":
      return hashBigInt(u);
    case "object":
      return hashObject(u);
    case "symbol":
      return hashByReference(u);
    case "function":
      return hashByReference(u);
    default:
      return 0;
  }
}
var SHIFT = 5;
var BUCKET_SIZE = Math.pow(2, SHIFT);
var MASK = BUCKET_SIZE - 1;
var MAX_INDEX_NODE = BUCKET_SIZE / 2;
var MIN_ARRAY_NODE = BUCKET_SIZE / 4;
var ENTRY = 0;
var ARRAY_NODE = 1;
var INDEX_NODE = 2;
var COLLISION_NODE = 3;
var EMPTY = {
  type: INDEX_NODE,
  bitmap: 0,
  array: []
};
function mask(hash, shift) {
  return hash >>> shift & MASK;
}
function bitpos(hash, shift) {
  return 1 << mask(hash, shift);
}
function bitcount(x) {
  x -= x >> 1 & 1431655765;
  x = (x & 858993459) + (x >> 2 & 858993459);
  x = x + (x >> 4) & 252645135;
  x += x >> 8;
  x += x >> 16;
  return x & 127;
}
function index(bitmap, bit) {
  return bitcount(bitmap & bit - 1);
}
function cloneAndSet(arr, at, val) {
  const len = arr.length;
  const out = new Array(len);
  for (let i = 0;i < len; ++i) {
    out[i] = arr[i];
  }
  out[at] = val;
  return out;
}
function spliceIn(arr, at, val) {
  const len = arr.length;
  const out = new Array(len + 1);
  let i = 0;
  let g = 0;
  while (i < at) {
    out[g++] = arr[i++];
  }
  out[g++] = val;
  while (i < len) {
    out[g++] = arr[i++];
  }
  return out;
}
function spliceOut(arr, at) {
  const len = arr.length;
  const out = new Array(len - 1);
  let i = 0;
  let g = 0;
  while (i < at) {
    out[g++] = arr[i++];
  }
  ++i;
  while (i < len) {
    out[g++] = arr[i++];
  }
  return out;
}
function createNode(shift, key1, val1, key2hash, key2, val2) {
  const key1hash = getHash(key1);
  if (key1hash === key2hash) {
    return {
      type: COLLISION_NODE,
      hash: key1hash,
      array: [
        { type: ENTRY, k: key1, v: val1 },
        { type: ENTRY, k: key2, v: val2 }
      ]
    };
  }
  const addedLeaf = { val: false };
  return assoc(assocIndex(EMPTY, shift, key1hash, key1, val1, addedLeaf), shift, key2hash, key2, val2, addedLeaf);
}
function assoc(root2, shift, hash, key, val, addedLeaf) {
  switch (root2.type) {
    case ARRAY_NODE:
      return assocArray(root2, shift, hash, key, val, addedLeaf);
    case INDEX_NODE:
      return assocIndex(root2, shift, hash, key, val, addedLeaf);
    case COLLISION_NODE:
      return assocCollision(root2, shift, hash, key, val, addedLeaf);
  }
}
function assocArray(root2, shift, hash, key, val, addedLeaf) {
  const idx = mask(hash, shift);
  const node = root2.array[idx];
  if (node === undefined) {
    addedLeaf.val = true;
    return {
      type: ARRAY_NODE,
      size: root2.size + 1,
      array: cloneAndSet(root2.array, idx, { type: ENTRY, k: key, v: val })
    };
  }
  if (node.type === ENTRY) {
    if (isEqual(key, node.k)) {
      if (val === node.v) {
        return root2;
      }
      return {
        type: ARRAY_NODE,
        size: root2.size,
        array: cloneAndSet(root2.array, idx, {
          type: ENTRY,
          k: key,
          v: val
        })
      };
    }
    addedLeaf.val = true;
    return {
      type: ARRAY_NODE,
      size: root2.size,
      array: cloneAndSet(root2.array, idx, createNode(shift + SHIFT, node.k, node.v, hash, key, val))
    };
  }
  const n = assoc(node, shift + SHIFT, hash, key, val, addedLeaf);
  if (n === node) {
    return root2;
  }
  return {
    type: ARRAY_NODE,
    size: root2.size,
    array: cloneAndSet(root2.array, idx, n)
  };
}
function assocIndex(root2, shift, hash, key, val, addedLeaf) {
  const bit = bitpos(hash, shift);
  const idx = index(root2.bitmap, bit);
  if ((root2.bitmap & bit) !== 0) {
    const node = root2.array[idx];
    if (node.type !== ENTRY) {
      const n = assoc(node, shift + SHIFT, hash, key, val, addedLeaf);
      if (n === node) {
        return root2;
      }
      return {
        type: INDEX_NODE,
        bitmap: root2.bitmap,
        array: cloneAndSet(root2.array, idx, n)
      };
    }
    const nodeKey = node.k;
    if (isEqual(key, nodeKey)) {
      if (val === node.v) {
        return root2;
      }
      return {
        type: INDEX_NODE,
        bitmap: root2.bitmap,
        array: cloneAndSet(root2.array, idx, {
          type: ENTRY,
          k: key,
          v: val
        })
      };
    }
    addedLeaf.val = true;
    return {
      type: INDEX_NODE,
      bitmap: root2.bitmap,
      array: cloneAndSet(root2.array, idx, createNode(shift + SHIFT, nodeKey, node.v, hash, key, val))
    };
  } else {
    const n = root2.array.length;
    if (n >= MAX_INDEX_NODE) {
      const nodes = new Array(32);
      const jdx = mask(hash, shift);
      nodes[jdx] = assocIndex(EMPTY, shift + SHIFT, hash, key, val, addedLeaf);
      let j = 0;
      let bitmap = root2.bitmap;
      for (let i = 0;i < 32; i++) {
        if ((bitmap & 1) !== 0) {
          const node = root2.array[j++];
          nodes[i] = node;
        }
        bitmap = bitmap >>> 1;
      }
      return {
        type: ARRAY_NODE,
        size: n + 1,
        array: nodes
      };
    } else {
      const newArray = spliceIn(root2.array, idx, {
        type: ENTRY,
        k: key,
        v: val
      });
      addedLeaf.val = true;
      return {
        type: INDEX_NODE,
        bitmap: root2.bitmap | bit,
        array: newArray
      };
    }
  }
}
function assocCollision(root2, shift, hash, key, val, addedLeaf) {
  if (hash === root2.hash) {
    const idx = collisionIndexOf(root2, key);
    if (idx !== -1) {
      const entry = root2.array[idx];
      if (entry.v === val) {
        return root2;
      }
      return {
        type: COLLISION_NODE,
        hash,
        array: cloneAndSet(root2.array, idx, { type: ENTRY, k: key, v: val })
      };
    }
    const size = root2.array.length;
    addedLeaf.val = true;
    return {
      type: COLLISION_NODE,
      hash,
      array: cloneAndSet(root2.array, size, { type: ENTRY, k: key, v: val })
    };
  }
  return assoc({
    type: INDEX_NODE,
    bitmap: bitpos(root2.hash, shift),
    array: [root2]
  }, shift, hash, key, val, addedLeaf);
}
function collisionIndexOf(root2, key) {
  const size = root2.array.length;
  for (let i = 0;i < size; i++) {
    if (isEqual(key, root2.array[i].k)) {
      return i;
    }
  }
  return -1;
}
function find(root2, shift, hash, key) {
  switch (root2.type) {
    case ARRAY_NODE:
      return findArray(root2, shift, hash, key);
    case INDEX_NODE:
      return findIndex(root2, shift, hash, key);
    case COLLISION_NODE:
      return findCollision(root2, key);
  }
}
function findArray(root2, shift, hash, key) {
  const idx = mask(hash, shift);
  const node = root2.array[idx];
  if (node === undefined) {
    return;
  }
  if (node.type !== ENTRY) {
    return find(node, shift + SHIFT, hash, key);
  }
  if (isEqual(key, node.k)) {
    return node;
  }
  return;
}
function findIndex(root2, shift, hash, key) {
  const bit = bitpos(hash, shift);
  if ((root2.bitmap & bit) === 0) {
    return;
  }
  const idx = index(root2.bitmap, bit);
  const node = root2.array[idx];
  if (node.type !== ENTRY) {
    return find(node, shift + SHIFT, hash, key);
  }
  if (isEqual(key, node.k)) {
    return node;
  }
  return;
}
function findCollision(root2, key) {
  const idx = collisionIndexOf(root2, key);
  if (idx < 0) {
    return;
  }
  return root2.array[idx];
}
function without(root2, shift, hash, key) {
  switch (root2.type) {
    case ARRAY_NODE:
      return withoutArray(root2, shift, hash, key);
    case INDEX_NODE:
      return withoutIndex(root2, shift, hash, key);
    case COLLISION_NODE:
      return withoutCollision(root2, key);
  }
}
function withoutArray(root2, shift, hash, key) {
  const idx = mask(hash, shift);
  const node = root2.array[idx];
  if (node === undefined) {
    return root2;
  }
  let n = undefined;
  if (node.type === ENTRY) {
    if (!isEqual(node.k, key)) {
      return root2;
    }
  } else {
    n = without(node, shift + SHIFT, hash, key);
    if (n === node) {
      return root2;
    }
  }
  if (n === undefined) {
    if (root2.size <= MIN_ARRAY_NODE) {
      const arr = root2.array;
      const out = new Array(root2.size - 1);
      let i = 0;
      let j = 0;
      let bitmap = 0;
      while (i < idx) {
        const nv = arr[i];
        if (nv !== undefined) {
          out[j] = nv;
          bitmap |= 1 << i;
          ++j;
        }
        ++i;
      }
      ++i;
      while (i < arr.length) {
        const nv = arr[i];
        if (nv !== undefined) {
          out[j] = nv;
          bitmap |= 1 << i;
          ++j;
        }
        ++i;
      }
      return {
        type: INDEX_NODE,
        bitmap,
        array: out
      };
    }
    return {
      type: ARRAY_NODE,
      size: root2.size - 1,
      array: cloneAndSet(root2.array, idx, n)
    };
  }
  return {
    type: ARRAY_NODE,
    size: root2.size,
    array: cloneAndSet(root2.array, idx, n)
  };
}
function withoutIndex(root2, shift, hash, key) {
  const bit = bitpos(hash, shift);
  if ((root2.bitmap & bit) === 0) {
    return root2;
  }
  const idx = index(root2.bitmap, bit);
  const node = root2.array[idx];
  if (node.type !== ENTRY) {
    const n = without(node, shift + SHIFT, hash, key);
    if (n === node) {
      return root2;
    }
    if (n !== undefined) {
      return {
        type: INDEX_NODE,
        bitmap: root2.bitmap,
        array: cloneAndSet(root2.array, idx, n)
      };
    }
    if (root2.bitmap === bit) {
      return;
    }
    return {
      type: INDEX_NODE,
      bitmap: root2.bitmap ^ bit,
      array: spliceOut(root2.array, idx)
    };
  }
  if (isEqual(key, node.k)) {
    if (root2.bitmap === bit) {
      return;
    }
    return {
      type: INDEX_NODE,
      bitmap: root2.bitmap ^ bit,
      array: spliceOut(root2.array, idx)
    };
  }
  return root2;
}
function withoutCollision(root2, key) {
  const idx = collisionIndexOf(root2, key);
  if (idx < 0) {
    return root2;
  }
  if (root2.array.length === 1) {
    return;
  }
  return {
    type: COLLISION_NODE,
    hash: root2.hash,
    array: spliceOut(root2.array, idx)
  };
}
function forEach(root2, fn) {
  if (root2 === undefined) {
    return;
  }
  const items = root2.array;
  const size = items.length;
  for (let i = 0;i < size; i++) {
    const item = items[i];
    if (item === undefined) {
      continue;
    }
    if (item.type === ENTRY) {
      fn(item.v, item.k);
      continue;
    }
    forEach(item, fn);
  }
}

class Dict {
  static fromObject(o) {
    const keys = Object.keys(o);
    let m = Dict.new();
    for (let i = 0;i < keys.length; i++) {
      const k = keys[i];
      m = m.set(k, o[k]);
    }
    return m;
  }
  static fromMap(o) {
    let m = Dict.new();
    o.forEach((v, k) => {
      m = m.set(k, v);
    });
    return m;
  }
  static new() {
    return new Dict(undefined, 0);
  }
  constructor(root2, size) {
    this.root = root2;
    this.size = size;
  }
  get(key, notFound) {
    if (this.root === undefined) {
      return notFound;
    }
    const found = find(this.root, 0, getHash(key), key);
    if (found === undefined) {
      return notFound;
    }
    return found.v;
  }
  set(key, val) {
    const addedLeaf = { val: false };
    const root2 = this.root === undefined ? EMPTY : this.root;
    const newRoot = assoc(root2, 0, getHash(key), key, val, addedLeaf);
    if (newRoot === this.root) {
      return this;
    }
    return new Dict(newRoot, addedLeaf.val ? this.size + 1 : this.size);
  }
  delete(key) {
    if (this.root === undefined) {
      return this;
    }
    const newRoot = without(this.root, 0, getHash(key), key);
    if (newRoot === this.root) {
      return this;
    }
    if (newRoot === undefined) {
      return Dict.new();
    }
    return new Dict(newRoot, this.size - 1);
  }
  has(key) {
    if (this.root === undefined) {
      return false;
    }
    return find(this.root, 0, getHash(key), key) !== undefined;
  }
  entries() {
    if (this.root === undefined) {
      return [];
    }
    const result = [];
    this.forEach((v, k) => result.push([k, v]));
    return result;
  }
  forEach(fn) {
    forEach(this.root, fn);
  }
  hashCode() {
    let h = 0;
    this.forEach((v, k) => {
      h = h + hashMerge(getHash(v), getHash(k)) | 0;
    });
    return h;
  }
  equals(o) {
    if (!(o instanceof Dict) || this.size !== o.size) {
      return false;
    }
    try {
      this.forEach((v, k) => {
        if (!isEqual(o.get(k, !v), v)) {
          throw unequalDictSymbol;
        }
      });
      return true;
    } catch (e) {
      if (e === unequalDictSymbol) {
        return false;
      }
      throw e;
    }
  }
}
var unequalDictSymbol = /* @__PURE__ */ Symbol();

// build/dev/javascript/gleam_stdlib/gleam/dict.mjs
function insert(dict, key, value) {
  return map_insert(key, value, dict);
}
function reverse_and_concat(loop$remaining, loop$accumulator) {
  while (true) {
    let remaining = loop$remaining;
    let accumulator = loop$accumulator;
    if (remaining instanceof Empty) {
      return accumulator;
    } else {
      let first = remaining.head;
      let rest = remaining.tail;
      loop$remaining = rest;
      loop$accumulator = prepend(first, accumulator);
    }
  }
}
function do_keys_loop(loop$list, loop$acc) {
  while (true) {
    let list = loop$list;
    let acc = loop$acc;
    if (list instanceof Empty) {
      return reverse_and_concat(acc, toList([]));
    } else {
      let rest = list.tail;
      let key = list.head[0];
      loop$list = rest;
      loop$acc = prepend(key, acc);
    }
  }
}
function keys(dict) {
  return do_keys_loop(map_to_list(dict), toList([]));
}

// build/dev/javascript/gleam_stdlib/gleam/list.mjs
class Ascending extends CustomType {
}

class Descending extends CustomType {
}
function length_loop(loop$list, loop$count) {
  while (true) {
    let list = loop$list;
    let count = loop$count;
    if (list instanceof Empty) {
      return count;
    } else {
      let list$1 = list.tail;
      loop$list = list$1;
      loop$count = count + 1;
    }
  }
}
function length(list) {
  return length_loop(list, 0);
}
function reverse_and_prepend(loop$prefix, loop$suffix) {
  while (true) {
    let prefix = loop$prefix;
    let suffix = loop$suffix;
    if (prefix instanceof Empty) {
      return suffix;
    } else {
      let first$1 = prefix.head;
      let rest$1 = prefix.tail;
      loop$prefix = rest$1;
      loop$suffix = prepend(first$1, suffix);
    }
  }
}
function reverse(list) {
  return reverse_and_prepend(list, toList([]));
}
function filter_loop(loop$list, loop$fun, loop$acc) {
  while (true) {
    let list = loop$list;
    let fun = loop$fun;
    let acc = loop$acc;
    if (list instanceof Empty) {
      return reverse(acc);
    } else {
      let first$1 = list.head;
      let rest$1 = list.tail;
      let _block;
      let $ = fun(first$1);
      if ($) {
        _block = prepend(first$1, acc);
      } else {
        _block = acc;
      }
      let new_acc = _block;
      loop$list = rest$1;
      loop$fun = fun;
      loop$acc = new_acc;
    }
  }
}
function filter(list, predicate) {
  return filter_loop(list, predicate, toList([]));
}
function map_loop(loop$list, loop$fun, loop$acc) {
  while (true) {
    let list = loop$list;
    let fun = loop$fun;
    let acc = loop$acc;
    if (list instanceof Empty) {
      return reverse(acc);
    } else {
      let first$1 = list.head;
      let rest$1 = list.tail;
      loop$list = rest$1;
      loop$fun = fun;
      loop$acc = prepend(fun(first$1), acc);
    }
  }
}
function map(list, fun) {
  return map_loop(list, fun, toList([]));
}
function append_loop(loop$first, loop$second) {
  while (true) {
    let first = loop$first;
    let second = loop$second;
    if (first instanceof Empty) {
      return second;
    } else {
      let first$1 = first.head;
      let rest$1 = first.tail;
      loop$first = rest$1;
      loop$second = prepend(first$1, second);
    }
  }
}
function append(first, second) {
  return append_loop(reverse(first), second);
}
function prepend2(list, item) {
  return prepend(item, list);
}
function flatten_loop(loop$lists, loop$acc) {
  while (true) {
    let lists = loop$lists;
    let acc = loop$acc;
    if (lists instanceof Empty) {
      return reverse(acc);
    } else {
      let list = lists.head;
      let further_lists = lists.tail;
      loop$lists = further_lists;
      loop$acc = reverse_and_prepend(list, acc);
    }
  }
}
function flatten(lists) {
  return flatten_loop(lists, toList([]));
}
function flat_map(list, fun) {
  return flatten(map(list, fun));
}
function fold(loop$list, loop$initial, loop$fun) {
  while (true) {
    let list = loop$list;
    let initial = loop$initial;
    let fun = loop$fun;
    if (list instanceof Empty) {
      return initial;
    } else {
      let first$1 = list.head;
      let rest$1 = list.tail;
      loop$list = rest$1;
      loop$initial = fun(initial, first$1);
      loop$fun = fun;
    }
  }
}
function find2(loop$list, loop$is_desired) {
  while (true) {
    let list = loop$list;
    let is_desired = loop$is_desired;
    if (list instanceof Empty) {
      return new Error(undefined);
    } else {
      let first$1 = list.head;
      let rest$1 = list.tail;
      let $ = is_desired(first$1);
      if ($) {
        return new Ok(first$1);
      } else {
        loop$list = rest$1;
        loop$is_desired = is_desired;
      }
    }
  }
}
function sequences(loop$list, loop$compare, loop$growing, loop$direction, loop$prev, loop$acc) {
  while (true) {
    let list = loop$list;
    let compare3 = loop$compare;
    let growing = loop$growing;
    let direction = loop$direction;
    let prev = loop$prev;
    let acc = loop$acc;
    let growing$1 = prepend(prev, growing);
    if (list instanceof Empty) {
      if (direction instanceof Ascending) {
        return prepend(reverse(growing$1), acc);
      } else {
        return prepend(growing$1, acc);
      }
    } else {
      let new$1 = list.head;
      let rest$1 = list.tail;
      let $ = compare3(prev, new$1);
      if (direction instanceof Ascending) {
        if ($ instanceof Lt) {
          loop$list = rest$1;
          loop$compare = compare3;
          loop$growing = growing$1;
          loop$direction = direction;
          loop$prev = new$1;
          loop$acc = acc;
        } else if ($ instanceof Eq) {
          loop$list = rest$1;
          loop$compare = compare3;
          loop$growing = growing$1;
          loop$direction = direction;
          loop$prev = new$1;
          loop$acc = acc;
        } else {
          let _block;
          if (direction instanceof Ascending) {
            _block = prepend(reverse(growing$1), acc);
          } else {
            _block = prepend(growing$1, acc);
          }
          let acc$1 = _block;
          if (rest$1 instanceof Empty) {
            return prepend(toList([new$1]), acc$1);
          } else {
            let next = rest$1.head;
            let rest$2 = rest$1.tail;
            let _block$1;
            let $1 = compare3(new$1, next);
            if ($1 instanceof Lt) {
              _block$1 = new Ascending;
            } else if ($1 instanceof Eq) {
              _block$1 = new Ascending;
            } else {
              _block$1 = new Descending;
            }
            let direction$1 = _block$1;
            loop$list = rest$2;
            loop$compare = compare3;
            loop$growing = toList([new$1]);
            loop$direction = direction$1;
            loop$prev = next;
            loop$acc = acc$1;
          }
        }
      } else if ($ instanceof Lt) {
        let _block;
        if (direction instanceof Ascending) {
          _block = prepend(reverse(growing$1), acc);
        } else {
          _block = prepend(growing$1, acc);
        }
        let acc$1 = _block;
        if (rest$1 instanceof Empty) {
          return prepend(toList([new$1]), acc$1);
        } else {
          let next = rest$1.head;
          let rest$2 = rest$1.tail;
          let _block$1;
          let $1 = compare3(new$1, next);
          if ($1 instanceof Lt) {
            _block$1 = new Ascending;
          } else if ($1 instanceof Eq) {
            _block$1 = new Ascending;
          } else {
            _block$1 = new Descending;
          }
          let direction$1 = _block$1;
          loop$list = rest$2;
          loop$compare = compare3;
          loop$growing = toList([new$1]);
          loop$direction = direction$1;
          loop$prev = next;
          loop$acc = acc$1;
        }
      } else if ($ instanceof Eq) {
        let _block;
        if (direction instanceof Ascending) {
          _block = prepend(reverse(growing$1), acc);
        } else {
          _block = prepend(growing$1, acc);
        }
        let acc$1 = _block;
        if (rest$1 instanceof Empty) {
          return prepend(toList([new$1]), acc$1);
        } else {
          let next = rest$1.head;
          let rest$2 = rest$1.tail;
          let _block$1;
          let $1 = compare3(new$1, next);
          if ($1 instanceof Lt) {
            _block$1 = new Ascending;
          } else if ($1 instanceof Eq) {
            _block$1 = new Ascending;
          } else {
            _block$1 = new Descending;
          }
          let direction$1 = _block$1;
          loop$list = rest$2;
          loop$compare = compare3;
          loop$growing = toList([new$1]);
          loop$direction = direction$1;
          loop$prev = next;
          loop$acc = acc$1;
        }
      } else {
        loop$list = rest$1;
        loop$compare = compare3;
        loop$growing = growing$1;
        loop$direction = direction;
        loop$prev = new$1;
        loop$acc = acc;
      }
    }
  }
}
function merge_ascendings(loop$list1, loop$list2, loop$compare, loop$acc) {
  while (true) {
    let list1 = loop$list1;
    let list2 = loop$list2;
    let compare3 = loop$compare;
    let acc = loop$acc;
    if (list1 instanceof Empty) {
      let list = list2;
      return reverse_and_prepend(list, acc);
    } else if (list2 instanceof Empty) {
      let list = list1;
      return reverse_and_prepend(list, acc);
    } else {
      let first1 = list1.head;
      let rest1 = list1.tail;
      let first2 = list2.head;
      let rest2 = list2.tail;
      let $ = compare3(first1, first2);
      if ($ instanceof Lt) {
        loop$list1 = rest1;
        loop$list2 = list2;
        loop$compare = compare3;
        loop$acc = prepend(first1, acc);
      } else if ($ instanceof Eq) {
        loop$list1 = list1;
        loop$list2 = rest2;
        loop$compare = compare3;
        loop$acc = prepend(first2, acc);
      } else {
        loop$list1 = list1;
        loop$list2 = rest2;
        loop$compare = compare3;
        loop$acc = prepend(first2, acc);
      }
    }
  }
}
function merge_ascending_pairs(loop$sequences, loop$compare, loop$acc) {
  while (true) {
    let sequences2 = loop$sequences;
    let compare3 = loop$compare;
    let acc = loop$acc;
    if (sequences2 instanceof Empty) {
      return reverse(acc);
    } else {
      let $ = sequences2.tail;
      if ($ instanceof Empty) {
        let sequence = sequences2.head;
        return reverse(prepend(reverse(sequence), acc));
      } else {
        let ascending1 = sequences2.head;
        let ascending2 = $.head;
        let rest$1 = $.tail;
        let descending = merge_ascendings(ascending1, ascending2, compare3, toList([]));
        loop$sequences = rest$1;
        loop$compare = compare3;
        loop$acc = prepend(descending, acc);
      }
    }
  }
}
function merge_descendings(loop$list1, loop$list2, loop$compare, loop$acc) {
  while (true) {
    let list1 = loop$list1;
    let list2 = loop$list2;
    let compare3 = loop$compare;
    let acc = loop$acc;
    if (list1 instanceof Empty) {
      let list = list2;
      return reverse_and_prepend(list, acc);
    } else if (list2 instanceof Empty) {
      let list = list1;
      return reverse_and_prepend(list, acc);
    } else {
      let first1 = list1.head;
      let rest1 = list1.tail;
      let first2 = list2.head;
      let rest2 = list2.tail;
      let $ = compare3(first1, first2);
      if ($ instanceof Lt) {
        loop$list1 = list1;
        loop$list2 = rest2;
        loop$compare = compare3;
        loop$acc = prepend(first2, acc);
      } else if ($ instanceof Eq) {
        loop$list1 = rest1;
        loop$list2 = list2;
        loop$compare = compare3;
        loop$acc = prepend(first1, acc);
      } else {
        loop$list1 = rest1;
        loop$list2 = list2;
        loop$compare = compare3;
        loop$acc = prepend(first1, acc);
      }
    }
  }
}
function merge_descending_pairs(loop$sequences, loop$compare, loop$acc) {
  while (true) {
    let sequences2 = loop$sequences;
    let compare3 = loop$compare;
    let acc = loop$acc;
    if (sequences2 instanceof Empty) {
      return reverse(acc);
    } else {
      let $ = sequences2.tail;
      if ($ instanceof Empty) {
        let sequence = sequences2.head;
        return reverse(prepend(reverse(sequence), acc));
      } else {
        let descending1 = sequences2.head;
        let descending2 = $.head;
        let rest$1 = $.tail;
        let ascending = merge_descendings(descending1, descending2, compare3, toList([]));
        loop$sequences = rest$1;
        loop$compare = compare3;
        loop$acc = prepend(ascending, acc);
      }
    }
  }
}
function merge_all(loop$sequences, loop$direction, loop$compare) {
  while (true) {
    let sequences2 = loop$sequences;
    let direction = loop$direction;
    let compare3 = loop$compare;
    if (sequences2 instanceof Empty) {
      return sequences2;
    } else if (direction instanceof Ascending) {
      let $ = sequences2.tail;
      if ($ instanceof Empty) {
        let sequence = sequences2.head;
        return sequence;
      } else {
        let sequences$1 = merge_ascending_pairs(sequences2, compare3, toList([]));
        loop$sequences = sequences$1;
        loop$direction = new Descending;
        loop$compare = compare3;
      }
    } else {
      let $ = sequences2.tail;
      if ($ instanceof Empty) {
        let sequence = sequences2.head;
        return reverse(sequence);
      } else {
        let sequences$1 = merge_descending_pairs(sequences2, compare3, toList([]));
        loop$sequences = sequences$1;
        loop$direction = new Ascending;
        loop$compare = compare3;
      }
    }
  }
}
function sort(list, compare3) {
  if (list instanceof Empty) {
    return list;
  } else {
    let $ = list.tail;
    if ($ instanceof Empty) {
      return list;
    } else {
      let x = list.head;
      let y = $.head;
      let rest$1 = $.tail;
      let _block;
      let $1 = compare3(x, y);
      if ($1 instanceof Lt) {
        _block = new Ascending;
      } else if ($1 instanceof Eq) {
        _block = new Ascending;
      } else {
        _block = new Descending;
      }
      let direction = _block;
      let sequences$1 = sequences(rest$1, compare3, toList([x]), direction, y, toList([]));
      return merge_all(sequences$1, new Ascending, compare3);
    }
  }
}
function range_loop(loop$start, loop$stop, loop$acc) {
  while (true) {
    let start = loop$start;
    let stop = loop$stop;
    let acc = loop$acc;
    let $ = compare2(start, stop);
    if ($ instanceof Lt) {
      loop$start = start;
      loop$stop = stop - 1;
      loop$acc = prepend(stop, acc);
    } else if ($ instanceof Eq) {
      return prepend(stop, acc);
    } else {
      loop$start = start;
      loop$stop = stop + 1;
      loop$acc = prepend(stop, acc);
    }
  }
}
function range(start, stop) {
  return range_loop(start, stop, toList([]));
}
function each(loop$list, loop$f) {
  while (true) {
    let list = loop$list;
    let f = loop$f;
    if (list instanceof Empty) {
      return;
    } else {
      let first$1 = list.head;
      let rest$1 = list.tail;
      f(first$1);
      loop$list = rest$1;
      loop$f = f;
    }
  }
}

// build/dev/javascript/gleam_stdlib/gleam/dynamic/decode.mjs
class Decoder extends CustomType {
  constructor(function$) {
    super();
    this.function = function$;
  }
}
function run(data, decoder) {
  let $ = decoder.function(data);
  let maybe_invalid_data;
  let errors;
  maybe_invalid_data = $[0];
  errors = $[1];
  if (errors instanceof Empty) {
    return new Ok(maybe_invalid_data);
  } else {
    return new Error(errors);
  }
}
function success(data) {
  return new Decoder((_) => {
    return [data, toList([])];
  });
}
function map2(decoder, transformer) {
  return new Decoder((d) => {
    let $ = decoder.function(d);
    let data;
    let errors;
    data = $[0];
    errors = $[1];
    return [transformer(data), errors];
  });
}

// build/dev/javascript/gleam_stdlib/gleam_stdlib.mjs
var Nil = undefined;
var NOT_FOUND = {};
function identity(x) {
  return x;
}
function to_string(term) {
  return term.toString();
}
function add(a, b) {
  return a + b;
}
function concat(xs) {
  let result = "";
  for (const x of xs) {
    result = result + x;
  }
  return result;
}
function starts_with(haystack, needle) {
  return haystack.startsWith(needle);
}
var unicode_whitespaces = [
  " ",
  "\t",
  `
`,
  "\v",
  "\f",
  "\r",
  "",
  "\u2028",
  "\u2029"
].join("");
var trim_start_regex = /* @__PURE__ */ new RegExp(`^[${unicode_whitespaces}]*`);
var trim_end_regex = /* @__PURE__ */ new RegExp(`[${unicode_whitespaces}]*$`);
function ceiling(float2) {
  return Math.ceil(float2);
}
function floor(float2) {
  return Math.floor(float2);
}
function round2(float2) {
  return Math.round(float2);
}
function truncate(float2) {
  return Math.trunc(float2);
}
function power(base, exponent) {
  return Math.pow(base, exponent);
}
function new_map() {
  return Dict.new();
}
function map_to_list(map3) {
  return List.fromArray(map3.entries());
}
function map_get(map3, key) {
  const value = map3.get(key, NOT_FOUND);
  if (value === NOT_FOUND) {
    return new Error(Nil);
  }
  return new Ok(value);
}
function map_insert(key, value, map3) {
  return map3.set(key, value);
}
function float_to_string(float2) {
  const string3 = float2.toString().replace("+", "");
  if (string3.indexOf(".") >= 0) {
    return string3;
  } else {
    const index3 = string3.indexOf("e");
    if (index3 >= 0) {
      return string3.slice(0, index3) + ".0" + string3.slice(index3);
    } else {
      return string3 + ".0";
    }
  }
}

class Inspector {
  #references = new Set;
  inspect(v) {
    const t = typeof v;
    if (v === true)
      return "True";
    if (v === false)
      return "False";
    if (v === null)
      return "//js(null)";
    if (v === undefined)
      return "Nil";
    if (t === "string")
      return this.#string(v);
    if (t === "bigint" || Number.isInteger(v))
      return v.toString();
    if (t === "number")
      return float_to_string(v);
    if (v instanceof UtfCodepoint)
      return this.#utfCodepoint(v);
    if (v instanceof BitArray)
      return this.#bit_array(v);
    if (v instanceof RegExp)
      return `//js(${v})`;
    if (v instanceof Date)
      return `//js(Date("${v.toISOString()}"))`;
    if (v instanceof globalThis.Error)
      return `//js(${v.toString()})`;
    if (v instanceof Function) {
      const args = [];
      for (const i of Array(v.length).keys())
        args.push(String.fromCharCode(i + 97));
      return `//fn(${args.join(", ")}) { ... }`;
    }
    if (this.#references.size === this.#references.add(v).size) {
      return "//js(circular reference)";
    }
    let printed;
    if (Array.isArray(v)) {
      printed = `#(${v.map((v2) => this.inspect(v2)).join(", ")})`;
    } else if (v instanceof List) {
      printed = this.#list(v);
    } else if (v instanceof CustomType) {
      printed = this.#customType(v);
    } else if (v instanceof Dict) {
      printed = this.#dict(v);
    } else if (v instanceof Set) {
      return `//js(Set(${[...v].map((v2) => this.inspect(v2)).join(", ")}))`;
    } else {
      printed = this.#object(v);
    }
    this.#references.delete(v);
    return printed;
  }
  #object(v) {
    const name = Object.getPrototypeOf(v)?.constructor?.name || "Object";
    const props = [];
    for (const k of Object.keys(v)) {
      props.push(`${this.inspect(k)}: ${this.inspect(v[k])}`);
    }
    const body = props.length ? " " + props.join(", ") + " " : "";
    const head = name === "Object" ? "" : name + " ";
    return `//js(${head}{${body}})`;
  }
  #dict(map3) {
    let body = "dict.from_list([";
    let first = true;
    map3.forEach((value, key) => {
      if (!first)
        body = body + ", ";
      body = body + "#(" + this.inspect(key) + ", " + this.inspect(value) + ")";
      first = false;
    });
    return body + "])";
  }
  #customType(record) {
    const props = Object.keys(record).map((label) => {
      const value = this.inspect(record[label]);
      return isNaN(parseInt(label)) ? `${label}: ${value}` : value;
    }).join(", ");
    return props ? `${record.constructor.name}(${props})` : record.constructor.name;
  }
  #list(list2) {
    if (list2 instanceof Empty) {
      return "[]";
    }
    let char_out = 'charlist.from_string("';
    let list_out = "[";
    let current = list2;
    while (current instanceof NonEmpty) {
      let element = current.head;
      current = current.tail;
      if (list_out !== "[") {
        list_out += ", ";
      }
      list_out += this.inspect(element);
      if (char_out) {
        if (Number.isInteger(element) && element >= 32 && element <= 126) {
          char_out += String.fromCharCode(element);
        } else {
          char_out = null;
        }
      }
    }
    if (char_out) {
      return char_out + '")';
    } else {
      return list_out + "]";
    }
  }
  #string(str) {
    let new_str = '"';
    for (let i = 0;i < str.length; i++) {
      const char = str[i];
      switch (char) {
        case `
`:
          new_str += "\\n";
          break;
        case "\r":
          new_str += "\\r";
          break;
        case "\t":
          new_str += "\\t";
          break;
        case "\f":
          new_str += "\\f";
          break;
        case "\\":
          new_str += "\\\\";
          break;
        case '"':
          new_str += "\\\"";
          break;
        default:
          if (char < " " || char > "~" && char < " ") {
            new_str += "\\u{" + char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0") + "}";
          } else {
            new_str += char;
          }
      }
    }
    new_str += '"';
    return new_str;
  }
  #utfCodepoint(codepoint) {
    return `//utfcodepoint(${String.fromCodePoint(codepoint.value)})`;
  }
  #bit_array(bits) {
    if (bits.bitSize === 0) {
      return "<<>>";
    }
    let acc = "<<";
    for (let i = 0;i < bits.byteSize - 1; i++) {
      acc += bits.byteAt(i).toString();
      acc += ", ";
    }
    if (bits.byteSize * 8 === bits.bitSize) {
      acc += bits.byteAt(bits.byteSize - 1).toString();
    } else {
      const trailingBitsCount = bits.bitSize % 8;
      acc += bits.byteAt(bits.byteSize - 1) >> 8 - trailingBitsCount;
      acc += `:size(${trailingBitsCount})`;
    }
    acc += ">>";
    return acc;
  }
}

// build/dev/javascript/gleam_stdlib/gleam/float.mjs
function min(a, b) {
  let $ = a < b;
  if ($) {
    return a;
  } else {
    return b;
  }
}
function max(a, b) {
  let $ = a > b;
  if ($) {
    return a;
  } else {
    return b;
  }
}
function absolute_value(x) {
  let $ = x >= 0;
  if ($) {
    return x;
  } else {
    return 0 - x;
  }
}
function power2(base, exponent) {
  let fractional = ceiling(exponent) - exponent > 0;
  let $ = base < 0 && fractional || base === 0 && exponent < 0;
  if ($) {
    return new Error(undefined);
  } else {
    return new Ok(power(base, exponent));
  }
}
function negate(x) {
  return -1 * x;
}
function round(x) {
  let $ = x >= 0;
  if ($) {
    return round2(x);
  } else {
    return 0 - round2(negate(x));
  }
}
function modulo(dividend, divisor) {
  if (divisor === 0) {
    return new Error(undefined);
  } else {
    return new Ok(dividend - floor(divideFloat(dividend, divisor)) * divisor);
  }
}
function divide(a, b) {
  if (b === 0) {
    return new Error(undefined);
  } else {
    let b$1 = b;
    return new Ok(divideFloat(a, b$1));
  }
}
function multiply(a, b) {
  return a * b;
}

// build/dev/javascript/gleam_stdlib/gleam/int.mjs
function compare2(a, b) {
  let $ = a === b;
  if ($) {
    return new Eq;
  } else {
    let $1 = a < b;
    if ($1) {
      return new Lt;
    } else {
      return new Gt;
    }
  }
}

// build/dev/javascript/gleam_stdlib/gleam/string_tree.mjs
function new$() {
  return concat(toList([]));
}
function append2(tree, second) {
  return add(tree, identity(second));
}

// build/dev/javascript/gleam_stdlib/gleam/string.mjs
function concat_loop(loop$strings, loop$accumulator) {
  while (true) {
    let strings = loop$strings;
    let accumulator = loop$accumulator;
    if (strings instanceof Empty) {
      return accumulator;
    } else {
      let string3 = strings.head;
      let strings$1 = strings.tail;
      loop$strings = strings$1;
      loop$accumulator = accumulator + string3;
    }
  }
}
function concat2(strings) {
  return concat_loop(strings, "");
}
function join_loop(loop$strings, loop$separator, loop$accumulator) {
  while (true) {
    let strings = loop$strings;
    let separator = loop$separator;
    let accumulator = loop$accumulator;
    if (strings instanceof Empty) {
      return accumulator;
    } else {
      let string3 = strings.head;
      let strings$1 = strings.tail;
      loop$strings = strings$1;
      loop$separator = separator;
      loop$accumulator = accumulator + separator + string3;
    }
  }
}
function join(strings, separator) {
  if (strings instanceof Empty) {
    return "";
  } else {
    let first$1 = strings.head;
    let rest = strings.tail;
    return join_loop(rest, separator, first$1);
  }
}

// build/dev/javascript/gleam_stdlib/gleam/result.mjs
function try$(result, fun) {
  if (result instanceof Ok) {
    let x = result[0];
    return fun(x);
  } else {
    return result;
  }
}
function unwrap2(result, default$) {
  if (result instanceof Ok) {
    let v = result[0];
    return v;
  } else {
    return default$;
  }
}
// build/dev/javascript/gleam_community_colour/gleam_community/colour.mjs
var FILEPATH = "src/gleam_community/colour.gleam";

class Rgba extends CustomType {
  constructor(r, g, b, a) {
    super();
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
}
function valid_colour_value(c) {
  let $ = c > 1 || c < 0;
  if ($) {
    return new Error(undefined);
  } else {
    return new Ok(c);
  }
}
function hue_to_rgb(hue, m1, m2) {
  let _block;
  if (hue < 0) {
    _block = hue + 1;
  } else if (hue > 1) {
    _block = hue - 1;
  } else {
    _block = hue;
  }
  let h = _block;
  let h_t_6 = h * 6;
  let h_t_2 = h * 2;
  let h_t_3 = h * 3;
  if (h_t_6 < 1) {
    return m1 + (m2 - m1) * h * 6;
  } else if (h_t_2 < 1) {
    return m2;
  } else if (h_t_3 < 2) {
    return m1 + (m2 - m1) * (2 / 3 - h) * 6;
  } else {
    return m1;
  }
}
function hsla_to_rgba(h, s, l, a) {
  let _block;
  let $ = l <= 0.5;
  if ($) {
    _block = l * (s + 1);
  } else {
    _block = l + s - l * s;
  }
  let m2 = _block;
  let m1 = l * 2 - m2;
  let r = hue_to_rgb(h + 1 / 3, m1, m2);
  let g = hue_to_rgb(h, m1, m2);
  let b = hue_to_rgb(h - 1 / 3, m1, m2);
  return [r, g, b, a];
}
function from_rgb(red, green, blue) {
  return try$(valid_colour_value(red), (r) => {
    return try$(valid_colour_value(green), (g) => {
      return try$(valid_colour_value(blue), (b) => {
        return new Ok(new Rgba(r, g, b, 1));
      });
    });
  });
}
function from_rgba(red, green, blue, alpha) {
  return try$(valid_colour_value(red), (r) => {
    return try$(valid_colour_value(green), (g) => {
      return try$(valid_colour_value(blue), (b) => {
        return try$(valid_colour_value(alpha), (a) => {
          return new Ok(new Rgba(r, g, b, a));
        });
      });
    });
  });
}
function to_rgba(colour) {
  if (colour instanceof Rgba) {
    let r = colour.r;
    let g = colour.g;
    let b = colour.b;
    let a = colour.a;
    return [r, g, b, a];
  } else {
    let h = colour.h;
    let s = colour.s;
    let l = colour.l;
    let a = colour.a;
    return hsla_to_rgba(h, s, l, a);
  }
}
function to_css_rgba_string(colour) {
  let $ = to_rgba(colour);
  let r;
  let g;
  let b;
  let a;
  r = $[0];
  g = $[1];
  b = $[2];
  a = $[3];
  let percent = (x) => {
    let _block;
    let _pipe = x;
    let _pipe$1 = multiply(_pipe, 1e4);
    let _pipe$2 = round(_pipe$1);
    let _pipe$3 = identity(_pipe$2);
    _block = divide(_pipe$3, 100);
    let $1 = _block;
    let p;
    if ($1 instanceof Ok) {
      p = $1[0];
    } else {
      throw makeError("let_assert", FILEPATH, "gleam_community/colour", 706, "to_css_rgba_string", "Pattern match failed, no pattern matched the value.", {
        value: $1,
        start: 20510,
        end: 20646,
        pattern_start: 20521,
        pattern_end: 20526
      });
    }
    return p;
  };
  let round_to = (x) => {
    let _block;
    let _pipe = x;
    let _pipe$1 = multiply(_pipe, 1000);
    let _pipe$2 = round(_pipe$1);
    let _pipe$3 = identity(_pipe$2);
    _block = divide(_pipe$3, 1000);
    let $1 = _block;
    let r$1;
    if ($1 instanceof Ok) {
      r$1 = $1[0];
    } else {
      throw makeError("let_assert", FILEPATH, "gleam_community/colour", 718, "to_css_rgba_string", "Pattern match failed, no pattern matched the value.", {
        value: $1,
        start: 20768,
        end: 20903,
        pattern_start: 20779,
        pattern_end: 20784
      });
    }
    return r$1;
  };
  return join(toList([
    "rgba(",
    float_to_string(percent(r)) + "%,",
    float_to_string(percent(g)) + "%,",
    float_to_string(percent(b)) + "%,",
    float_to_string(round_to(a)),
    ")"
  ]), "");
}
var red = /* @__PURE__ */ new Rgba(0.8, 0, 0, 1);
var black = /* @__PURE__ */ new Rgba(0, 0, 0, 1);
var white = /* @__PURE__ */ new Rgba(1, 1, 1, 1);

// build/dev/javascript/gleam_stdlib/gleam/bool.mjs
function guard(requirement, consequence, alternative) {
  if (requirement) {
    return consequence;
  } else {
    return alternative();
  }
}
// build/dev/javascript/gleam_community_maths/maths.mjs
function sin(float4) {
  return Math.sin(float4);
}
function pi() {
  return Math.PI;
}
function cos(float4) {
  return Math.cos(float4);
}

// build/dev/javascript/gleam_community_maths/gleam_community/maths.mjs
function cos2(x) {
  return cos(x);
}
function sin2(x) {
  return sin(x);
}
function pi2() {
  return pi();
}
// build/dev/javascript/gleam_stdlib/gleam/function.mjs
function identity3(x) {
  return x;
}
// build/dev/javascript/houdini/houdini.ffi.mjs
function do_escape(string3) {
  return string3.replaceAll(/[><&"']/g, (replaced) => {
    switch (replaced) {
      case ">":
        return "&gt;";
      case "<":
        return "&lt;";
      case "'":
        return "&#39;";
      case "&":
        return "&amp;";
      case '"':
        return "&quot;";
      default:
        return replaced;
    }
  });
}

// build/dev/javascript/houdini/houdini/internal/escape_js.mjs
function escape(text) {
  return do_escape(text);
}

// build/dev/javascript/houdini/houdini.mjs
function escape2(string3) {
  return escape(string3);
}

// build/dev/javascript/lustre/lustre/internals/constants.ffi.mjs
var document2 = () => globalThis?.document;
var NAMESPACE_HTML = "http://www.w3.org/1999/xhtml";
var ELEMENT_NODE = 1;
var TEXT_NODE = 3;
var SUPPORTS_MOVE_BEFORE = !!globalThis.HTMLElement?.prototype?.moveBefore;

// build/dev/javascript/lustre/lustre/internals/constants.mjs
var empty_list = /* @__PURE__ */ toList([]);
var option_none = /* @__PURE__ */ new None;

// build/dev/javascript/lustre/lustre/vdom/vattr.ffi.mjs
var GT = /* @__PURE__ */ new Gt;
var LT = /* @__PURE__ */ new Lt;
var EQ = /* @__PURE__ */ new Eq;
function compare3(a, b) {
  if (a.name === b.name) {
    return EQ;
  } else if (a.name < b.name) {
    return LT;
  } else {
    return GT;
  }
}

// build/dev/javascript/lustre/lustre/vdom/vattr.mjs
class Attribute extends CustomType {
  constructor(kind, name, value) {
    super();
    this.kind = kind;
    this.name = name;
    this.value = value;
  }
}
class Property extends CustomType {
  constructor(kind, name, value) {
    super();
    this.kind = kind;
    this.name = name;
    this.value = value;
  }
}
class Event2 extends CustomType {
  constructor(kind, name, handler, include, prevent_default, stop_propagation, debounce, throttle) {
    super();
    this.kind = kind;
    this.name = name;
    this.handler = handler;
    this.include = include;
    this.prevent_default = prevent_default;
    this.stop_propagation = stop_propagation;
    this.debounce = debounce;
    this.throttle = throttle;
  }
}
class Handler extends CustomType {
  constructor(prevent_default, stop_propagation, message) {
    super();
    this.prevent_default = prevent_default;
    this.stop_propagation = stop_propagation;
    this.message = message;
  }
}
class Never extends CustomType {
  constructor(kind) {
    super();
    this.kind = kind;
  }
}
function merge(loop$attributes, loop$merged) {
  while (true) {
    let attributes = loop$attributes;
    let merged = loop$merged;
    if (attributes instanceof Empty) {
      return merged;
    } else {
      let $ = attributes.head;
      if ($ instanceof Attribute) {
        let $1 = $.name;
        if ($1 === "") {
          let rest = attributes.tail;
          loop$attributes = rest;
          loop$merged = merged;
        } else if ($1 === "class") {
          let $2 = $.value;
          if ($2 === "") {
            let rest = attributes.tail;
            loop$attributes = rest;
            loop$merged = merged;
          } else {
            let $3 = attributes.tail;
            if ($3 instanceof Empty) {
              let attribute$1 = $;
              let rest = $3;
              loop$attributes = rest;
              loop$merged = prepend(attribute$1, merged);
            } else {
              let $4 = $3.head;
              if ($4 instanceof Attribute) {
                let $5 = $4.name;
                if ($5 === "class") {
                  let kind = $.kind;
                  let class1 = $2;
                  let rest = $3.tail;
                  let class2 = $4.value;
                  let value = class1 + " " + class2;
                  let attribute$1 = new Attribute(kind, "class", value);
                  loop$attributes = prepend(attribute$1, rest);
                  loop$merged = merged;
                } else {
                  let attribute$1 = $;
                  let rest = $3;
                  loop$attributes = rest;
                  loop$merged = prepend(attribute$1, merged);
                }
              } else {
                let attribute$1 = $;
                let rest = $3;
                loop$attributes = rest;
                loop$merged = prepend(attribute$1, merged);
              }
            }
          }
        } else if ($1 === "style") {
          let $2 = $.value;
          if ($2 === "") {
            let rest = attributes.tail;
            loop$attributes = rest;
            loop$merged = merged;
          } else {
            let $3 = attributes.tail;
            if ($3 instanceof Empty) {
              let attribute$1 = $;
              let rest = $3;
              loop$attributes = rest;
              loop$merged = prepend(attribute$1, merged);
            } else {
              let $4 = $3.head;
              if ($4 instanceof Attribute) {
                let $5 = $4.name;
                if ($5 === "style") {
                  let kind = $.kind;
                  let style1 = $2;
                  let rest = $3.tail;
                  let style2 = $4.value;
                  let value = style1 + ";" + style2;
                  let attribute$1 = new Attribute(kind, "style", value);
                  loop$attributes = prepend(attribute$1, rest);
                  loop$merged = merged;
                } else {
                  let attribute$1 = $;
                  let rest = $3;
                  loop$attributes = rest;
                  loop$merged = prepend(attribute$1, merged);
                }
              } else {
                let attribute$1 = $;
                let rest = $3;
                loop$attributes = rest;
                loop$merged = prepend(attribute$1, merged);
              }
            }
          }
        } else {
          let attribute$1 = $;
          let rest = attributes.tail;
          loop$attributes = rest;
          loop$merged = prepend(attribute$1, merged);
        }
      } else {
        let attribute$1 = $;
        let rest = attributes.tail;
        loop$attributes = rest;
        loop$merged = prepend(attribute$1, merged);
      }
    }
  }
}
function prepare(attributes) {
  if (attributes instanceof Empty) {
    return attributes;
  } else {
    let $ = attributes.tail;
    if ($ instanceof Empty) {
      return attributes;
    } else {
      let _pipe = attributes;
      let _pipe$1 = sort(_pipe, (a, b) => {
        return compare3(b, a);
      });
      return merge(_pipe$1, empty_list);
    }
  }
}
var attribute_kind = 0;
function attribute(name, value) {
  return new Attribute(attribute_kind, name, value);
}
function to_string_tree(key, namespace, attributes) {
  let _block;
  let $ = key !== "";
  if ($) {
    _block = prepend(attribute("data-lustre-key", key), attributes);
  } else {
    _block = attributes;
  }
  let attributes$1 = _block;
  let _block$1;
  let $1 = namespace !== "";
  if ($1) {
    _block$1 = prepend(attribute("xmlns", namespace), attributes$1);
  } else {
    _block$1 = attributes$1;
  }
  let attributes$2 = _block$1;
  return fold(attributes$2, new$(), (html, attr) => {
    if (attr instanceof Attribute) {
      let $2 = attr.name;
      if ($2 === "virtual:defaultValue") {
        let value = attr.value;
        return append2(html, ' value="' + escape2(value) + '"');
      } else if ($2 === "virtual:defaultChecked") {
        return append2(html, " checked");
      } else if ($2 === "virtual:defaultSelected") {
        return append2(html, " selected");
      } else if ($2 === "") {
        return html;
      } else {
        let $3 = attr.value;
        if ($3 === "") {
          let name = $2;
          return append2(html, " " + name);
        } else {
          let name = $2;
          let value = $3;
          return append2(html, " " + name + '="' + escape2(value) + '"');
        }
      }
    } else {
      return html;
    }
  });
}
var property_kind = 1;
var event_kind = 2;
function event(name, handler, include, prevent_default, stop_propagation, debounce, throttle) {
  return new Event2(event_kind, name, handler, include, prevent_default, stop_propagation, debounce, throttle);
}
var never_kind = 0;
var never = /* @__PURE__ */ new Never(never_kind);
var always_kind = 2;

// build/dev/javascript/lustre/lustre/attribute.mjs
function attribute2(name, value) {
  return attribute(name, value);
}
function class$(name) {
  return attribute2("class", name);
}
function style(property2, value) {
  if (property2 === "") {
    return class$("");
  } else if (value === "") {
    return class$("");
  } else {
    return attribute2("style", property2 + ":" + value + ";");
  }
}
function width(value) {
  return attribute2("width", to_string(value));
}
function height(value) {
  return attribute2("height", to_string(value));
}

// build/dev/javascript/lustre/lustre/effect.mjs
class Effect extends CustomType {
  constructor(synchronous, before_paint, after_paint) {
    super();
    this.synchronous = synchronous;
    this.before_paint = before_paint;
    this.after_paint = after_paint;
  }
}

class Actions extends CustomType {
  constructor(dispatch, emit, select, root2, provide) {
    super();
    this.dispatch = dispatch;
    this.emit = emit;
    this.select = select;
    this.root = root2;
    this.provide = provide;
  }
}
function perform(effect, dispatch, emit, select, root2, provide) {
  let actions = new Actions(dispatch, emit, select, root2, provide);
  return each(effect.synchronous, (run2) => {
    return run2(actions);
  });
}
var empty2 = /* @__PURE__ */ new Effect(/* @__PURE__ */ toList([]), /* @__PURE__ */ toList([]), /* @__PURE__ */ toList([]));
function none() {
  return empty2;
}
function from(effect) {
  let task = (actions) => {
    let dispatch = actions.dispatch;
    return effect(dispatch);
  };
  return new Effect(toList([task]), empty2.before_paint, empty2.after_paint);
}
function batch(effects) {
  return fold(effects, empty2, (acc, eff) => {
    return new Effect(fold(eff.synchronous, acc.synchronous, prepend2), fold(eff.before_paint, acc.before_paint, prepend2), fold(eff.after_paint, acc.after_paint, prepend2));
  });
}

// build/dev/javascript/lustre/lustre/internals/mutable_map.ffi.mjs
function empty3() {
  return null;
}
function get(map4, key) {
  const value = map4?.get(key);
  if (value != null) {
    return new Ok(value);
  } else {
    return new Error(undefined);
  }
}
function has_key2(map4, key) {
  return map4 && map4.has(key);
}
function insert3(map4, key, value) {
  map4 ??= new Map;
  map4.set(key, value);
  return map4;
}
function remove(map4, key) {
  map4?.delete(key);
  return map4;
}

// build/dev/javascript/lustre/lustre/vdom/path.mjs
class Root extends CustomType {
}

class Key extends CustomType {
  constructor(key, parent) {
    super();
    this.key = key;
    this.parent = parent;
  }
}

class Index extends CustomType {
  constructor(index3, parent) {
    super();
    this.index = index3;
    this.parent = parent;
  }
}
function do_matches(loop$path, loop$candidates) {
  while (true) {
    let path = loop$path;
    let candidates = loop$candidates;
    if (candidates instanceof Empty) {
      return false;
    } else {
      let candidate = candidates.head;
      let rest = candidates.tail;
      let $ = starts_with(path, candidate);
      if ($) {
        return $;
      } else {
        loop$path = path;
        loop$candidates = rest;
      }
    }
  }
}
function add2(parent, index3, key) {
  if (key === "") {
    return new Index(index3, parent);
  } else {
    return new Key(key, parent);
  }
}
var root2 = /* @__PURE__ */ new Root;
var separator_element = "\t";
function do_to_string(loop$path, loop$acc) {
  while (true) {
    let path = loop$path;
    let acc = loop$acc;
    if (path instanceof Root) {
      if (acc instanceof Empty) {
        return "";
      } else {
        let segments = acc.tail;
        return concat2(segments);
      }
    } else if (path instanceof Key) {
      let key = path.key;
      let parent = path.parent;
      loop$path = parent;
      loop$acc = prepend(separator_element, prepend(key, acc));
    } else {
      let index3 = path.index;
      let parent = path.parent;
      loop$path = parent;
      loop$acc = prepend(separator_element, prepend(to_string(index3), acc));
    }
  }
}
function to_string2(path) {
  return do_to_string(path, toList([]));
}
function matches(path, candidates) {
  if (candidates instanceof Empty) {
    return false;
  } else {
    return do_matches(to_string2(path), candidates);
  }
}
var separator_event = `
`;
function event2(path, event3) {
  return do_to_string(path, toList([separator_event, event3]));
}

// build/dev/javascript/lustre/lustre/vdom/vnode.mjs
class Fragment extends CustomType {
  constructor(kind, key, mapper, children, keyed_children) {
    super();
    this.kind = kind;
    this.key = key;
    this.mapper = mapper;
    this.children = children;
    this.keyed_children = keyed_children;
  }
}
class Element2 extends CustomType {
  constructor(kind, key, mapper, namespace, tag, attributes, children, keyed_children, self_closing, void$) {
    super();
    this.kind = kind;
    this.key = key;
    this.mapper = mapper;
    this.namespace = namespace;
    this.tag = tag;
    this.attributes = attributes;
    this.children = children;
    this.keyed_children = keyed_children;
    this.self_closing = self_closing;
    this.void = void$;
  }
}
class Text extends CustomType {
  constructor(kind, key, mapper, content) {
    super();
    this.kind = kind;
    this.key = key;
    this.mapper = mapper;
    this.content = content;
  }
}
class UnsafeInnerHtml extends CustomType {
  constructor(kind, key, mapper, namespace, tag, attributes, inner_html) {
    super();
    this.kind = kind;
    this.key = key;
    this.mapper = mapper;
    this.namespace = namespace;
    this.tag = tag;
    this.attributes = attributes;
    this.inner_html = inner_html;
  }
}
function is_void_html_element(tag, namespace) {
  if (namespace === "") {
    if (tag === "area") {
      return true;
    } else if (tag === "base") {
      return true;
    } else if (tag === "br") {
      return true;
    } else if (tag === "col") {
      return true;
    } else if (tag === "embed") {
      return true;
    } else if (tag === "hr") {
      return true;
    } else if (tag === "img") {
      return true;
    } else if (tag === "input") {
      return true;
    } else if (tag === "link") {
      return true;
    } else if (tag === "meta") {
      return true;
    } else if (tag === "param") {
      return true;
    } else if (tag === "source") {
      return true;
    } else if (tag === "track") {
      return true;
    } else if (tag === "wbr") {
      return true;
    } else {
      return false;
    }
  } else {
    return false;
  }
}
function to_keyed(key, node) {
  if (node instanceof Fragment) {
    return new Fragment(node.kind, key, node.mapper, node.children, node.keyed_children);
  } else if (node instanceof Element2) {
    return new Element2(node.kind, key, node.mapper, node.namespace, node.tag, node.attributes, node.children, node.keyed_children, node.self_closing, node.void);
  } else if (node instanceof Text) {
    return new Text(node.kind, key, node.mapper, node.content);
  } else {
    return new UnsafeInnerHtml(node.kind, key, node.mapper, node.namespace, node.tag, node.attributes, node.inner_html);
  }
}
var fragment_kind = 0;
function fragment(key, mapper, children, keyed_children) {
  return new Fragment(fragment_kind, key, mapper, children, keyed_children);
}
var element_kind = 1;
function element(key, mapper, namespace, tag, attributes, children, keyed_children, self_closing, void$) {
  return new Element2(element_kind, key, mapper, namespace, tag, prepare(attributes), children, keyed_children, self_closing, void$);
}
var text_kind = 2;
function text(key, mapper, content) {
  return new Text(text_kind, key, mapper, content);
}
var unsafe_inner_html_kind = 3;
function unsafe_inner_html(key, mapper, namespace, tag, attributes, inner_html) {
  return new UnsafeInnerHtml(unsafe_inner_html_kind, key, mapper, namespace, tag, prepare(attributes), inner_html);
}
function children_to_string_tree(html, children) {
  return fold(children, html, (html2, child) => {
    let _pipe = child;
    let _pipe$1 = to_string_tree2(_pipe);
    return ((_capture) => {
      return add(html2, _capture);
    })(_pipe$1);
  });
}
function to_string_tree2(node) {
  if (node instanceof Fragment) {
    let children = node.children;
    return children_to_string_tree(new$(), children);
  } else if (node instanceof Element2) {
    let self_closing = node.self_closing;
    if (self_closing) {
      let key = node.key;
      let namespace = node.namespace;
      let tag = node.tag;
      let attributes = node.attributes;
      let html = identity("<" + tag);
      let attributes$1 = to_string_tree(key, namespace, attributes);
      let _pipe = html;
      let _pipe$1 = add(_pipe, attributes$1);
      return append2(_pipe$1, "/>");
    } else {
      let void$ = node.void;
      if (void$) {
        let key = node.key;
        let namespace = node.namespace;
        let tag = node.tag;
        let attributes = node.attributes;
        let html = identity("<" + tag);
        let attributes$1 = to_string_tree(key, namespace, attributes);
        let _pipe = html;
        let _pipe$1 = add(_pipe, attributes$1);
        return append2(_pipe$1, ">");
      } else {
        let key = node.key;
        let namespace = node.namespace;
        let tag = node.tag;
        let attributes = node.attributes;
        let children = node.children;
        let html = identity("<" + tag);
        let attributes$1 = to_string_tree(key, namespace, attributes);
        let _pipe = html;
        let _pipe$1 = add(_pipe, attributes$1);
        let _pipe$2 = append2(_pipe$1, ">");
        let _pipe$3 = children_to_string_tree(_pipe$2, children);
        return append2(_pipe$3, "</" + tag + ">");
      }
    }
  } else if (node instanceof Text) {
    let $ = node.content;
    if ($ === "") {
      return new$();
    } else {
      let content = $;
      return identity(escape2(content));
    }
  } else {
    let key = node.key;
    let namespace = node.namespace;
    let tag = node.tag;
    let attributes = node.attributes;
    let inner_html = node.inner_html;
    let html = identity("<" + tag);
    let attributes$1 = to_string_tree(key, namespace, attributes);
    let _pipe = html;
    let _pipe$1 = add(_pipe, attributes$1);
    let _pipe$2 = append2(_pipe$1, ">");
    let _pipe$3 = append2(_pipe$2, inner_html);
    return append2(_pipe$3, "</" + tag + ">");
  }
}
function to_string3(node) {
  let _pipe = node;
  let _pipe$1 = to_string_tree2(_pipe);
  return identity(_pipe$1);
}

// build/dev/javascript/lustre/lustre/internals/equals.ffi.mjs
var isReferenceEqual = (a, b) => a === b;
var isEqual2 = (a, b) => {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return false;
  }
  const type = typeof a;
  if (type !== typeof b) {
    return false;
  }
  if (type !== "object") {
    return false;
  }
  const ctor = a.constructor;
  if (ctor !== b.constructor) {
    return false;
  }
  if (Array.isArray(a)) {
    return areArraysEqual(a, b);
  }
  return areObjectsEqual(a, b);
};
var areArraysEqual = (a, b) => {
  let index3 = a.length;
  if (index3 !== b.length) {
    return false;
  }
  while (index3--) {
    if (!isEqual2(a[index3], b[index3])) {
      return false;
    }
  }
  return true;
};
var areObjectsEqual = (a, b) => {
  const properties = Object.keys(a);
  let index3 = properties.length;
  if (Object.keys(b).length !== index3) {
    return false;
  }
  while (index3--) {
    const property2 = properties[index3];
    if (!Object.hasOwn(b, property2)) {
      return false;
    }
    if (!isEqual2(a[property2], b[property2])) {
      return false;
    }
  }
  return true;
};

// build/dev/javascript/lustre/lustre/vdom/events.mjs
class Events extends CustomType {
  constructor(handlers, dispatched_paths, next_dispatched_paths) {
    super();
    this.handlers = handlers;
    this.dispatched_paths = dispatched_paths;
    this.next_dispatched_paths = next_dispatched_paths;
  }
}

class DecodedEvent extends CustomType {
  constructor(path, handler) {
    super();
    this.path = path;
    this.handler = handler;
  }
}

class DispatchedEvent extends CustomType {
  constructor(path) {
    super();
    this.path = path;
  }
}
function new$3() {
  return new Events(empty3(), empty_list, empty_list);
}
function tick(events) {
  return new Events(events.handlers, events.next_dispatched_paths, empty_list);
}
function do_remove_event(handlers, path, name) {
  return remove(handlers, event2(path, name));
}
function remove_event(events, path, name) {
  let handlers = do_remove_event(events.handlers, path, name);
  return new Events(handlers, events.dispatched_paths, events.next_dispatched_paths);
}
function remove_attributes(handlers, path, attributes) {
  return fold(attributes, handlers, (events, attribute3) => {
    if (attribute3 instanceof Event2) {
      let name = attribute3.name;
      return do_remove_event(events, path, name);
    } else {
      return events;
    }
  });
}
function decode2(events, path, name, event3) {
  let $ = get(events.handlers, path + separator_event + name);
  if ($ instanceof Ok) {
    let handler = $[0];
    let $1 = run(event3, handler);
    if ($1 instanceof Ok) {
      let handler$1 = $1[0];
      return new DecodedEvent(path, handler$1);
    } else {
      return new DispatchedEvent(path);
    }
  } else {
    return new DispatchedEvent(path);
  }
}
function dispatch(events, event3) {
  let next_dispatched_paths = prepend(event3.path, events.next_dispatched_paths);
  let events$1 = new Events(events.handlers, events.dispatched_paths, next_dispatched_paths);
  if (event3 instanceof DecodedEvent) {
    let handler = event3.handler;
    return [events$1, new Ok(handler)];
  } else {
    return [events$1, new Error(undefined)];
  }
}
function handle(events, path, name, event3) {
  let _pipe = decode2(events, path, name, event3);
  return ((_capture) => {
    return dispatch(events, _capture);
  })(_pipe);
}
function has_dispatched_events(events, path) {
  return matches(path, events.dispatched_paths);
}
function do_add_event(handlers, mapper, path, name, handler) {
  return insert3(handlers, event2(path, name), map2(handler, (handler2) => {
    return new Handler(handler2.prevent_default, handler2.stop_propagation, identity3(mapper)(handler2.message));
  }));
}
function add_event(events, mapper, path, name, handler) {
  let handlers = do_add_event(events.handlers, mapper, path, name, handler);
  return new Events(handlers, events.dispatched_paths, events.next_dispatched_paths);
}
function add_attributes(handlers, mapper, path, attributes) {
  return fold(attributes, handlers, (events, attribute3) => {
    if (attribute3 instanceof Event2) {
      let name = attribute3.name;
      let handler = attribute3.handler;
      return do_add_event(events, mapper, path, name, handler);
    } else {
      return events;
    }
  });
}
function compose_mapper(mapper, child_mapper) {
  let $ = isReferenceEqual(mapper, identity3);
  let $1 = isReferenceEqual(child_mapper, identity3);
  if ($1) {
    return mapper;
  } else if ($) {
    return child_mapper;
  } else {
    return (msg) => {
      return mapper(child_mapper(msg));
    };
  }
}
function do_remove_children(loop$handlers, loop$path, loop$child_index, loop$children) {
  while (true) {
    let handlers = loop$handlers;
    let path = loop$path;
    let child_index = loop$child_index;
    let children = loop$children;
    if (children instanceof Empty) {
      return handlers;
    } else {
      let child = children.head;
      let rest = children.tail;
      let _pipe = handlers;
      let _pipe$1 = do_remove_child(_pipe, path, child_index, child);
      loop$handlers = _pipe$1;
      loop$path = path;
      loop$child_index = child_index + 1;
      loop$children = rest;
    }
  }
}
function do_remove_child(handlers, parent, child_index, child) {
  if (child instanceof Fragment) {
    let children = child.children;
    let path = add2(parent, child_index, child.key);
    return do_remove_children(handlers, path, 0, children);
  } else if (child instanceof Element2) {
    let attributes = child.attributes;
    let children = child.children;
    let path = add2(parent, child_index, child.key);
    let _pipe = handlers;
    let _pipe$1 = remove_attributes(_pipe, path, attributes);
    return do_remove_children(_pipe$1, path, 0, children);
  } else if (child instanceof Text) {
    return handlers;
  } else {
    let attributes = child.attributes;
    let path = add2(parent, child_index, child.key);
    return remove_attributes(handlers, path, attributes);
  }
}
function remove_child(events, parent, child_index, child) {
  let handlers = do_remove_child(events.handlers, parent, child_index, child);
  return new Events(handlers, events.dispatched_paths, events.next_dispatched_paths);
}
function do_add_children(loop$handlers, loop$mapper, loop$path, loop$child_index, loop$children) {
  while (true) {
    let handlers = loop$handlers;
    let mapper = loop$mapper;
    let path = loop$path;
    let child_index = loop$child_index;
    let children = loop$children;
    if (children instanceof Empty) {
      return handlers;
    } else {
      let child = children.head;
      let rest = children.tail;
      let _pipe = handlers;
      let _pipe$1 = do_add_child(_pipe, mapper, path, child_index, child);
      loop$handlers = _pipe$1;
      loop$mapper = mapper;
      loop$path = path;
      loop$child_index = child_index + 1;
      loop$children = rest;
    }
  }
}
function do_add_child(handlers, mapper, parent, child_index, child) {
  if (child instanceof Fragment) {
    let children = child.children;
    let path = add2(parent, child_index, child.key);
    let composed_mapper = compose_mapper(mapper, child.mapper);
    return do_add_children(handlers, composed_mapper, path, 0, children);
  } else if (child instanceof Element2) {
    let attributes = child.attributes;
    let children = child.children;
    let path = add2(parent, child_index, child.key);
    let composed_mapper = compose_mapper(mapper, child.mapper);
    let _pipe = handlers;
    let _pipe$1 = add_attributes(_pipe, composed_mapper, path, attributes);
    return do_add_children(_pipe$1, composed_mapper, path, 0, children);
  } else if (child instanceof Text) {
    return handlers;
  } else {
    let attributes = child.attributes;
    let path = add2(parent, child_index, child.key);
    let composed_mapper = compose_mapper(mapper, child.mapper);
    return add_attributes(handlers, composed_mapper, path, attributes);
  }
}
function add_child(events, mapper, parent, index3, child) {
  let handlers = do_add_child(events.handlers, mapper, parent, index3, child);
  return new Events(handlers, events.dispatched_paths, events.next_dispatched_paths);
}
function from_node(root3) {
  return add_child(new$3(), identity3, root2, 0, root3);
}
function add_children(events, mapper, path, child_index, children) {
  let handlers = do_add_children(events.handlers, mapper, path, child_index, children);
  return new Events(handlers, events.dispatched_paths, events.next_dispatched_paths);
}

// build/dev/javascript/lustre/lustre/element.mjs
function namespaced(namespace, tag, attributes, children) {
  return element("", identity3, namespace, tag, attributes, children, empty3(), false, is_void_html_element(tag, namespace));
}
function text2(content) {
  return text("", identity3, content);
}
function none2() {
  return text("", identity3, "");
}
function unsafe_raw_html(namespace, tag, attributes, inner_html) {
  return unsafe_inner_html("", identity3, namespace, tag, attributes, inner_html);
}
function to_string4(element2) {
  return to_string3(element2);
}

// build/dev/javascript/lustre/lustre/vdom/patch.mjs
class Patch extends CustomType {
  constructor(index3, removed, changes, children) {
    super();
    this.index = index3;
    this.removed = removed;
    this.changes = changes;
    this.children = children;
  }
}
class ReplaceText extends CustomType {
  constructor(kind, content) {
    super();
    this.kind = kind;
    this.content = content;
  }
}
class ReplaceInnerHtml extends CustomType {
  constructor(kind, inner_html) {
    super();
    this.kind = kind;
    this.inner_html = inner_html;
  }
}
class Update extends CustomType {
  constructor(kind, added, removed) {
    super();
    this.kind = kind;
    this.added = added;
    this.removed = removed;
  }
}
class Move extends CustomType {
  constructor(kind, key, before) {
    super();
    this.kind = kind;
    this.key = key;
    this.before = before;
  }
}
class Replace extends CustomType {
  constructor(kind, index3, with$) {
    super();
    this.kind = kind;
    this.index = index3;
    this.with = with$;
  }
}
class Remove extends CustomType {
  constructor(kind, index3) {
    super();
    this.kind = kind;
    this.index = index3;
  }
}
class Insert extends CustomType {
  constructor(kind, children, before) {
    super();
    this.kind = kind;
    this.children = children;
    this.before = before;
  }
}
function new$5(index3, removed, changes, children) {
  return new Patch(index3, removed, changes, children);
}
var replace_text_kind = 0;
function replace_text(content) {
  return new ReplaceText(replace_text_kind, content);
}
var replace_inner_html_kind = 1;
function replace_inner_html(inner_html) {
  return new ReplaceInnerHtml(replace_inner_html_kind, inner_html);
}
var update_kind = 2;
function update(added, removed) {
  return new Update(update_kind, added, removed);
}
var move_kind = 3;
function move(key, before) {
  return new Move(move_kind, key, before);
}
var remove_kind = 4;
function remove2(index3) {
  return new Remove(remove_kind, index3);
}
var replace_kind = 5;
function replace2(index3, with$) {
  return new Replace(replace_kind, index3, with$);
}
var insert_kind = 6;
function insert4(children, before) {
  return new Insert(insert_kind, children, before);
}

// build/dev/javascript/lustre/lustre/runtime/transport.mjs
class Mount extends CustomType {
  constructor(kind, open_shadow_root, will_adopt_styles, observed_attributes, observed_properties, requested_contexts, provided_contexts, vdom) {
    super();
    this.kind = kind;
    this.open_shadow_root = open_shadow_root;
    this.will_adopt_styles = will_adopt_styles;
    this.observed_attributes = observed_attributes;
    this.observed_properties = observed_properties;
    this.requested_contexts = requested_contexts;
    this.provided_contexts = provided_contexts;
    this.vdom = vdom;
  }
}
class Reconcile extends CustomType {
  constructor(kind, patch) {
    super();
    this.kind = kind;
    this.patch = patch;
  }
}
class Emit extends CustomType {
  constructor(kind, name, data) {
    super();
    this.kind = kind;
    this.name = name;
    this.data = data;
  }
}
class Provide extends CustomType {
  constructor(kind, key, value) {
    super();
    this.kind = kind;
    this.key = key;
    this.value = value;
  }
}
class Batch extends CustomType {
  constructor(kind, messages) {
    super();
    this.kind = kind;
    this.messages = messages;
  }
}
class AttributeChanged extends CustomType {
  constructor(kind, name, value) {
    super();
    this.kind = kind;
    this.name = name;
    this.value = value;
  }
}
class PropertyChanged extends CustomType {
  constructor(kind, name, value) {
    super();
    this.kind = kind;
    this.name = name;
    this.value = value;
  }
}
class EventFired extends CustomType {
  constructor(kind, path, name, event3) {
    super();
    this.kind = kind;
    this.path = path;
    this.name = name;
    this.event = event3;
  }
}
class ContextProvided extends CustomType {
  constructor(kind, key, value) {
    super();
    this.kind = kind;
    this.key = key;
    this.value = value;
  }
}
var mount_kind = 0;
function mount(open_shadow_root, will_adopt_styles, observed_attributes, observed_properties, requested_contexts, provided_contexts, vdom) {
  return new Mount(mount_kind, open_shadow_root, will_adopt_styles, observed_attributes, observed_properties, requested_contexts, provided_contexts, vdom);
}
var reconcile_kind = 1;
function reconcile(patch) {
  return new Reconcile(reconcile_kind, patch);
}
var emit_kind = 2;
function emit(name, data) {
  return new Emit(emit_kind, name, data);
}
var provide_kind = 3;
function provide(key, value) {
  return new Provide(provide_kind, key, value);
}

// build/dev/javascript/lustre/lustre/vdom/diff.mjs
class Diff extends CustomType {
  constructor(patch, events) {
    super();
    this.patch = patch;
    this.events = events;
  }
}
class AttributeChange extends CustomType {
  constructor(added, removed, events) {
    super();
    this.added = added;
    this.removed = removed;
    this.events = events;
  }
}
function is_controlled(events, namespace, tag, path) {
  if (tag === "input" && namespace === "") {
    return has_dispatched_events(events, path);
  } else if (tag === "select" && namespace === "") {
    return has_dispatched_events(events, path);
  } else if (tag === "textarea" && namespace === "") {
    return has_dispatched_events(events, path);
  } else {
    return false;
  }
}
function diff_attributes(loop$controlled, loop$path, loop$mapper, loop$events, loop$old, loop$new, loop$added, loop$removed) {
  while (true) {
    let controlled = loop$controlled;
    let path = loop$path;
    let mapper = loop$mapper;
    let events = loop$events;
    let old = loop$old;
    let new$6 = loop$new;
    let added = loop$added;
    let removed = loop$removed;
    if (old instanceof Empty) {
      if (new$6 instanceof Empty) {
        return new AttributeChange(added, removed, events);
      } else {
        let $ = new$6.head;
        if ($ instanceof Event2) {
          let next = $;
          let new$1 = new$6.tail;
          let name = $.name;
          let handler = $.handler;
          let added$1 = prepend(next, added);
          let events$1 = add_event(events, mapper, path, name, handler);
          loop$controlled = controlled;
          loop$path = path;
          loop$mapper = mapper;
          loop$events = events$1;
          loop$old = old;
          loop$new = new$1;
          loop$added = added$1;
          loop$removed = removed;
        } else {
          let next = $;
          let new$1 = new$6.tail;
          let added$1 = prepend(next, added);
          loop$controlled = controlled;
          loop$path = path;
          loop$mapper = mapper;
          loop$events = events;
          loop$old = old;
          loop$new = new$1;
          loop$added = added$1;
          loop$removed = removed;
        }
      }
    } else if (new$6 instanceof Empty) {
      let $ = old.head;
      if ($ instanceof Event2) {
        let prev = $;
        let old$1 = old.tail;
        let name = $.name;
        let removed$1 = prepend(prev, removed);
        let events$1 = remove_event(events, path, name);
        loop$controlled = controlled;
        loop$path = path;
        loop$mapper = mapper;
        loop$events = events$1;
        loop$old = old$1;
        loop$new = new$6;
        loop$added = added;
        loop$removed = removed$1;
      } else {
        let prev = $;
        let old$1 = old.tail;
        let removed$1 = prepend(prev, removed);
        loop$controlled = controlled;
        loop$path = path;
        loop$mapper = mapper;
        loop$events = events;
        loop$old = old$1;
        loop$new = new$6;
        loop$added = added;
        loop$removed = removed$1;
      }
    } else {
      let prev = old.head;
      let remaining_old = old.tail;
      let next = new$6.head;
      let remaining_new = new$6.tail;
      let $ = compare3(prev, next);
      if ($ instanceof Lt) {
        if (prev instanceof Event2) {
          let name = prev.name;
          let removed$1 = prepend(prev, removed);
          let events$1 = remove_event(events, path, name);
          loop$controlled = controlled;
          loop$path = path;
          loop$mapper = mapper;
          loop$events = events$1;
          loop$old = remaining_old;
          loop$new = new$6;
          loop$added = added;
          loop$removed = removed$1;
        } else {
          let removed$1 = prepend(prev, removed);
          loop$controlled = controlled;
          loop$path = path;
          loop$mapper = mapper;
          loop$events = events;
          loop$old = remaining_old;
          loop$new = new$6;
          loop$added = added;
          loop$removed = removed$1;
        }
      } else if ($ instanceof Eq) {
        if (prev instanceof Attribute) {
          if (next instanceof Attribute) {
            let _block;
            let $1 = next.name;
            if ($1 === "value") {
              _block = controlled || prev.value !== next.value;
            } else if ($1 === "checked") {
              _block = controlled || prev.value !== next.value;
            } else if ($1 === "selected") {
              _block = controlled || prev.value !== next.value;
            } else {
              _block = prev.value !== next.value;
            }
            let has_changes = _block;
            let _block$1;
            if (has_changes) {
              _block$1 = prepend(next, added);
            } else {
              _block$1 = added;
            }
            let added$1 = _block$1;
            loop$controlled = controlled;
            loop$path = path;
            loop$mapper = mapper;
            loop$events = events;
            loop$old = remaining_old;
            loop$new = remaining_new;
            loop$added = added$1;
            loop$removed = removed;
          } else if (next instanceof Event2) {
            let name = next.name;
            let handler = next.handler;
            let added$1 = prepend(next, added);
            let removed$1 = prepend(prev, removed);
            let events$1 = add_event(events, mapper, path, name, handler);
            loop$controlled = controlled;
            loop$path = path;
            loop$mapper = mapper;
            loop$events = events$1;
            loop$old = remaining_old;
            loop$new = remaining_new;
            loop$added = added$1;
            loop$removed = removed$1;
          } else {
            let added$1 = prepend(next, added);
            let removed$1 = prepend(prev, removed);
            loop$controlled = controlled;
            loop$path = path;
            loop$mapper = mapper;
            loop$events = events;
            loop$old = remaining_old;
            loop$new = remaining_new;
            loop$added = added$1;
            loop$removed = removed$1;
          }
        } else if (prev instanceof Property) {
          if (next instanceof Property) {
            let _block;
            let $1 = next.name;
            if ($1 === "scrollLeft") {
              _block = true;
            } else if ($1 === "scrollRight") {
              _block = true;
            } else if ($1 === "value") {
              _block = controlled || !isEqual2(prev.value, next.value);
            } else if ($1 === "checked") {
              _block = controlled || !isEqual2(prev.value, next.value);
            } else if ($1 === "selected") {
              _block = controlled || !isEqual2(prev.value, next.value);
            } else {
              _block = !isEqual2(prev.value, next.value);
            }
            let has_changes = _block;
            let _block$1;
            if (has_changes) {
              _block$1 = prepend(next, added);
            } else {
              _block$1 = added;
            }
            let added$1 = _block$1;
            loop$controlled = controlled;
            loop$path = path;
            loop$mapper = mapper;
            loop$events = events;
            loop$old = remaining_old;
            loop$new = remaining_new;
            loop$added = added$1;
            loop$removed = removed;
          } else if (next instanceof Event2) {
            let name = next.name;
            let handler = next.handler;
            let added$1 = prepend(next, added);
            let removed$1 = prepend(prev, removed);
            let events$1 = add_event(events, mapper, path, name, handler);
            loop$controlled = controlled;
            loop$path = path;
            loop$mapper = mapper;
            loop$events = events$1;
            loop$old = remaining_old;
            loop$new = remaining_new;
            loop$added = added$1;
            loop$removed = removed$1;
          } else {
            let added$1 = prepend(next, added);
            let removed$1 = prepend(prev, removed);
            loop$controlled = controlled;
            loop$path = path;
            loop$mapper = mapper;
            loop$events = events;
            loop$old = remaining_old;
            loop$new = remaining_new;
            loop$added = added$1;
            loop$removed = removed$1;
          }
        } else if (next instanceof Event2) {
          let name = next.name;
          let handler = next.handler;
          let has_changes = prev.prevent_default.kind !== next.prevent_default.kind || prev.stop_propagation.kind !== next.stop_propagation.kind || prev.debounce !== next.debounce || prev.throttle !== next.throttle;
          let _block;
          if (has_changes) {
            _block = prepend(next, added);
          } else {
            _block = added;
          }
          let added$1 = _block;
          let events$1 = add_event(events, mapper, path, name, handler);
          loop$controlled = controlled;
          loop$path = path;
          loop$mapper = mapper;
          loop$events = events$1;
          loop$old = remaining_old;
          loop$new = remaining_new;
          loop$added = added$1;
          loop$removed = removed;
        } else {
          let name = prev.name;
          let added$1 = prepend(next, added);
          let removed$1 = prepend(prev, removed);
          let events$1 = remove_event(events, path, name);
          loop$controlled = controlled;
          loop$path = path;
          loop$mapper = mapper;
          loop$events = events$1;
          loop$old = remaining_old;
          loop$new = remaining_new;
          loop$added = added$1;
          loop$removed = removed$1;
        }
      } else if (next instanceof Event2) {
        let name = next.name;
        let handler = next.handler;
        let added$1 = prepend(next, added);
        let events$1 = add_event(events, mapper, path, name, handler);
        loop$controlled = controlled;
        loop$path = path;
        loop$mapper = mapper;
        loop$events = events$1;
        loop$old = old;
        loop$new = remaining_new;
        loop$added = added$1;
        loop$removed = removed;
      } else {
        let added$1 = prepend(next, added);
        loop$controlled = controlled;
        loop$path = path;
        loop$mapper = mapper;
        loop$events = events;
        loop$old = old;
        loop$new = remaining_new;
        loop$added = added$1;
        loop$removed = removed;
      }
    }
  }
}
function do_diff(loop$old, loop$old_keyed, loop$new, loop$new_keyed, loop$moved, loop$moved_offset, loop$removed, loop$node_index, loop$patch_index, loop$path, loop$changes, loop$children, loop$mapper, loop$events) {
  while (true) {
    let old = loop$old;
    let old_keyed = loop$old_keyed;
    let new$6 = loop$new;
    let new_keyed = loop$new_keyed;
    let moved = loop$moved;
    let moved_offset = loop$moved_offset;
    let removed = loop$removed;
    let node_index = loop$node_index;
    let patch_index = loop$patch_index;
    let path = loop$path;
    let changes = loop$changes;
    let children = loop$children;
    let mapper = loop$mapper;
    let events = loop$events;
    if (old instanceof Empty) {
      if (new$6 instanceof Empty) {
        return new Diff(new Patch(patch_index, removed, changes, children), events);
      } else {
        let events$1 = add_children(events, mapper, path, node_index, new$6);
        let insert5 = insert4(new$6, node_index - moved_offset);
        let changes$1 = prepend(insert5, changes);
        return new Diff(new Patch(patch_index, removed, changes$1, children), events$1);
      }
    } else if (new$6 instanceof Empty) {
      let prev = old.head;
      let old$1 = old.tail;
      let _block;
      let $ = prev.key === "" || !has_key2(moved, prev.key);
      if ($) {
        _block = removed + 1;
      } else {
        _block = removed;
      }
      let removed$1 = _block;
      let events$1 = remove_child(events, path, node_index, prev);
      loop$old = old$1;
      loop$old_keyed = old_keyed;
      loop$new = new$6;
      loop$new_keyed = new_keyed;
      loop$moved = moved;
      loop$moved_offset = moved_offset;
      loop$removed = removed$1;
      loop$node_index = node_index;
      loop$patch_index = patch_index;
      loop$path = path;
      loop$changes = changes;
      loop$children = children;
      loop$mapper = mapper;
      loop$events = events$1;
    } else {
      let prev = old.head;
      let next = new$6.head;
      if (prev.key !== next.key) {
        let old_remaining = old.tail;
        let new_remaining = new$6.tail;
        let next_did_exist = get(old_keyed, next.key);
        let prev_does_exist = has_key2(new_keyed, prev.key);
        if (prev_does_exist) {
          if (next_did_exist instanceof Ok) {
            let match = next_did_exist[0];
            let $ = has_key2(moved, prev.key);
            if ($) {
              loop$old = old_remaining;
              loop$old_keyed = old_keyed;
              loop$new = new$6;
              loop$new_keyed = new_keyed;
              loop$moved = moved;
              loop$moved_offset = moved_offset - 1;
              loop$removed = removed;
              loop$node_index = node_index;
              loop$patch_index = patch_index;
              loop$path = path;
              loop$changes = changes;
              loop$children = children;
              loop$mapper = mapper;
              loop$events = events;
            } else {
              let before = node_index - moved_offset;
              let changes$1 = prepend(move(next.key, before), changes);
              let moved$1 = insert3(moved, next.key, undefined);
              let moved_offset$1 = moved_offset + 1;
              loop$old = prepend(match, old);
              loop$old_keyed = old_keyed;
              loop$new = new$6;
              loop$new_keyed = new_keyed;
              loop$moved = moved$1;
              loop$moved_offset = moved_offset$1;
              loop$removed = removed;
              loop$node_index = node_index;
              loop$patch_index = patch_index;
              loop$path = path;
              loop$changes = changes$1;
              loop$children = children;
              loop$mapper = mapper;
              loop$events = events;
            }
          } else {
            let before = node_index - moved_offset;
            let events$1 = add_child(events, mapper, path, node_index, next);
            let insert5 = insert4(toList([next]), before);
            let changes$1 = prepend(insert5, changes);
            loop$old = old;
            loop$old_keyed = old_keyed;
            loop$new = new_remaining;
            loop$new_keyed = new_keyed;
            loop$moved = moved;
            loop$moved_offset = moved_offset + 1;
            loop$removed = removed;
            loop$node_index = node_index + 1;
            loop$patch_index = patch_index;
            loop$path = path;
            loop$changes = changes$1;
            loop$children = children;
            loop$mapper = mapper;
            loop$events = events$1;
          }
        } else if (next_did_exist instanceof Ok) {
          let index3 = node_index - moved_offset;
          let changes$1 = prepend(remove2(index3), changes);
          let events$1 = remove_child(events, path, node_index, prev);
          let moved_offset$1 = moved_offset - 1;
          loop$old = old_remaining;
          loop$old_keyed = old_keyed;
          loop$new = new$6;
          loop$new_keyed = new_keyed;
          loop$moved = moved;
          loop$moved_offset = moved_offset$1;
          loop$removed = removed;
          loop$node_index = node_index;
          loop$patch_index = patch_index;
          loop$path = path;
          loop$changes = changes$1;
          loop$children = children;
          loop$mapper = mapper;
          loop$events = events$1;
        } else {
          let change = replace2(node_index - moved_offset, next);
          let _block;
          let _pipe = events;
          let _pipe$1 = remove_child(_pipe, path, node_index, prev);
          _block = add_child(_pipe$1, mapper, path, node_index, next);
          let events$1 = _block;
          loop$old = old_remaining;
          loop$old_keyed = old_keyed;
          loop$new = new_remaining;
          loop$new_keyed = new_keyed;
          loop$moved = moved;
          loop$moved_offset = moved_offset;
          loop$removed = removed;
          loop$node_index = node_index + 1;
          loop$patch_index = patch_index;
          loop$path = path;
          loop$changes = prepend(change, changes);
          loop$children = children;
          loop$mapper = mapper;
          loop$events = events$1;
        }
      } else {
        let $ = old.head;
        if ($ instanceof Fragment) {
          let $1 = new$6.head;
          if ($1 instanceof Fragment) {
            let prev$1 = $;
            let old$1 = old.tail;
            let next$1 = $1;
            let new$1 = new$6.tail;
            let composed_mapper = compose_mapper(mapper, next$1.mapper);
            let child_path = add2(path, node_index, next$1.key);
            let child = do_diff(prev$1.children, prev$1.keyed_children, next$1.children, next$1.keyed_children, empty3(), 0, 0, 0, node_index, child_path, empty_list, empty_list, composed_mapper, events);
            let _block;
            let $2 = child.patch;
            let $3 = $2.changes;
            if ($3 instanceof Empty) {
              let $4 = $2.children;
              if ($4 instanceof Empty) {
                let $5 = $2.removed;
                if ($5 === 0) {
                  _block = children;
                } else {
                  _block = prepend(child.patch, children);
                }
              } else {
                _block = prepend(child.patch, children);
              }
            } else {
              _block = prepend(child.patch, children);
            }
            let children$1 = _block;
            loop$old = old$1;
            loop$old_keyed = old_keyed;
            loop$new = new$1;
            loop$new_keyed = new_keyed;
            loop$moved = moved;
            loop$moved_offset = moved_offset;
            loop$removed = removed;
            loop$node_index = node_index + 1;
            loop$patch_index = patch_index;
            loop$path = path;
            loop$changes = changes;
            loop$children = children$1;
            loop$mapper = mapper;
            loop$events = child.events;
          } else {
            let prev$1 = $;
            let old_remaining = old.tail;
            let next$1 = $1;
            let new_remaining = new$6.tail;
            let change = replace2(node_index - moved_offset, next$1);
            let _block;
            let _pipe = events;
            let _pipe$1 = remove_child(_pipe, path, node_index, prev$1);
            _block = add_child(_pipe$1, mapper, path, node_index, next$1);
            let events$1 = _block;
            loop$old = old_remaining;
            loop$old_keyed = old_keyed;
            loop$new = new_remaining;
            loop$new_keyed = new_keyed;
            loop$moved = moved;
            loop$moved_offset = moved_offset;
            loop$removed = removed;
            loop$node_index = node_index + 1;
            loop$patch_index = patch_index;
            loop$path = path;
            loop$changes = prepend(change, changes);
            loop$children = children;
            loop$mapper = mapper;
            loop$events = events$1;
          }
        } else if ($ instanceof Element2) {
          let $1 = new$6.head;
          if ($1 instanceof Element2) {
            let prev$1 = $;
            let next$1 = $1;
            if (prev$1.namespace === next$1.namespace && prev$1.tag === next$1.tag) {
              let old$1 = old.tail;
              let new$1 = new$6.tail;
              let composed_mapper = compose_mapper(mapper, next$1.mapper);
              let child_path = add2(path, node_index, next$1.key);
              let controlled = is_controlled(events, next$1.namespace, next$1.tag, child_path);
              let $2 = diff_attributes(controlled, child_path, composed_mapper, events, prev$1.attributes, next$1.attributes, empty_list, empty_list);
              let added_attrs;
              let removed_attrs;
              let events$1;
              added_attrs = $2.added;
              removed_attrs = $2.removed;
              events$1 = $2.events;
              let _block;
              if (added_attrs instanceof Empty && removed_attrs instanceof Empty) {
                _block = empty_list;
              } else {
                _block = toList([update(added_attrs, removed_attrs)]);
              }
              let initial_child_changes = _block;
              let child = do_diff(prev$1.children, prev$1.keyed_children, next$1.children, next$1.keyed_children, empty3(), 0, 0, 0, node_index, child_path, initial_child_changes, empty_list, composed_mapper, events$1);
              let _block$1;
              let $3 = child.patch;
              let $4 = $3.changes;
              if ($4 instanceof Empty) {
                let $5 = $3.children;
                if ($5 instanceof Empty) {
                  let $6 = $3.removed;
                  if ($6 === 0) {
                    _block$1 = children;
                  } else {
                    _block$1 = prepend(child.patch, children);
                  }
                } else {
                  _block$1 = prepend(child.patch, children);
                }
              } else {
                _block$1 = prepend(child.patch, children);
              }
              let children$1 = _block$1;
              loop$old = old$1;
              loop$old_keyed = old_keyed;
              loop$new = new$1;
              loop$new_keyed = new_keyed;
              loop$moved = moved;
              loop$moved_offset = moved_offset;
              loop$removed = removed;
              loop$node_index = node_index + 1;
              loop$patch_index = patch_index;
              loop$path = path;
              loop$changes = changes;
              loop$children = children$1;
              loop$mapper = mapper;
              loop$events = child.events;
            } else {
              let prev$2 = $;
              let old_remaining = old.tail;
              let next$2 = $1;
              let new_remaining = new$6.tail;
              let change = replace2(node_index - moved_offset, next$2);
              let _block;
              let _pipe = events;
              let _pipe$1 = remove_child(_pipe, path, node_index, prev$2);
              _block = add_child(_pipe$1, mapper, path, node_index, next$2);
              let events$1 = _block;
              loop$old = old_remaining;
              loop$old_keyed = old_keyed;
              loop$new = new_remaining;
              loop$new_keyed = new_keyed;
              loop$moved = moved;
              loop$moved_offset = moved_offset;
              loop$removed = removed;
              loop$node_index = node_index + 1;
              loop$patch_index = patch_index;
              loop$path = path;
              loop$changes = prepend(change, changes);
              loop$children = children;
              loop$mapper = mapper;
              loop$events = events$1;
            }
          } else {
            let prev$1 = $;
            let old_remaining = old.tail;
            let next$1 = $1;
            let new_remaining = new$6.tail;
            let change = replace2(node_index - moved_offset, next$1);
            let _block;
            let _pipe = events;
            let _pipe$1 = remove_child(_pipe, path, node_index, prev$1);
            _block = add_child(_pipe$1, mapper, path, node_index, next$1);
            let events$1 = _block;
            loop$old = old_remaining;
            loop$old_keyed = old_keyed;
            loop$new = new_remaining;
            loop$new_keyed = new_keyed;
            loop$moved = moved;
            loop$moved_offset = moved_offset;
            loop$removed = removed;
            loop$node_index = node_index + 1;
            loop$patch_index = patch_index;
            loop$path = path;
            loop$changes = prepend(change, changes);
            loop$children = children;
            loop$mapper = mapper;
            loop$events = events$1;
          }
        } else if ($ instanceof Text) {
          let $1 = new$6.head;
          if ($1 instanceof Text) {
            let prev$1 = $;
            let next$1 = $1;
            if (prev$1.content === next$1.content) {
              let old$1 = old.tail;
              let new$1 = new$6.tail;
              loop$old = old$1;
              loop$old_keyed = old_keyed;
              loop$new = new$1;
              loop$new_keyed = new_keyed;
              loop$moved = moved;
              loop$moved_offset = moved_offset;
              loop$removed = removed;
              loop$node_index = node_index + 1;
              loop$patch_index = patch_index;
              loop$path = path;
              loop$changes = changes;
              loop$children = children;
              loop$mapper = mapper;
              loop$events = events;
            } else {
              let old$1 = old.tail;
              let next$2 = $1;
              let new$1 = new$6.tail;
              let child = new$5(node_index, 0, toList([replace_text(next$2.content)]), empty_list);
              loop$old = old$1;
              loop$old_keyed = old_keyed;
              loop$new = new$1;
              loop$new_keyed = new_keyed;
              loop$moved = moved;
              loop$moved_offset = moved_offset;
              loop$removed = removed;
              loop$node_index = node_index + 1;
              loop$patch_index = patch_index;
              loop$path = path;
              loop$changes = changes;
              loop$children = prepend(child, children);
              loop$mapper = mapper;
              loop$events = events;
            }
          } else {
            let prev$1 = $;
            let old_remaining = old.tail;
            let next$1 = $1;
            let new_remaining = new$6.tail;
            let change = replace2(node_index - moved_offset, next$1);
            let _block;
            let _pipe = events;
            let _pipe$1 = remove_child(_pipe, path, node_index, prev$1);
            _block = add_child(_pipe$1, mapper, path, node_index, next$1);
            let events$1 = _block;
            loop$old = old_remaining;
            loop$old_keyed = old_keyed;
            loop$new = new_remaining;
            loop$new_keyed = new_keyed;
            loop$moved = moved;
            loop$moved_offset = moved_offset;
            loop$removed = removed;
            loop$node_index = node_index + 1;
            loop$patch_index = patch_index;
            loop$path = path;
            loop$changes = prepend(change, changes);
            loop$children = children;
            loop$mapper = mapper;
            loop$events = events$1;
          }
        } else {
          let $1 = new$6.head;
          if ($1 instanceof UnsafeInnerHtml) {
            let prev$1 = $;
            let old$1 = old.tail;
            let next$1 = $1;
            let new$1 = new$6.tail;
            let composed_mapper = compose_mapper(mapper, next$1.mapper);
            let child_path = add2(path, node_index, next$1.key);
            let $2 = diff_attributes(false, child_path, composed_mapper, events, prev$1.attributes, next$1.attributes, empty_list, empty_list);
            let added_attrs;
            let removed_attrs;
            let events$1;
            added_attrs = $2.added;
            removed_attrs = $2.removed;
            events$1 = $2.events;
            let _block;
            if (added_attrs instanceof Empty && removed_attrs instanceof Empty) {
              _block = empty_list;
            } else {
              _block = toList([update(added_attrs, removed_attrs)]);
            }
            let child_changes = _block;
            let _block$1;
            let $3 = prev$1.inner_html === next$1.inner_html;
            if ($3) {
              _block$1 = child_changes;
            } else {
              _block$1 = prepend(replace_inner_html(next$1.inner_html), child_changes);
            }
            let child_changes$1 = _block$1;
            let _block$2;
            if (child_changes$1 instanceof Empty) {
              _block$2 = children;
            } else {
              _block$2 = prepend(new$5(node_index, 0, child_changes$1, toList([])), children);
            }
            let children$1 = _block$2;
            loop$old = old$1;
            loop$old_keyed = old_keyed;
            loop$new = new$1;
            loop$new_keyed = new_keyed;
            loop$moved = moved;
            loop$moved_offset = moved_offset;
            loop$removed = removed;
            loop$node_index = node_index + 1;
            loop$patch_index = patch_index;
            loop$path = path;
            loop$changes = changes;
            loop$children = children$1;
            loop$mapper = mapper;
            loop$events = events$1;
          } else {
            let prev$1 = $;
            let old_remaining = old.tail;
            let next$1 = $1;
            let new_remaining = new$6.tail;
            let change = replace2(node_index - moved_offset, next$1);
            let _block;
            let _pipe = events;
            let _pipe$1 = remove_child(_pipe, path, node_index, prev$1);
            _block = add_child(_pipe$1, mapper, path, node_index, next$1);
            let events$1 = _block;
            loop$old = old_remaining;
            loop$old_keyed = old_keyed;
            loop$new = new_remaining;
            loop$new_keyed = new_keyed;
            loop$moved = moved;
            loop$moved_offset = moved_offset;
            loop$removed = removed;
            loop$node_index = node_index + 1;
            loop$patch_index = patch_index;
            loop$path = path;
            loop$changes = prepend(change, changes);
            loop$children = children;
            loop$mapper = mapper;
            loop$events = events$1;
          }
        }
      }
    }
  }
}
function diff(events, old, new$6) {
  return do_diff(toList([old]), empty3(), toList([new$6]), empty3(), empty3(), 0, 0, 0, 0, root2, empty_list, empty_list, identity3, tick(events));
}

// build/dev/javascript/lustre/lustre/vdom/reconciler.ffi.mjs
var setTimeout = globalThis.setTimeout;
var clearTimeout = globalThis.clearTimeout;
var createElementNS = (ns, name) => document2().createElementNS(ns, name);
var createTextNode = (data) => document2().createTextNode(data);
var createDocumentFragment = () => document2().createDocumentFragment();
var insertBefore = (parent, node, reference) => parent.insertBefore(node, reference);
var moveBefore = SUPPORTS_MOVE_BEFORE ? (parent, node, reference) => parent.moveBefore(node, reference) : insertBefore;
var removeChild = (parent, child) => parent.removeChild(child);
var getAttribute = (node, name) => node.getAttribute(name);
var setAttribute = (node, name, value) => node.setAttribute(name, value);
var removeAttribute = (node, name) => node.removeAttribute(name);
var addEventListener = (node, name, handler, options) => node.addEventListener(name, handler, options);
var removeEventListener = (node, name, handler) => node.removeEventListener(name, handler);
var setInnerHtml = (node, innerHtml) => node.innerHTML = innerHtml;
var setData = (node, data) => node.data = data;
var meta = Symbol("lustre");

class MetadataNode {
  constructor(kind, parent, node, key) {
    this.kind = kind;
    this.key = key;
    this.parent = parent;
    this.children = [];
    this.node = node;
    this.handlers = new Map;
    this.throttles = new Map;
    this.debouncers = new Map;
  }
  get parentNode() {
    return this.kind === fragment_kind ? this.node.parentNode : this.node;
  }
}
var insertMetadataChild = (kind, parent, node, index3, key) => {
  const child = new MetadataNode(kind, parent, node, key);
  node[meta] = child;
  parent?.children.splice(index3, 0, child);
  return child;
};
var getPath = (node) => {
  let path = "";
  for (let current = node[meta];current.parent; current = current.parent) {
    if (current.key) {
      path = `${separator_element}${current.key}${path}`;
    } else {
      const index3 = current.parent.children.indexOf(current);
      path = `${separator_element}${index3}${path}`;
    }
  }
  return path.slice(1);
};

class Reconciler {
  #root = null;
  #decodeEvent;
  #dispatch;
  #exposeKeys = false;
  constructor(root3, decodeEvent, dispatch2, { exposeKeys = false } = {}) {
    this.#root = root3;
    this.#decodeEvent = decodeEvent;
    this.#dispatch = dispatch2;
    this.#exposeKeys = exposeKeys;
  }
  mount(vdom) {
    insertMetadataChild(element_kind, null, this.#root, 0, null);
    this.#insertChild(this.#root, null, this.#root[meta], 0, vdom);
  }
  push(patch) {
    this.#stack.push({ node: this.#root[meta], patch });
    this.#reconcile();
  }
  #stack = [];
  #reconcile() {
    const stack = this.#stack;
    while (stack.length) {
      const { node, patch } = stack.pop();
      const { children: childNodes } = node;
      const { changes, removed, children: childPatches } = patch;
      iterate(changes, (change) => this.#patch(node, change));
      if (removed) {
        this.#removeChildren(node, childNodes.length - removed, removed);
      }
      iterate(childPatches, (childPatch) => {
        const child = childNodes[childPatch.index | 0];
        this.#stack.push({ node: child, patch: childPatch });
      });
    }
  }
  #patch(node, change) {
    switch (change.kind) {
      case replace_text_kind:
        this.#replaceText(node, change);
        break;
      case replace_inner_html_kind:
        this.#replaceInnerHtml(node, change);
        break;
      case update_kind:
        this.#update(node, change);
        break;
      case move_kind:
        this.#move(node, change);
        break;
      case remove_kind:
        this.#remove(node, change);
        break;
      case replace_kind:
        this.#replace(node, change);
        break;
      case insert_kind:
        this.#insert(node, change);
        break;
    }
  }
  #insert(parent, { children, before }) {
    const fragment2 = createDocumentFragment();
    const beforeEl = this.#getReference(parent, before);
    this.#insertChildren(fragment2, null, parent, before | 0, children);
    insertBefore(parent.parentNode, fragment2, beforeEl);
  }
  #replace(parent, { index: index3, with: child }) {
    this.#removeChildren(parent, index3 | 0, 1);
    const beforeEl = this.#getReference(parent, index3);
    this.#insertChild(parent.parentNode, beforeEl, parent, index3 | 0, child);
  }
  #getReference(node, index3) {
    index3 = index3 | 0;
    const { children } = node;
    const childCount = children.length;
    if (index3 < childCount) {
      return children[index3].node;
    }
    let lastChild = children[childCount - 1];
    if (!lastChild && node.kind !== fragment_kind)
      return null;
    if (!lastChild)
      lastChild = node;
    while (lastChild.kind === fragment_kind && lastChild.children.length) {
      lastChild = lastChild.children[lastChild.children.length - 1];
    }
    return lastChild.node.nextSibling;
  }
  #move(parent, { key, before }) {
    before = before | 0;
    const { children, parentNode } = parent;
    const beforeEl = children[before].node;
    let prev = children[before];
    for (let i = before + 1;i < children.length; ++i) {
      const next = children[i];
      children[i] = prev;
      prev = next;
      if (next.key === key) {
        children[before] = next;
        break;
      }
    }
    const { kind, node, children: prevChildren } = prev;
    moveBefore(parentNode, node, beforeEl);
    if (kind === fragment_kind) {
      this.#moveChildren(parentNode, prevChildren, beforeEl);
    }
  }
  #moveChildren(domParent, children, beforeEl) {
    for (let i = 0;i < children.length; ++i) {
      const { kind, node, children: nestedChildren } = children[i];
      moveBefore(domParent, node, beforeEl);
      if (kind === fragment_kind) {
        this.#moveChildren(domParent, nestedChildren, beforeEl);
      }
    }
  }
  #remove(parent, { index: index3 }) {
    this.#removeChildren(parent, index3, 1);
  }
  #removeChildren(parent, index3, count) {
    const { children, parentNode } = parent;
    const deleted = children.splice(index3, count);
    for (let i = 0;i < deleted.length; ++i) {
      const { kind, node, children: nestedChildren } = deleted[i];
      removeChild(parentNode, node);
      this.#removeDebouncers(deleted[i]);
      if (kind === fragment_kind) {
        deleted.push(...nestedChildren);
      }
    }
  }
  #removeDebouncers(node) {
    const { debouncers, children } = node;
    for (const { timeout } of debouncers.values()) {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
    debouncers.clear();
    iterate(children, (child) => this.#removeDebouncers(child));
  }
  #update({ node, handlers, throttles, debouncers }, { added, removed }) {
    iterate(removed, ({ name }) => {
      if (handlers.delete(name)) {
        removeEventListener(node, name, handleEvent);
        this.#updateDebounceThrottle(throttles, name, 0);
        this.#updateDebounceThrottle(debouncers, name, 0);
      } else {
        removeAttribute(node, name);
        SYNCED_ATTRIBUTES[name]?.removed?.(node, name);
      }
    });
    iterate(added, (attribute3) => this.#createAttribute(node, attribute3));
  }
  #replaceText({ node }, { content }) {
    setData(node, content ?? "");
  }
  #replaceInnerHtml({ node }, { inner_html }) {
    setInnerHtml(node, inner_html ?? "");
  }
  #insertChildren(domParent, beforeEl, metaParent, index3, children) {
    iterate(children, (child) => this.#insertChild(domParent, beforeEl, metaParent, index3++, child));
  }
  #insertChild(domParent, beforeEl, metaParent, index3, vnode) {
    switch (vnode.kind) {
      case element_kind: {
        const node = this.#createElement(metaParent, index3, vnode);
        this.#insertChildren(node, null, node[meta], 0, vnode.children);
        insertBefore(domParent, node, beforeEl);
        break;
      }
      case text_kind: {
        const node = this.#createTextNode(metaParent, index3, vnode);
        insertBefore(domParent, node, beforeEl);
        break;
      }
      case fragment_kind: {
        const head = this.#createTextNode(metaParent, index3, vnode);
        insertBefore(domParent, head, beforeEl);
        this.#insertChildren(domParent, beforeEl, head[meta], 0, vnode.children);
        break;
      }
      case unsafe_inner_html_kind: {
        const node = this.#createElement(metaParent, index3, vnode);
        this.#replaceInnerHtml({ node }, vnode);
        insertBefore(domParent, node, beforeEl);
        break;
      }
    }
  }
  #createElement(parent, index3, { kind, key, tag, namespace, attributes }) {
    const node = createElementNS(namespace || NAMESPACE_HTML, tag);
    insertMetadataChild(kind, parent, node, index3, key);
    if (this.#exposeKeys && key) {
      setAttribute(node, "data-lustre-key", key);
    }
    iterate(attributes, (attribute3) => this.#createAttribute(node, attribute3));
    return node;
  }
  #createTextNode(parent, index3, { kind, key, content }) {
    const node = createTextNode(content ?? "");
    insertMetadataChild(kind, parent, node, index3, key);
    return node;
  }
  #createAttribute(node, attribute3) {
    const { debouncers, handlers, throttles } = node[meta];
    const {
      kind,
      name,
      value,
      prevent_default: prevent,
      debounce: debounceDelay,
      throttle: throttleDelay
    } = attribute3;
    switch (kind) {
      case attribute_kind: {
        const valueOrDefault = value ?? "";
        if (name === "virtual:defaultValue") {
          node.defaultValue = valueOrDefault;
          return;
        } else if (name === "virtual:defaultChecked") {
          node.defaultChecked = true;
          return;
        } else if (name === "virtual:defaultSelected") {
          node.defaultSelected = true;
          return;
        }
        if (valueOrDefault !== getAttribute(node, name)) {
          setAttribute(node, name, valueOrDefault);
        }
        SYNCED_ATTRIBUTES[name]?.added?.(node, valueOrDefault);
        break;
      }
      case property_kind:
        node[name] = value;
        break;
      case event_kind: {
        if (handlers.has(name)) {
          removeEventListener(node, name, handleEvent);
        }
        const passive = prevent.kind === never_kind;
        addEventListener(node, name, handleEvent, { passive });
        this.#updateDebounceThrottle(throttles, name, throttleDelay);
        this.#updateDebounceThrottle(debouncers, name, debounceDelay);
        handlers.set(name, (event3) => this.#handleEvent(attribute3, event3));
        break;
      }
    }
  }
  #updateDebounceThrottle(map4, name, delay) {
    const debounceOrThrottle = map4.get(name);
    if (delay > 0) {
      if (debounceOrThrottle) {
        debounceOrThrottle.delay = delay;
      } else {
        map4.set(name, { delay });
      }
    } else if (debounceOrThrottle) {
      const { timeout } = debounceOrThrottle;
      if (timeout) {
        clearTimeout(timeout);
      }
      map4.delete(name);
    }
  }
  #handleEvent(attribute3, event3) {
    const { currentTarget, type } = event3;
    const { debouncers, throttles } = currentTarget[meta];
    const path = getPath(currentTarget);
    const {
      prevent_default: prevent,
      stop_propagation: stop,
      include
    } = attribute3;
    if (prevent.kind === always_kind)
      event3.preventDefault();
    if (stop.kind === always_kind)
      event3.stopPropagation();
    if (type === "submit") {
      event3.detail ??= {};
      event3.detail.formData = [
        ...new FormData(event3.target, event3.submitter).entries()
      ];
    }
    const data = this.#decodeEvent(event3, path, type, include);
    const throttle = throttles.get(type);
    if (throttle) {
      const now = Date.now();
      const last2 = throttle.last || 0;
      if (now > last2 + throttle.delay) {
        throttle.last = now;
        throttle.lastEvent = event3;
        this.#dispatch(event3, data);
      }
    }
    const debounce = debouncers.get(type);
    if (debounce) {
      clearTimeout(debounce.timeout);
      debounce.timeout = setTimeout(() => {
        if (event3 === throttles.get(type)?.lastEvent)
          return;
        this.#dispatch(event3, data);
      }, debounce.delay);
    }
    if (!throttle && !debounce) {
      this.#dispatch(event3, data);
    }
  }
}
var iterate = (list4, callback) => {
  if (Array.isArray(list4)) {
    for (let i = 0;i < list4.length; i++) {
      callback(list4[i]);
    }
  } else if (list4) {
    for (list4;list4.head; list4 = list4.tail) {
      callback(list4.head);
    }
  }
};
var handleEvent = (event3) => {
  const { currentTarget, type } = event3;
  const handler = currentTarget[meta].handlers.get(type);
  handler(event3);
};
var syncedBooleanAttribute = (name) => {
  return {
    added(node) {
      node[name] = true;
    },
    removed(node) {
      node[name] = false;
    }
  };
};
var syncedAttribute = (name) => {
  return {
    added(node, value) {
      node[name] = value;
    }
  };
};
var SYNCED_ATTRIBUTES = {
  checked: syncedBooleanAttribute("checked"),
  selected: syncedBooleanAttribute("selected"),
  value: syncedAttribute("value"),
  autofocus: {
    added(node) {
      queueMicrotask(() => {
        node.focus?.();
      });
    }
  },
  autoplay: {
    added(node) {
      try {
        node.play?.();
      } catch (e) {
        console.error(e);
      }
    }
  }
};

// build/dev/javascript/lustre/lustre/element/keyed.mjs
function do_extract_keyed_children(loop$key_children_pairs, loop$keyed_children, loop$children) {
  while (true) {
    let key_children_pairs = loop$key_children_pairs;
    let keyed_children = loop$keyed_children;
    let children = loop$children;
    if (key_children_pairs instanceof Empty) {
      return [keyed_children, reverse(children)];
    } else {
      let rest = key_children_pairs.tail;
      let key = key_children_pairs.head[0];
      let element$1 = key_children_pairs.head[1];
      let keyed_element = to_keyed(key, element$1);
      let _block;
      if (key === "") {
        _block = keyed_children;
      } else {
        _block = insert3(keyed_children, key, keyed_element);
      }
      let keyed_children$1 = _block;
      let children$1 = prepend(keyed_element, children);
      loop$key_children_pairs = rest;
      loop$keyed_children = keyed_children$1;
      loop$children = children$1;
    }
  }
}
function extract_keyed_children(children) {
  return do_extract_keyed_children(children, empty3(), empty_list);
}
function element3(tag, attributes, children) {
  let $ = extract_keyed_children(children);
  let keyed_children;
  let children$1;
  keyed_children = $[0];
  children$1 = $[1];
  return element("", identity3, "", tag, attributes, children$1, keyed_children, false, is_void_html_element(tag, ""));
}
function namespaced2(namespace, tag, attributes, children) {
  let $ = extract_keyed_children(children);
  let keyed_children;
  let children$1;
  keyed_children = $[0];
  children$1 = $[1];
  return element("", identity3, namespace, tag, attributes, children$1, keyed_children, false, is_void_html_element(tag, namespace));
}
function fragment2(children) {
  let $ = extract_keyed_children(children);
  let keyed_children;
  let children$1;
  keyed_children = $[0];
  children$1 = $[1];
  return fragment("", identity3, children$1, keyed_children);
}

// build/dev/javascript/lustre/lustre/vdom/virtualise.ffi.mjs
var virtualise = (root3) => {
  const rootMeta = insertMetadataChild(element_kind, null, root3, 0, null);
  let virtualisableRootChildren = 0;
  for (let child = root3.firstChild;child; child = child.nextSibling) {
    if (canVirtualiseNode(child))
      virtualisableRootChildren += 1;
  }
  if (virtualisableRootChildren === 0) {
    const placeholder = document2().createTextNode("");
    insertMetadataChild(text_kind, rootMeta, placeholder, 0, null);
    root3.replaceChildren(placeholder);
    return none2();
  }
  if (virtualisableRootChildren === 1) {
    const children2 = virtualiseChildNodes(rootMeta, root3);
    return children2.head[1];
  }
  const fragmentHead = document2().createTextNode("");
  const fragmentMeta = insertMetadataChild(fragment_kind, rootMeta, fragmentHead, 0, null);
  const children = virtualiseChildNodes(fragmentMeta, root3);
  root3.insertBefore(fragmentHead, root3.firstChild);
  return fragment2(children);
};
var canVirtualiseNode = (node) => {
  switch (node.nodeType) {
    case ELEMENT_NODE:
      return true;
    case TEXT_NODE:
      return !!node.data;
    default:
      return false;
  }
};
var virtualiseNode = (meta2, node, key, index3) => {
  if (!canVirtualiseNode(node)) {
    return null;
  }
  switch (node.nodeType) {
    case ELEMENT_NODE: {
      const childMeta = insertMetadataChild(element_kind, meta2, node, index3, key);
      const tag = node.localName;
      const namespace = node.namespaceURI;
      const isHtmlElement = !namespace || namespace === NAMESPACE_HTML;
      if (isHtmlElement && INPUT_ELEMENTS.includes(tag)) {
        virtualiseInputEvents(tag, node);
      }
      const attributes = virtualiseAttributes(node);
      const children = virtualiseChildNodes(childMeta, node);
      const vnode = isHtmlElement ? element3(tag, attributes, children) : namespaced2(namespace, tag, attributes, children);
      return vnode;
    }
    case TEXT_NODE:
      insertMetadataChild(text_kind, meta2, node, index3, null);
      return text2(node.data);
    default:
      return null;
  }
};
var INPUT_ELEMENTS = ["input", "select", "textarea"];
var virtualiseInputEvents = (tag, node) => {
  const value = node.value;
  const checked = node.checked;
  if (tag === "input" && node.type === "checkbox" && !checked)
    return;
  if (tag === "input" && node.type === "radio" && !checked)
    return;
  if (node.type !== "checkbox" && node.type !== "radio" && !value)
    return;
  queueMicrotask(() => {
    node.value = value;
    node.checked = checked;
    node.dispatchEvent(new Event("input", { bubbles: true }));
    node.dispatchEvent(new Event("change", { bubbles: true }));
    if (document2().activeElement !== node) {
      node.dispatchEvent(new Event("blur", { bubbles: true }));
    }
  });
};
var virtualiseChildNodes = (meta2, node) => {
  let children = null;
  let child = node.firstChild;
  let ptr = null;
  let index3 = 0;
  while (child) {
    const key = child.nodeType === ELEMENT_NODE ? child.getAttribute("data-lustre-key") : null;
    if (key != null) {
      child.removeAttribute("data-lustre-key");
    }
    const vnode = virtualiseNode(meta2, child, key, index3);
    const next = child.nextSibling;
    if (vnode) {
      const list_node = new NonEmpty([key ?? "", vnode], null);
      if (ptr) {
        ptr = ptr.tail = list_node;
      } else {
        ptr = children = list_node;
      }
      index3 += 1;
    } else {
      node.removeChild(child);
    }
    child = next;
  }
  if (!ptr)
    return empty_list;
  ptr.tail = empty_list;
  return children;
};
var virtualiseAttributes = (node) => {
  let index3 = node.attributes.length;
  let attributes = empty_list;
  while (index3-- > 0) {
    const attr = node.attributes[index3];
    if (attr.name === "xmlns") {
      continue;
    }
    attributes = new NonEmpty(virtualiseAttribute(attr), attributes);
  }
  return attributes;
};
var virtualiseAttribute = (attr) => {
  const name = attr.localName;
  const value = attr.value;
  return attribute2(name, value);
};

// build/dev/javascript/lustre/lustre/runtime/client/runtime.ffi.mjs
var is_browser = () => !!document2();
class Runtime {
  constructor(root3, [model, effects], view, update2) {
    this.root = root3;
    this.#model = model;
    this.#view = view;
    this.#update = update2;
    this.root.addEventListener("context-request", (event3) => {
      if (!(event3.context && event3.callback))
        return;
      if (!this.#contexts.has(event3.context))
        return;
      event3.stopImmediatePropagation();
      const context = this.#contexts.get(event3.context);
      if (event3.subscribe) {
        const unsubscribe = () => {
          context.subscribers = context.subscribers.filter((subscriber) => subscriber !== event3.callback);
        };
        context.subscribers.push([event3.callback, unsubscribe]);
        event3.callback(context.value, unsubscribe);
      } else {
        event3.callback(context.value);
      }
    });
    const decodeEvent = (event3, path, name) => decode2(this.#events, path, name, event3);
    const dispatch2 = (event3, data) => {
      const [events, result] = dispatch(this.#events, data);
      this.#events = events;
      if (result.isOk()) {
        const handler = result[0];
        if (handler.stop_propagation)
          event3.stopPropagation();
        if (handler.prevent_default)
          event3.preventDefault();
        this.dispatch(handler.message, false);
      }
    };
    this.#reconciler = new Reconciler(this.root, decodeEvent, dispatch2);
    this.#vdom = virtualise(this.root);
    this.#events = new$3();
    this.#handleEffects(effects);
    this.#render();
  }
  root = null;
  dispatch(msg, shouldFlush = false) {
    if (this.#shouldQueue) {
      this.#queue.push(msg);
    } else {
      const [model, effects] = this.#update(this.#model, msg);
      this.#model = model;
      this.#tick(effects, shouldFlush);
    }
  }
  emit(event3, data) {
    const target = this.root.host ?? this.root;
    target.dispatchEvent(new CustomEvent(event3, {
      detail: data,
      bubbles: true,
      composed: true
    }));
  }
  provide(key, value) {
    if (!this.#contexts.has(key)) {
      this.#contexts.set(key, { value, subscribers: [] });
    } else {
      const context = this.#contexts.get(key);
      if (isEqual2(context.value, value)) {
        return;
      }
      context.value = value;
      for (let i = context.subscribers.length - 1;i >= 0; i--) {
        const [subscriber, unsubscribe] = context.subscribers[i];
        if (!subscriber) {
          context.subscribers.splice(i, 1);
          continue;
        }
        subscriber(value, unsubscribe);
      }
    }
  }
  #model;
  #view;
  #update;
  #vdom;
  #events;
  #reconciler;
  #contexts = new Map;
  #shouldQueue = false;
  #queue = [];
  #beforePaint = empty_list;
  #afterPaint = empty_list;
  #renderTimer = null;
  #actions = {
    dispatch: (msg) => this.dispatch(msg),
    emit: (event3, data) => this.emit(event3, data),
    select: () => {},
    root: () => this.root,
    provide: (key, value) => this.provide(key, value)
  };
  #tick(effects, shouldFlush = false) {
    this.#handleEffects(effects);
    if (!this.#renderTimer) {
      if (shouldFlush) {
        this.#renderTimer = "sync";
        queueMicrotask(() => this.#render());
      } else {
        this.#renderTimer = requestAnimationFrame(() => this.#render());
      }
    }
  }
  #handleEffects(effects) {
    this.#shouldQueue = true;
    while (true) {
      for (let list4 = effects.synchronous;list4.tail; list4 = list4.tail) {
        list4.head(this.#actions);
      }
      this.#beforePaint = listAppend(this.#beforePaint, effects.before_paint);
      this.#afterPaint = listAppend(this.#afterPaint, effects.after_paint);
      if (!this.#queue.length)
        break;
      const msg = this.#queue.shift();
      [this.#model, effects] = this.#update(this.#model, msg);
    }
    this.#shouldQueue = false;
  }
  #render() {
    this.#renderTimer = null;
    const next = this.#view(this.#model);
    const { patch, events } = diff(this.#events, this.#vdom, next);
    this.#events = events;
    this.#vdom = next;
    this.#reconciler.push(patch);
    if (this.#beforePaint instanceof NonEmpty) {
      const effects = makeEffect(this.#beforePaint);
      this.#beforePaint = empty_list;
      queueMicrotask(() => {
        this.#tick(effects, true);
      });
    }
    if (this.#afterPaint instanceof NonEmpty) {
      const effects = makeEffect(this.#afterPaint);
      this.#afterPaint = empty_list;
      requestAnimationFrame(() => {
        this.#tick(effects, true);
      });
    }
  }
}
function makeEffect(synchronous) {
  return {
    synchronous,
    after_paint: empty_list,
    before_paint: empty_list
  };
}
function listAppend(a, b) {
  if (a instanceof Empty) {
    return b;
  } else if (b instanceof Empty) {
    return a;
  } else {
    return append(a, b);
  }
}
var copiedStyleSheets = new WeakMap;

// build/dev/javascript/lustre/lustre/runtime/server/runtime.mjs
class ClientDispatchedMessage extends CustomType {
  constructor(message) {
    super();
    this.message = message;
  }
}
class ClientRegisteredCallback extends CustomType {
  constructor(callback) {
    super();
    this.callback = callback;
  }
}
class ClientDeregisteredCallback extends CustomType {
  constructor(callback) {
    super();
    this.callback = callback;
  }
}
class EffectDispatchedMessage extends CustomType {
  constructor(message) {
    super();
    this.message = message;
  }
}
class EffectEmitEvent extends CustomType {
  constructor(name, data) {
    super();
    this.name = name;
    this.data = data;
  }
}
class EffectProvidedValue extends CustomType {
  constructor(key, value) {
    super();
    this.key = key;
    this.value = value;
  }
}
class SystemRequestedShutdown extends CustomType {
}

// build/dev/javascript/lustre/lustre/component.mjs
class Config2 extends CustomType {
  constructor(open_shadow_root, adopt_styles, delegates_focus, attributes, properties, contexts, is_form_associated, on_form_autofill, on_form_reset, on_form_restore) {
    super();
    this.open_shadow_root = open_shadow_root;
    this.adopt_styles = adopt_styles;
    this.delegates_focus = delegates_focus;
    this.attributes = attributes;
    this.properties = properties;
    this.contexts = contexts;
    this.is_form_associated = is_form_associated;
    this.on_form_autofill = on_form_autofill;
    this.on_form_reset = on_form_reset;
    this.on_form_restore = on_form_restore;
  }
}
function new$6(options) {
  let init = new Config2(true, true, false, empty_list, empty_list, empty_list, false, option_none, option_none, option_none);
  return fold(options, init, (config, option) => {
    return option.apply(config);
  });
}

// build/dev/javascript/lustre/lustre/runtime/client/spa.ffi.mjs
class Spa {
  #runtime;
  constructor(root3, [init, effects], update2, view) {
    this.#runtime = new Runtime(root3, [init, effects], view, update2);
  }
  send(message) {
    switch (message.constructor) {
      case EffectDispatchedMessage: {
        this.dispatch(message.message, false);
        break;
      }
      case EffectEmitEvent: {
        this.emit(message.name, message.data);
        break;
      }
      case SystemRequestedShutdown:
        break;
    }
  }
  dispatch(msg) {
    this.#runtime.dispatch(msg);
  }
  emit(event3, data) {
    this.#runtime.emit(event3, data);
  }
}
var start = ({ init, update: update2, view }, selector, flags) => {
  if (!is_browser())
    return new Error(new NotABrowser);
  const root3 = selector instanceof HTMLElement ? selector : document2().querySelector(selector);
  if (!root3)
    return new Error(new ElementNotFound(selector));
  return new Ok(new Spa(root3, init(flags), update2, view));
};

// build/dev/javascript/lustre/lustre/runtime/server/runtime.ffi.mjs
class Runtime2 {
  #model;
  #update;
  #view;
  #config;
  #vdom;
  #events;
  #providers = new_map();
  #callbacks = /* @__PURE__ */ new Set;
  constructor([model, effects], update2, view, config) {
    this.#model = model;
    this.#update = update2;
    this.#view = view;
    this.#config = config;
    this.#vdom = this.#view(this.#model);
    this.#events = from_node(this.#vdom);
    this.#handle_effect(effects);
  }
  send(msg) {
    switch (msg.constructor) {
      case ClientDispatchedMessage: {
        const { message } = msg;
        const next = this.#handle_client_message(message);
        const diff2 = diff(this.#events, this.#vdom, next);
        this.#vdom = next;
        this.#events = diff2.events;
        this.broadcast(reconcile(diff2.patch));
        return;
      }
      case ClientRegisteredCallback: {
        const { callback } = msg;
        this.#callbacks.add(callback);
        callback(mount(this.#config.open_shadow_root, this.#config.adopt_styles, keys(this.#config.attributes), keys(this.#config.properties), keys(this.#config.contexts), this.#providers, this.#vdom));
        return;
      }
      case ClientDeregisteredCallback: {
        const { callback } = msg;
        this.#callbacks.delete(callback);
        return;
      }
      case EffectDispatchedMessage: {
        const { message } = msg;
        const [model, effect] = this.#update(this.#model, message);
        const next = this.#view(model);
        const diff2 = diff(this.#events, this.#vdom, next);
        this.#handle_effect(effect);
        this.#model = model;
        this.#vdom = next;
        this.#events = diff2.events;
        this.broadcast(reconcile(diff2.patch));
        return;
      }
      case EffectEmitEvent: {
        const { name, data } = msg;
        this.broadcast(emit(name, data));
        return;
      }
      case EffectProvidedValue: {
        const { key, value } = msg;
        const existing = map_get(this.#providers, key);
        if (existing.isOk() && isEqual2(existing[0], value)) {
          return;
        }
        this.#providers = insert(this.#providers, key, value);
        this.broadcast(provide(key, value));
        return;
      }
      case SystemRequestedShutdown: {
        this.#model = null;
        this.#update = null;
        this.#view = null;
        this.#config = null;
        this.#vdom = null;
        this.#events = null;
        this.#providers = null;
        this.#callbacks.clear();
        return;
      }
      default:
        return;
    }
  }
  broadcast(msg) {
    for (const callback of this.#callbacks) {
      callback(msg);
    }
  }
  #handle_client_message(msg) {
    switch (msg.constructor) {
      case Batch: {
        const { messages } = msg;
        let model = this.#model;
        let effect = none();
        for (let list4 = messages;list4.head; list4 = list4.tail) {
          const result = this.#handle_client_message(list4.head);
          if (result instanceof Ok) {
            model = result[0][0];
            effect = batch(List.fromArray([effect, result[0][1]]));
            break;
          }
        }
        this.#handle_effect(effect);
        this.#model = model;
        return this.#view(this.#model);
      }
      case AttributeChanged: {
        const { name, value } = msg;
        const result = this.#handle_attribute_change(name, value);
        if (result instanceof Error) {
          return this.#vdom;
        } else {
          const [model, effects] = this.#update(this.#model, result[0]);
          this.#handle_effect(effects);
          this.#model = model;
          return this.#view(this.#model);
        }
      }
      case PropertyChanged: {
        const { name, value } = msg;
        const result = this.#handle_properties_change(name, value);
        if (result instanceof Error) {
          return this.#vdom;
        } else {
          const [model, effects] = this.#update(this.#model, result[0]);
          this.#handle_effect(effects);
          this.#model = model;
          return this.#view(this.#model);
        }
      }
      case EventFired: {
        const { path, name, event: event3 } = msg;
        const [events, result] = handle(this.#events, path, name, event3);
        this.#events = events;
        if (result instanceof Error) {
          return this.#vdom;
        } else {
          const [model, effects] = this.#update(this.#model, result[0].message);
          this.#handle_effect(effects);
          this.#model = model;
          return this.#view(this.#model);
        }
      }
      case ContextProvided: {
        const { key, value } = msg;
        let result = map_get(this.#config.contexts, key);
        if (result instanceof Error) {
          return this.#vdom;
        }
        result = run(value, result[0]);
        if (result instanceof Error) {
          return this.#vdom;
        }
        const [model, effects] = this.#update(this.#model, result[0]);
        this.#handle_effect(effects);
        this.#model = model;
        return this.#view(this.#model);
      }
    }
  }
  #handle_attribute_change(name, value) {
    const result = map_get(this.#config.attributes, name);
    switch (result.constructor) {
      case Ok:
        return result[0](value);
      case Error:
        return new Error(undefined);
    }
  }
  #handle_properties_change(name, value) {
    const result = map_get(this.#config.properties, name);
    switch (result.constructor) {
      case Ok:
        return result[0](value);
      case Error:
        return new Error(undefined);
    }
  }
  #handle_effect(effect) {
    const dispatch2 = (message) => this.send(new EffectDispatchedMessage(message));
    const emit2 = (name, data) => this.send(new EffectEmitEvent(name, data));
    const select = () => {
      return;
    };
    const internals = () => {
      return;
    };
    const provide2 = (key, value) => this.send(new EffectProvidedValue(key, value));
    globalThis.queueMicrotask(() => {
      perform(effect, dispatch2, emit2, select, internals, provide2);
    });
  }
}

// build/dev/javascript/lustre/lustre.mjs
class App extends CustomType {
  constructor(init, update2, view, config) {
    super();
    this.init = init;
    this.update = update2;
    this.view = view;
    this.config = config;
  }
}
class ElementNotFound extends CustomType {
  constructor(selector) {
    super();
    this.selector = selector;
  }
}
class NotABrowser extends CustomType {
}
function application(init, update2, view) {
  return new App(init, update2, view, new$6(empty_list));
}
function start3(app, selector, start_args) {
  return guard(!is_browser(), new Error(new NotABrowser), () => {
    return start(app, selector, start_args);
  });
}

// build/dev/javascript/lustre/lustre/element/svg.mjs
var namespace = "http://www.w3.org/2000/svg";
function circle(attrs) {
  return namespaced(namespace, "circle", attrs, empty_list);
}
function polygon(attrs) {
  return namespaced(namespace, "polygon", attrs, empty_list);
}
function polyline(attrs) {
  return namespaced(namespace, "polyline", attrs, empty_list);
}
function rect(attrs) {
  return namespaced(namespace, "rect", attrs, empty_list);
}
function g(attrs, children) {
  return namespaced(namespace, "g", attrs, children);
}
function svg(attrs, children) {
  return namespaced(namespace, "svg", attrs, children);
}
function path(attrs) {
  return namespaced(namespace, "path", attrs, empty_list);
}
function text3(attrs, content) {
  return namespaced(namespace, "text", attrs, toList([text2(content)]));
}

// build/dev/javascript/lustre/lustre/event.mjs
function on(name, handler) {
  return event(name, map2(handler, (msg) => {
    return new Handler(false, false, msg);
  }), empty_list, never, never, 0, 0);
}
function on_mouse_down(msg) {
  return on("mousedown", success(msg));
}
function on_mouse_enter(msg) {
  return on("mouseenter", success(msg));
}
function on_mouse_leave(msg) {
  return on("mouseleave", success(msg));
}
// build/dev/javascript/plinth/audio_ffi.mjs
function newAudio(url) {
  return new Audio(url);
}
async function play(audio) {
  try {
    await audio.play();
    return Result$Ok();
  } catch (error) {
    return Result$Error(error.toString());
  }
}

// build/dev/javascript/plinth/document_ffi.mjs
function body() {
  return document.body;
}

// build/dev/javascript/plinth/element_ffi.mjs
function setAttribute2(element4, name, value) {
  element4.setAttribute(name, value);
}

// build/dev/javascript/plinth/event_ffi.mjs
function key(event4) {
  return event4.key;
}

// build/dev/javascript/plinth/window_ffi.mjs
function self() {
  return globalThis;
}
function alert(message) {
  window.alert(message);
}
function confirm(message) {
  return window.confirm(message);
}
function prompt(message, defaultValue) {
  let text4 = window.prompt(message, defaultValue);
  if (text4 !== null) {
    return Result$Ok(text4);
  } else {
    return Result$Error();
  }
}
function addEventListener4(type, listener) {
  return window.addEventListener(type, listener);
}
function document3(window2) {
  return window2.document;
}
async function requestWakeLock() {
  try {
    return Result$Ok(await window.navigator.wakeLock.request("screen"));
  } catch (error) {
    return Result$Error(error.toString());
  }
}
function location() {
  return window.location.href;
}
function locationOf(w) {
  try {
    return Result$Ok(w.location.href);
  } catch (error) {
    return Result$Error(error.toString());
  }
}
function setLocation(w, url) {
  w.location.href = url;
}
function origin() {
  return window.location.origin;
}
function pathname() {
  return window.location.pathname;
}
function reload() {
  return window.location.reload();
}
function reloadOf(w) {
  return w.location.reload();
}
function focus2(w) {
  return w.focus();
}
function getHash2() {
  const hash = window.location.hash;
  if (hash == "") {
    return Result$Error();
  }
  return Result$Ok(decodeURIComponent(hash.slice(1)));
}
function getSearch() {
  const search = window.location.search;
  if (search == "") {
    return Result$Error();
  }
  return Result$Ok(decodeURIComponent(search.slice(1)));
}
function innerHeight(w) {
  return w.innerHeight;
}
function innerWidth(w) {
  return w.innerWidth;
}
function outerHeight(w) {
  return w.outerHeight;
}
function outerWidth(w) {
  return w.outerWidth;
}
function screenX(w) {
  return w.screenX;
}
function screenY(w) {
  return w.screenY;
}
function screenTop(w) {
  return w.screenTop;
}
function screenLeft(w) {
  return w.screenLeft;
}
function scrollX(w) {
  return w.scrollX;
}
function scrollY(w) {
  return w.scrollY;
}
function open(url, target2, features) {
  try {
    return Result$Ok(window.open(url, target2, features));
  } catch (error) {
    return Result$Error(error.toString());
  }
}
function close(w) {
  w.close();
}
function closed(w) {
  return w.closed;
}
function queueMicrotask2(callback) {
  return window.queueMicrotask(callback);
}
function requestAnimationFrame2(callback) {
  return window.requestAnimationFrame(callback);
}
function cancelAnimationFrame(callback) {
  return window.cancelAnimationFrame(callback);
}
function eval_(string) {
  try {
    return Result$Ok(eval(string));
  } catch (error) {
    return Result$Error(error.toString());
  }
}
async function import_(string6) {
  try {
    return Result$Ok(await import(string6));
  } catch (error) {
    return Result$Error(error.toString());
  }
}

// build/dev/javascript/plinth/date_ffi.mjs
function now() {
  return new Date;
}
function getTime(d) {
  return Math.floor(d.getTime());
}

// build/dev/javascript/plinth/global_ffi.mjs
function setInterval(delay, callback) {
  return globalThis.setInterval(callback, delay);
}
// build/dev/javascript/moon/moon.mjs
var FILEPATH2 = "src/moon.gleam";

class State extends CustomType {
  constructor(specific, window_width, window_height, held_down_left, held_down_right, lucy_y_highscore) {
    super();
    this.specific = specific;
    this.window_width = window_width;
    this.window_height = window_height;
    this.held_down_left = held_down_left;
    this.held_down_right = held_down_right;
    this.lucy_y_highscore = lucy_y_highscore;
  }
}

class Running2 extends CustomType {
  constructor(previous_simulation_time, lucy_angle, lucy_x, lucy_y, lucy_angle_per_second, lucy_x_per_second, lucy_y_per_second, lucy_y_maximum, previously_bounced_on_cloud, previously_collected_diamond, remaining_diamond_positions) {
    super();
    this.previous_simulation_time = previous_simulation_time;
    this.lucy_angle = lucy_angle;
    this.lucy_x = lucy_x;
    this.lucy_y = lucy_y;
    this.lucy_angle_per_second = lucy_angle_per_second;
    this.lucy_x_per_second = lucy_x_per_second;
    this.lucy_y_per_second = lucy_y_per_second;
    this.lucy_y_maximum = lucy_y_maximum;
    this.previously_bounced_on_cloud = previously_bounced_on_cloud;
    this.previously_collected_diamond = previously_collected_diamond;
    this.remaining_diamond_positions = remaining_diamond_positions;
  }
}

class Menu extends CustomType {
  constructor(lucy_is_hovered) {
    super();
    this.lucy_is_hovered = lucy_is_hovered;
  }
}

class AnimatedStart extends CustomType {
  constructor(time, position) {
    super();
    this.time = time;
    this.position = position;
  }
}

class Resized extends CustomType {
}

class SimulationTickPassed extends CustomType {
}

class KeyPressed extends CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}

class KeyReleased extends CustomType {
  constructor($0) {
    super();
    this[0] = $0;
  }
}

class MenuLucyHoverStarted extends CustomType {
}

class MenuLucyHoverEnded extends CustomType {
}

class MenuLucyPressed extends CustomType {
}

class Left extends CustomType {
}

class Right extends CustomType {
}
function init() {
  return [
    new State(new Menu(false), (() => {
      let _pipe = innerWidth(self());
      return identity(_pipe);
    })(), (() => {
      let _pipe = innerHeight(self());
      return identity(_pipe);
    })(), false, false, 0),
    batch(toList([
      from((dispatch2) => {
        return addEventListener4("resize", (_) => {
          return dispatch2(new Resized);
        });
      }),
      from((dispatch2) => {
        let $ = setInterval(globalThis.Math.trunc(1000 / 60), () => {
          return dispatch2(new SimulationTickPassed);
        });
        return;
      }),
      from((dispatch2) => {
        return addEventListener4("keydown", (e) => {
          return dispatch2(new KeyPressed(key(e)));
        });
      }),
      from((dispatch2) => {
        return addEventListener4("keyup", (e) => {
          return dispatch2(new KeyReleased(key(e)));
        });
      })
    ]))
  ];
}
function key_as_x_direction(key2) {
  if (key2 === "ArrowLeft") {
    return new Some(new Left);
  } else if (key2 === "ArrowRight") {
    return new Some(new Right);
  } else if (key2 === "a") {
    return new Some(new Left);
  } else if (key2 === "d") {
    return new Some(new Right);
  } else {
    return new None;
  }
}
function svg_small_star() {
  return rect(toList([
    attribute2("width", "0.01"),
    attribute2("height", "0.01"),
    attribute2("fill", "white")
  ]));
}
function lucy_color() {
  let _pipe = from_rgb(1, 0.5, 1);
  return unwrap2(_pipe, black);
}
function svg_fog() {
  return path(toList([
    attribute2("d", "M -6.0,0.0 Q 2.0,1.5 6.0,1.0 Q -2.0,-1.0 -6.0 0.0 M -12.0,-1.0 Q 2.0,0.1 1.0,-0.8 Q -2.0,-1.5 -8.0 -1.2"),
    attribute2("fill", (() => {
      let _pipe = from_rgba(1, 1, 1, 0.029);
      let _pipe$1 = unwrap2(_pipe, white);
      return to_css_rgba_string(_pipe$1);
    })())
  ]));
}
function cloud_color() {
  let _pipe = from_rgb(0.9, 1, 0.86);
  let _pipe$1 = unwrap2(_pipe, black);
  return to_css_rgba_string(_pipe$1);
}
function svg_scale_each(svg2, factor) {
  return g(toList([
    attribute2("transform", "scale(" + (() => {
      let _pipe = factor;
      return float_to_string(_pipe);
    })() + ")")
  ]), toList([svg2]));
}
function lucy_closed_eye() {
  let _pipe = polyline(toList([
    attribute2("points", "-0.07,0.15 0.1,0.0 -0.07,-0.15"),
    attribute2("fill", "none"),
    attribute2("stroke", "black"),
    attribute2("stroke-width", "0.08"),
    attribute2("stroke-linecap", "round"),
    attribute2("stroke-linejoin", "round")
  ]));
  return svg_scale_each(_pipe, 0.7);
}
function svg_cloud() {
  let color = cloud_color();
  let _pipe = g(toList([]), toList([
    circle(toList([
      attribute2("fill", color),
      attribute2("cy", "0.12"),
      attribute2("cx", "-0.27"),
      attribute2("r", "0.25")
    ])),
    circle(toList([
      attribute2("fill", color),
      attribute2("cy", "0.12"),
      attribute2("cx", "0.12"),
      attribute2("r", "0.3")
    ])),
    circle(toList([
      attribute2("fill", color),
      attribute2("cy", "-0.17"),
      attribute2("cx", "0.3"),
      attribute2("r", "0.21")
    ])),
    circle(toList([
      attribute2("fill", color),
      attribute2("cx", "0.5"),
      attribute2("r", "0.15")
    ]))
  ]));
  return svg_scale_each(_pipe, 1.2);
}
function svg_scale_xy(svg2, x, y) {
  return g(toList([
    attribute2("transform", "scale(" + (() => {
      let _pipe = x;
      return float_to_string(_pipe);
    })() + ", " + (() => {
      let _pipe = y;
      return float_to_string(_pipe);
    })() + ")")
  ]), toList([svg2]));
}
function svg_translate(svg2, x, y) {
  return g(toList([
    attribute2("transform", "translate(" + (() => {
      let _pipe = x;
      return float_to_string(_pipe);
    })() + ", " + (() => {
      let _pipe = y;
      return float_to_string(_pipe);
    })() + ")")
  ]), toList([svg2]));
}
function svg_bird() {
  let _block;
  let _pipe = from_rgb(0.4, 0.6, 0.8);
  let _pipe$1 = unwrap2(_pipe, white);
  _block = to_css_rgba_string(_pipe$1);
  let color = _block;
  let wing_radius = 0.2;
  let wing = circle(toList([
    attribute2("r", (() => {
      let _pipe$22 = wing_radius;
      return float_to_string(_pipe$22);
    })()),
    attribute2("fill", "none"),
    attribute2("stroke", color),
    attribute2("stroke-width", "0.03"),
    attribute2("pathLength", "320"),
    attribute2("stroke-dasharray", "90 270"),
    attribute2("stroke-linecap", "round")
  ]));
  let _pipe$2 = g(toList([]), toList([
    wing,
    (() => {
      let _pipe$22 = wing;
      let _pipe$3 = svg_scale_xy(_pipe$22, -1, 1);
      return svg_translate(_pipe$3, wing_radius * 2, 0);
    })()
  ]));
  return svg_scale_xy(_pipe$2, 1.49, 1);
}
function svg_rotate(svg2, angle) {
  return g(toList([
    attribute2("transform", "rotate(" + (() => {
      let _pipe = divideFloat(angle, pi2()) * 180;
      return float_to_string(_pipe);
    })() + ")")
  ]), toList([svg2]));
}
function svg_diamond(animation_progress) {
  let _pipe = g(toList([]), toList([
    polygon(toList([
      attribute2("points", "-2,0 -1,1 0,0"),
      attribute2("fill", "#64b5f6")
    ])),
    polygon(toList([
      attribute2("points", "-1,1 0,0 1,1"),
      attribute2("fill", "#2196f3")
    ])),
    polygon(toList([
      attribute2("points", "0,0 1,1 2,0"),
      attribute2("fill", "#1976d2")
    ])),
    polygon(toList([
      attribute2("points", "-2,0 0,-1.5 2,0"),
      attribute2("fill", "#3a8accff")
    ]))
  ]));
  let _pipe$1 = svg_translate(_pipe, 0, 0.25);
  let _pipe$2 = svg_scale_xy(_pipe$1, 0.1 * 1.38 + animation_progress * 0.007, 0.141 * 1.38 + animation_progress * 0.007);
  return svg_rotate(_pipe$2, (-0.5 + animation_progress) * 0.17);
}
function svg_diamond_grey(animation_progress) {
  let _pipe = g(toList([]), toList([
    polygon(toList([
      attribute2("points", "-2,0 -1,1 0,0"),
      attribute2("fill", "#b3b3b3ff")
    ])),
    polygon(toList([
      attribute2("points", "-1,1 0,0 1,1"),
      attribute2("fill", "#9c9c9cff")
    ])),
    polygon(toList([
      attribute2("points", "0,0 1,1 2,0"),
      attribute2("fill", "#888888ff")
    ])),
    polygon(toList([
      attribute2("points", "-2,0 0,-1.5 2,0"),
      attribute2("fill", "#9b9b9bff")
    ]))
  ]));
  let _pipe$1 = svg_translate(_pipe, 0, 0.25);
  let _pipe$2 = svg_scale_xy(_pipe$1, 0.1 * 1.38 + animation_progress * 0.007, 0.141 * 1.38 + animation_progress * 0.007);
  return svg_rotate(_pipe$2, (-0.5 + animation_progress) * 0.17);
}
function svg_moon() {
  let _block;
  let _pipe = from_rgb(0.2, 0, 0.6);
  let _pipe$1 = unwrap2(_pipe, white);
  _block = to_css_rgba_string(_pipe$1);
  let color = _block;
  let _block$1;
  let _pipe$2 = lucy_closed_eye();
  _block$1 = svg_rotate(_pipe$2, pi2() / 2);
  let svg_eye = _block$1;
  let svg_cheek = circle(toList([
    attribute2("r", "0.1"),
    attribute2("fill", (() => {
      let _pipe$3 = from_rgba(1, 0.2, 0.7, 0.28);
      let _pipe$4 = unwrap2(_pipe$3, red);
      return to_css_rgba_string(_pipe$4);
    })())
  ]));
  let svg_face = g(toList([]), toList([
    (() => {
      let _pipe$3 = svg_eye;
      return svg_translate(_pipe$3, -0.3, 0.12);
    })(),
    (() => {
      let _pipe$3 = svg_eye;
      return svg_translate(_pipe$3, 0.3, 0.12);
    })(),
    (() => {
      let _pipe$3 = svg_cheek;
      return svg_translate(_pipe$3, -0.5, -0.1);
    })(),
    (() => {
      let _pipe$3 = svg_cheek;
      return svg_translate(_pipe$3, 0.5, -0.1);
    })()
  ]));
  return g(toList([]), toList([
    (() => {
      let _pipe$3 = path(toList([
        attribute2("d", "M5.0 2.0A4.0 4.0 0 1 0 5.0 7.0 3.0 3.0 0 1 1 5.0 2.0z"),
        attribute2("stroke", color),
        attribute2("stroke-width", "1.0"),
        attribute2("stroke-linejoin", "round"),
        attribute2("fill", color)
      ]));
      let _pipe$4 = svg_scale_each(_pipe$3, 0.4);
      return svg_translate(_pipe$4, -0.8, -1.6);
    })(),
    (() => {
      let _pipe$3 = svg_face;
      return svg_translate(_pipe$3, -1.1, 0.1);
    })()
  ]));
}
function point_scale_by(point, scale) {
  let x;
  let y;
  x = point[0];
  y = point[1];
  return [x * scale, y * scale];
}
function lucy_shape_points() {
  let angle_step = 2 * pi2() / 5;
  let _pipe = range(0, 5);
  return map(_pipe, (i) => {
    let angle = angle_step * (() => {
      let _pipe$1 = i;
      return identity(_pipe$1);
    })();
    return [
      (() => {
        let _pipe$1 = [cos2(angle), sin2(angle)];
        return point_scale_by(_pipe$1, 0.268);
      })(),
      [
        cos2(angle + angle_step / 2),
        sin2(angle + angle_step / 2)
      ]
    ];
  });
}
function lucy_path() {
  return `M 0,0
` + (() => {
    let _pipe = lucy_shape_points();
    let _pipe$1 = map(_pipe, (points) => {
      let inner;
      let outer;
      inner = points[0];
      outer = points[1];
      let x;
      let y;
      x = inner[0];
      y = inner[1];
      let ox;
      let oy;
      ox = outer[0];
      oy = outer[1];
      return "Q " + (() => {
        let _pipe$12 = x;
        return float_to_string(_pipe$12);
      })() + "," + (() => {
        let _pipe$12 = y;
        return float_to_string(_pipe$12);
      })() + " " + (() => {
        let _pipe$12 = ox;
        return float_to_string(_pipe$12);
      })() + "," + (() => {
        let _pipe$12 = oy;
        return float_to_string(_pipe$12);
      })();
    });
    return join(_pipe$1, `
`);
  })() + `
z`;
}
function svg_lucy(is_excited) {
  let _block;
  if (is_excited) {
    _block = lucy_closed_eye();
  } else {
    _block = circle(toList([
      attribute2("r", "0.08"),
      attribute2("fill", "black")
    ]));
  }
  let svg_eye = _block;
  let svg_cheek = circle(toList([
    attribute2("r", "0.05"),
    attribute2("fill", (() => {
      let _block$1;
      if (is_excited) {
        _block$1 = from_rgba(1, 0, 0, 0.2);
      } else {
        _block$1 = from_rgba(1, 0, 0, 0.1);
      }
      let _pipe = _block$1;
      let _pipe$1 = unwrap2(_pipe, red);
      return to_css_rgba_string(_pipe$1);
    })())
  ]));
  let svg_mouth = circle(toList([
    attribute2("cy", "0.0"),
    attribute2("cx", "0"),
    attribute2("r", "0.12"),
    attribute2("fill", "none"),
    attribute2("stroke", "black"),
    attribute2("stroke-width", "0.06"),
    attribute2("pathLength", "360"),
    attribute2("stroke-dasharray", "0 180 180"),
    attribute2("stroke-linecap", "round")
  ]));
  return g(toList([]), toList([
    (() => {
      let _pipe = path(toList([
        attribute2("stroke-width", "0.23"),
        attribute2("stroke-linejoin", "round"),
        attribute2("stroke", (() => {
          let _pipe2 = lucy_color();
          return to_css_rgba_string(_pipe2);
        })()),
        attribute2("fill", (() => {
          let _pipe2 = lucy_color();
          return to_css_rgba_string(_pipe2);
        })()),
        attribute2("d", lucy_path())
      ]));
      return svg_rotate(_pipe, -0.33);
    })(),
    (() => {
      let _pipe = svg_eye;
      return svg_translate(_pipe, -0.3, 0.12);
    })(),
    (() => {
      let _pipe = svg_eye;
      let _pipe$1 = svg_rotate(_pipe, pi2());
      return svg_translate(_pipe$1, 0.3, 0.12);
    })(),
    (() => {
      let _pipe = svg_cheek;
      return svg_translate(_pipe, -0.3, -0.08);
    })(),
    (() => {
      let _pipe = svg_cheek;
      return svg_translate(_pipe, 0.3, -0.08);
    })(),
    svg_mouth
  ]));
}
function as_static_lustre_component(node) {
  unsafe_raw_html("http://www.w3.org/2000/svg", "g", toList([]), (() => {
    let _pipe = node;
    return to_string4(_pipe);
  })());
  return node;
}
var all_diamond_positions = /* @__PURE__ */ toList([
  [0, 12],
  [-5, 16],
  [3, 24],
  [-5.8, 28.75],
  [4.3, 32],
  [0, 45],
  [2, 50],
  [6, 54],
  [-6, 62],
  [6, 69],
  [0, 69.8],
  [0, 88.65]
]);
var initial_running_state_specific = /* @__PURE__ */ new Running2(/* @__PURE__ */ new None, 0, 2, -4, -0.5, -0.67, 3.75, 0, /* @__PURE__ */ new None, /* @__PURE__ */ new None, all_diamond_positions);
var screen_width = 16;
var screen_height = 9;
var goal_y = 100;
function view(state, svg_environment) {
  let ration_width_to_height = divideFloat(screen_width, screen_height);
  let _block;
  let $1 = state.window_width < state.window_height * ration_width_to_height;
  if ($1) {
    _block = [
      state.window_width,
      divideFloat(state.window_width, ration_width_to_height)
    ];
  } else {
    _block = [state.window_height * ration_width_to_height, state.window_height];
  }
  let $ = _block;
  let svg_width;
  let svg_height;
  svg_width = $[0];
  svg_height = $[1];
  return svg(toList([
    style("position", "absolute"),
    style("right", (() => {
      let _pipe = (state.window_width - svg_width) / 2;
      return float_to_string(_pipe);
    })() + "px"),
    style("bottom", (() => {
      let _pipe = (state.window_height - svg_height) / 2;
      return float_to_string(_pipe);
    })() + "px"),
    width((() => {
      let _pipe = svg_width;
      return truncate(_pipe);
    })()),
    height((() => {
      let _pipe = svg_height;
      return truncate(_pipe);
    })())
  ]), toList([
    (() => {
      let _block$1;
      let $2 = state.specific;
      if ($2 instanceof Running2) {
        let maybe_previous_simulation_time = $2.previous_simulation_time;
        let lucy_angle = $2.lucy_angle;
        let lucy_x = $2.lucy_x;
        let lucy_y = $2.lucy_y;
        let lucy_y_per_second = $2.lucy_y_per_second;
        let maybe_previously_bounced_on_cloud = $2.previously_bounced_on_cloud;
        let maybe_previously_collected_diamond = $2.previously_collected_diamond;
        let remaining_diamond_positions = $2.remaining_diamond_positions;
        let _block$2;
        let _pipe2 = lucy_y * divideFloat(1, goal_y);
        let _pipe$1 = max(_pipe2, 0);
        _block$2 = min(_pipe$1, 1);
        let progress = _block$2;
        let diamond_animation_progress = absolute_value((sin2((() => {
          let _pipe$2 = maybe_previous_simulation_time;
          return unwrap(_pipe$2, 0);
        })() * 5) + 1) / 2);
        let svg_diamond_grey$1 = svg_diamond_grey(diamond_animation_progress);
        let svg_diamond$1 = svg_diamond(diamond_animation_progress);
        let svg_diamonds = g(toList([]), (() => {
          let _pipe$2 = remaining_diamond_positions;
          return map(_pipe$2, (remaining_diamond_position) => {
            let x;
            let y;
            x = remaining_diamond_position[0];
            y = remaining_diamond_position[1];
            let _pipe$3 = svg_diamond$1;
            return svg_translate(_pipe$3, x, y);
          });
        })());
        let _block$3;
        if (maybe_previously_collected_diamond instanceof Some && maybe_previous_simulation_time instanceof Some) {
          let previously_collected_diamond = maybe_previously_collected_diamond[0];
          let previous_simulation_time = maybe_previous_simulation_time[0];
          let $3 = previously_collected_diamond.position;
          let x;
          let y;
          x = $3[0];
          y = $3[1];
          let _pipe$2 = svg_diamond$1;
          let _pipe$3 = svg_scale_each(_pipe$2, 1 - (previous_simulation_time - previously_collected_diamond.time));
          _block$3 = svg_translate(_pipe$3, x - x * 0.5 * (() => {
            let _pipe$4 = previous_simulation_time - previously_collected_diamond.time;
            return min(_pipe$4, 1);
          })(), y + 15 * (() => {
            let _pipe$4 = power2(previous_simulation_time - previously_collected_diamond.time, 2);
            return unwrap2(_pipe$4, 1);
          })());
        } else {
          _block$3 = none2();
        }
        let svg_previously_collected_diamond_animation = _block$3;
        let _block$4;
        if (maybe_previously_bounced_on_cloud instanceof Some && maybe_previous_simulation_time instanceof Some) {
          let previously_bounced_on_cloud = maybe_previously_bounced_on_cloud[0];
          let previous_simulation_time = maybe_previous_simulation_time[0];
          let $3 = previously_bounced_on_cloud.position;
          let x;
          let y;
          x = $3[0];
          y = $3[1];
          let _pipe$2 = g(toList([
            attribute2("opacity", (() => {
              let _pipe$22 = 0.29 - 0.7 * (previous_simulation_time - previously_bounced_on_cloud.time);
              let _pipe$32 = max(_pipe$22, 0);
              return float_to_string(_pipe$32);
            })())
          ]), toList([svg_cloud()]));
          let _pipe$3 = svg_scale_xy(_pipe$2, 1 + 1.1 * (previous_simulation_time - previously_bounced_on_cloud.time), (() => {
            let _pipe$32 = 1.4 - (previous_simulation_time - previously_bounced_on_cloud.time);
            return max(_pipe$32, 0);
          })());
          _block$4 = svg_translate(_pipe$3, x, y - 1.6 * (previous_simulation_time - previously_bounced_on_cloud.time));
        } else {
          _block$4 = none2();
        }
        let svg_previously_bounced_on_cloud_animation = _block$4;
        let _block$5;
        {
          let _block$6;
          let _pipe$2 = all_diamond_positions;
          _block$6 = length(_pipe$2);
          let all_diamonds_count = _block$6;
          let _block$7;
          let _pipe$3 = remaining_diamond_positions;
          _block$7 = length(_pipe$3);
          let remaining_diamonds_count = _block$7;
          let collected_diamonds_count = all_diamonds_count - remaining_diamonds_count;
          let _pipe$4 = range(0, all_diamonds_count - 1);
          let _pipe$5 = map(_pipe$4, (diamond_index) => {
            let diamond_percentage = divideFloat((() => {
              let _pipe$53 = diamond_index;
              return identity(_pipe$53);
            })(), (() => {
              let _pipe$53 = all_diamonds_count;
              return identity(_pipe$53);
            })() - 1);
            let _block$8;
            let $3 = diamond_index < collected_diamonds_count;
            if ($3) {
              _block$8 = svg_diamond$1;
            } else {
              _block$8 = svg_diamond_grey$1;
            }
            let _pipe$52 = _block$8;
            return svg_translate(_pipe$52, -0.2 + 3 * cos2(pi2() * diamond_percentage), 102 + 3 * sin2(pi2() * diamond_percentage));
          });
          _block$5 = ((_capture) => {
            return g(toList([]), _capture);
          })(_pipe$5);
        }
        let svg_summary_of_collected_diamonds = _block$5;
        _block$1 = g(toList([]), toList([
          rect(toList([
            attribute2("y", "-100%"),
            attribute2("width", "100%"),
            attribute2("height", "100%"),
            attribute2("fill", (() => {
              let _pipe$2 = from_rgb((() => {
                let _pipe$22 = lucy_y * divideFloat(-1, screen_height);
                let _pipe$32 = max(_pipe$22, 0);
                return min(_pipe$32, 0.7);
              })(), (() => {
                let _pipe$22 = 0.45 - progress * 0.6;
                return max(_pipe$22, 0);
              })(), (() => {
                let _pipe$22 = 0.6 - progress * 0.56;
                return max(_pipe$22, 0.095);
              })());
              let _pipe$3 = unwrap2(_pipe$2, black);
              return to_css_rgba_string(_pipe$3);
            })())
          ])),
          (() => {
            let _pipe$2 = text3(toList([
              attribute2("x", (() => {
                let _pipe$22 = screen_width / 2;
                return float_to_string(_pipe$22);
              })()),
              attribute2("y", (() => {
                let _pipe$22 = screen_height * 0.95;
                return float_to_string(_pipe$22);
              })()),
              attribute2("pointer-events", "none"),
              style("text-anchor", "middle"),
              style("font-weight", "bold"),
              style("font-size", "1px"),
              style("font-family", '"cubano", monaco, courier'),
              style("text-shadow", "-1px 0 black, 0 1px black, 1px 0 black, 0 -1px black, -2px 2px black, -1.8px 1.8px black, -1.6px 1.6px black, -1.5px 1.5px black, -1px 1px black, -3px 3px black, -2px 2px black, -1px 1px black"),
              style("fill", (() => {
                let _pipe$22 = from_rgb(0.9, 1, 0.86);
                let _pipe$3 = unwrap2(_pipe$22, black);
                return to_css_rgba_string(_pipe$3);
              })())
            ]), (() => {
              let _pipe$22 = lucy_y;
              let _pipe$3 = truncate(_pipe$22);
              return to_string(_pipe$3);
            })() + "m");
            return svg_scale_xy(_pipe$2, 1, -1);
          })(),
          (() => {
            let _pipe$2 = g(toList([]), toList([
              svg_summary_of_collected_diamonds,
              svg_diamonds,
              svg_previously_collected_diamond_animation,
              svg_previously_bounced_on_cloud_animation,
              (() => {
                let _pipe$22 = svg_lucy(lucy_y_per_second < -0.8);
                let _pipe$3 = svg_scale_each(_pipe$22, 0.5);
                let _pipe$4 = svg_rotate(_pipe$3, lucy_angle);
                return svg_translate(_pipe$4, lucy_x, lucy_y);
              })(),
              svg_environment
            ]));
            return svg_translate(_pipe$2, screen_width / 2, negate(screen_height * 0.56) - (() => {
              let _pipe$3 = lucy_y;
              return max(_pipe$3, 0);
            })());
          })()
        ]));
      } else {
        let lucy_is_hovered = $2.lucy_is_hovered;
        _block$1 = g(toList([on_mouse_down(new MenuLucyPressed)]), toList([
          rect(toList([
            attribute2("y", "-100%"),
            attribute2("width", "100%"),
            attribute2("height", "100%"),
            attribute2("fill", (() => {
              let _pipe2 = from_rgb(0, 0.45, 0.6);
              let _pipe$1 = unwrap2(_pipe2, black);
              return to_css_rgba_string(_pipe$1);
            })())
          ])),
          (() => {
            let _pipe2 = text3(toList([
              attribute2("x", (() => {
                let _pipe3 = screen_width / 2;
                return float_to_string(_pipe3);
              })()),
              attribute2("y", (() => {
                let _pipe3 = screen_height * 0.75;
                return float_to_string(_pipe3);
              })()),
              attribute2("pointer-events", "none"),
              style("text-anchor", "middle"),
              style("font-weight", "bold"),
              style("font-size", "1.1px"),
              style("font-family", '"cubano", monaco, courier'),
              style("fill", "white")
            ]), "←/→ or a/d");
            return svg_scale_xy(_pipe2, 1, -1);
          })(),
          (() => {
            let _pipe2 = g(toList([]), toList([
              svg_environment,
              (() => {
                let _block$2;
                if (lucy_is_hovered) {
                  let _pipe4 = svg_lucy(true);
                  _block$2 = svg_rotate(_pipe4, pi2() * 0.05);
                } else {
                  _block$2 = svg_lucy(false);
                }
                let _pipe3 = _block$2;
                return svg_scale_each(_pipe3, 1.5);
              })(),
              circle(toList([
                on_mouse_enter(new MenuLucyHoverStarted),
                on_mouse_leave(new MenuLucyHoverEnded),
                attribute2("fill", (() => {
                  let _pipe3 = from_rgba(1, 1, 1, 0.01);
                  let _pipe$1 = unwrap2(_pipe3, black);
                  return to_css_rgba_string(_pipe$1);
                })()),
                attribute2("r", "1.5")
              ]))
            ]));
            return svg_translate(_pipe2, screen_width / 2, negate(screen_height * 0.5));
          })()
        ]));
      }
      let _pipe = _block$1;
      return svg_scale_xy(_pipe, divideFloat(svg_width, screen_width), negate(divideFloat(svg_height, screen_height)));
    })()
  ]));
}
function star_positions() {
  let _pipe = range((() => {
    let _pipe2 = screen_width * -1;
    return truncate(_pipe2);
  })(), (() => {
    let _pipe2 = screen_width;
    return truncate(_pipe2);
  })());
  return flat_map(_pipe, (x_thirds) => {
    let x = (() => {
      let _pipe$12 = x_thirds;
      return identity(_pipe$12);
    })() * 0.5;
    let _block;
    let _pipe$1 = 12432058259.32481 * (() => {
      let _pipe$12 = x_thirds;
      return identity(_pipe$12);
    })();
    let _pipe$2 = modulo(_pipe$1, 1);
    _block = unwrap2(_pipe$2, 0);
    let y_start_randomness = _block;
    let y_start = goal_y * 0.3 + y_start_randomness * 12;
    let _pipe$3 = range(0, (() => {
      let _pipe$32 = goal_y * 0.12;
      return truncate(_pipe$32);
    })());
    return map(_pipe$3, (y_index) => {
      let _block$1;
      let _pipe$4 = 12432058259.207561 * y_start_randomness;
      let _pipe$5 = modulo(_pipe$4, 1);
      _block$1 = unwrap2(_pipe$5, 0);
      let randomness = _block$1;
      return [
        x,
        y_start + (() => {
          let _pipe$6 = y_index;
          let _pipe$7 = identity(_pipe$6);
          let _pipe$8 = power2(_pipe$7, 0.5);
          return unwrap2(_pipe$8, 0);
        })() * 15 + randomness * 10
      ];
    });
  });
}
var diagonal_diamond_size = 0.42;
var lucy_radius = 0.5;
var cloud_positions = /* @__PURE__ */ toList([
  [-4, -4],
  [-6, -2],
  [-1.2, 1.8],
  [4.9, 3.8],
  [1.2, 4],
  [-1.5, 5.4],
  [1.2, 6.1],
  [3.2, 9.1],
  [-3.5, 9.3],
  [0, 9.8],
  [-3.1, 11.3],
  [3.1, 12.3],
  [-2.7, 14],
  [2.5, 15],
  [0, 18],
  [-0.2, 21],
  [0.1, 24],
  [4.1, 23],
  [4.1, 26],
  [2, 27],
  [0, 28],
  [-2, 29],
  [-4, 30.05],
  [-4, 30.05],
  [-6, 32.05],
  [-4.1, 33],
  [-4.1, 36],
  [-2, 37],
  [0.2, 39],
  [-0.1, 34],
  [0, 41],
  [6, 44],
  [-6, 47],
  [2, 49],
  [-6, 51],
  [-5.4, 52.6],
  [2, 53],
  [-5.6, 56.9],
  [-5.8, 56.5],
  [2, 59.5],
  [0, 62],
  [0.4, 63.6],
  [0.7, 64.1],
  [-6, 66.6],
  [4.4, 69.6],
  [4.7, 70.1],
  [-4.4, 73.6],
  [-4.7, 74.1],
  [4.4, 77.2],
  [-6.7, 78.7],
  [4.4, 79.6],
  [4.7, 80.1],
  [0.1, 81.1],
  [0, 81.6],
  [-0.2, 81.1],
  [-1.7, 82.7],
  [-0.9, 83.1],
  [-3.9, 84.1],
  [3.9, 84.1],
  [-2.9, 85.1],
  [2.9, 85.1],
  [-1.9, 86.1],
  [1.9, 86.1],
  [-0.9, 87.1],
  [0.9, 87.1],
  [0, 90.1],
  [0.2, 93.1],
  [-3.7, 93.2],
  [3.4, 93.2],
  [-0.2, 95.7],
  [0.7, 95.9],
  [-1.2, 96],
  [-5.1, 96],
  [4, 96.1],
  [-0.8, 96.1],
  [0.3, 96.1],
  [0.4, 96.3],
  [-1.1, 96.5],
  [-0.6, 96.6],
  [0.1, 96.7],
  [-1.9, 97],
  [-0.4, 97.1]
]);
function svg_environment() {
  let svg_bird$1 = svg_bird();
  let svg_birds = g(toList([]), (() => {
    let _pipe = toList([
      [4.4, -4.4, 1.5],
      [-2.9, -4.3, 1.1],
      [2.4, -3.7, 0.5],
      [5.4, -3.4, 1.5],
      [2, 1, 1],
      [5, 3, 0.5],
      [-5.2, 5, 0.5],
      [4, 7, 1.2],
      [-4.8, 8, 1.2],
      [4.6, 9, 0.3],
      [1, 11, 0.4],
      [-4, 12.8, 0.4],
      [1.4, 14, 0.9],
      [1, 16, 0.9],
      [4.6, 18.5, 0.4],
      [0, 20, 0.9],
      [-4, 122.8, 0.4],
      [1.4, 24, 0.9],
      [-4.8, 24.1, 1],
      [-4, 25.6, 0.6],
      [1, 26, 0.9],
      [4.9, 30.2, 0.9]
    ]);
    return map(_pipe, (position) => {
      let x;
      let y;
      let scale;
      x = position[0];
      y = position[1];
      scale = position[2];
      let _pipe$1 = svg_bird$1;
      let _pipe$2 = svg_scale_each(_pipe$1, scale);
      return svg_translate(_pipe$2, x, y);
    });
  })());
  let svg_stars = g(toList([]), (() => {
    let _pipe = star_positions();
    return map(_pipe, (star_position) => {
      let x;
      let y;
      x = star_position[0];
      y = star_position[1];
      let _pipe$1 = svg_small_star();
      return svg_translate(_pipe$1, x, y);
    });
  })());
  let svg_cloud$1 = svg_cloud();
  let clouds_svg = g(toList([]), (() => {
    let _pipe = cloud_positions;
    return map(_pipe, (position) => {
      let x;
      let y;
      x = position[0];
      y = position[1];
      let _pipe$1 = svg_cloud$1;
      return svg_translate(_pipe$1, x, y);
    });
  })());
  let svg_fog$1 = svg_fog();
  let fog_svg = g(toList([]), (() => {
    let _pipe = toList([
      [2.4, -4.4, 1.5],
      [2, 1, 1],
      [-2, 5, 0.5],
      [4, 10, 1.2],
      [4.6, 14, 0.2],
      [1, 20, 0.2],
      [-4, 24.8, 0.4],
      [1.4, 30, 0.9],
      [1, 60, 0.9],
      [4.6, 84.5, 0.4],
      [0, 100, 0.9]
    ]);
    return map(_pipe, (position) => {
      let x;
      let y;
      let scale;
      x = position[0];
      y = position[1];
      scale = position[2];
      let _pipe$1 = svg_fog$1;
      let _pipe$2 = svg_scale_each(_pipe$1, scale);
      return svg_translate(_pipe$2, x, y);
    });
  })());
  return g(toList([]), toList([
    clouds_svg,
    fog_svg,
    svg_stars,
    svg_birds,
    (() => {
      let _pipe = svg_moon();
      return svg_translate(_pipe, 0, 101);
    })()
  ]));
}
var cloud_width = 2;
var cloud_height = 1.1;
function update2(state, event4, music_audio, cloud_bounce_audio, diamond_collect_audio) {
  if (event4 instanceof Resized) {
    return [
      new State(state.specific, (() => {
        let _pipe = innerWidth(self());
        return identity(_pipe);
      })(), (() => {
        let _pipe = innerHeight(self());
        return identity(_pipe);
      })(), state.held_down_left, state.held_down_right, state.lucy_y_highscore),
      none()
    ];
  } else if (event4 instanceof SimulationTickPassed) {
    let $ = state.specific;
    if ($ instanceof Running2) {
      let maybe_previous_simulation_time = $.previous_simulation_time;
      let lucy_angle = $.lucy_angle;
      let lucy_x = $.lucy_x;
      let lucy_y = $.lucy_y;
      let lucy_angle_per_second = $.lucy_angle_per_second;
      let lucy_x_per_second = $.lucy_x_per_second;
      let lucy_y_per_second = $.lucy_y_per_second;
      let lucy_y_maximum = $.lucy_y_maximum;
      let maybe_previously_bounced_on_cloud = $.previously_bounced_on_cloud;
      let maybe_previously_collected_diamond = $.previously_collected_diamond;
      let remaining_diamond_positions = $.remaining_diamond_positions;
      let _block;
      let $1 = state.held_down_left;
      let $2 = state.held_down_right;
      if ($1) {
        if ($2) {
          _block = 0;
        } else {
          _block = -1;
        }
      } else if ($2) {
        _block = 1;
      } else {
        _block = 0;
      }
      let effective_held_x_direction = _block;
      let current_simulation_time = (() => {
        let _pipe2 = getTime(now());
        return identity(_pipe2);
      })() / 1000;
      let seconds_passed = (() => {
        if (maybe_previous_simulation_time instanceof Some) {
          let previous_simulation_time = maybe_previous_simulation_time[0];
          return current_simulation_time - previous_simulation_time;
        } else {
          return (() => {
            let _pipe2 = globalThis.Math.trunc(1000 / 60);
            return identity(_pipe2);
          })() / 1000;
        }
      })() * 3.5;
      let _block$1;
      let _pipe = lucy_y_per_second - 1 * seconds_passed;
      _block$1 = max(_pipe, -2.2);
      let new_lucy_y_per_second = _block$1;
      let new_lucy_x_per_second = lucy_x_per_second * (1 - 0.2 * seconds_passed) + effective_held_x_direction * (4.4 - absolute_value(lucy_x_per_second + effective_held_x_direction * 2.2)) * 3 * seconds_passed;
      let new_lucy_y = lucy_y + new_lucy_y_per_second * seconds_passed;
      let new_lucy_x_not_wrapped = lucy_x + new_lucy_x_per_second * seconds_passed;
      let _block$2;
      let $3 = new_lucy_x_not_wrapped < negate(screen_width / 2 + lucy_radius);
      if ($3) {
        _block$2 = new_lucy_x_not_wrapped + (screen_width + lucy_radius * 2);
      } else {
        let $42 = new_lucy_x_not_wrapped > screen_width / 2 + lucy_radius;
        if ($42) {
          _block$2 = new_lucy_x_not_wrapped - (screen_width + lucy_radius * 2);
        } else {
          _block$2 = new_lucy_x_not_wrapped;
        }
      }
      let new_lucy_x = _block$2;
      let _block$3;
      let $4 = new_lucy_y_per_second > 0;
      if ($4) {
        _block$3 = new None;
      } else {
        let _pipe$1 = cloud_positions;
        let _pipe$2 = find2(_pipe$1, (cloud_position) => {
          let cloud_x;
          let cloud_y;
          cloud_x = cloud_position[0];
          cloud_y = cloud_position[1];
          return absolute_value(new_lucy_y - cloud_y) <= cloud_height / 2 && absolute_value(new_lucy_x - cloud_x) <= cloud_width / 2;
        });
        _block$3 = from_result(_pipe$2);
      }
      let lucy_falls_on_cloud = _block$3;
      let _block$4;
      if (lucy_falls_on_cloud instanceof Some) {
        _block$4 = 2.59;
      } else {
        _block$4 = new_lucy_y_per_second;
      }
      let new_lucy_y_per_second$1 = _block$4;
      let _block$5;
      if (effective_held_x_direction === 0) {
        _block$5 = lucy_angle_per_second;
      } else {
        _block$5 = effective_held_x_direction * -1.2;
      }
      let new_lucy_angle_per_second = _block$5;
      let $5 = new_lucy_y < negate(screen_height * 0.9);
      if ($5) {
        return [
          new State(initial_running_state_specific, state.window_width, state.window_height, state.held_down_left, state.held_down_right, lucy_y_maximum),
          none()
        ];
      } else {
        let _block$6;
        if (lucy_falls_on_cloud instanceof Some) {
          let $72 = play(cloud_bounce_audio);
          _block$6 = undefined;
        } else {
          _block$6 = undefined;
        }
        let $6 = _block$6;
        let _block$7;
        let _pipe$1 = remaining_diamond_positions;
        let _pipe$2 = find2(_pipe$1, (remaining_diamond_position) => {
          let diamond_x;
          let diamond_y;
          diamond_x = remaining_diamond_position[0];
          diamond_y = remaining_diamond_position[1];
          return absolute_value(new_lucy_y - diamond_y) <= diagonal_diamond_size * 1.55 && absolute_value(new_lucy_x - diamond_x) <= diagonal_diamond_size * 1.55;
        });
        _block$7 = from_result(_pipe$2);
        let maybe_collected_diamond = _block$7;
        let _block$8;
        if (maybe_collected_diamond instanceof Some) {
          let $8 = play(diamond_collect_audio);
          _block$8 = undefined;
        } else {
          _block$8 = undefined;
        }
        let $7 = _block$8;
        return [
          new State(new Running2(new Some(current_simulation_time), lucy_angle + new_lucy_angle_per_second * seconds_passed, new_lucy_x, lucy_y + new_lucy_y_per_second$1 * seconds_passed, new_lucy_angle_per_second, new_lucy_x_per_second, new_lucy_y_per_second$1, (() => {
            let _pipe$3 = lucy_y_maximum;
            return max(_pipe$3, new_lucy_y);
          })(), (() => {
            if (lucy_falls_on_cloud instanceof Some) {
              let bounced_on_cloud = lucy_falls_on_cloud[0];
              return new Some(new AnimatedStart(current_simulation_time, bounced_on_cloud));
            } else {
              return maybe_previously_bounced_on_cloud;
            }
          })(), (() => {
            if (maybe_collected_diamond instanceof Some) {
              let collected_diamond = maybe_collected_diamond[0];
              return new Some(new AnimatedStart(current_simulation_time, collected_diamond));
            } else {
              return maybe_previously_collected_diamond;
            }
          })(), (() => {
            if (maybe_collected_diamond instanceof Some) {
              let collected_position = maybe_collected_diamond[0];
              let _pipe$3 = remaining_diamond_positions;
              return filter(_pipe$3, (remaining_diamond_position) => {
                return !isEqual(remaining_diamond_position, collected_position);
              });
            } else {
              return remaining_diamond_positions;
            }
          })()), state.window_width, state.window_height, state.held_down_left, state.held_down_right, state.lucy_y_highscore),
          none()
        ];
      }
    } else {
      return [state, none()];
    }
  } else if (event4 instanceof KeyPressed) {
    let key2 = event4[0];
    let $ = play(music_audio);
    let $1 = key_as_x_direction(key2);
    if ($1 instanceof Some) {
      let $2 = $1[0];
      if ($2 instanceof Left) {
        return [
          new State(state.specific, state.window_width, state.window_height, true, state.held_down_right, state.lucy_y_highscore),
          none()
        ];
      } else {
        return [
          new State(state.specific, state.window_width, state.window_height, state.held_down_left, true, state.lucy_y_highscore),
          none()
        ];
      }
    } else {
      return [state, none()];
    }
  } else if (event4 instanceof KeyReleased) {
    let key2 = event4[0];
    let $ = key_as_x_direction(key2);
    if ($ instanceof Some) {
      let $1 = $[0];
      if ($1 instanceof Left) {
        return [
          new State(state.specific, state.window_width, state.window_height, false, state.held_down_right, state.lucy_y_highscore),
          none()
        ];
      } else {
        return [
          new State(state.specific, state.window_width, state.window_height, state.held_down_left, false, state.lucy_y_highscore),
          none()
        ];
      }
    } else {
      return [state, none()];
    }
  } else if (event4 instanceof MenuLucyHoverStarted) {
    return [
      new State(new Menu(true), state.window_width, state.window_height, state.held_down_left, state.held_down_right, state.lucy_y_highscore),
      none()
    ];
  } else if (event4 instanceof MenuLucyHoverEnded) {
    return [
      new State(new Menu(false), state.window_width, state.window_height, state.held_down_left, state.held_down_right, state.lucy_y_highscore),
      none()
    ];
  } else {
    let $ = play(music_audio);
    return [
      new State(initial_running_state_specific, state.window_width, state.window_height, state.held_down_left, state.held_down_right, state.lucy_y_highscore),
      none()
    ];
  }
}
function main() {
  let cloud_bounce_audio = newAudio("cloud-bounce.mp3");
  let diamond_collect_audio = newAudio("diamond-collect-simple.mp3");
  let music_audio = newAudio("music.mp3");
  let _block;
  let _pipe = svg_environment();
  _block = as_static_lustre_component(_pipe);
  let svg_environment$1 = _block;
  let app = application((_) => {
    return init();
  }, (event4, state) => {
    return update2(event4, state, music_audio, cloud_bounce_audio, diamond_collect_audio);
  }, (state) => {
    return view(state, svg_environment$1);
  });
  setAttribute2(body(), "style", "margin: 0; background: black");
  let $ = start3(app, "#app", undefined);
  if (!($ instanceof Ok)) {
    throw makeError("let_assert", FILEPATH2, "moon", 52, "main", "Pattern match failed, no pattern matched the value.", {
      value: $,
      start: 1420,
      end: 1469,
      pattern_start: 1431,
      pattern_end: 1436
    });
  }
  return;
}

// .lustre/build/moon.mjs
main();
