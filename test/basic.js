'use strict';

import W from '../src';
import should from 'should';

it('parses "or" rules', () => {
    let rule = W.or('a', 'b');

    rule('a').should.not.be.undefined();
    rule('b').should.not.be.undefined();
    should(W.isSuccess(rule('c'))).be.false();
});

it('parses "seq" rules', () => {
    let rule = W.seq('a', 'b');

    should(W.isSuccess(rule('a'))).be.false();
    should(W.isSuccess(rule('ab'))).be.true();
    should(W.isSuccess(rule('abc'))).be.false();
});

it('can nest rules', () => {
    let seqRule = W.seq('a', 'b');
    let orRule = W.or(seqRule, 'c');

    should(W.isSuccess(orRule('ab'))).be.true();
    should(W.isSuccess(orRule('c'))).be.true();
    should(W.isSuccess(orRule('abc'))).be.false();
});

it('maps parse results', () => {
    let rule = W('3').map(Number);

    should(W.value(rule('3'))).be.equal(3);

    let number = W
        .or('0', '1', '2', '3', '4', '5', '6', '7', '8', '9')
        .map(Number)

    let op = W.or(
        W('*').const((a, b) => a*b),
        W('+').const((a, b) => a+b)
    );

    let expr = W
        .seq(number, op, number)
        .map(list => list[1](list[0], list[2]));

    should(W.value(expr('2+3'))).be.equal(5);
});

it('can display error messages', () => {
    let parser = W([
        '\na',
        W.expect(W.integer, 'integer'),
        'c'
    ]);

    should(W.value(parser('\nacc'))).be.eql('[2:2]: Expected integer, got "cc"');
});

it('allows laziness', () => {
    let parser = W(['"',
        W.lazyMany(W.any, '"').skipLast(1).map(x => x.join(''))
    ]).nth(1);

    should(W.value(parser('"abc""'))).be.eql('abc');
});

it('passes readme example 1', () => {
    let operations = {
        '+': (a, b) => a + b,
        '*': (a, b) => a * b
    };

    let add = W([W.integer, W('+', '*'), W.integer])
        .map(([lhs, op, rhs]) => operations[op](lhs, rhs));

    let result = add('45+9');
    should(W.value(result)).be.eql(54);
});

it('passes readme example 2', () => {
    let parseX = function (input) {
        let value = input.charAt(0);
        let success = value === 'x';
        let rest = input.slice(1);

        return { success, value, rest };
    };

    should(W.value(parseX('xyz'))).be.eql('x');

    let parseThreeXs = W([parseX, parseX, parseX]);

    should(W.value(parseThreeXs('xxxyyyzzz'))).be.eql(['x', 'x', 'x']);
});

it('passes readme example 3', () => {
    let parseFruits = W('apple', 'banana', 'orange');

    should(W.value(parseFruits('bananas for mañana'))).be.eql('banana');
});

it('passes readme example 4', () => {
    let identifier = W(/[a-zA-Z_][a-zA-Z0-9_]*/);

    should(W.value(identifier('christopherWalken'))).be.eql('christopherWalken')
});

it('passes readme example 5', () => {
    {
        let instruction = W([
            'throw ',
            W('eggs', 'bricks'),
            ' at ',
            W('neighboring houses', 'Martin Shkreli')
        ]).nth(1, 3);

        should(W.value(instruction('throw eggs at Martin Shkreli')))
            .be.eql(['eggs', 'Martin Shkreli']);
    }

    {
        // or, equivalently
        let instruction = W([
            'throw ',
            W('eggs', 'bricks'),
            ' at ',
            W('neighboring houses', 'Martin Shkreli')
        ]).map((args) => [args[1], args[3]]);

        should(W.value(instruction('throw eggs at Martin Shkreli')))
           .be.eql(['eggs', 'Martin Shkreli']);
    }
});

it('passes readme example 6', () => {
    let expression = W.integer;
    let block = W.integer;
    let ifStatement = W.mapSeq(to => [
        'if',
        W(['(', expression, ')']).nth(1).map(to('expr')),
        block.map(to('block'))
    ]);

    should(W.value(ifStatement('if(1)2'))).be.eql({ expr: 1, block: 2});
});