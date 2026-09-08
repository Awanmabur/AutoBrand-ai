const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

let ensurePromise = null;

const PAYMENT_REFERENCE_INDEX = Object.freeze({
  modelName: 'Payment',
  key: { provider: 1, reference: 1 },
  name: 'uniq_payment_provider_reference'
});

function registerAllModels() {
  const modelsDir = path.join(__dirname, '..', 'models');
  for (const filename of fs.readdirSync(modelsDir)) {
    if (!filename.endsWith('.js')) continue;
    require(path.join(modelsDir, filename));
  }
}

function sameIndexKey(left = {}, right = {}) {
  const leftEntries = Object.entries(left);
  const rightEntries = Object.entries(right);
  return leftEntries.length === rightEntries.length
    && leftEntries.every(([field, direction], index) => {
      const [otherField, otherDirection] = rightEntries[index] || [];
      return field === otherField && direction === otherDirection;
    });
}

async function listIndexesSafe(Model) {
  try {
    return await Model.collection.indexes();
  } catch (error) {
    // A brand-new database may not have the collection yet. createIndexes()
    // below will create both the collection and its declared indexes.
    if (error?.code === 26 || error?.codeName === 'NamespaceNotFound') return [];
    throw error;
  }
}

async function findPaymentReferenceDuplicates(Payment, limit = 20) {
  return Payment.aggregate([
    {
      $group: {
        _id: { provider: '$provider', reference: '$reference' },
        count: { $sum: 1 },
        paymentIds: { $push: '$_id' }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
    { $limit: Math.max(1, Number(limit || 20)) }
  ]);
}

function paymentDuplicateError(duplicates) {
  const preview = duplicates.slice(0, 5).map((row) => {
    const provider = row?._id?.provider ?? '<missing-provider>';
    const reference = row?._id?.reference ?? '<missing-reference>';
    return `${provider}/${reference} (${row.count})`;
  }).join(', ');
  const error = new Error(
    `Cannot upgrade the Payment provider/reference index because duplicate financial references exist${preview ? `: ${preview}` : ''}. `
    + 'No payment rows were deleted automatically. Run "npm run migrate:production" to inspect the database, back it up, and resolve duplicate payment records through finance review before applying the migration.'
  );
  error.code = 'EPAYMENTREFERENCEDUPLICATES';
  error.duplicates = duplicates;
  return error;
}

async function reconcilePaymentReferenceIndex(Payment) {
  const indexes = await listIndexesSafe(Payment);
  if (!indexes.length) return { action: 'collection_missing' };

  const desired = indexes.find((index) => index.name === PAYMENT_REFERENCE_INDEX.name);
  if (desired && !sameIndexKey(desired.key, PAYMENT_REFERENCE_INDEX.key)) {
    const error = new Error(
      `MongoDB index ${PAYMENT_REFERENCE_INDEX.name} exists on an unexpected key pattern. `
      + 'Refusing to replace an unknown financial-integrity index automatically.'
    );
    error.code = 'EPAYMENTINDEXCONFLICT';
    throw error;
  }

  if (desired?.unique === true) {
    // Remove an old redundant non-unique index with the same key pattern when
    // the correctly named unique index already exists.
    const redundant = indexes.filter((index) => (
      index.name !== desired.name
      && sameIndexKey(index.key, PAYMENT_REFERENCE_INDEX.key)
      && index.unique !== true
    ));
    for (const index of redundant) {
      try { await Payment.collection.dropIndex(index.name); }
      catch (error) { if (error?.code !== 27 && error?.codeName !== 'IndexNotFound') throw error; }
    }
    return { action: redundant.length ? 'removed_redundant_legacy_index' : 'already_current' };
  }

  const legacy = desired || indexes.find((index) => (
    sameIndexKey(index.key, PAYMENT_REFERENCE_INDEX.key)
    && index.unique !== true
  ));
  if (!legacy) return { action: 'no_legacy_conflict' };

  const duplicates = await findPaymentReferenceDuplicates(Payment);
  if (duplicates.length) throw paymentDuplicateError(duplicates);

  // This exact upgrade is safe only after proving there are no duplicate
  // financial references. The server is not listening yet, so startup will not
  // accept local writes during the replacement. Concurrent production nodes are
  // still protected because creation of the unique index itself fails if a race
  // introduces a duplicate.
  try { await Payment.collection.dropIndex(legacy.name); }
  catch (error) { if (error?.code !== 27 && error?.codeName !== 'IndexNotFound') throw error; }

  await Payment.collection.createIndex(
    PAYMENT_REFERENCE_INDEX.key,
    { unique: true, name: PAYMENT_REFERENCE_INDEX.name, background: true }
  );
  return { action: 'upgraded_legacy_non_unique_index', previousName: legacy.name };
}

async function ensureDatabaseIndexes() {
  if (ensurePromise) return ensurePromise;

  ensurePromise = (async () => {
    registerAllModels();
    const names = mongoose.modelNames().sort();
    const completed = [];

    // Mongoose autoIndex is disabled for every environment. This central manager
    // is the only startup path allowed to create/upgrade declared indexes, which
    // prevents duplicate index builders racing with the legacy-upgrade logic.
    for (const name of names) {
      const Model = mongoose.model(name);
      if (name === PAYMENT_REFERENCE_INDEX.modelName) {
        await reconcilePaymentReferenceIndex(Model);
      }
      await Model.createIndexes();
      completed.push(name);
    }

    return completed;
  })().catch((error) => {
    ensurePromise = null;
    error.code = error.code || 'EDATABASEINDEXES';
    throw error;
  });

  return ensurePromise;
}

module.exports = {
  ensureDatabaseIndexes,
  registerAllModels,
  sameIndexKey,
  findPaymentReferenceDuplicates,
  reconcilePaymentReferenceIndex,
  PAYMENT_REFERENCE_INDEX
};
