// import * as h from "./html.ts";
// import {$t} from "./i18n.ts";
import * as h from "./html";
function $t(info: { defaultMessage: string }): string {
    return info.defaultMessage;
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
        force_attrs_before_class: true,
        classes: [
            new h.TrustedSimpleString("buddy-list-heading"),
            new h.TrustedSimpleString("no-style"),
            new h.TrustedSimpleString("hidden-for-spectators"),
        ],
        attrs: [
            new h.Attr(
                "id",
                new h.TrustedAttrStringVar("id", new h.UnEscapedAttrString(id)),
            ),
        ],
        children: [
            h.span_tag({
                suppress_indent: true,
                classes: [new h.TrustedSimpleString("buddy-list-heading-text")],
                children: [
                    new h.TextVar(
                        "header_text",
                        new h.UnEscapedTextString(header_text),
                    ),
                ],
            }),

            new h.Comment(
                "Hide the count until we have fetched data to display the correct count",
            ),

            // user count outer span
            h.span_tag({
                classes: [
                    new h.TrustedSimpleString(
                        "buddy-list-heading-user-count-with-parens",
                    ),
                    new h.TrustedSimpleString("hide"),
                ],
                children: [
                    new h.ParenthesizedTag(
                        // inner span for count of people in the section
                        h.span_tag({
                            classes: [
                                new h.TrustedSimpleString(
                                    "buddy-list-heading-user-count",
                                ),
                            ],
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

export function view_all_subscribers(info: {
    stream_edit_hash: string;
}): h.Block {
    const a_tag = h.a_tag({
        classes: [
            new h.TrustedSimpleString("right-sidebar-wrappable-text-container"),
        ],
        attrs: [
            new h.Attr(
                "href",
                new h.TrustedAttrStringVar(
                    "stream_edit_hash",
                    new h.UnEscapedAttrString(info.stream_edit_hash),
                ),
            ),
        ],
        children: [
            h.span_tag({
                classes: [
                    new h.TrustedSimpleString(
                        "right-sidebar-wrappable-text-inner",
                    ),
                ],
                children: [
                    new h.TranslatedText({
                        translated_text: $t({
                            defaultMessage: "View all subscribers",
                        }),
                    }),
                ],
            }),
        ],
    });

    const result = new h.Block([a_tag]);
    return result;
}

export function view_all_users(): h.Block {
    const a_tag = h.a_tag({
        classes: [
            new h.TrustedSimpleString("right-sidebar-wrappable-text-container"),
        ],
        attrs: [
            new h.Attr(
                "href",
                new h.TrustedSimpleString("#organization/users"),
            ),
        ],
        children: [
            h.span_tag({
                classes: [
                    new h.TrustedSimpleString(
                        "right-sidebar-wrappable-text-inner",
                    ),
                ],
                children: [
                    new h.TranslatedText({
                        translated_text: $t({
                            defaultMessage: "View all users",
                        }),
                    }),
                ],
            }),
        ],
    });

    const result = new h.Block([a_tag]);
    return result;
}

export function empty_list_widget_for_list(info: {
    empty_list_message: string;
}): h.Block {
    const li_tag = h.li_tag({
        suppress_indent: true,
        classes: [new h.TrustedSimpleString("empty-list-message")],
        children: [
            new h.TextVar(
                "empty_list_message",
                new h.UnEscapedTextString(info.empty_list_message),
            ),
        ],
    });

    const result = new h.Block([li_tag]);
    return result;
}

export function poll_widget() {
    const add_question_widget = h.input_text_tag({
        placeholder_value: new h.TranslatedAttrValue({
            translated_string: $t({ defaultMessage: "Add question" }),
        }),
        classes: [new h.TrustedSimpleString("poll-question")],
    });

    const poll_question_header = h.h4_tag({
        classes: [new h.TrustedSimpleString("poll-question-header")],
        children: [],
    });

    const edit_question_icon = h.i_tag({
        classes: [
            new h.TrustedSimpleString("fa"),
            new h.TrustedSimpleString("fa-pencil"),
            new h.TrustedSimpleString("poll-edit-question"),
        ],
        children: [],
    });

    const remove_icon = h.IconButton({
        icon_classes: [
            new h.TrustedSimpleString("fa"),
            new h.TrustedSimpleString("fa-remove"),
        ],
        button_classes: [new h.TrustedSimpleString("poll-question-remove")],
    });

    const poll_question_check_icon = h.IconButton({
        icon_classes: [
            new h.TrustedSimpleString("fa"),
            new h.TrustedSimpleString("fa-check"),
        ],
        button_classes: [new h.TrustedSimpleString("poll-question-check")],
    });

    const new_option_input = h.input_text_tag({
        placeholder_value: new h.TranslatedAttrValue({
            translated_string: $t({ defaultMessage: "New option" }),
        }),
        classes: [new h.TrustedSimpleString("poll-option")],
    });

    const please_wait_for_the_question = h.div_tag({
        classes: [new h.TrustedSimpleString("poll-please-wait")],
        children: [
            new h.TranslatedText({
                translated_text: $t({
                    defaultMessage:
                        "We are about to have a poll.  Please wait for the question.",
                }),
                force_single_quotes: true,
            }),
        ],
    });

    const widget = h.div_tag({
        classes: [new h.TrustedSimpleString("poll-widget")],
        children: [
            h.div_tag({
                classes: [new h.TrustedSimpleString("poll-widget-header-area")],
                children: [
                    poll_question_header,
                    edit_question_icon,
                    h.div_tag({
                        classes: [
                            new h.TrustedSimpleString("poll-question-bar"),
                        ],
                        children: [
                            add_question_widget,
                            remove_icon,
                            poll_question_check_icon,
                        ],
                    }),
                ],
            }),
            please_wait_for_the_question,
            h.ul_tag({
                children: [],
                classes: [new h.TrustedSimpleString("poll-widget")],
                force_indent: true,
            }),
            h.div_tag({
                classes: [new h.TrustedSimpleString("poll-option-bar")],
                children: [
                    new_option_input,
                    h.button_tag({
                        suppress_indent: true,
                        classes: [new h.TrustedSimpleString("poll-option")],
                        children: [
                            new h.TranslatedText({
                                translated_text: $t({
                                    defaultMessage: "Add option",
                                }),
                            }),
                        ],
                    }),
                ],
            }),
        ],
    });

    const result = new h.Block([widget]);
    return result;
}
