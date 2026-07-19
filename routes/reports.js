const express = require('express');
const router = express.Router();
const { Report, Lesson } = require('../models');

// Helper to check user headers
const getUserFromHeaders = (req) => {
  const userId = req.headers['x-user-id'];
  const email = req.headers['x-user-email'];
  const role = req.headers['x-user-role'] || 'user';
  const plan = req.headers['x-user-plan'] || 'free';
  return userId ? { id: userId, email, role, plan } : null;
};

// POST a report
router.post('/', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { lessonId, lessonTitle, reason } = req.body;
    if (!lessonId || !lessonTitle || !reason) {
      return res.status(400).json({ error: 'Lesson ID, title, and reason are required' });
    }

    const newReport = new Report({
      lessonId,
      lessonTitle,
      reporterUserId: user.id,
      reporterUserEmail: user.email,
      reason
    });

    const saved = await newReport.save();
    res.status(201).json(saved);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all reports summarized by lesson (admin only)
router.get('/', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    // Group reports by lessonId to show report counts
    const reportsSummary = await Report.aggregate([
      {
        $group: {
          _id: '$lessonId',
          lessonTitle: { $first: '$lessonTitle' },
          reportCount: { $sum: 1 }
        }
      },
      { $sort: { reportCount: -1 } }
    ]);
    res.json(reportsSummary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET details of all reports for a specific lesson (admin only)
router.get('/:lessonId/details', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const details = await Report.find({ lessonId: req.params.lessonId }).sort({ createdAt: -1 });
    res.json(details);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE ignore reports for a lesson (admin only)
// Keeps the lesson live and clears all reports for this lesson
router.delete('/:lessonId/ignore', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    await Report.deleteMany({ lessonId: req.params.lessonId });
    res.json({ message: 'Reports cleared successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
