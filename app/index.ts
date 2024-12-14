import { PrismaClient } from "@prisma/client";
import express from "express";
import cors from "cors";
import { generatePromptResponse, getModel } from "./utils/model";
import {
  CREATE_HTML_SYSTEM_PROMPT,
  MAX_RETRIES,
  MAX_USER_TRIALS,
  OG_QUERY_PROMPT,
} from "./utils/prompts";
import OpenAI from "openai";
import { cleanHTML, validateHTML } from "./utils/validate-html";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { generateCssFromHtml } from "./utils/css";

dotenv.config();
const prisma = new PrismaClient();
const app = express();

app.use(express.json());
app.use(cors());

app.get(`/ping`, async (req, res) => {
  try {
    return res.send("We are live");
  } catch (error) {
    return res.json({ message: "Error" });
  }
});

type TOG_Response = {
  success: boolean;
  og_response: string | null;
  error: string | null;
};

app.post(`/og_response`, async (req, res) => {
  try {
    const { userId, openai_key, prompt: og_prompt } = req.body;
    let model: OpenAI;
    if (!openai_key) {
      const userTrials = checkUserTrials(userId);
      await updateUserTrials(userId);
      if (!userTrials) {
        const response: TOG_Response = {
          success: false,
          og_response: null,
          error: "Trials finished for user",
        };
        return res.status(505).json(response);
      }
      model = getModel("self");
    } else {
      model = getModel(openai_key);
    }

    const allowed_reponses = [
      "create",
      "edit",
      "multiple",
      "delete",
      "rag",
      "undefined",
    ];
    const {
      generation: og_response_text,
      userMessages,
      systemMessage,
    } = await generatePromptResponse(model, OG_QUERY_PROMPT, [og_prompt]);
    if (!og_response_text) {
      const response: TOG_Response = {
        success: false,
        og_response: null,
        error: "Error generating prompt response",
      };
      return res.status(505).json(response);
    }
    const strippedText = og_response_text.toLowerCase().replaceAll(".", "");
    if (allowed_reponses.includes(strippedText)) {
      const reponse: TOG_Response = {
        success: true,
        og_response: strippedText,
        error: null,
      };
      return res.status(200).json(reponse);
    } else {
      let retries = 0;
      let retriedText = strippedText;
      let retriedMessages: { role: "system" | "user"; content: string }[] =
        userMessages.map((value) => {
          return { role: "user", content: value };
        });
      retriedMessages.push({ role: "system", content: og_response_text });

      while (retries < MAX_RETRIES && !allowed_reponses.includes(retriedText)) {
        retries = retries + 1;
        const RETRY_PROMPT = `You must return either: create, edit, multiple, delete, rag or undefined as a single word`;
        retriedMessages.push({ role: "user", content: RETRY_PROMPT });
        const { generation: retriedGeneration } = await generatePromptResponse(
          model,
          systemMessage,
          userMessages,
          "gpt-4-mini",
          retriedMessages,
        );
        if (!retriedGeneration) {
          const response: TOG_Response = {
            success: false,
            og_response: null,
            error: "Error generating prompt response",
          };
          res.status(505).json(response);
          break;
        }
        retriedMessages.push({ role: "system", content: retriedGeneration });
        retriedText = retriedGeneration.toLowerCase().replaceAll(".", "");
        if (allowed_reponses.includes(retriedText)) {
          const reponse: TOG_Response = {
            success: true,
            og_response: strippedText,
            error: null,
          };
          res.status(200).json(reponse);
          break;
        }
        //TODO: Remove test
        break;
      }
      const response: TOG_Response = {
        success: false,
        og_response: null,
        error: "Exceeded maxiumn retries",
      };
      res.status(505).json(response);
    }
  } catch (error) {
    const catchError = error as Error;
    const response: TOG_Response = {
      success: false,
      og_response: null,
      error: catchError.message,
    };
    return res.status(505).json(response);
  }
});

type TFillBucket = {
  success: boolean;
  bucketId: string | null;
  penpotTree: string | null;
  error: string | null;
};
app.post(`/fill_bucket`, async (req, res) => {
  try {
    let bucket;
    const { bucketId, penpotTree } = req.body;
    if (!bucketId || !penpotTree) throw new Error("BucketId/ Tree missing");
    bucket = await prisma.treeBucket.findFirst({
      where: {
        bucketId,
      },
    });
    if (!bucket) {
      throw new Error("Bucket does not exist");
    }
    await prisma.treeBucket.update({
      where: {
        id: bucket.id,
      },
      data: {
        penpotTree,
      },
    });
    const reponse: TFillBucket = {
      success: true,
      bucketId,
      penpotTree,
      error: null,
    };
    res.status(200).json(reponse);
  } catch (error) {
    const catchError = error as Error;
    const response: TFillBucket = {
      success: false,
      bucketId: null,
      penpotTree: null,
      error: catchError.message,
    };
    return res.status(505).json(response);
  }
});
type TPollBucket = {
  success: boolean;
  pollResult: boolean;
  bucketId: string | null;
  penpotTree: string | null;
  error: string | null;
};
app.post(`/poll_bucket`, async (req, res) => {
  try {
    const { bucketId } = req.body;
    const bucket = await prisma.treeBucket.findFirst({
      where: {
        bucketId: bucketId,
      },
    });
    if (!bucket) throw new Error("Bucket does not exist");
    const pollResult = bucket.penpotTree ? true : false;
    const response: TPollBucket = {
      success: true,
      pollResult: pollResult,
      bucketId: bucketId,
      penpotTree: bucket.penpotTree,
      error: null,
    };
    return res.status(200).json(response);
  } catch (error) {
    const catchError = error as Error;
    const response: TPollBucket = {
      success: false,
      pollResult: false,
      bucketId: null,
      penpotTree: null,
      error: catchError.message,
    };
    return res.status(505).json(response);
  }
});
type TFetchWebpage = {
  bucketId: string | null;
  html?: string | null;
  css?: string | null;
  error: string | null;
};
app.post(`/fetch_webpage`, async (req, res) => {
  try {
    const { bucketId } = req.body;
    const bucket = await prisma.treeBucket.findFirst({
      where: {
        bucketId: bucketId,
      },
    });
    if (!bucket) throw new Error("Failed to create bucket");
    const response: TFetchWebpage = {
      bucketId: bucketId,
      html: bucket.html,
      css: bucket.css,
      error: null,
    };
    return res.status(200).json(response);
  } catch (error) {
    const catchError = error as Error;
    const response: TFetchWebpage = {
      bucketId: null,
      error: catchError.message,
    };
    return res.status(505).json(response);
  }
});

