import * as fs from "node:fs";

import type * as h from "./html";
import * as pure_dom from "./pure_dom";

// node stuff
// const {JSDOM} = require("jsdom");

// const dom = new JSDOM(`<!DOCTYPE html>`);

function test(f: () => h.Block, template_fn: string): void {
    console.log(`\n\n---testing ${template_fn}\n`);
    const widget: h.Block = f();
    const expected = fs.readFileSync(template_fn, "utf8").trim();
    const actual = widget.to_source("").trim();
    if (expected === actual) {
        console.log(`Success for ${template_fn}`);
        console.log(widget.as_raw_html());
        return;
    }

    console.log(`PROBLEMS! see ${template_fn}`);
    console.log("TRY:\n diff -u template.txt result.txt");
    fs.writeFileSync("template.txt", expected, "utf-8");
    fs.writeFileSync("result.txt", actual, "utf-8");

    // return success for convenient pipelining into diff
    // npx node test.js && diff -u template.txt result.txt
    process.exit(1);
}

function buddy_list_section_header(): h.Block {
    return pure_dom.buddy_list_section_header({
        id: "some-id",
        header_text: "THIS CONVERSATION",
        is_collapsed: false,
    });
}

function view_all_subscribers(): h.Block {
    return pure_dom.view_all_subscribers({
        stream_edit_hash: "some-stream-hash",
    });
}

function view_all_users(): h.Block {
    return pure_dom.view_all_users();
}

function empty_list_widget_for_list(): h.Block {
    return pure_dom.empty_list_widget_for_list({
        empty_list_message: "Your list is empty.",
    });
}

function poll_widget(): h.Block {
    return pure_dom.poll_widget();
}

test(buddy_list_section_header, "../zulip/web/templates/buddy_list/section_header.hbs");

test(view_all_subscribers, "../zulip/web/templates/buddy_list/view_all_subscribers.hbs");

test(view_all_users, "../zulip/web/templates/buddy_list/view_all_users.hbs");

test(empty_list_widget_for_list, "../zulip/web/templates/empty_list_widget_for_list.hbs");

test(poll_widget, "../zulip/web/templates/widgets/poll_widget.hbs");

console.log("\nALL TESTS PASSED!");
