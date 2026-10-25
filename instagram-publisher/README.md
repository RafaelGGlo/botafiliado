# Instagram Stories via instagrapi

Self-hosted, free Python publisher; no Storrito, paid provider, public image host or Meta Graph token is used in this WhatsApp-triggered flow.

**This is an unofficial Instagram private API.** It can stop working, trigger account verification or account restrictions. It is not equivalent to Meta's official API. No proxies, checkpoint bypass, automatic 2FA code collection or rate-limit evasion are implemented.

## Known limitation observed in the live tests

The account owner reported that the link button does not appear, despite native link metadata being present on tests 3–5. Those metadata checks do not validate visible rendering or human tappability. Upstream has a matching report: https://github.com/subzeroid/instagrapi/issues/1139 . Following the owner's request for a visible button to tap, the artwork now includes a custom `VER OFERTA` graphic aligned to the real StoryLink interaction area. This graphic is not the Instagram app's rendered sticker. Python and Node share `story-layout.json` so the graphic and the native link use identical coordinates. Actual in-app tapping still needs validation. New publisher responses explicitly separate `linkMetadataVerified` from unverified `stickerVisibleVerified` and `tapVerified`; legacy `linkVerified` also means metadata only. Do not describe the link feature as fully working based on metadata checks alone.

Sources read for this implementation:
- https://subzeroid.github.io/instagrapi/latest/usage-guide/story/
- https://github.com/subzeroid/instagrapi
- https://github.com/subzeroid/instagrapi/blob/master/instagrapi/types.py

## Local setup (Windows PowerShell, from repository root)

Install a working Python 3.10+ runtime (3.12+ recommended), then:

```powershell
py -m venv instagram-publisher/.venv
instagram-publisher/.venv/Scripts/python.exe -m pip install -r instagram-publisher/requirements.txt
Copy-Item instagram-publisher/.env.example instagram-publisher/.env
```

Edit `instagram-publisher/.env` **locally** with `INSTAGRAPI_USERNAME` and `INSTAGRAPI_PASSWORD`. Never paste credentials into chat. Existing `INSTAGRAM_ACCESS_TOKEN`/account ID values are Graph credentials and do not replace these. A saved session is reused without a password relogin. Default session path: `instagram-publisher/state/session.json`; set `INSTAGRAPI_SESSION_FILE` to another private local path if necessary. Keep external session paths outside version control yourself.

```powershell
instagram-publisher/.venv/Scripts/python.exe instagram-publisher/publisher.py check
instagram-publisher/.venv/Scripts/python.exe instagram-publisher/publisher.py login
```

`check` reports presence booleans only; it does not prove that a session is still valid. `login` validates/reuses a session or logs in once and saves it. If checkpoint, 2FA or security verification is required, stop and complete the requested approval/code verification in the **official Instagram app**. This integration does not submit verification codes. Then validate the local session again; if it remains invalid, establish a valid local session before publishing. Do not repeatedly log in or delete a working session.

When a security/rate-limit error occurs, `state/account-blocked.json` stops further account requests. Complete verification in the official app, or wait out the rate limit, before removing that marker locally and validating the session. Blocked offer receipts deliberately remain blocked; inspect them before any recovery. Do not delete publication databases to retry.

The Windows launcher already starts the modified entrypoint `instagram-publish/whatsapp-bot/src/index.js`. It invokes `.venv/Scripts/python.exe` directly without shell interpolation or an exposed HTTP service. For another Python location set `INSTAGRAM_PYTHON` in `whatsapp-bot/.env` to the executable's absolute path. Restart the bot through its existing stop/start controls after setup; this implementation does not restart it or send test WhatsApp messages automatically.

## Delivery, retry and duplicate protection

The actual affiliate URL created by `prepareOffer` is retained. The exact downloaded WhatsApp image is passed to the existing promotional renderer. An immutable 1080×1920 JPEG contains product/title/price and reserves its bottom 320 pixels for a real `StoryLink(webUri=affiliateUrl, x=.5, y=.88, width=.72, height=.09)`. No fake sticker or URL panel is drawn in this path.

Before WhatsApp sends, a SQLite outbox stages the snapshot. On the **first successful `sendMessage` resolution**, WhatsApp history is persisted and the Story is immediately attempted, before sending the next group. The delivery callback runs only once per broadcast. Group failure alone cannot confirm an outbox entry. The outbox is independent of the dashboard and all Instagram failures leave WhatsApp history intact.

An offer's stable ID, hashed with SHA-256, is its persistent idempotency key; Story history never expires with WhatsApp's TTL. Repeated offers with the same ID intentionally never create another Story, including price changes. Keep the same ID for retries; use a distinct ID only for a deliberately new offer.