type TCreateBucket = {
  success: boolean;
  bucketId: string | null;
  error: string | null;
};
app.post(`/create_bucket`, async (req, res) => {
  try {
    const bucketId = randomUUID();
    const { html, css } = req.body;
    if (!html || !css) throw new Error("Missing html or css");
    const bucket = await prisma.treeBucket.create({
      data: {
        bucketId: bucketId,
        html: html,
        css: css,
      },
    });
    if (!bucket) throw new Error("Failed to create bucket");
    const response: TCreateBucket = {
      success: true,
      bucketId: bucketId,
      error: null,
    };
    return res.status(200).json(response);
  } catch (error) {
    const catchError = error as Error;
    const response: TCreateBucket = {
      success: false,
      bucketId: null,
      error: catchError.message,
    };
    return res.status(505).json(response);
  }
});
type TCreateHTMLResponse = {
  success: boolean;
  html: string | null;
  css?: string | null;
  error: string | null;
};
app.post(`/create_html`, async (req, res) => {
  try {
    const { userId, openai_key, prompt: tailwindPrompt } = req.body;

    let model: OpenAI;
    if (!openai_key) {
      const userTrials = checkUserTrials(userId);
      await updateUserTrials(userId);
      if (!userTrials) {
        const response: TOG_Response = {
          success: false,
          og_response: null,
          error: "Trials finished for user",
        };
        return res.status(505).json(response);
      }
      model = getModel("self");
    } else {
      model = getModel(openai_key);
    }
    const { generation: tailwindHtml } = await generatePromptResponse(
      model,
      CREATE_HTML_SYSTEM_PROMPT,
      [tailwindPrompt],
    );
    if (!tailwindHtml) {
      const response: TCreateHTMLResponse = {
        success: false,
        html: null,
        css: null,
        error: "Error generating prompt response",
      };
      return res.status(505).json(response);
    }
    const { html, errors, isValid } = validateHTML(cleanHTML(tailwindHtml));
    if (isValid && !errors && html) {
      const cssResponse = await generateCssFromHtml(html);
      if (cssResponse.error) throw Error(cssResponse.error);
      if (!cssResponse.css) throw Error("Error generating CSS");
      const response: TCreateHTMLResponse = {
        success: true,
        html: html,
        css: cssResponse.css,
        error: null,
      };
      return res.status(200).json(response);
    } else {
      const response: TCreateHTMLResponse = {
        success: false,
        html: null,
        error: "Error creating component",
      };
      return res.status(505).json(response);
    }
  } catch (error) {
    const catchError = error as Error;
    const response: TCreateHTMLResponse = {
      success: false,
      html: null,
      error: catchError.message,
    };
    return res.status(505).json(response);
  }
});

type TGetUserTrials = {
  trials: number | null;
  error?: string | null;
};
app.post(`/get_user_trials`, async (req, res) => {
  try {
    const { userId } = req.body;
    const trials = await getUserTrials(userId);
    const response: TGetUserTrials = {
      trials: trials,
    };
    return res.status(200).json(response);
  } catch (error) {
    const catchError = error as Error;
    const response: TGetUserTrials = {
      trials: null,
      error: catchError.message,
    };
    return res.status(505).json(response);
  }
});
app.listen(3000, () =>
  console.log(`
🚀 Server ready at: http://localhost:3000
`),
);
async function getUserTrials(userId: any): Promise<number> {
  try {
    let userDetails;
    userDetails = await prisma.user.findFirst({
      where: {
        userId,
      },
    });
    if (!userDetails) {
      userDetails = await prisma.user.create({
        data: {
          userId,
          trials: 0,
        },
      });
    }
    return userDetails.trials;
  } catch (error) {
    return 0;
  }
}
export async function checkUserTrials(userId: any): Promise<boolean> {
  try {
    let userDetails;
    userDetails = await prisma.user.findFirst({
      where: {
        userId,
      },
    });
    if (!userDetails) {
      userDetails = await prisma.user.create({
        data: {
          userId,
          trials: 0,
        },
      });
    }
    return userDetails.trials <= MAX_USER_TRIALS;
  } catch (error) {
    return false;
  }
}

export async function updateUserTrials(userId: string) {
  try {
    let userDetails;
    userDetails = await prisma.user.findFirst({
      where: {
        userId,
      },
    });
    if (!userDetails) {
      userDetails = await prisma.user.create({
        data: {
          userId,
          trials: 0,
        },
      });
    }
    await prisma.user.update({
      where: {
        id: userDetails.id,
      },
      data: {
        trials: userDetails.trials + 1,
      },
    });
    console.info("User Trials: ", userDetails.trials);
  } catch (error) {
    throw new Error("Failed to update user free trials");
  }
}
