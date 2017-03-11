# Res documentation

Here's where you learn how Res works!

## Basic concepts

Res has seven basic types:
* [0] MISC. At present, this is only used for list bookends (more on those later).
* [1] NUM, the number type. Generally a float, but the semantics will vary by implementation.
* [2] CHAR, a single character.
* [3] LIST, a variable-sized ordered list containing Res items of any type.
* [4] OPERATOR, an operation.
* [5] READMODE, which can change the way characters in a code block are interpreted.
* [6] NAMESPACE, a mapping from characters to Res items.

Res' memory is based on two structures: the *stack* and the *root namespace*. Res is a stack-based language, so operands go onto the stack and operators pop as many items as they need off of it. For instance, to multiply two times three, you'd write `2 3 *`, and the answer would show up on the stack. Only items of the first four types, known as "data items", can exist on the stack. There's also a "stack-stack", used to manipulate list contents. (See the `(` and `)` operators below for more info.)

The root namespace is just a regular Res namespace, a map from characters to Res items. When a piece of Res code is run, the interpreter walks through it one character at a time. If the character maps to a namespace, the interpreter uses the next character to look inside *that* namespace, and so on until it encounters a non-namespace item. If it's a data item, a copy gets pushed onto the stack; if it's an operator, the operator runs; if it's a readmode, the block's readmode is changed. (More on readmodes later.)

In Res, a string is either a single character or a list containing only characters; if an operator needs a string, either will work. Code blocks in Res are just strings, so you can manipulate them with list operators.

## Readmodes

Readmodes are special items that change how characters following their invocation are to be interpreted. A readmode has three phases, each with some associated code:
* *Open* runs right when the readmode starts and can be used for setup.
* *Read* runs for each character parsed by the readmode. The character is pushed onto the stack before each call to the read block.
* *Close* runs after the readmode has been closed but before normal execution resumes.

Usually, a readmode closes when it encounters a certain character. For instance, the string readmode (usually invoked with `"`) closes when it sees another `"`. However, if you want your readmode to do something more bizarre, that option is available to you.

## Code examples

*I'm gonna put stuff here eventually*

## Default root namespace

These tables describe how the default root namespace is laid out.

***Watch this space, it might change.***

#### Miscellaneous

| Code name  | Name in words | Type     | Description
|:----------:|---------------|----------|-------------
| Whitespace |  | OPERATOR, technically | Does nothing.
| `T`        | Type          | OPERATOR | Takes an item and returns a number, 0-3, corresponding to its type.
| `?`        | Cond          | OPERATOR | Takes a number and two items. Returns the second item if the number is 0, and the first otherwise.
| `;`        | Comment       | READMODE | Ignores everything until the next `;`, then closes.

#### Numbers, chars, and arithmetic

| Code name  | Name in words | Type      | Description
|:----------:|---------------|-----------|-------------
| `0` thru `9`, `a` thru `f` | | NUM | The first 16 positive numbers, as hex digits.
| `+`, `-`, `*`, `/`, `%` | Arithmetic operators | OPERATOR | Add, subtract, multiply, divide, and modulus.
| `~`        | Negate        | OPERATOR  | Takes a number and negates it.
| `^`        | Minmax        | OPERATOR  | Minmax: Takes two numbers and reorders them so the larger is on top of the stack.
| `=`        | Equals        | OPERATOR  | Takes two of any item and pushes 1 if they are the same, 0 if they are not.
| `#`        |               | NAMESPACE | **A namespace containing additional stuff relating to numbers and math.**
| `#b`, `#o`, `#d`, `#x`, `#z` | Base-*n* | READMODEs | Characters that are digits of the specified base are read into a single number that gets pushed onto the stack once it encounters a non-digit character. For instance, `#xff` is the number 255. `b` is binary, `o` is octal, `d` is decimal, `x` is hexadecimal, and `z` is base-36.

#### The stack and the stack-stack

