from django.db import transaction

from zerver.models import UserProfile
from zerver.tornado.django_api import send_event_on_commit


@transaction.atomic(durable=True)
def do_set_zoom_token(user: UserProfile, /, token: dict[str, object] | None) -> None:
    user.video_call_provider_tokens["zoom_token"] = token
    user.save(update_fields=["video_call_provider_tokens"])
    send_event_on_commit(
        user.realm,
        dict(type="has_zoom_token", value=token is not None),
        [user.id],
    )

@transaction.atomic(durable=True)
def do_set_webex_token(user: UserProfile, /, token: dict[str, object] | None) -> None:
    user.video_call_provider_tokens["webex_token"] = token
    user.save(update_fields=["video_call_provider_tokens"])
    # send_event_on_commit(
    #     user.realm,
    #     dict(type="has_webex_token", value=token is not None),
    #     [user.id],
    # )
