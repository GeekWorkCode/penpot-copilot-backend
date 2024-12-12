import { PrismaClient } from "@prisma/client";
import express from "express";
import cors from "cors";

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

app.listen(3000, () =>
  console.log(`
🚀 Server ready at: http://localhost:3000
`),
);
