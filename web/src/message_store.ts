import _ from "lodash";
import * as z from "zod/mini";

import * as blueslip from "./blueslip.ts";
import type {RawLocalMessage} from "./echo.ts";
import type {LocalMessage, NewMessage, ProcessedMessage} from "./message_helper.ts";
import type {TimeFormattedReminder} from "./message_reminder.ts";
import * as people from "./people.ts";
import * as stream_data from "./stream_data.ts";
import {topic_link_schema} from "./types.ts";
import type {UserStatusEmojiInfo} from "./user_status.ts";
import * as util from "./util.ts";

const stored_messages = new Map<number, ProcessedMessage>();

/** Cached ImmutableMessage wrappers keyed by message id. */
const immutable_message_cache = new Map<number, ImmutableMessage>();
/** Cached MutableMessage wrappers keyed by message id. */
const mutable_message_cache = new Map<number, MutableMessage>();

const matched_message_schema = z.object({
    match_content: z.optional(z.string()),
    match_subject: z.optional(z.string()),
});

export type MatchedMessage = z.infer<typeof matched_message_schema>;

const message_reaction_type_schema = z.enum(["unicode_emoji", "realm_emoji", "zulip_extra_emoji"]);

export type MessageReactionType = z.infer<typeof message_reaction_type_schema>;

const display_recipient_user_schema = z.object({
    email: z.string(),
    full_name: z.string(),
    id: z.number(),
});

export type DisplayRecipientUser = z.infer<typeof display_recipient_user_schema>;

const display_recipient_schema = z.union([z.string(), z.array(display_recipient_user_schema)]);

export type DisplayRecipient = z.infer<typeof display_recipient_schema>;

const message_edit_history_entry_schema = z.object({
    user_id: z.nullable(z.number()),
    timestamp: z.number(),
    prev_content: z.optional(z.string()),
    prev_rendered_content: z.optional(z.string()),
    prev_stream: z.optional(z.number()),
    prev_topic: z.optional(z.string()),
    stream: z.optional(z.number()),
    topic: z.optional(z.string()),
});

export type MessageEditHistoryEntry = z.infer<typeof message_edit_history_entry_schema>;

const message_reaction_schema = z.object({
    emoji_name: z.string(),
    emoji_code: z.string(),
    reaction_type: message_reaction_type_schema,
    user_id: z.number(),
});

export type MessageReaction = z.infer<typeof message_reaction_schema>;

export const single_message_content_schema = z.object({
    message: z.object({
        content: z.string(),
        content_type: z.enum(["text/html", "text/x-markdown"]),
    }),
});

export const message_render_response_schema = z.object({
    msg: z.string(),
    result: z.string(),
    rendered: z.string(),
});

export const submessage_schema = z.object({
    id: z.number(),
    sender_id: z.number(),
    message_id: z.number(),
    content: z.string(),
    msg_type: z.string(),
});

export const raw_message_schema = z.intersection(
    z.intersection(
        z.object({
            avatar_url: z.nullable(z.string()),
            client: z.string(),
            content: z.string(),
            content_type: z.enum(["text/html", "text/x-markdown"]),
            display_recipient: display_recipient_schema,
            edit_history: z.optional(z.array(message_edit_history_entry_schema)),
            id: z.number(),
            is_me_message: z.boolean(),
            last_edit_timestamp: z.optional(z.number()),
            last_moved_timestamp: z.optional(z.number()),
            reactions: z.array(message_reaction_schema),
            sender_email: z.string(),
            sender_full_name: z.string(),
            sender_id: z.number(),
            // The web app doesn't use sender_realm_str; ignore.
            // sender_realm_str: z.string(),
            submessages: z.array(submessage_schema),
            timestamp: z.number(),
            flags: z.array(z.string()),
        }),
        z.discriminatedUnion("type", [
            z.object({
                type: z.literal("private"),
                topic_links: z.optional(z.array(z.never())),
            }),
            z.object({
                type: z.literal("stream"),
                stream_id: z.number(),
                // Messages that come from the server use `subject`.
                // Messages that come from `send_message` use `topic`.
                subject: z.optional(z.string()),
                topic: z.optional(z.string()),
                topic_links: z.array(topic_link_schema),
            }),
        ]),
    ),
    matched_message_schema,
);

export type RawMessage = z.infer<typeof raw_message_schema>;

// We add these boolean properties to Raw message in
// `message_store.convert_raw_message_to_message_with_booleans` method.
type Booleans = {
    unread: boolean;
    historical: boolean;
    starred: boolean;
    mentioned: boolean;
    mentioned_me_directly: boolean;
    stream_wildcard_mentioned: boolean;
    topic_wildcard_mentioned: boolean;
    collapsed: boolean;
    condensed?: boolean;
    alerted: boolean;
};

