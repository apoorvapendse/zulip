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
    const {id, header_text, is_collapsed} = info;

    // This only draws the icon.
    // All the click handlers act on the div tag
    // that gets wrapped around it.
    function section_rotation_icon(): h.Tag {
        // The rotation_class sets an eventual class for the icon as either
        // "rotate-icon-right" or "rotate-icon-down".
        // They lead to rotate: 0deg and rotate: 90deg in the Zulip CSS.
        const rotation_class = new h.TrustedIfElseString(
            new h.Bool("is_collapsed", is_collapsed),
            new h.TrustedSimpleString("rotate-icon-right"),
            new h.TrustedSimpleString("rotate-icon-down"),
        );
        return h.i_tag({
            classes: [
                new h.TrustedSimpleString("buddy-list-section-toggle"),
                new h.TrustedSimpleString("zulip-icon"),
                new h.TrustedSimpleString("zulip-icon-heading-triangle-right"),
                rotation_class,
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
    const heading_text_span = h.span_tag({
        suppress_indent: true,
        classes: [new h.TrustedSimpleString("buddy-list-heading-text")],
        children: [
            new h.TextVar({
                label: "header_text",
                s: new h.UnEscapedTextString(header_text),
                pink: true,
            }),
        ],
    });

    // user_count_span builds an outer span around a text element that
    // says something like "(35K)" to indicate how many users are inside
    // our section of the buddy list.
    const user_count_span = h.span_tag({
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

    // The h5 tag encloses the heading text (e.g. "OTHERS") and the user count
    // (e.g. "(35K)") but not the rotation icon (for reasons not clear, but probably fine).
    const h5 = h.h5_tag({
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
        attrs: [new h.Attr("id", new h.TrustedAttrStringVar("id", new h.UnEscapedAttrString(id)))],
        children: [
            heading_text_span,
            new h.Comment("Hide the count until we have fetched data to display the correct count"),
            user_count_span,
        ],
    });

    const result = new h.Block([section_rotation_icon(), h5]);

    return result;
}

export function view_all_subscribers(info: {stream_edit_hash: string}): h.Block {
    const view_all_subscribers_span = h.span_tag({
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

    const href_to_view_all_subscribers_in_the_stream_edit_ui = new h.TrustedAttrStringVar(
        "stream_edit_hash",
        new h.UnEscapedAttrString(info.stream_edit_hash),
    );

    const a_tag = h.a_tag({
        classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-container")],
        attrs: [new h.Attr("href", href_to_view_all_subscribers_in_the_stream_edit_ui)],
        children: [view_all_subscribers_span],
    });

    const result = new h.Block([a_tag]);
    return result;
}

export function view_all_users(): h.Block {
    const view_all_users_span = h.span_tag({
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

    const a_tag = h.a_tag({
        classes: [new h.TrustedSimpleString("right-sidebar-wrappable-text-container")],
        attrs: [new h.Attr("href", new h.TrustedSimpleString("#organization/users"))],
        children: [view_all_users_span],
    });

    const result = new h.Block([a_tag]);
    return result;
}

export function empty_list_widget_for_list(info: {empty_list_message: string}): h.Block {
    const li_tag = h.li_tag({
        suppress_indent: true,
        classes: [new h.TrustedSimpleString("empty-list-message")],
        children: [
            new h.TextVar({
                label: "empty_list_message",
                s: new h.UnEscapedTextString(info.empty_list_message),
            }),
        ],
    });

    const result = new h.Block([li_tag]);
    return result;
}

export function poll_widget() {
    const add_question_widget = h.input_text_tag({
        placeholder_value: new h.TranslatedAttrValue({
            translated_string: $t({defaultMessage: "Add question"}),
        }),
        classes: [new h.TrustedSimpleString("poll-question")],
    });

    const poll_question_header = h.h4_tag({
        classes: [new h.TrustedSimpleString("poll-question-header")],
        pink: true,
    });

    const edit_question_icon = h.i_tag({
        classes: [
            new h.TrustedSimpleString("fa"),
            new h.TrustedSimpleString("fa-pencil"),
            new h.TrustedSimpleString("poll-edit-question"),
        ],
    });

    const remove_icon = h.IconButton({
        icon_classes: [new h.TrustedSimpleString("fa"), new h.TrustedSimpleString("fa-remove")],
        button_classes: [new h.TrustedSimpleString("poll-question-remove")],
    });

    const poll_question_check_icon = h.IconButton({
        icon_classes: [new h.TrustedSimpleString("fa"), new h.TrustedSimpleString("fa-check")],
        button_classes: [new h.TrustedSimpleString("poll-question-check")],
    });

    const new_option_input = h.input_text_tag({
        placeholder_value: new h.TranslatedAttrValue({
            translated_string: $t({defaultMessage: "New option"}),
        }),
        classes: [new h.TrustedSimpleString("poll-option")],
    });

    const please_wait_for_the_question = h.div_tag({
        classes: [new h.TrustedSimpleString("poll-please-wait")],
        children: [
            new h.TranslatedText({
                translated_text: $t({
                    defaultMessage: "We are about to have a poll.  Please wait for the question.",
                }),
                force_single_quotes: true,
            }),
        ],
    });

    const poll_question_bar = h.div_tag({
        classes: [new h.TrustedSimpleString("poll-question-bar")],
        children: [add_question_widget, remove_icon, poll_question_check_icon],
    });

    const poll_widget_header_area = h.div_tag({
        classes: [new h.TrustedSimpleString("poll-widget-header-area")],
        children: [poll_question_header, edit_question_icon, poll_question_bar],
    });

    const add_option_button = h.button_tag({
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

    const poll_option_bar = h.div_tag({
        classes: [new h.TrustedSimpleString("poll-option-bar")],
        children: [new_option_input, add_option_button],
    });

    const ul_for_poll_options = h.ul_tag({
        classes: [new h.TrustedSimpleString("poll-widget")],
        force_indent: true,
    });

    const widget = h.div_tag({
        classes: [new h.TrustedSimpleString("poll-widget")],
        children: [
            poll_widget_header_area,
            please_wait_for_the_question,
            ul_for_poll_options,
            poll_option_bar,
        ],
    });

    const result = new h.Block([widget]);
    return result;
}
