"use strict";

/////////////////////////////
//     WELCOME TO RES!     //
//  WELCOME... TO DIE!!!!  //
/////////////////////////////

// This document aims to be the canonical interpretation of Res in Javascript.
// I had a prototype of Res where I basically implemented my ideas directly;
// it had a lot of repeated code, so I have rewritten it from scratch here.

//////// [TC] TABLE OF CONTENTS ////////

/*
The table of contents is used as such: You can Ctrl+F the bracketed number
beside each item to jump to that section of the code.

[TC] Table of contents (you are here)
[00] An overview of Res
[01] Miscellaneous helper functions
[02] Res infrastructure
[03] Built-in operators
[04] Built-in readmodes
[05] Default namespace
*/



//////// [00] AN OVERVIEW OF RES ////////

/*
Res is a silly programming language.

It's a stack-based language with single-character instructions. Each
instruction is read from the program, moving from left to right, and
interpreted based on that character's contents in the 'namespace', a table
mapping single characters to Res items. Four of the types can exist on the
stack; the others have different behavior and can exist only in the namespace.

The 'data' types of Res item, those that can go on the stack, are:
- MISC. This contains weird unary types that don't fit elsewhere, like NULL.
- NUM. It's a number, probably a float (though that's implementation-specific).
- CHAR. A single character, like 'a' or '&' or '\0'.
- LIST. A variable-size list of Res items of any type.
'Calling' these items (referencing them in the namespace) just puts a copy on
the stack.

The types that only exist in the namespace are:
- OPERATOR. An item containing some operation. Calling it does the operation.
- READMODE. An item that changes the semantics of how the characters in the
code block are interpreted: instead of being looked up in the namespace, they
go through the code in the readmode instead. Calling it starts the readmode.
- NAMESPACE. A sub-namespace. Calling it switches the current namespace to this
one.

(I really hope someone else writes a better tutorial than this.)

A string in Res is either a single CHAR or a LIST containing only CHARs. One of
the special qualities of Res is that a code block is just a string!
*/



//////// [01] MISCELLANEOUS HELPER FUNCTIONS ////////

// It's a function about nothing! This is used in a surprising variety of
// different places in this implementation.
function nop() {
  // What's the deal with airline food?
}

// Returns a recursively flattened copy of an array.
function flatten(ary) {
  return [].concat.apply([],
    ary.map(function(o) {return Array.isArray(o) ? flatten(o) : o;}));
}

// Returns an array containing a range of numbers. Uses the same syntax as
// the range function from Python.
function range(a) {
  let start = arguments.length > 1 ? a : 0;
  let end = arguments.length > 1 ? arguments[1] : a;
  let step = arguments.length > 2 ? arguments[2] : 1;
  let sgn = Math.sign(step);
  if (!sgn) return [];
  let list = [];
  for (let i = start; i*sgn < end*sgn; i += step) {
    list.push(i);
  }
  return list;
}

// Returns a function composing two functions together in sequence, each
// being passed the same argument.
function seq(f, g) { return function(x) {f(x); g(x);}; }

// Slices a list at a position and returns both halves.
function doubleSlice(list, n) {
  return [list.slice(0, n), list.slice(n)];
}

// 'Real' modulus.
function mod(a, b) {
  return a - b * Math.floor(a / b);
}

// Gets an item from the list at a given index, working backwards from the end
// of the list if the index is negative (similar to Python semantics).
// Does no bounds-checking, so might have unexpected behavior if idx is not
// in [-list.length, list.length).
function listGet(list, idx) { return list.slice(idx)[0]; }

// Rotates a list by a given number of elements.
let rotate = (l, n) => (n %= l.length, l.slice(n).concat(l.slice(0, n)));



//////// [02] RES INFRASTRUCTURE ////////

// A very basic output class. Provides the Res context with functions for
// printing regular text output, as well as errors. This will probably become
// more sophisticated as I develop the language.
//
// - printOut takes an object (the output, which can be a Res item or a string).
// - printErr takes the output, as well as an object representing the context.
// The context can be used for printing backtraces or other information if
// desired.
function ResLogger(printOut, printErr) {
  this.printOut = printOut.bind(this);
  this.printErr = printErr.bind(this);
}

// The default output just puts everything on the console. Web interpreters or
// other usages will want to use different functions.
let defaultLogger = new ResLogger(
  function(obj) {
    console.log(obj.toString());
  },
  function(obj, ctx) {
    console.log(obj.toString());
  }
);

// Now time for the good stuff.

// This object contains an enum for all the types of Res item, as well as an
// array containing the names of the types. The array is automatically filled
// in using a for loop.
const ResType = {
  MISC: 0,       // The miscellaneous type. See miscTypes below.
  NUM: 1,        // The NUM type, containing a number.
  CHAR: 2,       // The CHAR type, containing a character.
  LIST: 3,       // The LIST type, containing a list of items.
  OPERATOR: 4,   // The OPERATOR type, which does something when called.
  READMODE: 5,   // The READMODE type, which does readmode things.
  NAMESPACE: 6,  // The NAMESPACE type, containing lots more items.
  miscTypes: {
    NULL: 0,     // NULL is a type that isn't any other type. Might be useful.
    BOOKEND: 1,  // BOOKEND is used for list construction.
    names: ["NULL", "BOOKEND"]
  },
  names: new Array(7)
};
for (let k in ResType) {
  if (typeof ResType[k] == "number")
    ResType.names[ResType[k]] = k;
}

// Some 'code quality' functions to use to check for the various misc types.
function isResNull(obj) {
  return obj.type == ResType.MISC && obj.content == ResType.miscTypes.NULL;
}
function isBookend(obj) {
  return obj.type == ResType.MISC && obj.content == ResType.miscTypes.BOOKEND;
}

