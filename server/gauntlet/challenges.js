'use strict';

module.exports = [
  // ── WARM-UP (easy) ───────────────────────────────────────────────────────────
  {
    id: 'g-w1', category: 'warmup', difficulty: 'easy',
    context: 'A customer calls in. After your greeting they say:',
    challenge: 'Hi, I saw your ad online for the 2025 Civic. Can you tell me more about it?',
    hint: 'Ask qualifying questions before diving into features.',
  },
  {
    id: 'g-w2', category: 'warmup', difficulty: 'easy',
    context: 'A customer calls in. After your greeting they say:',
    challenge: "I'm looking for a family SUV. What do you guys have?",
    hint: 'Discover needs before recommending — budget, size, features.',
  },
  {
    id: 'g-w3', category: 'warmup', difficulty: 'easy',
    context: 'A customer calls in. After your greeting they say:',
    challenge: "I'm thinking about trading in my current car. How does that work?",
    hint: 'Use the trade as a reason to come in — value only determined in person.',
  },

  // ── PRICE (medium–hard) ──────────────────────────────────────────────────────
  {
    id: 'g-p1', category: 'price', difficulty: 'medium',
    context: 'A customer calls about a 2025 Toyota Camry XSE. After your greeting they say:',
    challenge: "What's the out-the-door price on the Camry?",
    hint: 'Never give OTD price on first call. Get their name, redirect to appointment.',
  },
  {
    id: 'g-p2', category: 'price', difficulty: 'medium',
    context: 'A customer calls about a listed vehicle. After your greeting they say:',
    challenge: "I just need a ballpark number. What are we talking?",
    hint: 'Acknowledge, bridge to value, get the appointment.',
  },
  {
    id: 'g-p3', category: 'price', difficulty: 'medium',
    context: "A customer calls about a 2025 F-150. After your greeting they say:",
    challenge: "What's the MSRP on that truck?",
    hint: 'MSRP is public — acknowledge it but pivot to real value in person.',
  },
  {
    id: 'g-p4', category: 'price', difficulty: 'hard',
    context: 'A customer calls and after your greeting says:',
    challenge: "What's the absolute best price you can do? I don't want to waste my time coming in.",
    hint: 'Best price is earned in person. Make coming in feel worth their time.',
  },
  {
    id: 'g-p5', category: 'price', difficulty: 'hard',
    context: 'A customer calls and after your greeting says:',
    challenge: "I found the exact same car online for $2,000 less. Can you match it?",
    hint: 'Online prices have hidden fees. Invite them in to compare apples to apples.',
  },
  {
    id: 'g-p6', category: 'price', difficulty: 'hard',
    context: 'A customer calls and after your greeting says:',
    challenge: "Just email me your best price and I'll decide from there.",
    hint: 'Email kills deals. Keep them on the phone and aim for the appointment.',
  },

  // ── AVAILABILITY (easy–medium) ───────────────────────────────────────────────
  {
    id: 'g-a1', category: 'availability', difficulty: 'easy',
    context: 'A customer calls about a specific vehicle listed online. After your greeting they say:',
    challenge: 'Is the red Jeep Grand Cherokee still available?',
    hint: 'Confirm interest, verify stock, use availability as urgency to come in.',
  },
  {
    id: 'g-a2', category: 'availability', difficulty: 'medium',
    context: 'A customer calls and after your greeting says:',
    challenge: "I see it says \"call for price\" on the website. Is that car even in stock?",
    hint: 'Turn the ambiguity into curiosity. Get them excited to come see it.',
  },
  {
    id: 'g-a3', category: 'availability', difficulty: 'medium',
    context: 'A customer calls and after your greeting says:',
    challenge: 'How long has that car been on the lot?',
    hint: 'Honest answer. Use it as urgency if fresh; use condition/value if aged.',
  },
  {
    id: 'g-a4', category: 'availability', difficulty: 'hard',
    context: 'A customer calls and after your greeting says:',
    challenge: "I called yesterday and someone said it was sold. Is there anything similar?",
    hint: 'Recover smoothly. Pivot to alternatives and the appointment.',
  },

  // ── COMMITMENT (medium–hard) ─────────────────────────────────────────────────
  {
    id: 'g-c1', category: 'commitment', difficulty: 'medium',
    context: 'You have had a good conversation. You ask for an appointment and the customer says:',
    challenge: "I'm not ready to come in yet. I'm still just looking.",
    hint: 'Respect it. Lower the commitment — offer a no-pressure visit.',
  },
  {
    id: 'g-c2', category: 'commitment', difficulty: 'medium',
    context: 'You have built rapport. You ask for an appointment and the customer says:',
    challenge: 'I need to think about it.',
    hint: 'Find out what specifically needs thinking. Address it directly.',
  },
  {
    id: 'g-c3', category: 'commitment', difficulty: 'medium',
    context: 'You ask for an appointment and the customer says:',
    challenge: "I'll call you back when I'm ready.",
    hint: 'Get permission to follow up. Lock in a specific callback time.',
  },
  {
    id: 'g-c4', category: 'commitment', difficulty: 'hard',
    context: 'You ask for an appointment and the customer says:',
    challenge: "I'm going to look at three or four other dealerships first.",
    hint: 'Encourage it — but give them a reason to come to you first.',
  },
  {
    id: 'g-c5', category: 'commitment', difficulty: 'hard',
    context: 'You ask for an appointment and the customer says:',
    challenge: 'My wife needs to see it too and she is not available until next month.',
    hint: 'Invite the spouse. Offer a solution that works for both of them.',
  },

  // ── INFO RESISTANCE (hard) ───────────────────────────────────────────────────
  {
    id: 'g-i1', category: 'info', difficulty: 'hard',
    context: 'You ask for their name and the customer says:',
    challenge: "I'd rather not give my name. Can you just answer my question?",
    hint: 'Lighten the ask. Use your name first to make it natural.',
  },
  {
    id: 'g-i2', category: 'info', difficulty: 'hard',
    context: 'You ask for a callback number and the customer says:',
    challenge: "I don't want to give out my number. I'll call you if I'm interested.",
    hint: 'Acknowledge the concern. Offer to let them reach YOU instead.',
  },
  {
    id: 'g-i3', category: 'info', difficulty: 'hard',
    context: 'A customer says:',
    challenge: 'Why do you need all my information just to answer a question?',
    hint: 'Be honest and human about it. No scripts.',
  },

  // ── COMPETITOR (hard) ────────────────────────────────────────────────────────
  {
    id: 'g-x1', category: 'competitor', difficulty: 'hard',
    context: 'A customer calls and after your greeting says:',
    challenge: 'Toyota down the street quoted me $500 less. Why should I come to you?',
    hint: 'Never trash competitors. Focus on your value, experience, and service.',
  },
  {
    id: 'g-x2', category: 'competitor', difficulty: 'hard',
    context: 'A customer calls and after your greeting says:',
    challenge: "I'm also looking at a Honda. Convince me why I should buy a Toyota instead.",
    hint: "Don't bash Honda. Ask what they value — then align your product to that.",
  },
  {
    id: 'g-x3', category: 'competitor', difficulty: 'hard',
    context: 'A customer calls and after your greeting says:',
    challenge: 'The other dealer has better financing. Can you beat 2.9%?',
    hint: 'Financing is complex. Invite them in — rates depend on full picture.',
  },
];
