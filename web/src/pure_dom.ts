import * as h from "./html.ts";
// import {$t} from "./i18n.ts";
// import * as h from "./html";
function $t(info: {defaultMessage: string}): string {
    return info.defaultMessage;
}

// This builds the UI that looks like "<triangle icon> OTHERS" in the buddy list.
//Users can collapse or un-collapse the users by clicking on the header.
// The **entire** section header is a click target.  Most of the smaller components
// only get drawn and styled.
export function buddy_list_section_header(info: {
    id: string;
    header_text: string;
    is_collapsed: boolean;
}): h.Block {
    // This only draws the icon.
    // All the click handlers act on the div tag
    // that gets wrapped around it.
    function section_rotation_icon(): h.Tag {
        // The rotation_class sets an eventual class for the icon as either
        // "rotate-icon-right" or "rotate-icon-down".
        // They lead to rotate: 0deg and rotate: 90deg in the Zulip CSS.
        function rotation_class(): h.TrustedIfElseString {
            return new h.TrustedIfElseString(
                new h.Bool("is_collapsed", info.is_collapsed),
                new h.TrustedSimpleString("rotate-icon-right"),
                new h.TrustedSimpleString("rotate-icon-down"),
            );
        }

        return h.i_tag({
            classes: [
                new h.TrustedSimpleString("buddy-list-section-toggle"),
                new h.TrustedSimpleString("zulip-icon"),
                new h.TrustedSimpleString("zulip-icon-heading-triangle-right"),
                rotation_class(),
            ],
            attrs: [new h.Attr("aria-hidden", new h.TrustedSimpleString("true"))],
            pink: true,
        });
    }

    // The heading_text_span creates a span with the text of either
    // "THIS CONVERSATION" or "OTHERS" as determined by the color.
    // It has no handlers attached directly to it.
    // Its HTML class maps to a CSS class that controls overflow, alignment,
    // and wrapping. Most of the additional styling (fonts, color, etc.)
    // happens on an a surrounding element.
    function heading_text_span(): h.Tag {
        return h.span_tag({
            suppress_indent: true,
            classes: [new h.TrustedSimpleString("buddy-list-heading-text")],
            children: [
                new h.TextVar({
                    label: "header_text",
                    s: new h.UnEscapedTextString(info.header_text),
                    pink: true,
                }),
            ],
        });
    }

    // user_count_span builds an outer span around a text element that
    // says something like "(35K)" to indicate how many users are inside
    // our section of the buddy list.
    function user_count_span(): h.Tag {
        return h.span_tag({
            classes: [
                // The buddy-list-heading-user-count-with-parens class is used to
                // drive styling in the Zulip CSS. It only sets opacity as of
                // this writing.
                new h.TrustedSimpleString("buddy-list-heading-user-count-with-parens"),
                new h.TrustedSimpleString("hide"),
            ],
            children: [
                new h.ParenthesizedTag(
                    // inner span for count of people in the section
                    h.span_tag({
                        classes: [new h.TrustedSimpleString("buddy-list-heading-user-count")],
                    }),
                ),
            ],
        });
    }

    // The h5 tag encloses the heading text (e.g. "OTHERS") and the user count
    // (e.g. "(35K)") but not the rotation icon (for reasons not clear, but probably fine).
    function buddy_list_heading() {
        return h.h5_tag({
            force_attrs_before_class: true,
            classes: [
                // The buddy-list-heading drives a lot of CSS styling. It's also used by jQuery
                // to find the element to attach to for mouse handling.
                new h.TrustedSimpleString("buddy-list-heading"),
                // The no-style class turns off text decoration and sets the cursor
                // to a pointer, since this is gonna be part of the overall click
                // target to toggle whether you show uses in the section.
                new h.TrustedSimpleString("no-style"),
                // The hidden-for-spectators class hides the section from Zulip
                // spectators using the standard mechanisms.
                new h.TrustedSimpleString("hidden-for-spectators"),
            ],
            attrs: [
                new h.Attr(
                    "id",
                    new h.TrustedAttrStringVar("id", new h.UnEscapedAttrString(info.id)),
                ),
            ],
            children: [
                heading_text_span(),
                new h.Comment(
                    "Hide the count until we have fetched data to display the correct count",
                ),
                user_count_span(),
            ],
        });
    }

    return new h.Block([section_rotation_icon(), buddy_list_heading()]);
}

