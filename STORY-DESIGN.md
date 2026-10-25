# Instagram Story preview

From the project root, run `node scripts/preview-instagram-design.mjs`.
Optionally append a catalog offer ID to select a specific product.

Open `output/instagram-design/story.jpg`, `story-long-title.jpg`, and
`story-no-previous-price.jpg`. Previews use actual local catalog offers and
download their actual product photos. Each `*-offer.json` records
the source data, formatted prices, and fitted title. This command does not
load a publisher, upload to Cloudinary, modify queues, or publish a Story.
Catalog data is a snapshot, not a live price verification.

`instagram-publish/whatsapp-bot/src/story-template.js` renders 1080×1920
JPEGs through the existing Sharp renderer. It uses the bundled original logo,
navy #081B44, yellow #FFDE00, and Arial Black (with platform font fallback).
Product photos use contain sizing. Titles are measured, reduced if needed,
and truncated with an ellipsis after two lines. Previous prices and calculated
discounts require a finite previous price greater than the actual current price;
the reported discount percentage is never used to invent a previous price.

The active WhatsApp → Story flow uses `instagrapi-stories.js` and the existing
Python publisher. The affiliate URL stays attached to the same offer payload.
The Python publisher adds the actual clickable link using `story-layout.json`:
center (0.5, 0.88), width 0.52, height 0.05. The template reads that same
configuration to place the visual yellow VER OFERTA button at approximately
y=1642–1738. The JPEG button itself is not clickable. The installed integration
passes these bounds and the same offer's URL into native story link metadata.
Actual visibility and tapping on Instagram remain unverified until an approved
live test. Important content starts at y=150; the footer ends near y=1785.
The separate official API flow retains its existing Cloudinary integration;
it does not gain native sticker support from this image change.

The template applies to newly generated promotional Stories. Already staged
images remain unchanged to preserve queue state and duplicate prevention.
Restart the bot normally when ready to use the code; no live restart or test
publication is performed by the preview command.

Validation:
`node --test instagram-publish/whatsapp-bot/test/story-template.test.js instagram-publish/whatsapp-bot/test/instagrapi-stories.test.js instagram-publish/whatsapp-bot/test/instagram.test.js instagram-publish/whatsapp-bot/test/whatsapp-instagram-sync.test.js`
