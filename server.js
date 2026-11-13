// ============================================
// USMA MAPS — LIVE LOCATION BACKEND
// ============================================

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { MongoClient } = require("mongodb");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "10kb" }));

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "usma_maps";

const LOCATION_DURATION = 5 * 60 * 1000; // 5 minutes

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
// SHARE LOCATION
// ============================================

app.post("/api/locations/share", async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({
                success: false,
                message: "Database unavailable."
            });
        }

        const { latitude, longitude, supporterId, ownerToken } = req.body;

        const lat = Number(latitude);
        const lng = Number(longitude);

        if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            lat < -90 || lat > 90 ||
            lng < -180 || lng > 180
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid coordinates."
            });
        }

        const locations = db.collection("locations");

        let id = supporterId;
        let token = ownerToken;

        // First-time sharing: create a private owner token.
        if (!id && !token) {
            id = crypto.randomUUID();
            token = crypto.randomBytes(32).toString("hex");

            const now = new Date();

            await locations.insertOne({
                supporterId: id,
                ownerTokenHash: crypto
                    .createHash("sha256")
                    .update(token)
                    .digest("hex"),
                latitude: lat,
                longitude: lng,
                updatedAt: now,
                expiresAt: new Date(now.getTime() + LOCATION_DURATION)
            });

            return res.status(201).json({
                success: true,
                message: "Location sharing started.",
                supporterId: id,
                ownerToken: token,
                expiresIn: LOCATION_DURATION / 1000
            });
        }

        // Existing sharing session: verify ownership.
        if (
            typeof id !== "string" ||
            typeof token !== "string" ||
            token.length < 32
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid sharing session."
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(token)
            .digest("hex");

        const existing = await locations.findOne({
            supporterId: id,
            ownerTokenHash: tokenHash
        });

        if (!existing) {
            return res.status(403).json({
                success: false,
                message: "Sharing session not found."
            });
        }

        const now = new Date();

        await locations.updateOne(
            { _id: existing._id },
            {
                $set: {
                    latitude: lat,
                    longitude: lng,
                    updatedAt: now,
                    expiresAt: new Date(now.getTime() + LOCATION_DURATION)
                }
            }
        );

        res.json({
            success: true,
            message: "Location updated.",
            expiresIn: LOCATION_DURATION / 1000
        });

    } catch (error) {
        console.error("Share location error:", error.message);

        res.status(500).json({
            success: false,
            message: "Failed to share location."
        });
    }
});

// ============================================
// GET ACTIVE LOCATIONS
// ============================================

app.get("/api/locations/active", async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({
                success: false,
                message: "Database unavailable."
            });
        }

        const now = new Date();

        const locations = await db.collection("locations")
            .find({
                expiresAt: { $gt: now }
            })
            .project({
                _id: 0,
                supporterId: 1,
                latitude: 1,
                longitude: 1,
                updatedAt: 1,
                expiresAt: 1
            })
            .toArray();

        res.json({
            success: true,
            count: locations.length,
            locations
        });

    } catch (error) {
        console.error("Fetch locations error:", error.message);

        res.status(500).json({
            success: false,
            message: "Failed to fetch locations."
        });
    }
});

// ============================================
// STOP LOCATION SHARING
// ============================================

app.delete("/api/locations/stop", async (req, res) => {
    try {
        if (!db) {
            return res.status(503).json({
                success: false,
                message: "Database unavailable."
            });
        }

        const { supporterId, ownerToken } = req.body;

        if (
            typeof supporterId !== "string" ||
            typeof ownerToken !== "string" ||
            ownerToken.length < 32
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid sharing session."
            });
        }

        const tokenHash = crypto
            .createHash("sha256")
            .update(ownerToken)
            .digest("hex");

        const result = await db.collection("locations").deleteOne({
            supporterId,
            ownerTokenHash: tokenHash
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                success: false,
                message: "Sharing session not found."
            });
        }

        res.json({
            success: true,
            message: "Location sharing stopped."
        });

    } catch (error) {
        console.error("Stop sharing error:", error.message);

        res.status(500).json({
            success: false,
            message: "Failed to stop sharing."
        });
    }
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

    const locations = db.collection("locations");

    await locations.createIndex(
        { expiresAt: 1 },
        { expireAfterSeconds: 0 }
    );

    await locations.createIndex(
        { supporterId: 1 },
        { unique: true }
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
