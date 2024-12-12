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
import { validateHTML } from "./utils/validate-html";

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

type TCreateHTMLResponse = {
  success: boolean;
  html: string | null;
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
        error: "Error generating prompt response",
      };
      return res.status(505).json(response);
    }
    const { html, errors, isValid } = validateHTML(tailwindHtml);
    if (isValid && !errors && html) {
      const response: TCreateHTMLResponse = {
        success: true,
        html: html,
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
app.listen(3000, () =>
  console.log(`
🚀 Server ready at: http://localhost:3000
`),
);
async function checkUserTrials(userId: any): Promise<boolean> {
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

async function updateUserTrials(userId: string) {
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
  } catch (error) {
    throw new Error("Failed to update user free trials");
  }
}
