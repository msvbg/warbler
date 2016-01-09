/* @flow */

'use strict';

import isRegex from 'is-regexp';
import trunc from 'lodash.trunc';

type ParseResult<T> = {
    value: T,
    success: boolean,
    rest: string
};

type Parser = (input: string, env: ?mixed) => ParseResult;
type ParserShorthand = Parser | string | Object;

type ParserCombinator = (b: Parser) => Parser;

type MapChain = (input: string, env: ?mixed) => ParseResult;

/**
 * Returns true if the parse result was successful and matched the entire input,
 * otherwise false.
 */
export let isSuccess = function <T>(result: ParseResult<T>): boolean {
    return Boolean(result.success && result.rest.length === 0);
};

/**
 * Returns the value of a parse result.
 */
export let value = function <T>(result: ParseResult<T>): T {
    return result.value;
};

/**
 * Takes multiple parsers and returns a new parser which tries each parser from
 * left to right until one succeeds, and returns the value of that parser.
 */
export let or = function (...parserDescs: Array<ParserShorthand>): Parser {
    let parsers = Array.from(parserDescs).map(p => toParser(p));

    return toParser((input, env) => {
        for (let parser of parsers) {
            let result = parser(input, env);
            if (result.success) {
                return result;
            }
        }

        return { success: false, value: undefined, rest: input };
    });
};

/**
 * Takes multiple parsers and returns a new parser which will be successful
 * if and only if every parser passed as an argument is successfully executed
 * in sequence. The returned value is an array containing the results of every
 * parser.
 */
export let seq = function (...parserDescs: Array<ParserShorthand>): Parser {
    let parsers = Array.from(parserDescs).map(p => toParser(p));

    return toParser((input, env) => {
        let ret = { success: true, value: [], rest: input };
        for (let parser of parsers) {
            let result = parser(ret.rest, env);
            ret.success = ret.success && result.success;

            if (!ret.success) {
                return {
                    success: false,
                    value: result.value,
                    rest: input
                };
            }

            ret.value.push(result.value);
            ret.rest = result.rest;
        }

        return ret;
    });
};

/**
 * Matches the passed parser zero or more times, returning an array of the
 * results.
 */
export let many = (parser: Parser): Parser => {
    return toParser((input, env) => {
        let ret = { success: true, value: [], rest: input };
        let result;
        do {
            result = parser(ret.rest, env);
            ret.rest = result.rest;

            if (result.success) {
                ret.value.push(value(result));
            }
        } while (result.success);
        return ret;
    });
};

/**
 * Always succeeds, but will attempt to consume input with the given parser. If
 * it fails, no input is consumed and parser succeeds with value `undefined`.
 */
export let opt = function (parserDesc: ParserShorthand): Parser {
    let parser = toParser(parserDesc);

    return toParser((input, env) => {
        let ret = { success: true, value: undefined, rest: input };
        let result = parser(input, env);
        if (result.success) {
            ret.value = result.value;
            ret.rest = result.rest;
        }

        return ret;
    });
};

/**
 * Allows you to inject a parser that will get wrapped around every terminal
 * parser. For instance:
 *
 * @example
 *
 * ```
 * let parser = W(['a', 'b', 'c']);
 * let skipFn = W.skip(W.whitespace);
 * let skipWs = W.terminals(skipFn)(parser);
 * // skipWs = W([skipFn('a'), skipFn('b'), skipFn('c')])
 *
 * parser('a   b    c'); // matches
 * ```
 */
export let terminals =
    (f: Parser): ParserCombinator =>
    (parser: Parser): Parser =>
    (input, env) => parser(input, environment(env, { terminals: f }))

/**
 * Takes a skipping parser whose output will be ignored, and produces a parser
 * combinator that skips input matched by the skipping parser before and after
 * parsing.
 *
 * @example
 *
 * ```
 * let skipWs = W.skip(W.whitespace);
 * let parser = skipWs('a');
 *
 * parser('   a'); // matches
 * ```
 */
export let skip =
    (ignore: Parser): ParserCombinator =>
    (parser: Parser): Parser =>
    toParser(seq(ignore, parser, ignore).nth(1));

/**
 * Wraps a parser around two other parsers, typically quotes or brackets. The
 * wrapping parsers' output will be discarded.
 *
 * @example
 *
 * ```
 * let string = W.wrap('"', W.any);
 * let block = W.wrap('{', '}', statements);
 * ````
 */
