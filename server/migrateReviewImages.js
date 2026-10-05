require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const db = require('./db');

async function run() {
  console.log('[Migration] Starting review items image offload...');
  
  // 1. Load local DB (this triggers migrateDataUrlsToFiles)
  const localDB = db.loadDB();
  console.log('[Migration] Local review items checked:', localDB.reviewItems.length);

  // 2. Connect to MongoDB Atlas
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[Migration] Connected to MongoDB Atlas.');
    const coll = mongoose.connection.db.collection('reviewitems');
    
    // Find all review items in Mongo and offload any data URLs
    const mongoDocs = await coll.find({}).toArray();
    console.log('[Migration] Found in MongoDB:', mongoDocs.length, 'review items.');
    
    for (const doc of mongoDocs) {
      if (doc.imageUrl && typeof doc.imageUrl === 'string' && doc.imageUrl.startsWith('data:')) {
        console.log(`[Migration] Offloading base64 image from item ${doc.id} (${doc.title})...`);
        const fileUrl = db.saveDataUrlToFile(doc.imageUrl, `${doc.id}_image`);
        await coll.updateOne({ id: doc.id }, { $set: { imageUrl: fileUrl } });
        console.log(`[Migration] Updated ${doc.id} in MongoDB with: ${fileUrl}`);
      }
    }

    // Verify document sizes
    const updatedDocs = await coll.find({}).toArray();
    console.log('[Migration] Post-migration MongoDB document summary:');
    let totalSize = 0;
    updatedDocs.forEach(d => {
      const docBytes = JSON.stringify(d).length;
      totalSize += docBytes;
      console.log(` - [${d.id}] "${d.title}": ${docBytes} bytes (imageUrl: ${d.imageUrl})`);
    });
    console.log(`[Migration] Total uncompressed data size across all reviewitems in MongoDB: ${(totalSize / 1024).toFixed(2)} KB (previously ~3.75 MB / 7.49 MB)!`);

    await mongoose.disconnect();
  }
  console.log('[Migration] Completed successfully!');
}

run().catch(err => {
  console.error('[Migration Error]:', err);
  process.exit(1);
});