// The ResItem class contains a single item.
// The type parameter is a number corresponding to an entry in ResType. This
// tells the rest of the program how to interpret the content. If the type and
// the content are mismatched, very bad things will happen.
function ResItem(type, content, name = "") {
  this.type = type;
  this.content = content;
  this.name = name;

  // Returns a string with the name of this item's type.
  this.typeName = function() {
    if (this.type == ResType.MISC)
      return ResType.miscTypes.names[this.content];
    return ResType.names[this.type];
  }

  // Returns a new copy of this object. Recursively deep-copies NAMESPACEs and
  // LISTs; otherwise simply copies over the content.
  this.copy = function() {
    let newObj = new ResItem(this.type, null);

    switch (this.type) {
      case ResType.LIST:
        newObj.content = [];
        for (let elem of this.content)
          newObj.content = newObj.content.concat(elem.copy());
        break;

      case ResType.NAMESPACE:
        newObj.content = {};
        for (let k in this.content) {
          newObj.content[k] = this.content[k].copy();
        }
        break;

      default:
        newObj.content = this.content;
    }

    return newObj;
  }

  // Returns a string representation of this object.
  // For data items, displays the contents; otherwise just returns (TYPENAME).
  this.display = function(pad = '') {
    let str = pad;
    switch (this.type) {
      case ResType.LIST:
        str += "[";
        let first = true;
        for (let elem of this.content) {
          str += elem.display(first ? '' : ' ');
          first = false;
        }
        str += "]";
        break;
      case ResType.NUM:
        str += this.content;
        break;
      case ResType.CHAR:
        str += "'" + this.content + "'";
        break;
      default:
        str += "(" + this.typeName() + ")";
    }
    return str;
  }
}
ResItem.prototype.toString = function() { return this.display(); }

// A special pretty-print function, used for Res pretty-print.
function prettyString(obj) {
  let ps = function(obj) {
    switch (obj.type) {
      case ResType.CHAR:
      case ResType.NUM:
        return obj.content;
      case ResType.LIST:
        return obj.display();
      default:
        return "(" + obj.typeName() + ")";
    }
  }
  switch(obj.type) {
    case ResType.LIST:
      return obj.content.map(ps).join('');
    default:
      return ps(obj);
  }
}

// A number of helper functions that make it easier to construct new Res items
// of specific types.
function resNullItem()       { return new ResItem(ResType.MISC, ResType.miscTypes.NULL); }
function resBookendItem()    { return new ResItem(ResType.MISC, ResType.miscTypes.BOOKEND); }
function resNumItem(n)       { return new ResItem(ResType.NUM, n); }
function resCharItem(c)      { return new ResItem(ResType.CHAR, c); }
function resListItem(l)      { return new ResItem(ResType.LIST, l); }
function resOperItem(op)     { return new ResItem(ResType.OPERATOR, op); }
function resReadmodeItem(rm) { return new ResItem(ResType.READMODE, rm); }
function resNamespaceItem(n) { return new ResItem(ResType.NAMESPACE, n); }
function resStringItem(s)    {
  return new ResItem(ResType.LIST, Array.prototype.map.call(s, function(c) {
    return resCharItem(c);
  }));
}

// Resolves a namespace path, creating blank namespaces where appropriate.
// This function is complicated. It tries to step through the namespace
// following the given path until it encounters something that is not a
// namespace, at which point it stops and returns an object containing the
// results.
//
// Here's what the object returned contains:
// - pathHead is the portion of the path ending with the namespace containing
// the item it stopped on.
// - namespace contains that namespace item.
// - name holds the single character with the name of the item it found.
// - item holds that actual item.
// - If there was a portion of the path remaining afterward, pathTail contains
// the remnants. This is used to check whether the full path was actually
// resolved.
function resolvePath(path, namespace) {
  let ret = {
    pathHead: "",  // pathname leading to namespace
    namespace: namespace,
    name: '',      // single character name of content in that namespace
    item: namespace,
    pathTail: ""  // remaining path
  };
  let cont;
  let i = 0;
  for (let c of path) {
    ret.pathHead += ret.name;
    ret.namespace = ret.item;
    ret.name = c;
    ret.item = ret.namespace.content[c];
    i++;
    if (!ret.item) {
      // this namespace doesn't have that element, so make a blank namespace
      ret.namespace.content[c] = resNamespaceItem({});
      ret.item = ret.namespace.content[c];
    }
    if (ret.item.type != ResType.NAMESPACE) {
      ret.pathTail = path.slice(i);
      return ret;
    }
  }
  return ret;
}

// Takes an item and tries to make a string out of it. Returns null if the item
// doesn't represent a valid string; otherwise returns a string.
//
// - If item is a CHAR, the string simply contains that character.
// - If it's a LIST, it tries to concatenate together all the CHARs in that
// list, failing and returning null if it encounters an element that isn't a
// CHAR.
// - Otherwise, it returns null.
function makeString(item) {
  let s = "";
  switch (item.type) {
    case ResType.CHAR:
      s = item.content;
      break;
    case ResType.LIST:
      for (let chr of item.content) {
        if (chr.type == ResType.CHAR)
          s += chr.content;
        else
          return null;
      }
      break;
    default:
      return null;
  }
  return s;
}

// A ResBlock contains a block of Res code and maintains a position within that
// code and a current readmode.
function ResBlock(str, label = "", posn = 0, rm = null) {
  this.code = str;
  this.label = label;
  this.posn = posn;
  this.readmode = rm;
  // Returns the current character, incrementing the code position.
  this.next = function() { return this.code[this.posn++]; }
  // Returns the current character without incrementing.
  this.peek = function() { return this.code[this.posn]; }
  // Helper function to see if the end of the block has been reached.
  this.done = function() { return this.posn >= this.code.length; }
}

