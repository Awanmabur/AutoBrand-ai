const BrandAsset = require('../../models/BrandAsset');
const Brand = require('../../models/Brand');

async function addBrandAsset({ brand, uploadedBy, type = 'other', title, url, publicId, mimeType, sizeBytes, metadata = {}, isDefault = false }) {
  const brandId = brand?._id || brand;
  const asset = await BrandAsset.create({ brand: brandId, uploadedBy: uploadedBy?._id || uploadedBy, type, title, url, publicId, mimeType, sizeBytes, metadata, isDefault });
  const update = { $addToSet: { assetUploads: asset._id } };
  if (isDefault || type === 'logo') update.$set = { ...(update.$set || {}), logo: url, logoPublicId: publicId || '' };
  if (isDefault && type === 'favicon') update.$set = { ...(update.$set || {}), favicon: url, faviconPublicId: publicId || '' };
  if (isDefault && type === 'cover') update.$set = { ...(update.$set || {}), coverImage: url, coverImagePublicId: publicId || '' };
  await Brand.updateOne({ _id: brandId }, update);
  return asset;
}

async function listBrandAssets(brand, { type, activeOnly = true } = {}) {
  const query = { brand: brand?._id || brand };
  if (type) query.type = type;
  if (activeOnly) query.status = 'active';
  return BrandAsset.find(query).sort({ isDefault: -1, createdAt: -1 });
}

async function setDefaultAsset(assetId) {
  const asset = await BrandAsset.findById(assetId);
  if (!asset) throw new Error('Brand asset not found.');
  await BrandAsset.updateMany({ brand: asset.brand, type: asset.type }, { isDefault: false });
  asset.isDefault = true;
  await asset.save();
  const update = {};
  if (asset.type === 'logo') Object.assign(update, { logo: asset.url, logoPublicId: asset.publicId || '' });
  if (asset.type === 'favicon') Object.assign(update, { favicon: asset.url, faviconPublicId: asset.publicId || '' });
  if (asset.type === 'cover') Object.assign(update, { coverImage: asset.url, coverImagePublicId: asset.publicId || '' });
  if (Object.keys(update).length) await Brand.updateOne({ _id: asset.brand }, update);
  return asset;
}

module.exports = { addBrandAsset, listBrandAssets, setDefaultAsset };