`state/outbox.sqlite` stores confirmation/status/attempt count, and `state/receipts.sqlite` stores Python upload receipts. Before any upload request Python commits an `uncertain` receipt. It saves the returned Story ID before read-back verification. A process crash or timeout during uploading cannot initiate another upload for that key. SQLite serializes account calls; the existing bot lock prevents multiple bot instances. Keep these databases and session files across restarts/deployments. Do not run manual publishers against a second copy of this repository/account.

Transient failures **before upload** are retried with 1/2/4 minute backoff, at most three attempts, independently of WhatsApp. Initial publication is immediate; the retry timer is only for failures. Security/rate-limit errors stop the account. Any ambiguous failure after upload starts is `uncertain` and is never automatically reuploaded: Instagram provides no transactional exactly-once contract. This favors avoiding duplicates over blindly retrying a potentially published Story.

On restart, a staged offer is confirmed only if persisted WhatsApp history explicitly says `sent`, never merely `pending`. There is an unavoidable crash window between external WhatsApp acceptance and local acknowledgment persistence; uncertain WhatsApp sends retain their reservations and cannot trigger Instagram. Interrupted Instagram calls require inspecting receipts/official-app Stories; never reset an uncertain key or delete its receipt. A saved published receipt can prove publication even if Node missed its result.

Status and safe retries (stop the bot before `retry-safe`):

```powershell
node --disable-warning=ExperimentalWarning scripts/instagrapi-stories.mjs status
node --disable-warning=ExperimentalWarning scripts/instagrapi-stories.mjs retry-safe
```

`retry-safe` only resets/retries `retryable` entries; it cannot repeat published, blocked or uncertain uploads. Logs/report events contain key, state, safe error class, Story ID and link verification boolean, never passwords, session cookies or raw API responses. Private local files are ignored in `.gitignore`. Restrict local Windows file access to your user; POSIX permission bits alone do not configure Windows ACLs.

## Automated and live tests

```powershell
node --disable-warning=ExperimentalWarning --test instagram-publish/whatsapp-bot/test/*.test.js
node --disable-warning=ExperimentalWarning --test tests/*.test.js
instagram-publisher/.venv/Scripts/python.exe -m unittest discover -s instagram-publisher -p test_publisher.py
```

The new `instagrapi-stories.test.js` covers successful first delivery, multiple groups, total send failure, safe Instagram retries without WhatsApp resend, durable deduplication, blocked/uncertain uploads, recovery, missing runtime and real JPEG dimensions/sticker space. WhatsApp sends and Python publication results are mocked; these tests are not proof of Instagram publication.

For the five authorized real Instagram-only tests, prepare a private local JSON file containing a **current** offer (`id`, `title`, numeric `price`, `affiliateUrl`, and `imageFile` or `imageUrl`). Then:

```powershell
node scripts/instagrapi-live-tests.mjs path/to/current-offer.json
```

The runner checks local credential/session presence first, prints `TESTE 1/5` through `TESTE 5/5`, includes each label in the artwork and caption, and publishes sequentially. It never contacts WhatsApp. Five fixed persistent keys prevent this runner from creating additional copies on reruns. It stops at the first unsuccessful/uncertain result. Presence checking does not authenticate: the first publication validates the saved session/login before uploading.

Each returned Story ID is saved, then read with `story_info(..., use_cache=False)`. `linkVerified=true` means read-back `links`/native sticker metadata contains the exact affiliate URL. It does **not** prove a human tap succeeds: the library cannot perform that UI interaction. Missing/read-back failures report `linkVerified=false` without republishing. Check actual tappability in the official app. Tests are successful only with a returned published Story ID, never on a mock, preview, draft or missing setup.

Read-only follow-up for the five fixed test keys: `instagram-publisher/.venv/Scripts/python.exe instagram-publisher/verify_live_tests.py`. It reports published IDs, read-back errors and native-link presence/matching without outputting account secrets or creating additional Stories. Results are saved privately in `state/live-tests/verification.json`.

Instagram may wrap a sticker URL in `l.instagram.com/?u=...` and add `fbclid` to its destination. Verification unwraps that known Instagram redirect and ignores only an added `fbclid`, preserving every original affiliate parameter. It confirms link metadata, not a human tap or commission attribution. The Python unit tests cover this comparison, real StoryLink construction, persistent receipts, ambiguous uploads, transient failures and account security stops. SQLite connections close explicitly, including on Windows.

Existing Graph-based dashboard/calendar features are separate; the WhatsApp delivery path no longer calls their `syncWhatsApp` scheduler. Existing manually scheduled entries remain under their own controls.
