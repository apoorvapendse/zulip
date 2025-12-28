import * as h from "./html";
import * as pure_dom from "./pure_dom";
import * as fs from "fs";

function test(f: () => h.Block, template_fn: string): void {
    const widget: h.Block = f();
    const expected = fs.readFileSync(template_fn, "utf-8").trim();
    const actual = widget.to_source().trim();
    if (expected === actual) {
        console.log(`Success for ${template_fn}`);
        console.log(widget.to_dom().textContent);
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

test(
    buddy_list_section_header,
    "../zulip/web/templates/buddy_list/section_header.hbs",
);
console.log("\nALL TESTS PASSED!");
