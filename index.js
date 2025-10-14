require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const bodyParser = require("body-parser");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const { ParticipantsModel } = require("./models/participantsModels");
const User = require("./models/userModel");
const auth = require("./middleware/auth");

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL;
const NODE_ENV = process.env.NODE_ENV || "development";

// Initialize Express app
const app = express();

// Middleware
app.use(bodyParser.json());

// CORS configuration - update with your frontend URL for production
const allowedOrigins = [
  "http://localhost:3000",
  "http://localhost:3001",
  "https://rating-website-3.onrender.com",
  process.env.FRONTEND_URL, // Add your frontend URL in environment variables
];

app.use(cors({ 
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || NODE_ENV === "development") {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

// Multer setup for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// --- Routes ---

// Signup
app.post("/signup", async (req, res) => {
  const { name, email, password } = req.body;

  try {
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ error: "Email already registered" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (err) {
    console.error("Signup Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ error: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Add Participant
app.post("/addParticipants", upload.single("image"), async (req, res) => {
  try {
    const { name, department, email, description, teamNo } = req.body;

    const image = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
      : req.body.image || "https://example.com/default.jpg";

    const participant = new ParticipantsModel({ name, department, email, description, image, teamNo });
    const saved = await participant.save();

    res.status(201).json({ message: "Participant added successfully", data: saved });
  } catch (err) {
    console.error("Add Participant Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Delete Participant
app.delete("/deleteParticipant/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await ParticipantsModel.findByIdAndDelete(id);

    if (!deleted) return res.status(404).json({ message: "Participant not found" });

    res.status(200).json({ message: "Participant deleted successfully", data: deleted });
  } catch (err) {
    console.error("Delete Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Vote Participant
app.post("/voteParticipant/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const participant = await ParticipantsModel.findById(id);
    if (!participant) return res.status(404).json({ message: "Participant not found" });

    participant.votes = (participant.votes || 0) + 1;
    await participant.save();

    res.status(200).json({ message: "Vote counted", votes: participant.votes });
  } catch (err) {
    console.error("Vote Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get all participants
app.get("/allParticipants", async (req, res) => {
  try {
    const participants = await ParticipantsModel.find({});
    res.json(participants);
  } catch (err) {
    console.error("Fetch Participants Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Get participants sorted by votes
app.get("/allParticipantsByVotes", async (req, res) => {
  try {
    const participants = await ParticipantsModel.find().sort({ votes: -1 });
    res.status(200).json(participants);
  } catch (err) {
    console.error("Fetch Votes Error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
});

// Health check endpoint for Render
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK", message: "Server is running", timestamp: new Date() });
});

// Root endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Rating Website API", 
    version: "1.0.0",
    endpoints: {
      health: "/health",
      signup: "/signup",
      login: "/login",
      participants: "/allParticipants",
      participantsByVotes: "/allParticipantsByVotes",
      addParticipant: "/addParticipants",
      vote: "/voteParticipant/:id",
      delete: "/deleteParticipant/:id"
    }
  });
});

// --- Database Connection & Server Start ---
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URL, { 
      useNewUrlParser: true, 
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  }
};

// Start server
connectDB().then(() => {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📍 Environment: ${NODE_ENV}`);
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  mongoose.connection.close(false, () => {
    console.log("MongoDB connection closed");
    process.exit(0);
  });
});

module.exports = app;
