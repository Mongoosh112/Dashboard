// Real-Time Drip Simulation Engine for Review Items and Surveys
// Runs randomized, realistic vote streaming in the background with Socket.IO broadcasts

let ioInstance = null;
let dbModule = null;
let broadcastReviewItemFn = null;
const activeTimers = new Map(); // itemId -> setTimeout handle

function init(io, db, broadcastReviewItem = null) {
  ioInstance = io;
  dbModule = db;
  broadcastReviewItemFn = broadcastReviewItem;

  // Auto-resume active drip campaigns on server startup
  try {
    const rawDB = db.loadDB();
    if (Array.isArray(rawDB.reviewItems)) {
      rawDB.reviewItems.forEach(item => {
        if (item.dripCampaign && item.dripCampaign.status === 'running') {
          console.log(`[DripEngine] Resuming live drip campaign for item "${item.title}" (${item.id})`);
          scheduleNextTick(item.id);
        }
      });
    }
  } catch (err) {
    console.error('[DripEngine] Error resuming active campaigns:', err);
  }
}

function broadcastItemUpdate(itemId, item) {
  if (typeof broadcastReviewItemFn === 'function') {
    broadcastReviewItemFn(itemId, 'review_vote_updated');
  } else if (ioInstance && dbModule) {
    ioInstance.to('admin_room').emit('review_vote_updated', dbModule.formatReviewItem(item, null, true));
    if (!item.targetUserIds || item.targetUserIds.length === 0) {
      ioInstance.emit('review_vote_updated', dbModule.formatReviewItem(item, null, false));
    } else {
      item.targetUserIds.forEach(uid => {
        ioInstance.to(`user:${uid}`).emit('review_vote_updated', dbModule.formatReviewItem(item, uid, false));
      });
    }
  }
}

function scheduleNextTick(itemId) {
  // Clear any existing timer for this item
  if (activeTimers.has(itemId)) {
    clearTimeout(activeTimers.get(itemId));
    activeTimers.delete(itemId);
  }

  if (!dbModule) return;

  const rawDB = dbModule.loadDB();
  const item = (rawDB.reviewItems || []).find(i => i.id === itemId);
  if (!item || !item.dripCampaign || item.dripCampaign.status !== 'running') {
    return;
  }

  const campaign = item.dripCampaign;
  const minSec = Math.max(0.8, Number(campaign.minIntervalSec) || 2);
  const maxSec = Math.max(minSec, Number(campaign.maxIntervalSec) || 6);

  // Randomized delay in milliseconds
  const delayMs = Math.round((Math.random() * (maxSec - minSec) + minSec) * 1000);

  const timer = setTimeout(() => {
    executeTick(itemId);
  }, delayMs);

  activeTimers.set(itemId, timer);
}

