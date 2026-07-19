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

const run = async () => {
  try {
    await client.connect();
    const database = client.db("Life_lession");
    const allLessonCollections = database.collection("lessons");

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
        console.error("Error fetching filtered lessons:", error);
        res.status(500).send({ message: "Internal Server Error", error: error.message });
      }
    });

    app.get("/api/all/public/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;
        console.log(id);
        const query = { _id: id };
        const result = await allLessonCollections.findOne(query);
        if (!result) {
          return res.status(404).send({ message: "Lesson data not found" });
        }
        res.send(result);
      } catch (error) {
        console.error("Error fetching single lesson:", error);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    
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
        console.error("Error liking lesson:", error);
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