| Code name  | Name in words | Type     | Description
|:----------:|---------------|----------|-------------
| `:`        | Dup           | OPERATOR | Pushes a copy of the top item on the stack.
| `\`        | Swap          | OPERATOR | Swaps the top two items on the stack.
| `B`        | Bury          | OPERATOR | Takes an item and a number; 'buries' the item that many places into the stack.
| `D`        | Dig           | OPERATOR | Takes a number; retrieves the item that many places into the stack, putting it on top.
| `r`        | Rotate        | OPERATOR | Takes a number, n, and rotates the stack n places, taking elements off one side and putting them on the other.
| `x`        | Del           | OPERATOR | Deletes the top item off the stack.
| `(`        | Stack-push    | OPERATOR | Takes a list and makes its contents into a new stack on the stack-stack.
| `)`        | Stack-pop     | OPERATOR | Pops a stack off the stack-stack, pushing its contents as a list onto the previous stack. You can use these operators to manipulate the contents of lists using stack operators.

#### Lists

| Code name  | Name in words | Type      | Description
|:----------:|---------------|-----------|-------------
| `z`        |               | LIST      | An empty list item. Can also be used as a blank code block.
| `[`        | List bookend  | BOOKEND   | Puts a list bookend on the stack.
| `]`        | List-make     | OPERATOR  | Takes items off the top of the stack until it finds a list bookend, then pushes a list containing those items.
| `$`        |               | NAMESPACE | **A namespace containing additional stuff relating to lists.**
| `$+`       | List-concat   | OPERATOR  | Takes two lists and concatenates them.
| `$/`       | List-slice    | OPERATOR  | Takes a list and a number, slicing the list into two at the given position.
| `$G`       | List-grab     | OPERATOR  | Takes a number, then takes that many items off the stack and pushes a list containing them.
| `$S`       | List-splat    | OPERATOR  | Takes a list and pushes its entire contents onto the stack.
| `$[`       | List-open     | OPERATOR  | Takes a list; pushes a bookend, followed by the list's entire contents.

#### Strings

| Code name  | Name in words | Type      | Description
|:----------:|---------------|-----------|-------------
| `k`        | Chr           | OPERATOR  | Takes a number and returns a character with that codepoint.
| `o`        | Ord           | OPERATOR  | Takes a character and returns its codepoint.
| `n`        |               | CHAR      | A newline character.
| `t`        |               | CHAR      | A tab character.
| `"`        | String        | READMODE  | Takes characters until it sees another `"`, then returns a list containing those characters.
| `'`        | Char          | READMODE  | Pushes the next character. For instance, `'q` pushes the character 'q' onto the stack.
| `{`        | Code-block    | READMODE  | Takes characters, maintaining a nesting level with `{ }` pairs. Once it finds its own paired '}', pushes a list containing the characters it took. This is the standard way to make code blocks.

#### Control flow and the namespace

| Code name  | Name in words | Type      | Description
|:----------:|---------------|-----------|-------------
| `E`        | Exec          | OPERATOR  | Takes a string and executes it as a code block. (See 'A note on tail calls' below.)
| `F`        | Label-exec    | OPERATOR  | Takes two strings and executes the first, giving that code block the second string as a 'label' used by `R`.
| `R`        | Return        | OPERATOR  | Takes a string and returns out of the code block with that label.
| `S`        | Store         | OPERATOR  | Takes an item and a string, storing that item in the namespace at that path. If `#d25 "XYZZY" S` is used, the operator will make the requisite namespaces for the path (unless an item already exists somewhere along the way) and store the number 25 at the end; from then on, executing `XYZZY` will push 25.
| `!`        | Push-me       | OPERATOR  | Pushes a copy of the currently executing code block onto the stack.
| `&`        |               | NAMESPACE | **A namespace containing additional control- and namespace-related operators.**
| `&:`       | Ns-copy       | OPERATOR  | Takes two strings for namespace paths; copies the item at the first path into the second one. `"+" "Q" &:` will make `Q` add two numbers together just like `+` does.
| `&C`       | Close-mode    | OPERATOR  | When used within a readmode's code block, stops the readmode and runs its close block. Otherwise, does nothing.
| `&D`       | Delay-exec    | OPERATOR  | Takes a code block and puts it *underneath* the currently executing one, such that it will run when the current block finishes.
| `&O`       | Oper-make     | OPERATOR  | Takes a code block and a path; stores an operator at that path, which runs the code block when executed.
| `&R`       | Readmode-make | OPERATOR  | Takes three code blocks (open, read, close) and a path; stores a readmode at that path, which runs the corresponding code block at each phase. (See 'Readmodes', above.)
| `&c`       | Close-back    | OPERATOR  | When used within a readmode's code block, stops the readmode and decrements the pointer of the block the readmode was on, so that the last character can be interpreted as code after the readmode has closed.
| `&x`       | Ns-del        | OPERATOR  | Takes a path and deletes the item at that path in the namespace.

##### A note on tail calls

If `E` or `F` are used at the very end of a block, the new block replaces the old one on the block stack, preventing overflow when doing recursion. If the old block had a label and the new block hasn't been given one with `F`, the new block takes the same label as the old block, which allows the `! E` idiom for loops to work correctly with labels and returning.

#### I/O

| Code name  | Name in words | Type      | Description
|:----------:|---------------|-----------|-------------
| `g`        | Get-char      | OPERATOR  | Retrieves a character from standard input. ***This operator is not supported by res.js at present.***
| `G`        | Get-line      | OPERATOR  | Retrieves a line of text from standard input. ***This operator is not supported by res.js at present.***
| `p`        | Print         | OPERATOR  | Takes an item and prints it to the screen. `"abc" p` looks like `['a' 'b' 'c']`.
| `P`        | Pretty-print  | OPERATOR  | Takes a list and prints its contents in sequence, printing characters bare (`"abc" P` looks like `abc`). A list contained inside this list is printed as if by `p`. If given a char, it will print it bare. If given some other item, prints it like `p`.
