require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const {
  User,
  Conversation,
  Message,
  ReviewItem,
  Instruction,
  Telemetry
} = require('./models');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('\n❌ ERROR: MONGODB_URI environment variable is not defined.');
  console.log('Please define MONGODB_URI in your .env file or run with:');
  console.log('  MONGODB_URI="mongodb+srv://<user>:<password>@cluster0.mongodb.net/QuantumPropAI" node server/migrateToMongo.js\n');
  process.exit(1);
}

const STORE_PATH = path.join(__dirname, 'data', 'store.json');
const TELEMETRY_PATH = path.join(__dirname, 'data', 'telemetry.json');

async function migrate() {
  console.log('====================================================');
  console.log('🚀 QuantumPropAI MongoDB Data Migration Utility');
  console.log('====================================================');
  console.log(`Connecting to MongoDB...`);

  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✓ Connected to MongoDB successfully!\n');

    // 1. Read store.json
    if (!fs.existsSync(STORE_PATH)) {
      console.error(`❌ Store file not found at ${STORE_PATH}`);
      process.exit(1);
    }

    const rawStore = fs.readFileSync(STORE_PATH, 'utf8');
    const store = JSON.parse(rawStore);

    // 2. Migrate Users
    const users = store.users || [];
    console.log(`📦 Migrating ${users.length} Users...`);
    for (const u of users) {
      await User.findOneAndUpdate({ id: u.id }, u, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    console.log(`✓ Users migrated: ${users.length}`);

    // 3. Migrate Conversations
    const conversations = store.conversations || [];
    console.log(`📦 Migrating ${conversations.length} Conversations...`);
    for (const c of conversations) {
      await Conversation.findOneAndUpdate({ id: c.id }, c, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    console.log(`✓ Conversations migrated: ${conversations.length}`);

    // 4. Migrate Messages
    const messages = store.messages || [];
    console.log(`📦 Migrating ${messages.length} Messages...`);
    for (const m of messages) {
      await Message.findOneAndUpdate({ id: m.id }, m, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    console.log(`✓ Messages migrated: ${messages.length}`);

    // 5. Migrate Review Items
    const reviewItems = store.reviewItems || [];
    console.log(`📦 Migrating ${reviewItems.length} Review Items...`);
    for (const r of reviewItems) {
      await ReviewItem.findOneAndUpdate({ id: r.id }, r, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    console.log(`✓ Review Items migrated: ${reviewItems.length}`);

    // 6. Migrate Instructions & Directives
    const instructions = store.instructions || [];
    console.log(`📦 Migrating ${instructions.length} Directives/Instructions...`);
    for (const i of instructions) {
      await Instruction.findOneAndUpdate({ id: i.id }, i, { upsert: true, new: true, setDefaultsOnInsert: true });
    }
    console.log(`✓ Directives migrated: ${instructions.length}`);

    // 7. Migrate Telemetry
    if (fs.existsSync(TELEMETRY_PATH)) {
      try {
        const rawTel = fs.readFileSync(TELEMETRY_PATH, 'utf8');
        const telData = JSON.parse(rawTel);
        await Telemetry.findOneAndUpdate(
          { key: 'main' },
          {
            key: 'main',
            summary: telData.summary || {},
            userStates: telData.userStates || {},
            clickStream: telData.clickStream || []
          },
          { upsert: true, new: true }
        );
        console.log(`✓ Telemetry metrics migrated`);
      } catch (telErr) {
        console.warn('⚠️ Telemetry migration warning:', telErr.message);
      }
    }

    console.log('\n====================================================');
    console.log('🎉 SUCCESS: All QuantumPropAI data migrated to MongoDB!');
    console.log('====================================================\n');
  } catch (err) {
    console.error('\n❌ Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

migrate();
