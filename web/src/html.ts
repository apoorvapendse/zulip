// next few lines are just for node.js
const {JSDOM} = require("jsdom");
const dom = new JSDOM(`<!DOCTYPE html>`);
const document = dom.window.document;

type Element = Tag | Comment | ParenthesizedTag | TextVar | TranslatedText | InputTextTag | SorryBlock;

type TrustedString =
    | TrustedSimpleString
    | TrustedIfElseString
    | TrustedAttrStringVar
    | TranslatedAttrValue;

type TagSpec = {
    classes: TrustedString[];
    attrs?: Attr[];
    children?: Element[];
    suppress_indent?: boolean;
    force_indent?: boolean;
    force_attrs_before_class?: boolean;
    pink?: boolean;
};

function build_classes(classes: TrustedString[]): string {
    if (classes.length == 0) {
        return "";
    }

    const class_frags = [];
    for (const c of classes) {
        class_frags.push(c.to_source());
    }
    const full_class = class_frags.join(" ");
    return ` class="${full_class}"`;
}

function build_attrs(attrs: Attr[]): string {
    let result = "";
    for (const attr of attrs) {
        result += " " + attr.to_source();
    }
    return result;
}

function text_wrapped_in_pink_span(text: string): HTMLSpanElement {
    const wrapper_span = document.createElement("span");
    wrapper_span.innerText = text;
    wrapper_span.style.backgroundColor = "pink";
    return wrapper_span;
}

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
    pink: boolean | undefined;

    constructor(info: {label: string; s: UnEscapedTextString; pink?: boolean}) {
        this.label = info.label;
        this.s = info.s;
        this.pink = info.pink;
    }

    to_source(): string {
        return `{{${this.label}}}`;
    }

    to_dom(): Node {
        if (this.pink) {
            return text_wrapped_in_pink_span(this.s.s);
        }
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

export class SorryBlock{
    // This object is useful for testing and development. It creates a stub object.
    // In development users will get a pink text span saying "sorry" that reminds them
    // to eventually implement the actual sub-component.
    // (This approach was inspired by Lean Programming's approach toward
    // iteratively building up proofs.)
    to_source(indent:string):string{
        return indent + "sorry"
    }

    to_dom():Node{
        return text_wrapped_in_pink_span(
            "sorry"
        )
    }
}

export class TranslatedText {
    translated_text: string;
    force_single_quotes: boolean | undefined;
    pink: boolean | undefined;
    // We assume the caller is passing in the
    // translated version of the string (unescaped).
    constructor(info: {translated_text: string; force_single_quotes?: boolean; pink?: boolean}) {
        this.translated_text = info.translated_text;
        this.force_single_quotes = info.force_single_quotes;
        this.pink = info.pink;
    }

    to_source(indent: string): string {
        if (this.force_single_quotes) {
            return indent + `{{t '${this.translated_text}'}}`;
        }
        return indent + `{{t "${this.translated_text}" }}`;
    }

    to_dom(): Node {
        if (this.pink) {
            return text_wrapped_in_pink_span(this.translated_text);
        }
        return document.createTextNode(this.translated_text);
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

    constructor(info: {translated_string: string}) {
        this.translated_string = info.translated_string;
    }

    to_source(): string {
        const english_string = this.translated_string; // force this in our test code
        return `{{t '${english_string}'}}`;
    }

    render_val(): string {
        return this.translated_string;
    }
}

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

export class Tag {
    tag: string;
    classes: TrustedString[];
    attrs: Attr[];
    children: Element[];
    suppress_indent: boolean | undefined;
    force_indent: boolean | undefined;
    force_attrs_before_class: boolean | undefined;
    pink: boolean | undefined;

    constructor(tag: string, tag_spec: TagSpec) {
        this.tag = tag;
        this.classes = tag_spec.classes;
        this.attrs = tag_spec.attrs || [];
        this.children = tag_spec.children || [];
        this.suppress_indent = tag_spec.suppress_indent;
        this.force_indent = tag_spec.force_indent;
        this.force_attrs_before_class = tag_spec.force_attrs_before_class;
        this.pink = tag_spec.pink;
    }

    children_source(indent: string): string {
        if (this.children.length === 0) {
            if (!this.force_indent) {
                return "";
            }
        }

        if (this.children.length == 1) {
            const child_source = this.children[0].to_source("");
            if (this.suppress_indent) {
                return child_source;
            }
        }

        let innards = "";
        innards += "\n";
        innards += new Block(this.children).to_source(indent + "    ");
        innards += indent;
        return innards;
    }

    to_source(indent: string): string {
        let start_tag = `<${this.tag}`;

        if (this.force_attrs_before_class) {
            start_tag += build_attrs(this.attrs);
            start_tag += build_classes(this.classes);
        } else {
            start_tag += build_classes(this.classes);
            start_tag += build_attrs(this.attrs);
        }

        start_tag += ">";
        const end_tag = `</${this.tag}>`;

        return indent + start_tag + this.children_source(indent) + end_tag;
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
        if (this.pink) {
            element.style.backgroundColor = "pink";
        }
        return element;
    }
}

export class InputTextTag {
    classes: TrustedString[];
    attrs: Attr[];
    pink: boolean | undefined;
    constructor(info: {
        classes: TrustedString[];
        attrs?: Attr[];
        placeholder_value: TranslatedAttrValue;
        pink?: boolean;
    }) {
        this.classes = info.classes;
        this.attrs = info.attrs || [];
        this.attrs.push(new Attr("placeholder", info.placeholder_value));
        this.pink = info.pink;
    }

    to_source(indent: string): string {
        let tag = `<input type="text"`;

        tag += build_classes(this.classes);
        tag += build_attrs(this.attrs);

        tag += " />";

        return indent + tag;
    }

    to_dom(): HTMLElement {
        const element = document.createElement("input");
        element.setAttribute("type", "text");

        for (const el_class of this.classes) {
            element.classList.add(el_class.render_val());
        }
        for (const attr of this.attrs) {
            element.setAttribute(attr.k, attr.v.render_val());
        }
        if (this.pink) {
            element.style.backgroundColor = "pink";
        }
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

export function button_tag(tag_spec: TagSpec): Tag {
    return new Tag("button", tag_spec);
}

export function div_tag(tag_spec: TagSpec): Tag {
    return new Tag("div", tag_spec);
}

export function input_text_tag(info: {
    classes: TrustedString[];
    attrs?: Attr[];
    placeholder_value: TranslatedAttrValue;
    pink?: boolean;
}): InputTextTag {
    return new InputTextTag(info);
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
        suppress_indent: true,
        classes: button_classes,
        children: [
            i_tag({
                classes: icon_classes,
            }),
        ],
    });
}

export class Block {
    elements: Element[];

    constructor(elements: Element[]) {
        this.elements = elements;
    }

    to_source(indent: string): string {
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

    as_raw_html():string{
        const div = document.createElement("div");
        const frag = this.to_dom();
        div.appendChild(frag);
        return div.innerHTML;
    }

}
