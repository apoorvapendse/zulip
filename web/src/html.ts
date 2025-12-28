// next few lines are just for node.js
const { JSDOM } = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html>`);
const document = dom.window.document;

export class Comment {
    comment: string;

    constructor(comment: string) {
        this.comment = comment;
    }

    to_source(indent: string): string {
        return indent + `{{!-- ${this.comment} --}}`;
    }
}

export class Bool {
    label: string;
    b: boolean;

    constructor(label: string, b: boolean) {
        this.label = label;
        this.b = b;
    }

    to_source(): string {
        return this.label;
    }
}

export class TrustedAttrStringVar {
    label: string;
    s: UnEscapedAttrString;

    constructor(label: string, s: UnEscapedAttrString) {
        this.label = label;
        this.s = s;
    }

    to_source(): string {
        return `{{${this.label}}}`;
    }
    render_val(): string {
        return this.s.s;
    }
}

export class TextVar {
    label: string;
    s: UnEscapedTextString;

    constructor(label: string, s: UnEscapedTextString) {
        this.label = label;
        this.s = s;
    }

    to_source(): string {
        return `{{${this.label}}}`;
    }

    to_dom(): Text {
        return document.createTextNode(this.s.s);
    }
}

export class UnEscapedAttrString {
    s: string;

    constructor(s: string) {
        this.s = s;
    }
}

export class UnEscapedTextString {
    s: string;

    constructor(s: string) {
        this.s = s;
    }
}

export class TrustedSimpleString {
    s: string;

    constructor(s: string) {
        this.s = s;
    }

    to_source(): string {
        return this.s;
    }
    render_val(): string {
        return this.to_source();
    }
}

export class TranslatedText {
    translated_string: string;

    // We assume the called is passing in the
    // translated version of the string.
    constructor(s: string) {
        this.translated_string = s;
    }

    to_source(): string {
        return `{{t "${this.translated_string}" }}`;
    }

    to_dom(): Node {
        return document.createTextNode(this.translated_string);
    }
}

export class TrustedIfElseString {
    bool: Bool;
    yes_val: TrustedString;
    no_val: TrustedString;

    constructor(bool: Bool, yes_val: TrustedString, no_val: TrustedString) {
        this.bool = bool;
        this.yes_val = yes_val;
        this.no_val = no_val;
    }

    to_source(): string {
        const b = this.bool.to_source();
        const yes = this.yes_val.to_source();
        const no = this.no_val.to_source();
        return `{{#if ${b}}}${yes}{{else}}${no}{{/if}}`;
    }

    render_val(): string {
        if (this.bool.b) {
            return this.yes_val.render_val();
        }
        return this.no_val.render_val();
    }
}

export class TranslatedAttrValue {
    translated_string: string;
    english_string: string;
    constructor(english: string, translated: string) {
        this.translated_string = translated;
        this.english_string = english;
    }

    to_source(): string {
        return `{{t ${this.english_string}}}`;
    }

    render_val(): string {
        return this.translated_string;
    }
}

type Element = Tag | Comment | ParenthesizedTag | TextVar | TranslatedText;
type TrustedString =
    | TrustedSimpleString
    | TrustedIfElseString
    | TrustedAttrStringVar
    | TranslatedAttrValue;

export class Attr {
    k: string;
    v: TrustedString | TranslatedAttrValue;

    constructor(k: string, v: TrustedString | TranslatedAttrValue) {
        this.k = k;
        this.v = v;
    }

    to_source(): string {
        return `${this.k}="${this.v.to_source()}"`;
    }
}

type TagSpec = {
    class_first: boolean;
    classes: TrustedString[];
    attrs: Attr[];
    children: Element[];
};

class Tag {
    tag: string;
    class_first: boolean;
    classes: TrustedString[];
    attrs: Attr[];
    children: Element[];

    constructor(tag: string, tag_spec: TagSpec) {
        this.tag = tag;
        this.class_first = tag_spec.class_first;
        this.classes = tag_spec.classes;
        this.attrs = tag_spec.attrs;
        this.children = tag_spec.children;
    }

