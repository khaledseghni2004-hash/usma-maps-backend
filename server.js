// ============================================
// USMA MAPS — BACKEND SERVER
// ============================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10kb" }));

// Database configuration
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "usma_maps";

let db;
let mongoClient;

// ============================================
// HEALTH CHECK
// ============================================

app.get("/", (req, res) => {
    res.json({
        project: "USMA MAPS",
        status: "online",
        message: "USMA MAPS backend is running."
    });
});

// ============================================
// DATABASE STATUS
// ============================================

app.get("/api/status", (req, res) => {
    res.json({
        server: "online",
        database: db ? "connected" : "disconnected"
    });
});

// ============================================
// DATABASE CONNECTION
// ============================================

async function connectDatabase() {
    if (!MONGODB_URI) {
        throw new Error("MONGODB_URI is missing.");
    }

    mongoClient = new MongoClient(MONGODB_URI);

    await mongoClient.connect();

    db = mongoClient.db(DB_NAME);

    // Collection for temporary supporter locations
    const locations = db.collection("locations");

    // Automatically expire location records
    // after their expiry time
    await locations.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 }
    );

    console.log("MongoDB connected successfully.");
}

// ============================================
// START SERVER
// ============================================

async function startServer() {
    try {
        await connectDatabase();

        app.listen(PORT, "0.0.0.0", () => {
            console.log(`USMA MAPS running on port ${PORT}`);
        });

    } catch (error) {
        console.error("Server startup failed:", error.message);
        process.exit(1);
    }
}

startServer();
