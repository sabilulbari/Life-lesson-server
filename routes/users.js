const express = require('express');
const router = express.Router();
const { User, Lesson, Report, Comment } = require('../models');

// Helper to check user headers
const getUserFromHeaders = (req) => {
  const userId = req.headers['x-user-id'];
  const email = req.headers['x-user-email'];
  const role = req.headers['x-user-role'] || 'user';
  const plan = req.headers['x-user-plan'] || 'free';
  return userId ? { id: userId, email, role, plan } : null;
};

// GET profile analytics (User Dashboard Home)
router.get('/stats', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const totalCreated = await Lesson.countDocuments({ creatorId: user.id });
    const totalSaved = await Lesson.countDocuments({ favorites: user.id });
    const recentLessons = await Lesson.find({ creatorId: user.id }).sort({ createdAt: -1 }).limit(5);

    // Mock weekly contribution data for Recharts
    const contributionChart = [
      { name: 'Mon', lessons: await Lesson.countDocuments({ creatorId: user.id, createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }) ? 1 : 0 },
      { name: 'Tue', lessons: 0 },
      { name: 'Wed', lessons: totalCreated > 0 ? 1 : 0 },
      { name: 'Thu', lessons: totalCreated > 1 ? 1 : 0 },
      { name: 'Fri', lessons: 0 },
      { name: 'Sat', lessons: 0 },
      { name: 'Sun', lessons: 0 }
    ];

    res.json({
      totalCreated,
      totalSaved,
      recentLessons,
      contributionChart
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET platform-wide analytics (Admin Dashboard Home)
router.get('/admin/stats', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const totalUsers = await User.countDocuments();
    const totalPublicLessons = await Lesson.countDocuments({ visibility: 'Public' });
    const totalReported = await Report.distinct('lessonId');
    const totalReportedCount = totalReported.length;

    // Most active contributors (all time)
    const contributors = await Lesson.aggregate([
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

    // Today's new lessons
    const today = new Date();
    today.setHours(0,0,0,0);
    const todaysLessons = await Lesson.find({ createdAt: { $gte: today } }).sort({ createdAt: -1 });

    // Growth charts data (Mock data for dashboard graphs)
    const userGrowth = [
      { month: 'Jan', users: Math.max(5, Math.floor(totalUsers * 0.2)) },
      { month: 'Feb', users: Math.max(10, Math.floor(totalUsers * 0.4)) },
      { month: 'Mar', users: Math.max(15, Math.floor(totalUsers * 0.6)) },
      { month: 'Apr', users: Math.max(20, Math.floor(totalUsers * 0.8)) },
      { month: 'May', users: totalUsers }
    ];

    const lessonGrowth = [
      { month: 'Jan', lessons: Math.max(10, Math.floor(totalPublicLessons * 0.2)) },
      { month: 'Feb', lessons: Math.max(25, Math.floor(totalPublicLessons * 0.4)) },
      { month: 'Mar', lessons: Math.max(45, Math.floor(totalPublicLessons * 0.6)) },
      { month: 'Apr', lessons: Math.max(70, Math.floor(totalPublicLessons * 0.8)) },
      { month: 'May', lessons: totalPublicLessons }
    ];

    res.json({
      totalUsers,
      totalPublicLessons,
      totalReportedCount,
      contributors,
      todaysLessons,
      userGrowth,
      lessonGrowth
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all users (admin only)
router.get('/admin/list', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const users = await User.find().sort({ createdAt: -1 });
    
    // Attach lesson count to each user
    const usersWithStats = await Promise.all(users.map(async (u) => {
      const lessonCount = await Lesson.countDocuments({ creatorId: u.id || u._id });
      return {
        _id: u._id,
        id: u.id || u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        image: u.image,
        lessonCount
      };
    }));

    res.json(usersWithStats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update user role (admin only)
router.patch('/admin/role', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const { targetUserId, newRole } = req.body;
    if (!targetUserId || !newRole) {
      return res.status(400).json({ error: 'User ID and role are required' });
    }

    // Better Auth stores id in `id` or `_id` field. We will search both or use Mongoose default
    const target = await User.findOne({ $or: [{ id: targetUserId }, { _id: targetUserId }] });
    if (!target) return res.status(404).json({ error: 'User not found' });

    target.role = newRole;
    await target.save();

    res.json({ message: 'User role updated successfully', user: target });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE user account (admin only)
router.delete('/admin/:targetUserId', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user || user.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });

  try {
    const targetUserId = req.params.targetUserId;
    await User.deleteOne({ $or: [{ id: targetUserId }, { _id: targetUserId }] });
    // Cleanup their lessons, comments, reports
    await Lesson.deleteMany({ creatorId: targetUserId });
    await Comment.deleteMany({ userId: targetUserId });
    await Report.deleteMany({ reporterUserId: targetUserId });
    
    res.json({ message: 'User and all associated data deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH update own profile (display name, photo url)
router.patch('/profile', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const { name, image } = req.body;
    
    const dbUser = await User.findOne({ $or: [{ id: user.id }, { _id: user.id }] });
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    if (name) dbUser.name = name;
    if (image !== undefined) dbUser.image = image;
    dbUser.updatedAt = new Date();
    await dbUser.save();

    // Also update creator info across their lessons
    if (name || image) {
      await Lesson.updateMany(
        { creatorId: user.id },
        { 
          $set: { 
            creatorName: name || dbUser.name, 
            creatorPhoto: image || dbUser.image 
          } 
        }
      );
    }

    res.json({ message: 'Profile updated successfully', user: dbUser });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
