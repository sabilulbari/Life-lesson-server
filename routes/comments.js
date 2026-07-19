const express = require('express');
const router = express.Router();
const { Comment } = require('../models');

// Helper to check user headers
const getUserFromHeaders = (req) => {
  const userId = req.headers['x-user-id'];
  const email = req.headers['x-user-email'];
  const role = req.headers['x-user-role'] || 'user';
  const plan = req.headers['x-user-plan'] || 'free';
  return userId ? { id: userId, email, role, plan } : null;
};

// GET comments for a lesson
router.get('/:lessonId', async (req, res) => {
  try {
    const comments = await Comment.find({ lessonId: req.params.lessonId }).sort({ createdAt: -1 });
    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST a comment
router.post('/', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { lessonId, content } = req.body;
    if (!content || !lessonId) {
      return res.status(400).json({ error: 'Lesson ID and content are required' });
    }

    const newComment = new Comment({
      lessonId,
      userId: user.id,
      userName: req.headers['x-user-name'] || 'Anonymous User',
      userPhoto: req.headers['x-user-photo'] || '',
      content
    });

    const saved = await newComment.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