export function view_all_subscribers(info: {stream_edit_hash: string}): h.Block {
    function view_all_subscribers_span(): h.Tag {
        return h.span_tag({
            classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-inner")],
            children: [
                new h.TranslatedText({
                    translated_text: $t({
                        defaultMessage: "View all subscribers",
                    }),
                    pink: true,
                }),
            ],
        });
    }

    function href_to_view_all_subscribers_in_the_stream_edit_ui(): h.TrustedAttrStringVar {
        return new h.TrustedAttrStringVar(
            "stream_edit_hash",
            new h.UnEscapedAttrString(info.stream_edit_hash),
        );
    }

    function right_sidebar_wrappable_text_container(): h.Tag {
        return h.a_tag({
            classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-container")],
            attrs: [new h.Attr("href", href_to_view_all_subscribers_in_the_stream_edit_ui())],
            children: [view_all_subscribers_span()],
        });
    }
    return new h.Block([right_sidebar_wrappable_text_container()]);
}

export function view_all_users(): h.Block {
    function view_all_users_span(): h.Tag {
        return h.span_tag({
            classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-inner")],
            children: [
                new h.TranslatedText({
                    translated_text: $t({
                        defaultMessage: "View all users",
                    }),
                    pink: true,
                }),
            ],
        });
    }

    function right_sidebar_wrappable_text_container(): h.Tag {
        return h.a_tag({
            classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-container")],
            attrs: [new h.Attr("href", new h.TrustedSimpleString("#organization/users"))],
            children: [view_all_users_span()],
        });
    }

    return new h.Block([right_sidebar_wrappable_text_container()]);
}

export function empty_list_widget_for_list(info: {empty_list_message: string}): h.Block {
    function li_tag(): h.Tag {
        return h.li_tag({
            suppress_indent: true,
            classes: [new h.TrustedSimpleString("empty-list-message")],
            children: [
                new h.TextVar({
                    label: "empty_list_message",
                    s: new h.UnEscapedTextString(info.empty_list_message),
                }),
            ],
        });
    }

    return new h.Block([li_tag()]);
}

export function poll_widget() {
    function add_question_widget(): h.InputTextTag {
        return h.input_text_tag({
            placeholder_value: new h.TranslatedAttrValue({
                translated_string: $t({defaultMessage: "Add question"}),
            }),
            classes: [new h.TrustedSimpleString("poll-question")],
        });
    }

    function poll_question_header(): h.Tag {
        return h.h4_tag({
            classes: [new h.TrustedSimpleString("poll-question-header")],
            pink: true,
        });
    }

    function edit_question_icon(): h.Tag {
        return h.i_tag({
            classes: [
                new h.TrustedSimpleString("fa"),
                new h.TrustedSimpleString("fa-pencil"),
                new h.TrustedSimpleString("poll-edit-question"),
            ],
        });
    }

    function remove_icon(): h.Tag {
        return h.IconButton({
            icon_classes: [new h.TrustedSimpleString("fa"), new h.TrustedSimpleString("fa-remove")],
            button_classes: [new h.TrustedSimpleString("poll-question-remove")],
        });
    }

    function poll_question_check_icon(): h.Tag {
        return h.IconButton({
            icon_classes: [new h.TrustedSimpleString("fa"), new h.TrustedSimpleString("fa-check")],
            button_classes: [new h.TrustedSimpleString("poll-question-check")],
        });
    }

    function new_option_input(): h.InputTextTag {
        return h.input_text_tag({
            placeholder_value: new h.TranslatedAttrValue({
                translated_string: $t({defaultMessage: "New option"}),
            }),
            classes: [new h.TrustedSimpleString("poll-option")],
        });
    }

    function please_wait_for_the_question(): h.Tag {
        return h.div_tag({
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
    }

    function poll_question_bar(): h.Tag {
        return h.div_tag({
            classes: [new h.TrustedSimpleString("poll-question-bar")],
            children: [add_question_widget(), remove_icon(), poll_question_check_icon()],
        });
    }

    function poll_widget_header_area(): h.Tag {
        return h.div_tag({
            classes: [new h.TrustedSimpleString("poll-widget-header-area")],
            children: [poll_question_header(), edit_question_icon(), poll_question_bar()],
        });
    }

    function add_option_button(): h.Tag {
        return h.button_tag({
            suppress_indent: true,
            classes: [new h.TrustedSimpleString("poll-option")],
            children: [
                new h.TranslatedText({
                    translated_text: $t({
                        defaultMessage: "Add option",
                    }),
                }),
            ],
        });
    }

    function poll_option_bar(): h.Tag {
        return h.div_tag({
            classes: [new h.TrustedSimpleString("poll-option-bar")],
            children: [new_option_input(), add_option_button()],
        });
    }

    function ul_for_poll_options(): h.Tag {
        return h.ul_tag({
            classes: [new h.TrustedSimpleString("poll-widget")],
            force_indent: true,
        });
    }

    function widget() {
        return h.div_tag({
            classes: [new h.TrustedSimpleString("poll-widget")],
            children: [
                poll_widget_header_area(),
                please_wait_for_the_question(),
                ul_for_poll_options(),
                poll_option_bar(),
            ],
        });
    }

    return new h.Block([widget()]);
}
