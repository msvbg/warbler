'use strict';

import W from '../src';
import should from 'should';

it('parses JSON', () => {
    let json = W((inp, env) => W(array, object, string, number)(inp, env));

    let number = W(/([0-9]+(\.[0-9]*)?)|(([0-9]*)?\.[0-9]+)/).map(Number);
    let string = W(/"(\\"|.)*?"/).map(s => s.slice(1, -1));

    let array = W.wrap('[', ']', W.list(number));

    let prop = W([string, ':', json]).map(([key,, val]) => ({ [key]: val }));
    let object = W.wrap('{', '}', W.list(prop))
        .map(props => Object.assign({}, ...props));

    let program = W.terminals(W.skip(W.whitespace))(json);

    should(W.value(
        program(`{"string": [1, .22, 3.14], "hello": "world"}`)
    )).be.eql({string: [1, .22, 3.14], hello: "world"});
});