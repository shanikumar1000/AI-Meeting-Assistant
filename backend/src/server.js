const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");

require("dotenv").config();

const app = express();

const meetingRoutes = require("./routes/meetingRoutes");

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
    origin: "http://localhost:5173",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

// General API rate limiter
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many requests. Please try again later."
    }
});

// Stricter limiter for expensive operations
const processingLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many processing requests. Please try again later."
    }
});

// Apply rate limits before parsing request bodies
app.use("/api", apiLimiter);

app.use("/api/meetings/upload", processingLimiter);
app.use("/api/meetings/process", processingLimiter);

// Request body limits
app.use(express.json({ limit: "55mb" }));

app.use(express.urlencoded({
    limit: "55mb",
    extended: true
}));

// Meeting routes
app.use("/api/meetings", meetingRoutes);

// Health check
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "AI Meeting Assistant backend is running!",
        status: "UP"
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error("Server Error:", err.message);

    res.status(err.status || 500).json({
        success: false,
        message: "An unexpected server error occurred."
    });
});

// Server configuration
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});