// This object maintains a stack of ResBlocks, with some helper functions.
function ResBlockStack() {
  this.stack = [];
  // Stack operations.
  this.push = function(newBlock) { this.stack.push(newBlock); }
  this.current = function() { return this.stack[this.stack.length-1]; }
  this.pop = function() { return this.stack.pop(); }
  this.length = function() { return this.stack.length; }

  // 'Smartly' pushes a new block, popping and returning the prior one first if
  // it is done. (Returns null otherwise.)
  // This is 'tail call optimization' of a sort - the end result is that, if the
  // last operation in a code block pushes another block, the block stack
  // won't grow in size.
  this.smartPush = function(newBlock) {
    let ret = null;
    if (this.current().done()) {
      ret = this.stack.pop();
      if (!newBlock.label)
        newBlock.label = ret.label;
    }
    this.stack.push(newBlock);
    return ret;
  }

  // These functions try to return the current character of the current block,
  // either incrementing or not depending on the function.
  this.next = function() { return (this.current() ? this.current().next() : null); }
  this.peek = function() { return (this.current() ? this.current().peek() : null); }
}

// The Res context is the workhorse of the implementation. This is the thing
// that actually interprets the program.
function ResContext(prgmText, namespace, logger = defaultLogger) {
  this.origText = prgmText;
  this.origNamespace = namespace;
  this.blockStack = new ResBlockStack();
  this.blockStack.push(new ResBlock(prgmText));
  this.namespace = namespace.copy();
  this.logger = logger;
  this.stackStack = [[]];
  Object.defineProperty(this, 'stack', {
    get: function() {
      return this.stackStack[this.stackStack.length-1];
    },
    set: function(newStk) {
      this.stackStack[this.stackStack.length-1] = newStk;
    }
  });
  this.errored = false;

  // Returns the stack as a Res LIST.
  this.stackAsList = function() {
    return resListItem(this.stack);
  }

  // Returns a string display of the stack. Useful for debugging and REPLs.
  this.displayStack = function() {
    return this.stackAsList().display();
  }

  // Resets the state of the Res context, optionally changing the program
  // text or namespace.
  this.reset = function(newText = null, newNamespace = null) {
    if (newText !== null) {
      this.origText = newText;
    }
    if (newNamespace !== null) {
      this.origNamespace = newNamespace;
    }
    this.blockStack = new ResBlockStack();
    this.blockStack.push(new ResBlock(this.origText));
    this.namespace = this.origNamespace.copy();
    this.stack = [];
    this.errored = false;
  }

  // Runs a new program, starting with the stack and namespace that the
  // previous program ended with. Useful for REPLs.
  this.continue = function(newText) {
    this.blockStack = new ResBlockStack();
    this.blockStack.push(new ResBlock(newText));
    this.errored = false;
  }

  // Complains. This prints a message out through the logger and sets the
  // errored flag, preventing further execution.
  this.complain = function(a, b = null) {
    let scope, posn, msg;
    if (b === null) {
      scope = "";
      msg = a;
    } else {
      scope = a;
      msg = b;
    }
    posn = "(" + this.blockStack.current().posn + "): ";
    this.logger.printErr("[WHOOPS] " + scope + posn + msg, this);
    this.errored = true;
  }

  // Increments the current block's position, walking the namespace until it
  // retrieves a non-namespace item (or the block ends). Because we want the
  // block to maintain its own program position, we can't easily use resolvePath
  // for this purpose.
  //
  // Returns a ResItem. If the item's type is null, that means something
  // unexpected happened; either the block is finished (content is null) or
  // there was an error (content is a string describing the error). Otherwise,
  // the item is whatever the path describes.
  this.nextItem = function() {
    let item = this.namespace;
    let refer = "";
    while (item.type == ResType.NAMESPACE) {
      let nxt = this.blockStack.next();  // the next character to reference into
      if (nxt === undefined) {  // block runout - end of block reached
        let e = null;  // null signals that the block ended normally
        if (refer)  // otherwise there's a problem
          e = "block ended with unfinished reference " + refer;
        return new ResItem(null, e);
      }

      refer += nxt;
      item = item.content[nxt];
      if (item === undefined)
        return new ResItem(null, "undefined reference " + refer);
    }
    return item;
  }

  // Steps the context forward.
  // If the current block has a readmode, takes one character and operates on
  // it using the readmode. Otherwise, resolves one item (using nextItem) and
  // does whatever's appropriate with it.
  // Returns true if the program is done (either it finished or there was an
  // error), false otherwise.
  this.step = function() {
    if (this.errored || this.blockStack.length() == 0) return true;

    if (this.blockStack.current().readmode) {
      // If there's a readmode running, read the next character.
      // Visit the ResReadmode definition below to see how readmodes work.

      let chr = this.blockStack.next();
      this.blockStack.current().readmode.read(this, chr);

    } else {

      let item = this.nextItem();
      if (null === item) return true;  // This should never happen?

      switch (item.type) {
        case null:
          // null type means either a return from this block (content is null)
          // or a complaint (content contains message)
          if (item.content) {
            this.complain(item.content);
            return true;
          } else
            this.blockStack.pop();
          break;

        // If the item is a data item, copy it onto the stack.
        case ResType.MISC:
        case ResType.NUM:
        case ResType.CHAR:
        case ResType.LIST:
          this.stack.push(item.copy());
          break;

        // If the item is an operator, run it.
        // Visit the ResOperator definition below to see how operators work.
        case ResType.OPERATOR:
          item.content.run(this);
          break;

        // If the item is a readmode, open it.
        // Visit the ResReadmode definition below to see how readmodes work.
        case ResType.READMODE:
          item.content.open(this);
          break;

        default:
          this.complain("wasn't expecting an item of type " + item.typeName() +
            " or it's not supported");
          return true;
      }

    }

    return false;
  }

  // Runs the program until it halts.
  // Optionally, runs for a specified number of steps and then uses setInterval
  // to place a call to run the next set, in order to keep the Javascript
  // runtime from hanging on this function. Useful for web interpreters, I
  // think.
  this.run = function(numSteps = null) {
    let runSteps = function(ctx, n) {
      let steps = (n == null ? Infinity : n);
      for (let i = 0; i < steps; i++)
        if (ctx.step()) return;
      if (n !== null) {
        let boundF = runSteps.bind(this, ctx, n);
        //setInterval(20, runSteps, n);
        requestAnimationFrame(boundF);
      }
    };
    this.reset();
    runSteps(this, numSteps);
  }
}

