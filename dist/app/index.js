var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import { PrismaClient } from "@prisma/client";
import express from "express";
import cors from "cors";
import { generatePromptResponse, getModel } from "./utils/model";
import { CREATE_HTML_SYSTEM_PROMPT, MAX_RETRIES, MAX_USER_TRIALS, OG_QUERY_PROMPT, } from "./utils/prompts";
import { cleanHTML, validateHTML } from "./utils/validate-html";
import dotenv from "dotenv";
import { randomUUID } from "crypto";
import { generateCssFromHtml } from "./utils/css";
dotenv.config();
const prisma = new PrismaClient();
const app = express();
app.use(express.json());
app.use(cors());
app.get(`/ping`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        return res.send("We are live");
    }
    catch (error) {
        return res.json({ message: "Error" });
    }
}));
app.post(`/og_response`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, openai_key, prompt: og_prompt } = req.body;
        let model;
        if (!openai_key) {
            const userTrials = checkUserTrials(userId);
            yield updateUserTrials(userId);
            if (!userTrials) {
                const response = {
                    success: false,
                    og_response: null,
                    error: "Trials finished for user",
                };
                return res.status(505).json(response);
            }
            model = getModel("self");
        }
        else {
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
        const { generation: og_response_text, userMessages, systemMessage, } = yield generatePromptResponse(model, OG_QUERY_PROMPT, [og_prompt]);
        if (!og_response_text) {
            const response = {
                success: false,
                og_response: null,
                error: "Error generating prompt response",
            };
            return res.status(505).json(response);
        }
        const strippedText = og_response_text.toLowerCase().replaceAll(".", "");
        if (allowed_reponses.includes(strippedText)) {
            const reponse = {
                success: true,
                og_response: strippedText,
                error: null,
            };
            return res.status(200).json(reponse);
        }
        else {
            let retries = 0;
            let retriedText = strippedText;
            let retriedMessages = userMessages.map((value) => {
                return { role: "user", content: value };
            });
            retriedMessages.push({ role: "system", content: og_response_text });
            while (retries < MAX_RETRIES && !allowed_reponses.includes(retriedText)) {
                retries = retries + 1;
                const RETRY_PROMPT = `You must return either: create, edit, multiple, delete, rag or undefined as a single word`;
                retriedMessages.push({ role: "user", content: RETRY_PROMPT });
                const { generation: retriedGeneration } = yield generatePromptResponse(model, systemMessage, userMessages, "gpt-4-mini", retriedMessages);
                if (!retriedGeneration) {
                    const response = {
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
                    const reponse = {
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
            const response = {
                success: false,
                og_response: null,
                error: "Exceeded maxiumn retries",
            };
            res.status(505).json(response);
        }
    }
    catch (error) {
        const catchError = error;
        const response = {
            success: false,
            og_response: null,
            error: catchError.message,
        };
        return res.status(505).json(response);
    }
}));
app.post(`/fill_bucket`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        let bucket;
        const { bucketId, penpotTree } = req.body;
        if (!bucketId || !penpotTree)
            throw new Error("BucketId/ Tree missing");
        bucket = yield prisma.treeBucket.findFirst({
            where: {
                bucketId,
            },
        });
        if (!bucket) {
            throw new Error("Bucket does not exist");
        }
        yield prisma.treeBucket.update({
            where: {
                id: bucket.id,
            },
            data: {
                penpotTree,
            },
        });
        const reponse = {
            success: true,
            bucketId,
            penpotTree,
            error: null,
        };
        res.status(200).json(reponse);
    }
    catch (error) {
        const catchError = error;
        const response = {
            success: false,
            bucketId: null,
            penpotTree: null,
            error: catchError.message,
        };
        return res.status(505).json(response);
    }
}));
app.post(`/poll_bucket`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { bucketId } = req.body;
        const bucket = yield prisma.treeBucket.findFirst({
            where: {
                bucketId: bucketId,
            },
        });
        if (!bucket)
            throw new Error("Bucket does not exist");
        const pollResult = bucket.penpotTree ? true : false;
        const response = {
            success: true,
            pollResult: pollResult,
            bucketId: bucketId,
            penpotTree: bucket.penpotTree,
            error: null,
        };
        return res.status(200).json(response);
    }
    catch (error) {
        const catchError = error;
        const response = {
            success: false,
            pollResult: false,
            bucketId: null,
            penpotTree: null,
            error: catchError.message,
        };
        return res.status(505).json(response);
    }
}));
app.post(`/fetch_webpage`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { bucketId } = req.body;
        const bucket = yield prisma.treeBucket.findFirst({
            where: {
                bucketId: bucketId,
            },
        });
        if (!bucket)
            throw new Error("Failed to create bucket");
        const response = {
            bucketId: bucketId,
            html: bucket.html,
            css: bucket.css,
            error: null,
        };
        return res.status(200).json(response);
    }
    catch (error) {
        const catchError = error;
        const response = {
            bucketId: null,
            error: catchError.message,
        };
        return res.status(505).json(response);
    }
}));
app.post(`/create_bucket`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const bucketId = randomUUID();
        const { html, css } = req.body;
        if (!html || !css)
            throw new Error("Missing html or css");
        const bucket = yield prisma.treeBucket.create({
            data: {
                bucketId: bucketId,
                html: html,
                css: css,
            },
        });
        if (!bucket)
            throw new Error("Failed to create bucket");
        const response = {
            success: true,
            bucketId: bucketId,
            error: null,
        };
        return res.status(200).json(response);
    }
    catch (error) {
        const catchError = error;
        const response = {
            success: false,
            bucketId: null,
            error: catchError.message,
        };
        return res.status(505).json(response);
    }
}));
app.post(`/create_html`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId, openai_key, prompt: tailwindPrompt } = req.body;
        let model;
        if (!openai_key) {
            const userTrials = checkUserTrials(userId);
            yield updateUserTrials(userId);
            if (!userTrials) {
                const response = {
                    success: false,
                    og_response: null,
                    error: "Trials finished for user",
                };
                return res.status(505).json(response);
            }
            model = getModel("self");
        }
        else {
            model = getModel(openai_key);
        }
        const { generation: tailwindHtml } = yield generatePromptResponse(model, CREATE_HTML_SYSTEM_PROMPT, [tailwindPrompt]);
        if (!tailwindHtml) {
            const response = {
                success: false,
                html: null,
                css: null,
                error: "Error generating prompt response",
            };
            return res.status(505).json(response);
        }
        const { html, errors, isValid } = validateHTML(cleanHTML(tailwindHtml));
        if (isValid && !errors && html) {
            const cssResponse = yield generateCssFromHtml(html);
            if (cssResponse.error)
                throw Error(cssResponse.error);
            if (!cssResponse.css)
                throw Error("Error generating CSS");
            const response = {
                success: true,
                html: html,
                css: cssResponse.css,
                error: null,
            };
            return res.status(200).json(response);
        }
        else {
            const response = {
                success: false,
                html: null,
                error: "Error creating component",
            };
            return res.status(505).json(response);
        }
    }
    catch (error) {
        const catchError = error;
        const response = {
            success: false,
            html: null,
            error: catchError.message,
        };
        return res.status(505).json(response);
    }
}));
app.post(`/get_user_trials`, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { userId } = req.body;
        const trials = yield getUserTrials(userId);
        const response = {
            trials: trials,
        };
        return res.status(200).json(response);
    }
    catch (error) {
        const catchError = error;
        const response = {
            trials: null,
            error: catchError.message,
        };
        return res.status(505).json(response);
    }
}));
app.listen(3000, () => console.log(`
🚀 Server ready at: http://localhost:3000
`));
function getUserTrials(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let userDetails;
            userDetails = yield prisma.user.findFirst({
                where: {
                    userId,
                },
            });
            if (!userDetails) {
                userDetails = yield prisma.user.create({
                    data: {
                        userId,
                        trials: 0,
                    },
                });
            }
            return userDetails.trials;
        }
        catch (error) {
            return 0;
        }
    });
}
export function checkUserTrials(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let userDetails;
            userDetails = yield prisma.user.findFirst({
                where: {
                    userId,
                },
            });
            if (!userDetails) {
                userDetails = yield prisma.user.create({
                    data: {
                        userId,
                        trials: 0,
                    },
                });
            }
            return userDetails.trials <= MAX_USER_TRIALS;
        }
        catch (error) {
            return false;
        }
    });
}
export function updateUserTrials(userId) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let userDetails;
            userDetails = yield prisma.user.findFirst({
                where: {
                    userId,
                },
            });
            if (!userDetails) {
                userDetails = yield prisma.user.create({
                    data: {
                        userId,
                        trials: 0,
                    },
                });
            }
            yield prisma.user.update({
                where: {
                    id: userDetails.id,
                },
                data: {
                    trials: userDetails.trials + 1,
                },
            });
            console.info("User Trials: ", userDetails.trials);
        }
        catch (error) {
            throw new Error("Failed to update user free trials");
        }
    });
}
//# sourceMappingURL=index.js.map