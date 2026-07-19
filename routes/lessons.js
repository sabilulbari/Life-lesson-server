const express = require('express');
const router = express.Router();
const { Lesson, User } = require('../models');

// Helper to check user headers from Next.js proxy
const getUserFromHeaders = (req) => {
  const userId = req.headers['x-user-id'];
  const email = req.headers['x-user-email'];
  const role = req.headers['x-user-role'] || 'user';
  const plan = req.headers['x-user-plan'] || 'free';
  return userId ? { id: userId, email, role, plan } : null;
};

// GET all public lessons (with search, filter, sort)
router.get('/', async (req, res) => {
  try {
    const { category, emotionalTone, search, sort } = req.query;
    let query = { visibility: 'Public' };

    if (category) {
      query.category = category;
    }
    if (emotionalTone) {
      query.emotionalTone = emotionalTone;
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    let sortOption = { createdAt: -1 }; // default newest
    if (sort === 'mostSaved') {
      sortOption = { favoritesCount: -1 };
    } else if (sort === 'newest') {
      sortOption = { createdAt: -1 };
    }

    const lessons = await Lesson.find(query).sort(sortOption);
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET featured lessons
router.get('/featured', async (req, res) => {
  try {
    const lessons = await Lesson.find({ featured: true, visibility: 'Public' }).limit(10);
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET top contributors of the week (dynamic)
router.get('/top-contributors', async (req, res) => {
  try {
    // Group lessons created in the last 7 days by creator
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const contributors = await Lesson.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: '$creatorId',
          name: { $first: '$creatorName' },
          photo: { $first: '$creatorPhoto' },
          lessonCount: { $sum: 1 }
        }
      },
      { $sort: { lessonCount: -1 } },
      { $limit: 5 }
    ]);
    res.json(contributors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET most saved lessons
router.get('/most-saved', async (req, res) => {
  try {
    const lessons = await Lesson.find({ visibility: 'Public' })
      .sort({ favoritesCount: -1 })
      .limit(6);
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET user's own lessons (My Lessons)
router.get('/my-lessons', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const lessons = await Lesson.find({ creatorId: user.id }).sort({ createdAt: -1 });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET user's favorites
router.get('/my-favorites', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const lessons = await Lesson.find({ favorites: user.id }).sort({ createdAt: -1 });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET public lessons by a specific author
router.get('/author/:creatorId', async (req, res) => {
  try {
    const lessons = await Lesson.find({ creatorId: req.params.creatorId, visibility: 'Public' }).sort({ createdAt: -1 });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all lessons (admin view)
router.get('/admin-all', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const { category, visibility, isReviewed } = req.query;
    let query = {};
    if (category) query.category = category;
    if (visibility) query.visibility = visibility;
    if (isReviewed !== undefined) query.isReviewed = isReviewed === 'true';

    const lessons = await Lesson.find(query).sort({ createdAt: -1 });
    res.json(lessons);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single lesson details
router.get('/:id', async (req, res) => {
  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });
    res.json(lesson);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create lesson
router.post('/', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { title, description, category, emotionalTone, image, accessLevel, visibility } = req.body;
    
    // Validate access level choice for free users
    let finalAccessLevel = 'Free';
    if (user.plan === 'premium' && accessLevel === 'Premium') {
      finalAccessLevel = 'Premium';
    }

    const newLesson = new Lesson({
      title,
      description,
      category,
      emotionalTone,
      image: image || '',
      accessLevel: finalAccessLevel,
      visibility: visibility || 'Public',
      creatorId: user.id,
      creatorName: user.name || req.headers['x-user-name'] || 'Anonymous User',
      creatorPhoto: user.image || req.headers['x-user-photo'] || '',
      featured: false,
      likes: [],
      favorites: [],
      likesCount: 0,
      favoritesCount: 0
    });

    const saved = await newLesson.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update lesson
router.put('/:id', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    // Only creator can update
    if (lesson.creatorId !== user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { title, description, category, emotionalTone, image, accessLevel, visibility } = req.body;

    lesson.title = title || lesson.title;
    lesson.description = description || lesson.description;
    lesson.category = category || lesson.category;
    lesson.emotionalTone = emotionalTone || lesson.emotionalTone;
    if (image !== undefined) lesson.image = image;
    lesson.visibility = visibility || lesson.visibility;

    // Free users can't upgrade accessLevel to Premium
    if (user.plan === 'premium') {
      lesson.accessLevel = accessLevel || lesson.accessLevel;
    } else {
      lesson.accessLevel = 'Free';
    }

    const updated = await lesson.save();
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE lesson
router.delete('/:id', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    // Only creator or admin can delete
    if (lesson.creatorId !== user.id && user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await Lesson.findByIdAndDelete(req.params.id);
    res.json({ message: 'Lesson deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH like toggle
router.patch('/:id/like', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const likeIndex = lesson.likes.indexOf(user.id);
    if (likeIndex > -1) {
      // Unlike
      lesson.likes.splice(likeIndex, 1);
    } else {
      // Like
      lesson.likes.push(user.id);
    }
    lesson.likesCount = lesson.likes.length;
    await lesson.save();

    res.json({ likesCount: lesson.likesCount, likes: lesson.likes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH favorite toggle
router.patch('/:id/favorite', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    const favIndex = lesson.favorites.indexOf(user.id);
    if (favIndex > -1) {
      // Unfavorite
      lesson.favorites.splice(favIndex, 1);
    } else {
      // Favorite
      lesson.favorites.push(user.id);
    }
    lesson.favoritesCount = lesson.favorites.length;
    await lesson.save();

    res.json({ favoritesCount: lesson.favoritesCount, favorites: lesson.favorites });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH feature toggle (admin only)
router.patch('/:id/feature', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    lesson.featured = !lesson.featured;
    await lesson.save();

    res.json({ featured: lesson.featured });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH review toggle (admin only)
router.patch('/:id/review', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const lesson = await Lesson.findById(req.params.id);
    if (!lesson) return res.status(404).json({ error: 'Lesson not found' });

    lesson.isReviewed = true;
    await lesson.save();

    res.json({ isReviewed: lesson.isReviewed });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