// Context-related helper functions.

// Tries to get a number of operands off the stack. Returns either null, if
// there weren't enough on the stack, or a list containing the operands in the
// order they were on the stack.
function getOperands(fnName, ctx, n) {
  let stk = ctx.stack;
  if (stk.length < n) {
    ctx.complain(fnName, "expecting " + types.length + " operands");
    return null;
  }
  let opers = [];
  for (let i = 0; i < n; i++) { opers.unshift(stk.pop()); }
  return opers;
}

// Tries to get a number of operands off of the stack, and checks their types.
// Returns either null, if there was a problem, or a list containing the
// operands in the order they were on the stack.
// The list of types can contain two extra options in addition to the regular
// Res item types: -1 represents a string and will match a CHAR or LIST; -2
// will match any type. This allows typed operand lists with some untyped
// items.
function getTypedOperands(fnName, ctx, types) {
  let opers = getOperands(fnName, ctx, types.length);
  if (opers === null) return opers;

  for (let i = 0; i < types.length; i++) {
    let cond = (opers[i].type == types[i]);
    cond = cond || (types[i] == -1 &&
      (opers[i].type == ResType.CHAR || opers[i].type == ResType.LIST));
    cond = cond || (types[i] == -2);

    if (!cond) {
      let typeNames = types.map(function(t) {
        return t == -2 ? "any" : t == -1 ? "string" : ResType.names[t];
      }).join(', ');
      let itemTypes = opers.map(function(o) {
        return o.typeName();
      }).join(', ');
      ctx.complain(fnName, "bad operands (expecting " + typeNames + ";  got " +
        itemTypes + ")");

      // Put the operands back onto the stack before returning.
      // This will be useful for REPLs, where you might want to try something
      // else with the same operands.
      ctx.stack = ctx.stack.concat(opers);
      return null;
    }
  }

  return opers;
}

// Tries making a string from an item, complaining if it fails.
function tryMakeString(fnName, ctx, item) {
  let str = makeString(item);
  if (str === null) {
    ctx.complain(fnName, "item was not a valid string:\n" + item.display());
    return null;
  }

  return str;
}

// Tries resolving a path from an item, complaining if the path isn't a string
// or if the walk ended early.
function tryResolvePath(fnName, ctx, item) {
  let pathStr = tryMakeString(fnName, ctx, item);
  if (pathStr === null) return null;

  let result = resolvePath(pathStr, ctx.namespace);
  if (result.pathTail.length > 0) {
    ctx.complain(fnName, "path " + pathStr + " was not valid (" +
      result.item.typeName() + " was in the way at " +
      result.pathHead + result.name + ")");
    return null;
  }

  return result;
}

// Makes a list from the stack using Res semantics (every element until a
// bookend is encountered or the stack is empty) and puts it on the stack.
function listMake(ctx) {
  let contents = [];
  let stk = ctx.stack;
  while (stk.length > 0) {
    let e = stk.pop();
    if (isBookend(e)) break;
    contents.unshift(e);
  }
  stk.push(resListItem(contents));
}

// Looks downward from the top of the block-stack until it finds a block
// meeting the condition. Returns either null (if no such block was found) or
// [pre, post] made from the block-stack sliced at the position of the found
// block.
function returnUntil(ctx, condition) {
  let blocks = ctx.blockStack.stack;
  let blk;
  let rm = null;
  for (let i = -2; i >= -blocks.length; i--) {
    blk = listGet(blocks, i);
    if (condition(blk)) {
      rm = i+1;
      break;
    }
  }
  if (rm === null)
    return null;


  return {
    pre: blocks.slice(0, rm),
    post: blocks.slice(rm),
    current: blk
  };
}

// A not-implemented function for atomic-opers that are expected but not
// implemented.
function notImplementedOper(ctx) { ctx.complain(this.name, 'not implemented'); }



//////// [03] BUILT-IN OPERATORS ////////

// The content of an operator item. Contains, by default, some Res code and a
// function that puts a block with it onto the stack.
function ResOperator(str = "") {
  this.code = str;
  // Returns a ResBlock with this Res code.
  this.makeBlock = function() {
    return new ResBlock(this.code);
  }
  // Wraps this operator in a Res item and returns it.
  this.makeItem = function(name = "") {
    let item = resOperItem(this);
    this.name = name;
    item.name = name;
    return item;
  }
  // The default run function pushes a block with this code onto the stack.
  // This is used for Res operators made out of Res code. See below for an
  // alternative, atomicOper.
  this.run = function(ctx) {
    ctx.blockStack.smartPush(this.makeBlock());
  }
}

// This function is used to make 'atomic' operators - those that are defined
// in terms of Javascript, not Res blocks.
function atomicOper(f, name = "") {
  let op = new ResOperator();
  op.run = f.bind(op);
  return op.makeItem(name);
}