type RawMessageWithBooleans = (
    | Omit<RawMessage & {type: "private"}, "flags">
    | Omit<RawMessage & {type: "stream"}, "flags">
) &
    Booleans;

type LocalMessageWithBooleans = (
    | Omit<RawLocalMessage & {type: "private"}, "flags">
    | Omit<RawLocalMessage & {type: "stream"}, "flags">
) &
    Booleans;

export type MessageWithBooleans = RawMessageWithBooleans | LocalMessageWithBooleans;

export type MessageCleanReaction = {
    class: string;
    count: number;
    emoji_alt_code: boolean;
    emoji_code: string;
    emoji_name: string;
    is_realm_emoji: boolean;
    label: string;
    local_id: string;
    reaction_type: "zulip_extra_emoji" | "realm_emoji" | "unicode_emoji";
    user_ids: number[];
    vote_text: string;
};

export type Message = (
    | Omit<RawMessageWithBooleans & {type: "private"}, "reactions">
    | Omit<RawMessageWithBooleans & {type: "stream"}, "reactions" | "subject">
) & {
    clean_reactions: Map<string, MessageCleanReaction>;

    // Local echo state cluster of fields.
    locally_echoed?: boolean;
    failed_request?: boolean;
    show_slow_send_spinner?: boolean;
    resend?: boolean;
    local_id?: string;

    // The original markup for the message, which we'll have if we
    // sent it or if we fetched it (usually, because the current user
    // tried to edit the message).
    raw_content?: string | undefined;

    // Added in `message_helper.process_new_message`.
    sent_by_me: boolean;
    reply_to: string;

    // These properties are set and used in `message_list_view.ts`.
    // TODO: It would be nice if we could not store these on the message
    // object and only reference them within `message_list_view`.
    message_reactions?: MessageCleanReaction[];
    url?: string;

    // Used in `markdown.js`, `server_events.js`, and
    // `convert_raw_message_to_message_with_booleans`
    flags?: string[];

    // Used in `message_avatar.hbs` to render sender avatar in
    // message list.
    small_avatar_url?: string | null;

    // Used in `message_body.hbs` to show sender status emoji alongside
    // their name in message list.
    status_emoji_info?: UserStatusEmojiInfo | undefined;

    // Used for edited messages to show their last edit time.
    local_edit_timestamp?: number;

    // Used in message_notifications to track if a notification has already
    // been sent for this message.
    notification_sent?: boolean;

    // Added during message rendering in message_list_view.ts. Should
    // never be accessed outside rendering, as the value may be stale.
    reminders?: TimeFormattedReminder[] | undefined;

    // Cache for whether the message has widget edits (e.g. poll question changes).
    has_widget_edits?: boolean;
} & (
        | {
              type: "private";
              is_private: true;
              is_stream: false;
              pm_with_url: string;
              to_user_ids: string;
              display_reply_to: string;
          }
        | {
              type: "stream";
              is_private: false;
              is_stream: true;
              stream: string;
              topic: string;
              display_reply_to: undefined;
          }
    );

export function update_message_cache(message_data: ProcessedMessage): void {
    // You should only call this from message_helper (or in tests).
    stored_messages.set(message_data.message.id, message_data);
}

export function get_cached_message(message_id: number): ProcessedMessage | undefined {
    // You should only call this from message_helper.
    // Use the get() wrapper below for most other use cases.
    return stored_messages.get(message_id);
}

export function clear_for_testing(): void {
    stored_messages.clear();
    immutable_message_cache.clear();
    mutable_message_cache.clear();
}

// This can return a LocalMessage, but unless anything needs that,
// it's easier to type it as just returning a Message.
// TODO: If we finish converting to typescript and find that
// nothing needs LocalMessage, explicitly remove its extra fields
// here before returning the Message.
/**
 * Returns a cached ImmutableMessage wrapper (never a bare mutable Message).
 * Prefer maybe_get_immutable_message (same implementation).
 */
export function get(message_id: number): ImmutableMessage | undefined {
    const message = stored_messages.get(message_id)?.message;
    if (message === undefined) {
        return undefined;
    }
    let wrapper = immutable_message_cache.get(message_id);
    if (wrapper === undefined) {
        wrapper = ImmutableMessage.wrap(message);
        immutable_message_cache.set(message_id, wrapper);
    }
    return wrapper;
}

/** Hot paths only (filter predicates, large scans). Prefer maybe_get_immutable_message. */
export function get_message_for_performant_code(message_id: number): Message | undefined {
    return stored_messages.get(message_id)?.message;
}