function executeTick(itemId) {
  activeTimers.delete(itemId);
  if (!dbModule || !ioInstance) return;

  try {
    const rawDB = dbModule.loadDB();
    const item = (rawDB.reviewItems || []).find(i => i.id === itemId);
    if (!item || !item.dripCampaign || item.dripCampaign.status !== 'running') {
      return;
    }

    const campaign = item.dripCampaign;
    const target = Math.max(1, Number(campaign.targetVotes) || 500);
    const current = Math.max(0, Number(campaign.currentStreamed) || 0);
    const remaining = target - current;

    if (remaining <= 0) {
      campaign.status = 'completed';
      dbModule.saveDB(rawDB);
      ioInstance.to('admin_room').emit('review_drip_completed', { itemId, targetVotes: target });
      broadcastItemUpdate(itemId, item);
      console.log(`[DripEngine] Campaign completed for "${item.title}" (${target}/${target} votes).`);
      return;
    }

    // Determine randomized batch size for this tick
    const minBatch = Math.max(1, Number(campaign.minBatch) || 1);
    const maxBatch = Math.max(minBatch, Number(campaign.maxBatch) || 4);
    const rawBatch = Math.floor(Math.random() * (maxBatch - minBatch + 1)) + minBatch;
    const batch = Math.min(remaining, rawBatch);

    // Natural random distribution for Yes vs No based on yesRatio
    const baseRatio = Math.min(100, Math.max(0, Number(campaign.yesRatio) || 80));
    let addedYes = 0;
    let addedNo = 0;

    for (let i = 0; i < batch; i++) {
      // Add slight jitter (+/- 4%) for realistic human randomness
      const jitter = (Math.random() * 8) - 4;
      const effectiveChance = Math.min(99, Math.max(1, baseRatio + jitter)) / 100;
      if (Math.random() < effectiveChance) {
        addedYes++;
      } else {
        addedNo++;
      }
    }

    // Update campaign counters
    campaign.currentStreamed = current + batch;
    campaign.lastTickAt = new Date().toISOString();

    // Ensure item.dataMixer is initialized and active
    if (!item.dataMixer) {
      item.dataMixer = {
        enabled: true,
        mode: 'add',
        goodCount: 0,
        badCount: 0,
        questionBoosts: {}
      };
    }
    item.dataMixer.enabled = true;
    if (!item.dataMixer.questionBoosts) {
      item.dataMixer.questionBoosts = {};
    }

    // Determine target question id (if item has questions)
    const questions = item.questions || [];
    const targetQId = campaign.targetQuestionId || (questions[0]?.id) || null;

    if (targetQId) {
      if (!item.dataMixer.questionBoosts[targetQId]) {
        item.dataMixer.questionBoosts[targetQId] = { opt1Count: 0, opt2Count: 0 };
      }
      const qb = item.dataMixer.questionBoosts[targetQId];
      qb.opt1Count = (Number(qb.opt1Count) || 0) + addedYes;
      qb.opt2Count = (Number(qb.opt2Count) || 0) + addedNo;
    }

    // Also increment verdict counters
    item.dataMixer.goodCount = (Number(item.dataMixer.goodCount) || 0) + addedYes;
    item.dataMixer.badCount = (Number(item.dataMixer.badCount) || 0) + addedNo;

    // Check if target is now reached
    if (campaign.currentStreamed >= target) {
      campaign.status = 'completed';
    }

    // Persist changes to store.json
    dbModule.saveDB(rawDB);

    // Broadcast in real-time: unredacted + tick strictly to admin_room, sanitized to targeted users
    ioInstance.to('admin_room').emit('review_drip_tick', {
      itemId,
      addedCount: batch,
      addedYes,
      addedNo,
      currentStreamed: campaign.currentStreamed,
      targetVotes: target,
      status: campaign.status
    });
    broadcastItemUpdate(itemId, item);

    // Schedule next randomized tick if still running
    if (campaign.status === 'running') {
      scheduleNextTick(itemId);
    } else {
      console.log(`[DripEngine] Campaign completed for "${item.title}" (${campaign.currentStreamed}/${target} votes).`);
    }
  } catch (err) {
    console.error(`[DripEngine] Error executing tick for ${itemId}:`, err);
  }
}

function startCampaign(itemId, userId, config = {}) {
  if (!dbModule) throw new Error('Database module not initialized');
  const user = dbModule.findUserById(userId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can control real-time vote drip');
  }

  const rawDB = dbModule.loadDB();
  const item = (rawDB.reviewItems || []).find(i => i.id === itemId);
  if (!item) throw new Error('Review item not found');

  const existingCampaign = item.dripCampaign || {};
  const targetVotes = Math.max(1, parseInt(config.targetVotes, 10) || 500);
  const yesRatio = Math.min(100, Math.max(0, parseInt(config.yesRatio, 10) || 80));
  const minIntervalSec = Math.max(0.5, parseFloat(config.minIntervalSec) || 2);
  const maxIntervalSec = Math.max(minIntervalSec, parseFloat(config.maxIntervalSec) || 6);
  const minBatch = Math.max(1, parseInt(config.minBatch, 10) || 1);
  const maxBatch = Math.max(minBatch, parseInt(config.maxBatch, 10) || 4);

  // If previous campaign completed or user requested restart, reset streamed count
  const resetStreamed = config.resetStreamed || existingCampaign.status === 'completed';
  const currentStreamed = resetStreamed ? 0 : (existingCampaign.currentStreamed || 0);

  item.dripCampaign = {
    status: 'running',
    targetVotes,
    currentStreamed,
    yesRatio,
    minIntervalSec,
    maxIntervalSec,
    minBatch,
    maxBatch,
    targetQuestionId: config.targetQuestionId || (item.questions?.[0]?.id) || null,
    startedAt: existingCampaign.startedAt || new Date().toISOString(),
    lastTickAt: existingCampaign.lastTickAt || null
  };

  // Ensure dataMixer is enabled
  if (!item.dataMixer) {
    item.dataMixer = {
      enabled: true,
      mode: 'add',
      goodCount: 0,
      badCount: 0,
      questionBoosts: {}
    };
  }
  item.dataMixer.enabled = true;

  dbModule.saveDB(rawDB);

  // Schedule the first randomized tick
  scheduleNextTick(itemId);

  broadcastItemUpdate(itemId, item);

  return dbModule.formatReviewItem(item, null, true);
}