let operNop = atomicOper(nop, 'nop');

// Makes an operator from a given codeblock and puts it at a given path.
let operOperMake = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1, -1]);
  if (!opers) return;

  let [codeItem, pathItem] = opers;
  let code = tryMakeString(this.name, ctx, codeItem);
  if (!code) return;
  let result = tryResolvePath(this.name, ctx, pathItem);
  if (!result) return;

  let oper = new ResOperator(code);
  result.namespace.content[result.name] = oper.makeItem();
}, 'oper-make');

//// [03.01] The math operators, generated from a list because they all have
//// the same form.

let mathfns = [
  ['add',      function(a, b) {return a+b;}],
  ['subtract', function(a, b) {return a-b;}],
  ['multiply', function(a, b) {return a*b;}],
  ['divide',   function(a, b) {return a/b;}],
  ['modulus',  mod]
];
// mathStart takes a math function and returns a closure that can be used as
// the start function of an operator.
function mathStart(fn) {
  return function(ctx) {
    let opers = getTypedOperands(this.name, ctx, [ResType.NUM, ResType.NUM]);
    if (!opers) return;

    let [a, b] = opers;
    ctx.stack.push(resNumItem(fn(a.content, b.content)));
  }
}
let [operAdd, operSub, operMul, operDiv, operMod] = mathfns.map(function(f) {
  let [fnName, fn] = f;
  return atomicOper(mathStart(fn), fnName);
})

// Takes a number and pushes its negative.
let operNegate = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.NUM]);
  if (!opers) return;

  let [n] = opers;
  ctx.stack.push(resNumItem(-n.content));
}, 'negate');

// Takes two numbers and rearranges them so the greater is on the top of the
// stack.
let operMinmax = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.NUM, ResType.NUM]);
  if (!opers) return;

  let [lil, big] = opers.sort(function(a, b) {return a.content - b.content;});
  ctx.stack.push(lil);
  ctx.stack.push(big);
}, 'minmax');

//// [03.02] Character operators.

// Takes a character and returns its character code.
let operOrd = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.CHAR]);
  if (!opers) return;

  let [c] = opers;
  ctx.stack.push(resNumItem(c.content.codepointAt(0)));
}, 'ord');

// Takes a number and returns the character with that code.
let operChr = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.NUM]);
  if (!opers) return;

  let [n] = opers;
  ctx.stack.push(resCharItem(String.fromCharCode(n.content)));
}, 'chr');

//// [03.03] List operators.

// The operator used to make a list. See the listMake function above for
// more details on the semantics.
let operListMake = atomicOper(listMake, 'list-make');

// Concatenates two Res lists together, in the order they were on the stack,
// and pushes the result.
let operListConcat = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.LIST, ResType.LIST]);
  if (!opers) return;

  let [a, b] = opers;
  ctx.stack.push(resListItem(a.content.concat(b.content)));
}, 'list-concat');

// Slices a list into two at a given position. Follows the semantics of the
// Javascript list slice method.
let operListSlice = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.LIST, ResType.NUM]);
  if (!opers) return;

  let [list, n] = opers;
  let [pre, post] = doubleSlice(list.content, n.content);
  ctx.stack.push(resListItem(pre));
  ctx.stack.push(resListItem(post));
}, 'list-slice');

// Splats a list, putting its contents onto the stack.
let operListSplat = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.LIST]);
  if (!opers) return;

  let [list] = opers;
  ctx.stack = ctx.stack.concat(list.content);
}, 'list-splat');

// Same as listSplat, but pushes a bookend first.
let operListOpen = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.LIST]);
  if (!opers) return;

  let [list] = opers;
  ctx.push(resBookendItem());
  ctx.stack = ctx.stack.concat(list.content);
}, 'list-open');

// Pushes the item at a given index in a list.
// Uses Pythonesque semantics, where a negative index will work backwards from
// the end of a list.
let operListAt = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.LIST, ResType.NUM]);
  if (!opers) return;

  let [list, idxItem] = opers;
  let idx = idxItem.content;
  if (idx >= list.content.length || idx < -list.content.length) {
    ctx.complain(this.name, "list index out of range (expected " +
      (-list.content.length) + " to " + (list.content.length-1) +
      ", got " + idx + ")");
    return;
  }
  let item = listGet(list.content, idx);
  ctx.stack.push(item);
}, 'list-at');

// Pops a number, then grabs that many more items off the stack and makes a
// list out of them.
let operListGrab = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.NUM]);
  if (!opers) return;

  let [n] = opers;
  let items = getOperands(this.name + ": grabbing items", ctx, n.content);
  if (!items) return;

  ctx.stack.push(resListItem(items));
}, 'list-grab');

let operListFlatten = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.LIST]);
  if (!opers) return;

  let [list] = opers;
  let flat = (l) => [].concat.apply([],
    l.map((itm) => itm.type == ResType.LIST ? flat(itm.content) : itm));
  ctx.stack.push(resListItem(flat(list.content)));
}, 'flatten');

//// [03.04] Miscellaneous data operators.

// Compares two items for equality, pushing 1 if they are equal and 0 if not.
// The helper function recurses if the two items are lists.
function eqHelper(a, b) {
  if (a.type != b.type)
    return false;

  if (a.type == ResType.LIST) {
      if (a.content.length != b.content.length)
        return false;
      for (let i = 0; i < a.content.length; i++) {
        let aa = a.content[i];
        let bb = b.content[i];
        if (!eqHelper(aa, bb)) return false;
      }
      return true;
  } else {
    return a.content == b.content;
  }
}
let operEq = atomicOper(function(ctx) {
  let opers = getOperands(this.name, ctx, 2);
  if (!opers) return;

  let [a, b] = opers;
  ctx.stack.push(resNumItem(eqHelper(a, b) ? 1 : 0));
}, 'eq');

