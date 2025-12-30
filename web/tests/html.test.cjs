"use strict";

const assert = require("node:assert/strict");

const {zrequire} = require("./lib/namespace.cjs");
const {run_test} = require("./lib/test.cjs");

const html = zrequire("html")

function trim_and_dedent(str) {
    const lines = str.trim().split("\n");

    if (lines.length === 0) {
        return "";
    }

    const first_line_indent = lines[0].match(/^\s*/)[0].length;

    const dedented = lines.map((line) => {
        if (line.trim() === "") {
            return "";
        }

        // Remove only the first line's indent
        return line.startsWith(" ".repeat(first_line_indent))
            ? line.slice(first_line_indent)
            : line;
    });

    return dedented.join("\n");
}




run_test("test TrustedSimpleString", ()=>{
    assert.equal(new html.TrustedSimpleString("hello").to_source(), "hello")
})