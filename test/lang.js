'use strict';

import W from '../src';
import should from 'should';

it('parses a toy language', () => {
    let identifier = W(/[a-zA-Z_][a-zA-Z0-9_]*/);

    let expression = W((i, e) => W.or(
        additiveExpression,
        primaryExpression
    )(i, e));

    let statement = W((i, e) => W.or(
        ifStatement,
        functionDefinition,
        returnStatement
    )(i, e));

    let primaryExpression = W.or(
        /[a-zA-Z-]+/,
        W.integer
    );

    let additiveExpression = W.mapSeq(to => [
        primaryExpression.map(to('lhs')),
        '+',
        primaryExpression.map(to('rhs'))
    ]).set('type', 'additiveExpression');

    let block = W.wrap('{', '}', W.many(statement));

    let ifStatement = W.mapSeq(to => [
        'if',
        W.wrap('(', ')', expression).map(to('expr')),
        block.map(to('block'))
    ]).set('type', 'ifStatement');

    let functionDefinition = W.mapSeq(to => [
        'function',
        identifier.map(to('name')),
        W.wrap('(', ')', W.list(identifier)).map(to('params')),
        block.map(to('block'))
    ]).set('type', 'functionDefinition');

    let returnStatement = W.mapSeq(to => [
        'return',
        expression.map(to('expr'))
    ]).set('type', 'returnStatement');

    let program = W.terminals(W.skip(W.whitespace))(W.many(statement));

    let source = `
        function f(x) {
            return 5+5
        }

        if (5) {

        }
    `;

    should(W.value(program(source))).be.eql([
        {
            "name": "f",
            "params": [
                "x"
            ],
            "block": [
                {
                    "expr": {
                        "lhs": 5,
                        "rhs": 5,
                        "type": "additiveExpression"
                    },
                    "type": "returnStatement"
                }
            ],
            "type": "functionDefinition"
        },
        {
            "expr": 5,
            "block": [],
            "type": "ifStatement"
        }
    ]);
});