// Takes an item and returns a number corresponding to its type.
let operType = atomicOper(function(ctx) {
  let opers = getOperands(this.name, ctx, 1);
  if (!opers) return;

  let [a] = opers;
  ctx.stack.push(resNumItem(a.type));
}, 'type');

//// [03.05] Stack manipulation.

// Swap the top two elements of the stack.
let operSwap = atomicOper(function(ctx) {
  let opers = getOperands(this.name, ctx, 2);
  if (!opers) return;

  let [a, b] = opers;
  ctx.stack.push(b);
  ctx.stack.push(a);
}, 'swap');

// Duplicate the top element.
let operDup = atomicOper(function(ctx) {
  let opers = getOperands(this.name, ctx, 1);
  if (!opers) return;

  let [a] = opers;
  ctx.stack.push(a);
  ctx.stack.push(a.copy());
}, 'dup');

// Deletes the top item.
let operDel = atomicOper(function(ctx) {
  let opers = getOperands(this.name, ctx, 1);
  if (!opers) return;
  // Popping the operand and then not doing anything with it effectively
  // deletes it.
}, 'del');

// 'Buries' an element, placing it some distance into the stack.
let operBury = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-2, ResType.NUM]);
  if (!opers) return;

  let [target, depth] = opers;
  let n = depth.content;
  if (ctx.stack.length < n) {
    ctx.complain(this.name, "tried to bury "+n+" deep, but the stack was only" +
      ctx.stack.length + " deep");
    return;
  }
  ctx.stack.splice(ctx.stack.length-n, 0, target);
}, 'bury');

// 'Digs up' an element, taking it from some distance into the stack and putting
// it on top.
let operDig = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.NUM]);
  if (!opers) return;

  let [depth] = opers;
  let n = depth.content;
  if (ctx.stack.length < n+1) {
    ctx.complain(this.name, "tried to dig "+n+" deep, but there was nothing " +
      "past depth "+(ctx.stack.length-1));
    return;
  }
  let target = ctx.stack.splice(ctx.stack.length-(n+1), 1)[0];
  ctx.stack.push(target);
}, 'dig');

// Rotates the stack, effectively grabbing a number of elements off one end
// of the stack and putting them on top of the other end.
let operRotate = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.NUM]);
  if (!opers) return;

  let [n] = opers;
  ctx.stack = rotate(ctx.stack, n);
}, 'rotate');

//// [03.06] Stack-stack manipulation.
//// Some words about the stack-stack: It's... a stack of stacks. The ( )
//// operators push and pop stacks, respectively. It's a rudimentary way to
//// manage scope, and it's also a useful way to do complex manipulations on
//// the contents of lists.

// Takes a list, making its contents into a new stack.
let operStackPush = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.LIST]);
  if (!opers) return;

  let [newStk] = opers;
  ctx.stackStack.push(newStk.content);
}, 'stack-push');

// Pops a stack off the stack-stack, pushing its contents as a list item onto
// the next one down.
let operStackPop = atomicOper(function(ctx) {
  if (ctx.stackStack.length == 1) {
    ctx.complain(this.name, "tried to pop the base stack off the stack-stack");
    return;
  }

  let oldStk = ctx.stackStack.pop();
  ctx.stack.push(resListItem(oldStk));
}, 'stack-pop');

//// [03.07] I/O. Pretty much just printing for now. Input operators just
//// complain in this implementation.

// Prints the top item as a Res item, with no prettification.
// This means a string will just display as a list of characters, not a
// contiguous string.
let operPrint = atomicOper(function(ctx) {
  let opers = getOperands(this.name, ctx, 1);
  if (!opers) return;

  let [item] = opers;
  ctx.logger.printOut(item);
}, 'print');

// Pretty-prints the top item. See the prettyString function above for the
// semantics.
let operPrettyPrint = atomicOper(function(ctx) {
  let opers = getOperands(this.name, ctx, 1);
  if (!opers) return;

  let [item] = opers;
  ctx.logger.printOut(prettyString(item));
}, 'pretty-print');

let operGetLine = atomicOper(notImplementedOper, 'get-line');
let operGetChar = atomicOper(notImplementedOper, 'get-char');

//// [03.08] Manipulating namespaces.

// Stores an item in a given path on the namespace.
let operStore = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-2, -1]);
  if (!opers) return;

  let [item, pathItem] = opers;
  let result = tryResolvePath(this.name, ctx, pathItem);
  if (!result) return;

  result.namespace.content[result.name] = item;
}, 'store');

// Deletes the item at the given path.
let operNsDel = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1]);
  if (!opers) return;

  let [pathItem] = opers;
  let result = tryResolvePath(this.name, ctx, pathItem);
  if (!result) return;

  delete result.namespace.content[result.name];
}, 'ns-del');

// Copies an item at one path in the namespace to another path.
let operNsCopy = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1]);
  if (!opers) return;

  let [srcItem, dstItem] = opers;
  let src = tryResolvePath(this.name, ctx, srcItem);
  if (!src) return;
  let dst = tryResolvePath(this.name, ctx, dstItem);
  if (!dst) return;

  dst.namespace[dst.name] = src.item.copy();
}, 'ns-copy');

//// [03.09] Control flow.

// Pops a code block and executes it.
let operExec = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1]);
  if (!opers) return;

  let [codeItem] = opers;
  let code = tryMakeString(this.name, ctx, codeItem);
  if (!code) return;

  ctx.blockStack.smartPush(new ResBlock(code));
}, 'exec');

