"use strict";

const assert = require("node:assert/strict");

const {JSDOM} = require("jsdom");

const {zrequire} = require("./lib/namespace.cjs");
const {run_test} = require("./lib/test.cjs");

const dom = new JSDOM(`<!DOCTYPE html>`);
global.document = dom.window.document;
const html = zrequire("html");

function assert_dom_is_empty(dom) {
    // We get a DocumentFragment, and in node.js we don't have easy access to types.
    // so we just assert no children
    assert.ok(dom.childNodes.length === 0);
}

function only_child_element_of(dom) {
    assert.equal(dom.children.length, 1);
    return dom.children[0];
}

function trim_and_dedent(str) {
    const lines = str.split("\n");

    while (lines.length > 0 && lines[0].trim() === "") {
        lines.shift();
    }

    while (lines.length > 0 && lines.at(-1).trim() === "") {
        lines.pop();
    }

    if (lines.length === 0) {
        return "";
    }

    const ws_prefix = lines[0].match(/^\s*/)[0];

    const dedented = lines.map((line) => {
        if (line.trim() === "") {
            return "";
        }

        // Remove only the first line's indent
        return line.startsWith(ws_prefix) ? line.slice(ws_prefix.length) : "INDENT ERROR: " + line;
    });

    return dedented.join("\n");
}

run_test("sanity check on trim_and_dedent", () => {
    assert.equal(trim_and_dedent(""), "");
    assert.equal(trim_and_dedent("\n\n\n  foo\n\n\n\n"), "foo");
    assert.equal(trim_and_dedent("\n  foo\n\n  bar\n"), "foo\n\nbar");
    assert.equal(trim_and_dedent("\n  foo\nbar\n"), "foo\nINDENT ERROR: bar");
});

run_test("test TrustedSimpleString", () => {
    assert.equal(html.trusted_simple_string("hello").to_source(), "hello");
});

run_test("test IfBlock", () => {
    let frag = html.if_bool_then_block({
        bool: html.bool_var({label: "condition", b: true}),
        block: html.block([html.div_tag({})]),
    });
    assert.equal(only_child_element_of(frag.to_dom()).tagName, "DIV");

    frag = html.if_bool_then_block({
        bool: html.bool_var({label: "condition", b: false}),
        block: html.block([html.div_tag({})]),
    });
    const dom = frag.to_dom();
    assert_dom_is_empty(dom);

    frag = html.if_bool_then_block({
        bool: html.bool_var({label: "condition", b: true}),
        block: html.block([html.div_tag({})]),
    });
    assert.equal(
        trim_and_dedent(`
            {{#if condition}}
                <div></div>
            {{/if}}
            `),
        frag.to_source(""),
    );
});

run_test("test UnlessBlock", () => {
    let frag = html.unless_bool_then_block({
        bool: html.bool_var({label: "condition", b: false}),
        block: html.block([html.div_tag({})]),
    });
    assert.equal(only_child_element_of(frag.to_dom()).tagName, "DIV");

    frag = html.unless_bool_then_block({
        bool: html.bool_var({label: "condition", b: true}),
        block: html.block([html.div_tag({})]),
    });
    const dom = frag.to_dom();
    assert_dom_is_empty(dom);

    frag = html.unless_bool_then_block({
        bool: html.bool_var({label: "condition", b: false}),
        block: html.block([html.div_tag({})]),
    });
    assert.equal(
        trim_and_dedent(`
            {{#unless condition}}
                <div></div>
            {{/unless}}
            `),
        frag.to_source(""),
    );
});