export function does_message_pass_predicate(
    msg_id: number,
    predicate: (message: Message) => boolean,
): boolean {
    const message = get_message_for_performant_code(msg_id);
    if (message === undefined) {
        return false;
    }
    return predicate(message);
}

// ---------------------------------------------------------------------------
// ImmutableMessage / MutableMessage wrappers
//
// Callers must not mutate Message fields directly (e.g. `msg.raw_content = …`).
// Prefer ImmutableMessage for read-only access; use MutableMessage with
// update_* methods when mutation is required. Hot paths (e.g. filter predicates
// over thousands of messages) may use dangerously_get_raw_message_struct().
// ---------------------------------------------------------------------------

export class ImmutableMessage {
    readonly #message: Message;

    private constructor(message: Message) {
        this.#message = message;
    }

    get id(): number {
        return this.#message.id;
    }
    get sender_id(): number {
        return this.#message.sender_id;
    }
    get sender_email(): string {
        return this.#message.sender_email;
    }
    get sender_full_name(): string {
        return this.#message.sender_full_name;
    }
    get avatar_url(): string | null {
        return this.#message.avatar_url;
    }
    get client(): string {
        return this.#message.client;
    }
    get content(): string {
        return this.#message.content;
    }
    get content_type(): "text/html" | "text/x-markdown" {
        return this.#message.content_type;
    }
    get display_recipient(): DisplayRecipient {
        return this.#message.display_recipient;
    }
    get edit_history(): MessageEditHistoryEntry[] | undefined {
        return this.#message.edit_history;
    }
    get is_me_message(): boolean {
        return this.#message.is_me_message;
    }
    get last_edit_timestamp(): number | undefined {
        return this.#message.last_edit_timestamp;
    }
    get last_moved_timestamp(): number | undefined {
        return this.#message.last_moved_timestamp;
    }
    get submessages(): z.infer<typeof submessage_schema>[] {
        return this.#message.submessages;
    }
    get timestamp(): number {
        return this.#message.timestamp;
    }
    get topic_links(): z.infer<typeof topic_link_schema>[] | undefined {
        return this.#message.topic_links;
    }
    get match_content(): string | undefined {
        return this.#message.match_content;
    }
    get match_subject(): string | undefined {
        return this.#message.match_subject;
    }
    get unread(): boolean {
        return this.#message.unread;
    }
    get historical(): boolean {
        return this.#message.historical;
    }
    get starred(): boolean {
        return this.#message.starred;
    }
    get mentioned(): boolean {
        return this.#message.mentioned;
    }
    get mentioned_me_directly(): boolean {
        return this.#message.mentioned_me_directly;
    }
    get stream_wildcard_mentioned(): boolean {
        return this.#message.stream_wildcard_mentioned;
    }
    get topic_wildcard_mentioned(): boolean {
        return this.#message.topic_wildcard_mentioned;
    }
    get collapsed(): boolean {
        return this.#message.collapsed;
    }
    get condensed(): boolean | undefined {
        return this.#message.condensed;
    }
    get alerted(): boolean {
        return this.#message.alerted;
    }
    get clean_reactions(): Map<string, MessageCleanReaction> {
        return this.#message.clean_reactions;
    }
    get locally_echoed(): boolean | undefined {
        return this.#message.locally_echoed;
    }
    get failed_request(): boolean | undefined {
        return this.#message.failed_request;
    }
    get show_slow_send_spinner(): boolean | undefined {
        return this.#message.show_slow_send_spinner;
    }
    get resend(): boolean | undefined {
        return this.#message.resend;
    }
    get local_id(): string | undefined {
        return this.#message.local_id;
    }
    get raw_content(): string | undefined {
        return this.#message.raw_content;
    }
    get sent_by_me(): boolean {
        return this.#message.sent_by_me;
    }
    get reply_to(): string {
        return this.#message.reply_to;
    }
    get message_reactions(): MessageCleanReaction[] | undefined {
        return this.#message.message_reactions;
    }
    get url(): string | undefined {
        return this.#message.url;
    }
    get flags(): string[] | undefined {
        return this.#message.flags;
    }
    get small_avatar_url(): string | null | undefined {
        return this.#message.small_avatar_url;
    }
    get status_emoji_info(): UserStatusEmojiInfo | undefined {
        return this.#message.status_emoji_info;
    }
    get local_edit_timestamp(): number | undefined {
        return this.#message.local_edit_timestamp;
    }
    get notification_sent(): boolean | undefined {
        return this.#message.notification_sent;
    }
    get reminders(): TimeFormattedReminder[] | undefined {
        return this.#message.reminders;
    }
    get has_widget_edits(): boolean | undefined {
        return this.#message.has_widget_edits;
    }
    get type(): "private" | "stream" {
        return this.#message.type;
    }
    get is_private(): boolean {
        return this.#message.is_private;
    }
    get is_stream(): boolean {
        return this.#message.is_stream;
    }
    get stream_id(): number {
        // Callers must check `type === "stream"` before reading.
        if (this.#message.type !== "stream") {
            throw new Error("stream_id is only valid on stream messages");
        }
        return this.#message.stream_id;
    }
    get topic(): string {
        // Callers must check `type === "stream"` before reading.
        if (this.#message.type !== "stream") {
            throw new Error("topic is only valid on stream messages");
        }
        return this.#message.topic;
    }
    get stream(): string {
        // Callers must check `type === "stream"` before reading.
        if (this.#message.type !== "stream") {
            throw new Error("stream is only valid on stream messages");
        }
        return this.#message.stream;
    }
    get pm_with_url(): string {
        // Callers must check `type === "private"` before reading.
        if (this.#message.type !== "private") {
            throw new Error("pm_with_url is only valid on private messages");
        }
        return this.#message.pm_with_url;
    }
    get to_user_ids(): string {
        // Callers must check `type === "private"` before reading.
        if (this.#message.type !== "private") {
            throw new Error("to_user_ids is only valid on private messages");
        }
        return this.#message.to_user_ids;
    }
    get display_reply_to(): string | undefined {
        return this.#message.display_reply_to;
    }