// Executes a code block, assigning it a label that can be used with the return
// operator later.
let operLabelExec = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1, -1]);
  if (!opers) return;

  let [codeItem, labelItem] = opers;
  let code = tryMakeString(this.name, ctx, codeItem);
  if (!code) return;
  let label = tryMakeString(this.name, ctx, labelItem);
  if (label === null) return;

  let blocks = ctx.blockStack;
  blocks.smartPush(new ResBlock(code));
  blocks.current().label = label;
}, 'label-exec');

// Pushes a copy of the currently executing code block onto the stack.
let operPushMe = atomicOper(function(ctx) {
  let thisBlock = ctx.blockStack.current();
  ctx.stack.push(resStringItem(thisBlock.code));
}, 'push-me');

// Pops two items and a condition, pushing one back onto the stack if the
// condition is 0 and the other if it is not. The condition is a NUM item.
let operCond = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [ResType.NUM, -2, -2]);
  if (!opers) return;

  let [cond, trueItem, falseItem] = opers;
  let item = (cond.content == 0 ? falseItem : trueItem);

  ctx.stack.push(item);
}, 'cond');

// Delays execution of a code block until after the current one has finished.
// This is accomplished by putting the code block *underneath* the current
// one on the block stack.
let operDelayExec = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1]);
  if (!opers) return;

  let [codeItem] = opers;
  let code = tryMakeString(this.name, ctx, codeItem);
  if (!code) return;

  let thisBlock = ctx.blockStack.pop();
  ctx.blockStack.push(new ResBlock(code));
  ctx.blockStack.smartPush(thisBlock);
}, 'delay-exec');

// Closes the topmost executing readmode, ending every block down to the one
// with the readmode and then running its close. If no readmode is active, does
// nothing.
let operCloseMode = atomicOper(function(ctx) {
  /*let blocks = ctx.blockStack;
  let rm = null;
  let rems = [];
  for (let i = 0; i < blocks.length(); i++) {
    if (blocks.current().readmode) {
      rm = blocks.current().readmode;
      break;
    }
    rems.unshift(blocks.pop());
  }
  if (rm)
    rm.close(ctx);
  else
    blocks.stack = blocks.stack.concat(rems);  // */
  let result = returnUntil(ctx, function(blk) { return blk.readmode; });
  if (result) {
    ctx.blockStack.stack = result.pre;
    result.current.readmode.close(ctx);
  }
}, 'close-mode');

// Same semantics as operCloseMode, except the pointer in the code block
// decrements so the character that ended the code block can be read as code.
let operCloseBack = atomicOper(function(ctx) {
  let result = returnUntil(ctx, function(blk) { return blk.readmode; });
  if (result) {
    ctx.blockStack.stack = result.pre;
    result.current.readmode.close(ctx);
    result.current.posn--;
  }
}, 'close-back');

// Returns execution out of the code block with the given label. If no block
// has the given label, complain.
let operReturn = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1]);
  if (!opers) return;

  let [labelItem] = opers;
  let label = tryMakeString(this.name, ctx, labelItem);
  if (label === null) return;

  let res = returnUntil(ctx, function(blk) { return blk.label == label; });
  if (!res) {
    ctx.complain(this.name, "no block labeled "+label+" to return out of");
    return;
  }

  // We need to pop after we set the stack, because the semantics of
  // returnUntil mean the block we're returning out of is on the top.
  ctx.blockStack.stack = res.pre;
  ctx.blockStack.pop();
}, 'return');

// A variant of push-me, pushing a copy of the code block with the given
// label.
let operPushLabel = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1]);
  if (!opers) return;

  let [labelItem] = opers;
  let label = tryMakeString(this.name, ctx, labelItem);
  if (label === null) return;

  let result = returnUntil(ctx, function(blk) { return blk.label == label; });
  if (!res) {
    ctx.complain(this.name, "no block labeled "+label+" to return out of");
    return;
  }

  ctx.stack.push(resStringItem(result.current.code));
}, 'push-label');

// A little utility method that takes a string and wraps it in {}, adding a
// level of indirection.
let operWrap = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1]);
  if (!opers) return;

  let [item] = opers;
  let code = tryMakeString(this.name, ctx, labelItem);
  if (code === null) return;

  ctx.stack.push(resStringItem("{"+code+"}"));
})


//////// [04] BUILT-IN READMODES ////////

// The content of a readmode item. By default, contains three Res codeblocks
// and some functions to push them onto the block stack when appropriate.
function ResReadmode(readCode = "", openCode = "", closeCode = "") {
  this.openCode = openCode;
  this.openBlock = function()  { return new ResBlock(this.openCode);  }
  this.readCode = readCode;
  this.readBlock = function()  { return new ResBlock(this.readCode);  }
  this.closeCode = closeCode;
  this.closeBlock = function() { return new ResBlock(this.closeCode); }

  this.makeItem = function(name = "") {
    let item = resReadmodeItem(this);
    item.name = name;
    return item;
  }

  this.open = function(ctx) {
    ctx.blockStack.current().readmode = this;
    ctx.blockStack.push(this.openBlock());
  }
  this.read = function(ctx, chr) {
    ctx.stack.push(resCharItem(chr));
    ctx.blockStack.push(this.readBlock());
  }
  this.close = function(ctx) {
    ctx.blockStack.current().readmode = null;
    ctx.blockStack.push(this.closeBlock());
  }
}

