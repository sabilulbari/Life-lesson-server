const express = require("express");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient } = require("mongodb");

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

    app.get('/', async(req, res)=>{
      res.send('Hello, database is working')
    })


    app.get("/api/all/public/lessons", async (req, res) => {
      try {
        // ১. ফ্রন্টএন্ড থেকে পাঠানো কোয়েরি প্যারামিটারগুলো রিসিভ করা
        const { category, emotionalTone, search, sort } = req.query;

        // ২. একটি খালি কুয়েরি অবজেক্ট তৈরি করা
        let query = {};

        // ক্যাটাগরি ফিল্টার (যদি ফ্রন্টএন্ড থেকে পাঠানো হয়)
        if (category) {
          query.category = category;
        }

        // ইমোশনাল টোন ফিল্টার (যদি ফ্রন্টএন্ড থেকে পাঠানো হয়)
        if (emotionalTone) {
          query.emotionalTone = emotionalTone;
        }

        // সার্চ ফিল্টার (টাইটেল বা কন্টেন্টের ভেতর খোঁজার জন্য - Case Insensitive)
        if (search) {
          query.title = { $regex: search, $options: "i" };
          // নোট: আপনার ডেটাবেসের ফিল্ডের নাম 'title' না হয়ে অন্য কিছু হলে সেটি এখানে দিন
        }

        // ৩. সর্টিং (Sorting) লজিক তৈরি করা
        let sortOption = {};
        if (sort === "newest") {
          sortOption.createdAt = -1; // নতুনগুলো আগে দেখাবে (আপনার ফিল্ডের নাম অনুযায়ী পরিবর্তন করতে পারেন, যেমন: _id)
        } else if (sort === "oldest") {
          sortOption.createdAt = 1; // পুরনোগুলো আগে দেখাবে
        }

        // ৪. ডেটাবেস থেকে ডেটা খোঁজা এবং অ্যারেতে কনভার্ট করা
        // (আগের প্রশ্নের ট্রিকস: কার্সার এড়াতে .toArray() ব্যবহার করা হয়েছে)
        const result = await allLessonCollections.find(query).sort(sortOption).toArray();

        // ৫. সফলভাবে ডেটা ফ্রন্টএন্ডে পাঠানো
        res.send(result);
      } catch (error) {
        console.error("Error fetching filtered lessons:", error);
        res.status(500).send({ message: "Internal Server Error", error: error.message });
      }
    });

  }finally {
    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  }
};

run()
