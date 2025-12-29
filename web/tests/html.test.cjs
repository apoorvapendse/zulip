"use strict";

const assert = require("node:assert/strict");

const {zrequire} = require("./lib/namespace.cjs");
const {run_test} = require("./lib/test.cjs");

const html = zrequire("html")

run_test("test TrustedSimpleString", ()=>{
    assert.equal(new html.TrustedSimpleString("hello").to_source(), "hello")
})