// Makes a readmode from three given codeblocks and puts it at a given path.
let operReadmodeMake = atomicOper(function(ctx) {
  let opers = getTypedOperands(this.name, ctx, [-1, -1, -1, -1]);
  if (!opers) return;

  let [codeItems, pathItem] = [opers.slice(0, 3), opers[3]];
  let codeTexts = [];
  for (let item of codeItems) {
    let text = tryMakeString(item);
    if (!text) return;
    codeTexts = codeTexts.concat(text);
  }
  let [textRead, textOpen, textClose] = codeTexts;
  let pathResult = tryResolvePath(pathItem);
  if (!pathResult) return;

  // Make the readmode
  // and put it on the namespace
  let rm = new ResReadmode(textRead, textOpen, textClose).makeItem();
  pathResult.namespace[pathResult.name] = rm;
}, 'readmode-make');

// Some function prefixes seq'd together with atomic readmode functions.
let preOpen = function(ctx) {
  ctx.blockStack.current().readmode = this;
}
let preClose = function(ctx) {
  ctx.blockStack.current().readmode = null;
}

// A function to make an 'atomic' readmode, defined using Javascript rather than
// Res.
function atomicReadmode(readF, openF = nop, closeF = nop, name = "") {
  let rm = new ResReadmode();
  rm.read = readF;
  rm.open = seq(preOpen.bind(rm), openF.bind(rm));
  rm.close = seq(preClose.bind(rm), closeF.bind(rm));
  return rm.makeItem(name);
}

// The string readmode. Pushes a bookend, then pushes read characters until it
// encounters a ".
let rmString = atomicReadmode(
  function(ctx, chr) {
    if (chr == '"') this.close(ctx);
    else ctx.stack.push(resCharItem(chr));
  },
  function(ctx) {
    ctx.stack.push(resBookendItem());
  },
  listMake,
  'string'
);

// The code block readmode. Also generates a string, but closes on close
// bracket and allows nested bracket pairs.
let rmCodeBlock = atomicReadmode(
  function(ctx, chr) {
    if      (chr == '{') ctx.__nest++;
    else if (chr == '}') ctx.__nest--;

    if (ctx.__nest) ctx.stack.push(resCharItem(chr));
    else            this.close(ctx);
  },
  function(ctx) {
    ctx.__nest = 1;
    ctx.stack.push(resBookendItem());
  },
  listMake,
  'code-block'
);

// Reads a single character, then closes.
let rmChar = atomicReadmode(
  function(ctx, chr) {
    ctx.stack.push(resCharItem(chr));
    this.close(ctx);
  },
  nop, nop,
  'char'
);

// Ignores every character til the next ';'.
let rmComment = atomicReadmode(
  function(ctx, chr) {
    if (chr == ';') this.close(ctx);
  }
);

//// The numeric readmodes.
//// These will construct a number out of every following character that
//// is a digit in the appropriate base. Notably, they rewind the block's
//// position by one character upon closing so that the character that closed
//// the readmode can be interpreted normally afterward.

function baseDigits(n) {
  return range(n).map(function(x) { return x.toString(n); });
}

function genNumberReadmode(base) {
  let bds = baseDigits(base);
  return atomicReadmode(
    function(ctx, chr) {
      if (bds.includes(chr))
        ctx.__num = ctx.__num * base + parseInt(chr, base);
      else
        this.close(ctx);
    },
    function(ctx) {
      ctx.__num = 0;
    },
    function(ctx) {
      ctx.stack.push(resNumItem(ctx.__num));
      ctx.blockStack.current().posn--;
    },
    'base' + base
  );
}

let [rmBase2, rmBase8, rmBase10, rmBase16, rmBase36] =
  [2, 8, 10, 16, 36].map(genNumberReadmode);



//////// [05] DEFAULT NAMESPACE AND SUB-NAMESPACES ////////

//// The list namespace, usually found in '$'.
let nsList = resNamespaceItem({
  '+': operListConcat,
  '/': operListSlice,
  'G': operListGrab,
  'S': operListSplat,
  '[': operListOpen
});

//// The 'namespace and control' namespace, found in '&'.
let nsCtrl = resNamespaceItem({
  ':': operNsCopy,
  'C': operCloseMode,
  'D': operDelayExec,
  'O': operOperMake,
  'R': operReadmodeMake,
  'c': operCloseBack,
  'x': operNsDel
});

//// The numerals and math namespace, found in '#'.
let nsNum = resNamespaceItem({
  'b': rmBase2,
  'o': rmBase8,
  'd': rmBase10,
  'x': rmBase16,
  'z': rmBase36
});

let nsDefault = resNamespaceItem({
  ' ': operNop,
  '\n': operNop,
  '\t': operNop,
  '\r': operNop,
  '\0': operNop,
  // built-in operators and such
  '[': resBookendItem(),
  ']': operListMake,
  '+': operAdd,
  '-': operSub,
  '*': operMul,
  '/': operDiv,
  '%': operMod,
  '~': operNegate,
  '=': operEq,
  '^': operMinmax,
  ':': operDup,
  '\\': operSwap,
  '(': operStackPush,
  ')': operStackPop,
  '!': operPushMe,
  '?': operCond,
  'B': operBury,
  'D': operDig,
  'E': operExec,
  'F': operLabelExec,
  'G': operGetLine,
  'P': operPrettyPrint,
  'R': operReturn,
  'S': operStore,
  'T': operType,
  'g': operGetChar,
  'k': operChr,
  'n': resCharItem('\n'),
  'o': operOrd,
  'p': operPrint,
  'r': operRotate,
  't': resCharItem('\t'),
  'x': operDel,
  'z': resListItem([]),
  // built-in readmodes
  "'": rmChar,
  '"': rmString,
  '{': rmCodeBlock,
  ';': rmComment,
  // built-in namespaces
  '#': nsNum,
  '$': nsList,
  '&': nsCtrl
});
// Add the number literals to the default namespace.
for (let i of range(16)) {
  nsDefault.content[i.toString(16)] = resNumItem(i);
}


















// Kilroy was here ---w-('U')-w---
