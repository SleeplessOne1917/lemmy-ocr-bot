import LemmyBot, { CommentView, PostView } from 'lemmy-bot';
import { config } from 'dotenv';

config();

const imageRegex = /!\[[^\]]*\]\(([^\)]+)\)/g;

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
  let urlWithoutQuery = new URL(url);

  for (const key of urlWithoutQuery.searchParams.keys()) {
    urlWithoutQuery.searchParams.delete(key);
  }

  let filetype: string | undefined = undefined;
  if (urlWithoutQuery.pathname.endsWith('.webp')) {
    urlWithoutQuery.searchParams.append('format', 'jpg');
    filetype = '&filetype=JPG';
  }

  if (urlWithoutQuery.pathname.endsWith('.jpeg')) {
    filetype = '&filetype=JPG';
  }

  try {
    res = await fetch(
      `https://api.ocr.space/parse/imageurl?apikey=${OCR_API_KEY}&url=${urlWithoutQuery.toString()}&OCREngine=2${filetype}`,
    ).then((res) => res.json());
  } catch (e) {
    console.log(e);
  }

  return res;
};

const isValidResponse = (res?: OCRResponse) =>
  res && !res.IsErroredOnProcessing && res.ParsedResults.length > 0;

const { INSTANCE, USERNAME_OR_EMAIL, PASSWORD, OCR_API_KEY } =
  process.env as Record<string, string>;

const getResponseFromPost = async ({ url, body }: PostView['post']) => {
  let returnText = '';
  const promises: Promise<void>[] = [];

  if (url) {
    promises.push(
      (async () => {
        const res = await getOCR(url);

        if (isValidResponse(res)) {
          returnText += `::: spoiler URL image text\n${
            res!.ParsedResults[0].ParsedText
          }\n:::`;
        }
      })(),
    );
  }

  if (body) {
    const images = getImageUrls(body);
    promises.push(
      ...images.map(async (image, i) => {
        const res = await getOCR(image);

        if (isValidResponse(res)) {
          returnText += `${
            returnText.length > 0 || i > 0 ? '\n' : ''
          }::: spoiler Body image ${i + 1} text\n${
            res!.ParsedResults[0].ParsedText
          }\n:::`;
        }
      }),
    );
  }

  await Promise.all(promises);

  return returnText;
};

const getResponseFromComment = async (content: string) => {
  const images = getImageUrls(content);

  let returnText = '';
  const promises = images.map(async (image, i) => {
    const res = await getOCR(image);

    if (isValidResponse(res)) {
      returnText += `${
        returnText.length > 0 || i > 0 ? '\n' : ''
      }::: spoiler Image ${i + 1} text\n${
        res!.ParsedResults[0].ParsedText
      }\n:::`;
    }
  });

  await Promise.all(promises);

  return returnText;
};

const bot = new LemmyBot({
  instance: INSTANCE,
  credentials: {
    username: USERNAME_OR_EMAIL,
    password: PASSWORD,
  },
  federation: 'all',
  dbFile: 'db.sqlite3',
  handlers: {
    async post({ postView: { post }, botActions: { createComment } }) {
      if (
        post.body
          ?.toLowerCase()
          .includes(
            `@${USERNAME_OR_EMAIL}@${INSTANCE.replace(
              /:.*/,
              '',
            )}`.toLowerCase(),
          )
      ) {
        const responseText = await getResponseFromPost(post);

        if (responseText.length > 0) {
          createComment({
            content: `${responseText}\n\n*This action was performed by a bot.*`,
            post_id: post.id,
          });
        } else {
          createComment({
            content: 'Could not find any images with text',
            post_id: post.id,
          });
        }
      }
    },
    async mention({
      mentionView: { comment },
      botActions: { createComment, getParentOfComment },
    }) {
      let returnText = await getResponseFromComment(comment.content);

      if (returnText.length === 0) {
        const parentResponse = await getParentOfComment(comment);

        if (parentResponse.type === 'post') {
          const { post } = parentResponse.data as PostView;

          returnText = await getResponseFromPost(post);
        } else {
          const {
            comment: { content },
          } = parentResponse.data as CommentView;

          returnText = await getResponseFromComment(content);
        }
      }

      if (returnText.length > 0) {
        createComment({
          content: `${returnText}\n\n*This action was performed by a bot.*`,
          post_id: comment.post_id,
          parent_id: comment.id,
        });
      } else {
        createComment({
          content: 'Could not find any images with text',
          post_id: comment.post_id,
          parent_id: comment.id,
        });
      }
    },
  },
});

bot.start();
