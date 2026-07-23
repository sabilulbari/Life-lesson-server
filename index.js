const express = require("express");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

dotenv.config();
const port = process.env.PORT;
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

app.use(cors());
app.use(express.json());

const run = async () => {
  try {
    await client.connect();
    const database = client.db("Life_lession");
    const allLessonCollections = database.collection("lessons");
    const reportCollection = database.collection("report");
    const commentCollection = database.collection("comments");
    const subscriptionsCollection = database.collection("subscriptions")

    app.get("/", async (req, res) => {
      res.send("Hello, database is working");
    });

    app.get("/api/all/public/lessons", async (req, res) => {
      try {
        const { category, emotionalTone, search, sort } = req.query;

        let query = {};

        if (category) {
          query.category = category;
        }

        if (emotionalTone) {
          query.emotionalTone = emotionalTone;
        }

        if (search) {
          query.title = { $regex: search, $options: "i" };
        }

        let sortOption = {};
        if (sort === "newest") {
          sortOption.createdAt = -1;
        } else if (sort === "oldest") {
          sortOption.createdAt = 1;
        }

        const result = await allLessonCollections.find(query).sort(sortOption).toArray();

        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error", error: error.message });
      }
    });

    app.get("/api/all/public/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const query = { _id: id };
        const result = await allLessonCollections.findOne(query);
        if (!result) {
          return res.status(404).send({ message: "Lesson data not found" });
        }
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("/api/comments/:lessonId", async (req, res) => {
      try {
        const { lessonId } = req.params;

        if (!lessonId) {
          return res.status(400).send({ error: "Lesson ID is required" });
        }

        // ১. নির্দিষ্ট lessonId দিয়ে সব কমেন্ট খুঁজে বের করা এবং নতুন কমেন্ট সবার উপরে রাখা
        const comments = await commentCollection.find({ lessonId: lessonId }).sort({ createdAt: -1 }).toArray();

        // ২. কমেন্টগুলোর অ্যারেই রিটার্ন করা
        res.status(200).send(comments);
      } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //All post api

    app.post("/api/reports", async (req, res) => {
      try {
        // ১. ফ্রন্টএন্ডের বডি থেকে রিপোর্টের ডেটা রিসিভ করা
        const { lessonId, lessonTitle, reason } = req.body;

        // ২. ফ্রন্টএন্ড হেডার (authHeaders) থেকে রিপোর্টার (Reporter) এর তথ্য রিসিভ করা
        const userId = req.headers["x-user-id"];
        const userEmail = req.headers["x-user-email"];
        const userName = req.headers["x-user-name"];

        // অথেনটিকেশন চেক
        if (!userId) {
          return res.status(401).send({ error: "Unauthorized! Please log in first." });
        }

        // ভ্যালিডেশন চেক (যদি ইউজার কোনো ফিল্ড ফাঁকা রেখে সাবমিট করে)
        if (!lessonId || !lessonTitle || !reason) {
          return res.status(400).send({ error: "All fields (lessonId, lessonTitle, reason) are required." });
        }

        // ৩. নতুন রিপোর্টের জন্য অবজেক্ট তৈরি করা
        const newReport = {
          lessonId: lessonId,
          lessonTitle: lessonTitle,
          reason: reason,
          reportedBy: {
            userId: userId,
            email: userEmail,
            name: userName,
          },
          status: "pending", // পরবর্তীতে এডমিন প্যানেল থেকে হ্যান্ডেল করার জন্য (যেমন: pending, resolved)
          createdAt: new Date(), // রিপোর্ট জমা দেওয়ার সঠিক সময় ট্রাক করার জন্য
        };

        // ৪. ডেটাবেসের reportCollection-এ ডাটা সেভ করা
        const result = await reportCollection.insertOne(newReport);

        // ৫. ফ্রন্টএন্ডের রিকোয়ারমেন্ট অনুযায়ী রেসপন্স পাঠানো
        // ফ্রন্টএন্ডে return { success: true, report: result } করা আছে, তাই পুরো রিপোর্টের অবজেক্টটি আইডি সহ ব্যাক করা হচ্ছে
        res.status(201).send({
          _id: result.insertedId,
          ...newReport,
        });
      } catch (error) {
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.post("/api/comments", async (req, res) => {
      try {
        // ১. ফ্রন্টএন্ডের বডি (body) থেকে ডেটা নেওয়া
        const { lessonId, content } = req.body;

        // ২. ফ্রন্টএন্ডের হেডার (authHeaders) থেকে ইউজারের তথ্য রিসিভ করা
        const userId = req.headers["x-user-id"];
        const userName = req.headers["x-user-name"];
        const userPhoto = req.headers["x-user-photo"];
        const userEmail = req.headers["x-user-email"];

        // অথেনটিকেশন চেক
        if (!userId) {
          return res.status(401).send({ error: "Unauthorized! Please log in first." });
        }

        // ইনপুট ভ্যালিডেশন
        if (!lessonId || !content || content.trim() === "") {
          return res.status(400).send({ error: "Lesson ID and comment content are required." });
        }

        // ৩. নতুন কমেন্টের অবজেক্ট তৈরি করা
        const newComment = {
          lessonId: lessonId,
          content: content.trim(),
          user: {
            userId: userId,
            name: userName || "Anonymous",
            photo: userPhoto || "",
            email: userEmail || "",
          },
          createdAt: new Date(), // কমেন্ট করার সময়
          updatedAt: new Date(),
        };

        // ৪. ডেটাবেসে কমেন্ট সেভ করা
        const result = await commentCollection.insertOne(newComment);

        const savedComment = {
          _id: result.insertedId,
          ...newComment,
        };

        res.status(201).send(savedComment);
      } catch (error) {
        console.error("Error adding comment:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //pricing post api
    app.post("/api/pricing", async(req, res)=>{
      const pricingData = req.body

      const addSubscribe = await subscriptionsCollection.insertOne(pricingData);

      res.send(addSubscribe)

    })

    // All patch api

    app.patch("/api/lessons/:id/like", async (req, res) => {
      try {
        const { id } = req.params;

        // ১. ফ্রন্টএন্ডের x-user-id হেডার থেকে ইউজার আইডি রিসিভ করা
        const userId = req.headers["x-user-id"];

        if (!userId) {
          return res.status(401).send({ error: "Unauthorized! User ID is missing." });
        }

        // আগের আইডি সমস্যার কারণে অবজেক্ট আইডি বা স্ট্রিং আইডি ডাইনামিকলি হ্যান্ডেল করা
        let query = {};
        try {
          query = { _id: id };
        } catch (err) {
          query = { _id: id };
        }

        // ২. প্রথমে লেসনটি ডেটাবেসে আছে কিনা খুঁজে বের করা
        const lesson = await allLessonCollections.findOne(query);

        if (!lesson) {
          return res.status(404).send({ error: "Lesson not found" });
        }

        // ৩. লাইক টগল (Toggle) লজিক
        // যদি likes অ্যারে না থাকে তবে একটি খালি অ্যারে ডিফাইন করে নেওয়া
        const likesArray = lesson.likes || [];

        // ইউজার কি ইতিমধ্যে লাইক দিয়ে রেখেছে?
        const isLiked = likesArray.includes(userId);

        let updateDoc = {};

        if (isLiked) {
          // ইউজার ইতিমধ্যে লাইক দিলে: অ্যারে থেকে আইডি রিমুভ ($pull) এবং likesCount ১ কমানো ($inc)
          updateDoc = {
            $pull: { likes: userId },
            $inc: { likesCount: -1 },
          };
        } else {
          // ইউজার নতুন লাইক দিলে: অ্যারেতে আইডি যোগ ($addToSet) এবং likesCount ১ বাড়ানো ($inc)
          updateDoc = {
            $addToSet: { likes: userId },
            $inc: { likesCount: 1 },
          };
        }

        // ৪. ডেটাবেস আপডেট করা এবং নতুন আপডেট হওয়া ডেটা রিটার্ন পাওয়া
        const options = { returnDocument: "after" }; // আপডেটের পরের লেটেস্ট ডেটা পাওয়ার জন্য
        const updatedResult = await allLessonCollections.findOneAndUpdate(query, updateDoc, options);

        // MongoDB-র ড্রাইভার ভার্সন ভেদে ভ্যালু সরাসরি বা .value এর ভেতর থাকতে পারে
        const updatedLesson = updatedResult.value || updatedResult;

        // ৫. ফ্রন্টএন্ডের রিকোয়ারমেন্ট অনুযায়ী রেসপন্স পাঠানো
        res.send({
          likesCount: updatedLesson.likesCount,
          likes: updatedLesson.likes,
        });
      } catch (error) {
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.patch("/api/lessons/:id/favorite", async (req, res) => {
      try {
        const { id } = req.params;

        // ১. ফ্রন্টএন্ড হেডার (authHeaders) থেকে ইউজার আইডি রিসিভ করা
        const userId = req.headers["x-user-id"];

        if (!userId) {
          return res.status(401).send({ error: "Unauthorized! Please log in first." });
        }

        // আইডি ফরম্যাটের অমিল এড়াতে ডাইনামিক কুয়েরি লজিক
        let query = {};
        try {
          query = { _id: id };
        } catch (err) {
          query = { _id: id };
        }

        // ২. লেসনটি ডেটাবেসে আছে কিনা চেক করা
        const lesson = await allLessonCollections.findOne(query);

        if (!lesson) {
          return res.status(404).send({ error: "Lesson not found" });
        }

        // ৩. ফেভারিট টগল (Toggle) লজিক
        const favoritesArray = lesson.favorites || [];
        const isFavorited = favoritesArray.includes(userId);

        let updateDoc = {};

        if (isFavorited) {
          // ইউজার ইতিমধ্যে ফেভারিট করে রাখলে: রিমুভ করা হবে ($pull) এবং কাউন্ট ১ কমবে
          updateDoc = {
            $pull: { favorites: userId },
            $inc: { favoritesCount: -1 },
          };
        } else {
          // ইউজার নতুন করে ফেভারিট করলে: যোগ করা হবে ($addToSet) এবং কাউন্ট ১ বাড়বে
          updateDoc = {
            $addToSet: { favorites: userId },
            $inc: { favoritesCount: 1 },
          };
        }

        // ৪. ডেটাবেস আপডেট করা এবং লেটেস্ট ডেটা রিটার্ন পাওয়া
        const options = { returnDocument: "after" };
        const updatedResult = await allLessonCollections.findOneAndUpdate(query, updateDoc, options);

        // MongoDB ড্রাইভার ভার্সন সেফটি চেক
        const updatedLesson = updatedResult.value || updatedResult;

        // ৫. ফ্রন্টএন্ডের রিকোয়ারমেন্ট অনুযায়ী রেসপন্স পাঠানো
        // (যা সরাসরি `{ success: true, ...result }` অবজেক্টে স্প্রেড হয়ে যাবে)
        res.send({
          favoritesCount: updatedLesson.favoritesCount || 0,
          favorites: updatedLesson.favorites || [],
        });
      } catch (error) {
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
  } finally {
    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  }
};

run();