export let wrap = (left: Parser, right: Parser, wrapped: Parser): Parser => {
    if (wrapped === undefined) {
        wrapped = right;
        right = left;
    }

    return toParser((input, env) =>
        seq(left, wrapped, right).nth(1)(input, env)
    );
};

type ToFn = (key: string) => (value: any) => any;
type SeqFn = (to: ToFn) => Array<Parser>;

/**
 * Convenience function for mapping parts of a sequence to named properties in
 * an object. Takes a function that returns an array suitable for passing to
 * `W.seq`. The function gets a `to` function which can be used to map parts to
 * result properties.
 *
 * @example
 *
 * let parser = W.mapSeq(to => [
 *     'a',
 *     'b',
 *     W('c').map(to('myProp')),
 *     'd'
 * ]);
 *
 * parser('abcd') // => { myProp: 'c' }
 *
 */
export let mapSeq = (seqFn: SeqFn): Parser => toParser((input, env) => {
    let ret = {};
    let toFn = key => value => ret[key] = value;
    let result = seq(...seqFn(toFn))(input, env); // mutate `ret`
    result.value = ret;
    return result;
});

/**
 * Maps a parse result value given a function f.
 *
 * @example
 *
 * let parser = W.integer.map(n => n * n);
 * parser('5') // => 25
 */
let map = function (parser: Parser, f: Function): MapChain {
    return addMaps(toParser((input, env) => {
        let result = parser(input, env);

        if (result.success) {
            result.value = f(result.value);
        }

        return result;
    }));
};

/**
 * Does what map does, but creates a function which returns a constant instead
 * of a mapping function.
 *
 * @example
 *
 * let parser = W(
 *     W('+').const('add')
 *     W('*').const('multiply')
 * );
 *
 * parser('+'); // => 'add'
 */
let mapConst = function (parser: Parser, c: any): MapChain {
    return map(parser, dummy => c);
};

/**
 * Keeps the given indices of a sequence parser result.
 *
 * @example
 *
 * let parser = W(['a', 'b', 'c']).nth(1);
 * parser('abc'); // => 'b'
 */
let mapNth = function (parser: Parser, n: integer): MapChain {
    if (arguments.length > 2) {
        let numbers = Array.from(arguments).slice(1);
        return map(parser, x => numbers.map(i => x[i]));
    } else {
        return map(parser, x => x[n]);
    }
};

/**
 * Allows setting a property on a resulting object to a constant. Useful for
 * tagging AST nodes with, for instance, a type.
 *
 * @example
 *
 * let parser = W.mapSeq(to => [
 *     'age: ',
 *     W.integer.to('age')
 * ]).set('type', 'Age');
 *
 * parser('age: 12'); // { age: 12, type: 'Age' }
 */
let mapSet = function (parser: Parser, key: string, x: any): MapChain {
    return map(parser, value => {
        value[key] = x;
        return value;
    });
};

/**
 * Skips the first `n` results in an array.
 */
let mapSkip = function (parser: Parser, n: integer): MapChain {
    return map(parser, x => x.slice(n));
};

/**
 * Skips the last `n` results in an array.
 */
let mapSkipLast = function (parser: Parser, n: integer): MapChain {
    return map(parser, x => x.slice(0, -n));
};

/**
 * Takes the first `n` results from an array.
 */
let mapTake = function (parser: Parser, n: integer): MapChain {
    return map(parser, x => x.slice(0, n));
};

/**
 * Takes the last `n` results from an array.
 */
let mapTakeLast = function (parser: Parser, n: integer): MapChain {
    return map(parser, x => x.slice(-n));
};

/**
 * The `W` function. Converts a shorthand representation to a parser function
 * and adds the mapping functions.
 */
let toParser = function (parser: ParserShorthand): Parser {
    if (parser === undefined) {
        throw new TypeError(`Attempt to use \`undefined\` as parser.`)
    }

    // Or: W(a, b, c)
    if (arguments.length > 1) {
        return or(...arguments);
    }

    // Seq: W([a, b, c])
    if (Array.isArray(parser)) {
        return seq(...parser);
    }

    let terminal = parser => {
        if (typeof parser === 'string') {
            return stringParser(parser);
        } else if (isRegex(parser)) {
            return regexParser(parser);
        }
    };

    let f = parser => (input, env) => {
        let term = terminal(parser);
        env = env || environment();

        if (term) {
            if (env && env.terminals) {
                return env.terminals(term)(
                    input,
                    environment(env, { terminals: undefined })
                );
            } else {
                return term(input, env);
            }
        } else {
            return parser(input, env);
        }
    };

    return addMaps(f(parser));
};