    children_source(indent: string): string {
        if (this.children.length === 0) {
            return "";
        }

        if (this.children.length == 1) {
            const child_source = this.children[0].to_source(indent);
            if (child_source.length < 50) {
                return child_source;
            }
        }

        let innards = "";
        if (this.children.length > 0) {
            innards += "\n";
            innards += new Block(this.children).to_source(indent + "    ");
            innards += indent;
        }
        return innards;
    }

    to_source(indent: string): string {
        let start_tag = "<" + this.tag;

        const classes = this.classes;
        const attrs = this.attrs;

        function add_classes() {
            if (classes.length > 0) {
                const class_frags = [];
                for (const c of classes) {
                    class_frags.push(c.to_source());
                }
                const full_class = class_frags.join(" ");
                start_tag += ` class="${full_class}"`;
            }
        }

        function add_attrs() {
            for (const attr of attrs) {
                start_tag += " " + attr.to_source();
            }
        }

        if (this.class_first) {
            add_classes();
            add_attrs();
        } else {
            add_attrs();
            add_classes();
        }

        if (this.tag === "input") {
            return (start_tag += "/>");
        }
        start_tag += ">";

        return (
            indent + start_tag + this.children_source(indent) + `</${this.tag}>`
        );
    }

    to_dom(): HTMLElement {
        const element = document.createElement(this.tag);
        for (const el_class of this.classes) {
            element.classList.add(el_class.render_val());
        }
        for (const attr of this.attrs) {
            element.setAttribute(attr.k, attr.v.render_val());
        }
        element.append(new Block(this.children).to_dom());
        return element;
    }
}

export function i_tag(tag_spec: TagSpec): Tag {
    return new Tag("i", tag_spec);
}

export function ul_tag(tag_spec: TagSpec): Tag {
    return new Tag("ul", tag_spec);
}

export function h5_tag(tag_spec: TagSpec): Tag {
    return new Tag("h5", tag_spec);
}

export function h4_tag(tag_spec: TagSpec): Tag {
    return new Tag("h4", tag_spec);
}

export function span_tag(tag_spec: TagSpec): Tag {
    return new Tag("span", tag_spec);
}

export function a_tag(tag_spec: TagSpec): Tag {
    return new Tag("a", tag_spec);
}

export function li_tag(tag_spec: TagSpec): Tag {
    return new Tag("li", tag_spec);
}

export function input_tag(tag_spec: TagSpec): Tag {
    return new Tag("input", tag_spec);
}

export function button_tag(tag_spec: TagSpec): Tag {
    return new Tag("button", tag_spec);
}

export function div_tag(tag_spec: TagSpec): Tag {
    return new Tag("div", tag_spec);
}

export class ParenthesizedTag {
    tag: Tag;

    constructor(tag: Tag) {
        this.tag = tag;
    }

    to_source(indent: string): string {
        return indent + `(${this.tag.to_source("")})`;
    }

    to_dom(): Node {
        const element = document.createElement("div");
        element.append(document.createTextNode("("));
        element.append(this.tag.to_dom());
        element.append(document.createTextNode(")"));
        return element;
    }
}

export function IconButton({
    button_classes,
    icon_classes,
}: {
    button_classes: TrustedString[];
    icon_classes: TrustedString[];
}) {
    return button_tag({
        class_first: true,
        classes: [...button_classes],
        attrs: [],
        children: [
            i_tag({
                class_first: true,
                classes: [...icon_classes],
                attrs: [],
                children: [],
            }),
        ],
    });
}

export class Block {
    elements: Element[];

    constructor(elements: Element[]) {
        this.elements = elements;
    }

    to_source(indent = "") {
        let source = "";
        for (const element of this.elements) {
            source += element.to_source(indent) + "\n";
        }
        return source;
    }

    to_dom(): DocumentFragment {
        const dom = document.createDocumentFragment();
        for (const element of this.elements) {
            if (element instanceof Comment) {
                continue;
            }
            dom.append(element.to_dom());
        }
        return dom;
    }
}
