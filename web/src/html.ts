// next few lines are just for node.js

// const {JSDOM} = require("jsdom");
// const dom = new JSDOM(`<!DOCTYPE html>`);
// const document = dom.window.document;

type Element =
    | Tag
    | Comment
    | ParenthesizedTag
    | TextVar
    | TranslatedText
    | InputTextTag
    | SorryBlock;

type TrustedString =
    | TrustedSimpleString
    | TrustedIfElseString
    | TrustedAttrStringVar
    | TranslatedAttrValue;

type TagSpec = {
    classes?: TrustedString[];
    attrs?: Attr[];
    children?: Element[];
    suppress_indent?: boolean;
    force_indent?: boolean;
    force_attrs_before_class?: boolean;
    pink?: boolean;
};

type BoolVarSpec = {label: string; b: boolean};

type TranslatedAttrValueSpec = {translated_string: string};

type TrustedIfElseStringSpec = {bool: BoolVar; yes_val: TrustedString; no_val: TrustedString};

type TranslatedTextSpec = {translated_text: string; force_single_quotes?: boolean; pink?: boolean};

type TrustedAttrStringVarSpec = {label: string; s: UnEscapedAttrString};

type TextVarSpec = {label: string; s: UnEscapedTextString; pink?: boolean};

type ConditionalBlockSpec = {bool: BoolVar; block: Block};