function pauseCampaign(itemId, userId) {
  if (!dbModule) throw new Error('Database module not initialized');
  const user = dbModule.findUserById(userId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can pause live vote drip');
  }

  const rawDB = dbModule.loadDB();
  const item = (rawDB.reviewItems || []).find(i => i.id === itemId);
  if (!item) throw new Error('Review item not found');

  if (activeTimers.has(itemId)) {
    clearTimeout(activeTimers.get(itemId));
    activeTimers.delete(itemId);
  }

  if (item.dripCampaign) {
    item.dripCampaign.status = 'paused';
    dbModule.saveDB(rawDB);
  }

  broadcastItemUpdate(itemId, item);

  return dbModule.formatReviewItem(item, null, true);
}

function stopCampaign(itemId, userId, resetNumbers = false) {
  if (!dbModule) throw new Error('Database module not initialized');
  const user = dbModule.findUserById(userId);
  if (!user || !user.isAdmin) {
    throw new Error('Unauthorized: Only Admin can stop live vote drip');
  }

  const rawDB = dbModule.loadDB();
  const item = (rawDB.reviewItems || []).find(i => i.id === itemId);
  if (!item) throw new Error('Review item not found');

  if (activeTimers.has(itemId)) {
    clearTimeout(activeTimers.get(itemId));
    activeTimers.delete(itemId);
  }

  if (resetNumbers && item.dripCampaign) {
    // Deduct streamed numbers from dataMixer
    const streamed = item.dripCampaign.currentStreamed || 0;
    const targetQId = item.dripCampaign.targetQuestionId;
    if (targetQId && item.dataMixer?.questionBoosts?.[targetQId]) {
      const qb = item.dataMixer.questionBoosts[targetQId];
      qb.opt1Count = Math.max(0, (qb.opt1Count || 0) - Math.round(streamed * (item.dripCampaign.yesRatio / 100)));
      qb.opt2Count = Math.max(0, (qb.opt2Count || 0) - Math.round(streamed * ((100 - item.dripCampaign.yesRatio) / 100)));
    }
    if (item.dataMixer) {
      item.dataMixer.goodCount = Math.max(0, (item.dataMixer.goodCount || 0) - Math.round(streamed * (item.dripCampaign.yesRatio / 100)));
      item.dataMixer.badCount = Math.max(0, (item.dataMixer.badCount || 0) - Math.round(streamed * ((100 - item.dripCampaign.yesRatio) / 100)));
    }
  }

  item.dripCampaign = null;
  dbModule.saveDB(rawDB);

  broadcastItemUpdate(itemId, item);

  return dbModule.formatReviewItem(item, null, true);
}

function cancelTimer(itemId) {
  if (activeTimers.has(itemId)) {
    clearTimeout(activeTimers.get(itemId));
    activeTimers.delete(itemId);
  }
}

module.exports = {
  init,
  startCampaign,
  pauseCampaign,
  stopCampaign,
  cancelTimer
};
