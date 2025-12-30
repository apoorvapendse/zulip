"use strict";

const assert = require("node:assert/strict");

const {zrequire} = require("./lib/namespace.cjs");
const {run_test} = require("./lib/test.cjs");

const html = zrequire("html")

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
        return line.startsWith(ws_prefix)
            ? line.slice(ws_prefix.length)
            : "INDENT ERROR: " + line;
    });

    return dedented.join("\n");
}

run_test("sanity check on trim_and_dedent", ()=>{
    assert.equal(trim_and_dedent(""), "");
    assert.equal(trim_and_dedent("\n\n\n  foo\n\n\n\n"), "foo");
    assert.equal(trim_and_dedent("\n  foo\n\n  bar\n"), "foo\n\nbar");
    assert.equal(trim_and_dedent("\n  foo\nbar\n"), "foo\nINDENT ERROR: bar");
})

run_test("test TrustedSimpleString", ()=>{
    assert.equal(new html.TrustedSimpleString("hello").to_source(), "hello")
})