    /** @internal Cache/factory only — callers use maybe_get_immutable_message(id). */
    static wrap(message: Message): ImmutableMessage {
        return new ImmutableMessage(message);
    }

    /**
     * Escape hatch for hot paths (filter predicates, large MessageList scans)
     * where per-field getters would add measurable overhead.
     */
    dangerously_get_raw_message_struct(): Message {
        return this.#message;
    }
}

export class MutableMessage {
    readonly #message: Message;

    private constructor(message: Message) {
        this.#message = message;
    }

    /** @internal Cache/factory only — callers use maybe_get_mutable_message(id). */
    static wrap(message: Message): MutableMessage {
        return new MutableMessage(message);
    }

    read_id(): number {
        return this.#message.id;
    }
    update_id(value: number): void {
        this.#message.id = value;
    }
    read_sender_id(): number {
        return this.#message.sender_id;
    }
    update_sender_id(value: number): void {
        this.#message.sender_id = value;
    }
    read_sender_email(): string {
        return this.#message.sender_email;
    }
    update_sender_email(value: string): void {
        this.#message.sender_email = value;
    }
    read_sender_full_name(): string {
        return this.#message.sender_full_name;
    }
    update_sender_full_name(value: string): void {
        this.#message.sender_full_name = value;
    }
    read_avatar_url(): string | null {
        return this.#message.avatar_url;
    }
    update_avatar_url(value: string | null): void {
        this.#message.avatar_url = value;
    }
    read_client(): string {
        return this.#message.client;
    }
    update_client(value: string): void {
        this.#message.client = value;
    }
    read_content(): string {
        return this.#message.content;
    }
    update_content(value: string): void {
        this.#message.content = value;
    }
    read_content_type(): "text/html" | "text/x-markdown" {
        return this.#message.content_type;
    }
    update_content_type(value: "text/html" | "text/x-markdown"): void {
        this.#message.content_type = value;
    }
    read_display_recipient(): DisplayRecipient {
        return this.#message.display_recipient;
    }
    update_display_recipient(value: DisplayRecipient): void {
        this.#message.display_recipient = value;
    }
    read_edit_history(): MessageEditHistoryEntry[] | undefined {
        return this.#message.edit_history;
    }
    update_edit_history(value: MessageEditHistoryEntry[] | undefined): void {
        Object.assign(this.#message, { edit_history: value });
    }
    read_is_me_message(): boolean {
        return this.#message.is_me_message;
    }
    update_is_me_message(value: boolean): void {
        this.#message.is_me_message = value;
    }
    read_last_edit_timestamp(): number | undefined {
        return this.#message.last_edit_timestamp;
    }
    update_last_edit_timestamp(value: number | undefined): void {
        Object.assign(this.#message, { last_edit_timestamp: value });
    }
    read_last_moved_timestamp(): number | undefined {
        return this.#message.last_moved_timestamp;
    }
    update_last_moved_timestamp(value: number | undefined): void {
        Object.assign(this.#message, { last_moved_timestamp: value });
    }
    read_submessages(): z.infer<typeof submessage_schema>[] {
        return this.#message.submessages;
    }
    update_submessages(value: z.infer<typeof submessage_schema>[]): void {
        this.#message.submessages = value;
    }
    read_timestamp(): number {
        return this.#message.timestamp;
    }
    update_timestamp(value: number): void {
        this.#message.timestamp = value;
    }
    read_topic_links(): z.infer<typeof topic_link_schema>[] | undefined {
        return this.#message.topic_links;
    }
    update_topic_links(value: z.infer<typeof topic_link_schema>[] | undefined): void {
        Object.assign(this.#message, { topic_links: value });
    }
    read_match_content(): string | undefined {
        return this.#message.match_content;
    }
    update_match_content(value: string | undefined): void {
        Object.assign(this.#message, { match_content: value });
    }
    read_match_subject(): string | undefined {
        return this.#message.match_subject;
    }
    update_match_subject(value: string | undefined): void {
        Object.assign(this.#message, { match_subject: value });
    }
    read_unread(): boolean {
        return this.#message.unread;
    }
    update_unread(value: boolean): void {
        this.#message.unread = value;
    }
    read_historical(): boolean {
        return this.#message.historical;
    }
    update_historical(value: boolean): void {
        this.#message.historical = value;
    }
    read_starred(): boolean {
        return this.#message.starred;
    }
    update_starred(value: boolean): void {
        this.#message.starred = value;
    }
    read_mentioned(): boolean {
        return this.#message.mentioned;
    }
    update_mentioned(value: boolean): void {
        this.#message.mentioned = value;
    }
    read_mentioned_me_directly(): boolean {
        return this.#message.mentioned_me_directly;
    }
    update_mentioned_me_directly(value: boolean): void {
        this.#message.mentioned_me_directly = value;
    }
    read_stream_wildcard_mentioned(): boolean {
        return this.#message.stream_wildcard_mentioned;
    }
    update_stream_wildcard_mentioned(value: boolean): void {
        this.#message.stream_wildcard_mentioned = value;
    }
    read_topic_wildcard_mentioned(): boolean {
        return this.#message.topic_wildcard_mentioned;
    }
    update_topic_wildcard_mentioned(value: boolean): void {
        this.#message.topic_wildcard_mentioned = value;
    }
    read_collapsed(): boolean {
        return this.#message.collapsed;
    }
    update_collapsed(value: boolean): void {
        this.#message.collapsed = value;
    }
    read_condensed(): boolean | undefined {
        return this.#message.condensed;
    }
    update_condensed(value: boolean | undefined): void {
        Object.assign(this.#message, { condensed: value });
    }
    read_alerted(): boolean {
        return this.#message.alerted;
    }
    update_alerted(value: boolean): void {
        this.#message.alerted = value;
    }
    read_clean_reactions(): Map<string, MessageCleanReaction> {
        return this.#message.clean_reactions;
    }
    update_clean_reactions(value: Map<string, MessageCleanReaction>): void {
        this.#message.clean_reactions = value;
    }
    read_locally_echoed(): boolean | undefined {
        return this.#message.locally_echoed;
    }
    update_locally_echoed(value: boolean | undefined): void {
        Object.assign(this.#message, { locally_echoed: value });
    }
    read_failed_request(): boolean | undefined {
        return this.#message.failed_request;
    }
    update_failed_request(value: boolean | undefined): void {
        Object.assign(this.#message, { failed_request: value });
    }
    read_show_slow_send_spinner(): boolean | undefined {
        return this.#message.show_slow_send_spinner;
    }
    update_show_slow_send_spinner(value: boolean | undefined): void {
        Object.assign(this.#message, { show_slow_send_spinner: value });
    }
    read_resend(): boolean | undefined {
        return this.#message.resend;
    }
    update_resend(value: boolean | undefined): void {
        Object.assign(this.#message, { resend: value });
    }
    read_local_id(): string | undefined {
        return this.#message.local_id;
    }
    update_local_id(value: string | undefined): void {
        Object.assign(this.#message, { local_id: value });
    }
    read_raw_content(): string | undefined {
        return this.#message.raw_content;
    }
    update_raw_content(value: string | undefined): void {
        Object.assign(this.#message, { raw_content: value });
    }
    read_sent_by_me(): boolean {
        return this.#message.sent_by_me;
    }
    update_sent_by_me(value: boolean): void {
        this.#message.sent_by_me = value;
    }
    read_reply_to(): string {
        return this.#message.reply_to;
    }
    update_reply_to(value: string): void {
        this.#message.reply_to = value;
    }
    read_message_reactions(): MessageCleanReaction[] | undefined {
        return this.#message.message_reactions;
    }
    update_message_reactions(value: MessageCleanReaction[] | undefined): void {
        Object.assign(this.#message, { message_reactions: value });
    }
    read_url(): string | undefined {
        return this.#message.url;
    }
    update_url(value: string | undefined): void {
        Object.assign(this.#message, { url: value });
    }
    read_flags(): string[] | undefined {
        return this.#message.flags;
    }
    update_flags(value: string[] | undefined): void {
        Object.assign(this.#message, { flags: value });
    }
    read_small_avatar_url(): string | null | undefined {
        return this.#message.small_avatar_url;
    }
    update_small_avatar_url(value: string | null | undefined): void {
        Object.assign(this.#message, { small_avatar_url: value });
    }
    read_status_emoji_info(): UserStatusEmojiInfo | undefined {
        return this.#message.status_emoji_info;
    }
    update_status_emoji_info(value: UserStatusEmojiInfo | undefined): void {
        Object.assign(this.#message, { status_emoji_info: value });
    }
    read_local_edit_timestamp(): number | undefined {
        return this.#message.local_edit_timestamp;
    }
    update_local_edit_timestamp(value: number | undefined): void {
        Object.assign(this.#message, { local_edit_timestamp: value });
    }
    read_notification_sent(): boolean | undefined {
        return this.#message.notification_sent;
    }
    update_notification_sent(value: boolean | undefined): void {
        Object.assign(this.#message, { notification_sent: value });
    }
    read_reminders(): TimeFormattedReminder[] | undefined {
        return this.#message.reminders;
    }
    update_reminders(value: TimeFormattedReminder[] | undefined): void {
        Object.assign(this.#message, { reminders: value });
    }
    read_has_widget_edits(): boolean | undefined {
        return this.#message.has_widget_edits;
    }
    update_has_widget_edits(value: boolean | undefined): void {
        Object.assign(this.#message, { has_widget_edits: value });
    }
    read_type(): "private" | "stream" {
        return this.#message.type;
    }
    read_is_private(): boolean {
        return this.#message.is_private;
    }
    read_is_stream(): boolean {
        return this.#message.is_stream;
    }
    read_stream_id(): number {
        if (this.#message.type !== "stream") {
            throw new Error("stream_id is only valid on stream messages");
        }
        return this.#message.stream_id;
    }

    update_stream_id(value: number): void {
        if (this.#message.type !== "stream") {
            throw new Error("stream_id is only valid on stream messages");
        }
        this.#message.stream_id = value;
    }
    read_topic(): string {
        if (this.#message.type !== "stream") {
            throw new Error("topic is only valid on stream messages");
        }
        return this.#message.topic;
    }

    update_topic(value: string): void {
        if (this.#message.type !== "stream") {
            throw new Error("topic is only valid on stream messages");
        }
        this.#message.topic = value;
    }
    read_stream(): string {
        if (this.#message.type !== "stream") {
            throw new Error("stream is only valid on stream messages");
        }
        return this.#message.stream;
    }

    update_stream(value: string): void {
        if (this.#message.type !== "stream") {
            throw new Error("stream is only valid on stream messages");
        }
        this.#message.stream = value;
    }
    read_pm_with_url(): string {
        if (this.#message.type !== "private") {
            throw new Error("pm_with_url is only valid on private messages");
        }
        return this.#message.pm_with_url;
    }

    update_pm_with_url(value: string): void {
        if (this.#message.type !== "private") {
            throw new Error("pm_with_url is only valid on private messages");
        }
        this.#message.pm_with_url = value;
    }
    read_to_user_ids(): string {
        if (this.#message.type !== "private") {
            throw new Error("to_user_ids is only valid on private messages");
        }
        return this.#message.to_user_ids;
    }

    update_to_user_ids(value: string): void {
        if (this.#message.type !== "private") {
            throw new Error("to_user_ids is only valid on private messages");
        }
        this.#message.to_user_ids = value;
    }
    read_display_reply_to(): string | undefined {
        return this.#message.display_reply_to;
    }

    update_display_reply_to(value: string | undefined): void {
        const message = this.#message;
        if (message.type === "private") {
            message.display_reply_to = value ?? "";
        }
    }

    /**
     * Escape hatch for hot paths where per-field read_* calls would add
     * measurable overhead.
     */
    dangerously_get_raw_message_struct(): Message {
        return this.#message;
    }
}

/**
 * Return an ImmutableMessage for a cached message, or undefined if the
 * message is not in the local store.
 */
export function maybe_get_immutable_message(message_id: number): ImmutableMessage | undefined {
    // Read the bare singleton from storage (never via get(), which returns wrappers).
    const message = stored_messages.get(message_id)?.message;
    if (message === undefined) {
        return undefined;
    }
    let wrapper = immutable_message_cache.get(message_id);
    if (wrapper === undefined) {
        wrapper = ImmutableMessage.wrap(message);
        immutable_message_cache.set(message_id, wrapper);
    }
    return wrapper;
}

/**
 * Return a MutableMessage for a cached message, or undefined if the
 * message is not in the local store. Use update_* methods to mutate.
 */
export function maybe_get_mutable_message(message_id: number): MutableMessage | undefined {
    const message = stored_messages.get(message_id)?.message;
    if (message === undefined) {
        return undefined;
    }
    let wrapper = mutable_message_cache.get(message_id);
    if (wrapper === undefined) {
        wrapper = MutableMessage.wrap(message);
        mutable_message_cache.set(message_id, wrapper);
    }
    return wrapper;
}


/**
 * Regulated mutations when the caller already holds the Message singleton
 * (e.g. local-echo waiting_for_ack, MessageListData items). Prefer
 * maybe_get_mutable_message(id) when only an id is available.
 * Uses the cache wrapper when present; otherwise attaches updates to the
 * provided singleton (never a copy). Call sites must not use wrap() directly.
 */
export function mutable_for(message: Message): MutableMessage {
    return maybe_get_mutable_message(message.id) ?? MutableMessage.wrap(message);
}

export function set_messages_for_tests(messages: ProcessedMessage[]): void {
    stored_messages.clear();
    for (const message of messages) {
        stored_messages.set(message.message.id, message);
    }
}

export function get_pm_emails(
    message: Message | MessageWithBooleans | LocalMessageWithBooleans,
): string {
    const user_ids = people.pm_with_user_ids(message) ?? [];
    const emails = user_ids.map((user_id) => {
        const person = people.maybe_get_user_by_id(user_id);
        if (!person) {
            blueslip.error("Unknown user id", {user_id});
            return "?";
        }
        return person.email;
    });
    emails.sort();

    return emails.join(", ");
}

export function get_pm_full_names(user_ids: number[]): string {
    user_ids = people.sorted_other_user_ids(user_ids);
    const sorted_names = people.get_display_full_names(user_ids);
    sorted_names.sort(util.make_strcmp());

    return sorted_names.join(", ");
}

export function convert_raw_message_to_message_with_booleans(opts: NewMessage):
    | {
          type: "server_message";
          message: RawMessageWithBooleans;
      }
    | {
          type: "local_message";
          message: LocalMessageWithBooleans;
      } {
    const flags = opts.raw_message.flags ?? [];

    function convert_flag(flag_name: string): boolean {
        return flags.includes(flag_name);
    }

    const converted_flags = {
        unread: !convert_flag("read"),
        historical: convert_flag("historical"),
        starred: convert_flag("starred"),
        mentioned:
            convert_flag("mentioned") ||
            convert_flag("stream_wildcard_mentioned") ||
            convert_flag("topic_wildcard_mentioned"),
        mentioned_me_directly: convert_flag("mentioned"),
        stream_wildcard_mentioned: convert_flag("stream_wildcard_mentioned"),
        topic_wildcard_mentioned: convert_flag("topic_wildcard_mentioned"),
        collapsed: convert_flag("collapsed"),
        alerted: convert_flag("has_alert_word"),
    };

    // Once we have set boolean flags here, the `flags` attribute is
    // just a distraction, so we delete it.  (All the downstream code
    // uses booleans.)

    // We have to return these separately because of how the `MessageWithBooleans`
    // type is set up.
    if (opts.type === "local_message") {
        if (opts.raw_message.type === "private") {
            return {
                type: "local_message",
                message: {
                    ..._.omit(opts.raw_message, "flags"),
                    ...converted_flags,
                },
            };
        }
        return {
            type: "local_message",
            message: {
                ..._.omit(opts.raw_message, "flags"),
                ...converted_flags,
            },
        };
    }
    if (opts.raw_message.type === "private") {
        return {
            type: "server_message",
            message: {
                ..._.omit(opts.raw_message, "flags"),
                ...converted_flags,
            },
        };
    }
    return {
        type: "server_message",
        message: {
            ..._.omit(opts.raw_message, "flags"),
            ...converted_flags,
        },
    };
}

export function update_booleans(message: Message | MutableMessage, flags: string[]): void {
    // When we get server flags for local echo or message edits,
    // we are vulnerable to race conditions, so only update flags
    // that are driven by message content.
    function convert_flag(flag_name: string): boolean {
        return flags.includes(flag_name);
    }

    const mentioned =
        convert_flag("mentioned") ||
        convert_flag("stream_wildcard_mentioned") ||
        convert_flag("topic_wildcard_mentioned");
    const mentioned_me_directly = convert_flag("mentioned");
    const stream_wildcard_mentioned = convert_flag("stream_wildcard_mentioned");
    const topic_wildcard_mentioned = convert_flag("topic_wildcard_mentioned");
    const alerted = convert_flag("has_alert_word");

    // Never assign fields on Message directly — always go through MutableMessage.
    const mutable = message instanceof MutableMessage ? message : MutableMessage.wrap(message);
    mutable.update_mentioned(mentioned);
    mutable.update_mentioned_me_directly(mentioned_me_directly);
    mutable.update_stream_wildcard_mentioned(stream_wildcard_mentioned);
    mutable.update_topic_wildcard_mentioned(topic_wildcard_mentioned);
    mutable.update_alerted(alerted);
}

export function update_sender_full_name(user_id: number, new_name: string): void {
    for (const message_data of stored_messages.values()) {
        const message = maybe_get_mutable_message(message_data.message.id) ?? maybe_get_mutable_message(message_data.message.id) ?? MutableMessage.wrap(message_data.message);
        if (message.read_sender_id() && message.read_sender_id() === user_id) {
            message.update_sender_full_name(new_name);
        }
    }
}

export function update_small_avatar_url(user_id: number, new_url: string | null): void {
    for (const message_data of stored_messages.values()) {
        const message = maybe_get_mutable_message(message_data.message.id) ?? maybe_get_mutable_message(message_data.message.id) ?? MutableMessage.wrap(message_data.message);
        if (message.read_sender_id() && message.read_sender_id() === user_id) {
            message.update_small_avatar_url(new_url);
        }
    }
}

export function update_stream_name(stream_id: number, new_name: string): void {
    for (const message_data of stored_messages.values()) {
        const message = maybe_get_mutable_message(message_data.message.id) ?? MutableMessage.wrap(message_data.message);
        if (message.read_type() === "stream" && message.read_stream_id() === stream_id) {
            message.update_display_recipient(new_name);
        }
    }
}

export function update_status_emoji_info(
    user_id: number,
    new_info: UserStatusEmojiInfo | undefined,
): void {
    for (const message_data of stored_messages.values()) {
        const message = maybe_get_mutable_message(message_data.message.id) ?? maybe_get_mutable_message(message_data.message.id) ?? MutableMessage.wrap(message_data.message);
        if (message.read_sender_id() && message.read_sender_id() === user_id) {
            message.update_status_emoji_info(new_info);
        }
    }
}

export function reify_message_id({old_id, new_id}: {old_id: number; new_id: number}): void {
    const message_data = stored_messages.get(old_id);
    if (message_data !== undefined) {
        const server_message: Message & Partial<LocalMessage> = message_data.message;
        if (message_data.type === "local_message") {
            // Important: Messages are managed as singletons, so
            // MessageListData objects may already have pointers to
            // the LocalMessage object for this message. So we must
            // convert the LocalMessage into a Message by dropping the
            // extra local echo/drafts fields, not by constructing a
            // new object with the new type.

            delete server_message.queue_id;
            delete server_message.draft_id;
            delete server_message.to;
            if (server_message.type === "private") {
                delete server_message.topic;
            }
        }
        const mutable_server_message = maybe_get_mutable_message(server_message.id) ?? MutableMessage.wrap(server_message);
        mutable_server_message.update_id(new_id);
        mutable_server_message.update_locally_echoed(false);
        stored_messages.set(new_id, {type: "server_message", message: server_message});
        stored_messages.delete(old_id);
        immutable_message_cache.delete(old_id);
        mutable_message_cache.delete(old_id);
        immutable_message_cache.delete(new_id);
        mutable_message_cache.delete(new_id);
    }
}

export function update_message_content(
    message: Message | MutableMessage,
    new_content: string,
): void {
    const mutable = message instanceof MutableMessage ? message : MutableMessage.wrap(message);
    mutable.update_content(new_content);
}

export function remove(message_ids: number[]): void {
    for (const message_id of message_ids) {
        stored_messages.delete(message_id);
        immutable_message_cache.delete(message_id);
        mutable_message_cache.delete(message_id);
    }
}

export function get_message_ids_in_stream(stream_id: number): number[] {
    return [...stored_messages.values()]
        .filter(
            (message_data) =>
                message_data.message.type === "stream" &&
                message_data.message.stream_id === stream_id,
        )
        .map((message_data) => message_data.message.id);
}

export function maybe_update_raw_content(id: number, raw_content: string | undefined): void {
    const message = maybe_get_mutable_message(id);
    // In case the message was deleted from the cache after receiving a delete
    // event.
    if (message === undefined) {
        return;
    }
    // We shouldn't cache raw_content for messages we won't be receiving update events
    // for, which in this case are messages from channels the current user isn't
    // subscribed to.
    if (message.read_type() === "stream" && !stream_data.is_subscribed(message.read_stream_id())) {
        // Clear any existing cached raw_content for this type of message.
        // Not doing so poses the risk of us using a stale version of the
        // raw_content after we manually fetch it.
        message.update_raw_content(undefined);
        return;
    }
    message.update_raw_content(raw_content);
}
