import fetch from 'cross-fetch';
import LemmyBot from 'lemmy-bot';
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
        `https://api.ocr.space/parse/imageurl?apikey=${OCR_API_KEY}&url=${url}`
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
  handlers: {
    async mention({
      mentionView: {
        comment: { path, post_id, id },
      },
      botActions: { getPost, getComment, createComment },
    }) {
      const pathList = path.split('.').filter((i) => i !== '0');

      let returnText = '';

      if (pathList.length === 1) {
        const {
          post: { url, body },
        } = await getPost(post_id);

        if (url) {
          const res = await getOCR(url);

          if (isValidResponse(res)) {
            returnText += `**URL image text**\n${
              res!.ParsedResults[0].ParsedText
            }`;
          }
        }

        if (body) {
          const images = getImageUrls(body);
          for (let i = 0; i < images.length; ++i) {
            const res = await getOCR(images[i]);

            if (isValidResponse(res)) {
              returnText += `${
                returnText.length > 0 || i > 0 ? '\n' : ''
              }**Body image ${i + 1} text**\n${
                res!.ParsedResults[0].ParsedText
              }`;
            }
          }
        }
      } else {
        const parentId = Number(pathList[pathList.length - 2]);

        const {
          comment: { content },
        } = await getComment({
          id: parentId,
          postId: post_id,
        });

        const images = getImageUrls(content);
        for (let i = 0; i < images.length; ++i) {
          const res = await getOCR(images[i]);

          if (isValidResponse(res)) {
            returnText += `${
              returnText.length > 0 || i > 0 ? '\n' : ''
            }**Image ${i + 1} text**\n${res!.ParsedResults[0].ParsedText}`;
          }
        }
      }

      if (returnText.length > 0) {
        createComment({
          content: `${returnText}\n\n*This action was performed by a bot.*`,
          postId: post_id,
          parentId: id,
        });
      } else {
        createComment({
          content: 'Could not find any images with text',
          postId: post_id,
          parentId: id,
        });
      }
    },
  },
});

bot.start();
