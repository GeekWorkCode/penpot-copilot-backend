import OpenAI from "openai";
import { checkUserTrials, updateUserTrials } from "./app";
import { generatePromptResponse, getModel } from "./app/utils/model";
import { cleanHTML, validateHTML } from "./app/utils/validate-html";

const TEST_HTML = ` <div class="bg-red-500 w-64 h-64 flex items-center justify-center rounded-lg shadow-lg">
    <button class="bg-white text-red-500 px-4 py-2 rounded-full font-semibold hover:bg-red-100">
      Click Me
    </button>
  </p> `;

const GENERATED_HTML =
  '```html\n<div class="w-[500px] h-[300px] mx-auto">\n    <div class="bg-red-600 text-white text-center p-4">\n        <h1 class="text-2xl font-bold">This is a Red Banner</h1>\n    </div>\n    <div class="bg-white h-full flex items-center justify-center">\n        <p class="text-gray-800">This is the content area with a white background.</p>\n    </div>\n</div>\n```';

const TEST_USERID = `1234-5678-9012`;

const testingArea = async () => {
  console.log(cleanHTML(GENERATED_HTML));
};

testingArea();
