# lemmy-ocr-bot
A bot for [lemmy](https://github.com/LemmyNet/lemmy), the fediverse link aggregator, that converts images with text into text.

# Setup
Install the bot's dependencies with the javascript package manager of your choice.

Create a file called `.env` in the same directory as `bot.ts`. There are 4 environment variables that need to be set:

- `INSTANCE`: The lemmy instance the bot's account belongs to
- `USERNAME_OR_EMAIL`: The username or email of the bot
- `PASSWORD`: The password for the bot's account.
- `OCR_API_KEY`: The API key used for the OCR API. [Create an API key here if you do not already have one.](https://ocr.space/OCRAPI)

When the bot is setup, it can be started by running `npm start`.
