const express = require("express");
const app = express();
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

dotenv.config();
const port = process.env.PORT;
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

app.use(cors());
app.use(express.json());

const JWKS = createRemoteJWKSet(new URL(`${process.env.FRONTEND_URL}/api/auth/jwks`));

const verifyToken = async (req, res, next) => {
  const authHeader = req?.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer")) {
    res.status(401).send({ message: "Unauthorize" });
  }

  const token = authHeader.split(" ")[1];

  if (!token) {
    res.status(401).send({ message: "Unauthorize access" });
  }

  try {
    const { payload } = await jwtVerify(token, JWKS);
    console.log(payload, "token data")
    next();
  } catch (error) {
    res.status(401).send({ message: "Unauthorize access" });
  }
};

const run = async () => {
  try {
    await client.connect();
    const database = client.db("Life_lession");
    const allLessonCollections = database.collection("lessons");
    const reportCollection = database.collection("report");
    const commentCollection = database.collection("comments");
    const favoritesCollection = database.collection("favorite_lesson");
    const subscriptionsCollection = database.collection("subscriptions");
    const userCollection = database.collection("user");
    const totalLikeFavoriteByUserCollection = database.collection("userLikeAndFav");
    const reportsCollection = database.collection("report");

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
          query.$or = [{ title: { $regex: search, $options: "i" } }, { creatorName: { $regex: search, $options: "i" } }];
        }

        let sortOption = {};
        if (sort === "newest") {
          sortOption.createdAt = -1;
        } else if (sort === "oldest") {
          sortOption.createdAt = 1;
        } else if (sort === "mostSaved") {
          sortOption.favoritesCount = -1;
        }

        const currentPageNumber = Number(req.query.currentPageNumber) || 1;
        const limit = Number(req.query.limit) || 9;
        const totalData = await allLessonCollections.countDocuments()

        const skip = (currentPageNumber - 1) * limit 
        const total_page = Math.ceil(totalData/limit)


        const data = await allLessonCollections.find(query).skip(skip).limit(limit).sort(sortOption).toArray();

        res.send({ skip, total_page, currentPageNumber, data });
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error", error: error.message });
      }
    });

    app.get("/api/all/public/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;

        let result = null;

        try {
          result = await allLessonCollections.findOne({ _id: new ObjectId(id) });
        } catch (err) {}

        if (!result) {
          result = await allLessonCollections.findOne({ _id: id });
        }

        if (!result) {
          return res.status(404).send({ message: "Lesson data not found" });
        }
        res.send(result);
      } catch (error) {
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    app.get("");

    app.get("/api/comments/:lessonId", async (req, res) => {
      try {
        const { lessonId } = req.params;

        if (!lessonId) {
          return res.status(400).send({ error: "Lesson ID is required" });
        }

        const comments = await commentCollection.find({ lessonId: lessonId }).sort({ createdAt: -1 }).toArray();

        res.status(200).send(comments);
      } catch (error) {
        console.error("Error fetching comments:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.get("/api/lessons/my-lessons/:userId", async (req, res) => {
      const { userId } = req.params;

      const result = await allLessonCollections.find({ creatorId: userId }).toArray();

      let totalFavorite = 0;

      for (const lesson of result) {
        totalFavorite += lesson.favoritesCount;
      }
      const totalLesson = result.length;

      const myLesson = { lessons: result, totalFavorite, totalLesson };

      res.send(myLesson);
    });

    app.get("/api/lesson/my-favorites/:userId", async (req, res) => {
      const { userId } = req.params;
      const result = await favoritesCollection.find({ userId }).toArray();
      res.send(result);
    });
    app.get("/api/dashboard/admin/all/users", async (req, res) => {
      const adminRole = req.headers["x-user-role"];
      const userId = req.headers["x-user-id"];

      if (adminRole !== "admin" && !userId) {
        return res.status(401).send({ message: "Unauthorize access" });
      }

      const users = await userCollection.find().toArray();

      for (const user of users) {
        const filter = {
          creatorId: user._id.toString(),
        };
        const lessonCount = await allLessonCollections.countDocuments(filter);
        user.totalLessonCreated = lessonCount;
      }

      res.send(users);
    });

    app.get("/api/lessons/admin-all", async (req, res) => {
      try {
        // ১. রিকোয়েস্ট হেডার থেকে ইউজার আইডি চেক
        const userId = req.headers["x-user-id"];
        if (!userId) {
          return res.status(401).send({ error: "Unauthorized access" });
        }

        // ২. URL-এর query parameters নেওয়া
        const { category, visibility, isReviewed } = req.query;

        // ৩. একটি খালি filter অবজেক্ট তৈরি করা
        const filter = {};

        // ৪. কন্ডিশন অনুযায়ী ফিল্টারে ডাটা যোগ করা (যদি ফাঁকা না থাকে)
        if (category && category !== "") {
          filter.category = category;
        }

        if (visibility && visibility !== "") {
          filter.visibility = visibility;
        }

        // boolean বা string হ্যান্ডেল করার সহজ উপায়
        if (isReviewed !== undefined && isReviewed !== "") {
          // যদি কোয়েরিতে "true" বা "false" স্ট্রিং আকারে আসে, তবে boolean-এ রূপান্তর করা
          filter.isReviewed = isReviewed === "true";
        }

        // ৫. ডাটাবেস থেকে ফিল্টার অনুযায়ী ডাটা খুঁজে নিয়ে আস
        const lessons = await allLessonCollections.find(filter).toArray();

        // ৬. ডাটা ফ্রন্টএন্ডে পাঠানো
        res.send(lessons);
      } catch (error) {
        console.error("Error fetching admin lessons:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
    app.get("/api/reports", async (req, res) => {
      try {
        const aggregatedReports = await reportsCollection
          .aggregate([
            {
              $group: {
                _id: "$lessonId",
                lessonId: { $first: "$lessonId" },
                lessonTitle: { $first: "$lessonTitle" },
                reportCount: { $sum: 1 },
                reasons: { $addToSet: "$reason" },
                reports: {
                  $push: {
                    reportId: "$_id",
                    reason: "$reason",
                    reportedBy: "$reportedBy",
                    status: "$status",
                    createdAt: "$createdAt",
                  },
                },
              },
            },
            {
              $project: {
                _id: 0,
              },
            },
          ])
          .toArray();

        res.send(aggregatedReports);
      } catch (error) {
        console.error("Error fetching reports:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });
    app.get("/api/reports/:lessonId/details", async (req, res) => {
      try {
        const { lessonId } = req.params;

        const reports = await reportsCollection.find({ lessonId: lessonId }).toArray();

        res.send(reports);
      } catch (error) {
        console.error("Error fetching report details:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //user stats
    app.get("/api/users/stats", async (req, res) => {
      const userId = req.headers["x-user-id"];

      const filter = {
        creatorId: userId,
      };

      const userLessonCount = await allLessonCollections.countDocuments(filter);
      const userRecentLesson = await allLessonCollections.find(filter).sort({ createdAt: -1 }).limit(2).toArray();
      const userFavoriteCount = await favoritesCollection.countDocuments(filter);

      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const weeklyLessons = await allLessonCollections
        .find({
          creatorId: userId,
          createdAt: { $gte: sevenDaysAgo },
        })
        .toArray();

      let mon = 0,
        tue = 0,
        wed = 0,
        thu = 0,
        fri = 0,
        sat = 0,
        sun = 0;

      weeklyLessons.forEach((lesson) => {
        const lessonDate = new Date(lesson.createdAt);
        const dayIndex = lessonDate.getDay(); // 0 = Sun, 1 = Mon, 2 = Tue...

        if (dayIndex === 1) mon++;
        else if (dayIndex === 2) tue++;
        else if (dayIndex === 3) wed++;
        else if (dayIndex === 4) thu++;
        else if (dayIndex === 5) fri++;
        else if (dayIndex === 6) sat++;
        else if (dayIndex === 0) sun++;
      });

      const contributionChart = [
        { name: "Mon", lessons: mon },
        { name: "Tue", lessons: tue },
        { name: "Wed", lessons: wed },
        { name: "Thu", lessons: thu },
        { name: "Fri", lessons: fri },
        { name: "Sat", lessons: sat },
        { name: "Sun", lessons: sun },
      ];

      res.send({
        userLessonCount: userLessonCount,
        userFavoriteCount: userFavoriteCount,
        userRecentLesson: userRecentLesson,
        contributionChart: contributionChart,
      });
    });

    //Admin Stats
    app.get("/api/users/admin/stats", async (req, res) => {
      const userRole = req.headers["x-user-role"];
      if (userRole !== "admin") {
        return res.status(403).json({ error: "Forbidden: Admin access required" });
      }

      try {
        const totalUsers = await userCollection.countDocuments();

        const totalPublicLessons = await allLessonCollections.countDocuments({
          visibility: "Public",
        });

        const totalReported = await reportsCollection.distinct("lessonId");
        const totalReportedCount = totalReported.length;

        const contributors = await allLessonCollections
          .aggregate([
            {
              $group: {
                _id: "$creatorId",
                name: { $first: "$creatorName" },
                photo: { $first: "$creatorPhoto" },
                lessonCount: { $sum: 1 },
              },
            },
            { $sort: { lessonCount: -1 } },
            { $limit: 5 },
          ])
          .toArray();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todaysLessons = await allLessonCollections
          .find({ createdAt: { $gte: today } })
          .sort({ createdAt: -1 })
          .toArray();

        const userGrowth = [
          { month: "Jan", users: Math.max(5, Math.floor(totalUsers * 0.2)) },
          { month: "Feb", users: Math.max(10, Math.floor(totalUsers * 0.4)) },
          { month: "Mar", users: Math.max(15, Math.floor(totalUsers * 0.6)) },
          { month: "Apr", users: Math.max(20, Math.floor(totalUsers * 0.8)) },
          { month: "May", users: totalUsers },
        ];

        const lessonGrowth = [
          { month: "Jan", lessons: Math.max(10, Math.floor(totalPublicLessons * 0.2)) },
          { month: "Feb", lessons: Math.max(25, Math.floor(totalPublicLessons * 0.4)) },
          { month: "Mar", lessons: Math.max(45, Math.floor(totalPublicLessons * 0.6)) },
          { month: "Apr", lessons: Math.max(70, Math.floor(totalPublicLessons * 0.8)) },
          { month: "May", lessons: totalPublicLessons },
        ];

        res.json({
          totalUsers,
          totalPublicLessons,
          totalReportedCount,
          contributors,
          todaysLessons,
          userGrowth,
          lessonGrowth,
        });
      } catch (error) {
        res.status(500).json({
          message: "Internal Server Error",
          error: error.message,
        });
      }
    });

    //All post api

    app.post("/api/reports", async (req, res) => {
      try {
        const { lessonId, lessonTitle, reason } = req.body;

        const userId = req.headers["x-user-id"];
        const userEmail = req.headers["x-user-email"];
        const userName = req.headers["x-user-name"];

        if (!userId) {
          return res.status(401).send({ error: "Unauthorized! Please log in first." });
        }

        if (!lessonId || !lessonTitle || !reason) {
          return res.status(400).send({ error: "All fields (lessonId, lessonTitle, reason) are required." });
        }

        const newReport = {
          lessonId: lessonId,
          lessonTitle: lessonTitle,
          reason: reason,
          reportedBy: {
            userId: userId,
            email: userEmail,
            name: userName,
          },
          status: "pending",
          createdAt: new Date(),
        };

        const result = await reportCollection.insertOne(newReport);

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
        const { lessonId, content } = req.body;

        const userId = req.headers["x-user-id"];
        const userName = req.headers["x-user-name"];
        const userPhoto = req.headers["x-user-photo"];
        const userEmail = req.headers["x-user-email"];

        if (!userId) {
          return res.status(401).send({ error: "Unauthorized! Please log in first." });
        }

        if (!lessonId || !content || content.trim() === "") {
          return res.status(400).send({ error: "Lesson ID and comment content are required." });
        }

        const newComment = {
          lessonId: lessonId,
          content: content.trim(),
          user: {
            userId: userId,
            name: userName || "Anonymous",
            photo: userPhoto || "",
            email: userEmail || "",
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };

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
    app.post("/api/pricing", async (req, res) => {
      const pricingData = req.body;

      const newData = {
        ...pricingData,
        createdAt: new Date(),
      };

      const addSubscribe = await subscriptionsCollection.insertOne(newData);

      const filter = { email: pricingData.email };
      // update the value of the 'quantity' field to 5
      const updateDocument = {
        $set: {
          plan: pricingData.planId,
        },
      };
      const result = await userCollection.updateOne(filter, updateDocument);

      res.send(result);
    });

    //lesson post
    app.post("/api/user/dashboard/add/lesson", verifyToken, async (req, res) => {
      const header = req.headers;
      const bodyData = req.body;

      const newLessonData = {
        ...bodyData,
        creatorId: header["x-user-id"],
        creatorName: header["x-user-name"],
        creatorPhoto: header["x-user-photo"],
        createdAt: new Date(),
      };

      const result = await allLessonCollections.insertOne(newLessonData);
      res.send(result);
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

        let lessonResult = null;
        try {
          lessonResult = await allLessonCollections.findOne({ _id: new ObjectId(id) });
        } catch (err) {}

        if (!lessonResult) {
          lessonResult = await allLessonCollections.findOne({ _id: id });
        }

        if (!lessonResult) {
          return res.status(404).send({ error: "Lesson not found" });
        }

        // ৩. লাইক টগল (Toggle) লজিক
        // যদি likes অ্যারে না থাকে তবে একটি খালি অ্যারে ডিফাইন করে নেওয়া
        const likesArray = lessonResult.likes || [];

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
        const updatedResult = await allLessonCollections.findOneAndUpdate(lessonResult, updateDoc, options);

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
        const userId = req.headers["x-user-id"];

        if (!userId) {
          return res.status(401).send({ error: "Unauthorized! Please log in first." });
        }

        let lessonResult = null;

        try {
          lessonResult = await allLessonCollections.findOne({ _id: new ObjectId(id) });
        } catch (err) {}

        if (!lessonResult) {
          lessonResult = await allLessonCollections.findOne({ _id: id });
        }

        if (!lessonResult) {
          return res.status(404).send({ error: "Lesson not found" });
        }

        const stringLessonId = lessonResult._id.toString(); // ID-কে String হিসেবে নিয়ে নেওয়া হলো

        // ৩. ফেভারিট টগল (Toggle) লজিক
        const favoritesArray = lessonResult.favorites || [];
        const isFavorited = favoritesArray.includes(userId);

        let updateDoc = {};

        if (isFavorited) {
          // ইউজার ইতিমধ্যে ফেভারিট করে রাখলে: রিমুভ করা হবে ($pull) এবং কাউন্ট ১ কমবে
          updateDoc = {
            $pull: { favorites: userId },
            $inc: { favoritesCount: -1 },
          };

          // 💥 FIX HERE: lessonId-কে String বানিয়ে ডিলিট করতে হবে
          await favoritesCollection.deleteMany({
            lessonId: stringLessonId,
            userId: userId,
          });
        } else {
          // ইউজার নতুন করে ফেভারিট করলে: যোগ করা হবে ($addToSet) এবং কাউন্ট ১ বাড়বে
          updateDoc = {
            $addToSet: { favorites: userId },
            $inc: { favoritesCount: 1 },
          };

          // আগের কোনো ডুপ্লিকেট থাকলে তা পরিষ্কার করে নতুন ইনসার্ট করা
          await favoritesCollection.deleteMany({
            userId: userId,
            lessonId: stringLessonId,
          });

          // favoritesCollection-এ নতুন অবজেক্ট ডাটা ইনসার্ট করা
          await favoritesCollection.insertOne({
            userId: userId,
            lessonId: stringLessonId,
            title: lessonResult.title,
            category: lessonResult.category,
            emotionalTone: lessonResult.emotionalTone,
            creatorName: lessonResult.creatorName,
            createdAt: new Date(),
          });
        }

        // ৪. ডেটাবেস আপডেট করা এবং লেটেস্ট ডেটা রিটার্ন পাওয়া
        const options = { returnDocument: "after" };
        const updatedResult = await allLessonCollections.findOneAndUpdate({ _id: lessonResult._id }, updateDoc, options);

        const updatedLesson = updatedResult.value || updatedResult;

        // ৫. ফ্রন্টএন্ডে রেসপন্স পাঠানো
        res.send({
          favoritesCount: Math.max(0, updatedLesson.favoritesCount || 0),
          favorites: updatedLesson.favorites || [],
          isFavorited: !isFavorited,
        });
      } catch (error) {
        console.error("Favorite Toggle Error:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.patch("/api/users/admin/role", async (req, res) => {
      try {
        // ১. রিকোয়েস্ট হেডার থেকে এডমিন ইনফো নেওয়া
        const adminUserId = req.headers["x-user-id"];
        const adminUserRole = req.headers["x-user-role"];

        // ২. এডমিন অথেনটিকেশন ও অথরাইজেশন চেক
        if (!adminUserId || adminUserRole !== "admin") {
          return res.status(403).send({ error: "Forbidden! Admin access required." });
        }

        // ৩. বডি থেকে targetUserId এবং newRole রিসিভ করা
        const { targetUserId, newRole } = req.body;

        if (!targetUserId || !newRole) {
          return res.status(400).send({ error: "Missing required fields: targetUserId and newRole." });
        }

        // ৪. এডমিন যেন নিজের রোল নিজে চেঞ্জ করতে না পারে (Backend protection)
        if (adminUserId === targetUserId) {
          return res.status(400).send({ error: "You cannot change your own role!" });
        }

        // ৫. Target User ID ভ্যালিডObjectId কিনা তা চেক করে কুয়েরি ফিল্টার তৈরি
        let userFilter = { _id: targetUserId };

        if (ObjectId.isValid(targetUserId)) {
          userFilter = { _id: new ObjectId(targetUserId) };
        }

        // ৬. ডাটাবেসে ইউজার এর রোল আপডেট করা
        const updateDoc = {
          $set: { role: newRole },
        };

        const options = { returnDocument: "after" }; // আপডেটেড ডাটা ফেরত পাওয়ার জন্য
        const result = await userCollection.findOneAndUpdate(userFilter, updateDoc, options);

        const updatedUser = result.value || result;

        if (!updatedUser) {
          return res.status(404).send({ error: "Target user not found!" });
        }

        // ৭. ফ্রন্টএন্ডের জন্য রেসপন্স পাঠানো
        res.send({
          message: "Role updated successfully",
          user: updatedUser,
        });
      } catch (error) {
        console.error("Error updating user role:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.patch("/api/lessons/:id/feature", async (req, res) => {
      try {
        const userId = req.headers["x-user-id"];

        console.log(userId);
        if (!userId) {
          return res.status(401).send({ error: "Unauthorized access" });
        }

        const { id } = req.params;

        let filter = { _id: id };
        if (ObjectId.isValid(id)) {
          filter = { _id: new ObjectId(id) };
        }

        const lesson = await allLessonCollections.findOne(filter);

        if (!lesson) {
          return res.status(404).send({ error: "Lesson not found" });
        }

        const newFeaturedStatus = !lesson.featured;

        const updateDoc = {
          $set: { featured: newFeaturedStatus },
        };

        await allLessonCollections.updateOne(filter, updateDoc);

        // ৬. ফ্রন্টএন্ডে রেসপন্স পাঠানো
        res.send({
          message: "Featured status updated successfully",
          featured: newFeaturedStatus,
        });
      } catch (error) {
        console.error("Error toggling featured status:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.patch("/api/lessons/:id/review", async (req, res) => {
      try {
        const userId = req.headers["x-user-id"];
        if (!userId) {
          return res.status(401).send({ error: "Unauthorized access" });
        }

        const { id } = req.params;

        let filter = { _id: id };
        if (ObjectId.isValid(id)) {
          filter = { _id: new ObjectId(id) };
        }

        const updateDoc = {
          $set: {
            isReviewed: true,
            reviewedBy: userId,
            reviewedAt: new Date(),
          },
        };

        const options = { returnDocument: "after" };
        const result = await allLessonCollections.findOneAndUpdate(filter, updateDoc, options);

        const updatedLesson = result.value || result;

        if (!updatedLesson) {
          return res.status(404).send({ error: "Lesson not found" });
        }

        res.send({
          message: "Lesson marked as reviewed successfully",
          isReviewed: updatedLesson.isReviewed,
        });
      } catch (error) {
        console.error("Error marking lesson as reviewed:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    // PUT update lesson
    app.put("/api/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const userId = req.headers["x-user-id"];
        const userPlan = req.headers["x-user-plan"];

        if (!userId) {
          return res.status(401).send({ error: "Unauthorized! User ID missing." });
        }

        let lesson = null;
        try {
          lesson = await allLessonCollections.findOne({ _id: new ObjectId(id) });
        } catch (err) {}

        if (!lesson) {
          lesson = await allLessonCollections.findOne({ _id: id });
        }

        if (!lesson) {
          return res.status(404).send({ error: "Lesson not found" });
        }

        if (lesson.creatorId !== userId) {
          return res.status(403).send({ error: "Forbidden! You can only edit your own lesson." });
        }

        const { title, description, category, emotionalTone, image, accessLevel, visibility } = req.body;

        const updatedData = {
          title: title || lesson.title,
          description: description || lesson.description,
          category: category || lesson.category,
          emotionalTone: emotionalTone || lesson.emotionalTone,
          image: image !== undefined ? image : lesson.image,
          visibility: visibility || lesson.visibility,
          updatedAt: new Date(),
        };

        if (userPlan === "premium") {
          updatedData.accessLevel = accessLevel || lesson.accessLevel;
        } else {
          updatedData.accessLevel = "Free";
        }

        const query = lesson._id ? { _id: lesson._id } : { _id: id };
        await allLessonCollections.updateOne(query, { $set: updatedData });

        const updatedLesson = await allLessonCollections.findOne(query);
        res.send(updatedLesson);
      } catch (error) {
        console.error("Error updating lesson:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //delete lesson
    app.delete("/api/lessons/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const userId = req.headers["x-user-id"];
        if (!userId) {
          return res.status(401).send({ error: "Unauthorized! User ID missing." });
        }

        let lesson = null;
        try {
          lesson = await allLessonCollections.findOne({ _id: new ObjectId(id) });
        } catch (err) {}

        if (!lesson) {
          lesson = await allLessonCollections.findOne({ _id: id });
        }

        if (!lesson) {
          return res.status(404).send({ error: "Lesson not found" });
        }

        if (lesson.creatorId !== userId) {
          return res.status(403).send({ error: "Forbidden! You can only delete your own lesson." });
        }

        const query = lesson._id ? { _id: lesson._id } : { _id: id };
        await allLessonCollections.deleteOne(query);

        res.send({ message: "Lesson deleted successfully" });
      } catch (error) {
        console.error("Error deleting lesson:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    app.delete("/api/users/admin/:targetUserId", async (req, res) => {
      const { targetUserId } = req.params;
      const adminId = req.headers["x-user-id"];
      const adminRole = req.headers["x-user-role"];

      console.log(targetUserId, adminId, adminRole);

      if (!adminId && adminRole !== "admin") {
        return res.status(401).send({ message: "Unauthorize access" });
      }

      try {
        let lesson = null;
        try {
          lesson = await allLessonCollections.find({ creatorId: targetUserId }).toArray();
        } catch (err) {}

        if (!lesson) {
          return res.status(404).send({ error: "Something went wrong" });
        }

        const targetUserquery = { _id: new ObjectId(targetUserId) };
        const targetUserLessonquery = { creatorId: targetUserId };

        const deleteUser = await userCollection.deleteOne(targetUserquery);
        const deleteUserAllLesson = await allLessonCollections.deleteMany(targetUserLessonquery);
        res.send({ message: "User deleted successfully" });
      } catch (error) {
        console.error("Error deleting lesson:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //delete  favrite and main lesson collection
    app.delete("/api/dashboard/admin/lessons/:id", async (req, res) => {
      try {
        const userId = req.headers["x-user-id"];
        if (!userId) {
          return res.status(401).send({ error: "Unauthorized access" });
        }

        const { id } = req.params;

        // ২. ObjectId বা String ফিল্টার তৈরি করা
        let filter = { _id: id };
        if (ObjectId.isValid(id)) {
          filter = { _id: new ObjectId(id) };
        }

        // ৩. মূল লেসন কলেকশন থেকে লেসনটি ডিলিট করা
        const deleteResult = await allLessonCollections.deleteOne(filter);

        if (deleteResult.deletedCount === 0) {
          return res.status(404).send({ error: "Lesson not found" });
        }

        let favoriteFilter = { lessonId: id };
        if (ObjectId.isValid(id)) {
          favoriteFilter = {
            $or: [{ lessonId: id }, { lessonId: new ObjectId(id) }],
          };
        }
        await favoritesCollection.deleteMany(favoriteFilter);

        // ৫. ফ্রন্টএন্ডে সাকসেস রেসপন্স পাঠানো
        res.send({
          message: "Lesson moderated and deleted permanently",
        });
      } catch (error) {
        console.error("Error deleting lesson:", error);
        res.status(500).send({ error: "Internal Server Error" });
      }
    });

    //delete report report amd related lesson
    app.delete("/api/reports/:lessonId/ignore/delete", async (req, res) => {
      const { lessonId } = req.params;
      const { deleteType } = req.body;

      console.log(deleteType, "type of delete");
      const ignoreFilter = {
        lessonId: lessonId,
      };

      if (deleteType === "ignore") {
        const ignoreAction = await reportCollection.deleteMany(ignoreFilter);
        return res.send(ignoreAction);
      } else {
        const deleteFilter = {
          _id: new ObjectId(lessonId),
        };
        const ignoreAction = await reportCollection.deleteMany(ignoreFilter);
        const deleteAction = await allLessonCollections.deleteOne(deleteFilter);
        return res.send({ ...ignoreAction, ...deleteAction });
      }
    });
  } finally {
    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  }
};

run();