/**
 * Helper to parse lists. The first argument is a parser which parses elements
 * of the  list; the second argument is a parser which parses the separators,
 * defaulting to the string parser `','`.
 */
export let list = (parser: ParserShorthand, interstitial: ParserShorthand = ','): Parser =>
    opt(
        seq(
            parser,
            many(
                seq(interstitial, parser).map(x => x[1])
            )
        ).map(([a, b]) => [a, ...b])
    ).map(x => x || []);

/**
 * Adds the mapping functions to a parser.
 *
 * @internal
 */
let addMaps = (parser: Parser): MapChain => Object.assign(parser, {
    map: function (f) { return map(this, f); },
    nth: function (...n) { return mapNth(this, ...n) },
    const: function (x) { return mapConst(this, x); },
    set: function (key, val) { return mapSet(this, key, val); },
    skip: function (n) { return mapSkip(this, n); },
    skipLast: function (n) { return mapSkipLast(this, n); },
    take: function (n) { return mapTake(this, n); },
    takeLast: function (n) { return mapTakeLast(this, n); },
});

/**
 * Terminal parser.
 *
 * @internal
 */
let stringParser = (string: string) => (input: string, env: mixed): ParseResult => {
    let success = input.startsWith(string);

    if (success) {
        env.advance(string); // mutate line/col numbers
    }

    return ({
        success,
        value: success ? string : undefined,
        rest: success ? input.slice(string.length) : input,
    });
};

/**
 * Terminal parser.
 *
 * @internal
 */
let regexParser = (regex: Object) => (input: string, env: mixed): ParseResult => {
    let result = regex.exec(input);
    let success = result !== null && result.index === 0;

    if (success) {
        env.advance(result[0]); // mutate line/col numbers
    }

    return ({
        success,
        value: success ? result[0] : '',
        rest: success ? input.slice(result[0].length) : input
    });
};

/**
 * Creates a prototypically nested environment based on a parent environment.
 *
 * @internal
 */
let environment = (parent, env) => {
    let deflt = {
        line: 1,
        col: 1,
        advance: function (input: string) {
            this.line += input.split('\n').length - 1;

            let lastNewline = input.lastIndexOf('\n');
            if (lastNewline !== -1) {
                this.col = input.length - lastNewline;
            }
        }
    };

    return Object.assign(Object.create(parent || deflt), env);
};

/**
 * Matches a single digit between 0 and 9.
 */
export let digit: Parser = toParser(/[0-9]/);

/**
 * Matches an integer and returns a JavaScript `Number` representation of it.
 */
export let integer: Parser = toParser(/[0-9]+/).map(Number);

/**
 * Matches whitespace of arbitrary length.
 */
export let whitespace: Parser = toParser(/\s*/);

/**
 * Matches a parser `a` as few times as possible, followed by the stop parser.
 */
export let lazyMany = function (a: ParserShorthand, stop: ParserShorthand): Parser {
    let [parser, stopParser] = [a, stop].map(p => toParser(p));

    return toParser((input, env) => {
        let ret = { success: true, value: [], rest: input };
        let result, stopResult;
        do {
            result = parser(ret.rest, env);
            stopResult = stopParser(result.rest, env);

            if (result.success) {
                ret.value.push(value(result));
                if (stopResult.success) {
                    ret.value.push(value(stopResult));
                    return ret;
                }
            }

            ret.rest = result.rest;
        } while (result.success);
        return stopParser(input, env);
    });
};

/**
 * Consumes one character. Always succeeds, as long as there is input left.
 */
export let any = function (input: string): ParseResult {
    let success = input.length > 0;
    let value = success ? input.charAt(0) : undefined;
    let rest = input.slice(1);

    return { success, value, rest };
};

export let expect = function (parser: Parser, expectation: string) {
    return toParser((input, env) => {
        let result = parser(input, env);

        if (!result.success) {
            return {
                success: false,
                value: `[${env.line}:${env.col}]: Expected ${expectation}, got "${trunc(input, 10)}"`,
                rest: input
            };
        }

        return result;
    });
};

export default Object.assign(toParser, {
    isSuccess,
    value,

    or,
    seq,
    many,
    opt,
    terminals,
    skip,
    wrap,
    mapSeq,

    list,
    digit,
    integer,
    whitespace,

    lazyMany,
    any,

    expect
});