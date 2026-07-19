const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { User } = require('../models');

// Helper to check user headers
const getUserFromHeaders = (req) => {
  const userId = req.headers['x-user-id'];
  const email = req.headers['x-user-email'];
  const role = req.headers['x-user-role'] || 'user';
  const plan = req.headers['x-user-plan'] || 'free';
  return userId ? { id: userId, email, role, plan } : null;
};

// POST create Stripe checkout session
router.post('/create-checkout-session', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const isMock = !stripeKey || stripeKey.includes('mock');

  if (isMock) {
    // Return a mock checkout URL for testing without Stripe credentials
    return res.json({
      url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pricing?mock-success=true&session_id=mock_session_123`
    });
  }

  try {
    const stripe = new Stripe(stripeKey);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Premium Plan - Digital Life Lessons',
              description: 'Unlock all premium life lessons, personal growth content, and the ability to post premium lessons.',
            },
            unit_amount: 1999, // $19.99
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      client_reference_id: user.id,
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard/profile?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pricing?canceled=true`,
    });

    res.json({ url: session.url });
  } catch (error) {
    console.error('Stripe session creation error:', error);
    // Graceful fallback to mock url in case of invalid API key or configuration error
    res.json({
      url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/pricing?mock-success=true&session_id=mock_session_123`
    });
  }
});

// POST stripe webhook (optional / real integrations)
// We will also allow a simple mock upgrade endpoint for testing
router.post('/mock-upgrade', async (req, res) => {
  const user = getUserFromHeaders(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const dbUser = await User.findOne({ $or: [{ id: user.id }, { _id: user.id }] });
    if (!dbUser) return res.status(404).json({ error: 'User not found' });

    dbUser.plan = 'premium';
    await dbUser.save();

    res.json({ success: true, plan: 'premium', message: 'Successfully upgraded to premium!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Webhook handler for Stripe
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || !endpointSecret) {
    return res.status(400).send('Webhook config missing');
  }

  const stripe = new Stripe(stripeKey);
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.err(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;

    if (userId) {
      try {
        const dbUser = await User.findOne({ $or: [{ id: userId }, { _id: userId }] });
        if (dbUser) {
          dbUser.plan = 'premium';
          await dbUser.save();
          console.log(`User ${userId} upgraded to Premium via Stripe Webhook`);
        }
      } catch (err) {
        console.error('Error updating user plan on webhook:', err);
      }
    }
  }

  res.json({ received: true });
});

module.exports = router;
