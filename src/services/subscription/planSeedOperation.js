function buildPlanSeedOperation(plan, { overwrite = false } = {}) {
  const planDefaults = {
    ...plan,
    isActive: plan.isActive !== false,
    isPublic: plan.isPublic !== false
  };

  if (overwrite) return { $set: planDefaults };

  const insertDefaults = { ...planDefaults };

  // MongoDB rejects updates that write the same path through both $set and
  // $setOnInsert during an upsert. These fields are intentionally refreshed
  // on every seed, so leave them out of the insert-only payload. They will
  // still be written on new documents through $set below.
  delete insertDefaults.sortOrder;
  delete insertDefaults.isPublic;
  delete insertDefaults.isActive;

  return {
    $setOnInsert: insertDefaults,
    $set: {
      sortOrder: plan.sortOrder,
      isPublic: plan.isPublic !== false,
      isActive: plan.isActive !== false
    }
  };
}

module.exports = { buildPlanSeedOperation };
