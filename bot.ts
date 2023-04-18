#!/usr/bin/env ts-node

import fetch from 'cross-fetch';
import LemmyBot, { CommentView, PostView } from 'lemmy-bot';
import { config } from 'dotenv';

config();

const imageRegex = /!\[.*\]\((.*)\)/g;

const getImageUrls = (markdown: string) => {
  const urls: string[] = [];
  for (
    let match = imageRegex.exec(markdown);
    match;
    match = imageRegex.exec(markdown)
  ) {
    urls.push(match[1]);
  }

  return urls;
};

type OCRResponse = {
  IsErroredOnProcessing: boolean;
  ParsedResults: { ParsedText: string }[];
};

const getOCR = async (url: string): Promise<OCRResponse | undefined> => {
  let res: OCRResponse | undefined = undefined;
  try {
    res = await (
      await fetch(
        `https://api.ocr.space/parse/imageurl?apikey=${OCR_API_KEY}&url=${url}&OCREngine=2`
      )
    ).json();
  } catch (e) {
    console.log(e);
  }

  return res;
};

const isValidResponse = (res?: OCRResponse) =>
  res && !res.IsErroredOnProcessing && res.ParsedResults.length > 0;

const { INSTANCE, USERNAME_OR_EMAIL, PASSWORD, OCR_API_KEY } =
  process.env as Record<string, string>;

const bot = new LemmyBot({
  instance: INSTANCE,
  credentials: {
    username: USERNAME_OR_EMAIL,
    password: PASSWORD,
  },
  federation: 'all',
  handlers: {
    async mention({
      mentionView: { comment },
      botActions: { createComment, getParentOfComment },
    }) {
      const parentResponse = await getParentOfComment(comment);
      let returnText = '';

      if (parentResponse.type === 'post') {
        const {
          post: { url, body },
        } = parentResponse.data as PostView;

        if (url) {
          const res = await getOCR(url);

          if (isValidResponse(res)) {
            returnText += `::: spoiler URL image text\n${
              res!.ParsedResults[0].ParsedText
            }\n:::`;
          }
        }

        if (body) {
          const images = getImageUrls(body);
          for (let i = 0; i < images.length; ++i) {
            const res = await getOCR(images[i]);

            if (isValidResponse(res)) {
              returnText += `${
                returnText.length > 0 || i > 0 ? '\n' : ''
              }::: spoiler Body image ${i + 1} text\n${
                res!.ParsedResults[0].ParsedText
              }\n:::`;
            }
          }
        }
      } else {
        const {
          comment: { content },
        } = parentResponse.data as CommentView;

        const images = getImageUrls(content);
        for (let i = 0; i < images.length; ++i) {
          const res = await getOCR(images[i]);

          if (isValidResponse(res)) {
            returnText += `${
              returnText.length > 0 || i > 0 ? '\n' : ''
            }::: spoiler Image ${i + 1} text\n${
              res!.ParsedResults[0].ParsedText
            }\n:::`;
          }
        }
      }

      if (returnText.length > 0) {
        createComment({
          content: `${returnText}\n\n*This action was performed by a bot.*`,
          postId: comment.post_id,
          parentId: comment.id,
        });
      } else {
        createComment({
          content: 'Could not find any images with text',
          postId: comment.post_id,
          parentId: comment.id,
        });
      }
    },
  },
});

bot.start();
