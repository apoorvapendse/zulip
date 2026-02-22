# Use Webex as your call provider in Zulip

You can configure Webex as the call provider for your organization. Users will be
able to start a Webex meeting and invite others using the **add video call** (<i
class="zulip-icon zulip-icon-video-call"></i>) button [in the compose
box](/help/start-a-call).

## Configure Webex as your call provider

By default, Zulip integrates with
[Jitsi Meet](https://jitsi.org/jitsi-meet/), a fully-encrypted, 100% open
source video conferencing solution. You can configure Zulip to use Webex as your
call provider instead.

### Configure Webex on Zulip Cloud

{start_tabs}

{settings_tab|organization-settings}

1. Under **Compose settings**, select Webex from the **Call provider** dropdown.

1. Click **Save changes**.

{end_tabs}

Users will be prompted to log in to their Webex account to authorize Zulip to create
rooms and meetings on their behalf the first time they try to create a call.

## Configure Webex for a self-hosted organization

If you are self-hosting, you will need to [create a Webex
application](https://zulip.readthedocs.io/en/latest/production/video-calls.html#webex)
in order to use this integration.

## Related documentation

- [How to start a call](/help/start-a-call)
- [Jitsi Meet integration](/integrations/jitsi)
- [BigBlueButton integration](/integrations/big-blue-button)
- [Constructor Groups integration](/integrations/constructor-groups)
- [Nextcloud Talk integration](/integrations/nextcloud-talk)
