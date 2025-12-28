// import * as h from "./html.ts";
// import {$t} from "./i18n.ts";
import * as h from "./html";
function $t(info: {defaultMessage: string}): string {
    return `translated from "${info.defaultMessage}"`;
}

export function buddy_list_section_header(info: {
    id: string;
    header_text: string;
    is_collapsed: boolean;
}): h.Block {
    const { id, header_text, is_collapsed } = info;

    const rotation_class = new h.TrustedIfElseString(
        new h.Bool("is_collapsed", is_collapsed),
        new h.TrustedSimpleString("rotate-icon-right"),
        new h.TrustedSimpleString("rotate-icon-down"),
    );

    const section_icon = h.i_tag({
        class_first: true,
        classes: [
            new h.TrustedSimpleString("buddy-list-section-toggle"),
            new h.TrustedSimpleString("zulip-icon"),
            new h.TrustedSimpleString("zulip-icon-heading-triangle-right"),
            rotation_class,
        ],
        attrs: [new h.Attr("aria-hidden", new h.TrustedSimpleString("true"))],
        children: [],
    });

    const h5 = h.h5_tag({
        class_first: false,
        classes: [
            new h.TrustedSimpleString("buddy-list-heading"),
            new h.TrustedSimpleString("no-style"),
            new h.TrustedSimpleString("hidden-for-spectators"),
        ],
        attrs: [new h.Attr("id", new h.TrustedAttrStringVar("id", new h.UnEscapedAttrString(id)))],
        children: [
            h.span_tag({
                class_first: true,
                classes: [new h.TrustedSimpleString("buddy-list-heading-text")],
                attrs: [],
                children: [new h.TextVar("header_text", new h.UnEscapedTextString(header_text))],
            }),

            new h.Comment("Hide the count until we have fetched data to display the correct count"),

            // user count outer span
            h.span_tag({
                class_first: true,
                classes: [
                    new h.TrustedSimpleString("buddy-list-heading-user-count-with-parens"),
                    new h.TrustedSimpleString("hide"),
                ],
                attrs: [],
                children: [
                    new h.ParenthesizedTag(
                        // inner span for count of people in the section
                        h.span_tag({
                            class_first: true,
                            classes: [new h.TrustedSimpleString("buddy-list-heading-user-count")],
                            attrs: [],
                            children: [],
                        }),
                    ),
                ],
            }),
        ],
    });

    const result = new h.Block([section_icon, h5]);

    return result;
}

export function view_all_subscribers(info: {stream_edit_hash: string}): h.Block {
    const a_tag = h.a_tag({
        class_first: true,
        classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-container")],
        attrs: [new h.Attr("href", new h.TrustedSimpleString(info.stream_edit_hash))],
        children: [
            h.span_tag({
                classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-inner")],
                class_first: true,
                attrs: [],
                children: [new h.TranslatedText($t({defaultMessage: "View all subscribers"}))],
            }),
        ],
    });

    const result = new h.Block([a_tag]);
    return result;
}

export function view_all_users(): h.Block {
    const a_tag = h.a_tag({
        class_first: true,
        classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-container")],
        attrs: [new h.Attr("href", new h.TrustedSimpleString("#organization/users"))],
        children: [
            h.span_tag({
                classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-inner")],
                class_first: true,
                attrs: [],
                children: [new h.TranslatedText($t({defaultMessage: "View all users"}))],
            }),
        ],
    });

    const result = new h.Block([a_tag]);
    return result;
}

export function empty_list_widget(info: {empty_list_message: string}): h.Block {
    const li_tag = h.li_tag({
        class_first: true,
        classes: [new h.TrustedSimpleString("empty-list-message")],
        attrs: [],
        children: [
            new h.TextVar("empty_list_message", new h.UnEscapedTextString(info.empty_list_message)),
        ],
    });

    const result = new h.Block([li_tag]);
    return result;
}

export function poll_widget() {
    const widget = h.div_tag({
        class_first: true,
        classes: [new h.TrustedSimpleString("poll-widget")],
        attrs: [],
        children: [
            h.div_tag({
                class_first: true,
                classes: [new h.TrustedSimpleString("poll-widget-header-area")],
                attrs: [],
                children: [
                    h.h4_tag({
                        class_first: true,
                        classes: [new h.TrustedSimpleString("poll-question-header")],
                        attrs: [],
                        children: [],
                    }),
                    h.i_tag({
                        class_first: true,
                        classes: [
                            new h.TrustedSimpleString("fa"),
                            new h.TrustedSimpleString("fa-pencil"),
                            new h.TrustedSimpleString("poll-edit-question"),
                        ],
                        attrs: [],
                        children: [],
                    }),
                    h.div_tag({
                        class_first: true,
                        classes: [new h.TrustedSimpleString("poll-question-bar")],
                        attrs: [],
                        children: [
                            h.input_tag({
                                attrs: [
                                    new h.Attr(
                                        "placeholder",
                                        new h.TranslatedAttrValue(
                                            "Add question",
                                            $t({defaultMessage: "Add question"}),
                                        ),
                                    ),
                                    new h.Attr("type", new h.TrustedSimpleString("text")),
                                ],
                                children: [],
                                class_first: true,
                                classes: [new h.TrustedSimpleString("poll-question")],
                            }),
                            h.IconButton({
                                icon_classes: [
                                    new h.TrustedSimpleString("fa"),
                                    new h.TrustedSimpleString("fa-remove"),
                                ],
                                button_classes: [new h.TrustedSimpleString("poll-question-remove")],
                            }),
                            h.IconButton({
                                icon_classes: [
                                    new h.TrustedSimpleString("fa"),
                                    new h.TrustedSimpleString("fa-check"),
                                ],
                                button_classes: [new h.TrustedSimpleString("poll-question-check")],
                            }),
                        ],
                    }),
                ],
            }),
            h.div_tag({
                classes: [new h.TrustedSimpleString("poll-please-wait")],
                class_first: true,
                attrs: [],
                children: [
                    new h.TranslatedText(
                        $t({
                            defaultMessage:
                                "We are about to have a poll.  Please wait for the question.",
                        }),
                    ),
                ],
            }),
            h.ul_tag({
                children: [],
                attrs: [],
                classes: [new h.TrustedSimpleString("poll-widget")],
                class_first: true,
            }),
            h.div_tag({
                attrs: [],
                classes: [new h.TrustedSimpleString("poll-option-bar")],
                class_first: true,
                children: [
                    h.input_tag({
                        attrs: [
                            new h.Attr("type", new h.TrustedSimpleString("text")),
                            new h.Attr(
                                "placeholder",
                                new h.TranslatedAttrValue(
                                    "New option",
                                    $t({defaultMessage: "New option"}),
                                ),
                            ),
                        ],
                        classes: [new h.TrustedSimpleString("poll-option")],
                        class_first: true,
                        children: [],
                    }),
                    h.button_tag({
                        classes: [new h.TrustedSimpleString("poll-option")],
                        children: [
                            new h.TranslatedText(
                                $t({
                                    defaultMessage: "Add option",
                                }),
                            ),
                        ],
                        class_first: true,
                        attrs: [],
                    }),
                ],
            }),
        ],
    });

    const result = new h.Block([widget]);
    return result;
}
