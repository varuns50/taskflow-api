import express from "express";
import { docClient } from "../services/dynamo.service";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { authenticateToken, AuthRequest } from "../middlewares/auth.middleware";
import * as dotenv from "dotenv";
import { ScanCommand } from "@aws-sdk/client-dynamodb";

dotenv.config();

const router = express.Router();
const TABLE_NAME = process.env.DYNAMO_TABLE_NAME!;


// 🔒 Protected Route: Get all users
router.get("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const command = new ScanCommand({
      TableName: TABLE_NAME
    });

    const result = await docClient.send(command);
    if (!result.Items) {
      return res.status(404).json({ error: "Users not found" });
    }

    res.json(result.Items);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});


// 🔒 Protected Route: Get user by ID
router.get("/:id", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const command = new GetCommand({
      TableName: TABLE_NAME,
      Key: { userId : id },
    });

    const result = await docClient.send(command);
    if (!result.Item) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(result.Item);
  } catch (error) {
    console.error("Error fetching user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// 🔒 Protected Route: Create user
router.post("/", authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { id, name, email } = req.body;
    const command = new PutCommand({
      TableName: TABLE_NAME,
      Item: { userId :id, name, email },
    });

    await docClient.send(command);
    res.status(201).json({ message: "User created successfully" });
  } catch (error) {
    console.error("Error creating user:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ✅ PUT - Replace Entire User Record
router.put("/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email } = req.body;
  
      // Validate input
      if (!name || !email) {
        return res.status(400).json({ error: "Name and email are required." });
      }
  
      // Replace the entire user
      const command = new PutCommand({
        TableName: TABLE_NAME,
        Item: { userId :id, name, email }, // ❗ This replaces the entire object
      });
  
      await docClient.send(command);
      res.json({ message: "User updated successfully (PUT)", id, name, email });
    } catch (error) {
      console.error("Error updating user (PUT):", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
  
  // ✅ PATCH - Update Specific Fields
  router.patch("/:id", authenticateToken, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, email } = req.body;
  
      // Validate that at least one field is provided
      if (!name && !email) {
        return res.status(400).json({ error: "At least one field (name or email) is required." });
      }
  
      const updateExpression: string[] = [];
      const expressionAttributeValues: Record<string, any> = {};
  
      if (name) {
        updateExpression.push("name = :name");
        expressionAttributeValues[":name"] = name;
      }
      if (email) {
        updateExpression.push("email = :email");
        expressionAttributeValues[":email"] = email;
      }
  
      const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { userId :id },
        UpdateExpression: `SET ${updateExpression.join(", ")}`,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: "ALL_NEW",
      });
  
      const result = await docClient.send(command);
      res.json({ message: "User updated successfully (PATCH)", updatedUser: result.Attributes });
    } catch (error) {
      console.error("Error updating user (PATCH):", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
  

export default router;