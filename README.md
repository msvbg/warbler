# ![Warbler](https://github.com/msvbg/warbler/raw/master/logo.png)

> Warbler is a simple parser combinator library with an emphasis on ease of use.

[![Build status][travis-image]][travis-url]

[travis-image]: https://img.shields.io/travis/msvbg/warbler.svg?style=flat
[travis-url]: https://travis-ci.org/msvbg/warbler

Warbler is still experimental. Please open an issue if you find any bugs.

## Install
```
npm install --save warbler
```

## A motivating example

```js
import W from 'warbler';

let operations = {
    '+': (a, b) => a + b,
    '*': (a, b) => a * b
};

let parser = W([W.integer, W('+', '*'), W.integer])
    .map(([lhs, op, rhs]) => operations[op](lhs, rhs));

let sum = parser('45+9');
let product = parser('2*5');

console.log(W.value(sum)); // => 54
console.log(W.value(product)); // => 10
```

For a more advanced example, look at `test/json.js` for a JSON parser.

## Basics

A parser is a function that takes two arguments, a string of input data and an environment object, outputting a parser result. Typically, the result will form an abstract syntax tree but parsers can also produce arbitrary values, like in the example above where the parser produced numbers. A parser matching the string `'foo'` in the beginning of the string `'foobar'` would produce the following result:

```js
{
    success: true,
    value: 'foo',
    rest: 'bar'
}
```

The environment argument is not always required, so a very simple parser has the following form:

```js
let parseX = function (input) {
    let value = input.charAt(0);
    let success = value === 'x';
    let rest = input.slice(1);

    return { success, value, rest };
};

console.log(W.value(parseX('xyz'))); // => 'x'
```

This parser will succeed if the first character of the input is an `'x'`. `W.value` retrieves the value contained in a parser result.

The real power of Warbler lies in combining small parsers to form more complex ones. One way of doing so is to put parsers in sequence. Sequences return an array with an element for every parser result. This can be done with either `W.seq(parser1, ..., parserN)` or by passing an array of parsers to the `W` function:

```js
let parseThreeDigits = W([W.digit, W.digit, W.digit]);

console.log(W.value(parseThreeDigits('123yyyzzz'))); // => ['1', '2', '3']
```

Another useful combinator is `W.or(parser1, ..., parserN)` which takes multiple parsers and returns the result of the first one that is successful. This function is also available as a shorthand by passing multiple arguments to `W`:

```js
let parseFruits = W('apple', 'banana', 'orange');

console.log(W.value(parseFruits('banana in panama'))); // => 'banana'
```

Warbler can also handle regexes:

```js
let identifier = W(/[a-zA-Z_][a-zA-Z0-9_]*/);

console.log(W.value(identifier('christopherWalken'))); // => 'christopherWalken'
```

## Mapping
Typically, you want to produce more complex results with your parsers. Warbler provides plenty of facilities for this through its mapping functions. A parser that is wrapped by `W` automatically gains a few functions that can be chained to manipulate the values of parser results. The `.nth` function will keep the specified indices of a sequence result, and discard the rest.

```js
let instruction = W([
    'throw ',
    W('eggs', 'bricks'),
    ' at ',
    W('neighboring houses', 'Martin Shkreli')
]).nth(1, 3);

console.log(W.value(instruction('throw eggs at Martin Shkreli')));
// => ['eggs', 'Martin Shkreli']
```

The `.nth` function is however just syntactic sugar for the more general `.map` function, which allows you to return an arbitrary result based on the value captured by the parser. The following is equivalent:

```js
let instruction = W([
    'throw ',
    W('eggs', 'bricks'),
    ' at ',
    W('neighboring houses', 'Martin Shkreli')
]).map(args => [args[1], args[3]]);
```

It is quite common to want to keep some parts of a sequence and throw others away, producing an object as a result. This is quite easy to accomplish with the `W.mapSeq` helper function.

```js
let ifStatement = W.mapSeq(to => [
    'if',
    W(['(', expression, ')']).nth(1).map(to('expr')),
    block.map(to('block'))
]);

ifStatement('if(...){...}');
// Will produce a value like:
{
    expr: /* value of `expression` parser */,
    block: /* value of `block` parser */
}
```

## Handling whitespace
It is quite common to want to exclude whitespace. This is easily accomplished with the `W.terminals` function, which lets you wrap a parser around every terminal.

```js
let parser = W(['a', 'b', 'c']);
let skipFn = W.skip(W.whitespace);
let skipWs = W.terminals(skipFn)(parser);

parser('a   b    c'); // matches
```

The above example turns the `parser` function into the following form:

```js
let parser = W([skipFn('a'), skipFn('b'), skipFn('c')])
```

## Lazy name binding
Sometimes, your parsers need mutual or circular recursion, which will cause issues since one of the parsers must be defined before the other. This can be dealt
with by wrapping one of the parsers in another parser function:

```js
let a = W.or('y', b); // `b` is undefined :(
let b = W.or('x', a);

// Do this instead:
let a = W((input, env) => W.or('y', b)(input, env));
let b = W.or('x', a);
```

## Handling errors
Error handling is a bit of a weak point at the moment. Warbler supports expectation errors.

```js
let parser = W([
    'foo',
    W.expect(W.integer, 'integer'),
    'bar'
]);

W.value(parser('foofoobar')) // => '[1:4]: Expected integer, got "foobar"'
```

Line and column numbers are available in the environment, and the error reporting mechanisms can be further customized using them.

## Reference
For now, read the source code at `src/index.js`. The following is an exhaustive list of all functions provided under `W`:

```js
isSuccess
value
or
seq
many
opt
terminals
skip
wrap
mapSeq
list
digit
integer
whitespace
lazyMany
any
expect
```

And the following is an exhaustive list of all mapping functions:

```js
map
nth
const
set
skip
skipLast
take
takeLast
```

## License
MIT © Martin Svanberg