function build_classes(classes: TrustedString[]): string {
    if (classes.length === 0) {
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
    wrapper_span.textContent = text;
    wrapper_span.style.backgroundColor = "pink";
    return wrapper_span;
}

class Comment {
    comment: string;

    constructor(comment: string) {
        this.comment = comment;
    }

    to_source(indent: string): string {
        return indent + `{{!-- ${this.comment} --}}`;
    }
}

export class BoolVar {
    label: string;
    b: boolean;

    constructor(info: BoolVarSpec) {
        this.label = info.label;
        this.b = info.b;
    }

    to_source(): string {
        return this.label;
    }
}

export class TrustedAttrStringVar {
    label: string;
    s: UnEscapedAttrString;

    constructor(info: TrustedAttrStringVarSpec) {
        this.label = info.label;
        this.s = info.s;
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

    constructor(info: TextVarSpec) {
        this.label = info.label;
        this.s = info.s;
        this.pink = info.pink;
    }

    to_source(indent: string): string {
        return indent + `{{${this.label}}}`;
    }

    to_dom(): Node {
        if (this.pink) {
            return text_wrapped_in_pink_span(this.s.s);
        }
        return document.createTextNode(this.s.s);
    }
}

class UnEscapedAttrString {
    s: string;

    constructor(s: string) {
        this.s = s;
    }
}

class UnEscapedTextString {
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

export class SorryBlock {
    placeholder_text: string;
    // This object is useful for testing and development. It creates a stub object.
    // In development users will get a pink text span saying "sorry" that reminds them
    // to eventually implement the actual sub-component.
    // (This approach was inspired by Lean Programming's approach toward
    // iteratively building up proofs.)
    constructor(placeholder_text?: string) {
        this.placeholder_text = placeholder_text ?? "sorry";
    }
    to_source(indent: string): string {
        return indent + this.placeholder_text;
    }

    to_dom(): Node {
        return text_wrapped_in_pink_span(this.placeholder_text);
    }
}

export class IfBlock {
    block: Block;
    bool: BoolVar;
    constructor(info: ConditionalBlockSpec) {
        this.bool = info.bool;
        this.block = info.block;
    }
    to_source(indent: string): string {
        return (
            indent +
            `{{#if ${this.bool.to_source()}}}\n` +
            this.block.to_source(indent + "    ") +
            "{{/if}}"
        );
    }
    to_dom(): Node {
        if (this.bool.b) {
            return this.block.to_dom();
        }
        return document.createDocumentFragment();
    }
}

export class UnlessBlock {
    block: Block;
    bool: BoolVar;
    constructor(info: ConditionalBlockSpec) {
        this.block = info.block;
        this.bool = info.bool;
    }
    to_source(indent: string): string {
        return (
            indent +
            `{{#unless ${this.bool.to_source()}}}\n` +
            this.block.to_source(indent + "    ") +
            "{{/unless}}"
        );
    }
    to_dom(): Node {
        if (!this.bool.b) {
            return this.block.to_dom();
        }
        return document.createDocumentFragment();
    }
}
type IfElseIfElseBlockSpec = {
    if_info: ConditionalBlockSpec;
    else_if_info: ConditionalBlockSpec;
    else_block: Block;
};
export class IfElseIfElseBlock {
    if_bool: BoolVar;
    else_if_bool: BoolVar;

    if_block: Block;
    else_if_block: Block;
    else_block: Block;

    constructor(info: IfElseIfElseBlockSpec) {
        const {if_info, else_if_info, else_block} = info;
        this.if_bool = if_info.bool;
        this.if_block = if_info.block;
        this.else_if_bool = else_if_info.bool;
        this.else_if_block = else_if_info.block;
        this.else_block = else_block;
    }
    to_source(indent: string): string {
        return (
            indent +
            `{{#if ${this.if_bool.to_source()}}}\n` +
            this.if_block.to_source(indent + "    ") +
            `{{else if ${this.else_if_bool.to_source()}}}\n` +
            this.else_if_block.to_source(indent + "    ") +
            "{{/if}}"
        );
    }
    to_dom(): Node {
        if (this.if_bool.b) {
            return this.if_block.to_dom();
        } else if (this.else_if_bool.b) {
            return this.else_if_block.to_dom();
        }
        return this.else_block.to_dom();
    }
}

class TranslatedText {
    translated_text: string;
    force_single_quotes: boolean | undefined;
    pink: boolean | undefined;
    // We assume the caller is passing in the
    // translated version of the string (unescaped).
    constructor(info: TranslatedTextSpec) {
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
    bool: BoolVar;
    yes_val: TrustedString;
    no_val: TrustedString;

    constructor(info: TrustedIfElseStringSpec) {
        this.bool = info.bool;
        this.yes_val = info.yes_val;
        this.no_val = info.no_val;
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

    constructor(info: TranslatedAttrValueSpec) {
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

    as_raw_html(): string {
        const div = document.createElement("div");
        const frag = this.to_dom();
        div.append(frag);
        return div.innerHTML;
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
        this.classes = tag_spec.classes ?? [];
        this.attrs = tag_spec.attrs ?? [];
        this.children = tag_spec.children ?? [];
        this.suppress_indent = tag_spec.suppress_indent;
        this.force_indent = tag_spec.force_indent;
        this.force_attrs_before_class = tag_spec.force_attrs_before_class;
        this.pink = tag_spec.pink;
    }

    children_source(indent: string): string {
        if (this.children.length === 0 && !this.force_indent) {
            return "";
        }

        if (this.children.length === 1) {
            const child_source = this.children[0]!.to_source("");
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
        this.attrs = info.attrs ?? [];
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

class ParenthesizedTag {
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

export function icon_button({
    button_classes,
    icon_classes,
}: {
    button_classes: TrustedString[];
    icon_classes: TrustedString[];
}): Tag {
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

// Add a new function wrapper to create an object instead of
// using the class constructor in a caller outside this module.
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

export function trusted_simple_string(str: string): TrustedSimpleString {
    return new TrustedSimpleString(str);
}

export function bool_var(info: BoolVarSpec): BoolVar {
    return new BoolVar(info);
}

export function trusted_if_else_string(info: TrustedIfElseStringSpec): TrustedIfElseString {
    return new TrustedIfElseString(info);
}

export function attr(k: string, v: TrustedString | TranslatedAttrValue): Attr {
    return new Attr(k, v);
}

export function translated_attr_value(info: TranslatedAttrValueSpec): TranslatedAttrValue {
    return new TranslatedAttrValue(info);
}

export function block(elements: Element[]): Block {
    return new Block(elements);
}

export function text_var(info: TextVarSpec): TextVar {
    return new TextVar(info);
}

export function unescaped_text_string(str: string): UnEscapedTextString {
    return new UnEscapedTextString(str);
}

export function unescaped_attr_string(str: string): UnEscapedAttrString {
    return new UnEscapedAttrString(str);
}

export function parenthesized_tag(tag: Tag): ParenthesizedTag {
    return new ParenthesizedTag(tag);
}

export function translated_text(info: TranslatedTextSpec): TranslatedText {
    return new TranslatedText(info);
}

export function trusted_attr_string_var(info: TrustedAttrStringVarSpec): TrustedAttrStringVar {
    return new TrustedAttrStringVar(info);
}

export function comment(str: string): Comment {
    return new Comment(str);
}

export function if_bool_then_block(info: ConditionalBlockSpec): IfBlock {
    return new IfBlock(info);
}

export function unless_bool_then_block(info: ConditionalBlockSpec): UnlessBlock {
    return new UnlessBlock(info);
}

export function if_bool_then_x_else_if_bool_then_y_else_z(
    info: IfElseIfElseBlockSpec,
): IfElseIfElseBlock {
    return new IfElseIfElseBlock(info);
}
